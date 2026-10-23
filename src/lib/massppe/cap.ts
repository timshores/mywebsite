// The 82.5% cap tab: each town's Chapter 70 target local contribution, from DESE's complete
// formula spreadsheet, beside what it would be under another cap or none. Data:
// src/data/massppe/cap.json (export_explorer_data.cap_data).
//
// Any cap keeps the formula's rule that targets add up to 59% of all foundation budgets, so
// both statewide percentages scale by one factor f, found here by bisection, with each town's
// target min(yield x f, cap x foundation budget). f is 1 at 82.5%; at 100% and with no cap
// this reproduces Michael Naughton and Tupper Brown's FY2026 targets to the dollar.

import { svgEl } from "./charts";
import { groupedPicker } from "./picker";
import { enlargeButton, isEnlarged } from "./enlarge";
import { scatter, spearman, ticksFor, type Group, type Point, type ScatterView } from "./scatter";

interface CapTown {
  lea: number; name: string; id: string; county: string | null; region: string | null;
  pop: number | null; pop_income: number | null;
  /** Households (ACS five-year estimates) and taxable real estate parcels (LA-4) */
  hh: number | null; parcels: number | null;
  eqv: number; income: number; cey: number; foundation: number; max: number; target: number; nocap: number;
  required: number | null; prior: number | null; capped: boolean; floor: boolean;
  /** How the required contribution moved: the growth factor, any extra increment, and where it started */
  mrgf: number | null; increment: number | null; preliminary: number | null;
}

interface CapYear {
  fy: number; eqv_year: number; income_year: number; property_pct: number; income_pct: number; max_pct: number;
  factor: number; source: string; whitepaper: string; pop_year: number; parcel_fy: number;
  totals: { cey: number; target: number; foundation: number; required: number; capped: number;
    up: number; up_sum: number; down: number; down_sum: number };
  towns: CapTown[];
}

/** How far districts spent above the required minimum, the latest year with actual spending */
interface Spending { fy: number; districts: number; above: number; median: number; half_again: number; double: number;
  required: number; over: number }

/** Every town's yield, foundation budget, target and required contribution by year, FY2007 on */
interface History {
  years: number[]; source: string;
  towns: Record<string, { cey: (number | null)[]; foundation: (number | null)[]; target: (number | null)[]; required: (number | null)[] }>;
}

export interface CapData { meta: { latest: number; spending?: Spending }; years: Record<string, CapYear>; history?: History | null }

const usd = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
const big = (v: number) => (Math.abs(v) >= 1e9 ? `$${(Math.abs(v) / 1e9).toFixed(2)} billion` : `$${(Math.abs(v) / 1e6).toFixed(1)} million`);
const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;
const rate = (v: number) => `${(v * 100).toFixed(3)}%`;
const capPct = (c: number) => `${Number((c * 100).toFixed(1))}%`;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN;
};
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
const link = (text: string, href: string) => Object.assign(el("a", undefined, text), { href });
/** Further reading on Chapter 70, for the explanations that end with it */
const seeAlso = (): (string | Node)[] => ["See also Kiera McLaughlin's ", link("“Chapter 70: Some of What You Need to " +
  "Know to Understand the School Budget Process”", "https://www.amherstindy.org/2026/02/05/chapter-70-some-of-what-you-need-to-know-to-understand-the-school-budget-process/"),
  " in the Amherst Indy, February 5, 2026."];
/** A measure's name, bold wherever text describes it */
const vn = (s: string) => el("strong", "cw-var", s);

const GROUPS: Record<string, Group> = {
  capped: { label: "At today's cap", color: "#6250d6", shape: "square", z: 2 },
  below: { label: "Below it", color: "#2a78d6", shape: "circle", z: 1 },
  town: { label: "Selected town", color: "#b65c3d", shape: "triangle", z: 3 },
};
// By income fifth: one blue ramp, lightest for the lowest incomes, darkest for the highest
const FIFTH_GROUPS: Record<string, Group> = {
  f1: { label: "Lowest income fifth", color: "#86b6ef", shape: "circle", z: 1 },
  f2: { label: "Second", color: "#5598e7", shape: "circle", z: 1 },
  f3: { label: "Middle", color: "#2a78d6", shape: "circle", z: 1 },
  f4: { label: "Fourth", color: "#1c5cab", shape: "circle", z: 1 },
  f5: { label: "Highest income fifth", color: "#0d366b", shape: "circle", z: 1 },
  town: GROUPS.town,
};

/** Up and down the chart, always: how much more or less the town would be asked for, per household */
const Y_TITLE = "Change in target, per household";
type XKey = "cey_pct" | "eqv_pc" | "income_pc" | "cey_pc";
/** Across the chart: ways to measure a town's wealth, each with what it shows in the text beside it */
const X_OPTIONS: Record<XKey, { label: string; title: string; short: string; fmt: (v: number) => string; axis: (v: number) => string }> = {
  cey_pct: { label: "Wealth for the size of its schools", title: "Combined effort yield ÷ foundation budget", short: "Yield ÷ foundation",
    fmt: (v) => pct(v), axis: (v) => pct(v) },
  eqv_pc: { label: "Property value per resident", title: "Equalized property value per resident", short: "Property value per resident",
    fmt: usd, axis: (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1000)}K`) },
  income_pc: { label: "Income per resident", title: "Income per resident", short: "Income per resident",
    fmt: usd, axis: (v) => `$${Math.round(v / 1000)}K` },
  // Wealth as the formula measures it, Naughton and Brown's horizontal axis
  cey_pc: { label: "Property and income per resident", title: "Combined effort yield per resident", short: "Yield per resident",
    fmt: usd, axis: (v) => `$${v >= 1e4 ? `${Math.round(v / 1000)}K` : Math.round(v).toLocaleString("en-US")}` },
};
const xOf = (x: CapTown, k: XKey): number | null => {
  switch (k) {
    case "cey_pct": return x.foundation ? x.cey / x.foundation : null;
    case "eqv_pc": return x.pop ? x.eqv / x.pop : null;
    case "income_pc": return x.pop_income ? x.income / x.pop_income : null;
    case "cey_pc": return x.pop ? x.cey / x.pop : null;
  }
};

/**
 * The required contribution under today's rules for a given target (DESE's Townwide Contributions
 * sheet, columns P-X): last year's grown by the growth factor; down to the target if that's above
 * it; up 1% or 2% of last year's if it falls short by more than 2.5 or 7.5 points of foundation; at
 * least the target for a town whose yield is 175% of foundation or more; at most 90% of foundation.
 * With today's targets this reproduces every town's FY2027 required contribution.
 */
function requiredFor(t: CapTown, target: number, yieldPct: number): number | null {
  if (t.preliminary == null || t.prior == null || !t.foundation) return null;
  const P = t.preliminary;
  const H = t.foundation;
  const shortfall = Math.round((target * 100) / H * 100) / 100 - (P * 100) / H;
  const step = shortfall > 7.5 ? 0.02 : shortfall > 2.5 ? 0.01 : 0;
  const T = Math.round(step * t.prior);
  const V = Math.max(P - target, 0);
  const W = yieldPct > 1.75 ? Math.max(target - (P + T), 0) : 0;
  return Math.min(H * 0.9, Math.round(P + T - V + W));
}

/** The same for arrays: one year's yields and foundation budgets, held to that year's total. */
function solveArrays(ceys: number[], fbs: number[], total: number, cap: number | null): number {
  let lo = 0;
  let hi = 4;
  for (let k = 0; k < 80; k++) {
    const f = (lo + hi) / 2;
    let sum = 0;
    for (let i = 0; i < ceys.length; i++) sum += cap == null ? ceys[i] * f : Math.min(ceys[i] * f, cap * fbs[i]);
    if (sum < total) lo = f;
    else hi = f;
  }
  return (lo + hi) / 2;
}

/** The factor on DESE's percentages that keeps capped targets at the year's total. */
function solve(towns: CapTown[], total: number, cap: number | null): number {
  let lo = 0;
  let hi = 4;
  for (let k = 0; k < 80; k++) {
    const f = (lo + hi) / 2;
    let sum = 0;
    for (const t of towns) sum += cap == null ? t.cey * f : Math.min(t.cey * f, cap * t.foundation);
    if (sum < total) lo = f;
    else hi = f;
  }
  return (lo + hi) / 2;
}

export function startCap(root: HTMLElement, data: CapData, opts: { town: string }) {
  const yearKeys = Object.keys(data.years).sort().reverse();
  let fy = String(data.meta.latest);
  let townId = data.years[fy].towns.some((t) => t.id === opts.town) ? opts.town : "leverett";
  let xKey: XKey = "cey_pct";
  /** The cap to compare with today's: null for none */
  let scenario: number | null = null;
  let level = 1;

  // ---- Layout ----
  const yearRow = el("div", "cap-year");
  yearRow.append(el("span", undefined, "Year"));
  const yearButtons = yearKeys.map((k) => {
    const b = el("button", "cap-year-btn", `FY${k}`);
    b.type = "button";
    b.addEventListener("click", () => {
      fy = k;
      render();
    });
    yearRow.append(b);
    return b;
  });
  // How the cap works: a remembered fold, open unless this browser remembers it closed
  const how = el("section", "cap-section");
  const howFold = el("details", "intro cap-fold");
  howFold.dataset.remember = "cap-how";
  howFold.append(el("summary", undefined, "How the cap works"));
  const howText = el("div");
  howFold.append(howText);
  how.append(howFold);
  try {
    howFold.open = !(localStorage.getItem("mass-school-spending:remember") === "yes" &&
      localStorage.getItem("mass-school-spending:cap-how") === "closed");
  } catch {
    howFold.open = true;
  }
  const tiles = el("div", "cap-tiles");

  // The scenario: no cap, or a cap of the reader's choosing
  const scen = el("section", "cap-section cap-scenario");
  const scenHead = el("h3", undefined, "Try another cap");
  const scenRow = el("div", "cap-scen-row");
  const radio = (value: string, checked: boolean) => {
    const r = el("input");
    r.type = "radio";
    r.name = "cap-scenario";
    r.value = value;
    r.checked = checked;
    return r;
  };
  const noneRadio = radio("none", true);
  const levelRadio = radio("level", false);
  const slider = el("input");
  slider.type = "range";
  slider.min = "60";
  slider.max = "150";
  slider.step = "0.5";
  slider.value = "100";
  slider.setAttribute("aria-label", "Cap, as a share of the foundation budget");
  const out = el("output", "cap-level", "100%");
  const noneLabel = el("label", "cap-radio");
  noneLabel.append(noneRadio, el("span", undefined, "No cap"));
  const levelLabel = el("label", "cap-radio");
  levelLabel.append(levelRadio, el("span", undefined, "A cap of"));
  // A mark under the slider at today's 82.5%
  const sliderBox = el("span", "cap-slider");
  const mark = el("span", "cap-slider-mark", "▲ 82.5%, today");
  mark.style.setProperty("--at", String((82.5 - 60) / (150 - 60)));
  mark.setAttribute("aria-hidden", "true");
  sliderBox.append(slider, mark);
  scenRow.append(el("span", "cap-scen-lead", "Compare today's 82.5% cap with"), noneLabel, levelLabel, sliderBox, out);
  const scenNote = el("p", "cap-note cap-scen-note");
  // The year and the cap share one bar, which floats under the tabs as the page scrolls; it sits in the
  // tab's own column, not a section, so it can float the whole way down
  scenRow.prepend(yearRow);
  scen.append(scenHead, scenNote);
  const setScenario = () => {
    level = Number(slider.value) / 100;
    out.textContent = capPct(level);
    scenario = levelRadio.checked ? level : null;
    render();
  };
  noneRadio.addEventListener("change", setScenario);
  levelRadio.addEventListener("change", setScenario);
  slider.addEventListener("input", () => {
    levelRadio.checked = true;
    setScenario();
  });

  const lookup = el("section", "cap-section");
  const yearsBox = el("section", "cap-section");
  const chartBox = el("section", "cap-section");
  const fifths = el("section", "cap-section");
  root.replaceChildren(how, scenRow, tiles, scen, lookup, yearsBox, chartBox, fifths);

  // Year by year: each year's factor for the chosen cap, kept while only the town changes
  let histMemo: { key: string; f: number[] } | null = null;
  const histFactors = (H: History) => {
    const key = String(scenario);
    if (histMemo?.key === key) return histMemo.f;
    const rows = Object.values(H.towns);
    const f = H.years.map((_, j) => {
      const ceys: number[] = [];
      const fbs: number[] = [];
      let total = 0;
      for (const r of rows) {
        if (r.cey[j] == null || r.foundation[j] == null || r.target[j] == null) continue;
        ceys.push(r.cey[j]!);
        fbs.push(r.foundation[j]!);
        total += r.target[j]!;
      }
      return solveArrays(ceys, fbs, total, scenario);
    });
    histMemo = { key, f };
    return f;
  };
  const yearsSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  yearsSvg.setAttribute("class", "cap-years-chart");
  yearsSvg.setAttribute("role", "img");

  // The town picker: the explorer's searchable menu, towns by county
  const pickWrap = el("div", "control cap-pick");
  const pickLabel = el("span", undefined, "Town");
  pickLabel.id = "cap-town-label";
  const select = el("select");
  select.id = "cap-town";
  const byCounty = new Map<string, CapTown[]>();
  for (const t of [...data.years[fy].towns].sort((a, b) => a.name.localeCompare(b.name))) {
    const c = t.county ? `${t.county} County` : "Other";
    byCounty.set(c, [...(byCounty.get(c) ?? []), t]);
  }
  for (const c of [...byCounty.keys()].sort()) {
    const og = el("optgroup");
    og.label = c;
    for (const t of byCounty.get(c)!) og.append(new Option(t.name, t.id));
    select.append(og);
  }
  select.value = townId;
  pickWrap.append(pickLabel, select);
  const steps = el("div", "cap-steps");
  lookup.append(pickWrap, steps);

  // Explanations in windows of their own: targets and required contributions, and fiscal effort
  const subDialog = (id: string, title: string) => {
    const dialog = el("dialog", "cw-sub");
    dialog.setAttribute("aria-labelledby", id);
    const head = el("div", "cw-head");
    const heading = el("h2", "cw-title", title);
    heading.id = id;
    const close = el("button", "cw-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", () => dialog.close());
    head.append(heading, close);
    const body = el("div", "cw-sub-body");
    dialog.append(head, body);
    dialog.addEventListener("click", (ev) => {
      if (ev.target === dialog) dialog.close();
    });
    (root.closest(".explorer") ?? document.body).append(dialog);
    return { dialog, body };
  };
  const { dialog: help, body: helpBody } = subDialog("cap-help-title", "How Chapter 70 sets the minimum");
  const { dialog: effort, body: effortBody } = subDialog("cap-effort-title", "Same fiscal effort, two towns");
  const helpButton = (label: string, dialog = help) => {
    const b = el("button", "cap-help", "?");
    b.type = "button";
    b.setAttribute("aria-haspopup", "dialog");
    b.setAttribute("aria-label", label);
    b.title = label;
    b.addEventListener("click", () => dialog.showModal());
    return b;
  };
  // A "?" with a short note beside it, on hover, focus or a tap. The note sits outside the table,
  // so the table's scroll box can't clip it.
  const note = el("div", "cap-tip");
  note.id = "cap-tip";
  note.setAttribute("role", "tooltip");
  note.hidden = true;
  (root.closest(".explorer") ?? document.body).append(note);
  const hideNote = () => (note.hidden = true);
  window.addEventListener("scroll", hideNote, { passive: true });
  const tipButton = (label: string, text: string) => {
    const b = el("button", "cap-help", "?");
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.setAttribute("aria-describedby", "cap-tip");
    const show = () => {
      note.textContent = text;
      note.hidden = false;
      const r = b.getBoundingClientRect();
      const below = r.bottom + 6 + note.offsetHeight <= window.innerHeight;
      note.style.left = `${Math.max(8, Math.min(window.innerWidth - note.offsetWidth - 8, r.left))}px`;
      note.style.top = `${below ? r.bottom + 6 : r.top - note.offsetHeight - 6}px`;
    };
    b.addEventListener("mouseenter", show);
    b.addEventListener("focus", show);
    b.addEventListener("click", show);
    b.addEventListener("mouseleave", hideNote);
    b.addEventListener("blur", hideNote);
    return b;
  };
  const picker = groupedPicker(select, "cap-town-label", "towns");
  select.addEventListener("change", () => {
    townId = select.value;
    render();
  });

  // Chart controls
  const chartHead = el("h3", undefined, "Who pays more because of the cap?");
  const chartIntro = el("p");
  const chartControls = el("div", "cap-controls");
  const xWrap = el("label", "cap-field");
  const xSelect = el("select");
  for (const [k, o] of Object.entries(X_OPTIONS)) xSelect.append(new Option(o.label, k));
  xSelect.value = xKey;
  xSelect.addEventListener("change", () => {
    xKey = xSelect.value as XKey;
    zoom = null;
    render();
  });
  xWrap.append(el("span", undefined, "Compare towns by"), xSelect);
  // Color by: cap status, or income fifth
  let colorBy: "cap" | "fifth" = "cap";
  const colorWrap = el("div", "cap-field cap-color");
  const colorButtons = (["cap", "fifth"] as const).map((v) => {
    const b = el("button", "cap-year-btn", v === "cap" ? "Cap status" : "Income fifth");
    b.type = "button";
    b.addEventListener("click", () => {
      colorBy = v;
      render();
    });
    return b;
  });
  const colorRow = el("span", "cap-color-row");
  colorRow.append(...colorButtons);
  colorWrap.append(el("span", undefined, "Color by"), colorRow);
  chartControls.append(xWrap, colorWrap);
  const chartContext = el("p");
  const legend = el("ul", "cw-legend");
  const figure = el("figure", "cap-figure");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "cap-chart");
  svg.setAttribute("role", "img");
  const tip = el("div", "cw-tip");
  tip.hidden = true;
  // Zoom: buttons, a drag to move, a scroll of the wheel when enlarged (or with Ctrl anywhere), a
  // double-click to see every town again
  let zoom: { x: [number, number]; y: [number, number] } | null = null;
  let plotView: ScatterView | null = null;
  let fullView: ScatterView | null = null;
  let drawPlot = () => {};
  const zoomBar = el("div", "cap-zoom");
  const zoomButton = (text: string, label: string, on: () => void) => {
    const b = el("button", "cap-zoom-btn", text);
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", on);
    return b;
  };
  zoomBar.append(el("span", "cap-zoom-hint", "Drag to move"), zoomButton("+", "Zoom in", () => zoomBy(1 / 1.6)),
    zoomButton("−", "Zoom out", () => zoomBy(1.6)), zoomButton("All", "Show every town", () => {
      zoom = null;
      drawPlot();
    }));
  figure.append(legend, zoomBar, svg, tip);
  // The plot and its menu, apart from the text around them: Enlarge takes these, drawn to fill the window
  const plotBox = el("div", "cap-plot");
  const plotTitle = el("h3", "cap-plot-title", "Who pays more because of the cap?");
  plotBox.append(enlargeButton(plotBox, () => render(), () => scenRow, () => render()), plotTitle, chartControls, figure);
  chartBox.append(chartHead, chartIntro, chartContext, plotBox);

  /** Zoom by f (under 1 in, over 1 out) about the middle of the view, or about a point in data terms */
  function zoomBy(f: number, at?: { x: number; y: number }) {
    if (!plotView) return;
    const [xa, xb] = plotView.x.map(Math.log10);
    const [ya, yb] = plotView.y;
    const cx = at ? Math.log10(at.x) : (xa + xb) / 2;
    const cy = at ? at.y : (ya + yb) / 2;
    const next = { x: [10 ** (cx - (cx - xa) * f), 10 ** (cx + (xb - cx) * f)] as [number, number],
      y: [cy - (cy - ya) * f, cy + (yb - cy) * f] as [number, number] };
    // Zoomed out past every town: back to the whole view
    const all = fullView;
    zoom = all && f > 1 && next.x[0] <= all.x[0] && next.x[1] >= all.x[1] && next.y[0] <= all.y[0] && next.y[1] >= all.y[1]
      ? null : next;
    drawPlot();
  }
  /** Where a pointer is, in data terms */
  const pointAt = (ev: MouseEvent) => {
    if (!plotView) return undefined;
    const box = svg.getBoundingClientRect();
    const k = svg.viewBox.baseVal.width / box.width;
    const fx = ((ev.clientX - box.left) * k - plotView.plot.left) / plotView.plot.width;
    const fy = ((ev.clientY - box.top) * k - plotView.plot.top) / plotView.plot.height;
    const [xa, xb] = plotView.x.map(Math.log10);
    return { x: 10 ** (xa + fx * (xb - xa)), y: plotView.y[1] - fy * (plotView.y[1] - plotView.y[0]) };
  };
  let frame = 0;
  const soon = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => drawPlot());
  };
  let drag: { x: number; y: number; view: ScatterView; moved: boolean } | null = null;
  let dragged = false;
  svg.addEventListener("pointerdown", (ev) => {
    if (ev.button === 0 && plotView) drag = { x: ev.clientX, y: ev.clientY, view: plotView, moved: false };
  });
  window.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const dx = ev.clientX - drag.x;
    const dy = ev.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    tip.hidden = true;
    svg.classList.add("is-dragging");
    const k = svg.viewBox.baseVal.width / svg.getBoundingClientRect().width;
    const v = drag.view;
    const [xa, xb] = v.x.map(Math.log10);
    const sx = ((xb - xa) / v.plot.width) * k * dx;
    const sy = ((v.y[1] - v.y[0]) / v.plot.height) * k * dy;
    zoom = { x: [10 ** (xa - sx), 10 ** (xb - sx)], y: [v.y[0] + sy, v.y[1] + sy] };
    soon();
  });
  window.addEventListener("pointerup", () => {
    if (drag?.moved) dragged = true;
    drag = null;
    svg.classList.remove("is-dragging");
  });
  // A drag isn't a click: it doesn't pick the town under the pointer
  figure.addEventListener("click", (ev) => {
    if (!dragged) return;
    dragged = false;
    ev.stopPropagation();
  }, true);
  svg.addEventListener("wheel", (ev) => {
    if (!isEnlarged(plotBox) && !ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    zoomBy(ev.deltaY > 0 ? 1.25 : 0.8, pointAt(ev));
  }, { passive: false });
  svg.addEventListener("dblclick", () => {
    zoom = null;
    drawPlot();
  });
  let yearsW = 0;
  const yearsEnlarge = enlargeButton(yearsBox, () => render(), () => scenRow);

  function render() {
    const y = data.years[fy];
    const towns = y.towns;
    const t = towns.find((x) => x.id === townId) ?? towns[0];
    yearButtons.forEach((b, k) => b.classList.toggle("is-on", yearKeys[k] === fy));
    picker.sync();

    // The scenario's targets: the same statewide total, a different cap
    const f = solve(towns, y.totals.target, scenario);
    const alt = new Map(towns.map((x) => [x.id,
      Math.round(scenario == null ? x.cey * f : Math.min(x.cey * f, scenario * x.foundation))]));
    const change = (x: CapTown) => alt.get(x.id)! - x.target;
    const scenName = scenario == null ? "with no cap" : `with a ${capPct(scenario)} cap`;
    // Plain statements: "No cap means ...", "A 100% cap means ..."
    const means = scenario == null ? "No cap means" : `A ${capPct(scenario)} cap means`;
    const lessMore = (v: number) => (v < 0 ? `${usd(-v)} less` : v > 0 ? `${usd(v)} more` : "the same");
    const atScenarioCap = scenario == null ? 0 : towns.filter((x) => x.foundation && alt.get(x.id)! >= Math.round(scenario! * x.foundation) - 1).length;
    const up = towns.filter((x) => change(x) > 0);
    const down = towns.filter((x) => change(x) < 0);
    const upSum = up.reduce((a, x) => a + change(x), 0);
    const downSum = down.reduce((a, x) => a + change(x), 0);

    // Income fifths: who is in each, for the explanation, the tiles and the table
    // Every town with income and population, as the explorer's income fifths count them elsewhere
    const withIncome = towns.filter((x) => x.pop_income && x.income).map((x) => ({ x, inc: x.income / x.pop_income! }))
      .sort((a, b) => a.inc - b.inc);
    const n = withIncome.length;
    const fifthOf = new Map<string, number>();
    withIncome.forEach(({ x }, k) => fifthOf.set(x.id, Math.min(4, Math.floor((k * 5) / n))));
    const upTop = up.filter((x) => fifthOf.get(x.id) === 4).length;

    // How the cap works, in this year's numbers
    const p1 = el("p");
    p1.append("Chapter 70 asks each town to pay its fair share toward its schools. Each year, a complicated formula tells " +
      "us what's fair for each town. The formula starts out with two percentages set for the year for every town in the " +
      `Commonwealth: in FY${y.fy}, ` +
      `${rate(y.property_pct)} of its property value and ${rate(y.income_pct)} of its residents' income. The sum is the ` +
      "town's combined effort yield. It's what the town would pay if it made the same fiscal effort",
      helpButton("What is fiscal effort? An example with two towns", effort),
      " as every other town to educate its schoolchildren: the same share of its property value and its residents' income.");
    const pCap = el("p");
    pCap.append(`Meanwhile … no town is asked for more than ${pct(y.max_pct, 1)} of its foundation budget, the state's ` +
      `estimate of what its schools need. ${y.totals.capped} towns, the ones with the most property and income for the ` +
      "size of their schools, hit that 82.5% cap. They're asked for less effort than other towns, and the state pays " +
      `at least the other ${pct(1 - y.max_pct, 1)}.`);

    // Fiscal effort, worked through for two towns with one house each and a school they share
    const house = 400_000, incomes = [100_000, 1_000_000], school = 10_000;
    const pEx = school / 2 / (2 * house), iEx = school / 2 / (incomes[0] + incomes[1]);
    const ceyEx = incomes.map((inc) => house * pEx + inc * iEx);
    const ex = el("table", "cap-steps-table");
    ex.createTHead().insertRow().append(el("th"), el("th", "num", "Town A"), el("th", "num", "Town B"));
    const exBody = ex.createTBody();
    const exRow = (label: string, cells: string[], cls = "") => {
      const r = exBody.insertRow();
      if (cls) r.className = cls;
      const th = el("th", undefined, label);
      th.scope = "row";
      r.append(th, ...cells.map((c) => el("td", "num", c)));
    };
    exRow("House, assessed", [usd(house), usd(house)]);
    exRow("Family income", incomes.map(usd));
    exRow(`From property, ${rate(pEx)}`, [usd(house * pEx), usd(house * pEx)]);
    exRow(`From income, ${rate(iEx)}`, incomes.map((inc) => usd(inc * iEx)));
    exRow("Combined effort yield", ceyEx.map(usd), "total");
    exRow("Share of family income", ceyEx.map((c, k) => pct(c / incomes[k], 1)));
    exRow("Property tax rate to raise it", ceyEx.map((c) => `$${((c / house) * 1000).toFixed(2)} per $1,000`));
    const exPara = (text: string) => el("p", undefined, text);
    effortBody.replaceChildren(
      exPara(`Picture two towns, each with one house assessed at ${usd(house)}. In Town A, the family earns ` +
        `${usd(incomes[0])} a year. In Town B, the family earns ${usd(incomes[1])}. The two towns share a school ` +
        `that costs ${usd(school)} a year. What should each town pay?`),
      exPara("Chapter 70 sets its two percentages so that property and income each yield half the total. Here that's " +
        `${usd(school / 2)} from ${usd(2 * house)} of property, or ${rate(pEx)}, and ${usd(school / 2)} from ` +
        `${usd(incomes[0] + incomes[1])} of income, or ${rate(iEx)}. Both towns pay those same two percentages: ` +
        "the same fiscal effort."),
      ex,
      exPara(`Town B pays more because its family earns ten times as much. But the same fiscal effort isn't the ` +
        "same share of each family's income. The property half falls on both houses equally, so Town A's family pays " +
        `${pct(ceyEx[0] / incomes[0], 1)} of its income and Town B's pays ${pct(ceyEx[1] / incomes[1], 1)}.`),
      exPara("Chapter 70 doesn't say how a town raises its share, but Massachusetts towns can't tax income. Raising it " +
        "with the property tax, Town B would tax an identical house at more than twice Town A's rate. The formula " +
        "expects the town with more income to tax the same house harder."),
      exPara(`If the formula counted property alone, both houses would owe ${usd(school / 2)}: ` +
        `${pct(school / 2 / incomes[0], 1)} of Town A's family income and ${pct(school / 2 / incomes[1], 1)} of ` +
        `Town B's. Counting income moves ${usd(school / 2 - ceyEx[0])} of the bill from Town A to Town B.`));
    const p2 = el("p");
    p2.append("Someone has to cover the difference, and that someone is other towns. The state sets the two " +
      `percentages so that the towns together are asked for 59% of all foundation budgets, ${big(y.totals.target)} in ` +
      `FY${y.fy}. With costs held down for the 82.5% capped towns, the required cost of education has to rise for ` +
      `everyone to reach that total. The result for FY${y.fy}: the cap gave a ${big(y.totals.up_sum)} education ` +
      `discount to ${y.totals.up} Massachusetts towns and added it to the required contribution of the other ` +
      `${y.totals.down} towns.`);
    const pSee = el("p", "cap-note");
    pSee.append(...seeAlso());
    howText.replaceChildren(p1, pCap, p2, pSee);

    tiles.replaceChildren(
      tile(`Towns at the cap, FY${y.fy}`, String(y.totals.capped),
        [`Of 351 towns. Each is asked for ${pct(y.max_pct, 1)} of its foundation budget, which is less than it would pay if ` +
          "it made the same fiscal effort as every other town."]),
      tile("Statewide percentages", `${rate(y.property_pct)} · ${rate(y.income_pct)}`,
        ["Of property value and of income, with the cap", `With no cap: ${rate(y.property_pct * y.factor)} · ${rate(y.income_pct * y.factor)}`]),
      tile("Wealth redistributed by the cap", big(y.totals.up_sum), [
        `${y.totals.up} towns are asked for ${big(y.totals.up_sum)} less because of the cap`,
        `The other ${y.totals.down} are asked for ${big(-y.totals.down_sum)} more`]),
    );

    scenNote.textContent = `${means} statewide percentages of ${rate(y.property_pct * f)} of property value and ` +
      `${rate(y.income_pct * f)} of income` + (scenario == null ? ". " : `, with ${atScenarioCap} towns at the new cap. `) +
      `${down.length} towns would be asked for ${big(-downSum)} less in FY${y.fy}, and ${up.length} towns would be asked ` +
      `for ${big(upSum)} more` + (up.length ? `, ${upTop} of them in the fifth with the highest income per resident.` : ".") +
      " The town table, the year-by-year chart, the scatterplot, and the income table all follow this choice.";

    // One town: today's cap beside the one chosen above, line by line
    const pAlt = y.property_pct * f;
    const iAlt = y.income_pct * f;
    const ch = change(t);
    const capAlt = scenario == null ? null : Math.round(scenario * t.foundation);
    const scenCol = scenario == null ? "No cap" : `A ${capPct(scenario)} cap`;
    const tableHead = el("p", "cap-table-head");
    tableHead.append(`How Chapter 70 sets ${t.name}'s minimum contribution to its schools, FY${y.fy} `,
      helpButton("How is the minimum calculated?"));
    const table = el("table", "cap-steps-table");
    const hr0 = table.createTHead().insertRow();
    hr0.append(el("th", undefined, t.name), el("th", "num", "Today: 82.5% cap"), el("th", "num", scenCol), el("th", "num", "Difference"));
    const tb0 = table.createTBody();
    // Each cell: the amount, with how it was reached in small type beneath
    type Cell = string | [string, string];
    const cell = (c: Cell) => {
      const td = el("td", "num");
      if (typeof c === "string") td.textContent = c;
      else td.append(c[0], el("small", "cap-cell-note", c[1]));
      return td;
    };
    const row = (label: string | HTMLElement, sub: string, today: Cell, other: Cell, diff: Cell, cls = "") => {
      const r = tb0.insertRow();
      if (cls) r.className = cls;
      const th = el("th");
      th.scope = "row";
      th.append(label);
      if (sub) th.append(el("small", "cap-cell-note", sub));
      r.append(th, cell(today), cell(other), cell(diff));
    };
    const share = (v: number) => (t.foundation ? `${pct(v / t.foundation)} of foundation` : "");
    row("From property", `${usd(t.eqv)} (equalized value, January ${y.eqv_year})`,
      [usd(t.eqv * y.property_pct), `× ${rate(y.property_pct)}`], [usd(t.eqv * pAlt), `× ${rate(pAlt)}`],
      signed(t.eqv * pAlt - t.eqv * y.property_pct));
    row("From income", `${usd(t.income)} (residents' ${y.income_year} income)`,
      [usd(t.income * y.income_pct), `× ${rate(y.income_pct)}`], [usd(t.income * iAlt), `× ${rate(iAlt)}`],
      signed(t.income * iAlt - t.income * y.income_pct));
    row("Combined effort yield", "The two together", [usd(t.cey), share(t.cey)], [usd(t.cey * f), share(t.cey * f)],
      signed(t.cey * f - t.cey));
    row("Cap on the target", `As a share of the ${usd(t.foundation)} foundation budget`,
      [usd(t.max), `${pct(y.max_pct, 1)} of foundation`], capAlt == null ? ["None", ""] : [usd(capAlt), `${capPct(scenario!)} of foundation`], "");
    const tgtLabel = el("span");
    tgtLabel.append(`Target local contribution, FY${y.fy} `, tipButton("What is a target local contribution?",
      `What the formula asks ${t.name} to pay toward its schools in FY${y.fy}: its combined effort yield, ` +
      `${usd(t.cey)}, or ${pct(y.max_pct, 1)} of its foundation budget, ${usd(t.max)}, whichever is less. For ` +
      `${t.name}, that's ${usd(t.target)}${t.capped ? ", the cap" : ", its yield"}.`));
    row(tgtLabel, "The yield or the cap, whichever is less", usd(t.target), usd(alt.get(t.id)!),
      t.pop ? [signed(ch), `${signed(ch / t.pop)} per resident`] : signed(ch), "total");
    if (t.required != null) {
      const reqLabel = el("span");
      reqLabel.append(`Required contribution, FY${y.fy}: the minimum `, tipButton("What is a required contribution?",
        `The least ${t.name} must pay toward its schools in FY${y.fy}. It moves toward the target gradually: the ` +
        "formula grows last year's amount by the town's revenue growth factor, lowers it to the target if it comes out " +
        "above, and adds 1% or 2% of last year's amount if it comes out well below. For " +
        `${t.name}: ${usd(t.required)}, against a ${usd(t.target)} target.`));
      row(reqLabel, `What ${t.name} must pay toward its schools this year`,
        [usd(t.required), t.required < t.target - 1 ? `${usd(t.target - t.required)} below the target` : "The full target"],
        (() => {
          const req = requiredFor(t, alt.get(t.id)!, t.foundation ? (t.cey * f) / t.foundation : 0);
          return req == null ? "–" : [usd(req), "If the cap changed this year"] as [string, string];
        })(),
        (() => {
          const req = requiredFor(t, alt.get(t.id)!, t.foundation ? (t.cey * f) / t.foundation : 0);
          return req == null ? "" : signed(req - t.required!);
        })(), "minimum");
    }
    const scroll0 = Object.assign(el("div", "table-scroll"), { tabIndex: 0 });
    scroll0.append(table);
    const verdict = el("p", "cap-verdict");
    const reqAlt = t.required == null ? null : requiredFor(t, alt.get(t.id)!, t.foundation ? (t.cey * f) / t.foundation : 0);
    verdict.textContent = (reqAlt != null && t.required != null
      ? `${means} ${t.name} would be required to pay ${lessMore(reqAlt - t.required)} for its schools in FY${y.fy}. `
      : "") + `Its target, what the formula asks it to pay, would be ${lessMore(ch)}.`;
    steps.replaceChildren(tableHead, scroll0, verdict);

    // The window's explanation, with this town's numbers
    const explain: (string | Node)[][] = [
      ["Chapter 70 sets a minimum each town must pay toward its schools each year, its required local contribution. " +
        "The formula works toward a target for that minimum, the target local contribution: the town's combined effort " +
        "yield, a statewide percentage of its property value plus one of its residents' income, or " +
        `${pct(y.max_pct, 1)} of its foundation budget if that's less.`],
      ["The minimum doesn't jump to the target all " +
        "at once. The formula starts from last year's required contribution and grows it by the town's municipal revenue " +
        "growth factor, a state estimate of how fast the town's own revenue grows. If the result is above the target, " +
        "the required contribution comes down to the target. If it falls short of the target by more than 2.5% of the " +
        "foundation budget, the formula adds 1% of last year's amount, or 2% when it falls short by more than 7.5%."],
    ];
    if (t.required != null && t.prior != null && t.mrgf != null && t.preliminary != null) {
      const g = `${(t.mrgf * 100).toFixed(2)}%`;
      const step = t.required - t.preliminary;
      explain.push([t.required < t.target - 1
        ? `For ${t.name} in FY${y.fy}: last year's required contribution, ${usd(t.prior)}, grew by ${t.name}'s growth ` +
          `factor of ${g} to ${usd(t.preliminary)}.` + (step > 1 ? ` That was more than ${t.increment && t.increment >= 0.02 ? "7.5" : "2.5"}% ` +
          `of the foundation budget below the target, so the formula added ${t.increment ? `${(t.increment * 100).toFixed(0)}%` : "a share"} ` +
          `of last year's amount, ${usd(step)}.` : "") +
          ` ${t.name} must pay ${usd(t.required)}, ${usd(t.target - t.required)} less than its ${usd(t.target)} target.`
        : t.floor
          ? `For ${t.name} in FY${y.fy}: its yield is at least 175% of its foundation budget, and a rule for such towns ` +
            `sets the required contribution at the full target, ${usd(t.required)}.`
          : `For ${t.name} in FY${y.fy}: last year's required contribution, ${usd(t.prior)}, grown by ${t.name}'s growth ` +
            `factor of ${g}, would have been ${usd(t.preliminary)}, more than the ${usd(t.target)} target, so ${t.name} ` +
            `must pay the target.`]);
    }
    const sp = data.meta.spending;
    if (sp) {
      explain.push([`Most districts spend more than the minimum, and some spend much more. In FY${sp.fy}, ${sp.above} of ` +
        `${sp.districts} districts spent more than their required net school spending, the least a district may spend: ` +
        "its towns' required contributions plus its Chapter 70 aid. The median district spent " +
        `${pct(sp.median - 1)} more, ${sp.half_again} spent at least half again as much, and ${sp.double} at least twice ` +
        `as much: ${big(sp.over)} above a ${big(sp.required)} minimum in all. That extra is the towns' own money, beyond ` +
        "their required contributions."]);
    }
    explain.push([`The table's last row estimates what ${t.name} would be required to pay in FY${y.fy} if the cap ` +
      "changed this year: the same rules, starting from last year's required contribution, with the new target. " +
      "Today's rules also hold every required contribution to at most 90% of the foundation budget, and the estimate " +
      "keeps that rule."]);
    explain.push(["The rest of this page compares targets. Under today's rules, if a town's target fell, its required contribution " +
      "would come down to the new target the next year; if its target rose, its required contribution would climb toward " +
      "it a few percent a year."]);
    explain.push(seeAlso());
    helpBody.replaceChildren(...explain.map((parts) => {
      const para = el("p");
      para.append(...parts);
      return para;
    }));

    // Year by year for this town, the same cap choice in every year since FY2007
    const H = data.history;
    const hist = H?.towns[t.id];
    if (H && hist) {
      const f = histFactors(H);
      const rows = H.years.map((fy, j) => {
        const cey = hist.cey[j];
        const fb = hist.foundation[j];
        const target = hist.target[j];
        if (cey == null || fb == null || target == null) return { fy, diff: null as number | null, target, capped: false };
        const other = scenario == null ? cey * f[j] : Math.min(cey * f[j], scenario * fb);
        return { fy, diff: Math.round(other - target), target, capped: target < cey - 1 };
      });
      const have = rows.filter((r) => r.diff != null);
      const sum = have.reduce((a, r) => a + r.diff!, 0);
      const first = have[0]?.fy;
      const lastFy = have[have.length - 1]?.fy;
      const cappedYears = rows.filter((r) => r.capped).length;
      const headline = el("p", "cap-note");
      headline.textContent = `${means} the formula would have asked ${t.name} for ${lessMore(sum)} toward its schools ` +
        `from FY${first} to FY${lastFy}, about ${usd(Math.abs(sum) / Math.max(1, have.length))} a year. ${t.name} was at ` +
        `the cap in ${cappedYears === 0 ? "none" : cappedYears === have.length ? "all" : cappedYears} of those ` +
        `${have.length} years.`;
      const caveat = el("p", "cap-note");
      caveat.textContent = "Each year keeps that year's statewide total, as the formula does. These are what the formula " +
        "asks for, its targets. What a town is required to pay moves toward its target a few percent a year, so its " +
        "bills would have changed more slowly.";
      // Columns: above zero, the target would be higher without today's cap; below, lower
      const width = isEnlarged(yearsBox) && yearsW ? yearsW : Math.max(300, yearsBox.clientWidth || 800);
      yearsW = width;
      const height = 240;
      const m = { top: 12, right: 12, bottom: 58, left: 78 };
      const pw = width - m.left - m.right;
      const ph = height - m.top - m.bottom;
      const vals = have.map((r) => r.diff!);
      const ticks = ticksFor(Math.min(0, ...vals), Math.max(0, ...vals), 4);
      const y0 = ticks[0];
      const y1 = ticks[ticks.length - 1];
      const sy = (v: number) => m.top + ph - ((v - y0) / (y1 - y0 || 1)) * ph;
      const step = pw / rows.length;
      yearsSvg.replaceChildren();
      yearsSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      yearsSvg.setAttribute("aria-label", `Columns of how ${t.name}'s target would change ${scenName}, each year FY${first} to FY${lastFy}.`);
      const money = (v: number) => (Math.abs(v) >= 1e6 ? `${v < 0 ? "−" : ""}$${(Math.abs(v) / 1e6).toFixed(1)}M`
        : `${v < 0 ? "−" : ""}$${Math.round(Math.abs(v) / 1000)}K`);
      for (const tk of ticks) {
        svgEl("line", { x1: m.left, x2: m.left + pw, y1: sy(tk), y2: sy(tk), class: tk === 0 ? "sc-ref" : "cap-years-grid" }, yearsSvg);
        const lab = svgEl("text", { x: m.left - 8, y: sy(tk), dy: "0.32em", "text-anchor": "end", class: "sc-tick" }, yearsSvg);
        lab.textContent = tk === 0 ? "$0" : money(tk);
      }
      rows.forEach((r, j) => {
        const x = m.left + step * j + step * 0.18;
        const w = step * 0.64;
        if (r.diff != null && r.diff !== 0) {
          const top = sy(Math.max(0, r.diff));
          const bar = svgEl("rect", { x, y: top, width: w, height: Math.max(1, Math.abs(sy(r.diff) - sy(0))),
            fill: r.diff > 0 ? "#2a78d6" : "#eb6834", rx: 2 }, yearsSvg);
          const tip = svgEl("title", {}, bar);
          tip.textContent = `FY${r.fy}: target ${usd(r.target!)}${r.capped ? " (at the cap)" : ""}; ${scenName}, ` +
            `${signed(r.diff)}`;
        }
        if (r.capped) svgEl("rect", { x, y: m.top + ph + 4, width: w, height: 4, fill: "#6250d6", rx: 1 }, yearsSvg);
        if (rows.length <= 12 || j % 2 === 0 || pw > 900) {
          const lab = svgEl("text", { x: x + w / 2, y: m.top + ph + 26, "text-anchor": "middle", class: "sc-tick" }, yearsSvg);
          lab.textContent = pw > 900 ? `FY${String(r.fy).slice(2)}` : `'${String(r.fy).slice(2)}`;
        }
      });
      const xTitle = svgEl("text", { x: m.left + pw / 2, y: height - 6, "text-anchor": "middle", class: "sc-title" }, yearsSvg);
      xTitle.textContent = "Fiscal year";
      const yTitle = svgEl("text", { transform: `translate(17 ${m.top + ph / 2}) rotate(-90)`, "text-anchor": "middle", class: "sc-title" }, yearsSvg);
      yTitle.textContent = "Change in target";
      const key = el("ul", "cw-legend");
      for (const [color, label, shape] of [["#2a78d6", `Asked for more ${scenName}: today's cap saves ${t.name} this much`, "square"],
        ["#eb6834", `Asked for less ${scenName}: today's cap costs ${t.name} this much`, "square"],
        ["#6250d6", `${t.name} at the cap that year`, "square"]] as const) {
        const li = el("li");
        const k = el("span", `cw-key ${shape}`);
        k.style.setProperty("--c", color);
        li.append(k, el("span", undefined, label));
        key.append(li);
      }
      const src = el("p", "cap-note");
      src.append("Source: DESE's ", link("Chapter 70 trends workbook", H.source), ` (FY${first}–FY${lastFy - 1}) and FY${lastFy} formula spreadsheet.`);
      yearsBox.replaceChildren(yearsEnlarge, el("h3", undefined, `${t.name}, year by year`), headline, key, yearsSvg, caveat, src);
    } else {
      yearsBox.replaceChildren();
    }

    // The chart: every town, the selected one marked, by how much more or less each household would be asked for
    const xo = X_OPTIONS[xKey];
    const perHh = (x: CapTown) => (x.hh ? change(x) / x.hh : null);
    chartIntro.replaceChildren("Each point is a town. Up and down, ", vn("change in target per household"), ": how much " +
      `more or less the town would be asked for in FY${y.fy} ${scenName}, divided by its households. Above the zero ` +
      `line, today's ${pct(y.max_pct, 1)} cap saves the town money; below it, the cap costs the town money. Households ` +
      "are the Census Bureau's latest five-year estimates (2020–2024).");

    // What the chosen measure shows: where the towns the cap saves money fall, and how closely it tracks the change
    const fifthsBy = (k: XKey) => {
      const w = towns.filter((x) => x.foundation && xOf(x, k) != null).sort((a, b) => xOf(a, k)! - xOf(b, k)!);
      return new Map(w.map((x, i) => [x.id, Math.min(4, Math.floor((i * 5) / w.length))]));
    };
    const rho = (k: XKey) => {
      const w = towns.filter((x) => x.foundation && (xOf(x, k) ?? 0) > 0 && perHh(x) != null);
      return spearman(w.map((x) => xOf(x, k)!), w.map((x) => perHh(x)!)) ?? 0;
    };
    const rhos = (Object.keys(X_OPTIONS) as XKey[]).map((k) => ({ k, r: rho(k) })).sort((a, b) => b.r - a.r);
    const place = rhos.findIndex((q) => q.k === xKey);
    const rank = ["the strongest", "the second strongest", "the third strongest", "the weakest"][place];
    const f5 = fifthsBy(xKey);
    const where = up.length
      ? [` Of the ${up.length} towns that today's cap saves money, ${up.filter((x) => f5.get(x.id) === 4).length} are in ` +
        "the top fifth by ", vn(xo.label.toLowerCase()), `, and ${up.filter((x) => (f5.get(x.id) ?? 4) <= 2).length} are ` +
        "in the bottom three fifths."]
      : [];
    const capped = towns.filter((x) => x.capped && x.foundation);
    const cappedUp = capped.filter((x) => change(x) > 0).length;
    const cappedDown = capped.filter((x) => change(x) < 0).length;
    // Each measure's text: what it is, then what it shows
    const lead: Record<XKey, (string | Node)[]> = {
      cey_pct: [": each town's fair share by the formula set against what its schools need. This is the measure the " +
        `cap reads: every town right of the dashed line at ${pct(y.max_pct, 1)} is at today's cap.` + (cappedUp + cappedDown
          ? ` ${capitalize(scenName)}, ${cappedUp} of those ${capped.length} towns would be asked for more and ` +
            `${cappedDown} for less.`
          : "")],
      eqv_pc: [": the property half of the formula's measure of wealth.", ...where],
      income_pc: [`: from state tax returns for ${y.income_year}, the income half of the formula's measure of wealth.`, ...where],
      cey_pc: [": property and income together as the formula weighs them, but counted per resident instead of against " +
        "what the town's schools need.", ...where],
    };
    chartContext.replaceChildren("Across, ", vn(xo.title.charAt(0).toLowerCase() + xo.title.slice(1)), ...lead[xKey],
      " This measure's rank correlation with the ", vn("change per household"),
      ` is ρ = ${rhos[place].r.toFixed(2)}, ${rank} of the four measures here.`);

    const pts: Point[] = [];
    for (const x of towns) {
      const xv = xOf(x, xKey);
      const yv = perHh(x);
      if (xv == null || yv == null || !isFinite(xv) || !isFinite(yv) || xv <= 0 || !x.foundation) continue;
      const group = x.id === t.id ? "town" : colorBy === "fifth" ? `f${(fifthOf.get(x.id) ?? 0) + 1}` : x.capped ? "capped" : "below";
      pts.push({ x: xv, y: yv, id: x.id, name: x.name, group, label: x.id === t.id });
    }
    // Enlarged, drawn to fill the window; otherwise to the page's width
    const enlarged = isEnlarged(plotBox);
    const width = enlarged ? Math.max(300, Math.floor(Math.min(1500, window.innerWidth * 0.96) - 80))
      : Math.max(300, figure.clientWidth || 800);
    const height = enlarged ? Math.max(320, Math.floor(window.innerHeight * 0.94 - 200))
      : Math.round(Math.min(460, Math.max(280, width * 0.5)));
    svg.setAttribute("aria-label", `Scatterplot of the change in target per household against ${xo.title.toLowerCase()} for ${pts.length} towns, FY${y.fy}.`);
    drawPlot = () => {
      plotView = scatter(svg, pts, {
      width, height, logX: true, xFmt: xo.axis, yFmt: signed, domain: zoom ?? undefined,
      xTitle: xo.title, xTitleShort: xo.short,
      yTitle: Y_TITLE, yTitleShort: "Change, per household",
      groups: colorBy === "fifth" ? FIFTH_GROUPS : GROUPS, smooth: false, refY: 0, refX: xKey === "cey_pct" ? y.max_pct : undefined, refXLabel: pct(y.max_pct, 1),
      onHover: (p, pos) => {
        if (!p || !pos) {
          tip.hidden = true;
          return;
        }
        const x = towns.find((q) => q.id === p.id)!;
        tip.replaceChildren(el("strong", undefined, x.name),
          el("div", undefined, `Target today: ${usd(x.target)}${x.capped ? " (at the cap)" : ""}`),
          el("div", undefined, `${capitalize(scenName)}: ${usd(alt.get(x.id)!)} (${signed(change(x))})`),
          el("div", undefined, `Per household: ${signed(p.y)}`),
          el("div", undefined, `${xo.title}: ${xo.fmt(p.x)}`),
          el("div", "cw-tip-hint", "Select to walk through it above"));
        tip.hidden = false;
        const box = svg.getBoundingClientRect();
        const fig = figure.getBoundingClientRect();
        const scale = box.width / width;
        tip.style.left = `${Math.min(box.left - fig.left + pos.left * scale + 12, fig.width - tip.offsetWidth - 4)}px`;
        tip.style.top = `${Math.max(0, box.top - fig.top + pos.top * scale - tip.offsetHeight - 10)}px`;
      },
      onPick: (p) => {
        townId = p.id;
        select.value = townId;
        render();
        lookup.scrollIntoView({ behavior: "smooth", block: "start" });
      },
      }).view;
      if (!zoom) fullView = plotView;
      zoomBar.classList.toggle("is-zoomed", !!zoom);
    };
    drawPlot();
    colorButtons.forEach((b, k) => b.classList.toggle("is-on", (k === 0) === (colorBy === "cap")));
    legend.replaceChildren(...Object.values(colorBy === "fifth" ? FIFTH_GROUPS : GROUPS).map((g) => {
      const li = el("li");
      const key = el("span", `cw-key ${g.shape}`);
      key.style.setProperty("--c", g.color);
      li.append(key, el("span", undefined, g.label === "Selected town" ? t.name : g.label));
      return li;
    }));

    // By income: each fifth of towns
    const tbl = el("table", "cap-fifths-table");
    const hr = tbl.createTHead().insertRow();
    for (const h of ["Towns by income per resident", "Towns", "At today's cap", "Median income per resident",
      `Change in what's asked, ${scenName}`, "Median change per resident", "Median change as a share of income"]) hr.append(el("th", undefined, h));
    const tb = tbl.createTBody();
    const names = ["Lowest fifth", "Second fifth", "Middle fifth", "Fourth fifth", "Highest fifth"];
    // Highest fifth first
    for (let q = 4; q >= 0; q--) {
      const part = withIncome.filter(({ x }) => fifthOf.get(x.id) === q);
      const sum = part.reduce((a, { x }) => a + change(x), 0);
      const r = tb.insertRow();
      const th = el("th", undefined, names[q]);
      th.scope = "row";
      r.append(th, el("td", "num", String(part.length)), el("td", "num", String(part.filter(({ x }) => x.capped).length)),
        el("td", "num", usd(median(part.map((p) => p.inc)))),
        el("td", "num", `${sum < 0 ? "−" : "+"}${big(sum)}`),
        el("td", "num", signed(median(part.map(({ x }) => change(x) / (x.pop || 1))))),
        el("td", "num", `${(median(part.map(({ x }) => change(x) / x.income)) * 100).toFixed(2)}%`));
    }
    const scroll = Object.assign(el("div", "table-scroll"), { tabIndex: 0 });
    scroll.append(tbl);
    fifths.replaceChildren(el("h3", undefined, "By income"),
      el("p", "cap-note", `All ${n} towns, in five groups by income per resident (${y.income_year} ` +
        `income over the July ${y.income_year} population estimate). A negative change means the group is asked for more ` +
        `with today's cap than it would be ${scenName}: the cap costs it money.`),
      scroll);
  }

  function tile(label: string, value: string, details: string[]) {
    const d = el("div", "tile");
    d.append(el("div", "tile-label", label), el("div", "tile-value", value));
    details.forEach((x) => d.append(el("div", "tile-detail", x)));
    return d;
  }

  let lastW = 0;
  new ResizeObserver(() => {
    if (isEnlarged(plotBox)) return;
    const w = figure.clientWidth;
    if (w > 0 && Math.abs(w - lastW) > 8) {
      lastW = w;
      render();
    }
  }).observe(figure);

  return { render };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
