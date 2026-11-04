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
