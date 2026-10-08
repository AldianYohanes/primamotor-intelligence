/**
 * Uji statistik berpasangan untuk membandingkan multi-agent vs single-agent pada
 * skenario yang sama (bab 4). Tanpa dependensi; distribusi dihitung eksak.
 */

/** log C(n, k), aman untuk n besar. */
function logChoose(n: number, k: number): number {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}

export interface McNemarResult {
  /** Multi berhasil, single gagal. */
  b: number;
  /** Multi gagal, single berhasil. */
  c: number;
  /** Pasangan diskordan (b + c). */
  n: number;
  /** p dua sisi uji binomial eksak McNemar; 1 bila tidak ada pasangan diskordan. */
  p: number;
}

/**
 * McNemar eksak: di bawah H0, b ~ Binomial(b + c, 0,5). Cocok untuk sampel kecil
 * (puluhan skenario) yang membuat aproksimasi chi-kuadrat tidak layak.
 */
export function mcnemarExact(pairs: { a: boolean; b: boolean }[]): McNemarResult {
  const b = pairs.filter((p) => p.a && !p.b).length;
  const c = pairs.filter((p) => !p.a && p.b).length;
  const n = b + c;
  if (n === 0) return { b, c, n, p: 1 };
  const k = Math.min(b, c);
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += Math.exp(logChoose(n, i) - n * Math.LN2);
  return { b, c, n, p: Math.min(1, 2 * tail) };
}

export interface WilcoxonResult {
  /** Pasangan dengan selisih ≠ 0. */
  n: number;
  /** Jumlah peringkat untuk selisih positif (a − b > 0). */
  wPlus: number;
  wMinus: number;
  /** Median selisih a − b (semua pasangan, termasuk nol). */
  medianDiff: number | null;
  /** p dua sisi eksak (peringkat bersama ditangani dengan peringkat rata-rata). */
  p: number;
}

/**
 * Wilcoxon signed-rank eksak. Selisih nol dibuang (Wilcoxon), peringkat bersama
 * dirata-rata; distribusi nol dihitung dengan DP atas peringkat yang digandakan
 * supaya peringkat x,5 tetap bilangan bulat.
 */
export function wilcoxonSignedRank(pairs: { a: number; b: number }[]): WilcoxonResult {
  const all = pairs.map((p) => p.a - p.b);
  const sortedAll = [...all].sort((x, y) => x - y);
  const medianDiff =
    sortedAll.length === 0
      ? null
      : sortedAll.length % 2
        ? sortedAll[(sortedAll.length - 1) / 2]
        : (sortedAll[sortedAll.length / 2 - 1] + sortedAll[sortedAll.length / 2]) / 2;

  const d = all.filter((x) => x !== 0);
  const n = d.length;
  if (n === 0) return { n, wPlus: 0, wMinus: 0, medianDiff, p: 1 };

  const order = d.map((x, i) => ({ abs: Math.abs(x), i })).sort((x, y) => x.abs - y.abs);
  const rank2 = new Array<number>(n); // peringkat × 2
  for (let s = 0; s < n; ) {
    let e = s;
    while (e + 1 < n && order[e + 1].abs === order[s].abs) e++;
    const avg2 = s + 1 + e + 1; // (rank_s + rank_e), = 2 × rata-rata
    for (let k = s; k <= e; k++) rank2[order[k].i] = avg2;
    s = e + 1;
  }
  const wPlus2 = d.reduce((sum, x, i) => sum + (x > 0 ? rank2[i] : 0), 0);
  const total2 = rank2.reduce((a, b) => a + b, 0);

  // Distribusi nol: setiap peringkat bertanda + atau − dengan peluang ½.
  let dist = new Map<number, number>([[0, 1]]);
  for (const r of rank2) {
    const next = new Map<number, number>();
    for (const [w, prob] of dist) {
      next.set(w, (next.get(w) ?? 0) + prob / 2);
      next.set(w + r, (next.get(w + r) ?? 0) + prob / 2);
    }
    dist = next;
  }
  const observed = Math.min(wPlus2, total2 - wPlus2);
  let tail = 0;
  for (const [w, prob] of dist) if (w <= observed + 1e-9) tail += prob;

  return { n, wPlus: wPlus2 / 2, wMinus: (total2 - wPlus2) / 2, medianDiff, p: Math.min(1, 2 * tail) };
}
