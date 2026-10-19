// SVG charts for the explorer: stacked columns and lines on one shared year axis.
// Every panel uses the same margins, so a year sits at the same x in each one.

const SVG = "http://www.w3.org/2000/svg";

export type Val = number | null;

export interface Series {
  key: string;
  label: string;
  color: string;
  values: Val[];
}

export interface Frame {
  width: number;
  height: number;
  years: number[];
}

export const MARGIN = { top: 18, right: 64, bottom: 30, left: 60 };
const BAR_MAX = 24;
const GAP = 2;
const RADIUS = 4;

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

/** Clean axis ticks from 0 to a rounded-up max. */
export function niceTicks(max: number, count = 5): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= Math.ceil(max / step) * step + step / 1e6; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks;
}

export function compact(v: number, prefix = ""): string {
  if (v === 0) return `${prefix}0`;
  if (Math.abs(v) >= 1000) {
    const k = v / 1000;
    return `${prefix}${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return `${prefix}${Math.round(v)}`;
}

export class Axis {
  readonly n: number;
  readonly step: number;
  readonly plotW: number;
  readonly plotH: number;
  readonly yMax: number;
  constructor(readonly frame: Frame, readonly ticks: number[]) {
    this.n = frame.years.length;
    this.plotW = Math.max(10, frame.width - MARGIN.left - MARGIN.right);
    this.plotH = frame.height - MARGIN.top - MARGIN.bottom;
    this.step = this.plotW / this.n;
    this.yMax = ticks[ticks.length - 1];
  }
  x(i: number) {
    return MARGIN.left + this.step * (i + 0.5);
  }
  y(v: number) {
    return MARGIN.top + this.plotH * (1 - v / this.yMax);
  }
  indexAt(px: number) {
    return Math.min(this.n - 1, Math.max(0, Math.floor((px - MARGIN.left) / this.step)));
  }
  /** Label every k-th year, counted back from the latest so it is always labeled. */
  labelEvery() {
    const minGap = this.frame.width < 520 ? 40 : 36;
    return [1, 2, 4, 5].find((k) => this.step * k >= minGap) ?? 8;
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
  const k = ax.labelEvery();
  const narrow = ax.frame.width < 520;
  ax.frame.years.forEach((yr, i) => {
    if ((ax.n - 1 - i) % k !== 0) return;
    const label = svgEl("text", { x: ax.x(i), y: MARGIN.top + ax.plotH + 18, "text-anchor": "middle", class: "tick" }, g);
    label.textContent = narrow ? `'${String(yr).slice(2)}` : String(yr);
  });
}

function topRoundedRect(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, h, w / 2));
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function linePath(ax: Axis, values: Val[]) {
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) {
      pen = false;
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
 * Stacked columns, bottom to top in series order, with an optional overlay line.
 * A negative last segment (spending below the requirement) clips the solid stack
 * at the actual total and hatches the shortfall up to the requirement.
 */
export function stackedColumns(
  svg: SVGSVGElement,
  frame: Frame,
  stacks: Series[],
  overlay: Series | null,
  ticks: number[],
  fmt: (v: number) => string,
  onHover: (i: number | null, source: SVGSVGElement) => void,
  cap?: { value: number | null; text: (v: number) => string },
  faded: boolean[] = [],
): Panel {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${frame.width} ${frame.height}`);
  const ax = new Axis(frame, ticks);
  const defs = svgEl("defs", {}, svg);
  const pattern = svgEl("pattern", { id: `${svg.id}-hatch`, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
  svgEl("rect", { width: 6, height: 6, class: "hatch-bg" }, pattern);
  svgEl("line", { x1: 0, y1: 0, x2: 0, y2: 6, class: "hatch-line" }, pattern);

  drawGrid(svg, ax, fmt);
  const band = svgEl("rect", { class: "band", y: MARGIN.top, height: ax.plotH, width: ax.step, x: -999 }, svg);
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
        svgEl("path", { d: topRoundedRect(x, yTop, w, h, RADIUS), fill: s.color }, g);
      } else {
        svgEl("rect", { x, y: yTop, width: w, height: h, fill: s.color }, g);
      }
    });
    if (positiveTop > solidTop) {
      const yTop = ax.y(positiveTop);
      const h = ax.y(solidTop) - GAP - yTop;
      if (h > 0.5) {
        svgEl("rect", { x, y: yTop, width: w, height: h, fill: `url(#${svg.id}-hatch)`, class: "shortfall" }, g);
      }
    }
  });

  let overlayDots: SVGGElement | null = null;
  if (overlay && overlay.values.some((v) => v != null)) {
    const og = svgEl("g", { class: "overlay" }, svg);
    svgEl("path", { d: linePath(ax, overlay.values), class: "overlay-line", stroke: overlay.color }, og);
    overlayDots = svgEl("g", {}, og);
    overlay.values.forEach((v, i) => {
      if (v == null) return;
      svgEl("circle", { cx: ax.x(i), cy: ax.y(v), r: 4, fill: overlay.color, class: "dot" }, overlayDots!);
    });
  }

  // Value on the cap of the latest column. Skipped when the comparison dot would
  // sit on it, so the label never reads as the comparison's value; the tile,
  // tooltip and table still carry it.
  if (cap && cap.value != null) {
    const i = frame.years.length - 1;
    const vals = stacks.map((s) => s.values[i]);
    if (vals.some((v) => v != null)) {
      const columnTop = ax.y(vals.reduce<number>((a, v) => a + Math.max(0, v ?? 0), 0));
      const labelY = columnTop - 9;
      const dot = overlay?.values[i];
      const collides = dot != null && ax.y(dot) > labelY - 18 && ax.y(dot) < columnTop + 6;
      if (!collides) {
        const t = svgEl("text", { x: ax.x(i), y: labelY, "text-anchor": "middle", class: "cap" }, svg);
        t.textContent = cap.text(cap.value);
      }
    }
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

/** Lines with end dots, a crosshair on hover, and end labels where they don't collide. */
export function lines(
  svg: SVGSVGElement,
  frame: Frame,
  series: Series[],
  ticks: number[],
  fmt: (v: number) => string,
  endFmt: (v: number) => string,
  onHover: (i: number | null, source: SVGSVGElement) => void,
): Panel {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${frame.width} ${frame.height}`);
  const ax = new Axis(frame, ticks);
  drawGrid(svg, ax, fmt);
  const band = svgEl("rect", { class: "band", y: MARGIN.top, height: ax.plotH, width: ax.step, x: -999 }, svg);
  const cross = svgEl("line", { class: "crosshair", y1: MARGIN.top, y2: MARGIN.top + ax.plotH, x1: -999, x2: -999 }, svg);
  const g = svgEl("g", { class: "lines" }, svg);
  const ends: { y: number; text: string }[] = [];
  for (const s of series) {
    if (!s.values.some((v) => v != null)) continue;
    svgEl("path", { d: linePath(ax, s.values), stroke: s.color, class: "series-line" }, g);
    const last = s.values.map((v, i) => [v, i] as const).filter(([v]) => v != null).pop();
    if (last) {
      const [v, i] = last;
      svgEl("circle", { cx: ax.x(i), cy: ax.y(v!), r: 4, fill: s.color, class: "dot" }, g);
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
