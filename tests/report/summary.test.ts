import { summarize, clock } from '../../src/report/summary';
import type { CoachEvent, EventType, Meeting } from '../../src/types';

const meeting = (over: Partial<Meeting>): Meeting => ({
  id: 'm', title: 't', startedAt: '2026-11-04T10:00:00Z', durationMs: 600000,
  speakingMs: 60000, speakingWithFaceMs: 60000, onCameraMs: 60000, events: [], ...over,
});
const f = (word: string, tMs = 0): CoachEvent => ({ type: 'filler', word, tMs, durationMs: 200 });
const ev = (type: EventType, tMs = 0): CoachEvent => ({ type, tMs, durationMs: 1000 });

test('паразиты в минуту речи и разбивка по убыванию', () => {
  const s = summarize(meeting({ speakingMs: 120000, events: [f('ну'), f('вот'), f('ну'), f('ну')] }));
  expect(s.fillers).toBe(4); expect(s.fillersPerMin).toBe(2);
  expect(s.byWord).toEqual([{ word: 'ну', count: 3 }, { word: 'вот', count: 1 }]);
  expect(s.speakingMin).toBe(2);
});
test('без речи — null, без деления на ноль', () => {
  const s = summarize(meeting({ speakingMs: 0, speakingWithFaceMs: 0, onCameraMs: 0, events: [] }));
  expect(s.fillersPerMin).toBeNull(); expect(s.gazeShare).toBeNull();
});
test('доля взгляда и эпизоды мимо камеры', () => {
  const s = summarize(meeting({ speakingWithFaceMs: 100000, onCameraMs: 75000, events: [ev('gaze'), ev('gaze')] }));
  expect(s.gazeShare).toBe(0.75); expect(s.offCameraEpisodes).toBe(2);
});
test('лента: мимика и руки по времени, без паразитов и взгляда', () => {
  const s = summarize(meeting({ events: [ev('frown', 5000), f('ну', 1000), ev('hands', 2000), ev('gaze', 3000)] }));
  expect(s.timeline.map(e => e.type)).toEqual(['hands', 'frown']);
  expect(s.byType).toEqual({ hands: 1, frown: 1 });
});
test('время чч:мм:сс от начала встречи', () => {
  expect(clock(0)).toBe('00:00:00');
  expect(clock(3723000)).toBe('01:02:03');
});

import { esc } from '../../src/ui/report';
test('название встречи экранируется', () => expect(esc('<b>"Q4" & P&L</b>')).toBe('&lt;b&gt;&quot;Q4&quot; &amp; P&amp;L&lt;/b&gt;'));
