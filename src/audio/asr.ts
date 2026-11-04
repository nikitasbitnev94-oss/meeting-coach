import type { AsrWord } from '../types';

export interface Asr {
  accept(b: AudioBuffer): void;
  onPartial(cb: (text: string) => void): void;
  onFinal(cb: (words: AsrWord[]) => void): void;
  /** Дожидается финального результата по последней фразе и освобождает модель. */
  stop(): Promise<void>;
}

interface Emits { on(ev: string, cb: (m: any) => void): void }

/**
 * Ждёт загрузки модели vosk-browser. Её createModel ждёт только 'load' и зависает навсегда,
 * если воркер прислал 'error'; здесь ошибка и таймаут дают отказ.
 */
export function waitModel(model: Emits, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Модель распознавания: таймаут загрузки')), timeoutMs);
    model.on('load', (m: any) => {
      clearTimeout(timer);
      if (m?.result) resolve();
      else reject(new Error('Модель распознавания не загрузилась'));
    });
    model.on('error', (m: any) => {
      clearTimeout(timer);
      reject(new Error(String(m?.error ?? 'Модель распознавания не загрузилась')));
    });
  });
}

/** Просит распознаватель закончить текущую фразу и ждёт результат не дольше timeoutMs. */
export function flushRecognizer(rec: Emits & { retrieveFinalResult(): void }, timeoutMs: number): Promise<void> {
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const timer = setTimeout(finish, timeoutMs);
    rec.on('result', () => { clearTimeout(timer); finish(); });
    rec.retrieveFinalResult();
  });
}

export interface AsrOptions { loadTimeoutMs: number; flushTimeoutMs: number }

/** Потоковое распознавание Vosk. Модель работает в Web Worker внутри vosk-browser. */
export async function createAsr(modelUrl: string, sampleRate: number, o: AsrOptions): Promise<Asr> {
  const { Model } = await import('vosk-browser'); // 6 МБ, грузится только когда нужно
  const model = new Model(modelUrl, -1);
  try {
    await waitModel(model, o.loadTimeoutMs);
  } catch (e) {
    model.terminate();
    throw e;
  }
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
  let stopped: Promise<void> | null = null;
  return {
    accept: b => { if (!stopped) rec.acceptWaveform(b); },
    onPartial: cb => { partialCbs.push(cb); },
    onFinal: cb => { finalCbs.push(cb); },
    stop: () => {
      stopped ??= flushRecognizer(rec, o.flushTimeoutMs).then(() => { rec.remove(); model.terminate(); });
      return stopped;
    },
  };
}
