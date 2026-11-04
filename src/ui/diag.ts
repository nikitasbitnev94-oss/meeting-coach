import { openFileSource, openLiveSource, SourceError, type MediaHandle } from '../capture/source';
import { startAudioTap } from '../audio/audioTap';
import { createAsr } from '../audio/asr';
import { findFillers, normalize, tally } from '../audio/fillers';
import { HesitationDetector, pitch } from '../audio/hesitation';
import { rms } from '../audio/vad';
import { LabelRecorder } from '../diag/labeling';
import { clock } from '../report/summary';
import { getConfig } from '../storage/db';
import { appBase, attachVideo } from '../capture/video';
import { DEFAULT_CONFIG } from '../config/defaults';
import type { FaceFrame, HandFrame } from '../types';
import { createFaceTracker, type FaceTracker } from '../vision/faceTracker';
import { createHandTracker, type HandTracker } from '../vision/handTracker';
import { everyMs, RateMeter, startAnalysisLoop } from '../vision/loop';
import { computeFrameSignals } from '../vision/signals';
import { gazeAngles } from '../vision/calibration';
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

const TRACKED = ['browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthPressLeft', 'mouthPressRight', 'mouthFrownLeft', 'mouthFrownRight',
  'jawOpen', 'eyeSquintLeft', 'eyeSquintRight'];

const NEUTRAL = { blendshapes: {}, gazeYawDeg: 0, gazePitchDeg: 0, activityNorm: 1, createdAt: '' };
const f2 = (n: number) => n.toFixed(2);
const f0 = (n: number) => n.toFixed(0);

export function renderDiag(root: HTMLElement): void {
  root.innerHTML = `
    <nav class="top"><a href="#/">Суфлёр</a></nav>
    <h1>Диагностика</h1>
    <p class="muted">Проверка камеры, окна подсказок и распознавания. Ничего не сохраняется.</p>
    <h2>Камера</h2>
    <div class="row"><button class="primary" id="cam">Запустить камеру и окно подсказок</button><button id="stop" disabled>Остановить</button></div>
    <div id="msg" class="error"></div>
    <pre id="out" class="card">Нажмите кнопку, чтобы начать.</pre>
    <div id="speech"></div>
    <div id="labeling"></div>`;
  const msg = root.querySelector<HTMLElement>('#msg')!;
  const out = root.querySelector<HTMLElement>('#out')!;
  const camBtn = root.querySelector<HTMLButtonElement>('#cam')!;
  const stopBtn = root.querySelector<HTMLButtonElement>('#stop')!;
  let source: MediaHandle | null = null;
  let pip: PipWindow | null = null;
  let stopLoop: (() => void) | null = null;
  let face: FaceTracker | null = null;
  let hands: HandTracker | null = null;

  const stop = () => {
    stopLoop?.(); face?.close(); hands?.close(); source?.stop(); pip?.close();
    stopLoop = null; face = null; hands = null; source = null; pip = null;
    camBtn.disabled = false; stopBtn.disabled = true;
  };

  camBtn.onclick = async () => {
    msg.textContent = '';
    camBtn.disabled = true;
    try {
      source = await openLiveSource();
      pip = await openPip();
      pip.onClose(stop);
      out.textContent = 'Загружаю модели…';
      [face, hands] = await Promise.all([createFaceTracker(appBase()), createHandTracker(appBase())]);
      const video = attachVideo(pip.doc, source.videoStream);
      const stats = pip.doc.createElement('pre');
      stats.style.cssText = 'font-size:12px;margin:4px 0 0;';
      pip.doc.querySelector('.pip')!.append(stats);

      const faceDue = everyMs(100), handDue = everyMs(200), showDue = everyMs(250);
      const faceRate = new RateMeter(), handRate = new RateMeter();
      let lastFace: FaceFrame | null = null;
      let lastHands: HandFrame = { hands: [] };
      let prev: Record<string, number> | null = null;
      const deltas: { t: number; d: number }[] = [];

      stopLoop = startAnalysisLoop(pip.win, t => {
        if (faceDue(t)) {
          const t0 = performance.now();
          lastFace = face!.detect(video, t);
          faceRate.add(t, performance.now() - t0);
          if (lastFace) {
            if (prev) deltas.push({ t, d: TRACKED.reduce((s, k) => s + Math.abs((lastFace!.blendshapes[k] ?? 0) - (prev![k] ?? 0)), 0) });
            prev = lastFace.blendshapes;
          }
          while (deltas.length && deltas[0].t < t - 30000) deltas.shift();
        }
        if (handDue(t)) {
          const t0 = performance.now();
          lastHands = hands!.detect(video, t);
          handRate.add(t, performance.now() - t0);
        }
        if (!showDue(t)) return;
        const lines = [
          `лицо: ${faceRate.perSecond(t)} к/с, ${f0(faceRate.avgMs(t))} мс/кадр`,
          `руки: ${handRate.perSecond(t)} к/с, ${f0(handRate.avgMs(t))} мс/кадр, в кадре ${lastHands.hands.length}`,
        ];
        const fr = lastFace as FaceFrame | null;
        if (fr) {
          const { yawDeg: yaw, pitchDeg: pitch } = gazeAngles(fr, DEFAULT_CONFIG);
          lines.push(
            `голова yaw ${f0(fr.headYawDeg)}° pitch ${f0(fr.headPitchDeg)}°`,
            `глаза yaw ${f2(fr.eyeYaw)} pitch ${f2(fr.eyePitch)}`,
            `взгляд суммарно yaw ${f0(yaw)}° pitch ${f0(pitch)}°`,
            `активность мимики за 30 с: ${f2(deltas.reduce((s, x) => s + x.d, 0))}`,
            `рука у лица: ${computeFrameSignals(fr, lastHands, NEUTRAL, DEFAULT_CONFIG).handNearFace ? 'да' : 'нет'}`,
            ...TRACKED.map(k => `${k}: ${f2(fr.blendshapes[k] ?? 0)}`),
          );
        } else {
          lines.push('лица не видно');
        }
        out.textContent = lines.join('\n');
        stats.textContent = lines.slice(0, 2).join('\n');
        pip!.render({ hint: null, fillers: 0, gazeShare: null, status: fr ? 'ok' : 'face-lost' });
      });
      stopBtn.disabled = false;
    } catch (e) {
      msg.textContent = errorText(e);
      stop();
    }
  };
  stopBtn.onclick = stop;

  renderSpeechCheck(root.querySelector<HTMLElement>('#speech')!);
  renderLabeling(root.querySelector<HTMLElement>('#labeling')!);
}

/**
 * Разметка «э-э»: пользователь слушает запись и жмёт пробел на каждом «эээ».
 * Сохраняется файл только с числами (громкость, тон, границы слов без текста, отметки).
 */
function renderLabeling(el: HTMLElement): void {
  el.innerHTML = `
    <h2>Разметка «э-э»</h2>
    <p class="muted">Включите запись и нажимайте <b>пробел</b> каждый раз, когда слышите «эээ» или «ммм». Достаточно первых 5 минут — потом нажмите «Закончить».
    В сохранённом файле только числа: громкость и тон каждые 20 мс, время начала и конца слов без самих слов, ваши отметки. Звука и текста в нём нет.</p>
    <div class="row"><input type="file" id="lfile" accept="audio/*,video/*"><button id="lgo" class="primary" disabled>Начать разметку</button><button id="lend" disabled>Закончить и сохранить файл</button></div>
    <div id="lmsg" class="error"></div>
    <div id="lstate" class="card muted">Отметок: 0</div>`;
  const file = el.querySelector<HTMLInputElement>('#lfile')!;
  const go = el.querySelector<HTMLButtonElement>('#lgo')!;
  const end = el.querySelector<HTMLButtonElement>('#lend')!;
  const msg = el.querySelector<HTMLElement>('#lmsg')!;
  const state = el.querySelector<HTMLElement>('#lstate')!;
  file.onchange = () => { go.disabled = !file.files?.length; };

  go.onclick = async () => {
    const f = file.files?.[0];
    if (!f) return;
    go.disabled = true;
    msg.textContent = '';
    state.textContent = 'Загружаю модель распознавания…';
    try {
      const cfg = await getConfig();
      const src = await openFileSource(f);
      src.pause();
      const tap = await startAudioTap(src.audioStream);
      const asr = await createAsr(appBase() + 'models/vosk-ru.tar.gz', tap.sampleRate, cfg.asr);
      const rec = new LabelRecorder(cfg.fillers, tap.sampleRate);
      const hes = new HesitationDetector(cfg, tap.sampleRate);
      let t0 = 0;
      let streamStart: number | null = null;
      tap.onFrame((fr, t) => {
        const p = pitch(fr, tap.sampleRate);
        rec.frame(rms(fr), p?.hz ?? 0, p?.corr ?? 0);
        const h = hes.push(fr, t);
        if (h !== null) rec.detected(h - t0);
      });
      tap.onBatch(b => {
        streamStart ??= performance.now() - b.duration * 1000;
        asr.accept(b);
      });
      asr.onFinal(ws => rec.words(ws, (streamStart ?? t0) - t0));
      const onKey = (e: KeyboardEvent) => {
        if (e.code !== 'Space') return;
        e.preventDefault();
        rec.label(performance.now() - t0);
        state.textContent = `Отметок: ${rec.labelCount()}`;
      };
      let finished = false;
      const finish = async () => {
        if (finished) return;
        finished = true;
        document.removeEventListener('keydown', onKey);
        end.disabled = true;
        const duration = performance.now() - t0;
        src.pause();
        await asr.stop();
        tap.stop(); src.stop();
        const blob = new Blob([JSON.stringify(rec.export(duration))], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `razmetka-ee-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        state.textContent = `Готово. Отметок: ${rec.labelCount()}. Файл ${a.download} сохранён в загрузки — пришлите его в чат.`;
        go.disabled = false;
      };
      // Пробел не должен нажимать кнопки и открывать выбор файла.
      (document.activeElement as HTMLElement | null)?.blur();
      document.addEventListener('keydown', onKey);
      end.onclick = () => void finish();
      src.onEnded(() => void finish());
      t0 = performance.now();
      src.resume();
      end.disabled = false;
      state.textContent = 'Слушайте и жмите пробел на каждом «эээ». Отметок: 0';
    } catch (e) {
      msg.textContent = errorText(e);
      go.disabled = false;
    }
  };
}

/** Замер распознавания: файл с речью → таблица паразитов. Текст показывается и не сохраняется. */
function renderSpeechCheck(el: HTMLElement): void {
  el.innerHTML = `
    <h2>Распознавание речи</h2>
    <p class="muted">Выберите запись своей речи (аудио или видео). Посчитайте паразиты вручную и сравните с таблицей.</p>
    <div class="row"><input type="file" id="file" accept="audio/*,video/*"><button id="go" class="primary" disabled>Распознать</button></div>
    <div id="smsg" class="error"></div>
    <div id="partial" class="card muted"></div>
    <div id="table"></div>`;
  const file = el.querySelector<HTMLInputElement>('#file')!;
  const go = el.querySelector<HTMLButtonElement>('#go')!;
  const smsg = el.querySelector<HTMLElement>('#smsg')!;
  const partial = el.querySelector<HTMLElement>('#partial')!;
  const table = el.querySelector<HTMLElement>('#table')!;
  file.onchange = () => { go.disabled = !file.files?.length; };

  go.onclick = async () => {
    const f = file.files?.[0];
    if (!f) return;
    go.disabled = true;
    smsg.textContent = '';
    partial.textContent = 'Загружаю модель распознавания (около 45 МБ, один раз)…';
    const found: string[] = [];
    const hesitations: number[] = [];
    let words = 0;
    let t0 = 0;
    const draw = (done: boolean) => {
      const rows = tally(found).map(r => `<tr><td>${r.word}</td><td>${r.count}</td></tr>`).join('');
      table.innerHTML = `<table><tr><th>Слово</th><th>Найдено</th></tr>${rows}
        <tr><td><b>Всего паразитов</b></td><td><b>${found.length}</b></td></tr></table>
        <p class="muted">Распознано слов: ${words}. ${done ? 'Готово.' : 'Идёт распознавание…'}</p>
        ${hesitations.length ? `<p class="muted">«э-э» по звуку, время от начала записи: ${hesitations.map(clock).join(', ')}</p>` : ''}`;
    };
    try {
      const cfg = await getConfig();
      const src = await openFileSource(f);
      src.pause(); // не терять начало записи, пока грузится модель
      const tap = await startAudioTap(src.audioStream);
      const asr = await createAsr(appBase() + 'models/vosk-ru.tar.gz', tap.sampleRate, cfg.asr);
      const hes = new HesitationDetector(cfg, tap.sampleRate);
      tap.onFrame((fr, t) => {
        const h = hes.push(fr, t);
        if (h !== null) { found.push('э-э (по звуку)'); hesitations.push(h - t0); draw(false); }
      });
      tap.onBatch(b => asr.accept(b));
      asr.onPartial(t => { partial.textContent = t; });
      asr.onFinal(ws => {
        words += ws.length;
        found.push(...findFillers(ws.map(w => normalize(w.word)[0] ?? ''), cfg.fillers).map(h => h.word));
        draw(false);
      });
      t0 = performance.now();
      src.resume();
      draw(false);
      src.onEnded(() => {
        void asr.stop().then(() => { tap.stop(); src.stop(); partial.textContent = ''; draw(true); go.disabled = false; });
      });
    } catch (e) {
      smsg.textContent = errorText(e);
      go.disabled = false;
    }
  };
}
