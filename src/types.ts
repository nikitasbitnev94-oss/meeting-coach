export type HintId = 'hands' | 'smirk' | 'irritation' | 'skepticism' | 'surprise'
  | 'cheer' | 'frown' | 'expressive' | 'stone' | 'gaze' | 'lipBite' | 'hesitation' | 'filler' | 'fillerBurst';
export type EventType = Exclude<HintId, 'fillerBurst' | 'hesitation'>; // 'filler' несёт word, «э-э» — word 'э-э'

export interface Box { x: number; y: number; w: number; h: number } // нормированные 0..1
export interface FaceFrame {
  blendshapes: Record<string, number>; // имена MediaPipe, 0..1
  headYawDeg: number; headPitchDeg: number;
  eyeYaw: number; eyePitch: number; // -1..1 из eyeLook*
  box: Box;
}
export interface HandFrame {
  hands: { x: number; y: number }[][]; // нормированные
  /** Уверенность детектора по каждой руке, 0..1. */
  scores?: number[];
  /** Какая это рука по мнению детектора: 'Left' | 'Right'. */
  sides?: string[];
}
export interface Baseline {
  blendshapes: Record<string, number>;
  gazeYawDeg: number; gazePitchDeg: number;
  activityNorm: number; createdAt: string;
  /** Версия правила активности мимики; норма другой версии не используется. */
  activityVersion?: number;
}
export interface FrameSignals {
  gazeOnCamera: boolean; frown: boolean; irritation: boolean; skepticism: boolean;
  surprise: boolean; smirk: boolean; cheer: boolean; handNearFace: boolean; lipBite: boolean;
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
  /** Время с включённой камерой в созвоне (кнопка «Камера выкл»); нет — вся встреча. */
  cameraOnMs?: number;
  /** Слов, отброшенных как чужая речь (рот пользователя не двигался). Для проверки порога. */
  droppedForeignWords?: number;
  /** Проверка голоса по профилю: сколько отрезков речи проверено и сколько признано чужим голосом. */
  voice?: { checked: number; foreign: number };
}

/** Голосовой профиль пользователя. Хранится только в браузере. */
export interface VoiceProfile {
  version: 1;
  /** Модель, которой посчитан отпечаток; другая модель — профиль нужно записать заново. */
  model: string;
  /** Отпечаток голоса: среднее по 2-секундным отрезкам чтения, единичной длины. */
  embedding: number[];
  /** Подстройка распознавания «э-э» под голос и микрофон. */
  hesitationShift: number[];
  createdAt: string;
  speechMs: number;
}
