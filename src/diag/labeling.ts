import { findFillers, isHesitationWord, normalize } from '../audio/fillers';
import type { Segment } from '../audio/hesitation';
import { FrameRing, MEL_BANDS } from '../audio/spectrum';
import type { AsrWord } from '../types';

/** 0 — обычное слово, 1 — слово из списка паразитов, 2 — похоже на «э-э»/«м-м». Сам текст в файл не попадает. */
export function wordFlag(word: string, fillers: string[]): 0 | 1 | 2 {
  if (isHesitationWord(word)) return 2;
  if (findFillers([normalize(word).join(' ')], fillers).length) return 1;
  return 0;
}

export interface LabelExport {
  version: 1;
  frameMs: 20;
  sampleRate: number;
  durationMs: number;
  /** Подряд по 3 числа на кадр 20 мс: громкость (RMS), высота тона в Гц (0 — нет тона), корреляция тона. */
  frames: number[];
  /** [начало, конец, пометка] в мс от начала записи. */
  words: [number, number, number][];
  /** Нажатия пробела, мс. */
  labels: number[];
  /** Срабатывания текущего детектора, мс. */
  detector: number[];
}

const r = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

/** Собирает числовые признаки и отметки для подбора детектора «э-э». Звук и текст не хранятся. */
export class LabelRecorder {
  private frames: number[] = [];
  private wordList: [number, number, number][] = [];
  private labelList: number[] = [];
  private detectorList: number[] = [];

  constructor(private fillers: string[], private sampleRate: number) {}

  frame(rms: number, hz: number, corr: number): void {
    this.frames.push(r(rms, 4), Math.round(hz), r(corr, 2));
  }

  /** Слова финального результата; offsetMs — момент начала аудиопотока от начала записи. */
  words(ws: AsrWord[], offsetMs: number): void {
    for (const w of ws) {
      this.wordList.push([Math.round(offsetMs + w.start * 1000), Math.round(offsetMs + w.end * 1000), wordFlag(w.word, this.fillers)]);
    }
  }

  label(tMs: number): void { this.labelList.push(Math.round(tMs)); }
  detected(tMs: number): void { this.detectorList.push(Math.round(tMs)); }
  labelCount(): number { return this.labelList.length; }

  export(durationMs: number): LabelExport {
    return {
      version: 1, frameMs: 20, sampleRate: this.sampleRate, durationMs: Math.round(durationMs),
      frames: this.frames, words: this.wordList, labels: this.labelList, detector: this.detectorList,
    };
  }
}


export interface SpectrumExport {
  version: 2;
  frameMs: 20;
  sampleRate: number;
  melBands: number;
  padMs: number;
  durationMs: number;
  /** Подряд по 3 числа на кадр: громкость, тон, корреляция — для сопоставления с разметкой. */
  frames: number[];
  words: [number, number, number][];
  /** Отрезки-кандидаты и спектр кадров от start−padMs до end+padMs (по melBands чисел на кадр). */
  candidates: { start: number; end: number; melFrom: number; mel: number[] }[];
  /** Части отрезков, подтверждённые по словам. */
  confirmed: [number, number][];
}

/** Признаки для обучения «э или не э». Спектр сохраняется только для коротких отрезков-кандидатов. */
export class SpectrumRecorder {
  private base: LabelRecorder;
  private ring = new FrameRing(400, MEL_BANDS);
  private waiting: Segment[] = [];
  private cands: SpectrumExport['candidates'] = [];
  private conf: [number, number][] = [];

  constructor(fillers: string[], private sampleRate: number, private padMs = 100) {
    this.base = new LabelRecorder(fillers, sampleRate);
  }

  frame(tMs: number, rms: number, hz: number, corr: number, mel: Float32Array): void {
    this.base.frame(rms, hz, corr);
    this.ring.push(tMs, mel);
    this.waiting = this.waiting.filter(s => {
      if (tMs < s.end + this.padMs - 20) return true;
      const from = s.start - this.padMs;
      this.cands.push({ start: s.start, end: s.end, melFrom: from, mel: this.ring.slice(from, s.end + this.padMs).map(v => r(v, 2)) });
      return false;
    });
  }

  candidate(s: Segment): void { this.waiting.push(s); }
  confirmed(s: Segment): void { this.conf.push([s.start, s.end]); }
  words(ws: AsrWord[], offsetMs: number): void { this.base.words(ws, offsetMs); }

  export(durationMs: number): SpectrumExport {
    const b = this.base.export(durationMs);
    return {
      version: 2, frameMs: 20, sampleRate: this.sampleRate, melBands: MEL_BANDS, padMs: this.padMs,
      durationMs: b.durationMs, frames: b.frames, words: b.words, candidates: this.cands, confirmed: this.conf,
    };
  }
}
