import './ui/styles.css';
import { route, startRouter } from './ui/router';
import { renderDiag } from './ui/diag';
import { renderHistory, renderReport } from './ui/report';

function stub(title: string) {
  return (root: HTMLElement) => {
    const h = document.createElement('h1');
    h.textContent = title;
    root.append(h);
  };
}

route('/', stub('Суфлёр'));
route('/calibrate', stub('Калибровка'));
route('/report/:id', renderReport);
route('/history', renderHistory);
route('/settings', stub('Настройки'));
route('/diag', renderDiag);

startRouter(document.getElementById('app')!);
