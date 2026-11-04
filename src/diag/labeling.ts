import { findFillers, isHesitationWord, normalize } from '../audio/fillers';
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
