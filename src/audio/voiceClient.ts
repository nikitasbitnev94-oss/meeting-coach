import VoiceWorker from './voice.worker.ts?worker';

export interface VoiceEmbedder {
  /** Отпечаток голоса по сигналу 16 кГц; null — звук слишком короткий или ошибка. */
  embed(samples: Float32Array): Promise<Float32Array | null>;
  /** Среднее время расчёта одного отпечатка, мс — для диагностики нагрузки. */
  avgMs(): number;
  close(): void;
}

/** Загружает модель голоса в фоновом потоке. Отказ — если модель не загрузилась за timeoutMs. */
export function createVoiceEmbedder(base: string, timeoutMs = 120_000): Promise<VoiceEmbedder> {
  const w = new VoiceWorker();
  const waiting = new Map<number, (e: Float32Array | null) => void>();
  let nextId = 1, totalMs = 0, count = 0;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { w.terminate(); reject(new Error('Модель голоса: таймаут загрузки')); }, timeoutMs);
    w.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === 'ready') {
        clearTimeout(timer);
        resolve({
          embed(samples) {
            const id = nextId++;
            return new Promise(r => { waiting.set(id, r); w.postMessage({ type: 'embed', id, samples }, [samples.buffer]); });
          },
          avgMs: () => (count ? totalMs / count : 0),
          close() { w.terminate(); waiting.forEach(r => r(null)); waiting.clear(); },
        });
      } else if (m.type === 'error') {
        clearTimeout(timer); w.terminate(); reject(new Error(m.error));
      } else if (m.type === 'emb') {
        if (m.error) console.error(m.error);
        if (m.ms) { totalMs += m.ms; count++; }
        waiting.get(m.id)?.(m.emb);
        waiting.delete(m.id);
      }
    };
    w.onerror = e => { clearTimeout(timer); reject(new Error(e.message || 'Модель голоса не загрузилась')); };
    w.postMessage({ type: 'init', modelUrl: base + 'models/voice.onnx', ortBase: base + 'ort/' });
  });
}
