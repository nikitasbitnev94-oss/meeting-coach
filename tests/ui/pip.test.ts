import { formatPipState } from '../../src/ui/pip';

test('счётчики и подсказка', () => {
  const r = formatPipState({ hint: { id: 'gaze', text: 'в камеру' }, fillers: 7, gazeShare: 0.834, status: 'ok' });
  expect(r).toEqual({ hintText: 'в камеру', countersText: 'паразиты 7 · в камеру 83%', statusText: null });
});

test('нет речи — доля взгляда «—»', () => {
  expect(formatPipState({ hint: null, fillers: 0, gazeShare: null, status: 'ok' }).countersText)
    .toBe('паразиты 0 · в камеру —');
});

test('статус лица', () => {
  expect(formatPipState({ hint: null, fillers: 0, gazeShare: null, status: 'face-lost' }).statusText)
    .toBe('лицо не в кадре');
});

test('статусы моделей', () => {
  const s = (status: any) => formatPipState({ hint: null, fillers: 0, gazeShare: null, status }).statusText;
  expect(s('no-camera-model')).toBe('анализ лица отключён');
  expect(s('no-speech-model')).toBe('анализ речи отключён');
  expect(s('speech-loading')).toBe('распознавание речи загружается');
});
