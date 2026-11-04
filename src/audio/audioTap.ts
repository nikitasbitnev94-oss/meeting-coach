import workletUrl from './capture-worklet.ts?worker&url';
import { Framer } from './framer';

export interface AudioTap {
  sampleRate: number;
  /** Кадр 20 мс. tMs — performance.now() главного окна при получении. */
  onFrame(cb: (f: Float32Array, tMs: number) => void): void;
  /** Пачка для распознавания, 240 мс. */
  onBatch(cb: (b: AudioBuffer) => void): void;
  stop(): void;
}

const BATCH_FRAMES = 12;

export async function startAudioTap(stream: MediaStream): Promise<AudioTap> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  await ctx.audioWorklet.addModule(workletUrl);
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'capture-processor', { numberOfInputs: 1, numberOfOutputs: 0 });
  src.connect(node);
  if (ctx.state === 'suspended') await ctx.resume();

  const frameCbs: ((f: Float32Array, t: number) => void)[] = [];
  const batchCbs: ((b: AudioBuffer) => void)[] = [];
  const frameLen = Math.round(ctx.sampleRate * 0.02);
  const batcher = new Framer(frameLen * BATCH_FRAMES);

  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const t = performance.now();
    const f = e.data;
    frameCbs.forEach(cb => cb(f, t));
    if (!batchCbs.length) return;
    for (const chunk of batcher.push(f)) {
      const buf = ctx.createBuffer(1, chunk.length, ctx.sampleRate);
      buf.copyToChannel(chunk as Float32Array<ArrayBuffer>, 0);
      batchCbs.forEach(cb => cb(buf));
    }
  };

  return {
    sampleRate: ctx.sampleRate,
    onFrame: cb => { frameCbs.push(cb); },
    onBatch: cb => { batchCbs.push(cb); },
    stop: () => {
      node.port.onmessage = null;
      src.disconnect();
      void ctx.close();
    },
  };
}
