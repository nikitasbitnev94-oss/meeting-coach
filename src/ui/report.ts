import { clock, summarize } from '../report/summary';
import { deleteMeeting, getMeeting, listMeetings } from '../storage/db';
import { formatChange, meetingMetrics, progress, PROGRESS_MIN_MEETING_MS, sparkPoints, type ProgressRow } from '../report/progress';
import { navHtml } from './nav';
import type { EventType } from '../types';

const LABEL: Partial<Record<EventType, string>> = {
  hands: 'Руки у лица', smirk: 'Усмешка', irritation: 'Раздражение', skepticism: 'Скепсис',
  surprise: 'Удивление', cheer: 'Излишняя весёлость', frown: 'Хмурость',
  expressive: 'Активная мимика', stone: 'Каменное лицо', lipBite: 'Прикусывание губ',
};

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
const num = (x: number | null, d = 1) => (x === null ? '—' : x.toFixed(d).replace('.', ','));
const date = (iso: string) => new Date(iso).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
const mins = (ms: number) => `${Math.round(ms / 60000)} мин`;



export async function renderReport(root: HTMLElement, [id]: string[]): Promise<void> {
  const m = await getMeeting(id);
  if (!m) {
    root.innerHTML = `${navHtml('history')}<h1>Отчёт</h1><p>Встреча не найдена.</p>`;
    return;
  }
  const s = summarize(m);
  const words = s.byWord.length
    ? `<table><tr><th>Слово</th><th>Раз</th></tr>${s.byWord.map(w => `<tr><td>${esc(w.word)}</td><td>${w.count}</td></tr>`).join('')}</table>`
    : '<p class="muted">Слов-паразитов не найдено.</p>';
  const types = Object.entries(s.byType)
    .map(([t, n]) => `<tr><td>${LABEL[t as EventType] ?? t}</td><td>${n}</td></tr>`).join('');
  const timeline = s.timeline.length
    ? `<table><tr><th>Время</th><th>Что</th><th>Длительность</th></tr>${s.timeline
        .map(e => `<tr><td>${clock(e.tMs)}</td><td>${LABEL[e.type] ?? e.type}</td><td>${(e.durationMs / 1000).toFixed(1)} с</td></tr>`)
        .join('')}</table>`
    : '<p class="muted">Эпизодов мимики и рук не было.</p>';

  root.innerHTML = `${navHtml('history')}
    <h1>${esc(m.title || 'Встреча')}</h1>
    <p class="muted">${date(m.startedAt)} · длительность ${mins(m.durationMs)} · вы говорили ${num(s.speakingMin)} мин</p>
    <h2>Слова-паразиты</h2>
    <p>Всего ${s.fillers}, в минуту вашей речи ${num(s.fillersPerMin)}.</p>
    ${words}
    ${s.droppedForeignWords ? `<p class="muted">Не засчитано как чужая речь (ваш рот не двигался): ${s.droppedForeignWords}. Если это были ваши слова — напишите, порог нужно снизить.</p>` : ''}
    <h2>Взгляд</h2>
    <p>В камеру во время вашей речи: ${pct(s.gazeShare)}. Эпизодов взгляда мимо камеры дольше 3 с: ${s.offCameraEpisodes}.</p>
    <h2>Мимика и руки</h2>
    ${types ? `<table><tr><th>Тип</th><th>Раз</th></tr>${types}</table>` : ''}
    ${timeline}`;
}

function fmtMetric(r: ProgressRow, v: number | null): string {
  if (v === null) return '—';
  return r.key === 'gazeShare' ? `${Math.round(v * 100)}%` : num(v);
}

function progressHtml(rows: ProgressRow[], count: number): string {
  if (count < 2) {
    return `<p class="muted">Прогресс появится после двух встреч длиннее 5 минут.</p>`;
  }
  const body = rows.map(r => {
    const tone = r.better === null ? 'flat' : r.better ? 'good' : 'bad';
    const spark = r.series.length
      ? `<svg class="spark" width="120" height="28" viewBox="-2 -2 124 32" aria-hidden="true"><polyline points="${sparkPoints(r.series, 120, 28)}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`
      : '';
    return `<tr>
      <td><b>${r.label}</b><div class="muted small">${r.unit}</div></td>
      <td>${spark}</td>
      <td class="num">${fmtMetric(r, r.first)} → ${fmtMetric(r, r.last)}</td>
      <td class="num change ${tone}">${formatChange(r.changePct)}</td>
    </tr>`;
  }).join('');
  return `<table class="progress">${body}</table>
    <p class="muted small">Сравниваются средние первых и последних встреч (до трёх с каждой стороны). Встречи короче 5 минут не учитываются.</p>`;
}

export async function renderHistory(root: HTMLElement): Promise<void> {
  const all = await listMeetings();
  if (!all.length) {
    root.innerHTML = `${navHtml('history')}<h1>История</h1><p>Встреч пока нет.</p>`;
    return;
  }
  const counted = all.filter(m => m.durationMs >= PROGRESS_MIN_MEETING_MS).length;
  const rows = all.map(m => {
    const x = meetingMetrics(m);
    return `<tr><td><a href="#/report/${encodeURIComponent(m.id)}">${date(m.startedAt)}</a></td>
      <td>${esc(m.title || '—')}</td><td>${mins(m.durationMs)}</td><td>${num(x.fillersPerMin)}</td><td>${num(x.hesitationsPerMin)}</td><td>${pct(x.gazeShare)}</td>
      <td><button class="link" data-del="${esc(m.id)}">Удалить</button></td></tr>`;
  }).join('');
  root.innerHTML = `${navHtml('history')}<h1>История</h1>
    <h2>Прогресс</h2>
    ${progressHtml(progress(all), counted)}
    <h2>Встречи</h2>
    <table><tr><th>Дата</th><th>Название</th><th>Длит.</th><th>Паразиты в мин. речи</th><th>«Э-э» в мин. речи</th><th>В камеру</th><th></th></tr>${rows}</table>`;
  // Удаление в два нажатия, без системного окна подтверждения.
  root.querySelectorAll<HTMLButtonElement>('[data-del]').forEach(b => {
    b.onclick = async () => {
      if (b.dataset.armed !== '1') {
        b.dataset.armed = '1';
        b.textContent = 'Точно удалить?';
        return;
      }
      await deleteMeeting(b.dataset.del!);
      await renderHistory(root);
    };
  });
}
