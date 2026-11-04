import { buildMeeting, pickStatus } from '../../src/session/meeting';
import type { CoachEvent } from '../../src/types';

test('статус: лицо не в кадре важнее состояния модели речи', () => {
  expect(pickStatus('face-lost', true, 'failed')).toBe('face-lost');
  expect(pickStatus('ok', true, 'failed')).toBe('no-speech-model');
  expect(pickStatus('ok', true, 'loading')).toBe('speech-loading');
  expect(pickStatus('face-lost', false, 'ok')).toBe('no-camera-model');
  expect(pickStatus('ok', true, 'ok')).toBe('ok');
});

test('встреча: время событий от начала, по порядку, итоги движка', () => {
  const ev: CoachEvent[] = [
    { type: 'frown', tMs: 15000, durationMs: 3000 },
    { type: 'filler', word: 'ну', tMs: 11000, durationMs: 200 },
    { type: 'hands', tMs: 9000, durationMs: 1000 },   // до начала встречи — время 0
  ];
  const m = buildMeeting({
    id: 'x', title: '  Планёрка ', t0: 10000, tEnd: 70000, startedAt: '2026-11-04T10:00:00.000Z',
    totals: { speakingMs: 20000, speakingWithFaceMs: 18000, onCameraMs: 9000 }, events: ev,
  });
  expect(m).toEqual({
    id: 'x', title: 'Планёрка', startedAt: '2026-11-04T10:00:00.000Z', durationMs: 60000,
    speakingMs: 20000, speakingWithFaceMs: 18000, onCameraMs: 9000,
    events: [
      { type: 'hands', tMs: 0, durationMs: 1000 },
      { type: 'filler', word: 'ну', tMs: 1000, durationMs: 200 },
      { type: 'frown', tMs: 5000, durationMs: 3000 },
    ],
  });
});

import { freshHits } from '../../src/session/meeting';
test('устаревшие попадания паразитов отбрасываются', () => {
  const hits = [{ word: 'ну', tMs: 1000 }, { word: 'вот', tMs: 9000 }];
  expect(freshHits(hits, 10000, 3000)).toEqual([{ word: 'вот', tMs: 9000 }]);
});
