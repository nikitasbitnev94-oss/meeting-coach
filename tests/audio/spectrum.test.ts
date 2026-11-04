import { MelFeatures, FrameRing, MEL_BANDS } from '../../src/audio/spectrum';
import { sine, SR } from '../helpers/audio';

const frame = (sig: Float32Array) => sig.slice(0, 320);

test('тон 1000 Гц даёт максимум в полосе около 1000 Гц', () => {
  const m = new MelFeatures(SR);
  const v = m.frame(frame(sine(1000, 40)));
  const band = v.indexOf(Math.max(...v));
  expect(Math.abs(m.centerHz(band) - 1000)).toBeLessThan(200);
});
test('более высокий тон — более высокая полоса', () => {
  const m = new MelFeatures(SR);
  const top = (hz: number) => { const v = m.frame(frame(sine(hz, 40))); return v.indexOf(Math.max(...v)); };
  expect(top(300)).toBeLessThan(top(1000));
  expect(top(1000)).toBeLessThan(top(3000));
});
test('размер вектора и тишина', () => {
  const v = new MelFeatures(SR).frame(new Float32Array(320));
  expect(v).toHaveLength(MEL_BANDS);
  expect(new Set(Array.from(v)).size).toBe(1);
});
test('кольцевой буфер отдаёт кадры за интервал и не растёт', () => {
  const r = new FrameRing(10, 2);
  for (let i = 0; i < 30; i++) r.push(i * 20, Float32Array.from([i, -i]));
  expect(r.slice(500, 560)).toEqual([25, -25, 26, -26, 27, -27]);
  expect(r.slice(0, 100)).toEqual([]);   // уже вытеснено
  expect((r as any).times.length).toBe(10);
});
