import './ui/styles.css';
import { route, startRouter } from './ui/router';
import { renderDiag } from './ui/diag';
import { renderHistory, renderReport } from './ui/report';
import { renderSettings } from './ui/settings';
import { renderRecalibrate, renderStart } from './ui/start';

route('/', renderStart);
route('/calibrate', renderRecalibrate);
route('/report/:id', renderReport);
route('/history', renderHistory);
route('/settings', renderSettings);
route('/diag', renderDiag);

startRouter(document.getElementById('app')!);
