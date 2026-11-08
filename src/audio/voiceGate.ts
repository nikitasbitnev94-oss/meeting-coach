import type { Config } from '../config/defaults';
import { cosine } from './voiceEmbed';

export interface VoiceVerdict { start: number; end: number; score: number; own: boolean }
export type VoiceSide = 'own' | 'foreign';

const SR = 16000;
const HISTORY_MS = 60_000;

/**
 * Свой или чужой голос: звук фразы сравнивается с голосовым профилем пользователя.
 * Копит звук, пока VAD слышит речь; каждые hopMs речи считает отпечаток последних windowMs.
 * Пауза дольше runGapMs начинает новую фразу: следующий говорящий не смешивается с прежним.
 * Одновременно считается не больше одного отпечатка — нагрузка ограничена.
 */
export class VoiceGate {
  private run: { t: number; f: Float32Array }[] = [];
  private lastVoiceT = -Infinity;
  private sinceLastMs = 0;
  private coveredTo = -Infinity;
  private busy = false;
  private history: VoiceVerdict[] = [];
  private total = { checked: 0, foreign: 0 };
  /** Каждое решение — для записи на странице диагностики. */
  onVerdict: ((v: VoiceVerdict) => void) | null = null;

  constructor(
    private cfg: Config,
    private embed: (samples: Float32Array) => Promise<Float32Array | null>,
    private profile: ArrayLike<number>,
  ) {}

  push(frame: Float32Array, tMs: number, vad: boolean): void {
    const v = this.cfg.voice;
    if (!vad) {
      if (this.run.length && tMs - this.lastVoiceT > v.runGapMs) this.endRun();
      return;
    }
    this.lastVoiceT = tMs;
    this.run.push({ t: tMs, f: frame });
    this.sinceLastMs += (frame.length / SR) * 1000;
    // В фразе храним не больше окна: старый звук для отпечатка не нужен.
    while (this.runMs() > v.windowMs) this.run.shift();
    if (this.sinceLastMs >= v.hopMs && this.runMs() >= v.minMs) this.measure();
  }

  /** Решение по последнему отрезку речи, если он закончился не раньше recentMs назад. */
  recent(tMs: number): VoiceSide | null {
    const last = this.history[this.history.length - 1];
    if (!last || tMs - last.end > this.cfg.voice.recentMs) return null;
    return last.own ? 'own' : 'foreign';
  }

  /** Решение по отрезкам, пересекающим [from, to]: средняя оценка против порога; null — отрезков нет. */
  over(fromMs: number, toMs: number): VoiceSide | null {
    const xs = this.history.filter(h => h.end > fromMs && h.start < toMs);
    if (!xs.length) return null;
    const mean = xs.reduce((s, h) => s + h.score, 0) / xs.length;
    return mean >= this.cfg.voice.threshold ? 'own' : 'foreign';
  }

  /** Решения за последнюю минуту. */
  verdicts(): readonly VoiceVerdict[] { return this.history; }

  /** Счётчики за всё время. */
  totals(): { checked: number; foreign: number } { return { ...this.total }; }

  private runMs(): number { return this.run.reduce((s, x) => s + (x.f.length / SR) * 1000, 0); }

  /** Конец фразы: непроверенный хвост от tailMinMs проверяется вместе с началом фразы (до windowMs). */
  private endRun(): void {
    const tail = this.run.filter(x => x.t >= this.coveredTo);
    const tailMs = tail.reduce((s, x) => s + (x.f.length / SR) * 1000, 0);
    if (tailMs >= this.cfg.voice.tailMinMs) this.measure(true);
    this.run = [];
    this.sinceLastMs = 0;
  }

  private measure(force = false): void {
    if (this.busy && !force) return;
    const frames = this.run.slice();
    if (!frames.length) return;
    this.sinceLastMs = 0;
    const start = frames[0].t;
    const last = frames[frames.length - 1];
    const end = last.t + (last.f.length / SR) * 1000;
    this.coveredTo = end;
    const samples = new Float32Array(frames.reduce((s, x) => s + x.f.length, 0));
    let o = 0;
    for (const x of frames) { samples.set(x.f, o); o += x.f.length; }
    this.busy = true;
    void this.embed(samples).then(e => {
      this.busy = false;
      if (!e) return;
      const score = cosine(e, this.profile);
      const own = score >= this.cfg.voice.threshold;
      const v = { start, end, score, own };
      this.history.push(v);
      this.onVerdict?.(v);
      this.total.checked++;
      if (!own) this.total.foreign++;
      this.history.sort((a, b) => a.end - b.end);
      while (this.history.length && this.history[0].end < end - HISTORY_MS) this.history.shift();
    }, () => { this.busy = false; });
  }
}
