export type HintId = 'hands' | 'smirk' | 'irritation' | 'skepticism' | 'surprise'
  | 'cheer' | 'frown' | 'expressive' | 'stone' | 'gaze' | 'hesitation' | 'filler' | 'fillerBurst';
export type EventType = Exclude<HintId, 'fillerBurst' | 'hesitation'>; // 'filler' несёт word, «э-э» — word 'э-э'

export interface Box { x: number; y: number; w: number; h: number } // нормированные 0..1
export interface FaceFrame {
  blendshapes: Record<string, number>; // имена MediaPipe, 0..1
  headYawDeg: number; headPitchDeg: number;
  eyeYaw: number; eyePitch: number; // -1..1 из eyeLook*
  box: Box;
}
export interface HandFrame { hands: { x: number; y: number }[][] } // нормированные
export interface Baseline {
  blendshapes: Record<string, number>;
  gazeYawDeg: number; gazePitchDeg: number;
  activityNorm: number; createdAt: string;
  /** Версия правила активности мимики; норма другой версии не используется. */
  activityVersion?: number;
}
export interface FrameSignals {
  gazeOnCamera: boolean; frown: boolean; irritation: boolean; skepticism: boolean;
  surprise: boolean; smirk: boolean; cheer: boolean; handNearFace: boolean;
}
export interface VisionSignals extends FrameSignals { expressivityRatio: number; stillMs: number }
export interface FillerHit { word: string; tMs: number }
export interface AsrWord { word: string; start: number; end: number } // секунды от начала потока
export interface CoachEvent { type: EventType; tMs: number; durationMs: number; word?: string }
export interface Hint { id: HintId; text: string }
export interface Meeting {
  id: string; title: string; startedAt: string; durationMs: number;
  speakingMs: number; speakingWithFaceMs: number; onCameraMs: number;
  events: CoachEvent[];
}
