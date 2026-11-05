import { clock, summarize } from '../report/summary';
import { getMeeting, listMeetings } from '../storage/db';
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
const num = (x: number | null, d = 1) => (x === null ? '—' : x.toFixed(d));
const date = (iso: string) => new Date(iso).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
const mins = (ms: number) => `${Math.round(ms / 60000)} мин`;

const NAV = `<nav class="top"><a href="#/">Новая встреча</a><a href="#/history">История</a><a href="#/settings">Настройки</a></nav>`;

export async function renderReport(root: HTMLElement, [id]: string[]): Promise<void> {
  const m = await getMeeting(id);
  if (!m) {
    root.innerHTML = `${NAV}<h1>Отчёт</h1><p>Встреча не найдена.</p>`;
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

  root.innerHTML = `${NAV}
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

export async function renderHistory(root: HTMLElement): Promise<void> {
  const all = await listMeetings();
  if (!all.length) {
    root.innerHTML = `${NAV}<h1>История встреч</h1><p>Встреч пока нет.</p>`;
    return;
  }
  const rows = all.map(m => {
    const s = summarize(m);
    return `<tr><td><a href="#/report/${encodeURIComponent(m.id)}">${date(m.startedAt)}</a></td>
      <td>${esc(m.title || '—')}</td><td>${mins(m.durationMs)}</td><td>${num(s.fillersPerMin)}</td><td>${pct(s.gazeShare)}</td></tr>`;
  }).join('');
  root.innerHTML = `${NAV}<h1>История встреч</h1>
    <table><tr><th>Дата</th><th>Название</th><th>Длит.</th><th>Паразиты/мин</th><th>В камеру</th></tr>${rows}</table>`;
}
