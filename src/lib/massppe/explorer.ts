/// <reference types="vite/client" />
// The Massachusetts school spending explorer: a district view and a town view.
// Data: src/data/massppe/, written by the report pipeline (github.com/timshores/schools,
// ppe_report/export_explorer_data.py). explorer.json and towns.json list every
// district, town and average; each region's full data is its own file under
// districts/ and towns/, imported the first time something in it is shown. Imported
// rather than fetched, the data ships as hashed JavaScript chunks, which the host
// compresses (it sends .json uncompressed).

import { compact, lines, niceTicks, niceTicksRange, stackedColumns, type Panel, type Series, type Val } from "./charts";

type Values = Val[];

/** Ids to compare with, one per "Compare with" choice; null where there is none */
type CmpIds = Partial<Record<"cohort" | "cohort_state" | "region" | "state", string | null>>;
type TownCmpIds = Partial<Record<"peer" | "peer_state" | "region" | "state", string | null>>;

/** A district or a district average, from its region's file */
interface Entity {
  id: string;
  name: string;
  kind: "district" | "average";
  /** Districts: traditional, vocational or charter */
  type?: "traditional" | "vocational" | "charter";
  /** Averages: statewide, a region, a cohort statewide, or a cohort within a region */
  scope?: "state" | "region" | "cohort" | "region-cohort";
  cohort: string | null;
  region: string | null;
  members?: number;
  fte?: number;
  cmp: CmpIds;
  chunk: string;
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
  towns_kind?: "members" | "town";
}

/** What the menus need to know of a district or average before its file loads */
interface Listed {
  id: string;
  name: string;
  chunk: string;
  cohort: string | null;
  region: string | null;
  type?: "traditional" | "vocational" | "charter";
  scope?: string;
  regional?: boolean;
  fte?: number;
}

/** A town or a town average, from its region's file */
interface Town {
  id: string;
  name: string;
  kind: "town" | "average";
  county?: string | null;
  region: string | null;
  /** Towns: the id of its statewide peer group's average (none for the cities that stand apart) */
  peer?: string | null;
  scope?: string;
  members?: number;
  /** Peer group averages: mid-sentence name, and the population range */
  ref?: string;
  label?: string;
  cmp: TownCmpIds;
  chunk: string;
  /** Residents: the town's, or the average's combined population */
  pop: Values;
  /** General fund spending by function and revenue by source, per resident */
  spend: Record<string, Values>;
  rev: Record<string, Values>;
  /** Dollars, all towns combined for an average */
  spend_total: Values;
  rev_total: Values;
  /** Its school districts, each with the town's required contribution and the district's other member towns */
  districts?: (TownDistrict & { contribution: number | null; with: { name: string; id: string | null }[] })[];
}

interface ListedTown { id: string; name: string; chunk: string; region: string | null; county?: string | null; peer?: string | null; scope?: string }

/** A school district a town belongs to; id is null for districts outside the explorer */
interface TownDistrict { name: string; id: string | null; kind: "town" | "regional" | "vocational" }

interface TownData {
  meta: {
    years: number[]; latest: number; members_fy: number; regions: Record<string, string>;
    apart: string[]; peer_year: number; peers: { id: string; label: string }[];
  };
  averages: ListedTown[];
  towns: ListedTown[];
}

/** What a comparison needs: a name, whether it reads with "the", or its own mid-sentence name */
interface Named { name: string; kind: string; ref?: string }

interface Meta {
  years: number[];
  latest: number;
  start: number;
  categories: string[];
  cohorts: Record<string, { label: string; short: string; range: [number, number | null] | null }>;
  regions: Record<string, string>;
  cpi: Record<string, number>;
  /** Census revenue years, which trail the DESE years */
  revenue: { first: number; latest: number; min_members: number } | null;
}

interface Data {
  meta: Meta;
  averages: Listed[];
  districts: Listed[];
}

type Compare = "none" | "cohort" | "cohort-state" | "region" | "state" | "other";
type TownCompare = "none" | "peer" | "peer-state" | "region" | "state" | "other";
type Dollars = "nominal" | "real";
type View = "districts" | "towns";
type StackPanel = "ppe" | "nss" | "rev" | "tspend" | "trev";
/** The two lines a stacked chart can draw over its columns */
type Line = "trend" | "cmp";

// Each comparison choice, as the ids to try in order: "Its cohort in its region" falls
// back to the statewide cohort where a region has too few districts of that size
const CHAIN = { cohort: ["cohort", "cohort_state"], "cohort-state": ["cohort_state"], region: ["region"], state: ["state"] } as const;
const TOWN_CHAIN = { peer: ["peer", "peer_state"], "peer-state": ["peer_state"], region: ["region"], state: ["state"] } as const;
const COMPARES: Compare[] = ["none", "cohort", "cohort-state", "region", "state", "other"];
const TOWN_COMPARES: TownCompare[] = ["none", "peer", "peer-state", "region", "state", "other"];
// Ids and choices from before the statewide explorer, so old links still open
const ALIASES: Record<string, string> = { "western-ma": "region-western", "western-towns": "towns-region-western" };
const CHOICE_ALIASES: Record<string, string> = { western: "region" };
// Where remembered choices live (localStorage, with permission): this browser only
const STORE = "mass-school-spending:choices";
const CONSENT = "mass-school-spending:remember";

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
  const years = meta.years;
  const last = years.length - 1;
  const span = meta.latest - meta.start;

  // ---- Data, loaded a region at a time ----
  const listed = new Map<string, Listed>([...data.districts, ...data.averages].map((e) => [e.id, e]));
  const byId = new Map<string, Entity>();
  const districtFiles = import.meta.glob<{ default: { entities: Entity[] } }>("../../data/massppe/districts/*.json");
  const loaded = new Set<string>();
  async function ensure(ids: (string | null | undefined)[]) {
    const chunks = new Set(ids.flatMap((id) => (id && listed.has(id) ? [listed.get(id)!.chunk] : [])));
    await Promise.all([...chunks].filter((c) => !loaded.has(c)).map(async (c) => {
      const file = (await districtFiles[`../../data/massppe/districts/${c}.json`]()).default;
      file.entities.forEach((e) => byId.set(e.id, e));
      loaded.add(c);
    }));
  }

  // ---- Remembered choices: in this browser only, and only with permission ----
  const storage = {
    get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
    drop: (k: string) => { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
  };
  let consent = storage.get(CONSENT); // "yes", "no", or never asked
  type Saved = { state?: Record<string, string | null>; isolated?: Record<string, string[]>; hidden?: Record<string, string[]> };
  let saved: Saved | null = null;
  // A link's own settings win; saved choices fill in a plain visit
  if (!location.search && consent === "yes") {
    try { saved = JSON.parse(storage.get(STORE) ?? "null"); } catch { saved = null; }
  }

  // ---- State: the link's, else the saved choices, else the defaults ----
  const params = new URLSearchParams(location.search);
  const src: Record<string, string | null | undefined> = location.search ? Object.fromEntries(params) : saved?.state ?? {};
  const pickId = (v: string | null | undefined) => (v ? ALIASES[v] ?? v : null);
  const oneOf = <T extends string>(v: string | null | undefined, allowed: T[], fallback: T): T => {
    const c = v ? CHOICE_ALIASES[v] ?? v : null;
    return allowed.includes(c as T) ? (c as T) : fallback;
  };
  const state = {
    d: listed.has(pickId(src.d) ?? "") ? pickId(src.d)! : "leverett",
    cmp: oneOf(src.cmp, COMPARES, "none"),
    // The entity picked in the second menu when comparing with another district or average
    vs: listed.has(pickId(src.vs) ?? "") ? pickId(src.vs) : null as string | null,
    usd: (src.usd === "real" ? "real" : "nominal") as Dollars,
    view: (src.view === "towns" ? "towns" : "districts") as View,
    // Town view: checked against the town list once towns.json loads
    t: pickId(src.t) ?? "leverett",
    tcmp: oneOf(src.tcmp, TOWN_COMPARES, "none"),
    tvs: pickId(src.tvs),
  };
  if (state.cmp === "other" && !state.vs) state.cmp = "none";
  // Legend selections; empty means every segment shows. Kept across districts so
  // one category can be followed from district to district.
  const isolated: Record<StackPanel, Set<string>> = {
    ppe: new Set(saved?.isolated?.ppe), nss: new Set(saved?.isolated?.nss), rev: new Set(saved?.isolated?.rev),
    tspend: new Set(saved?.isolated?.tspend), trev: new Set(saved?.isolated?.trev),
  };
  // Lines hidden from each chart's legend; both show until clicked off
  const hidden = (k: string) => new Set((saved?.hidden?.[k] ?? []).filter((l): l is Line => l === "trend" || l === "cmp"));
  const hiddenLines: Record<StackPanel, Set<Line>> = {
    ppe: hidden("ppe"), nss: hidden("nss"), rev: hidden("rev"), tspend: hidden("tspend"), trev: hidden("trev"),
  };

  function remember() {
    if (consent !== "yes") return;
    const sets = (r: Record<string, Set<string>>) => Object.fromEntries(Object.entries(r).map(([k, s]) => [k, [...s]]));
    storage.set(STORE, JSON.stringify({ state, isolated: sets(isolated), hidden: sets(hiddenLines) }));
  }
  // The question comes once, after someone first changes something, so there is
  // something to remember
  let asked = false;
  function askToRemember() {
    if (consent || asked) return;
    asked = true;
    $("remember-prompt").hidden = false;
  }
  function setConsent(answer: "yes" | "no") {
    consent = answer;
    storage.set(CONSENT, answer);
    if (answer === "yes") remember();
    else storage.drop(STORE);
    $("remember-prompt").hidden = true;
    rememberNote();
  }
  function rememberNote() {
    const btn = text("button", consent === "yes" ? "Forget them" : "Remember them", "link-button") as HTMLButtonElement;
    btn.type = "button";
    btn.addEventListener("click", () => setConsent(consent === "yes" ? "no" : "yes"));
    $("remember-note").replaceChildren(consent === "yes"
      ? "This page remembers your choices in this browser, and sends them nowhere. "
      : "This page can remember your choices in this browser, so it reopens where you left off. ", btn);
  }
  $("remember-yes").addEventListener("click", () => setConsent("yes"));
  $("remember-no").addEventListener("click", () => setConsent("no"));
  rememberNote();

  // Town data, imported the first time the Towns tab opens, then a region at a time
  let towns: TownData | null = null;
  let townListed = new Map<string, ListedTown>();
  const townById = new Map<string, Town>();
  const townFiles = import.meta.glob<{ default: { towns: Town[] } }>("../../data/massppe/towns/*.json");
  const townLoaded = new Set<string>();
  let townsFailed = false;
  async function loadTowns() {
    if (towns || townsFailed) return;
    try {
      towns = (await import("../../data/massppe/towns.json")).default as unknown as TownData;
    } catch {
      townsFailed = true;
      return;
    }
    townListed = new Map([...towns.towns, ...towns.averages].map((x) => [x.id, x]));
    if (!townListed.has(state.t)) state.t = "leverett";
    if (state.tvs && !townListed.has(state.tvs)) state.tvs = null;
    if (state.tcmp === "other" && !state.tvs) state.tcmp = "none";
    for (const sel of [townSelect, townVsSelect]) fillTowns(sel);
    townSelect.value = state.t;
    townCompareSelect.value = state.tcmp;
    if (state.tvs) townVsSelect.value = state.tvs;
  }
  async function ensureTowns(ids: (string | null | undefined)[]) {
    const chunks = new Set(ids.flatMap((id) => (id && townListed.has(id) ? [townListed.get(id)!.chunk] : [])));
    await Promise.all([...chunks].filter((c) => !townLoaded.has(c)).map(async (c) => {
      const file = (await townFiles[`../../data/massppe/towns/${c}.json`]()).default;
      file.towns.forEach((x) => townById.set(x.id, x));
      townLoaded.add(c);
    }));
  }

  // ---- Controls ----
  /** An option group, skipped when empty */
  function addGroup(sel: HTMLSelectElement, label: string, items: { id: string; name: string }[]) {
    if (!items.length) return;
    const group = document.createElement("optgroup");
    group.label = label;
    items.forEach((e) => group.append(new Option(e.name, e.id)));
    sel.append(group);
  }
  const regions = Object.entries(meta.regions);
  // The district menu and its duplicate for comparisons: districts by region and type, then averages
  function fillEntities(sel: HTMLSelectElement) {
    const traditional = data.districts.filter((d) => d.type === "traditional");
    regions.forEach(([rk, rl]) => addGroup(sel, `${rl} districts`, traditional.filter((d) => d.region === rk)));
    addGroup(sel, "Other districts", traditional.filter((d) => !d.region));
    addGroup(sel, "Vocational and technical districts", data.districts.filter((d) => d.type === "vocational"));
    addGroup(sel, "Charter schools", data.districts.filter((d) => d.type === "charter"));
    addGroup(sel, "Statewide averages", data.averages.filter((a) => !a.region));
    regions.forEach(([rk, rl]) => addGroup(sel, `${rl} averages`, data.averages.filter((a) => a.region === rk)));
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
  if (state.vs) vsSelect.value = state.vs;
  dollarInputs.forEach((r) => (r.checked = r.value === state.usd));
  select.addEventListener("change", () => update({ d: select.value }));
  compareSelect.addEventListener("change", () => {
    const cmp = compareSelect.value as Compare;
    // Start the second menu on whatever was being compared, so nothing jumps
    const vs = cmp === "other" && !state.vs ? (comparisonId(byId.get(state.d)) ?? "statewide") : state.vs;
    update({ cmp, vs });
  });
  vsSelect.addEventListener("change", () => update({ vs: vsSelect.value }));
  dollarInputs.forEach((r) => r.addEventListener("change", () => r.checked && update({ usd: r.value as Dollars })));

  // Town controls: towns by county, then averages
  const townSelect = $<HTMLSelectElement>("pick-town");
  const townVsSelect = $<HTMLSelectElement>("pick-town-vs");
  const townCompareSelect = $<HTMLSelectElement>("pick-town-compare");
  function fillTowns(sel: HTMLSelectElement) {
    sel.replaceChildren();
    const counties = [...new Set(towns!.towns.map((x) => x.county ?? "Other"))].sort();
    counties.forEach((c) => addGroup(sel, `${c} County`, towns!.towns.filter((x) => (x.county ?? "Other") === c)));
    addGroup(sel, "Statewide averages", towns!.averages.filter((a) => !a.region));
    regions.forEach(([rk, rl]) => addGroup(sel, `${rl} averages`, towns!.averages.filter((a) => a.region === rk)));
  }
  townSelect.addEventListener("change", () => update({ t: townSelect.value }));
  townCompareSelect.addEventListener("change", () => {
    const tcmp = townCompareSelect.value as TownCompare;
    const tvs = tcmp === "other" && !state.tvs ? (townComparisonId(townById.get(state.t)) ?? "towns-statewide") : state.tvs;
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
      if (state.tcmp !== "none") q.set("tcmp", state.tcmp);
      if (state.tcmp === "other" && state.tvs) q.set("tvs", state.tvs);
    } else {
      q.set("d", state.d);
      if (state.cmp !== "none") q.set("cmp", state.cmp);
      if (state.cmp === "other" && state.vs) q.set("vs", state.vs);
    }
    if (state.usd !== "nominal") q.set("usd", state.usd);
    history.replaceState(null, "", `${location.pathname}?${q}`);
    askToRemember();
    void refresh();
  }

  /** Load what the view needs (the entity, the comparison), then draw. A newer update wins. */
  let ticket = 0;
  async function refresh() {
    const mine = ++ticket;
    applyView();
    try {
      if (state.view === "districts") {
        await ensure([state.d, state.vs]);
        await ensure([comparisonId(byId.get(state.d))]);
      } else {
        if (!towns) {
          $("entity-name").textContent = "Loading towns…";
          $("entity-meta").textContent = "";
          relations(null);
          $("tiles").replaceChildren();
        }
        await loadTowns();
        await ensureTowns([state.t, state.tvs]);
        await ensureTowns([townComparisonId(townById.get(state.t))]);
      }
    } catch {
      if (mine === ticket) $("entity-meta").textContent = "Part of the explorer's data didn't load. Reload the page to try again.";
      return;
    }
    if (mine === ticket) render();
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

  /** The id the "Compare with" choice points to for this entity, if any. */
  function comparisonId(e: Entity | undefined): string | null {
    if (!e || state.cmp === "none") return null;
    if (state.cmp === "other") return state.vs && state.vs !== e.id ? state.vs : null;
    for (const k of CHAIN[state.cmp]) {
      const id = e.cmp[k];
      if (id && id !== e.id) return id;
    }
    return null;
  }
  const comparisonFor = (e: Entity) => {
    const id = comparisonId(e);
    return id ? byId.get(id) ?? null : null;
  };

  /** "Shutesbury" or "the Tiny cohort average", for use mid-sentence. */
  const refName = (c: Named) => c.ref ?? (c.kind === "district" || c.kind === "town" ? c.name : `the ${c.name}`);

  function townComparisonId(t: Town | undefined): string | null {
    if (!t || state.tcmp === "none") return null;
    if (state.tcmp === "other") return state.tvs && state.tvs !== t.id ? state.tvs : null;
    for (const k of TOWN_CHAIN[state.tcmp]) {
      const id = t.cmp[k];
      if (id && id !== t.id) return id;
    }
    return null;
  }
  const townComparison = (t: Town) => {
    const id = townComparisonId(t);
    return id ? townById.get(id) ?? null : null;
  };

  /** Why an entity has no revenue chart, in the chart's place. */
  function noRevenue(e: Entity): string {
    if (e.type === "charter") return "Census's school finance survey does not cover charter schools.";
    if (e.kind === "district") {
      const r = e.rev_check;
      const peers = data.districts.filter((x) => x.regional && x.cohort === e.cohort && x.region === e.region).map((x) => x.name);
      return "This chart covers regional districts only: for town-run districts, Census's local revenue often falls well " +
        "short of what the town spends on its schools." +
        (r ? ` For ${e.name} in FY${r.fy}, Census reports ${millions(r.revenue)} of revenue against ${millions(r.expenditure)} of spending.` : "") +
        (peers.length && peers.length <= 8 && e.cohort && e.region
          ? ` ${meta.regions[e.region]} ${meta.cohorts[e.cohort].short} regional districts: ${list(peers)}.` : "");
    }
    const n = e.rev_members ?? 0;
    return n === 0 ? `The ${e.name} includes no regional districts, so it has no revenue average.`
      : `The ${e.name} includes only ${n === 1 ? "one regional district" : `${n} regional districts`}, too few for a revenue average.`;
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
  const revName = (c: Entity) => (c.kind === "district" ? c.name : `${c.name} (regional districts)`);
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
  const hasLine = (s: Series | null): s is Series => !!s && s.values.some((v) => v != null);
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
          askToRemember();
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
      btn.title = set.has(key) ? "Click to stop isolating" : "Click to show only the selected";
      btn.append(swatch(it), text("span", it.label));
      btn.addEventListener("click", () => {
        if (set.has(key)) set.delete(key);
        else set.add(key);
        if (set.size === toggles.length) set.clear();
        refocus = { panel: panel!, key };
        askToRemember();
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
        askToRemember();
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

  /** Rows for what the legend shows: each shown segment, then the total, or the selection's
   * total when several are isolated. */
  function cmpRows(shown: Series[], cAll: Series[] | null, sel: string | null, total: Values, cTotal: Values | null,
    shownTotal: Values, cShownTotal: Values | null, totalLabel: string): CmpRow[] {
    const rows: CmpRow[] = [...shown].reverse().map((s) => ({
      label: s.label, color: s.color, mark: "rect", values: s.values, base: cAll?.find((x) => x.key === s.key)?.values ?? null,
    }));
    if (!sel) rows.push({ label: totalLabel, color: "", mark: "rect", values: total, base: cTotal, total: true });
    else if (shown.length > 1) rows.push({ label: `Total, ${sel}`, color: "", mark: "rect", values: shownTotal, base: cShownTotal, total: true });
    return rows;
  }

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

  /** Draw the view; refresh() has loaded what it needs. */
  function render() {
    applyView();
    if (state.view === "districts") renderDistricts();
    else if (towns) renderTowns();
    else {
      $("entity-name").textContent = "Town data unavailable";
      $("entity-meta").textContent = "The town data didn't load. Reload the page to try again.";
      relations(null);
      $("tiles").replaceChildren();
    }
    restoreFocus();
    remember();
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
    const place = e.region ? meta.regions[e.region] : "";
    const bits = e.kind === "average" ? [`${e.members} districts`]
      : [e.type === "vocational" ? "Vocational district" : e.type === "charter" ? "Charter school"
        : `${meta.cohorts[e.cohort!].short} cohort`, place];
    // Said only when "Its cohort in its region" falls back to the statewide cohort
    if (c && state.cmp === "cohort" && e.type === "traditional" && !e.cmp.cohort && place)
      bits.push(`compared statewide: too few ${meta.cohorts[e.cohort!].short} districts in ${place}`);
    else if (!c && state.cmp === "other") bits.push("pick a different district or average to compare with");
    $("entity-meta").textContent = bits.filter(Boolean).join(" · ");
    // Its towns, each with its contribution and the other districts it funds
    relations(e.towns?.length ? {
      root: e.name,
      note: `${e.towns_kind === "members" ? "Member towns" : "Town"} · FY${meta.latest} required local contribution`,
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
      `${dollarsNote} per in-district FTE pupil.` +
      (ppeSel ? " Scale fitted to the selection." : "");
    const p1 = stackedColumns($("svg-ppe") as unknown as SVGSVGElement, frame(tall), ppeShown, ppeOverlay,
      ppeSel ? fitTicks(ppeShown, ppeOverlay?.values ?? null) : dollarTicks, fmtUsd, setHover,
      { value: ppeShownTotal[last], text: usd }, [], ppeTrend);
    legend($("legend-ppe"), [
      ...ppe.map((s) => ({ key: s.key, label: s.label, color: s.color, mark: "rect" as const })),
      ...lineLegend(ppeTrendAll, ppeOverlayAll),
    ], "ppe");
    compareTable($("cmp-ppe"), `Spending per in-district FTE pupil${ppeSel ? `, ${ppeSel}` : ""}, ${e.name} (${dollarsNote.toLowerCase()})`, "Category",
      cmpRows(ppeShown, cPpe, ppeSel, ppeTotal, cPpeTotal, ppeShownTotal, cPpeShownTotal, "Total"), "usd", c);
    fullTables.ppe = { caption: `Spending per in-district FTE pupil by category, ${e.name} (${dollarsNote.toLowerCase()})`, cols: [
      ...ppe.map((s) => ({ label: s.label, values: s.values, fmt: usd })),
      { label: "Total", values: ppeTotal, fmt: usd },
      ...(c ? [{ label: `${cName}, total`, values: cPpeTotal!, fmt: usd }] : []),
    ] };

    // Panel 2: enrollment
    $("enroll-sub").textContent = `Full-time-equivalent pupils${perDistrict}.`;
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
      `${dollarsNote} per foundation pupil.` +
      (nssSel ? " Scale fitted to the selection." : " Column height is actual net school spending.") +
      (unreported.length ? ` Faded: DESE has not reported FY${unreported.join(", FY")} actual spending.` : "");
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
    compareTable($("cmp-nss"), `Chapter 70 aid and net school spending per foundation pupil${nssSel ? `, ${nssSel}` : ""}, ${e.name} (${dollarsNote.toLowerCase()})`, "Component",
      cmpRows(nssShown, cNss, nssSel, nssTotal, cNssTotal, nssShownTotal, cNssShownTotal, "Actual net school spending"), "usd", c);
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
        `Census figures through FY${revYears.latest}.` +
        (c && !cRev ? ` ${capital(refName(c))} has no revenue chart to compare.` : "") +
        (revSel ? " Scale fitted to the selection." : "");
      let revMax = 0;
      years.forEach((_, i) => (revMax = Math.max(revMax, stackTop(rev, i), cRevTotal?.[i] ?? 0)));
      p4 = stackedColumns($("svg-rev") as unknown as SVGSVGElement, frame(tall), revShown, revOverlay,
        revSel ? fitTicks(revShown, revOverlay?.values ?? null) : niceTicks(revMax * 1.04), fmtUsd, setHover,
        { value: revShownTotal[end], text: usd, index: end }, [], revTrend);
      legend($("legend-rev"), [
        ...rev.map((s) => ({ key: s.key, label: s.label, color: s.color, mark: "rect" as const })),
        ...lineLegend(revTrendAll, revOverlayAll),
      ], "rev");
      compareTable($("cmp-rev"), `Revenue per in-district FTE pupil${revSel ? `, ${revSel}` : ""}, ${e.name} (${dollarsNote.toLowerCase()})`, "Source",
        cmpRows(revShown, cRev, revSel, revTotal, cRevTotal, revShownTotal, cRevShownTotal, "Total"),
        "usd", cRev ? { ...c!, name: cRevName } : null, {
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
    $(`${s.key}-sub`).textContent = s.sub + (sel ? " Scale fitted to the selection." : "");
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
    compareTable($(`cmp-${s.key}`), `${s.caption}${sel ? `, ${sel}` : ""}, ${s.name} (${dollarsNote.toLowerCase()})`, s.rowLabel,
      cmpRows(shown, s.cSeries, sel, total, cTotal, shownTotal, cShownTotal, "Total"), "usd", s.cmp, { end: s.end, per: "resident" });
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
    const peerLabel = towns!.meta.peers.find((x) => x.id === t.peer)?.label;
    const place = t.region ? meta.regions[t.region] : "";
    const bits = t.kind === "town" ? [`${t.county} County`, place] : [`${t.members} towns`];
    // Said only when "Its peer group in its region" falls back to the statewide peer group
    if (c && state.tcmp === "peer" && t.kind === "town" && !t.cmp.peer && place)
      bits.push(`compared statewide: too few towns of this size in ${place}`);
    else if (!c && state.tcmp === "other") bits.push("pick a different town or average to compare with");
    else if (!c && (state.tcmp === "peer" || state.tcmp === "peer-state") && t.kind === "town" && !t.peer)
      bits.push("no peer group: it stands apart from the town averages");
    $("entity-meta").textContent = bits.filter(Boolean).join(" · ");
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
        t.kind === "average" ? "Census Bureau estimates" : peerLabel ? `Peer group: towns with ${peerLabel}` : "Not in a peer group",
      ]),
    );

    const width = panelBox().clientWidth;
    lastWidth = width;
    const filed = unfiled.length ? ` Not filed for FY${unfiled.join(" or FY")}.` : "";

    // Panel 1: spending by function
    const p1 = townStack({
      key: "tspend", name: t.name, series: spend, cSeries: cSpend, cmp: c, noun: "functions", rowLabel: "Function",
      caption: "General fund spending per resident", totalLabel: "Total per resident", end, width,
      sub: `${dollarsNote} per resident.${filed}`,
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
      ? "Census Bureau estimates, July 1 at the start of each fiscal year. Per-resident figures above divide each year's dollars by this population."
      : `All ${t.members} towns combined. Per-resident figures above divide the towns' combined dollars by their combined population.`;
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

  await refresh();
  ["svg-ppe", "svg-enroll", "svg-nss", "svg-rev", "svg-tspend", "svg-trev", "svg-tpop"]
    .forEach((id) => keyboard($(id) as unknown as SVGSVGElement));
  root.classList.remove("is-loading");

  // Redraw at a new width; the root, because the hidden view's panels measure 0
  new ResizeObserver(() => {
    const w = panelBox().clientWidth;
    if (w > 0 && Math.abs(w - lastWidth) > 4) requestAnimationFrame(render);
  }).observe(root);
}
