import { Vad } from '../../src/audio/vad';
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import { tone } from '../helpers/audio';

test('тишина и речь', () => {
  const v = new Vad(DEFAULT_CONFIG);
  expect(v.push(tone(0.001), 0)).toBe(false);
  expect(v.push(tone(0.1), 20)).toBe(true);
});
test('задержка отпускания 700 мс', () => {
  const v = new Vad(DEFAULT_CONFIG); v.push(tone(0.1), 0);
  expect(v.push(tone(0.001), 600)).toBe(true);
  expect(v.push(tone(0.001), 720)).toBe(false);
});
test('шумный фон поднимает порог', () => {
  const v = new Vad(DEFAULT_CONFIG);
  for (let t = 0; t < 60000; t += 20) v.push(tone(0.02), t);   // ровный шум 0.02 долго
  expect(v.push(tone(0.03), 60000)).toBe(false);               // чуть громче шума — не речь
});
