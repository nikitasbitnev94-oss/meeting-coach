// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { renderSettings } from '../../src/ui/settings';
import { getConfig } from '../../src/storage/db';

const tick = () => new Promise(r => setTimeout(r, 20));

test('добавить слово и сохранить', async () => {
  const root = document.createElement('div');
  await renderSettings(root);
  root.querySelector<HTMLInputElement>('#newWord')!.value = ' Так Вот ';
  root.querySelector<HTMLButtonElement>('#add')!.click();
  root.querySelector<HTMLButtonElement>('#save')!.click();
  await tick();
  expect((await getConfig()).fillers).toContain('так вот');
  expect(root.querySelector('#saved')!.textContent).toBe('Сохранено');
});

test('пустой порог — ошибка, не сохраняется', async () => {
  const root = document.createElement('div');
  await renderSettings(root);
  root.querySelector<HTMLInputElement>('[data-dur="hands"]')!.value = '';
  root.querySelector<HTMLButtonElement>('#save')!.click();
  await tick();
  expect(root.querySelector('#errors')!.textContent).toContain('minDurationMs.hands');
  expect((await getConfig()).minDurationMs.hands).toBe(1000);
});

test('секунды переводятся в миллисекунды', async () => {
  const root = document.createElement('div');
  await renderSettings(root);
  root.querySelector<HTMLInputElement>('[data-dur="gaze"]')!.value = '4.5';
  root.querySelector<HTMLButtonElement>('#save')!.click();
  await tick();
  expect((await getConfig()).minDurationMs.gaze).toBe(4500);
});
