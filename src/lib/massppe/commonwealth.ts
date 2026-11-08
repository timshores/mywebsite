// The Commonwealth tab: a gallery of scatterplots of every district in DESE's Chapter 70
// profiles. Each opens full screen, where any two measures can be set against each other
// and the factors are ranked by how closely they line up with the vertical measure.
// Data: src/data/massppe/commonwealth.json (export_explorer_data.commonwealth_data).

import { change, compact, count, pct, rho, round, signFor, usd } from "./format";
import { spearman } from "./stats";
import { pointsAtGroup, scatter, type Group, type Point } from "./scatter";
import { addStyles, capital, el, lower, modal, placeTip, svgEl, vn } from "./dom";
import { AMBER, BLUE, FIFTH_RAMP, GREEN, RED, REGION_HUES, VIOLET } from "./palette";
import type { CommunityType } from "./data";
import { checkPair, sharedParts, type Caution, type Words } from "./cautions";
import css from "./commonwealth.css?inline"; // the styles for what this module builds (#237), added as it loads (#238)

addStyles(css);

type Values = (number | null)[];

interface Row {
  org: string;
  name: string;
  id: string | null;
  type: string;
  region: string | null;
  towns: string[];
  valley: boolean;
  /** Community type: the Inner Core, the other Gateway Cities, rural, or suburban and other */
  ct?: CommunityType | null;
  /** Income fifth of the district's towns together, 1 lowest to 5 highest */
  fifth?: number | null;
  v: Record<string, Values>;
}

export interface CwData {
  meta: { years: number[]; latest: number; regions: Record<string, string>; c70_profile_date: string };
  districts: Row[];
}

/** A share in percent, a change in percent (signed), dollars, or a count */
type Unit = "pct" | "chg" | "usd" | "count";
type SourceKey = keyof typeof SOURCES;
interface Var { key: string; label: string; short: string; unit: Unit; role: "outcome" | "factor"; src: SourceKey[]; log?: boolean;
  /** The picker's group for a factor that isn't size or the towns' wealth: who the students are */
  students?: boolean }

const GATEWAY = "https://dls-gw.dor.state.ma.us/reports/rdPage.aspx?rdReport=";
// Each with the part of About the data that describes it, by id less "about-" (notes.ts)
export const SOURCES = {
  c70: { name: "DESE Chapter 70 district profiles", url: "https://www.doe.mass.edu/finance/chapter70/default.html",
    note: "chapter-70-aid-and-net-school-spending" },
  ppe: { name: "DESE per-pupil expenditures", url: "https://educationtocareer.data.mass.gov/d/er3w-dyti", note: "spending-per-pupil" },
  eqv: { name: "DLS equalized valuations", url: `${GATEWAY}PropertyTaxInformation.EQV.EQV`, note: "equalized-valuation-eqv" },
  la4: { name: "DLS LA-4 assessed values", url: `${GATEWAY}PropertyTaxInformation.LA4.Parcel_counts_vals`, note: "property" },
  bill: { name: "DLS average single-family tax bill", url: `${GATEWAY}AverageSingleTaxBill.SingleFamTaxBill_wRange`, note: "property" },
  pop: { name: "Census Bureau population estimates", url: "https://www.census.gov/programs-surveys/popest.html", note: "population-estimates" },
  students: { name: "DESE enrollment by selected populations", url: "https://educationtocareer.data.mass.gov/d/t8td-gens",
    note: "students" },
  sped: { name: "DESE special education spending (RADAR)", url: "https://www.doe.mass.edu/research/radar/", note: "special-education" },
  budgets: { name: "DESE net school spending compliance summaries", url: "https://www.doe.mass.edu/finance/chapter70/compliance.html",
    note: "budgets" },
};

// School measures first (the usual vertical axis), then size and the towns' wealth
const VARS: Var[] = [
  { key: "nss_pct_fb", label: "Actual net school spending as a share of the foundation budget", short: "spending as % of foundation", unit: "pct", role: "outcome", src: ["c70"] },
  { key: "nss_pct_req", label: "Actual net school spending as a share of required", short: "spending as % of required", unit: "pct", role: "outcome", src: ["c70"] },
  { key: "nss_pfe", label: "Actual net school spending per foundation pupil", short: "net school spending per pupil", unit: "usd", role: "outcome", src: ["c70"] },
  { key: "above_pfe", label: "Spending above required per foundation pupil", short: "spending above required per pupil", unit: "usd", role: "outcome", src: ["c70"] },
  { key: "ppe", label: "In-district spending per pupil", short: "spending per pupil", unit: "usd", role: "outcome", src: ["ppe"] },
  { key: "aid_pfe", label: "Chapter 70 aid per foundation pupil", short: "Chapter 70 aid per pupil", unit: "usd", role: "outcome", src: ["c70"] },
  { key: "aid_share", label: "Chapter 70 aid as a share of the foundation budget", short: "aid as % of foundation", unit: "pct", role: "outcome", src: ["c70"] },
  { key: "rlc_pfe", label: "Required local contribution per foundation pupil", short: "required local contribution per pupil", unit: "usd", role: "outcome", src: ["c70"] },
  { key: "ood_pp", label: "Spending per out-of-district pupil", short: "spending per out-of-district pupil", unit: "usd", role: "outcome", src: ["ppe"], log: true },
  { key: "sped_share", label: "Special education's share of spending", short: "special education's share", unit: "pct", role: "outcome", src: ["sped"] },
  { key: "gap", label: "Actual vs. budget, net school spending", short: "actual vs. budget", unit: "chg", role: "outcome", src: ["budgets"] },
  { key: "fe", label: "Foundation enrollment", short: "foundation enrollment", unit: "count", role: "factor", src: ["c70"], log: true },
  { key: "fte", label: "In-district FTE pupils", short: "in-district pupils", unit: "count", role: "factor", src: ["ppe"], log: true },
  { key: "eqv_res", label: "Equalized property value per resident of its towns", short: "property value per resident (EQV)", unit: "usd", role: "factor", src: ["eqv", "pop"], log: true },
  { key: "av_res", label: "Assessed property value per resident of its towns", short: "assessed value per resident", unit: "usd", role: "factor", src: ["la4", "pop"], log: true },
  { key: "income_pc", label: "Income per capita of its towns", short: "income per capita", unit: "usd", role: "factor", src: ["bill", "pop"], log: true },
  { key: "sf_bill", label: "Average single-family tax bill in its towns", short: "single-family tax bill", unit: "usd", role: "factor", src: ["bill"] },
  { key: "bill_income", label: "Single-family tax bill as a share of income per capita", short: "tax bill as % of income", unit: "pct", role: "factor", src: ["bill", "pop"] },
  { key: "res_share", label: "Residential share of its towns' assessed value", short: "residential share of value", unit: "pct", role: "factor", src: ["la4"] },
  { key: "low_income", label: "Share of students who are low income (FY2022 on)", short: "low-income students", unit: "pct", role: "factor", src: ["students"], students: true },
  { key: "el", label: "Share of students who are English learners", short: "English learners", unit: "pct", role: "factor", src: ["students"], students: true },
  { key: "swd", label: "Share of students with disabilities", short: "students with disabilities", unit: "pct", role: "factor", src: ["students"], students: true },
  { key: "soc", label: "Share of students of color", short: "students of color", unit: "pct", role: "factor", src: ["students"], students: true },
];
const VAR = new Map(VARS.map((v) => [v.key, v]));

// What each measure counts, which marks a pair that lines up partly by definition, and the cautions for a pair are in
// cautions.ts (#238)
const PAPER = "https://pmc.ncbi.nlm.nih.gov/articles/PMC5079093/";
const CAUSATION = "https://en.wikipedia.org/wiki/Correlation_does_not_imply_causation";

// Highlights: the first is the Amherst-Pelham region against the rest of the Connecticut
// River Valley (Franklin, Hampshire and Hampden counties), as in the plot this tab began with
const AP = new Set(["amherst", "pelham", "shutesbury", "leverett", "amherst-pelham"]);
// The regions as the data names them, west to east, and as the map labels them
const REGION_KEYS: [string, string, string][] = [["west", "Western", "Western MA"], ["central", "Central", "Central MA"],
  ["northeast", "Northeast", "Northeast MA"], ["metro-west", "Metro West", "Metro West"], ["southeast", "Southeast", "Southeast MA"],
  ["boston", "Boston", "Boston area"]];
const OTHER: Group = { label: "Other Massachusetts districts", color: "#a9c4e8", shape: "circle", z: 1 };
const HIGHLIGHTS: Record<string, { label: string; groups: Record<string, Group>; of: (d: Row) => string; labels: Set<string> }> = {
  none: { label: "None", groups: { other: { ...OTHER, label: "Massachusetts districts", color: "#6f8fc4" } }, of: () => "other", labels: new Set() },
  ap: {
    label: "Amherst-Pelham and the Valley",
    groups: {
      ap: { label: "Amherst-Pelham four towns", color: "#b65c3d", shape: "triangle", z: 3 },
      valley: { label: "Other Connecticut River Valley districts", color: AMBER, shape: "square", z: 2 },
      other: OTHER,
    },
    of: (d) => (d.id && AP.has(d.id) ? "ap" : d.valley ? "valley" : "other"),
    labels: new Set([...AP, "northampton", "greenfield", "springfield"]),
  },
  // Four types, distinct in hue and, for the pair colorblind readers find closest, in shape
  type: {
    label: "Community type",
    groups: {
      core: { label: "Inner Core", color: RED, shape: "triangle", z: 4 },
      gateway: { label: "Gateway Cities outside the Inner Core", color: AMBER, shape: "square", z: 3 },
      suburban: { label: "Suburban and other", color: BLUE, shape: "circle", z: 1 },
      rural: { label: "Rural", color: GREEN, shape: "circle", z: 2 },
      other: { ...OTHER, label: "Vocational and technical" },
      former: { ...OTHER, color: "#b5b0a5", label: "Districts since merged or closed" },
    },
    // Only traditional districts have a community type or an income fifth: the vocational ones have neither, and
    // nor do the traditional ones the explorer no longer lists, since merged or closed (Acton, Chatham; #242). The
    // plots have no charter schools: DESE's Chapter 70 profiles don't include them.
    of: (d) => d.ct ?? (d.type === "vocational" ? "other" : "former"),
    labels: new Set(),
  },
  // The fifths in order, one blue ramp from the lowest incomes (lightest) to the highest (darkest)
  fifth: {
    label: "Income fifth",
    groups: {
      f5: { label: "Highest income fifth", color: FIFTH_RAMP[4], shape: "circle", z: 5 },
      f4: { label: "Fourth", color: FIFTH_RAMP[3], shape: "circle", z: 4 },
      f3: { label: "Middle", color: FIFTH_RAMP[2], shape: "circle", z: 3 },
      f2: { label: "Second", color: FIFTH_RAMP[1], shape: "circle", z: 2 },
      f1: { label: "Lowest income fifth", color: FIFTH_RAMP[0], shape: "circle", z: 1 },
      other: { ...OTHER, color: "#d6d2c8", label: "Vocational and technical" },
      former: { ...OTHER, color: "#b5b0a5", label: "Districts since merged or closed" },
    },
    of: (d) => (d.fifth ? `f${d.fifth}` : d.type === "vocational" ? "other" : "former"),
    labels: new Set(),
  },
  // Each region in its hue on the map (palette.ts REGION_HUES), the shape changing from each to the
  // next; the regional vocational districts and a few others have no region in DESE's list
  region: {
    label: "Region",
    groups: Object.fromEntries([
      ...REGION_KEYS.map(([k, , label], i) => [k, { label, color: REGION_HUES[i], shape: (["circle", "square", "triangle"] as const)[i % 3], z: 2 }]),
      ["none", { label: "No region listed", color: "#b5b0a5", shape: "circle", z: 1 }],
    ]),
    of: (d) => REGION_KEYS.find(([, r]) => r === d.region)?.[0] ?? "none",
    labels: new Set(),
  },
  // A district of one town's own, a regional academic district, or a vocational one (with Northampton-Smith, a
  // town's agricultural school)
  district: {
    label: "District type",
    groups: {
      voc: { label: "Vocational and technical", color: VIOLET, shape: "triangle", z: 3 },
      regional: { label: "Regional academic", color: AMBER, shape: "square", z: 2 },
      local: { label: "One town's own", color: BLUE, shape: "circle", z: 1 },
    },
    of: (d) => (d.type === "vocational" ? "voc" : d.towns.length > 1 ? "regional" : "local"),
    labels: new Set(),
  },
};
/** Highlights since renamed, so a link to the old name still opens its successor */
const HL_RENAMED: Record<string, string> = { western: "region", vocational: "district" };
const DEFAULT_HL = "none";

// Left out unless asked for, as in the original plot: a very large district, a very small
// one with very high spending, and districts too small for their ratios to mean much
const OMIT_NAMES = new Set(["Boston", "Provincetown"]);
const MIN_FE = 20;

/** A blurb marks the measures it names with *stars*, shown bold */
interface Preset { id: string; title: string; blurb: string; y: string; x: string; log: boolean }
// The gallery shows only the strongest pairs with the least risk of misleading. Of every school measure
// set against a measure of size or the towns' wealth in FY2025, these have ρ of 0.4 or more and no
// caution but shared towns, which every wealth measure carries (most districts share towns with
// another); near-duplicates are left to the picker. Pairs with no caution at all are weak (|ρ| ≤ 0.35),
// and the formula's own (the required contribution or aid against property or income) count the same
// thing. Of the students and spending measures (#207), two more pairs pass the same test in FY2025: spending
// against the requirement and the low-income share (ρ −0.53), and students of color and enrollment (+0.56, no
// caution at all). Strong pairs that don't, left to the picker: payments per out-of-district pupil against income
// or low income (uneven spread, a few districts paying several hundred thousand dollars a pupil), English learners
// against enrollment (uneven spread), aid against the low-income share (+0.74, the formula's own again), and students
// of color against English learners (+0.80, uneven spread; a log scale clears it in FY2025 only by leaving out the 14
// districts with none, and many English learners are students of color too, an overlap the shared-parts check can't
// see; #232).
const PRESETS: Preset[] = [
  {
    id: "income", title: "Spending and income", y: "nss_pct_req", x: "income_pc", log: true,
    blurb: "*Spending as a share of the requirement* against *income per capita* of each district's towns. Districts " +
      "in towns with higher incomes tend to spend further above the state's minimum.",
  },
  {
    id: "bill", title: "Spending and the tax bill", y: "nss_pct_req", x: "sf_bill", log: false,
    blurb: "*Spending as a share of the requirement* against the *average single-family tax bill* in its towns. " +
      "Districts that spend further above the minimum tend to be in towns with bigger tax bills.",
  },
  {
    id: "property", title: "Spending and property wealth", y: "nss_pfe", x: "eqv_res", log: true,
    blurb: "*Net school spending per pupil* against *property value per resident* of each district's towns. " +
      "Districts in towns with more property per resident tend to spend more per pupil.",
  },
  {
    id: "low-income", title: "Spending and low-income students", y: "nss_pct_req", x: "low_income", log: false,
    blurb: "*Spending as a share of the requirement* against the *share of students who are low income*. Districts " +
      "with more low-income students tend to spend closer to the state's minimum.",
  },
  {
    id: "students-of-color", title: "Students of color and size", y: "soc", x: "fe", log: true,
    blurb: "The *share of students of color* against *foundation enrollment*. Larger districts tend to have more " +
      "students of color.",
  },
];

/** Text with its *starred* measure names in bold */
const starred = (s: string) => s.split("*").map((part, i) => (i % 2 ? vn(part) : part));
type Rich = (string | Node)[];
/** A caution's words, its measures' names in bold; and the same as plain text, for a title */
const rich = (w: Words): Rich => w.map((x) => (typeof x === "string" ? x : vn(x.v)));
const plain = (w: Words) => w.map((x) => (typeof x === "string" ? x : x.v)).join("");
// Each unit's figures as format.ts writes them (#237): a share to a tenth of a percent, a change signed, dollars and
// counts whole. An axis's ticks are round numbers, with a decimal only where a tick needs one.
const fmt = (u: Unit, v: number) => (u === "pct" ? pct(v) : u === "chg" ? change(v) : u === "usd" ? usd(v) : count(v));
const axisFmt = (u: Unit) => (v: number) => {
  if (u === "usd" || u === "count") return compact(v, u === "usd" ? "$" : "");
  const s = String(Math.abs(round(v * 100, 1)));
  return `${signFor(v, s, u === "chg")}${s}%`;
};
/** The element, holding text and the nodes among it */
function withParts<T extends HTMLElement>(node: T, parts: Rich): T {
  node.append(...parts);
  return node;
}

interface View { preset: string | null; y: string; x: string; fy: number; log: boolean; all: boolean; hl: string; find: string | null;
  /** The highlight's groups picked out from its legend, each with its own trend */
  focus?: string[] }

// ---- What a plot shows, from the data alone: the two below read nothing of the page, so they sit out here, taking
// the data, rather than in startCommonwealth's closure (#238) ----

/** The districts with both measures in a year, less the omitted ones unless all are asked for, and less those a
 * log scale can't place (offScale: how many, and whether any are below zero). */
function pointsFor(data: CwData, v: Pick<View, "x" | "y" | "fy" | "log" | "all" | "hl" | "find">) {
  const i = data.meta.years.indexOf(v.fy);
  const hl = HIGHLIGHTS[v.hl] ?? HIGHLIGHTS[DEFAULT_HL];
  const pts: Point[] = [];
  const rows: Row[] = [];
  const offScale = { n: 0, below: false };
  // Districts that ran schools that year (they have foundation enrollment then) but lack one of the two figures, as
  // when DESE hasn't reported actual net school spending: left out, and counted for the caption (#242)
  let missing = 0;
  for (const d of data.districts) {
    const x = d.v[v.x]?.[i];
    const y = d.v[v.y]?.[i];
    if (!v.all && (OMIT_NAMES.has(d.name) || (d.v.fe[i] ?? 0) < MIN_FE)) continue;
    if (x == null || y == null) {
      if (d.v.fe[i] != null) missing++;
      continue;
    }
    if (v.log && x <= 0) {
      offScale.n++;
      offScale.below ||= x < 0;
      continue;
    }
    pts.push({ x, y, id: d.id ?? d.org, name: d.name, group: hl.of(d),
      label: (d.id != null && hl.labels.has(d.id)) || d.org === v.find });
    rows.push(d);
  }
  return { pts, rows, hl, offScale, missing };
}

/** Spearman's rho between the vertical measure and every other measure, closest first;
 * measures without data for the year come last. Each is taken on the districts its plot would show: the one across
 * now on the scale it has, the others on the scale they open with, so a log scale leaves out its zeros here too. */
function ranking(data: CwData, v: View) {
  const i = data.meta.years.indexOf(v.fy);
  const others = VARS.filter((o) => o.key !== v.y);
  return others.map((o) => {
    const log = o.key === v.x ? v.log : !!o.log;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const d of data.districts) {
      const x = d.v[o.key]?.[i];
      const y = d.v[v.y]?.[i];
      if (x == null || y == null || (log && x <= 0)) continue;
      if (!v.all && (OMIT_NAMES.has(d.name) || (d.v.fe[i] ?? 0) < MIN_FE)) continue;
      xs.push(x);
      ys.push(y);
    }
    return { v: o, r: spearman(xs, ys), n: xs.length };
  }).sort((a, b) => (b.r == null ? -1 : Math.abs(b.r)) - (a.r == null ? -1 : Math.abs(a.r)));
}
type Ranked = ReturnType<typeof ranking>;

export function startCommonwealth(root: HTMLElement, data: CwData, opts: {
  openDistrict: (id: string) => void;
  /** "About the data:" and the parts named, linked */
  about: (parts: string[]) => HTMLElement | null;
}) {
  const years = data.meta.years;
  const latest = data.meta.latest;

  // ---- Gallery ----
  const gallery = el("div", "cw-gallery");
  for (const p of PRESETS) {
    // The gallery's rule, tested on the data each time it's drawn (#242: it had been checked by hand, once): ρ at least
    // 0.4 from zero, and no caution but Shared towns. A plot that fails it stays reachable by its link.
    const tested = pointsFor(data, { x: p.x, y: p.y, fy: latest, log: p.log, all: false, hl: DEFAULT_HL, find: null });
    const r = spearman(tested.pts.map((q) => q.x), tested.pts.map((q) => q.y));
    const cautions = checkPair({ x: p.x, y: p.y, fy: latest, log: p.log }, VAR.get(p.y)!, VAR.get(p.x)!, tested.pts, tested.rows)
      .filter((c) => c.label !== "Shared towns");
    if (r == null || Math.abs(r) < 0.4 || cautions.length) continue;
    const card = el("button", "cw-card");
    card.type = "button";
    card.setAttribute("aria-haspopup", "dialog");
    const thumb = svgEl("svg");
    thumb.setAttribute("class", "cw-thumb");
    thumb.setAttribute("aria-hidden", "true");
    const { pts, hl } = tested;
    scatter(thumb, pts, { width: 320, height: 190, logX: p.log, xFmt: String, yFmt: String, groups: hl.groups, smooth: true, mini: true });
    card.append(thumb, el("span", "cw-card-title", p.title), withParts(el("span", "cw-card-blurb"), starred(p.blurb)),
      el("span", "cw-card-axes", `${capital(VAR.get(p.y)!.short)} · ${VAR.get(p.x)!.short} · FY${latest}`));
    card.addEventListener("click", () => open({ preset: p.id, y: p.y, x: p.x, fy: latest, log: p.log, all: false, hl: DEFAULT_HL, find: null }));
    gallery.append(card);
  }
  root.replaceChildren(gallery);

  // ---- The full-screen view ----
  const dialog = el("dialog", "cw-dialog");
  dialog.setAttribute("aria-labelledby", "cw-title");
  const head = el("div", "cw-head");
  const title = el("h2", "cw-title");
  title.id = "cw-title";
  const close = el("button", "cw-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  const aboutBtn = el("button", "cw-drawer-toggle", "About ρ");
  const tableBtn = el("button", "cw-drawer-toggle", "Data table");
  for (const b of [aboutBtn, tableBtn]) {
    b.type = "button";
    b.setAttribute("aria-haspopup", "dialog");
  }
  const headTools = el("div", "cw-head-tools");
  headTools.append(aboutBtn, tableBtn, close);
  head.append(title, headTools);

  // The chart's settings fold away, leaving the chart more room
  const settings = el("details", "cw-settings");
  settings.append(el("summary", undefined, "Chart settings"));
  const controls = el("div", "cw-controls");
  settings.append(controls);
  const select = (label: string, options: [string, string, string?][]) => {
    const wrap = el("label", "cw-field");
    const s = el("select");
    let group: HTMLOptGroupElement | null = null;
    for (const [value, text, og] of options) {
      if (og && group?.label !== og) {
        group = el("optgroup");
        group.label = og;
        s.append(group);
      }
      (group ?? s).append(new Option(text, value));
    }
    wrap.append(el("span", undefined, label), s);
    controls.append(wrap);
    return s;
  };
  const varOptions = VARS.map((v) => [v.key, capital(v.label), v.role === "outcome" ? "School spending and aid"
    : v.students ? "Students" : "Size and the towns' wealth"] as [string, string, string]);
  const ySel = select("Vertical", varOptions);
  ySel.parentElement!.classList.add("cw-field-axis");
  const fySel = select("Year", [...years].reverse().map((y) => [String(y), `FY${y}`] as [string, string]));
  const hlSel = select("Highlight", Object.entries(HIGHLIGHTS).map(([k, h]) => [k, h.label] as [string, string]));
  const check = (label: string, help?: string) => {
    const wrap = el("label", "cw-check");
    const c = el("input");
    c.type = "checkbox";
    wrap.append(c, el("span", undefined, label));
    if (help) {
      // A plain-language note, shown on hover or focus
      const h = el("span", "cw-help", "?");
      h.tabIndex = 0;
      h.setAttribute("role", "note");
      h.setAttribute("aria-label", help);
      h.dataset.tip = help;
      h.addEventListener("click", (ev) => ev.preventDefault());
      wrap.append(h);
    }
    controls.append(wrap);
    return c;
  };
  const logBox = check("Log scale across",
    "Spreads out the crowded low end. Equal distances along the bottom multiply by the same amount " +
    "(100 to 1,000 to 10,000) instead of adding the same amount, so small and large districts both get room.");
  const allBox = check(`Include Boston, Provincetown, and districts under ${MIN_FE} pupils`);
  const findWrap = el("label", "cw-field cw-find");
  const find = el("input");
  find.type = "search";
  find.placeholder = "Find a district";
  find.setAttribute("list", "cw-names");
  const names = el("datalist");
  names.id = "cw-names";
  for (const d of [...data.districts].sort((a, b) => a.name.localeCompare(b.name))) names.append(new Option(d.name));
  findWrap.append(el("span", undefined, "Label"), find, names);
  controls.append(findWrap);

  const body = el("div", "cw-body");
  const figure = el("figure", "cw-figure");
  const svg = svgEl("svg");
  svg.setAttribute("class", "cw-chart");
  svg.setAttribute("role", "img");
  const tip = el("div", "cw-tip");
  tip.hidden = true;
  const legend = el("ul", "cw-legend");
  const caption = el("figcaption", "cw-caption");
  const finding = el("p", "cw-finding");
  const findingRow = el("div", "cw-finding-row");
  findingRow.append(finding);
  // The pitfalls this pair falls into, if any, under the finding
  const cautionRow = el("div", "cw-cautions");
  figure.append(legend, svg, tip, findingRow, cautionRow, caption);

  // The horizontal picker: every other measure, ranked by how closely it lines up with the
  // vertical one. It is part of the chart's settings and folds away with them. How to read
  // it and the data table each open in a window of their own.
  const side = el("aside", "cw-picker");
  side.setAttribute("aria-labelledby", "cw-picker-head");
  const corrPanel = el("div", "cw-picker-panel");
  const tableHolder = el("div", "cw-table");
  const sideHead = el("h3", undefined);
  // What the bars' two colors mean, in the explorer's usual blue and orange
  const barsKey = el("ul", "cw-bars-key");
  for (const [cls, name, text] of [["pos", "Positive", "rise together: higher on one, higher on the other"],
    ["neg", "Negative", "move opposite: higher on one, lower on the other"]]) {
    const li = el("li");
    const words = el("span");
    words.append(el("strong", undefined, name), ` · ${text}`);
    li.append(el("span", `cw-bars-swatch ${cls}`), words);
    barsKey.append(li);
  }
  {
    // The ◇ on a pair that counts the same thing as the vertical measure
    const li = el("li");
    li.append(el("span", "cw-built", "◇"), el("span", undefined, "Variable overlaps with the vertical measure, so the two line up partly by definition"));
    barsKey.append(li);
  }
  const bars = el("ol", "cw-bars");
  const why = el("div", "cw-why");
  why.innerHTML =
    "<h4>Why the strongest correlation matters</h4>" +
    "<p>Whether a district spends a lot depends on what you compare it with. The factor that lines up most closely " +
    "with spending is the one that most needs holding steady: two districts alike in that factor make a fairer " +
    "comparison than two that are alike only in a weaker one.</p>" +
    "<h4>Reading ρ</h4>" +
    "<p>Spearman's ρ runs from −1 to 1. It is positive when districts higher on one measure tend to be higher on the " +
    "other, negative when they tend to be lower, and near 0 when there is no consistent order. It compares ranks, so " +
    "it handles curved patterns like enrollment's and isn't swayed by a few extreme districts. As a rough guide, " +
    "below 0.3 is weak, 0.3 to 0.6 moderate, and above 0.6 strong.</p>" +
    "<h4>When correlation misleads</h4>" +
    "<p>A strong ρ can still mislead. Each pair on the chart is checked for the common pitfalls that Aggarwal and " +
    `Ranganathan describe (<a href="${PAPER}">“Common pitfalls in statistical analysis: The use of correlation ` +
    "techniques,” <i>Perspectives in Clinical Research</i>, 2016</a>): two measures that count the same thing, two " +
    "that measure one condition two ways, a " +
    "pattern that curves back on itself, a few extreme districts that pull the result, regions that sit apart, " +
    "uneven spread, too few districts, and districts that share towns, so their points aren't independent. Any the " +
    "pair falls into are listed as cautions under the chart.</p>" +
    `<p>And as always, <a href="${CAUSATION}">correlation doesn't imply causation</a>.</p>`;
  sideHead.id = "cw-picker-head";
  const sideSub = el("p", "cw-picker-sub");
  corrPanel.append(sideHead, sideSub, barsKey, bars);
  side.append(corrPanel);
  body.append(figure, side);
  dialog.append(head, settings, body);

  /** A window over the plot view: how to read the ranking, or the data table. */
  function subDialog(heading: string, content: HTMLElement) {
    const { dialog: d, body } = modal(`cw-sub-${heading.replace(/\W+/g, "-").toLowerCase()}`, heading, dialog);
    body.append(content);
    return d;
  }
  const aboutDialog = subDialog("Reading the correlations", why);
  const cautionList = el("div");
  const cautionDialog = subDialog("Cautions for this pair", cautionList);
  const tableTitle = el("p", "cw-sub-note");
  const tableWrap = el("div");
  tableWrap.append(tableTitle, tableHolder);
  const tableDialog = subDialog("Data table", tableWrap);
  aboutBtn.addEventListener("click", () => aboutDialog.showModal());
  tableBtn.addEventListener("click", () => tableDialog.showModal());

  // The picker slides: drag its edge wider to read full names, or shut; select the edge to
  // shut it or bring it back. It starts midway.
  const PICKER_MID = 330;
  const PICKER_MIN = 160;
  let pickerW = PICKER_MID;
  const handle = el("button", "cw-picker-handle");
  handle.type = "button";
  handle.setAttribute("aria-controls", "cw-picker");
  side.id = "cw-picker";
  body.insertBefore(handle, side);
  const pickerMax = () => Math.max(PICKER_MIN, Math.min(680, body.clientWidth - 420));
  const showPicker = () => {
    const closed = pickerW === 0;
    side.hidden = closed;
    body.style.setProperty("--picker-w", `${pickerW}px`);
    body.classList.toggle("picker-closed", closed);
    handle.setAttribute("aria-expanded", String(!closed));
    handle.setAttribute("aria-label", closed ? "Open the Horizontal list" : "Drag to widen or close the Horizontal list");
    handle.title = closed ? "Open the Horizontal list" : "Drag to widen or narrow; select to close";
  };
  let frame = 0;
  const redraw = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => draw());
  };
  let drag: { x: number; w: number; moved: boolean } | null = null;
  handle.addEventListener("pointerdown", (ev) => {
    drag = { x: ev.clientX, w: pickerW, moved: false };
    handle.setPointerCapture(ev.pointerId);
  });
  handle.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const dx = drag.x - ev.clientX;
    if (Math.abs(dx) > 3) drag.moved = true;
    if (!drag.moved) return;
    const w = Math.min(pickerMax(), Math.max(0, (drag.w || PICKER_MIN) + dx));
    pickerW = w < PICKER_MIN - 40 ? 0 : Math.max(PICKER_MIN, w);
    showPicker();
    redraw();
  });
  handle.addEventListener("pointerup", () => {
    if (drag && !drag.moved) {
      pickerW = pickerW === 0 ? PICKER_MID : 0;
      showPicker();
      redraw();
    }
    drag = null;
  });
  handle.addEventListener("keydown", (ev) => {
    const step = { ArrowLeft: 40, ArrowRight: -40 }[ev.key];
    if (step == null) return;
    ev.preventDefault();
    const w = (pickerW || PICKER_MIN - 40) + step;
    pickerW = w < PICKER_MIN ? 0 : Math.min(pickerMax(), w);
    showPicker();
    redraw();
  });
  settings.addEventListener("toggle", () => redraw());
  // Inside the explorer, so it takes the page's colors
  (root.closest(".explorer") ?? document.body).append(dialog);

  let view: View | null = null;

  function open(v: View) {
    view = v;
    if (!dialog.open) {
      // Settings start open where there's room for them beside the chart
      settings.open = window.innerWidth > 700 && window.innerHeight > 640;
      dialog.showModal();
      // Midway, measured once the window is open
      pickerW = Math.min(PICKER_MID, pickerMax());
      showPicker();
    }
    draw();
  }

  function setParams() {
    const q = new URLSearchParams(location.search);
    for (const k of ["plot", "x", "y", "fy", "log", "all", "hl", "focus", "find"]) q.delete(k);
    if (view) {
      q.set("view", "commonwealth");
      if (view.preset) q.set("plot", view.preset);
      q.set("y", view.y);
      q.set("x", view.x);
      if (view.fy !== latest) q.set("fy", String(view.fy));
      if (view.log) q.set("log", "1");
      if (view.all) q.set("all", "1");
      if (view.hl !== DEFAULT_HL) q.set("hl", view.hl);
      if (view.focus?.length) q.set("focus", view.focus.join(","));
      if (view.find) q.set("find", view.find);
    }
    history.replaceState(null, "", `${location.pathname}?${q}`);
  }

  function draw() {
    if (!view) return;
    const v = view;
    const yv = VAR.get(v.y)!;
    const xv = VAR.get(v.x)!;
    const preset = PRESETS.find((p) => p.id === v.preset && p.x === v.x && p.y === v.y);
    title.textContent = preset ? preset.title : `${capital(yv.short)} by ${xv.short}`;
    ySel.value = v.y;
    fySel.value = String(v.fy);
    hlSel.value = v.hl;
    logBox.checked = v.log;
    allBox.checked = v.all;
    find.value = data.districts.find((d) => d.org === v.find)?.name ?? "";

    const { pts, rows, hl, offScale, missing } = pointsFor(data, v);
    const focus = (v.focus ?? []).filter((g) => hl.groups[g]);
    describe(v, pts, rows, hl, offScale, missing, focus);
    // The chart takes the room the legend, finding and caption leave, so the view never scrolls
    const width = Math.max(300, figure.clientWidth || 800);
    const pad = parseFloat(getComputedStyle(body).paddingTop) + parseFloat(getComputedStyle(body).paddingBottom);
    const room = body.clientHeight - pad - legend.offsetHeight - findingRow.offsetHeight - cautionRow.offsetHeight -
      caption.offsetHeight - 28;
    const height = Math.round(Math.max(220, Math.min(room, width * 0.75)));
    svg.setAttribute("aria-label", `Scatterplot of ${lower(yv.label)} against ${lower(xv.label)} for ` +
      `${pts.length} districts, FY${v.fy}` + (focus.length ? `, picking out ${focus.map((g) => hl.groups[g].label).join(" and ")} ` +
      "with a trend of their own" : "") + ". The data table lists every value.");
    scatter(svg, pts, {
      width, height, logX: v.log, xFmt: axisFmt(xv.unit), yFmt: axisFmt(yv.unit),
      // Narrow screens get the short names, which fit along the axes
      xTitle: xv.label, xTitleShort: capital(xv.short), yTitle: yv.label, yTitleShort: capital(yv.short),
      groups: hl.groups, smooth: true, focus,
      onHover: (p, pos) => {
        if (!p || !pos) {
          tip.hidden = true;
          return;
        }
        const d = rows.find((r) => (r.id ?? r.org) === p.id)!;
        tip.replaceChildren(el("strong", undefined, d.name),
          el("div", undefined, `${capital(yv.short)}: ${fmt(yv.unit, p.y)}`),
          el("div", undefined, `${capital(xv.short)}: ${fmt(xv.unit, p.x)}`));
        if (d.towns.length > 1) tip.append(el("div", "cw-tip-towns", `Towns: ${d.towns.join(", ")}`));
        if (d.id) tip.append(el("div", "cw-tip-hint", "Select to open in the School districts tab"));
        tip.hidden = false;
        placeTip(tip, svg, figure, width, pos);
      },
      onPick: (p) => {
        const d = rows.find((r) => (r.id ?? r.org) === p.id);
        if (d?.id) {
          dialog.close();
          opts.openDistrict(d.id);
        }
      },
    });

    setParams();
  }

  /** The legend, finding, caption, ranking and table: everything but the chart, each part drawn on its own (#238).
   * rows: the districts behind the points, which the cautions read. */
  function describe(v: View, pts: Point[], rows: Row[], hl: (typeof HIGHLIGHTS)[string], offScale: { n: number; below: boolean },
    missing: number, focus: string[]) {
    drawCautions(v, pts.length, checkPair(v, VAR.get(v.y)!, VAR.get(v.x)!, pts, rows));
    drawLegend(pts, hl, focus);
    drawCaption(v, pts.length, offScale, missing);
    drawTable(v, pts);
    const rank = ranking(data, v);
    drawPicker(v, rank);
    drawFinding(v, rank);
  }

  /** The pitfalls this pair falls into, as buttons under the finding, each opening their window; or a word that
   * there are none, with a button to how pairs are checked */
  function drawCautions(v: View, n: number, found: Caution[]) {
    const yv = VAR.get(v.y)!;
    const xv = VAR.get(v.x)!;
    cautionRow.replaceChildren();
    if (found.length) {
      cautionRow.append(el("span", "cw-cautions-lead", "Cautions for this pair:"));
      for (const c of found) {
        const b = el("button", "cw-caution", c.label);
        b.type = "button";
        b.title = plain(c.text);
        b.addEventListener("click", () => cautionDialog.showModal());
        cautionRow.append(b);
      }
    } else {
      const how = el("button", "cw-caution quiet", "How pairs are checked");
      how.type = "button";
      how.addEventListener("click", () => aboutDialog.showModal());
      cautionRow.append(el("span", "cw-cautions-lead", "No common correlation pitfalls found for this pair."), how);
    }
    const intro = el("p", "cw-sub-note");
    intro.append(vn(capital(yv.short)), " against ", vn(xv.short), `, FY${v.fy}, ${n} districts. ` +
      (found.length ? "This pair falls into these common pitfalls:" : "This pair falls into none of the common pitfalls checked here."));
    const src = el("p", "cw-sub-note");
    src.append("The pitfalls follow Aggarwal and Ranganathan, ", Object.assign(el("a", undefined,
      "“Common pitfalls in statistical analysis: The use of correlation techniques”"), { href: PAPER }),
    ", Perspectives in Clinical Research, 2016. And whatever ρ shows, ", Object.assign(el("a", undefined,
      "correlation doesn't imply causation"), { href: CAUSATION }), ".");
    cautionList.replaceChildren(intro, ...found.flatMap((c) => [el("h4", undefined, c.label), withParts(el("p"), rich(c.text))]), src);
  }

  /** The legend. With groups to pick from, each entry is a toggle: picked, a group keeps its color, the rest fade,
   * and it gets its own smoothed trend and ρ, to find a pattern within a group that the statewide one hides (#233) */
  function drawLegend(pts: Point[], hl: (typeof HIGHLIGHTS)[string], focus: string[]) {
    const groups = Object.entries(hl.groups).sort((a, b) => b[1].z - a[1].z);
    const picking = groups.length > 1;
    legend.classList.toggle("is-picking", picking);
    legend.classList.toggle("has-focus", focus.length > 0);
    legend.replaceChildren(...groups.map(([id, g]) => {
      const li = el("li");
      const key = el("span", `cw-key ${g.shape}`);
      key.style.setProperty("--c", g.color);
      if (!picking) {
        li.append(key, el("span", undefined, g.label));
        return li;
      }
      const mine = pts.filter((p) => p.group === id);
      const on = focus.includes(id);
      const b = el("button", `cw-key-btn${on ? " is-on" : ""}`);
      b.type = "button";
      b.setAttribute("aria-pressed", String(on));
      b.disabled = !mine.length;
      b.append(key, el("span", undefined, g.label));
      if (on) {
        const line = el("span", "cw-key smooth");
        line.style.setProperty("--c", g.color);
        const r = mine.length >= 8 ? spearman(mine.map((p) => p.x), mine.map((p) => p.y)) : null;
        b.append(line, el("span", "cw-key-rho", r == null
          ? `${mine.length} ${mine.length === 1 ? "district" : "districts"}, too few for ρ` : `ρ = ${rho(r)}, ${mine.length} districts`));
      }
      b.title = on ? "Select to stop picking this group out" : "Select to pick this group out, with its own trend and ρ";
      b.addEventListener("click", () => refocus(on ? focus.filter((f) => f !== id) : [...focus, id]));
      // Pointing at an entry spotlights its group, as every chart's legend does (#239)
      pointsAtGroup(b, svg, id);
      li.append(b);
      return li;
    }), (() => {
      const li = el("li");
      li.append(el("span", `cw-key smooth${focus.length ? " all" : ""}`),
        el("span", undefined, focus.length ? "Smoothed trend, all districts (LOESS)" : "Smoothed trend (LOESS)"));
      return li;
    })(), ...(!picking ? [] : [(() => {
      const li = el("li", "cw-legend-note");
      if (focus.length) {
        const clear = el("button", "cw-legend-clear", "Show all groups");
        clear.type = "button";
        clear.addEventListener("click", () => refocus([]));
        li.append(clear);
      } else li.textContent = "Select a group to pick it out, with its own trend and ρ.";
      return li;
    })()]));
  }

  /** The caption: the year, how many districts, which are left out, the sources and the parts of About the data */
  function drawCaption(v: View, n: number, offScale: { n: number; below: boolean }, missing: number) {
    const yv = VAR.get(v.y)!;
    const xv = VAR.get(v.x)!;
    // Left out: the districts too large or small to compare, unless all are asked for, those without both figures, and
    // those a log scale can't place
    const out = v.all ? [] : ["Boston", "Provincetown", `districts with fewer than ${MIN_FE} foundation pupils`];
    if (missing) out.push(`${missing} ${missing === 1 ? "district" : "districts"} without both figures that year`);
    if (offScale.n) {
      out.push(`${offScale.n} ${offScale.n === 1 ? "district" : "districts"} with ${xv.short} at ${axisFmt(xv.unit)(0)}` +
        `${offScale.below ? " or below" : ""}, which a log scale can't place`);
    }
    const omitted = !out.length ? "" : ` Left out: ${out.length < 3 ? out.join(" and ")
      : `${out.slice(0, -1).join(", ")}, and ${out[out.length - 1]}`}.`;
    const srcs = [...new Set([...yv.src, ...xv.src])].map((k) => SOURCES[k]);
    caption.replaceChildren(`FY${v.fy} · ${n} districts that ran schools that year.${omitted} Sources: `);
    srcs.forEach((s, k) => {
      const a = el("a", undefined, s.name);
      a.href = s.url;
      caption.append(...(k ? [", ", a] : [a]));
    });
    caption.append(". Towns' figures pool each district's member towns.");
    const about = opts.about([...new Set(srcs.map((s) => s.note)), "correlations"]);
    if (about) caption.append(" ", about);
  }

  /** The table: every district drawn, highest first */
  function drawTable(v: View, pts: Point[]) {
    const yv = VAR.get(v.y)!;
    const xv = VAR.get(v.x)!;
    const t = el("table");
    const hr = t.createTHead().insertRow();
    hr.append(el("th", undefined, "District"), el("th", undefined, capital(yv.short)), el("th", undefined, capital(xv.short)));
    const tb = t.createTBody();
    for (const p of [...pts].sort((a, b) => b.y - a.y)) {
      const r = tb.insertRow();
      const th = el("th", undefined, p.name);
      th.scope = "row";
      r.append(th, el("td", undefined, fmt(yv.unit, p.y)), el("td", undefined, fmt(xv.unit, p.x)));
    }
    tableHolder.replaceChildren(t);
    tableTitle.replaceChildren(vn(capital(yv.label)), " and ", vn(lower(xv.label)), `, FY${v.fy}: ${pts.length} districts, highest first.`);
  }

  /** The picker: every other measure, closest first */
  function drawPicker(v: View, rank: Ranked) {
    const yv = VAR.get(v.y)!;
    sideHead.textContent = "Horizontal";
    sideSub.replaceChildren("Every other measure, ranked by how closely it lines up with ", vn(yv.short), ` in FY${v.fy}. ` +
      "Select one to put it across the bottom.");
    bars.replaceChildren(...rank.map((o) => {
      const li = el("li");
      const b = el("button", `cw-bar${o.v.key === v.x ? " is-current" : ""}`);
      b.type = "button";
      b.setAttribute("aria-pressed", String(o.v.key === v.x));
      const track = el("span", "cw-bar-track");
      if (o.r != null) {
        const fill = el("span", `cw-bar-fill${o.r < 0 ? " neg" : ""}`);
        fill.style.width = `${Math.abs(o.r) * 50}%`;
        track.append(fill);
      }
      const label = el("span", "cw-bar-label", capital(o.v.short));
      const same = sharedParts(o.v.key, v.y);
      if (same.length) {
        // A pair built from the same numbers lines up by construction: marked, and set back
        b.classList.add("is-built");
        label.prepend(el("span", "cw-built", "◇ "));
      }
      b.append(label, track, el("span", "cw-bar-value", o.r == null ? "–" : rho(o.r)));
      b.title = (o.r == null ? `${capital(o.v.label)}: no FY${v.fy} data` : `${capital(o.v.label)}: ρ = ${rho(o.r)} across ${o.n} districts`) +
        (same.length ? `. ◇ Both count ${same.join(" and ")}, so this pair lines up partly by definition.` : "");
      b.disabled = o.r == null;
      b.addEventListener("click", () => {
        view = { ...v, preset: null, x: o.v.key, log: !!o.v.log };
        draw();
      });
      li.append(b);
      return li;
    }));
  }

  /** The finding sets school measures against size and wealth, not against one another */
  function drawFinding(v: View, rank: Ranked) {
    const yv = VAR.get(v.y)!;
    const xv = VAR.get(v.x)!;
    const kind = rank.filter((o) => o.r != null && o.v.role !== yv.role && !sharedParts(o.v.key, v.y).length);
    const top = kind[0];
    const here = rank.find((o) => o.v.key === v.x && o.r != null);
    const among = yv.role === "outcome" ? "Of the measures of size, the towns' wealth, and the students" : "Of the school measures";
    finding.replaceChildren(...(!top ? [] : [`${among}, `, vn(top.v.short), " lines up most closely with ", vn(yv.short),
      ` in FY${v.fy} (ρ = ${rho(top.r!)}, ${top.n} districts)`,
      ...(!here || here === top ? ["."] : ["; ", vn(xv.short), Math.abs(Math.abs(here.r!) - Math.abs(top.r!)) < 0.005
        ? ", across the bottom now, is as close." : `, across the bottom now, has ρ = ${rho(here.r!)}.`])]));
  }

  /** The groups picked out, changed: the plot stays the one it was, preset and all */
  const refocus = (focus: string[]) => {
    if (!view) return;
    view = { ...view, focus };
    draw();
  };
  const change = (patch: Partial<View>) => {
    if (!view) return;
    view = { ...view, preset: null, ...patch };
    draw();
  };
  // A new vertical measure keeps the horizontal one, unless they'd be the same: then the
  // closest measure of the other kind goes across
  ySel.addEventListener("change", () => {
    if (!view) return;
    let x = view.x;
    if (x === ySel.value) {
      const best = ranking(data, { ...view, y: ySel.value }).find((o) => o.r != null && o.v.role !== VAR.get(ySel.value)!.role);
      x = best?.v.key ?? x;
    }
    change({ y: ySel.value, x, log: x === view.x ? view.log : !!VAR.get(x)?.log });
  });
  fySel.addEventListener("change", () => change({ fy: Number(fySel.value) }));
  hlSel.addEventListener("change", () => change({ hl: hlSel.value, focus: [] }));
  logBox.addEventListener("change", () => change({ log: logBox.checked }));
  allBox.addEventListener("change", () => change({ all: allBox.checked }));
  find.addEventListener("change", () => {
    const d = data.districts.find((r) => r.name.toLowerCase() === find.value.trim().toLowerCase());
    change({ find: d ? d.org : null });
  });
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    view = null;
    tip.hidden = true;
    setParams();
  });
  // Redraw when the room changes: the window, or the settings folding open or shut
  let lastW = 0;
  let lastH = 0;
  new ResizeObserver(() => {
    const w = body.clientWidth;
    const h = body.clientHeight;
    if (dialog.open && (Math.abs(w - lastW) > 8 || Math.abs(h - lastH) > 8)) {
      lastW = w;
      lastH = h;
      draw();
    }
  }).observe(body);

  /** Open the plot a link names: ?view=commonwealth&plot=...&x=...&y=... */
  function openFromUrl() {
    const q = new URLSearchParams(location.search);
    const preset = PRESETS.find((p) => p.id === q.get("plot"));
    const y = VAR.has(q.get("y") ?? "") ? q.get("y")! : preset?.y;
    const x = VAR.has(q.get("x") ?? "") ? q.get("x")! : preset?.x;
    if (!x || !y) return;
    const fy = Number(q.get("fy"));
    const asked = HL_RENAMED[q.get("hl") ?? ""] ?? q.get("hl");
    const hl = asked && HIGHLIGHTS[asked] ? asked : DEFAULT_HL;
    open({
      preset: preset?.id ?? null, x, y, fy: years.includes(fy) ? fy : latest,
      log: q.has("log") ? q.get("log") === "1" : preset?.log ?? !!VAR.get(x)?.log,
      all: q.get("all") === "1", hl, find: q.get("find"),
      focus: (q.get("focus") ?? "").split(",").filter((g) => g && HIGHLIGHTS[hl].groups[g]),
    });
  }

  return { openFromUrl, close: () => dialog.open && dialog.close() };
}
