/// <reference types="vite/client" />
// The Massachusetts municipal spending explorer: a district view and a town view.
// Data: src/data/massppe/, written by the report pipeline (github.com/timshores/schools,
// ppe_report/export_explorer_data.py). explorer.json and towns.json list every
// district, town and average; each region's full data is its own file under
// districts/ and towns/, imported the first time something in it is shown. Imported
// rather than fetched, the data ships as hashed JavaScript chunks, which the host
// compresses (it sends .json uncompressed).

import { compact, lines, niceTicks, niceTicksRange, stackedColumns, type Panel, type Series, type Val } from "./charts";
import { closeEnlarged, enlargeButton } from "./enlarge";
import type { CapData } from "./cap";
import type { CwData } from "./commonwealth";
import type { MapData } from "./map";
import { groupedPicker, type Picker } from "./picker";

type Values = Val[];

/** Ids to compare with, one per "Compare with" choice; null where there is none */
type CmpIds = Partial<Record<"cohort" | "cohort_state" | "region" | "state" | "state_all" | "gateway" | "type" | "fifth", string | null>>;
type TownCmpIds = Partial<Record<"peer" | "peer_state" | "region" | "state" | "state_all" | "gateway" | "type" | "fifth", string | null>>;
/** Which fifth of the state a town, or a district's towns together, falls in by income per resident (1 lowest) */
interface IncomeFifth { fifth: number; income_pc: number; year: number }
/** The Inner Core (Boston and its densest neighbors), the other Gateway Cities, rural, or suburban and
 * other, with students (districts) or residents (towns) per square mile; rural districts carry DESE's
 * rural aid tier */
interface Community { type: "core" | "gateway" | "rural" | "suburban"; density: number; tier?: number | null; fy: number }

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
  /** Districts: the district of one of the Commonwealth's Gateway Cities */
  gateway?: boolean;
  community?: Community;
  income?: IncomeFifth;
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
  /** In-district FTE of the regional districts the revenue pools, per district: what turns revenue per
   * pupil back into dollars (a district's own FTE, or an average's average district's) */
  rev_fte?: Values;
  /** Town-run districts only: Census's latest totals, in dollars */
  rev_check?: { fy: number; revenue: number; expenditure: number };
  /** Districts only: the town itself, or a regional district's member towns, each with what it must
   * contribute to this district and the other districts it belongs to */
  towns?: { id: string; name: string; contribution: number | null; also: TownDistrict[] }[];
  towns_kind?: "members" | "town";
  /** With Since 1990 on: DESE's older day-program spending per pupil, in total and, for a district, by
   * program; DESE's average membership (FY1997 on) and NCES fall enrollment (before); for an average,
   * how many districts each year counts */
  day?: Partial<Record<DayKey, Values>> & { total: Values };
  day_memb?: Values;
  nces?: Values;
  day_n?: Values;
  /** A district that no longer exists: the years it has figures for, and what became of it */
  former?: { first: number; last: number };
  note?: { text: string; source: string | null };
  /** Payments to out-of-district schools per out-of-district FTE pupil (an average's pooled) */
  ood?: Values;
}

type DayKey = "total" | "regular" | "special" | "bilingual" | "occupational";
/** A district's or average's earlier years, FY1990 to FY2004 (the older measure to FY2006), from its region's
 * districts-history file. A former district's record is its whole entity, with its FY2005-on series in main. */
type HistRec = Pick<Entity, "id" | "ppe" | "enroll" | "nss" | "ood" | "day" | "day_memb" | "nces" | "day_n"> & Partial<Entity> &
  { main?: Pick<Entity, "ppe" | "enroll" | "nss" | "ood"> };

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
  gateway?: boolean;
  /** Former districts: their years, and which list they go in: ended before FY{start}, after, or charter */
  former?: { first: number; last: number; group?: "early" | "later" | "charter" };
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
  /** Towns: one of the Commonwealth's Gateway Cities */
  gateway?: boolean;
  community?: Community;
  income?: IncomeFifth;
  scope?: string;
  members?: number;
  /** Peer group averages: mid-sentence name, and the population range */
  ref?: string;
  label?: string;
  cmp: TownCmpIds;
  chunk: string;
  /** Residents: the town's, or the average's combined population */
  pop: Values;
  /** Households (ACS five-year estimates), the town's or the average's towns' combined */
  hh?: Values;
  /** General fund spending by function and revenue by source, per resident */
  spend: Record<string, Values>;
  rev: Record<string, Values>;
  /** Dollars, all towns combined for an average */
  spend_total: Values;
  rev_total: Values;
  /** Its school districts, each with the town's required contribution and the district's other member towns */
  districts?: (TownDistrict & { contribution: number | null; with: { name: string; id: string | null }[] })[];
  /** Property (DLS): assessed value per resident and parcels by type (an average's are its towns'
   * combined), taxable value in all, EQV per resident and in all at the fiscal year sharing its
   * January 1 valuation date (every other year), and the average single-family tax bill */
  prop?: Record<string, Values>;
  parcels?: Record<string, Values>;
  value_total?: Values;
  eqv?: Values;
  eqv_total?: Values;
  sf_bill?: Values;
  sf_bill_income?: Values;
  /** The tax rate on single-family homes, per $1,000 of value */
  sf_rate?: Values;
  /** Prop 2 1/2: the levy raised and the capacity left under the limit, per resident; and in all */
  levy?: { raised: Values; unused: Values };
  levy_total?: Values;
  levy_max?: Values;
}

interface ListedTown {
  id: string; name: string; chunk: string; region: string | null; county?: string | null; peer?: string | null;
  scope?: string; gateway?: boolean;
}

/** A school district a town belongs to; id is null for districts outside the explorer */
interface TownDistrict { name: string; id: string | null; kind: "town" | "regional" | "vocational" }

interface TownData {
  meta: {
    years: number[]; latest: number; members_fy: number; regions: Record<string, string>;
    apart: string[]; peer_year: number; peers: { id: string; label: string }[];
    property?: boolean;
    /** FY2025 Chapter 70 target local contribution: percentages of EQV and income, the cap */
    c70_target?: { fy: number; eqv_year: number; income_year: number; property_pct: number; income_pct: number;
      target_share: number; cap: number; capped_towns: number };
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
  /** The earlier years, for Since 1990: their years, the year the explorer's own measure begins, the
   * day program's years, and the years DESE's membership and NCES enrollment weight its averages */
  history?: { years: number[]; functional_from: number; day: [number, number]; membership_from: number;
    chapter70_from: number; nces: [number, number] };
}

interface Data {
  meta: Meta;
  averages: Listed[];
  districts: Listed[];
  /** Districts the older files or the Hub have and the explorer's own years don't */
  former?: Listed[];
}

type Compare = "none" | "cohort" | "cohort-state" | "region" | "state" | "state-all" | "gateway" | "type" | "fifth" | "other";
type TownCompare = "none" | "peer" | "peer-state" | "region" | "state" | "state-all" | "gateway" | "type" | "fifth" | "other";
/** "nominal", or the fiscal year whose dollars every year is restated in ("2018") */
type Dollars = string;
/** What the town view's dollars are divided by, or "total" for the town's whole dollars */
type Per = "resident" | "household" | "parcel" | "total";
const PERS: Per[] = ["resident", "household", "parcel", "total"];
/** What the district view's dollars are divided by: pupils, or nothing, for the district's whole dollars */
type DPer = "pupil" | "total";
const DPERS: DPer[] = ["pupil", "total"];
/** The Years slider keeps at least three years in view, enough for a trend */
const MIN_SPAN = 2;
const PER_WORD: Record<Per, string> = { resident: "resident", household: "household", parcel: "taxable property", total: "town" };
type View = "districts" | "towns" | "commonwealth" | "cap" | "data";
const VIEWS: View[] = ["districts", "towns", "commonwealth", "cap", "data"];
type StackPanel = "ppe" | "ood" | "nss" | "rev" | "tspend" | "trev" | "tval" | "tpar" | "tlevy";
/** The lines a stacked chart can draw over its columns: its trend, the comparison, and, with Since 1990
 * on, the older measure's line and the comparison's */
type Line = "trend" | "cmp" | "day" | "cday";
const LINES: Line[] = ["trend", "cmp", "day", "cday"];

// Each comparison choice, as the ids to try in order: "Its cohort in its region" falls
// back to the statewide cohort where a region has too few districts of that size
const CHAIN = {
  // Two statewide averages: without the very large (state), and with them (state-all)
  cohort: ["cohort", "cohort_state"], "cohort-state": ["cohort_state"], region: ["region"], state: ["state"],
  "state-all": ["state_all"], gateway: ["gateway"],
  type: ["type"], fifth: ["fifth"],
} as const;
const TOWN_CHAIN = {
  peer: ["peer", "peer_state"], "peer-state": ["peer_state"], region: ["region"], state: ["state"],
  "state-all": ["state_all"], gateway: ["gateway"],
  type: ["type"], fifth: ["fifth"],
} as const;
/** The Compare with choices that stand for a group relative to the district or town, named under the menu */
const RELATIVE_COMPARES = new Set<string>(["cohort", "cohort-state", "peer", "peer-state", "region", "type", "fifth"]);
const COMPARES: Compare[] = ["none", "cohort", "cohort-state", "region", "state", "state-all", "gateway", "type", "fifth", "other"];
const TOWN_COMPARES: TownCompare[] = ["none", "peer", "peer-state", "region", "state", "state-all", "gateway", "type", "fifth", "other"];
const FIFTH_NAMES = ["", "Lowest", "Second", "Middle", "Fourth", "Highest"];
/** "Middle income fifth: $47,294 per resident, 2023", for a district's or town's heading */
function incomeText(i: IncomeFifth | undefined, district: boolean) {
  if (!i) return "";
  return `${FIFTH_NAMES[i.fifth]} income fifth: $${i.income_pc.toLocaleString("en-US")} per resident${district ? " of its towns" : ""}, ${i.year}`;
}
/** "Rural, 4.2 students per square mile": the community type, for a district's or town's heading */
function communityText(c: Community | undefined, per: "students" | "residents") {
  if (!c) return "";
  const n = c.density < 100 ? c.density.toFixed(per === "students" ? 1 : 0) : Math.round(c.density).toLocaleString("en-US");
  const name = { core: "Inner Core", gateway: "Gateway City", rural: "Rural", suburban: "Suburban or other" }[c.type];
  return `${name}, ${n} ${per} per square mile`;
}
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
  { key: "above_required", label: "Local contribution above required", color: "#6250d6" },
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
// Property types, bottom to top as the export orders them (PROPERTY_TYPES): homes first,
// in the blues and pinks; business property in the warm colors; land in the greens
const PROPERTY_SERIES = [
  { key: "single", label: "Single-family homes", color: "#2a78d6" },
  { key: "condo", label: "Condominiums", color: "#6250d6" },
  { key: "multi", label: "Multifamily (two or more units)", color: "#e87ba4" },
  { key: "other_res", label: "Other residential, including vacant lots", color: "#c4bba9" },
  { key: "mixed", label: "Mixed use", color: "#eda100" },
  { key: "commercial", label: "Commercial", color: "#eb6834" },
  { key: "industrial", label: "Industrial", color: "#e34948" },
  { key: "farm", label: "Farmland (Chapter 61A)", color: "#1baf7a" },
  { key: "forest", label: "Forest, recreation, and open space", color: "#008300" },
  { key: "personal", label: "Personal property", color: "#8f8a7f" },
] as const;
const PARCEL_SERIES = PROPERTY_SERIES.filter((s) => s.key !== "personal");
// The levy in the taxes color, the capacity left unused above it in a pale version of it
const LEVY_SERIES = [
  { key: "raised", label: "Property tax levy", color: "#eda100" },
  { key: "unused", label: "Unused levy capacity", color: "#f3d9a4" },
] as const;
const RESIDENTIAL = new Set(["single", "condo", "multi", "other_res"]);
const POP_COLOR = "#2a78d6";
const ENROLL_SERIES = [
  { key: "in_district", label: "In-district FTE", color: "#2a78d6" },
  { key: "foundation", label: "Foundation enrollment", color: "#eb6834" },
  { key: "out_of_district", label: "Out-of-district FTE", color: "#1baf7a" },
] as const;
const COMPARE_COLOR = "#524f45";
// Pupils educated elsewhere: the out-of-district color from the enrollment chart
const OOD_COLOR = "#1baf7a";
// The older measure: a color of its own and dashed, so it never reads as part of the columns
const DAY_COLOR = "#0f6f78";
const DAY_DASH = "6 4";
const DAY_LABEL = "Older, narrower DESE measure";
const PROGRAM_SERIES = [
  { key: "regular", label: "Regular classes", color: "#355c7d" },
  { key: "special", label: "Special education", color: "#c06c84" },
  { key: "bilingual", label: "Bilingual (to FY2003)", color: "#6c8e3f" },
  { key: "occupational", label: "Vocational", color: "#b8860b" },
] as const;
const DAY_NOTE = "From FY1990 to FY2006, DESE published a narrower figure it called \u201cday program\u201d spending. It is " +
  "what a district spent running its own schools (regular classes, special education, bilingual and vocational " +
  "programs), divided by the pupils enrolled there, including pupils from other towns. It leaves out pupils the " +
  "district sends to other schools and what it pays for them, and it counts mainly the school committee budget and " +
  "the town's indirect costs for its schools. So it usually runs below the columns. In FY2005, before inflation, " +
  "Abington's was $6,766 per pupil, against $7,463 in the columns.\n\nDESE's names for the programs: regular day, " +
  "special needs, bilingual, and occupational day.";
const WEIGHT_NOTE = "An average weights each district's figure by its pupils. From FY1997 those are DESE's average " +
  "membership: full-time equivalents over the year. DESE's reports for FY1990 to FY1996 give no pupils, so those " +
  "years use the fall enrollment the National Center for Education Statistics counts (Common Core of Data), a head " +
  "count from a different agency. In FY1997 and FY1998, when both exist, nine districts in ten differ by less than 9%.";
const MEASURE_NOTE = "In FY2005 DESE began measuring spending per pupil by function, from all funds: the measure the " +
  "columns show. Before then the dashed line shows DESE's older, narrower day-program figure. The two measure " +
  "different things, so the explorer doesn't connect them. Each has its own trend and growth rate.";
const HIST_NOTE = "Before FY2005, DESE measured only spending in a district's own schools, mostly from its school " +
  "budget. The dashed line shows that narrower figure. In FY2005 and FY2006, the gap between the line and the " +
  "columns is the difference between the two measures.";
const SWITCH_NOTE = "Adds FY1990 to FY2004, from DESE's per-pupil reports, which its Public Records Center provided in " +
  "October 2026 (public records request P004939-101625). For those years DESE measured only its older, narrower " +
  "day-program spending, drawn as a dashed line that runs to FY2006. Districts that no longer exist are listed " +
  "under Former districts.";
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
/** "$423 million", "$4.2 billion" */
const amount = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)} billion` : millions(v));
/** A total: "$4.2 million", or whole dollars under a million, "−$310,250" */
const whole$ = (v: number) => (Math.abs(v) >= 1e6 ? `${v < 0 ? "−" : ""}${amount(Math.abs(v))}` : usd(v));
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
 * all null with fewer than three values. Its growth (trendRate) is the explorer's yearly growth
 * everywhere: the charts, the tiles and the map. */
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

/** What the trend is, for the "?" beside it */
const TREND_NOTE = "The trend is the straight line that best fits every year's value. Its growth is the yearly rate that " +
  "carries the line from its first year to its last. Because the line weighs every year, an unusual first or last year " +
  "moves it less than it would move growth measured from the first year's value to the last year's, and the line " +
  "doesn't always start on the first year's value.";

function cagr(first: number | null, last: number | null, years: number) {
  if (first == null || last == null || first <= 0 || last <= 0 || years <= 0) return null;
  return (last / first) ** (1 / years) - 1;
}

/** A trend line's rise each year, and its yearly growth, compounded from its first year to its last */
function trendRate(trend: Values) {
  const at = trend.flatMap((v, i) => (v == null ? [] : [i]));
  if (at.length < 2) return null;
  const [f, l] = [at[0], at[at.length - 1]];
  return { perYear: (trend[l]! - trend[f]!) / (l - f), rate: cagr(trend[f], trend[l], l - f) };
}

/** A change, signed, in the panel's own format: +$521, −12 */
const signed = (v: number, fmt: (v: number) => string) => `${v < 0 ? "−" : "+"}${fmt(Math.abs(v))}`;
const signedPct = (v: number) => `${v < 0 ? "−" : "+"}${Math.abs(v * 100).toFixed(1)}%`;

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
  // The years shown: the whole series, or the window the Years slider picks (setWindow). Every
  // yearly series is cut to it before it's drawn or measured, so trends, growth rates, tiles and
  // tables all follow.
  let years = meta.years;
  let last = years.length - 1;
  // The earlier years, for Since 1990: FY1990 to FY2004 in front of the explorer's own
  const H = meta.history ?? null;
  const fullYears = H ? [...H.years, ...meta.years] : meta.years;

  // ---- Data, loaded a region at a time ----
  const listed = new Map<string, Listed>([...data.districts, ...data.averages, ...(data.former ?? [])].map((e) => [e.id, e]));
  const byId = new Map<string, Entity>();
  const districtFiles = import.meta.glob<{ default: { entities: Entity[] } }>("../../data/massppe/districts/*.json");
  const loaded = new Set<string>();
  // The earlier years, a region at a time, the first time Since 1990 needs them; a former district's
  // whole record is there
  const histById = new Map<string, HistRec>();
  const histFiles = import.meta.glob<{ default: { entities: HistRec[] } }>("../../data/massppe/districts-history/*.json");
  const histLoaded = new Set<string>();
  const isFormer = (id: string | null | undefined) => !!(id && listed.get(id)?.former);
  /** A former district whose figures all come before the explorer's own years */
  const earlyOnly = (id: string | null | undefined) => !!(id && (listed.get(id)?.former?.last ?? Infinity) < meta.start);
  async function ensure(ids: (string | null | undefined)[]) {
    const want = ids.filter((id): id is string => !!id && listed.has(id));
    const chunks = new Set(want.filter((id) => !isFormer(id)).map((id) => listed.get(id)!.chunk));
    const hist = new Set(H ? want.filter((id) => isFormer(id) || state.hist === "on").map((id) => listed.get(id)!.chunk) : []);
    await Promise.all([
      ...[...chunks].filter((c) => !loaded.has(c)).map(async (c) => {
        const file = (await districtFiles[`../../data/massppe/districts/${c}.json`]()).default;
        file.entities.forEach((e) => byId.set(e.id, e));
        loaded.add(c);
      }),
      ...[...hist].filter((c) => !histLoaded.has(c)).map(async (c) => {
        const file = (await histFiles[`../../data/massppe/districts-history/${c}.json`]()).default;
        file.entities.forEach((r) => histById.set(r.id, r));
        histLoaded.add(c);
      }),
    ]);
  }

  // ---- With Since 1990 on, each series gains the earlier years in front ----
  const nH = H ? H.years.length : 0;
  const nM = meta.years.length;
  const nulls = (n: number): Values => Array(n).fill(null);
  /** Each named series: the earlier years, then the explorer's own */
  function join<T extends object>(early: T | undefined, later: T | undefined): T {
    const a = (early ?? {}) as Record<string, Values>;
    const b = (later ?? {}) as Record<string, Values>;
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return Object.fromEntries(keys.map((k) => [k, [...(a[k] ?? nulls(nH)), ...(b[k] ?? nulls(nM))]])) as T;
  }
  /** The older measure's series run from FY1990 into the explorer's own years (to FY2006); nothing after */
  const early = (v: Values | undefined) => (v ? [...v, ...nulls(nH + nM - v.length)] : undefined);
  const dayJoin = (h: HistRec): Partial<Entity> => ({
    day: h.day ? join(h.day, undefined) as Entity["day"] : undefined,
    day_memb: early(h.day_memb), nces: early(h.nces), day_n: early(h.day_n),
  });
  const made = new Map<string, Entity>();
  /** A district or average as the district view draws it: with Since 1990 on, its earlier years in
   * front. A former district comes from its history record. Undefined until its data has loaded. */
  function entity(id: string | null | undefined): Entity | undefined {
    if (!id) return undefined;
    const on = state.hist === "on";
    if (!on && !isFormer(id)) return byId.get(id);
    const key = `${id}:${on}`;
    const hit = made.get(key);
    if (hit) return hit;
    const h = histById.get(id);
    let e: Entity | undefined;
    if (isFormer(id)) {
      if (!h?.main) return undefined;
      const rec = { ...h } as Entity & { main?: unknown };
      delete rec.main;
      e = on
        ? { ...rec, ppe: join(h.ppe, h.main.ppe), enroll: join(h.enroll, h.main.enroll), nss: join(h.nss, h.main.nss),
          ood: [...(h.ood ?? nulls(nH)), ...(h.main.ood ?? nulls(nM))], ...dayJoin(h) }
        : { ...rec, ppe: h.main.ppe, enroll: h.main.enroll, nss: h.main.nss, ood: h.main.ood, day: undefined, day_memb: undefined,
          nces: undefined, day_n: undefined };
    } else {
      const base = byId.get(id);
      if (!base || !h) return undefined;
      e = {
        ...base, ppe: join(h.ppe, base.ppe), enroll: join(h.enroll, base.enroll), nss: join(h.nss, base.nss),
        ood: [...(h.ood ?? nulls(nH)), ...(base.ood ?? nulls(nM))],
        ...(base.rev ? { rev: join(undefined, base.rev) } : {}),
        ...(base.rev_fte ? { rev_fte: [...nulls(nH), ...base.rev_fte] } : {}),
        ...dayJoin(h),
      };
    }
    made.set(key, e);
    return e;
  }

  // While any window is open (a data table, a plot), the page behind it doesn't scroll
  const lockScroll = () => document.documentElement.classList.toggle("modal-open", !!document.querySelector("dialog[open]"));
  new MutationObserver(lockScroll).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });

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
  // Since 1990: on with a link's hist=on, a first or last year before FY{start}, or a former district
  // whose figures all come before it
  const histYear = (v: string | null | undefined) => !!H && H.years.includes(Number(v));
  const histOn = !!H && (src.hist === "on" || histYear(src.from) || histYear(src.to) || earlyOnly(pickId(src.d)));
  const state = {
    d: listed.has(pickId(src.d) ?? "") ? pickId(src.d)! : "leverett",
    cmp: oneOf(src.cmp, COMPARES, "none"),
    // The entity picked in the second menu when comparing with another district or average
    vs: listed.has(pickId(src.vs) ?? "") && !isFormer(pickId(src.vs)) ? pickId(src.vs) : null as string | null,
    // Any year in the series; "real", from older links, is the latest year
    // Nominal, or the latest year's dollars; links that name another year, or "real", get the latest
    usd: (src.usd === "real" || meta.years.includes(Number(src.usd)) ? String(meta.latest) : "nominal") as Dollars,
    per: oneOf(src.per, PERS, "resident"),
    dper: oneOf(src.dper, DPERS, "pupil"),
    // Extra detail: the explanations around the charts, on unless turned off
    detail: (src.detail === "off" ? "off" : "on") as "on" | "off",
    view: (VIEWS.includes(src.view as View) ? src.view : "districts") as View,
    // Town view: checked against the town list once towns.json loads
    t: pickId(src.t) ?? "leverett",
    tcmp: oneOf(src.tcmp, TOWN_COMPARES, "none"),
    tvs: pickId(src.tvs),
    // The earlier years on the district view, FY1990 to FY2004
    hist: (histOn ? "on" : "off") as "on" | "off",
    // The first and last years shown, at least MIN_SPAN apart; a former district whose figures all come
    // before FY{start} opens on the earlier years
    from: fullYears.includes(Number(src.from)) ? Number(src.from) : histOn ? fullYears[0] : meta.start,
    to: fullYears.includes(Number(src.to)) ? Number(src.to) : earlyOnly(pickId(src.d)) ? meta.start - 1 : meta.latest,
  };
  if (state.cmp === "other" && !state.vs) state.cmp = "none";
  /** The first year of the slider's scale, where a window starts by default */
  const firstYear = () => (state.hist === "on" ? fullYears[0] : meta.start);
  if (state.to - state.from < MIN_SPAN) [state.from, state.to] = [firstYear(), meta.latest];
  // Legend selections; empty means every segment shows. Kept across districts so
  // one category can be followed from district to district.
  const isolated: Record<StackPanel, Set<string>> = {
    ppe: new Set(saved?.isolated?.ppe), ood: new Set(), nss: new Set(saved?.isolated?.nss), rev: new Set(saved?.isolated?.rev),
    tspend: new Set(saved?.isolated?.tspend), trev: new Set(saved?.isolated?.trev),
    tval: new Set(saved?.isolated?.tval), tpar: new Set(saved?.isolated?.tpar), tlevy: new Set(saved?.isolated?.tlevy),
  };
  // Lines hidden from each chart's legend; both show until clicked off
  const hidden = (k: string) => new Set((saved?.hidden?.[k] ?? []).filter((l): l is Line => LINES.includes(l as Line)));
  const hiddenLines: Record<StackPanel, Set<Line>> = {
    ppe: hidden("ppe"), ood: hidden("ood"), nss: hidden("nss"), rev: hidden("rev"), tspend: hidden("tspend"), trev: hidden("trev"),
    tval: hidden("tval"), tpar: hidden("tpar"), tlevy: hidden("tlevy"),
  };

  function remember() {
    if (consent !== "yes") return;
    const sets = (r: Record<string, Set<string>>) => Object.fromEntries(Object.entries(r).map(([k, s]) => [k, [...s]]));
    storage.set(STORE, JSON.stringify({ state, isolated: sets(isolated), hidden: sets(hiddenLines) }));
    folds().forEach((d) => storage.set(foldKey(d), d.open ? "open" : "closed"));
  }
  // Folding sections (the introductions, the cap tab's explanation) stay folded or open as they
  // were left, with the other remembered choices. The page's inline scripts, or the code that
  // builds a section, set them; this remembers changes, for sections added later too.
  const folds = () => [...document.querySelectorAll<HTMLDetailsElement>("details[data-remember]")];
  const foldKey = (d: HTMLDetailsElement) => `mass-school-spending:${d.dataset.remember}`;
  // toggle doesn't bubble, so listen as it passes down
  document.addEventListener("toggle", (ev) => {
    if (!(ev.target instanceof HTMLDetailsElement) || !ev.target.dataset.remember || !ev.isTrusted) return;
    askToRemember();
    remember();
  }, true);
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
    else {
      storage.drop(STORE);
      folds().forEach((d) => storage.drop(foldKey(d)));
    }
    $("remember-prompt").hidden = true;
    rememberNote();
  }
  function rememberNote() {
    const btn = text("button", consent === "yes" ? "Forget your choices" : "Remember your choices", "link-button") as HTMLButtonElement;
    btn.type = "button";
    btn.addEventListener("click", () => setConsent(consent === "yes" ? "no" : "yes"));
    $("remember-note").replaceChildren(consent === "yes"
      ? "This page remembers your choices in this browser, so it reopens where you left off, but collects no data about you. "
      : "This page can remember your choices in this browser, so it reopens where you left off, but collects no data about you. ", btn);
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
  let townPickers: Picker[] = [];
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
    townPickers = [groupedPicker(townSelect, "pick-town-label", "towns and averages"),
      groupedPicker(townVsSelect, "pick-town-vs-label", "towns and averages")];
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
  /** An option group, skipped when empty; `section` draws a line above it in the menu */
  function addGroup(sel: HTMLSelectElement, label: string, items: { id: string; name: string }[], section = false) {
    if (!items.length) return;
    const group = document.createElement("optgroup");
    group.label = label;
    if (section) group.dataset.section = "";
    items.forEach((e) => group.append(new Option(e.name, e.id)));
    sel.append(group);
  }
  const regions = Object.entries(meta.regions);
  // The district menu and its duplicate for comparisons: districts by region and type, then averages
  function fillEntities(sel: HTMLSelectElement) {
    const traditional = data.districts.filter((d) => d.type === "traditional");
    regions.forEach(([rk, rl]) => addGroup(sel, `${rl} districts`, traditional.filter((d) => d.region === rk)));
    addGroup(sel, "Other districts", traditional.filter((d) => !d.region));
    // Also listed under their regions: the menu shows a district wherever it belongs
    addGroup(sel, "Gateway City districts", data.districts.filter((d) => d.gateway), true);
    addGroup(sel, "Vocational and technical districts", data.districts.filter((d) => d.type === "vocational"), true);
    addGroup(sel, "Charter schools", data.districts.filter((d) => d.type === "charter"));
    addGroup(sel, "Statewide averages", data.averages.filter((a) => !a.region), true);
    regions.forEach(([rk, rl]) => addGroup(sel, `${rl} averages`, data.averages.filter((a) => a.region === rk)));
  }
  /** The district menu's other list: districts that no longer exist, with the years they have figures for */
  function fillFormer(sel: HTMLSelectElement) {
    const f = data.former ?? [];
    const named = (xs: Listed[]) => xs.map((x) => ({ id: x.id, name: `${x.name} (FY${x.former!.first}–FY${x.former!.last})` }));
    addGroup(sel, `Ended before FY${meta.start}`, named(f.filter((x) => x.former!.group === "early")));
    addGroup(sel, `Ended FY${meta.start} or later`, named(f.filter((x) => x.former!.group === "later")));
    addGroup(sel, "Charter schools", named(f.filter((x) => x.former!.group === "charter")));
  }
  const select = $<HTMLSelectElement>("pick-district");
  const vsSelect = $<HTMLSelectElement>("pick-vs");
  // The district menu lists current districts or former ones; the comparison menu, current ones only
  let menuMode: "current" | "former" = isFormer(state.d) ? "former" : "current";
  (menuMode === "former" ? fillFormer : fillEntities)(select);
  fillEntities(vsSelect);
  // The last of each kind looked at, to come back to when the menu switches
  let lastCurrent = isFormer(state.d) ? "leverett" : state.d;
  let lastFormer = isFormer(state.d) ? state.d : (data.former ?? []).find((x) => x.former!.group === "early")?.id ?? null;
  /** Former districts, from the quiet link at the foot of the district menu: its other list, opening on
   * the last of that kind looked at */
  const switchMenu = () => {
    const id = menuMode === "former" ? lastCurrent : lastFormer;
    if (id) update({ d: id, ...histFor(id) });
  };
  /** The menu follows the district shown: its list, and the link at its foot */
  function syncMenu() {
    if (isFormer(state.d)) lastFormer = state.d;
    else lastCurrent = state.d;
    const mode = isFormer(state.d) ? "former" : "current";
    if (mode === menuMode) return;
    menuMode = mode;
    select.replaceChildren();
    (mode === "former" ? fillFormer : fillEntities)(select);
    select.value = state.d;
    districtPickers[0].rebuild();
  }
  const compareSelect = $<HTMLSelectElement>("pick-compare");
  // Dollars: nominal, or the latest year's
  const dollarInputs = document.querySelectorAll<HTMLInputElement>('input[name="dollars"]');
  const showDollars = () => dollarInputs.forEach((r) => (r.checked = (r.value === "real") === (state.usd !== "nominal")));
  document.querySelectorAll("[data-latest]").forEach((n) => (n.textContent = String(meta.latest)));
  document.querySelectorAll("[data-start]").forEach((n) => (n.textContent = String(meta.start)));

  // The Years slider: two handles, the first and last years shown, kept MIN_SPAN apart. Its scale
  // starts at FY1990 on the district view with Since 1990 on.
  const fromSlider = $<HTMLInputElement>("year-from");
  const toSlider = $<HTMLInputElement>("year-to");
  const yearsOut = $("years-out");
  const yearsMark = $("years-mark");
  const scale = () => (state.hist === "on" && state.view === "districts" ? fullYears : meta.years);
  /** The window's ends on the scale; a window off it (an early window, on the town view) is the whole scale */
  function span(): [number, number] {
    const ys = scale();
    const a = Math.max(0, ys.indexOf(state.from));
    const b = ys.indexOf(state.to);
    return b < 0 || b - a < MIN_SPAN ? [0, ys.length - 1] : [a, b];
  }
  const showYears = () => {
    const ys = scale();
    const [a, b] = span();
    for (const sl of [fromSlider, toSlider]) sl.max = String(ys.length - 1);
    fromSlider.value = String(a);
    toSlider.value = String(b);
    fromSlider.setAttribute("aria-valuetext", `FY${ys[a]}`);
    toSlider.setAttribute("aria-valuetext", `FY${ys[b]}`);
    const track = fromSlider.parentElement!;
    track.style.setProperty("--a", String(a / (ys.length - 1)));
    track.style.setProperty("--b", String(b / (ys.length - 1)));
    // Where the explorer's own measure begins, marked on the track with Since 1990 on
    const m = H && ys === fullYears ? ys.indexOf(H.functional_from) : -1;
    yearsMark.hidden = m < 0;
    if (m >= 0) track.style.setProperty("--m", String(m / (ys.length - 1)));
    // A window across the change says so, on a line of its own under the years
    yearsOut.replaceChildren(`FY${ys[a]}–FY${ys[b]}`, ...(m >= 0 && a < m && b >= m ? [text("span", "two measures", "years-two")] : []));
    $("years-first").textContent = String(ys[0]);
  };
  fromSlider.addEventListener("input", () => {
    const ys = scale();
    const [, b] = span();
    const a = Math.min(Number(fromSlider.value), b - MIN_SPAN);
    fromSlider.value = String(a);
    if (ys[a] !== state.from || ys[b] !== state.to) update({ from: ys[a], to: ys[b] });
  });
  toSlider.addEventListener("input", () => {
    const ys = scale();
    const [a] = span();
    const b = Math.max(Number(toSlider.value), a + MIN_SPAN);
    toSlider.value = String(b);
    if (ys[b] !== state.to || ys[a] !== state.from) update({ to: ys[b], from: ys[a] });
  });
  yearsMark.append(helpTip(MEASURE_NOTE));

  // Since 1990: on, the slider's first handle moves to FY1990 if it was at the start; off, any handle
  // before FY{start} comes back to it
  const histSwitch = $<HTMLButtonElement>("hist-switch");
  function histPatch(on: boolean): Partial<typeof state> {
    if (on) return { hist: "on", from: state.from === meta.start ? fullYears[0] : state.from };
    const from = Math.max(state.from, meta.start);
    return { hist: "off", from, to: state.to - from < MIN_SPAN ? meta.latest : state.to };
  }
  /** Choosing a former district whose figures all come before FY{start} turns Since 1990 on and shows the
   * earlier years; choosing any other while the window ends before FY{start} runs it to FY{latest} again,
   * or the district would show none of its own years */
  const histFor = (id: string): Partial<typeof state> =>
    earlyOnly(id) ? (state.to >= meta.start ? { ...histPatch(true), from: fullYears[0], to: meta.start - 1 } : {})
      : state.to < meta.start ? { to: meta.latest } : {};
  const showHist = () => {
    const on = state.hist === "on";
    histSwitch.setAttribute("aria-checked", String(on));
    histSwitch.querySelector(".dial-state")!.textContent = on ? "On" : "Off";
    histSwitch.title = on ? `Show FY${meta.start} on only` : `Add the years FY${fullYears[0]} to FY${meta.start - 1}`;
  };
  histSwitch.closest<HTMLElement>(".control")!.hidden = !H;
  $("hist-label").after(helpTip(SWITCH_NOTE));
  histSwitch.addEventListener("click", () => update(histPatch(state.hist !== "on")));

  select.value = state.d;
  compareSelect.value = state.cmp;
  if (state.vs) vsSelect.value = state.vs;
  // The long menus: searchable, with groups that start collapsed
  const districtPickers = [groupedPicker(select, "pick-district-label", "districts and averages", {
    text: () => (menuMode === "former" ? "Current districts and averages" : "Former districts"),
    title: "Districts that no longer exist, with the years they have figures for",
    act: switchMenu,
  }),
    groupedPicker(vsSelect, "pick-vs-label", "districts and averages")];
  showDollars();
  select.addEventListener("change", () => update({ d: select.value, ...histFor(select.value) }));
  compareSelect.addEventListener("change", () => {
    const cmp = compareSelect.value as Compare;
    // Start the second menu on whatever was being compared, so nothing jumps
    const vs = cmp === "other" && !state.vs ? (comparisonId(entity(state.d)) ?? "statewide") : state.vs;
    update({ cmp, vs });
  });
  vsSelect.addEventListener("change", () => update({ vs: vsSelect.value, ...(earlyOnly(vsSelect.value) && state.hist !== "on" ? histPatch(true) : {}) }));
  dollarInputs.forEach((r) => r.addEventListener("change", () => r.checked && update({ usd: r.value === "real" ? String(meta.latest) : "nominal" })));
  const perInputs = document.querySelectorAll<HTMLInputElement>('input[name="per"]');
  perInputs.forEach((r) => (r.checked = r.value === state.per));
  perInputs.forEach((r) => r.addEventListener("change", () => r.checked && update({ per: r.value as Per })));
  // The detail dial: off hides the explanations around the charts, on every tab but Data
  const dial = $<HTMLButtonElement>("detail-dial");
  const showDetail = () => {
    const on = state.detail === "on";
    root.classList.toggle("detail-off", !on);
    dial.setAttribute("aria-checked", String(on));
    dial.querySelector(".dial-state")!.textContent = on ? "On" : "Off";
    dial.title = on ? "Turn the explanations around the charts off" : "Turn the explanations around the charts back on";
  };
  showDetail();
  dial.addEventListener("click", () => {
    update({ detail: state.detail === "on" ? "off" : "on" });
    showDetail();
  });
  const dperInputs = document.querySelectorAll<HTMLInputElement>('input[name="dper"]');
  dperInputs.forEach((r) => (r.checked = r.value === state.dper));
  dperInputs.forEach((r) => r.addEventListener("change", () => r.checked && update({ dper: r.value as DPer })));

  // Town controls: towns by county, then averages
  const townSelect = $<HTMLSelectElement>("pick-town");
  const townVsSelect = $<HTMLSelectElement>("pick-town-vs");
  const townCompareSelect = $<HTMLSelectElement>("pick-town-compare");
  function fillTowns(sel: HTMLSelectElement) {
    sel.replaceChildren();
    const counties = [...new Set(towns!.towns.map((x) => x.county ?? "Other"))].sort();
    counties.forEach((c) => addGroup(sel, `${c} County`, towns!.towns.filter((x) => (x.county ?? "Other") === c)));
    addGroup(sel, "Gateway Cities", towns!.towns.filter((x) => x.gateway), true);
    addGroup(sel, "Statewide averages", towns!.averages.filter((a) => !a.region), true);
    regions.forEach(([rk, rl]) => addGroup(sel, `${rl} averages`, towns!.averages.filter((a) => a.region === rk)));
  }
  townSelect.addEventListener("change", () => update({ t: townSelect.value }));
  townCompareSelect.addEventListener("change", () => {
    const tcmp = townCompareSelect.value as TownCompare;
    const tvs = tcmp === "other" && !state.tvs ? (townComparisonId(townById.get(state.t)) ?? "towns-statewide") : state.tvs;
    update({ tcmp, tvs });
  });
  townVsSelect.addEventListener("change", () => update({ tvs: townVsSelect.value }));
  // Swap: what was compared becomes the focus, and what was the focus its comparison, by name ("Another ...")
  $("swap-district").addEventListener("click", () => {
    const id = comparisonId(entity(state.d));
    if (id) update({ d: id, cmp: "other", vs: state.d });
  });
  $("swap-town").addEventListener("click", () => {
    const id = townComparisonId(townById.get(state.t));
    if (id) update({ t: id, tcmp: "other", tvs: state.t });
  });

  // Tabs: arrow keys move between them, as for any tab list
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  tabs.forEach((tab, k) => {
    tab.addEventListener("click", () => {
      // From far down the page, where the tabs float, a new tab opens at its top
      const bar = tab.parentElement!;
      const panelTop = $("view-panel").getBoundingClientRect().top;
      if (bar.getBoundingClientRect().top <= 0 && panelTop < bar.offsetHeight) {
        window.scrollTo({ top: window.scrollY + panelTop - bar.offsetHeight, behavior: "smooth" });
      }
      update({ view: tab.dataset.view as View });
    });
    tab.addEventListener("keydown", (ev) => {
      const next = { ArrowLeft: k - 1, ArrowRight: k + 1, Home: 0, End: tabs.length - 1 }[ev.key];
      if (next == null) return;
      ev.preventDefault();
      const target = tabs[(next + tabs.length) % tabs.length];
      target.focus();
      update({ view: target.dataset.view as View });
    });
  });

  // A tab switch fades what changes with the tab (the page's .swap words and #view-panel)
  // out, draws the new view, and fades it back in
  const FADE_MS = 560;
  const calm = matchMedia("(prefers-reduced-motion: reduce)");
  let fading: number | undefined;
  /** The tabs opened so far, the first one included */
  const opened = new Set<View>([state.view]);

  function update(patch: Partial<typeof state>) {
    const switching = patch.view != null && patch.view !== state.view;
    if (switching) closeEnlarged();
    Object.assign(state, patch);
    const q = new URLSearchParams();
    if (state.view === "towns") {
      q.set("view", "towns");
      q.set("t", state.t);
      if (state.tcmp !== "none") q.set("tcmp", state.tcmp);
      if (state.tcmp === "other" && state.tvs) q.set("tvs", state.tvs);
      if (state.per !== "resident") q.set("per", state.per);
    } else if (state.view !== "districts") {
      q.set("view", state.view);
    } else {
      q.set("d", state.d);
      if (state.cmp !== "none") q.set("cmp", state.cmp);
      if (state.cmp === "other" && state.vs) q.set("vs", state.vs);
      if (state.dper !== "pupil") q.set("dper", state.dper);
      if (state.hist === "on") q.set("hist", "on");
    }
    if (state.usd !== "nominal") q.set("usd", state.usd);
    if (state.detail === "off") q.set("detail", "off");
    if (state.view === "districts" || state.view === "towns") {
      if (state.from !== firstYear()) q.set("from", String(state.from));
      if (state.to !== meta.latest) q.set("to", String(state.to));
    }
    history.replaceState(null, "", `${location.pathname}?${q}`);
    askToRemember();
    if (!switching && !root.classList.contains("is-switching")) {
      void refresh();
      return;
    }
    markTabs();
    // The fade marks a tab's first opening; back on a tab already seen, it shows at once
    if (calm.matches || opened.has(state.view)) {
      clearTimeout(fading);
      root.classList.remove("is-switching");
      void refresh();
      return;
    }
    opened.add(state.view);
    root.classList.add("is-switching");
    clearTimeout(fading);
    fading = window.setTimeout(async () => {
      await refresh();
      root.classList.remove("is-switching");
    }, FADE_MS);
  }

  /** Load what the view needs (the entity, the comparison), then draw. A newer update wins. */
  let ticket = 0;
  async function refresh() {
    const mine = ++ticket;
    applyView();
    try {
      if (state.view === "districts") {
        await ensure([state.d, state.vs]);
        await ensure([comparisonId(entity(state.d))]);
      } else if (state.view === "commonwealth") {
        await loadCommonwealth();
      } else if (state.view === "cap") {
        await loadCap();
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

  // The Commonwealth tab's gallery and data, loaded the first time it opens
  let cw: { openFromUrl(): void; close(): void } | null = null;
  let map: { refresh(): void } | null = null;
  async function loadCommonwealth() {
    if (cw) return;
    const [mod, json, mapMod, mapJson] = await Promise.all([import("./commonwealth"), import("../../data/massppe/commonwealth.json"),
      import("./map"), import("../../data/massppe/map.json")]);
    map = mapMod.startMap($("cw-map"), mapJson.default as unknown as MapData, {
      openTown: (id) => update({ view: "towns", t: id }),
      openDistrict: (id) => update({ view: "districts", d: id }),
      // The map shares the explorer's Dollars choice
      real: () => state.usd !== "nominal",
      setReal: (real) => update({ usd: real ? String(meta.latest) : "nominal" }),
    });
    cw = mod.startCommonwealth($("cw-root"), json.default as unknown as CwData, {
      openDistrict: (id) => update({ view: "districts", d: id }),
    });
    // A link to one plot opens it
    if (new URLSearchParams(location.search).has("y")) cw.openFromUrl();
  }

  // Pointing at either of these tabs starts its download, so it's usually ready by the click
  const warm: Record<string, () => void> = {
    commonwealth: () => void Promise.all([import("./commonwealth"), import("../../data/massppe/commonwealth.json"), import("./map"),
      import("../../data/massppe/map.json")]).catch(() => {}),
    cap: () => void Promise.all([import("./cap"), import("../../data/massppe/cap.json")]).catch(() => {}),
  };
  for (const tab of tabs) {
    const go = warm[tab.dataset.view ?? ""];
    if (!go) continue;
    tab.addEventListener("pointerenter", go, { once: true });
    tab.addEventListener("focus", go, { once: true });
  }
  // And once the page has loaded and the browser is idle, both download in the background anyway, one
  // after the other, so they open at once; the tab on screen never waits for them
  const idle = (fn: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1500));
  const background = () => idle(() => {
    warm.commonwealth();
    idle(warm.cap);
  });
  if (document.readyState === "complete") background();
  else window.addEventListener("load", background, { once: true });

  // The 82.5% cap tab, loaded the first time it opens; it starts on the town last viewed
  let cap: { render(): void } | null = null;
  async function loadCap() {
    if (cap) return;
    const [mod, json] = await Promise.all([import("./cap"), import("../../data/massppe/cap.json")]);
    cap = mod.startCap($("cap-root"), json.default as unknown as CapData, { town: state.t });
    cap.render();
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
    const base = meta.cpi[state.usd];
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
    const c = id ? entity(id) : null;
    return c ? win(c) : null;
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
    const c = id ? townById.get(id) : null;
    return c ? win(c) : null;
  };

  /** Why an entity has no revenue chart, in the chart's place. */
  function noRevenue(e: Entity): string {
    // The source and why it falls short for these are in the Data tab, not here
    if (e.type === "charter") return "Detailed revenue figures aren't available for charter schools.";
    if (e.kind === "district") return "Detailed revenue figures aren't available for town-run districts.";
    const n = e.rev_members ?? 0;
    return n === 0 ? `The ${e.name} includes no regional districts, so it has no revenue average.`
      : `The ${e.name} includes only ${n === 1 ? "one regional district" : `${n} regional districts`}, too few for a revenue average.`;
  }

  /** Per pupil, or with Totals on, back to dollars: each year's figure times the pupils it was
   * divided by. An average's figures are pooled per pupil and its enrollment is per district, so its
   * totals are its average district's. */
  const pupilsOf = (e: Entity, by: "in_district" | "foundation" | "rev"): Values =>
    by === "rev" ? e.rev_fte ?? e.enroll.in_district : e.enroll[by];
  const inDollars = (values: Values, e: Entity, by: "in_district" | "foundation" | "rev"): Values => {
    if (state.dper !== "total") return values;
    const n = pupilsOf(e, by);
    return values.map((v, i) => (v == null || n[i] == null ? null : v * n[i]!));
  };
  const ppeSeries = (e: Entity): Series[] =>
    meta.categories.map((c, k) => ({ key: c, label: sentence(c), color: PPE_COLORS[k], values: deflate(inDollars(e.ppe[c], e, "in_district")) }));
  const nssSeries = (e: Entity): Series[] =>
    NSS_SERIES.map((s) => ({ ...s, values: deflate(inDollars(e.nss[s.key], e, "foundation")) }));
  const enrollSeries = (e: Entity): Series[] => [
    ...ENROLL_SERIES.map((s) => ({ ...s, values: e.enroll[s.key] })),
    // With Since 1990 on, the earlier counts, each from its own source
    ...(state.hist === "on" && H ? [
      { key: "day_memb", label: "Day-program membership (DESE)", color: DAY_COLOR, dash: DAY_DASH, values: e.day_memb ?? nulls(years.length) },
      { key: "nces", label: "Fall enrollment (NCES)", color: "#8f8a7f", dash: "2 3", values: e.nces ?? nulls(years.length) },
    ] : []),
  ];
  /** The first and last positions with a value, or -1 */
  const firstAt = (vals: Values) => vals.findIndex((v) => v != null);
  const lastAt = (vals: Values) => {
    for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return i;
    return -1;
  };
  /** The older measure's programs, drawn only when asked for */
  let showPrograms = false;
  const revSeries = (e: Entity): Series[] | null =>
    e.rev ? REV_SERIES.map((s) => ({ ...s, values: deflate(inDollars(e.rev![s.key], e, "rev")) })) : null;
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

  /** A "?" that shows a longer note on hover or focus (.cw-help) */
  function helpTip(note: string) {
    const h = text("span", "?", "cw-help wide");
    h.tabIndex = 0;
    h.setAttribute("role", "note");
    h.setAttribute("aria-label", note);
    h.dataset.tip = note;
    return h;
  }

  // A "?"'s note opens from the "?" (a wide one) or centered under it, which can run past the
  // window's edge; shift it back inside. Every "?" on the page, the map's and Commonwealth's too.
  const TIP_MARGIN = 8;
  function placeTip(h: HTMLElement, retry = true) {
    const cs = getComputedStyle(h, "::after");
    const inner = parseFloat(cs.width);
    // The note exists only while hovered or focused; if the hover hasn't applied yet, look next frame
    if (!(inner > 0)) {
      if (retry) requestAnimationFrame(() => placeTip(h, false));
      return;
    }
    const w = cs.boxSizing === "border-box" ? inner
      : inner + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const r = h.getBoundingClientRect();
    // Inside an enlarged chart's window the note stays within that window; elsewhere, within the page
    const dlg = h.closest("dialog");
    const area = dlg?.open ? dlg.getBoundingClientRect() : null;
    const edgeL = (area?.left ?? 0) + TIP_MARGIN;
    const edgeR = (area?.right ?? document.documentElement.clientWidth) - TIP_MARGIN;
    const left = h.classList.contains("wide") ? r.left : r.left + r.width / 2 - w / 2;
    const dx = left + w > edgeR ? Math.max(edgeR - (left + w), edgeL - left) : left < edgeL ? edgeL - left : 0;
    if (dx) h.style.setProperty("--tip-dx", `${Math.round(dx)}px`);
    else h.style.removeProperty("--tip-dx");
    // ...and opens above the "?" where it would run past the window's bottom and there's room above
    if (area) {
      const ht = parseFloat(cs.height) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + 2;
      h.classList.toggle("tip-above", r.bottom + 6 + ht > area.bottom - TIP_MARGIN && r.top - 6 - ht > area.top + TIP_MARGIN);
    }
  }
  const tipTarget = (ev: Event) => (ev.target instanceof Element ? ev.target.closest<HTMLElement>(".cw-help") : null);
  for (const type of ["pointerover", "focusin"]) {
    document.addEventListener(type, (ev) => {
      const h = tipTarget(ev);
      if (h) placeTip(h);
    });
  }

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
    // A tall tip on a phone can run past the bottom of the screen, or of an enlarged chart's window;
    // move it up until it fits
    const dlg = figure.closest("dialog");
    const area = dlg?.open ? dlg.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const box = tip.getBoundingClientRect();
    const over = box.bottom - (area.bottom - 8);
    if (over > 0) tip.style.top = `${Math.max(box.top - over, area.top + 8) - figBox.top}px`;
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
  interface LegendItem { label: string; color: string; mark: "rect" | "line" | "dash" | "hatch"; key?: string; line?: Line;
    /** The chart marks (their data-key) a plain entry spotlights on hover or focus, without isolating them */
    spot?: string;
    /** Beside the label, in lighter type: the trend's yearly rise */
    detail?: string;
    /** A "?" after the entry, with a note on hover or focus */
    help?: string;
    /** A button that shows or hides something else, pressed while it shows */
    toggle?: () => void;
    on?: boolean }

  // ---- Chart lines: the entity's own trend (dashed) and the comparison (solid, with dots).
  // Both follow what the legend isolates; either can be hidden from its legend entry. ----
  const trendOf = (name: string, sel: string | null, shownTotal: Values): Series =>
    ({ key: "trend", label: `${name} trend${sel ? `, ${sel}` : ""}`, color: TREND_COLOR, values: linearTrend(shownTotal) });
  /** The line as drawn: null while its legend entry has it hidden. */
  const drawn = (panel: StackPanel, line: Line, s: Series | null): Series | null => (hiddenLines[panel].has(line) ? null : s);
  const hasLine = (s: Series | null): s is Series => !!s && s.values.some((v) => v != null);
  /** Legend entries for the lines the chart can draw, hidden ones included so they can come back. */
  const lineLegend = (trend: Series | null, overlay: Series | null, fmt: (v: number) => string = usd): LegendItem[] => [
    ...(hasLine(trend) ? [{ label: trend.label, color: TREND_COLOR, mark: "dash" as const, line: "trend" as const, help: TREND_NOTE,
      detail: ((r) => (r ? `${signed(r.perYear, fmt)}${r.rate != null ? ` (${signedPct(r.rate)})` : ""} a year` +
        (fmt === usd ? (state.usd === "nominal" ? ", before inflation" : ", after inflation") : "") : undefined))(
        trendRate(trend.values)) }] : []),
    ...(overlay && (state.hist !== "on" || hasLine(overlay)) ? [{ label: overlay.label, color: COMPARE_COLOR, mark: "line" as const, line: "cmp" as const }] : []),
  ];
  // The trend's value, and its step from the year before: the same in dollars each year, a shrinking share as it grows
  const trendRow = (trend: Series | null, i: number, fmt: (v: number) => string = usd): TipRow[] => {
    const v = trend?.values[i];
    if (!trend || v == null) return [];
    const prev = trend.values[i - 1];
    const step = prev == null ? "" : `, ${signed(v - prev, fmt)}${prev > 0 ? ` (${signedPct((v - prev) / prev)})` : ""} on FY${years[i - 1]}`;
    return [{ value: fmt(v), label: trend.label + step, color: TREND_COLOR, mark: "dash" }];
  };
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
      if (panel && it.toggle) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "legend-btn legend-line";
        btn.dataset.key = "toggle";
        btn.setAttribute("aria-pressed", String(!!it.on));
        btn.append(swatch(it), text("span", it.label));
        btn.addEventListener("click", () => {
          it.toggle!();
          refocus = { panel, key: "toggle" };
          render();
        });
        li.append(btn, ...(it.help ? [helpTip(it.help)] : []));
        return li;
      }
      if (panel && it.line) {
        const line = it.line;
        const off = hiddenLines[panel].has(line);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `legend-btn legend-line${off ? " is-off" : ""}`;
        btn.dataset.key = `line:${line}`;
        btn.setAttribute("aria-pressed", String(!off));
        btn.title = off ? "Show this line" : "Hide this line";
        btn.append(swatch(it), text("span", it.label), ...(it.detail ? [text("span", it.detail, "legend-detail")] : []));
        btn.addEventListener("click", () => {
          if (off) hiddenLines[panel].delete(line);
          else hiddenLines[panel].add(line);
          refocus = { panel, key: `line:${line}` };
          askToRemember();
          render();
        });
        li.append(btn, ...(it.help ? [helpTip(it.help)] : []));
        return li;
      }
      if (!set || !it.key) {
        li.className = "legend-static";
        if (it.spot) li.dataset.key = it.spot;
        li.append(swatch(it), text("span", it.label), ...(it.help ? [helpTip(it.help)] : []));
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

  // A legend entry, hovered or focused from the keyboard, spotlights its marks in its chart: they stay,
  // the rest fade. A tap on a touch screen isolates instead, as a click does, so touch doesn't spotlight.
  function spotlight(entry: HTMLElement | null, on: boolean) {
    const key = entry?.dataset.key;
    const box = entry?.closest("figure");
    if (!key || key === "toggle" || !box) return;
    for (const svg of box.querySelectorAll<SVGSVGElement>("svg")) {
      svg.querySelectorAll(".is-lit").forEach((m) => m.classList.remove("is-lit"));
      const marks = on ? svg.querySelectorAll(`[data-key="${CSS.escape(key)}"]`) : [];
      marks.forEach((m) => m.classList.add("is-lit"));
      svg.classList.toggle("is-spotlit", marks.length > 0);
    }
  }
  const legendEntry = (ev: Event) => (ev.target instanceof Element ? ev.target.closest<HTMLElement>(".legend [data-key]") : null);
  document.addEventListener("pointerover", (ev) => ev.pointerType !== "touch" && spotlight(legendEntry(ev), true));
  document.addEventListener("pointerout", (ev) => ev.pointerType !== "touch" && spotlight(legendEntry(ev), false));
  document.addEventListener("focusin", (ev) => {
    const entry = legendEntry(ev);
    if (entry?.matches(":focus-visible")) spotlight(entry, true);
  });
  document.addEventListener("focusout", (ev) => spotlight(legendEntry(ev), false));

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
  interface CmpRow { label: string; color: string; mark: "rect" | "line" | "dash"; values: Values; base: Values | null; total?: boolean }

  interface CmpOpts { end?: number; noCmpNote?: string; per?: string;
    /** The first year's position; with Since 1990 on, by default the first year any row has */
    start?: number }

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

  /** "above", linked to the view's comparison menu; from an enlarged chart, it closes the window first.
   * Under the menu, a "Go back" link returns to the table until it's used or the view changes. */
  const goBack = text("button", "Go back ↓", "link-button go-back") as HTMLButtonElement;
  goBack.type = "button";
  let backTo: HTMLElement | null = null;
  // The menu, ringed until the reader goes back, changes view, scrolls, or clicks anywhere else
  const compareMenus = () => [$("pick-compare"), $("pick-town-compare")];
  let disarm: (() => void) | null = null;
  const settle = () => {
    goBack.remove();
    compareMenus().forEach((m) => m.classList.remove("beckon"));
    disarm?.();
    disarm = null;
  };
  function arm(menu: HTMLElement) {
    disarm?.();
    const mine = (t: EventTarget | null) => t instanceof Node && (menu.contains(t) || goBack.contains(t));
    const away = (ev: Event) => {
      if (!mine(ev.target)) settle();
    };
    const scrolled = () => settle();
    const SCROLL_KEYS = ["PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End", " "];
    const keys = (ev: KeyboardEvent) => {
      if (!mine(ev.target) && SCROLL_KEYS.includes(ev.key)) settle();
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", keys, true);
    window.addEventListener("wheel", scrolled, { passive: true });
    window.addEventListener("touchmove", scrolled, { passive: true });
    // The page's own smooth scroll up to the menu doesn't count; any scroll after it settles does
    const later = window.setTimeout(() => window.addEventListener("scroll", scrolled, { passive: true }), 1000);
    disarm = () => {
      clearTimeout(later);
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", keys, true);
      window.removeEventListener("wheel", scrolled);
      window.removeEventListener("touchmove", scrolled);
      window.removeEventListener("scroll", scrolled);
    };
  }
  goBack.addEventListener("click", () => {
    backTo?.scrollIntoView({ behavior: "smooth", block: "center" });
    backTo?.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
    backTo = null;
    settle();
  });
  function compareLink() {
    const a = document.createElement("a");
    a.textContent = "above";
    a.href = "#view-panel";
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      backTo = a.closest<HTMLElement>("details.compare-view") ?? a.closest<HTMLElement>("figure");
      // From an enlarged chart, close the window first; its controls go home when it has closed
      const open = a.closest("dialog");
      if (open) {
        open.addEventListener("close", () => beckon(), { once: true });
        open.close();
        return;
      }
      beckon();
    });
    return a;
  }
  /** Ring the view's comparison menu and bring it into view, with Go back under it */
  function beckon() {
    dockClose();
    const menu = $(state.view === "towns" ? "pick-town-compare" : "pick-compare");
    menu.after(goBack);
    // Restart the ring's pulse, even when it's already showing
    menu.classList.remove("beckon");
    void menu.offsetWidth;
    menu.classList.add("beckon");
    arm(menu);
    menu.scrollIntoView({ behavior: "smooth", block: "center" });
    menu.focus({ preventScroll: true });
  }

  // ---- The controls, docked: once they scroll away under the tabs, a one-line summary stays in view
  // there, and opens the controls themselves in place of it; scrolling back up puts them home ----
  const tabsBar = document.querySelector<HTMLElement>(".view-tabs")!;
  const controlsForm = document.querySelector<HTMLFormElement>("form.controls")!;
  // The tabs pin to the top of the screen, except where they're a grid that scrolls away (a
  // phone); what floats under them floats under the pinned tabs, or at the very top
  const tabsPinned = () => getComputedStyle(tabsBar).position === "sticky";
  const pinnedBottom = () => (tabsPinned() ? tabsBar.getBoundingClientRect().bottom : 0);
  const setTabsH = () => root.style.setProperty("--tabs-h", `${tabsPinned() ? tabsBar.offsetHeight : 0}px`);
  new ResizeObserver(setTabsH).observe(tabsBar);
  window.addEventListener("resize", setTabsH);
  const dock = text("div", "", "controls-dock");
  dock.hidden = true;
  const dockPanel = text("div", "", "controls-dock-panel");
  const dockBar = text("div", "", "controls-dock-bar");
  const dockSum = text("button", "", "controls-dock-sum") as HTMLButtonElement;
  dockSum.type = "button";
  const dockToggle = text("button", "", "controls-dock-toggle") as HTMLButtonElement;
  dockToggle.type = "button";
  const dockBody = text("div", "", "controls-dock-body");
  dockBar.append(dockSum, dockToggle);
  dockPanel.append(dockBar, dockBody);
  dock.append(dockPanel);
  $("view-panel").prepend(dock);
  // Holds the controls' place while they're docked; the sentinel marks where they end
  const dockHolder = document.createElement("div");
  const dockSentinel = document.createElement("div");
  controlsForm.after(dockSentinel);
  const docked = () => dock.classList.contains("is-open");
  function dockLabel() {
    dockToggle.textContent = docked() ? "Hide controls ▴" : "Show controls ▾";
    dockToggle.setAttribute("aria-expanded", String(docked()));
  }
  function dockOpen() {
    if (docked()) return;
    dockHolder.style.height = `${controlsForm.offsetHeight}px`;
    dockHolder.style.margin = getComputedStyle(controlsForm).margin;
    controlsForm.before(dockHolder);
    dockBody.append(controlsForm);
    dock.classList.add("is-open");
    dockLabel();
  }
  function dockClose() {
    if (!docked()) return;
    dockHolder.replaceWith(controlsForm);
    dock.classList.remove("is-open");
    dockLabel();
  }
  /** The summary: what's chosen, in one line */
  function dockSummary() {
    const onTowns = state.view === "towns";
    const chosen = (sel: HTMLSelectElement) => sel.selectedOptions[0]?.text ?? "";
    const name = onTowns ? townListed.get(state.t)?.name ?? "" : listed.get(state.d)?.name ?? "";
    const cmpSel = onTowns ? townCompareSelect : compareSelect;
    const cmp = cmpSel.value === "none" ? "No comparison"
      : `Compared with ${cmpSel.value === "other" ? chosen(onTowns ? townVsSelect : vsSelect) : chosen(cmpSel).replace(/^Its /, "its ")}`;
    const amounts = onTowns ? (state.per === "total" ? "Totals" : `Per ${PER_WORD[state.per]}`)
      : state.dper === "total" ? "Totals" : "Per pupil";
    const rest = [cmp, amounts, `FY${years[0]}–FY${years[last]}`,
      state.usd === "nominal" ? "Nominal dollars" : `FY${state.usd} dollars`];
    dockSum.replaceChildren(text("strong", name), ` · ${rest.join(" · ")}`);
    dockSum.setAttribute("aria-label", `Show controls: ${name}, ${rest.join(", ")}`);
  }
  function dockCheck() {
    const on = (state.view === "districts" || state.view === "towns") &&
      dockSentinel.getBoundingClientRect().top < pinnedBottom();
    if (!on) dockClose();
    dock.hidden = !on;
  }
  dockToggle.addEventListener("click", () => (docked() ? dockClose() : dockOpen()));
  dockSum.addEventListener("click", () => (docked() ? dockClose() : dockOpen()));
  let dockFrame = 0;
  const dockSoon = () => {
    cancelAnimationFrame(dockFrame);
    dockFrame = requestAnimationFrame(dockCheck);
  };
  window.addEventListener("scroll", dockSoon, { passive: true });
  window.addEventListener("resize", dockSoon);
  dockLabel();

  function compareTable(holder: HTMLElement, caption: string, rowLabel: string, rows: CmpRow[], kind: "usd" | "fte" | "count",
    cmp: Named | null, { end = last, noCmpNote, per = "pupil", start }: CmpOpts = {}) {
    const cName = cmp ? cmp.name : null;
    const fmt = kind === "usd" ? usd : kind === "count" ? (v: number) => Math.round(v).toLocaleString("en-US") : fte;
    const unit = kind === "usd" ? (per ? ` $/${per}` : " $") : "";
    const prior = end - 1;
    const s0 = start ?? (state.hist === "on" ? Math.max(0, Math.min(...rows.map((r) => {
      const i = firstAt(r.values);
      return i < 0 ? Infinity : i;
    }))) : 0);
    // Growth over the years shown, then over the last 10 and 5 when the window holds more
    const windows = [end - s0, ...[10, 5].filter((n) => n < end - s0)].filter((n) => n > 0);
    const t = document.createElement("table");
    t.append(text("caption", caption));
    const head = t.createTHead().insertRow();
    const blank = text("th", "");
    blank.className = "swatch-col";
    head.append(blank, text("th", rowLabel, "label-col"), text("th", `${years[s0]}${unit}`),
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
      tr.append(sw, th, level(r, s0), ...windows.map((n) => growth(r, n)), level(r, prior), level(r, end));
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
        `Shaded where a value differs from ${refName(cmp!)} by 5% or more (${{ usd: "dollars", fte: "enrollment", count: "counts" }[kind]}) ` +
        "or a growth rate by 0.5 percentage points or more; darker shading marks a larger gap. " +
        "Hover a cell for the comparison value. CAGR is the compound annual growth rate, (end\u00a0÷\u00a0start)^(1\u00a0÷\u00a0years)\u00a0−\u00a01."));
    } else {
      const p = document.createElement("p");
      p.append(...(noCmpNote ? [noCmpNote] : ["Choose a comparison ", compareLink(), " to shade this table against it."]),
        " CAGR is the compound annual growth rate, (end\u00a0÷\u00a0start)^(1\u00a0÷\u00a0years)\u00a0−\u00a01.");
      note.append(p);
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
    overlay: Series | null, trend: Series | null, totalLabel: string, noun: string, fmt: (v: number) => string = usd): TipContent => {
    const money = (v: number | null) => (v == null ? "–" : fmt(v));
    const rows: TipRow[] = [];
    const segments = [...shown].reverse().filter((s) => s.values[i] != null && s.values[i]! > 0)
      .map((s) => ({ value: fmt(s.values[i]!), label: s.label, color: s.color, mark: "line" as const }));
    if (!sel) {
      rows.push({ value: money(total[i]), label: totalLabel, strong: true }, ...segments);
    } else {
      rows.push({ value: money(shownTotal[i]), label: capital(sel), strong: true });
      if (shown.length > 1) rows.push(...segments);
      rows.push({ value: money(total[i]), label: `${totalLabel}, all ${noun}` });
    }
    rows.push(...trendRow(trend, i, fmt));
    if (overlay && overlay.values[i] != null) {
      rows.push({ value: fmt(overlay.values[i]!), label: overlay.label, color: COMPARE_COLOR, mark: "line" });
    }
    return { title: `FY${years[i]}`, rows, note: yoy(sel ? shownTotal : total, i) };
  };

  // ---- Render ----
  let lastWidth = 0;
  /** The panel column of the view on screen; every chart is drawn to its width. */
  const panelBox = () => $(state.view === "towns" ? "town-panels" : "panels");

  /** Select the active view's tab. */
  function markTabs() {
    for (const tab of tabs) {
      const on = tab.dataset.view === state.view;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
    }
  }

  /** Show the active view's tab, controls and panels. */
  function applyView() {
    settle();
    const onTowns = state.view === "towns";
    markTabs();
    $("view-panel").setAttribute("aria-labelledby", `tab-${state.view}`);
    // data-view-only lists the views an element belongs to
    document.querySelectorAll<HTMLElement>("[data-view-only]").forEach((n) => {
      n.hidden = !n.dataset.viewOnly!.split(" ").includes(state.view);
    });
    // Words that differ by tab: each .swap holds its words for each view, the school words by default
    document.querySelectorAll<HTMLElement>(".swap").forEach((n) => {
      n.textContent = n.dataset[state.view] ?? n.dataset.districts ?? n.textContent;
    });
    $("vs-control").hidden = onTowns || state.cmp !== "other";
    $("town-vs-control").hidden = !onTowns || state.tcmp !== "other";
  }

  /** Draw the view; refresh() has loaded what it needs. */
  // ---- The window of years: each entity's yearly series, cut to it, made once per window. A series
  // is yearly when it runs the length of the slider's scale. ----
  const yearly = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every((x) => x === null || typeof x === "number");
  function cut<T>(o: T, a: number, b: number, n: number): T {
    if (Array.isArray(o)) return (yearly(o, n) ? o.slice(a, b + 1) : o.map((x) => cut(x, a, b, n))) as T;
    if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, cut(v, a, b, n)])) as T;
    return o;
  }
  const cuts = new WeakMap<object, { key: string; value: unknown }>();
  function win<T extends object>(o: T): T {
    const n = scale().length;
    const [a, b] = span();
    if (a === 0 && b === n - 1) return o;
    const key = `${n}:${a}-${b}`;
    const hit = cuts.get(o);
    if (hit?.key === key) return hit.value as T;
    const value = cut(o, a, b, n);
    cuts.set(o, { key, value });
    return value;
  }
  function setWindow() {
    const ys = scale();
    const [a, b] = span();
    if (years[0] === ys[a] && years.length === b - a + 1) return;
    years = ys.slice(a, b + 1);
    last = years.length - 1;
    hovered = null;
  }

  function render() {
    setWindow();
    applyView();
    showDollars();
    showYears();
    showHist();
    explainDollars();
    // A redraw can come before a district's or town's data does (a resize as a tab opens);
    // refresh() draws once it arrives
    if (state.view === "districts") {
      if (entity(state.d)) renderDistricts();
    }
    else if (state.view === "commonwealth") map?.refresh();
    else if (state.view === "cap" || state.view === "data") { /* these draw themselves */ }
    else if (towns && townById.has(state.t)) renderTowns();
    else if (towns) { /* still loading */ }
    else {
      $("entity-name").textContent = "Town data unavailable";
      $("entity-meta").textContent = "The town data didn't load. Reload the page to try again.";
      relations(null);
      $("tiles").replaceChildren();
    }
    if (state.view === "districts") syncMenu();
    for (const pk of [...districtPickers, ...townPickers]) pk.sync();
    dockSummary();
    dockCheck();
    restoreFocus();
    remember();
  }

  function renderDistricts() {
    const e = win(entity(state.d)!);
    const c = comparisonFor(e);
    // The menu follows the state, as the town view's does: a swap sets "Another district or average"
    compareSelect.value = state.cmp;
    groupLink($<HTMLAnchorElement>("cmp-name"), c && RELATIVE_COMPARES.has(state.cmp) ? c : null);
    // A former district can't be a comparison, so it can't swap places with one
    swapButton($<HTMLButtonElement>("swap-district"), e.name, c, !!c && listed.has(c.id) && !isFormer(state.d));
    const histOn = state.hist === "on" && !!H;
    const real = state.usd !== "nominal";
    const dollarsNote = real ? `FY${state.usd} dollars` : "Nominal dollars";
    const perDistrict = e.kind === "district" ? "" : ", average per district";
    // Per pupil, or with Totals on, the district's whole dollars (an average's average district's)
    const whole = state.dper === "total";
    const pp = whole ? "" : " per pupil";
    const money = whole ? whole$ : usd;
    const wholeNote = !whole ? "" : e.kind === "district" ? " In total: each year's figure per pupil times its pupils."
      : " In total, for the average district: the group's figure per pupil times its average enrollment.";
    const tableOpts = { per: whole ? "" : "pupil" };
    document.querySelectorAll("[data-dper]").forEach((n) => (n.textContent = pp));
    document.querySelectorAll("[data-aria-dper]").forEach((n) =>
      n.setAttribute("aria-label", n.getAttribute("data-aria-dper")!.replace("{dper}", whole ? "" : n.id === "svg-nss" ? " per foundation pupil" : " per pupil")));

    // Comparison menu: shown only for "Another district or average" (applyView)
    select.value = e.id;
    if (state.vs) vsSelect.value = state.vs;
    for (const o of vsSelect.options) o.disabled = o.value === e.id;

    // Heading
    $("entity-name").textContent = e.name;
    const place = e.region ? meta.regions[e.region] : "";
    const bits = e.kind === "average" ? [`${e.members} districts`]
      : e.former ? [`Former ${e.type === "vocational" ? "vocational district" : e.type === "charter" ? "charter school" : "district"}`,
        `figures for FY${e.former.first}–FY${e.former.last}`, place,
        e.former.last < meta.start && !histOn ? "turn on Since 1990 to see its years" : ""]
      : [e.type === "vocational" ? "Vocational district" : e.type === "charter" ? "Charter school"
        : `${meta.cohorts[e.cohort!].short} cohort`, place,
        e.gateway && e.community?.type !== "gateway" ? "Gateway City" : "", communityText(e.community, "students"),
        incomeText(e.income, true)];
    // Said only when "Its cohort in its region" falls back to the statewide cohort
    if (c && state.cmp === "cohort" && e.type === "traditional" && !e.cmp.cohort && place)
      bits.push(`compared statewide: too few ${meta.cohorts[e.cohort!].short} districts in ${place}`);
    else if (!c && state.cmp === "other") bits.push("pick a different district or average to compare with");
    $("entity-meta").textContent = bits.filter(Boolean).join(" · ");
    // A former district: what became of it, from the figures and DESE's list of regional district members,
    // or from a source that says why
    const note = $("entity-note");
    note.hidden = !e.note;
    if (e.note) {
      const src = document.createElement("span");
      src.className = "note-source";
      if (e.note.source) {
        const a = text("a", "DESE") as HTMLAnchorElement;
        a.href = e.note.source;
        src.append("Source: ", a, ".");
      } else src.append(`From DESE's figures and its FY${meta.latest} list of regional district members.`);
      note.replaceChildren(e.note.text, " ", src);
    }
    // Its towns, each with its contribution and the other districts it funds
    // A former district's towns, with the districts they belong to today
    relations(e.towns?.length ? {
      root: e.name,
      note: e.former ? `${e.towns_kind === "members" ? "Member towns · their" : "Town · its"} school districts today`
        : `${e.towns_kind === "members" ? "Member towns" : "Town"} · FY${meta.latest} required local contribution`,
      rows: e.towns.map((t) => ({
        name: viewLink(t.name, { view: "towns", t: t.id }),
        amount: e.former ? undefined : t.contribution,
        extra: t.also.length ? [e.former ? "now in" : "also funds", t.also.map((a) => districtName(a, true))] : null,
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

    // The older measure, with Since 1990 on: the day-program line, the comparison's, and a district's
    // programs. With Totals on, the line is the day-program total times DESE's average membership.
    const dayValues = (x: Entity, v: Values | undefined): Values | null => {
      if (!v) return null;
      const n = x.day_memb;
      return deflate(whole ? v.map((y, i) => (y == null || n?.[i] == null ? null : y * n[i]!)) : v);
    };
    const dayAll: Series | null = histOn && e.day ? { key: "day", label: DAY_LABEL, color: DAY_COLOR, dash: DAY_DASH,
      values: dayValues(e, e.day.total)! } : null;
    const cDayAll: Series | null = histOn && c?.day ? { key: "cday", label: `${cName}, older measure`, color: COMPARE_COLOR,
      dash: DAY_DASH, values: dayValues(c, c.day.total)! } : null;
    const hasPrograms = !!(histOn && e.kind === "district" && e.day && PROGRAM_SERIES.some((p) => hasLine({ ...p, values: e.day![p.key] ?? [] })));
    const programs: Series[] = hasPrograms && showPrograms && !whole
      ? PROGRAM_SERIES.flatMap((p) => (e.day![p.key] ? [{ key: p.key, label: p.label, color: p.color, dash: "2 3", values: dayValues(e, e.day![p.key])! }] : []))
      : [];
    const dayRate = dayAll ? trendRate(linearTrend(dayAll.values)) : null;
    const dayEnds = dayAll ? [firstAt(dayAll.values), lastAt(dayAll.values)] : [-1, -1];
    const dayGrowth = dayRate?.rate != null
      ? `${pct(dayRate.rate)} a year on trend, FY${years[dayEnds[0]]}–FY${years[dayEnds[1]]}${real ? ", after inflation" : ", before inflation"}` : "";
    const colFirst = firstAt(ppeTotal);

    // Tiles (always whole totals, whatever the legend isolates). With Since 1990 on, growth counts from
    // the first year with figures, and a window before FY2005 shows the older measure. A former district's
    // are for its last year in the window.
    const tl = e.former && years.indexOf(e.former.last) >= 0 ? years.indexOf(e.former.last) : last;
    const g = trendRate(linearTrend(ppeTotal))?.rate ?? null;
    const enrollFirst = histOn ? Math.max(0, firstAt(e.enroll.in_district)) : 0;
    const enrollChange =
      e.enroll.in_district[enrollFirst] && e.enroll.in_district[tl]
        ? e.enroll.in_district[tl]! / e.enroll.in_district[enrollFirst]! - 1
        : null;
    const spendTile = ppeTotal[tl] == null && dayAll && dayEnds[1] >= 0
      ? tile(`Spending${pp}, FY${years[dayEnds[1]]}`, money(dayAll.values[dayEnds[1]]!), [dayGrowth, DAY_LABEL,
        c && cDayAll?.values[dayEnds[1]] != null ? `${cName}: ${money(cDayAll.values[dayEnds[1]]!)}` : ""])
      : tile(`Spending${pp}, FY${years[tl]}`, ppeTotal[tl] != null ? money(ppeTotal[tl]!) : "–", [
        g != null ? `${pct(g)} a year on trend since FY${years[Math.max(0, colFirst)]}${real ? ", after inflation" : ", before inflation"}` : "",
        c && cPpeTotal?.[tl] != null ? `${cName}: ${money(cPpeTotal[tl]!)}` : "",
        dayGrowth && colFirst > 0 ? `Older measure: ${dayGrowth}` : "",
      ]);
    // Before FY2005, the older counts: DESE's day-program membership, or before FY1997, NCES's
    const earlyPupils = e.enroll.in_district[tl] == null && histOn
      ? (e.day_memb?.[tl] != null ? { v: e.day_memb[tl]!, src: "day-program membership (DESE)" }
        : e.nces?.[tl] != null ? { v: e.nces[tl]!, src: "fall enrollment (NCES)" } : null) : null;
    const aid = nss[0].values[tl];
    const above = nss[2].values[tl];
    const aidShare = aid != null && nssTotal[tl] ? aid / nssTotal[tl]! : null;
    $("tiles").replaceChildren(
      spendTile,
      earlyPupils
        ? tile(`Enrollment, FY${years[tl]}`, fte(earlyPupils.v), [capital(earlyPupils.src), e.kind === "district" ? "" : "Average per district"])
        : tile(`In-district enrollment, FY${years[tl]}`, e.enroll.in_district[tl] != null ? `${fte(e.enroll.in_district[tl]!)} FTE` : "–", [
          enrollChange != null ? `${pct(enrollChange)} since FY${years[enrollFirst]}` : "",
          e.kind === "district" ? "" : "Average per district",
        ]),
      tile(`Chapter 70 aid${whole ? "" : " per foundation pupil"}, FY${years[tl]}`, aid != null ? money(aid) : "–", [
        aidShare != null ? `${Math.round(aidShare * 100)}% of actual net school spending` : "",
        cNss && cNss[0].values[tl] != null ? `${cName}: ${money(cNss[0].values[tl]!)}` : "",
      ]),
      tile(`Local contribution above required, FY${years[tl]}`, above != null ? money(above) : aid != null ? "Not reported" : "–", [
        above == null ? (aid != null ? `DESE has not reported FY${years[tl]} actual spending` : "")
          : !whole ? "Per foundation pupil" : e.kind === "district" ? "In total" : "For the average district",
        cNss && cNss[2].values[tl] != null ? `${cName}: ${money(cNss[2].values[tl]!)}` : "",
      ]),
    );

    // Shared dollar scale for both dollar panels while nothing is isolated
    let dollarMax = 0;
    years.forEach((_, i) => {
      dollarMax = Math.max(dollarMax, stackTop(ppe, i), stackTop(nss, i), cPpeTotal?.[i] ?? 0, cNssTotal?.[i] ?? 0,
        dayAll?.values[i] ?? 0, cDayAll?.values[i] ?? 0, ...programs.map((p) => p.values[i] ?? 0));
    });
    const dollarTicks = niceTicks(dollarMax * 1.04);
    const enrollMax = Math.max(...enroll.flatMap((s) => s.values.map((v) => v ?? 0)));
    const enrollTicks = niceTicks(enrollMax * 1.04, 4);

    const width = panelBox().clientWidth;
    lastWidth = width;
    const tall = width < 520 ? 260 : 320;
    const frame = (height: number, yTitle: string, yTitleShort?: string) => ({ width, height, years, yTitle, yTitleShort });

    // Panel 1: spending by category
    const ppeShown = visible(ppe, "ppe");
    const ppeSel = selectionName(ppeShown, ppe, "categories");
    const ppeShownTotal = totals(ppeShown);
    const cPpeShownTotal = cPpe ? totals(visible(cPpe, "ppe")) : null;
    const ppeOverlayAll = c ? { key: "cmp", label: `${cName}, ${ppeSel ?? "total"}`, color: COMPARE_COLOR, values: cPpeShownTotal! } : null;
    const ppeTrendAll = trendOf(e.name, ppeSel, ppeShownTotal);
    const ppeOverlay = drawn("ppe", "cmp", ppeOverlayAll);
    const ppeTrend = drawn("ppe", "trend", ppeTrendAll);
    // The older measure's lines are totals, so they leave the chart while categories are isolated
    const dayShown = ppeSel ? null : drawn("ppe", "day", dayAll);
    const cDayShown = ppeSel ? null : drawn("ppe", "cday", cDayAll);
    const extras = [cDayShown, dayShown, ...(ppeSel ? [] : programs)].filter(hasLine);
    const earlyWindow = dayAll != null && hasLine(dayAll) && dayEnds[0] >= 0 && years[dayEnds[0]] < H!.functional_from;
    $("ppe-sub").textContent =
      `${dollarsNote}${whole ? "" : " per in-district FTE pupil"}.${wholeNote}` +
      (whole ? " Pupils are in-district FTE." : "") +
      (ppeSel ? " Scale fitted to the selection." : "") +
      (earlyWindow ? ` ${years[last] >= H!.functional_from ? HIST_NOTE : HIST_NOTE.replace(/ In FY2005 and FY2006.*$/, "")}` : "") +
      (earlyWindow && whole ? " With Totals on, the dashed line is the day-program figure times DESE's average membership, FY1997 to FY2006." : "") +
      (histOn && ppeSel && dayAll && hasLine(dayAll) ? " The older measure's line is a total, so it shows when every category does." : "");
    const p1 = stackedColumns($("svg-ppe") as unknown as SVGSVGElement, frame(tall, `Spending${pp}`), ppeShown, ppeOverlay,
      ppeSel ? fitTicks(ppeShown, ppeOverlay?.values ?? null) : dollarTicks, fmtUsd, setHover,
      { value: ppeShownTotal[last], text: usd }, [], ppeTrend, extras);
    legend($("legend-ppe"), [
      ...ppe.map((s) => ({ key: s.key, label: s.label, color: s.color, mark: "rect" as const })),
      ...lineLegend(ppeTrendAll, ppeOverlayAll),
      ...(dayAll && hasLine(dayAll) && !ppeSel ? [{ label: DAY_LABEL, color: DAY_COLOR, mark: "dash" as const, line: "day" as const,
        detail: dayGrowth || undefined, help: e.kind === "average" ? `${DAY_NOTE}\n\n${WEIGHT_NOTE}` : DAY_NOTE }] : []),
      ...(cDayAll && hasLine(cDayAll) && !ppeSel ? [{ label: cDayAll.label, color: COMPARE_COLOR, mark: "dash" as const, line: "cday" as const,
        help: c!.kind === "average" ? WEIGHT_NOTE : undefined }] : []),
      ...(hasPrograms && !whole && !ppeSel ? [{ label: showPrograms ? "Hide the programs" : "Show the programs, older measure", color: DAY_COLOR, mark: "dash" as const, on: showPrograms,
        toggle: () => (showPrograms = !showPrograms),
        help: "DESE's day-program figure for each program the district ran: regular classes (regular day), special " +
          "education (special needs), bilingual programs (to FY2003, when DESE folded them into regular education) and " +
          "vocational programs (occupational day). Each is per pupil in that program, so they don't add up to the total." },
        ...programs.map((p) => ({ label: p.label, color: p.color, mark: "dash" as const, spot: `line:${p.key}` }))] : []),
    ], "ppe");
    compareTable($("cmp-ppe"), `Spending${whole ? "" : " per in-district FTE pupil"}${ppeSel ? `, ${ppeSel}` : ""}, ${e.name} (${dollarsNote.toLowerCase()})`, "Category",
      cmpRows(ppeShown, cPpe, ppeSel, ppeTotal, cPpeTotal, ppeShownTotal, cPpeShownTotal, "Total"), "usd", c, tableOpts);
    // The older measure's own table, over its own years
    const dayHolder = $("cmp-day");
    if (dayAll && dayEnds[1] - dayEnds[0] >= 1) {
      const cDayProg = (k: DayKey) => (c?.day?.[k] && c.kind === "district" ? dayValues(c, c.day[k]) : null);
      const progRows = whole ? [] : PROGRAM_SERIES.flatMap((p) => (e.day![p.key] && hasLine({ ...p, values: e.day![p.key]! })
        ? [{ label: p.label, color: p.color, mark: "dash" as const, values: dayValues(e, e.day![p.key])!, base: cDayProg(p.key) }] : []));
      compareTable(dayHolder, `${DAY_LABEL}: day-program spending${whole ? "" : " per pupil"}, ${e.name} (${dollarsNote.toLowerCase()})`, "Program",
        [...progRows, { label: "Total, all day programs", color: "", mark: "dash" as const, values: dayAll.values, base: cDayAll?.values ?? null, total: true }],
        "usd", c, { ...tableOpts, start: dayEnds[0], end: dayEnds[1] });
    } else dayHolder.replaceChildren();
    fullTables.ppe = { caption: `Spending${whole ? "" : " per in-district FTE pupil"} by category, ${e.name} (${dollarsNote.toLowerCase()})`, cols: [
      ...ppe.map((s) => ({ label: s.label, values: s.values, fmt: usd })),
      { label: "Total", values: ppeTotal, fmt: usd },
      ...(c ? [{ label: `${cName}, total`, values: cPpeTotal!, fmt: usd }] : []),
      ...(dayAll && hasLine(dayAll) ? [{ label: `${DAY_LABEL} (day program)`, values: dayAll.values, fmt: usd }] : []),
      ...(cDayAll && hasLine(cDayAll) ? [{ label: cDayAll.label, values: cDayAll.values, fmt: usd }] : []),
    ] };

    // Pupils educated elsewhere: what the district pays to educate its own pupils in other schools, per
    // out-of-district FTE pupil, or with Totals on, in dollars. DESE's totals give it (export: ood_series).
    const oodOf = (x: Entity): Series => {
      const v = x.ood ?? nulls(years.length);
      const n = x.enroll.out_of_district;
      return { key: "ood", label: whole ? "Payments to out-of-district schools" : "Per pupil educated elsewhere", color: OOD_COLOR,
        values: deflate(whole ? v.map((y, i) => (y == null || n[i] == null ? null : y * n[i]!)) : v) };
    };
    const ood = oodOf(e);
    const cOod = c ? oodOf(c) : null;
    const oodOverlayAll = cOod ? { key: "cmp", label: cName, color: COMPARE_COLOR, values: cOod.values } : null;
    const oodTrendAll = trendOf(e.name, null, ood.values);
    const oodOverlay = drawn("ood", "cmp", oodOverlayAll);
    const oodTrend = drawn("ood", "trend", oodTrendAll);
    $("ood-sub").replaceChildren(
      `${dollarsNote}${whole ? `, in total${perDistrict}` : " per out-of-district FTE pupil"}: tuition and other payments for the ` +
      "district's own pupils educated elsewhere, such as charter schools, other districts, and special education schools. " +
      "With only a few pupils placed out, one placement moves the figure a lot. ", helpTip(
        "DESE's data reports no separate figure for these payments from FY2009. The explorer works them out from DESE's " +
        "totals: total spending per pupil times all FTE pupils, less in-district spending per pupil times in-district " +
        "pupils, over out-of-district pupils. For FY2005 to FY2008, where DESE printed the figure, the two agree to within " +
        "0.7%. An average pools its districts' payments over their out-of-district pupils."));
    let oodMax = 0;
    years.forEach((_, i) => (oodMax = Math.max(oodMax, ood.values[i] ?? 0, oodOverlay?.values[i] ?? 0)));
    const p5 = stackedColumns($("svg-ood") as unknown as SVGSVGElement, frame(width < 520 ? 220 : 260, whole ? "Payments" : "Per pupil placed out", "Per pupil"),
      [ood], oodOverlay, niceTicks(oodMax * 1.04), fmtUsd, setHover, { value: ood.values[last], text: usd }, [], oodTrend);
    legend($("legend-ood"), [{ label: ood.label, color: OOD_COLOR, mark: "rect" as const, spot: ood.key }, ...lineLegend(oodTrendAll, oodOverlayAll)], "ood");
    const oodCaption = `Payments to out-of-district schools${whole ? "" : " per out-of-district FTE pupil"}, ${e.name} (${dollarsNote.toLowerCase()})`;
    compareTable($("cmp-ood"), oodCaption, "Measure",
      [{ label: ood.label, color: OOD_COLOR, mark: "rect", values: ood.values, base: cOod?.values ?? null }], "usd", c, tableOpts);
    fullTables.ood = { caption: oodCaption, cols: [
      { label: ood.label, values: ood.values, fmt: usd },
      { label: "Out-of-district FTE pupils", values: e.enroll.out_of_district, fmt: fte },
      ...(cOod ? [{ label: cName, values: cOod.values, fmt: usd }] : []),
    ] };
    const oodTip = (i: number): TipContent => ({
      title: `FY${years[i]}`,
      rows: [
        { value: ood.values[i] != null ? usd(ood.values[i]!) : "–", label: ood.label, strong: true },
        ...(e.enroll.out_of_district[i] != null ? [{ value: fte(e.enroll.out_of_district[i]!), label: `Out-of-district FTE pupils${perDistrict ? ", average per district" : ""}` }] : []),
        ...trendRow(oodTrend, i),
        ...(oodOverlay && oodOverlay.values[i] != null ? [{ value: usd(oodOverlay.values[i]!), label: oodOverlay.label, color: COMPARE_COLOR, mark: "line" as const }] : []),
      ],
      note: yoy(ood.values, i),
    });

    // Panel 2: enrollment
    $("enroll-sub").replaceChildren(`Pupils counted three ways${perDistrict}. `, helpTip(
      "In-district FTE: the pupils taught in the district's own schools, including those who come from other towns by " +
      "school choice or tuition. Full-time equivalents averaged over the year: a pupil enrolled for half the year counts " +
      "as half.\n\nOut-of-district FTE: the district's own pupils it pays to educate elsewhere, such as charter schools, " +
      "other districts, and special education schools.\n\nFoundation enrollment: the count Chapter 70 uses. Every pupil " +
      "the district is financially responsible for on one day, October 1, the fall before the fiscal year begins: " +
      `FY${meta.latest}'s count is from October 1, ${meta.latest - 2}. Pre-kindergarten and half-day kindergarten pupils ` +
      "count as half."));
    if (histOn && enroll.some((s) => s.dash && hasLine(s))) $("enroll-sub").append("In earlier years, two more. ", helpTip(
      "Day-program membership: DESE's average membership in its day programs, FY1997 to FY2006, full-time " +
      "equivalents over the year, as its older per-pupil figure divides by.\n\nFall enrollment: the pupils the " +
      "National Center for Education Statistics counted in each district's schools each fall, FY1990 to FY1996, " +
      "for which DESE's reports give no pupils (Common Core of Data). It is a head count from a different agency, so " +
      "it differs a little from DESE's counts. Averages are per district."));
    const p2 = lines($("svg-enroll") as unknown as SVGSVGElement, frame(width < 520 ? 200 : 230, "Pupils"), enroll, enrollTicks,
      (v) => compact(v), fte, setHover);
    legend($("legend-enroll"), enroll.filter((s) => !s.dash || hasLine(s))
      .map((s) => ({ label: s.label, color: s.color, mark: s.dash ? "dash" as const : "line" as const, spot: s.key })));
    compareTable($("cmp-enroll"), `Enrollment, ${e.name}${perDistrict}`, "Measure",
      // The earlier counts end before the table's last years; the full data table has them
      enroll.filter((s) => !s.dash)
        .map((s) => ({ label: s.label, color: s.color, mark: "line" as const, values: s.values,
          base: cEnroll?.find((x) => x.key === s.key)?.values ?? null })),
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
      `${dollarsNote}${whole ? "" : " per foundation pupil"}.${wholeNote}` +
      (whole ? " Pupils are foundation enrollment." : "") +
      (nssSel ? " Scale fitted to the selection." : ` Column height is actual net school spending${pp}.`) +
      (unreported.length ? ` Faded: DESE has not reported FY${unreported.join(", FY")} actual spending.` : "");
    const p3 = stackedColumns($("svg-nss") as unknown as SVGSVGElement, frame(tall, `Net school spending${pp}`, `Spending${pp}`), nssShown, nssOverlay,
      nssSel ? fitTicks(nssShown, nssOverlay?.values ?? null) : dollarTicks, fmtUsd, setHover,
      { value: nssShownTotal[last], text: usd }, years.map((_, i) => showsAbove && nss[2].values[i] == null), nssTrend);
    // The hatch only appears when a shortfall sits on top of other segments
    const hasShortfall = showsAbove && nssShown.length > 1 && nss[2].values.some((v) => v != null && v < 0);
    legend($("legend-nss"), [
      ...nss.map((s) => ({ key: s.key, label: s.label, color: s.color, mark: "rect" as const })),
      ...(hasShortfall ? [{ label: "Below required (shortfall)", color: "#524f45", mark: "hatch" as const, spot: "shortfall" }] : []),
      ...lineLegend(nssTrendAll, nssOverlayAll),
    ], "nss");
    compareTable($("cmp-nss"), `Chapter 70 aid and net school spending${whole ? "" : " per foundation pupil"}${nssSel ? `, ${nssSel}` : ""}, ${e.name} (${dollarsNote.toLowerCase()})`, "Component",
      cmpRows(nssShown, cNss, nssSel, nssTotal, cNssTotal, nssShownTotal, cNssShownTotal, "Actual net school spending"), "usd", c, tableOpts);
    fullTables.nss = { caption: `Chapter 70 aid and net school spending${whole ? "" : " per foundation pupil"}, ${e.name} (${dollarsNote.toLowerCase()})`, cols: [
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
      // The latest revenue year, or the window's last year if that comes first
      const at = years.indexOf(revYears.latest);
      const end = at < 0 ? last : at;
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
        (whole
          ? `${dollarsNote}, in total${e.kind === "district" ? "" : `, for the average of its ${e.rev_members} regional districts`}: ` +
            "each year's revenue per in-district FTE pupil times its pupils. "
          : `${dollarsNote} per in-district FTE pupil${e.kind === "district" ? "" : `, pooled over its ${e.rev_members} regional districts`}. `) +
        `Census figures through FY${revYears.latest}.` +
        (c && !cRev ? ` ${capital(refName(c))} has no revenue chart to compare.` : "") +
        (revSel ? " Scale fitted to the selection." : "");
      let revMax = 0;
      years.forEach((_, i) => (revMax = Math.max(revMax, stackTop(rev, i), cRevTotal?.[i] ?? 0)));
      p4 = stackedColumns($("svg-rev") as unknown as SVGSVGElement, frame(tall, `Revenue${pp}`), revShown, revOverlay,
        revSel ? fitTicks(revShown, revOverlay?.values ?? null) : niceTicks(revMax * 1.04), fmtUsd, setHover,
        { value: revShownTotal[end], text: usd, index: end }, [], revTrend);
      legend($("legend-rev"), [
        ...rev.map((s) => ({ key: s.key, label: s.label, color: s.color, mark: "rect" as const })),
        ...lineLegend(revTrendAll, revOverlayAll),
      ], "rev");
      compareTable($("cmp-rev"), `Revenue${whole ? "" : " per in-district FTE pupil"}${revSel ? `, ${revSel}` : ""}, ${e.name} (${dollarsNote.toLowerCase()})`, "Source",
        cmpRows(revShown, cRev, revSel, revTotal, cRevTotal, revShownTotal, cRevShownTotal, "Total"),
        "usd", cRev ? { ...c!, name: cRevName } : null, {
        end, ...tableOpts, noCmpNote: c ? `${capital(refName(c))} has no revenue figures to shade this table against.` : undefined,
      });
      fullTables.rev = { caption: `Revenue${whole ? "" : " per in-district FTE pupil"} by source, ${e.name} (${dollarsNote.toLowerCase()})`, cols: [
        ...rev.map((s) => ({ label: s.label, values: s.values, fmt: usd })),
        { label: "Total", values: revTotal, fmt: usd },
        ...(cRev ? [{ label: `${cRevName}, total`, values: cRevTotal!, fmt: usd }] : []),
      ] };
      revTip = (i) => revTotal[i] == null
        ? { title: `FY${years[i]}`, rows: [{ value: "–", label: "Not yet published by Census" }] }
        : stackTip(i, revShown, revSel, revShownTotal, revTotal, revOverlay, revTrend, `Total revenue${pp}`, "sources");
    }

    // Tooltips
    panels = [
      {
        panel: p1, figure: $("fig-ppe"),
        tip: (i) => {
          const t = stackTip(i, ppeShown, ppeSel, ppeShownTotal, ppeTotal, ppeOverlay, ppeTrend, `Total${pp}`, "categories");
          // The older measure's lines, under the columns' figures; alone, before FY2005
          const at = (x: Series | null) => (x && x.values[i] != null ? x.values[i]! : null);
          const rows: TipRow[] = [
            ...(at(dayShown) != null ? [{ value: usd(at(dayShown)!), label: `${DAY_LABEL} (day program)`, color: DAY_COLOR, mark: "dash" as const,
              strong: ppeTotal[i] == null }] : []),
            ...programs.filter((p) => at(p) != null).map((p) => ({ value: usd(at(p)!), label: p.label, color: p.color, mark: "dash" as const })),
            ...(at(cDayShown) != null ? [{ value: usd(at(cDayShown)!), label: cDayShown!.label, color: COMPARE_COLOR, mark: "dash" as const }] : []),
          ];
          if (!rows.length) return t;
          if (ppeTotal[i] == null) return { title: t.title, rows, note: dayShown ? yoy(dayShown.values, i) : undefined };
          return { ...t, rows: [...t.rows, ...rows] };
        },
      },
      {
        panel: p2, figure: $("fig-enroll"),
        tip: (i) => ({
          title: `FY${years[i]}`,
          rows: enroll.filter((s) => s.values[i] != null)
            .map((s) => ({ value: fte(s.values[i]!), label: s.label, color: s.color, mark: s.dash ? "dash" as const : "line" as const })),
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
      { panel: p5, figure: $("fig-ood"), tip: oodTip },
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

  interface RelRow { name: HTMLElement; kind?: string; amount?: number | null; extra: [string, HTMLElement[]] | null }

  /** Beside Compare with: a relative choice ("Its cohort in its region") as the group it stands for, by name,
   * linking to that group on the groups page; otherwise a link to all the groups */
  function groupLink(a: HTMLAnchorElement, group: Named & { id: string } | null) {
    a.textContent = group ? group.name : "All groups";
    a.title = group ? `${group.name}: its members` : "Every group and its members";
    a.href = `/muni-spending/groups/${group ? `#${group.id}` : ""}`;
    a.classList.toggle("is-group", !!group);
  }

  /** Swap beside Compare with: shown while there's a comparison, and active when the comparison can be the
   * focus (it's in the District or Town menu) and the focus can be its comparison */
  function swapButton(b: HTMLButtonElement, name: string, c: (Named & { id: string }) | null, can: boolean) {
    b.classList.toggle("is-idle", !c);
    b.disabled = !can;
    const what = c && can ? `Show ${c.name}, compared with ${name}` : "Can't swap these two";
    b.title = what;
    b.setAttribute("aria-label", `Swap: ${what}`);
  }

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
      if (r.amount !== undefined) li.append(text("span", r.amount != null ? millions(r.amount) : "–", "rel-amt"));
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
    key: "tspend" | "trev" | "tval" | "tpar" | "tlevy";
    name: string;
    series: Series[];
    cSeries: Series[] | null;
    cmp: Town | null;
    noun: string;
    rowLabel: string;
    caption: string;
    /** The vertical axis's name when the caption won't fit */
    yShort: string;
    sub: string;
    totalLabel: string;
    end: number;
    width: number;
    /** Values and axis labels, and the comparison table's kind: dollars unless given */
    fmt?: (v: number) => string;
    axis?: (v: number) => string;
    kind?: "usd" | "count";
    noCmpNote?: string;
    /** The tooltip for a year the town didn't report */
    missing?: string;
  }

  /** A stacked town panel (spending, revenue, property): chart, legend, tables; returns it with its tooltip. */
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
    const fmt = s.fmt ?? usd;
    const panel = stackedColumns($(`svg-${s.key}`) as unknown as SVGSVGElement,
      { width: s.width, height: s.width < 520 ? 260 : 320, years, yTitle: s.caption, yTitleShort: s.yShort }, shown, overlay,
      sel ? fitTicks(shown, overlay?.values ?? null) : niceTicks(max * 1.04), s.axis ?? fmtUsd, setHover,
      { value: shownTotal[s.end], text: fmt, index: s.end }, [], trend);
    legend($(`legend-${s.key}`), [
      ...s.series.map((x) => ({ key: x.key, label: x.label, color: x.color, mark: "rect" as const })),
      ...lineLegend(trendAll, overlayAll, fmt),
    ], s.key);
    const units = s.kind === "count" ? "" : ` (${dollarsNote.toLowerCase()})`;
    compareTable($(`cmp-${s.key}`), `${s.caption}${sel ? `, ${sel}` : ""}, ${s.name}${units}`, s.rowLabel,
      cmpRows(shown, s.cSeries, sel, total, cTotal, shownTotal, cShownTotal, "Total"), s.kind ?? "usd", s.cmp,
      { end: s.end, per: state.per === "total" ? "" : PER_WORD[state.per], noCmpNote: s.noCmpNote });
    fullTables[s.key] = { caption: `${s.caption} by year, ${s.name}${units}`, cols: [
      ...s.series.map((x) => ({ label: x.label, values: x.values, fmt })),
      { label: "Total", values: total, fmt },
      ...(s.cmp && cTotal ? [{ label: `${s.cmp.name}, total`, values: cTotal, fmt }] : []),
    ] };
    const tip = (i: number): TipContent => total[i] == null
      ? { title: `FY${years[i]}`, rows: [{ value: "–", label: s.missing ?? "Not filed with the state" }] }
      : stackTip(i, shown, sel, shownTotal, total, overlay, trend, s.totalLabel, s.noun, fmt);
    return { panel, tip, total, cTotal };
  }

  function renderTowns() {
    const t = win(townById.get(state.t)!);
    const c = townComparison(t);
    groupLink($<HTMLAnchorElement>("town-cmp-name"), c && RELATIVE_COMPARES.has(state.tcmp) ? c : null);
    swapButton($<HTMLButtonElement>("swap-town"), t.name, c, !!c && townListed.has(c.id));
    const real = state.usd !== "nominal";
    const dollarsNote = real ? `FY${state.usd} dollars` : "Nominal dollars";
    townSelect.value = t.id;
    townCompareSelect.value = state.tcmp;
    if (state.tvs) townVsSelect.value = state.tvs;
    for (const o of townVsSelect.options) o.disabled = o.value === t.id;

    // The data are per resident. Per household or taxable property, each year's values scale by
    // residents over households or parcels, the town's (or an average's towns' combined) own. In
    // total they scale by residents: a town's whole dollars, or an average's average town's, its
    // combined residents over its towns.
    const perWord = PER_WORD[state.per];
    const inTotal = state.per === "total";
    const perP = inTotal ? "" : ` per ${perWord}`;
    const money = inTotal ? whole$ : usd;
    // Titles and chart descriptions name the unit the Per choice picks
    document.querySelectorAll("[data-per]").forEach((n) => (n.textContent = perP));
    document.querySelectorAll("[data-aria-per]").forEach((n) =>
      n.setAttribute("aria-label", n.getAttribute("data-aria-per")!.replace("{per}", perP)));
    const parcelCount = (x: Town): Values =>
      years.map((_, i) => (x.parcels ? sumAt(PARCEL_SERIES.map((q) => x.parcels![q.key]), i) : null));
    const perK = (x: Town): Values => {
      if (state.per === "resident") return years.map(() => 1);
      if (state.per === "total") return x.pop.map((p) => (p == null ? null : x.kind === "average" && x.members ? p / x.members : p));
      const d = state.per === "household" ? x.hh ?? years.map(() => null) : parcelCount(x);
      return years.map((_, i) => (d[i] && x.pop[i] ? x.pop[i]! / d[i]! : null));
    };
    const kT = perK(t);
    const kC = c ? perK(c) : null;
    const per = (vals: Values, k: Values) => vals.map((v, i) => (v == null || k[i] == null ? null : v * k[i]!));
    const spend: Series[] = TOWN_SPEND_SERIES.map((s) => ({ ...s, values: deflate(per(t.spend[s.key], kT)) }));
    const rev: Series[] = TOWN_REV_SERIES.map((s) => ({ ...s, values: deflate(per(t.rev[s.key], kT)) }));
    const cSpend: Series[] | null = c ? TOWN_SPEND_SERIES.map((s) => ({ ...s, values: deflate(per(c.spend[s.key], kC!)) })) : null;
    const cRev: Series[] | null = c ? TOWN_REV_SERIES.map((s) => ({ ...s, values: deflate(per(c.rev[s.key], kC!)) })) : null;
    const perNote: Record<Per, string> = {
      resident: "",
      household: "Households are the Census Bureau's American Community Survey five-year estimates, the release ending " +
        `the year each fiscal year begins (FY${meta.latest}: ${meta.latest - 5}–${meta.latest - 1}). The first ` +
        "release, 2005–2009, serves FY2009, so earlier years have no household figures. Small towns' estimates " +
        "carry wide margins of error.",
      parcel: "Taxable properties are the parcels of taxable real estate on each town's LA-4 report, as of January 1 " +
        "before the fiscal year. Personal property accounts and exempt parcels aren't counted.",
      total: "Totals are each year's dollars for the whole town. An average's totals are its average town's: the " +
        "group's figure per resident times its combined population over its towns.",
    };
    $("per-note").textContent = perNote[state.per];
    const spendTotal = totals(spend);
    const end = lastWith(spendTotal);
    const fy = years[end];
    // Years the town filed no budget: none in its own figures, before any per-household or per-parcel
    // scaling, which leaves a year empty where there's no count to divide by
    const unfiled = years.filter((_, i) => sumAt(TOWN_SPEND_SERIES.map((s) => t.spend[s.key]), i) == null);

    // Heading
    $("entity-name").textContent = t.name;
    const popNow = t.pop[last];
    const peerLabel = towns!.meta.peers.find((x) => x.id === t.peer)?.label;
    const place = t.region ? meta.regions[t.region] : "";
    const bits = t.kind === "town" ? [`${t.county} County`, place, t.gateway && t.community?.type !== "gateway" ? "Gateway City" : "",
      communityText(t.community, "residents"), incomeText(t.income, false)]
      : [`${t.members} towns`];
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
    const g = trendRate(linearTrend(spendTotal))?.rate ?? null;
    const eduShare = share(spend[0].values[end], spendTotal[end]);
    const cEduShare = cSpend ? share(cSpend[0].values[end], cSpendTotal![end]) : null;
    const taxShare = share(rev[0].values[end], revTotal[end]);
    const cTaxShare = cRev ? share(cRev[0].values[end], cRevTotal![end]) : null;
    const popChange = t.pop[0] && popNow ? popNow / t.pop[0] - 1 : null;
    const allDollars = deflate(t.spend_total)[end];

    // Property (DLS): assessed value per resident and parcels by type, EQV, single-family tax bills.
    // An average's parcels are its towns' combined, shown per town.
    const hasProp = !!(towns!.meta.property && t.prop && t.parcels);
    const propSeries = (x: Town): Series[] => {
      const k = x === t ? kT : perK(x);
      return PROPERTY_SERIES.map((q) => ({ ...q, values: deflate(per(x.prop![q.key], k)) }));
    };
    const parcelSeries = (x: Town): Series[] => {
      const k = x.kind === "average" && x.members ? 1 / x.members : 1;
      return PARCEL_SERIES.map((p) => ({ ...p, values: x.parcels![p.key].map((v) => (v == null ? null : v * k)) }));
    };
    const cHasProp = !!(c?.prop && c.parcels);
    const val = hasProp ? propSeries(t) : [];
    const cVal = hasProp && cHasProp ? propSeries(c!) : null;
    const valTotal = totals(val);
    const pEnd = hasProp ? lastWith(valTotal) : end;
    const par = hasProp ? parcelSeries(t) : [];
    const parTotal = totals(par);
    const homes = (series: Series[], i: number) =>
      share(sumAt(series.filter((x) => RESIDENTIAL.has(x.key)).map((x) => x.values), i), sumAt(series.map((x) => x.values), i));
    const singles = (series: Series[], i: number) => share(series[0].values[i], sumAt(series.map((x) => x.values), i));
    const eIdx = hasProp ? lastWith(t.eqv!) : end;
    const bIdx = hasProp ? lastWith(t.sf_bill!) : end;
    const propTiles = !hasProp ? [] : [
      tile(`Assessed value${perP}, FY${years[pEnd]}`, valTotal[pEnd] != null ? money(valTotal[pEnd]!) : "–", [
        !inTotal && t.kind === "town" && t.value_total?.[pEnd] != null ? `${amount(t.value_total[pEnd]!)} in all` : "",
        homes(val, pEnd) != null ? `Residential: ${percent(homes(val, pEnd)!)} of it` : "",
        cVal && totals(cVal)[pEnd] != null ? `${c!.name}: ${money(totals(cVal)[pEnd]!)}` : "",
      ]),
      tile(`${t.kind === "town" ? "Parcels" : "Parcels per town"}, FY${years[pEnd]}`, parTotal[pEnd] != null ? count(parTotal[pEnd]!) : "–", [
        singles(par, pEnd) != null ? `${percent(singles(par, pEnd)!)} single-family homes` : "",
        cHasProp && singles(parcelSeries(c!), pEnd) != null ? `${c!.name}: ${percent(singles(parcelSeries(c!), pEnd)!)}` : "",
      ]),
      tile(`Equalized valuation${perP}, January ${years[eIdx] - 1}`,
        per(t.eqv!, kT)[eIdx] != null ? money(deflate(per(t.eqv!, kT))[eIdx]!) : "–", [
        t.eqv_total?.[eIdx] != null && !(inTotal && t.kind === "town")
          ? `${amount(t.eqv_total[eIdx]!)} ${t.kind === "town" ? "in all" : "combined"}` : "",
        c?.eqv && per(c.eqv, kC!)[eIdx] != null ? `${c.name}: ${money(deflate(per(c.eqv, kC!))[eIdx]!)}` : "",
      ]),
      tile(`Average single-family tax bill, FY${years[bIdx]}`, t.sf_bill![bIdx] != null ? usd(deflate(t.sf_bill!)[bIdx]!) : "–", [
        t.sf_bill_income?.[bIdx] != null ? `${percent(t.sf_bill_income[bIdx]!)} of income per capita` : "",
        c?.sf_bill?.[bIdx] != null ? `${c.name}: ${usd(deflate(c.sf_bill)[bIdx]!)}` : "",
      ]),
    ];
    $("tiles").replaceChildren(
      tile(`General fund spending${perP}, FY${fy}`, spendTotal[end] != null ? money(spendTotal[end]!) : "–", [
        // Since the first year with a figure: per household begins with the first household count, FY2009
        g != null ? `${pct(g)} a year on trend since FY${years[Math.max(0, firstAt(spendTotal))]}${real ? ", after inflation" : ", before inflation"}` : "",
        !inTotal && t.kind === "town" && allDollars != null ? `${millions(allDollars)} in all` : "",
        inTotal && t.kind === "average" ? "For the average town" : "",
        c && cSpendTotal?.[end] != null ? `${c.name}: ${money(cSpendTotal[end]!)}` : "",
      ]),
      tile(`Education's share of spending, FY${fy}`, eduShare != null ? percent(eduShare) : "–", [
        spend[0].values[end] != null ? `${money(spend[0].values[end]!)}${perP}` : "",
        c && cEduShare != null ? `${c.name}: ${percent(cEduShare)}` : "",
      ]),
      tile(`Taxes' share of revenue, FY${fy}`, taxShare != null ? percent(taxShare) : "–", [
        rev[0].values[end] != null ? `${money(rev[0].values[end]!)}${perP}` : "",
        c && cTaxShare != null ? `${c.name}: ${percent(cTaxShare)}` : "",
      ]),
      tile(`${t.kind === "town" ? "Population" : "Combined population"}, July ${years[last] - 1}`, popNow != null ? count(popNow) : "–", [
        popChange != null ? `${pct(popChange)} since July ${years[0] - 1}` : "",
        t.kind === "average" ? "Census Bureau estimates" : peerLabel ? `Peer group: towns with ${peerLabel}` : "Not in a peer group",
      ]),
      ...propTiles,
    );

    const width = panelBox().clientWidth;
    lastWidth = width;
    const filed = unfiled.length ? ` Not filed for FY${unfiled.join(" or FY")}.` : "";

    // Panel 1: spending by function
    const p1 = townStack({
      key: "tspend", name: t.name, series: spend, cSeries: cSpend, cmp: c, noun: "functions", rowLabel: "Function",
      caption: `General fund spending${perP}`, yShort: `Spending${perP}`, totalLabel: `Total${perP}`, end, width,
      sub: `${dollarsNote}${perP}.${filed}`,
    }, dollarsNote);

    // Panel 2: revenue by source
    const p2 = townStack({
      key: "trev", name: t.name, series: rev, cSeries: cRev, cmp: c, noun: "sources", rowLabel: "Source",
      caption: `General fund revenue${perP}`, yShort: `Revenue${perP}`, totalLabel: `Total${perP}`, end, width,
      sub: `${dollarsNote}${perP}.${filed}`,
    }, dollarsNote);

    // The property tax: the levy against its Prop 2 1/2 limit, and the single-family bill
    const hasLevy = hasProp && !!t.levy;
    for (const id of ["fig-tlevy", "fig-tbill"]) $(id).hidden = !hasLevy;
    const taxPanels: typeof panels = [];
    if (hasLevy) {
      const levy: Series[] = LEVY_SERIES.map((x) => ({ ...x, values: deflate(per(t.levy![x.key], kT)) }));
      const cLevy: Series[] | null = c?.levy ? LEVY_SERIES.map((x) => ({ ...x, values: deflate(per(c.levy![x.key], kC!)) })) : null;
      const lEnd = lastWith(totals(levy));
      const raised = t.levy_total?.[lEnd];
      const max = t.levy_max?.[lEnd];
      const used = raised != null && max ? `In FY${years[lEnd]}, ${t.kind === "town" ? t.name : "these towns"} raised ` +
        `${amount(raised)} of a ${amount(max)} limit, leaving ${max - raised >= 1e6 ? amount(max - raised) : usd(max - raised)} ` +
        `(${percent((max - raised) / max)}) unused.` : "";
      const p7 = townStack({
        key: "tlevy", name: t.name, series: levy, cSeries: cLevy, cmp: cLevy ? c : null, noun: "parts", rowLabel: "Levy",
        caption: `Property tax levy and its limit${perP}`, yShort: `Levy${perP}`, totalLabel: `Levy limit${perP}`, end: lEnd, width,
        sub: `${dollarsNote}${perP}. Proposition 2½ limits each town's levy; the stack's full height is the limit, ` +
          `with voter-approved debt exclusions. ${used}`,
      }, dollarsNote);
      // The single-family bill, with its rate and its share of income in the tooltip
      const bills: Series[] = [
        { key: "bill", label: t.name, color: POP_COLOR, values: deflate(t.sf_bill!) },
        ...(c?.sf_bill ? [{ key: "cmp", label: c.name, color: COMPARE_COLOR, values: deflate(c.sf_bill) }] : []),
      ];
      const bMax = Math.max(...bills.flatMap((x) => x.values.map((v) => v ?? 0)));
      const p8 = lines($("svg-tbill") as unknown as SVGSVGElement,
        { width, height: width < 520 ? 220 : 260, years, yTitle: "Single-family tax bill", yTitleShort: "Tax bill" }, bills,
        niceTicks(bMax * 1.04, 4), fmtUsd, usd, setHover);
      legend($("legend-tbill"), bills.map((x) => ({ label: x.label, color: x.color, mark: "line" as const, spot: x.key })));
      const rate = t.sf_rate?.[bIdx];
      $("tbill-sub").textContent = `${dollarsNote}. The state's average single-family tax bill: single-family assessed ` +
        "value over single-family homes, times the tax rate." +
        (rate != null && t.sf_bill?.[bIdx] != null ? ` In FY${years[bIdx]}, ${t.kind === "town" ? `${t.name}'s` : "the"} bill ` +
          `was ${usd(t.sf_bill[bIdx]!)} at $${rate.toFixed(2)} per $1,000 of value` +
          (t.sf_bill_income?.[bIdx] != null ? `, ${percent(t.sf_bill_income[bIdx]!)} of income per capita.` : ".") : "");
      fullTables.tbill = { caption: `Average single-family tax bill, ${t.name} (${dollarsNote.toLowerCase()})`, cols: [
        { label: "Bill", values: deflate(t.sf_bill!), fmt: usd },
        { label: "Rate per $1,000", values: t.sf_rate ?? [], fmt: (v) => `$${v.toFixed(2)}` },
        { label: "Share of income per capita", values: t.sf_bill_income ?? [], fmt: (v) => `${(v * 100).toFixed(1)}%` },
        ...(c?.sf_bill ? [{ label: `${c.name}, bill`, values: deflate(c.sf_bill), fmt: usd }] : []),
      ] };
      taxPanels.push(
        { panel: p7.panel, figure: $("fig-tlevy"), tip: p7.tip },
        {
          panel: p8, figure: $("fig-tbill"),
          tip: (i) => ({
            title: `FY${years[i]}`,
            rows: bills.filter((x) => x.values[i] != null)
              .map((x) => ({ value: usd(x.values[i]!), label: x.label, color: x.color, mark: "line" as const })),
            note: t.sf_rate?.[i] != null ? `${t.name}: $${t.sf_rate[i]!.toFixed(2)} per $1,000` +
              (t.sf_bill_income?.[i] != null ? `, ${(t.sf_bill_income[i]! * 100).toFixed(1)}% of income per capita` : "") : undefined,
          }),
        },
      );
    }

    // Panels: property
    for (const id of ["fig-tval", "fig-tpar", "fig-teqv"]) $(id).hidden = !hasProp;
    const propPanels: typeof panels = [];
    if (hasProp) {
      const p4 = townStack({
        key: "tval", name: t.name, series: val, cSeries: cVal, cmp: cVal ? c : null, noun: "property types",
        rowLabel: "Property type", caption: `Assessed value${perP}`, yShort: `Value${perP}`, totalLabel: `Total${perP}`, end: pEnd, width,
        sub: `${dollarsNote}${perP}: taxable property as assessed on January 1 before each fiscal year.`,
        missing: "Not reported to the state",
      }, dollarsNote);
      const p5 = townStack({
        key: "tpar", name: t.name, series: par, cSeries: null, cmp: null, noun: "property types", rowLabel: "Property type",
        caption: t.kind === "town" ? "Parcels" : "Parcels per town", yShort: "Parcels", totalLabel: t.kind === "town" ? "Total parcels" : "Parcels per town",
        end: pEnd, width, fmt: count, axis: (v) => compact(v), kind: "count",
        sub: (t.kind === "town" ? "Parcels of taxable real estate by use." : `Average per town, across its ${t.members} towns.`) +
          " Personal property accounts and exempt parcels are not counted.",
        noCmpNote: "Parcel counts aren't compared, because towns differ so much in size; the assessed value chart compares " +
          (inTotal ? "towns' property values." : `property per ${perWord}.`),
        missing: "Not reported to the state",
      }, dollarsNote);
      // EQV every other year, joined across the years between
      const eqvLines: Series[] = [
        { key: "eqv", label: t.name, color: POP_COLOR, values: deflate(per(t.eqv!, kT)) },
        ...(c?.eqv ? [{ key: "cmp", label: c.name, color: COMPARE_COLOR, values: deflate(per(c.eqv, kC!)) }] : []),
      ];
      const eMax = Math.max(...eqvLines.flatMap((x) => x.values.map((v) => v ?? 0)));
      const p6 = lines($("svg-teqv") as unknown as SVGSVGElement,
        { width, height: width < 520 ? 220 : 260, years, yTitle: `Equalized value${perP}`, yTitleShort: `EQV${perP}` }, eqvLines,
        niceTicks(eMax * 1.04, 4), fmtUsd, usd, setHover, true);
      legend($("legend-teqv"), eqvLines.map((x) => ({ label: x.label, color: x.color, mark: "line" as const, spot: x.key })));
      const k = towns!.meta.c70_target;
      const at = k ? years.indexOf(k.eqv_year + 1) : -1;
      const base = k && t.kind === "town" && at >= 0 ? t.eqv_total?.[at] ?? null : null;
      $("teqv-sub").textContent = `${dollarsNote}${perP}. Every two years the state sets each town's equalized ` +
        "valuation, its estimate of what all the town's taxable property would sell for on January 1; each is shown at the " +
        "fiscal year whose assessments share that date." +
        (k && base != null ? ` For FY${k.fy}, Chapter 70 set ${t.name}'s target local contribution at ${k.property_pct}% of ` +
          `its January ${k.eqv_year} EQV (${usd(base * k.property_pct / 100)}) plus ${k.income_pct}% of its residents' ` +
          `${k.income_year} income, up to ${k.cap}% of its foundation budget.` : "");
      fullTables.teqv = { caption: `Equalized valuation, ${t.name} (${dollarsNote.toLowerCase()})`, cols: [
        { label: inTotal ? (t.kind === "town" ? "Total" : "Average town") : `Per ${perWord}`, values: deflate(per(t.eqv!, kT)), fmt: usd },
        { label: t.kind === "town" ? "In all (nominal)" : "Towns combined (nominal)", values: t.eqv_total ?? [], fmt: (v) => amount(v) },
        ...(c?.eqv ? [{ label: `${c.name}${inTotal ? ", total" : `, per ${perWord}`}`, values: deflate(per(c.eqv, kC!)), fmt: usd }] : []),
      ] };
      propPanels.push(
        { panel: p4.panel, figure: $("fig-tval"), tip: p4.tip },
        { panel: p5.panel, figure: $("fig-tpar"), tip: p5.tip },
        {
          panel: p6, figure: $("fig-teqv"),
          tip: (i) => {
            const rows: TipRow[] = eqvLines.filter((x) => x.values[i] != null)
              .map((x) => ({ value: usd(x.values[i]!), label: x.label, color: x.color, mark: "line" as const }));
            return rows.length
              ? { title: `FY${years[i]}`, rows, note: `EQV as of January 1, ${years[i] - 1}` }
              : { title: `FY${years[i]}`, rows: [{ value: "–", label: "No EQV for this January" }], note: "The state sets EQV every two years" };
          },
        },
      );
    }

    // Population, the denominator of the dollar panels
    const popLabel = t.kind === "town" ? "Residents" : "Combined residents";
    const pop: Series[] = [{ key: "pop", label: popLabel, color: POP_COLOR, values: t.pop }];
    $("tpop-sub").textContent = (t.kind === "town"
      ? "Census Bureau estimates, July 1 at the start of each fiscal year."
      : `All ${t.members} towns combined.`) +
      (state.per === "resident" ? ` Per-resident figures above divide each year's dollars by this population.` : "");
    const popMax = Math.max(...t.pop.map((v) => v ?? 0));
    const p3 = lines($("svg-tpop") as unknown as SVGSVGElement, { width, height: width < 520 ? 200 : 230, years, yTitle: "Population" }, pop,
      niceTicks(popMax * 1.04, 4), (v) => compact(v), count, setHover);
    legend($("legend-tpop"), [{ label: popLabel, color: POP_COLOR, mark: "line", spot: "pop" }]);
    fullTables.tpop = { caption: `Population, ${t.name}`, cols: [
      { label: popLabel, values: t.pop, fmt: count },
      ...(c ? [{ label: c.kind === "town" ? c.name : `${c.name}, combined`, values: c.pop, fmt: count }] : []),
    ] };

    panels = [
      { panel: p1.panel, figure: $("fig-tspend"), tip: p1.tip },
      { panel: p2.panel, figure: $("fig-trev"), tip: p2.tip },
      ...taxPanels,
      ...propPanels,
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

  // Plain-language note on the dollar modes, with a worked example from the index for the year chosen
  function explainDollars() {
    const y = meta.latest;
    const factor = meta.cpi[String(y)] / meta.cpi[String(meta.start)];
    $("dollars-note").replaceChildren(
      text("strong", "Nominal dollars"),
      ` are the amounts reported each year, with no adjustment for inflation. `,
      text("strong", `FY${y} dollars`),
      ` restate every year in what a dollar bought in FY${y}, using the Northeast consumer price index: ` +
        `$1,000 spent in FY${meta.start} is about ${usd(1000 * factor)} in FY${y} dollars. ` +
        "Use these to see whether spending grew faster than prices.",
    );
  }

  await refresh();
  // Each chart can open enlarged, in a window of its own
  // and brings the controls along, out of the dock if they're docked
  document.querySelectorAll<HTMLElement>("figure.panel").forEach((f) => f.prepend(enlargeButton(f, undefined, () => {
    dockClose();
    return controlsForm;
  })));
  ["svg-ppe", "svg-enroll", "svg-nss", "svg-rev", "svg-tspend", "svg-trev", "svg-tlevy", "svg-tbill", "svg-tval", "svg-tpar",
    "svg-teqv", "svg-tpop"]
    .forEach((id) => keyboard($(id) as unknown as SVGSVGElement));
  root.classList.remove("is-loading");

  // Redraw at a new width; the root, because the hidden view's panels measure 0
  new ResizeObserver(() => {
    const w = panelBox().clientWidth;
    if (w > 0 && Math.abs(w - lastWidth) > 4) requestAnimationFrame(render);
  }).observe(root);
}
