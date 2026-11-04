import { normalize, findFillers } from '../../src/audio/fillers';

const L = ['ну', 'это самое', 'как бы', 'типа', 'наверно', 'наверное'];

test('нормализация', () => expect(normalize('Ну, ВОТ… всё!')).toEqual(['ну', 'вот', 'все']));
test('фразы из двух слов, жадно', () => {
  expect(findFillers(['ну', 'это', 'самое', 'как', 'бы'], L))
    .toEqual([{ word: 'ну', index: 0 }, { word: 'это самое', index: 1 }, { word: 'как бы', index: 3 }]);
});
test('только целое слово', () => expect(findFillers(['типажи', 'нуль'], L)).toEqual([]));
test('наверно и наверное различаются', () => {
  expect(findFillers(['наверно', 'наверное'], L).map(h => h.word)).toEqual(['наверно', 'наверное']);
});
test('пустой ввод', () => expect(findFillers([], L)).toEqual([]));
test('элементы списка тоже нормализуются', () => expect(findFillers(['все'], ['Всё'])).toEqual([{ word: 'все', index: 0 }]));

import { tally } from '../../src/audio/fillers';
test('подсчёт по словам, по убыванию', () => {
  expect(tally(['ну', 'вот', 'ну', 'ну', 'вот', 'типа'])).toEqual([
    { word: 'ну', count: 3 }, { word: 'вот', count: 2 }, { word: 'типа', count: 1 }]);
});
