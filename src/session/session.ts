import { createAsr, type Asr } from '../audio/asr';
import { startAudioTap, type AudioTap } from '../audio/audioTap';
import { FillerTracker } from '../audio/fillerTracker';
import { findFillers, normalize } from '../audio/fillers';
import { HesitationPipeline, type Segment } from '../audio/hesitation';
import { keepOwnSegments, OwnSpeech } from '../audio/ownSpeech';
import { Vad } from '../audio/vad';
import { hesitationProbability } from '../audio/hesitationModel';
import { createVoiceEmbedder, type VoiceEmbedder } from '../audio/voiceClient';
import { VOICE_MODEL_ID } from '../audio/voiceEnroll';
import { VoiceGate } from '../audio/voiceGate';
import type { MediaHandle } from '../capture/source';
import { appBase, attachVideo } from '../capture/video';
import type { Config } from '../config/defaults';
import { RuleEngine } from '../rules/engine';
import { saveBaseline, saveMeeting } from '../storage/db';
import type { Baseline, Box, CoachEvent, FillerHit, HandFrame, Hint, Meeting, VoiceProfile } from '../types';
import type { PipWindow } from '../ui/pip';
import { createFaceTracker, type FaceTracker } from '../vision/faceTracker';
import { createHandTracker, type HandTracker } from '../vision/handTracker';
import { everyMs, startAnalysisLoop, startIntervalLoop } from '../vision/loop';
import { ACTIVITY_VERSION, effectiveActivityNorm } from '../vision/calibration';
import { computeFrameSignals, HandHold, handNear } from '../vision/signals';
import { BrowLevel, ExpressionWindow } from '../vision/window';
import { buildMeeting, CameraClock, freshHits, LastFiller, pickStatus, type SpeechState } from './meeting';

export interface Session {
  stop(): Promise<Meeting>;
  /** Подключить заново открытое окно подсказок. */
  reattach(pip: PipWindow): void;
  onPipClosed(cb: () => void): void;
  /** Модель речи загрузилась или не загрузилась. Режим файла ждёт этого, чтобы не терять начало записи. */
  speechSettled: Promise<void>;
  /** Камера в созвоне выключена: подсказки по лицу и рукам на паузе, речь анализируется. */
  setCameraOff(off: boolean): void;
}

export interface SessionOptions {
  source: MediaHandle;
  pip: PipWindow;
  config: Config;
  baseline: Baseline;
  title: string;
  /** Уже загруженный трекер лица (после калибровки), чтобы не грузить модель дважды. */
  face?: FaceTracker;
  /** Голосовой профиль: отличать свою речь от чужой и подстроить «э-э». */
  voice?: VoiceProfile | null;
}

const CHECKPOINT_MS = 30_000;
const STALE_HIT_MS = 3_000;
const FALLBACK_TICK_MS = 100;
const OWN_SPEECH_GRACE_MS = 2_500;
const OWN_HESITATION_PAD_MS = 3_000;

export async function startSession(o: SessionOptions): Promise<Session> {
  const { config, baseline } = o;
  const base = appBase();
  const t0 = performance.now();
  const startedAt = new Date().toISOString();
  const id = crypto.randomUUID();

  const tap: AudioTap = await startAudioTap(o.source.audioStream);
  const [faceR, handR] = await Promise.allSettled([
    o.face ? Promise.resolve(o.face) : createFaceTracker(base),
    createHandTracker(base),
  ]);
  const face: FaceTracker | null = faceR.status === 'fulfilled' ? faceR.value : null;
  const hands: HandTracker | null = handR.status === 'fulfilled' ? handR.value : null;
  [faceR, handR].forEach(r => { if (r.status === 'rejected') console.error(r.reason); });

  const engine = new RuleEngine(config);
  const browLevel = new BrowLevel(config, ((baseline.blendshapes.browDownLeft ?? 0) + (baseline.blendshapes.browDownRight ?? 0)) / 2);
  const window_ = new ExpressionWindow(config, effectiveActivityNorm(baseline) || config.face.activityNormDefault);
  const tracker = new FillerTracker(config.fillers);
  const vad = new Vad(config);
  const own = new OwnSpeech(config);
  // Профиль записан другой моделью — отпечатки несравнимы, профиль не используется.
  const profile = o.voice && o.voice.model === VOICE_MODEL_ID && tap.sampleRate === 16000 ? o.voice : null;
  const shift = profile?.hesitationShift ?? [];
  const hesitation = new HesitationPipeline(config, tap.sampleRate, (m, b, d) => hesitationProbability(m, b, d, shift));
  const events: CoachEvent[] = [];
  let pending: FillerHit[] = [];
  let droppedForeignWords = 0;
  const lastFiller = new LastFiller(4000);
  let speaking = false;
  let streamStart: number | null = null;
  let stopping = false;

  // «э-э»: отрезок без слова. Подтверждается, когда распознаватель выдал слова дальше него (в конце фразы).
  const onHesitations = (segs: Segment[]) => {
    if (!config.enabled.filler) return;
    for (const s of keepOwnSegments(segs, own, OWN_HESITATION_PAD_MS)) {
      const { hit, event } = tracker.addHesitation(s.start);
      events.push({ ...event, durationMs: s.end - s.start });
      pending.push({ ...hit, tMs: performance.now() }); // вспышка — сейчас, в отчёте — время самого «э-э»
    }
  };

  // Модель голоса грузится в фоне; до загрузки своя речь определяется по рту, как без профиля.
  let gate: VoiceGate | null = null;
  let embedder: VoiceEmbedder | null = null;
  if (profile) {
    createVoiceEmbedder(base).then(
      e => {
        if (stopping) { e.close(); return; }
        embedder = e;
        gate = new VoiceGate(config, s => e.embed(s), profile.embedding);
        own.setVoice(gate);
      },
      e => console.error(e),
    );
  }

  // звук: «говорит» сразу, распознавание — когда загрузится модель
  tap.onFrame((f, t) => {
    speaking = vad.push(f, t);
    hesitation.push(f, t);
    gate?.push(f, t, speaking);
  });

  let asr: Asr | null = null;
  let speech: SpeechState = 'loading';
  const speechSettled = createAsr(base + 'models/vosk-ru.tar.gz', tap.sampleRate, config.asr).then(
    a => {
      if (stopping) { void a.stop(); return; }
      asr = a;
      speech = 'ok';
      tap.onBatch(b => {
        streamStart ??= performance.now() - b.duration * 1000;
        a.accept(b);
      });
      a.onPartial(text => {
        const now = performance.now();
        // Пользователь не говорил последние 1,5 с — это голос собеседника из колонок.
        if (now - own.lastOwn() > OWN_SPEECH_GRACE_MS) return;
        const hits = tracker.onPartial(text, now);
        if (config.enabled.filler && hits.length) {
          pending.push(...hits);
          // Слово — в окно сразу, не дожидаясь следующего кадра анализа.
          hits.forEach(h => lastFiller.set(h.word, now));
          render(now);
        }
      });
      a.onFinal(words => {
        const off = streamStart ?? t0;
        const mine = words.filter(w => own.ownWithin(off + w.start * 1000 - 300, off + w.end * 1000 + 300));
        const foreign = words.filter(w => !mine.includes(w));
        droppedForeignWords += findFillers(foreign.map(w => normalize(w.word).join(' ')), config.fillers).length;
        const ev = tracker.onFinal(mine, off);
        if (config.enabled.filler) events.push(...ev);
        onHesitations(hesitation.onWords(words, streamStart ?? t0));
      });
    },
    e => { console.error(e); speech = 'failed'; },
  );

  // видео: в окне подсказок и запасное на странице
  let pip: PipWindow | null = o.pip;
  let video = attachVideo(pip.doc, o.source.videoStream);
  // Запасное видео на странице создаётся, только когда окно подсказок закрыто: второй поток — лишняя нагрузка.
  let fallbackVideo: HTMLVideoElement | null = null;
  const faceDue = everyMs(config.perf.faceIntervalMs);
  const handDue = everyMs(config.perf.handIntervalMs);
  let cameraOff = false;
  const cameraClock = new CameraClock(t0);
  let lastHands: HandFrame = { hands: [] };
  const handHold = new HandHold(config);
  let lastBox: Box | null = null;
  let lastBoxT = -Infinity;
  const closedCbs: (() => void)[] = [];
  let lastHint: Hint | null = null;
  let lastStatus: 'ok' | 'face-lost' = 'ok';

  const tick = (t: number) => {
    if (!faceDue(t)) return;
    // Лицо анализируется и при выключенной камере: по движению рта суфлёр отличает свою речь от чужой.
    const frame = face?.detect(video, t) ?? null;
    if (hands && !cameraOff && handDue(t)) lastHands = hands.detect(video, t);
    if (frame) browLevel.push(frame, t);
    const vision = frame && !cameraOff
      ? { ...computeFrameSignals(frame, lastHands, baseline, config, browLevel.level()), ...window_.push(frame, t) }
      : null;
    const hits = freshHits(pending, t, STALE_HIT_MS);
    pending = [];
    hits.forEach(h => lastFiller.set(h.word, h.tMs));
    own.mouth(frame, t);
    // Рука может закрыть лицо — тогда зона считается по последней рамке лица (до 3 с).
    if (frame) { lastBox = frame.box; lastBoxT = t; }
    const box = frame?.box ?? (t - lastBoxT <= config.hands.faceBoxMemoryMs ? lastBox : null);
    const handsNow = !cameraOff && handHold.update(box !== null && handNear(lastHands, box, config), t);
    const out = engine.update({ tMs: t, speaking: own.update(speaking, t), vision, fillerHits: hits, hands: handsNow });
    events.push(...out.closed);
    lastHint = out.hint;
    lastStatus = out.status;
    render(t);
  };

  function render(t: number): void {
    pip?.render({
      hint: lastHint,
      fillers: tracker.total(),
      lastFiller: lastFiller.get(t),
      status: pickStatus(lastStatus, face !== null, speech, cameraOff),
    });
  }

  let stopLoop = startAnalysisLoop(pip.win, tick);
  const watchClose = (p: PipWindow) => p.onClose(() => {
    if (pip !== p || stopping) return;
    pip = null;
    stopLoop();
    fallbackVideo ??= attachVideo(document, o.source.videoStream);
    video = fallbackVideo;
    // В фоновой вкладке requestAnimationFrame не срабатывает, таймер — срабатывает, хоть и реже.
    stopLoop = startIntervalLoop(tick, FALLBACK_TICK_MS);
    closedCbs.forEach(cb => cb());
  });
  watchClose(pip);

  const snapshot = (tEnd: number, extra: CoachEvent[]) => ({
    ...buildMeeting({ id, title: o.title, t0, tEnd, startedAt, totals: engine.totals(), events: [...events, ...extra] }),
    droppedForeignWords,
    cameraOnMs: Math.round(cameraClock.onMs(tEnd)),
    voice: (gate as VoiceGate | null)?.totals(),
  });
  // Промежуточное сохранение: закрытая вкладка не теряет встречу целиком.
  const checkpoint = setInterval(() => {
    const t = performance.now();
    void saveMeeting(snapshot(t, engine.snapshot(t))).catch(console.error);
  }, CHECKPOINT_MS);

  let stopped: Promise<Meeting> | null = null;
  return {
    reattach(p) {
      stopLoop();
      pip = p;
      video = attachVideo(p.doc, o.source.videoStream);
      stopLoop = startAnalysisLoop(p.win, tick);
      watchClose(p);
    },
    onPipClosed(cb) { closedCbs.push(cb); },
    speechSettled,
    setCameraOff(off) { cameraOff = off; cameraClock.set(off, performance.now()); },
    stop() {
      stopped ??= (async () => {
        stopping = true;
        clearInterval(checkpoint);
        stopLoop();
        // Сначала дослушать последнюю фразу, потом закрывать звук.
        // Если модель ещё грузится, не ждём: обработчик загрузки сам её закроет (stopping = true).
        await (asr as Asr | null)?.stop();
        // Без распознавания отличить «э-э» от гласной в слове нельзя — тогда оставшиеся отрезки не засчитываются.
        if (speech === 'ok') onHesitations(hesitation.flush());
        const tEnd = performance.now();
        events.push(...engine.finish(tEnd));
        face?.close(); hands?.close(); tap.stop(); o.source.stop();
        (embedder as VoiceEmbedder | null)?.close();
        fallbackVideo?.remove();
        const p = pip;
        pip = null;
        p?.close();
        const meeting = snapshot(tEnd, []);
        await saveMeeting(meeting);
        const norm = window_.sampledNorm();
        if (norm !== null) await saveBaseline({ ...baseline, activityNorm: norm, activityVersion: ACTIVITY_VERSION });
        return meeting;
      })();
      return stopped;
    },
  };
}

