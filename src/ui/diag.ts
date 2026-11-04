import { openLiveSource, SourceError, type MediaHandle } from '../capture/source';
import { openPip, type PipWindow } from './pip';

export const SOURCE_ERROR_TEXT: Record<string, string> = {
  denied: 'Нет доступа к камере или микрофону. Разрешите доступ в настройках сайта.',
  busy: 'Камера занята другой программой. Откройте встречу в этом же браузере.',
  missing: 'Камера или микрофон не найдены.',
};

export function errorText(e: unknown): string {
  if (e instanceof SourceError) return SOURCE_ERROR_TEXT[e.reason];
  return e instanceof Error ? e.message : String(e);
}

export function renderDiag(root: HTMLElement): void {
  root.innerHTML = `
    <nav class="top"><a href="#/">Суфлёр</a></nav>
    <h1>Диагностика</h1>
    <p class="muted">Проверка камеры, окна подсказок и распознавания. Ничего не сохраняется.</p>
    <div class="row"><button class="primary" id="cam">Камера и окно подсказок</button><button id="stop" disabled>Остановить</button></div>
    <div id="msg" class="error"></div>
    <div id="out" class="card muted">Нажмите кнопку, чтобы начать.</div>`;
  const msg = root.querySelector<HTMLElement>('#msg')!;
  const camBtn = root.querySelector<HTMLButtonElement>('#cam')!;
  const stopBtn = root.querySelector<HTMLButtonElement>('#stop')!;
  let source: MediaHandle | null = null;
  let pip: PipWindow | null = null;

  camBtn.onclick = async () => {
    msg.textContent = '';
    try {
      source = await openLiveSource();
      pip = await openPip();
      pip.render({ hint: { id: 'gaze', text: 'проверка окна' }, fillers: 0, gazeShare: null, status: 'ok' });
      camBtn.disabled = true;
      stopBtn.disabled = false;
    } catch (e) {
      msg.textContent = errorText(e);
    }
  };
  stopBtn.onclick = () => {
    source?.stop(); pip?.close();
    source = null; pip = null;
    camBtn.disabled = false; stopBtn.disabled = true;
  };
}
