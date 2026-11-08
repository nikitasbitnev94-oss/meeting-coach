import { formatPipState } from '../../src/ui/pip';

const S = (over: any = {}) => ({ hint: null, fillers: 0, lastFiller: null, status: 'ok', ...over });

test('пусто: «в норме», зелёная точка, счётчик', () => {
  expect(formatPipState(S({ fillers: 12 }))).toEqual({ main: 'в норме', sub: 'паразиты 12', tone: 'ok', idle: true });
});
test('подсказка по лицу и свежий паразит', () => {
  expect(formatPipState(S({ hint: { id: 'hands', text: 'руки от лица' }, fillers: 13, lastFiller: 'вот' })))
    .toEqual({ main: 'руки от лица', sub: '«вот» · паразиты 13', tone: 'hint', idle: false });
});
test('длинная подсказка делится на суть и пояснение по «|»', () => {
  expect(formatPipState(S({ hint: { id: 'fillerBurst', text: 'делай паузы|3 паразита за минуту' }, fillers: 16 })))
    .toEqual({ main: 'делай паузы', sub: '3 паразита за минуту · всего 16', tone: 'hint', idle: false });
});
test('статусы — во второй строке, точка серая', () => {
  expect(formatPipState(S({ status: 'face-lost' }))).toMatchObject({ sub: 'лицо не в кадре', tone: 'muted' });
  expect(formatPipState(S({ status: 'camera-off' }))).toMatchObject({ sub: 'камера выкл: подсказки по лицу на паузе', tone: 'muted' });
  expect(formatPipState(S({ status: 'speech-loading' }))).toMatchObject({ sub: 'распознавание речи загружается' });
  expect(formatPipState(S({ status: 'no-speech-model' }))).toMatchObject({ sub: 'анализ речи отключён' });
  expect(formatPipState(S({ status: 'no-camera-model' }))).toMatchObject({ sub: 'анализ лица отключён' });
});
