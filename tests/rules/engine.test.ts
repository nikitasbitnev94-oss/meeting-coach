import { RuleEngine, type EngineInput, type EngineOutput } from '../../src/rules/engine';
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import type { CoachEvent, VisionSignals } from '../../src/types';

const V = (over: Partial<VisionSignals> = {}): VisionSignals => ({
  gazeOnCamera: true, frown: false, irritation: false, skepticism: false, surprise: false,
  smirk: false, cheer: false, handNearFace: false, expressivityRatio: 1, stillMs: 0, ...over,
});

function run(e: RuleEngine, from: number, to: number, step: number,
  i: Partial<Omit<EngineInput, 'tMs'>>): EngineOutput {
  let out!: EngineOutput;
  for (let t = from; t <= to; t += step) {
    out = e.update({ tMs: t, speaking: false, vision: V(), fillerHits: [], ...i });
  }
  return out;
}

test('порог: руки у лица 1 с', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  expect(run(e, 0, 900, 100, { vision: V({ handNearFace: true }) }).hint).toBeNull();
  expect(run(e, 1000, 1000, 100, { vision: V({ handNearFace: true }) }).hint?.id).toBe('hands');
});
test('текст подсказки из конфига', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  expect(run(e, 0, 1000, 100, { vision: V({ handNearFace: true }) }).hint).toEqual({ id: 'hands', text: 'руки от лица' });
});
test('приоритет: руки важнее хмурости', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  expect(run(e, 0, 3000, 100, { vision: V({ handNearFace: true, frown: true }) }).hint?.id).toBe('hands');
});
test('более приоритетная вытесняет текущую сразу', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  run(e, 0, 3000, 100, { vision: V({ frown: true }) });
  expect(run(e, 3100, 4100, 100, { vision: V({ frown: true, handNearFace: true }) }).hint?.id).toBe('hands');
});
test('усмешка только пока пользователь молчит', () => {
  expect(run(new RuleEngine(DEFAULT_CONFIG), 0, 2000, 100, { speaking: true, vision: V({ smirk: true }) }).hint).toBeNull();
  expect(run(new RuleEngine(DEFAULT_CONFIG), 0, 1500, 100, { speaking: false, vision: V({ smirk: true }) }).hint?.id).toBe('smirk');
});
test('весёлость 3 с', () => {
  expect(run(new RuleEngine(DEFAULT_CONFIG), 0, 2900, 100, { vision: V({ cheer: true }) }).hint).toBeNull();
  expect(run(new RuleEngine(DEFAULT_CONFIG), 0, 3000, 100, { vision: V({ cheer: true }) }).hint?.id).toBe('cheer');
});
test('весёлость срабатывает и при звуке: смех суфлёр слышит как речь', () => {
  expect(run(new RuleEngine(DEFAULT_CONFIG), 0, 3000, 100, { speaking: true, vision: V({ cheer: true }) }).hint?.id).toBe('cheer');
});
test('взгляд только пока пользователь говорит', () => {
  expect(run(new RuleEngine(DEFAULT_CONFIG), 0, 4000, 100, { speaking: false, vision: V({ gazeOnCamera: false }) }).hint).toBeNull();
  expect(run(new RuleEngine(DEFAULT_CONFIG), 0, 3000, 100, { speaking: true, vision: V({ gazeOnCamera: false }) }).hint?.id).toBe('gaze');
});
test('активная мимика по отношению к норме', () => {
  expect(run(new RuleEngine(DEFAULT_CONFIG), 0, 100, 100, { vision: V({ expressivityRatio: 2.1 }) }).hint?.id).toBe('expressive');
  expect(run(new RuleEngine(DEFAULT_CONFIG), 0, 100, 100, { vision: V({ expressivityRatio: 1.9 }) }).hint).toBeNull();
});
test('каменное лицо 3 минуты, пока пользователь молчит', () => {
  expect(run(new RuleEngine(DEFAULT_CONFIG), 0, 100, 100, { vision: V({ stillMs: 180000 }) }).hint?.id).toBe('stone');
  expect(run(new RuleEngine(DEFAULT_CONFIG), 0, 100, 100, { speaking: true, vision: V({ stillMs: 180000 }) }).hint).toBeNull();
});
test('минимум 2 с показа', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  run(e, 0, 1000, 100, { vision: V({ handNearFace: true }) });
  expect(run(e, 1100, 2900, 100, { vision: V() }).hint?.id).toBe('hands');
  expect(run(e, 3000, 3100, 100, { vision: V() }).hint).toBeNull();
});
test('пауза 60 с между показами одной подсказки, событие пишется', () => {
  const e = new RuleEngine(DEFAULT_CONFIG); const closed: CoachEvent[] = [];
  const tick = (t: number, on: boolean) => e.update({ tMs: t, speaking: false, vision: V({ frown: on }), fillerHits: [] });
  for (let t = 0; t <= 3500; t += 100) closed.push(...tick(t, true).closed);
  for (let t = 3600; t <= 6000; t += 100) closed.push(...tick(t, false).closed);
  let last!: EngineOutput;
  for (let t = 6100; t <= 9500; t += 100) { last = tick(t, true); closed.push(...last.closed); }
  expect(last.hint).toBeNull();
  closed.push(...tick(9600, false).closed);
  expect(closed.concat(e.finish(9600)).filter(c => c.type === 'frown')).toHaveLength(2);
});
test('после паузы 60 с подсказка снова показывается', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  run(e, 0, 1500, 100, { vision: V({ handNearFace: true }) });
  run(e, 1600, 61000, 100, { vision: V() });
  expect(run(e, 61100, 62100, 100, { vision: V({ handNearFace: true }) }).hint?.id).toBe('hands');
});
test('событие: начало условия и длительность', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  run(e, 0, 2500, 100, { vision: V({ frown: true }) });
  expect(e.finish(2600)).toEqual([]);
  const e2 = new RuleEngine(DEFAULT_CONFIG);
  run(e2, 0, 4000, 100, { vision: V({ frown: true }) });
  expect(e2.update({ tMs: 4100, speaking: false, vision: V(), fillerHits: [] }).closed)
    .toEqual([{ type: 'frown', tMs: 0, durationMs: 4100 }]);
});
test('лицо пропало: события закрываются, через 5 с статус', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  run(e, 0, 1500, 100, { vision: V({ handNearFace: true }) });
  expect(e.update({ tMs: 1600, speaking: false, vision: null, fillerHits: [] }).closed).toHaveLength(1);
  expect(run(e, 1700, 6500, 100, { vision: null }).status).toBe('ok');      // 4,9 с
  expect(run(e, 6600, 6600, 100, { vision: null }).status).toBe('face-lost'); // 5 с
});
test('лицо вернулось — статус ok', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  run(e, 0, 6000, 100, { vision: null });
  expect(run(e, 6100, 6100, 100, { vision: V() }).status).toBe('ok');
});
test('отдельное слово не становится главной подсказкой — оно в строке под ней', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  expect(e.update({ tMs: 0, speaking: true, vision: V(), fillerHits: [{ word: 'ну', tMs: 0 }] }).hint).toBeNull();
});
test('третий паразит за минуту — подсказка о частоте', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  const hit = (t: number, w: string) => e.update({ tMs: t, speaking: true, vision: V(), fillerHits: [{ word: w, tMs: t }] });
  hit(0, 'ну'); hit(10000, 'ну');
  expect(hit(20000, 'вот').hint).toEqual({ id: 'fillerBurst', text: '3 паразита за минуту — делай паузы' });
});
test('склонение: 5 паразитов, 21 паразит', () => {
  const e = new RuleEngine({ ...DEFAULT_CONFIG, display: { ...DEFAULT_CONFIG.display, burstCount: 5 } });
  const hits = (n: number) => Array.from({ length: n }, (_, i) => ({ word: 'ну', tMs: i }));
  expect(e.update({ tMs: 100, speaking: true, vision: V(), fillerHits: hits(5) }).hint?.text).toBe('5 паразитов за минуту — делай паузы');
  const e2 = new RuleEngine({ ...DEFAULT_CONFIG, display: { ...DEFAULT_CONFIG.display, burstCount: 21 } });
  expect(e2.update({ tMs: 100, speaking: true, vision: V(), fillerHits: hits(21) }).hint?.text).toBe('21 паразит за минуту — делай паузы');
});
test('подсказка о частоте держится 2 с', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  e.update({ tMs: 0, speaking: true, vision: V(), fillerHits: [0, 1, 2].map(i => ({ word: 'ну', tMs: i })) });
  expect(run(e, 100, 1900, 100, { speaking: true }).hint?.id).toBe('fillerBurst');
  expect(run(e, 2100, 2200, 100, { speaking: true }).hint).toBeNull();
});
test('подсказка о частоте — не чаще раза в минуту', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  const hit = (t: number) => e.update({ tMs: t, speaking: true, vision: V(), fillerHits: [{ word: 'ну', tMs: t }] });
  hit(0); hit(1000); expect(hit(2000).hint?.id).toBe('fillerBurst');
  run(e, 2100, 9000, 100, { speaking: true });
  expect(hit(10000).hint).toBeNull();
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
  const t = e.totals();
  expect(t.speakingMs).toBe(3000); expect(t.speakingWithFaceMs).toBe(2000); expect(t.onCameraMs).toBe(1000);
});
test('длинный разрыв между тиками ограничен 500 мс', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  e.update({ tMs: 0, speaking: true, vision: V(), fillerHits: [] });
  e.update({ tMs: 10000, speaking: true, vision: V(), fillerHits: [] });
  expect(e.totals().speakingMs).toBe(500);
});
test('отключённая подсказка молчит и не пишет событий', () => {
  const cfg = structuredClone(DEFAULT_CONFIG); cfg.enabled.hands = false;
  const e = new RuleEngine(cfg);
  expect(run(e, 0, 2000, 100, { vision: V({ handNearFace: true }) }).hint).toBeNull();
  expect(e.finish(2100)).toEqual([]);
});
test('отключённые паразиты не мигают', () => {
  const cfg = structuredClone(DEFAULT_CONFIG); cfg.enabled.filler = false; cfg.enabled.fillerBurst = false;
  const e = new RuleEngine(cfg);
  expect(e.update({ tMs: 0, speaking: true, vision: V(), fillerHits: [{ word: 'ну', tMs: 0 }] }).hint).toBeNull();
});

test('снимок открытых событий не закрывает их', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  run(e, 0, 4000, 100, { vision: V({ frown: true }) });
  expect(e.snapshot(4000)).toEqual([{ type: 'frown', tMs: 0, durationMs: 4000 }]);
  expect(e.update({ tMs: 4100, speaking: false, vision: V(), fillerHits: [] }).closed)
    .toEqual([{ type: 'frown', tMs: 0, durationMs: 4100 }]);
});

describe('«э-э» — подсказка о частоте', () => {
  const hit = (e: RuleEngine, t: number, word = 'э-э') =>
    e.update({ tMs: t, speaking: true, vision: V(), fillerHits: [{ word, tMs: t }] });
  test('одно «э-э» не мигает', () => {
    expect(hit(new RuleEngine(DEFAULT_CONFIG), 0).hint).toBeNull();
  });
  test('третье за минуту — подсказка с числом', () => {
    const e = new RuleEngine(DEFAULT_CONFIG);
    hit(e, 0); hit(e, 20000);
    expect(hit(e, 40000).hint).toEqual({ id: 'hesitation', text: 'э-э: 3 за минуту, делай паузы' });
  });
  test('старше минуты не считаются', () => {
    const e = new RuleEngine(DEFAULT_CONFIG);
    hit(e, 0); hit(e, 20000);
    expect(hit(e, 70000).hint).toBeNull();
  });
  test('не чаще раза в минуту', () => {
    const e = new RuleEngine(DEFAULT_CONFIG);
    hit(e, 0); hit(e, 1000); hit(e, 2000);
    run(e, 2100, 9000, 100, { speaking: true });
    expect(hit(e, 10000).hint).toBeNull();
  });
  test('«э-э» не участвует в «пауза вместо…»', () => {
    const e = new RuleEngine(DEFAULT_CONFIG);
    hit(e, 0); hit(e, 1000);
    expect(hit(e, 2000, 'ну').hint).toBeNull();   // один паразит, без «э-э» до трёх не дотягивает
  });
  test('подсказку можно отключить', () => {
    const cfg = structuredClone(DEFAULT_CONFIG); cfg.enabled.hesitation = false;
    const e = new RuleEngine(cfg);
    hit(e, 0); hit(e, 1000);
    expect(hit(e, 2000).hint).toBeNull();
  });
});

test('руки у лица работают, даже когда лицо закрыто рукой', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  expect(run(e, 0, 1000, 100, { vision: null, hands: true }).hint?.id).toBe('hands');
});
test('отдельный сигнал рук важнее поля в vision', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  expect(run(e, 0, 1000, 100, { vision: V({ handNearFace: false }), hands: true }).hint?.id).toBe('hands');
});

test('руки: каждое касание сигналится, пауза 3 с', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  run(e, 0, 1500, 100, { hands: true });
  run(e, 1600, 5000, 100, { hands: false });
  expect(run(e, 5100, 6100, 100, { hands: true }).hint?.id).toBe('hands');
});
test('мимика: пауза между показами по-прежнему минута', () => {
  const e = new RuleEngine(DEFAULT_CONFIG);
  run(e, 0, 3500, 100, { vision: V({ frown: true }) });
  run(e, 3600, 8000, 100, { vision: V() });
  expect(run(e, 8100, 11100, 100, { vision: V({ frown: true }) }).hint).toBeNull();
});
