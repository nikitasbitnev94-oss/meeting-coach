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
  const rows = d.rows.filter((r: any[]) => r[2] !== null);
  const bsOf = (r: any[]) => { const bs: Record<string, number> = {}; d.keys.forEach((k: string, i: number) => { bs[k] = r[i + 2]; }); return bs; };
  // «спокойный уровень» бровей, как на встрече: медиана спокойного лица и речи
  const calm = rows.filter((r: any[]) => ['neutral', 'neutral2', 'talk'].includes(r[0]))
    .map((r: any[]) => { const b = bsOf(r); return (b.browDownLeft + b.browDownRight) / 2; }).sort((a: number, b: number) => a - b);
  const level = calm[calm.length >> 1];
  for (const r of rows) {
    const bs = bsOf(r);
    const s = computeFrameSignals({ blendshapes: bs, headYawDeg: 0, headPitchDeg: 0, eyeYaw: 0, eyePitch: 0, box: { x: 0, y: 0, w: 1, h: 1 } },
      { hands: [] }, B, DEFAULT_CONFIG, level);
    counts[r[0]] = (counts[r[0]] ?? 0) + 1;
    share[r[0]] ??= {};
    for (const k of ['frown', 'irritation', 'skepticism', 'cheer', 'surprise', 'lipBite'] as (keyof FrameSignals)[]) {
      share[r[0]][k] = (share[r[0]][k] ?? 0) + (s[k] ? 1 : 0);
    }
  }
  const pct = (step: string, k: string) => share[step][k] / counts[step];
  console.table(Object.fromEntries(Object.keys(share).map(st => [st, Object.fromEntries(Object.keys(share[st]).map(k => [k, Math.round(pct(st, k) * 100)]))])));
  // хмурость и раздражение у пользователя похожи: достаточно, чтобы сработало одно из двух
  expect(Math.max(pct('frown', 'frown'), pct('frown', 'irritation'))).toBeGreaterThanOrEqual(0.4);
  expect(Math.max(pct('irritation', 'frown'), pct('irritation', 'irritation'))).toBeGreaterThanOrEqual(0.4);
  for (const [step, rule] of [['laugh', 'cheer'], ['surprise', 'surprise']]) expect(pct(step, rule)).toBeGreaterThanOrEqual(0.5);
  // разрозненные кадры: подсказке нужно 1,5–3 с подряд
  for (const step of ['neutral', 'neutral2', 'talk']) {
    for (const rule of ['frown', 'irritation', 'skepticism', 'cheer', 'surprise', 'lipBite']) expect(pct(step, rule)).toBeLessThanOrEqual(0.15);
  }
});
