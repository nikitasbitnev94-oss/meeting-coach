import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandFrame } from '../types';

export interface HandTracker {
  detect(video: HTMLVideoElement, tMs: number): HandFrame;
  close(): void;
}

async function create(base: string, delegate: 'GPU' | 'CPU', confidence: number): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(base + 'mediapipe-wasm');
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: base + 'models/hand_landmarker.task', delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    // 0,3 (04.11) давало «руки» в узоре стены на встречах 06.11 — возвращено к 0,5.
    minHandDetectionConfidence: confidence,
    minHandPresenceConfidence: confidence,
    minTrackingConfidence: confidence,
  });
}

/** confidence 0,5 — для встреч; разметка на диагностике пишет с 0,3, чтобы в данные попали и ложные «руки». */
export async function createHandTracker(base: string, confidence = 0.5): Promise<HandTracker> {
  let lm: HandLandmarker;
  try { lm = await create(base, 'GPU', confidence); } catch { lm = await create(base, 'CPU', confidence); }
  let lastT = -1;
  return {
    detect(video, tMs) {
      if (video.readyState < 2 || video.videoWidth === 0) return { hands: [] };
      const t = Math.max(Math.round(tMs), lastT + 1);
      lastT = t;
      const r = lm.detectForVideo(video, t);
      return {
        hands: r.landmarks.map(h => h.map(p => ({ x: p.x, y: p.y }))),
        scores: r.handedness.map(c => c[0]?.score ?? 0),
      };
    },
    close() { lm.close(); },
  };
}
