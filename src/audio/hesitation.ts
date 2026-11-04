import type { Config } from '../config/defaults';
import { rms } from './vad';

const MIN_HZ = 75;
const MAX_HZ = 400;

/** Высота тона кадра нормированной автокорреляцией: {hz, corr} или null. */
export function pitch(f: Float32Array, sampleRate: number): { hz: number; corr: number } | null {
  const minLag = Math.floor(sampleRate / MAX_HZ);
  const maxLag = Math.min(Math.ceil(sampleRate / MIN_HZ), f.length - 32);
  const corrs: number[] = [];
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let xy = 0, xx = 0, yy = 0;
    for (let i = 0; i + lag < f.length; i++) {
      xy += f[i] * f[i + lag]; xx += f[i] * f[i]; yy += f[i + lag] * f[i + lag];
    }
    const c = xx && yy ? xy / Math.sqrt(xx * yy) : 0;
    corrs.push(c);
    best = Math.max(best, c);
  }
  if (best <= 0) return null;
  // Первый пик не ниже 90% максимума — защита от выбора удвоенного периода.
  for (let i = 1; i < corrs.length - 1; i++) {
    if (corrs[i] >= 0.9 * best && corrs[i] >= corrs[i - 1] && corrs[i] >= corrs[i + 1]) {
      return { hz: sampleRate / (minLag + i), corr: corrs[i] };
    }
  }
  return null;
}

/** Детектор «э-э», «м-м»: звонкий звук с ровным тоном дольше minRunMs. Одно событие на серию. */
export class HesitationDetector {
  private runStart: number | null = null;
  private p0 = 0;
  private emitted = false;
  private frameMs = 0;

  constructor(private cfg: Config, private sampleRate: number) {}

  push(frame: Float32Array, tMs: number): number | null {
    const h = this.cfg.hesitation;
    this.frameMs = (frame.length / this.sampleRate) * 1000;
    const p = rms(frame) >= h.minRms ? pitch(frame, this.sampleRate) : null;
    const steady = p !== null && p.corr >= h.minCorr;
    if (!steady) {
      this.runStart = null;
      return null;
    }
    if (this.runStart === null || Math.abs(p!.hz - this.p0) / this.p0 > h.maxPitchDrift) {
      this.runStart = tMs;
      this.p0 = p!.hz;
      this.emitted = false;
    }
    if (!this.emitted && tMs + this.frameMs - this.runStart >= h.minRunMs) {
      this.emitted = true;
      return this.runStart;
    }
    return null;
  }
}
