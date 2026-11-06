import type { HintId } from '../types';

export const HINT_PRIORITY: HintId[] = ['hands', 'smirk', 'irritation', 'skepticism', 'lipBite', 'surprise',
  'cheer', 'frown', 'expressive', 'stone', 'gaze', 'hesitation', 'fillerBurst', 'filler'];

export type RuleId = Exclude<HintId, 'filler' | 'fillerBurst' | 'hesitation'>;

export const DEFAULT_CONFIG = {
  fillers: ['ну', 'вот', 'как бы', 'типа', 'короче', 'в общем', 'это самое', 'так сказать',
    'значит', 'получается', 'собственно', 'просто', 'наверно', 'наверное'],
  enabled: {
    hands: true, smirk: true, irritation: true, skepticism: true, surprise: true, cheer: true,
    frown: true, expressive: true, stone: true, gaze: true, lipBite: false, hesitation: true, filler: true, fillerBurst: true,
  } as Record<HintId, boolean>,
  texts: {
    hands: 'руки от лица', smirk: 'усмешка', irritation: 'раздражение', skepticism: 'скепсис',
    surprise: 'удивление', cheer: 'улыбка', frown: 'расслабь брови', expressive: 'мимика спокойнее',
    stone: 'кивни, отреагируй', gaze: 'в камеру', lipBite: 'не кусай губы', hesitation: 'э-э: {n} за минуту, делай паузы', filler: '{word}', fillerBurst: '{count} за минуту — делай паузы',
  } as Record<HintId, string>,
  minDurationMs: {
    hands: 1000, smirk: 1500, irritation: 2000, skepticism: 2000, surprise: 1500,
    cheer: 3000, frown: 3000, expressive: 0, stone: 0, gaze: 3000, lipBite: 1500,
  } as Record<RuleId, number>,
  display: {
    minShowMs: 2000, cooldownMs: 60000, handsCooldownMs: 3000, expressiveMaxShowMs: 3000, fillerFlashMs: 2000, burstCount: 3, burstWindowMs: 60000,
    faceLostMs: 5000, maxTickGapMs: 500,
    hesitationBurstCount: 3, hesitationWindowMs: 60000, hesitationFlashMs: 3000,
  },
  face: {
    // Брови — по уровню, а не от калибровки: спокойные брови у пользователя гуляют 0,23–0,50 (запись мимики 04.11).
    // Брови — от «спокойного уровня» встречи (медиана за 3 мин): в разные дни он 0,12–0,19 и 0,23–0,50 (записи мимики 04–05.11).
    frownDelta: 0.25, frownMaxSmile: 0.5, irritationBrowDelta: 0.05, irritationPucker: 0.35, irritationPressDelta: 0.2,
    skepticismBrowDelta: 0.2, skepticismSmileMin: 0.2, skepticismSmileMax: 0.7, skepticismAsym: 0.25,
    browLevelWindowMs: 180000, browLevelMinMs: 30000,
    surpriseBrowDelta: 0.3, surpriseJawDelta: 0.25, lipBiteRoll: 0.35, // губы — на глаз, уточнить по записи мимики
    smirkAsym: 0.25, smirkMinSmile: 0.3, cheerSmile: 0.6,
    expressiveRatio: 2, expressiveWindowMs: 30000, activityNormDefault: 0, expressiveMinSamples: 4,
    stoneMs: 180000, reactionDelta: 0.15, reactionPitchDeg: 5, gapResetMs: 1000,
  },
  gaze: { maxYawDeg: 12, maxPitchDeg: 10, eyeYawRangeDeg: 30, eyePitchRangeDeg: 25, eyeYawSign: -1, eyePitchSign: -1 }, // знаки по замеру на ноутбуке пользователя 04.11.2026
  // частота анализа: лицо 10 к/с, руки 3 к/с (касание длится дольше секунды)
  perf: { faceIntervalMs: 100, handIntervalMs: 333 },
  hands: { zoneUp: 0.6, zoneSide: 0.15, zoneDown: 0.65, holdMs: 600, faceBoxMemoryMs: 3000, minScore: 0.6, minSizeToFace: 0.33 },
  vad: { hangoverMs: 700, minRms: 0.01, noiseRatio: 3, mouthWindowMs: 1000, mouthMoveDelta: 0.04 },
  // подобрано по разметке пользователя 04.11.2026: 10 мин, 47 отметок
  hesitation: { minRunMs: 240, minRms: 0.01, minCorr: 0.5, relRms: 0.5, maxPitchDrift: 0.2, wordMarginMs: 60, refWindowMs: 30000, minProb: 0.5 },
  asr: { loadTimeoutMs: 180000, flushTimeoutMs: 1500 },
  calibration: { fullMs: 20000, gazeMs: 5000, minFaceShare: 0.7, maxGazeStdDeg: 4, maxAbsDeg: 25 },
};

export type Config = typeof DEFAULT_CONFIG;
