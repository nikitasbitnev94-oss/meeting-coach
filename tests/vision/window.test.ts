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

test('лицо вернулось после долгого отсутствия: нет «каменного лица» и скачка активности', () => {
  const w = new ExpressionWindow(DEFAULT_CONFIG, 3);
  for (let t = 0; t <= 10000; t += 100) w.push(face({}), t);
  const r = w.push(face({ browDownLeft: .5, mouthSmileLeft: .5 }), 200000);   // 190 с без лица
  expect(r.stillMs).toBe(0);
  expect(r.expressivityRatio).toBe(0);
});
test('короткий пропуск кадров (< 1 с) не сбрасывает окно', () => {
  const w = new ExpressionWindow(DEFAULT_CONFIG, 3);
  for (let t = 0; t <= 5000; t += 100) w.push(face({}), t);
  expect(w.push(face({}), 5800).stillMs).toBe(5800);
});

describe('норма активности мимики', () => {
  const wiggle = (w: ExpressionWindow, from: number, to: number, amp: number, key = 'browInnerUp') => {
    let r = w.push(face({}), from);
    for (let t = from + 100, i = 1; t <= to; t += 100, i++) r = w.push(face({ [key]: i % 2 ? amp : 0 }), t);
    return r;
  };
  test('норма неизвестна (0) — первые 2 минуты подсказки нет', () => {
    const w = new ExpressionWindow(DEFAULT_CONFIG, 0);
    expect(wiggle(w, 0, 110000, 0.3).expressivityRatio).toBe(0);
  });
  test('после 4 замеров по 30 с норма — их медиана: ровная активность ≈ 1×', () => {
    const w = new ExpressionWindow(DEFAULT_CONFIG, 0);
    expect(wiggle(w, 0, 150000, 0.1).expressivityRatio).toBeCloseTo(1, 1);
  });
  test('всплеск после разогрева — выше 2×', () => {
    const w = new ExpressionWindow(DEFAULT_CONFIG, 0);
    wiggle(w, 0, 150000, 0.05);
    expect(wiggle(w, 150100, 180100, 0.2).expressivityRatio).toBeGreaterThan(2);
  });
  test('замеры этой встречи важнее нормы прошлых встреч', () => {
    const w = new ExpressionWindow(DEFAULT_CONFIG, 3);
    expect(wiggle(w, 0, 150000, 0.1).expressivityRatio).toBeCloseTo(1, 1);
  });
  test('открывание рта при речи не считается активной мимикой', () => {
    const w = new ExpressionWindow(DEFAULT_CONFIG, 3);
    expect(wiggle(w, 0, 30000, 0.4, 'jawOpen').expressivityRatio).toBe(0);
  });
});

import { BrowLevel } from '../../src/vision/window';
describe('спокойный уровень бровей встречи', () => {
  test('первые 30 с — уровень калибровки', () => {
    const b = new BrowLevel(DEFAULT_CONFIG, 0.3);
    for (let t = 0; t < 20000; t += 100) b.push(face({ browDownLeft: .1, browDownRight: .1 }), t);
    expect(b.level()).toBe(0.3);
  });
  test('дальше — медиана бровей за 3 минуты без улыбки и удивления', () => {
    const b = new BrowLevel(DEFAULT_CONFIG, 0.3);
    for (let t = 0; t < 60000; t += 100) b.push(face({ browDownLeft: .12, browDownRight: .12 }), t);
    for (let t = 60000; t < 70000; t += 100) b.push(face({ browDownLeft: .0, browDownRight: .0, mouthSmileLeft: .8, mouthSmileRight: .8 }), t);
    expect(b.level()).toBeCloseTo(0.12);
  });
  test('хмурость дольше половины окна сдвигает уровень, но окно ограничено 3 минутами', () => {
    const b = new BrowLevel(DEFAULT_CONFIG, 0.3);
    for (let t = 0; t < 600000; t += 100) b.push(face({ browDownLeft: .2, browDownRight: .2 }), t);
    expect((b as any).median.items.length).toBeLessThanOrEqual(1801);
  });
});
