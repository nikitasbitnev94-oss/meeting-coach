// Проверка правила «рука у лица» на разметке рук с диагностики. Запуск:
//   HANDS_DATA=/путь/ruki.json npx vitest run tests/vision/hands.eval.test.ts
import { readFileSync } from 'node:fs';
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import { handNear } from '../../src/vision/signals';
import { HAND_STEPS } from '../../src/diag/hands';
import type { Box } from '../../src/types';

const path = process.env.HANDS_DATA;

test.skipIf(!path)('рука у лица на разметке пользователя', () => {
  const d = JSON.parse(readFileSync(path!, 'utf8'));
  let box: Box | null = null;
  const hit: Record<string, number[]> = {};
  for (const r of d.rows) {
    if (r.box) box = { x: r.box[0], y: r.box[1], w: r.box[2], h: r.box[3] };
    const hands = r.hands.map((h: any) => Array.from({ length: h.pts.length / 2 }, (_, i) => ({ x: h.pts[2 * i], y: h.pts[2 * i + 1] })));
    const fired = box !== null && handNear({ hands, scores: r.hands.map((h: any) => h.score) }, box, DEFAULT_CONFIG);
    (hit[r.step] ??= []).push(fired ? 1 : 0);
  }
  const pct = (s: string) => hit[s].reduce((a, b) => a + b, 0) / hit[s].length;
  console.table(Object.fromEntries(Object.keys(hit).map(s => [s, Math.round(pct(s) * 100)])));
  const touch = new Set<string>(HAND_STEPS.filter(s => s.touch).map(s => s.id));
  for (const s of ['away', 'away2', 'gesture', 'chest']) if (hit[s]) expect(pct(s)).toBeLessThanOrEqual(0.2);
  for (const s of Object.keys(hit)) if (touch.has(s) && !s.startsWith('hair')) expect(pct(s)).toBeGreaterThanOrEqual(0.6);
});
