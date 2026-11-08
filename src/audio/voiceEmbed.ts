import type * as Ort from 'onnxruntime-web/wasm';
import { FBANK_BINS, fbank, normalizeMean } from './fbank';

/** Короче 0,5 с отпечаток голоса не считается: слишком мало звука. */
export const MIN_EMBED_SAMPLES = 8000;

/** Отпечаток голоса по сигналу 16 кГц: вектор единичной длины или null для слишком короткого звука. */
export async function embedWith(ort: typeof Ort, s: Ort.InferenceSession, x: Float32Array): Promise<Float32Array | null> {
  if (x.length < MIN_EMBED_SAMPLES) return null;
  const { frames, data } = fbank(x);
  normalizeMean(data, frames, FBANK_BINS);
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', data, [1, frames, FBANK_BINS]) });
  const e = out[s.outputNames[0]].data as Float32Array;
  return unit(e);
}

export function unit(e: ArrayLike<number>): Float32Array {
  let n = 0;
  for (let i = 0; i < e.length; i++) n += e[i] * e[i];
  n = Math.sqrt(n) || 1;
  return Float32Array.from(e, v => v / n);
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
