import { matrixToYawPitch, eyeAngles } from '../../src/vision/headPose';

test('единичная матрица → 0,0', () => {
  const r = matrixToYawPitch([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  expect(r.yawDeg).toBeCloseTo(0); expect(r.pitchDeg).toBeCloseTo(0);
});
test('поворот на 30° вокруг Y → yaw 30', () => {
  const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
  const r = matrixToYawPitch([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
  expect(r.yawDeg).toBeCloseTo(30, 3); expect(r.pitchDeg).toBeCloseTo(0, 3);
});
test('поворот на 20° вокруг X → pitch 20', () => {
  const c = Math.cos(Math.PI / 9), s = Math.sin(Math.PI / 9);
  const r = matrixToYawPitch([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
  expect(r.pitchDeg).toBeCloseTo(20, 3); expect(r.yawDeg).toBeCloseTo(0, 3);
});
test('глаза: взгляд прямо → 0, вверх → положительный pitch', () => {
  expect(eyeAngles({})).toEqual({ eyeYaw: 0, eyePitch: 0 });
  expect(eyeAngles({ eyeLookUpLeft: 0.6, eyeLookUpRight: 0.6 }).eyePitch).toBeCloseTo(0.6);
});
test('глаза: оба влево по горизонтали дают ненулевой yaw с одним знаком', () => {
  const r = eyeAngles({ eyeLookInLeft: 0.5, eyeLookOutRight: 0.5 });
  expect(r.eyeYaw).toBeCloseTo(0.5);
});
