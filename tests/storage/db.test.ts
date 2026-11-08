import 'fake-indexeddb/auto';
import { saveMeeting, getMeeting, listMeetings, getConfig, saveConfig, getBaseline, saveBaseline } from '../../src/storage/db';
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import type { Meeting } from '../../src/types';

const m = (id: string, startedAt: string): Meeting => ({
  id, title: id, startedAt, durationMs: 1000, speakingMs: 0, speakingWithFaceMs: 0, onCameraMs: 0, events: [],
});

test('встречи: сохранить, прочитать, список новыми первыми', async () => {
  await saveMeeting(m('a', '2026-11-01T10:00:00Z')); await saveMeeting(m('b', '2026-11-02T10:00:00Z'));
  expect((await getMeeting('a'))?.id).toBe('a');
  expect((await listMeetings()).map(x => x.id)).toEqual(['b', 'a']);
});
test('конфиг по умолчанию, пока не сохранён; потом сохранённый', async () => {
  expect(await getConfig()).toEqual(DEFAULT_CONFIG);
  const c = structuredClone(DEFAULT_CONFIG); c.fillers = ['ну'];
  await saveConfig(c);
  expect((await getConfig()).fillers).toEqual(['ну']);
});
test('калибровки нет → null; после сохранения читается', async () => {
  expect(await getBaseline()).toBeNull();
  const b = { blendshapes: {}, gazeYawDeg: 1, gazePitchDeg: 2, activityNorm: 3, createdAt: 'x' };
  await saveBaseline(b);
  expect(await getBaseline()).toEqual(b);
});

test('старые сохранённые настройки дополняются новыми полями', async () => {
  await saveConfig({ fillers: ['ну'] } as any);
  const c = await getConfig();
  expect(c.fillers).toEqual(['ну']);
  expect(c.gaze).toEqual(DEFAULT_CONFIG.gaze);
});

import { deleteMeeting } from '../../src/storage/db';
test('удаление встречи', async () => {
  await saveMeeting(m('del', '2026-11-03T10:00:00Z'));
  await deleteMeeting('del');
  expect(await getMeeting('del')).toBeUndefined();
});
