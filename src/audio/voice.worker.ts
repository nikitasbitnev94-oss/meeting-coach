/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
import { embedWith } from './voiceEmbed';

/** Фоновый поток: отпечаток голоса считается здесь, чтобы не тормозить анализ лица на странице. */
type In = { type: 'init'; modelUrl: string; ortBase: string } | { type: 'embed'; id: number; samples: Float32Array };

let session: Promise<ort.InferenceSession> | null = null;

self.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  if (m.type === 'init') {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = m.ortBase;
    session = ort.InferenceSession.create(m.modelUrl);
    try { await session; postMessage({ type: 'ready' }); } catch (err) { postMessage({ type: 'error', error: String(err) }); }
    return;
  }
  try {
    const s = await session!;
    const t = performance.now();
    const emb = await embedWith(ort, s, m.samples);
    postMessage({ type: 'emb', id: m.id, emb, ms: performance.now() - t });
  } catch (err) {
    postMessage({ type: 'emb', id: m.id, emb: null, ms: 0, error: String(err) });
  }
};
