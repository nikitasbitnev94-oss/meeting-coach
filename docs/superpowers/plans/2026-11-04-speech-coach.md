# Суфлёр для онлайн-встреч — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Браузерная страница, которая во время онлайн-встречи анализирует камеру и микрофон локально и показывает подсказки по словам-паразитам, взгляду, мимике и рукам у лица, а после встречи — отчёт.

**Architecture:** Статическое одностраничное приложение. Чистые модули (сигналы, калибровка, детекторы речи, движок правил, сводка отчёта) не зависят от браузера и покрыты тестами. Обёртки над MediaPipe и Vosk, окно Document Picture-in-Picture и сессия связывают их с камерой и микрофоном. Цикл анализа идёт от окна подсказок, распознавание речи — в Web Worker внутри vosk-browser.

**Tech Stack:** TypeScript 5, Vite 8, Vitest 5, `@mediapipe/tasks-vision` 1.2.x, `vosk-browser` 0.0.8, `idb` 8, `fake-indexeddb` 6 (тесты), GitHub Pages + GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-04-speech-coach-design.md`

## Global Constraints

- Браузеры: Chrome или Edge версии 116+ на Windows и macOS. Телефоны не поддерживаются.
- Во время работы страница обращается только к своему origin. Никаких внешних CDN и API.
- Звук, видео и текст распознавания не сохраняются ни в памяти дольше обработки, ни в IndexedDB, ни в логах. Сохраняются только события: тип, время, длительность, слово.
- Частота анализа: лицо 10 кадров/с, руки 5 кадров/с.
- Задержка подсказки: лицо и руки ≤ 1 с после достижения порога, слова-паразиты ≤ 2 с после слова.
- Все пороги, тексты подсказок и список паразитов — только из `Config` (`src/config/defaults.ts`). Числа в коде сигналов и движка запрещены.
- Тексты интерфейса на русском. Тексты подсказок — дословно из `defaults.ts`.
- Сборка с `base: './'`: сайт работает из подпапки GitHub Pages.
- Модели: MediaPipe Face Landmarker и Hand Landmarker (float16, v1), `vosk-model-small-ru-0.22`. Все Apache 2.0, хостятся вместе с сайтом.

## Review Focus

1. Встреча, где пользователь не сказал ни слова: отчёт показывает «—» вместо паразитов в минуту и доли взгляда, без деления на ноль. Тест в задаче 10.
2. Лицо пропало из кадра посреди условия (наклонился, вышел): открытые события закрываются, подсказки по лицу не появляются, время без лица не входит в долю взгляда, через 5 с статус «лицо не в кадре». Тесты в задаче 8.
3. Частичный результат Vosk переписывает уже показанные слова: счётчик не уходит в минус и не удваивается, повторных вспышек нет, итог после финального результата равен финальному числу. Тест в задаче 7.
4. Калибровка, во время которой пользователь отвернулся или вышел из кадра: калибровка отклоняется с причиной, старая норма не перезаписывается. Тест в задаче 5.
5. Встреча на 3 часа: окна паразитов за 60 с и активности мимики за 30 с не растут без ограничения. Тесты в задачах 6 и 8.

---

## Структура файлов

```
speech-coach/
  package.json, tsconfig.json, vite.config.ts, index.html
  scripts/fetch-assets.sh            скачивание моделей и wasm в public/
  .github/workflows/deploy.yml        тесты, сборка, публикация на Pages
  src/
    types.ts                          общие типы
    config/defaults.ts                пороги, тексты, приоритеты, паразиты
    config/validate.ts                проверка настроек
    storage/db.ts                     IndexedDB: встречи, настройки, калибровка
    capture/source.ts                 живой источник и файл
    vision/headPose.ts                поворот головы из матрицы
    vision/faceTracker.ts             обёртка Face Landmarker → FaceFrame
    vision/handTracker.ts             обёртка Hand Landmarker → HandFrame
    vision/signals.ts                 сигналы кадра относительно нормы
    vision/window.ts                  активность мимики и «каменное лицо»
    vision/calibration.ts             накопление калибровки
    audio/capture-worklet.ts          AudioWorkletProcessor: кадры по 20 мс
    audio/audioTap.ts                 микрофон → кадры → подписчики
    audio/vad.ts                      «говорит пользователь»
    audio/hesitation.ts               детектор «э-э», «м-м»
    audio/fillers.ts                  поиск паразитов в словах
    audio/fillerTracker.ts            частичные и финальные результаты
    audio/asr.ts                      обёртка vosk-browser
    rules/engine.ts                   сигналы → подсказка, события
    report/summary.ts                 сводка встречи
    session/session.ts                связка всего на время встречи
    ui/router.ts, ui/pip.ts, ui/start.ts, ui/calibrationView.ts,
    ui/report.ts, ui/settings.ts, ui/diag.ts, ui/styles.css
    main.ts
  tests/                              зеркалит src/
```

## Общие типы (`src/types.ts`, создаётся в задаче 1)

```ts
export type HintId = 'hands' | 'smirk' | 'irritation' | 'skepticism' | 'surprise'
  | 'cheer' | 'frown' | 'expressive' | 'stone' | 'gaze' | 'filler' | 'fillerBurst';
export type EventType = Exclude<HintId, 'fillerBurst'>;   // 'filler' несёт word

export interface Box { x: number; y: number; w: number; h: number }      // нормированные 0..1
export interface FaceFrame {
  blendshapes: Record<string, number>;   // имена MediaPipe, 0..1
  headYawDeg: number; headPitchDeg: number;
  eyeYaw: number; eyePitch: number;      // -1..1 из eyeLook*
  box: Box;
}
export interface HandFrame { hands: { x: number; y: number }[][] }       // нормированные
export interface Baseline {
  blendshapes: Record<string, number>;
  gazeYawDeg: number; gazePitchDeg: number;
  activityNorm: number; createdAt: string;
}
export interface FrameSignals {
  gazeOnCamera: boolean; frown: boolean; irritation: boolean; skepticism: boolean;
  surprise: boolean; smirk: boolean; cheer: boolean; handNearFace: boolean;
}
export interface VisionSignals extends FrameSignals { expressivityRatio: number; stillMs: number }
export interface FillerHit { word: string; tMs: number }
export interface AsrWord { word: string; start: number; end: number }   // секунды от начала потока
export interface CoachEvent { type: EventType; tMs: number; durationMs: number; word?: string }
export interface Hint { id: HintId; text: string }
export interface Meeting {
  id: string; title: string; startedAt: string; durationMs: number;
  speakingMs: number; speakingWithFaceMs: number; onCameraMs: number;
  events: CoachEvent[];
}
```

---

### Task 1: Каркас, конфиг по умолчанию, сборка и публикация

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/types.ts`, `src/config/defaults.ts`, `src/ui/router.ts`, `src/main.ts`, `src/ui/styles.css`, `scripts/fetch-assets.sh`, `.github/workflows/deploy.yml`
- Test: `tests/config/defaults.test.ts`

**Interfaces:**
- Produces: все типы из `src/types.ts`; `DEFAULT_CONFIG: Config`, `type Config`, `HINT_PRIORITY: HintId[]`; `route(path: string, render: (root: HTMLElement, params: string[]) => void)`, `startRouter(root: HTMLElement)`; маршруты `#/`, `#/calibrate`, `#/report/:id`, `#/history`, `#/settings`, `#/diag`.

- [ ] **Step 1: Инициализировать проект**

`npm init -y`; зависимости: `@mediapipe/tasks-vision@^1.2.2 vosk-browser@0.0.8 idb@^8`; dev: `typescript@^5 vite@^8 vitest@^5 fake-indexeddb@^6 happy-dom`. Скрипты: `dev`, `build` (`tsc --noEmit && vite build`), `test` (`vitest run`), `assets` (`bash scripts/fetch-assets.sh`). `vite.config.ts`: `base: './'`, `test.environment: 'node'`. `.gitignore`: `node_modules`, `dist`, `public/models`, `public/mediapipe-wasm`.

- [ ] **Step 2: Написать падающий тест конфига**

```ts
import { DEFAULT_CONFIG, HINT_PRIORITY } from '../../src/config/defaults';
test('приоритеты: порядок из спеки, без повторов', () => {
  expect(HINT_PRIORITY).toEqual(['hands','smirk','irritation','skepticism','surprise',
    'cheer','frown','expressive','stone','gaze','fillerBurst','filler']);
});
test('у каждой подсказки есть текст', () => {
  for (const id of HINT_PRIORITY) expect(DEFAULT_CONFIG.texts[id]).toBeTruthy();
});
test('список паразитов по умолчанию', () => {
  expect(DEFAULT_CONFIG.fillers).toEqual(['ну','вот','как бы','типа','короче','в общем',
    'это самое','так сказать','значит','получается','собственно','просто','наверно','наверное']);
});
```

- [ ] **Step 3: Запустить — FAIL** (`npx vitest run tests/config`, модуль не найден)

- [ ] **Step 4: Создать `src/types.ts` (код выше) и `src/config/defaults.ts`**

Значения из спеки, дословно:

```ts
export const HINT_PRIORITY: HintId[] = ['hands','smirk','irritation','skepticism','surprise',
  'cheer','frown','expressive','stone','gaze','fillerBurst','filler'];
export const DEFAULT_CONFIG = {
  fillers: ['ну','вот','как бы','типа','короче','в общем','это самое','так сказать',
    'значит','получается','собственно','просто','наверно','наверное'],
  enabled: { hands:true, smirk:true, irritation:true, skepticism:true, surprise:true, cheer:true,
    frown:true, expressive:true, stone:true, gaze:true, filler:true, fillerBurst:true },
  texts: { hands:'руки от лица', smirk:'усмешка', irritation:'раздражение', skepticism:'скепсис',
    surprise:'удивление', cheer:'улыбка', frown:'расслабь брови', expressive:'мимика спокойнее',
    stone:'кивни, отреагируй', gaze:'в камеру', filler:'{word}', fillerBurst:'пауза вместо «{word}»' },
  minDurationMs: { hands:1000, smirk:1500, irritation:2000, skepticism:2000, surprise:1500,
    cheer:3000, frown:3000, expressive:0, stone:0, gaze:3000 },
  display: { minShowMs:2000, cooldownMs:60000, fillerFlashMs:2000, burstCount:3, burstWindowMs:60000,
    faceLostMs:5000, maxTickGapMs:500 },
  face: { frownDelta:0.25, irritationBrowDelta:0.2, irritationPressDelta:0.2,
    skepticismAsym:0.25, skepticismSquintDelta:0.3, surpriseBrowDelta:0.3, surpriseJawDelta:0.25,
    smirkAsym:0.25, smirkMinSmile:0.3, cheerSmile:0.6,
    expressiveRatio:2, expressiveWindowMs:30000, activityNormDefault:3.0,
    stoneMs:180000, reactionDelta:0.15, reactionPitchDeg:5 },
  gaze: { maxYawDeg:12, maxPitchDeg:10, eyeYawRangeDeg:30, eyePitchRangeDeg:25, eyeYawSign:1 },
  hands: { zoneUp:0.4, zoneSide:0.2, zoneDown:0.5 },
  vad: { hangoverMs:700, minRms:0.01, noiseRatio:3 },
  hesitation: { minRunMs:400, minRms:0.02, maxPitchDrift:0.1, minCorr:0.5 },
  calibration: { fullMs:20000, gazeMs:5000, minFaceShare:0.7, maxGazeStdDeg:4 },
};
export type Config = typeof DEFAULT_CONFIG;
```

`activityNormDefault: 3.0` и `eyeYawSign: 1` — стартовые значения, уточняются по диагностической странице (задача 3). `{word}` в текстах подставляет слово.

- [ ] **Step 5: Запустить тест — PASS**

- [ ] **Step 6: Роутер, `index.html`, `main.ts`, заглушки страниц**

`index.html` с `<div id="app">`. Роутер по `location.hash`, шаблон `#/report/:id` отдаёт `params = [id]`. Каждый маршрут пока рисует заголовок страницы. Стили: системный шрифт, светлая и тёмная тема через `prefers-color-scheme`.

- [ ] **Step 7: `scripts/fetch-assets.sh`**

Скачивает в `public/models/`:
- `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`
- `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`
- `https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip` → распаковать → `tar -czf public/models/vosk-ru.tar.gz vosk-model-small-ru-0.22`

Копирует `node_modules/@mediapipe/tasks-vision/wasm/*` в `public/mediapipe-wasm/`. `set -euo pipefail`, повторный запуск пропускает уже скачанные файлы.

- [ ] **Step 8: `.github/workflows/deploy.yml`**

На push в `main`: `actions/checkout@v4`, `actions/setup-node@v4` (node 22, cache npm), `npm ci`, `npm test`, `npm run assets`, `npm run build`, `actions/upload-pages-artifact@v3` с `dist`, `actions/deploy-pages@v4`. Права: `pages: write`, `id-token: write`.

- [ ] **Step 9: Проверить сборку**

Run: `npm test && npx tsc --noEmit && npx vite build`
Expected: тесты PASS, сборка без ошибок (без моделей — они нужны только в рантайме).

- [ ] **Step 10: Commit** `feat: каркас, конфиг по умолчанию, публикация`

**Контрольная точка A (пользователь).** Пользователь создаёт публичный репозиторий на GitHub, подключает его к сессии и включает Settings → Pages → Source: GitHub Actions. Исполнитель пушит `main`, проверяет, что workflow зелёный и сайт открывается по ссылке Pages.

---

### Task 2: Источник медиа и окно подсказок

**Files:**
- Create: `src/capture/source.ts`, `src/ui/pip.ts`
- Test: `tests/ui/pip.test.ts`

**Interfaces:**
- Produces:
  - `openLiveSource(): Promise<MediaHandle>`; `openFileSource(file: File): Promise<MediaHandle>`
  - `interface MediaHandle { videoStream: MediaStream; audioStream: MediaStream; kind: 'live'|'file'; stop(): void; onEnded(cb: () => void): void }`
  - `type PipStatus = 'ok' | 'face-lost' | 'no-camera-model' | 'no-speech-model'`
  - `interface PipState { hint: Hint | null; fillers: number; gazeShare: number | null; status: PipStatus }`
  - `formatPipState(s: PipState): { hintText: string; countersText: string; statusText: string | null }`
  - `openPip(): Promise<PipWindow>`; `interface PipWindow { doc: Document; win: Window; isFloating: boolean; render(s: PipState): void; onClose(cb: () => void): void; close(): void }`

- [ ] **Step 1: Падающий тест форматирования**

```ts
test('счётчики и подсказка', () => {
  const r = formatPipState({ hint: { id: 'gaze', text: 'в камеру' }, fillers: 7, gazeShare: 0.834, status: 'ok' });
  expect(r).toEqual({ hintText: 'в камеру', countersText: 'паразиты 7 · в камеру 83%', statusText: null });
});
test('нет речи — доля взгляда «—»', () => {
  expect(formatPipState({ hint: null, fillers: 0, gazeShare: null, status: 'ok' }).countersText)
    .toBe('паразиты 0 · в камеру —');
});
test('статус лица', () => {
  expect(formatPipState({ hint: null, fillers: 0, gazeShare: null, status: 'face-lost' }).statusText)
    .toBe('лицо не в кадре');
});
```

Тексты статусов: `no-camera-model` → «анализ лица отключён», `no-speech-model` → «анализ речи отключён».

- [ ] **Step 2: FAIL → Step 3: реализовать `formatPipState` → Step 4: PASS**

- [ ] **Step 5: `source.ts`**

Живой источник: `getUserMedia({ video: { width: 640, height: 480 }, audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })`. Ошибки `NotAllowedError`, `NotReadableError`, `NotFoundError` пробрасываются как `MediaError { reason: 'denied' | 'busy' | 'missing' }`. Файл: `<video>` с `URL.createObjectURL(file)`, `play()`, потоки из `video.captureStream()`; `onEnded` по событию `ended`.

- [ ] **Step 6: `pip.ts`**

`documentPictureInPicture.requestWindow({ width, height })`, размер берётся из `localStorage['pipSize']` (по умолчанию 320×120) и сохраняется на `resize`; чтение и запись в `try/catch`. Стили копируются в окно. Без `documentPictureInPicture` — `window.open` 320×120, `isFloating = false`, в окне строка «окно не поверх всех окон». Подсказка крупным шрифтом, счётчики и статус мелким.

- [ ] **Step 7: Проверка в браузере**

Временная кнопка на `#/diag` открывает живой источник и окно. Expected: окно поверх других приложений, после закрытия и повторного открытия размер сохранён. Положение окна задаёт Chrome; проверить, восстанавливает ли он его. Если нет — сообщить пользователю на контрольной точке B.

- [ ] **Step 8: Commit** `feat: источник медиа и окно подсказок`

---

### Task 3: Трекеры лица и рук, диагностическая страница

**Files:**
- Create: `src/vision/headPose.ts`, `src/vision/faceTracker.ts`, `src/vision/handTracker.ts`, `src/ui/diag.ts`
- Test: `tests/vision/headPose.test.ts`

**Interfaces:**
- Consumes: `MediaHandle`, `openPip`, `PipWindow` (задача 2).
- Produces:
  - `matrixToYawPitch(m: ArrayLike<number>): { yawDeg: number; pitchDeg: number }` — матрица 4×4 MediaPipe, column-major
  - `eyeAngles(bs: Record<string, number>): { eyeYaw: number; eyePitch: number }`
  - `createFaceTracker(base: string): Promise<FaceTracker>`; `FaceTracker.detect(video: HTMLVideoElement, tMs: number): FaceFrame | null`
  - `createHandTracker(base: string): Promise<HandTracker>`; `HandTracker.detect(video, tMs): HandFrame`
  - `startAnalysisLoop(win: Window, tick: (tMs: number) => void): () => void` — цикл по `win.requestAnimationFrame`, возвращает остановку

- [ ] **Step 1: Падающие тесты позы головы и глаз**

```ts
test('единичная матрица → 0,0', () => {
  expect(matrixToYawPitch([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])).toEqual({ yawDeg: 0, pitchDeg: 0 });
});
test('поворот на 30° вокруг Y → yaw 30', () => {
  const c = Math.cos(Math.PI/6), s = Math.sin(Math.PI/6);
  const r = matrixToYawPitch([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
  expect(r.yawDeg).toBeCloseTo(30, 3); expect(r.pitchDeg).toBeCloseTo(0, 3);
});
test('поворот на 20° вокруг X → pitch 20', () => {
  const c = Math.cos(Math.PI/9), s = Math.sin(Math.PI/9);
  const r = matrixToYawPitch([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
  expect(r.pitchDeg).toBeCloseTo(20, 3); expect(r.yawDeg).toBeCloseTo(0, 3);
});
test('глаза: взгляд прямо → 0, вверх → положительный pitch', () => {
  expect(eyeAngles({})).toEqual({ eyeYaw: 0, eyePitch: 0 });
  expect(eyeAngles({ eyeLookUpLeft: 0.6, eyeLookUpRight: 0.6 }).eyePitch).toBeCloseTo(0.6);
});
```

`eyeYaw = ((eyeLookInLeft + eyeLookOutRight) - (eyeLookOutLeft + eyeLookInRight)) / 2`, `eyePitch = avg(up) - avg(down)`; отсутствующий ключ = 0.

- [ ] **Step 2: FAIL → Step 3: реализовать → Step 4: PASS**

- [ ] **Step 5: Обёртки трекеров**

`FilesetResolver.forVisionTasks(base + 'mediapipe-wasm')`, модели из `base + 'models/…task'`, `delegate: 'GPU'`, `runningMode: 'VIDEO'`, `numFaces: 1`, `numHands: 2`, `outputFaceBlendshapes: true`, `outputFacialTransformationMatrixes: true`. При ошибке GPU — повтор с `delegate: 'CPU'`. `box` — min/max нормированных точек лица.

- [ ] **Step 6: Диагностическая страница `#/diag`, режим «камера»**

Открывает источник и окно подсказок. `<video>` живёт в документе окна подсказок: `muted`, `playsinline`, `position:absolute; opacity:0; width:160px; pointer-events:none`. Цикл от `startAnalysisLoop(pip.win, …)`: лицо раз в 100 мс, руки раз в 200 мс. На странице и в окне в реальном времени: фактические кадры/с лица и рук, мс на кадр, `headYaw/Pitch`, `eyeYaw/Pitch`, суммарный yaw `head + eyeYaw·30·sign`, значения `browDown*`, `mouthSmile*`, `mouthPress*`, `jawOpen`, `browInnerUp`, `browOuterUp*`, число рук в кадре, сумма |Δ| мимики за 30 с.

- [ ] **Step 7: Проверка в браузере**

1. Повернуть голову вправо, глазами держать камеру: суммарный yaw меняется меньше, чем yaw головы. Если наоборот — `eyeYawSign: -1` в `defaults.ts`.
2. Свернуть вкладку диагностики, оставить окно подсказок: частота лица ≥ 9 кадров/с.

- [ ] **Step 8: Commit** `feat: трекеры лица и рук, диагностика`

---

### Task 4: Распознавание речи и поиск паразитов, диагностика Vosk

**Files:**
- Create: `src/audio/capture-worklet.ts`, `src/audio/audioTap.ts`, `src/audio/asr.ts`, `src/audio/fillers.ts`
- Modify: `src/ui/diag.ts`
- Test: `tests/audio/fillers.test.ts`

**Interfaces:**
- Produces:
  - `normalize(text: string): string[]` — нижний регистр, ё→е, без знаков препинания, по пробелам
  - `findFillers(tokens: string[], fillers: string[]): { word: string; index: number }[]`
  - `startAudioTap(stream: MediaStream): Promise<AudioTap>`; `AudioTap { sampleRate: number; onFrame(cb: (f: Float32Array, tMs: number) => void): void; onBatch(cb: (b: AudioBuffer) => void): void; stop(): void }` — кадр 20 мс, пачка для ASR 240 мс
  - `createAsr(modelUrl: string, sampleRate: number): Promise<Asr>`; `Asr { accept(b: AudioBuffer): void; onPartial(cb: (text: string) => void): void; onFinal(cb: (words: AsrWord[]) => void): void; stop(): void }`

- [ ] **Step 1: Падающие тесты**

```ts
const L = ['ну','это самое','как бы','типа','наверно','наверное'];
test('нормализация', () => expect(normalize('Ну, ВОТ… всё!')).toEqual(['ну','вот','все']));
test('фразы из двух слов, жадно', () => {
  expect(findFillers(['ну','это','самое','как','бы'], L))
    .toEqual([{word:'ну',index:0},{word:'это самое',index:1},{word:'как бы',index:3}]);
});
test('только целое слово', () => expect(findFillers(['типажи','нуль'], L)).toEqual([]));
test('наверно и наверное различаются', () => {
  expect(findFillers(['наверно','наверное'], L).map(h => h.word)).toEqual(['наверно','наверное']);
});
test('пустой ввод', () => expect(findFillers([], L)).toEqual([]));
```

- [ ] **Step 2: FAIL → Step 3: реализовать `fillers.ts` → Step 4: PASS**

- [ ] **Step 5: Аудио-тракт**

`new AudioContext({ sampleRate: 16000 })`, worklet из `capture-worklet.ts` (через `new URL(..., import.meta.url)`) копит 320 отсчётов и шлёт `Float32Array` в главный поток. `tMs` — `performance.now()` при получении. Пачки по 12 кадров → `AudioBuffer`.

- [ ] **Step 6: `asr.ts`**

`createModel(modelUrl)`, `new model.KaldiRecognizer(sampleRate)`, `setWords(true)`. `partialresult` → `onPartial(result.partial)`, `result` → `onFinal(result.result ?? [])`. Ошибка загрузки модели отклоняет промис.

- [ ] **Step 7: Диагностика, режим «файл речи»**

На `#/diag`: выбор аудио- или видеофайла, проигрывание через `openFileSource`, аудио-тракт, ASR. По окончании таблица: слово-паразит → количество; общее число распознанных слов. Текст распознавания показывается на экране и не сохраняется.

- [ ] **Step 8: Проверка** — на коротком файле с речью таблица заполняется, задержка частичных результатов на экране ≤ 2 с.

- [ ] **Step 9: Commit** `feat: распознавание речи и поиск паразитов`

**Контрольная точка B — этап 0 (пользователь).** Исполнитель публикует сборку и передаёт пользователю чек-лист:
1. Встреча Контур Толка в Chrome + `#/diag` в соседней вкладке: камера и микрофон работают в обоих.
2. Окно подсказок остаётся поверх окна созвона.
3. Вкладка диагностики свёрнута: лицо ≥ 9 кадров/с.
4. Диспетчер задач Chrome (Shift+Esc) во время созвона: суммарная нагрузка вкладки и окна ≤ 30% процессора.
5. Запись своей речи 5–10 мин: пользователь вручную считает паразиты, сравнивает с таблицей. Найдено ≥ 2/3.
6. Поворот головы при взгляде в камеру — проверка из задачи 3, шаг 7.

Работа продолжается после результатов. Провал пункта 1 или 3 возвращает к выбору архитектуры, пункта 5 — к выбору распознавания, пункта 4 — снижение частоты анализа в конфиге.

---

### Task 5: Хранилище и калибровка

**Files:**
- Create: `src/storage/db.ts`, `src/vision/calibration.ts`, `src/ui/calibrationView.ts`
- Test: `tests/storage/db.test.ts`, `tests/vision/calibration.test.ts`

**Interfaces:**
- Consumes: `FaceFrame`, `Baseline`, `Config`.
- Produces:
  - `gazeAngles(f: FaceFrame, cfg: Config): { yawDeg: number; pitchDeg: number }` (в `calibration.ts`, используется и в задаче 6)
  - `class CalibrationAccumulator { add(f: FaceFrame | null): void; result(kind: 'full' | 'gaze', prev: Baseline | null, cfg: Config): CalibrationResult }`
  - `type CalibrationResult = { ok: true; baseline: Baseline } | { ok: false; reason: 'no-face' | 'unstable' | 'no-baseline' }`
  - `db.ts`: `saveMeeting(m: Meeting)`, `getMeeting(id): Promise<Meeting | undefined>`, `listMeetings(): Promise<Meeting[]>` (новые первыми), `getConfig(): Promise<Config>` (сохранённый или `DEFAULT_CONFIG`), `saveConfig(c)`, `getBaseline(): Promise<Baseline | null>`, `saveBaseline(b)`
  - `runCalibration(root: HTMLElement, kind: 'full' | 'gaze'): Promise<Baseline>`

- [ ] **Step 1: Падающие тесты калибровки**

`frame(over)` — фабрика `FaceFrame` с нулевыми значениями, `box` 0.3×0.4 в центре.

```ts
test('full: средние мимики и взгляда', () => {
  const a = new CalibrationAccumulator();
  for (let i = 0; i < 200; i++) a.add(frame({ headYawDeg: 5, blendshapes: { browDownLeft: 0.1 } }));
  const r = a.result('full', null, DEFAULT_CONFIG);
  expect(r.ok && r.baseline.gazeYawDeg).toBeCloseTo(5);
  expect(r.ok && r.baseline.blendshapes.browDownLeft).toBeCloseTo(0.1);
  expect(r.ok && r.baseline.activityNorm).toBe(DEFAULT_CONFIG.face.activityNormDefault);
});
test('лица меньше 70% кадров → no-face', () => {
  const a = new CalibrationAccumulator();
  for (let i = 0; i < 100; i++) a.add(i < 60 ? frame({}) : null);
  expect(a.result('full', null, DEFAULT_CONFIG)).toEqual({ ok: false, reason: 'no-face' });
});
test('взгляд гуляет (std > 4°) → unstable', () => {
  const a = new CalibrationAccumulator();
  for (let i = 0; i < 100; i++) a.add(frame({ headYawDeg: i % 2 ? 15 : -15 }));
  expect(a.result('full', null, DEFAULT_CONFIG)).toEqual({ ok: false, reason: 'unstable' });
});
test('gaze без полной калибровки → no-baseline', () => {
  const a = new CalibrationAccumulator(); a.add(frame({}));
  expect(a.result('gaze', null, DEFAULT_CONFIG)).toEqual({ ok: false, reason: 'no-baseline' });
});
test('gaze обновляет только взгляд', () => {
  const prev = { blendshapes: { browDownLeft: 0.2 }, gazeYawDeg: 0, gazePitchDeg: 0, activityNorm: 4, createdAt: 'x' };
  const a = new CalibrationAccumulator();
  for (let i = 0; i < 50; i++) a.add(frame({ headPitchDeg: -8 }));
  const r = a.result('gaze', prev, DEFAULT_CONFIG);
  expect(r.ok && r.baseline.gazePitchDeg).toBeCloseTo(-8);
  expect(r.ok && r.baseline.blendshapes).toEqual(prev.blendshapes);
  expect(r.ok && r.baseline.activityNorm).toBe(4);
});
```

`gazeAngles`: `yaw = headYawDeg + eyeYaw·eyeYawRangeDeg·eyeYawSign`, `pitch = headPitchDeg + eyePitch·eyePitchRangeDeg`.

- [ ] **Step 2: Падающие тесты хранилища** (`import 'fake-indexeddb/auto'`)

```ts
test('встречи: сохранить, прочитать, список новыми первыми', async () => {
  await saveMeeting(m('a', '2026-11-01T10:00:00Z')); await saveMeeting(m('b', '2026-11-02T10:00:00Z'));
  expect((await getMeeting('a'))?.id).toBe('a');
  expect((await listMeetings()).map(x => x.id)).toEqual(['b', 'a']);
});
test('конфиг по умолчанию, пока не сохранён', async () => expect(await getConfig()).toEqual(DEFAULT_CONFIG));
test('калибровки нет → null', async () => expect(await getBaseline()).toBeNull());
```

- [ ] **Step 3: FAIL → Step 4: реализовать `calibration.ts`, `db.ts`** (`idb`, база `speech-coach` v1, хранилища `meetings` (keyPath `id`) и `kv`) **→ Step 5: PASS**

- [ ] **Step 6: Экран калибровки**

Тексты: полная — «Смотрите в камеру с обычным спокойным лицом. 20 секунд.»; взгляд — «Смотрите в камеру. 5 секунд.». Индикатор «лицо видно / лица не видно», обратный отсчёт. Неуспех: `no-face` → «Лицо было не в кадре. Повторите.», `unstable` → «Взгляд уходил от камеры. Повторите.», кнопка «Повторить». Успех сохраняет норму через `saveBaseline`.

- [ ] **Step 7: Commit** `feat: хранилище и калибровка`

---

### Task 6: Сигналы зрения

**Files:**
- Create: `src/vision/signals.ts`, `src/vision/window.ts`
- Test: `tests/vision/signals.test.ts`, `tests/vision/window.test.ts`

**Interfaces:**
- Consumes: `gazeAngles` (задача 5), `FaceFrame`, `HandFrame`, `Baseline`, `Config`.
- Produces:
  - `computeFrameSignals(f: FaceFrame, h: HandFrame, b: Baseline, cfg: Config): FrameSignals`
  - `handZone(box: Box, cfg: Config): Box`
  - `class ExpressionWindow { constructor(cfg: Config, activityNorm: number); push(f: FaceFrame, tMs: number): { expressivityRatio: number; stillMs: number }; sampledNorm(): number | null }`

Правила сигналов (δ = значение − норма; для пар Left/Right берётся среднее, асимметрия = |L − R| − |L₀ − R₀|):
- `frown`: δ browDown ≥ `frownDelta`
- `irritation`: δ browDown ≥ `irritationBrowDelta` и δ mouthPress ≥ `irritationPressDelta`
- `skepticism`: асимметрия browOuterUp ≥ `skepticismAsym` или δ eyeSquint ≥ `skepticismSquintDelta`
- `surprise`: δ browInnerUp ≥ `surpriseBrowDelta` и δ jawOpen ≥ `surpriseJawDelta`
- `smirk`: асимметрия mouthSmile ≥ `smirkAsym` и max(mouthSmile L, R) ≥ `smirkMinSmile`
- `cheer`: min(mouthSmile L, R) ≥ `cheerSmile`
- `gazeOnCamera`: |yaw − норма| ≤ `maxYawDeg` и |pitch − норма| ≤ `maxPitchDeg`
- `handNearFace`: хотя бы одна точка руки внутри `handZone(box)`: вверх `zoneUp·h`, в стороны `zoneSide·w` с каждой стороны, вниз `zoneDown·h`

Отслеживаемые параметры мимики для окна: `browDownLeft/Right, browInnerUp, browOuterUpLeft/Right, mouthSmileLeft/Right, mouthPressLeft/Right, mouthFrownLeft/Right, jawOpen`.

- [ ] **Step 1: Падающие тесты сигналов**

Норма `B`: все нули, взгляд 0/0.

```ts
test('хмурость по порогу', () => {
  expect(sig({ browDownLeft: .3, browDownRight: .3 }).frown).toBe(true);
  expect(sig({ browDownLeft: .2, browDownRight: .2 }).frown).toBe(false);
});
test('раздражение требует и брови, и губы', () => {
  expect(sig({ browDownLeft: .3, browDownRight: .3 }).irritation).toBe(false);
  expect(sig({ browDownLeft: .3, browDownRight: .3, mouthPressLeft: .3, mouthPressRight: .3 }).irritation).toBe(true);
});
test('скепсис: одна бровь', () => expect(sig({ browOuterUpLeft: .4 }).skepticism).toBe(true));
test('асимметрия считается от нормы', () => {
  const b = { ...B, blendshapes: { browOuterUpLeft: .3 } };
  expect(computeFrameSignals(face({ browOuterUpLeft: .4 }), noHands, b, DEFAULT_CONFIG).skepticism).toBe(false);
});
test('удивление: брови и рот', () => expect(sig({ browInnerUp: .4, jawOpen: .3 }).surprise).toBe(true));
test('усмешка: одна сторона', () => {
  expect(sig({ mouthSmileLeft: .5, mouthSmileRight: .1 }).smirk).toBe(true);
  expect(sig({ mouthSmileLeft: .5, mouthSmileRight: .5 }).smirk).toBe(false);
});
test('весёлость: широкая улыбка', () => expect(sig({ mouthSmileLeft: .7, mouthSmileRight: .7 }).cheer).toBe(true));
test('взгляд: 15° в сторону — мимо камеры', () => {
  expect(computeFrameSignals(face({}, { headYawDeg: 15 }), noHands, B, DEFAULT_CONFIG).gazeOnCamera).toBe(false);
  expect(computeFrameSignals(face({}, { headYawDeg: 8 }), noHands, B, DEFAULT_CONFIG).gazeOnCamera).toBe(true);
});
test('руки: волосы, шея, далеко', () => {
  // box лица x .4 y .3 w .2 h .3
  expect(hand({ x: .5, y: .2 })).toBe(true);    // выше лба в пределах 40%
  expect(hand({ x: .5, y: .7 })).toBe(true);    // шея, в пределах 50% ниже
  expect(hand({ x: .9, y: .4 })).toBe(false);   // сбоку далеко
});
```

- [ ] **Step 2: Падающие тесты окна**

```ts
test('неподвижное лицо: stillMs растёт, сбрасывается реакцией', () => {
  const w = new ExpressionWindow(DEFAULT_CONFIG, 3);
  let r; for (let t = 0; t <= 200000; t += 100) r = w.push(face({}), t);
  expect(r!.stillMs).toBe(200000);
  r = w.push(face({ mouthSmileLeft: .2 }), 200100);
  expect(r.stillMs).toBe(0);
});
test('кивок сбрасывает stillMs', () => {
  const w = new ExpressionWindow(DEFAULT_CONFIG, 3);
  w.push(face({}), 0); expect(w.push(face({}, { headPitchDeg: 6 }), 1000).stillMs).toBe(0);
});
test('активность за 30 с относительно нормы', () => {
  const w = new ExpressionWindow(DEFAULT_CONFIG, 3);
  let r; for (let i = 0; i <= 300; i++) r = w.push(face({ browInnerUp: i % 2 ? .1 : 0 }), i * 100);
  expect(r!.expressivityRatio).toBeCloseTo(300 * .1 / 3, 1);   // 10
});
test('окно не хранит кадры старше 30 с', () => {
  const w = new ExpressionWindow(DEFAULT_CONFIG, 3);
  for (let i = 0; i < 10000; i++) w.push(face({ browInnerUp: i % 2 ? .1 : 0 }), i * 100);
  expect((w as any).deltas.length).toBeLessThanOrEqual(301);
});
test('норма встречи — медиана сумм, снятых раз в 30 с', () => {
  const w = new ExpressionWindow(DEFAULT_CONFIG, 3);
  for (let i = 0; i <= 3000; i++) w.push(face({ browInnerUp: i % 2 ? .1 : 0 }), i * 100);
  expect(w.sampledNorm()).toBeCloseTo(30, 0);
});
```

`sampledNorm()` возвращает `null`, если встреча короче 5 минут. Сумма |Δ| за окно хранится в кольцевом буфере `deltas` (`{tMs, d}`), старые элементы выбрасываются при каждом `push`.

- [ ] **Step 3: FAIL → Step 4: реализовать → Step 5: PASS**

- [ ] **Step 6: Диагностика** — добавить на `#/diag` строку «рука у лица» через `computeFrameSignals`.

- [ ] **Step 7: Commit** `feat: сигналы зрения`

---

### Task 7: Речь: «говорит», «э-э», учёт паразитов

**Files:**
- Create: `src/audio/vad.ts`, `src/audio/hesitation.ts`, `src/audio/fillerTracker.ts`
- Test: `tests/audio/vad.test.ts`, `tests/audio/hesitation.test.ts`, `tests/audio/fillerTracker.test.ts`

**Interfaces:**
- Consumes: `normalize`, `findFillers` (задача 4), `Config`.
- Produces:
  - `class Vad { constructor(cfg: Config); push(frame: Float32Array, tMs: number): boolean }`
  - `class HesitationDetector { constructor(cfg: Config, sampleRate: number); push(frame: Float32Array, tMs: number): number | null }` — время начала «э-э» или null
  - `class FillerTracker { constructor(fillers: string[]); onPartial(text: string, tMs: number): FillerHit[]; onFinal(words: AsrWord[], streamStartMs: number): CoachEvent[]; addHesitation(tMs: number): { hit: FillerHit; event: CoachEvent }; total(): number }`

Алгоритмы:
- `Vad`: RMS кадра; уровень шума `noise = noise·0.995 + rms·0.005` только в тишине, старт 0.005; речь, если `rms > max(minRms, noise·noiseRatio)`; после последнего речевого кадра `true` ещё `hangoverMs`.
- `HesitationDetector`: высота тона автокорреляцией в диапазоне 75–400 Гц; кадр «ровный», если `rms ≥ minRms`, пик нормированной автокорреляции ≥ `minCorr` и |p − p₀|/p₀ ≤ `maxPitchDrift`, где p₀ — тон первого кадра серии. Серия ровных кадров ≥ `minRunMs` даёт одно событие на серию.
- `FillerTracker`: частичный результат пересчитывается целиком; попадания выдаются только на прирост счёта слова относительно предыдущего частичного. Предварительный счёт — счёт текущего частичного. Финальный результат даёт события со временем `streamStartMs + start·1000`, обнуляет предварительный счёт. `total()` = зафиксированные + предварительные. «Э-э» фиксируется сразу словом `э-э`.

- [ ] **Step 1: Падающие тесты**

```ts
// vad
test('тишина и речь', () => {
  const v = new Vad(DEFAULT_CONFIG);
  expect(v.push(tone(0.001), 0)).toBe(false);
  expect(v.push(tone(0.1), 20)).toBe(true);
});
test('задержка отпускания 700 мс', () => {
  const v = new Vad(DEFAULT_CONFIG); v.push(tone(0.1), 0);
  expect(v.push(tone(0.001), 600)).toBe(true);
  expect(v.push(tone(0.001), 720)).toBe(false);
});
// hesitation: frames(signal, 320) режет сигнал на кадры по 20 мс
test('ровный тон 600 мс → одно событие', () => expect(events(sine(150, 600))).toEqual([0]));
test('ровный тон 300 мс → нет', () => expect(events(sine(150, 300))).toEqual([]));
test('тон плывёт 120→300 Гц → нет', () => expect(events(chirp(120, 300, 600))).toEqual([]));
test('шум → нет', () => expect(events(noise(600))).toEqual([]));
// fillerTracker
test('частичные: только прирост', () => {
  const f = new FillerTracker(DEFAULT_CONFIG.fillers);
  expect(f.onPartial('ну вот', 1000).map(h => h.word)).toEqual(['ну', 'вот']);
  expect(f.onPartial('ну вот значит', 1500).map(h => h.word)).toEqual(['значит']);
  expect(f.total()).toBe(3);
});
test('переписанный частичный: без минуса и без повторов', () => {
  const f = new FillerTracker(DEFAULT_CONFIG.fillers);
  f.onPartial('ну вот', 1000);
  expect(f.onPartial('ну и', 1200)).toEqual([]);
  expect(f.total()).toBe(1);
  expect(f.onPartial('ну и вот', 1400).map(h => h.word)).toEqual(['вот']);
});
test('финальный фиксирует события и обнуляет предварительный счёт', () => {
  const f = new FillerTracker(DEFAULT_CONFIG.fillers);
  f.onPartial('ну это самое', 1000);
  const ev = f.onFinal([{ word: 'ну', start: 1.2, end: 1.4 }, { word: 'это', start: 1.5, end: 1.7 },
    { word: 'самое', start: 1.7, end: 2.0 }], 500);
  expect(ev).toEqual([{ type: 'filler', word: 'ну', tMs: 1700, durationMs: 200 },
    { type: 'filler', word: 'это самое', tMs: 2000, durationMs: 500 }]);
  expect(f.total()).toBe(2);
  expect(f.onPartial('ну', 3000).map(h => h.word)).toEqual(['ну']);
  expect(f.total()).toBe(3);
});
test('э-э фиксируется сразу', () => {
  const f = new FillerTracker(DEFAULT_CONFIG.fillers);
  expect(f.addHesitation(4000).event).toEqual({ type: 'filler', word: 'э-э', tMs: 4000, durationMs: 0 });
  expect(f.total()).toBe(1);
});
```

- [ ] **Step 2: FAIL → Step 3: реализовать → Step 4: PASS**

- [ ] **Step 5: Commit** `feat: речь — vad, э-э, учёт паразитов`

---

### Task 8: Движок правил

**Files:**
- Create: `src/rules/engine.ts`
- Test: `tests/rules/engine.test.ts`

**Interfaces:**
- Consumes: `Config`, `HINT_PRIORITY`, `VisionSignals`, `FillerHit`, `CoachEvent`, `Hint`.
- Produces:
  - `interface EngineInput { tMs: number; speaking: boolean; vision: VisionSignals | null; fillerHits: FillerHit[] }`
  - `interface EngineOutput { hint: Hint | null; closed: CoachEvent[]; status: 'ok' | 'face-lost'; gazeShare: number | null }`
  - `class RuleEngine { constructor(cfg: Config); update(i: EngineInput): EngineOutput; finish(tMs: number): CoachEvent[]; totals(): { speakingMs: number; speakingWithFaceMs: number; onCameraMs: number } }`

Условия (v — `vision`; при `v === null` все ложны):

| id | условие |
|---|---|
| hands | v.handNearFace |
| smirk | v.smirk && !speaking |
| irritation | v.irritation |
| skepticism | v.skepticism |
| surprise | v.surprise |
| cheer | v.cheer && !speaking |
| frown | v.frown |
| expressive | v.expressivityRatio ≥ face.expressiveRatio |
| stone | v.stillMs ≥ face.stoneMs && !speaking |
| gaze | !v.gazeOnCamera && speaking |

Поведение:
1. Условие держится `minDurationMs[id]` → «сработало», открывается событие с `tMs` = начало условия. Условие пропало → событие закрывается с длительностью от начала условия. `finish` закрывает открытые.
2. Отключённые в `cfg.enabled` подсказки не показываются и не пишут события.
3. Попадание паразита: вспышка `filler` с текстом слова на `fillerFlashMs`. Если за `burstWindowMs` попаданий ≥ `burstCount` и `fillerBurst` не в паузе — вместо вспышки `fillerBurst`, слово — самое частое в окне. События паразитов движок не пишет.
4. Показ: из сработавших условий и активной вспышки выбирается подсказка с наивысшим приоритетом по `HINT_PRIORITY`. Более приоритетная вытесняет текущую сразу. Текущая держится минимум `minShowMs`, даже если её условие пропало.
5. Пауза: подсказка `id` (кроме `filler`) не начинает новый показ, если с начала её прошлого показа прошло меньше `cooldownMs`. Идущий показ продолжается, пока условие активно.
6. Доля взгляда: `dt = min(tMs − prev, maxTickGapMs)`; при `speaking` копится `speakingMs`; при `speaking && v` — `speakingWithFaceMs`, при `v.gazeOnCamera` ещё `onCameraMs`. `gazeShare = onCameraMs / speakingWithFaceMs` или `null`.
7. `vision === null` дольше `faceLostMs` подряд → `status: 'face-lost'`.

- [ ] **Step 1: Падающие тесты**

Хелпер `run(engine, from, to, step, input)` гоняет тики и возвращает последний вывод; `V(over)` — `VisionSignals` со всеми `false`, `gazeOnCamera: true`, `expressivityRatio: 1`, `stillMs: 0`.

```ts
test('порог: руки у лица 1 с', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  expect(run(e, 0, 900, 100, { vision: V({ handNearFace: true }) }).hint).toBeNull();
  expect(run(e, 1000, 1000, 100, { vision: V({ handNearFace: true }) }).hint?.id).toBe('hands');
});
test('приоритет: руки важнее хмурости', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  expect(run(e, 0, 3000, 100, { vision: V({ handNearFace: true, frown: true }) }).hint?.id).toBe('hands');
});
test('усмешка только пока пользователь молчит', () => {
  expect(run(new RuleEngine(DEFAULT_CONFIG), 0, 2000, 100, { speaking: true, vision: V({ smirk: true }) }).hint).toBeNull();
});
test('взгляд только пока пользователь говорит', () => {
  expect(run(new RuleEngine(DEFAULT_CONFIG), 0, 4000, 100, { speaking: false, vision: V({ gazeOnCamera: false }) }).hint).toBeNull();
  expect(run(new RuleEngine(DEFAULT_CONFIG), 0, 3000, 100, { speaking: true, vision: V({ gazeOnCamera: false }) }).hint?.id).toBe('gaze');
});
test('минимум 2 с показа', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  run(e, 0, 1000, 100, { vision: V({ handNearFace: true }) });
  expect(run(e, 1100, 2900, 100, { vision: V() }).hint?.id).toBe('hands');
  expect(run(e, 3000, 3100, 100, { vision: V() }).hint).toBeNull();
});
test('пауза 60 с между показами одной подсказки, событие пишется', () => {
  const e = new RuleEngine(DEFAULT_CONFIG); const closed: CoachEvent[] = [];
  const tick = (t: number, on: boolean) => closed.push(...e.update({ tMs: t, speaking: false, vision: V({ handNearFace: on }), fillerHits: [] }).closed);
  for (let t = 0; t <= 1500; t += 100) tick(t, true);
  for (let t = 1600; t <= 4000; t += 100) tick(t, false);
  let last; for (let t = 4100; t <= 6000; t += 100) last = e.update({ tMs: t, speaking: false, vision: V({ handNearFace: true }), fillerHits: [] });
  expect(last!.hint).toBeNull();
  e.update({ tMs: 6100, speaking: false, vision: V(), fillerHits: [] });
  expect(closed.concat(e.finish(6100)).filter(c => c.type === 'hands')).toHaveLength(2);
});
test('событие: начало условия и длительность', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  run(e, 0, 2500, 100, { vision: V({ frown: true }) });
  expect(e.finish(2600)).toEqual([]);   // 2,6 с < 3 с — не сработало
  const e2 = new RuleEngine(DEFAULT_CONFIG);
  run(e2, 0, 4000, 100, { vision: V({ frown: true }) });
  expect(e2.update({ tMs: 4100, speaking: false, vision: V(), fillerHits: [] }).closed)
    .toEqual([{ type: 'frown', tMs: 0, durationMs: 4100 }]);
});
test('лицо пропало: события закрываются, через 5 с статус', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  run(e, 0, 1500, 100, { vision: V({ handNearFace: true }) });
  expect(e.update({ tMs: 1600, speaking: false, vision: null, fillerHits: [] }).closed).toHaveLength(1);
  expect(run(e, 1700, 6500, 100, { vision: null }).status).toBe('face-lost');
});
test('вспышка паразита и «пауза вместо» на третьем за минуту', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  const hit = (t: number, w: string) => e.update({ tMs: t, speaking: true, vision: V(), fillerHits: [{ word: w, tMs: t }] });
  expect(hit(0, 'ну').hint).toEqual({ id: 'filler', text: 'ну' });
  hit(10000, 'ну');
  expect(hit(20000, 'вот').hint).toEqual({ id: 'fillerBurst', text: 'пауза вместо «ну»' });
});
test('окно паразитов не растёт: попадания старше 60 с выбрасываются', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  for (let t = 0; t < 3 * 3600_000; t += 5000) e.update({ tMs: t, speaking: true, vision: V(), fillerHits: [{ word: 'ну', tMs: t }] });
  expect((e as any).recentFillers.length).toBeLessThanOrEqual(13);
});
test('доля взгляда: без лица не считается, без речи — null', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  expect(run(e, 0, 1000, 100, { speaking: false, vision: V() }).gazeShare).toBeNull();
  run(e, 1100, 2000, 100, { speaking: true, vision: V() });
  run(e, 2100, 3000, 100, { speaking: true, vision: null });
  expect(run(e, 3100, 4000, 100, { speaking: true, vision: V({ gazeOnCamera: false }) }).gazeShare).toBeCloseTo(0.5, 1);
});
test('отключённая подсказка молчит и не пишет событий', () => {
  const cfg = structuredClone(DEFAULT_CONFIG); cfg.enabled.hands = false;
  const e = new RuleEngine(cfg);
  expect(run(e, 0, 2000, 100, { vision: V({ handNearFace: true }) }).hint).toBeNull();
  expect(e.finish(2100)).toEqual([]);
});
```

- [ ] **Step 2: FAIL → Step 3: реализовать → Step 4: PASS**

- [ ] **Step 5: Commit** `feat: движок правил`

---

### Task 9: Сессия встречи и стартовый экран

**Files:**
- Create: `src/session/session.ts`, `src/ui/start.ts`
- Modify: `src/main.ts` (маршрут `#/`)

**Interfaces:**
- Consumes: всё из задач 2–8.
- Produces:
  - `startSession(o: { source: MediaHandle; pip: PipWindow; config: Config; baseline: Baseline; title: string }): Promise<Session>`
  - `interface Session { stop(): Promise<Meeting>; onFatal(cb: (msg: string) => void): void }`

- [ ] **Step 1: Связка в `session.ts`**

1. Трекеры (`base = new URL('./', location.href)`) и ASR грузятся параллельно. Не загрузилась модель лица → `vision = null` всегда, статус `no-camera-model`; не загрузилась модель речи → паразиты отключены, статус `no-speech-model`. Остальное работает.
2. `<video>` с `source.videoStream` в документе окна подсказок, как в диагностике.
3. Аудио: каждый кадр → `Vad`, `HesitationDetector`; пачки → ASR. `streamStartMs` = время первой пачки. Частичные → `FillerTracker.onPartial` → очередь попаданий; финальные и «э-э» → массив событий встречи.
4. Цикл `startAnalysisLoop(pip.win, …)`: лицо раз в 100 мс, руки раз в 200 мс (между вызовами — последний `HandFrame`), `computeFrameSignals` + `ExpressionWindow.push` → `RuleEngine.update`. Вывод → `pip.render({ hint, fillers: tracker.total(), gazeShare, status })`.
5. Окно подсказок закрыто → цикл переходит на `window`, на странице кнопка «Открыть окно подсказок».
6. `stop()`: `engine.finish`, остановка трекеров, ASR, аудио, источника; `Meeting` с событиями движка и паразитов (по времени), `totals()` движка; `saveMeeting`. Если `sampledNorm()` не `null` — `baseline.activityNorm` обновляется и сохраняется.

- [ ] **Step 2: Стартовый экран `#/`**

Поле «Название встречи», переключатель «Камера / Файл» (выбор файла), кнопка «Начать». Порядок: нет нормы → полная калибровка, есть → калибровка взгляда; окно подсказок; сессия. Кнопки «Завершить» на странице и в окне → `stop()` → переход на `#/report/<id>`. Ошибки источника: `denied` → «Нет доступа к камере или микрофону. Разрешите доступ в настройках сайта.», `busy` → «Камера занята другой программой. Откройте встречу в этом же браузере.», `missing` → «Камера или микрофон не найдены.», кнопка «Повторить». Ссылки: «История», «Настройки», «Перекалибровать».

- [ ] **Step 3: Проверка в режиме файла**

Видео 2–3 минуты, где на камеру говорят со словами-паразитами, хмурятся, трогают лицо. Expected: подсказки появляются в окне, после конца файла встреча сохранена, `#/report/<id>` открывается.

- [ ] **Step 4: Commit** `feat: сессия встречи`

---

### Task 10: Отчёт и история

**Files:**
- Create: `src/report/summary.ts`, `src/ui/report.ts`
- Test: `tests/report/summary.test.ts`

**Interfaces:**
- Consumes: `Meeting`, `getMeeting`, `listMeetings`, `Config` (тексты подсказок для названий типов).
- Produces:
  - `summarize(m: Meeting): Summary`
  - `interface Summary { speakingMin: number; fillers: number; fillersPerMin: number | null; byWord: { word: string; count: number }[]; gazeShare: number | null; offCameraEpisodes: number; byType: Partial<Record<EventType, number>>; timeline: CoachEvent[] }`

- [ ] **Step 1: Падающие тесты**

```ts
test('паразиты в минуту речи и разбивка по убыванию', () => {
  const s = summarize(meeting({ speakingMs: 120000, events: [f('ну'), f('вот'), f('ну'), f('ну')] }));
  expect(s.fillers).toBe(4); expect(s.fillersPerMin).toBe(2);
  expect(s.byWord).toEqual([{ word: 'ну', count: 3 }, { word: 'вот', count: 1 }]);
});
test('без речи — null, без деления на ноль', () => {
  const s = summarize(meeting({ speakingMs: 0, speakingWithFaceMs: 0, onCameraMs: 0, events: [] }));
  expect(s.fillersPerMin).toBeNull(); expect(s.gazeShare).toBeNull();
});
test('доля взгляда и эпизоды мимо камеры', () => {
  const s = summarize(meeting({ speakingWithFaceMs: 100000, onCameraMs: 75000, events: [ev('gaze'), ev('gaze')] }));
  expect(s.gazeShare).toBe(0.75); expect(s.offCameraEpisodes).toBe(2);
});
test('лента: мимика и руки по времени, без паразитов и взгляда', () => {
  const s = summarize(meeting({ events: [ev('frown', 5000), f('ну', 1000), ev('hands', 2000), ev('gaze', 3000)] }));
  expect(s.timeline.map(e => e.type)).toEqual(['hands', 'frown']);
  expect(s.byType).toEqual({ hands: 1, frown: 1 });
});
```

- [ ] **Step 2: FAIL → Step 3: реализовать → Step 4: PASS**

- [ ] **Step 5: Экраны**

`#/report/:id` — разделы из спеки (раздел 7, пункты 1–4), время событий — `чч:мм:сс` от начала встречи, `null` → «—», нет встречи → «Встреча не найдена». `#/history` — список встреч: дата, название, длительность, паразиты в минуту, ссылка на отчёт; пусто → «Встреч пока нет».

- [ ] **Step 6: Commit** `feat: отчёт и история`

---

### Task 11: Настройки

**Files:**
- Create: `src/config/validate.ts`, `src/ui/settings.ts`
- Modify: `src/session/session.ts` (конфиг из `getConfig()`), `src/ui/start.ts`
- Test: `tests/config/validate.test.ts`

**Interfaces:**
- Consumes: `Config`, `DEFAULT_CONFIG`, `getConfig`, `saveConfig`.
- Produces: `validateConfig(input: unknown): { ok: true; config: Config } | { ok: false; errors: string[] }`

- [ ] **Step 1: Падающие тесты**

```ts
test('паразиты: обрезка пробелов, нижний регистр, без пустых и повторов', () => {
  const r = validateConfig({ ...DEFAULT_CONFIG, fillers: [' Ну ', 'ну', '', 'Типа'] });
  expect(r.ok && r.config.fillers).toEqual(['ну', 'типа']);
});
test('отрицательный порог — ошибка с именем поля', () => {
  const c = structuredClone(DEFAULT_CONFIG); c.minDurationMs.hands = -1;
  expect(validateConfig(c)).toEqual({ ok: false, errors: ['minDurationMs.hands: нужно число ≥ 0'] });
});
test('нечисло — ошибка', () => {
  const c: any = structuredClone(DEFAULT_CONFIG); c.gaze.maxYawDeg = 'abc';
  expect(validateConfig(c).ok).toBe(false);
});
test('недостающие поля берутся из значений по умолчанию', () => {
  const r = validateConfig({ fillers: ['ну'] });
  expect(r.ok && r.config.gaze).toEqual(DEFAULT_CONFIG.gaze);
});
```

Тексты подсказок и `eyeYawSign` в настройках не редактируются.

- [ ] **Step 2: FAIL → Step 3: реализовать → Step 4: PASS**

- [ ] **Step 5: Экран `#/settings`**

Список паразитов: удалить, добавить. Флажки включения подсказок с их текстами. Пороги: `minDurationMs` в секундах, `face.*`, `gaze.maxYawDeg`, `gaze.maxPitchDeg`. Кнопки «Сохранить» (через `validateConfig`, ошибки списком) и «Сбросить к значениям по умолчанию».

- [ ] **Step 6: Commit** `feat: настройки`

---

### Task 12: Публикация и пилот

**Files:**
- Create: `README.md`, `docs/pilot.md`

- [ ] **Step 1: `README.md` для пользователя**

Как открыть, первый запуск и калибровка, как открыть встречу в том же браузере, где отчёты, что ничего не уходит наружу, что очистка данных браузера удаляет историю.

- [ ] **Step 2: `docs/pilot.md`**

Таблица на 3–5 встреч: дата, длительность, ложные подсказки (тип, время), пропущенные (что было, примерное время), нагрузка по диспетчеру задач Chrome, правки порогов.

- [ ] **Step 3: Финальная проверка**

Run: `npm test && npx tsc --noEmit && npx vite build`
Expected: все тесты PASS, сборка без ошибок. Push в `main`, workflow зелёный, на опубликованном сайте проходит сценарий: калибровка → встреча в режиме файла → отчёт → история → настройки.

- [ ] **Step 4: Commit** `docs: инструкция и протокол пилота`
