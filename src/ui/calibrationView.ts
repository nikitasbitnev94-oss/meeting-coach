import type { Config } from '../config/defaults';
import { saveBaseline } from '../storage/db';
import type { Baseline } from '../types';
import { CalibrationAccumulator } from '../vision/calibration';
import type { FaceTracker } from '../vision/faceTracker';
import { everyMs } from '../vision/loop';

export interface CalibrationDeps {
  stream: MediaStream;
  face: FaceTracker;
  cfg: Config;
  prev: Baseline | null;
}

const TEXT = {
  full: 'Смотрите в камеру с обычным спокойным лицом. 20 секунд.',
  gaze: 'Смотрите в камеру. 5 секунд.',
};
const FAIL = {
  'no-face': 'Лицо было не в кадре. Повторите.',
  unstable: 'Взгляд уходил от камеры. Повторите.',
  'no-baseline': 'Сначала нужна полная калибровка.',
};

/** Показывает экран калибровки, повторяет до успеха, сохраняет и возвращает норму. */
export function runCalibration(root: HTMLElement, kind: 'full' | 'gaze', d: CalibrationDeps): Promise<Baseline> {
  root.innerHTML = `
    <h1>Калибровка</h1>
    <p>${TEXT[kind]}</p>
    <video id="cv" muted playsinline autoplay style="width:100%;max-width:480px;border-radius:12px;transform:scaleX(-1)"></video>
    <div class="row"><b id="left"></b><span id="seen" class="muted"></span></div>
    <div id="fail" class="error"></div>
    <div class="row"><button id="again" class="primary" hidden>Повторить</button></div>`;
  const video = root.querySelector<HTMLVideoElement>('#cv')!;
  const left = root.querySelector<HTMLElement>('#left')!;
  const seen = root.querySelector<HTMLElement>('#seen')!;
  const fail = root.querySelector<HTMLElement>('#fail')!;
  const again = root.querySelector<HTMLButtonElement>('#again')!;
  video.srcObject = d.stream;
  const durationMs = kind === 'full' ? d.cfg.calibration.fullMs : d.cfg.calibration.gazeMs;

  return new Promise(resolve => {
    const attempt = () => {
      fail.textContent = '';
      again.hidden = true;
      const acc = new CalibrationAccumulator();
      const due = everyMs(100);
      const start = performance.now();
      const step = () => {
        const t = performance.now();
        if (due(t)) {
          const f = d.face.detect(video, t);
          acc.add(f);
          seen.textContent = f ? 'лицо видно' : 'лица не видно';
        }
        const rest = Math.ceil((durationMs - (t - start)) / 1000);
        if (rest > 0) {
          left.textContent = `${rest} с`;
          requestAnimationFrame(step);
          return;
        }
        left.textContent = '';
        const r = acc.result(kind, d.prev, d.cfg);
        if (r.ok) {
          void saveBaseline(r.baseline).then(() => resolve(r.baseline));
        } else {
          fail.textContent = FAIL[r.reason];
          again.hidden = false;
        }
      };
      requestAnimationFrame(step);
    };
    again.onclick = attempt;
    void video.play().catch(() => {});
    attempt();
  });
}
