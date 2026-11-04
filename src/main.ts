import './ui/styles.css';
import { route, startRouter } from './ui/router';

function stub(title: string) {
  return (root: HTMLElement) => {
    const h = document.createElement('h1');
    h.textContent = title;
    root.append(h);
  };
}

route('/', stub('Суфлёр'));
route('/calibrate', stub('Калибровка'));
route('/report/:id', stub('Отчёт'));
route('/history', stub('История встреч'));
route('/settings', stub('Настройки'));
route('/diag', stub('Диагностика'));

startRouter(document.getElementById('app')!);
