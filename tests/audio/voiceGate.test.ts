import { VoiceGate } from '../../src/audio/voiceGate';
import { DEFAULT_CONFIG } from '../../src/config/defaults';

// Голос «зашит» в первый отсчёт кадра: 1 — пользователь, 2 — другой человек.
const ME = Float32Array.from([1, 0]), OTHER = Float32Array.from([0, 1]);
const fakeEmbed = async (s: Float32Array) => (s[0] === 1 ? ME : OTHER);
const frame = (who: 1 | 2) => { const f = new Float32Array(320); f[0] = who; return f; };
const flush = () => new Promise(r => setTimeout(r, 0));

async function speak(g: VoiceGate, who: 1 | 2, from: number, to: number) {
  for (let t = from; t < to; t += 20) { g.push(frame(who), t, true); await flush(); }
}
async function silence(g: VoiceGate, from: number, to: number) {
  for (let t = from; t < to; t += 20) { g.push(new Float32Array(320), t, false); await flush(); }
}

describe('VoiceGate', () => {
  it('свой голос — own, чужой — foreign', async () => {
    const g = new VoiceGate(DEFAULT_CONFIG, fakeEmbed, ME);
    await speak(g, 1, 0, 3000);
    expect(g.over(0, 3000)).toBe('own');
    expect(g.recent(3000)).toBe('own');
    await silence(g, 3000, 4500);
    await speak(g, 2, 4500, 7500);
    expect(g.over(4500, 7500)).toBe('foreign');
    expect(g.recent(7500)).toBe('foreign');
  });

  it('пока звука мало — решения нет', async () => {
    const g = new VoiceGate(DEFAULT_CONFIG, fakeEmbed, ME);
    await speak(g, 2, 0, 400);
    expect(g.recent(400)).toBeNull();
    expect(g.over(0, 400)).toBeNull();
  });

  it('короткая фраза получает решение после паузы', async () => {
    const g = new VoiceGate(DEFAULT_CONFIG, fakeEmbed, ME);
    await speak(g, 2, 0, 700);
    await silence(g, 700, 2000);
    expect(g.over(0, 700)).toBe('foreign');
  });

  it('старое решение не действует', async () => {
    const g = new VoiceGate(DEFAULT_CONFIG, fakeEmbed, ME);
    await speak(g, 2, 0, 3000);
    await silence(g, 3000, 10000);
    expect(g.recent(10000)).toBeNull();
  });

  it('новый говорящий после паузы не смешивается с прежним', async () => {
    const g = new VoiceGate(DEFAULT_CONFIG, fakeEmbed, ME);
    await speak(g, 2, 0, 3000);
    await silence(g, 3000, 4500);
    await speak(g, 1, 4500, 7500);
    expect(g.over(5500, 7500)).toBe('own');
  });

  it('оценки сходства копятся для диагностики', async () => {
    const g = new VoiceGate(DEFAULT_CONFIG, fakeEmbed, ME);
    await speak(g, 1, 0, 3000);
    expect(g.verdicts().length).toBeGreaterThan(0);
    expect(g.verdicts()[0].score).toBeCloseTo(1);
  });
});
