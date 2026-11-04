// Оценка детектора «э-э» на файле разметки с диагностики. Запуск:
//   EEE_DATA=/путь/razmetka-ee.json npx vitest run tests/audio/hesitation.eval.test.ts
// Сам файл разметки в репозиторий не кладётся.
import { readFileSync } from 'node:fs';
import { HesitationConfirmer, HesitationDetector, type Segment } from '../../src/audio/hesitation';
import { DEFAULT_CONFIG } from '../../src/config/defaults';

const path = process.env.EEE_DATA;

test.skipIf(!path)('детектор «э-э» на разметке пользователя', () => {
  const d = JSON.parse(readFileSync(path!, 'utf8'));
  const det = new HesitationDetector(DEFAULT_CONFIG, d.sampleRate);
  const conf = new HesitationConfirmer(DEFAULT_CONFIG);
  const found: Segment[] = [];
  const words: [number, number, number][] = d.words;
  let wi = 0;
  const n = d.frames.length / 3;
  for (let i = 0; i < n; i++) {
    const t = i * d.frameMs;
    const seg = det.pushFeatures(d.frames[3 * i], d.frames[3 * i + 1], d.frames[3 * i + 2], t, d.frameMs);
    if (seg) conf.add(seg);
    // слова «приходят» пачкой, когда звук дошёл до их конца + 1 с (как финальный результат)
    const batch = [];
    while (wi < words.length && words[wi][1] + 1000 <= t) {
      const [s, e, f] = words[wi++];
      batch.push({ word: f === 2 ? 'ээ' : 'слово', start: s / 1000, end: e / 1000 });
    }
    if (batch.length) found.push(...conf.onWords(batch, 0));
  }
  found.push(...conf.flush());
  const labels: number[] = [...d.labels].sort((a, b) => a - b);
  const used = new Set<number>();
  let tp = 0;
  for (const l of labels) {
    const k = found.findIndex((s, j) => !used.has(j) && l - 1500 <= s.end && s.end <= l + 300);
    if (k >= 0) { used.add(k); tp++; }
  }
  const fp = found.length - tp, fn = labels.length - tp;
  const p = tp / Math.max(1, found.length), r = tp / labels.length;
  console.log(`«э-э»: найдено ${found.length}, попаданий ${tp}, лишних ${fp}, пропусков ${fn}, точность ${p.toFixed(2)}, полнота ${r.toFixed(2)}, F1 ${(2 * p * r / (p + r)).toFixed(2)}`);
  expect(r).toBeGreaterThanOrEqual(0.66);
});
