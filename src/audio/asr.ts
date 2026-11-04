import type { AsrWord } from '../types';

export interface Asr {
  accept(b: AudioBuffer): void;
  onPartial(cb: (text: string) => void): void;
  onFinal(cb: (words: AsrWord[]) => void): void;
  stop(): void;
}

/** Потоковое распознавание Vosk. Модель работает в Web Worker внутри vosk-browser. */
export async function createAsr(modelUrl: string, sampleRate: number): Promise<Asr> {
  const { createModel } = await import('vosk-browser'); // 6 МБ, грузится только когда нужно
  const model = await createModel(modelUrl, -1);
  const rec = new model.KaldiRecognizer(sampleRate);
  rec.setWords(true);
  const partialCbs: ((t: string) => void)[] = [];
  const finalCbs: ((w: AsrWord[]) => void)[] = [];
  rec.on('partialresult', (m: any) => {
    const text: string = m?.result?.partial ?? '';
    partialCbs.forEach(cb => cb(text));
  });
  rec.on('result', (m: any) => {
    const words: AsrWord[] = (m?.result?.result ?? []).map((w: any) => ({ word: w.word, start: w.start, end: w.end }));
    finalCbs.forEach(cb => cb(words));
  });
  return {
    accept: b => rec.acceptWaveform(b),
    onPartial: cb => { partialCbs.push(cb); },
    onFinal: cb => { finalCbs.push(cb); },
    stop: () => { rec.remove(); model.terminate(); },
  };
}
