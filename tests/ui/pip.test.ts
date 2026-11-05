import { formatPipState } from '../../src/ui/pip';

test('подсказка и счётчик', () => {
  const r = formatPipState({ hint: { id: 'gaze', text: 'в камеру' }, fillers: 7, lastFiller: null, status: 'ok' });
  expect(r).toEqual({ hintText: 'в камеру', fillerText: 'паразиты 7', statusText: null });
});
test('последнее слово-паразит видно отдельно от главной подсказки', () => {
  const r = formatPipState({ hint: { id: 'frown', text: 'расслабь брови' }, fillers: 3, lastFiller: 'вот', status: 'ok' });
  expect(r.hintText).toBe('расслабь брови');
  expect(r.fillerText).toBe('«вот» · паразиты 3');
});
test('статус лица', () => {
  expect(formatPipState({ hint: null, fillers: 0, lastFiller: null, status: 'face-lost' }).statusText).toBe('лицо не в кадре');
});
test('статусы моделей', () => {
  const s = (status: any) => formatPipState({ hint: null, fillers: 0, lastFiller: null, status }).statusText;
  expect(s('no-camera-model')).toBe('анализ лица отключён');
  expect(s('no-speech-model')).toBe('анализ речи отключён');
  expect(s('speech-loading')).toBe('распознавание речи загружается');
});

test('статус «камера выключена»', () => {
  expect(formatPipState({ hint: null, fillers: 0, lastFiller: null, status: 'camera-off' }).statusText).toBe('камера выключена: подсказки по лицу на паузе');
});
