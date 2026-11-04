// Проверка правил мимики на записи с диагностики. Запуск:
//   MIMIC_DATA=/путь/mimika.json npx vitest run tests/vision/mimic.eval.test.ts
import { readFileSync } from 'node:fs';
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import { computeFrameSignals } from '../../src/vision/signals';
import type { Baseline, FrameSignals } from '../../src/types';

const path = process.env.MIMIC_DATA;
const B: Baseline = { blendshapes: {}, gazeYawDeg: 0, gazePitchDeg: 0, activityNorm: 0, createdAt: '' };

test.skipIf(!path)('правила мимики на записи пользователя', () => {
  const d = JSON.parse(readFileSync(path!, 'utf8'));
  const share: Record<string, Record<string, number>> = {};
  const counts: Record<string, number> = {};
  for (const r of d.rows) {
    if (r[2] === null) continue;
    const bs: Record<string, number> = {};
    d.keys.forEach((k: string, i: number) => { bs[k] = r[i + 2]; });
    const s = computeFrameSignals({ blendshapes: bs, headYawDeg: 0, headPitchDeg: 0, eyeYaw: 0, eyePitch: 0, box: { x: 0, y: 0, w: 1, h: 1 } },
      { hands: [] }, B, DEFAULT_CONFIG);
    counts[r[0]] = (counts[r[0]] ?? 0) + 1;
    share[r[0]] ??= {};
    for (const k of ['frown', 'irritation', 'skepticism', 'cheer', 'surprise'] as (keyof FrameSignals)[]) {
      share[r[0]][k] = (share[r[0]][k] ?? 0) + (s[k] ? 1 : 0);
    }
  }
  const pct = (step: string, k: string) => share[step][k] / counts[step];
  console.table(Object.fromEntries(Object.keys(share).map(st => [st, Object.fromEntries(Object.keys(share[st]).map(k => [k, Math.round(pct(st, k) * 100)]))])));
  for (const [step, rule] of [['frown', 'frown'], ['irritation', 'irritation'], ['skepticism', 'skepticism'], ['laugh', 'cheer'], ['surprise', 'surprise']]) {
    expect(pct(step, rule)).toBeGreaterThanOrEqual(0.5);
  }
  for (const step of ['neutral', 'neutral2', 'talk']) {
    for (const rule of ['frown', 'irritation', 'skepticism', 'cheer', 'surprise']) expect(pct(step, rule)).toBeLessThanOrEqual(0.1);
  }
});
