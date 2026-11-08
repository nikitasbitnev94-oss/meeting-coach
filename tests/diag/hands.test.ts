import { HandRecorder, HAND_STEPS } from '../../src/diag/hands';

test('шаги: касания и «рядом» — отдельно левой и правой рукой', () => {
  const ids = HAND_STEPS.map(s => s.id);
  for (const k of ['cheek', 'chin', 'hair', 'neck', 'near']) expect(ids).toEqual(expect.arrayContaining([`${k}-left`, `${k}-right`]));
  expect(ids).toEqual(expect.arrayContaining(['away', 'gesture', 'chest', 'away2']));
  expect(HAND_STEPS.every(s => typeof s.touch === 'boolean' && s.ms >= 5000)).toBe(true);
  expect(HAND_STEPS.find(s => s.id === 'cheek-left')?.hand).toBe('left');
});
test('экспорт: шаг, время, рамка лица, руки с уверенностью — только числа, округлённые', () => {
  const r = new HandRecorder();
  r.frame('cheek', 100.4, { x: .41234, y: .3, w: .2, h: .3 }, { hands: [[{ x: .512345, y: .4 }]], scores: [.9876], sides: ['Left'] }, true);
  r.frame('away', 200, null, { hands: [] }, false);
  expect(r.export()).toEqual({
    version: 1,
    rows: [
      { step: 'cheek', t: 100, box: [.4123, .3, .2, .3], hands: [{ score: .988, side: 'Left', pts: [.5123, .4] }], fired: true },
      { step: 'away', t: 200, box: null, hands: [], fired: false },
    ],
  });
});
