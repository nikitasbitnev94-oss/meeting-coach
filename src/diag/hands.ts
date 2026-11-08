import type { Box, HandFrame } from '../types';

/**
 * Шаги разметки рук. touch — должна ли сработать подсказка; hand — какой рукой (чтобы проверить,
 * видит ли детектор именно эту руку, а не вторую, опущенную).
 */
type Step = { id: string; text: string; ms: number; touch: boolean; hand?: 'left' | 'right' };
const both = (id: string, text: string, touch: boolean): Step[] => [
  { id: `${id}-left`, text: `${text} — левой рукой, правую опустите`, ms: 6000, touch, hand: 'left' },
  { id: `${id}-right`, text: `${text} — правой рукой, левую опустите`, ms: 6000, touch, hand: 'right' },
];
export const HAND_STEPS: Step[] = [
  { id: 'away', text: 'Уберите руки из кадра', ms: 8000, touch: false },
  { id: 'gesture', text: 'Жестикулируйте, как на встрече, лицо не трогайте', ms: 15000, touch: false },
  { id: 'chest', text: 'Руки перед грудью, можно сцепить пальцы', ms: 6000, touch: false },
  ...both('near', 'Держите руку возле щеки, не касаясь', false),
  ...both('cheek', 'Коснитесь щеки', true),
  ...both('chin', 'Подоприте подбородок', true),
  ...both('hair', 'Поправьте волосы', true),
  ...both('neck', 'Коснитесь шеи', true),
  { id: 'away2', text: 'Снова уберите руки из кадра', ms: 8000, touch: false },
];

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const r3 = (x: number) => Math.round(x * 1e3) / 1e3;

export interface HandRow {
  step: string; t: number; box: number[] | null;
  hands: { score: number; side: string; pts: number[] }[];
  fired: boolean;
}

/** Числа для подбора правила «рука у лица»: рамка лица, точки рук, уверенность детектора. Изображения нет. */
export class HandRecorder {
  private rows: HandRow[] = [];
  frame(step: string, tMs: number, box: Box | null, h: HandFrame, fired: boolean): void {
    this.rows.push({
      step, t: Math.round(tMs),
      box: box ? [box.x, box.y, box.w, box.h].map(r4) : null,
      hands: h.hands.map((pts, k) => ({ score: r3(h.scores?.[k] ?? 0), side: h.sides?.[k] ?? '', pts: pts.flatMap(p => [r4(p.x), r4(p.y)]) })),
      fired,
    });
  }
  export(): { version: 1; rows: HandRow[] } { return { version: 1, rows: this.rows }; }
}
