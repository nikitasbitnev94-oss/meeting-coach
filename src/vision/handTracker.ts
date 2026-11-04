import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandFrame } from '../types';

export interface HandTracker {
  detect(video: HTMLVideoElement, tMs: number): HandFrame;
  close(): void;
}

async function create(base: string, delegate: 'GPU' | 'CPU'): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(base + 'mediapipe-wasm');
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: base + 'models/hand_landmarker.task', delegate },
    runningMode: 'VIDEO',
    numHands: 2,
  });
}

export async function createHandTracker(base: string): Promise<HandTracker> {
  let lm: HandLandmarker;
  try { lm = await create(base, 'GPU'); } catch { lm = await create(base, 'CPU'); }
  let lastT = -1;
  return {
    detect(video, tMs) {
      if (video.readyState < 2 || video.videoWidth === 0) return { hands: [] };
      const t = Math.max(Math.round(tMs), lastT + 1);
      lastT = t;
      const r = lm.detectForVideo(video, t);
      return { hands: r.landmarks.map(h => h.map(p => ({ x: p.x, y: p.y }))) };
    },
    close() { lm.close(); },
  };
}
