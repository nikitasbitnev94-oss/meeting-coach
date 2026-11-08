import type { Meeting } from '../types';

export const PROGRESS_MIN_MEETING_MS = 5 * 60_000;
const HESITATION = 'э-э';
const FACE_TYPES = new Set(['frown', 'irritation', 'skepticism', 'surprise', 'cheer', 'smirk', 'expressive', 'stone', 'lipBite']);

export interface MeetingMetrics {
  fillersPerMin: number | null;
  hesitationsPerMin: number | null;
  gazeShare: number | null;
  facePer10: number | null;
  handsPer10: number | null;
}
export type MetricKey = keyof MeetingMetrics;

/** Показатели встречи: речь — на минуту речи пользователя, лицо и руки — на 10 минут с включённой камерой. */
export function meetingMetrics(m: Meeting): MeetingMetrics {
  const speakMin = m.speakingMs / 60_000;
  const camMin10 = (m.cameraOnMs ?? m.durationMs) / 600_000;
  const fillers = m.events.filter(e => e.type === 'filler');
  const hes = fillers.filter(e => e.word === HESITATION).length;
  const words = fillers.length - hes;
  const face = m.events.filter(e => FACE_TYPES.has(e.type)).length;
  const hands = m.events.filter(e => e.type === 'hands').length;
  const per = (n: number, d: number) => (d > 0 ? n / d : null);
  return {
    fillersPerMin: per(words, speakMin),
    hesitationsPerMin: per(hes, speakMin),
    gazeShare: per(m.onCameraMs, m.speakingWithFaceMs),
    facePer10: per(face, camMin10),
    handsPer10: per(hands, camMin10),
  };
}

export interface ProgressRow {
  key: MetricKey;
  label: string;
  unit: string;
  series: number[];
  first: number | null;
  last: number | null;
  changePct: number | null;
  better: boolean | null;
}

const ROWS: { key: MetricKey; label: string; unit: string; higherIsBetter: boolean }[] = [
  { key: 'fillersPerMin', label: 'Слова-паразиты', unit: 'в минуту речи', higherIsBetter: false },
  { key: 'hesitationsPerMin', label: '«Э-э»', unit: 'в минуту речи', higherIsBetter: false },
  { key: 'gazeShare', label: 'Взгляд в камеру', unit: 'доля речи', higherIsBetter: true },
  { key: 'facePer10', label: 'Мимика', unit: 'эпизодов на 10 мин', higherIsBetter: false },
  { key: 'handsPer10', label: 'Руки у лица', unit: 'касаний на 10 мин', higherIsBetter: false },
];

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Прогресс по встречам не короче 5 минут, от старых к новым:
 * среднее последних k против первых k, k = min(3, половина встреч).
 */
export function progress(meetings: Meeting[]): ProgressRow[] {
  const ms = meetings
    .filter(m => m.durationMs >= PROGRESS_MIN_MEETING_MS)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map(meetingMetrics);
  return ROWS.map(r => {
    const series = ms.map(x => x[r.key]).filter((v): v is number => v !== null);
    const k = Math.min(3, Math.floor(series.length / 2));
    if (k < 1) return { ...r, series, first: series[0] ?? null, last: series[series.length - 1] ?? null, changePct: null, better: null };
    const first = mean(series.slice(0, k)), last = mean(series.slice(-k));
    const changePct = first > 0 ? ((last - first) / first) * 100 : null;
    const better = last === first ? null : (last > first) === r.higherIsBetter;
    return { key: r.key, label: r.label, unit: r.unit, series, first, last, changePct, better };
  });
}

/** Точки мини-графика для <polyline>: по ширине — встречи, по высоте — значение (больше — выше). */
export function sparkPoints(series: number[], w: number, h: number): string {
  if (series.length === 1) return `${w / 2},${h / 2}`;
  const min = Math.min(...series), max = Math.max(...series);
  return series.map((v, i) => {
    const x = (i / (series.length - 1)) * w;
    const y = max === min ? h / 2 : h - ((v - min) / (max - min)) * h;
    return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
  }).join(' ');
}

export function formatChange(pct: number | null): string {
  if (pct === null) return '—';
  const r = Math.round(pct);
  return r > 0 ? `+${r}%` : r < 0 ? `−${-r}%` : '0%';
}
