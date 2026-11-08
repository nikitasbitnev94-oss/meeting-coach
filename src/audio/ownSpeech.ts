import type { Config } from '../config/defaults';
import type { FaceFrame } from '../types';
import type { VoiceSide } from './voiceGate';

/** Решения по голосовому профилю (VoiceGate). */
export interface VoiceCheck {
  recent(tMs: number): VoiceSide | null;
  over(fromMs: number, toMs: number): VoiceSide | null;
}

const MOUTH_KEYS = ['jawOpen', 'mouthClose'];
const HISTORY_MS = 60_000;
const FACE_STALE_MS = 1_000;

/**
 * «Говорит сам пользователь»: в микрофоне речь и у пользователя двигается рот.
 * Отсекает голоса собеседников, которые попали в микрофон из колонок. Без лица в кадре решает только звук.
 * С голосовым профилем дополнительно: голос, не похожий на голос пользователя, — чужая речь, даже если рот двигается.
 */
export class OwnSpeech {
  private mouthSamples: { t: number; v: number[] }[] = [];
  private lastFaceT = -Infinity;
  private history: { t: number; own: boolean }[] = [];
  private lastOwnT = -Infinity;

  constructor(private cfg: Config, private voice: VoiceCheck | null = null) {}

  setVoice(v: VoiceCheck | null): void { this.voice = v; }

  mouth(f: FaceFrame | null, tMs: number): void {
    if (!f) return;
    this.lastFaceT = tMs;
    this.mouthSamples.push({ t: tMs, v: MOUTH_KEYS.map(k => f.blendshapes[k] ?? 0) });
    while (this.mouthSamples.length && this.mouthSamples[0].t < tMs - this.cfg.vad.mouthWindowMs) this.mouthSamples.shift();
  }

  /** Решение на момент tMs по звуку (vad) и рту; записывается в историю. */
  update(vad: boolean, tMs: number): boolean {
    let own = vad;
    if (vad && tMs - this.lastFaceT <= FACE_STALE_MS) own = this.mouthMoving();
    if (own && this.voice?.recent(tMs) === 'foreign') own = false;
    this.history.push({ t: tMs, own });
    while (this.history.length && this.history[0].t < tMs - HISTORY_MS) this.history.shift();
    if (own) this.lastOwnT = tMs;
    return own;
  }

  ownWithin(fromMs: number, toMs: number): boolean {
    // Решение по голосу приходит с задержкой ~1 с, поэтому проверяется и задним числом.
    if (this.voice?.over(fromMs, toMs) === 'foreign') return false;
    return this.history.some(h => h.own && h.t >= fromMs && h.t <= toMs);
  }

  lastOwn(): number { return this.lastOwnT; }

  /** Размах движения рта за окно — для диагностики. */
  mouthRange(): number {
    if (this.mouthSamples.length < 2) return 0;
    return MOUTH_KEYS.reduce((s, _, k) => {
      const xs = this.mouthSamples.map(m => m.v[k]);
      return s + (Math.max(...xs) - Math.min(...xs));
    }, 0);
  }

  private mouthMoving(): boolean {
    return this.mouthRange() >= this.cfg.vad.mouthMoveDelta;
  }
}

/**
 * «Э-э» пользователя стоят между его словами; «э-э» собеседника — пока пользователь молчит.
 * Оставляет отрезки, рядом с которыми (±padMs) пользователь говорил.
 */
export function keepOwnSegments<T extends { start: number; end: number }>(segs: T[], own: OwnSpeech, padMs: number): T[] {
  return segs.filter(s => own.ownWithin(s.start - padMs, s.end + padMs));
}
