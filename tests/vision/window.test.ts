import { ExpressionWindow } from '../../src/vision/window';
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import { face } from '../helpers/face';

test('неподвижное лицо: stillMs растёт, сбрасывается реакцией', () => {
  const w = new ExpressionWindow(DEFAULT_CONFIG, 3);
  let r = w.push(face({}), 0);
  for (let t = 100; t <= 200000; t += 100) r = w.push(face({}), t);
  expect(r.stillMs).toBe(200000);
  r = w.push(face({ mouthSmileLeft: .2 }), 200100);
  expect(r.stillMs).toBe(0);
});
test('мелкие колебания не считаются реакцией', () => {
  const w = new ExpressionWindow(DEFAULT_CONFIG, 3);
  w.push(face({}), 0);
  expect(w.push(face({ mouthSmileLeft: .1 }), 1000).stillMs).toBe(1000);
});
test('кивок сбрасывает stillMs', () => {
  const w = new ExpressionWindow(DEFAULT_CONFIG, 3);
  w.push(face({}), 0);
  expect(w.push(face({}, { headPitchDeg: 6 }), 1000).stillMs).toBe(0);
});
test('активность за 30 с относительно нормы', () => {
  const w = new ExpressionWindow(DEFAULT_CONFIG, 3);
  let r = w.push(face({ browInnerUp: 0 }), 0);
  for (let i = 1; i <= 300; i++) r = w.push(face({ browInnerUp: i % 2 ? .1 : 0 }), i * 100);
  expect(r.expressivityRatio).toBeCloseTo(300 * .1 / 3, 1);
});
test('окно не хранит кадры старше 30 с', () => {
  const w = new ExpressionWindow(DEFAULT_CONFIG, 3);
  for (let i = 0; i < 10000; i++) w.push(face({ browInnerUp: i % 2 ? .1 : 0 }), i * 100);
  expect((w as any).deltas.length).toBeLessThanOrEqual(301);
});
test('норма встречи — медиана сумм, снятых раз в 30 с', () => {
  const w = new ExpressionWindow(DEFAULT_CONFIG, 3);
  for (let i = 0; i <= 3000; i++) w.push(face({ browInnerUp: i % 2 ? .1 : 0 }), i * 100);
  expect(w.sampledNorm()).toBeCloseTo(30, 0);
});
test('встреча короче 5 минут — нормы нет', () => {
  const w = new ExpressionWindow(DEFAULT_CONFIG, 3);
  for (let i = 0; i <= 1000; i++) w.push(face({ browInnerUp: i % 2 ? .1 : 0 }), i * 100);
  expect(w.sampledNorm()).toBeNull();
});
