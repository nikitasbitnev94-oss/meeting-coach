import { HesitationDetector } from '../../src/audio/hesitation';
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import { chirp, frames, noise, sine, SR } from '../helpers/audio';

function events(sig: Float32Array): number[] {
  const d = new HesitationDetector(DEFAULT_CONFIG, SR);
  const out: number[] = [];
  frames(sig).forEach((f, i) => { const r = d.push(f, i * 20); if (r !== null) out.push(r); });
  return out;
}

test('ровный тон 600 мс → одно событие', () => expect(events(sine(150, 600))).toEqual([0]));
test('ровный тон 300 мс → нет', () => expect(events(sine(150, 300))).toEqual([]));
test('тон плывёт 120→300 Гц → нет', () => expect(events(chirp(120, 300, 600))).toEqual([]));
test('шум → нет', () => expect(events(noise(600))).toEqual([]));
test('тихо → нет', () => expect(events(sine(150, 600, 0.005))).toEqual([]));
test('две серии с паузой → два события', () => {
  const sig = new Float32Array([...sine(150, 600), ...new Float32Array(SR * 0.2), ...sine(200, 600)]);
  expect(events(sig)).toHaveLength(2);
});
