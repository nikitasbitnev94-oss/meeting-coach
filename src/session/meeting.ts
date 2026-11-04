import type { CoachEvent, FillerHit, Meeting } from '../types';
import type { PipStatus } from '../ui/pip';

export type SpeechState = 'loading' | 'ok' | 'failed';

/** Статус в окне: нет модели лица → лицо не в кадре → состояние модели речи → всё хорошо. */
export function pickStatus(engine: 'ok' | 'face-lost', faceOk: boolean, speech: SpeechState): PipStatus {
  if (!faceOk) return 'no-camera-model';
  if (engine === 'face-lost') return 'face-lost';
  if (speech === 'failed') return 'no-speech-model';
  if (speech === 'loading') return 'speech-loading';
  return 'ok';
}

export interface MeetingParts {
  id: string;
  title: string;
  t0: number;
  tEnd: number;
  startedAt: string;
  totals: { speakingMs: number; speakingWithFaceMs: number; onCameraMs: number };
  events: CoachEvent[];
}

/** Собирает запись встречи: время событий от начала встречи, события по порядку. */
export function buildMeeting(p: MeetingParts): Meeting {
  return {
    id: p.id,
    title: p.title.trim(),
    startedAt: p.startedAt,
    durationMs: Math.round(p.tEnd - p.t0),
    ...p.totals,
    events: p.events
      .map(e => ({ ...e, tMs: Math.max(0, Math.round(e.tMs - p.t0)) }))
      .sort((a, b) => a.tMs - b.tMs),
  };
}

/** Попадания паразитов не старше maxAgeMs: после паузы анализа старые вспышки не нужны. */
export function freshHits(hits: FillerHit[], tMs: number, maxAgeMs: number): FillerHit[] {
  return hits.filter(h => tMs - h.tMs <= maxAgeMs);
}
