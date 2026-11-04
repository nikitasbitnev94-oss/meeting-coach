/** Накопитель: принимает блоки любой длины, отдаёт кадры фиксированной длины size. */
export class Framer {
  private buf: Float32Array;
  private len = 0;
  constructor(private size: number) {
    this.buf = new Float32Array(size);
  }
  push(samples: Float32Array): Float32Array[] {
    const out: Float32Array[] = [];
    let i = 0;
    while (i < samples.length) {
      const n = Math.min(this.size - this.len, samples.length - i);
      this.buf.set(samples.subarray(i, i + n), this.len);
      this.len += n;
      i += n;
      if (this.len === this.size) {
        out.push(this.buf.slice());
        this.len = 0;
      }
    }
    return out;
  }
}
