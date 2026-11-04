import type { Config } from '../config/defaults';
import type { FaceFrame } from '../types';

export const TRACKED_BLENDSHAPES = ['browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft',
  'browOuterUpRight', 'mouthSmileLeft', 'mouthSmileRight', 'mouthPressLeft', 'mouthPressRight',
  'mouthFrownLeft', 'mouthFrownRight', 'jawOpen'];

const MIN_NORM_MEETING_MS = 5 * 60_000;

/**
 * Окно мимики: активность (сумма |Δ| отслеживаемых параметров за expressiveWindowMs,
 * делённая на норму) и время без реакции для «каменного лица».
 */
export class ExpressionWindow {
  private deltas: { t: number; d: number }[] = [];
  private sum = 0;
  private prev: FaceFrame | null = null;
  private ref: FaceFrame | null = null;
  private lastReaction = 0;
  private firstT: number | null = null;
  private lastT: number | null = null;
  private lastSample = 0;
  private samples: number[] = [];

  constructor(private cfg: Config, private activityNorm: number) {}

  push(f: FaceFrame, tMs: number): { expressivityRatio: number; stillMs: number } {
    const c = this.cfg.face;
    if (this.firstT === null) {
      this.firstT = tMs;
      this.lastSample = tMs;
    }
    // Лицо пропадало дольше gapResetMs: прошлый кадр и точка отсчёта реакции устарели.
    if (this.lastT !== null && tMs - this.lastT > c.gapResetMs) {
      this.prev = null;
      this.ref = null;
    }
    this.lastT = tMs;
    if (this.prev) {
      const d = TRACKED_BLENDSHAPES.reduce((s, k) => s + Math.abs((f.blendshapes[k] ?? 0) - (this.prev!.blendshapes[k] ?? 0)), 0);
      this.deltas.push({ t: tMs, d });
      this.sum += d;
    }
    this.prev = f;
    while (this.deltas.length && this.deltas[0].t <= tMs - c.expressiveWindowMs) {
      this.sum -= this.deltas.shift()!.d;
    }
    if (tMs - this.lastSample >= c.expressiveWindowMs) {
      this.samples.push(this.sum);
      this.lastSample = tMs;
    }

    if (!this.ref) {
      this.ref = f;
      this.lastReaction = tMs;
    } else {
      const moved = TRACKED_BLENDSHAPES.some(k => Math.abs((f.blendshapes[k] ?? 0) - (this.ref!.blendshapes[k] ?? 0)) >= c.reactionDelta)
        || Math.abs(f.headPitchDeg - this.ref.headPitchDeg) >= c.reactionPitchDeg;
      if (moved) {
        this.ref = f;
        this.lastReaction = tMs;
      }
    }
    return {
      expressivityRatio: this.activityNorm > 0 ? Math.max(0, this.sum) / this.activityNorm : 0,
      stillMs: tMs - this.lastReaction,
    };
  }

  /** Медиана активности за 30-секундные окна этой встречи; null, если встреча короче 5 минут. */
  sampledNorm(): number | null {
    if (this.firstT === null || !this.prev || this.lastSample - this.firstT < MIN_NORM_MEETING_MS || !this.samples.length) {
      return null;
    }
    const s = [...this.samples].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
}
