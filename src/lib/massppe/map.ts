// The Commonwealth tab's map: every city and town, colored by a measure of how it has changed, or
// how the school district that serves it has. Towns that share a district share its color. A
// change is shown on a diverging scale around zero (blue up, orange down, gray near none), a level
// on one blue scale, light to dark; both cut into five classes so a color reads as a range.
// Hovering names the town and its value; a click opens it, or its district, in its own tab.
// Once the measures' years arrive (map-years.json), a change can be measured between any two years,
// and a level shown for any year, or played from the first year to the latest.

import { enlargeButton } from "./enlarge";

/** [value, year] for a level; [value, first year, last year] for a change */
type Val = number[];
/** A measure year by year, along MapSeries.years */
type Arr = (number | null)[];
/** elem and high: the districts serving its elementary and its secondary grades; all: the two combined,
 * each weighted by the town's own pupils, where they differ */
interface MapTown {
  id: string; name: string; d: string; elem: string | null; high: string | null; ct?: Kind | null; v: Record<string, Val>;
  all?: Record<string, Val>;
}
/** Community types, from least dense to most */
type Kind = "rural" | "suburban" | "gateway" | "core";
const KINDS: Kind[] = ["rural", "suburban", "gateway", "core"];
const KIND_NAME: Record<Kind, string> = { rural: "Rural", suburban: "Suburban and other", gateway: "Gateway City", core: "Inner Core" };
// The types run from the least dense to the most, so one blue ramp, light to dark, orders them
const KIND_COLOR: Record<Kind, string> = { rural: "#86b6ef", suburban: "#3987e5", gateway: "#1c5cab", core: "#0d366b" };
export interface MapData {
  meta: {
    start: number; latest: number; cap_fy: number; width: number; height: number; outlines: string;
    /** Where each income fifth begins (the second through the highest), for towns and for districts */
    fifths: { towns: number[] | null; districts: number[] | null; year: number | null };
  };
  towns: MapTown[];
  districts: Record<string, { name: string; ct?: Kind | null; v: Record<string, Val> }>;
}
/** The measures year by year (map-years.json): every array runs along years, trailing years without a value
 * left off. cpi: the Northeast index each year, for growth after inflation. A split town's w: its pupils in
 * its elementary district and in its secondary one. */
export interface MapSeries {
  years: number[];
  cpi: (number | null)[];
  towns: Record<string, Record<string, Arr>>;
  districts: Record<string, Record<string, Arr>>;
}

type Layer = "towns" | "districts";
type Grades = "elem" | "high" | "all";
/** The years a value covers: one year has from equal to to */
interface Yrs { from: number; to: number }
interface Measure {
  key: string;
  label: string;
  /** "change" diverges around zero; "level" runs light to dark; "type" colors each community type */
  kind: "change" | "level" | "type";
  /** A value in full, for the tooltip and the table; and short, for the legend */
  fmt: (v: number) => string;
  short: (v: number) => string;
  /** What it measures, in a sentence or two, over the years shown, in nominal dollars or the latest year's */
  about: (m: MapData["meta"], real: boolean, y: Yrs) => string;
  /** For a change: what grew, in the sentence on how the towns or districts split ("spending per pupil") */
  subject?: string;
  /** For the cap: its own sentence on the split */
  split?: (up: number, down: number, n: number) => string;
  /** After a level's median: its unit, if the number needs one (" residents per square mile") */
  unit?: string;
  /** Growth in dollars, which the Dollars switch shows before or after inflation */
  dollars?: boolean;
  /** Fixed cut points, where the state draws its own lines, in place of fifths; "over" puts a value equal
   * to a cut in the class below it ("11 or fewer") */
  cuts?: number[];
  over?: boolean;
  /** The legend's words for each class, with fixed cuts */
  classes?: string[];
  /** Income: the classes are the income fifths, cut where the data says each begins */
  fifths?: "towns" | "districts";
  /** Once the years arrive: "range", a change between two years chosen; "year", one year at a time, which
   * can play. Without it, the measure has one year, shown but not chosen. */
  years?: "range" | "year";
}
const inDollars = (m: MapData["meta"], real: boolean) => (real ? `in FY${m.latest} dollars, after inflation` : "in nominal dollars, before inflation");
/** What the trend is, for the "?" beside a measure of growth */
const TREND_NOTE = "The trend is the straight line that best fits every year's value. Its growth is the yearly rate that " +
  "carries the line from its first year to its last. Because the line weighs every year, an unusual first or last year " +
  "moves it less than it would move growth measured from the first year's value to the last year's, and the line " +
  "doesn't always start on the first year's value.";

/** The sign of a figure as shown: none for one that rounds to zero, which has no direction */
const sign = (shown: number) => (shown > 0 ? "+" : shown < 0 ? "−" : "");
const tenth = (v: number) => Math.round(v * 1000) / 10;
const yearly = (v: number) => `${sign(tenth(v))}${Math.abs(tenth(v)).toFixed(1)}% a year`;
const yearlyShort = (v: number) => `${sign(tenth(v))}${Math.abs(tenth(v)).toFixed(1)}%`;
const change = (v: number) => `${sign(Math.round(v * 100))}${Math.abs(Math.round(v * 100))}%`;
const share = (v: number) => `${(v * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0)}%`;
const money = (v: number) => `${sign(Math.round(v))}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
const dollars = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const dense = (v: number) => (v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString("en-US"));
const denseShort = (v: number) => (v < 10 && v % 1 ? v.toFixed(1) : Math.round(v).toLocaleString("en-US"));
const none = () => "";

const TOWN_MEASURES: Measure[] = [
  {
    key: "ct", label: "Community type", kind: "type", fmt: none, short: none,
    about: () => "The Inner Core is Boston and 15 neighboring cities and towns, as the Metropolitan Area Planning " +
      "Council defines it. The Gateway Cities are the state's other 22 mid-size cities. A rural town has fewer than 500 " +
      "residents per square mile. Every other town counts as suburban and other.",
  },
  {
    key: "density", label: "Residents per square mile", kind: "level", fmt: dense, short: denseShort, cuts: [250, 500, 1000, 2500],
    unit: " residents per square mile", years: "year",
    about: (m, real, y) => `Each town's population in July ${y.to - 1}, divided by its land area. A town with fewer than 500 ` +
      "residents per square mile counts as rural.",
  },
  {
    key: "spend", label: "Spending per resident, yearly growth", kind: "change", fmt: yearly, short: yearlyShort, dollars: true,
    subject: "spending per resident", years: "range",
    about: (m, real, y) => `How fast each town's general fund spending per resident grew each year on trend, from FY${y.from} ` +
      `to FY${y.to}, ${inDollars(m, real)}.`,
  },
  {
    key: "edu", label: "Education's share of spending", kind: "level", fmt: share, short: share, years: "year",
    about: (m, real, y) => `The share of each town's general fund spending in FY${y.to} that went to education: its own ` +
      "school department and what it paid regional and vocational school districts.",
  },
  {
    key: "pop", label: "Population change", kind: "change", fmt: change, short: change, subject: "population", years: "range",
    about: (m, real, y) => `How much each town's population changed from July ${y.from - 1} to July ${y.to - 1}.`,
  },
  {
    key: "unemp", label: "Unemployment rate", kind: "level", fmt: share, short: share, years: "year",
    about: (m, real, y) => `The share of each town's labor force out of work in ${y.to - 1}, the state's average for the year. ` +
      "The figures end with 2022, which the map shows at FY2023.",
  },
  {
    key: "eqv", label: "Property value per resident, yearly growth", kind: "change", fmt: yearly, short: yearlyShort, dollars: true,
    subject: "property value per resident", years: "range",
    about: (m, real, y) => "How fast each town's equalized property value per resident grew each year on trend, from " +
      `FY${y.from} to FY${y.to}, ${inDollars(m, real)}. The state sets equalized values every other year.`,
  },
  {
    key: "income", label: "Income per resident", kind: "level", fmt: dollars, short: dollars, fifths: "towns",
    about: (m) => `Each town's residents' income for the Chapter 70 formula, from ${m.fifths.year} state tax returns, ` +
      `divided by its population in July ${m.fifths.year}. The five colors are the income fifths, 70 or 71 towns each.`,
  },
  {
    key: "levy_room", label: "Room under the levy limit", kind: "level", fmt: share, short: share, years: "year",
    about: (m, real, y) => `Each town's unused levy capacity in FY${y.to}, as a share of its Proposition 2½ levy limit. The ` +
      "lightest towns are taxing at or near their limit.",
  },
  {
    key: "override", label: "Override capacity", kind: "level", fmt: share, short: share, years: "year",
    about: (m, real, y) => `Each town's override capacity in FY${y.to}: the room between its Proposition 2½ levy limit and its ` +
      "levy ceiling, 2½% of its assessed value, as a share of the ceiling. The darkest towns could raise the most with an override.",
  },
  {
    key: "reserves", label: "Reserves as a share of the budget", kind: "level", fmt: share, short: share, years: "year",
    about: (m, real, y) => `Each town's free cash and stabilization funds at the end of FY${y.to}, as a share of its operating ` +
      "budget: the revenue its budget raises, without enterprise or Community Preservation Act funds.",
  },
  {
    key: "debt_service", label: "Debt service as a share of the budget", kind: "level", fmt: share, short: share, years: "year",
    about: (m, real, y) => `What each town's general fund paid in FY${y.to} on its long-term debt, principal and interest, as a ` +
      "share of its operating budget.",
  },
  {
    key: "bill_income", label: "Single-family tax bill as a share of income", kind: "level", fmt: share, short: share, years: "year",
    about: (m, real, y) => `The average single-family tax bill in FY${y.to}, as a share of income per capita. College towns run ` +
      "high because their students count as residents but report little income.",
  },
  {
    key: "cap_hh", label: "The 82.5% cap: change per household with no cap", kind: "change", fmt: money, short: money, years: "year",
    about: (m, real, y) => `How much more or less each town would be asked to pay toward its schools in FY${y.to} with no cap, ` +
      "per household, keeping that year's statewide total. The cap saves the blue towns money and costs the orange towns money.",
    split: (up, down, n) => `With no cap, ${up} of ${n} towns would be asked for more and the other ${down} would be asked for less.`,
  },
];

const DISTRICT_MEASURES: Measure[] = [
  {
    key: "ct", label: "Community type", kind: "type", fmt: none, short: none,
    about: () => "A district is rural if it has 35 or fewer students per square mile, the test DESE uses for rural school " +
      "aid. Inner Core districts are the school districts of Boston and its 15 neighbors. Gateway City districts are the " +
      "school districts of the other 22 Gateway Cities. Every other district counts as suburban and other.",
  },
  {
    key: "density", label: "Students per square mile", kind: "level", fmt: dense, short: denseShort, cuts: [11, 21, 35, 200],
    over: true, classes: ["11 or fewer (rural, tier 1)", "Over 11 to 21 (rural, tier 2)", "Over 21 to 35 (rural, tier 3)",
      "Over 35 to 200", "Over 200"],
    unit: " students per square mile", years: "year",
    about: (m, real, y) => `Each district's FY${y.to} foundation enrollment, divided by the land area of its towns. DESE ` +
      "counts a district with 35 or fewer students per square mile as rural.",
  },
  {
    key: "ppe", label: "Spending per pupil, yearly growth", kind: "change", fmt: yearly, short: yearlyShort, dollars: true,
    subject: "spending per pupil", years: "range",
    about: (m, real, y) => `How fast each district's in-district spending per pupil grew each year on trend, from FY${y.from} ` +
      `to FY${y.to}, ${inDollars(m, real)}.`,
  },
  {
    key: "enroll", label: "Enrollment change", kind: "change", fmt: change, short: change, subject: "enrollment", years: "range",
    about: (m, real, y) => `How much each district's in-district enrollment changed from FY${y.from} to FY${y.to}.`,
  },
  {
    key: "income", label: "Income per resident of its towns", kind: "level", fmt: dollars, short: dollars, fifths: "districts",
    about: (m) => `The combined income of each district's towns for the Chapter 70 formula, from ${m.fifths.year} state ` +
      `tax returns, divided by their combined population. The five colors are the districts' income fifths.`,
  },
  {
    key: "above", label: "Local contribution above required", kind: "level", fmt: share, short: share, years: "year",
    about: (m, real, y) => `How far each district's actual net school spending in FY${y.to} ran above the state's required ` +
      "minimum, as a share of that minimum.",
  },
  {
    key: "aid", label: "Chapter 70 aid's share of required spending", kind: "level", fmt: share, short: share, years: "year",
    about: (m, real, y) => `The share of each district's required spending in FY${y.to} that Chapter 70 aid covers. The ` +
      "district's towns pay the rest.",
  },
];

// Five classes. Change: orange for down, gray near zero, blue for up, as elsewhere in the explorer.
// Level: the palette's blue ramp, light to dark.
const DIVERGING = ["#c2541f", "#f2a77f", "#e9e6df", "#86b6ef", "#1c5cab"];
const SEQUENTIAL = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"];
// No value: hatched, so it can't pass for the gray near zero (the pattern is in each map's defs)
const NO_DATA = "url(#map-nodata)";
/** How long each year stays on the map as it plays */
const PLAY_MS = 900;

/** A round number near x: 1, 1.5, 2, 2.5, 3 or 5 times a power of ten */
function nice(x: number) {
  if (!(x > 0)) return 0;
  const p = 10 ** Math.floor(Math.log10(x));
  return [1, 1.5, 2, 2.5, 3, 5, 10].map((m) => m * p).reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
}
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
};
/** Four cut points between five classes */
function cuts(kind: Measure["kind"], values: number[]): number[] {
  if (kind === "change") {
    // Symmetric around zero: a narrow band near none, then the stronger changes on either side
    const outer = nice(quantile(values.map(Math.abs), 0.6));
    const inner = nice(outer / 4);
    return [-outer, -inner, inner, outer];
  }
  // Fifths, rounded so the legend reads cleanly, kept in order
  const raw = [0.2, 0.4, 0.6, 0.8].map((q) => quantile(values, q));
  const out: number[] = [];
  for (const r of raw) {
    const n = Math.abs(r) < 1e-9 ? 0 : Number(r.toPrecision(2));
    out.push(out.length && n <= out[out.length - 1] ? out[out.length - 1] : n);
  }
  return out;
}
const classOf = (v: number, c: number[]) => c.filter((x) => v >= x).length;

// Growth in dollars: down in orange, then four blues, faster growth darker. One set of classes serves the map
// before and after inflation, so the Dollars switch moves towns between them, as inflation does.
const GROWTH = ["#c2541f", "#cde2fb", "#86b6ef", "#3987e5", "#1c5cab"];
/** Cut points for growth in dollars, on its values before and after inflation together: zero, then the
 * quartiles of the growth above it, to the nearest half point */
function growthCuts(values: number[]): number[] {
  const up = values.filter((v) => v > 0);
  if (!up.length) return [0, 0.01, 0.02, 0.03];
  const out = [0];
  for (const q of [0.25, 0.5, 0.75]) {
    const r = Math.max(0.005, Math.round(quantile(up, q) / 0.005) * 0.005);
    out.push(r <= out[out.length - 1] ? out[out.length - 1] + 0.005 : r);
  }
  return out;
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const get = (a: Arr | undefined, i: number) => (a && i >= 0 && i < a.length ? a[i] : null);
/** The first and last years with a positive value, between lo and hi */
function endsOn(a: Arr | undefined, lo: number, hi: number): [number, number] | null {
  let first = -1;
  let last = -1;
  for (let i = lo; i <= hi; i++) {
    const v = get(a, i);
    if (v != null && v > 0) {
      if (first < 0) first = i;
      last = i;
    }
  }
  return first >= 0 && last > first ? [first, last] : null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
const SVG = "http://www.w3.org/2000/svg";

/**
 * real and setReal: the explorer's Dollars choice, which the map shares; refresh() redraws it when
 * that choice changes elsewhere; setSeries() hands it the measures' years when they arrive.
 */
export function startMap(root: HTMLElement, data: MapData, opts: {
  openTown: (id: string) => void; openDistrict: (id: string) => void; real: () => boolean; setReal: (real: boolean) => void;
}) {
  const { meta } = data;
  let layer: Layer = "districts";
  let grades: Grades = "all";
  let townKey = TOWN_MEASURES[0].key;
  let districtKey = "above";
  let S: MapSeries | null = null;
  /** The years chosen for each measure, by layer and key; until chosen, all of them, or the latest */
  const chosen = new Map<string, Yrs>();

  // ---- Layout: heading, controls, what the measure is, the map with its legend, a table ----
  const section = el("section", "map-section");
  const head = el("h3", "map-title", "Massachusetts, town by town");
  const controls = el("div", "map-controls");
  const seg = (label: string, items: [string, string][], on: (v: string) => void) => {
    const box = el("div", "map-seg");
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", label);
    const buttons = items.map(([v, text]) => {
      const b = el("button", "map-seg-btn", text);
      b.type = "button";
      b.dataset.v = v;
      b.addEventListener("click", () => on(v));
      return b;
    });
    box.append(el("span", "map-seg-label", label), ...buttons);
    return { box, set: (v: string) => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v))) };
  };
  const layerSeg = seg("Color", [["towns", "Towns"], ["districts", "School districts"]], (v) => {
    layer = v as Layer;
    stop();
    draw();
  });
  const gradeSeg = seg("Grades", [["elem", "Elementary"], ["high", "Secondary"], ["all", "All grades"]], (v) => {
    grades = v as Grades;
    stop();
    draw();
  });
  const dollarSeg = seg("Dollars", [["nominal", "Nominal"], ["real", `FY${meta.latest} dollars`]], (v) => opts.setReal(v === "real"));
  const measureWrap = el("label", "map-measure");
  const measureSel = el("select");
  measureWrap.append(el("span", undefined, "Measure"), measureSel);
  measureSel.addEventListener("change", () => {
    if (layer === "towns") townKey = measureSel.value;
    else districtKey = measureSel.value;
    stop();
    draw();
  });
  // The years: two handles for a change, one for a level with a Play button, or just the year for a measure
  // that has one. It sits on a row of its own under the other controls.
  const yearBox = el("div", "map-years");
  yearBox.setAttribute("role", "group");
  const yearLabel = el("span", "map-seg-label", "Years");
  yearLabel.id = "map-years-label";
  yearBox.setAttribute("aria-labelledby", yearLabel.id);
  const track = el("div", "map-years-track");
  const fill = el("div", "map-years-fill");
  const fromIn = el("input");
  const toIn = el("input");
  for (const [inp, name] of [[fromIn, "First year"], [toIn, "Last year"]] as const) {
    inp.type = "range";
    inp.min = "0";
    inp.step = "1";
    inp.setAttribute("aria-label", name);
  }
  track.append(fill, fromIn, toIn);
  const yearOut = el("output", "map-years-out");
  const play = el("button", "map-play");
  play.type = "button";
  yearBox.append(yearLabel, track, yearOut, play);
  controls.append(layerSeg.box, gradeSeg.box, measureWrap, dollarSeg.box, yearBox);
  // The measure's name heads a fold holding what it means; closed, it stays closed in this browser if
  // choices are remembered (the explorer's fold memory, mass-school-spending:map-about)
  const about = el("p", "map-about");
  const fold = el("details", "map-about-fold");
  fold.dataset.remember = "map-about";
  const measureTitle = el("h4", "map-measure-title");
  const foldHead = el("summary");
  foldHead.append(measureTitle);
  fold.append(foldHead, about);
  let closed = false;
  try {
    closed = localStorage.getItem("mass-school-spending:remember") === "yes" &&
      localStorage.getItem("mass-school-spending:map-about") === "closed";
  } catch { /* storage blocked */ }
  fold.open = !closed;
  const figure = el("figure", "map-figure");
  const legend = el("ul", "map-legend");
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "map-svg");
  svg.setAttribute("viewBox", `0 0 ${meta.width} ${meta.height}`);
  svg.setAttribute("role", "img");
  const defs = document.createElementNS(SVG, "defs");
  defs.innerHTML = '<pattern id="map-nodata" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<rect width="8" height="8" fill="#f4f1e8"/><line x1="0" y1="0" x2="0" y2="8" stroke="#bdb7aa" stroke-width="3"/></pattern>';
  const shapes = document.createElementNS(SVG, "g");
  const lift = document.createElementNS(SVG, "g");  // the hovered town, or district, drawn on top
  svg.append(defs, shapes, lift);
  const tip = el("div", "map-tip");
  tip.hidden = true;
  figure.append(legend, svg, tip);
  const tableBox = el("details", "map-table");
  const tableSum = el("summary");
  const tableHolder = el("div", "table-scroll");
  tableBox.append(tableSum, tableHolder);
  const src = el("p", "map-source");
  src.append("Outlines: the Census Bureau's ", Object.assign(el("a", undefined, "cartographic boundary file"), { href: meta.outlines }),
    " of county subdivisions. Data: the explorer's own, as the Data tab describes.");
  // Enlarge takes the controls, the measure's name and the map, not the text and table around them
  const mapBox = el("div", "map-box");
  mapBox.append(enlargeButton(mapBox), controls, fold, figure);
  section.append(head, mapBox, tableBox, src);
  root.replaceChildren(section);

  // One path per town, made once; each draw only recolors them
  const paths = new Map<string, SVGPathElement>();
  for (const t of data.towns) {
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", t.d);
    p.setAttribute("class", "map-town");
    p.dataset.id = t.id;
    shapes.append(p);
    paths.set(t.id, p);
  }
  const townById = new Map(data.towns.map((t) => [t.id, t]));
  /** "Leverett and Amherst-Pelham": the districts serving a town's grades */
  const schoolsOf = (t: MapTown) => [...new Set([t.elem, t.high].filter((d): d is string => !!d))]
    .map((d) => data.districts[d]?.name ?? d).join(" and ") || "no district of its own";

  // ---- The measures year by year, by the rules the pipeline uses for the figures in map.json ----
  const yi = (y: number) => S!.years.indexOf(y);
  /** The least-squares line's yearly growth from its first year to its last, between lo and hi */
  function trendOn(a: Arr, lo: number, hi: number): Val | null {
    const pts: [number, number][] = [];
    for (let i = lo; i <= hi; i++) {
      const v = get(a, i);
      if (v != null) pts.push([i, v]);
    }
    if (pts.length < 3) return null;
    const n = pts.length;
    const mx = pts.reduce((s, [i]) => s + i, 0) / n;
    const my = pts.reduce((s, [, v]) => s + v, 0) / n;
    const slope = pts.reduce((s, [i, v]) => s + (i - mx) * (v - my), 0) / pts.reduce((s, [i]) => s + (i - mx) ** 2, 0);
    const a0 = pts[0][0];
    const b0 = pts[n - 1][0];
    const fa = my + slope * (a0 - mx);
    const fb = my + slope * (b0 - mx);
    if (fa <= 0 || fb <= 0) return null;
    return [round((fb / fa) ** (1 / (b0 - a0)) - 1, 5), S!.years[a0], S!.years[b0]];
  }
  /** Trend growth after inflation (in the latest year's dollars) or before; the pipeline fits each on its own */
  function growthOn(a: Arr, lo: number, hi: number, after: boolean): Val | null {
    const cpi = S!.cpi;
    const base = cpi[yi(meta.latest)]!;
    const real = S!.years.map((_, i) => {
      const v = get(a, i);
      return v == null || cpi[i] == null ? null : (v * base) / cpi[i]!;
    });
    const r = trendOn(real, lo, hi);
    const nom = trendOn(a, lo, hi);
    if (!r || !nom) return null;
    return after ? r : nom;
  }
  function changeOn(a: Arr, lo: number, hi: number): Val | null {
    const e = endsOn(a, lo, hi);
    return e ? [round(get(a, e[1])! / get(a, e[0])! - 1, 4), S!.years[e[0]], S!.years[e[1]]] : null;
  }
  /** A measure's value from one town's or district's row, over the years chosen */
  function fromRow(m: Measure, row: Record<string, Arr> | undefined, y: Yrs, after: boolean): Val | null {
    if (!row) return null;
    if (m.years === "range") {
      const a = row[m.key];
      if (!a) return null;
      return m.dollars ? growthOn(a, yi(y.from), yi(y.to), after) : changeOn(a, yi(y.from), yi(y.to));
    }
    const i = yi(y.to);
    if (m.key === "above" || m.key === "aid") {
      const v = get(row[m.key], i);
      const req = get(row.req, i);
      return v == null || !req ? null : [round(v / req, 4), y.to];
    }
    const v = get(row[m.key], i);
    return v == null ? null : [v, y.to];
  }
  /** A split town's two districts as one, each weighted by the town's pupils in it */
  function combinedRow(m: Measure, t: MapTown, y: Yrs, after: boolean): Val | null {
    const w = S!.towns[t.id]?.w;
    const r1 = S!.districts[t.elem!];
    const r2 = S!.districts[t.high!];
    if (!w || !r1 || !r2) return null;
    const [w1, w2] = w as number[];
    const lo = yi(y.from);
    const hi = yi(y.to);
    if (m.key === "ppe") {
      const mix = S!.years.map((_, k) => {
        const a = get(r1.ppe, k);
        const b = get(r2.ppe, k);
        return a == null || b == null ? null : (w1 * a + w2 * b) / (w1 + w2);
      });
      return growthOn(mix, lo, hi, after);
    }
    if (m.key === "enroll") {
      // Each district's change over the years both have, so the figure covers the years it's labeled with
      const e1 = endsOn(r1.enroll, lo, hi);
      const e2 = endsOn(r2.enroll, lo, hi);
      if (!e1 || !e2) return null;
      const a = Math.max(e1[0], e2[0]);
      const b = Math.min(e1[1], e2[1]);
      const ends = [get(r1.enroll, a), get(r2.enroll, a), get(r1.enroll, b), get(r2.enroll, b)];
      if (a >= b || ends.some((v) => !(v != null && v > 0))) return null;
      const c1 = ends[2]! / ends[0]! - 1;
      const c2 = ends[3]! / ends[1]! - 1;
      return [round((w1 * c1 + w2 * c2) / (w1 + w2), 4), S!.years[a], S!.years[b]];
    }
    if (m.key === "above" || m.key === "aid") {
      // Each needs only its own figure and the requirement: aid can be had in a year above-required wasn't reported
      const i = yi(y.to);
      const [v1, q1, v2, q2] = [r1, r2].flatMap((r) => [get(r[m.key], i), get(r.req, i)]);
      if ([v1, q1, v2, q2].some((v) => v == null)) return null;
      const req = w1 * q1! + w2 * q2!;
      if (!req) return null;
      return [round((w1 * v1! + w2 * v2!) / req, 4), y.to];
    }
    return null;
  }
  /** The years a measure has on this layer, first to last */
  function yearsOf(m: Measure, onTowns: boolean): number[] {
    if (!S || !m.years) return [];
    let lo = Infinity;
    let hi = -1;
    for (const row of Object.values(onTowns ? S.towns : S.districts)) {
      const a = row[m.key];
      if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        if (a[i] == null) continue;
        lo = Math.min(lo, i);
        hi = Math.max(hi, i);
      }
    }
    return hi >= lo ? S.years.slice(lo, hi + 1) : [];
  }
  /** Fewest years between a change's two ends: a trend needs three values, which property value, set every
   * other year, has only across four */
  const minSpan = (m: Measure) => (m.key === "eqv" ? 4 : m.dollars ? 2 : 1);
  const selKey = (m: Measure) => `${layer}:${m.key}`;
  function sel(m: Measure, ys: number[]): Yrs {
    const c = chosen.get(selKey(m));
    if (c && ys.includes(c.from) && ys.includes(c.to)) return c;
    const last = ys[ys.length - 1];
    return m.years === "range" ? { from: ys[0], to: last } : { from: last, to: last };
  }

  // ---- Playing a level's years: one a step, first to latest ----
  let timer: ReturnType<typeof setInterval> | null = null;
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    play.textContent = "▶︎ Play";
    play.setAttribute("aria-pressed", "false");
  }
  stop();
  play.addEventListener("click", () => {
    if (timer) return stop();
    const m = measureNow();
    const ys = yearsOf(m, layer === "towns");
    if (ys.length < 2) return;
    // From the start, unless it's partway through
    if (sel(m, ys).to >= ys[ys.length - 1]) chosen.set(selKey(m), { from: ys[0], to: ys[0] });
    play.textContent = "❚❚︎ Pause";
    play.setAttribute("aria-pressed", "true");
    draw();
    timer = setInterval(() => {
      const k = ys.indexOf(sel(m, ys).to);
      if (k < 0 || k >= ys.length - 1) return stop();
      chosen.set(selKey(m), { from: ys[k + 1], to: ys[k + 1] });
      if (k + 1 >= ys.length - 1) stop();
      draw();
    }, PLAY_MS);
  });
  fromIn.addEventListener("input", () => {
    const m = measureNow();
    const ys = yearsOf(m, layer === "towns");
    const b = ys.indexOf(sel(m, ys).to);
    const a = Math.max(0, Math.min(Number(fromIn.value), b - minSpan(m)));
    fromIn.value = String(a);
    chosen.set(selKey(m), { from: ys[a], to: ys[b] });
    draw();
  });
  toIn.addEventListener("input", () => {
    const m = measureNow();
    const ys = yearsOf(m, layer === "towns");
    if (m.years === "range") {
      const a = ys.indexOf(sel(m, ys).from);
      const b = Math.min(ys.length - 1, Math.max(Number(toIn.value), a + minSpan(m)));
      toIn.value = String(b);
      chosen.set(selKey(m), { from: ys[a], to: ys[b] });
    } else {
      stop();
      chosen.set(selKey(m), { from: ys[Number(toIn.value)], to: ys[Number(toIn.value)] });
    }
    draw();
  });
  const measureNow = () => (layer === "towns" ? TOWN_MEASURES.find((m) => m.key === townKey)!
    : DISTRICT_MEASURES.find((m) => m.key === districtKey)!);

  /** The year controls, for the measure shown: what they offer, and where they sit */
  function showYears(m: Measure, ys: number[], y: Yrs | null) {
    if (m.kind === "type" || (!y && m.years)) {
      // Community type has no year; a measure waiting for its years shows none yet
      yearBox.hidden = true;
      return;
    }
    yearBox.hidden = false;
    const single = !m.years;
    track.hidden = single || ys.length < 2;
    play.hidden = m.years !== "year" || ys.length < 2;
    fromIn.hidden = m.years !== "range";
    yearBox.classList.toggle("is-range", m.years === "range");
    if (single) {
      // One year only: income, from one year's tax returns
      yearLabel.textContent = "Year";
      yearOut.textContent = m.fifths ? `${meta.fifths.year} tax returns` : "";
      return;
    }
    const a = ys.indexOf(y!.from);
    const b = ys.indexOf(y!.to);
    yearLabel.textContent = m.years === "range" ? "Years" : "Year";
    for (const inp of [fromIn, toIn]) inp.max = String(ys.length - 1);
    fromIn.value = String(a);
    toIn.value = String(b);
    fromIn.setAttribute("aria-valuetext", `FY${y!.from}`);
    toIn.setAttribute("aria-valuetext", `FY${y!.to}`);
    toIn.setAttribute("aria-label", m.years === "range" ? "Last year" : "Year");
    const n = Math.max(1, ys.length - 1);
    track.style.setProperty("--a", String(m.years === "range" ? a / n : 0));
    track.style.setProperty("--b", String(b / n));
    yearOut.textContent = m.years === "range" ? `FY${y!.from}–FY${y!.to}` : `FY${y!.to}`;
    play.setAttribute("aria-label", `${timer ? "Pause" : "Play"} the years, FY${ys[0]} to FY${ys[ys.length - 1]}`);
  }

  // What a town shows: its own value, or its district's
  let current: { measure: Measure; districtOf: (t: MapTown) => string | null; value: (t: MapTown) => Val | null; c: number[];
    combinedAt: (t: MapTown) => boolean; kindOf?: (t: MapTown) => Kind | null } | null = null;

  function draw() {
    const onTowns = layer === "towns";
    layerSeg.set(layer);
    gradeSeg.set(grades);
    gradeSeg.box.hidden = onTowns;
    const list = onTowns ? TOWN_MEASURES : DISTRICT_MEASURES;
    measureSel.replaceChildren(...list.map((m) => new Option(m.label, m.key)));
    measureSel.value = onTowns ? townKey : districtKey;
    const measure = list.find((m) => m.key === measureSel.value)!;
    // The years: from the series once they're here, for a measure that has them
    const bySeries = !!S && !!measure.years;
    const ys = yearsOf(measure, onTowns);
    const y = bySeries && ys.length ? sel(measure, ys) : null;
    showYears(measure, ys, y);
    // Growth in dollars, before or after inflation
    const real = opts.real();
    dollarSeg.set(real ? "real" : "nominal");
    dollarSeg.box.classList.toggle("is-idle", !measure.dollars);
    dollarSeg.box.title = measure.dollars ? "" : "This measure isn't growth in dollars, so inflation doesn't change it";
    dollarSeg.box.querySelectorAll("button").forEach((b) => (b.disabled = !measure.dollars));
    // Growth in dollars comes as [after inflation, first year, last year, before inflation], each its own trend
    const inMode = (v: Val | null | undefined, after: boolean): Val | null => {
      if (!v) return null;
      if (!measure.dollars) return v;
      return after || v.length < 4 ? v.slice(0, 3) : [v[3], v[1], v[2]];
    };
    // All grades: a town with one district takes it; a town split between two takes the two combined
    const combinedAt = (t: MapTown) => !onTowns && grades === "all" && !!t.elem && t.elem !== t.high;
    const districtOf = (t: MapTown) => (onTowns || combinedAt(t) ? null : grades === "high" ? t.high : t.elem);
    /** A district's own value: over the years chosen, once they're here, or as map.json has it */
    const districtVal = (d: string, after: boolean, yy: Yrs | null): Val | null =>
      (bySeries ? fromRow(measure, S!.districts[d], yy!, after) : inMode(data.districts[d]?.v[measure.key], after));
    const valueIn = (t: MapTown, after: boolean, yy: Yrs | null): Val | null => {
      if (bySeries) {
        if (onTowns) return fromRow(measure, S!.towns[t.id], yy!, after);
        if (combinedAt(t)) {
          // Density isn't combined, and a town without the two weights takes its own district's
          return measure.key === "density" || !S!.towns[t.id]?.w ? districtVal(t.elem!, after, yy) : combinedRow(measure, t, yy!, after);
        }
        const d = districtOf(t);
        return d ? districtVal(d, after, yy) : null;
      }
      if (onTowns) return inMode(t.v[measure.key], after);
      // Density isn't combined: a split town takes its own district's
      if (combinedAt(t)) return inMode(t.all?.[measure.key] ?? data.districts[t.elem!]?.v[measure.key], after);
      const d = districtOf(t);
      return d ? inMode(data.districts[d]?.v[measure.key], after) : null;
    };
    const value = (t: MapTown) => valueIn(t, real, y);
    // Community type: each town its own, or its district's (a town split between two takes its own district's)
    if (measure.kind === "type") {
      drawTypes(measure, onTowns, (t) => (onTowns ? t.ct ?? null
        : data.districts[(combinedAt(t) ? t.elem : districtOf(t)) ?? ""]?.ct ?? null), districtOf, combinedAt);
      return;
    }
    // Each district counts once, however many towns it covers; with all grades, each town counts
    const byTown = onTowns || grades === "all";
    const shownDistricts = [...new Set(data.towns.map(districtOf).filter((d): d is string => !!d))];
    const unitsIn = (after: boolean, yy: Yrs | null) => (byTown ? data.towns.map((t) => valueIn(t, after, yy)).filter(Boolean) as Val[]
      : shownDistricts.map((d) => districtVal(d, after, yy)).filter(Boolean) as Val[]);
    const units = unitsIn(real, y);
    const values = units.map((u) => u[0]);
    // A level's classes are cut on every year's values together, so a color holds one range in every year and a
    // town that changes color as the years play has moved between ranges. Growth in dollars: the classes are
    // cut on its values before and after inflation together, so both share one set of ranges and the Dollars
    // switch moves towns between them, as inflation would.
    const pooled = bySeries && measure.years === "year" ? ys.flatMap((yr) => unitsIn(real, { from: yr, to: yr }).map((u) => u[0])) : values;
    const c = (measure.fifths ? meta.fifths[measure.fifths] : null) ?? measure.cuts
      ?? (measure.dollars ? growthCuts([...unitsIn(true, y), ...unitsIn(false, y)].map((u) => u[0])) : cuts(measure.kind, pooled));
    const classOfV = (v: number) => (measure.over ? c.filter((x) => v > x).length : classOf(v, c));
    const colors = measure.dollars ? GROWTH : measure.kind === "change" ? DIVERGING : SEQUENTIAL;
    current = { measure, districtOf, value, c, combinedAt };
    let none = 0;
    for (const t of data.towns) {
      const v = value(t);
      if (!v) none++;
      paths.get(t.id)!.setAttribute("fill", v ? colors[classOfV(v[0])] : NO_DATA);
    }

    // What it shows, and how the towns or districts split
    const what = byTown ? "towns" : "districts";
    measureTitle.textContent = measure.label;
    const yy = y ?? { from: meta.start, to: measure.key === "cap_hh" ? meta.cap_fy : meta.latest };
    about.replaceChildren(measure.about(meta, real, yy));
    if (measure.dollars) about.append(" ", trendHelp());
    const up = values.filter((v) => v > 0).length;
    const n = values.length;
    about.append(" " + (measure.split ? measure.split(up, n - up, n)
      : measure.kind === "change" ? (up === n ? `In all ${n} ${what}, ${measure.subject} grew` : up === 0 ? `In none of the ${n} ${what} did ${measure.subject} grow`
        : `In ${up} of ${n} ${what}, ${measure.subject} grew`) + (measure.dollars && real ? " faster than prices" : "") +
        (up === n || up === 0 ? "." : `; in the other ${n - up}, it did not.`)
      : `The median across ${n} ${what} is ${measure.fmt(quantile(values, 0.5))}${measure.unit ?? ""}.`));
    if (bySeries && measure.years === "year" && ys.length > 1) {
      about.append(` Each color covers the same range in every year, FY${ys[0]} to FY${ys[ys.length - 1]}.`);
    }
    if (!onTowns) about.append(gradeNote(measure));

    // Legend: each class's range, then the gray for none
    const fifthWords = ["Lowest fifth", "Second", "Middle", "Fourth", "Highest fifth"];
    const label = (k: number) => measure.fifths ? `${fifthWords[k]}: ${k === 0 ? `under ${measure.short(c[0])}`
      : k === 4 ? `${measure.short(c[3])} and up` : `${measure.short(c[k - 1])} to ${measure.short(c[k] - 1)}`}`
      : measure.classes?.[k] ?? (k === 0 ? (measure.dollars ? "Down, below 0%" : `Below ${measure.short(c[0])}`) : k === 4
      ? `${measure.short(c[3])} and up` : `${measure.short(c[k - 1])} to ${measure.short(c[k])}`);
    legend.replaceChildren(...colors.map((col, k) => {
      const li = el("li");
      const sw = el("span", "map-swatch");
      sw.style.background = col;
      li.append(sw, el("span", undefined, label(k)));
      return li;
    }), ...(none ? [(() => {
      const li = el("li");
      li.append(el("span", "map-swatch nodata"), el("span", undefined, onTowns ? "No data" : "No district of its own, or no data"));
      return li;
    })()] : []));
    const when = y ? (measure.years === "range" ? `, FY${y.from} to FY${y.to}` : `, FY${y.to}`) : "";
    svg.setAttribute("aria-label", `Map of Massachusetts's 351 cities and towns, colored by ${measure.label.toLowerCase()}${when}` +
      (onTowns ? "." : ` of the ${{ elem: "district serving their elementary grades", high: "district serving their secondary grades",
        all: "districts serving all their grades" }[grades]}.`) + " The table below has every value.");

    // The table: highest first
    const rows = byTown
      ? data.towns.filter((t) => value(t)).map((t) => ({ name: onTowns || schoolsOf(t) === t.name ? t.name : `${t.name} (${schoolsOf(t)})`,
        v: value(t)! }))
      : shownDistricts.map((d) => ({ name: data.districts[d]?.name ?? d, v: districtVal(d, real, y) }))
        .filter((r): r is { name: string; v: Val } => !!r.v);
    rows.sort((a, b) => b.v[0] - a.v[0]);
    tableSum.textContent = `Every ${what.slice(0, -1)}, highest first`;
    const t = el("table");
    const hr = t.createTHead().insertRow();
    hr.append(el("th", undefined, onTowns ? "Town" : byTown ? "Town (its districts)" : "District"), el("th", "num", measure.label),
      el("th", undefined, "Years"));
    const tb = t.createTBody();
    for (const r of rows) {
      const tr = tb.insertRow();
      const th = el("th", undefined, r.name);
      th.scope = "row";
      tr.append(th, el("td", "num", measure.fmt(r.v[0])), el("td", undefined, r.v.length > 2 ? `FY${r.v[1]}–FY${r.v[2]}` : `FY${r.v[1]}`));
    }
    tableHolder.replaceChildren(t);
    // Playing, the pointer's town keeps its outline and its figure follows the year
    if (!timer) {
      tip.hidden = true;
      unlift();
    } else if (hovered && lastPointer) showTip(lastPointer);
  }

  /** A "?" that explains the trend, on hover or focus */
  function trendHelp() {
    const h = el("span", "cw-help wide", "?");
    h.tabIndex = 0;
    h.setAttribute("role", "note");
    h.setAttribute("aria-label", TREND_NOTE);
    h.dataset.tip = TREND_NOTE;
    return h;
  }
  /** What each town shows, for a district measure */
  function gradeNote(measure: Measure) {
    const own = " Each town shows the district that teaches its elementary grades.";
    return {
      elem: own,
      high: " Each town shows the district that teaches its secondary grades, which is its regional district if it belongs to one.",
      all: measure.key === "density" || measure.kind === "type"
        ? " A town that sends its elementary and secondary pupils to different districts shows the district that teaches its elementary grades."
        : " A town that sends its elementary and secondary pupils to different districts shows the two districts combined, " +
          "weighted by how many of the town's pupils each one teaches.",
    }[grades];
  }

  /** The community type view: four colors, a count of each, and the table by type */
  function drawTypes(measure: Measure, onTowns: boolean, kindOf: (t: MapTown) => Kind | null,
    districtOf: (t: MapTown) => string | null, combinedAt: (t: MapTown) => boolean) {
    current = { measure, districtOf, value: () => null, c: [], combinedAt, kindOf };
    for (const t of data.towns) {
      const k = kindOf(t);
      paths.get(t.id)!.setAttribute("fill", k ? KIND_COLOR[k] : NO_DATA);
    }
    // Counted once each: towns, or districts
    const units = onTowns ? data.towns.map((t) => ({ name: t.name, k: kindOf(t) }))
      : [...new Set(data.towns.map((t) => (combinedAt(t) ? t.elem : districtOf(t))).filter((d): d is string => !!d))]
        .map((d) => ({ name: data.districts[d]?.name ?? d, k: data.districts[d]?.ct ?? null }));
    const count = (k: Kind) => units.filter((u) => u.k === k).length;
    const what = onTowns ? "towns" : "districts";
    measureTitle.textContent = measure.label;
    about.replaceChildren(measure.about(meta, false, { from: meta.latest, to: meta.latest }));
    if (!onTowns) about.append(gradeNote(measure));
    legend.replaceChildren(...KINDS.map((k) => {
      const li = el("li");
      const sw = el("span", "map-swatch");
      sw.style.background = KIND_COLOR[k];
      li.append(sw, el("span", undefined, `${KIND_NAME[k]} (${count(k)})`));
      return li;
    }), ...(data.towns.some((t) => !kindOf(t)) ? [(() => {
      const li = el("li");
      li.append(el("span", "map-swatch nodata"), el("span", undefined, "No district of its own"));
      return li;
    })()] : []));
    svg.setAttribute("aria-label", `Map of Massachusetts's 351 cities and towns, colored by ${onTowns ? "their" : "their districts'"} ` +
      "community type. The table below lists each.");
    tableSum.textContent = `Every ${what.slice(0, -1)}, by type`;
    const t = el("table");
    t.createTHead().insertRow().append(el("th", undefined, onTowns ? "Town" : "District"), el("th", undefined, "Community type"));
    const tb = t.createTBody();
    for (const u of [...units].sort((a, b) => KINDS.indexOf(b.k!) - KINDS.indexOf(a.k!) || a.name.localeCompare(b.name))) {
      const tr = tb.insertRow();
      const th = el("th", undefined, u.name);
      th.scope = "row";
      tr.append(th, el("td", undefined, u.k ? KIND_NAME[u.k] : "–"));
    }
    tableHolder.replaceChildren(t);
    tip.hidden = true;
    unlift();
  }

  // ---- Hover: the town, or every town of its district, outlined, with its value beside the pointer ----
  let hovered: string | null = null;
  let lastPointer: { x: number; y: number; id: string } | null = null;
  const unlift = () => {
    for (const p of [...lift.children]) shapes.append(p);
    hovered = null;
  };
  function showTip(at: { x: number; y: number; id: string }) {
    if (!current) return;
    const t = townById.get(at.id)!;
    const d = current.districtOf(t);
    const key = d ?? t.id;
    if (hovered !== key) {
      unlift();
      hovered = key;
      const same = d ? data.towns.filter((x) => current!.districtOf(x) === d) : [t];
      for (const x of same) lift.append(paths.get(x.id)!);
    }
    const v = current.value(t);
    tip.replaceChildren(el("strong", undefined, t.name));
    if (layer === "districts") {
      tip.append(el("div", undefined, current.combinedAt(t) ? `${schoolsOf(t)}, combined` : d ? `${data.districts[d].name} district`
        : "No district of its own"));
    }
    const kind = current.kindOf?.(t);
    tip.append(el("div", undefined, current.measure.kind === "type" ? (kind ? KIND_NAME[kind] : "No district of its own")
      : v ? `${current.measure.fmt(v[0])}, ${v.length > 2 ? `FY${v[1]}–FY${v[2]}` : `FY${v[1]}`}` : "No data"),
      el("div", "cw-tip-hint", layer === "districts" && (d || t.elem) ? "Select to open the district" : "Select to open the town"));
    tip.hidden = false;
    const box = figure.getBoundingClientRect();
    const x = at.x - box.left;
    const y = at.y - box.top;
    tip.style.left = `${Math.min(x + 14, box.width - tip.offsetWidth - 4)}px`;
    tip.style.top = `${Math.max(0, y - tip.offsetHeight - 12)}px`;
  }
  svg.addEventListener("pointermove", (ev) => {
    const target = (ev.target as Element).closest?.("path.map-town") as SVGPathElement | null;
    if (!target || !current) {
      unlift();
      tip.hidden = true;
      lastPointer = null;
      return;
    }
    lastPointer = { x: ev.clientX, y: ev.clientY, id: target.dataset.id! };
    showTip(lastPointer);
  });
  svg.addEventListener("pointerleave", () => {
    unlift();
    tip.hidden = true;
    lastPointer = null;
  });
  svg.addEventListener("click", (ev) => {
    const target = (ev.target as Element).closest?.("path.map-town") as SVGPathElement | null;
    if (!target || !current) return;
    const t = townById.get(target.dataset.id!)!;
    // A combined town opens its own, elementary, district; that page names the other
    const d = current.districtOf(t) ?? (layer === "districts" ? t.elem : null);
    unlift();
    tip.hidden = true;
    stop();
    if (layer === "districts" && d) opts.openDistrict(d);
    else opts.openTown(t.id);
  });

  draw();
  return {
    refresh: draw,
    setSeries(s: MapSeries) {
      S = s;
      draw();
    },
  };
}
