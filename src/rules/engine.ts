import { HINT_PRIORITY, type Config, type RuleId } from '../config/defaults';
import type { CoachEvent, FillerHit, Hint, HintId, VisionSignals } from '../types';

export interface EngineInput { tMs: number; speaking: boolean; vision: VisionSignals | null; fillerHits: FillerHit[] }
export interface EngineOutput { hint: Hint | null; closed: CoachEvent[]; status: 'ok' | 'face-lost'; gazeShare: number | null }

const RULES: RuleId[] = ['hands', 'smirk', 'irritation', 'skepticism', 'surprise', 'cheer', 'frown', 'expressive', 'stone', 'gaze'];
const rank = (id: HintId) => HINT_PRIORITY.indexOf(id);

/** Сигналы → подсказка в окне и события для отчёта. Чистая логика, время приходит извне. */
export class RuleEngine {
  private onset = new Map<RuleId, number>();
  private open = new Set<RuleId>();
  private current: { hint: Hint; since: number } | null = null;
  private lastShown = new Map<HintId, number>();
  private flash: { hint: Hint; until: number } | null = null;
  private recentFillers: FillerHit[] = [];
  private lostSince: number | null = null;
  private prevT: number | null = null;
  private speakingMs = 0;
  private speakingWithFaceMs = 0;
  private onCameraMs = 0;

  constructor(private cfg: Config) {}

  update(i: EngineInput): EngineOutput {
    const t = i.tMs;
    const d = this.cfg.display;
    const v = i.vision;

    // доля взгляда
    const dt = this.prevT === null ? 0 : Math.max(0, Math.min(t - this.prevT, d.maxTickGapMs));
    this.prevT = t;
    if (i.speaking) {
      this.speakingMs += dt;
      if (v) {
        this.speakingWithFaceMs += dt;
        if (v.gazeOnCamera) this.onCameraMs += dt;
      }
    }

    // лицо в кадре
    if (v) this.lostSince = null;
    else this.lostSince ??= t;
    const status = this.lostSince !== null && t - this.lostSince >= d.faceLostMs ? 'face-lost' : 'ok';

    // условия и события
    const closed: CoachEvent[] = [];
    const fired = new Set<RuleId>();
    for (const id of RULES) {
      const on = this.cfg.enabled[id] && v !== null && this.condition(id, v, i.speaking);
      if (on) {
        if (!this.onset.has(id)) this.onset.set(id, t);
        if (t - this.onset.get(id)! >= this.cfg.minDurationMs[id]) {
          fired.add(id);
          this.open.add(id);
        }
      } else {
        closed.push(...this.close(id, t));
        this.onset.delete(id);
      }
    }

    // паразиты
    for (const h of i.fillerHits) this.onFiller(h, t);
    while (this.recentFillers.length && this.recentFillers[0].tMs <= t - d.burstWindowMs) this.recentFillers.shift();
    if (this.flash && t >= this.flash.until) this.flash = null;

    // выбор подсказки
    const candidates: Hint[] = [...fired].map(id => ({ id, text: this.cfg.texts[id] }));
    if (this.flash) candidates.push(this.flash.hint);
    const active = (id: HintId) => candidates.some(c => c.id === id);
    const eligible = candidates.filter(c => c.id === this.current?.hint.id || !this.inCooldown(c.id, t));
    eligible.sort((a, b) => rank(a.id) - rank(b.id));
    const best = eligible[0] ?? null;
    const cur = this.current;

    if (!cur) {
      if (best) this.show(best, t);
    } else if (best && rank(best.id) < rank(cur.hint.id)) {
      this.show(best, t);
    } else if (best && best.id === cur.hint.id) {
      if (best.text !== cur.hint.text) this.current = { hint: best, since: t };
    } else if (!active(cur.hint.id) && t - cur.since >= d.minShowMs) {
      this.current = null;
      if (best) this.show(best, t);
    }

    return { hint: this.current?.hint ?? null, closed, status, gazeShare: this.share() };
  }

  /** Закрывает открытые события в конце встречи. */
  finish(tMs: number): CoachEvent[] {
    const out: CoachEvent[] = [];
    for (const id of RULES) out.push(...this.close(id, tMs));
    this.onset.clear();
    return out;
  }

  /** Открытые события как если бы они закончились в tMs; состояние не меняется. Для промежуточного сохранения. */
  snapshot(tMs: number): CoachEvent[] {
    return [...this.open].map(id => {
      const start = this.onset.get(id)!;
      return { type: id, tMs: start, durationMs: tMs - start };
    });
  }

  totals(): { speakingMs: number; speakingWithFaceMs: number; onCameraMs: number } {
    return { speakingMs: this.speakingMs, speakingWithFaceMs: this.speakingWithFaceMs, onCameraMs: this.onCameraMs };
  }

  private condition(id: RuleId, v: VisionSignals, speaking: boolean): boolean {
    const f = this.cfg.face;
    switch (id) {
      case 'hands': return v.handNearFace;
      case 'smirk': return v.smirk && !speaking;
      case 'irritation': return v.irritation;
      case 'skepticism': return v.skepticism;
      case 'surprise': return v.surprise;
      case 'cheer': return v.cheer && !speaking;
      case 'frown': return v.frown;
      case 'expressive': return v.expressivityRatio >= f.expressiveRatio;
      case 'stone': return v.stillMs >= f.stoneMs && !speaking;
      case 'gaze': return !v.gazeOnCamera && speaking;
    }
  }

  private close(id: RuleId, t: number): CoachEvent[] {
    if (!this.open.has(id)) return [];
    this.open.delete(id);
    const start = this.onset.get(id)!;
    return [{ type: id, tMs: start, durationMs: t - start }];
  }

  private onFiller(h: FillerHit, t: number): void {
    this.recentFillers.push(h);
    const d = this.cfg.display;
    const inWindow = this.recentFillers.filter(x => x.tMs > t - d.burstWindowMs);
    if (this.cfg.enabled.fillerBurst && inWindow.length >= d.burstCount && !this.inCooldown('fillerBurst', t)) {
      const word = mostFrequent(inWindow.map(x => x.word));
      this.flash = { hint: { id: 'fillerBurst', text: this.cfg.texts.fillerBurst.replace('{word}', word) }, until: t + d.fillerFlashMs };
    } else if (this.cfg.enabled.filler) {
      this.flash = { hint: { id: 'filler', text: this.cfg.texts.filler.replace('{word}', h.word) }, until: t + d.fillerFlashMs };
    }
  }

  private inCooldown(id: HintId, t: number): boolean {
    if (id === 'filler') return false;
    const last = this.lastShown.get(id);
    return last !== undefined && t - last < this.cfg.display.cooldownMs;
  }

  private show(h: Hint, t: number): void {
    this.current = { hint: h, since: t };
    this.lastShown.set(h.id, t);
  }

  private share(): number | null {
    return this.speakingWithFaceMs > 0 ? this.onCameraMs / this.speakingWithFaceMs : null;
  }
}

function mostFrequent(words: string[]): string {
  const m = new Map<string, number>();
  let best = words[0], bestN = 0;
  for (const w of words) {
    const n = (m.get(w) ?? 0) + 1;
    m.set(w, n);
    if (n > bestN) { best = w; bestN = n; }
  }
  return best;
}
