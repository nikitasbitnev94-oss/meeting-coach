import { HandRecorder, HAND_STEPS } from '../../src/diag/hands';

test('шаги: руки вне кадра, жесты без касаний, касания лица, волос, шеи', () => {
  const ids = HAND_STEPS.map(s => s.id);
  expect(ids).toEqual(expect.arrayContaining(['away', 'gesture', 'cheek', 'hair', 'neck', 'chin', 'near']));
  expect(HAND_STEPS.every(s => typeof s.touch === 'boolean')).toBe(true);
});
test('экспорт: шаг, время, рамка лица, руки с уверенностью — только числа, округлённые', () => {
  const r = new HandRecorder();
  r.frame('cheek', 100.4, { x: .41234, y: .3, w: .2, h: .3 }, { hands: [[{ x: .512345, y: .4 }]], scores: [.9876] }, true);
  r.frame('away', 200, null, { hands: [] }, false);
  expect(r.export()).toEqual({
    version: 1,
    rows: [
      { step: 'cheek', t: 100, box: [.4123, .3, .2, .3], hands: [{ score: .988, pts: [.5123, .4] }], fired: true },
      { step: 'away', t: 200, box: null, hands: [], fired: false },
    ],
  });
});
