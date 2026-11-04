import type { Hint } from '../types';

export type PipStatus = 'ok' | 'face-lost' | 'no-camera-model' | 'no-speech-model' | 'speech-loading';
export interface PipState { hint: Hint | null; fillers: number; lastFiller: string | null; status: PipStatus }

const STATUS_TEXT: Record<PipStatus, string | null> = {
  ok: null,
  'face-lost': 'лицо не в кадре',
  'no-camera-model': 'анализ лица отключён',
  'no-speech-model': 'анализ речи отключён',
  'speech-loading': 'распознавание речи загружается',
};

export function formatPipState(s: PipState): { hintText: string; fillerText: string; statusText: string | null } {
  return {
    hintText: s.hint?.text ?? '',
    fillerText: s.lastFiller ? `«${s.lastFiller}» · паразиты ${s.fillers}` : `паразиты ${s.fillers}`,
    statusText: STATUS_TEXT[s.status],
  };
}

export interface PipWindow {
  doc: Document;
  win: Window;
  /** true — окно Document Picture-in-Picture поверх всех окон; false — обычное всплывающее окно. */
  isFloating: boolean;
  render(s: PipState): void;
  addButton(label: string, onClick: () => void): HTMLButtonElement;
  onClose(cb: () => void): void;
  close(): void;
}

interface DocumentPictureInPicture {
  requestWindow(o: { width: number; height: number }): Promise<Window>;
}

const SIZE_KEY = 'pipSize';

function loadSize(): { width: number; height: number } {
  try {
    const v = JSON.parse(localStorage.getItem(SIZE_KEY) ?? 'null');
    if (v && v.width > 100 && v.height > 60) return { width: v.width, height: v.height };
  } catch { /* хранилище недоступно */ }
  return { width: 320, height: 120 };
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
  doc.title = 'Подсказки';
  copyStyles(doc);
  doc.body.style.margin = '0';

  const root = doc.createElement('div');
  root.className = 'pip';
  const hint = doc.createElement('div');
  hint.className = 'hint empty';
  const counters = doc.createElement('div');
  counters.className = 'filler';
  const status = doc.createElement('div');
  status.className = 'status';
  const bar = doc.createElement('div');
  bar.className = 'bar';
  root.append(hint, counters, status, bar);
  if (!isFloating) {
    const note = doc.createElement('div');
    note.className = 'status';
    note.textContent = 'окно не поверх всех окон';
    root.append(note);
  }
  doc.body.append(root);

  win.addEventListener('resize', () => saveSize(win!));
  const closeCbs: (() => void)[] = [];
  win.addEventListener('pagehide', () => closeCbs.forEach(cb => cb()));

  return {
    doc, win, isFloating,
    render(s) {
      const f = formatPipState(s);
      hint.textContent = f.hintText || 'всё хорошо';
      hint.classList.toggle('empty', !f.hintText);
      counters.textContent = f.fillerText;
      counters.classList.toggle('fresh', !!s.lastFiller);
      status.textContent = f.statusText ?? '';
    },
    addButton(label, onClick) {
      const b = doc.createElement('button');
      b.textContent = label;
      b.addEventListener('click', onClick);
      bar.append(b);
      return b;
    },
    onClose(cb) { closeCbs.push(cb); },
    close() { win!.close(); },
  };
}
