import { CalibrationAccumulator, gazeAngles } from '../../src/vision/calibration';
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import { frame } from '../helpers/face';

test('full: средние мимики и взгляда', () => {
  const a = new CalibrationAccumulator();
  for (let i = 0; i < 200; i++) a.add(frame({ headYawDeg: 5, blendshapes: { browDownLeft: 0.1 } }));
  const r = a.result('full', null, DEFAULT_CONFIG);
  if (!r.ok) throw new Error(r.reason);
  expect(r.baseline.gazeYawDeg).toBeCloseTo(5);
  expect(r.baseline.blendshapes.browDownLeft).toBeCloseTo(0.1);
  expect(r.baseline.activityNorm).toBe(DEFAULT_CONFIG.face.activityNormDefault);
});
test('лица меньше 70% кадров → no-face', () => {
  const a = new CalibrationAccumulator();
  for (let i = 0; i < 100; i++) a.add(i < 60 ? frame() : null);
  expect(a.result('full', null, DEFAULT_CONFIG)).toEqual({ ok: false, reason: 'no-face' });
});
test('ни одного кадра → no-face', () => {
  expect(new CalibrationAccumulator().result('full', null, DEFAULT_CONFIG)).toEqual({ ok: false, reason: 'no-face' });
});
test('взгляд гуляет (std > 4°) → unstable', () => {
  const a = new CalibrationAccumulator();
  for (let i = 0; i < 100; i++) a.add(frame({ headYawDeg: i % 2 ? 15 : -15 }));
  expect(a.result('full', null, DEFAULT_CONFIG)).toEqual({ ok: false, reason: 'unstable' });
});
test('gaze без полной калибровки → no-baseline', () => {
  const a = new CalibrationAccumulator(); a.add(frame());
  expect(a.result('gaze', null, DEFAULT_CONFIG)).toEqual({ ok: false, reason: 'no-baseline' });
});
test('gaze обновляет только взгляд', () => {
  const prev = { blendshapes: { browDownLeft: 0.2 }, gazeYawDeg: 0, gazePitchDeg: 0, activityNorm: 4, createdAt: 'x' };
  const a = new CalibrationAccumulator();
  for (let i = 0; i < 50; i++) a.add(frame({ headPitchDeg: -8 }));
  const r = a.result('gaze', prev, DEFAULT_CONFIG);
  if (!r.ok) throw new Error(r.reason);
  expect(r.baseline.gazePitchDeg).toBeCloseTo(-8);
  expect(r.baseline.blendshapes).toEqual(prev.blendshapes);
  expect(r.baseline.activityNorm).toBe(4);
});
test('gazeAngles: голова плюс глаза со знаками из конфига', () => {
  const g = gazeAngles(frame({ headYawDeg: 10, eyeYaw: -0.2, headPitchDeg: 3, eyePitch: 0.4 }), DEFAULT_CONFIG);
  expect(g.yawDeg).toBeCloseTo(10 + 0.2 * 30);
  expect(g.pitchDeg).toBeCloseTo(3 - 0.4 * 25);
});

test('ровно, но мимо камеры (голова повёрнута на 40°) → away', () => {
  const a = new CalibrationAccumulator();
  for (let i = 0; i < 100; i++) a.add(frame({ headYawDeg: 40 }));
  expect(a.result('full', null, DEFAULT_CONFIG)).toEqual({ ok: false, reason: 'away' });
});

test('замер пользователя: голова −19°/−12°, глаза −0.85/−0.31 при взгляде в камеру → почти 0', () => {
  const g = gazeAngles(frame({ headYawDeg: -19, eyeYaw: -0.85, headPitchDeg: -12, eyePitch: -0.31 }), DEFAULT_CONFIG);
  expect(Math.abs(g.yawDeg)).toBeLessThan(10);
  expect(Math.abs(g.pitchDeg)).toBeLessThan(10);
});

import { effectiveActivityNorm, ACTIVITY_VERSION } from '../../src/vision/calibration';
test('норма старой версии не используется', () => {
  const old = { blendshapes: {}, gazeYawDeg: 0, gazePitchDeg: 0, activityNorm: 3, createdAt: 'x' };
  expect(effectiveActivityNorm(old)).toBe(0);
  expect(effectiveActivityNorm({ ...old, activityNorm: 25, activityVersion: ACTIVITY_VERSION })).toBe(25);
});
test('полная калибровка не переносит норму старой версии', () => {
  const prev = { blendshapes: {}, gazeYawDeg: 0, gazePitchDeg: 0, activityNorm: 3, createdAt: 'x' };
  const a = new CalibrationAccumulator();
  for (let i = 0; i < 100; i++) a.add(frame());
  const r = a.result('full', prev, DEFAULT_CONFIG);
  if (!r.ok) throw new Error(r.reason);
  expect(r.baseline.activityNorm).toBe(0);
  expect(r.baseline.activityVersion).toBe(ACTIVITY_VERSION);
});
