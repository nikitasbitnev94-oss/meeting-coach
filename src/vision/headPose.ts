const DEG = 180 / Math.PI;

/** Поворот головы из матрицы 4×4 MediaPipe (column-major): R[r][c] = m[c*4 + r]. */
export function matrixToYawPitch(m: ArrayLike<number>): { yawDeg: number; pitchDeg: number } {
  const r02 = m[8], r22 = m[10], r12 = m[9];
  const yawDeg = Math.atan2(r02, r22) * DEG;
  const pitchDeg = Math.asin(Math.max(-1, Math.min(1, -r12))) * DEG;
  return { yawDeg: yawDeg + 0, pitchDeg: pitchDeg + 0 };
}

/** Направление глаз из параметров eyeLook*: -1..1 по горизонтали и вертикали. */
export function eyeAngles(bs: Record<string, number>): { eyeYaw: number; eyePitch: number } {
  const g = (k: string) => bs[k] ?? 0;
  const eyeYaw = ((g('eyeLookInLeft') + g('eyeLookOutRight')) - (g('eyeLookOutLeft') + g('eyeLookInRight'))) / 2;
  const eyePitch = (g('eyeLookUpLeft') + g('eyeLookUpRight')) / 2 - (g('eyeLookDownLeft') + g('eyeLookDownRight')) / 2;
  return { eyeYaw: eyeYaw + 0, eyePitch: eyePitch + 0 };
}
