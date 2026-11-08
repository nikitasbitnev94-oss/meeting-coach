import type { Hint } from '../types';

export type PipStatus = 'ok' | 'face-lost' | 'no-camera-model' | 'no-speech-model' | 'speech-loading' | 'camera-off';
export interface PipState { hint: Hint | null; fillers: number; lastFiller: string | null; status: PipStatus }

const STATUS_TEXT: Record<PipStatus, string | null> = {
  ok: null,
  'face-lost': 'лицо не в кадре',
  'no-camera-model': 'анализ лица отключён',
  'no-speech-model': 'анализ речи отключён',
  'speech-loading': 'распознавание речи загружается',
  'camera-off': 'камера выкл: подсказки по лицу на паузе',
};

export type PipTone = 'ok' | 'hint' | 'muted';

/**
 * Окно — две строки. Первая: суть подсказки или «в норме». Вторая: пояснение (часть подсказки после «|»),
 * статус или последнее слово-паразит со счётчиком.
 */
export function formatPipState(s: PipState): { main: string; sub: string; tone: PipTone; idle: boolean } {
  const status = STATUS_TEXT[s.status];
  if (s.hint) {
    const [main, detail] = s.hint.text.split('|');
    const sub = detail ? `${detail} · всего ${s.fillers}`
      : s.lastFiller ? `«${s.lastFiller}» · паразиты ${s.fillers}` : status ?? `паразиты ${s.fillers}`;
    return { main, sub, tone: 'hint', idle: false };
  }
  if (status) return { main: 'в норме', sub: status, tone: 'muted', idle: true };
  return { main: 'в норме', sub: s.lastFiller ? `«${s.lastFiller}» · паразиты ${s.fillers}` : `паразиты ${s.fillers}`, tone: 'ok', idle: true };
}

export interface PipWindow {
  doc: Document;
  win: Window;
  /** true — окно Document Picture-in-Picture поверх всех окон; false — обычное всплывающее окно. */
  isFloating: boolean;
  render(s: PipState): void;
  onEnd(cb: () => void): void;
  onCameraToggle(cb: () => void): void;
  setCameraOff(off: boolean): void;
  onClose(cb: () => void): void;
  close(): void;
}

interface DocumentPictureInPicture {
  requestWindow(o: { width: number; height: number }): Promise<Window>;
}

const SIZE_KEY = 'pipSizeA'; // новый ключ: прежний размер 320×120 был под старый вид

function loadSize(): { width: number; height: number } {
  try {
    const v = JSON.parse(localStorage.getItem(SIZE_KEY) ?? 'null');
    if (v && v.width > 100 && v.height > 60) return { width: v.width, height: v.height };
  } catch { /* хранилище недоступно */ }
  return { width: 320, height: 88 };
}

function saveSize(w: Window): void {
  try { localStorage.setItem(SIZE_KEY, JSON.stringify({ width: w.innerWidth, height: w.innerHeight })); } catch { /* */ }
}

function copyStyles(to: Document): void {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = to.createElement('style');
      style.textContent = Array.from(sheet.cssRules).map(r => r.cssText).join('\n');
      to.head.append(style);
    } catch {
      if (sheet.href) {
        const link = to.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        to.head.append(link);
      }
    }
  }
}

export async function openPip(): Promise<PipWindow> {
  const size = loadSize();
  const dpip = (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture;
  let win: Window | null = null;
  let isFloating = false;
  if (dpip) {
    win = await dpip.requestWindow(size);
    isFloating = true;
  } else {
    win = window.open('', 'speech-coach-hints', `popup,width=${size.width},height=${size.height}`);
  }
  if (!win) throw new Error('Не удалось открыть окно подсказок. Разрешите всплывающие окна для этого сайта.');

  const doc = win.document;
  doc.title = 'Meeting Coach';
  copyStyles(doc);
  doc.body.style.margin = '0';

  const ICON_CAM = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10l5-3v10l-5-3"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>';
  const ICON_CAM_OFF = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10l5-3v10l-5-3"/><rect x="3" y="6" width="12" height="12" rx="2"/><path d="M2 2l20 20"/></svg>';
  const ICON_STOP = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';

  const root = doc.createElement('div');
  root.className = 'pip';
  root.innerHTML = `
    <div class="pip-row">
      <span class="pip-dot"></span>
      <span class="pip-main"></span>
      <button class="pip-btn" data-cam aria-label="Камера выключена в созвоне" title="Выключили камеру в созвоне — нажмите">${ICON_CAM}</button>
      <button class="pip-btn" data-end aria-label="Завершить встречу" title="Завершить встречу">${ICON_STOP}</button>
    </div>
    <div class="pip-sub"></div>
    ${isFloating ? '' : '<div class="pip-sub pip-warn">окно не поверх всех окон</div>'}`;
  doc.body.append(root);
  const dot = root.querySelector<HTMLElement>('.pip-dot')!;
  const main = root.querySelector<HTMLElement>('.pip-main')!;
  const sub = root.querySelector<HTMLElement>('.pip-sub')!;
  const camBtn = root.querySelector<HTMLButtonElement>('[data-cam]')!;
  const endBtn = root.querySelector<HTMLButtonElement>('[data-end]')!;

  win.addEventListener('resize', () => saveSize(win!));
  const closeCbs: (() => void)[] = [];
  win.addEventListener('pagehide', () => closeCbs.forEach(cb => cb()));

  return {
    doc, win, isFloating,
    render(s) {
      const f = formatPipState(s);
      main.textContent = f.main;
      main.classList.toggle('idle', f.idle);
      sub.textContent = f.sub;
      sub.classList.toggle('fresh', !!s.lastFiller && !s.hint?.text.includes('|'));
      dot.dataset.tone = f.tone;
    },
    onEnd(cb) { endBtn.addEventListener('click', cb); },
    onCameraToggle(cb) { camBtn.addEventListener('click', cb); },
    setCameraOff(off) {
      camBtn.innerHTML = off ? ICON_CAM_OFF : ICON_CAM;
      camBtn.classList.toggle('on', off);
      camBtn.setAttribute('aria-label', off ? 'Камера включена в созвоне' : 'Камера выключена в созвоне');
      camBtn.title = off ? 'Камера снова включена — нажмите' : 'Выключили камеру в созвоне — нажмите';
    },
    onClose(cb) { closeCbs.push(cb); },
    close() { win!.close(); },
  };
}
