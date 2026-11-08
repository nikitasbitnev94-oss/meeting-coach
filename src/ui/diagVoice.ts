import { startAudioTap, type AudioTap } from '../audio/audioTap';
import { Vad } from '../audio/vad';
import { createVoiceEmbedder, type VoiceEmbedder } from '../audio/voiceClient';
import { VOICE_MODEL_ID } from '../audio/voiceEnroll';
import { VoiceGate } from '../audio/voiceGate';
import { openMicrophone } from '../capture/source';
import { appBase } from '../capture/video';
import { getConfig, getVoiceProfile } from '../storage/db';
import { errorText } from './diag';

const STEPS = [
  { id: 'me', title: 'Говорю я', hint: 'Говорите свободно, как на встрече: о планах, о работе. 30 секунд речи.' },
  { id: 'other', title: 'Говорит другой', hint: 'Молчите. Пусть говорит другой человек рядом или видео с речью на телефоне (не в этом браузере: его звук браузер вычитает из микрофона). 30 секунд речи.' },
];
const STEP_SPEECH_MS = 30_000;

/**
 * Запись для подбора порога «свой или чужой голос»: сходство с профилем на своей и на чужой речи.
 * Сохраняются только числа сходства; звук не сохраняется.
 */
export function renderVoiceCheck(el: HTMLElement): void {
  el.innerHTML = `
    <h2>Проверка голоса</h2>
    <p class="muted">Два шага по 30 секунд речи: говорите вы, потом другой человек. Суфлёр показывает сходство с вашим голосовым профилем; по файлу подбирается порог. Сохраняются только числа.</p>
    <div class="row"><button class="primary" id="vgo">Начать</button></div>
    <div id="vmsg" class="error"></div>
    <div id="vstate" class="card" hidden></div>`;
  const go = el.querySelector<HTMLButtonElement>('#vgo')!;
  const msg = el.querySelector<HTMLElement>('#vmsg')!;
  const state = el.querySelector<HTMLElement>('#vstate')!;

  go.onclick = async () => {
    msg.textContent = '';
    const profile = await getVoiceProfile();
    if (!profile || profile.model !== VOICE_MODEL_ID) {
      msg.innerHTML = 'Сначала запишите голосовой профиль: <a href="#/voice">записать</a>.';
      return;
    }
    go.disabled = true;
    go.textContent = 'Загружаю модель голоса…';
    let emb: VoiceEmbedder | null = null, tap: AudioTap | null = null, mic: MediaStream | null = null;
    const cleanup = () => { tap?.stop(); mic?.getTracks().forEach(t => t.stop()); emb?.close(); };
    try {
      const cfg = await getConfig();
      emb = await createVoiceEmbedder(appBase());
      mic = await openMicrophone();
      tap = await startAudioTap(mic);
      const results: { id: string; scores: number[] }[] = [];
      for (const step of STEPS) {
        const scores: number[] = [];
        const e = emb;
        const gate = new VoiceGate(cfg, s => e.embed(s), profile.embedding);
        gate.onVerdict = v => scores.push(Math.round(v.score * 1000) / 1000);
        const vad = new Vad(cfg);
        let speechMs = 0;
        state.hidden = false;
        await new Promise<void>(resolve => {
          state.innerHTML = `<b>${step.title}</b><p>${step.hint}</p><div class="meter"><div id="vbar"></div></div><p id="vnow" class="muted">Жду речь…</p>
            <div class="row"><button id="vnext">Готово, дальше</button></div>`;
          const bar = state.querySelector<HTMLElement>('#vbar')!, now = state.querySelector<HTMLElement>('#vnow')!;
          state.querySelector<HTMLButtonElement>('#vnext')!.onclick = () => resolve();
          let done = false;
          tap!.onFrame((f, t) => {
            if (done) return;
            const sp = vad.push(f, t);
            gate.push(f, t, sp);
            if (sp) speechMs += 20;
            bar.style.width = `${Math.min(100, Math.round((speechMs / STEP_SPEECH_MS) * 100))}%`;
            const last = scores[scores.length - 1];
            now.textContent = last === undefined ? 'Жду речь…'
              : `Сходство с профилем: ${last.toFixed(2)} → ${last >= cfg.voice.threshold ? 'ваш голос' : 'чужой голос'} (порог ${cfg.voice.threshold})`;
            if (speechMs >= STEP_SPEECH_MS) { done = true; resolve(); }
          });
        });
        results.push({ id: step.id, scores });
      }
      const avgMs = Math.round(emb.avgMs());
      cleanup();
      const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
      const share = (xs: number[]) => (xs.length ? xs.filter(x => x >= cfg.voice.threshold).length / xs.length : NaN);
      const out = { version: 1, model: VOICE_MODEL_ID, threshold: cfg.voice.threshold, avgEmbedMs: avgMs, steps: results };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
      a.download = `golos-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      state.innerHTML = `<table><tr><th>Шаг</th><th>Отрезков</th><th>Среднее сходство</th><th>Признано вашим</th></tr>
        ${results.map((r, i) => `<tr><td>${STEPS[i].title}</td><td>${r.scores.length}</td><td>${mean(r.scores).toFixed(2)}</td><td>${Math.round(share(r.scores) * 100)}%</td></tr>`).join('')}</table>
        <p class="muted">Расчёт одного отпечатка: ${avgMs} мс. Файл ${a.download} в загрузках — пришлите его в чат.</p>`;
    } catch (e) {
      cleanup();
      msg.textContent = errorText(e);
    } finally {
      go.disabled = false;
      go.textContent = 'Начать заново';
    }
  };
}
