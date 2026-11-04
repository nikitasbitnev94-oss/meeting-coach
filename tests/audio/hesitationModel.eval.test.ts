// Совпадение вероятностей с обучением на Python. Запуск:
//   EEE_SPEC=spektr.json EEE_CHECK=check.json npx vitest run tests/audio/hesitationModel.eval.test.ts
import { readFileSync } from 'node:fs';
import { hesitationProbability } from '../../src/audio/hesitationModel';

const spec = process.env.EEE_SPEC, check = process.env.EEE_CHECK;
test.skipIf(!spec || !check)('вероятности совпадают с Python', () => {
  const s = JSON.parse(readFileSync(spec!, 'utf8'));
  const c: { start: number; end: number; p: number }[] = JSON.parse(readFileSync(check!, 'utf8'));
  for (const x of c) {
    const cand = s.candidates.find((k: any) => k.start === x.start && k.end === x.end);
    const a = (x.start - cand.melFrom) / 20, n = (x.end - x.start) / 20;
    const core = cand.mel.slice(a * 24, (a + n) * 24);
    expect(hesitationProbability(core, 24, x.end - x.start)).toBeCloseTo(x.p, 2);
  }
});
