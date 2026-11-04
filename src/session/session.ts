import { createAsr, type Asr } from '../audio/asr';
import { startAudioTap, type AudioTap } from '../audio/audioTap';
import { FillerTracker } from '../audio/fillerTracker';
import { HesitationDetector } from '../audio/hesitation';
import { Vad } from '../audio/vad';
import type { MediaHandle } from '../capture/source';
import { appBase, attachVideo } from '../capture/video';
import type { Config } from '../config/defaults';
import { RuleEngine } from '../rules/engine';
import { saveBaseline, saveMeeting } from '../storage/db';
import type { Baseline, CoachEvent, FillerHit, HandFrame, Meeting } from '../types';
import type { PipWindow } from '../ui/pip';
import { createFaceTracker, type FaceTracker } from '../vision/faceTracker';
import { createHandTracker, type HandTracker } from '../vision/handTracker';
import { everyMs, startAnalysisLoop } from '../vision/loop';
import { computeFrameSignals } from '../vision/signals';
import { ExpressionWindow } from '../vision/window';
import { buildMeeting, pickStatus } from './meeting';

export interface Session {
  stop(): Promise<Meeting>;
  /** Подключить заново открытое окно подсказок. */
  reattach(pip: PipWindow): void;
  onPipClosed(cb: () => void): void;
}

export interface SessionOptions {
  source: MediaHandle;
  pip: PipWindow;
  config: Config;
  baseline: Baseline;
  title: string;
  /** Уже загруженный трекер лица (после калибровки), чтобы не грузить модель дважды. */
  face?: FaceTracker;
}

export async function startSession(o: SessionOptions): Promise<Session> {
  const { config, baseline } = o;
  const base = appBase();
  const t0 = performance.now();
  const startedAt = new Date().toISOString();

  const tap: AudioTap = await startAudioTap(o.source.audioStream);
  const [faceR, handR, asrR] = await Promise.allSettled([
    o.face ? Promise.resolve(o.face) : createFaceTracker(base),
    createHandTracker(base),
    createAsr(base + 'models/vosk-ru.tar.gz', tap.sampleRate),
  ]);
  const face: FaceTracker | null = faceR.status === 'fulfilled' ? faceR.value : null;
  const hands: HandTracker | null = handR.status === 'fulfilled' ? handR.value : null;
  const asr: Asr | null = asrR.status === 'fulfilled' ? asrR.value : null;
  [faceR, handR, asrR].forEach(r => { if (r.status === 'rejected') console.error(r.reason); });

  const engine = new RuleEngine(config);
  const window_ = new ExpressionWindow(config, baseline.activityNorm);
  const tracker = new FillerTracker(config.fillers);
  const vad = new Vad(config);
  const hesitation = new HesitationDetector(config, tap.sampleRate);
  const events: CoachEvent[] = [];
  const pending: FillerHit[] = [];
  let speaking = false;
  let streamStart: number | null = null;

  // звук
  tap.onFrame((f, t) => {
    speaking = vad.push(f, t);
    const h = hesitation.push(f, t);
    if (h !== null && config.enabled.filler) {
      const { hit, event } = tracker.addHesitation(h);
      pending.push(hit);
      events.push(event);
    }
  });
  if (asr) {
    tap.onBatch(b => {
      streamStart ??= performance.now() - b.duration * 1000;
      asr.accept(b);
    });
    asr.onPartial(text => {
      const hits = tracker.onPartial(text, performance.now());
      if (config.enabled.filler) pending.push(...hits);
    });
    asr.onFinal(words => {
      const ev = tracker.onFinal(words, streamStart ?? t0);
      if (config.enabled.filler) events.push(...ev);
    });
  }

  // видео: в окне подсказок и запасное на странице
  let pip: PipWindow | null = o.pip;
  let video = attachVideo(pip.doc, o.source.videoStream);
  const fallbackVideo = attachVideo(document, o.source.videoStream);
  const faceDue = everyMs(100);
  const handDue = everyMs(200);
  let lastHands: HandFrame = { hands: [] };
  const closedCbs: (() => void)[] = [];

  const tick = (t: number) => {
    if (!faceDue(t)) return;
    const frame = face?.detect(video, t) ?? null;
    if (hands && handDue(t)) lastHands = hands.detect(video, t);
    const vision = frame
      ? { ...computeFrameSignals(frame, lastHands, baseline, config), ...window_.push(frame, t) }
      : null;
    const out = engine.update({ tMs: t, speaking, vision, fillerHits: pending.splice(0) });
    events.push(...out.closed);
    pip?.render({
      hint: out.hint,
      fillers: tracker.total(),
      gazeShare: out.gazeShare,
      status: pickStatus(out.status, face !== null, asr !== null),
    });
  };

  let stopLoop = startAnalysisLoop(pip.win, tick);
  const watchClose = (p: PipWindow) => p.onClose(() => {
    if (pip !== p) return;
    pip = null;
    stopLoop();
    video = fallbackVideo;
    stopLoop = startAnalysisLoop(window, tick);
    closedCbs.forEach(cb => cb());
  });
  watchClose(pip);

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
    stop() {
      stopped ??= (async () => {
        const tEnd = performance.now();
        stopLoop();
        events.push(...engine.finish(tEnd));
        face?.close(); hands?.close(); asr?.stop(); tap.stop(); o.source.stop();
        fallbackVideo.remove();
        const p = pip;
        pip = null;
        p?.close();
        const meeting = buildMeeting({
          id: crypto.randomUUID(), title: o.title, t0, tEnd, startedAt, totals: engine.totals(), events,
        });
        await saveMeeting(meeting);
        const norm = window_.sampledNorm();
        if (norm !== null) await saveBaseline({ ...baseline, activityNorm: norm });
        return meeting;
      })();
      return stopped;
    },
  };
}
