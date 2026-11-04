import { DEFAULT_CONFIG, type Config } from '../config/defaults';
import { validateConfig } from '../config/validate';
import { getConfig, saveConfig } from '../storage/db';
import type { HintId } from '../types';
import { esc } from './report';

const HINT_LABEL: Record<HintId, string> = {
  hands: 'Руки у лица', smirk: 'Усмешка', irritation: 'Раздражение', skepticism: 'Скепсис',
  surprise: 'Удивление', cheer: 'Излишняя весёлость', frown: 'Хмурость', expressive: 'Активная мимика',
  stone: 'Каменное лицо', gaze: 'Взгляд мимо камеры', filler: 'Слово-паразит', fillerBurst: '«Пауза вместо…» при 3 паразитах за минуту',
};

const FACE_LABEL: Record<string, string> = {
  frownDelta: 'Хмурость: опускание бровей', irritationBrowDelta: 'Раздражение: брови', irritationPressDelta: 'Раздражение: сжатые губы',
  skepticismAsym: 'Скепсис: разница бровей', skepticismSquintDelta: 'Скепсис: прищур', surpriseBrowDelta: 'Удивление: брови',
  surpriseJawDelta: 'Удивление: открытый рот', smirkAsym: 'Усмешка: разница уголков рта', smirkMinSmile: 'Усмешка: минимальная улыбка',
  cheerSmile: 'Весёлость: ширина улыбки', expressiveRatio: 'Активная мимика: во сколько раз выше нормы',
  expressiveWindowMs: 'Активная мимика: окно, мс', activityNormDefault: 'Норма активности до первой длинной встречи',
  stoneMs: 'Каменное лицо: без реакции, мс', reactionDelta: 'Каменное лицо: что считать реакцией', reactionPitchDeg: 'Каменное лицо: кивок, градусы',
};

const NAV = `<nav class="top"><a href="#/">Новая встреча</a><a href="#/history">История</a><a href="#/settings">Настройки</a></nav>`;

export async function renderSettings(root: HTMLElement): Promise<void> {
  let cfg = await getConfig();

  const draw = () => {
    const fillers = cfg.fillers.map((f, i) =>
      `<span class="card" style="display:inline-block;padding:4px 10px;margin:3px">${esc(f)} <a href="#" data-del="${i}" aria-label="удалить">×</a></span>`).join('');
    const enabled = (Object.keys(HINT_LABEL) as HintId[]).map(id =>
      `<label class="row"><input type="checkbox" data-en="${id}" ${cfg.enabled[id] ? 'checked' : ''}> ${HINT_LABEL[id]}</label>`).join('');
    const durations = (Object.keys(cfg.minDurationMs) as (keyof Config['minDurationMs'])[]).map(id =>
      `<label class="row"><input type="number" step="0.1" min="0" style="width:90px" data-dur="${id}" value="${cfg.minDurationMs[id] / 1000}"> с — ${HINT_LABEL[id]}</label>`).join('');
    const face = Object.keys(FACE_LABEL).map(k =>
      `<label class="row"><input type="number" step="any" min="0" style="width:110px" data-face="${k}" value="${(cfg.face as Record<string, number>)[k]}"> ${FACE_LABEL[k]}</label>`).join('');
    root.innerHTML = `${NAV}
      <h1>Настройки</h1>
      <h2>Слова-паразиты</h2>
      <div>${fillers || '<span class="muted">Список пуст.</span>'}</div>
      <div class="row"><input type="text" id="newWord" placeholder="слово или фраза"><button id="add">Добавить</button></div>
      <h2>Подсказки</h2>${enabled}
      <h2>Сколько держится сигнал до подсказки</h2>${durations}
      <h2>Пороги мимики</h2>
      <p class="muted">Отклонение от вашей нормы после калибровки, от 0 до 1.</p>${face}
      <h2>Взгляд</h2>
      <label class="row"><input type="number" min="0" style="width:90px" data-gaze="maxYawDeg" value="${cfg.gaze.maxYawDeg}"> градусов в сторону</label>
      <label class="row"><input type="number" min="0" style="width:90px" data-gaze="maxPitchDeg" value="${cfg.gaze.maxPitchDeg}"> градусов вверх или вниз</label>
      <div id="errors" class="error"></div>
      <div class="row"><button class="primary" id="save">Сохранить</button><button id="reset">Сбросить к значениям по умолчанию</button><span id="saved" class="muted"></span></div>`;

    root.querySelectorAll<HTMLAnchorElement>('[data-del]').forEach(a => a.onclick = e => {
      e.preventDefault();
      collect();
      cfg.fillers.splice(Number(a.dataset.del), 1);
      draw();
    });
    root.querySelector<HTMLButtonElement>('#add')!.onclick = () => {
      collect();
      const w = root.querySelector<HTMLInputElement>('#newWord')!.value;
      if (w.trim()) cfg.fillers.push(w);
      draw();
    };
    root.querySelector<HTMLButtonElement>('#save')!.onclick = async () => {
      collect();
      const r = validateConfig(cfg);
      const errEl = root.querySelector<HTMLElement>('#errors')!;
      if (!r.ok) {
        errEl.innerHTML = r.errors.map(esc).join('<br>');
        return;
      }
      cfg = r.config;
      await saveConfig(cfg);
      draw();
      root.querySelector<HTMLElement>('#saved')!.textContent = 'Сохранено';
    };
    root.querySelector<HTMLButtonElement>('#reset')!.onclick = () => {
      cfg = structuredClone(DEFAULT_CONFIG);
      draw();
    };
  };

  /** Переносит значения полей формы в cfg без проверки. */
  const collect = () => {
    root.querySelectorAll<HTMLInputElement>('[data-en]').forEach(i => { cfg.enabled[i.dataset.en as HintId] = i.checked; });
    root.querySelectorAll<HTMLInputElement>('[data-dur]').forEach(i => {
      (cfg.minDurationMs as Record<string, number>)[i.dataset.dur!] = i.value === '' ? NaN : Number(i.value) * 1000;
    });
    root.querySelectorAll<HTMLInputElement>('[data-face]').forEach(i => {
      (cfg.face as Record<string, number>)[i.dataset.face!] = i.value === '' ? NaN : Number(i.value);
    });
    root.querySelectorAll<HTMLInputElement>('[data-gaze]').forEach(i => {
      (cfg.gaze as Record<string, number>)[i.dataset.gaze!] = i.value === '' ? NaN : Number(i.value);
    });
  };

  draw();
}
