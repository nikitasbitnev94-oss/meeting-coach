import { FillerTracker } from '../../src/audio/fillerTracker';
import { DEFAULT_CONFIG } from '../../src/config/defaults';

test('частичные: только прирост', () => {
  const f = new FillerTracker(DEFAULT_CONFIG.fillers);
  expect(f.onPartial('ну вот', 1000).map(h => h.word)).toEqual(['ну', 'вот']);
  expect(f.onPartial('ну вот значит', 1500).map(h => h.word)).toEqual(['значит']);
  expect(f.total()).toBe(3);
});
test('время попадания — время частичного результата', () => {
  const f = new FillerTracker(DEFAULT_CONFIG.fillers);
  expect(f.onPartial('ну', 1234)).toEqual([{ word: 'ну', tMs: 1234 }]);
});
test('переписанный частичный: без минуса и без повторов', () => {
  const f = new FillerTracker(DEFAULT_CONFIG.fillers);
  f.onPartial('ну вот', 1000);
  expect(f.onPartial('ну и', 1200)).toEqual([]);
  expect(f.total()).toBe(1);
  expect(f.onPartial('ну и вот', 1400).map(h => h.word)).toEqual(['вот']);
});
test('финальный фиксирует события и обнуляет предварительный счёт', () => {
  const f = new FillerTracker(DEFAULT_CONFIG.fillers);
  f.onPartial('ну это самое', 1000);
  const ev = f.onFinal([{ word: 'ну', start: 1.2, end: 1.4 }, { word: 'это', start: 1.5, end: 1.7 },
    { word: 'самое', start: 1.7, end: 2.0 }], 500);
  expect(ev).toEqual([{ type: 'filler', word: 'ну', tMs: 1700, durationMs: 200 },
    { type: 'filler', word: 'это самое', tMs: 2000, durationMs: 500 }]);
  expect(f.total()).toBe(2);
  expect(f.onPartial('ну', 3000).map(h => h.word)).toEqual(['ну']);
  expect(f.total()).toBe(3);
});
test('финальный без паразитов при показанных частичных — счёт по финальному', () => {
  const f = new FillerTracker(DEFAULT_CONFIG.fillers);
  f.onPartial('ну', 1000);
  expect(f.onFinal([{ word: 'нужно', start: 1, end: 1.3 }], 0)).toEqual([]);
  expect(f.total()).toBe(0);
});
test('э-э фиксируется сразу', () => {
  const f = new FillerTracker(DEFAULT_CONFIG.fillers);
  expect(f.addHesitation(4000)).toEqual({ hit: { word: 'э-э', tMs: 4000 }, event: { type: 'filler', word: 'э-э', tMs: 4000, durationMs: 0 } });
  expect(f.total()).toBe(1);
});
