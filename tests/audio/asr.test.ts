import { waitModel, flushRecognizer } from '../../src/audio/asr';

class Emitter {
  private cbs = new Map<string, ((m: any) => void)[]>();
  on(ev: string, cb: (m: any) => void) { this.cbs.set(ev, [...(this.cbs.get(ev) ?? []), cb]); }
  emit(ev: string, m: any) { (this.cbs.get(ev) ?? []).forEach(cb => cb(m)); }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('waitModel', () => {
  test('загрузилась', async () => {
    const m = new Emitter(); const p = waitModel(m, 1000);
    m.emit('load', { result: true });
    await expect(p).resolves.toBeUndefined();
  });
  test('ошибка воркера — отказ, без зависания', async () => {
    const m = new Emitter(); const p = waitModel(m, 1000);
    m.emit('error', { error: 'fetch failed' });
    await expect(p).rejects.toThrow('fetch failed');
  });
  test('load с result:false — отказ', async () => {
    const m = new Emitter(); const p = waitModel(m, 1000);
    m.emit('load', { result: false });
    await expect(p).rejects.toThrow();
  });
  test('нет ответа — отказ по таймауту', async () => {
    const m = new Emitter(); const p = waitModel(m, 1000);
    const assertion = expect(p).rejects.toThrow('таймаут');
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
  });
});

describe('flushRecognizer', () => {
  test('просит финальный результат и ждёт его', async () => {
    const r = Object.assign(new Emitter(), { retrieveFinalResult: vi.fn() });
    let done = false;
    const p = flushRecognizer(r, 1000).then(() => { done = true; });
    expect(r.retrieveFinalResult).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10);
    expect(done).toBe(false);
    r.emit('result', { result: { result: [] } });
    await p;
    expect(done).toBe(true);
  });
  test('без ответа завершается по таймауту', async () => {
    const r = Object.assign(new Emitter(), { retrieveFinalResult: vi.fn() });
    const p = flushRecognizer(r, 1000);
    await vi.advanceTimersByTimeAsync(1001);
    await expect(p).resolves.toBeUndefined();
  });
});
