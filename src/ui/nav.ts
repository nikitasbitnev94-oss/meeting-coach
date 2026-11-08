export const APP_NAME = 'Meeting Coach';

type Tab = 'new' | 'history' | 'settings' | null;

const TABS: { id: Exclude<Tab, null>; href: string; label: string }[] = [
  { id: 'new', href: '#/', label: 'Новая встреча' },
  { id: 'history', href: '#/history', label: 'История' },
  { id: 'settings', href: '#/settings', label: 'Настройки' },
];

/** Верхнее меню: название и три вкладки. */
export function navHtml(active: Tab): string {
  const links = TABS.map(t => `<a href="${t.href}"${t.id === active ? ' aria-current="page"' : ''}>${t.label}</a>`).join('');
  return `<header class="top"><span class="brand">${APP_NAME}</span><nav class="tabs">${links}</nav></header>`;
}
