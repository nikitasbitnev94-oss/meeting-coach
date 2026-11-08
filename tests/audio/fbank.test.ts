import { readFileSync } from 'node:fs';
import { fbank, normalizeMean } from '../../src/audio/fbank';

// Эталон — kaldi-native-fbank (те же признаки, на которых обучена модель голоса): 80 полос, 25/10 мс, без шума.
const fx = JSON.parse(readFileSync(new URL('../fixtures/fbank.json', import.meta.url), 'utf8')) as { x: number[]; fbank: number[][] };

describe('fbank', () => {
  it('совпадает с kaldi-native-fbank', () => {
    const { frames, data } = fbank(Float32Array.from(fx.x));
    expect(frames).toBe(fx.fbank.length);
    let maxErr = 0;
    for (let i = 0; i < frames; i++) for (let b = 0; b < 80; b++) maxErr = Math.max(maxErr, Math.abs(data[i * 80 + b] - fx.fbank[i][b]));
    expect(maxErr).toBeLessThan(1e-2);
  });

  it('пустой вход — ноль кадров', () => {
    expect(fbank(new Float32Array(100)).frames).toBe(0);
  });

  it('вычитание среднего по времени', () => {
    const d = Float32Array.from([1, 10, 3, 20]);
    normalizeMean(d, 2, 2);
    expect(Array.from(d)).toEqual([-1, -5, 1, 5]);
  });
});
