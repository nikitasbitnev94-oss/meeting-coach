import type { Config } from '../config/defaults';
import type { Baseline, FaceFrame } from '../types';

export type CalibrationResult =
  | { ok: true; baseline: Baseline }
  | { ok: false; reason: 'no-face' | 'unstable' | 'away' | 'no-baseline' };

/** Направление взгляда в градусах: поворот головы плюс отклонение глаз. */
export function gazeAngles(f: FaceFrame, cfg: Config): { yawDeg: number; pitchDeg: number } {
  return {
    yawDeg: f.headYawDeg + f.eyeYaw * cfg.gaze.eyeYawRangeDeg * cfg.gaze.eyeYawSign,
    pitchDeg: f.headPitchDeg + f.eyePitch * cfg.gaze.eyePitchRangeDeg,
  };
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const std = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
};

export class CalibrationAccumulator {
  private frames: FaceFrame[] = [];
  private total = 0;

  add(f: FaceFrame | null): void {
    this.total += 1;
    if (f) this.frames.push(f);
  }

  /** Доля кадров с лицом — для индикатора на экране. */
  faceShare(): number {
    return this.total ? this.frames.length / this.total : 0;
  }

  result(kind: 'full' | 'gaze', prev: Baseline | null, cfg: Config): CalibrationResult {
    if (kind === 'gaze' && !prev) return { ok: false, reason: 'no-baseline' };
    if (!this.total || this.frames.length / this.total < cfg.calibration.minFaceShare) {
      return { ok: false, reason: 'no-face' };
    }
    const gaze = this.frames.map(f => gazeAngles(f, cfg));
    const yaws = gaze.map(g => g.yawDeg), pitches = gaze.map(g => g.pitchDeg);
    if (std(yaws) > cfg.calibration.maxGazeStdDeg || std(pitches) > cfg.calibration.maxGazeStdDeg) {
      return { ok: false, reason: 'unstable' };
    }
    // Камера почти всегда перед лицом: ровный взгляд далеко в сторону — это взгляд не в камеру.
    if (Math.abs(mean(yaws)) > cfg.calibration.maxAbsDeg || Math.abs(mean(pitches)) > cfg.calibration.maxAbsDeg) {
      return { ok: false, reason: 'away' };
    }
    const createdAt = new Date().toISOString();
    if (kind === 'gaze') {
      return { ok: true, baseline: { ...prev!, gazeYawDeg: mean(yaws), gazePitchDeg: mean(pitches), createdAt } };
    }
    const keys = new Set(this.frames.flatMap(f => Object.keys(f.blendshapes)));
    const blendshapes: Record<string, number> = {};
    for (const k of keys) blendshapes[k] = mean(this.frames.map(f => f.blendshapes[k] ?? 0));
    return {
      ok: true,
      baseline: {
        blendshapes,
        gazeYawDeg: mean(yaws), gazePitchDeg: mean(pitches),
        activityNorm: prev?.activityNorm ?? cfg.face.activityNormDefault,
        createdAt,
      },
    };
  }
}
