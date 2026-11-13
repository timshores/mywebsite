// The explorer's statistics, each computed one way wherever it appears (#237): the median and quantiles, the
// least-squares line and its compound growth, rank and ordinary correlation, and the smoothed curve the plots draw.

/** The median: the middle value, or the mean of the middle two when the count is even; NaN for none */
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN;
}

/** The value at quantile q, by nearest rank: the map's cut points */
export function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
}

/** The least-squares straight line through the points that have a value, at each index from the first such point to
 * the last; null outside them, and all null with fewer than three values. The trend of every chart and of the map. */
export function linearFit(values: (number | null)[]): (number | null)[] {
  const pts = values.flatMap((v, i) => (v == null ? [] : [[i, v] as const]));
  if (pts.length < 3) return values.map(() => null);
  const n = pts.length;
  const mx = pts.reduce((a, [x]) => a + x, 0) / n;
  const my = pts.reduce((a, [, y]) => a + y, 0) / n;
  const slope = pts.reduce((a, [x, y]) => a + (x - mx) * (y - my), 0) / pts.reduce((a, [x]) => a + (x - mx) ** 2, 0);
  const [first, last] = [pts[0][0], pts[n - 1][0]];
  return values.map((_, i) => (i < first || i > last ? null : my + slope * (i - mx)));
}

/** The least-squares connected line: straight between the knots (indexes), free to turn at each, and never jumping.
 * One fit over every point, of a starting value, a first slope, and a change of slope at each knot. Values as
 * linearFit gives them; all null with too few points to settle every slope. The trend with Trend breaks on (#268). */
export function hingeFit(values: (number | null)[], knots: number[]): (number | null)[] {
  const pts = values.flatMap((v, i) => (v == null ? [] : [[i, v] as const]));
  const none = values.map(() => null);
  const m = knots.length + 2;
  if (pts.length < Math.max(3, m)) return none;
  const row = (x: number) => [1, x, ...knots.map((k) => Math.max(0, x - k))];
  // The normal equations, solved by elimination with pivoting
  const a = Array.from({ length: m }, () => new Array<number>(m + 1).fill(0));
  for (const [x, y] of pts) {
    const r = row(x);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) a[i][j] += r[i] * r[j];
      a[i][m] += r[i] * y;
    }
  }
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-9) return none;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const k = a[r][c] / a[c][c];
      for (let j = c; j <= m; j++) a[r][j] -= k * a[c][j];
    }
  }
  const beta = a.map((r, i) => r[m] / r[i]);
  const [first, last] = [pts[0][0], pts[pts.length - 1][0]];
  return values.map((_, i) => (i < first || i > last ? null : row(i).reduce((s, v, j) => s + v * beta[j], 0)));
}

/** Compound growth a year from first to last over years; null where either isn't above zero */
export function cagr(first: number | null, last: number | null, years: number): number | null {
  if (first == null || last == null || first <= 0 || last <= 0 || years <= 0) return null;
  return (last / first) ** (1 / years) - 1;
}

/** Spearman's rank correlation: Pearson's r on the ranks, ties sharing their average rank. */
export function spearman(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const rank = (v: number[]) => {
    const order = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(n);
    for (let i = 0; i < n; ) {
      let j = i;
      while (j + 1 < n && order[j + 1][0] === order[i][0]) j++;
      for (let k = i; k <= j; k++) r[order[k][1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const a = rank(xs);
  const b = rank(ys);
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : null;
}

/** Pearson's r: the ordinary correlation, on the values themselves. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, v) => a + v, 0) / n;
  const my = ys.reduce((a, v) => a + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

/** Local linear regression with tricube weights over the nearest `span` of the points. */
export function loess(xs: number[], ys: number[], span = 0.75, steps = 80): [number, number][] {
  const n = xs.length;
  if (n < 5) return [];
  const k = Math.max(3, Math.ceil(span * n));
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const out: [number, number][] = [];
  for (let s = 0; s <= steps; s++) {
    const x0 = lo + ((hi - lo) * s) / steps;
    const d = xs.map((x) => Math.abs(x - x0));
    const h = [...d].sort((a, b) => a - b)[k - 1] || 1e-12;
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      const u = d[i] / h;
      if (u >= 1) continue;
      const w = (1 - u ** 3) ** 3;
      sw += w; sx += w * xs[i]; sy += w * ys[i]; sxx += w * xs[i] ** 2; sxy += w * xs[i] * ys[i];
    }
    if (!sw) continue;
    const den = sw * sxx - sx * sx;
    const slope = Math.abs(den) > 1e-12 ? (sw * sxy - sx * sy) / den : 0;
    out.push([x0, (sy - slope * sx) / sw + slope * x0]);
  }
  return out;
}
