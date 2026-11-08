import { openFileSource, openLiveSource, SourceError, type MediaHandle } from '../capture/source';
import { startAudioTap } from '../audio/audioTap';
import { createAsr } from '../audio/asr';
import { findFillers, normalize, tally } from '../audio/fillers';
import { HesitationConfirmer, HesitationDetector, HesitationPipeline, pitch } from '../audio/hesitation';
import { rms } from '../audio/vad';
import { OwnSpeech } from '../audio/ownSpeech';
import { LabelRecorder } from '../diag/labeling';
import { spectrumExport } from '../diag/offline';
import { EXPRESSION_STEPS, ExpressionRecorder } from '../diag/expressions';
import { HAND_STEPS, HandRecorder } from '../diag/hands';
import { clock } from '../report/summary';
import { getBaseline, getConfig } from '../storage/db';
import { appBase, attachVideo } from '../capture/video';
import { DEFAULT_CONFIG } from '../config/defaults';
import type { Box, FaceFrame, HandFrame } from '../types';
import { createFaceTracker, type FaceTracker } from '../vision/faceTracker';
import { createHandTracker, type HandTracker } from '../vision/handTracker';
import { everyMs, RateMeter, startAnalysisLoop } from '../vision/loop';
import { computeFrameSignals, handNear } from '../vision/signals';
import { gazeAngles } from '../vision/calibration';
import { openPip, type PipWindow } from './pip';
import { navHtml } from './nav';

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
    ${navHtml('settings')}
    <p><a href="#/settings">← Настройки</a></p>
    <h1>Диагностика</h1>
    <p class="muted">Проверка камеры, окна подсказок и распознавания. Ничего не сохраняется.</p>
    <h2>Камера</h2>
    <div class="row"><button class="primary" id="cam">Запустить камеру и окно подсказок</button><button id="stop" disabled>Остановить</button></div>
    <div id="msg" class="error"></div>
    <pre id="out" class="card">Нажмите кнопку, чтобы начать.</pre>
    <div id="speech"></div>
    <div id="labeling"></div>
    <div id="spectrum"></div>
    <div id="mimic"></div>
    <div id="handsrec"></div>`;
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
      const mouth = new OwnSpeech(DEFAULT_CONFIG);
      let lastFace: FaceFrame | null = null;
      let lastHands: HandFrame = { hands: [] };
      let prev: Record<string, number> | null = null;
      const deltas: { t: number; d: number }[] = [];

      stopLoop = startAnalysisLoop(pip.win, t => {
        if (faceDue(t)) {
          const t0 = performance.now();
          lastFace = face!.detect(video, t);
          mouth.mouth(lastFace, t);
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
            `рот: размах за 0,7 с ${f2(mouth.mouthRange())} (порог «говорю» ${DEFAULT_CONFIG.vad.mouthMoveDelta})`,
            ...TRACKED.map(k => `${k}: ${f2(fr.blendshapes[k] ?? 0)}`),
          );
        } else {
          lines.push('лица не видно');
        }
        out.textContent = lines.join('\n');
        stats.textContent = lines.slice(0, 2).join('\n');
        pip!.render({ hint: null, fillers: 0, lastFiller: null, status: fr ? 'ok' : 'face-lost' });
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
  renderSpectrum(root.querySelector<HTMLElement>('#spectrum')!);
  renderMimic(root.querySelector<HTMLElement>('#mimic')!);
  renderHandsRecording(root.querySelector<HTMLElement>('#handsrec')!);
}

/** Разметка рук по шагам: касания и жесты без касаний. Числа точек и уверенность детектора, без изображения. */
function renderHandsRecording(el: HTMLElement): void {
  el.innerHTML = `
    <h2>Разметка рук</h2>
    <p class="muted">Страница по очереди попросит: убрать руки, пожестикулировать, подержать руку у лица, коснуться щеки, подбородка, волос, шеи — каждое отдельно левой и правой рукой. Около 2 минут.
    Сидите как на встрече, на том же месте и с тем же фоном. В файл попадают только координаты точек рук и лица, изображения нет.</p>
    <div class="row"><button id="hgo" class="primary">Начать разметку рук</button></div>
    <div id="hmsg" class="error"></div>
    <div id="hstep" style="font-size:24px;font-weight:600;min-height:32px"></div>
    <div id="hleft" class="muted"></div>
    <div id="hfired" class="card muted">Здесь будет видно, сработала ли «рука у лица».</div>
    <video id="hvideo" muted playsinline autoplay style="width:240px;border-radius:8px;transform:scaleX(-1)"></video>`;
  const go = el.querySelector<HTMLButtonElement>('#hgo')!;
  const msg = el.querySelector<HTMLElement>('#hmsg')!;
  const stepEl = el.querySelector<HTMLElement>('#hstep')!;
  const left = el.querySelector<HTMLElement>('#hleft')!;
  const firedEl = el.querySelector<HTMLElement>('#hfired')!;
  const video = el.querySelector<HTMLVideoElement>('#hvideo')!;

  go.onclick = async () => {
    go.disabled = true;
    msg.textContent = '';
    let source: MediaHandle | null = null;
    let face: FaceTracker | null = null;
    let hands: HandTracker | null = null;
    try {
      const cfg = await getConfig();
      source = await openLiveSource();
      video.srcObject = source.videoStream;
      await video.play().catch(() => {});
      stepEl.textContent = 'Загружаю модели…';
      [face, hands] = await Promise.all([createFaceTracker(appBase()), createHandTracker(appBase(), 0.3)]);
      const rec = new HandRecorder();
      const due = everyMs(200);
      let lastBox: Box | null = null;
      for (const step of HAND_STEPS) {
        stepEl.textContent = step.text;
        await new Promise(r => setTimeout(r, 1500));
        const end = performance.now() + step.ms;
        await new Promise<void>(resolve => {
          const loop = () => {
            const t = performance.now();
            if (t >= end) { resolve(); return; }
            if (due(t)) {
              const f = face!.detect(video, t);
              if (f) lastBox = f.box;
              const h = hands!.detect(video, t);
              const fired = lastBox !== null && handNear(h, lastBox, cfg);
              rec.frame(step.id, t, f?.box ?? null, h, fired);
              firedEl.textContent = `рук в кадре: ${h.hands.length}${h.scores?.length ? ` (уверенность ${h.scores.map(x => x.toFixed(2)).join(', ')})` : ''} · рука у лица: ${fired ? 'да' : 'нет'}`;
              left.textContent = `${Math.ceil((end - t) / 1000)} с`;
            }
            requestAnimationFrame(loop);
          };
          requestAnimationFrame(loop);
        });
      }
      stepEl.textContent = 'Готово';
      left.textContent = '';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(rec.export())], { type: 'application/json' }));
      a.download = `ruki-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      firedEl.textContent = `Файл ${a.download} в загрузках — пришлите его в чат.`;
    } catch (e) {
      msg.textContent = errorText(e);
    } finally {
      face?.close(); hands?.close(); source?.stop();
      go.disabled = false;
    }
  };
}

/** Запись мимики по шагам: числа параметров лица и сработавшие сигналы. Для подбора порогов под пользователя. */
function renderMimic(el: HTMLElement): void {
  el.innerHTML = `
    <h2>Запись мимики</h2>
    <p class="muted">Страница по очереди попросит показать 10 выражений, около 50 секунд. Сначала пройдите калибровку на главной странице.
    В файл попадают только числа параметров лица (брови, уголки рта и т. п.), изображения нет.</p>
    <div class="row"><button id="mgo" class="primary">Начать запись мимики</button></div>
    <div id="mmsg" class="error"></div>
    <div id="mstep" style="font-size:24px;font-weight:600;min-height:32px"></div>
    <div id="mleft" class="muted"></div>
    <div id="mfired" class="card muted">Сработавшие сигналы появятся здесь.</div>
    <video id="mvideo" muted playsinline autoplay style="width:240px;border-radius:8px;transform:scaleX(-1)"></video>`;
  const go = el.querySelector<HTMLButtonElement>('#mgo')!;
  const msg = el.querySelector<HTMLElement>('#mmsg')!;
  const stepEl = el.querySelector<HTMLElement>('#mstep')!;
  const left = el.querySelector<HTMLElement>('#mleft')!;
  const firedEl = el.querySelector<HTMLElement>('#mfired')!;
  const video = el.querySelector<HTMLVideoElement>('#mvideo')!;

  go.onclick = async () => {
    go.disabled = true;
    msg.textContent = '';
    let source: MediaHandle | null = null;
    let face: FaceTracker | null = null;
    try {
      const [cfg, baseline] = await Promise.all([getConfig(), getBaseline()]);
      if (!baseline) throw new Error('Сначала пройдите калибровку на главной странице.');
      source = await openLiveSource();
      video.srcObject = source.videoStream;
      await video.play().catch(() => {});
      stepEl.textContent = 'Загружаю модель лица…';
      face = await createFaceTracker(appBase());
      const rec = new ExpressionRecorder();
      const due = everyMs(100);
      const noHands: HandFrame = { hands: [] };
      for (const step of EXPRESSION_STEPS) {
        stepEl.textContent = step.text;
        // 1,5 с на то, чтобы принять выражение — не записываются
        await new Promise(r => setTimeout(r, 1500));
        const end = performance.now() + step.ms;
        await new Promise<void>(resolve => {
          const loop = () => {
            const t = performance.now();
            if (t >= end) { resolve(); return; }
            if (due(t)) {
              const f = face!.detect(video, t);
              const sig = f ? computeFrameSignals(f, noHands, baseline, cfg) : null;
              const fired = sig ? Object.entries(sig).filter(([k, v]) => v === true && k !== 'gazeOnCamera').map(([k]) => k) : [];
              rec.frame(step.id, t, f?.blendshapes ?? null, fired);
              firedEl.textContent = f ? (fired.length ? `Сработало: ${fired.join(', ')}` : 'Ничего не сработало') : 'Лица не видно';
              left.textContent = `${Math.ceil((end - t) / 1000)} с`;
            }
            requestAnimationFrame(loop);
          };
          requestAnimationFrame(loop);
        });
      }
      stepEl.textContent = 'Готово';
      left.textContent = '';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(rec.export())], { type: 'application/json' }));
      a.download = `mimika-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      firedEl.textContent = `Файл ${a.download} в загрузках — пришлите его в чат.`;
    } catch (e) {
      msg.textContent = errorText(e);
    } finally {
      face?.close();
      source?.stop();
      go.disabled = false;
    }
  };
}

/** Выгрузка спектра отрезков-кандидатов «э-э» для обучения. Файл обрабатывается без проигрывания. */
function renderSpectrum(el: HTMLElement): void {
  el.innerHTML = `
    <h2>Спектр кандидатов «э-э»</h2>
    <p class="muted">Выберите ту же запись, что размечали. Она обработается без проигрывания, обычно за 1–3 минуты.
    В файл попадёт спектр только коротких отрезков-кандидатов (около 0,3 с каждый, это протяжные гласные без слов) и те же числа, что при разметке. Целиком звук и текст не сохраняются.</p>
    <div class="row"><input type="file" id="sfile" accept="audio/*,video/*"><button id="sgo" class="primary" disabled>Выгрузить спектр кандидатов</button></div>
    <div id="smsg2" class="error"></div>
    <div id="sstate" class="card muted"></div>`;
  const file = el.querySelector<HTMLInputElement>('#sfile')!;
  const go = el.querySelector<HTMLButtonElement>('#sgo')!;
  const msg = el.querySelector<HTMLElement>('#smsg2')!;
  const state = el.querySelector<HTMLElement>('#sstate')!;
  file.onchange = () => { go.disabled = !file.files?.length; };
  go.onclick = async () => {
    const f = file.files?.[0];
    if (!f) return;
    go.disabled = true;
    msg.textContent = '';
    try {
      const out = await spectrumExport(f, await getConfig(), t => { state.textContent = t; });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
      a.download = `spektr-ee-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      state.textContent = `Готово: ${out.candidates.length} отрезков. Файл ${a.download} в загрузках — пришлите его в чат.`;
    } catch (e) {
      msg.textContent = errorText(e);
    } finally {
      go.disabled = false;
    }
  };
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
      const conf = new HesitationConfirmer(cfg);
      let t0 = 0;
      let streamStart: number | null = null;
      tap.onFrame((fr, t) => {
        const r = rms(fr);
        const p = r >= cfg.hesitation.minRms ? pitch(fr, tap.sampleRate) : null;
        rec.frame(r, p?.hz ?? 0, p?.corr ?? 0);
        const seg = hes.pushFeatures(r, p?.hz ?? 0, p?.corr ?? 0, t, 20);
        if (seg) conf.add(seg);
      });
      tap.onBatch(b => {
        streamStart ??= performance.now() - b.duration * 1000;
        asr.accept(b);
      });
      asr.onFinal(ws => {
        rec.words(ws, (streamStart ?? t0) - t0);
        conf.onWords(ws, streamStart ?? t0).forEach(s => rec.detected(s.start - t0));
      });
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
        conf.flush().forEach(s => rec.detected(s.start - t0));
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
      const hes = new HesitationPipeline(cfg, tap.sampleRate);
      let streamStart: number | null = null;
      const addHes = (segs: { start: number }[]) => segs.forEach(s => { found.push('э-э (по звуку)'); hesitations.push(s.start - t0); });
      tap.onFrame((fr, t) => hes.push(fr, t));
      tap.onBatch(b => {
        streamStart ??= performance.now() - b.duration * 1000;
        asr.accept(b);
      });
      asr.onPartial(t => { partial.textContent = t; });
      asr.onFinal(ws => {
        addHes(hes.onWords(ws, streamStart ?? t0));
        words += ws.length;
        found.push(...findFillers(ws.map(w => normalize(w.word)[0] ?? ''), cfg.fillers).map(h => h.word));
        draw(false);
      });
      t0 = performance.now();
      src.resume();
      draw(false);
      src.onEnded(() => {
        void asr.stop().then(() => { addHes(hes.flush()); tap.stop(); src.stop(); partial.textContent = ''; draw(true); go.disabled = false; });
      });
    } catch (e) {
      smsg.textContent = errorText(e);
      go.disabled = false;
    }
  };
}
