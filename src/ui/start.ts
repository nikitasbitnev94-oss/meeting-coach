import { openFileSource, openLiveSource, type MediaHandle } from '../capture/source';
import { appBase } from '../capture/video';
import { startSession, type Session } from '../session/session';
import { getBaseline, getConfig, getVoiceOnboardingDismissed, getVoiceProfile, setVoiceOnboardingDismissed } from '../storage/db';
import { createFaceTracker, type FaceTracker } from '../vision/faceTracker';
import { runCalibration } from './calibrationView';
import { errorText } from './diag';
import { openPip, type PipWindow } from './pip';
import { navHtml } from './nav';
import { navigate } from './router';

export function renderStart(root: HTMLElement): void {
  root.innerHTML = `${navHtml('new')}
    <div id="onboarding"></div>
    <h1>Новая встреча</h1>
    <p class="muted">Откройте встречу в этом же браузере, в соседней вкладке. Звук и видео обрабатываются на этом компьютере и не сохраняются.</p>
    <div class="row"><input type="text" id="title" placeholder="Название встречи (необязательно)" style="flex:1;min-width:240px"></div>
    <div class="row">
      <label><input type="radio" name="mode" value="live" checked> Камера</label>
      <label><input type="radio" name="mode" value="file"> Файл</label>
      <input type="file" id="file" accept="video/*" hidden>
    </div>
    <div class="row"><button class="primary" id="start">Начать</button></div>
    <div id="msg" class="error"></div>`;
  void showOnboarding(root.querySelector<HTMLElement>('#onboarding')!);
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
      const [config, prev, f, voice] = await Promise.all([getConfig(), getBaseline(), createFaceTracker(appBase()), getVoiceProfile()]);
      face = f;
      // Одна калибровка на 5 с перед каждой встречей: взгляд и спокойное лицо.
      const baseline = await runCalibration(root, 'full', { stream: source.videoStream, face, cfg: config, prev });
      source.pause();
      if (endedEarly) throw new Error('Файл закончился во время калибровки. Возьмите запись длиннее.');
      pip = await waitForPipClick(root);
      root.innerHTML = '<h1>Загружаю модели…</h1><p class="muted">Подсказки по лицу появятся через несколько секунд, распознавание речи — после загрузки модели (около 45 МБ, один раз).</p>';
      const session = await startSession({ source, pip, config, baseline, title, face, voice });
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

/** Первый запуск: предложить записать голос. «Позже» скрывает предложение насовсем; запись остаётся в Настройках. */
export async function showOnboarding(el: HTMLElement): Promise<void> {
  const [profile, dismissed] = await Promise.all([getVoiceProfile(), getVoiceOnboardingDismissed()]);
  if (profile || dismissed) return;
  el.innerHTML = `<div class="card onboarding">
    <h2>Сначала запишите голос</h2>
    <p>30 секунд чтения вслух. Суфлёр будет отличать вашу речь от голосов коллег и точнее считать «э-э».</p>
    <div class="row"><a class="button primary" href="#/voice">Записать голос</a><button id="later">Позже</button></div>
    <p class="muted small">Записать можно в любой момент в Настройках.</p>
  </div>`;
  el.querySelector<HTMLButtonElement>('#later')!.onclick = async () => {
    await setVoiceOnboardingDismissed();
    el.replaceChildren();
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
  root.innerHTML = `${navHtml('new')}
    <h1>Встреча идёт</h1>
    <p class="muted">Подсказки — в маленьком окне. Эту вкладку можно свернуть.</p>
    <p class="muted">Выключили камеру в созвоне — нажмите «Камера выключена» здесь или кнопку с камерой в окне подсказок: подсказки по лицу встанут на паузу, по речи — продолжатся.</p>
    <div class="row"><button class="primary" id="end">Завершить</button><button id="cam"></button><button id="reopen" hidden>Открыть окно подсказок</button></div>`;
  const reopen = root.querySelector<HTMLButtonElement>('#reopen')!;
  const camBtn = root.querySelector<HTMLButtonElement>('#cam')!;
  // Выключенную камеру в созвоне суфлёр сам не видит: у страницы нет доступа к вкладке созвона.
  let cameraOff = false;
  let currentPip: PipWindow | null = pip;
  const paint = () => {
    camBtn.textContent = cameraOff ? 'Камера снова включена' : 'Камера выключена';
    currentPip?.setCameraOff(cameraOff);
  };
  const toggleCamera = () => {
    cameraOff = !cameraOff;
    session.setCameraOff(cameraOff);
    paint();
  };
  camBtn.onclick = toggleCamera;
  const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
  window.addEventListener('beforeunload', warn);
  const finish = async () => {
    const m = await session.stop();
    window.removeEventListener('beforeunload', warn);
    navigate(`#/report/${encodeURIComponent(m.id)}`);
  };
  const wire = (p: PipWindow) => {
    currentPip = p;
    p.onEnd(() => void finish());
    p.onCameraToggle(toggleCamera);
    paint();
  };
  wire(pip);
  root.querySelector<HTMLButtonElement>('#end')!.onclick = () => void finish();
  session.onPipClosed(() => { reopen.hidden = false; currentPip = null; });
  reopen.onclick = async () => {
    const p = await openPip();
    session.reattach(p);
    wire(p);
    reopen.hidden = true;
  };
  source.onEnded(() => void finish());
}
