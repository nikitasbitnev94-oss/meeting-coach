// AudioWorkletProcessor: режет вход микрофона на кадры по 20 мс и шлёт в главный поток.
import { Framer } from './framer';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

class CaptureProcessor extends AudioWorkletProcessor {
  private framer = new Framer(Math.round(sampleRate * 0.02));
  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0]?.[0];
    if (ch) for (const f of this.framer.push(ch)) this.port.postMessage(f, [f.buffer]);
    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
