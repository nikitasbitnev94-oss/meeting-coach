import type { Config } from '../config/defaults';

export function rms(f: Float32Array): number {
  let s = 0;
  for (let i = 0; i < f.length; i++) s += f[i] * f[i];
  return Math.sqrt(s / (f.length || 1));
}

/** «Говорит ли пользователь»: энергия кадра выше уровня шума, с задержкой отпускания. */
export class Vad {
  private noise = 0.005;
  private lastSpeech = -Infinity;
  constructor(private cfg: Config) {}

  push(frame: Float32Array, tMs: number): boolean {
    const r = rms(frame);
    const { minRms, noiseRatio, hangoverMs } = this.cfg.vad;
    const isSpeech = r > Math.max(minRms, this.noise * noiseRatio);
    // Уровень шума быстро опускается и медленно поднимается: паузы между словами его не задирают.
    this.noise = r < this.noise ? this.noise * 0.9 + r * 0.1 : this.noise * 0.999 + r * 0.001;
    if (isSpeech) this.lastSpeech = tMs;
    return tMs - this.lastSpeech <= hangoverMs;
  }
}
