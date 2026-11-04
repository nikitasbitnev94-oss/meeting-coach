import type { FaceFrame } from '../../src/types';

export function frame(over: Partial<FaceFrame> = {}): FaceFrame {
  return {
    blendshapes: {}, headYawDeg: 0, headPitchDeg: 0, eyeYaw: 0, eyePitch: 0,
    box: { x: 0.35, y: 0.3, w: 0.3, h: 0.4 },
    ...over,
  };
}

export function face(bs: Record<string, number> = {}, over: Partial<FaceFrame> = {}): FaceFrame {
  return frame({ blendshapes: bs, ...over });
}
