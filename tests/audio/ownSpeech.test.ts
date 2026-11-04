import { OwnSpeech } from '../../src/audio/ownSpeech';
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import { face } from '../helpers/face';

const talk = (o: OwnSpeech, from: number, to: number) => {
  for (let t = from, i = 0; t <= to; t += 100, i++) o.mouth(face({ jawOpen: i % 2 ? 0.3 : 0.05 }), t);
};
const still = (o: OwnSpeech, from: number, to: number) => {
  for (let t = from; t <= to; t += 100) o.mouth(face({ jawOpen: 0.02 }), t);
};

test('звук есть и рот двигается — говорит пользователь', () => {
  const o = new OwnSpeech(DEFAULT_CONFIG);
  talk(o, 0, 1000);
  expect(o.update(true, 1000)).toBe(true);
});
test('звук есть, рот неподвижен — говорит кто-то другой', () => {
  const o = new OwnSpeech(DEFAULT_CONFIG);
  still(o, 0, 1000);
  expect(o.update(true, 1000)).toBe(false);
});
test('нет звука — не говорит', () => {
  const o = new OwnSpeech(DEFAULT_CONFIG);
  talk(o, 0, 1000);
  expect(o.update(false, 1000)).toBe(false);
});
test('лица не видно — решает только звук', () => {
  const o = new OwnSpeech(DEFAULT_CONFIG);
  talk(o, 0, 1000);
  o.mouth(null, 1100); o.mouth(null, 2500);
  expect(o.update(true, 2500)).toBe(true);
});
test('история: был ли пользователь в интервале и когда говорил последний раз', () => {
  const o = new OwnSpeech(DEFAULT_CONFIG);
  talk(o, 0, 1000); o.update(true, 1000);
  still(o, 1100, 5000); o.update(true, 5000);
  expect(o.ownWithin(800, 1200)).toBe(true);
  expect(o.ownWithin(3000, 5000)).toBe(false);
  expect(o.lastOwn()).toBe(1000);
});
test('история ограничена минутой', () => {
  const o = new OwnSpeech(DEFAULT_CONFIG);
  for (let t = 0; t < 600000; t += 100) { o.mouth(face({ jawOpen: 0.02 }), t); o.update(true, t); }
  expect((o as any).history.length).toBeLessThanOrEqual(601);
});
