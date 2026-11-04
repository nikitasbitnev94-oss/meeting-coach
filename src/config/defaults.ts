import type { HintId } from '../types';

export const HINT_PRIORITY: HintId[] = ['hands', 'smirk', 'irritation', 'skepticism', 'surprise',
  'cheer', 'frown', 'expressive', 'stone', 'gaze', 'fillerBurst', 'filler'];

export type RuleId = Exclude<HintId, 'filler' | 'fillerBurst'>;

export const DEFAULT_CONFIG = {
  fillers: ['ну', 'вот', 'как бы', 'типа', 'короче', 'в общем', 'это самое', 'так сказать',
    'значит', 'получается', 'собственно', 'просто', 'наверно', 'наверное'],
  enabled: {
    hands: true, smirk: true, irritation: true, skepticism: true, surprise: true, cheer: true,
    frown: true, expressive: true, stone: true, gaze: true, filler: true, fillerBurst: true,
  } as Record<HintId, boolean>,
  texts: {
    hands: 'руки от лица', smirk: 'усмешка', irritation: 'раздражение', skepticism: 'скепсис',
    surprise: 'удивление', cheer: 'улыбка', frown: 'расслабь брови', expressive: 'мимика спокойнее',
    stone: 'кивни, отреагируй', gaze: 'в камеру', filler: '{word}', fillerBurst: 'пауза вместо «{word}»',
  } as Record<HintId, string>,
  minDurationMs: {
    hands: 1000, smirk: 1500, irritation: 2000, skepticism: 2000, surprise: 1500,
    cheer: 3000, frown: 3000, expressive: 0, stone: 0, gaze: 3000,
  } as Record<RuleId, number>,
  display: {
    minShowMs: 2000, cooldownMs: 60000, fillerFlashMs: 2000, burstCount: 3, burstWindowMs: 60000,
    faceLostMs: 5000, maxTickGapMs: 500,
  },
  face: {
    frownDelta: 0.25, irritationBrowDelta: 0.2, irritationPressDelta: 0.2,
    skepticismAsym: 0.25, skepticismSquintDelta: 0.3, surpriseBrowDelta: 0.3, surpriseJawDelta: 0.25,
    smirkAsym: 0.25, smirkMinSmile: 0.3, cheerSmile: 0.6,
    expressiveRatio: 2, expressiveWindowMs: 30000, activityNormDefault: 3.0,
    stoneMs: 180000, reactionDelta: 0.15, reactionPitchDeg: 5, gapResetMs: 1000,
  },
  gaze: { maxYawDeg: 12, maxPitchDeg: 10, eyeYawRangeDeg: 30, eyePitchRangeDeg: 25, eyeYawSign: 1 },
  hands: { zoneUp: 0.4, zoneSide: 0.2, zoneDown: 0.5 },
  vad: { hangoverMs: 700, minRms: 0.01, noiseRatio: 3 },
  hesitation: { minRunMs: 400, minRms: 0.02, maxPitchDrift: 0.1, minCorr: 0.5 },
  asr: { loadTimeoutMs: 180000, flushTimeoutMs: 1500 },
  calibration: { fullMs: 20000, gazeMs: 5000, minFaceShare: 0.7, maxGazeStdDeg: 4, maxAbsDeg: 25 },
};

export type Config = typeof DEFAULT_CONFIG;
