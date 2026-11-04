import { DEFAULT_CONFIG, HINT_PRIORITY } from '../../src/config/defaults';

test('приоритеты: порядок из спеки, без повторов', () => {
  expect(HINT_PRIORITY).toEqual(['hands', 'smirk', 'irritation', 'skepticism', 'surprise',
    'cheer', 'frown', 'expressive', 'stone', 'gaze', 'fillerBurst', 'filler']);
});

test('у каждой подсказки есть текст', () => {
  for (const id of HINT_PRIORITY) expect(DEFAULT_CONFIG.texts[id]).toBeTruthy();
});

test('список паразитов по умолчанию', () => {
  expect(DEFAULT_CONFIG.fillers).toEqual(['ну', 'вот', 'как бы', 'типа', 'короче', 'в общем',
    'это самое', 'так сказать', 'значит', 'получается', 'собственно', 'просто', 'наверно', 'наверное']);
});
