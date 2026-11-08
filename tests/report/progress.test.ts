import { progress, meetingMetrics } from '../../src/report/progress';
import type { CoachEvent, Meeting } from '../../src/types';

const ev = (type: any, word?: string): CoachEvent => ({ type, tMs: 0, durationMs: 1000, word });
const m = (i: number, over: Partial<Meeting> = {}): Meeting => ({
  id: String(i), title: '', startedAt: `2026-11-0${i}T10:00:00Z`, durationMs: 20 * 60000,
  speakingMs: 10 * 60000, speakingWithFaceMs: 10 * 60000, onCameraMs: 8 * 60000, cameraOnMs: 20 * 60000, events: [], ...over,
});

test('метрики встречи: паразиты и «э-э» в минуту речи, мимика и руки на 10 минут с камерой', () => {
  const x = meetingMetrics(m(1, { events: [ev('filler', 'ну'), ev('filler', 'ну'), ev('filler', 'э-э'), ev('frown'), ev('cheer'), ev('hands'), ev('gaze')] }));
  expect(x).toEqual({ fillersPerMin: 0.2, hesitationsPerMin: 0.1, gazeShare: 0.8, facePer10: 1, handsPer10: 0.5 });
});
test('камера выключена всю встречу — мимика и руки не считаются', () => {
  const x = meetingMetrics(m(1, { cameraOnMs: 0, events: [ev('frown')] }));
  expect(x.facePer10).toBeNull(); expect(x.handsPer10).toBeNull();
});
test('старые встречи без cameraOnMs — берётся длительность', () => {
  const old = m(1, { events: [ev('hands')] }); delete (old as any).cameraOnMs;
  expect(meetingMetrics(old).handsPer10).toBe(0.5);
});
test('прогресс: среднее последних 3 против первых 3, короткие встречи не учитываются', () => {
  const ms = [1, 2, 3, 4, 5, 6].map(i => m(i, { events: Array.from({ length: 7 - i }, () => ev('filler', 'ну')) }));
  ms.push(m(7, { durationMs: 3 * 60000, events: Array.from({ length: 50 }, () => ev('filler', 'ну')) }));
  const p = progress(ms);
  const f = p.find(r => r.key === 'fillersPerMin')!;
  expect(f.series).toHaveLength(6);
  expect(f.first).toBeCloseTo(0.5); expect(f.last).toBeCloseTo(0.2);
  expect(f.changePct).toBeCloseTo(-60);
  expect(f.better).toBe(true);
});
test('для взгляда рост — улучшение', () => {
  const ms = [1, 2].map(i => m(i, { onCameraMs: i * 4 * 60000 }));
  const g = progress(ms).find(r => r.key === 'gazeShare')!;
  expect(g.changePct).toBeCloseTo(100); expect(g.better).toBe(true);
});
test('одна встреча — без изменения', () => {
  expect(progress([m(1)]).every(r => r.changePct === null)).toBe(true);
});
test('порядок встреч — по дате, независимо от входа', () => {
  const ms = [m(2, { events: [ev('filler', 'ну')] }), m(1, { events: [ev('filler', 'ну'), ev('filler', 'ну')] })];
  expect(progress(ms).find(r => r.key === 'fillersPerMin')!.series).toEqual([0.2, 0.1]);
});

import { sparkPoints, formatChange } from '../../src/report/progress';
test('точки мини-графика: слева направо, большее значение — выше', () => {
  expect(sparkPoints([1, 3, 2], 100, 20)).toBe('0,20 50,0 100,10');
  expect(sparkPoints([5], 100, 20)).toBe('50,10');
  expect(sparkPoints([2, 2], 100, 20)).toBe('0,10 100,10');
});
test('изменение: знак и проценты', () => {
  expect(formatChange(-35.4)).toBe('−35%');
  expect(formatChange(12.6)).toBe('+13%');
  expect(formatChange(null)).toBe('—');
});
