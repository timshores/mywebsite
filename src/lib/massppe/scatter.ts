// Scatterplots for the Commonwealth tab: points by group, a linear or log x axis, a
// smoothed curve (LOESS, as R's geom_smooth draws it), labels that dodge one another,
// and the nearest point under the pointer. Plain SVG, like charts.ts.

import { svgEl } from "./charts";

export interface Point {
  x: number;
  y: number;
  id: string;
  name: string;
  group: string;
  label?: boolean;
}

export interface Group {
  label: string;
  color: string;
  shape: "circle" | "square" | "triangle";
  /** Drawn later sits on top */
  z: number;
}

export interface ScatterOpts {
  width: number;
  height: number;
  logX?: boolean;
  xFmt: (v: number) => string;
  yFmt: (v: number) => string;
  xTitle?: string;
  yTitle?: string;
  /** Shorter names, used when the full ones won't fit along the axis */
  xTitleShort?: string;
  yTitleShort?: string;
  groups: Record<string, Group>;
  smooth?: boolean;
  /** A thumbnail: no axis text, labels, or pointer */
  mini?: boolean;
  /** A reference line across the chart at this y, such as zero */
  refY?: number;
  /** A reference line up the chart at this x, such as a threshold */
  refX?: number;
  onHover?: (p: Point | null, at: { left: number; top: number } | null) => void;
  onPick?: (p: Point) => void;
}

const FULL = { top: 14, right: 22, bottom: 52, left: 78 };
// Axis titles: big and bold, the first place to look for what's plotted (.sc-title)
const TITLE_PX = 15;
/** A rough width for bold title text, enough to choose between the full and short names. */
const titleWidth = (s: string) => s.length * TITLE_PX * 0.6;
const MINI = { top: 8, right: 8, bottom: 8, left: 8 };

/** Ticks spanning min..max without forcing zero in. */
export function ticksFor(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min - 1, min, min + 1];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-6; v += step) out.push(Math.round(v * 1e9) / 1e9);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

/** Powers of ten inside min..max, with 2s and 5s (or 3s) between them. */
function logTicks(min: number, max: number): number[] {
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  const steps = hi - lo <= 3 ? [1, 2, 5] : [1, 3];
  const out: number[] = [];
  for (let e = lo; e <= hi; e++) for (const k of steps) if (k * 10 ** e >= min && k * 10 ** e <= max) out.push(k * 10 ** e);
  return out;
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

function mark(g: SVGGElement, shape: Group["shape"], x: number, y: number, r: number, fill: string, cls: string) {
  if (shape === "square") return svgEl("rect", { x: x - r * 0.9, y: y - r * 0.9, width: r * 1.8, height: r * 1.8, fill, class: cls }, g);
  if (shape === "triangle") {
    const h = r * 1.25;
    return svgEl("path", { d: `M${x},${y - h}L${x + h},${y + h * 0.75}L${x - h},${y + h * 0.75}Z`, fill, class: cls }, g);
  }
  return svgEl("circle", { cx: x, cy: y, r, fill, class: cls }, g);
}

export function scatter(svg: SVGSVGElement, points: Point[], o: ScatterOpts) {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${o.width} ${o.height}`);
  const m = o.mini ? MINI : FULL;
  const pw = o.width - m.left - m.right;
  const ph = o.height - m.top - m.bottom;
  const pts = o.logX ? points.filter((p) => p.x > 0) : points;
  if (!pts.length) return { highlight: () => {} };
  const fx = (v: number) => (o.logX ? Math.log10(v) : v);
  const xsRaw = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const xTicks = o.logX ? logTicks(Math.min(...xsRaw), Math.max(...xsRaw)) : ticksFor(Math.min(...xsRaw), Math.max(...xsRaw));
  const yTicks = ticksFor(Math.min(...ys), Math.max(...ys));
  // A log axis pads the data a little; a linear one runs from tick to tick
  const x0 = o.logX ? Math.log10(Math.min(...xsRaw) / 1.15) : xTicks[0];
  const x1 = o.logX ? Math.log10(Math.max(...xsRaw) * 1.15) : xTicks[xTicks.length - 1];
  const [y0, y1] = [yTicks[0], yTicks[yTicks.length - 1]];
  const sx = (v: number) => m.left + ((fx(v) - x0) / (x1 - x0 || 1)) * pw;
  const sy = (v: number) => m.top + ph - ((v - y0) / (y1 - y0 || 1)) * ph;

  if (!o.mini) {
    const grid = svgEl("g", { class: "sc-grid" }, svg);
    for (const t of yTicks) {
      svgEl("line", { x1: m.left, x2: m.left + pw, y1: sy(t), y2: sy(t) }, grid);
      const label = svgEl("text", { x: m.left - 8, y: sy(t), dy: "0.32em", "text-anchor": "end", class: "sc-tick" }, svg);
      label.textContent = o.yFmt(t);
    }
    for (const t of xTicks) {
      if (sx(t) < m.left - 1 || sx(t) > m.left + pw + 1) continue;
      svgEl("line", { x1: sx(t), x2: sx(t), y1: m.top, y2: m.top + ph }, grid);
      const label = svgEl("text", { x: sx(t), y: m.top + ph + 16, "text-anchor": "middle", class: "sc-tick" }, svg);
      label.textContent = o.xFmt(t);
    }
    // The first name that fits: full, short, short without "(log scale)"; past that, smaller type
    const place = (t: SVGTextElement, names: (string | undefined)[], room: number) => {
      const tries = names.filter((n): n is string => !!n);
      const name = tries.find((n) => titleWidth(n) <= room) ?? tries[tries.length - 1];
      t.textContent = name;
      if (titleWidth(name) > room) t.style.fontSize = `${Math.max(10, Math.floor((TITLE_PX * room) / titleWidth(name)))}px`;
    };
    if (o.xTitle) {
      const log = o.logX ? " (log scale)" : "";
      const t = svgEl("text", { x: m.left + pw / 2, y: o.height - 8, "text-anchor": "middle", class: "sc-title" }, svg);
      place(t, [o.xTitle + log, o.xTitleShort && o.xTitleShort + log, o.xTitleShort], pw + m.left - 8);
    }
    if (o.yTitle) {
      const t = svgEl("text", { x: 0, y: 0, transform: `translate(17 ${m.top + ph / 2}) rotate(-90)`, "text-anchor": "middle", class: "sc-title" }, svg);
      place(t, [o.yTitle, o.yTitleShort], ph);
    }
  }

  if (o.refY != null && o.refY >= y0 && o.refY <= y1) {
    svgEl("line", { x1: m.left, x2: m.left + pw, y1: sy(o.refY), y2: sy(o.refY), class: "sc-ref" }, svg);
  }

  if (o.refX != null && (!o.logX || o.refX > 0) && fx(o.refX) >= x0 && fx(o.refX) <= x1) {
    svgEl("line", { x1: sx(o.refX), x2: sx(o.refX), y1: m.top, y2: m.top + ph, class: "sc-ref" }, svg);
  }

  const plot = svgEl("g", { class: "sc-points" }, svg);
  const order = [...pts].sort((a, b) => (o.groups[a.group]?.z ?? 0) - (o.groups[b.group]?.z ?? 0));
  const r = o.mini ? 2.2 : 4;
  for (const p of order) {
    const g = o.groups[p.group];
    mark(plot, g?.shape ?? "circle", sx(p.x), sy(p.y), r, g?.color ?? "#999", `sc-pt sc-${p.group}`);
  }

  if (o.smooth) {
    const curve = loess(pts.map((p) => fx(p.x)), ys);
    if (curve.length) {
      const d = curve.map(([cx, cy], k) => `${k ? "L" : "M"}${(m.left + ((cx - x0) / (x1 - x0 || 1)) * pw).toFixed(1)},${sy(cy).toFixed(1)}`).join("");
      svgEl("path", { d, class: o.mini ? "sc-smooth mini" : "sc-smooth" }, svg);
    }
  }

  // Labels: beside the point if there's room, else farther out on a short leader line;
  // a label that finds no clear spot goes to its right anyway, since it was asked for
  if (!o.mini) {
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const marks = pts.map((q) => ({ x: sx(q.x), y: sy(q.y) }));
    const layer = svgEl("g", { class: "sc-labels" }, svg);
    const dirs = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 1], [-1, -1], [-1, 1]] as const;
    for (const p of pts.filter((q) => q.label)) {
      const px = sx(p.x);
      const py = sy(p.y);
      const w = p.name.length * 6.6;
      let spot: { tx: number; ty: number; anchor: string; box: (typeof placed)[number]; far: boolean } | null = null;
      for (const reach of [8, 22, 40]) {
        for (const [dx, dy] of dirs) {
          const tx = px + dx * reach;
          const ty = py + dy * (reach + 4);
          const anchor = dx > 0 ? "start" : dx < 0 ? "end" : "middle";
          const bx0 = anchor === "start" ? tx : anchor === "end" ? tx - w : tx - w / 2;
          const box = { x0: bx0, x1: bx0 + w, y0: ty - 8, y1: ty + 5 };
          if (box.x0 < m.left || box.x1 > o.width - 2 || box.y0 < 0 || box.y1 > m.top + ph) continue;
          if (placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
          // Don't cover other districts' points
          if (marks.filter((q) => q.x > box.x0 - 3 && q.x < box.x1 + 3 && q.y > box.y0 - 3 && q.y < box.y1 + 3).length > 1) continue;
          spot = { tx, ty, anchor, box, far: reach > 8 };
          break;
        }
        if (spot) break;
      }
      spot ??= { tx: px + 8, ty: py, anchor: "start", box: { x0: px + 8, x1: px + 8 + w, y0: py - 8, y1: py + 5 }, far: false };
      placed.push(spot.box);
      if (spot.far) {
        const ex = spot.anchor === "start" ? spot.box.x0 - 2 : spot.anchor === "end" ? spot.box.x1 + 2 : spot.tx;
        svgEl("line", { x1: px, y1: py, x2: ex, y2: spot.ty, class: "sc-leader" }, layer);
      }
      const t = svgEl("text", { x: spot.tx, y: spot.ty, dy: "0.32em", "text-anchor": spot.anchor, class: "sc-label" }, layer);
      t.textContent = p.name;
    }
  }

  // The nearest point to the pointer, within reach, is read out and can be picked
  const ring = svgEl("circle", { r: 8, class: "sc-ring", cx: -99, cy: -99 }, svg);
  const highlight = (id: string | null) => {
    const p = id ? pts.find((q) => q.id === id) : null;
    ring.setAttribute("cx", String(p ? sx(p.x) : -99));
    ring.setAttribute("cy", String(p ? sy(p.y) : -99));
  };
  if (!o.mini) {
    const nearest = (ev: PointerEvent) => {
      const box = svg.getBoundingClientRect();
      const scale = o.width / box.width;
      const mx = (ev.clientX - box.left) * scale;
      const my = (ev.clientY - box.top) * scale;
      let best: Point | null = null;
      let bd = (16 * scale) ** 2;
      for (const p of pts) {
        const d = (sx(p.x) - mx) ** 2 + (sy(p.y) - my) ** 2;
        if (d < bd) [best, bd] = [p, d];
      }
      return { best, left: best ? sx(best.x) / scale : 0, top: best ? sy(best.y) / scale : 0 };
    };
    svg.addEventListener("pointermove", (ev) => {
      const { best, left, top } = nearest(ev);
      highlight(best?.id ?? null);
      svg.style.cursor = best && o.onPick ? "pointer" : "";
      o.onHover?.(best, best ? { left, top } : null);
    });
    svg.addEventListener("pointerleave", () => {
      highlight(null);
      o.onHover?.(null, null);
    });
    svg.addEventListener("click", (ev) => {
      const { best } = nearest(ev as PointerEvent);
      if (best) o.onPick?.(best);
    });
  }
  return { highlight };
}
