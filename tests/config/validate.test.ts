import { validateConfig } from '../../src/config/validate';
import { DEFAULT_CONFIG } from '../../src/config/defaults';

test('корректный конфиг проходит без изменений', () => {
  expect(validateConfig(DEFAULT_CONFIG)).toEqual({ ok: true, config: DEFAULT_CONFIG });
});
test('паразиты: обрезка пробелов, нижний регистр, без пустых и повторов', () => {
  const r = validateConfig({ ...DEFAULT_CONFIG, fillers: [' Ну ', 'ну', '', 'Типа'] });
  expect(r.ok && r.config.fillers).toEqual(['ну', 'типа']);
});
test('отрицательный порог — ошибка с именем поля', () => {
  const c = structuredClone(DEFAULT_CONFIG); c.minDurationMs.hands = -1;
  expect(validateConfig(c)).toEqual({ ok: false, errors: ['minDurationMs.hands: нужно число ≥ 0'] });
});
test('нечисло — ошибка', () => {
  const c: any = structuredClone(DEFAULT_CONFIG); c.gaze.maxYawDeg = 'abc';
  expect(validateConfig(c)).toEqual({ ok: false, errors: ['gaze.maxYawDeg: нужно число ≥ 0'] });
});
test('недостающие поля берутся из значений по умолчанию', () => {
  const r = validateConfig({ fillers: ['ну'] });
  expect(r.ok && r.config.gaze).toEqual(DEFAULT_CONFIG.gaze);
  expect(r.ok && r.config.fillers).toEqual(['ну']);
});
test('тексты подсказок и знак глаз не меняются из настроек', () => {
  const c: any = structuredClone(DEFAULT_CONFIG); c.texts.hands = 'xxx'; c.gaze.eyeYawSign = 7;
  const r = validateConfig(c);
  expect(r.ok && r.config.texts.hands).toBe('руки от лица');
  expect(r.ok && r.config.gaze.eyeYawSign).toBe(1);
});
test('не объект — конфиг по умолчанию', () => {
  expect(validateConfig(null)).toEqual({ ok: true, config: DEFAULT_CONFIG });
});
test('включение подсказок — только логические значения', () => {
  const c: any = structuredClone(DEFAULT_CONFIG); c.enabled.gaze = 'да';
  expect(validateConfig(c)).toEqual({ ok: false, errors: ['enabled.gaze: нужно да или нет'] });
});
