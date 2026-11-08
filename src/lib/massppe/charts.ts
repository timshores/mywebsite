// SVG charts for the explorer: stacked columns and lines on one shared year axis.
// Every panel uses the same margins, so a year sits at the same x in each one.

import { svgEl } from "./dom";

export type Val = number | null;

/** Years something happened, such as a vote that passed: a diamond just under the baseline, and where the year carries
 * an amount, a stem from the baseline up to it with an open head (a lollipop), so a small amount stays readable */
export interface Marks {
  key: string;
  color: string;
  at: boolean[];
  amount: Val[];
}

export interface Series {
  key: string;
  label: string;
  color: string;
  values: Val[];
  /** A dashed line's dash pattern (SVG stroke-dasharray), for a measure drawn apart from the rest */
  dash?: string;
  /** With only the trends shown, the trend's name, at one end of its line, and a shorter one for a narrow chart */
  endLabel?: string;
  endShort?: string;
}

/** With only the trends shown, each trend named in its own color at one end of its line: the top line's name above
 * it, the bottom line's below. Where the lines cross, the lower line's name moves to its other end, where it's the
 * top line; where a name would run into the axis, it moves too. Where lines run too close together for a name beside
 * its own, it steps past the lines crowding it, to the nearest gap above or below, at an end or the middle, its color
 * saying whose it is. Each lands where it's clear of the lines, the plot's edges, and the names already placed, or as
 * near that as the chart allows; one with no spot clear of the names already placed is left off. */
function trendLabels(svg: SVGSVGElement, ax: Axis, trends: Series[]) {
  const bottom = MARGIN.top + ax.plotH;
  const lines = trends.filter((s) => s.endLabel).map((s) => {
    const idx = s.values.flatMap((v, i) => (v != null ? [i] : []));
    const i0 = idx[0], i1 = idx[idx.length - 1];
    const v0 = s.values[i0]!, v1 = s.values[i1]!;
    const x0 = ax.x(i0), x1 = ax.x(i1);
    // A trend is straight: its height at any point between its ends, held to the plot, as it's drawn
    const at = (px: number) => {
      const f = x1 === x0 ? 0 : (Math.max(x0, Math.min(x1, px)) - x0) / (x1 - x0);
      return Math.max(MARGIN.top, Math.min(bottom, ax.y(v0 + (v1 - v0) * f)));
    };
    // Past its ends, the line isn't there to cross
    const yAt = (px: number) => (px < x0 - 1 || px > x1 + 1 ? null : at(px));
    return { s, x0, x1, at, yAt };
  });
  type Line = (typeof lines)[number];
  type Box = { x0: number; x1: number; top: number; bottom: number };
  type Anchor = "start" | "end" | "middle";
  // Whether no other line runs above this one at a point
  const onTop = (l: Line, px: number) => lines.every((o) => o === l || o.at(px) >= l.at(px) - 0.5);
  // Two lines cross where one is above at the start of the years they share and below at the end
  const crosses = (l: Line, o: Line) => {
    const a = Math.max(l.x0, o.x0), b = Math.min(l.x1, o.x1);
    return b > a && Math.sign(l.at(a) - o.at(a)) * Math.sign(l.at(b) - o.at(b)) < 0;
  };
  const placed: Box[] = [];
  for (const l of [...lines].sort((p, q) => p.at(p.x1) - q.at(q.x1))) {
    const tx = svgEl("text", { class: "trend-label", fill: l.s.color }, svg);
    const measure = (words: string) => {
      tx.textContent = words;
      return tx.getComputedTextLength() || words.length * 6.6;
    };
    // A name that would take more than half the plot gives way to its short form
    let w = measure(l.s.endLabel!);
    if (l.s.endShort && w > ax.plotW / 2) w = measure(l.s.endShort);
    const mid = (l.x0 + l.x1) / 2;
    const ends: Anchor[] = lines.some((o) => o !== l && crosses(l, o)) && !onTop(l, l.x1) ? ["start", "end"] : ["end", "start"];
    const xAt = (a: Anchor) => (a === "end" ? l.x1 : a === "start" ? l.x0 : mid);
    const sideAt = (a: Anchor, flip: boolean): "above" | "below" => (onTop(l, xAt(a)) !== flip ? "above" : "below");
    // Beside its own line, in the order the rules prefer; then in the nearest gap clear of the lines, a row at a time
    const options: { at: Anchor; side: "above" | "below"; clear: boolean; row: number; pen: number }[] = [
      ...ends.map((a, k) => ({ at: a, side: sideAt(a, false), clear: false, row: 0, pen: k * 0.01 })),
      ...ends.map((a, k) => ({ at: a, side: sideAt(a, true), clear: false, row: 0, pen: 0.02 + k * 0.01 })),
      ...[...ends, "middle" as const].flatMap((a) => (["above", "below"] as const).flatMap((side) => [0, 1, 2, 3, 4].map((row) =>
        ({ at: a, side, clear: true, row, pen: 0.5 + row * 0.25 + (a === "middle" ? 0.25 : 0) })))),
    ];
    const spots = options.map(({ at, side, clear, row, pen }) => {
      // Held inside the chart's edges, and clear of the axis's numbers where it fits
      const want = at === "end" ? l.x1 - w : at === "start" ? l.x0 : mid - w / 2;
      const right = ax.frame.width - 2 - w;
      const bx0 = Math.max(Math.min(MARGIN.left - 4, right), 2, Math.min(right, want));
      const bx1 = bx0 + w;
      const xs: number[] = [];
      for (let px = bx0; px < bx1; px += 4) xs.push(px);
      xs.push(bx1);
      const ys = xs.map(l.at);
      // The other lines' heights across the words, and the first height from beside its own line, moving away from
      // it a row at a time, whose words none of them cross
      const others = lines.filter((o) => o !== l).flatMap((o) => xs.flatMap((px) => ((y) => (y == null ? [] : [y]))(o.yAt(px))));
      let y = side === "above" ? Math.min(...ys) - 7 : Math.max(...ys) + 15;
      for (let n = 0, k = 0; clear && n < 12; n++) {
        const hit = others.filter((oy) => oy > y - 14 && oy < y + 6);
        if (hit.length) y = side === "above" ? Math.min(...hit) - 7 : Math.max(...hit) + 15;
        else if (k < row) [y, k] = [y + (side === "above" ? -16 : 16), k + 1];
        else break;
      }
      const box: Box = { x0: bx0, x1: bx1, top: y - 12, bottom: y + 4 };
      // The lines between the words and their own, which make it harder to tell whose they are
      const cx = (bx0 + bx1) / 2, own = l.at(cx);
      const between = lines.filter((o) => o !== l && ((oy) => oy != null && (oy - own) * (oy - (y - 4)) < 0)(o.yAt(cx))).length;
      // What a spot runs into: the plot's top or the axis, another line, a name already placed
      const cost = pen + between * 0.4 + (box.top < 2 || box.bottom > bottom - 2 ? 4 : 0) +
        lines.filter((o) => o !== l && xs.some((px) => { const oy = o.yAt(px); return oy != null && oy > box.top - 3 && oy < box.bottom + 3; })).length * 2 +
        (placed.some((p) => p.x1 > box.x0 && p.x0 < box.x1 && p.bottom > box.top && p.top < box.bottom) ? 3 : 0);
      return { at, x: xAt(at) + bx0 - want, y, box, cost };
    });
    const best = spots.reduce((p, q) => (q.cost < p.cost ? q : p));
    // Where every spot lands on a name already placed, as with lines that run together on a phone, this one is left
    // off; the legend and the tooltip still name the line
    if (best.cost >= 3) {
      tx.remove();
      continue;
    }
    placed.push(best.box);
    tx.setAttribute("x", String(best.x));
    tx.setAttribute("y", String(best.y));
    tx.setAttribute("text-anchor", best.at);
  }
}

/** What a line's marks answer to in the legend (data-key, a list): the comparison's line, and where a chart compares
 * several measures ("cmp:swd"), that measure's entry too, so either lights it */
const lineKey = (key: string) => (key === "cmp" ? "line:cmp" : key.startsWith("cmp:") ? `line:cmp ${key.slice(4)}` : key);
/** And a trend's: the chart's own trend; the comparison's trend, as the comparison itself, since it draws only where
 * the comparison's line doesn't ("cmptrend:swd", as its measure's too); or, for one of several, its series */
const trendKey = (tr: Series) => (tr.key === "trend" ? "line:trend" : tr.key.startsWith("cmptrend") ? lineKey(`cmp${tr.key.slice(8)}`) : tr.key);

interface Frame {
  width: number;
  height: number;
  years: number[];
  /** What the vertical axis measures, and a shorter name for when that won't fit */
  yTitle?: string;
  yTitleShort?: string;
  /** Years far apart (the census's five-year estimates): the comparison's line runs across the empty years, and
   * faint bands join each series from column to column */
  sparse?: boolean;
  /** Only the trends: no columns, comparison, extra lines or marks, on the chart's own scale */
  trendsOnly?: boolean;
}

const MARGIN = { top: 18, right: 64, bottom: 30, left: 80 };
/** Room under the year labels for the axis title, added to the frame's height */
const X_TITLE_ROOM = 20;
// Axis titles: big and bold like the scatterplots' (.sc-title)
const TITLE_PX = 15;
const BAR_MAX = 24;
const GAP = 2;
const RADIUS = 4;


/** Clean axis ticks covering min..max, always including 0. */
export function niceTicksRange(min: number, max: number, count = 5): number[] {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (!(hi - lo > 0)) return [0, 1];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 1e6; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks;
}

/** Clean axis ticks from 0 to a rounded-up max. */
export function niceTicks(max: number, count = 5): number[] {
  return niceTicksRange(0, max, count);
}

/** The year axis every chart on it shares: n years, each a step wide, a year's x at its step's middle (#237) */
function yearAxis(frame: Frame) {
  const n = frame.years.length;
  const plotW = Math.max(10, frame.width - MARGIN.left - MARGIN.right);
  const step = plotW / n;
  return { n, plotW, step, x: (i: number) => MARGIN.left + step * (i + 0.5) };
}

/** Label every k-th year, counted back from the latest so it is always labeled */
const yearEvery = (step: number, width: number) => [1, 2, 4, 5].find((k) => step * k >= (width < 520 ? 40 : 36)) ?? 8;

/** The years along the bottom at height y, as '25 on a narrow chart */
function drawYears(g: Element, frame: Frame, x: (i: number) => number, step: number, y: number) {
  const every = yearEvery(step, frame.width);
  frame.years.forEach((yr, i) => {
    if ((frame.years.length - 1 - i) % every) return;
    const label = svgEl("text", { x: x(i), y, "text-anchor": "middle", class: "tick" }, g);
    label.textContent = frame.width < 520 ? `'${String(yr).slice(2)}` : String(yr);
  });
}

class Axis {
  readonly n: number;
  readonly step: number;
  readonly plotW: number;
  readonly plotH: number;
  readonly yMax: number;
  readonly yMin: number;
  constructor(readonly frame: Frame, readonly ticks: number[]) {
    ({ n: this.n, plotW: this.plotW, step: this.step } = yearAxis(frame));
    this.plotH = frame.height - MARGIN.top - MARGIN.bottom;
    this.yMax = ticks[ticks.length - 1];
    this.yMin = ticks[0];
  }
  x(i: number) {
    return MARGIN.left + this.step * (i + 0.5);
  }
  y(v: number) {
    return MARGIN.top + (this.plotH * (this.yMax - v)) / (this.yMax - this.yMin);
  }
  indexAt(px: number) {
    return Math.min(this.n - 1, Math.max(0, Math.floor((px - MARGIN.left) / this.step)));
  }
}

function drawGrid(svg: SVGSVGElement, ax: Axis, fmt: (v: number) => string) {
  const g = svgEl("g", { class: "grid", "aria-hidden": "true" }, svg);
  for (const t of ax.ticks) {
    const y = ax.y(t);
    svgEl("line", { x1: MARGIN.left, x2: MARGIN.left + ax.plotW, y1: y, y2: y, class: t === 0 ? "baseline" : "gridline" }, g);
    const label = svgEl("text", { x: MARGIN.left - 8, y, dy: "0.32em", "text-anchor": "end", class: "tick" }, g);
    label.textContent = fmt(t);
  }
  drawYears(g, ax.frame, (i) => ax.x(i), ax.step, MARGIN.top + ax.plotH + 18);

  // Axis titles name what's plotted, the first place a reader looks
  const xTitle = svgEl("text", { x: MARGIN.left + ax.plotW / 2, y: ax.frame.height + 14, "text-anchor": "middle", class: "sc-title" }, g);
  xTitle.textContent = "Fiscal year";
  const { yTitle, yTitleShort } = ax.frame;
  if (yTitle) {
    const room = ax.plotH + MARGIN.top;
    const fits = (s: string) => s.length * TITLE_PX * 0.6 <= room;
    const name = [yTitle, yTitleShort].find((s): s is string => !!s && fits(s)) ?? yTitleShort ?? yTitle;
    const t = svgEl("text", { transform: `translate(16 ${MARGIN.top + ax.plotH / 2}) rotate(-90)`, "text-anchor": "middle", class: "sc-title" }, g);
    t.textContent = name;
    if (!fits(name)) t.style.fontSize = `${Math.max(11, Math.floor(room / (name.length * 0.6)))}px`;
  }
}

function topRoundedRect(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, h, w / 2));
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function bottomRoundedRect(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, h, w / 2));
  return `M${x},${y}V${y + h - rr}Q${x},${y + h} ${x + rr},${y + h}H${x + w - rr}Q${x + w},${y + h} ${x + w},${y + h - rr}V${y}Z`;
}

/** A line through the values; a gap lifts the pen unless `bridge` joins across it. */
function linePath(ax: Axis, values: Val[], bridge = false) {
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) {
      if (!bridge) pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${ax.x(i).toFixed(1)},${ax.y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

export interface Panel {
  svg: SVGSVGElement;
  ax: Axis;
  setHover(i: number | null): void;
}

function hoverLayer(svg: SVGSVGElement, ax: Axis, onHover: (i: number | null, source: SVGSVGElement) => void) {
  const hit = svgEl("rect", {
    x: MARGIN.left, y: MARGIN.top, width: ax.plotW, height: ax.plotH, class: "hit",
  }, svg);
  const toIndex = (ev: PointerEvent) => {
    const box = svg.getBoundingClientRect();
    return ax.indexAt(((ev.clientX - box.left) / box.width) * ax.frame.width);
  };
  hit.addEventListener("pointermove", (ev) => onHover(toIndex(ev), svg));
  hit.addEventListener("pointerdown", (ev) => onHover(toIndex(ev), svg));
  hit.addEventListener("pointerleave", () => onHover(null, svg));
}

/**
 * Stacked columns, bottom to top in series order, with an optional overlay line
 * (the comparison), an optional dashed trend line (the columns' own fitted trend),
 * and extra lines for a measure drawn beside the columns rather than in them.
 * A negative last segment (spending below the requirement) clips the solid stack
 * at the actual total and hatches the shortfall up to the requirement. A column
 * with no positive parts (one negative segment shown alone) hangs below zero.
 */
export function stackedColumns(
  svg: SVGSVGElement,
  frame: Frame,
  stacks: Series[],
  overlay: Series | null,
  ticks: number[],
  fmt: (v: number) => string,
  onHover: (i: number | null, source: SVGSVGElement) => void,
  cap?: { value: number | null; text: (v: number) => string; index?: number },
  faded: boolean[] = [],
  trend: Series | Series[] | null = null,
  extras: Series[] = [],
  marks: Marks | null = null,
): Panel {
  // Years far apart: the years with columns, where the trends alone mark the estimates they fit
  const surveyed = frame.years.map((_, i) => stacks.some((s) => s.values[i] != null));
  if (frame.trendsOnly) [stacks, overlay, extras, marks, cap] = [[], null, [], null, undefined];
  svg.replaceChildren();
  // Every mark carries its series' key, data-key, which a legend entry spotlights (explorer.ts)
  svg.classList.remove("is-spotlit");
  svg.setAttribute("viewBox", `0 0 ${frame.width} ${frame.height + X_TITLE_ROOM}`);
  const ax = new Axis(frame, ticks);
  const defs = svgEl("defs", {}, svg);
  const pattern = svgEl("pattern", { id: `${svg.id}-hatch`, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
  svgEl("rect", { width: 6, height: 6, class: "hatch-bg" }, pattern);
  svgEl("line", { x1: 0, y1: 0, x2: 0, y2: 6, class: "hatch-line" }, pattern);

  drawGrid(svg, ax, fmt);
  const band = svgEl("rect", { class: "band", y: MARGIN.top, height: ax.plotH, width: ax.step, x: -999 }, svg);
  // Faint bands from column to column, each series stacked as the columns stack it: how each share moved between
  if (frame.sparse) {
    const at = frame.years.map((_, i) => i).filter((i) => stacks.some((s) => s.values[i] != null));
    const ag = svgEl("g", { class: "areas", "aria-hidden": "true" }, svg);
    let lo = at.map(() => 0);
    for (const s of stacks) {
      const hi = at.map((i, k) => lo[k] + Math.max(0, s.values[i] ?? 0));
      if (at.length > 1 && hi.some((v, k) => v > lo[k])) {
        const top = at.map((i, k) => `${ax.x(i).toFixed(1)},${ax.y(hi[k]).toFixed(1)}`);
        const bottom = at.map((i, k) => `${ax.x(i).toFixed(1)},${ax.y(lo[k]).toFixed(1)}`).reverse();
        svgEl("path", { d: `M${top.join("L")}L${bottom.join("L")}Z`, fill: s.color, class: "stack-area", "data-key": s.key }, ag);
      }
      lo = hi;
    }
  }
  const cols = svgEl("g", { class: "cols" }, svg);
  const w = Math.min(BAR_MAX, ax.step * 0.55);
  const columns: SVGGElement[] = [];

  frame.years.forEach((_yr, i) => {
    const g = svgEl("g", { class: faded[i] ? "col faded" : "col" }, cols);
    columns.push(g);
    const vals = stacks.map((s) => s.values[i]);
    if (vals.every((v) => v == null)) return;
    const positiveTop = vals.reduce<number>((acc, v) => acc + Math.max(0, v ?? 0), 0);
    const total = vals.reduce<number>((acc, v) => acc + (v ?? 0), 0);
    const solidTop = Math.min(positiveTop, Math.max(0, total));
    const x = ax.x(i) - w / 2;
    if (positiveTop === 0 && total < 0) {
      const neg = stacks.find((s, k) => (vals[k] ?? 0) < 0);
      const h = ax.y(total) - ax.y(0);
      if (h > 0.5) svgEl("path", { d: bottomRoundedRect(x, ax.y(0), w, h, RADIUS), fill: neg?.color ?? "currentColor", "data-key": neg?.key ?? "" }, g);
      return;
    }
    let base = 0;
    const segs: { s: Series; lo: number; hi: number }[] = [];
    stacks.forEach((s, k) => {
      const v = vals[k];
      if (v == null || v <= 0) return;
      const lo = base;
      const hi = Math.min(base + v, solidTop);
      base += v;
      if (hi > lo) segs.push({ s, lo, hi });
    });
    segs.forEach(({ s, lo, hi }, k) => {
      const yTop = ax.y(hi);
      const yBot = ax.y(lo) - (k > 0 ? GAP : 0);
      const h = yBot - yTop;
      if (h <= 0.5) return;
      if (k === segs.length - 1) {
        svgEl("path", { d: topRoundedRect(x, yTop, w, h, RADIUS), fill: s.color, "data-key": s.key }, g);
      } else {
        svgEl("rect", { x, y: yTop, width: w, height: h, fill: s.color, "data-key": s.key }, g);
      }
    });
    if (positiveTop > solidTop) {
      const yTop = ax.y(positiveTop);
      const h = ax.y(solidTop) - GAP - yTop;
      if (h > 0.5) {
        svgEl("rect", { x, y: yTop, width: w, height: h, fill: `url(#${svg.id}-hatch)`, class: "shortfall", "data-key": "shortfall" }, g);
      }
    }
  });

  // Trend under the comparison line, so the comparison's dots stay on top. Clipped to
  // the plot: a straight line fitted to lumpy columns can run past the axis.
  // The comparison's trend too, in its own color
  const trends = (Array.isArray(trend) ? trend : [trend]).filter((s): s is Series => !!s && s.values.some((v) => v != null));
  if (trends.length) {
    const clip = svgEl("clipPath", { id: `${svg.id}-plot` }, defs);
    svgEl("rect", { x: MARGIN.left, y: MARGIN.top, width: ax.plotW, height: ax.plotH }, clip);
  }
  for (const tr of trends) {
    const tg = svgEl("g", { class: "trend", "clip-path": `url(#${svg.id}-plot)`, "data-key": trendKey(tr) }, svg);
    const d = linePath(ax, tr.values);
    svgEl("path", { d, class: "trend-halo" }, tg);
    svgEl("path", { d, class: "trend-line", stroke: tr.color }, tg);
    if (frame.sparse && frame.trendsOnly) {
      tr.values.forEach((v, i) => {
        if (v != null && surveyed[i]) svgEl("circle", { cx: ax.x(i), cy: ax.y(v), r: 3.5, fill: tr.color, class: "trend-dot" }, tg);
      });
    }
  }
  if (frame.trendsOnly) trendLabels(svg, ax, trends);

  // Marks: stems over the columns, under the lines; the diamonds go on last, over everything
  const markG = marks && marks.at.some(Boolean) ? svgEl("g", { class: "marks", "data-key": `line:${marks.key}` }, svg) : null;
  if (marks && markG) {
    marks.at.forEach((on, i) => {
      const v = marks.amount[i];
      if (!on || v == null || v <= 0) return;
      const x = ax.x(i), y0 = ax.y(0), y1 = ax.y(v);
      svgEl("line", { x1: x, x2: x, y1: y0, y2: y1, class: "mark-halo" }, markG);
      svgEl("line", { x1: x, x2: x, y1: y0, y2: y1, class: "mark-stem", stroke: marks.color }, markG);
      svgEl("circle", { cx: x, cy: y1, r: 4, stroke: marks.color, class: "mark-head" }, markG);
    });
  }

  // Extra lines, each with a dot on every year it has: their measure is not the columns'
  for (const s of extras) {
    if (!s.values.some((v) => v != null)) continue;
    const eg = svgEl("g", { class: "extra", "data-key": `line:${s.key}` }, svg);
    svgEl("path", { d: linePath(ax, s.values), class: "extra-line", stroke: s.color, ...(s.dash ? { "stroke-dasharray": s.dash } : {}) }, eg);
    s.values.forEach((v, i) => {
      if (v != null) svgEl("circle", { cx: ax.x(i), cy: ax.y(v), r: 2.5, fill: s.color, class: "extra-dot" }, eg);
    });
  }

  let overlayDots: SVGGElement | null = null;
  if (overlay && overlay.values.some((v) => v != null)) {
    const og = svgEl("g", { class: "overlay", "data-key": "line:cmp" }, svg);
    svgEl("path", { d: linePath(ax, overlay.values, !!frame.sparse), class: "overlay-line", stroke: overlay.color }, og);
    overlayDots = svgEl("g", {}, og);
    overlay.values.forEach((v, i) => {
      if (v == null) return;
      svgEl("circle", { cx: ax.x(i), cy: ax.y(v), r: 4, fill: overlay.color, class: "dot" }, overlayDots!);
    });
  }

  // Value on the cap of the latest column (or the column at cap.index, for a
  // source that trails the other panels). Skipped when the comparison dot would
  // sit on it, so the label never reads as the comparison's value; the tile,
  // tooltip and table still carry it.
  if (cap && cap.value != null) {
    const i = cap.index ?? frame.years.length - 1;
    const vals = stacks.map((s) => s.values[i]);
    if (vals.some((v) => v != null)) {
      const positiveTop = vals.reduce<number>((a, v) => a + Math.max(0, v ?? 0), 0);
      const hangs = positiveTop === 0 && cap.value < 0;
      const columnEnd = ax.y(hangs ? cap.value : positiveTop);
      const labelY = hangs ? columnEnd + 18 : columnEnd - 9;
      // Text box of a 12px label set on labelY, about 3.6px per character
      const label = cap.text(cap.value);
      const half = label.length * 3.6;
      const text = { top: labelY - 10, bottom: labelY + 1, left: ax.x(i) - half };
      const dot = overlay?.values[i];
      const prev = overlay?.values[i - 1];
      // The comparison dot (8px with its ring) on or near the label
      let collides = dot != null && ax.y(dot) > text.top - 6 && ax.y(dot) < text.bottom + 6;
      // The comparison line's last segment, under the label's left half
      if (!collides && dot != null && prev != null) {
        const x0 = ax.x(i - 1);
        const x1 = ax.x(i);
        const xl = Math.max(x0, text.left);
        const yl = ax.y(prev) + ((ax.y(dot) - ax.y(prev)) * (xl - x0)) / (x1 - x0);
        collides = Math.max(yl, ax.y(dot)) > text.top - 2 && Math.min(yl, ax.y(dot)) < text.bottom + 2;
      }
      // A taller neighboring column the label would spill onto (narrow screens)
      if (!collides && half > ax.step - w / 2) {
        const prevTop = stacks.reduce((a, s) => a + Math.max(0, s.values[i - 1] ?? 0), 0);
        collides = ax.y(prevTop) < text.bottom;
      }
      if (!collides) {
        const t = svgEl("text", { x: ax.x(i), y: labelY, "text-anchor": "middle", class: "cap" }, svg);
        t.textContent = label;
      }
    }
  }

  // Each marked year's diamond, just under the baseline, over the columns and lines
  if (marks && markG) {
    const s = 4.5;
    const top = svgEl("g", { class: "marks", "data-key": `line:${marks.key}` }, svg);
    marks.at.forEach((on, i) => {
      if (!on) return;
      const x = ax.x(i), y = ax.y(0) + s + 1;
      svgEl("path", { d: `M${x} ${y - s}L${x + s} ${y}L${x} ${y + s}L${x - s} ${y}Z`, fill: marks.color, class: "mark-diamond" }, top);
    });
  }

  hoverLayer(svg, ax, onHover);
  return {
    svg,
    ax,
    setHover(i) {
      svg.classList.toggle("has-hover", i != null);
      columns.forEach((c, k) => c.classList.toggle("is-hover", k === i));
      band.setAttribute("x", i == null ? "-999" : String(MARGIN.left + ax.step * i));
    },
  };
}

/** Lines with end dots, a crosshair on hover, and end labels where they don't collide.
 * `sparse` is for values measured only some years: the line joins them, with a dot at each. */
export function lines(
  svg: SVGSVGElement,
  frame: Frame,
  series: Series[],
  ticks: number[],
  fmt: (v: number) => string,
  endFmt: (v: number) => string,
  onHover: (i: number | null, source: SVGSVGElement) => void,
  sparse = false,
  trend: Series | Series[] | null = null,
): Panel {
  if (frame.trendsOnly) series = [];
  svg.replaceChildren();
  svg.classList.remove("is-spotlit");
  svg.setAttribute("viewBox", `0 0 ${frame.width} ${frame.height + X_TITLE_ROOM}`);
  const ax = new Axis(frame, ticks);
  drawGrid(svg, ax, fmt);
  const band = svgEl("rect", { class: "band", y: MARGIN.top, height: ax.plotH, width: ax.step, x: -999 }, svg);
  const cross = svgEl("line", { class: "crosshair", y1: MARGIN.top, y2: MARGIN.top + ax.plotH, x1: -999, x2: -999 }, svg);
  // The trend under the lines it fits, as on the column charts
  const trends = (Array.isArray(trend) ? trend : [trend]).filter((s): s is Series => !!s && s.values.some((v) => v != null));
  for (const tr of trends) {
    const tg = svgEl("g", { class: "trend", "data-key": trendKey(tr) }, svg);
    const d = linePath(ax, tr.values);
    svgEl("path", { d, class: "trend-halo" }, tg);
    svgEl("path", { d, class: "trend-line", stroke: tr.color }, tg);
  }
  if (frame.trendsOnly) trendLabels(svg, ax, trends);
  const g = svgEl("g", { class: "lines" }, svg);
  const ends: { y: number; text: string }[] = [];
  for (const s of series) {
    if (!s.values.some((v) => v != null)) continue;
    const sg = svgEl("g", { "data-key": lineKey(s.key) }, g);
    svgEl("path", { d: linePath(ax, s.values, sparse), stroke: s.color, class: "series-line", ...(s.dash ? { "stroke-dasharray": s.dash } : {}) }, sg);
    if (sparse || s.key.startsWith("cmp")) {
      s.values.forEach((v, i) => {
        if (v != null) svgEl("circle", { cx: ax.x(i), cy: ax.y(v), r: 3, fill: s.color, class: "dot" }, sg);
      });
    }
    const last = s.values.map((v, i) => [v, i] as const).filter(([v]) => v != null).pop();
    if (last) {
      const [v, i] = last;
      svgEl("circle", { cx: ax.x(i), cy: ax.y(v!), r: 4, fill: s.color, class: "dot" }, sg);
      if (i === frame.years.length - 1) ends.push({ y: ax.y(v!), text: endFmt(v!) });
    }
  }
  // End labels: keep one from any pair closer than a line of text
  ends.sort((a, b) => a.y - b.y);
  let lastY = -Infinity;
  for (const e of ends) {
    if (e.y - lastY < 14) continue;
    const t = svgEl("text", { x: MARGIN.left + ax.plotW + 10, y: e.y, dy: "0.32em", class: "end-label" }, svg);
    t.textContent = e.text;
    lastY = e.y;
  }
  const hoverDots = svgEl("g", { class: "hover-dots" }, svg);
  hoverLayer(svg, ax, onHover);
  return {
    svg,
    ax,
    setHover(i) {
      svg.classList.toggle("has-hover", i != null);
      const x = i == null ? -999 : ax.x(i);
      cross.setAttribute("x1", String(x));
      cross.setAttribute("x2", String(x));
      band.setAttribute("x", i == null ? "-999" : String(MARGIN.left + ax.step * i));
      hoverDots.replaceChildren();
      if (i == null) return;
      for (const s of series) {
        const v = s.values[i];
        if (v == null) continue;
        svgEl("circle", { cx: x, cy: ax.y(v), r: 5, fill: s.color, class: "dot" }, hoverDots);
      }
    },
  };
}

/** Each year's actual spending against its budget, in percent: a column up from the zero line for spending over
 * the budget, down for under, and the comparison's as a dot. Years line up with the charts above it (same frame
 * width and margins). Each column and dot carries its own words on hover (label). */
export function gapColumns(svg: SVGSVGElement, frame: Frame, own: Val[], cmp: Val[] | null, color: string, cmpColor: string,
  label: (i: number, cmp: boolean) => string): void {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${frame.width} ${frame.height}`);
  const { plotW, step, x } = yearAxis(frame);
  // A scale of whole steps that holds every value, and a step each way at least
  const vals = [...own, ...(cmp ?? [])].filter((v): v is number => v != null);
  const m = Math.max(1, ...vals.map(Math.abs));
  const unit = [1, 2, 5, 10, 20, 25, 50, 100].find((u) => m / u <= 2) ?? 100;
  const hi = Math.max(unit, Math.ceil(Math.max(0, ...vals) / unit) * unit);
  const lo = Math.min(-unit, Math.floor(Math.min(0, ...vals) / unit) * unit);
  const top = 8, h = frame.height - top - 22;
  const y = (v: number) => top + (h * (hi - v)) / (hi - lo);
  const g = svgEl("g", { class: "grid", "aria-hidden": "true" }, svg);
  for (let v = lo; v <= hi + 1e-9; v += unit) {
    svgEl("line", { x1: MARGIN.left, x2: MARGIN.left + plotW, y1: y(v), y2: y(v), class: v === 0 ? "gap-zero" : "gridline" }, g);
    const tx = svgEl("text", { x: MARGIN.left - 8, y: y(v), dy: "0.32em", "text-anchor": "end", class: "tick" }, g);
    tx.textContent = `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}%`;
  }
  drawYears(g, frame, x, step, frame.height - 6);
  const w = Math.min(BAR_MAX, step * 0.62);
  own.forEach((v, i) => {
    if (v == null) return;
    const r = svgEl("rect", { x: x(i) - w / 2, y: Math.min(y(v), y(0)), width: w, height: Math.max(1, Math.abs(y(v) - y(0))),
      fill: color, class: "gap-col", rx: 2 }, svg);
    svgEl("title", {}, r).textContent = label(i, false);
  });
  cmp?.forEach((v, i) => {
    if (v == null) return;
    const c = svgEl("circle", { cx: x(i), cy: y(v), r: 3.5, fill: cmpColor, class: "gap-dot" }, svg);
    svgEl("title", {}, c).textContent = label(i, true);
  });
}

/** Ratings over the years: one row per level on a shared scale, best at the top, and for each agency a dot each year
 * it rated and a step from one rating to the next, nudged apart so two agencies on the same level both show. Years
 * line up with the charts above it (same frame width and margins). */
export function ratingSteps(svg: SVGSVGElement, frame: Frame, levels: string[],
  series: { points: (number | null)[]; color: string; nudge: number; label: (i: number) => string }[]): void {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${frame.width} ${frame.height}`);
  const { plotW, step, x } = yearAxis(frame);
  const top = 10;
  const rowH = (frame.height - top - 22) / Math.max(1, levels.length - 1);
  const y = (lvl: number) => top + rowH * lvl;
  const g = svgEl("g", { class: "grid", "aria-hidden": "true" }, svg);
  levels.forEach((name, k) => {
    svgEl("line", { x1: MARGIN.left, x2: MARGIN.left + plotW, y1: y(k), y2: y(k), class: "gridline" }, g);
    const tx = svgEl("text", { x: MARGIN.left - 8, y: y(k), dy: "0.32em", "text-anchor": "end", class: "tick" }, g);
    tx.textContent = name;
  });
  drawYears(g, frame, x, step, frame.height - 6);
  for (const s of series) {
    const rated = s.points.map((p, i) => [p, i] as const).filter(([p]) => p != null) as [number, number][];
    if (rated.length > 1) {
      let d = `M${x(rated[0][1])} ${y(rated[0][0]) + s.nudge}`;
      for (let k = 1; k < rated.length; k++) d += `H${x(rated[k][1])}V${y(rated[k][0]) + s.nudge}`;
      svgEl("path", { d, class: "series-line", stroke: s.color }, svg);
    }
    for (const [p, i] of rated) {
      const c = svgEl("circle", { cx: x(i), cy: y(p) + s.nudge, r: 3.5, fill: s.color, class: "dot" }, svg);
      svgEl("title", {}, c).textContent = s.label(i);
    }
  }
}
