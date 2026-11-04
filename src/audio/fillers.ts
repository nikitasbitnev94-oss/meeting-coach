/** Нижний регистр, ё→е, без знаков препинания, разбиение по пробелам. */
export function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Находит слова-паразиты; фразы из нескольких слов имеют приоритет (жадный поиск). */
export function findFillers(tokens: string[], fillers: string[]): { word: string; index: number }[] {
  const phrases = fillers
    .map(f => normalize(f))
    .filter(p => p.length > 0)
    .sort((a, b) => b.length - a.length);
  const hits: { word: string; index: number }[] = [];
  let i = 0;
  while (i < tokens.length) {
    const p = phrases.find(ph => ph.every((w, k) => tokens[i + k] === w));
    if (p) {
      hits.push({ word: p.join(' '), index: i });
      i += p.length;
    } else {
      i += 1;
    }
  }
  return hits;
}

/** Подсчёт повторов слов, по убыванию частоты; при равенстве — по первому появлению. */
export function tally(words: string[]): { word: string; count: number }[] {
  const m = new Map<string, number>();
  for (const w of words) m.set(w, (m.get(w) ?? 0) + 1);
  return [...m].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count);
}

/** Слово, которым распознаватель записал «э-э»/«м-м» (э, ээ, эм, мм, а, ы…): для детектора это не слово. */
export function isHesitationWord(word: string): boolean {
  const t = normalize(word).join(' ');
  return /^[эмаы]+$/.test(t) || t === 'хм';
}
