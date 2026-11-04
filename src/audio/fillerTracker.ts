import type { AsrWord, CoachEvent, FillerHit } from '../types';
import { findFillers, normalize } from './fillers';

const HESITATION = 'э-э';

/**
 * Учёт паразитов по потоку Vosk. Частичный результат пересчитывается целиком,
 * попадания выдаются только на прирост счёта слова. Финальный результат фиксирует события.
 */
export class FillerTracker {
  private committed = 0;
  private provisional = new Map<string, number>();

  constructor(private fillers: string[]) {}

  onPartial(text: string, tMs: number): FillerHit[] {
    const counts = new Map<string, number>();
    for (const h of findFillers(normalize(text), this.fillers)) counts.set(h.word, (counts.get(h.word) ?? 0) + 1);
    const hits: FillerHit[] = [];
    for (const [word, n] of counts) {
      for (let i = this.provisional.get(word) ?? 0; i < n; i++) hits.push({ word, tMs });
    }
    this.provisional = counts;
    return hits;
  }

  onFinal(words: AsrWord[], streamStartMs: number): CoachEvent[] {
    const tokens = words.map(w => normalize(w.word).join(' '));
    const events = findFillers(tokens, this.fillers).map(h => {
      const first = words[h.index];
      const last = words[h.index + h.word.split(' ').length - 1];
      return {
        type: 'filler' as const,
        word: h.word,
        tMs: Math.round(streamStartMs + first.start * 1000),
        durationMs: Math.round((last.end - first.start) * 1000),
      };
    });
    this.committed += events.length;
    this.provisional = new Map();
    return events;
  }

  addHesitation(tMs: number): { hit: FillerHit; event: CoachEvent } {
    this.committed += 1;
    return { hit: { word: HESITATION, tMs }, event: { type: 'filler', word: HESITATION, tMs, durationMs: 0 } };
  }

  total(): number {
    let p = 0;
    for (const n of this.provisional.values()) p += n;
    return this.committed + p;
  }
}
