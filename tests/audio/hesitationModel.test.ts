import { dctOrtho, hesitationFeatures, hesitationProbability } from '../../src/audio/hesitationModel';

test('DCT-II с нормировкой', () => {
  const r = dctOrtho([1, 1, 1, 1], 4);
  expect(r[0]).toBeCloseTo(2); expect(r[1]).toBeCloseTo(0); expect(r[3]).toBeCloseTo(0);
  const c = dctOrtho([1, 0, 0, 0], 2);
  expect(c[0]).toBeCloseTo(0.5); expect(c[1]).toBeCloseTo(Math.sqrt(0.5) * Math.cos(Math.PI / 8));
});
test('признаки: 12 средних, 12 разбросов, разброс громкости, длительность', () => {
  const mel = Array.from({ length: 10 }, (_, i) => Array.from({ length: 24 }, (_, b) => i + b * 0.1));
  const f = hesitationFeatures(mel.flat(), 24, 200);
  expect(f).toHaveLength(26);
  expect(f[25]).toBeCloseTo(0.2);
});
test('вероятность в пределах 0..1', () => {
  const mel = Array.from({ length: 15 }, () => Array.from({ length: 24 }, () => -5));
  const p = hesitationProbability(mel.flat(), 24, 300);
  expect(p).toBeGreaterThan(0); expect(p).toBeLessThan(1);
});
