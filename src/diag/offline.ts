import { createAsr } from '../audio/asr';
import { HesitationConfirmer, HesitationDetector, pitch } from '../audio/hesitation';
import { MelFeatures } from '../audio/spectrum';
import { rms } from '../audio/vad';
import { appBase } from '../capture/video';
import type { Config } from '../config/defaults';
import { SpectrumRecorder, type SpectrumExport } from './labeling';

const SR = 16000;
const FRAME = 320;
const BATCH_FRAMES = 12;
const IDLE_MS = 15000;

/** Декодирует звук файла и переводит в моно 16 кГц без проигрывания. */
export async function decodeTo16k(file: File): Promise<Float32Array> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  void ctx.close();
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * SR), SR);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

/** Прогоняет запись через детектор «э-э» и распознавание быстрее реального времени, собирает спектр кандидатов. */
export async function spectrumExport(file: File, cfg: Config, progress: (text: string) => void): Promise<SpectrumExport> {
  progress('Декодирую звук…');
  const samples = await decodeTo16k(file);
  progress('Загружаю модель распознавания…');
  const asr = await createAsr(appBase() + 'models/vosk-ru.tar.gz', SR, { ...cfg.asr, flushTimeoutMs: 600000 });
  const rec = new SpectrumRecorder(cfg.fillers, SR);
  const det = new HesitationDetector(cfg, SR);
  const conf = new HesitationConfirmer(cfg);
  const mel = new MelFeatures(SR);
  let processed = 0, lastProgress = performance.now();
  const tick = () => { processed++; lastProgress = performance.now(); };
  asr.onPartial(tick);
  asr.onFinal(ws => {
    tick();
    rec.words(ws, 0);
    conf.onWords(ws, 0).forEach(s => rec.confirmed(s));
  });

  const frames = Math.floor(samples.length / FRAME);
  let fed = 0;
  for (let i = 0; i < frames; i++) {
    const f = samples.subarray(i * FRAME, (i + 1) * FRAME);
    const t = i * 20;
    const r = rms(f);
    const p = r >= cfg.hesitation.minRms ? pitch(f, SR) : null;
    rec.frame(t, r, p?.hz ?? 0, p?.corr ?? 0, mel.frame(f));
    const seg = det.pushFeatures(r, p?.hz ?? 0, p?.corr ?? 0, t, 20);
    if (seg) { rec.candidate(seg); conf.add(seg); }
    if ((i + 1) % BATCH_FRAMES === 0) {
      const chunk = samples.slice((i + 1 - BATCH_FRAMES) * FRAME, (i + 1) * FRAME);
      const buf = new AudioBuffer({ length: chunk.length, sampleRate: SR, numberOfChannels: 1 });
      buf.copyToChannel(chunk, 0);
      asr.accept(buf);
      fed++;
    }
    if (i % 500 === 0) {
      progress(`Анализ звука: ${Math.round((i / frames) * 100)}%`);
      await new Promise(res => setTimeout(res, 0));
    }
  }
  // распознаватель отвечает на каждую пачку; ждём, пока он догонит, или пока не затихнет
  lastProgress = performance.now();
  while (processed < fed && performance.now() - lastProgress < IDLE_MS) {
    progress(`Распознавание: ${Math.round((processed / Math.max(1, fed)) * 100)}%`);
    await new Promise(res => setTimeout(res, 500));
  }
  await asr.stop();
  conf.flush().forEach(s => rec.confirmed(s));
  return rec.export(frames * 20);
}
