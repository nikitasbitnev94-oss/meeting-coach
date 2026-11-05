import { DEFAULT_CONFIG, type Config } from './defaults';

const NUMERIC_GROUPS = ['minDurationMs', 'display', 'face', 'gaze', 'hands', 'vad', 'hesitation', 'asr', 'calibration', 'perf'] as const;
/** Поля, которые не редактируются в настройках и всегда берутся из значений по умолчанию. */
const LOCKED = new Set(['gaze.eyeYawSign', 'gaze.eyePitchSign']);

/**
 * Проверяет настройки: недостающие поля — из значений по умолчанию, числа ≥ 0,
 * флажки — логические, паразиты — без пустых и повторов. Тексты подсказок не меняются.
 */
export function validateConfig(input: unknown): { ok: true; config: Config } | { ok: false; errors: string[] } {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const out = structuredClone(DEFAULT_CONFIG);
  const errors: string[] = [];

  for (const g of NUMERIC_GROUPS) {
    const group = src[g] && typeof src[g] === 'object' ? src[g] : {};
    const target = out[g] as Record<string, number>;
    for (const k of Object.keys(target)) {
      if (LOCKED.has(`${g}.${k}`) || !(k in group)) continue;
      const v = group[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) errors.push(`${g}.${k}: нужно число ≥ 0`);
      else target[k] = v;
    }
  }

  const enabled = src.enabled && typeof src.enabled === 'object' ? src.enabled : {};
  for (const k of Object.keys(out.enabled) as (keyof Config['enabled'])[]) {
    if (!(k in enabled)) continue;
    if (typeof enabled[k] !== 'boolean') errors.push(`enabled.${k}: нужно да или нет`);
    else out.enabled[k] = enabled[k];
  }

  if (Array.isArray(src.fillers)) {
    const seen = new Set<string>();
    out.fillers = [];
    for (const f of src.fillers) {
      if (typeof f !== 'string') continue;
      const w = f.trim().toLowerCase().replace(/\s+/g, ' ');
      if (w && !seen.has(w)) { seen.add(w); out.fillers.push(w); }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, config: out };
}
