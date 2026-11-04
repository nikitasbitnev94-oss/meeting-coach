import { HesitationConfirmer, HesitationDetector, type Segment } from '../../src/audio/hesitation';
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import { chirp, frames, noise, sine, SR } from '../helpers/audio';

const silence = (ms: number) => new Float32Array(Math.round(SR * ms / 1000));
const cat = (...xs: Float32Array[]) => { const o = new Float32Array(xs.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of xs) { o.set(x, i); i += x.length; } return o; };

function segments(sig: Float32Array): Segment[] {
  const d = new HesitationDetector(DEFAULT_CONFIG, SR);
  const out: Segment[] = [];
  frames(sig).forEach((f, i) => { const r = d.push(f, i * 20); if (r) out.push(r); });
  return out;
}

describe('поиск звонкого отрезка', () => {
  test('ровный тон 300 мс → отрезок 0–300', () => expect(segments(cat(sine(150, 300), silence(100)))).toEqual([{ start: 0, end: 300 }]));
  test('ровный тон 200 мс → нет', () => expect(segments(cat(sine(150, 200), silence(100)))).toEqual([]));
  test('тон плывёт 120→300 Гц → нет', () => expect(segments(cat(chirp(120, 300, 600), silence(100)))).toEqual([]));
  test('шум → нет', () => expect(segments(cat(noise(600), silence(100)))).toEqual([]));
  test('тихо относительно обычной речи → нет', () => {
    const s = segments(cat(sine(150, 2000), silence(200), sine(150, 400, 0.02), silence(100)));
    expect(s.filter(x => x.start >= 2000)).toEqual([]);
  });
  test('две серии с паузой → два отрезка', () => {
    expect(segments(cat(sine(150, 400), silence(200), sine(200, 400), silence(100)))).toHaveLength(2);
  });
});

describe('подтверждение по словам', () => {
  const w = (word: string, start: number, end: number) => ({ word, start, end }); // секунды
  test('между словами — подтверждается, когда распознавание прошло дальше', () => {
    const c = new HesitationConfirmer(DEFAULT_CONFIG);
    c.add({ start: 1500, end: 1800 });
    expect(c.onWords([w('мы', 1.0, 1.4)], 0)).toEqual([]);              // слова ещё не дошли до отрезка
    expect(c.onWords([w('сделали', 2.0, 2.5)], 0)).toEqual([{ start: 1500, end: 1800 }]);
  });
  test('внутри обычного слова — отбрасывается', () => {
    const c = new HesitationConfirmer(DEFAULT_CONFIG);
    c.add({ start: 1500, end: 1800 });
    expect(c.onWords([w('конечно', 1.4, 2.0)], 0)).toEqual([]);
    expect(c.flush()).toEqual([]);
  });
  test('слово задевает начало — подтверждается остаток, если он не короче 240 мс', () => {
    const c = new HesitationConfirmer(DEFAULT_CONFIG);
    c.add({ start: 1500, end: 2000 });
    expect(c.onWords([w('вот', 1.2, 1.66), w('да', 2.1, 2.3)], 0)).toEqual([{ start: 1600, end: 2000 }]);
  });
  test('слово задевает почти весь отрезок — остаток короче 240 мс, отбрасывается', () => {
    const c = new HesitationConfirmer(DEFAULT_CONFIG);
    c.add({ start: 1500, end: 2000 });
    expect(c.onWords([w('вот', 1.2, 1.86), w('да', 2.1, 2.3)], 0)).toEqual([]);
  });
  test('на слове-«ээ» — подтверждается', () => {
    const c = new HesitationConfirmer(DEFAULT_CONFIG);
    c.add({ start: 1500, end: 1800 });
    expect(c.onWords([w('ээ', 1.5, 1.8), w('да', 2.0, 2.2)], 0)).toEqual([{ start: 1500, end: 1800 }]);
  });
  test('касание краёв слова в пределах 60 мс не считается пересечением', () => {
    const c = new HesitationConfirmer(DEFAULT_CONFIG);
    c.add({ start: 1500, end: 1800 });
    expect(c.onWords([w('мы', 1.0, 1.55), w('да', 1.75, 2.2)], 0)).toEqual([{ start: 1500, end: 1800 }]);
  });
  test('время слов считается от начала аудиопотока', () => {
    const c = new HesitationConfirmer(DEFAULT_CONFIG);
    c.add({ start: 11500, end: 11800 });
    expect(c.onWords([w('конечно', 1.4, 2.0)], 10000)).toEqual([]);
  });
  test('в конце встречи оставшиеся отрезки без слов подтверждаются', () => {
    const c = new HesitationConfirmer(DEFAULT_CONFIG);
    c.onWords([w('итак', 1.0, 1.4)], 0);
    c.add({ start: 1500, end: 1800 });
    expect(c.flush()).toEqual([{ start: 1500, end: 1800 }]);
  });
  test('память слов ограничена', () => {
    const c = new HesitationConfirmer(DEFAULT_CONFIG);
    for (let i = 0; i < 20000; i++) c.onWords([w('слово', i * 0.5, i * 0.5 + 0.3)], 0);
    expect((c as any).words.length).toBeLessThanOrEqual(150);
  });
});
