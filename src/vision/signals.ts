import type { Config } from '../config/defaults';
import type { Baseline, Box, FaceFrame, FrameSignals, HandFrame } from '../types';
import { gazeAngles } from './calibration';

/** Зона лица и волос: рамка лица, расширенная вверх (волосы) и немного в стороны (уши). */
export function handZone(box: Box, cfg: Config): Box {
  const { zoneUp, zoneSide } = cfg.hands;
  return {
    x: box.x - box.w * zoneSide,
    y: box.y - box.h * zoneUp,
    w: box.w * (1 + 2 * zoneSide),
    h: box.h * (1 + zoneUp),
  };
}

/** Зона шеи: под подбородком, не шире лица — чтобы жесты на уровне груди не считались касанием. */
export function neckZone(box: Box, cfg: Config): Box {
  return { x: box.x, y: box.y + box.h, w: box.w, h: box.h * cfg.hands.zoneDown };
}

/** Кончики пальцев MediaPipe. Касание — это пальцы, а не запястье или ладонь у подбородка при жесте. */
const FINGERTIPS = [4, 8, 12, 16, 20];

export function computeFrameSignals(f: FaceFrame, h: HandFrame, b: Baseline, cfg: Config): FrameSignals {
  const v = (k: string) => f.blendshapes[k] ?? 0;
  const v0 = (k: string) => b.blendshapes[k] ?? 0;
  const pair = (k: string) => (v(k + 'Left') + v(k + 'Right')) / 2;
  const pair0 = (k: string) => (v0(k + 'Left') + v0(k + 'Right')) / 2;
  const delta = (k: string) => pair(k) - pair0(k);
  const deltaOne = (k: string) => v(k) - v0(k);
  const asym = (k: string) =>
    Math.abs(v(k + 'Left') - v(k + 'Right')) - Math.abs(v0(k + 'Left') - v0(k + 'Right'));
  const c = cfg.face;

  const g = gazeAngles(f, cfg);

  return {
    gazeOnCamera: Math.abs(g.yawDeg - b.gazeYawDeg) <= cfg.gaze.maxYawDeg
      && Math.abs(g.pitchDeg - b.gazePitchDeg) <= cfg.gaze.maxPitchDeg,
    frown: pair('browDown') >= c.frownLevel,
    irritation: pair('browDown') >= c.irritationBrowLevel
      && (v('mouthPucker') >= c.irritationPucker || delta('mouthPress') >= c.irritationPressDelta),
    skepticism: asym('browOuterUp') >= c.skepticismAsym
      || (pair('browDown') >= c.skepticismBrowLevel && pair('mouthSmile') >= c.skepticismSmileMin && pair('mouthSmile') <= c.skepticismSmileMax),
    surprise: deltaOne('browInnerUp') >= c.surpriseBrowDelta && deltaOne('jawOpen') >= c.surpriseJawDelta,
    smirk: asym('mouthSmile') >= c.smirkAsym && Math.max(v('mouthSmileLeft'), v('mouthSmileRight')) >= c.smirkMinSmile,
    cheer: Math.min(v('mouthSmileLeft'), v('mouthSmileRight')) >= c.cheerSmile,
    handNearFace: handNear(h, f.box, cfg),
    lipBite: Math.max(v('mouthRollLower'), v('mouthRollUpper')) >= c.lipBiteRoll,
  };
}

/** Хотя бы одна точка руки в зоне вокруг лица. Рамку лица можно взять из последнего кадра, где лицо было видно. */
export function handNear(h: HandFrame, box: Box, cfg: Config): boolean {
  const zones = [handZone(box, cfg), neckZone(box, cfg)];
  const inside = (p: { x: number; y: number }) => zones.some(z => p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h);
  return h.hands.some(hand => {
    const tips = FINGERTIPS.map(i => hand[i]).filter(Boolean);
    return (tips.length ? tips : hand).some(inside);
  });
}

/** Держит сигнал «рука у лица» holdMs после последнего срабатывания: детектор рук на мгновения теряет руку. */
export class HandHold {
  private last = -Infinity;
  constructor(private cfg: Config) {}
  update(raw: boolean, tMs: number): boolean {
    if (raw) this.last = tMs;
    return tMs - this.last <= this.cfg.hands.holdMs;
  }
}
