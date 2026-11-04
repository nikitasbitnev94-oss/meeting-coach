import { openDB, type IDBPDatabase } from 'idb';
import { DEFAULT_CONFIG, type Config } from '../config/defaults';
import type { Baseline, Meeting } from '../types';

let dbp: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbp ??= openDB('speech-coach', 1, {
    upgrade(d) {
      d.createObjectStore('meetings', { keyPath: 'id' });
      d.createObjectStore('kv');
    },
  });
  return dbp;
}

export async function saveMeeting(m: Meeting): Promise<void> {
  await (await db()).put('meetings', m);
}

export async function getMeeting(id: string): Promise<Meeting | undefined> {
  return (await db()).get('meetings', id);
}

/** Все встречи, новые первыми. */
export async function listMeetings(): Promise<Meeting[]> {
  const all: Meeting[] = await (await db()).getAll('meetings');
  return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function getConfig(): Promise<Config> {
  return ((await (await db()).get('kv', 'config')) as Config | undefined) ?? structuredClone(DEFAULT_CONFIG);
}

export async function saveConfig(c: Config): Promise<void> {
  await (await db()).put('kv', c, 'config');
}

export async function getBaseline(): Promise<Baseline | null> {
  return ((await (await db()).get('kv', 'baseline')) as Baseline | undefined) ?? null;
}

export async function saveBaseline(b: Baseline): Promise<void> {
  await (await db()).put('kv', b, 'baseline');
}
