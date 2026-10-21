// The Western MA school spending explorer: a district view and a town view.
// Data: src/data/massppe/explorer.json (districts) and towns.json (towns, loaded
// when the Towns tab first opens), written by the report pipeline
// (github.com/timshores/schools, ppe_report/export_explorer_data.py). Both are
// imported rather than fetched, so they ship as hashed JavaScript chunks, which the
// host compresses (it sends .json uncompressed: 193 KB instead of about 50 KB).

import { compact, lines, niceTicks, niceTicksRange, stackedColumns, type Panel, type Series, type Val } from "./charts";

type Values = Val[];

interface Entity {
  id: string;
  name: string;
  kind: "district" | "cohort" | "western";
  cohort: string | null;
  members?: number;
  fte?: number;
  compare?: string;
  ppe: Record<string, Values>;
  enroll: { in_district: Values; foundation: Values; out_of_district: Values };
  nss: { ch70_aid: Values; required_local: Values; above_required: Values };
  /** Districts only: a regional district, the kind with Census revenue figures */
  regional?: boolean;
  /** Revenue by source per in-district FTE pupil: regional districts and averages of enough of them */
  rev?: Record<string, Values>;
  /** Averages only: how many regional districts they include */
  rev_members?: number;
  /** Town-run districts only: Census's latest totals, in dollars */
  rev_check?: { fy: number; revenue: number; expenditure: number };
  /** Districts only: the town itself, or a regional district's member towns, each with what it must
   * contribute to this district and the other districts it belongs to */
  towns?: { id: string; name: string; contribution: number | null; also: TownDistrict[] }[];
}

/** A town, or the pooled Western MA towns average, from towns.json */
interface Town {
  id: string;
  name: string;
  kind: "town" | "average";
  county?: string | null;
  /** Towns: the id of its peer group's average (none for Springfield) */
  peer?: string | null;
  members?: number;
  /** Peer group averages: mid-sentence name, and the population range */
  ref?: string;
  label?: string;
  /** Residents: the town's, or the average's combined population */
  pop: Values;
  /** General fund spending by function and revenue by source, per resident */
  spend: Record<string, Values>;
  rev: Record<string, Values>;
  /** Dollars, all towns combined for the average */
  spend_total: Values;
  rev_total: Values;
  /** Its school districts, each with the town's required contribution and the district's other member towns */
  districts?: (TownDistrict & { contribution: number | null; with: { name: string; id: string | null }[] })[];
}

/** A school district a town belongs to; id is null for districts outside the explorer */
interface TownDistrict { name: string; id: string | null; kind: "town" | "regional" | "vocational" }

interface TownData {
  meta: { years: number[]; latest: number; members_fy: number; excluded: string[]; peer_year: number };
  towns: Town[];
}

/** What a comparison needs: a name, whether it reads with "the", or its own mid-sentence name */
interface Named { name: string; kind: string; ref?: string }

interface Meta {
  years: number[];
  latest: number;
  start: number;
  categories: string[];
  cohorts: Record<string, { label: string; short: string; range: [number, number | null] }>;
  cpi: Record<string, number>;
  /** Census revenue years, which trail the DESE years */
  revenue: { first: number; latest: number; min_members: number } | null;
}

interface Data {
  meta: Meta;
  entities: Entity[];
}

type Compare = "cohort" | "western" | "other" | "none";
type TownCompare = "peer" | "western" | "other" | "none";
type Dollars = "nominal" | "real";
type View = "districts" | "towns";
type StackPanel = "ppe" | "nss" | "rev" | "tspend" | "trev";
/** The two lines a stacked chart can draw over its columns */
type Line = "trend" | "cmp";

const PPE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948", "#8f8a7f"];
const NSS_SERIES = [
  { key: "ch70_aid", label: "Chapter 70 state aid", color: "#008300" },
  { key: "required_local", label: "Required local contribution", color: "#eda100" },
  { key: "above_required", label: "Spending above required", color: "#6250d6" },
] as const;
// Bottom to top, as the export orders them (ppe_report/export_explorer_data.py
// REVENUE). Chapter 70 and the towns' share keep their colors from the NSS chart;
// building aid sits on top because it comes in large, irregular payments.
const REV_SERIES = [
  { key: "towns", label: "Payments from towns", color: "#eda100" },
  { key: "ch70", label: "Chapter 70 state aid", color: "#008300" },
  { key: "retirement", label: "Teacher retirement paid by the state", color: "#2a78d6" },
  { key: "transport", label: "Transportation aid", color: "#1baf7a" },
  { key: "other_state", label: "Other state aid", color: "#6250d6" },
  { key: "federal", label: "Federal", color: "#e34948" },
  { key: "districts", label: "From other school districts", color: "#eb6834" },
  { key: "other_local", label: "Other local", color: "#e87ba4" },
  { key: "building", label: "School building aid", color: "#8f8a7f" },
] as const;
// Town view: Schedule A functions and grouped revenue sources, bottom to top as
// the export orders them (TOWN_SPEND, TOWN_REV). Education sits at the bottom so
// its share is easy to follow; taxes and state aid keep the local and state colors.
const TOWN_SPEND_SERIES = [
  { key: "education", label: "Education", color: "#2a78d6" },
  { key: "fixed", label: "Fixed costs (benefits, insurance)", color: "#eb6834" },
  { key: "safety", label: "Public safety", color: "#e34948" },
  { key: "works", label: "Public works", color: "#1baf7a" },
  { key: "general", label: "General government", color: "#eda100" },
  { key: "debt", label: "Debt service", color: "#8f8a7f" },
  { key: "assessments", label: "Intergovernmental assessments", color: "#6250d6" },
  { key: "human", label: "Human services", color: "#e87ba4" },
  { key: "culture", label: "Culture and recreation", color: "#008300" },
  { key: "other", label: "Other", color: "#c4bba9" },
] as const;
const TOWN_REV_SERIES = [
  { key: "taxes", label: "Taxes", color: "#eda100" },
  { key: "state", label: "State aid", color: "#008300" },
  { key: "federal", label: "Federal", color: "#e34948" },
  { key: "charges", label: "Charges, fees, and fines", color: "#1baf7a" },
  { key: "other", label: "Other revenue", color: "#e87ba4" },
  { key: "transfers", label: "Transfers and other financing", color: "#8f8a7f" },
] as const;
const POP_COLOR = "#2a78d6";
const ENROLL_SERIES = [
  { key: "in_district", label: "In-district FTE", color: "#2a78d6" },
  { key: "foundation", label: "Foundation enrollment", color: "#eb6834" },
  { key: "out_of_district", label: "Out-of-district FTE", color: "#1baf7a" },
] as const;
const COMPARE_COLOR = "#524f45";
// The site accent (Layout.astro --accent), dashed, so the trend reads apart from the comparison
const TREND_COLOR = "#b65c3d";

// The report's comparison shading (ppe_report/compose_pdf.py): amber above the
// baseline, teal below, darker as the gap grows. Dollars and enrollment shade
// from a 5% relative gap, growth rates from 0.5 percentage points.
const ABOVE_SHADES = ["#FFF4E6", "#FFE8CC", "#FFD9A8", "#FFC97A", "#FFB84D"];
const BELOW_SHADES = ["#E0F7FA", "#B2EBF2", "#80DEEA", "#4DD0E1", "#26C6DA"];
const SHADE_BINS_REL = [0.05, 0.1, 0.15, 0.2];
const SHADE_BINS_PP = [0.005, 0.01, 0.015, 0.02];

function shade(delta: number | null, bins: number[]) {
  if (delta == null || !Number.isFinite(delta) || Math.abs(delta) < bins[0]) return null;
  const idx = Math.min(ABOVE_SHADES.length - 1, bins.filter((b) => b <= Math.abs(delta)).length - 1);
  return delta > 0 ? ABOVE_SHADES[idx] : BELOW_SHADES[idx];
}

const usd = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
const fte = (v: number) => (v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1));
const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)}%`;
const millions = (v: number) => `$${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)} million`;
/** "A", "A and B", "A, B, and C" */
const list = (items: string[]) =>
  items.length < 3 ? items.join(" and ") : `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
const sentence = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function cohortTitle(meta: Meta, key: string) {
  const c = meta.cohorts[key];
  const [lo, hi] = c.range;
  if (hi == null) return `${c.short} (over ${(lo - 1).toLocaleString("en-US")} FTE)`;
  return `${c.short} cohort (${lo.toLocaleString("en-US")}–${hi.toLocaleString("en-US")} FTE)`;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function text(tag: string, content: string, cls?: string) {
  const node = document.createElement(tag);
  node.textContent = content;
  if (cls) node.className = cls;
  return node;
}

function sumAt(groups: Values[], i: number): number | null {
  const vals = groups.map((g) => g[i]);
  return vals.every((v) => v == null) ? null : vals.reduce<number>((a, v) => a + (v ?? 0), 0);
}

/** Sum only when every part is present. */
function sumStrict(groups: Values[], i: number): number | null {
  const vals = groups.map((g) => g[i]);
  return vals.some((v) => v == null) ? null : vals.reduce<number>((a, v) => a + v!, 0);
}

/** Least-squares straight line through the years that have a value, drawn across those years;
 * all null with fewer than three values. */
function linearTrend(values: Values): Values {
  const pts = values.flatMap((v, i) => (v == null ? [] : [[i, v] as const]));
  if (pts.length < 3) return values.map(() => null);
  const n = pts.length;
  const mx = pts.reduce((a, [x]) => a + x, 0) / n;
  const my = pts.reduce((a, [, y]) => a + y, 0) / n;
  const slope = pts.reduce((a, [x, y]) => a + (x - mx) * (y - my), 0) / pts.reduce((a, [x]) => a + (x - mx) ** 2, 0);
  const [first, lastAt] = [pts[0][0], pts[n - 1][0]];
  return values.map((_, i) => (i < first || i > lastAt ? null : my + slope * (i - mx)));
}

function cagr(first: number | null, last: number | null, years: number) {
  if (first == null || last == null || first <= 0 || last <= 0 || years <= 0) return null;
  return (last / first) ** (1 / years) - 1;
}

export async function startExplorer() {
  const root = $("explorer");
  let data: Data;
  try {
    data = (await import("../../data/massppe/explorer.json")).default as unknown as Data;
  } catch {
    root.replaceChildren(text("p", "The explorer data didn't load. Reload the page to try again.", "load-error"));
    return;
  }
  const { meta } = data;
  const byId = new Map(data.entities.map((e) => [e.id, e]));
  const years = meta.years;
  const last = years.length - 1;
  const span = meta.latest - meta.start;

  // ---- State, from the URL ----
  const params = new URLSearchParams(location.search);
  const vsParam = params.get("vs");
  const state = {
    d: byId.has(params.get("d") ?? "") ? params.get("d")! : "leverett",
    cmp: (["cohort", "western", "other", "none"].includes(params.get("cmp") ?? "") ? params.get("cmp") : "cohort") as Compare,
    // The entity picked in the second dropdown when comparing with another district or average
    vs: vsParam && byId.has(vsParam) ? vsParam : null as string | null,
    usd: (params.get("usd") === "real" ? "real" : "nominal") as Dollars,
    view: (params.get("view") === "towns" ? "towns" : "districts") as View,
    // Town view: checked against the town list once towns.json loads
    t: params.get("t") ?? "leverett",
    tcmp: (["peer", "western", "other", "none"].includes(params.get("tcmp") ?? "") ? params.get("tcmp") : "peer") as TownCompare,
    tvs: params.get("tvs"),
  };
  if (state.cmp === "other" && !state.vs) state.cmp = "cohort";
  // Legend selections; empty means every segment shows. Kept across districts so
  // one category can be followed from district to district.
  const isolated: Record<StackPanel, Set<string>> = {
    ppe: new Set(), nss: new Set(), rev: new Set(), tspend: new Set(), trev: new Set(),
  };
  // Lines hidden from each chart's legend; both show until clicked off. Kept across
  // districts and towns, like the isolation sets.
  const hiddenLines: Record<StackPanel, Set<Line>> = {
    ppe: new Set(), nss: new Set(), rev: new Set(), tspend: new Set(), trev: new Set(),
  };

  // Town data, fetched the first time the Towns tab opens
  let towns: TownData | null = null;
  let townById = new Map<string, Town>();
  let townsFailed = false;
  async function loadTowns() {
    if (towns || townsFailed) return;
    try {
      towns = (await import("../../data/massppe/towns.json")).default as unknown as TownData;
    } catch {
      townsFailed = true;
      return;
    }
    townById = new Map(towns.towns.map((t) => [t.id, t]));
    if (!townById.has(state.t)) state.t = "leverett";
    if (state.tvs && !townById.has(state.tvs)) state.tvs = null;
    if (state.tcmp === "other" && !state.tvs) state.tcmp = "peer";
    for (const sel of [townSelect, townVsSelect]) fillTowns(sel);
    townSelect.value = state.t;
    townCompareSelect.value = state.tcmp;
    if (state.tvs) townVsSelect.value = state.tvs;
  }

  // ---- Controls ----
  // The district menu and its duplicate for comparisons list the same entities
  function fillEntities(sel: HTMLSelectElement) {
    const averages = document.createElement("optgroup");
    averages.label = "Averages";
    for (const e of data.entities.filter((x) => x.kind !== "district")) averages.append(new Option(e.name, e.id));
    sel.append(averages);
    for (const key of Object.keys(meta.cohorts)) {
      const group = document.createElement("optgroup");
      group.label = cohortTitle(meta, key);
      data.entities
        .filter((e) => e.kind === "district" && e.cohort === key)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((e) => group.append(new Option(e.name, e.id)));
      if (group.children.length) sel.append(group);
    }
  }
  const select = $<HTMLSelectElement>("pick-district");
  const vsSelect = $<HTMLSelectElement>("pick-vs");
  fillEntities(select);
  fillEntities(vsSelect);
  const compareSelect = $<HTMLSelectElement>("pick-compare");
  const dollarInputs = document.querySelectorAll<HTMLInputElement>('input[name="dollars"]');
  document.querySelectorAll("[data-latest]").forEach((n) => (n.textContent = String(meta.latest)));

  select.value = state.d;
  compareSelect.value = state.cmp;
  dollarInputs.forEach((r) => (r.checked = r.value === state.usd));
  select.addEventListener("change", () => update({ d: select.value }));
  compareSelect.addEventListener("change", () => {
    const cmp = compareSelect.value as Compare;
    // Start the second menu on whatever was being compared, so nothing jumps
    const vs = cmp === "other" && !state.vs ? (comparisonFor(byId.get(state.d)!)?.id ?? "western-ma") : state.vs;
    update({ cmp, vs });
  });
  vsSelect.addEventListener("change", () => update({ vs: vsSelect.value }));
  dollarInputs.forEach((r) => r.addEventListener("change", () => r.checked && update({ usd: r.value as Dollars })));

  // Town controls: the average first, then towns by county
  const townSelect = $<HTMLSelectElement>("pick-town");
  const townVsSelect = $<HTMLSelectElement>("pick-town-vs");
  const townCompareSelect = $<HTMLSelectElement>("pick-town-compare");
  function fillTowns(sel: HTMLSelectElement) {
    sel.replaceChildren();
    const averages = document.createElement("optgroup");
    averages.label = "Averages";
    const counties = new Map<string, HTMLOptGroupElement>();
    for (const t of towns!.towns) {
      if (t.kind === "average") {
        averages.append(new Option(t.name, t.id));
        continue;
      }
      const label = `${t.county ?? "Other"} County`;
      if (!counties.has(label)) {
        const g = document.createElement("optgroup");
        g.label = label;
        counties.set(label, g);
      }
      counties.get(label)!.append(new Option(t.name, t.id));
    }
    sel.append(averages, ...[...counties.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g));
  }
  townSelect.addEventListener("change", () => update({ t: townSelect.value }));
  townCompareSelect.addEventListener("change", () => {
    const tcmp = townCompareSelect.value as TownCompare;
    const tvs = tcmp === "other" && !state.tvs ? (townComparison(townById.get(state.t)!)?.id ?? "western-towns") : state.tvs;
    update({ tcmp, tvs });
  });
  townVsSelect.addEventListener("change", () => update({ tvs: townVsSelect.value }));

  // Tabs: arrow keys move between them, as for any tab list
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  tabs.forEach((tab, k) => {
    tab.addEventListener("click", () => update({ view: tab.dataset.view as View }));
    tab.addEventListener("keydown", (ev) => {
      const next = { ArrowLeft: k - 1, ArrowRight: k + 1, Home: 0, End: tabs.length - 1 }[ev.key];
      if (next == null) return;
      ev.preventDefault();
      const target = tabs[(next + tabs.length) % tabs.length];
      target.focus();
      update({ view: target.dataset.view as View });
    });
  });

  function update(patch: Partial<typeof state>) {
    Object.assign(state, patch);
    const q = new URLSearchParams();
    if (state.view === "towns") {
      q.set("view", "towns");
      q.set("t", state.t);
      if (state.tcmp !== "peer") q.set("tcmp", state.tcmp);
      if (state.tcmp === "other" && state.tvs) q.set("tvs", state.tvs);
    } else {
      q.set("d", state.d);
      if (state.cmp !== "cohort") q.set("cmp", state.cmp);
      if (state.cmp === "other" && state.vs) q.set("vs", state.vs);
    }
    if (state.usd !== "nominal") q.set("usd", state.usd);
    history.replaceState(null, "", `${location.pathname}?${q}`);
    render();
  }

  /** A link that opens a district or town in the explorer, in place or in a new tab. */
  function viewLink(label: string, patch: Partial<typeof state>) {
    const q = patch.view === "towns" ? `?view=towns&t=${patch.t}` : `?d=${patch.d}`;
    const a = text("a", label) as HTMLAnchorElement;
    a.href = q;
    a.addEventListener("click", (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
      ev.preventDefault();
      update(patch);
      $("entity-name").scrollIntoView({ block: "nearest" });
    });
    return a;
  }

  // ---- Helpers that depend on state ----
  const deflate = (values: Values): Values => {
    if (state.usd === "nominal") return values;
    const base = meta.cpi[String(meta.latest)];
    return values.map((v, i) => (v == null ? null : (v * base) / meta.cpi[String(years[i])]));
  };

  function comparisonFor(e: Entity): Entity | null {
    if (state.cmp === "none") return null;
    if (state.cmp === "other") {
      const v = state.vs ? byId.get(state.vs) : undefined;
      return v && v.id !== e.id ? v : null;
    }
    if (state.cmp === "western") return e.id === "western-ma" ? null : byId.get("western-ma") ?? null;
    if (e.kind === "district") return byId.get(e.compare ?? "western-ma") ?? null;
    return e.kind === "cohort" ? byId.get("western-ma") ?? null : null;
  }

  /** "Shutesbury" or "the Tiny cohort average", for use mid-sentence. */
  const refName = (c: Named) => c.ref ?? (c.kind === "district" || c.kind === "town" ? c.name : `the ${c.name}`);

  function townComparison(t: Town): Town | null {
    if (state.tcmp === "none") return null;
    if (state.tcmp === "other") {
      const v = state.tvs ? townById.get(state.tvs) : undefined;
      return v && v.id !== t.id ? v : null;
    }
    if (state.tcmp === "western") return t.id === "western-towns" ? null : townById.get("western-towns") ?? null;
    // Its peer group: a town's own, an average's the Western MA one
    if (t.kind === "town") return townById.get(t.peer ?? "western-towns") ?? null;
    return t.id === "western-towns" ? null : townById.get("western-towns") ?? null;
  }

  /** Why an entity has no revenue chart, in the chart's place. */
  function noRevenue(e: Entity): string {
    const peers = regionalIn(e.cohort).map((x) => x.name);
    if (e.kind === "district") {
      const r = e.rev_check;
      return "This chart covers regional districts only. Census's revenue figures for town-run districts are " +
        "unreliable: for many of them, its local revenue falls well short of what the town spends on its schools." +
        (r ? ` For ${e.name} in FY${r.fy}, Census reports ${millions(r.revenue)} of revenue against ${millions(r.expenditure)} of spending.` : "") +
        (peers.length ? ` Regional districts in the ${meta.cohorts[e.cohort!].short} cohort: ${list(peers)}.` : "");
    }
    const n = e.rev_members ?? 0;
    if (n === 0) return `The ${e.name} includes no regional districts, so it has no revenue average.`;
    return `The ${e.name} includes ${n === 1 ? `one regional district, ${peers[0]}` : `only ${n} regional districts (${list(peers)})`}, ` +
      `too few for a revenue average. Choose ${n === 1 ? "it" : "one"} in the district menu to see its revenue.`;
  }

  const ppeSeries = (e: Entity): Series[] =>
    meta.categories.map((c, k) => ({ key: c, label: sentence(c), color: PPE_COLORS[k], values: deflate(e.ppe[c]) }));
  const nssSeries = (e: Entity): Series[] =>
    NSS_SERIES.map((s) => ({ ...s, values: deflate(e.nss[s.key]) }));
  const enrollSeries = (e: Entity): Series[] =>
    ENROLL_SERIES.map((s) => ({ ...s, values: e.enroll[s.key] }));
  const revSeries = (e: Entity): Series[] | null =>
    e.rev ? REV_SERIES.map((s) => ({ ...s, values: deflate(e.rev![s.key]) })) : null;
  /** Revenue averages cover only their regional districts, and say so. */
  const revName = (c: Entity) => (c.kind === "district" ? c.name : c.name.replace(/ average$/, " regional average"));
  const regionalIn = (cohort: string | null) =>
    data.entities.filter((x) => x.kind === "district" && x.regional && (cohort == null || x.cohort === cohort));
  const totals = (series: Series[]): Values => years.map((_, i) => sumAt(series.map((s) => s.values), i));
  const strictTotals = (series: Series[]): Values => years.map((_, i) => sumStrict(series.map((s) => s.values), i));
  // Actual NSS is the full stack, so it exists only where DESE reported actual spending
  const actualNss = (series: Series[]): Values =>
    years.map((_, i) => (series[2].values[i] == null ? null : sumAt(series.map((s) => s.values), i)));
  const visible = (series: Series[], panel: StackPanel) =>
    isolated[panel].size ? series.filter((s) => isolated[panel].has(s.key)) : series;
  /** "teachers", "3 selected categories", or null when everything shows. */
  const selectionName = (shown: Series[], all: Series[], noun: string) =>
    shown.length === all.length ? null : shown.length === 1 ? shown[0].label.toLowerCase() : `${shown.length} selected ${noun}`;

  /** Ticks fitted to the columns actually drawn, including any that hang below zero. */
  function fitTicks(series: Series[], overlay: Values | null) {
    let lo = 0;
    let hi = 0;
    years.forEach((_, i) => {
      const vals = series.map((s) => s.values[i]);
      const pos = vals.reduce<number>((a, v) => a + Math.max(0, v ?? 0), 0);
      const tot = vals.reduce<number>((a, v) => a + (v ?? 0), 0);
      const o = overlay?.[i] ?? 0;
      hi = Math.max(hi, pos, o);
      lo = Math.min(lo, pos === 0 ? tot : 0, o);
    });
    return niceTicksRange(lo * 1.04, hi * 1.04);
  }

  // ---- Hover: one year highlighted across every panel, tooltip in the active one ----
  let panels: { panel: Panel; figure: HTMLElement; tip: (i: number) => TipContent }[] = [];
  let hovered: number | null = null;

  interface TipRow { value: string; label: string; color?: string; mark?: "line" | "dash" | "rect" | "hatch"; strong?: boolean }
  interface TipContent { title: string; rows: TipRow[]; note?: string }

  function showTip(figure: HTMLElement, panel: Panel, i: number, content: TipContent) {
    const tip = figure.querySelector<HTMLElement>(".tooltip")!;
    tip.replaceChildren(text("div", content.title, "tip-title"));
    for (const r of content.rows) {
      const row = document.createElement("div");
      row.className = `tip-row${r.strong ? " strong" : ""}`;
      const key = document.createElement("span");
      key.className = `key ${r.mark ?? "none"}`;
      if (r.color) key.style.setProperty("--c", r.color);
      row.append(key, text("span", r.value, "tip-value"), text("span", r.label, "tip-label"));
      tip.append(row);
    }
    if (content.note) tip.append(text("div", content.note, "tip-note"));
    tip.hidden = false;
    const svgBox = panel.svg.getBoundingClientRect();
    const figBox = figure.getBoundingClientRect();
    const scale = svgBox.width / panel.ax.frame.width;
    const x = svgBox.left - figBox.left + panel.ax.x(i) * scale;
    const w = tip.offsetWidth;
    const left = x + 16 + w > figBox.width ? x - 16 - w : x + 16;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${svgBox.top - figBox.top + 8}px`;
  }

  function setHover(i: number | null, source: SVGSVGElement | null) {
    hovered = i;
    for (const p of panels) {
      p.panel.setHover(i);
      const tipEl = p.figure.querySelector<HTMLElement>(".tooltip")!;
      if (i != null && p.panel.svg === source) showTip(p.figure, p.panel, i, p.tip(i));
      else tipEl.hidden = true;
    }
  }

  function keyboard(svg: SVGSVGElement) {
    svg.addEventListener("focus", () => setHover(hovered ?? last, svg));
    svg.addEventListener("blur", () => setHover(null, null));
    svg.addEventListener("keydown", (ev) => {
      const now = hovered ?? last;
      const next = { ArrowLeft: now - 1, ArrowRight: now + 1, Home: 0, End: last }[ev.key];
      if (next == null) return;
      ev.preventDefault();
      setHover(Math.max(0, Math.min(last, next)), svg);
    });
  }

  // ---- Legend: stacked segments are toggle buttons that isolate them; the lines are
  // toggle buttons that hide them on that chart ----
  interface LegendItem { label: string; color: string; mark: "rect" | "line" | "dash" | "hatch"; key?: string; line?: Line }

  // ---- Chart lines: the entity's own trend (dashed) and the comparison (solid, with dots).
  // Both follow what the legend isolates; either can be hidden from its legend entry. ----
  const trendOf = (name: string, sel: string | null, shownTotal: Values): Series =>
    ({ key: "trend", label: `${name} trend${sel ? `, ${sel}` : ""}`, color: TREND_COLOR, values: linearTrend(shownTotal) });
  /** The line as drawn: null while its legend entry has it hidden. */
  const drawn = (panel: StackPanel, line: Line, s: Series | null): Series | null => (hiddenLines[panel].has(line) ? null : s);
  const legendHint = (noun: string) => `Select ${noun} in the legend to isolate them, or a line to hide it.`;
  const hasLine = (s: Series | null): s is Series => !!s && s.values.some((v) => v != null);
  /** " Dashed line: Leverett trend. Solid line: Tiny cohort average, total." */
  const lineNote = (trend: Series | null, overlay: Series | null) =>
    (hasLine(trend) ? ` Dashed line: ${trend.label}.` : "") + (overlay ? ` Solid line: ${overlay.label}.` : "");
  /** Legend entries for the lines the chart can draw, hidden ones included so they can come back. */
  const lineLegend = (trend: Series | null, overlay: Series | null): LegendItem[] => [
    ...(hasLine(trend) ? [{ label: trend.label, color: TREND_COLOR, mark: "dash" as const, line: "trend" as const }] : []),
    ...(overlay ? [{ label: overlay.label, color: COMPARE_COLOR, mark: "line" as const, line: "cmp" as const }] : []),
  ];
  const trendRow = (trend: Series | null, i: number): TipRow[] =>
    trend && trend.values[i] != null ? [{ value: usd(trend.values[i]!), label: trend.label, color: TREND_COLOR, mark: "dash" }] : [];
  let refocus: { panel: StackPanel; key: string } | null = null;

  function legend(list: HTMLElement, items: LegendItem[], panel?: StackPanel) {
    const set = panel ? isolated[panel] : null;
    const toggles = items.filter((it) => it.key);
    const swatch = (it: LegendItem) => {
      const key = document.createElement("span");
      key.className = `key ${it.mark}`;
      key.style.setProperty("--c", it.color);
      return key;
    };
    const nodes = items.map((it) => {
      const li = document.createElement("li");
      if (panel && it.line) {
        const line = it.line;
        const off = hiddenLines[panel].has(line);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `legend-btn legend-line${off ? " is-off" : ""}`;
        btn.dataset.key = `line:${line}`;
        btn.setAttribute("aria-pressed", String(!off));
        btn.title = off ? "Show this line" : "Hide this line";
        btn.append(swatch(it), text("span", it.label));
        btn.addEventListener("click", () => {
          if (off) hiddenLines[panel].delete(line);
          else hiddenLines[panel].add(line);
          refocus = { panel, key: `line:${line}` };
          render();
        });
        li.append(btn);
        return li;
      }
      if (!set || !it.key) {
        li.className = "legend-static";
        li.append(swatch(it), text("span", it.label));
        return li;
      }
      const key = it.key;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "legend-btn";
      btn.dataset.key = key;
      btn.setAttribute("aria-pressed", String(set.has(key)));
      if (set.size && !set.has(key)) btn.classList.add("is-off");
      btn.append(swatch(it), text("span", it.label));
      btn.addEventListener("click", () => {
        if (set.has(key)) set.delete(key);
        else set.add(key);
        if (set.size === toggles.length) set.clear();
        refocus = { panel: panel!, key };
        render();
      });
      li.append(btn);
      return li;
    });
    if (set?.size) {
      const li = document.createElement("li");
      const reset = text("button", "Show all", "legend-reset") as HTMLButtonElement;
      reset.type = "button";
      reset.addEventListener("click", () => {
        set.clear();
        refocus = { panel: panel!, key: toggles[0].key! };
        render();
      });
      li.append(reset);
      nodes.push(li);
    }
    list.replaceChildren(...nodes);
  }

  // ---- Full data table: every year, shown in an overlay wider than the page column ----
  type TableCol = { label: string; values: Values; fmt: (v: number) => string };
  const fullTables: Record<string, { caption: string; cols: TableCol[] }> = {};
  const dialog = $<HTMLDialogElement>("table-dialog");

  function table(cols: TableCol[]) {
    const t = document.createElement("table");
    t.setAttribute("aria-labelledby", "table-dialog-title");
    const head = t.createTHead().insertRow();
    head.append(text("th", "Fiscal year"));
    cols.forEach((c) => head.append(text("th", c.label)));
    const body = t.createTBody();
    years.forEach((y, i) => {
      const row = body.insertRow();
      const th = text("th", String(y));
      th.setAttribute("scope", "row");
      row.append(th);
      cols.forEach((c) => {
        const v = c.values[i];
        row.append(text("td", v == null ? "–" : c.fmt(v)));
      });
    });
    return t;
  }

  document.querySelectorAll<HTMLButtonElement>(".table-open").forEach((btn) =>
    btn.addEventListener("click", () => {
      const spec = fullTables[btn.dataset.table ?? ""];
      if (!spec) return;
      $("table-dialog-title").textContent = spec.caption;
      $("table-dialog-body").replaceChildren(table(spec.cols));
      $("table-dialog-body").scrollTo(0, 0);
      dialog.showModal();
    }),
  );
  dialog.querySelector(".dialog-close")!.addEventListener("click", () => dialog.close());
  // A click on the dimmed backdrop lands on the dialog element itself
  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog) dialog.close();
  });

  // ---- Comparison table: the report's start year, growth rates and last two years,
  // shaded against the comparison. `end` is the last year's index, for a source
  // that trails the others. ----
  interface CmpRow { label: string; color: string; mark: "rect" | "line"; values: Values; base: Values | null; total?: boolean }

  interface CmpOpts { end?: number; noCmpNote?: string; per?: "pupil" | "resident" }

  function compareTable(holder: HTMLElement, caption: string, rowLabel: string, rows: CmpRow[], kind: "usd" | "fte", cmp: Named | null,
    { end = last, noCmpNote = "Choose a comparison above to shade this table against it.", per = "pupil" }: CmpOpts = {}) {
    const cName = cmp ? cmp.name : null;
    const fmt = kind === "usd" ? usd : fte;
    const unit = kind === "usd" ? ` $/${per}` : "";
    const prior = end - 1;
    const windows = [end, 10, 5];
    const t = document.createElement("table");
    t.append(text("caption", caption));
    const head = t.createTHead().insertRow();
    const blank = text("th", "");
    blank.className = "swatch-col";
    head.append(blank, text("th", rowLabel, "label-col"), text("th", `${years[0]}${unit}`),
      ...windows.map((n) => text("th", `CAGR ${n}y`)),
      text("th", `${years[prior]}${unit}`), text("th", `${years[end]}${unit}`));

    const sr = (above: boolean) => text("span", above ? " (above comparison)" : " (below comparison)", "sr-only");
    const level = (r: CmpRow, i: number) => {
      const v = r.values[i];
      const td = text("td", v == null ? "—" : fmt(v));
      const b = r.base?.[i];
      if (v != null && b != null && b > 0 && cName) {
        const rel = (v - b) / b;
        const bg = shade(rel, SHADE_BINS_REL);
        td.title = `${cName}: ${fmt(b)} (${rel >= 0 ? "+" : "−"}${Math.abs(rel * 100).toFixed(0)}%)`;
        if (bg) {
          td.style.background = bg;
          td.append(sr(rel > 0));
        }
      }
      return td;
    };
    const growth = (r: CmpRow, n: number) => {
      const g = cagr(r.values[end - n], r.values[end], n);
      const td = text("td", g == null ? "—" : pct(g));
      const gb = r.base ? cagr(r.base[end - n], r.base[end], n) : null;
      if (g != null && gb != null && cName) {
        const delta = g - gb;
        const bg = shade(delta, SHADE_BINS_PP);
        td.title = `${cName}: ${pct(gb)} (${delta >= 0 ? "+" : "−"}${Math.abs(delta * 100).toFixed(1)} pp)`;
        if (bg) {
          td.style.background = bg;
          td.append(sr(delta > 0));
        }
      }
      return td;
    };

    const body = t.createTBody();
    for (const r of rows) {
      const tr = body.insertRow();
      if (r.total) tr.className = "total";
      const sw = document.createElement("td");
      sw.className = "swatch-col";
      if (!r.total) {
        const key = document.createElement("span");
        key.className = `key ${r.mark}`;
        key.style.setProperty("--c", r.color);
        sw.append(key);
      }
      const th = text("th", r.label);
      th.setAttribute("scope", "row");
      tr.append(sw, th, level(r, 0), ...windows.map((n) => growth(r, n)), level(r, prior), level(r, end));
    }

    const note = document.createElement("div");
    note.className = "compare-legend";
    if (cName) {
      const chip = (color: string, label: string) => {
        const s = document.createElement("span");
        s.className = "chip";
        const box = document.createElement("span");
        box.className = "chip-box";
        box.style.background = color;
        s.append(box, text("span", label));
        return s;
      };
      const chips = document.createElement("div");
      chips.className = "chips";
      chips.append(chip(ABOVE_SHADES[2], `Above ${cName}`), chip(BELOW_SHADES[2], `Below ${cName}`));
      note.append(chips, text("p",
        `Shaded where a value differs from ${refName(cmp!)} by 5% or more (${kind === "usd" ? "dollars" : "enrollment"}) ` +
        "or a growth rate by 0.5 percentage points or more; darker shading marks a larger gap. " +
        "Hover a cell for the comparison value. CAGR is the compound annual growth rate, (end\u00a0÷\u00a0start)^(1\u00a0÷\u00a0years)\u00a0−\u00a01."));
    } else {
      note.append(text("p", `${noCmpNote} CAGR is the compound annual growth rate, (end\u00a0÷\u00a0start)^(1\u00a0÷\u00a0years)\u00a0−\u00a01.`));
    }
    // The box takes the table's width; the note stretches to match it
    const box = document.createElement("div");
    box.className = "compare-box";
    box.append(t, note);
    holder.replaceChildren(box);
  }

  // ---- Stat tiles ----
  function tile(label: string, value: string, details: string[]) {
    const div = document.createElement("div");
    div.className = "tile";
    div.append(text("div", label, "tile-label"), text("div", value, "tile-value"));
    details.filter(Boolean).forEach((d) => div.append(text("div", d, "tile-detail")));
    return div;
  }

  // ---- Chart helpers shared by both views ----
  const stackTop = (series: Series[], i: number) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0);
  const fmtUsd = (v: number) => compact(v, "$");
  const yoy = (vals: Values, i: number) =>
    i > 0 && vals[i] != null && vals[i - 1] ? `${pct(vals[i]! / vals[i - 1]! - 1)} from FY${years[i - 1]}` : undefined;
  /** Tooltip for a stacked panel: the total (or the isolated selection), its segments, the comparison. */
  const stackTip = (i: number, shown: Series[], sel: string | null, shownTotal: Values, total: Values,
    overlay: Series | null, trend: Series | null, totalLabel: string, noun: string): TipContent => {
    const money = (v: number | null) => (v == null ? "–" : usd(v));
    const rows: TipRow[] = [];
    const segments = [...shown].reverse().filter((s) => s.values[i] != null && s.values[i]! > 0)
      .map((s) => ({ value: usd(s.values[i]!), label: s.label, color: s.color, mark: "line" as const }));
    if (!sel) {
      rows.push({ value: money(total[i]), label: totalLabel, strong: true }, ...segments);
    } else {
      rows.push({ value: money(shownTotal[i]), label: capital(sel), strong: true });
      if (shown.length > 1) rows.push(...segments);
      rows.push({ value: money(total[i]), label: `${totalLabel}, all ${noun}` });
    }
    rows.push(...trendRow(trend, i));
    if (overlay && overlay.values[i] != null) {
      rows.push({ value: usd(overlay.values[i]!), label: overlay.label, color: COMPARE_COLOR, mark: "line" });
    }
    return { title: `FY${years[i]}`, rows, note: yoy(sel ? shownTotal : total, i) };
  };

  // ---- Render ----
  let lastWidth = 0;
  /** The panel column of the view on screen; every chart is drawn to its width. */
  const panelBox = () => $(state.view === "towns" ? "town-panels" : "panels");

  /** Show the active view's tab, controls and panels. */
  function applyView() {
    const onTowns = state.view === "towns";
    for (const tab of tabs) {
      const on = tab.dataset.view === state.view;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    $("view-panel").setAttribute("aria-labelledby", onTowns ? "tab-towns" : "tab-districts");
    document.querySelectorAll<HTMLElement>("[data-view-only]").forEach((n) => {
      n.hidden = n.dataset.viewOnly !== state.view;
    });
    $("vs-control").hidden = onTowns || state.cmp !== "other";
    $("town-vs-control").hidden = !onTowns || state.tcmp !== "other";
  }

  function render() {
    applyView();
    if (state.view === "districts") {
      renderDistricts();
      restoreFocus();
      return;
    }
    if (towns) {
      renderTowns();
      restoreFocus();
      return;
    }
    // First visit to the Towns tab: fetch, then draw
    $("entity-name").textContent = townsFailed ? "Town data unavailable" : "Loading towns…";
    $("entity-meta").textContent = townsFailed ? "The town data didn't load. Reload the page to try again." : "";
    relations(null);
    $("tiles").replaceChildren();
    if (!townsFailed) loadTowns().then(() => state.view === "towns" && render());
  }

  function renderDistricts() {
    const e = byId.get(state.d)!;
    const c = comparisonFor(e);
    const real = state.usd === "real";
    const dollarsNote = real ? `FY${meta.latest} dollars` : "Nominal dollars";
    const perDistrict = e.kind === "district" ? "" : ", average per district";

    // Comparison menu: shown only for "Another district or average" (applyView)
    if (state.vs) vsSelect.value = state.vs;
    for (const o of vsSelect.options) o.disabled = o.value === e.id;

    // Heading
    $("entity-name").textContent = e.name;
    const bits =
      e.kind === "district"
        ? [e.cohort ? cohortTitle(meta, e.cohort) : "", `${fte(e.fte ?? 0)} in-district FTE in FY${meta.latest}`]
        : [`${e.members} districts`, "averages weighted by enrollment"];
    if (c) bits.push(`compared with ${refName(c)}`);
    else if (state.cmp === "other") bits.push("pick a different district or average to compare with");
    $("entity-meta").textContent = bits.join(" · ");
    // Its towns, each with its contribution and the other districts it funds
    relations(e.towns?.length ? {
      root: e.name,
      note: `${e.regional ? "Member towns" : "Town"} · FY${meta.latest} required local contribution`,
      rows: e.towns.map((t) => ({
        name: viewLink(t.name, { view: "towns", t: t.id }),
        amount: t.contribution,
        extra: t.also.length ? ["also funds", t.also.map((a) => districtName(a, true))] : null,
      })),
    } : null);

    // Series
    const ppe = ppeSeries(e);
    const nss = nssSeries(e);
    const enroll = enrollSeries(e);
    const cPpe = c ? ppeSeries(c) : null;
    const cNss = c ? nssSeries(c) : null;
    const cEnroll = c ? enrollSeries(c) : null;
    const ppeTotal = totals(ppe);
    const nssTotal = actualNss(nss);
    const cPpeTotal = cPpe ? totals(cPpe) : null;
    const cNssTotal = cNss ? actualNss(cNss) : null;
    const cName = c ? c.name : "";

    // Tiles (always whole totals, whatever the legend isolates)
    const g = cagr(ppeTotal[0], ppeTotal[last], span);
    const enrollChange =
      e.enroll.in_district[0] && e.enroll.in_district[last]
        ? e.enroll.in_district[last]! / e.enroll.in_district[0]! - 1
        : null;
    const aid = nss[0].values[last];
    const above = nss[2].values[last];
    const aidShare = aid != null && nssTotal[last] ? aid / nssTotal[last]! : null;
    $("tiles").replaceChildren(
      tile(`Spending per pupil, FY${meta.latest}`, ppeTotal[last] != null ? usd(ppeTotal[last]!) : "–", [
        g != null ? `${pct(g)} a year since FY${meta.start}${real ? ", after inflation" : ""}` : "",
        c && cPpeTotal?.[last] != null ? `${cName}: ${usd(cPpeTotal[last]!)}` : "",
      ]),
      tile(`In-district enrollment, FY${meta.latest}`, e.enroll.in_district[last] != null ? `${fte(e.enroll.in_district[last]!)} FTE` : "–", [
        enrollChange != null ? `${pct(enrollChange)} since FY${meta.start}` : "",
        e.kind === "district" ? "" : "Average per district",
      ]),
      tile(`Chapter 70 aid per foundation pupil, FY${meta.latest}`, aid != null ? usd(aid) : "–", [
        aidShare != null ? `${Math.round(aidShare * 100)}% of actual net school spending` : "",
        cNss && cNss[0].values[last] != null ? `${cName}: ${usd(cNss[0].values[last]!)}` : "",
      ]),
      tile(`Spending above required, FY${meta.latest}`, above != null ? usd(above) : "Not reported", [
        above != null ? "Per foundation pupil" : `DESE has not reported FY${meta.latest} actual spending`,
        cNss && cNss[2].values[last] != null ? `${cName}: ${usd(cNss[2].values[last]!)}` : "",
      ]),
    );

    // Shared dollar scale for both dollar panels while nothing is isolated
    let dollarMax = 0;
    years.forEach((_, i) => {
      dollarMax = Math.max(dollarMax, stackTop(ppe, i), stackTop(nss, i), cPpeTotal?.[i] ?? 0, cNssTotal?.[i] ?? 0);
    });
    const dollarTicks = niceTicks(dollarMax * 1.04);
    const enrollMax = Math.max(...enroll.flatMap((s) => s.values.map((v) => v ?? 0)));
    const enrollTicks = niceTicks(enrollMax * 1.04, 4);

    const width = panelBox().clientWidth;
    lastWidth = width;
    const tall = width < 520 ? 260 : 320;
    const frame = (height: number) => ({ width, height, years });

    // Panel 1: spending by category
    const ppeShown = visible(ppe, "ppe");
    const ppeSel = selectionName(ppeShown, ppe, "categories");
    const ppeShownTotal = totals(ppeShown);
    const cPpeShownTotal = cPpe ? totals(visible(cPpe, "ppe")) : null;
    const ppeOverlayAll = c ? { key: "cmp", label: `${cName}, ${ppeSel ?? "total"}`, color: COMPARE_COLOR, values: cPpeShownTotal! } : null;
    const ppeTrendAll = trendOf(e.name, ppeSel, ppeShownTotal);
    const ppeOverlay = drawn("ppe", "cmp", ppeOverlayAll);
    const ppeTrend = drawn("ppe", "trend", ppeTrendAll);
    $("ppe-sub").textContent =
      `${dollarsNote} per in-district FTE pupil.${lineNote(ppeTrend, ppeOverlay)} ` +
      (ppeSel
        ? `Showing ${ppeShown.length} of ${ppe.length} categories, with the scale fitted to them.`
        : legendHint("categories"));
    const p1 = stackedColumns($("svg-ppe") as unknown as SVGSVGElement, frame(tall), ppeShown, ppeOverlay,
      ppeSel ? fitTicks(ppeShown, ppeOverlay?.values ?? null) : dollarTicks, fmtUsd, setHover,
      { value: ppeShownTotal[last], text: usd }, [], ppeTrend);
    legend($("legend-ppe"), [
      ...ppe.map((s) => ({ key: s.key, label: s.label, color: s.color, mark: "rect" as const })),
      ...lineLegend(ppeTrendAll, ppeOverlayAll),
    ], "ppe");
    compareTable($("cmp-ppe"), `Spending per in-district FTE pupil, ${e.name} (${dollarsNote.toLowerCase()})`, "Category", [
      ...[...ppe].reverse().map((s, k) => ({
        label: s.label, color: s.color, mark: "rect" as const, values: s.values,
        base: cPpe ? cPpe[ppe.length - 1 - k].values : null,
      })),
      { label: "Total", color: "", mark: "rect" as const, values: ppeTotal, base: cPpeTotal, total: true },
    ], "usd", c);
    fullTables.ppe = { caption: `Spending per in-district FTE pupil by category, ${e.name} (${dollarsNote.toLowerCase()})`, cols: [
      ...ppe.map((s) => ({ label: s.label, values: s.values, fmt: usd })),
      { label: "Total", values: ppeTotal, fmt: usd },
      ...(c ? [{ label: `${cName}, total`, values: cPpeTotal!, fmt: usd }] : []),
    ] };

    // Panel 2: enrollment
    $("enroll-sub").textContent = `Full-time-equivalent pupils${perDistrict}. Not adjusted for dollars.`;
    const p2 = lines($("svg-enroll") as unknown as SVGSVGElement, frame(width < 520 ? 200 : 230), enroll, enrollTicks,
      (v) => compact(v), fte, setHover);
    legend($("legend-enroll"), enroll.map((s) => ({ label: s.label, color: s.color, mark: "line" as const })));
    compareTable($("cmp-enroll"), `Enrollment, ${e.name}${perDistrict}`, "Measure",
      enroll.map((s, k) => ({ label: s.label, color: s.color, mark: "line" as const, values: s.values, base: cEnroll ? cEnroll[k].values : null })),
      "fte", c);
    fullTables.enroll = { caption: `Enrollment, ${e.name}${perDistrict}`, cols: enroll.map((s) => ({ label: s.label, values: s.values, fmt: fte })) };

    // Panel 3: Chapter 70 and net school spending
    const nssShown = visible(nss, "nss");
    const nssSel = selectionName(nssShown, nss, "components");
    const showsAbove = nssShown.some((s) => s.key === "above_required");
    const nssShownTotal = nssSel ? strictTotals(nssShown) : nssTotal;
    const cNssShownTotal = cNss ? (nssSel ? strictTotals(visible(cNss, "nss")) : cNssTotal) : null;
    const nssOverlayAll = c
      ? { key: "cmp", label: `${cName}, ${nssSel ?? "actual NSS"}`, color: COMPARE_COLOR, values: cNssShownTotal! }
      : null;
    const nssTrendAll = trendOf(e.name, nssSel ?? "actual NSS", nssShownTotal);
    const nssOverlay = drawn("nss", "cmp", nssOverlayAll);
    const nssTrend = drawn("nss", "trend", nssTrendAll);
    const unreported = showsAbove ? years.filter((_, i) => nss[2].values[i] == null && nss[0].values[i] != null) : [];
    $("nss-sub").textContent =
      `${dollarsNote} per foundation pupil. ` +
      (nssSel
        ? `Showing ${nssShown.length} of ${nss.length} components, with the scale fitted to them.`
        : "Column height is actual net school spending. Select a line in the legend to hide it.") +
      lineNote(nssTrend, nssOverlay) +
      (unreported.length
        ? ` DESE has not reported actual spending for FY${unreported.join(", FY")}, so ${unreported.length > 1 ? "those faded columns stop" : "that faded column stops"} short.`
        : "");
    const p3 = stackedColumns($("svg-nss") as unknown as SVGSVGElement, frame(tall), nssShown, nssOverlay,
      nssSel ? fitTicks(nssShown, nssOverlay?.values ?? null) : dollarTicks, fmtUsd, setHover,
      { value: nssShownTotal[last], text: usd }, years.map((_, i) => showsAbove && nss[2].values[i] == null), nssTrend);
    // The hatch only appears when a shortfall sits on top of other segments
    const hasShortfall = showsAbove && nssShown.length > 1 && nss[2].values.some((v) => v != null && v < 0);
    legend($("legend-nss"), [
      ...nss.map((s) => ({ key: s.key, label: s.label, color: s.color, mark: "rect" as const })),
      ...(hasShortfall ? [{ label: "Below required (shortfall)", color: "#524f45", mark: "hatch" as const }] : []),
      ...lineLegend(nssTrendAll, nssOverlayAll),
    ], "nss");
    compareTable($("cmp-nss"), `Chapter 70 aid and net school spending per foundation pupil, ${e.name} (${dollarsNote.toLowerCase()})`, "Component", [
      ...[...nss].reverse().map((s, k) => ({
        label: s.label, color: s.color, mark: "rect" as const, values: s.values,
        base: cNss ? cNss[nss.length - 1 - k].values : null,
      })),
      { label: "Actual net school spending", color: "", mark: "rect" as const, values: nssTotal, base: cNssTotal, total: true },
    ], "usd", c);
    fullTables.nss = { caption: `Chapter 70 aid and net school spending per foundation pupil, ${e.name} (${dollarsNote.toLowerCase()})`, cols: [
      ...nss.map((s) => ({ label: s.label, values: s.values, fmt: usd })),
      { label: "Actual NSS", values: nssTotal, fmt: usd },
      ...(c ? [{ label: `${cName}, actual NSS`, values: cNssTotal!, fmt: usd }] : []),
    ] };

    // Panel 4: revenue by source, from Census figures that end a year or more
    // before DESE's, for regional districts and averages of enough of them.
    // Its own scale: revenue pays for more than the spending measure counts.
    const rev = revSeries(e);
    const revYears = meta.revenue;
    $("rev-body").hidden = !rev;
    $("rev-none").hidden = !!rev;
    let p4: Panel | null = null;
    let revTip: ((i: number) => TipContent) | null = null;
    if (!rev || !revYears) {
      $("rev-sub").textContent = "";
      $("rev-none").textContent = noRevenue(e);
      delete fullTables.rev;
    } else {
      const end = years.indexOf(revYears.latest);
      const cRev = c ? revSeries(c) : null;
      const cRevName = c && cRev ? revName(c) : "";
      const revTotal = totals(rev);
      const cRevTotal = cRev ? totals(cRev) : null;
      const revShown = visible(rev, "rev");
      const revSel = selectionName(revShown, rev, "sources");
      const revShownTotal = totals(revShown);
      const cRevShownTotal = cRev ? totals(visible(cRev, "rev")) : null;
      const revOverlayAll = cRev ? { key: "cmp", label: `${cRevName}, ${revSel ?? "total"}`, color: COMPARE_COLOR, values: cRevShownTotal! } : null;
      const revTrendAll = trendOf(e.name, revSel, revShownTotal);
      const revOverlay = drawn("rev", "cmp", revOverlayAll);
      const revTrend = drawn("rev", "trend", revTrendAll);
      $("rev-sub").textContent =
        `${dollarsNote} per in-district FTE pupil${e.kind === "district" ? "" : `, pooled over its ${e.rev_members} regional districts`}. ` +
        `Census figures, FY${revYears.first}–FY${revYears.latest}${revYears.latest < meta.latest ? `; FY${meta.latest} is not out yet` : ""}.` +
        lineNote(revTrend, revOverlay) + (c && !cRev ? ` No comparison line: ${refName(c)} has no revenue chart.` : "") + " " +
        (revSel ? `Showing ${revShown.length} of ${rev.length} sources, with the scale fitted to them.` : legendHint("sources"));
      let revMax = 0;
      years.forEach((_, i) => (revMax = Math.max(revMax, stackTop(rev, i), cRevTotal?.[i] ?? 0)));
      p4 = stackedColumns($("svg-rev") as unknown as SVGSVGElement, frame(tall), revShown, revOverlay,
        revSel ? fitTicks(revShown, revOverlay?.values ?? null) : niceTicks(revMax * 1.04), fmtUsd, setHover,
        { value: revShownTotal[end], text: usd, index: end }, [], revTrend);
      legend($("legend-rev"), [
        ...rev.map((s) => ({ key: s.key, label: s.label, color: s.color, mark: "rect" as const })),
        ...lineLegend(revTrendAll, revOverlayAll),
      ], "rev");
      compareTable($("cmp-rev"), `Revenue per in-district FTE pupil, ${e.name} (${dollarsNote.toLowerCase()})`, "Source", [
        ...[...rev].reverse().map((s, k) => ({
          label: s.label, color: s.color, mark: "rect" as const, values: s.values,
          base: cRev ? cRev[rev.length - 1 - k].values : null,
        })),
        { label: "Total", color: "", mark: "rect" as const, values: revTotal, base: cRevTotal, total: true },
      ], "usd", cRev ? { ...c!, name: cRevName } : null, {
        end, noCmpNote: c ? `${capital(refName(c))} has no revenue figures to shade this table against.` : undefined,
      });
      fullTables.rev = { caption: `Revenue per in-district FTE pupil by source, ${e.name} (${dollarsNote.toLowerCase()})`, cols: [
        ...rev.map((s) => ({ label: s.label, values: s.values, fmt: usd })),
        { label: "Total", values: revTotal, fmt: usd },
        ...(cRev ? [{ label: `${cRevName}, total`, values: cRevTotal!, fmt: usd }] : []),
      ] };
      revTip = (i) => revTotal[i] == null
        ? { title: `FY${years[i]}`, rows: [{ value: "–", label: "Not yet published by Census" }] }
        : stackTip(i, revShown, revSel, revShownTotal, revTotal, revOverlay, revTrend, "Total revenue per pupil", "sources");
    }

    // Tooltips
    panels = [
      {
        panel: p1, figure: $("fig-ppe"),
        tip: (i) => stackTip(i, ppeShown, ppeSel, ppeShownTotal, ppeTotal, ppeOverlay, ppeTrend, "Total per pupil", "categories"),
      },
      {
        panel: p2, figure: $("fig-enroll"),
        tip: (i) => ({
          title: `FY${years[i]}`,
          rows: enroll.filter((s) => s.values[i] != null)
            .map((s) => ({ value: fte(s.values[i]!), label: s.label, color: s.color, mark: "line" as const })),
          note: perDistrict ? "Average per district" : undefined,
        }),
      },
      {
        panel: p3, figure: $("fig-nss"),
        tip: (i) => {
          const required = (nss[0].values[i] ?? 0) + (nss[1].values[i] ?? 0);
          const reported = nss[2].values[i] != null;
          return {
            title: `FY${years[i]}`,
            rows: [
              { value: reported ? usd(nssTotal[i]!) : "Not reported", label: "Actual net school spending", strong: true },
              ...(reported ? [{ value: usd(nss[2].values[i]!), label: nss[2].values[i]! < 0 ? "Below required" : nss[2].label, color: nss[2].color, mark: "line" as const }] : []),
              { value: usd(required), label: "Required net school spending" },
              { value: nss[1].values[i] != null ? usd(nss[1].values[i]!) : "–", label: nss[1].label, color: nss[1].color, mark: "line" as const },
              { value: nss[0].values[i] != null ? usd(nss[0].values[i]!) : "–", label: nss[0].label, color: nss[0].color, mark: "line" as const },
              ...trendRow(nssTrend, i),
              ...(nssOverlay && nssOverlay.values[i] != null ? [{ value: usd(nssOverlay.values[i]!), label: nssOverlay.label, color: COMPARE_COLOR, mark: "line" as const }] : []),
            ],
          };
        },
      },
      ...(p4 && revTip ? [{ panel: p4, figure: $("fig-rev"), tip: revTip }] : []),
    ];
    if (hovered != null) setHover(null, null);

  }

  /** Keep keyboard focus on the legend button that was just pressed. */
  function restoreFocus() {
    if (!refocus) return;
    const { panel, key } = refocus;
    refocus = null;
    document.querySelector<HTMLButtonElement>(`#legend-${panel} [data-key="${CSS.escape(key)}"]`)?.focus();
  }

  // ---- Relations: the selected district's towns or the selected town's districts, as an
  // outline in the controls box. Names link across the tabs. ----
  const DISTRICT_KIND = { town: "town district", regional: "regional", vocational: "vocational" } as const;

  /** A district's name, linked when it is in the explorer, optionally with its kind. */
  function districtName(d: TownDistrict, withKind: boolean): HTMLElement {
    const span = document.createElement("span");
    span.append(d.id ? viewLink(d.name, { view: "districts", d: d.id }) : d.name);
    if (withKind) span.append(` (${DISTRICT_KIND[d.kind]})`);
    return span;
  }

  /** Names separated by commas; past seven, the first six and a button for the rest. */
  function nameList(items: HTMLElement[]): HTMLElement {
    const list = document.createElement("span");
    const show = (n: number) => {
      list.replaceChildren();
      items.slice(0, n).forEach((it, k) => list.append(...(k ? [", ", it] : [it])));
      if (n < items.length) {
        const more = text("button", `and ${items.length - n} more`, "rel-more") as HTMLButtonElement;
        more.type = "button";
        more.addEventListener("click", () => show(items.length));
        list.append(" ", more);
      }
    };
    show(items.length > 7 ? 6 : items.length);
    return list;
  }

  interface RelRow { name: HTMLElement; kind?: string; amount: number | null; extra: [string, HTMLElement[]] | null }

  function relations(spec: { root: string; note: string; rows: RelRow[] } | null) {
    const box = $("relations");
    box.hidden = !spec;
    if (!spec) {
      box.replaceChildren();
      return;
    }
    const head = document.createElement("div");
    head.className = "rel-head";
    head.append(text("strong", spec.root), text("span", spec.note, "rel-note"));
    const tree = document.createElement("ul");
    tree.className = "rel-tree";
    for (const r of spec.rows) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "rel-name";
      name.append(r.name);
      li.append(name);
      if (r.kind != null) li.append(text("span", r.kind, "rel-kind"));
      li.append(text("span", r.amount != null ? millions(r.amount) : "–", "rel-amt"));
      if (r.extra) {
        const extra = document.createElement("span");
        extra.className = "rel-extra";
        extra.append(`${r.extra[0]} `, nameList(r.extra[1]));
        li.append(extra);
      }
      tree.append(li);
    }
    box.replaceChildren(head, tree);
  }

  // ---- Town view ----
  const count = (v: number) => Math.round(v).toLocaleString("en-US");
  const share = (part: Val, whole: Val) => (part != null && whole ? part / whole : null);
  const percent = (v: number) => `${Math.round(v * 100)}%`;
  /** Index of the latest year with a value, for towns that have not filed recently. */
  const lastWith = (vals: Values) => {
    for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return i;
    return last;
  };

  interface TownStack {
    key: "tspend" | "trev";
    name: string;
    series: Series[];
    cSeries: Series[] | null;
    cmp: Town | null;
    noun: string;
    rowLabel: string;
    caption: string;
    sub: string;
    totalLabel: string;
    end: number;
    width: number;
  }

  /** A stacked town panel (spending or revenue): chart, legend, tables; returns it with its tooltip. */
  function townStack(s: TownStack, dollarsNote: string) {
    const total = totals(s.series);
    const cTotal = s.cSeries ? totals(s.cSeries) : null;
    const shown = visible(s.series, s.key);
    const sel = selectionName(shown, s.series, s.noun);
    const shownTotal = totals(shown);
    const cShownTotal = s.cSeries ? totals(visible(s.cSeries, s.key)) : null;
    const overlayAll = s.cmp && cShownTotal
      ? { key: "cmp", label: `${s.cmp.name}, ${sel ?? "total"}`, color: COMPARE_COLOR, values: cShownTotal }
      : null;
    const trendAll = trendOf(s.name, sel, shownTotal);
    const overlay = drawn(s.key, "cmp", overlayAll);
    const trend = drawn(s.key, "trend", trendAll);
    $(`${s.key}-sub`).textContent = `${s.sub}${lineNote(trend, overlay)} ` +
      (sel ? `Showing ${shown.length} of ${s.series.length} ${s.noun}, with the scale fitted to them.`
        : legendHint(s.noun));
    let max = 0;
    years.forEach((_, i) => (max = Math.max(max, stackTop(s.series, i), cTotal?.[i] ?? 0)));
    const panel = stackedColumns($(`svg-${s.key}`) as unknown as SVGSVGElement,
      { width: s.width, height: s.width < 520 ? 260 : 320, years }, shown, overlay,
      sel ? fitTicks(shown, overlay?.values ?? null) : niceTicks(max * 1.04), fmtUsd, setHover,
      { value: shownTotal[s.end], text: usd, index: s.end }, [], trend);
    legend($(`legend-${s.key}`), [
      ...s.series.map((x) => ({ key: x.key, label: x.label, color: x.color, mark: "rect" as const })),
      ...lineLegend(trendAll, overlayAll),
    ], s.key);
    compareTable($(`cmp-${s.key}`), `${s.caption}, ${s.name} (${dollarsNote.toLowerCase()})`, s.rowLabel, [
      ...[...s.series].reverse().map((x, k) => ({
        label: x.label, color: x.color, mark: "rect" as const, values: x.values,
        base: s.cSeries ? s.cSeries[s.series.length - 1 - k].values : null,
      })),
      { label: "Total", color: "", mark: "rect" as const, values: total, base: cTotal, total: true },
    ], "usd", s.cmp, { end: s.end, per: "resident" });
    fullTables[s.key] = { caption: `${s.caption} by year, ${s.name} (${dollarsNote.toLowerCase()})`, cols: [
      ...s.series.map((x) => ({ label: x.label, values: x.values, fmt: usd })),
      { label: "Total", values: total, fmt: usd },
      ...(s.cmp && cTotal ? [{ label: `${s.cmp.name}, total`, values: cTotal, fmt: usd }] : []),
    ] };
    const tip = (i: number): TipContent => total[i] == null
      ? { title: `FY${years[i]}`, rows: [{ value: "–", label: "Not filed with the state" }] }
      : stackTip(i, shown, sel, shownTotal, total, overlay, trend, s.totalLabel, s.noun);
    return { panel, tip, total, cTotal };
  }

  function renderTowns() {
    const t = townById.get(state.t)!;
    const c = townComparison(t);
    const real = state.usd === "real";
    const dollarsNote = real ? `FY${meta.latest} dollars` : "Nominal dollars";
    townSelect.value = t.id;
    townCompareSelect.value = state.tcmp;
    if (state.tvs) townVsSelect.value = state.tvs;
    for (const o of townVsSelect.options) o.disabled = o.value === t.id;

    const spend: Series[] = TOWN_SPEND_SERIES.map((s) => ({ ...s, values: deflate(t.spend[s.key]) }));
    const rev: Series[] = TOWN_REV_SERIES.map((s) => ({ ...s, values: deflate(t.rev[s.key]) }));
    const cSpend: Series[] | null = c ? TOWN_SPEND_SERIES.map((s) => ({ ...s, values: deflate(c.spend[s.key]) })) : null;
    const cRev: Series[] | null = c ? TOWN_REV_SERIES.map((s) => ({ ...s, values: deflate(c.rev[s.key]) })) : null;
    const spendTotal = totals(spend);
    const end = lastWith(spendTotal);
    const fy = years[end];
    const unfiled = years.filter((_, i) => spendTotal[i] == null);

    // Heading
    $("entity-name").textContent = t.name;
    const popNow = t.pop[last];
    const peer = t.peer ? townById.get(t.peer) : undefined;
    const bits = t.kind === "town"
      ? [`${t.county} County`, `${popNow != null ? count(popNow) : "–"} residents (July ${meta.latest - 1} estimate)`]
      : t.label
        ? [`${t.members} towns with ${t.label} in July ${towns!.meta.peer_year}`, "pooled per resident"]
        : [`${t.members} towns, pooled per resident`, `${towns!.meta.excluded.join(", ")} not included`];
    if (c) bits.push(`compared with ${refName(c)}`);
    else if (state.tcmp === "other") bits.push("pick a different town to compare with");
    $("entity-meta").textContent = bits.join(" · ");
    // Its school districts, with what Chapter 70 requires the town to contribute to each
    // and the towns it shares them with
    relations(t.districts?.length ? {
      root: t.name,
      note: `School districts · FY${towns!.meta.members_fy} required local contribution`,
      rows: t.districts.map((d) => ({
        name: districtName(d, false),
        kind: DISTRICT_KIND[d.kind],
        amount: d.contribution,
        extra: d.with.length
          ? ["shared with", d.with.map((w) => (w.id ? viewLink(w.name, { view: "towns", t: w.id }) : text("span", w.name)))]
          : null,
      })),
    } : null);

    // Tiles (always whole totals, whatever the legends isolate)
    const cSpendTotal = cSpend ? totals(cSpend) : null;
    const revTotal = totals(rev);
    const cRevTotal = cRev ? totals(cRev) : null;
    const g = cagr(spendTotal[0], spendTotal[end], end);
    const eduShare = share(spend[0].values[end], spendTotal[end]);
    const cEduShare = cSpend ? share(cSpend[0].values[end], cSpendTotal![end]) : null;
    const taxShare = share(rev[0].values[end], revTotal[end]);
    const cTaxShare = cRev ? share(cRev[0].values[end], cRevTotal![end]) : null;
    const popChange = t.pop[0] && popNow ? popNow / t.pop[0] - 1 : null;
    const allDollars = deflate(t.spend_total)[end];
    $("tiles").replaceChildren(
      tile(`General fund spending per resident, FY${fy}`, spendTotal[end] != null ? usd(spendTotal[end]!) : "–", [
        g != null ? `${pct(g)} a year since FY${meta.start}${real ? ", after inflation" : ""}` : "",
        t.kind === "town" && allDollars != null ? `${millions(allDollars)} in all` : "",
        c && cSpendTotal?.[end] != null ? `${c.name}: ${usd(cSpendTotal[end]!)}` : "",
      ]),
      tile(`Education's share of spending, FY${fy}`, eduShare != null ? percent(eduShare) : "–", [
        spend[0].values[end] != null ? `${usd(spend[0].values[end]!)} per resident` : "",
        c && cEduShare != null ? `${c.name}: ${percent(cEduShare)}` : "",
      ]),
      tile(`Taxes' share of revenue, FY${fy}`, taxShare != null ? percent(taxShare) : "–", [
        rev[0].values[end] != null ? `${usd(rev[0].values[end]!)} per resident` : "",
        c && cTaxShare != null ? `${c.name}: ${percent(cTaxShare)}` : "",
      ]),
      tile(`${t.kind === "town" ? "Population" : "Combined population"}, July ${meta.latest - 1}`, popNow != null ? count(popNow) : "–", [
        popChange != null ? `${pct(popChange)} since July ${meta.start - 1}` : "",
        t.kind === "average" ? "Census Bureau estimates" : peer?.label ? `Peer group: towns with ${peer.label}` : "Not in a peer group",
      ]),
    );

    const width = panelBox().clientWidth;
    lastWidth = width;
    const filed = unfiled.length ? ` ${t.name} has not filed Schedule A for FY${unfiled.join(" or FY")}.` : "";

    // Panel 1: spending by function
    const p1 = townStack({
      key: "tspend", name: t.name, series: spend, cSeries: cSpend, cmp: c, noun: "functions", rowLabel: "Function",
      caption: "General fund spending per resident", totalLabel: "Total per resident", end, width,
      sub: `${dollarsNote} per resident, as ${t.kind === "town" ? "the town" : "each town"} reported it to the state ` +
        `Division of Local Services (Schedule A).${filed}`,
    }, dollarsNote);

    // Panel 2: revenue by source
    const p2 = townStack({
      key: "trev", name: t.name, series: rev, cSeries: cRev, cmp: c, noun: "sources", rowLabel: "Source",
      caption: "General fund revenue per resident", totalLabel: "Total per resident", end, width,
      sub: `${dollarsNote} per resident.${filed}`,
    }, dollarsNote);

    // Panel 3: population, the denominator of the two dollar panels
    const popLabel = t.kind === "town" ? "Residents" : "Combined residents";
    const pop: Series[] = [{ key: "pop", label: popLabel, color: POP_COLOR, values: t.pop }];
    $("tpop-sub").textContent = t.kind === "town"
      ? "Census Bureau estimates for July 1 at the start of each fiscal year (FY2021: April 1, 2020). The dollar charts divide by these."
      : `All ${t.members} towns combined. The dollar charts pool the towns that filed each year.`;
    const popMax = Math.max(...t.pop.map((v) => v ?? 0));
    const p3 = lines($("svg-tpop") as unknown as SVGSVGElement, { width, height: width < 520 ? 200 : 230, years }, pop,
      niceTicks(popMax * 1.04, 4), (v) => compact(v), count, setHover);
    legend($("legend-tpop"), [{ label: popLabel, color: POP_COLOR, mark: "line" }]);
    fullTables.tpop = { caption: `Population, ${t.name}`, cols: [
      { label: popLabel, values: t.pop, fmt: count },
      ...(c ? [{ label: c.kind === "town" ? c.name : `${c.name}, combined`, values: c.pop, fmt: count }] : []),
    ] };

    panels = [
      { panel: p1.panel, figure: $("fig-tspend"), tip: p1.tip },
      { panel: p2.panel, figure: $("fig-trev"), tip: p2.tip },
      {
        panel: p3, figure: $("fig-tpop"),
        // FY2021 uses the April 2020 estimates base (update_census_data.py)
        tip: (i) => ({
          title: `FY${years[i]}`,
          rows: [{ value: t.pop[i] != null ? count(t.pop[i]!) : "–", label: popLabel, color: POP_COLOR, mark: "line" }],
          note: years[i] === 2021 ? "April 1, 2020 estimate" : `July 1, ${years[i] - 1} estimate`,
        }),
      },
    ];
    if (hovered != null) setHover(null, null);
  }

  // Plain-language note on the two dollar modes, with a worked example from the index
  const factor = meta.cpi[String(meta.latest)] / meta.cpi[String(meta.start)];
  $("dollars-note").replaceChildren(
    text("strong", "Nominal dollars"),
    ` are the amounts reported each year, with no adjustment for inflation. `,
    text("strong", `FY${meta.latest} dollars`),
    ` restate every year in what a dollar bought in FY${meta.latest}, using the Northeast consumer price index: ` +
      `$1,000 spent in FY${meta.start} is about ${usd(1000 * factor)} in FY${meta.latest} dollars. ` +
      "Use them to see whether spending grew faster than prices.",
  );

  render();
  ["svg-ppe", "svg-enroll", "svg-nss", "svg-rev", "svg-tspend", "svg-trev", "svg-tpop"]
    .forEach((id) => keyboard($(id) as unknown as SVGSVGElement));
  root.classList.remove("is-loading");

  // Redraw at a new width; the root, because the hidden view's panels measure 0
  new ResizeObserver(() => {
    const w = panelBox().clientWidth;
    if (w > 0 && Math.abs(w - lastWidth) > 4) requestAnimationFrame(render);
  }).observe(root);
}
