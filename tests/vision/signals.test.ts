import { computeFrameSignals, handZone } from '../../src/vision/signals';
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import type { Baseline, HandFrame } from '../../src/types';
import { face } from '../helpers/face';

const B: Baseline = { blendshapes: {}, gazeYawDeg: 0, gazePitchDeg: 0, activityNorm: 3, createdAt: 'x' };
const noHands: HandFrame = { hands: [] };
const sig = (bs: Record<string, number>) => computeFrameSignals(face(bs), noHands, B, DEFAULT_CONFIG);

test('хмурость по порогу', () => {
  expect(sig({ browDownLeft: .3, browDownRight: .3 }).frown).toBe(true);
  expect(sig({ browDownLeft: .2, browDownRight: .2 }).frown).toBe(false);
});
test('хмурость считается от нормы', () => {
  const b = { ...B, blendshapes: { browDownLeft: .2, browDownRight: .2 } };
  expect(computeFrameSignals(face({ browDownLeft: .4, browDownRight: .4 }), noHands, b, DEFAULT_CONFIG).frown).toBe(false);
});
test('раздражение требует и брови, и губы', () => {
  expect(sig({ browDownLeft: .3, browDownRight: .3 }).irritation).toBe(false);
  expect(sig({ browDownLeft: .3, browDownRight: .3, mouthPressLeft: .3, mouthPressRight: .3 }).irritation).toBe(true);
});
test('скепсис: одна бровь', () => expect(sig({ browOuterUpLeft: .4 }).skepticism).toBe(true));
test('скепсис: прищур', () => expect(sig({ eyeSquintLeft: .4, eyeSquintRight: .4 }).skepticism).toBe(true));
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
  test('зона лица с волосами, ушами и шеей', () => {
    const z = handZone(box, DEFAULT_CONFIG);
    expect(z.x).toBeCloseTo(.36); expect(z.y).toBeCloseTo(.18);
    expect(z.w).toBeCloseTo(.28); expect(z.h).toBeCloseTo(.57);
  });
  test('волосы', () => expect(hand({ x: .5, y: .2 })).toBe(true));
  test('шея', () => expect(hand({ x: .5, y: .7 })).toBe(true));
  test('сбоку далеко', () => expect(hand({ x: .9, y: .4 })).toBe(false));
  test('рук нет', () => expect(sig({}).handNearFace).toBe(false));
});
