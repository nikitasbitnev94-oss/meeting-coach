/** Возвращает функцию «пора ли»: true не чаще раза в intervalMs. */
export function everyMs(intervalMs: number): (tMs: number) => boolean {
  let last = -Infinity;
  return tMs => {
    if (tMs - last < intervalMs) return false;
    // Шаг сетки, а не фактическое время кадра: иначе при 30 Гц частота падает до 7,5 к/с.
    last = last === -Infinity ? tMs : Math.max(last + intervalMs, tMs - intervalMs);
    return true;
  };
}

/**
 * Цикл анализа по requestAnimationFrame окна win (окно подсказок остаётся видимым,
 * когда вкладка суфлёра в фоне). Время — performance.now() главного окна,
 * чтобы все модули жили на одной шкале. Возвращает функцию остановки.
 */
export function startAnalysisLoop(win: Window, tick: (tMs: number) => void): () => void {
  let stopped = false;
  let id = 0;
  const frame = () => {
    if (stopped) return;
    try { tick(performance.now()); } catch (e) { console.error(e); }
    id = win.requestAnimationFrame(frame);
  };
  id = win.requestAnimationFrame(frame);
  return () => { stopped = true; win.cancelAnimationFrame(id); };
}

/** Частота событий и средняя длительность обработки за последнюю секунду (для диагностики). */
export class RateMeter {
  private items: { t: number; ms: number }[] = [];
  add(tMs: number, workMs: number): void {
    this.items.push({ t: tMs, ms: workMs });
    this.prune(tMs);
  }
  perSecond(tMs: number): number {
    this.prune(tMs);
    return this.items.length;
  }
  avgMs(tMs: number): number {
    this.prune(tMs);
    return this.items.length ? this.items.reduce((s, i) => s + i.ms, 0) / this.items.length : 0;
  }
  private prune(tMs: number): void {
    while (this.items.length && this.items[0].t <= tMs - 1000) this.items.shift();
  }
}

/** Запасной цикл на таймере, когда окна подсказок нет: requestAnimationFrame в фоновой вкладке не срабатывает. */
export function startIntervalLoop(tick: (tMs: number) => void, intervalMs: number): () => void {
  const id = setInterval(() => {
    try { tick(performance.now()); } catch (e) { console.error(e); }
  }, intervalMs);
  return () => clearInterval(id);
}
