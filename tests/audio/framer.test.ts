import { Framer } from '../../src/audio/framer';

test('режет поток блоков по 128 на кадры по 320', () => {
  const f = new Framer(320);
  const out: Float32Array[] = [];
  for (let i = 0; i < 10; i++) out.push(...f.push(new Float32Array(128).fill(i)));
  expect(out).toHaveLength(4);                 // 1280 / 320
  expect(out[0][0]).toBe(0); expect(out[0][319]).toBe(2);   // 128+128+64
  expect(out[3][319]).toBe(9);
});
test('кадры — независимые копии', () => {
  const f = new Framer(2);
  const [a, b] = f.push(new Float32Array([1, 2, 3, 4]));
  expect(Array.from(a)).toEqual([1, 2]); expect(Array.from(b)).toEqual([3, 4]);
});
