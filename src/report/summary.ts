import { tally } from '../audio/fillers';
import type { CoachEvent, EventType, Meeting } from '../types';

export interface Summary {
  speakingMin: number;
  fillers: number;
  fillersPerMin: number | null;
  byWord: { word: string; count: number }[];
  gazeShare: number | null;
  offCameraEpisodes: number;
  byType: Partial<Record<EventType, number>>;
  timeline: CoachEvent[];
}

export function summarize(m: Meeting): Summary {
  const fillerEvents = m.events.filter(e => e.type === 'filler');
  const speakingMin = m.speakingMs / 60000;
  const timeline = m.events
    .filter(e => e.type !== 'filler' && e.type !== 'gaze')
    .sort((a, b) => a.tMs - b.tMs);
  const byType: Partial<Record<EventType, number>> = {};
  for (const e of timeline) byType[e.type] = (byType[e.type] ?? 0) + 1;
  return {
    speakingMin,
    fillers: fillerEvents.length,
    fillersPerMin: speakingMin > 0 ? fillerEvents.length / speakingMin : null,
    byWord: tally(fillerEvents.map(e => e.word ?? '')),
    gazeShare: m.speakingWithFaceMs > 0 ? m.onCameraMs / m.speakingWithFaceMs : null,
    offCameraEpisodes: m.events.filter(e => e.type === 'gaze').length,
    byType,
    timeline,
  };
}

/** Время от начала встречи в формате чч:мм:сс. */
export function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
}
