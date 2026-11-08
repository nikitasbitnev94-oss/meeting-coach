import { VoiceEnroller, VOICE_MODEL_ID } from '../../src/audio/voiceEnroll';
import { DEFAULT_CONFIG } from '../../src/config/defaults';

const SR = 16000;
// Слоги: 200 мс звука, 100 мс тишины — как речь; ровный звук без пауз детектор речи со временем принимает за фон.
const tone = (hz: number, t0: number) => Float32Array.from({ length: 320 }, (_, i) => (t0 % 300 < 200 ? 0.2 * Math.sin((2 * Math.PI * hz * (t0 * SR / 1000 + i)) / SR) : 0));
const flush = () => new Promise(r => setTimeout(r, 0));

describe('VoiceEnroller', () => {
  it('копит речь, считает отпечатки по 2 с и собирает профиль', async () => {
    let calls = 0;
    const e = new VoiceEnroller(DEFAULT_CONFIG, async s => { calls++; expect(s.length).toBe(32000); return Float32Array.from([0.6, 0.8]); });
    for (let t = 0; t < 21000; t += 20) { e.push(tone(150, t), t); if (t % 1000 === 0) await flush(); }
    expect(e.speechMs()).toBeGreaterThanOrEqual(20000);
    expect(e.enough()).toBe(true);
    const p = await e.finish();
    expect(calls).toBeGreaterThanOrEqual(10);
    expect(p!.model).toBe(VOICE_MODEL_ID);
    expect(p!.embedding[0]).toBeCloseTo(0.6);
    expect(p!.embedding[1]).toBeCloseTo(0.8);
    expect(p!.speechMs).toBeGreaterThanOrEqual(20000);
  });

  it('тишина не считается речью; мало речи — профиля нет', async () => {
    const e = new VoiceEnroller(DEFAULT_CONFIG, async () => Float32Array.from([1, 0]));
    for (let t = 0; t < 5000; t += 20) e.push(new Float32Array(320), t);
    for (let t = 5000; t < 8000; t += 20) e.push(tone(150, t), t);
    expect(e.speechMs()).toBeLessThan(4000);
    expect(e.enough()).toBe(false);
    expect(await e.finish()).toBeNull();
  });
});
