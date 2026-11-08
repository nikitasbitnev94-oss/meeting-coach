export interface MediaHandle {
  videoStream: MediaStream;
  audioStream: MediaStream;
  kind: 'live' | 'file';
  stop(): void;
  onEnded(cb: () => void): void;
  /** Только для файла: пауза между калибровкой и началом сессии, чтобы не потерять часть записи. */
  pause(): void;
  resume(): void;
}

export type SourceErrorReason = 'denied' | 'busy' | 'missing';

/** Ошибка доступа к камере или микрофону. Имя MediaError занято в DOM. */
export class SourceError extends Error {
  constructor(public reason: SourceErrorReason, cause?: unknown) {
    super(reason);
    this.cause = cause;
  }
}

export function reasonOf(e: unknown): SourceErrorReason | null {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing';
  return null;
}

export async function openLiveSource(): Promise<MediaHandle> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
  } catch (e) {
    const reason = reasonOf(e);
    if (reason) throw new SourceError(reason, e);
    throw e;
  }
  const endedCbs: (() => void)[] = [];
  stream.getTracks().forEach(t => t.addEventListener('ended', () => endedCbs.forEach(cb => cb())));
  return {
    videoStream: new MediaStream(stream.getVideoTracks()),
    audioStream: new MediaStream(stream.getAudioTracks()),
    kind: 'live',
    stop: () => stream.getTracks().forEach(t => t.stop()),
    onEnded: cb => { endedCbs.push(cb); },
    pause: () => {},
    resume: () => {},
  };
}

/** Только микрофон — для записи голосового профиля. */
export async function openMicrophone(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
  } catch (e) {
    const reason = reasonOf(e);
    if (reason) throw new SourceError(reason, e);
    throw e;
  }
}

export async function openFileSource(file: File): Promise<MediaHandle> {
  const video = document.createElement('video');
  video.src = URL.createObjectURL(file);
  video.playsInline = true;
  await video.play();
  const captured = (video as HTMLVideoElement & { captureStream(): MediaStream }).captureStream();
  const endedCbs: (() => void)[] = [];
  video.addEventListener('ended', () => endedCbs.forEach(cb => cb()));
  return {
    videoStream: new MediaStream(captured.getVideoTracks()),
    audioStream: new MediaStream(captured.getAudioTracks()),
    kind: 'file',
    stop: () => { video.pause(); URL.revokeObjectURL(video.src); },
    onEnded: cb => { endedCbs.push(cb); },
    pause: () => video.pause(),
    resume: () => { void video.play(); },
  };
}
