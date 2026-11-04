/**
 * Создаёт <video> с потоком камеры в документе окна подсказок. Окно остаётся видимым,
 * поэтому Chrome не останавливает декодирование кадров, когда вкладка суфлёра в фоне.
 */
export function attachVideo(doc: Document, stream: MediaStream): HTMLVideoElement {
  const v = doc.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.autoplay = true;
  v.srcObject = stream;
  v.style.cssText = 'position:absolute;left:0;bottom:0;width:160px;opacity:0;pointer-events:none;';
  doc.body.append(v);
  void v.play().catch(() => { /* autoplay muted разрешён; повтор при следующем кадре не нужен */ });
  return v;
}

export function appBase(): string {
  return new URL('./', location.href).href;
}
