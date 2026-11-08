import type { CoachEvent, FillerHit, Meeting } from '../types';
import type { PipStatus } from '../ui/pip';

export type SpeechState = 'loading' | 'ok' | 'failed';

/** Статус в окне: нет модели лица → лицо не в кадре → состояние модели речи → всё хорошо. */
export function pickStatus(engine: 'ok' | 'face-lost', faceOk: boolean, speech: SpeechState, cameraOff = false): PipStatus {
  if (cameraOff) return 'camera-off';
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

/** Последнее слово-паразит для строки в окне: держится holdMs. «Э-э» сюда не попадает, о нём — подсказка о частоте. */
export class LastFiller {
  private word: string | null = null;
  private at = -Infinity;
  constructor(private holdMs: number) {}
  set(word: string, tMs: number): void {
    if (word === 'э-э') return;
    this.word = word;
    this.at = tMs;
  }
  get(tMs: number): string | null {
    return this.word && tMs - this.at <= this.holdMs ? this.word : null;
  }
}

/** Время с включённой камерой в созвоне по нажатиям «Камера выкл / вкл». */
export class CameraClock {
  private off = false;
  private offSince = 0;
  private offTotal = 0;
  constructor(private t0: number) {}
  set(off: boolean, tMs: number): void {
    if (off === this.off) return;
    if (off) this.offSince = tMs;
    else this.offTotal += tMs - this.offSince;
    this.off = off;
  }
  onMs(tEnd: number): number {
    return tEnd - this.t0 - this.offTotal - (this.off ? tEnd - this.offSince : 0);
  }
}
