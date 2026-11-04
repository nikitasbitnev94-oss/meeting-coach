import { everyMs } from '../../src/vision/loop';

test('пропускает вызовы чаще интервала', () => {
  const due = everyMs(100);
  expect([0, 16, 99, 100, 150, 216].map(t => due(t))).toEqual([true, false, false, true, false, true]);
});

import { RateMeter } from '../../src/vision/loop';

test('частота и среднее время за последнюю секунду', () => {
  const m = new RateMeter();
  for (let t = 0; t <= 2000; t += 100) m.add(t, 8);
  expect(m.perSecond(2000)).toBe(10);
  expect(m.avgMs(2000)).toBe(8);
  expect(m.perSecond(5000)).toBe(0);
});

test('everyMs держит 10 к/с при кадрах 30 Гц', () => {
  const due = everyMs(100);
  let n = 0;
  for (let i = 0; i < 300; i++) if (due(i * 33.3)) n++;   // ~10 с
  expect(n).toBeGreaterThanOrEqual(95);
});

import { startIntervalLoop } from '../../src/vision/loop';
test('запасной цикл на таймере вызывает tick и останавливается', async () => {
  vi.useFakeTimers();
  const ticks: number[] = [];
  const stop = startIntervalLoop(t => ticks.push(t), 100);
  await vi.advanceTimersByTimeAsync(350);
  stop();
  await vi.advanceTimersByTimeAsync(500);
  expect(ticks).toHaveLength(3);
  vi.useRealTimers();
});
