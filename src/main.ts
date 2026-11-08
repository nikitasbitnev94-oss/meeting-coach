import './ui/styles.css';
import { route, startRouter } from './ui/router';
import { renderDiag } from './ui/diag';
import { renderHistory, renderReport } from './ui/report';
import { renderSettings } from './ui/settings';
import { renderStart } from './ui/start';
import { renderVoice } from './ui/voice';

route('/', renderStart);
route('/report/:id', renderReport);
route('/history', renderHistory);
route('/settings', renderSettings);
route('/diag', renderDiag);
route('/voice', renderVoice);

startRouter(document.getElementById('app')!);
