import { LabelRecorder, wordFlag } from '../../src/diag/labeling';

const FILLERS = ['ну', 'вот', 'как бы'];

test('пометка слова: обычное, паразит, похоже на «э-э»', () => {
  expect(wordFlag('работа', FILLERS)).toBe(0);
  expect(wordFlag('вот', FILLERS)).toBe(1);
  expect(wordFlag('ээ', FILLERS)).toBe(2);
  expect(wordFlag('эм', FILLERS)).toBe(2);
  expect(wordFlag('мм', FILLERS)).toBe(2);
});

test('экспорт: только числа, без текста слов', () => {
  const r = new LabelRecorder(FILLERS, 16000);
  r.frame(0.01234, 151.7, 0.876);
  r.frame(0.2, 0, 0);
  r.words([{ word: 'вот', start: 1.2, end: 1.5 }, { word: 'секретный', start: 1.5, end: 2.0 }], 500);
  r.label(3000);
  r.detected(2500);
  const out = r.export(4000);
  expect(out).toEqual({
    version: 1, frameMs: 20, sampleRate: 16000, durationMs: 4000,
    frames: [0.0123, 152, 0.88, 0.2, 0, 0],
    words: [[1700, 2000, 1], [2000, 2500, 0]],
    labels: [3000],
    detector: [2500],
  });
  expect(JSON.stringify(out)).not.toContain('секретный');
});

import { SpectrumRecorder } from '../../src/diag/labeling';
test('спектр выгружается только для отрезков-кандидатов, с запасом 100 мс', () => {
  const r = new SpectrumRecorder(FILLERS, 16000);
  const mel = (i: number) => new Float32Array(24).fill(i);
  for (let i = 0; i < 40; i++) {
    r.frame(i * 20, 0.1, 150, 0.9, mel(i));
    if (i === 20) r.candidate({ start: 200, end: 400 }); // отрезок отдаётся после его конца
  }
  r.confirmed({ start: 220, end: 400 });
  const out = r.export(800);
  expect(out.version).toBe(2);
  expect(out.candidates).toHaveLength(1);
  const c = out.candidates[0];
  expect([c.start, c.end, c.melFrom]).toEqual([200, 400, 100]);
  expect(c.mel).toHaveLength(20 * 24);              // кадры 100..480 мс → 20 кадров по 24
  expect(c.mel[0]).toBe(5); expect(c.mel[c.mel.length - 1]).toBe(24);
  expect(out.confirmed).toEqual([[220, 400]]);
  expect(out.frames).toHaveLength(40 * 3);
});
test('кандидат без достаточного числа кадров после конца ждёт их', () => {
  const r = new SpectrumRecorder(FILLERS, 16000);
  for (let i = 0; i < 21; i++) r.frame(i * 20, 0.1, 150, 0.9, new Float32Array(24));
  r.candidate({ start: 200, end: 400 });
  expect(r.export(420).candidates).toHaveLength(0);
});
