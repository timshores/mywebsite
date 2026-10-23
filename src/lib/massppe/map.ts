// The Commonwealth tab's map: every city and town, colored by a measure of how it has changed, or
// how the school district that serves it has. Towns that share a district share its color. A
// change is shown on a diverging scale around zero (blue up, orange down, gray near none), a level
// on one blue scale, light to dark; both cut into five classes so a color reads as a range.
// Hovering names the town and its value; a click opens it, or its district, in its own tab.

import { enlargeButton } from "./enlarge";

/** [value, year] for a level; [value, first year, last year] for a change */
type Val = number[];
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

type Layer = "towns" | "districts";
type Grades = "elem" | "high" | "all";
interface Measure {
  key: string;
  label: string;
  /** "change" diverges around zero; "level" runs light to dark; "type" colors each community type */
  kind: "change" | "level" | "type";
  /** A value in full, for the tooltip and the table; and short, for the legend */
  fmt: (v: number) => string;
  short: (v: number) => string;
  /** What it measures, in a sentence or two, in nominal dollars or the latest year's */
  about: (m: MapData["meta"], real: boolean) => string;
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
}
const inDollars = (m: MapData["meta"], real: boolean) => (real ? `in FY${m.latest} dollars, after inflation` : "in nominal dollars, before inflation");
/** What the trend is, for the "?" beside a measure of growth */
const TREND_NOTE = "The trend is the straight line that best fits every year's value. Its growth is the yearly rate that " +
  "carries the line from its first year to its last. Because the line weighs every year, an unusual first or last year " +
  "moves it less than it would move growth measured from the first year's value to the last year's, and the line " +
  "doesn't always start on the first year's value.";

const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
const yearly = (v: number) => `${sign(v)}${Math.abs(v * 100).toFixed(1)}% a year`;
const yearlyShort = (v: number) => `${sign(v)}${Math.abs(v * 100).toFixed(1)}%`;
const change = (v: number) => `${sign(v)}${Math.abs(Math.round(v * 100))}%`;
const share = (v: number) => `${(v * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0)}%`;
const money = (v: number) => `${sign(v)}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
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
    unit: " residents per square mile",
    about: (m) => `Each town's population in July ${m.latest - 1}, divided by its land area. A town with fewer than 500 ` +
      "residents per square mile counts as rural.",
  },
  {
    key: "spend", label: "Spending per resident, yearly growth", kind: "change", fmt: yearly, short: yearlyShort, dollars: true,
    subject: "spending per resident",
    about: (m, real) => `How fast each town's general fund spending per resident grew each year on trend, from FY${m.start} ` +
      `to FY${m.latest}, ${inDollars(m, real)}.`,
  },
  {
    key: "pop", label: "Population change", kind: "change", fmt: change, short: change, subject: "population",
    about: (m) => `How much each town's population changed from July ${m.start - 1} to July ${m.latest - 1}.`,
  },
  {
    key: "eqv", label: "Property value per resident, yearly growth", kind: "change", fmt: yearly, short: yearlyShort, dollars: true,
    subject: "property value per resident",
    about: (m, real) => "How fast each town's equalized property value per resident grew each year on trend, from " +
      `FY${m.start} to FY${m.latest}, ${inDollars(m, real)}.`,
  },
  {
    key: "income", label: "Income per resident", kind: "level", fmt: dollars, short: dollars, fifths: "towns",
    about: (m) => `Each town's residents' income for the Chapter 70 formula, from ${m.fifths.year} state tax returns, ` +
      `divided by its population in July ${m.fifths.year}. The five colors are the income fifths, 70 or 71 towns each.`,
  },
  {
    key: "levy_room", label: "Room under the levy limit", kind: "level", fmt: share, short: share,
    about: (m) => `Each town's unused levy capacity in FY${m.latest}, as a share of its Proposition 2½ levy limit. The ` +
      "lightest towns are taxing at or near their limit.",
  },
  {
    key: "bill_income", label: "Single-family tax bill as a share of income", kind: "level", fmt: share, short: share,
    about: (m) => `The average single-family tax bill in FY${m.latest}, as a share of income per capita. College towns run ` +
      "high because their students count as residents but report little income.",
  },
  {
    key: "cap_hh", label: "The 82.5% cap: change per household with no cap", kind: "change", fmt: money, short: money,
    about: (m) => `How much more or less each town would be asked to pay toward its schools in FY${m.cap_fy} with no cap, ` +
      "per household. Today's cap saves the blue towns money and costs the orange towns money.",
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
    unit: " students per square mile",
    about: (m) => `Each district's FY${m.latest + 1} foundation enrollment, divided by the land area of its towns. DESE ` +
      "counts a district with 35 or fewer students per square mile as rural.",
  },
  {
    key: "ppe", label: "Spending per pupil, yearly growth", kind: "change", fmt: yearly, short: yearlyShort, dollars: true,
    subject: "spending per pupil",
    about: (m, real) => `How fast each district's in-district spending per pupil grew each year on trend, from FY${m.start} ` +
      `to FY${m.latest}, ${inDollars(m, real)}.`,
  },
  {
    key: "enroll", label: "Enrollment change", kind: "change", fmt: change, short: change, subject: "enrollment",
    about: (m) => `How much each district's in-district enrollment changed from FY${m.start} to FY${m.latest}.`,
  },
  {
    key: "income", label: "Income per resident of its towns", kind: "level", fmt: dollars, short: dollars, fifths: "districts",
    about: (m) => `The combined income of each district's towns for the Chapter 70 formula, from ${m.fifths.year} state ` +
      `tax returns, divided by their combined population. The five colors are the districts' income fifths.`,
  },
  {
    key: "above", label: "Spending above the requirement", kind: "level", fmt: share, short: share,
    about: (m) => `How far each district's actual net school spending in FY${m.latest} ran above the state's required ` +
      "minimum, as a share of that minimum.",
  },
  {
    key: "aid", label: "Chapter 70 aid's share of required spending", kind: "level", fmt: share, short: share,
    about: (m) => `The share of each district's required spending in FY${m.latest} that Chapter 70 aid covers. The ` +
      "district's towns pay the rest.",
  },
];

// Five classes. Change: orange for down, gray near zero, blue for up, as elsewhere in the explorer.
// Level: the palette's blue ramp, light to dark.
const DIVERGING = ["#c2541f", "#f2a77f", "#e9e6df", "#86b6ef", "#1c5cab"];
const SEQUENTIAL = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"];
// No value: hatched, so it can't pass for the gray near zero (the pattern is in each map's defs)
const NO_DATA = "url(#map-nodata)";

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

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
const SVG = "http://www.w3.org/2000/svg";

/**
 * real and setReal: the explorer's Dollars choice, which the map shares; refresh() redraws it when
 * that choice changes elsewhere.
 */
export function startMap(root: HTMLElement, data: MapData, opts: {
  openTown: (id: string) => void; openDistrict: (id: string) => void; real: () => boolean; setReal: (real: boolean) => void;
}) {
  const { meta } = data;
  let layer: Layer = "districts";
  let grades: Grades = "all";
  let townKey = TOWN_MEASURES[0].key;
  let districtKey = "above";

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
    draw();
  });
  const gradeSeg = seg("Grades", [["elem", "Elementary"], ["high", "Secondary"], ["all", "All grades"]], (v) => {
    grades = v as Grades;
    draw();
  });
  const dollarSeg = seg("Dollars", [["nominal", "Nominal"], ["real", `FY${meta.latest} dollars`]], (v) => opts.setReal(v === "real"));
  const measureWrap = el("label", "map-measure");
  const measureSel = el("select");
  measureWrap.append(el("span", undefined, "Measure"), measureSel);
  measureSel.addEventListener("change", () => {
    if (layer === "towns") townKey = measureSel.value;
    else districtKey = measureSel.value;
    draw();
  });
  controls.append(layerSeg.box, gradeSeg.box, measureWrap, dollarSeg.box);
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
    // Growth in dollars, before or after inflation
    const real = opts.real();
    dollarSeg.set(real ? "real" : "nominal");
    dollarSeg.box.classList.toggle("is-idle", !measure.dollars);
    dollarSeg.box.title = measure.dollars ? "" : "This measure isn't growth in dollars, so inflation doesn't change it";
    dollarSeg.box.querySelectorAll("button").forEach((b) => (b.disabled = !measure.dollars));
    // Growth in dollars comes as [after inflation, first year, last year, before inflation], each its own trend
    const asShown = (v: Val | null | undefined): Val | null => {
      if (!v) return null;
      if (!measure.dollars) return v;
      return real || v.length < 4 ? v.slice(0, 3) : [v[3], v[1], v[2]];
    };
    // All grades: a town with one district takes it; a town split between two takes the two combined
    const combinedAt = (t: MapTown) => !onTowns && grades === "all" && !!t.elem && t.elem !== t.high;
    const districtOf = (t: MapTown) => (onTowns || combinedAt(t) ? null : grades === "high" ? t.high : t.elem);
    const value = (t: MapTown): Val | null => {
      if (onTowns) return asShown(t.v[measure.key]);
      // Density isn't combined: a split town takes its own district's
      if (combinedAt(t)) return asShown(t.all?.[measure.key] ?? data.districts[t.elem!]?.v[measure.key]);
      const d = districtOf(t);
      return d ? asShown(data.districts[d]?.v[measure.key]) : null;
    };
    // Community type: each town its own, or its district's (a town split between two takes its own district's)
    if (measure.kind === "type") {
      drawTypes(measure, onTowns, (t) => (onTowns ? t.ct ?? null
        : data.districts[(combinedAt(t) ? t.elem : districtOf(t)) ?? ""]?.ct ?? null), districtOf, combinedAt);
      return;
    }
    // Each district counts once, however many towns it covers; with all grades, each town counts
    const byTown = onTowns || grades === "all";
    const units = byTown ? data.towns.map(value).filter(Boolean) as Val[]
      : [...new Set(data.towns.map(districtOf).filter((d): d is string => !!d))].map((d) => asShown(data.districts[d]?.v[measure.key]))
        .filter(Boolean) as Val[];
    const values = units.map((u) => u[0]);
    const c = (measure.fifths ? meta.fifths[measure.fifths] : null) ?? measure.cuts ?? cuts(measure.kind, values);
    const classOfV = (v: number) => (measure.over ? c.filter((x) => v > x).length : classOf(v, c));
    const colors = measure.kind === "change" ? DIVERGING : SEQUENTIAL;
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
    about.replaceChildren(measure.about(meta, real));
    if (measure.dollars) about.append(" ", trendHelp());
    const up = values.filter((v) => v > 0).length;
    const n = values.length;
    about.append(" " + (measure.split ? measure.split(up, n - up, n)
      : measure.kind === "change" ? (up === n ? `In all ${n} ${what}, ${measure.subject} grew` : up === 0 ? `In none of the ${n} ${what} did ${measure.subject} grow`
        : `In ${up} of ${n} ${what}, ${measure.subject} grew`) + (measure.dollars && real ? " faster than prices" : "") +
        (up === n || up === 0 ? "." : `; in the other ${n - up}, it did not.`)
      : `The median across ${n} ${what} is ${measure.fmt(quantile(values, 0.5))}${measure.unit ?? ""}.`));
    if (!onTowns) about.append(gradeNote(measure));

    // Legend: each class's range, then the gray for none
    const fifthWords = ["Lowest fifth", "Second", "Middle", "Fourth", "Highest fifth"];
    const label = (k: number) => measure.fifths ? `${fifthWords[k]}: ${k === 0 ? `under ${measure.short(c[0])}`
      : k === 4 ? `${measure.short(c[3])} and up` : `${measure.short(c[k - 1])} to ${measure.short(c[k] - 1)}`}`
      : measure.classes?.[k] ?? (k === 0 ? `Below ${measure.short(c[0])}` : k === 4
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
    svg.setAttribute("aria-label", `Map of Massachusetts's 351 cities and towns, colored by ${measure.label.toLowerCase()}` +
      (onTowns ? "." : ` of the ${{ elem: "district serving their elementary grades", high: "district serving their secondary grades",
        all: "districts serving all their grades" }[grades]}.`) + " The table below has every value.");

    // The table: highest first
    const rows = byTown
      ? data.towns.filter((t) => value(t)).map((t) => ({ name: onTowns || schoolsOf(t) === t.name ? t.name : `${t.name} (${schoolsOf(t)})`,
        v: value(t)! }))
      : [...new Set(data.towns.map(districtOf).filter((d): d is string => !!d))]
        .filter((d) => data.districts[d]?.v[measure.key]).map((d) => ({ name: data.districts[d].name, v: asShown(data.districts[d].v[measure.key])! }));
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
    tip.hidden = true;
    unlift();
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
    about.replaceChildren(measure.about(meta, false));
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
  const unlift = () => {
    for (const p of [...lift.children]) shapes.append(p);
    hovered = null;
  };
  svg.addEventListener("pointermove", (ev) => {
    const target = (ev.target as Element).closest?.("path.map-town") as SVGPathElement | null;
    if (!target || !current) {
      unlift();
      tip.hidden = true;
      return;
    }
    const t = townById.get(target.dataset.id!)!;
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
    const x = ev.clientX - box.left;
    const y = ev.clientY - box.top;
    tip.style.left = `${Math.min(x + 14, box.width - tip.offsetWidth - 4)}px`;
    tip.style.top = `${Math.max(0, y - tip.offsetHeight - 12)}px`;
  });
  svg.addEventListener("pointerleave", () => {
    unlift();
    tip.hidden = true;
  });
  svg.addEventListener("click", (ev) => {
    const target = (ev.target as Element).closest?.("path.map-town") as SVGPathElement | null;
    if (!target || !current) return;
    const t = townById.get(target.dataset.id!)!;
    // A combined town opens its own, elementary, district; that page names the other
    const d = current.districtOf(t) ?? (layer === "districts" ? t.elem : null);
    unlift();
    tip.hidden = true;
    if (layer === "districts" && d) opts.openDistrict(d);
    else opts.openTown(t.id);
  });

  draw();
  return { refresh: draw };
}
