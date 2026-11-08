import { navHtml } from '../../src/ui/nav';

test('три вкладки, активная отмечена', () => {
  const h = navHtml('history');
  expect(h).toContain('href="#/"'); expect(h).toContain('href="#/history"'); expect(h).toContain('href="#/settings"');
  expect(h).toContain('Новая встреча'); expect(h).toContain('История'); expect(h).toContain('Настройки');
  expect(h).toMatch(/href="#\/history"[^>]*aria-current="page"/);
  expect(h).not.toContain('Диагностика');
  expect(h).toContain('Meeting Coach');
});
