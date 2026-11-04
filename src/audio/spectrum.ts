/** Тембр звука: логарифм энергии в 24 мел-полосах для кадра 20 мс. Нужен, чтобы отличать «э» от других гласных. */
export const MEL_BANDS = 24;
const FFT = 512;
const F_MIN = 80;
const F_MAX = 7600;
const FLOOR = 1e-10;

const hzToMel = (hz: number) => 2595 * Math.log10(1 + hz / 700);
const melToHz = (m: number) => 700 * (10 ** (m / 2595) - 1);

export class MelFeatures {
  private window: Float64Array;
  private filters: { from: number; weights: number[] }[] = [];
  private centers: number[] = [];
  private re = new Float64Array(FFT);
  private im = new Float64Array(FFT);

  constructor(private sampleRate: number, frameLen = Math.round(sampleRate * 0.02)) {
    this.window = Float64Array.from({ length: frameLen }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frameLen - 1)));
    const fMax = Math.min(F_MAX, sampleRate / 2);
    const mels = Array.from({ length: MEL_BANDS + 2 }, (_, i) => hzToMel(F_MIN) + (i * (hzToMel(fMax) - hzToMel(F_MIN))) / (MEL_BANDS + 1));
    const bins = mels.map(m => (melToHz(m) * FFT) / sampleRate);
    for (let b = 0; b < MEL_BANDS; b++) {
      const [l, c, r] = [bins[b], bins[b + 1], bins[b + 2]];
      const from = Math.ceil(l), to = Math.floor(r);
      const weights: number[] = [];
      for (let k = from; k <= to; k++) weights.push(k <= c ? (k - l) / (c - l) : (r - k) / (r - c));
      this.filters.push({ from, weights });
      this.centers.push(melToHz(mels[b + 1]));
    }
  }

  centerHz(band: number): number { return this.centers[band]; }

  frame(f: Float32Array): Float32Array {
    const { re, im } = this;
    re.fill(0); im.fill(0);
    const n = Math.min(f.length, this.window.length);
    for (let i = 0; i < n; i++) re[i] = f[i] * this.window[i];
    fft(re, im);
    const out = new Float32Array(MEL_BANDS);
    for (let b = 0; b < MEL_BANDS; b++) {
      const { from, weights } = this.filters[b];
      let e = 0;
      for (let j = 0; j < weights.length; j++) {
        const k = from + j;
        e += weights[j] * (re[k] * re[k] + im[k] * im[k]);
      }
      out[b] = Math.log(e + FLOOR);
    }
    return out;
  }
}

/** Комплексное БПФ на месте, длина — степень двойки. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

/** Последние capacity кадров признаков с метками времени. */
export class FrameRing {
  private times: number[] = [];
  private data: Float32Array[] = [];
  constructor(private capacity: number, private width: number) {}
  push(tMs: number, v: Float32Array): void {
    this.times.push(tMs);
    this.data.push(v);
    if (this.times.length > this.capacity) { this.times.shift(); this.data.shift(); }
  }
  /** Кадры с fromMs ≤ t < toMs подряд в одном массиве. */
  slice(fromMs: number, toMs: number): number[] {
    const out: number[] = [];
    this.times.forEach((t, i) => { if (t >= fromMs && t < toMs) out.push(...Array.from(this.data[i]).slice(0, this.width)); });
    return out;
  }
}
