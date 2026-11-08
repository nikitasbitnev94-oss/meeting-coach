import { dctOrtho, hesitationFeatures, hesitationProbability, hesitationShift } from '../../src/audio/hesitationModel';

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

describe('подстройка под голос', () => {
  const seg = (v: number) => ({ mel: Array.from({ length: 24 * 10 }, (_, i) => v + Math.sin(i)), durMs: 200 });
  test('нет отрезков — нет сдвига', () => {
    expect(hesitationShift([], 24)).toEqual([]);
  });
  test('сдвиг 12 значений, при большем числе отрезков ближе к полной разнице', () => {
    const few = hesitationShift([seg(1)], 24), many = hesitationShift(Array.from({ length: 40 }, () => seg(1)), 24);
    expect(few).toHaveLength(12);
    expect(Math.abs(many[1])).toBeGreaterThan(Math.abs(few[1]));
  });
  test('сдвиг меняет вероятность', () => {
    const s = seg(2);
    const a = hesitationProbability(s.mel, 24, 200), b = hesitationProbability(s.mel, 24, 200, hesitationShift([s, s, s], 24));
    expect(a).not.toBeCloseTo(b, 3);
  });
});
