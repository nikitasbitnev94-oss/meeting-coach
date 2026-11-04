import type { Config } from '../config/defaults';
import type { Baseline, Box, FaceFrame, FrameSignals, HandFrame } from '../types';
import { gazeAngles } from './calibration';

/** Зона «рука у лица»: рамка лица, расширенная вверх (волосы), в стороны (уши) и вниз (шея). */
export function handZone(box: Box, cfg: Config): Box {
  const { zoneUp, zoneSide, zoneDown } = cfg.hands;
  return {
    x: box.x - box.w * zoneSide,
    y: box.y - box.h * zoneUp,
    w: box.w * (1 + 2 * zoneSide),
    h: box.h * (1 + zoneUp + zoneDown),
  };
}

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
  const zone = handZone(f.box, cfg);
  const inZone = (p: { x: number; y: number }) =>
    p.x >= zone.x && p.x <= zone.x + zone.w && p.y >= zone.y && p.y <= zone.y + zone.h;

  return {
    gazeOnCamera: Math.abs(g.yawDeg - b.gazeYawDeg) <= cfg.gaze.maxYawDeg
      && Math.abs(g.pitchDeg - b.gazePitchDeg) <= cfg.gaze.maxPitchDeg,
    frown: delta('browDown') >= c.frownDelta,
    irritation: delta('browDown') >= c.irritationBrowDelta && delta('mouthPress') >= c.irritationPressDelta,
    skepticism: asym('browOuterUp') >= c.skepticismAsym || delta('eyeSquint') >= c.skepticismSquintDelta,
    surprise: deltaOne('browInnerUp') >= c.surpriseBrowDelta && deltaOne('jawOpen') >= c.surpriseJawDelta,
    smirk: asym('mouthSmile') >= c.smirkAsym && Math.max(v('mouthSmileLeft'), v('mouthSmileRight')) >= c.smirkMinSmile,
    cheer: Math.min(v('mouthSmileLeft'), v('mouthSmileRight')) >= c.cheerSmile,
    handNearFace: h.hands.some(hand => hand.some(inZone)),
  };
}
