import { computeFrameSignals, handZone } from '../../src/vision/signals';
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import type { Baseline, HandFrame } from '../../src/types';
import { face } from '../helpers/face';

const B: Baseline = { blendshapes: {}, gazeYawDeg: 0, gazePitchDeg: 0, activityNorm: 3, createdAt: 'x' };
const noHands: HandFrame = { hands: [] };
const sig = (bs: Record<string, number>) => computeFrameSignals(face(bs), noHands, B, DEFAULT_CONFIG);

// Пороги по записи мимики пользователя 04.11: спокойное лицо — брови 0,23–0,50, хмурость — 0,57–0,72.
test('хмурость: брови ниже 0,55', () => {
  expect(sig({ browDownLeft: .6, browDownRight: .6 }).frown).toBe(true);
  expect(sig({ browDownLeft: .5, browDownRight: .5 }).frown).toBe(false);
});
test('хмурость не зависит от калибровки: спокойные брови 0,45 при норме 0,15 — не хмурость', () => {
  const b = { ...B, blendshapes: { browDownLeft: .15, browDownRight: .15 } };
  expect(computeFrameSignals(face({ browDownLeft: .45, browDownRight: .45 }), noHands, b, DEFAULT_CONFIG).frown).toBe(false);
});
test('раздражение: губы трубочкой при опущенных бровях', () => {
  expect(sig({ browDownLeft: .4, browDownRight: .4, mouthPucker: .5 }).irritation).toBe(true);
  expect(sig({ browDownLeft: .1, browDownRight: .1, mouthPucker: .5 }).irritation).toBe(false);
});
test('раздражение: сжатые губы при опущенных бровях', () => {
  expect(sig({ browDownLeft: .3, browDownRight: .3, mouthPressLeft: .3, mouthPressRight: .3 }).irritation).toBe(true);
});
test('скепсис: брови вниз и полуулыбка', () => {
  expect(sig({ browDownLeft: .55, browDownRight: .55, mouthSmileLeft: .45, mouthSmileRight: .45 }).skepticism).toBe(true);
  expect(sig({ browDownLeft: .55, browDownRight: .55, mouthSmileLeft: .85, mouthSmileRight: .85 }).skepticism).toBe(false);
  expect(sig({ browDownLeft: .3, browDownRight: .3, mouthSmileLeft: .45, mouthSmileRight: .45 }).skepticism).toBe(false);
});
test('скепсис: одна бровь', () => expect(sig({ browOuterUpLeft: .4 }).skepticism).toBe(true));
test('асимметрия считается от нормы', () => {
  const b = { ...B, blendshapes: { browOuterUpLeft: .3 } };
  expect(computeFrameSignals(face({ browOuterUpLeft: .4 }), noHands, b, DEFAULT_CONFIG).skepticism).toBe(false);
});
test('удивление: брови и рот', () => {
  expect(sig({ browInnerUp: .4, jawOpen: .3 }).surprise).toBe(true);
  expect(sig({ browInnerUp: .4 }).surprise).toBe(false);
});
test('усмешка: одна сторона', () => {
  expect(sig({ mouthSmileLeft: .5, mouthSmileRight: .1 }).smirk).toBe(true);
  expect(sig({ mouthSmileLeft: .5, mouthSmileRight: .5 }).smirk).toBe(false);
});
test('весёлость: широкая улыбка', () => {
  expect(sig({ mouthSmileLeft: .7, mouthSmileRight: .7 }).cheer).toBe(true);
  expect(sig({ mouthSmileLeft: .5, mouthSmileRight: .5 }).cheer).toBe(false);
});
test('взгляд: 15° в сторону — мимо камеры', () => {
  expect(computeFrameSignals(face({}, { headYawDeg: 15 }), noHands, B, DEFAULT_CONFIG).gazeOnCamera).toBe(false);
  expect(computeFrameSignals(face({}, { headYawDeg: 8 }), noHands, B, DEFAULT_CONFIG).gazeOnCamera).toBe(true);
  expect(computeFrameSignals(face({}, { headPitchDeg: -12 }), noHands, B, DEFAULT_CONFIG).gazeOnCamera).toBe(false);
});
test('взгляд считается от калиброванного направления', () => {
  const b = { ...B, gazeYawDeg: 15 };
  expect(computeFrameSignals(face({}, { headYawDeg: 15 }), noHands, b, DEFAULT_CONFIG).gazeOnCamera).toBe(true);
});
describe('руки', () => {
  const box = { x: .4, y: .3, w: .2, h: .3 };
  const hand = (p: { x: number; y: number }) =>
    computeFrameSignals(face({}, { box }), { hands: [[p]] }, B, DEFAULT_CONFIG).handNearFace;
  test('зона лица с волосами и ушами (шея — отдельная узкая зона)', () => {
    const z = handZone(box, DEFAULT_CONFIG);
    expect(z.x).toBeCloseTo(.37); expect(z.y).toBeCloseTo(.12);
    expect(z.w).toBeCloseTo(.26); expect(z.h).toBeCloseTo(.48);
  });
  test('волосы', () => expect(hand({ x: .5, y: .2 })).toBe(true));
  test('шея', () => expect(hand({ x: .5, y: .7 })).toBe(true));
  test('низ шеи — 60% высоты лица под подбородком', () => expect(hand({ x: .5, y: .78 })).toBe(true));
  test('сбоку далеко', () => expect(hand({ x: .9, y: .4 })).toBe(false));
  test('рук нет', () => expect(sig({}).handNearFace).toBe(false));
});

import { handNear, HandHold } from '../../src/vision/signals';
describe('руки: устойчивость', () => {
  test('кратковременная потеря руки не сбрасывает сигнал (держится 600 мс)', () => {
    const h = new HandHold(DEFAULT_CONFIG);
    expect(h.update(true, 0)).toBe(true);
    expect(h.update(false, 400)).toBe(true);
    expect(h.update(false, 700)).toBe(false);
  });
  test('handNear по рамке лица без самого кадра лица', () => {
    const box = { x: .4, y: .3, w: .2, h: .3 };
    expect(handNear({ hands: [[{ x: .5, y: .15 }]] }, box, DEFAULT_CONFIG)).toBe(true);   // макушка, 50% выше лба
    expect(handNear({ hands: [[{ x: .62, y: .35 }]] }, box, DEFAULT_CONFIG)).toBe(true);  // волосы сбоку, 10% ширины
    expect(handNear({ hands: [] }, box, DEFAULT_CONFIG)).toBe(false);
  });
});

describe('правки 05.11', () => {
  test('прикусывание губ: нижняя или верхняя губа втянута', () => {
    expect(sig({ mouthRollLower: .45 }).lipBite).toBe(true);
    expect(sig({ mouthRollUpper: .45 }).lipBite).toBe(true);
    expect(sig({ mouthRollLower: .05 }).lipBite).toBe(false);
  });
  const box = { x: .4, y: .3, w: .2, h: .3 };
  // точки руки MediaPipe: 0 запястье, 4/8/12/16/20 — кончики пальцев
  const handWith = (tip: { x: number; y: number }, other = { x: .9, y: .9 }) =>
    ({ hands: [Array.from({ length: 21 }, (_, i) => ([4, 8, 12, 16, 20].includes(i) ? tip : other))] });
  test('считаются только кончики пальцев: запястье у подбородка при жесте — не касание', () => {
    const h = { hands: [Array.from({ length: 21 }, (_, i) => (i === 0 ? { x: .5, y: .65 } : { x: .5, y: .95 }))] };
    expect(handNear(h, box, DEFAULT_CONFIG)).toBe(false);
  });
  test('пальцы на щеке — касание', () => expect(handNear(handWith({ x: .58, y: .45 }), box, DEFAULT_CONFIG)).toBe(true));
  test('пальцы сбоку от головы на 25% ширины — жест, не касание', () => expect(handNear(handWith({ x: .65, y: .4 }), box, DEFAULT_CONFIG)).toBe(false));
  test('пальцы на волосах сверху — касание', () => expect(handNear(handWith({ x: .5, y: .15 }), box, DEFAULT_CONFIG)).toBe(true));
  test('пальцы на шее под подбородком — касание', () => expect(handNear(handWith({ x: .5, y: .75 }), box, DEFAULT_CONFIG)).toBe(true));
  test('под подбородком, но сбоку от шеи — жест у груди, не касание', () => expect(handNear(handWith({ x: .63, y: .75 }), box, DEFAULT_CONFIG)).toBe(false));
});
