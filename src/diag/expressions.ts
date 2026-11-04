/** Шаги записи мимики: пользователь показывает выражения, страница пишет параметры лица. Изображение не сохраняется. */
export const EXPRESSION_STEPS = [
  { id: 'neutral', text: 'Спокойное лицо, смотрите в камеру', ms: 4000 },
  { id: 'smile', text: 'Улыбнитесь, как обычно улыбаетесь на встрече', ms: 4000 },
  { id: 'laugh', text: 'Широкая улыбка или смех', ms: 4000 },
  { id: 'smirk', text: 'Усмешка: улыбка одним уголком рта', ms: 4000 },
  { id: 'frown', text: 'Нахмурьтесь, как когда обдумываете сложное', ms: 4000 },
  { id: 'irritation', text: 'Раздражение: брови вниз, губы сжаты', ms: 4000 },
  { id: 'skepticism', text: 'Скепсис: одна бровь вверх или прищур', ms: 4000 },
  { id: 'surprise', text: 'Удивление: брови вверх, рот приоткрыт', ms: 4000 },
  { id: 'talk', text: 'Расскажите что-нибудь спокойно, как на встрече', ms: 8000 },
  { id: 'neutral2', text: 'Снова спокойное лицо', ms: 4000 },
] as const;

export type ExpressionRow = [string, number, ...(number | string | null)[]];

export class ExpressionRecorder {
  private raw: { step: string; t: number; bs: Record<string, number> | null; fired: string[] }[] = [];

  frame(step: string, tMs: number, bs: Record<string, number> | null, fired: string[]): void {
    this.raw.push({ step, t: Math.round(tMs), bs, fired });
  }

  export(): { version: 1; keys: string[]; rows: ExpressionRow[] } {
    const keys = [...new Set(this.raw.flatMap(r => (r.bs ? Object.keys(r.bs) : [])))].sort();
    const rows = this.raw.map(r => [
      r.step, r.t,
      ...keys.map(k => (r.bs ? Math.round((r.bs[k] ?? 0) * 1e4) / 1e4 : null)),
      r.fired.join(' '),
    ] as ExpressionRow);
    return { version: 1, keys, rows };
  }
}
