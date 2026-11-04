import { ExpressionRecorder, EXPRESSION_STEPS } from '../../src/diag/expressions';

test('шаги: спокойное лицо в начале и в конце, все выражения из спеки', () => {
  const ids = EXPRESSION_STEPS.map(s => s.id);
  expect(ids[0]).toBe('neutral');
  expect(ids).toEqual(expect.arrayContaining(['smile', 'laugh', 'smirk', 'frown', 'irritation', 'skepticism', 'surprise', 'talk']));
  expect(EXPRESSION_STEPS.every(s => s.text && s.ms >= 3000)).toBe(true);
});

test('экспорт: ключи по алфавиту, строка — шаг, время, значения, сработавшие сигналы', () => {
  const r = new ExpressionRecorder();
  r.frame('neutral', 0, { b: 0.2, a: 0.1 }, []);
  r.frame('smile', 100, { a: 0.5, b: 0.123456 }, ['cheer']);
  r.frame('smile', 200, null, []);
  expect(r.export()).toEqual({
    version: 1,
    keys: ['a', 'b'],
    rows: [['neutral', 0, 0.1, 0.2, ''], ['smile', 100, 0.5, 0.1235, 'cheer'], ['smile', 200, null, null, '']],
  });
});
