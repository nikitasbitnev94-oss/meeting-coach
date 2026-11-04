import type { Config } from '../config/defaults';
import type { AsrWord } from '../types';
import { isHesitationWord } from './fillers';
import { hesitationProbability } from './hesitationModel';
import { FrameRing, MEL_BANDS, MelFeatures } from './spectrum';
import { rms } from './vad';

const MIN_HZ = 75;
const MAX_HZ = 400;
const WORD_MEMORY_MS = 60_000;

/** Высота тона кадра нормированной автокорреляцией: {hz, corr} или null. */
export function pitch(f: Float32Array, sampleRate: number): { hz: number; corr: number } | null {
  const minLag = Math.floor(sampleRate / MAX_HZ);
  const maxLag = Math.min(Math.ceil(sampleRate / MIN_HZ), f.length - 32);
  const corrs: number[] = [];
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let xy = 0, xx = 0, yy = 0;
    for (let i = 0; i + lag < f.length; i++) {
      xy += f[i] * f[i + lag]; xx += f[i] * f[i]; yy += f[i + lag] * f[i + lag];
    }
    const c = xx && yy ? xy / Math.sqrt(xx * yy) : 0;
    corrs.push(c);
    best = Math.max(best, c);
  }
  if (best <= 0) return null;
  // Первый пик не ниже 90% максимума — защита от выбора удвоенного периода.
  for (let i = 1; i < corrs.length - 1; i++) {
    if (corrs[i] >= 0.9 * best && corrs[i] >= corrs[i - 1] && corrs[i] >= corrs[i + 1]) {
      return { hz: sampleRate / (minLag + i), corr: corrs[i] };
    }
  }
  return null;
}

export interface Segment { start: number; end: number } // мс

/** Скользящая медиана громкости звонких кадров — «обычная громкость речи». */
class RollingMedian {
  private items: { t: number; v: number }[] = [];
  private sorted: number[] = [];
  constructor(private windowMs: number) {}
  add(t: number, v: number): void {
    this.items.push({ t, v });
    this.sorted.splice(lowerBound(this.sorted, v), 0, v);
  }
  prune(t: number): void {
    while (this.items.length && this.items[0].t <= t - this.windowMs) {
      const { v } = this.items.shift()!;
      this.sorted.splice(lowerBound(this.sorted, v), 1);
    }
  }
  value(fallback: number): number {
    return this.sorted.length ? this.sorted[this.sorted.length >> 1] : fallback;
  }
}

function lowerBound(a: number[], v: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; }
  return lo;
}

/**
 * Кандидат «э-э»: звонкий звук не тише половины обычной громкости речи, с ровным тоном,
 * дольше minRunMs. Отрезок отдаётся, когда серия закончилась. Слово это или нет, решает HesitationConfirmer.
 * Пороги подобраны по разметке пользователя.
 */
export class HesitationDetector {
  private runStart: number | null = null;
  private runEnd = 0;
  private p0 = 0;
  private ref: RollingMedian;

  constructor(private cfg: Config, private sampleRate: number) {
    this.ref = new RollingMedian(cfg.hesitation.refWindowMs);
  }

  push(frame: Float32Array, tMs: number): Segment | null {
    const r = rms(frame);
    const p = r >= this.cfg.hesitation.minRms ? pitch(frame, this.sampleRate) : null;
    return this.pushFeatures(r, p?.hz ?? 0, p?.corr ?? 0, tMs, (frame.length / this.sampleRate) * 1000);
  }

  /** То же по готовым признакам кадра — для подбора порогов на разметке. */
  pushFeatures(r: number, hz: number, corr: number, tMs: number, frameMs: number): Segment | null {
    const h = this.cfg.hesitation;
    this.ref.prune(tMs);
    const voiced = hz > 0 && corr >= h.minCorr && r >= h.minRms;
    const loud = r >= h.relRms * this.ref.value(0.05);
    if (voiced) this.ref.add(tMs, r);
    const ok = voiced && loud;

    let out: Segment | null = null;
    const continues = ok && this.runStart !== null && Math.abs(hz - this.p0) / this.p0 <= h.maxPitchDrift;
    if (this.runStart !== null && !continues) {
      if (this.runEnd - this.runStart >= h.minRunMs) out = { start: this.runStart, end: this.runEnd };
      this.runStart = null;
    }
    if (ok && this.runStart === null) {
      this.runStart = tMs;
      this.p0 = hz;
    }
    if (ok) this.runEnd = tMs + frameMs;
    return out;
  }
}

/**
 * Подтверждает кандидатов «э-э» по словам распознавателя: отрезок, на который не легло обычное слово.
 * Решение принимается, когда распознаватель выдал слова дальше конца отрезка.
 */
export class HesitationConfirmer {
  private pending: Segment[] = [];
  private words: { start: number; end: number }[] = [];
  private lastWordEnd = -Infinity;

  constructor(private cfg: Config) {}

  add(s: Segment): void { this.pending.push(s); }

  /** Слова финального результата; offsetMs — момент начала аудиопотока. Возвращает подтверждённые отрезки. */
  onWords(ws: AsrWord[], offsetMs: number): Segment[] {
    for (const w of ws) {
      const start = offsetMs + w.start * 1000, end = offsetMs + w.end * 1000;
      this.lastWordEnd = Math.max(this.lastWordEnd, end);
      if (!isHesitationWord(w.word)) this.words.push({ start, end });
    }
    while (this.words.length && this.words[0].end < this.lastWordEnd - WORD_MEMORY_MS) this.words.shift();
    const ready = this.pending.filter(s => s.end <= this.lastWordEnd);
    this.pending = this.pending.filter(s => s.end > this.lastWordEnd);
    return ready.map(s => this.freePart(s)).filter((s): s is Segment => s !== null);
  }

  /** Конец встречи: оставшиеся отрезки проверяются по уже известным словам. */
  flush(): Segment[] {
    const out = this.pending.map(s => this.freePart(s)).filter((s): s is Segment => s !== null);
    this.pending = [];
    return out;
  }

  /** Самая длинная часть отрезка, на которую не легло обычное слово; null, если она короче minRunMs. */
  private freePart(s: Segment): Segment | null {
    const { wordMarginMs: m, minRunMs } = this.cfg.hesitation;
    let parts: Segment[] = [s];
    for (const w of this.words) {
      const ws = w.start + m, we = w.end - m;
      if (we <= ws) continue;
      parts = parts.flatMap(p => {
        if (we <= p.start || ws >= p.end) return [p];
        const out: Segment[] = [];
        if (ws > p.start) out.push({ start: p.start, end: ws });
        if (we < p.end) out.push({ start: we, end: p.end });
        return out;
      });
    }
    const best = parts.reduce<Segment | null>((b, p) => (!b || p.end - p.start > b.end - b.start ? p : b), null);
    return best && best.end - best.start >= minRunMs ? { start: Math.round(best.start), end: Math.round(best.end) } : null;
  }
}

/**
 * Полный путь «э-э»: звонкий отрезок → тембр похож на «э» (вероятность ≥ minProb) → на него не легло слово.
 * Спектр считается каждый кадр и хранится ~8 с, чтобы оценить отрезок, когда он закончился.
 */
export class HesitationPipeline {
  private det: HesitationDetector;
  private conf: HesitationConfirmer;
  private mel: MelFeatures;
  private ring = new FrameRing(400, MEL_BANDS);

  constructor(
    private cfg: Config,
    private sampleRate: number,
    private prob: (melFlat: number[], bands: number, durMs: number) => number = hesitationProbability,
  ) {
    this.det = new HesitationDetector(cfg, sampleRate);
    this.conf = new HesitationConfirmer(cfg);
    this.mel = new MelFeatures(sampleRate);
  }

  push(frame: Float32Array, tMs: number): void {
    const r = rms(frame);
    const p = r >= this.cfg.hesitation.minRms ? pitch(frame, this.sampleRate) : null;
    this.ring.push(tMs, this.mel.frame(frame));
    const seg = this.det.pushFeatures(r, p?.hz ?? 0, p?.corr ?? 0, tMs, (frame.length / this.sampleRate) * 1000);
    if (seg && this.prob(this.ring.slice(seg.start, seg.end), MEL_BANDS, seg.end - seg.start) >= this.cfg.hesitation.minProb) {
      this.conf.add(seg);
    }
  }

  onWords(ws: AsrWord[], offsetMs: number): Segment[] { return this.conf.onWords(ws, offsetMs); }
  flush(): Segment[] { return this.conf.flush(); }
}
