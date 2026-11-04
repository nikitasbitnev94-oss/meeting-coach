export const SR = 16000;
export const FRAME = 320;

export const tone = (level: number) => new Float32Array(FRAME).fill(level);

export function sine(freq: number, ms: number, amp = 0.3): Float32Array {
  const n = Math.round(SR * ms / 1000);
  return Float32Array.from({ length: n }, (_, i) => amp * Math.sin(2 * Math.PI * freq * i / SR));
}

export function chirp(f0: number, f1: number, ms: number, amp = 0.3): Float32Array {
  const n = Math.round(SR * ms / 1000);
  let phase = 0;
  return Float32Array.from({ length: n }, (_, i) => {
    const f = f0 + (f1 - f0) * i / n;
    phase += 2 * Math.PI * f / SR;
    return amp * Math.sin(phase);
  });
}

export function noise(ms: number, amp = 0.3): Float32Array {
  const n = Math.round(SR * ms / 1000);
  let s = 12345;
  return Float32Array.from({ length: n }, () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return amp * (s / 0x7fffffff * 2 - 1);
  });
}

export function frames(sig: Float32Array): Float32Array[] {
  const out: Float32Array[] = [];
  for (let i = 0; i + FRAME <= sig.length; i += FRAME) out.push(sig.slice(i, i + FRAME));
  return out;
}
