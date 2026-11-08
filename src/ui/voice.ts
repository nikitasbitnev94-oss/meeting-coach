import { startAudioTap, type AudioTap } from '../audio/audioTap';
import { createVoiceEmbedder, type VoiceEmbedder } from '../audio/voiceClient';
import { VoiceEnroller } from '../audio/voiceEnroll';
import { openMicrophone } from '../capture/source';
import { appBase } from '../capture/video';
import { getConfig, saveVoiceProfile, setVoiceOnboardingDismissed } from '../storage/db';
import { errorText } from './diag';
import { navHtml } from './nav';

/** Текст для чтения: обычная деловая речь на 30–40 секунд. */
export const READING_TEXT = `Добрый день, коллеги. Давайте коротко пройдёмся по итогам месяца. Выручка выросла,
но расходы на маркетинг оказались выше плана, поэтому маржа почти не изменилась. Я предлагаю сегодня обсудить три вопроса.
Первый — какие каналы привлечения дают лучший результат и где мы тратим лишнее. Второй — что мешает команде запускать
эксперименты быстрее. Третий — какие решения нам нужно принять до конца квартала. По каждому вопросу у нас будет
десять минут. Если чего-то не хватает для решения, зафиксируем, кто и к какому сроку подготовит данные.`;

export function renderVoice(root: HTMLElement): void {
  root.innerHTML = `${navHtml('settings')}
    <h1>Голосовой профиль</h1>
    <p>Прочитайте вслух текст ниже обычным голосом, как на встрече. Нужно около 30 секунд речи.</p>
    <p class="muted">По профилю суфлёр отличает вашу речь от чужой: голоса коллег рядом или из колонок не попадут в слова-паразиты и «э-э». Ещё он подстраивает распознавание «э-э» под ваш голос и микрофон. Нужен только микрофон. Профиль — набор чисел, он хранится только в этом браузере; звук не сохраняется.</p>
    <div class="row"><button class="primary" id="go">Начать запись</button><a href="#/settings">Отмена</a></div>
    <div id="msg" class="error"></div>`;
  const go = root.querySelector<HTMLButtonElement>('#go')!;
  go.onclick = () => void record(root, go);
}

async function record(root: HTMLElement, go: HTMLButtonElement): Promise<void> {
  const msg = root.querySelector<HTMLElement>('#msg')!;
  msg.textContent = '';
  go.disabled = true;
  go.textContent = 'Загружаю модель голоса (около 20 МБ, один раз)…';
  let embedder: VoiceEmbedder | null = null;
  let mic: MediaStream | null = null;
  let tap: AudioTap | null = null;
  const cleanup = () => { tap?.stop(); mic?.getTracks().forEach(t => t.stop()); embedder?.close(); };
  try {
    const [cfg, emb, stream] = await Promise.all([getConfig(), createVoiceEmbedder(appBase()), openMicrophone()]);
    embedder = emb; mic = stream;
    tap = await startAudioTap(stream);
    if (tap.sampleRate !== 16000) throw new Error(`Микрофон работает на ${tap.sampleRate} Гц, нужно 16000. Попробуйте другой браузер.`);
    const enroller = new VoiceEnroller(cfg, s => emb.embed(s));
    root.innerHTML = `${navHtml('settings')}
      <h1>Читайте вслух</h1>
      <div class="card" style="font-size:18px;line-height:1.6">${READING_TEXT.replace(/\n/g, ' ')}</div>
      <div class="meter" aria-hidden="true"><div id="bar"></div></div>
      <p class="muted" id="state">Слушаю…</p>
      <div class="row"><button id="cancel">Отмена</button></div>`;
    const bar = root.querySelector<HTMLElement>('#bar')!;
    const state = root.querySelector<HTMLElement>('#state')!;
    let done = false;
    const result = new Promise<'done' | 'cancel'>(resolve => {
      root.querySelector<HTMLButtonElement>('#cancel')!.onclick = () => resolve('cancel');
      tap!.onFrame((f, t) => {
        if (done) return;
        enroller.push(f, t);
        const share = Math.min(1, enroller.speechMs() / cfg.voice.enrollMs);
        bar.style.width = `${Math.round(share * 100)}%`;
        state.textContent = `Речи записано: ${Math.round(enroller.speechMs() / 1000)} из ${cfg.voice.enrollMs / 1000} с`;
        if (enroller.enough()) resolve('done');
      });
    });
    const how = await result;
    done = true;
    tap.stop(); tap = null;
    mic.getTracks().forEach(t => t.stop()); mic = null;
    if (how === 'cancel') { cleanup(); location.hash = '#/settings'; return; }
    state.textContent = 'Считаю профиль…';
    const profile = await enroller.finish();
    cleanup();
    if (!profile) throw new Error('Не получилось посчитать профиль. Попробуйте ещё раз в тихом месте.');
    await saveVoiceProfile(profile);
    await setVoiceOnboardingDismissed();
    root.innerHTML = `${navHtml('settings')}
      <h1>Голос записан</h1>
      <p>Теперь суфлёр отличает вашу речь от чужой. Перезаписать или удалить профиль можно в Настройках.</p>
      <div class="row"><a class="button primary" href="#/">К новой встрече</a><a href="#/settings">В настройки</a></div>`;
  } catch (e) {
    cleanup();
    renderVoice(root);
    root.querySelector<HTMLElement>('#msg')!.textContent = errorText(e);
  }
}
