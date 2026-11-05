import { openFileSource, openLiveSource, type MediaHandle } from '../capture/source';
import { appBase } from '../capture/video';
import { startSession, type Session } from '../session/session';
import { getBaseline, getConfig } from '../storage/db';
import { createFaceTracker, type FaceTracker } from '../vision/faceTracker';
import { runCalibration } from './calibrationView';
import { errorText } from './diag';
import { openPip, type PipWindow } from './pip';
import { navigate } from './router';

const NAV = `<nav class="top"><a href="#/history">История</a><a href="#/settings">Настройки</a><a href="#/calibrate">Перекалибровать</a><a href="#/diag">Диагностика</a></nav>`;

export function renderStart(root: HTMLElement): void {
  root.innerHTML = `${NAV}
    <h1>Суфлёр</h1>
    <p class="muted">Откройте встречу в этом же браузере, в соседней вкладке. Звук и видео обрабатываются на этом компьютере и не сохраняются.</p>
    <div class="row"><input type="text" id="title" placeholder="Название встречи (необязательно)" style="flex:1;min-width:240px"></div>
    <div class="row">
      <label><input type="radio" name="mode" value="live" checked> Камера</label>
      <label><input type="radio" name="mode" value="file"> Файл</label>
      <input type="file" id="file" accept="video/*" hidden>
    </div>
    <div class="row"><button class="primary" id="start">Начать</button></div>
    <div id="msg" class="error"></div>`;
  const file = root.querySelector<HTMLInputElement>('#file')!;
  const msg = root.querySelector<HTMLElement>('#msg')!;
  const startBtn = root.querySelector<HTMLButtonElement>('#start')!;
  root.querySelectorAll<HTMLInputElement>('input[name=mode]').forEach(r => {
    r.onchange = () => { file.hidden = r.value !== 'file' || !r.checked; };
  });

  startBtn.onclick = async () => {
    msg.textContent = '';
    const mode = root.querySelector<HTMLInputElement>('input[name=mode]:checked')!.value;
    const title = root.querySelector<HTMLInputElement>('#title')!.value;
    if (mode === 'file' && !file.files?.length) {
      msg.textContent = 'Выберите видеофайл.';
      return;
    }
    startBtn.disabled = true;
    let source: MediaHandle | null = null;
    let face: FaceTracker | null = null;
    let pip: PipWindow | null = null;
    let sessionStarted = false;
    try {
      source = mode === 'file' ? await openFileSource(file.files![0]) : await openLiveSource();
      let endedEarly = false;
      source.onEnded(() => { if (!sessionStarted) endedEarly = true; });
      startBtn.textContent = 'Загружаю модель лица…';
      const [config, prev, f] = await Promise.all([getConfig(), getBaseline(), createFaceTracker(appBase())]);
      face = f;
      const baseline = await runCalibration(root, prev ? 'gaze' : 'full', { stream: source.videoStream, face, cfg: config, prev });
      source.pause();
      if (endedEarly) throw new Error('Файл закончился во время калибровки. Возьмите запись длиннее.');
      pip = await waitForPipClick(root);
      root.innerHTML = '<h1>Загружаю модели…</h1><p class="muted">Подсказки по лицу появятся через несколько секунд, распознавание речи — после загрузки модели (около 45 МБ, один раз).</p>';
      const session = await startSession({ source, pip, config, baseline, title, face });
      sessionStarted = true;
      if (source.kind === 'file') await session.speechSettled;
      source.resume();
      showRunning(root, session, pip, source);
    } catch (e) {
      if (!sessionStarted) {
        pip?.close();
        face?.close();
        source?.stop();
      }
      renderStart(root);
      root.querySelector<HTMLElement>('#msg')!.textContent = errorText(e);
    }
  };
}

/** Окно поверх всех окон открывается только по клику пользователя. */
function waitForPipClick(root: HTMLElement): Promise<PipWindow> {
  root.innerHTML = `<h1>Калибровка готова</h1>
    <p>Нажмите кнопку: откроется маленькое окно подсказок. Поставьте его прямо под камерой.</p>
    <div class="row"><button class="primary" id="pip">Открыть окно подсказок и начать</button></div>`;
  return new Promise((resolve, reject) => {
    root.querySelector<HTMLButtonElement>('#pip')!.onclick = () => openPip().then(resolve, reject);
  });
}

function showRunning(root: HTMLElement, session: Session, pip: PipWindow, source: MediaHandle): void {
  root.innerHTML = `<h1>Встреча идёт</h1>
    <p class="muted">Подсказки — в маленьком окне. Эту вкладку можно свернуть.</p>
    <p class="muted">Выключили камеру в созвоне — нажмите «Камера выкл»: подсказки по лицу встанут на паузу, по речи — продолжатся.</p>
    <div class="row"><button class="primary" id="end">Завершить</button><button id="cam"></button><button id="reopen" hidden>Открыть окно подсказок</button></div>`;
  const reopen = root.querySelector<HTMLButtonElement>('#reopen')!;
  // Выключенную камеру в созвоне суфлёр сам не видит: он не имеет доступа к вкладке созвона.
  let cameraOff = false;
  const camButtons: HTMLButtonElement[] = [root.querySelector<HTMLButtonElement>('#cam')!];
  const camLabel = () => (cameraOff ? 'Камера вкл' : 'Камера выкл');
  const toggleCamera = () => {
    cameraOff = !cameraOff;
    session.setCameraOff(cameraOff);
    camButtons.forEach(b => { b.textContent = camLabel(); });
  };
  camButtons[0].textContent = camLabel();
  camButtons[0].onclick = toggleCamera;
  const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
  window.addEventListener('beforeunload', warn);
  const finish = async () => {
    const m = await session.stop();
    window.removeEventListener('beforeunload', warn);
    navigate(`#/report/${encodeURIComponent(m.id)}`);
  };
  const addEnd = (p: PipWindow) => {
    p.addButton('Завершить', () => void finish());
    camButtons.push(p.addButton(camLabel(), toggleCamera));
  };
  addEnd(pip);
  root.querySelector<HTMLButtonElement>('#end')!.onclick = () => void finish();
  session.onPipClosed(() => { reopen.hidden = false; });
  reopen.onclick = async () => {
    const p = await openPip();
    session.reattach(p);
    addEnd(p);
    reopen.hidden = true;
  };
  source.onEnded(() => void finish());
}

/** Полная перекалибровка отдельно от встречи. */
export async function renderRecalibrate(root: HTMLElement): Promise<void> {
  root.innerHTML = `<nav class="top"><a href="#/">Суфлёр</a></nav><h1>Перекалибровка</h1>
    <p>Займёт 20 секунд. Сядьте как на обычной встрече.</p>
    <div class="row"><button class="primary" id="go">Начать</button></div><div id="msg" class="error"></div>`;
  root.querySelector<HTMLButtonElement>('#go')!.onclick = async () => {
    let source: MediaHandle | null = null;
    let face: FaceTracker | null = null;
    try {
      source = await openLiveSource();
      const [config, prev] = await Promise.all([getConfig(), getBaseline()]);
      face = await createFaceTracker(appBase());
      await runCalibration(root, 'full', { stream: source.videoStream, face, cfg: config, prev });
      root.innerHTML = `<h1>Калибровка сохранена</h1><p><a href="#/">К началу</a></p>`;
    } catch (e) {
      root.querySelector<HTMLElement>('#msg')!.textContent = errorText(e);
    } finally {
      face?.close();
      source?.stop();
    }
  };
}
