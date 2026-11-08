import { readFileSync } from 'node:fs';
import { embedWith } from '../../src/audio/voiceEmbed';

// Сверка с Python-эталоном: SPK_MODEL=путь_к_onnx SPK_REF=путь_к_json npx vitest run tests/audio/voiceEmbed.eval.test.ts
const model = process.env.SPK_MODEL, ref = process.env.SPK_REF;

describe.skipIf(!model || !ref)('модель голоса в onnxruntime-web', () => {
  it('эмбеддинг совпадает с Python', async () => {
    const ort = await import('onnxruntime-web/wasm');
    ort.env.wasm.numThreads = 1;
    const s = await ort.InferenceSession.create(readFileSync(model!));
    const r = JSON.parse(readFileSync(ref!, 'utf8')) as { x: number[]; emb: number[] };
    const e = await embedWith(ort, s, Float32Array.from(r.x));
    const cos = e!.reduce((a, v, i) => a + v * r.emb[i], 0);
    console.log('cos с эталоном', cos.toFixed(4));
    expect(cos).toBeGreaterThan(0.99);
  });
});
