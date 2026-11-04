/**
 * «Э или не э» по тембру: логистическая регрессия по 13 кепстральным коэффициентам отрезка.
 * Обучена 04.11.2026 на разметке пользователя (10 мин записи, 46 «эээ», 224 отрезка-кандидата,
 * участок с чужими голосами исключён). Вместе с проверкой по словам: 31 из 46 найдено, 14 лишних.
 */
const MODEL: { mu: number[]; sd: number[]; coef: number[]; intercept: number } = {"mu": [11.15929, 0.61948, 4.90454, -0.10925, -0.66834, 0.89145, -1.19855, 1.36856, -1.92278, -0.3168, 1.5177, -1.0854, 2.64642, 2.23359, 2.07971, 1.69843, 1.23464, 1.25531, 1.14212, 1.11733, 1.03293, 0.96774, 0.86884, 0.75981, 5.56219, 0.33321], "sd": [2.36136, 2.73154, 2.81992, 2.01611, 1.21445, 1.29021, 0.96011, 0.90945, 0.97661, 1.02061, 0.75106, 0.67457, 1.13938, 0.94172, 1.05268, 0.74895, 0.40816, 0.44506, 0.38066, 0.34831, 0.35421, 0.34628, 0.27527, 0.20024, 2.39615, 0.09307], "coef": [-0.18272, -0.18101, -0.0677, -0.00908, 0.06295, 0.19094, 0.22731, -0.11852, 0.22122, 0.07112, 0.16571, -0.00552, -0.27029, 0.08239, 0.02693, 0.04167, -0.27107, 0.2584, -0.22905, -0.15013, -0.38773, -0.08418, -0.25137, 0.34164, -0.0634, 0.19633], "intercept": -0.32579};

const N_CEPS = 13;

/** DCT-II с ортонормировкой, первые k коэффициентов. */
export function dctOrtho(x: number[], k: number): number[] {
  const n = x.length;
  const out: number[] = [];
  for (let j = 0; j < k; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += x[i] * Math.cos((Math.PI * j * (2 * i + 1)) / (2 * n));
    out.push(s * (j === 0 ? Math.sqrt(1 / n) : Math.sqrt(2 / n)));
  }
  return out;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const std = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); };

/** Признаки отрезка: средние и разброс коэффициентов 1–12, разброс коэффициента 0 (громкость), длительность в секундах. */
export function hesitationFeatures(melFlat: number[], bands: number, durMs: number): number[] {
  const frames: number[][] = [];
  for (let i = 0; i + bands <= melFlat.length; i += bands) frames.push(dctOrtho(melFlat.slice(i, i + bands), N_CEPS));
  const col = (c: number) => frames.map(f => f[c]);
  const means: number[] = [], stds: number[] = [];
  for (let c = 1; c < N_CEPS; c++) { means.push(mean(col(c))); stds.push(std(col(c))); }
  return [...means, ...stds, std(col(0)), durMs / 1000];
}

export function hesitationProbability(melFlat: number[], bands: number, durMs: number): number {
  const f = hesitationFeatures(melFlat, bands, durMs);
  let z = MODEL.intercept;
  for (let i = 0; i < f.length; i++) z += MODEL.coef[i] * ((f[i] - MODEL.mu[i]) / MODEL.sd[i]);
  return 1 / (1 + Math.exp(-z));
}
