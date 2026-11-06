import type { Box, HandFrame } from '../types';

/** Шаги разметки рук. touch — должна ли сработать подсказка «руки от лица». */
export const HAND_STEPS = [
  { id: 'away', text: 'Уберите руки из кадра', ms: 10000, touch: false },
  { id: 'gesture', text: 'Жестикулируйте, как на встрече, лицо не трогайте', ms: 15000, touch: false },
  { id: 'near', text: 'Держите руку возле лица, не касаясь', ms: 6000, touch: false },
  { id: 'chest', text: 'Руки перед грудью, можно сцепить пальцы', ms: 6000, touch: false },
  { id: 'cheek', text: 'Коснитесь щеки или носа', ms: 5000, touch: true },
  { id: 'chin', text: 'Подоприте подбородок рукой', ms: 5000, touch: true },
  { id: 'hair', text: 'Поправьте волосы', ms: 5000, touch: true },
  { id: 'neck', text: 'Коснитесь шеи', ms: 5000, touch: true },
  { id: 'away2', text: 'Снова уберите руки из кадра', ms: 8000, touch: false },
] as const;

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const r3 = (x: number) => Math.round(x * 1e3) / 1e3;

export interface HandRow {
  step: string; t: number; box: number[] | null;
  hands: { score: number; pts: number[] }[];
  fired: boolean;
}

/** Числа для подбора правила «рука у лица»: рамка лица, точки рук, уверенность детектора. Изображения нет. */
export class HandRecorder {
  private rows: HandRow[] = [];
  frame(step: string, tMs: number, box: Box | null, h: HandFrame, fired: boolean): void {
    this.rows.push({
      step, t: Math.round(tMs),
      box: box ? [box.x, box.y, box.w, box.h].map(r4) : null,
      hands: h.hands.map((pts, k) => ({ score: r3(h.scores?.[k] ?? 0), pts: pts.flatMap(p => [r4(p.x), r4(p.y)]) })),
      fired,
    });
  }
  export(): { version: 1; rows: HandRow[] } { return { version: 1, rows: this.rows }; }
}
