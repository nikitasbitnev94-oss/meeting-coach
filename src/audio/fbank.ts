import { fft } from './spectrum';

/**
 * Признаки для модели голоса — как в Kaldi (на них модель обучена): 16 кГц, кадр 25 мс, шаг 10 мс,
 * окно Пови, предыскажение 0,97, 80 мел-полос 20–8000 Гц, логарифм энергии.
 */
export const FBANK_BINS = 80;
const SR = 16000;
const FRAME = 400;
const SHIFT = 160;
const NFFT = 512;
const LOW_HZ = 20;
const HIGH_HZ = SR / 2;
const EPS = 1.1920928955078125e-7;

const mel = (hz: number) => 1127 * Math.log(1 + hz / 700);

let cache: { window: Float64Array; banks: { from: number; w: number[] }[] } | null = null;

function tables() {
  if (cache) return cache;
  const window = Float64Array.from({ length: FRAME }, (_, i) => (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1))) ** 0.85);
  const lo = mel(LOW_HZ), hi = mel(HIGH_HZ), delta = (hi - lo) / (FBANK_BINS + 1);
  const banks: { from: number; w: number[] }[] = [];
  for (let b = 0; b < FBANK_BINS; b++) {
    const left = lo + b * delta, center = left + delta, right = center + delta;
    let from = -1;
    const w: number[] = [];
    for (let k = 0; k < NFFT / 2; k++) {
      const m = mel((SR / NFFT) * k);
      if (m > left && m < right) {
        if (from < 0) from = k;
        w.push(m <= center ? (m - left) / (center - left) : (right - m) / (right - center));
      }
    }
    banks.push({ from, w });
  }
  cache = { window, banks };
  return cache;
}

/** Признаки по сигналу 16 кГц в диапазоне [-1, 1]: frames × 80, подряд. */
export function fbank(x: Float32Array): { frames: number; data: Float32Array } {
  const frames = x.length < FRAME ? 0 : 1 + Math.floor((x.length - FRAME) / SHIFT);
  const data = new Float32Array(frames * FBANK_BINS);
  const { window, banks } = tables();
  const re = new Float64Array(NFFT), im = new Float64Array(NFFT);
  const buf = new Float64Array(FRAME);
  for (let f = 0; f < frames; f++) {
    let mean = 0;
    for (let i = 0; i < FRAME; i++) { buf[i] = x[f * SHIFT + i]; mean += buf[i]; }
    mean /= FRAME;
    for (let i = 0; i < FRAME; i++) buf[i] -= mean;
    for (let i = FRAME - 1; i > 0; i--) buf[i] -= 0.97 * buf[i - 1];
    buf[0] -= 0.97 * buf[0];
    re.fill(0); im.fill(0);
    for (let i = 0; i < FRAME; i++) re[i] = buf[i] * window[i];
    fft(re, im);
    for (let b = 0; b < FBANK_BINS; b++) {
      const { from, w } = banks[b];
      let e = 0;
      for (let j = 0; j < w.length; j++) { const k = from + j; e += w[j] * (re[k] * re[k] + im[k] * im[k]); }
      data[f * FBANK_BINS + b] = Math.log(Math.max(e, EPS));
    }
  }
  return { frames, data };
}

/** Вычитает среднее каждой полосы по времени — так признаки готовились при обучении модели. */
export function normalizeMean(data: Float32Array, frames: number, bins: number): void {
  if (!frames) return;
  for (let b = 0; b < bins; b++) {
    let s = 0;
    for (let f = 0; f < frames; f++) s += data[f * bins + b];
    const m = s / frames;
    for (let f = 0; f < frames; f++) data[f * bins + b] -= m;
  }
}
