import type { Config } from '../config/defaults';
import type { VoiceProfile } from '../types';
import { HesitationPipeline } from './hesitation';
import { hesitationShift } from './hesitationModel';
import { MEL_BANDS } from './spectrum';
import { Vad } from './vad';
import { unit } from './voiceEmbed';

export const VOICE_MODEL_ID = 'campplus-en-int8';
const SR = 16000;
const CHUNK = 2 * SR;

/**
 * Запись голосового профиля: пользователь читает текст вслух.
 * Речь (по VAD) режется на отрезки по 2 с, по каждому — отпечаток голоса; профиль — их среднее.
 * Попутно собираются отрезки-кандидаты «э-э» обычной речи: по ним подстраивается распознавание «э-э».
 */
export class VoiceEnroller {
  private vad: Vad;
  private hes: HesitationPipeline;
  private buf = new Float32Array(CHUNK);
  private fill = 0;
  private voicedMs = 0;
  private pending: Promise<void>[] = [];
  private embeddings: Float32Array[] = [];
  private candidates: { mel: number[]; durMs: number }[] = [];

  constructor(private cfg: Config, private embed: (s: Float32Array) => Promise<Float32Array | null>) {
    this.vad = new Vad(cfg);
    // Вероятность «э-э» здесь не нужна: все кандидаты чтения считаются обычной речью.
    this.hes = new HesitationPipeline(cfg, SR, () => 0);
    this.hes.onCandidate = (s, mel) => this.candidates.push({ mel, durMs: s.end - s.start });
  }

  push(frame: Float32Array, tMs: number): void {
    const speaking = this.vad.push(frame, tMs);
    this.hes.push(frame, tMs);
    if (!speaking) return;
    this.voicedMs += (frame.length / SR) * 1000;
    let o = 0;
    while (o < frame.length) {
      const n = Math.min(frame.length - o, CHUNK - this.fill);
      this.buf.set(frame.subarray(o, o + n), this.fill);
      this.fill += n; o += n;
      if (this.fill === CHUNK) {
        const chunk = this.buf;
        this.buf = new Float32Array(CHUNK);
        this.fill = 0;
        this.pending.push(this.embed(chunk).then(e => { if (e) this.embeddings.push(e); }, () => {}));
      }
    }
  }

  speechMs(): number { return this.voicedMs; }
  enough(): boolean { return this.voicedMs >= this.cfg.voice.enrollMs; }

  /** Профиль или null, если речи меньше enrollMs или отпечатки не посчитались. */
  async finish(): Promise<VoiceProfile | null> {
    await Promise.all(this.pending);
    if (!this.enough() || this.embeddings.length < 3) return null;
    const dim = this.embeddings[0].length;
    const mean = new Array(dim).fill(0);
    for (const e of this.embeddings) for (let i = 0; i < dim; i++) mean[i] += e[i] / this.embeddings.length;
    return {
      version: 1,
      model: VOICE_MODEL_ID,
      embedding: Array.from(unit(mean)),
      hesitationShift: hesitationShift(this.candidates, MEL_BANDS),
      createdAt: new Date().toISOString(),
      speechMs: Math.round(this.voicedMs),
    };
  }
}
