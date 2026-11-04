import { FaceLandmarker, FilesetResolver, type FaceLandmarkerOptions } from '@mediapipe/tasks-vision';
import type { FaceFrame } from '../types';
import { eyeAngles, matrixToYawPitch } from './headPose';

export interface FaceTracker {
  detect(video: HTMLVideoElement, tMs: number): FaceFrame | null;
  close(): void;
}

async function create(base: string, delegate: 'GPU' | 'CPU'): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(base + 'mediapipe-wasm');
  const options: FaceLandmarkerOptions = {
    baseOptions: { modelAssetPath: base + 'models/face_landmarker.task', delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  };
  return FaceLandmarker.createFromOptions(fileset, options);
}

export async function createFaceTracker(base: string): Promise<FaceTracker> {
  let lm: FaceLandmarker;
  try { lm = await create(base, 'GPU'); } catch { lm = await create(base, 'CPU'); }
  let lastT = -1;
  return {
    detect(video, tMs) {
      if (video.readyState < 2 || video.videoWidth === 0) return null;
      const t = Math.max(Math.round(tMs), lastT + 1); // MediaPipe требует строго растущее время
      lastT = t;
      const r = lm.detectForVideo(video, t);
      const points = r.faceLandmarks[0];
      if (!points?.length) return null;
      const blendshapes: Record<string, number> = {};
      for (const c of r.faceBlendshapes[0]?.categories ?? []) blendshapes[c.categoryName] = c.score;
      const pose = r.facialTransformationMatrixes[0]
        ? matrixToYawPitch(r.facialTransformationMatrixes[0].data)
        : { yawDeg: 0, pitchDeg: 0 };
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      for (const p of points) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
      const eyes = eyeAngles(blendshapes);
      return {
        blendshapes,
        headYawDeg: pose.yawDeg, headPitchDeg: pose.pitchDeg,
        eyeYaw: eyes.eyeYaw, eyePitch: eyes.eyePitch,
        box: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      };
    },
    close() { lm.close(); },
  };
}
