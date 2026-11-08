/// <reference types="vite/client" />
// The Massachusetts municipal spending explorer: a district view and a town view.
// Data: src/data/massppe/, written by the report pipeline (github.com/timshores/schools,
// ppe_report/export_explorer_data.py). explorer.json and towns.json list every
// district, town and average; each region's full data is its own file under
// districts/ and towns/, imported the first time something in it is shown. Imported
// rather than fetched, the data ships as hashed JavaScript chunks, which the host
// compresses (it sends .json uncompressed).

import { compact, gapColumns, lines, niceTicks, niceTicksRange, ratingSteps, signFor, stackedColumns, svgEl, type Marks, type Panel, type Series, type Val } from "./charts";
import { closeEnlarged, enlargeButton } from "./enlarge";
import type { CapData } from "./cap";
import type { CwData } from "./commonwealth";
import type { MapData, MapSeries } from "./map";
import { notesContents, type NoteUse } from "./notes";
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
  /** Special education spending by category per FTE pupil, in district and out (an average's pooled), from RADAR */
  sped?: Record<SpedKey, Values>;
  /** Special education's share of all the district's spending, in percent */
  sped_share?: Values;
  /** The pupils the special education figures divide by, for Totals (an average's average district's) */
  sped_fte?: Values;
  /** Circuit Breaker, by the year the state paid: what it paid, the costs claimed, and those above the threshold,
   * per FTE pupil (an average's pooled); the students claimed (an average's per district); the pupils, for Totals */
  cb?: { paid: Values; claimed: Values; above: Values; students: Values; fte: Values };
  /** Budgeted net school spending per foundation pupil, as DESE's compliance summaries report it (an average's pooled) */
  nss_budget?: Values;
  /** Actual net school spending against the budget, in percent (an average's pooled, over districts with both) */
  nss_gap?: Values;
  /** The newest budget, a year past the axis, against the year before's actual and budget and its own year's
   * requirement, in percent; a district's own dollars */
  nss_budget_next?: { fy: number; vs_actual: number | null; vs_budget: number | null; vs_required: number | null; budget: number | null };
  /** Students on October 1, from DESE's enrollment: by race and ethnicity and in selected groups, in percent of all
   * students (an average's pooled), and the students of its average district */
  students?: { total: Values; race: Record<(typeof RACE_SERIES)[number]["key"], Values>; groups: Record<StudentGroup, Values> };
  /** The newest year's students, a year past the axis */
  students_next?: { fy: number; total: number } & Partial<Record<StudentGroup, number>>;
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
  /** Towns: the id of its statewide population group's average (the site's name for the code's peer groups) */
  peer?: string | null;
  /** Towns: one of the Commonwealth's Gateway Cities */
  gateway?: boolean;
  community?: Community;
  income?: IncomeFifth;
  scope?: string;
  members?: number;
  /** Population group averages: mid-sentence name, and the population range */
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
  /** Override capacity, the room between the levy limit and the ceiling, as a percent of the ceiling; the
   * ceiling per resident; and the newest year's dollars (FY2026, past the axis) */
  override_pct?: Values;
  levy_ceiling_pr?: Values;
  override_latest?: { fy: number; capacity: number; ceiling: number } | null;
  /** Reserves at each fiscal year's end, per resident: June 30's stabilization balances and the free cash
   * certified from that balance sheet; the operating budget per resident; the newest year-end's dollars */
  reserves?: { stab: Values; sp_stab: Values; free_cash: Values };
  budget?: Values;
  reserves_latest?: { fy: number; stab: number; sp_stab: number; free_cash: number; budget: number } | null;
  /** Long-term debt outstanding and authorized but unissued, per resident; general fund debt service as a
   * percent of the budget, outstanding debt as a percent of EQV; the newest year's dollars */
  debt?: { outstanding: Values; unissued: Values };
  debt_service?: Values;
  debt_eqv?: Values;
  debt_latest?: { fy: number; outstanding: number; service: number; budget: number } | null;
  /** Capital projects fund spending by purpose (Schedule A Part 4), per resident */
  capital?: Record<CapitalKey, Values>;
  /** The labor force and the employed (an average's towns' combined), and the unemployment rate in percent,
   * each calendar year's at the next fiscal year, as the population is */
  labor?: { force: Values; employed: Values; rate: Values };
  labor_latest?: number | null;
  /** Prop 2 1/2 votes since the explorer's first year, [held, won], by kind */
  votes?: Record<"override" | "debt" | "capital" | "stabilization", [number, number]>;
  /** What each year's free cash was made of, per resident, from the state's proof (FY2021 on); the free cash it
   * identified; and the newest year's dollars, past the axis */
  fc_proof?: Record<ProofKey, Values>;
  fc_identified?: Values;
  fc_proof_latest?: ({ fy: number; identified: number } & Record<ProofKey, number>) | null;
  /** Towns: Prop 2 1/2 votes that passed, from the explorer's first year: [fiscal year, kind, amount, purpose] */
  passed?: [number, string, number | null, string][];
  /** Towns: bond ratings by agency, [year, rating] for each year DLS lists one */
  ratings?: { moodys?: [number, string][]; sp?: [number, string][] };
  /** Residents by sex, age, race and Hispanic origin, and disability (an average's towns' combined): the Census
   * Bureau's five-year estimates that don't overlap, each at the fiscal year after its five years end */
  demo?: Record<DemoKey, Values>;
}

type DemoKey = "population" | "male" | "female" | "age_under_18" | "age_18_24" | "age_25_44" | "age_45_64" | "age_65_up" |
  "white" | "black" | "asian" | "other_race" | "hispanic" | "disability_universe" | "disability";

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
type StackPanel = "ppe" | "ood" | "nss" | "rev" | "sped" | "tspend" | "trev" | "tval" | "tpar" | "tlevy" | "tres" | "tdebt" | "tcap" |
  "tage" | "trace" | "tsex" | "tdis" | "tpop" | "tfc" | "teqv" | "tbill" | "srace" | "sgroups" | "enroll" | "nssb";
/** The lines a stacked chart can draw over its columns: its trend, the comparison, and, with Since 1990
 * on, the older measure's line and the comparison's */
type Line = "trend" | "cmp" | "cmptrend" | "day" | "cday" | "cb" | "ceiling" | "votes";
const LINES: Line[] = ["trend", "cmp", "cmptrend", "day", "cday", "cb", "ceiling", "votes"];

// Each comparison choice, as the ids to try in order: "Its enrollment group in its region" (the
// code's cohort) falls back to the statewide group where a region has too few districts of that size
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
// Special education, bottom to top as the export orders them (SPED): in the district's own schools, out of
// district, then what grants and revolving funds paid. Teaching keeps the teachers' blue; the order passes the
// dataviz palette check's adjacent-pair tests on the page's manila
const SPED_SERIES = [
  { key: "teaching", label: "Teaching", color: "#2a78d6" },
  { key: "other_instructional", label: "Other instructional services", color: "#eda100" },
  { key: "in_transport", label: "Transportation in the district", color: "#e34948" },
  { key: "ma_public", label: "Public schools and collaboratives elsewhere", color: "#1baf7a" },
  { key: "private", label: "Private and out-of-state schools", color: "#eb6834" },
  { key: "ood_transport", label: "Transportation out of the district", color: "#6250d6" },
  { key: "health", label: "Health services in private schools", color: "#008300" },
  { key: "grants", label: "Paid from grants and revolving funds", color: "#e87ba4" },
] as const;
type SpedKey = (typeof SPED_SERIES)[number]["key"];
// Students in selected groups, as DESE counts them. Low income through FY2014 and from FY2022 are two measures, and
// economically disadvantaged between them a third, so they draw apart; the one in between dashed, as the
// explorer draws a measure that changed
const STUDENT_GROUPS = [
  { key: "swd", label: "Students with disabilities", what: "students with disabilities", color: "#6250d6" },
  { key: "el", label: "English learners", what: "English learners", color: "#1baf7a" },
  { key: "low_income", label: "Low income", what: "low income", color: "#eb6834" },
  { key: "econ", label: "Economically disadvantaged, FY2015–FY2021", what: "economically disadvantaged", color: "#eb6834", dash: "6 3" },
  { key: "high_needs", label: "High needs", what: "high needs", color: "#2a78d6" },
] as const;
type StudentGroup = (typeof STUDENT_GROUPS)[number]["key"];
// Budgeted and actual net school spending: the budget orange, the spending blue, the state's minimum a dotted gray
const BUDGET_COLOR = "#eb6834";
const ACTUAL_COLOR = "#2a78d6";
const REQUIRED_COLOR = "#8f8a7f";
// The Circuit Breaker's line: the state's green, darker than the health services' columns
const CB_COLOR = "#00602f";
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
// Reserves, bottom to top: the general stabilization fund, special-purpose ones, then free cash
const RESERVE_SERIES = [
  { key: "stab", label: "Stabilization fund", color: "#2a78d6" },
  { key: "sp_stab", label: "Special-purpose stabilization funds", color: "#eda100" },
  { key: "free_cash", label: "Free cash", color: "#1baf7a" },
] as const;
// Debt borrowed, and in a pale version debt voters or the council authorized but the town hasn't yet borrowed
const DEBT_SERIES = [
  { key: "outstanding", label: "Debt outstanding", color: "#6250d6" },
  { key: "unissued", label: "Authorized, not yet borrowed", color: "#b3a8ee" },
] as const;
// Schedule A Part 4's purposes, bottom to top as the export orders them (CAPITAL)
const CAPITAL_SERIES = [
  { key: "schools", label: "Schools", color: "#2a78d6" },
  { key: "buildings", label: "Municipal buildings", color: "#eda100" },
  { key: "highways", label: "Highways (Chapter 90)", color: "#e34948" },
  { key: "water", label: "Water", color: "#1baf7a" },
  { key: "sewer", label: "Sewer", color: "#eb6834" },
  { key: "landfill", label: "Landfill", color: "#6250d6" },
  { key: "other", label: "Other", color: "#008300" },
] as const;
type CapitalKey = (typeof CAPITAL_SERIES)[number]["key"];
// Where free cash comes from, bottom to top as the export groups the state's proof (PROOF_GROUPS): the year before's
// free cash not spent, appropriations left unspent, revenue above the estimates, and adjustments; the order passes
// the palette check's adjacent-pair tests
const FC_SERIES = [
  { key: "carried", label: "Free cash not spent the year before", color: "#1baf7a", words: "of the year before's free cash it didn't spend" },
  { key: "unspent", label: "Appropriations left unspent", color: "#2a78d6", words: "of appropriations left unspent" },
  { key: "receipts", label: "Local receipts above the estimate", color: "#eda100", words: "of local receipts above the estimate" },
  { key: "state_aid", label: "State aid above the estimate", color: "#008300", words: "of state aid above the estimate" },
  { key: "other_rev", label: "Revenue the budget didn't estimate", color: "#e87ba4", words: "of revenue the budget didn't estimate" },
  { key: "adjust", label: "Adjustments", color: "#6250d6", words: "of adjustments" },
] as const;
type ProofKey = (typeof FC_SERIES)[number]["key"];
// The levy ceiling: dotted, in a slate blue, apart from the trend's rust and the comparison's ink
const CEILING_COLOR = "#2f4b7c";
// Bond ratings, best first, and where each agency explains them (the links DLS gives with its ratings)
const RATING_SCALES = {
  sp: ["AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+", "BBB", "BBB-", "BB+", "BB", "BB-", "B+", "B", "B-"],
  moodys: ["Aaa", "Aa1", "Aa2", "Aa3", "A1", "A2", "A3", "Baa1", "Baa2", "Baa3", "Ba1", "Ba2", "Ba3", "B1", "B2", "B3"],
} as const;
const RATING_DOCS = {
  sp: "https://www.mass.gov/doc/standard-and-poors-bond-rating-description/download",
  moodys: "https://www.mass.gov/doc/moodys-bond-rating-description/download",
} as const;
// The agencies' scales line up level for level (AAA with Aaa, AA+ with Aa1, ...), so one chart holds both
const RATING_COLORS = { sp: "#2a78d6", moodys: "#eb6834" } as const;
/** A rating as plotted, or null for none ("NR", "-", "Confidential"); an S&P underlying rating (SPUR) is its rating */
const ratingOf = (agency: "sp" | "moodys", r: string): string | null => {
  const s = agency === "sp" ? r.replace(/\s*\(SPUR\)\s*/i, "").trim().toUpperCase() : r.trim();
  return (RATING_SCALES[agency] as readonly string[]).includes(s) ? s : null;
};
// Age is ordered, so one blue, light to dark from the youngest; the ramp passes the palette check's ordinal tests
const AGE_SERIES = [
  { key: "age_under_18", label: "Under 18", color: "#7fa9e2" },
  { key: "age_18_24", label: "18 to 24", color: "#4f8ad9" },
  { key: "age_25_44", label: "25 to 44", color: "#2a6ec2" },
  { key: "age_45_64", label: "45 to 64", color: "#1d529a" },
  { key: "age_65_up", label: "65 and older", color: "#123a6e" },
] as const;
// Race and ethnicity: colors with no customary tie to any group, in an order whose neighbors pass the palette check
const RACE_SERIES = [
  { key: "white", label: "White", color: "#6250d6" },
  { key: "black", label: "Black", color: "#eb6834" },
  { key: "asian", label: "Asian", color: "#1baf7a" },
  { key: "other_race", label: "Another race, or more than one", color: "#e87ba4" },
  { key: "hispanic", label: "Hispanic or Latino, any race", color: "#2a78d6" },
] as const;
// Women: one of a pair, so the share alone, with its trend and the comparison's (Tim, #207)
const SEX_SERIES = [{ key: "female", label: "Women", color: "#2a78d6" }] as const;
// With a disability, likewise
const DISABILITY_COLOR = "#6250d6";
const LABOR_COLOR = "#e34948";
const EMPLOYED_COLOR = "#1baf7a";
// Votes are annotations, not data: the page's ink
const VOTE_COLOR = "#322e29";
const VOTE_WORDS: Record<string, string> = {
  override: "Override", underride: "Underride", debt: "Debt exclusion", capital: "Capital exclusion", stabilization: "Stabilization fund",
};
const POP_COLOR = "#2a78d6";
const ENROLL_SERIES = [
  { key: "in_district", label: "In-district FTE", color: "#2a78d6" },
  { key: "foundation", label: "Foundation enrollment", color: "#eb6834" },
  { key: "out_of_district", label: "Out-of-district FTE", color: "#1baf7a" },
] as const;
// The comparison: near-black and a little thicker than the other lines, so no category color can be taken for it
const COMPARE_COLOR = "#141210";
// Spending on out-of-district FTE: the out-of-district color from the enrollment chart
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
const MEASURE_NOTE = "In FY2005 the state's Department of Elementary and Secondary Education (DESE) began measuring spending per pupil by function, from all funds: the measure the " +
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

// Signs follow the figure as printed: one that rounds to zero has none (charts.ts signFor)
const usd = (v: number) => {
  const s = Math.abs(Math.round(v)).toLocaleString("en-US");
  return `${signFor(v, s)}$${s}`;
};
const fte = (v: number) => (v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1));
const pct = (v: number) => {
  const s = Math.abs(v * 100).toFixed(1);
  return `${signFor(v, s, true)}${s}%`;
};
const millions = (v: number) => `$${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)} million`;
/** "$423 million", "$4.2 billion" */
const amount = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)} billion` : millions(v));
/** A total: "$4.2 million", or whole dollars under a million, "−$310,250" */
const whole$ = (v: number) => (Math.abs(v) >= 1e6 ? `${signFor(v, amount(Math.abs(v)))}${amount(Math.abs(v))}` : usd(v));
const sentence = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "a", "a and b", "a, b, and c" */
const andList = (xs: string[]) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`);

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

function cagr(first: number | null, last: number | null, years: number) {
  if (first == null || last == null || first <= 0 || last <= 0 || years <= 0) return null;
  return (last / first) ** (1 / years) - 1;
}

/** A trend line's rise each year, and its yearly growth, compounded from its first year to its last */
function trendRate(trend: Values) {
  const at = trend.flatMap((v, i) => (v == null ? [] : [i]));
  if (at.length < 2) return null;
  const [f, l] = [at[0], at[at.length - 1]];
  const perYear = (trend[l]! - trend[f]!) / (l - f);
  // A line that starts at or below zero has no compound rate; its yearly rise over its average value stands in
  const mean = at.reduce((a, i) => a + trend[i]!, 0) / at.length;
  return { perYear, rate: cagr(trend[f], trend[l], l - f) ?? (mean > 0 ? perYear / mean : null) };
}

/** A change, signed, in the panel's own format: +$521, −12 */
const signed = (v: number, fmt: (v: number) => string) => `${signFor(v, fmt(Math.abs(v)), true)}${fmt(Math.abs(v))}`;
const signedPct = (v: number) => pct(v);

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
        ...(base.sped ? { sped: join(undefined, base.sped), sped_share: [...nulls(nH), ...base.sped_share!],
          sped_fte: [...nulls(nH), ...base.sped_fte!] } : {}),
        ...(base.cb ? { cb: join(undefined, base.cb) } : {}),
        ...(base.nss_budget ? { nss_budget: [...nulls(nH), ...base.nss_budget] } : {}),
        ...(base.nss_gap ? { nss_gap: [...nulls(nH), ...base.nss_gap] } : {}),
        ...(base.students ? { students: { total: [...nulls(nH), ...base.students.total], race: join(undefined, base.students.race),
          groups: join(undefined, base.students.groups) } } : {}),
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
    // The entity picked in the second menu when comparing with another district or group
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
  // About the data's contents, and the part or group a link goes to there
  const notes = notesContents(() => state.view === "data", () => update({ view: "data" }));
  const aboutLine = (parts: string[]) => notes.links(parts, "span");
  /** The first year of the slider's scale, where a window starts by default */
  const firstYear = () => (state.hist === "on" ? fullYears[0] : meta.start);
  if (state.to - state.from < MIN_SPAN) [state.from, state.to] = [firstYear(), meta.latest];
  // Legend selections; empty means every segment shows. Kept across districts so
  // one category can be followed from district to district.
  const isolated: Record<StackPanel, Set<string>> = {
    ppe: new Set(saved?.isolated?.ppe), ood: new Set(), nss: new Set(saved?.isolated?.nss), rev: new Set(saved?.isolated?.rev),
    sped: new Set(saved?.isolated?.sped),
    tspend: new Set(saved?.isolated?.tspend), trev: new Set(saved?.isolated?.trev),
    tval: new Set(saved?.isolated?.tval), tpar: new Set(saved?.isolated?.tpar), tlevy: new Set(saved?.isolated?.tlevy),
    tres: new Set(saved?.isolated?.tres), tdebt: new Set(saved?.isolated?.tdebt), tcap: new Set(saved?.isolated?.tcap),
    tage: new Set(saved?.isolated?.tage), trace: new Set(saved?.isolated?.trace), tsex: new Set(saved?.isolated?.tsex),
    tdis: new Set(saved?.isolated?.tdis), tpop: new Set(saved?.isolated?.tpop),
    tfc: new Set(saved?.isolated?.tfc), teqv: new Set(), tbill: new Set(), srace: new Set(saved?.isolated?.srace),
    sgroups: new Set(saved?.isolated?.sgroups), enroll: new Set(saved?.isolated?.enroll), nssb: new Set(saved?.isolated?.nssb),
  };
  // Lines hidden from each chart's legend; both show until clicked off
  const hidden = (k: string, dflt: Line[] = []) =>
    new Set((saved?.hidden?.[k] ?? dflt).filter((l): l is Line => LINES.includes(l as Line)));
  const hiddenLines: Record<StackPanel, Set<Line>> = {
    ppe: hidden("ppe"), ood: hidden("ood"), nss: hidden("nss"), rev: hidden("rev"), sped: hidden("sped"),
    tspend: hidden("tspend"), trev: hidden("trev"),
    tval: hidden("tval"), tpar: hidden("tpar"), tlevy: hidden("tlevy"), tres: hidden("tres"), tdebt: hidden("tdebt"), tcap: hidden("tcap"),
    tage: hidden("tage"), trace: hidden("trace"), tsex: hidden("tsex"), tdis: hidden("tdis"), tpop: hidden("tpop"),
    srace: hidden("srace"), sgroups: hidden("sgroups"), enroll: hidden("enroll"), nssb: hidden("nssb"), tfc: hidden("tfc"), teqv: hidden("teqv"), tbill: hidden("tbill"),
  };

  // Prop 2 1/2 votes shown alone, without the columns they mark
  const votesAlone = new Set<StackPanel>();
  // Only the trends: the town's or district's and its comparison's, nothing else
  const trendsAlone = new Set<StackPanel>();
  // Each chart's dial for that, and whether the chart has a trend to show alone, as it last drew
  const trendDials = new Map<StackPanel, HTMLButtonElement>();
  const hasTrends = new Map<StackPanel, boolean>();
  // And its Comps dial, and whether the chart has a comparison to show, as it last drew
  const compDials = new Map<StackPanel, HTMLButtonElement>();
  const hasComps = new Map<StackPanel, boolean>();
  // The labor force chart: the unemployment rate, or the residents, labor force and employed behind it
  let popView: "rate" | "people" = "rate";
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
    townPickers = [groupedPicker(townSelect, "pick-town-label", "towns and groups"),
      groupedPicker(townVsSelect, "pick-town-vs-label", "towns and groups")];
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
    addGroup(sel, "Statewide groups", data.averages.filter((a) => !a.region), true);
    regions.forEach(([rk, rl]) => addGroup(sel, `${rl} groups`, data.averages.filter((a) => a.region === rk)));
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

  // Trends only: a dial at each chart's top right, and this one in the controls for every chart at once, which reads
  // On while every chart in view that has a trend shows its trends alone
  const trendsSwitch = $<HTMLButtonElement>("trends-switch");
  const trendsInView = () => [...trendDials].filter(([p, b]) => hasTrends.get(p) && !b.closest("[hidden]")).map(([p]) => p);
  const allTrends = () => ((ps) => ps.length > 0 && ps.every((p) => trendsAlone.has(p)))(trendsInView());
  trendsSwitch.addEventListener("click", () => {
    const off = allTrends();
    for (const p of Object.keys(hiddenLines) as StackPanel[]) {
      if (off) trendsAlone.delete(p);
      else trendsAlone.add(p);
    }
    render();
  });
  // Comps: the comparison, on each chart by its dial and on every chart by this one, which reads On while every chart
  // in view that has a comparison shows it. Picking a comparison turns it on everywhere (update).
  const compsSwitch = $<HTMLButtonElement>("comps-switch");
  const compsInView = () => [...compDials].filter(([p, b]) => hasComps.get(p) && !b.closest("[hidden]")).map(([p]) => p);
  const allComps = () => ((ps) => ps.length > 0 && ps.every((p) => !hiddenLines[p].has("cmp")))(compsInView());
  const compsAll = (on: boolean) => {
    for (const p of Object.keys(hiddenLines) as StackPanel[]) {
      if (on) hiddenLines[p].delete("cmp");
      else hiddenLines[p].add("cmp");
    }
  };
  compsSwitch.addEventListener("click", () => {
    if (compsSwitch.getAttribute("aria-disabled") === "true") return;
    compsAll(!allComps());
    askToRemember();
    render();
  });
  document.querySelectorAll<HTMLInputElement>('input[name="tpop-view"]').forEach((r) => r.addEventListener("change", () => {
    if (!r.checked) return;
    popView = r.value === "people" ? "people" : "rate";
    render();
  }));
  /** A dial in the Detail dial's look; the page's styles are scoped to its own markup, so it borrows that dial's scope */
  function dialButton(label: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "detail-dial";
    b.setAttribute("role", "switch");
    const face = document.createElement("span");
    face.className = "dial-face";
    face.setAttribute("aria-hidden", "true");
    face.append(Object.assign(document.createElement("span"), { className: "dial-pointer" }));
    const shows = Object.assign(document.createElement("span"), { className: "dial-state" });
    shows.setAttribute("aria-hidden", "true");
    b.append(Object.assign(document.createElement("span"), { className: "dial-label", textContent: label }), face, shows);
    const like = $("detail-dial");
    for (const el of [b, ...b.querySelectorAll("*")])
      for (const a of [...like.attributes]) if (a.name.startsWith("data-astro-cid")) el.setAttribute(a.name, a.value);
    return b;
  }
  /** Each dial as the charts last drew: off, and dimmed, on a chart with no trend to show */
  function syncDials() {
    for (const [p, b] of trendDials) {
      const can = !!hasTrends.get(p);
      const on = can && trendsAlone.has(p);
      b.setAttribute("aria-checked", String(on));
      b.setAttribute("aria-disabled", String(!can));
      b.querySelector(".dial-state")!.textContent = on ? "On" : "Off";
      b.title = !can ? (["tage", "trace", "tsex", "tdis", "srace"].includes(p) ? "Pick a group in the legend to see its trend" : "This chart has no trend line to show")
        : on ? "Show the whole chart" : "Show only the trend lines";
    }
    const all = allTrends();
    trendsSwitch.setAttribute("aria-checked", String(all));
    trendsSwitch.querySelector(".dial-state")!.textContent = all ? "On" : "Off";
    trendsSwitch.title = all ? "Show the whole charts" : "Show only the trend lines, on every chart";
    for (const [p, b] of compDials) {
      const can = !!hasComps.get(p);
      const on = can && !hiddenLines[p].has("cmp");
      b.setAttribute("aria-checked", String(on));
      b.setAttribute("aria-disabled", String(!can));
      b.querySelector(".dial-state")!.textContent = on ? "On" : "Off";
      b.title = !can ? (["tage", "trace", "srace"].includes(p) ? "Pick a group in the legend to compare it"
        : "Nothing to compare with on this chart: pick a comparison in the controls") : on ? "Hide the comparison" : "Show the comparison";
    }
    const comps = allComps();
    const any = compsInView().length > 0;
    compsSwitch.setAttribute("aria-checked", String(comps));
    compsSwitch.setAttribute("aria-disabled", String(!any));
    compsSwitch.querySelector(".dial-state")!.textContent = comps ? "On" : "Off";
    compsSwitch.title = !any ? "Pick a comparison to compare with" : comps ? "Hide the comparison on every chart" : "Show the comparison on every chart";
  }

  select.value = state.d;
  compareSelect.value = state.cmp;
  if (state.vs) vsSelect.value = state.vs;
  // The long menus: searchable, with groups that start collapsed
  const districtPickers = [groupedPicker(select, "pick-district-label", "districts and groups", {
    text: () => (menuMode === "former" ? "Current districts and groups" : "Former districts"),
    title: "Districts that no longer exist, with the years they have figures for",
    act: switchMenu,
  }),
    groupedPicker(vsSelect, "pick-vs-label", "districts and groups")];
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
    legends.forEach(fitLegend);  // Detail hides each trend's "?", which changes what its entry needs
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
    addGroup(sel, "Statewide groups", towns!.averages.filter((a) => !a.region), true);
    regions.forEach(([rk, rl]) => addGroup(sel, `${rl} groups`, towns!.averages.filter((a) => a.region === rk)));
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
    // Picking a comparison turns Comps on, on every chart
    const picks = (k: "cmp" | "tcmp" | "vs" | "tvs") => patch[k] != null && patch[k] !== "none" && patch[k] !== state[k];
    if (picks("cmp") || picks("tcmp") || picks("vs") || picks("tvs")) compsAll(true);
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
    // On the Data tab, the part or group the address goes to stays in it
    history.replaceState(null, "", `${location.pathname}?${q}${state.view === "data" ? location.hash : ""}`);
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

  /** Where a link from About the data goes, once its tab is drawn (#227) */
  let arrival: (() => void) | null = null;

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
    if (mine !== ticket) return;
    render();
    if (arrival) {
      const go = arrival;
      arrival = null;
      requestAnimationFrame(go);
    }
  }

  // The Commonwealth tab's gallery and data, loaded the first time it opens
  let cw: { openFromUrl(): void; close(): void } | null = null;
  let map: { refresh(): void; setSeries(s: MapSeries): void; show(layer: "towns" | "districts", key: string): void } | null = null;
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
      about: aboutLine,
    });
    // The measures year by year come after: the map draws without them, and its year controls appear when they arrive
    const m = map;
    import("../../data/massppe/map-years.json").then((y) => m.setSeries(y.default as unknown as MapSeries)).catch(() => {});
    cw = mod.startCommonwealth($("cw-root"), json.default as unknown as CwData, {
      openDistrict: (id) => update({ view: "districts", d: id }),
      about: aboutLine,
    });
    // A link to one plot opens it
    if (new URLSearchParams(location.search).has("y")) cw.openFromUrl();
  }

  // Pointing at either of these tabs starts its download, so it's usually ready by the click
  const warm: Record<string, () => void> = {
    commonwealth: () => void Promise.all([import("./commonwealth"), import("../../data/massppe/commonwealth.json"), import("./map"),
      import("../../data/massppe/map.json"), import("../../data/massppe/map-years.json")]).catch(() => {}),
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

  /** A group in focus: the Compare with choice that names that same group ("Its region", for a region's), greyed in
   * the menu as a cue that it's the group already in focus */
  const SELF_CHOICE: Record<string, string> = { "region-cohort": "cohort", cohort: "cohort-state", region: "region", group: "gateway",
    type: "type", fifth: "fifth", "region-peer": "peer", peer: "peer-state" };
  function markSelf(sel: HTMLSelectElement, x: { id: string; kind: string; scope?: string }) {
    const self = x.kind !== "average" ? null
      : x.scope === "state" ? (x.id.endsWith("statewide-all") ? "state-all" : "state") : SELF_CHOICE[x.scope ?? ""] ?? null;
    for (const o of sel.options) {
      const on = o.value === self;
      o.disabled = on;
      o.title = on ? "The group in focus" : "";
    }
  }
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

  /** "Shutesbury" or "the Statewide Tiny enrollment group average", for use mid-sentence. */
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
    if (e.type === "charter" || e.cohort === "CHARTER") return "Detailed revenue figures aren't available for charter schools.";
    if (e.kind === "district") return "Detailed revenue figures aren't available for town-run districts.";
    const n = e.rev_members ?? 0;
    return n === 0 ? `The ${e.name} includes no regional districts, so it has no revenue average.`
      : `The ${e.name} includes only ${n === 1 ? "one regional district" : `${n} regional districts`}, too few for a revenue average.`;
  }

  /** Per pupil, or with Totals on, back to dollars: each year's figure times the pupils it was
   * divided by. An average's figures are pooled per pupil and its enrollment is per district, so its
   * totals are its average district's. */
  type PupilsBy = "in_district" | "foundation" | "rev" | "sped" | "cb";
  const pupilsOf = (e: Entity, by: PupilsBy): Values =>
    by === "rev" ? e.rev_fte ?? e.enroll.in_district
      : by === "sped" ? e.sped_fte ?? nulls(years.length)
      : by === "cb" ? e.cb?.fte ?? nulls(years.length)
      : e.enroll[by];
  const inDollars = (values: Values, e: Entity, by: PupilsBy): Values => {
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
  const spedSeries = (e: Entity): Series[] | null =>
    e.sped ? SPED_SERIES.map((s) => ({ ...s, values: deflate(inDollars(e.sped![s.key], e, "sped")) })) : null;
  /** Revenue averages cover only their regional districts, and say so. */
  const revName = (c: Entity) => (c.kind === "district" ? c.name : `${c.name} (regional districts)`);
  const totals = (series: Series[]): Values => years.map((_, i) => sumAt(series.map((s) => s.values), i));
  const strictTotals = (series: Series[]): Values => years.map((_, i) => sumStrict(series.map((s) => s.values), i));
  // Actual NSS is the full stack, so it exists only where DESE reported actual spending
  const actualNss = (series: Series[]): Values =>
    years.map((_, i) => (series[2].values[i] == null ? null : sumAt(series.map((s) => s.values), i)));
  const visible = <T extends Series>(series: T[], panel: StackPanel): T[] =>
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

  interface TipRow { value: string; label: string; color?: string; mark?: "line" | "dash" | "rect" | "hatch" | "diamond" | "linedot"; strong?: boolean }
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

  /** A chart over fewer years than the rest, from the page's year off on: hover, the tooltip and the keyboard speak in
   * the page's years, the chart in its own */
  const offsetPanel = (p: Panel, off: number, n: number): Panel => ({
    svg: p.svg,
    ax: Object.assign(Object.create(p.ax) as Panel["ax"], { x: (i: number) => p.ax.x(i - off) }),
    setHover: (i) => p.setHover(i == null || i < off || i >= off + n ? null : i - off),
  });

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

  // The charts of columns in categories, whose hover cards list the categories under the total
  const STACKED = new Set<string>(["ppe", "ood", "nss", "rev", "sped", "srace", "tspend", "trev", "tval", "tpar", "tlevy", "tres",
    "tdebt", "tcap", "tfc", "tage", "trace", "tsex", "tdis"]);
  /** With only the trends shown, a chart of columns has no categories to point to: its hover card gives the year's
   * total and the trend's figure, the town's or district's, then the comparison's while Comps is on (#225, #226) */
  function trendsOnlyTip(figure: HTMLElement, i: number, content: TipContent): TipContent {
    const key = figure.id.replace(/^fig-/, "") as StackPanel;
    if (!STACKED.has(key) || !trendsAlone.has(key) || !hasTrends.get(key)) return content;
    const total = content.rows.find((r) => r.strong);
    if (!total) return content;
    const own = content.rows.find((r) => r.mark === "dash" && r.color === TREND_COLOR);
    const cmp = content.rows.find((r) => r !== total && r.color === COMPARE_COLOR && r.mark !== "dash");
    const ct = cmpTrends.get(key);
    const cmpTrend = cmp && ct?.trend ? trendRow(ct.trend, i, ct.value, ct.step).map((r) => ({ ...r, color: COMPARE_COLOR })) : [];
    return { ...content, rows: [total, ...(own ? [own] : []), ...(cmp ? [cmp] : []), ...cmpTrend] };
  }

  function setHover(i: number | null, source: SVGSVGElement | null) {
    hovered = i;
    for (const p of panels) {
      p.panel.setHover(i);
      const tipEl = p.figure.querySelector<HTMLElement>(".tooltip")!;
      if (i != null && p.panel.svg === source) showTip(p.figure, p.panel, i, trendsOnlyTip(p.figure, i, p.tip(i)));
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
  interface LegendItem { label: string; color: string; mark: "rect" | "line" | "dash" | "hatch" | "diamond" | "linedot"; key?: string; line?: Line;
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
  /** A trend's short name, for the end of its line: "Leverett trend", "Western MA Tiny enrollment group trend"; with what it
   * measures, where a chart has several: "Leverett labor force trend" */
  const trendName = (name: string, what = "") => ((w) => (/ average\b/.test(name) ? name.replace(/ average\b/, `${w} trend`)
    : `${name}${w} trend`))(what ? ` ${what}` : "");
  /** A trend's yearly figure, in the chart's own units, for the words at the end of its line: "+$550 (+3.2%) a year";
   * short, for a narrow chart, without "a year" */
  const trendFigure = (values: Values, fmt: (v: number) => string, short = false) => ((r) => (r ? `${signed(r.perYear, fmt)}` +
    `${r.rate != null ? ` (${signedPct(r.rate)})` : ""}${short ? "" : " a year"}` : ""))(trendRate(values));
  /** The words at a trend's end: its name and its yearly figure (#220), and a shorter name with the figure for a
   * narrow chart */
  const trendEnds = (name: string, short: string, values: Values, fmt: (v: number) => string) =>
    ({ endLabel: `${name} ${trendFigure(values, fmt)}`.trim(), endShort: `${short} ${trendFigure(values, fmt, true)}`.trim() });
  const trendOf = (name: string, sel: string | null, shownTotal: Values, fmt: (v: number) => string = usd): Series =>
    ((values) => ({ key: "trend", label: `${name} trend${sel ? `, ${sel}` : ""}`, color: TREND_COLOR, values,
      ...trendEnds(trendName(name), name.length <= 18 ? `${name} trend` : "Trend", values, fmt) }))(linearTrend(shownTotal));
  /** The line as drawn: null while its legend entry has it hidden. */
  const drawn = (panel: StackPanel, line: Line, s: Series | null): Series | null => (hiddenLines[panel].has(line) ? null : s);
  const hasLine = (s: Series | null): s is Series => !!s && s.values.some((v) => v != null);
  /** Legend entries for the lines the chart can draw, hidden ones included so they can come back. */
  /** A trend's yearly figure for its legend entry: "+$43 (+3.7%) a year, before inflation" */
  const trendDetail = (values: Values, fmt: (v: number) => string) => ((r) => (r ? `${signed(r.perYear, fmt)}` +
    `${r.rate != null ? ` (${signedPct(r.rate)})` : ""} a year` +
    (fmt === usd ? (state.usd === "nominal" ? ", before inflation" : ", after inflation") : "") : undefined))(trendRate(values));
  /** The comparison's own trend, in its color: "Western MA towns ... average trend, total" */
  const cmpTrendOf = (cmp: Series): Series =>
    ({ key: "cmptrend", label: cmp.label.replace(/^(.*?)(, .*)?$/, "$1 trend$2"), color: COMPARE_COLOR, values: linearTrend(cmp.values) });
  /** The comparison's trend figure, for the comparison's legend entry */
  const cmpDetail = (cmp: Series, fmt: (v: number) => string = usd) => (hasLine(cmpTrendOf(cmp)) ? trendDetail(cmpTrendOf(cmp).values, fmt) : undefined);
  /** The trends a chart draws, and whether it draws them alone: its own, and with only the trends shown, the
   * comparison's too (beside the columns it would make the chart too busy), unless the comparison's legend entry has
   * it hidden. A chart with several trends of its own, and the comparison's, passes each, already named. */
  const trendsOf = (panel: StackPanel, own: Series[], cmp: Series[], comps = cmp.some(hasLine)) => {
    const can = [...own, ...cmp].some(hasLine);
    hasTrends.set(panel, can);
    hasComps.set(panel, comps);
    const only = can && trendsAlone.has(panel);
    return { only, trends: [...own, ...(only && !hiddenLines[panel].has("cmp") ? cmp : [])].filter(hasLine) };
  };
  /** Each chart's comparison trend as it last drew, with its units, for the hover card with only the trends shown */
  const cmpTrends = new Map<StackPanel, { trend: Series | null; value: (v: number) => string; step: (v: number) => string }>();
  /** The same for one trend of the chart's own and one comparison; cmpName is whose comparison it is, fmt the
   * chart's units for the trends' yearly figures, valueFmt for their values where it differs (a share's points) */
  const trendView = (panel: StackPanel, own: Series | null, cmp: Series | null, cmpName: string, fmt: (v: number) => string = usd,
    valueFmt = fmt) => {
    const ct = cmp && hasLine(cmp) ? ((t) => ({ ...t, ...trendEnds(trendName(cmpName), "Comparison trend", t.values, fmt) }))(cmpTrendOf(cmp)) : null;
    cmpTrends.set(panel, { trend: ct, value: valueFmt, step: fmt });
    return trendsOf(panel, own ? [own] : [], ct ? [ct] : [], hasLine(cmp));
  };
  type Measure = Series & { what: string; trend?: false };
  /** A line chart of several measures, the district's or town's and the comparison's of each. The legend picks the
   * measures shown, and one picked alone draws as a single measure's chart does: its trend, and the comparison's line
   * with its trend's yearly figure. With several shown, each has its trend only with the Trends only dial, the
   * comparison's too. A measure marked trend: false (one whose definition changed, or an older measure) has none.
   * cmpOf gives the comparison's values for a measure; cmpEntry names the comparison's entry when several show. */
  function measureLines(panel: StackPanel, own: Measure[], cmpOf: ((x: Measure) => Values | null | undefined) | null,
    names: { own: string; cmp: string; cmpLabel: (x: Measure) => string; cmpEntry: string }, fmt: (v: number) => string) {
    const all = own.filter(hasLine);
    const picked = all.length > 1 ? visible(all, panel) : all;
    const shown = picked.length ? picked : all;
    const one = shown.length === 1 ? shown[0] : null;
    const cmpLine = (x: Measure): Series | null => ((v) => (v && v.some((y) => y != null)
      ? { key: one ? "cmp" : `cmp:${x.key}`, label: names.cmpLabel(x), color: COMPARE_COLOR, values: v, ...(x.dash ? { dash: x.dash } : {}) }
      : null))(cmpOf?.(x));
    const cmpShown = shown.map(cmpLine).filter(hasLine);
    let trend: Series | null = null;
    let tv: { only: boolean; trends: Series[] };
    if (one) {
      trend = one.trend === false ? null : trendOf(names.own, all.length > 1 ? one.what : null, one.values, fmt);
      tv = trendView(panel, trend ? drawn(panel, "trend", trend) : null, cmpShown[0] ?? null, names.cmp, fmt);
    } else {
      const tr = shown.filter((x) => x.trend !== false);
      tv = trendsOf(panel,
        tr.map((x) => ((values) => ({ key: x.key, label: `${names.own} ${x.what} trend`, color: x.color, values,
          ...trendEnds(trendName(names.own, x.what), `${x.label} trend`, values, fmt) }))(linearTrend(x.values))),
        tr.flatMap((x) => ((cl) => (cl ? [((ct) => ({ ...ct, key: `cmptrend:${x.key}`,
          ...trendEnds(trendName(names.cmp, x.what), `Comparison ${x.what} trend`, ct.values, fmt) }))(cmpTrendOf(cl))] : []))(cmpLine(x))),
        cmpShown.length > 0);
      if (!tv.only) tv = { only: false, trends: [] };
    }
    const legendItems: LegendItem[] = [
      ...all.map((x) => ({ ...(all.length > 1 ? { key: x.key } : { spot: x.key }), label: x.label, color: x.color,
        mark: x.dash ? "dash" as const : "line" as const,
        detail: !one && tv.only && x.trend !== false && shown.includes(x) ? trendDetail(linearTrend(x.values), fmt) : undefined })),
      ...(one ? lineLegend(trend, cmpShown[0] ?? null, fmt)
        : cmpShown.length ? [{ label: names.cmpEntry, color: COMPARE_COLOR, mark: "linedot" as const, line: "cmp" as const }] : []),
    ];
    return { all, shown, one, cmpShown, trend, only: tv.only, trends: tv.trends, legend: legendItems,
      fitted: shown.length < all.length,
      lines: [...shown, ...(hiddenLines[panel].has("cmp") ? [] : cmpShown)],
      max: Math.max(0, ...[...shown, ...cmpShown].flatMap((x) => x.values.map((v) => v ?? 0))) };
  }
  /** The lines' legend entries: the trend, and the comparison with its trend's yearly figure */
  const lineLegend = (trend: Series | null, overlay: Series | null, fmt: (v: number) => string = usd): LegendItem[] => [
    ...(hasLine(trend) ? [{ label: trend.label, color: TREND_COLOR, mark: "dash" as const, line: "trend" as const,
      detail: trendDetail(trend.values, fmt) }] : []),
    // The comparison, with its own trend's yearly figure (its trend line draws with only the trends shown)
    ...(overlay && (state.hist !== "on" || hasLine(overlay)) ? [{ label: overlay.label, color: COMPARE_COLOR, mark: "linedot" as const, line: "cmp" as const,
      detail: cmpDetail(overlay, fmt) }] : []),
  ];
  // The trend's value, and its step from the year before: the same in dollars each year, a shrinking share as it grows
  // (a share's step in points: stepFmt)
  const trendRow = (trend: Series | null, i: number, fmt: (v: number) => string = usd, stepFmt = fmt): TipRow[] => {
    const v = trend?.values[i];
    if (!trend || v == null) return [];
    const prev = trend.values[i - 1];
    const step = prev == null ? "" : `, ${signed(v - prev, stepFmt)}${prev > 0 ? ` (${signedPct((v - prev) / prev)})` : ""} on FY${years[i - 1]}`;
    return [{ value: fmt(v), label: trend.label + step, color: TREND_COLOR, mark: "dash" }];
  };
  let refocus: { panel: StackPanel; key: string } | null = null;

  // A legend row runs the chart's full width (#185): a line's long entry that would drop to a new row starts in
  // the room left on this one instead, its words wrapping there, when that room is at least FIT_MIN wide. Refit
  // whenever a legend's width changes (the window, Enlarge, a tab coming into view) and when the web fonts
  // arrive, since an entry's width changes with its font while the legend's own width doesn't.
  const FIT_MIN = 192;
  const legendWidth = new WeakMap<HTMLElement, number>();
  const legends = new Set<HTMLElement>();
  document.fonts?.ready.then(() => legends.forEach(fitLegend));
  document.fonts?.addEventListener?.("loadingdone", () => legends.forEach(fitLegend));
  const legendFit = new ResizeObserver((entries) => {
    for (const e of entries) {
      const list = e.target as HTMLElement;
      if (Math.round(e.contentRect.width) !== legendWidth.get(list)) fitLegend(list);
    }
  });
  function fitLegend(list: HTMLElement) {
    const items = [...list.children] as HTMLElement[];
    for (const li of items) li.style.flexBasis = "";
    const width = list.clientWidth;
    legendWidth.set(list, Math.round(list.getBoundingClientRect().width));
    if (!width) return;
    const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
    const right = list.getBoundingClientRect().left + width;
    for (let i = 0; i < items.length; i++) {
      const li = items[i];
      const btn = li.querySelector<HTMLElement>(".legend-line");
      // The trend and the comparison each have a row of their own
      if (!btn || li.classList.contains("legend-row")) continue;
      const prev = i ? items[i - 1].getBoundingClientRect() : null;
      if (prev && li.getBoundingClientRect().top > prev.top + 1) {  // dropped to a new row
        // The swatch with the name, and the figure, each stay whole, so the room has to hold the wider of them
        // beside whatever else the entry carries (its "?"), measured while the entry still has its own width
        const beside = li.getBoundingClientRect().width - btn.getBoundingClientRect().width;
        const cs = getComputedStyle(btn);
        const pad = ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"]
          .reduce((s, k) => s + parseFloat(cs[k as "paddingLeft"]), 0) + 12;
        const whole = [...li.querySelectorAll<HTMLElement>(".legend-detail, .legend-keep")].map((e) => e.getBoundingClientRect().width);
        const need = Math.max(FIT_MIN, ...whole.map((w) => w + beside + pad));
        const room = right - prev.right - gap;
        if (room >= need) li.style.flexBasis = `${Math.floor(room)}px`;
      }
      hug(li, btn);
    }
  }

  /** A wrapped entry ends where its longest line does, not at the edge of the room it was given, so the pill
   * its button shows on hover, and its "?", sit at the end of the words (#189) */
  function hug(li: HTMLElement, btn: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(btn);
    if (!range.getClientRects().length) return;
    const cs = getComputedStyle(btn);
    // A few passes: a line's end can move as the entry narrows (a space at the break stops counting)
    for (let pass = 0; pass < 3; pass++) {
      const inner = btn.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
      const slack = inner - Math.max(...[...range.getClientRects()].map((r) => r.right));
      if (slack <= 1) return;
      li.style.flexBasis = `${Math.ceil(li.getBoundingClientRect().width - slack) + 1}px`;
    }
  }

  /** A line's legend name, its swatch held to it: "-- Leverett trend" never breaks, nor a comparison's swatch
   * from its first word (#187); a qualifier after the name (", actual net school spending") can wrap, and the
   * figure after that moves to the next line whole */
  function lineLabel(key: HTMLElement, label: string) {
    const m = /^(.*?\btrend)(,.*)?$/.exec(label) ?? /^(\S+)(.*)$/.exec(label);
    const head = m ? m[1] : label;
    const keep = document.createElement("span");
    keep.className = "legend-keep";
    keep.append(key, head);
    const span = document.createElement("span");
    span.append(keep, m?.[2] ?? "");
    return span;
  }

  /** A trend's figure, "+$550 (+3.2%) a year, before inflation": whole on one line, except on a phone, where
   * it may break once, between the amount and "a year" */
  function lineDetail(detail: string) {
    const d = document.createElement("span");
    d.className = "legend-detail";
    const k = detail.indexOf(" a year");
    if (k < 0) d.textContent = detail;
    else d.append(text("span", detail.slice(0, k), "legend-whole"), " ", text("span", detail.slice(k + 1), "legend-whole"));
    return d;
  }

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
      // The chart's trend, then the comparison, each on a row of its own under the rest (#220)
      const row = it.line === "trend" || it.line === "cmp";
      if (row) li.classList.add("legend-row");
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
        // The votes switch between shown over the chart and shown alone
        const alone = line === "votes" && !off && votesAlone.has(panel);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `legend-btn legend-line${off ? " is-off" : ""}${alone ? " is-alone" : ""}`;
        btn.dataset.key = `line:${line}`;
        btn.setAttribute("aria-pressed", String(!off));
        btn.title = line === "votes" ? (off ? "Show the votes" : alone ? "Show the chart with the votes" : "Show only the votes")
          : off ? "Show this line" : "Hide this line";
        // The space is where the figure may move to the next line, after the name, never inside it
        btn.append(lineLabel(swatch(it), it.label), ...(it.detail ? [" ", lineDetail(it.detail)] : []));
        btn.addEventListener("click", () => {
          if (line === "votes" && !off) {
            if (alone) votesAlone.delete(panel);
            else votesAlone.add(panel);
          } else if (off) hiddenLines[panel].delete(line);
          else hiddenLines[panel].add(line);
          refocus = { panel, key: `line:${line}` };
          askToRemember();
          render();
        });
        li.append(btn, ...(it.help ? [helpTip(it.help)] : []));
        return li;
      }
      if (!set || !it.key) {
        li.className = row ? "legend-static legend-row" : "legend-static";
        if (it.spot) li.dataset.key = it.spot;
        // A trend's figure, as beside the trend's button on the charts whose lines toggle
        li.append(swatch(it), text("span", it.label), ...(it.detail ? [" ", lineDetail(it.detail)] : []), ...(it.help ? [helpTip(it.help)] : []));
        return li;
      }
      const key = it.key;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "legend-btn";
      btn.dataset.key = key;
      btn.setAttribute("aria-pressed", String(set.has(key)));
      if (set.size && !set.has(key)) btn.classList.add("is-off");
      btn.title = !set.has(key) ? `Click to show ${set.size ? `${it.label} too` : `only ${it.label}`}`
        : set.size === 1 ? "Click to show everything again" : `Click to hide ${it.label}`;
      btn.append(swatch(it), text("span", it.label), ...(it.detail ? [" ", lineDetail(it.detail)] : []));
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
    // A chart with categories to pick keeps its lines (trend, comparison, ceiling, votes) in a legend of their own
    // under it, so the categories read alone
    // A line chart's own lines (entries that spotlight a series) stay above with the categories
    const isLine = (it: LegendItem) => !it.key && !it.spot && (!!it.line || !!it.toggle ||
      ["line", "dash", "diamond", "linedot"].includes(it.mark));
    const split = items.some((it) => !isLine(it)) && items.some(isLine);
    const svg = list.parentElement?.querySelector<SVGSVGElement>(":scope > svg");
    let below = list.parentElement?.querySelector<HTMLElement>(":scope > ul.legend-below") ?? null;
    if (split && svg && !below) {
      below = document.createElement("ul");
      below.className = "legend legend-below";
      if (list.id) below.id = `${list.id}-below`;
      // The page's scoped legend styles find it by the scope attribute the list above carries
      for (const a of [...list.attributes]) if (a.name.startsWith("data-astro-cid")) below.setAttribute(a.name, a.value);
      below.setAttribute("aria-label", "Lines on the chart. Select one to hide or show it.");
      svg.after(below);
    }
    const lower = split && below ? nodes.filter((_, k) => k < items.length && isLine(items[k])) : [];
    list.replaceChildren(...nodes.filter((n) => !lower.includes(n)));
    for (const l of [list, ...(below ? [below] : [])]) {
      if (l === below) {
        l.replaceChildren(...lower);
        l.hidden = !lower.length;
      }
      fitLegend(l);
      legendFit.observe(l);
      legends.add(l);
    }
  }

  // A legend entry, hovered or focused from the keyboard, spotlights its marks in its chart: they stay,
  // the rest fade. A tap on a touch screen isolates instead, as a click does, so touch doesn't spotlight.
  function spotlight(entry: HTMLElement | null, on: boolean) {
    const key = entry?.dataset.key;
    const box = entry?.closest("figure");
    if (!key || key === "toggle" || !box) return;
    for (const svg of box.querySelectorAll<SVGSVGElement>("svg")) {
      svg.querySelectorAll(".is-lit").forEach((m) => m.classList.remove("is-lit"));
      // An entry's key, or one in a mark's list of them (a comparison's line under a measure's entry too)
      const marks = on ? svg.querySelectorAll(`[data-key~="${CSS.escape(key)}"]`) : [];
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
  interface CmpRow { label: string; color: string; mark: "rect" | "line" | "dash" | "linedot"; values: Values; base: Values | null; total?: boolean }

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
      state.usd === "nominal" ? "Nominal dollars" : `FY${state.usd} dollars`, ...(allTrends() ? ["Trends only"] : [])];
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
        td.title = `${cName}: ${fmt(b)} (${signFor(rel, Math.abs(rel * 100).toFixed(0), true)}${Math.abs(rel * 100).toFixed(0)}%)`;
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
        td.title = `${cName}: ${pct(gb)} (${signFor(delta, Math.abs(delta * 100).toFixed(1), true)}${Math.abs(delta * 100).toFixed(1)} pp)`;
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
  /** A headline tile; with a share, a small pie of it beside the value */
  function tile(label: string, value: string, details: string[],
    share?: { v: number; title: string; own?: string; cmp?: { v: number; title: string; detail: string } | null } | null,
    help?: string) {
    const div = document.createElement("div");
    div.className = "tile";
    // The green pie's figure on green: the tile's own value, or the detail line it names (own)
    const val = document.createElement("div");
    val.className = "tile-value";
    val.append(text("span", value, share && !share.own ? "tile-figure is-own" : "tile-figure"));
    if (share) {
      val.classList.add("has-pie");
      const pies = document.createElement("span");
      pies.className = "tile-pies";
      pies.append(pie(share.v, share.title), ...(share.cmp ? [pie(share.cmp.v, share.cmp.title, true)] : []));
      val.append(pies);
    }
    // Three rows, label, value, details, that line up with the tiles beside it (the page's subgrid)
    const more = document.createElement("div");
    more.className = "tile-details";
    // The comparison's line, the one its gold pie shows, on a gold ground
    details.filter(Boolean).forEach((d) => more.append(text("div", d,
      d === share?.cmp?.detail ? "tile-detail is-cmp" : share?.own && d === share.own ? "tile-detail is-own" : "tile-detail")));
    const head = text("div", label, "tile-label");
    if (help) head.append(" ", helpTip(help));
    div.append(head, val, more);
    return div;
  }

  /** A tile's pie: one share of a whole, clockwise from twelve o'clock. The tile's text carries the figure, so
   *  screen readers skip it; the hover title says what it shows. Ringed, so the whole reads against the page. */
  function pie(f: number, title: string, cmp = false) {
    const R = 15;
    const svg = svgEl("svg", { viewBox: "-16 -16 32 32", class: cmp ? "tile-pie is-cmp" : "tile-pie", "aria-hidden": "true" });
    svgEl("title", {}, svg).textContent = title;
    svgEl("circle", { r: R, class: "tile-pie-rest" }, svg);
    const v = Math.max(0, Math.min(1, f));
    if (v >= 0.999) svgEl("circle", { r: R, class: "tile-pie-share" }, svg);
    else if (v > 0.001) {
      const a = v * 2 * Math.PI;
      const x = (R * Math.sin(a)).toFixed(2), y = (-R * Math.cos(a)).toFixed(2);
      svgEl("path", { d: `M0 0V${-R}A${R} ${R} 0 ${v > 0.5 ? 1 : 0} 1 ${x} ${y}Z`, class: "tile-pie-share" }, svg);
    }
    svgEl("circle", { r: R, class: "tile-pie-ring" }, svg);
    return svg;
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
    // The Data tab goes to the part its address names once the lines under the parts are in, as they move what's below
    if (state.view === "data") void showUses().then(notes.show);
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
    syncDials();
    dockSummary();
    dockCheck();
    restoreFocus();
    remember();
  }

  function renderDistricts() {
    const e = win(entity(state.d)!);
    const c = comparisonFor(e);
    // The menu follows the state, as the town view's does: a swap sets "Another district or group"
    compareSelect.value = state.cmp;
    markSelf(compareSelect, e);
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
      n.setAttribute("aria-label", n.getAttribute("data-aria-dper")!.replace("{dper}", whole ? "" : ["svg-nss", "svg-nssb"].includes(n.id) ? " per foundation pupil" : " per pupil")));

    // Comparison menu: shown only for "Another district or group" (applyView)
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
        : `${meta.cohorts[e.cohort!].short} enrollment group`, place,
        e.gateway && e.community?.type !== "gateway" ? "Gateway City" : "", communityText(e.community, "students"),
        incomeText(e.income, true)];
    // Said only when "Its enrollment group in its region" falls back to the statewide group
    if (c && state.cmp === "cohort" && e.type === "traditional" && !e.cmp.cohort && place)
      bits.push(`compared statewide: too few ${meta.cohorts[e.cohort!].short} districts in ${place}`);
    else if (!c && state.cmp === "other") bits.push("pick a different district or group to compare with");
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
    // The comparison's aid, with the share of its spending its gold pie shows
    const cAid = cNss?.[0].values[tl] ?? null;
    const cAidShare = cAid != null && cNssTotal?.[tl] ? cAid / cNssTotal[tl]! : null;
    const aidLine = aidShare != null ? `${Math.round(aidShare * 100)}% of actual net school spending` : "";
    const cAidLine = cAid != null ? `${cName}: ${money(cAid)}${cAidShare != null ? `, ${Math.round(cAidShare * 100)}% of its spending` : ""}` : "";
    $("tiles").replaceChildren(
      spendTile,
      earlyPupils
        ? tile(`Enrollment, FY${years[tl]}`, fte(earlyPupils.v), [capital(earlyPupils.src), e.kind === "district" ? "" : "Average per district"])
        : tile(`In-district enrollment, FY${years[tl]}`, e.enroll.in_district[tl] != null ? `${fte(e.enroll.in_district[tl]!)} pupils` : "–", [
          // The first FTE a visitor meets; the charts below use the abbreviation
          "Full-time equivalents (FTE)",
          enrollChange != null ? `${pct(enrollChange)} since FY${years[enrollFirst]}` : "",
          e.kind === "district" ? "" : "Average per district",
        ]),
      tile(`Chapter 70 aid${whole ? "" : " per foundation pupil"}, FY${years[tl]}`, aid != null ? money(aid) : "–", [aidLine, cAidLine],
        aidShare != null ? { v: aidShare, title: `Chapter 70 aid: ${aidLine}`, own: aidLine,
          cmp: cAidShare != null ? { v: cAidShare, title: cAidLine, detail: cAidLine } : null } : null),
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
    const ppeTv = trendView("ppe", ppeTrend, ppeOverlayAll, cName);
    const p1 = stackedColumns($("svg-ppe") as unknown as SVGSVGElement, { ...frame(tall, `Spending${pp}`), trendsOnly: ppeTv.only }, ppeShown, ppeOverlay,
      ppeSel ? fitTicks(ppeShown, ppeOverlay?.values ?? null) : dollarTicks, fmtUsd, setHover,
      { value: ppeShownTotal[last], text: usd }, [], ppeTv.trends, extras);
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

    // Spending on out-of-district FTE: what the district pays to educate its own pupils in other schools, per
    // out-of-district FTE pupil, or with Totals on, in dollars. DESE's totals give it (export: ood_series).
    const oodOf = (x: Entity): Series => {
      const v = x.ood ?? nulls(years.length);
      const n = x.enroll.out_of_district;
      return { key: "ood", label: whole ? "Payments to out-of-district schools" : "Per out-of-district FTE", color: OOD_COLOR,
        values: deflate(whole ? v.map((y, i) => (y == null || n[i] == null ? null : y * n[i]!)) : v) };
    };
    const ood = oodOf(e);
    const cOod = c ? oodOf(c) : null;
    const oodOverlayAll = cOod ? { key: "cmp", label: cName, color: COMPARE_COLOR, values: cOod.values } : null;
    const oodTrendAll = trendOf(e.name, null, ood.values);
    const oodOverlay = drawn("ood", "cmp", oodOverlayAll);
    const oodTrend = drawn("ood", "trend", oodTrendAll);
    $("ood-sub").replaceChildren(
      `${dollarsNote}${whole ? `, in total${perDistrict}` : " per out-of-district FTE pupil"}: tuition and other payments for its ` +
      "out-of-district FTE, the district's own pupils educated elsewhere, such as charter schools, other districts, and " +
      "special education schools. With few out-of-district FTE, one placement moves the figure a lot. ", helpTip(
        "DESE's data reports no separate figure for these payments from FY2009. The explorer works them out from DESE's " +
        "totals: total spending per pupil times all FTE pupils, less in-district spending per pupil times in-district " +
        "pupils, over out-of-district pupils. For FY2005 to FY2008, where DESE printed the figure, the two agree to within " +
        "0.7%. An average pools its districts' payments over their out-of-district pupils."));
    let oodMax = 0;
    years.forEach((_, i) => (oodMax = Math.max(oodMax, ood.values[i] ?? 0, oodOverlay?.values[i] ?? 0)));
    const oodTv = trendView("ood", oodTrend, oodOverlayAll, cName);
    const p5 = stackedColumns($("svg-ood") as unknown as SVGSVGElement,
      { ...frame(width < 520 ? 220 : 260, whole ? "Payments" : "Per out-of-district FTE", "Per pupil"), trendsOnly: oodTv.only },
      [ood], oodOverlay, niceTicks(oodMax * 1.04), fmtUsd, setHover, { value: ood.values[last], text: usd }, [], oodTv.trends);
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
        ...(oodOverlay && oodOverlay.values[i] != null ? [{ value: usd(oodOverlay.values[i]!), label: oodOverlay.label, color: COMPARE_COLOR, mark: "linedot" as const }] : []),
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
    // Each count can be picked alone, with its trend and the comparison's; the earlier counts have no trend
    const en = measureLines("enroll", enroll.map((s) => ({ ...s, what: s.label.toLowerCase(), ...(s.dash ? { trend: false as const } : {}) })),
      c ? (x) => cEnroll?.find((y) => y.key === x.key)?.values : null,
      { own: e.name, cmp: cName, cmpLabel: (x) => `${cName}, ${x.what}`, cmpEntry: `${cName}${c?.kind === "average" ? ", per district" : ""}` }, fte);
    if (en.fitted) $("enroll-sub").append(" Scale fitted to the selection.");
    const p2 = lines($("svg-enroll") as unknown as SVGSVGElement, { ...frame(width < 520 ? 220 : 260, "Pupils"), trendsOnly: en.only }, en.lines,
      niceTicks(en.max * 1.04, 4), (v) => compact(v), fte, setHover, false, en.trends);
    legend($("legend-enroll"), en.legend, "enroll");
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
      ? { key: "cmp", label: `${cName}, ${nssSel ?? "actual net school spending"}`, color: COMPARE_COLOR, values: cNssShownTotal! }
      : null;
    const nssTrendAll = trendOf(e.name, nssSel ?? "actual net school spending", nssShownTotal);
    const nssOverlay = drawn("nss", "cmp", nssOverlayAll);
    const nssTrend = drawn("nss", "trend", nssTrendAll);
    const unreported = showsAbove ? years.filter((_, i) => nss[2].values[i] == null && nss[0].values[i] != null) : [];
    $("nss-sub").textContent =
      `${dollarsNote}${whole ? "" : " per foundation pupil"}.${wholeNote}` +
      (whole ? " Pupils are foundation enrollment." : "") +
      (nssSel ? " Scale fitted to the selection." : ` Column height is actual net school spending${pp}.`) +
      (unreported.length ? ` Faded: DESE has not reported FY${unreported.join(", FY")} actual spending.` : "");
    const nssTv = trendView("nss", nssTrend, nssOverlayAll, cName);
    const p3 = stackedColumns($("svg-nss") as unknown as SVGSVGElement,
      { ...frame(tall, `Net school spending${pp}`, `Spending${pp}`), trendsOnly: nssTv.only }, nssShown, nssOverlay,
      nssSel ? fitTicks(nssShown, nssOverlay?.values ?? null) : dollarTicks, fmtUsd, setHover,
      { value: nssShownTotal[last], text: usd }, years.map((_, i) => showsAbove && nss[2].values[i] == null), nssTv.trends);
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
      { label: "Actual net school spending", values: nssTotal, fmt: usd },
      ...(c ? [{ label: `${cName}, actual net school spending`, values: cNssTotal!, fmt: usd }] : []),
    ] };

    // Budgeted and actual net school spending: the budget each district reports to DESE for the coming year, on its
    // End-of-Year Report, against what it then spent and the state's minimum; under the chart, actual spending
    // against the budget each year, and the comparison's (the export pools an average's: budget_fields)
    let p7: Panel | null = null;
    let nssbTip: ((i: number) => TipContent) | null = null;
    const points = (v: number) => `${v.toFixed(Math.abs(v) < 0.1 ? 2 : 1)} points`;
    {
      const budget = e.nss_budget ? deflate(inDollars(e.nss_budget, e, "foundation")) : null;
      const has = !!budget?.some((v) => v != null);
      $("nssb-body").hidden = !has;
      $("nssb-none").hidden = has;
      if (!has) {
        $("nssb-sub").textContent = "";
        $("nssb-none").textContent = e.type === "charter"
          ? "Charter schools have no net school spending requirement, so DESE's compliance reports don't include them."
          : `DESE's compliance reports give no budgets for ${e.name}.`;
        delete fullTables.nssb;
      } else {
        const required: Values = years.map((_, i) => (nss[0].values[i] == null || nss[1].values[i] == null ? null
          : nss[0].values[i]! + nss[1].values[i]!));
        const bLines: Measure[] = [
          { key: "budget", label: "Budgeted", what: "budget", color: BUDGET_COLOR, values: budget! },
          { key: "actual", label: "Actual", what: "spending", color: ACTUAL_COLOR, values: nssTotal },
          { key: "required", label: "Required by the state", what: "requirement", color: REQUIRED_COLOR, dash: "2 3", values: required },
        ];
        // Each line can be picked alone, with its trend; no comparison here for now (Tim, #207)
        const bl = measureLines("nssb", bLines, null, { own: e.name, cmp: "", cmpLabel: () => "", cmpEntry: "" }, money);
        const gap = e.nss_gap ?? nulls(years.length);
        // "16.0% less", "2.5% more"
        const moreLess = (v: number) => `${Math.abs(v).toFixed(1)}% ${v < 0 ? "less" : "more"}`;
        const gAt = lastAt(gap);
        const nx = e.nss_budget_next;
        const district = e.kind === "district";
        $("nssb-sub").replaceChildren(
          `${dollarsNote}${whole ? "" : " per foundation pupil"}.${wholeNote}` +
          (gAt >= 0 ? ` In FY${years[gAt]}, ${district ? e.name : "its districts"} spent ${moreLess(gap[gAt]!)} than ${district ? "it" : "they"} budgeted.` : "") +
          (nx?.vs_actual != null ? ` FY${nx.fy}'s budget${district ? "" : "s"}${district && nx.budget != null ? `, ${whole$(nx.budget)},` : ""} ` +
            `${district ? "is" : "are"} ${moreLess(nx.vs_actual)} than FY${nx.fy - 1}'s spending` +
            (nx.vs_budget != null ? ` and ${moreLess(nx.vs_budget)} than FY${nx.fy - 1}'s budget` : "") + "." : "") + " ",
          helpTip("Net school spending is what the state counts toward a district's minimum: its own spending on its " +
            "schools, with what its town spends for them, such as health insurance, and without transportation, " +
            "capital, debt, and grants. Each year, on its End-of-Year Pupil and Financial Report, a district gives DESE " +
            "what it spent the year that just ended and what it has budgeted for the year under way; DESE's " +
            "compliance summaries list both, with what the state requires. The budget is the one the town meeting, " +
            "city council, or member towns approved, not the school committee's first proposal or a level-services " +
            "figure, which the state doesn't collect.\n\nThe columns under the chart compare each year's spending with " +
            "that year's budget, in dollars of the day. DESE posts FY2021's summary on; the earlier ones are from " +
            "the Internet Archive's copies of its site."));
        if (bl.fitted) $("nssb-sub").append(" Scale fitted to the selection.");
        p7 = lines($("svg-nssb") as unknown as SVGSVGElement, { ...frame(tall, `Net school spending${pp}`, `Spending${pp}`), trendsOnly: bl.only },
          bl.lines, niceTicks(bl.max * 1.04), fmtUsd, usd, setHover, false, bl.trends);
        legend($("legend-nssb"), bl.legend, "nssb");
        const gapWords = (who: string, v: number | null | undefined, i: number) => (v == null ? `${who}: no FY${years[i]} budget and spending to compare`
          : `${who}, FY${years[i]}: spent ${moreLess(v)} than budgeted`);
        gapColumns($("svg-nssb-gap") as unknown as SVGSVGElement, { width, height: width < 520 ? 110 : 124, years }, gap, null,
          ACTUAL_COLOR, COMPARE_COLOR, (i) => gapWords(e.name, gap[i], i));
        $("svg-nssb-gap").setAttribute("aria-label", `Actual vs. budget, ${e.name}, by year: ` +
          years.flatMap((y, i) => (gap[i] == null ? [] : [`FY${y} ${signedPct(gap[i]! / 100)}`])).join(", "));
        // The strip's key: the district's columns and the comparison's dots
        const key = (mark: string, color: string, words: string) => {
          const li = document.createElement("li");
          li.className = "legend-static";
          const k = document.createElement("span");
          k.className = `key ${mark}`;
          k.style.setProperty("--c", color);
          li.append(k, text("span", words));
          return li;
        };
        $("nssb-gap-legend").replaceChildren(key("rect", ACTUAL_COLOR, e.name));
        fullTables.nssb = { caption: `Budgeted and actual net school spending${whole ? "" : " per foundation pupil"}, ${e.name} (${dollarsNote.toLowerCase()})`, cols: [
          ...bLines.map((x) => ({ label: x.label, values: x.values, fmt: usd })),
          { label: "Actual vs. budget", values: gap, fmt: (v: number) => signedPct(v / 100) },
        ] };
        nssbTip = (i) => {
          const b = budget![i], a = nssTotal[i], bPrev = budget![i - 1], aPrev = nssTotal[i - 1];
          const rows: TipRow[] = [
            ...bl.shown.filter((x) => x.values[i] != null).map((x) => ({ value: usd(x.values[i]!), label: x.label, color: x.color,
              mark: x.dash ? "dash" as const : "line" as const })),
            ...trendRow(bl.one ? bl.trend : null, i),
            ...(gap[i] != null ? [{ value: signedPct(gap[i]! / 100), label: "Actual vs. budget", strong: true }] : []),
            ...(b != null && aPrev != null ? [{ value: signedPct(b / aPrev - 1), label: `Budget${pp} against FY${years[i - 1]}'s spending` }] : []),
            ...(b != null && bPrev != null ? [{ value: signedPct(b / bPrev - 1), label: `Budget${pp} against FY${years[i - 1]}'s budget` }] : []),
          ];
          return rows.length ? { title: `FY${years[i]}`, rows }
            : { title: `FY${years[i]}`, rows: [{ value: "–", label: a == null ? "No budget or spending reported" : "No budget reported" }] };
        };
      }
    }

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
      const revTv = trendView("rev", revTrend, revOverlayAll, cRevName);
      p4 = stackedColumns($("svg-rev") as unknown as SVGSVGElement, { ...frame(tall, `Revenue${pp}`), trendsOnly: revTv.only }, revShown, revOverlay,
        revSel ? fitTicks(revShown, revOverlay?.values ?? null) : niceTicks(revMax * 1.04), fmtUsd, setHover,
        { value: revShownTotal[end], text: usd, index: end }, [], revTv.trends);
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

    // Special education, from DESE's RADAR spreadsheet, per FTE pupil in district and out (the pupils DESE divides
    // all spending by, since its costs include out-of-district tuition), with a line for what the state paid back
    // through the Circuit Breaker for each year's costs. The export pools an average's districts (sped_fields).
    const perAll = whole ? "" : " per FTE pupil";
    const sped = spedSeries(e);
    $("sped-body").hidden = !sped;
    $("sped-none").hidden = !!sped;
    let p6: Panel | null = null;
    let spedTip: ((i: number) => TipContent) | null = null;
    if (!sped) {
      $("sped-sub").textContent = "";
      $("sped-none").textContent = e.type === "charter"
        ? "DESE's special education spending and Circuit Breaker figures don't include charter schools."
        : `DESE publishes no special education figures for ${e.name}.`;
      delete fullTables.sped;
    } else {
      const cSped = c ? spedSeries(c) : null;
      const spedTotal = totals(sped);
      const cSpedTotal = cSped ? totals(cSped) : null;
      const spedShown = visible(sped, "sped");
      const spedSel = selectionName(spedShown, sped, "categories");
      const spedShownTotal = totals(spedShown);
      const cSpedShownTotal = cSped ? totals(visible(cSped, "sped")) : null;
      const spedOverlayAll = cSped ? { key: "cmp", label: `${cName}, ${spedSel ?? "total"}`, color: COMPARE_COLOR, values: cSpedShownTotal! } : null;
      const spedTrendAll = trendOf(e.name, spedSel, spedShownTotal);
      const spedOverlay = drawn("sped", "cmp", spedOverlayAll);
      const spedTrend = drawn("sped", "trend", spedTrendAll);
      const ecb = e.cb;
      const cbAll: Series | null = ecb
        ? { key: "cb", label: "Paid back by the state", color: CB_COLOR, values: deflate(inDollars(ecb.paid, e, "cb")) } : null;
      const cbLine = drawn("sped", "cb", cbAll);
      const claimed = ecb ? deflate(inDollars(ecb.claimed, e, "cb")) : null;
      const above = ecb ? deflate(inDollars(ecb.above, e, "cb")) : null;
      const studentsLabel = e.kind === "district" ? "Students claimed" : "Students claimed, per district";
      const students = (v: number) => (e.kind === "district" ? Math.round(v).toLocaleString("en-US") : v.toFixed(1));
      const share = e.sped_share!;
      const shareAt = lastAt(share);
      $("sped-sub").replaceChildren(
        (whole
          ? `${dollarsNote}, in total: each year's figure per FTE pupil times its pupils, in the district's schools and out.`
          : `${dollarsNote} per FTE pupil, in the district's schools and out.`) +
        (shareAt >= 0 ? ` Special education was ${share[shareAt]!.toFixed(1)}% of ${e.kind === "district" ? `${e.name}'s spending` : "its districts' spending"} in FY${years[shareAt]}. ` : " "),
        helpTip(
          "DESE's direct special education spending: what each district reports spending on special education in its " +
          "own schools (teaching, other instructional services, and transportation), on " +
          "tuition at public schools and collaboratives elsewhere in Massachusetts and at private and out-of-state " +
          "schools, on transportation to them, and on health services for pupils in private schools. The last category " +
          "is what grants and revolving funds paid, such as federal special education grants.\n\nPer pupil divides " +
          "by every FTE pupil the district is responsible " +
          "for, in its own schools and out, as DESE does for total spending per pupil, so it is the cost of special " +
          "education spread over all pupils, not the cost per student with a disability."),
        ...(cbAll ? [" The green line is what the state paid back for each year's costs."] : []),
        ...(spedSel ? [" Scale fitted to the selection."] : []));
      let spedMax = 0;
      years.forEach((_, i) => (spedMax = Math.max(spedMax, stackTop(sped, i), cSpedTotal?.[i] ?? 0, cbLine?.values[i] ?? 0)));
      // A selection's scale holds the lines drawn over it, the payback's too
      const lineTops = years.map((_, i) => Math.max(spedOverlay?.values[i] ?? 0, cbLine?.values[i] ?? 0));
      const spedTv = trendView("sped", spedTrend, spedOverlayAll, cName);
      p6 = stackedColumns($("svg-sped") as unknown as SVGSVGElement,
        { ...frame(tall, `Special education${pp}`, `Per pupil`), trendsOnly: spedTv.only }, spedShown, spedOverlay,
        spedSel ? fitTicks(spedShown, lineTops) : niceTicks(spedMax * 1.04), fmtUsd, setHover,
        { value: spedShownTotal[last], text: usd }, [], spedTv.trends, cbLine ? [cbLine] : []);
      legend($("legend-sped"), [
        ...sped.map((s) => ({ key: s.key, label: s.label, color: s.color, mark: "rect" as const })),
        ...lineLegend(spedTrendAll, spedOverlayAll),
        ...(cbAll && hasLine(cbAll) ? [{ label: "Paid back by the state (Circuit Breaker)", color: CB_COLOR, mark: "line" as const, line: "cb" as const,
          help: "The state's Circuit Breaker reimburses part of what a district spends on a student whose special " +
            "education costs more than a threshold, four times the state's average foundation budget per pupil. The " +
            "district claims a year's costs after the year ends, and the state repays a share of the costs above the " +
            "threshold, 75% when the budget allows, in quarterly payments the next year. Transportation to " +
            "out-of-district schools has counted since the FY2022 payments. Extraordinary relief pays in the same year " +
            "when a district's instruction and tuition costs rise by more than a quarter over the year before.\n\nThe " +
            "line puts each payment with the year of the costs it repays, so it lines up with the columns: FY2024's " +
            "point is what the state paid in FY2025 for FY2024's claim, and any extraordinary relief paid in FY2024." }] : []),
      ], "sped");
      const spedCaption = `Special education spending${perAll}${spedSel ? `, ${spedSel}` : ""}, ${e.name} (${dollarsNote.toLowerCase()})`;
      compareTable($("cmp-sped"), spedCaption, "Category",
        cmpRows(spedShown, cSped, spedSel, spedTotal, cSpedTotal, spedShownTotal, cSpedShownTotal, "Total"),
        "usd", cSped ? c : null, { ...tableOpts, noCmpNote: c && !cSped ? `${capital(refName(c))} has no special education figures to shade this table against.` : undefined });
      fullTables.sped = { caption: `Special education spending${perAll} by category, and the Circuit Breaker, ${e.name} (${dollarsNote.toLowerCase()})`, cols: [
        ...sped.map((s) => ({ label: s.label, values: s.values, fmt: usd })),
        { label: "Total", values: spedTotal, fmt: usd },
        { label: "Share of all spending", values: share, fmt: (v: number) => `${v.toFixed(1)}%` },
        ...(cSped ? [{ label: `${cName}, total`, values: cSpedTotal!, fmt: usd }] : []),
        ...(ecb && cbAll ? [
          { label: "Paid back by the state, for the year's costs", values: cbAll.values, fmt: usd },
          { label: "Costs claimed", values: claimed!, fmt: usd },
          { label: "Costs above the threshold", values: above!, fmt: usd },
          { label: studentsLabel, values: ecb.students, fmt: students },
        ] : []),
      ] };
      spedTip = (i) => {
        const t = stackTip(i, spedShown, spedSel, spedShownTotal, spedTotal, spedOverlay, spedTrend, `Special education${pp}`, "categories");
        const rows = [...t.rows,
          ...(share[i] != null ? [{ value: `${share[i]!.toFixed(1)}%`, label: "Share of all spending" }] : []),
          ...(cbLine && cbLine.values[i] != null ? [
            { value: usd(cbLine.values[i]!), label: `Paid back by the state${pp}`, color: CB_COLOR, mark: "line" as const },
            ...(ecb!.students[i] != null ? [{ value: students(ecb!.students[i]!), label: studentsLabel }] : []),
            ...(claimed?.[i] != null ? [{ value: usd(claimed[i]!), label: `Costs claimed${pp}` }] : []),
          ] : [])];
        return { ...t, rows };
      };
    }

    // Students on October 1 of each school year, from DESE's enrollment: by race and ethnicity, each group's share
    // (a group chosen, its trend and the comparison's share); and the shares in selected groups, with the comparison's.
    // The export pools an average's districts (student_fields).
    let p8: Panel | null = null;
    let p9: Panel | null = null;
    let sraceTip: ((i: number) => TipContent) | null = null;
    let sgroupsTip: ((i: number) => TipContent) | null = null;
    {
      const st = e.students;
      for (const id of ["fig-srace", "fig-sgroups"]) $(id).hidden = !st;
      if (st) {
        const cSt = c?.students ?? null;
        const pctFmt = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)}%`;
        const whose = e.kind === "district" ? `${e.name}'s` : "its districts'";
        const studentsLabel = e.kind === "district" ? "Students" : "Students, average per district";
        const yearsNote = `Each school year sits at its fiscal year: October 1, ${meta.latest - 1}, at FY${meta.latest}.`;
        const sAt = lastAt(st.total);

        // By race and ethnicity
        const raceOf = (x: NonNullable<Entity["students"]>): Series[] =>
          RACE_SERIES.map((q) => ({ key: q.key, label: q.label, color: q.color, values: x.race[q.key] }));
        const race = raceOf(st);
        const cRace = cSt ? raceOf(cSt) : null;
        const shown = visible(race, "srace");
        // The groups' names keep their capitals mid-sentence ("Hispanic or Latino")
        const sel = shown.length === race.length ? null : shown.length === 1 ? shown[0].label : `${shown.length} selected groups`;
        const shownTotal = totals(shown);
        const overlayAll = cRace && sel ? { key: "cmp", label: `${cName}, ${sel}`, color: COMPARE_COLOR, values: totals(visible(cRace, "srace")) } : null;
        const overlay = drawn("srace", "cmp", overlayAll);
        const trendAll = sel ? trendOf(e.name, sel, shownTotal, points) : null;
        const trend = trendAll ? drawn("srace", "trend", trendAll) : null;
        const tv = trendView("srace", trend, overlayAll, cName, points, pctFmt);
        $("srace-sub").replaceChildren(`Shares of ${whose} students, from DESE.` + (sel ? " Scale fitted to the selection." : "") + " ",
          helpTip("DESE counts each student once, by the race and ethnicity families report: Hispanic or Latino students " +
            "of any race, and each race of the students who aren't Hispanic or Latino. Another race, or more than one, " +
            "includes American Indian or Alaska Native, Native Hawaiian or Pacific Islander, and multiracial students, " +
            `whom DESE has counted as their own group since FY2006. ${yearsNote}`));
        p8 = stackedColumns($("svg-srace") as unknown as SVGSVGElement,
          { ...frame(tall, "Students by race and ethnicity", "Share"), trendsOnly: tv.only }, shown, overlay,
          sel ? fitTicks(shown, overlay?.values ?? null) : [0, 25, 50, 75, 100], (v) => `${v}%`, setHover,
          { value: sAt >= 0 ? shownTotal[sAt] : null, text: pctFmt, index: sAt }, [], tv.trends);
        legend($("legend-srace"), [
          ...race.map((x) => ({ key: x.key, label: x.label, color: x.color, mark: "rect" as const })),
          ...lineLegend(trendAll, overlayAll, points),
        ], "srace");
        fullTables.srace = { caption: `Students by race and ethnicity, ${e.name}, in percent of all students`, cols: [
          ...race.map((x) => ({ label: x.label, values: x.values, fmt: pctFmt })),
          { label: studentsLabel, values: st.total, fmt: fte },
          ...(cRace ? cRace.map((x) => ({ label: `${cName}, ${x.label}`, values: x.values, fmt: pctFmt })) : []),
        ] };
        sraceTip = (i) => st.total[i] == null ? { title: `FY${years[i]}`, rows: [{ value: "–", label: "No enrollment reported" }] }
          // With only the trends shown, the groups picked together, and the comparison's (#225)
          : tv.only && sel ? { title: `FY${years[i]}`, rows: [
            { value: shownTotal[i] == null ? "–" : pctFmt(shownTotal[i]!), label: capital(sel), strong: true },
            ...trendRow(trend, i, pctFmt, points),
            ...(overlay && overlay.values[i] != null ? [{ value: pctFmt(overlay.values[i]!), label: overlay.label, color: COMPARE_COLOR, mark: "linedot" as const }] : []),
          ], note: `October 1, ${years[i] - 1}` } : {
          title: `FY${years[i]}`,
          rows: [
            ...shown.filter((x) => x.values[i] != null).reverse()
              .map((x) => ({ value: pctFmt(x.values[i]!), label: x.label, color: x.color, mark: "rect" as const })),
            { value: fte(st.total[i]!), label: studentsLabel },
            ...trendRow(trend, i, pctFmt),
            ...(overlay && overlay.values[i] != null ? [{ value: pctFmt(overlay.values[i]!), label: overlay.label, color: COMPARE_COLOR, mark: "linedot" as const }] : []),
          ],
          note: `October 1, ${years[i] - 1}`,
        };

        // In selected groups: the district's lines in each group's color, the comparison's in its own. A group picked
        // alone has its trend and the comparison's, as a single measure's chart does; the low income measures, which
        // changed too often, have none, and high needs, which counts low income and shifts with it, none either
        const groupsOf = (x: NonNullable<Entity["students"]>): Measure[] => STUDENT_GROUPS.map((q) => ({
          key: q.key, label: q.label, what: q.what, color: q.color, values: x.groups[q.key] ?? nulls(years.length),
          ...("dash" in q ? { dash: q.dash } : {}), ...(q.key === "swd" || q.key === "el" ? {} : { trend: false as const }) }));
        const cGroups = cSt ? groupsOf(cSt) : null;
        const sg = measureLines("sgroups", groupsOf(st), cGroups ? (x) => cGroups.find((y) => y.key === x.key)?.values : null,
          { own: e.name, cmp: cName, cmpLabel: (x) => `${cName}, ${x.what}`, cmpEntry: cName }, points);
        const nx = e.students_next;
        const share = (v: number | undefined, words: string) => (v == null ? "" : `${v === 0 ? "none" : pctFmt(v)} ${words}`);
        const latest = nx ? [share(nx.swd, "had disabilities"), share(nx.el, "were English learners"),
          share(nx.low_income, "were low income"), share(nx.high_needs, "had high needs")].filter(Boolean) : [];
        $("sgroups-sub").replaceChildren(`Shares of ${whose} students, from DESE.` +
          (nx && latest.length ? ` On October 1, ${nx.fy - 1} (FY${nx.fy}), ${andList(latest)}.` : "") +
          (sg.fitted ? " Scale fitted to the selection." : "") + " ",
          helpTip("Students with disabilities have an Individualized Education Program. English learners are students " +
            "whose first language isn't English and who can't yet do ordinary classroom work in English. High needs " +
            "counts once each student who has a disability, is or was recently an English learner, or is low income, " +
            "from FY2013.\n\nLow income has meant three things. Through FY2014 it was eligibility for free or " +
            "reduced-price school meals. From FY2015 to FY2021 DESE counted students as economically disadvantaged " +
            "instead, by their families' enrollment in state programs such as SNAP, which counted fewer students. From " +
            "FY2022 it counts low income again, a broader measure that includes every student the one before did. " +
            "The three don't compare, so each draws apart, and none has a trend line. High needs counts low income, so " +
            "it shifts when low income's measure does, in FY2015 and FY2022, and has no trend line either.\n\n" + yearsNote));
        p9 = lines($("svg-sgroups") as unknown as SVGSVGElement,
          { ...frame(width < 520 ? 260 : 300, "Students", "Share"), trendsOnly: sg.only }, sg.lines,
          niceTicks(Math.max(sg.one ? 1 : 10, sg.max * 1.06), 4), (v) => `${v}%`, pctFmt, setHover, false, sg.trends);
        legend($("legend-sgroups"), sg.legend, "sgroups");
        fullTables.sgroups = { caption: `Students in selected groups, ${e.name}, in percent of all students`, cols: [
          ...sg.all.map((x) => ({ label: x.label, values: x.values, fmt: pctFmt })),
          { label: studentsLabel, values: st.total, fmt: fte },
          ...(cGroups ? cGroups.filter(hasLine).map((x) => ({ label: `${cName}, ${x.what}`, values: x.values, fmt: pctFmt })) : []),
        ] };
        sgroupsTip = (i) => {
          const rows: TipRow[] = [
            ...sg.shown.filter((x) => x.values[i] != null).map((x) => ({ value: pctFmt(x.values[i]!), color: x.color,
              mark: x.dash ? "dash" as const : "line" as const,
              label: e.kind === "district" && st.total[i] != null ? `${x.label}, ${count(Math.round(x.values[i]! * st.total[i]! / 100))} students` : x.label })),
            ...trendRow(sg.one ? sg.trend : null, i, pctFmt),
            ...(st.total[i] != null ? [{ value: fte(st.total[i]!), label: studentsLabel }] : []),
            ...(hiddenLines.sgroups.has("cmp") ? [] : sg.cmpShown.filter((x) => x.values[i] != null)
              .map((x) => ({ value: pctFmt(x.values[i]!), label: x.label, color: COMPARE_COLOR, mark: "linedot" as const }))),
          ];
          return { title: `FY${years[i]}`, rows: rows.length ? rows : [{ value: "–", label: "No enrollment reported" }], note: `October 1, ${years[i] - 1}` };
        };
      } else {
        delete fullTables.srace;
        delete fullTables.sgroups;
      }
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
          rows: [
            ...en.shown.filter((s) => s.values[i] != null)
              .map((s) => ({ value: fte(s.values[i]!), label: s.label, color: s.color, mark: s.dash ? "dash" as const : "line" as const })),
            ...trendRow(en.one ? en.trend : null, i, fte),
            ...(hiddenLines.enroll.has("cmp") ? [] : en.cmpShown.filter((s) => s.values[i] != null)
              .map((s) => ({ value: fte(s.values[i]!), label: s.label, color: COMPARE_COLOR, mark: "linedot" as const }))),
          ],
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
              ...(nssOverlay && nssOverlay.values[i] != null ? [{ value: usd(nssOverlay.values[i]!), label: nssOverlay.label, color: COMPARE_COLOR, mark: "linedot" as const }] : []),
            ],
          };
        },
      },
      ...(p4 && revTip ? [{ panel: p4, figure: $("fig-rev"), tip: revTip }] : []),
      { panel: p5, figure: $("fig-ood"), tip: oodTip },
      ...(p7 && nssbTip ? [{ panel: p7, figure: $("fig-nssb"), tip: nssbTip }] : []),
      ...(p8 && sraceTip ? [{ panel: p8, figure: $("fig-srace"), tip: sraceTip }] : []),
      ...(p9 && sgroupsTip ? [{ panel: p9, figure: $("fig-sgroups"), tip: sgroupsTip }] : []),
      ...(p6 && spedTip ? [{ panel: p6, figure: $("fig-sped"), tip: spedTip }] : []),
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

  /** Beside Compare with: a relative choice ("Its enrollment group in its region") as the group it stands for, by
   * name, linking to that group in About the data's list of groups; otherwise a link to all the groups */
  function groupLink(a: HTMLAnchorElement, group: Named & { id: string } | null) {
    a.textContent = group ? group.name : "All groups";
    a.title = group ? `${group.name}: its members` : "Every group and its members";
    a.href = `/muni-spending/?view=data#${group ? `group-${group.id}` : "groups"}`;
    a.classList.toggle("is-group", !!group);
  }
  // Followed here, it opens the Data tab at the group, as the tabs do; a new tab or window loads the address
  for (const id of ["cmp-name", "town-cmp-name"]) {
    const a = $<HTMLAnchorElement>(id);
    a.addEventListener("click", (ev) => {
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      notes.go(new URL(a.href).hash.slice(1));
      update({ view: "data" });
    });
  }

  // ---- The charts and About the data, linked both ways (#227) ----
  // Under each chart, beside Full data table, the parts of About the data it draws on (its data-about)
  const figures = [...document.querySelectorAll<HTMLElement>("figure.panel[data-about]")];
  const partsOf = (f: HTMLElement) => f.dataset.about!.split(" ");
  for (const f of figures) {
    const line = aboutLine(partsOf(f));
    if (!line) continue;
    const table = f.querySelector(".table-open");
    if (!table) {
      f.append(line);
      continue;
    }
    // One row under the chart, which wraps on a narrow screen
    const foot = document.createElement("div");
    foot.className = "panel-foot";
    table.before(foot);
    foot.append(table, line);
  }
  // And under the cap tab's sources
  const capAbout = notes.links(["equalized-valuation-eqv", "income-fifths"]);
  if (capAbout) document.querySelector(".cap-method")?.after(capAbout);

  /** Bring a chart, the map or the plots into view, marked for a moment, with the keyboard's focus on it */
  function arriveAt(box: HTMLElement) {
    if (box.classList.contains("is-collapsed")) box.querySelector<HTMLButtonElement>(".collapse-toggle")?.click();
    box.scrollIntoView({ block: "start" });
    box.classList.remove("is-arrived");
    void box.offsetWidth;
    box.classList.add("is-arrived");
    window.setTimeout(() => box.classList.remove("is-arrived"), 2000);
    if (!box.hasAttribute("tabindex")) box.tabIndex = -1;
    box.focus({ preventScroll: true });
  }
  /** What an address's #id names: a chart (#fig-ppe), a map measure (#map-towns-reserves), or the plots */
  function arrivalFor(id: string): (() => void) | null {
    const m = /^map-(towns|districts)-(\w+)$/.exec(id);
    if (m) return () => {
      map?.show(m[1] as "towns" | "districts", m[2]);
      const box = document.querySelector<HTMLElement>(".map-section");
      if (box) arriveAt(box);
    };
    const box = id.startsWith("fig-") || id === "cw-plots" ? document.getElementById(id) : null;
    return box ? () => arriveAt(box) : null;
  }
  const goTo = (view: View, id: string) => {
    arrival = arrivalFor(id);
    update({ view });
  };
  // Opened from such a link in a tab of its own
  if (state.view !== "data" && location.hash) arrival = arrivalFor(decodeURIComponent(location.hash.slice(1)));

  // Under each part of About the data, the charts, map measures and tabs that draw on it: the charts' from their
  // data-about, the map's and the plots' from their modules, loaded the first time the Data tab opens
  const VIEW_NAMES = { districts: "School districts", towns: "Towns" } as const;
  const LAYER_NAMES = { districts: "Commonwealth map, school districts", towns: "Commonwealth map, towns" } as const;
  let uses: Promise<void> | null = null;
  function showUses() {
    uses ??= (async () => {
      const list: NoteUse[] = figures.map((f) => {
        const view = f.closest("[data-view-only]")!.getAttribute("data-view-only") as "districts" | "towns";
        return { parts: partsOf(f), where: VIEW_NAMES[view], name: f.querySelector("h3")!.textContent!.trim(),
          href: `/muni-spending/${view === "towns" ? "?view=towns" : ""}#${f.id}`, open: () => goTo(view, f.id) };
      });
      try {
        const [m, c] = await Promise.all([import("./map"), import("./commonwealth")]);
        for (const layer of ["towns", "districts"] as const) {
          for (const x of m.MAP_MEASURES[layer]) {
            if (!x.notes) continue;
            const id = `map-${layer}-${x.key}`;
            list.push({ parts: x.notes, where: LAYER_NAMES[layer], name: x.label,
              href: `/muni-spending/?view=commonwealth#${id}`, open: () => goTo("commonwealth", id) });
          }
        }
        list.push({ parts: [...new Set(Object.values(c.SOURCES).map((x) => x.note)), "correlations"], where: "Commonwealth",
          name: "Districts side by side", href: "/muni-spending/?view=commonwealth#cw-plots", open: () => goTo("commonwealth", "cw-plots") });
      } catch { /* the charts' lines still show */ }
      list.push({ parts: ["equalized-valuation-eqv", "income-fifths"], where: "The 82.5% cap", name: "The 82.5% cap",
        href: "/muni-spending/?view=cap", open: () => update({ view: "cap" }) });
      notes.shownIn(list);
    })();
    return uses;
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
    key: "tspend" | "trev" | "tval" | "tpar" | "tlevy" | "tres" | "tdebt" | "tcap";
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
    /** A line of another measure over the columns, with its legend entry; the scale holds it */
    extra?: { series: Series; line: Line; legend: string; help?: string };
    /** Rows the tooltip adds under the stack's, for a year */
    tipRows?: (i: number) => TipRow[];
    /** A note behind a "?" after the subtitle */
    help?: string;
    /** The tooltip gives each part's share of the total beside its count */
    shares?: boolean;
    /** Prop 2 1/2 votes that passed, by year, with their amounts in the chart's units; which kinds, said in the legend's note */
    votes?: { byYear: NonNullable<Town["passed"]>[]; amount: Values; label: string };
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
    const trendAll = trendOf(s.name, sel, shownTotal, s.fmt ?? usd);
    const overlay = drawn(s.key, "cmp", overlayAll);
    const trend = drawn(s.key, "trend", trendAll);
    $(`${s.key}-sub`).replaceChildren(s.sub + (sel ? " Scale fitted to the selection." : "") + (s.help ? " " : ""),
      ...(s.help ? [helpTip(s.help)] : []));
    const vm = s.votes;
    const marks: Marks | null = vm && !hiddenLines[s.key].has("votes")
      ? { key: "votes", color: VOTE_COLOR, at: vm.byYear.map((r) => r.length > 0), amount: vm.amount } : null;
    const tv = trendView(s.key, trend, overlayAll, s.cmp?.name ?? "", s.fmt ?? usd);
    // The votes alone: no columns or lines, the scale fitted to their amounts. Only the trends comes first.
    const alone = !!marks && votesAlone.has(s.key) && !tv.only;
    const extra = s.extra && !alone ? drawn(s.key, s.extra.line, s.extra.series) : null;
    const amountMax = Math.max(0, ...(marks?.amount ?? []).map((v) => v ?? 0));
    let max = 0;
    years.forEach((_, i) => (max = Math.max(max, stackTop(s.series, i), cTotal?.[i] ?? 0, extra?.values[i] ?? 0,
      marks?.amount[i] ?? 0)));
    const fmt = s.fmt ?? usd;
    const lineTops = years.map((_, i) => Math.max(overlay?.values[i] ?? 0, extra?.values[i] ?? 0, marks?.amount[i] ?? 0));
    if (alone) $(`${s.key}-sub`).append(" Showing the votes alone, on a scale fitted to their amounts.");
    const panel = stackedColumns($(`svg-${s.key}`) as unknown as SVGSVGElement,
      { width: s.width, height: s.width < 520 ? 260 : 320, years, yTitle: s.caption, yTitleShort: s.yShort, trendsOnly: tv.only },
      alone ? [] : shown, alone ? null : overlay,
      alone ? niceTicks((amountMax || max) * 1.04) : sel ? fitTicks(shown, lineTops) : niceTicks(max * 1.04), s.axis ?? fmtUsd, setHover,
      alone ? undefined : { value: shownTotal[s.end], text: fmt, index: s.end }, [], alone ? [] : tv.trends, extra ? [extra] : [], marks);
    legend($(`legend-${s.key}`), [
      ...s.series.map((x) => ({ key: x.key, label: x.label, color: x.color, mark: "rect" as const })),
      ...lineLegend(trendAll, overlayAll, fmt),
      ...(s.extra && hasLine(s.extra.series)
        ? [{ label: s.extra.legend, color: s.extra.series.color, mark: s.extra.series.dash ? "dash" as const : "line" as const, line: s.extra.line,
          help: s.extra.help }] : []),
      ...(vm ? [{ label: "Prop 2½ votes passed", color: VOTE_COLOR, mark: "diamond" as const, line: "votes" as const,
        help: "Each vote that passed, at the fiscal year it takes effect; a stem rises to its amount where the state " +
          "records one. Click to see the votes alone, and again to see them over the chart." }] : []),
    ], s.key);
    const units = s.kind === "count" ? "" : ` (${dollarsNote.toLowerCase()})`;
    compareTable($(`cmp-${s.key}`), `${s.caption}${sel ? `, ${sel}` : ""}, ${s.name}${units}`, s.rowLabel,
      cmpRows(shown, s.cSeries, sel, total, cTotal, shownTotal, cShownTotal, "Total"), s.kind ?? "usd", s.cmp,
      { end: s.end, per: state.per === "total" ? "" : PER_WORD[state.per], noCmpNote: s.noCmpNote });
    fullTables[s.key] = { caption: `${s.caption} by year, ${s.name}${units}`, cols: [
      ...s.series.map((x) => ({ label: x.label, values: x.values, fmt })),
      { label: "Total", values: total, fmt },
      ...(s.cmp && cTotal ? [{ label: `${s.cmp.name}, total`, values: cTotal, fmt }] : []),
      ...(vm ? [{ label: "Prop 2½ votes passed", values: vm.byYear.map((r) => r.length || null), fmt: count },
        { label: vm.label, values: vm.amount, fmt }] : []),
    ] };
    const tip = (i: number): TipContent => {
      const passed = marks ? vm!.byYear[i] : [];
      if (alone && !passed.length) return { title: `FY${years[i]}`, rows: [{ value: "–", label: "No Prop 2½ vote passed for this year" }] };
      if (total[i] == null && !alone) return { title: `FY${years[i]}`, rows: [{ value: "–", label: s.missing ?? "Not filed with the state" }] };
      const t0 = alone ? { title: `FY${years[i]}`, rows: [] as TipRow[] }
        : stackTip(i, shown, sel, shownTotal, total, overlay, trend, s.totalLabel, s.noun, fmt);
      // Parcels: each type's share of all of them beside its count
      const t = s.shares && total[i] ? { ...t0, rows: t0.rows.map((r) => {
        const part = shown.find((x) => x.label === r.label);
        return part && part.values[i] != null ? { ...r, value: `${r.value} (${percent(part.values[i]! / total[i]!)})` } : r;
      }) } : t0;
      const more = [
        ...(extra && extra.values[i] != null ? [{ value: fmt(extra.values[i]!), label: extra.label, color: extra.color, mark: "line" as const }] : []),
        ...(s.tipRows?.(i) ?? []),
        ...(passed.length ? [
          ...(vm!.amount[i] != null ? [{ value: fmt(vm!.amount[i]!), label: vm!.label, color: VOTE_COLOR, mark: "diamond" as const }] : []),
          ...passed.slice(0, 5).map(([, kind, amt, what], k) => ({ value: amt != null ? whole$(amt) : "–",
            label: `${VOTE_WORDS[kind] ?? kind} passed${what ? `: ${what}` : ""}`,
            ...(k === 0 && vm!.amount[i] == null ? { color: VOTE_COLOR, mark: "diamond" as const } : {}) })),
          ...(passed.length > 5 ? [{ value: "", label: `and ${passed.length - 5} more, listed under the levy chart` }] : []),
        ] : []),
      ];
      return more.length ? { ...t, rows: [...t.rows, ...more] } : t;
    };
    return { panel, tip, total, cTotal };
  }

  /** Reserves against the budget and override capacity against the ceiling, each its newest year, which DLS publishes
   * a year past the explorer's axis; and the bond rating tile */
  const reservePct = (r: Town["reserves_latest"]) => (r && r.budget ? (r.stab + r.sp_stab + r.free_cash) / r.budget : null);
  const overridePct = (o: Town["override_latest"]) => (o && o.ceiling ? o.capacity / o.ceiling : null);
  const newest = (xs: [number, string][] | undefined, agency: "sp" | "moodys") => {
    const got = (xs ?? []).filter(([, r]) => ratingOf(agency, r));
    return got.length ? [got[got.length - 1][0], ratingOf(agency, got[got.length - 1][1])!] as const : null;
  };
  /** The town's bond ratings under its debt chart: both agencies on one scale, the levels from the town's best rating
   * to its worst and one more each side, a row each */
  function showRating(t: Town, width: number) {
    const box = $("trating");
    const agencies = (["sp", "moodys"] as const).filter((a) => (t.ratings?.[a] ?? []).some(([y, r]) => ratingOf(a, r) && years.includes(y)));
    box.hidden = !agencies.length;
    if (!agencies.length) return;
    const name = { sp: "S&P", moodys: "Moody's" } as const;
    const byYear = Object.fromEntries(agencies.map((a) => [a, new Map((t.ratings![a] ?? [])
      .flatMap(([y, r]) => (ratingOf(a, r) && years.includes(y) ? [[y, ratingOf(a, r)!] as const] : [])))])) as
      Record<"sp" | "moodys", Map<number, string>>;
    const level = (a: "sp" | "moodys", r: string) => (RATING_SCALES[a] as readonly string[]).indexOf(r);
    const idx = agencies.flatMap((a) => [...byYear[a].values()].map((r) => level(a, r)));
    const lo = Math.max(0, Math.min(...idx) - 1);
    const hi = Math.min(RATING_SCALES.sp.length - 1, Math.max(...idx) + 1);
    const levels = RATING_SCALES.sp.slice(lo, hi + 1).map((s, k) => `${s} · ${RATING_SCALES.moodys[lo + k]}`);
    ratingSteps($("svg-trating") as unknown as SVGSVGElement, { width, height: 32 + 22 * (levels.length - 1) + 10, years, yTitle: "" },
      levels, agencies.map((a, k) => ({
        points: years.map((y) => (byYear[a].has(y) ? level(a, byYear[a].get(y)!) - lo : null)), color: RATING_COLORS[a],
        nudge: agencies.length > 1 ? (k ? 2.5 : -2.5) : 0, label: (i: number) => `${name[a]}, ${years[i]}: ${byYear[a].get(years[i])}`,
      })));
    $("svg-trating").setAttribute("aria-label", `Bond ratings of ${t.name} by year. ` + agencies.map((a) =>
      `${name[a]}: ${[...byYear[a]].map(([y, r]) => `${y} ${r}`).join(", ")}`).join(". "));
    // The legend: each agency's line, and where the state links its explanation of the ratings
    $("trating-legend").replaceChildren(...agencies.map((a) => {
      const li = document.createElement("li");
      li.className = "legend-static";
      const key = document.createElement("span");
      key.className = "key line";
      key.style.setProperty("--c", RATING_COLORS[a]);
      const doc = document.createElement("a");
      doc.href = RATING_DOCS[a];
      doc.textContent = "what its ratings mean";
      const note = document.createElement("span");
      note.append("(", doc, ")");
      li.append(key, text("span", name[a]), note);
      return li;
    }));
  }

  // Prop 2 1/2 votes, as votes.json lists them: FY, date, kind, department, purpose, amount, won, yes, no
  type VoteRow = [number, string | null, string, string | null, string | null, number | null, boolean, number | null, number | null];
  let votesData: Record<string, VoteRow[]> | null = null;
  async function showVotes(t: Town) {
    const box = $<HTMLDetailsElement>("tvotes");
    const holder = $("tvotes-table");
    box.hidden = t.kind !== "town";
    if (t.kind !== "town") return;
    if (!box.open) {
      holder.replaceChildren();
      box.ontoggle = () => box.open && showVotes(t);
      return;
    }
    votesData ??= (await import("../../data/massppe/votes.json")).default as unknown as Record<string, VoteRow[]>;
    if (state.t !== t.id) return;
    const rows = votesData[t.id] ?? [];
    if (!rows.length) {
      holder.replaceChildren(text("p", `The state lists no Proposition 2½ votes for ${t.name}.`, "panel-none"));
      return;
    }
    const table = document.createElement("table");
    table.append(text("caption", `Proposition 2½ votes, ${t.name}, newest first`));
    const head = document.createElement("tr");
    for (const h of ["Fiscal year", "Date", "Vote", "Purpose", "Amount", "Result"]) head.append(text("th", h));
    table.createTHead().append(head);
    const body = table.createTBody();
    for (const [fy, date, kind, dept, what, amt, won, yes, no] of rows) {
      const tr = document.createElement("tr");
      const result = `${won ? "Passed" : "Failed"}${yes != null && no != null ? `, ${count(yes)} to ${count(no)}` : ""}`;
      tr.append(text("th", `FY${fy}`), text("td", date ?? "–"), text("td", VOTE_WORDS[kind] ?? kind),
        text("td", [dept, what].filter(Boolean).join(": ") || "–", "vote-what"), text("td", amt != null ? usd(amt) : "–"),
        text("td", result, won ? "vote-won" : "vote-lost"));
      body.append(tr);
    }
    holder.replaceChildren(table);
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
    markSelf(townCompareSelect, t);
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
    // Said only when "Its population group in its region" falls back to the statewide population group
    if (c && state.tcmp === "peer" && t.kind === "town" && !t.cmp.peer && place)
      bits.push(`compared statewide: too few towns of this size in ${place}`);
    else if (!c && state.tcmp === "other") bits.push("pick a different town or group to compare with");
    else if (!c && (state.tcmp === "peer" || state.tcmp === "peer-state") && t.kind === "town" && !t.peer)
      bits.push("no population group");
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
    const cEduLine = c && cEduShare != null ? `${c.name}: ${percent(cEduShare)}` : "";
    const cTaxLine = c && cTaxShare != null ? `${c.name}: ${percent(cTaxShare)}` : "";
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
    // The two values side by side, each with the note on how they differ
    const valuesNote = "Assessed value is what the town's own assessors value its taxable property at, as of January 1 " +
      "before the fiscal year; the tax rate applies to it, so it sets tax bills. Equalized valuation (EQV) is the state's " +
      "estimate of what all that property would sell for, set every two years and adjusted for how closely each town's " +
      "assessments follow the market, so towns can be compared; Chapter 70 and other state formulas use it.";
    // The single-family share of parcels, the town's and the comparison's
    const singleLine = hasProp && singles(par, pEnd) != null ? `${percent(singles(par, pEnd)!)} single-family homes` : "";
    const cSingleLine = hasProp && cHasProp && singles(parcelSeries(c!), pEnd) != null ? `${c!.name}: ${percent(singles(parcelSeries(c!), pEnd)!)}` : "";
    // The comparison's bill, with the share of income its gold pie shows
    const cBillLine = c?.sf_bill?.[bIdx] != null ? `${c.name}: ${usd(deflate(c.sf_bill)[bIdx]!)}` +
      (c.sf_bill_income?.[bIdx] != null ? `, ${percent(c.sf_bill_income[bIdx]!)} of income` : "") : "";
    const propTiles = !hasProp ? [] : [
      tile(`Assessed value${perP}, FY${years[pEnd]}`, valTotal[pEnd] != null ? money(valTotal[pEnd]!) : "–", [
        !inTotal && t.kind === "town" && t.value_total?.[pEnd] != null ? `${amount(t.value_total[pEnd]!)} in all` : "",
        homes(val, pEnd) != null ? `Residential: ${percent(homes(val, pEnd)!)} of it` : "",
        cVal && totals(cVal)[pEnd] != null ? `${c!.name}: ${money(totals(cVal)[pEnd]!)}` : "",
      ], null, valuesNote),
      tile(`Equalized valuation${perP}, January ${years[eIdx] - 1}`,
        per(t.eqv!, kT)[eIdx] != null ? money(deflate(per(t.eqv!, kT))[eIdx]!) : "–", [
        t.eqv_total?.[eIdx] != null && !(inTotal && t.kind === "town")
          ? `${amount(t.eqv_total[eIdx]!)} ${t.kind === "town" ? "in all" : "combined"}` : "",
        c?.eqv && per(c.eqv, kC!)[eIdx] != null ? `${c.name}: ${money(deflate(per(c.eqv, kC!))[eIdx]!)}` : "",
      ], null, valuesNote),
      tile(`${t.kind === "town" ? "Parcels" : "Parcels per town"}, FY${years[pEnd]}`, parTotal[pEnd] != null ? count(parTotal[pEnd]!) : "–", [
        singleLine, cSingleLine,
      ], singles(par, pEnd) != null ? { v: singles(par, pEnd)!, title: `Single-family homes: ${singleLine}`, own: singleLine,
        cmp: cSingleLine ? { v: singles(parcelSeries(c!), pEnd)!, title: cSingleLine, detail: cSingleLine } : null } : null),
      tile(`Average single-family tax bill, FY${years[bIdx]}`, t.sf_bill![bIdx] != null ? usd(deflate(t.sf_bill!)[bIdx]!) : "–", [
        t.sf_bill_income?.[bIdx] != null ? `${percent(t.sf_bill_income[bIdx]!)} of income per capita` : "",
        cBillLine,
      ], t.sf_bill_income?.[bIdx] != null
        ? { v: t.sf_bill_income[bIdx]!, title: `The tax bill: ${percent(t.sf_bill_income[bIdx]!)} of income per capita`,
          own: `${percent(t.sf_bill_income[bIdx]!)} of income per capita`,
          cmp: c?.sf_bill_income?.[bIdx] != null ? { v: c.sf_bill_income[bIdx]!, title: `${c.name}: ${percent(c.sf_bill_income[bIdx]!)}`,
            detail: cBillLine } : null } : null),
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
        cEduLine,
      ], eduShare != null ? { v: eduShare, title: `Education: ${percent(eduShare)} of general fund spending`,
        cmp: c && cEduShare != null ? { v: cEduShare, title: cEduLine, detail: cEduLine } : null } : null),
      tile(`Taxes' share of revenue, FY${fy}`, taxShare != null ? percent(taxShare) : "–", [
        rev[0].values[end] != null ? `${money(rev[0].values[end]!)}${perP}` : "",
        cTaxLine,
      ], taxShare != null ? { v: taxShare, title: `Taxes: ${percent(taxShare)} of general fund revenue`,
        cmp: c && cTaxShare != null ? { v: cTaxShare, title: cTaxLine, detail: cTaxLine } : null } : null),
      tile(`${t.kind === "town" ? "Population" : "Combined population"}, July ${years[last] - 1}`, popNow != null ? count(popNow) : "–", [
        popChange != null ? `${pct(popChange)} since July ${years[0] - 1}` : "",
        t.kind === "average" ? "Census Bureau estimates" : peerLabel ? `Population group: ${peerLabel}` : "Not in a population group",
      ]),
      ...propTiles,
    );

    const width = panelBox().clientWidth;
    lastWidth = width;
    const filed = unfiled.length ? ` Not filed for FY${unfiled.join(" or FY")}.` : "";

    // Prop 2 1/2 votes that passed, by year, of the kinds that bear on a chart, with the year's amounts in the chart's
    // units (an underride lowers the limit, so it adds no stem)
    const votesFor = () => {
      const vs = t.passed ?? [];
      const byYear = years.map((y) => vs.filter((v) => v[0] === y));
      if (!byYear.some((r) => r.length)) return undefined;
      const amount = deflate(per(years.map((_, i) => {
        const sum = byYear[i].reduce((a, v) => a + (v[1] !== "underride" && v[2] != null ? v[2] : 0), 0);
        return sum > 0 && t.pop[i] ? sum / t.pop[i]! : null;
      }), kT));
      return { byYear, amount, label: `Amount of the votes${perP}` };
    };

    // Panel 1: spending by function
    const p1 = townStack({
      key: "tspend", name: t.name, series: spend, cSeries: cSpend, cmp: c, noun: "functions", rowLabel: "Function",
      caption: `General fund spending${perP}`, yShort: `Spending${perP}`, totalLabel: `Total${perP}`, end, width,
      sub: `${dollarsNote}${perP}.${filed}`,
      votes: votesFor(),
    }, dollarsNote);

    // Panel 2: revenue by source
    const p2 = townStack({
      key: "trev", name: t.name, series: rev, cSeries: cRev, cmp: c, noun: "sources", rowLabel: "Source",
      caption: `General fund revenue${perP}`, yShort: `Revenue${perP}`, totalLabel: `Total${perP}`, end, width,
      sub: `${dollarsNote}${perP}.${filed}`,
    }, dollarsNote);

    // Reserves at each year's end, debt, and capital projects (DLS)
    const hasFiscal = !!t.reserves;
    for (const id of ["fig-tres", "fig-tfc", "fig-tdebt", "fig-tcap"]) $(id).hidden = !hasFiscal;
    const fiscalPanels: typeof panels = [];
    const debtPanels: typeof panels = [];
    const who = t.kind === "town" ? t.name : "these towns";
    if (hasFiscal) {
      const resOf = (x: Town, k: Values): Series[] => RESERVE_SERIES.map((q) => ({ ...q, values: deflate(per(x.reserves![q.key], k)) }));
      const res = resOf(t, kT);
      const cRes = c?.reserves ? resOf(c, kC!) : null;
      const resShare = (x: Town, i: number) => share(sumAt(RESERVE_SERIES.map((q) => x.reserves![q.key]), i), x.budget?.[i] ?? null);
      const r = t.reserves_latest;
      const rp = reservePct(r);
      const p9 = townStack({
        key: "tres", name: t.name, series: res, cSeries: cRes, cmp: cRes ? c : null, noun: "reserves", rowLabel: "Reserve",
        caption: `Reserves${perP}`, yShort: `Reserves${perP}`, totalLabel: `Total${perP}`, end: lastWith(totals(res)), width,
        sub: `${dollarsNote}${perP}, at each fiscal year's end.` + (r && rp != null
          ? ` At the end of FY${r.fy}, ${who} held ${whole$(r.free_cash)} in free cash and ${whole$(r.stab + r.sp_stab)} in ` +
            `stabilization funds, ${percent(rp)} of ${t.kind === "town" ? "its" : "their"} operating budget${t.kind === "town" ? "" : "s"}.` : ""),
        help: "Free cash is what a town's general fund had left at the end of a fiscal year, from revenue above its estimates " +
          "and appropriations it didn't spend, less what it is still owed, such as unpaid property taxes. The state certifies it " +
          "from the town's June 30 balance sheet, and town meeting or the council can then spend it.\n\nStabilization funds are " +
          "savings: a majority vote adds to them and a two-thirds vote spends them. A special-purpose fund is saved for one " +
          "specific use, such as capital projects or school costs.",
        missing: "Not reported to the state",
        tipRows: (i) => {
          const s = resShare(t, i);
          return s != null ? [{ value: percent(s), label: "Of the operating budget" }] : [];
        },
      }, dollarsNote);
      fiscalPanels.push({ panel: p9.panel, figure: $("fig-tres"), tip: p9.tip });

      // Where free cash comes from: the state's proof of each year's free cash, over the years it covers. Shortfalls
      // and adjustments below zero take some back, which the chart hatches off the top of the column.
      const fcOf = (x: Town, k: Values): Series[] | null =>
        x.fc_proof ? FC_SERIES.map((q) => ({ key: q.key, label: q.label, color: q.color, values: deflate(per(x.fc_proof![q.key], k)) })) : null;
      const fcAll = fcOf(t, kT);
      const has = fcAll ? years.map((_, i) => fcAll.some((s) => s.values[i] != null)) : [];
      const a = has.indexOf(true);
      const b = has.lastIndexOf(true);
      $("fig-tfc").hidden = a < 0;
      if (a >= 0 && fcAll) {
        const fyears = years.slice(a, b + 1);
        const cut = (v: Values) => v.slice(a, b + 1);
        const fc = fcAll.map((s) => ({ ...s, values: cut(s.values) }));
        // The legend picks the sources shown; their sum, its trend and the comparison's follow
        const fcShown = visible(fc, "tfc");
        const fcSel = selectionName(fcShown, fc, "sources");
        const net = cut(deflate(per(t.fc_identified!, kT)));
        const shownNet = fcSel ? totals(fcShown) : net;
        const cFc = c?.fc_proof ? fcOf(c, kC!)!.map((s) => ({ ...s, values: cut(s.values) })) : null;
        const cNet = fcSel ? (cFc ? totals(visible(cFc, "tfc")) : null) : c?.fc_identified ? cut(deflate(per(c.fc_identified, kC!))) : null;
        const overlayAll = cNet && cNet.some((v) => v != null)
          ? { key: "cmp", label: `${c!.name}, ${fcSel ?? "free cash"}`, color: COMPARE_COLOR, values: cNet } : null;
        const overlay = drawn("tfc", "cmp", overlayAll);
        let fMax = 0;
        fyears.forEach((_, i) => (fMax = Math.max(fMax, stackTop(fc, i), overlayAll?.values[i] ?? 0)));
        // The trend of the free cash identified, or of the sources picked, over the proof's years; the tooltip reads
        // it in the page's years
        const fcTrend = trendOf(t.name, fcSel, shownNet);
        const fcTrendPage: Series = { ...fcTrend, values: years.map((_, i) => (i < a || i > b ? null : fcTrend.values[i - a])) };
        const fcTv = trendView("tfc", drawn("tfc", "trend", fcTrend), overlayAll, c?.name ?? "");
        // The comparison's trend too, for the hover card with only the trends shown
        const fcCmp = cmpTrends.get("tfc");
        if (fcCmp?.trend) cmpTrends.set("tfc", { ...fcCmp, trend: { ...fcCmp.trend,
          values: years.map((_, i) => (i < a || i > b ? null : fcCmp.trend!.values[i - a])) } });
        const inner = stackedColumns($("svg-tfc") as unknown as SVGSVGElement,
          { width, height: width < 520 ? 260 : 300, years: fyears, yTitle: `Free cash${perP}`, yTitleShort: "Free cash", trendsOnly: fcTv.only },
          fcShown, overlay,
          fcSel ? fitTicks(fcShown, overlay?.values ?? null) : niceTicks(fMax * 1.04), fmtUsd, (i, src) => setHover(i == null ? null : i + a, src),
          { value: shownNet[shownNet.length - 1], text: usd }, [], fcTv.trends);
        const l = t.fc_proof_latest;
        // The sources only: an adjustment can add a little, but it isn't where free cash comes from
        const top3 = l ? FC_SERIES.filter((q) => q.key !== "adjust" && l[q.key] > 0).sort((x, y) => l[y.key] - l[x.key]).slice(0, 3) : [];
        $("tfc-sub").replaceChildren(`${dollarsNote}${perP}, each year's free cash as the state calculates it from the town's ` +
          "June 30 balance sheet; shortfalls and adjustments take some back (hatched)." + (fcSel ? " Scale fitted to the selection." : "") +
          (l && top3.length ? ` For FY${l.fy}, ${t.kind === "town" ? `${t.name}'s` : "these towns'"} ${whole$(l.identified)} came ` +
            `mostly from ${andList(top3.map((q) => `${whole$(l[q.key])} ${q.words}`))}.` : "") + " ",
          helpTip("Local receipts are what a town collects besides the property tax and state aid: motor vehicle excise, " +
            "fees, permits, interest, and the like. Budgets estimate them conservatively, as the state advises, so most towns " +
            "collect more. State aid above the estimate is aid that came in above the state's own estimate for the year. " +
            "Appropriations left unspent are amounts voted in the budget but neither spent nor committed by June 30. Free cash " +
            "the town didn't spend the year before carries into this year's. The state then subtracts what the town is still " +
            "owed, such as unpaid taxes, and makes other adjustments, which can also add a little back."));
        legend($("legend-tfc"), [
          ...fc.map((s) => ({ key: s.key, label: s.label, color: s.color, mark: "rect" as const })),
          { label: "Taken back by shortfalls and adjustments", color: "#8f8a7f", mark: "hatch" as const, spot: "shortfall" },
          // As on the other charts: the trend, then the comparison
          ...lineLegend(fcTrend, overlayAll, usd),
        ], "tfc");
        fullTables.tfc = { caption: `Where free cash comes from${perP}, ${t.name} (${dollarsNote.toLowerCase()})`, cols: [
          ...fcAll.map((s) => ({ label: s.label, values: s.values, fmt: usd })),
          { label: "Free cash identified", values: deflate(per(t.fc_identified!, kT)), fmt: usd },
          ...(c?.fc_identified ? [{ label: `${c.name}, free cash identified`, values: deflate(per(c.fc_identified, kC!)), fmt: usd }] : []),
        ] };
        fiscalPanels.push({
          panel: offsetPanel(inner, a, fyears.length), figure: $("fig-tfc"),
          tip: (i) => {
            const k = i - a;
            if (k < 0 || k >= fyears.length) return { title: `FY${years[i]}`, rows: [{ value: "–", label: `The state's proofs cover FY${fyears[0]} on` }] };
            return { title: `FY${years[i]}`, rows: [
              { value: shownNet[k] != null ? usd(shownNet[k]!) : "–", label: fcSel ? `${capital(fcSel)}${perP}` : `Free cash identified${perP}`, strong: true },
              ...fcShown.filter((s) => s.values[k] != null && s.values[k] !== 0).reverse()
                .map((s) => ({ value: usd(s.values[k]!), label: s.label, color: s.color, mark: "rect" as const })),
              ...trendRow(fcTrendPage, i),
              ...(overlay && overlay.values[k] != null ? [{ value: usd(overlay.values[k]!), label: overlay.label, color: COMPARE_COLOR, mark: "linedot" as const }] : []),
            ] };
          },
        });
      }

      const debtOf = (x: Town, k: Values): Series[] => DEBT_SERIES.map((q) => ({ ...q, values: deflate(per(x.debt![q.key], k)) }));
      const debt = debtOf(t, kT);
      const cDebt = c?.debt ? debtOf(c, kC!) : null;
      const dl = t.debt_latest;
      const sp = newest(t.ratings?.sp, "sp");
      const md = newest(t.ratings?.moodys, "moodys");
      const p10 = townStack({
        key: "tdebt", name: t.name, series: debt, cSeries: cDebt, cmp: cDebt ? c : null, noun: "parts", rowLabel: "Debt",
        caption: `Long-term debt${perP}`, yShort: `Debt${perP}`, totalLabel: `Total${perP}`, end: lastWith(totals(debt)), width,
        sub: `${dollarsNote}${perP}, at each fiscal year's end.` +
          (dl && dl.budget ? ` In FY${dl.fy}, ${who} owed ${whole$(dl.outstanding)}, and general fund debt service was ` +
            `${(dl.service / dl.budget * 100).toFixed(1)}% of the operating budget.` : "") +
          (sp || md ? ` ${t.name}'s bonds: ${[sp ? `S&P ${sp[1]} (${sp[0]})` : "", md ? `Moody's ${md[1]} (${md[0]})` : ""].filter(Boolean).join(", ")}.` : ""),
        help: "Debt outstanding is what the town owes on its long-term bonds at the fiscal year's end, from Schedule A. " +
          "Authorized, not yet borrowed, is debt that town meeting or the council has voted to borrow but the town " +
          "hasn't yet issued.\n\nDebt service is what the general fund paid that year in principal and interest; DLS " +
          "sets it against the operating budget. The tooltip also gives the debt as a share of the town's equalized " +
          "valuation, the state's estimate of what all its taxable property is worth.",
        missing: "Not reported to the state",
        votes: votesFor(),
        tipRows: (i) => [
          ...(t.debt_service?.[i] != null ? [{ value: `${t.debt_service[i]!.toFixed(1)}%`, label: "Debt service, share of the budget" }] : []),
          ...(t.debt_eqv?.[i] != null ? [{ value: `${t.debt_eqv[i]!.toFixed(2)}%`, label: "Debt, share of equalized value" }] : []),
        ],
      }, dollarsNote);
      const capOf = (x: Town, k: Values): Series[] => CAPITAL_SERIES.map((q) => ({ ...q, values: deflate(per(x.capital![q.key], k)) }));
      const cap = capOf(t, kT);
      const cCap = c?.capital ? capOf(c, kC!) : null;
      const p11 = townStack({
        key: "tcap", name: t.name, series: cap, cSeries: cCap, cmp: cCap ? c : null, noun: "purposes", rowLabel: "Purpose",
        caption: `Capital projects spending${perP}`, yShort: `Capital${perP}`, totalLabel: `Total${perP}`, end: lastWith(totals(cap)), width,
        sub: `${dollarsNote}${perP}, from capital projects funds.`,
        help: "Spending from a town's capital projects funds, by purpose, from Schedule A Part 4: the funds that hold borrowing, " +
          "grants, and transfers for building, buying, and repairing, kept apart from the general fund. Chapter 90 is the " +
          "state's aid for local roads. A large project shows in the years its bills are paid.",
        missing: "Not reported to the state",
        votes: votesFor(),
      }, dollarsNote);
      showRating(t, width);
      debtPanels.push({ panel: p10.panel, figure: $("fig-tdebt"), tip: p10.tip }, { panel: p11.panel, figure: $("fig-tcap"), tip: p11.tip });
    }

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
      const o = t.override_latest;
      const op = overridePct(o);
      const v = t.votes;
      const held = (k: "override" | "debt" | "capital" | "stabilization", one: string, many: string) =>
        v && v[k][0] ? `${count(v[k][1])} of ${count(v[k][0])} ${v[k][0] === 1 ? one : many}` : "";
      const voteBits = [held("override", "override or underride vote", "override and underride votes"),
        held("debt", "debt exclusion", "debt exclusions"), held("capital", "capital exclusion", "capital exclusions")].filter(Boolean);
      const p7 = townStack({
        key: "tlevy", name: t.name, series: levy, cSeries: cLevy, cmp: cLevy ? c : null, noun: "parts", rowLabel: "Levy",
        caption: `Property tax levy and its limit${perP}`, yShort: `Levy${perP}`, totalLabel: `Levy limit${perP}`, end: lEnd, width,
        sub: `${dollarsNote}${perP}. Proposition 2½ limits each town's levy; the stack's full height is the limit, ` +
          `with voter-approved debt exclusions. ${used}` +
          (o && op != null ? ` Override capacity, the room between the limit and the ceiling, was ${percent(op)} of the ceiling in FY${o.fy}.` : "") +
          (voteBits.length ? ` Since FY${years[0]}, ${t.kind === "town" ? `${t.name}'s voters` : "voters in these towns"} passed ${voteBits.join(", ")}.` : ""),
        extra: t.levy_ceiling_pr ? {
          series: { key: "ceiling", label: "Levy ceiling", color: CEILING_COLOR, dash: "2 4", values: deflate(per(t.levy_ceiling_pr, kT)) },
          line: "ceiling", legend: "Levy ceiling, 2½% of value",
          help: "The levy ceiling is 2½% of the town's total assessed value; no levy may exceed it, even with an override, " +
            "though a debt exclusion can take the levy above it. The levy limit grows 2½% a year plus new growth, and an " +
            "override raises it for good. Override capacity is the room between the limit, before debt exclusions, and " +
            "the ceiling: how much more an override could raise, a measure of how much room a town has left.",
        } : undefined,
        tipRows: (i) => t.override_pct?.[i] != null ? [{ value: `${t.override_pct[i]!.toFixed(1)}%`, label: "Override capacity, share of the ceiling" }] : [],
        votes: votesFor(),
      }, dollarsNote);
      // The single-family bill, with its rate and its share of income in the tooltip
      const billCmp: Series | null = c?.sf_bill ? { key: "cmp", label: c.name, color: COMPARE_COLOR, values: deflate(c.sf_bill) } : null;
      // The scale holds the comparison whether it shows or not
      const bMax = Math.max(...[deflate(t.sf_bill!), billCmp?.values ?? []].flat().map((v) => v ?? 0));
      const bills: Series[] = [
        { key: "bill", label: t.name, color: POP_COLOR, values: deflate(t.sf_bill!) },
        ...(drawn("tbill", "cmp", billCmp) ? [billCmp!] : []),
      ];
      const billTrend = trendOf(t.name, null, bills[0].values);
      const billTv = trendView("tbill", drawn("tbill", "trend", billTrend), billCmp, c?.name ?? "");
      const p8 = lines($("svg-tbill") as unknown as SVGSVGElement,
        { width, height: width < 520 ? 220 : 260, years, yTitle: "Single-family tax bill", yTitleShort: "Tax bill", trendsOnly: billTv.only }, bills,
        niceTicks(bMax * 1.04, 4), fmtUsd, usd, setHover, false, billTv.trends);
      legend($("legend-tbill"), [
        { label: t.name, color: POP_COLOR, mark: "line" as const, spot: "bill" },
        ...lineLegend(billTrend, billCmp, usd),
      ], "tbill");
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
      void showVotes(t);
      taxPanels.push(
        { panel: p7.panel, figure: $("fig-tlevy"), tip: p7.tip },
        {
          panel: p8, figure: $("fig-tbill"),
          tip: (i) => ({
            title: `FY${years[i]}`,
            rows: [...bills.filter((x) => x.values[i] != null)
              .map((x) => ({ value: usd(x.values[i]!), label: x.label, color: x.color, mark: x.key === "cmp" ? "linedot" as const : "line" as const })),
              ...(bills[0].values[i] != null ? trendRow(billTrend, i) : [])],
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
        key: "tpar", name: t.name, series: par, cSeries: cHasProp ? parcelSeries(c!) : null, cmp: cHasProp ? c : null, shares: true,
        noun: "property types", rowLabel: "Property type",
        caption: t.kind === "town" ? "Parcels" : "Parcels per town", yShort: "Parcels", totalLabel: t.kind === "town" ? "Total parcels" : "Parcels per town",
        end: pEnd, width, fmt: count, axis: (v) => compact(v), kind: "count",
        sub: (t.kind === "town" ? "Parcels of taxable real estate by use." : `Average per town, across its ${t.members} towns.`) +
          " Personal property accounts and exempt parcels are not counted. The tooltip gives each use's share of all parcels" +
          (c ? `; the comparison is ${c.kind === "town" ? c.name : "the average town of the comparison"}'s count.` : "."),
        missing: "Not reported to the state",
      }, dollarsNote);
      // EQV every other year, joined across the years between
      const eqvCmp: Series | null = c?.eqv ? { key: "cmp", label: c.name, color: COMPARE_COLOR, values: deflate(per(c.eqv, kC!)) } : null;
      const eqvOwn = deflate(per(t.eqv!, kT));
      const eMax = Math.max(...[eqvOwn, eqvCmp?.values ?? []].flat().map((v) => v ?? 0));
      const eqvLines: Series[] = [
        { key: "eqv", label: t.name, color: POP_COLOR, values: eqvOwn },
        ...(drawn("teqv", "cmp", eqvCmp) ? [eqvCmp!] : []),
      ];
      const eqvTrend = trendOf(t.name, null, eqvLines[0].values);
      const eqvTv = trendView("teqv", drawn("teqv", "trend", eqvTrend), eqvCmp, c?.name ?? "");
      const p6 = lines($("svg-teqv") as unknown as SVGSVGElement,
        { width, height: width < 520 ? 220 : 260, years, yTitle: `Equalized value${perP}`, yTitleShort: `EQV${perP}`, trendsOnly: eqvTv.only }, eqvLines,
        niceTicks(eMax * 1.04, 4), fmtUsd, usd, setHover, true, eqvTv.trends);
      legend($("legend-teqv"), [
        { label: t.name, color: POP_COLOR, mark: "line" as const, spot: "eqv" },
        ...lineLegend(eqvTrend, eqvCmp, usd),
      ], "teqv");
      const k = towns!.meta.c70_target;
      const at = k ? years.indexOf(k.eqv_year + 1) : -1;
      const base = k && t.kind === "town" && at >= 0 ? t.eqv_total?.[at] ?? null : null;
      $("teqv-sub").textContent = `${dollarsNote}${perP}. Every two years the state sets each town's equalized ` +
        "valuation, its estimate of what all the town's taxable property would sell for on January 1; each is shown at the " +
        "fiscal year whose assessments share that date." +
        (k && base != null ? ` For FY${k.fy}, Chapter 70 set ${t.name}'s target local contribution at ` +
          `${usd(base * k.property_pct / 100)} from property, ${k.property_pct}% of its January ${k.eqv_year} equalized ` +
          `valuation, plus ${k.income_pct}% of its residents' ` +
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
            const rows: TipRow[] = [...eqvLines.filter((x) => x.values[i] != null)
              .map((x) => ({ value: usd(x.values[i]!), label: x.label, color: x.color, mark: "line" as const })),
              ...(eqvLines[0].values[i] != null ? trendRow(eqvTrend, i) : [])];
            return rows.length
              ? { title: `FY${years[i]}`, rows, note: `EQV as of January 1, ${years[i] - 1}` }
              : { title: `FY${years[i]}`, rows: [{ value: "–", label: "No EQV for this January" }], note: "The state sets EQV every two years" };
          },
        },
      );
    }

    // Population, the denominator of the dollar panels, and the labor force: first the unemployment rate, and a
    // switch to the population, labor force and employed behind it. Their trends draw only with the dial, one for each
    // line, the town's and the comparison's.
    // "Population", not "Residents", throughout (Tim, #217)
    const popLabel = t.kind === "town" ? "Population" : "Combined population";
    const lab = t.labor;
    const cLab = c?.labor ?? null;
    const rateView = !!lab && popView === "rate";
    $("tpop-views").hidden = !lab;
    document.querySelectorAll<HTMLInputElement>('input[name="tpop-view"]').forEach((r) => (r.checked = r.value === (rateView ? "rate" : "people")));
    const pctOne = (v: number) => `${v.toFixed(1)}%`;
    // A rate's yearly change is often under a tenth of a point
    const points = (v: number) => `${v.toFixed(Math.abs(v) < 0.1 ? 2 : 1)} points`;
    const lAt = lab ? lastAt(lab.rate) : -1;
    const whose = t.kind === "town" ? `${t.name}'s` : "these towns'";
    const laborHelp = "The labor force is the residents 16 and older who are working or looking for work, and the employed " +
      "those working, wherever their jobs are: the state's annual averages for each calendar year, from the Bureau of Labor " +
      "Statistics' local area estimates, through the latest year DLS publishes. Each year sits at the fiscal year whose " +
      "July 1 population estimate falls in its middle: 2022 at FY2023. The unemployment rate is the share of the labor " +
      "force out of work.";
    $("tpop-sub").replaceChildren(rateView
      ? `The share of ${whose} labor force out of work each year.` +
        (lAt >= 0 ? ` In ${years[lAt] - 1} it was ${pctOne(lab!.rate[lAt]!)}.` : "") + " "
      : (t.kind === "town" ? "Census Bureau estimates, July 1 at the start of each fiscal year." : `All ${t.members} towns combined.`) +
        (state.per === "resident" ? ` Per-resident figures above divide each year's dollars by this population.` : "") +
        (lab ? " The labor force and the employed are the state's annual averages. " : ""),
      ...(lab ? [helpTip(laborHelp)] : []));
    $("svg-tpop").setAttribute("aria-label", (rateView ? "Lines of the unemployment rate" : "Lines of population, labor force, and employment") +
      " for each fiscal year. Use the arrow keys to read each year; the data table below has every value.");
    // An average's comparison is its average town; a rate needs no dividing
    const cPer = c && c.kind === "average" && c.members ? c.members : 1;
    const perTown = (v: Values) => v.map((x) => (x == null ? null : x / cPer));
    // The rate, one measure, has its trend and the comparison's line, as a single measure's chart does; the population,
    // labor force and employed can each be picked alone for the same
    const pop: Measure[] = rateView ? [{ key: "rate", label: t.name, what: "unemployment rate", color: LABOR_COLOR, values: lab!.rate }] : [
      { key: "pop", label: popLabel, what: "population", color: POP_COLOR, values: t.pop },
      ...(lab ? [{ key: "labor", label: "Labor force", what: "labor force", color: LABOR_COLOR, values: lab.force },
        { key: "employed", label: "Employed", what: "employed", color: EMPLOYED_COLOR, values: lab.employed }] : []),
    ];
    const cVals: Record<string, Values | undefined> = rateView ? { rate: cLab?.rate } : { pop: c ? perTown(c.pop) : undefined,
      labor: cLab ? perTown(cLab.force) : undefined, employed: cLab ? perTown(cLab.employed) : undefined };
    const pm = measureLines("tpop", pop, c ? (x) => cVals[x.key] : null,
      { own: t.name, cmp: c?.name ?? "", cmpLabel: (x) => (rateView ? c!.name : `${c!.name}, ${x.what}${cPer > 1 ? " per town" : ""}`),
        cmpEntry: `${c?.name ?? ""}${cPer > 1 ? ", per town" : ""}` }, rateView ? points : count);
    if (pm.fitted) ((sub) => sub.insertBefore(document.createTextNode("Scale fitted to the selection. "), sub.lastElementChild))($("tpop-sub"));
    const p3 = lines($("svg-tpop") as unknown as SVGSVGElement,
      { width, height: rateView ? (width < 520 ? 220 : 230) : width < 520 ? 300 : 260, years, yTitle: rateView ? "Unemployment rate" : "People",
        yTitleShort: rateView ? "Unemployed" : undefined, trendsOnly: pm.only }, pm.lines,
      niceTicks(pm.max * (rateView ? 1.1 : 1.04), 4), rateView ? (v) => `${v}%` : (v) => compact(v), rateView ? pctOne : count, setHover, false,
      pm.trends);
    legend($("legend-tpop"), pm.legend, "tpop");
    fullTables.tpop = { caption: `Population and labor force, ${t.name}`, cols: [
      { label: popLabel, values: t.pop, fmt: count },
      ...(lab ? [{ label: "Labor force (calendar year before)", values: lab.force, fmt: count },
        { label: "Employed", values: lab.employed, fmt: count },
        { label: "Unemployment rate", values: lab.rate, fmt: pctOne }] : []),
      ...(c ? [{ label: c.kind === "town" ? c.name : `${c.name}, combined`, values: c.pop, fmt: count }] : []),
      ...(c && cLab ? [{ label: `${c.name}, unemployment rate`, values: cLab.rate, fmt: pctOne }] : []),
    ] };
    const popTip = (i: number): TipContent => rateView ? {
      title: `FY${years[i]}`,
      rows: lab!.rate[i] == null ? [{ value: "–", label: "No labor force figures for this year" }] : [
        { value: pctOne(lab!.rate[i]!), label: `${t.name}, unemployment rate`, color: LABOR_COLOR, mark: "line" as const },
        ...(lab!.force[i] != null ? [{ value: count(lab!.force[i]!), label: "In the labor force" }] : []),
        ...(lab!.force[i] != null && lab!.employed[i] != null ? [{ value: count(lab!.force[i]! - lab!.employed[i]!), label: "Out of work" }] : []),
        ...trendRow(pm.trend, i, pctOne),
        ...(cLab?.rate[i] != null && !hiddenLines.tpop.has("cmp")
          ? [{ value: pctOne(cLab.rate[i]!), label: `${c!.name}, unemployment rate`, color: COMPARE_COLOR, mark: "linedot" as const }] : []),
      ],
      note: `The state's annual average for ${years[i] - 1}`,
    } : {
      title: `FY${years[i]}`,
      rows: [{ value: t.pop[i] != null ? count(t.pop[i]!) : "–", label: popLabel, color: POP_COLOR, mark: "line" },
        ...(lab && lab.force[i] != null ? [
          { value: count(lab.force[i]!), label: `Labor force, ${years[i] - 1}`, color: LABOR_COLOR, mark: "line" as const },
          { value: count(lab.employed[i]!), label: "Employed", color: EMPLOYED_COLOR, mark: "line" as const },
          { value: pctOne(lab.rate[i]!), label: "Unemployment rate" },
        ] : []),
        ...trendRow(pm.one ? pm.trend : null, i, count),
        ...(hiddenLines.tpop.has("cmp") ? [] : pm.cmpShown.filter((x) => x.values[i] != null)
          .map((x) => ({ value: count(x.values[i]!), label: x.label, color: COMPARE_COLOR, mark: "linedot" as const })))],
      // FY2021 uses the April 2020 estimates base (update_census_data.py)
      note: years[i] === 2021 ? "April 1, 2020 estimate" : `July 1, ${years[i] - 1} estimate`,
    };

    // Who lives here: the Census Bureau's five-year estimates that don't overlap, each group's share of residents
    // by age, race and ethnicity, sex, and disability. A share's trend and the comparison draw once a group is chosen.
    const demoPanels: typeof panels = [];
    const dm = t.demo;
    for (const id of ["fig-tage", "fig-trace", "fig-tsex"]) $(id).hidden = !dm;
    $("fig-tdis").hidden = !dm?.disability.some((v) => v != null);
    if (dm) {
      type Demo = Record<DemoKey, Values>;
      const pctFmt = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)}%`;
      const releases = years.filter((_, i) => dm.population[i] != null);
      const span = (i: number) => `${years[i] - 5}–${years[i] - 1}`;
      const residents = t.kind === "town" ? "Population" : "Population, combined";
      // A share's trend: its yearly change in points, and that as a percent of the share
      const sharePoints = (v: number) => `${v.toFixed(Math.abs(v) < 0.1 ? 2 : 1)} points`;
      const pointsDetail = (values: Values) => ((r) => (r ? `${signed(r.perYear, sharePoints)}` +
        `${r.rate != null ? ` (${signedPct(r.rate)})` : ""} a year` : undefined))(trendRate(values));
      /** One panel: each group's count over the residents it's a share of (base), or, missing, why a release has none */
      const demoStack = (key: "tage" | "trace" | "tsex" | "tdis", defs: readonly { key: string; label: string; color: string; of: (d: Demo) => Values }[],
        caption: string, sub: string, help: string, base: { of: (d: Demo) => Values; label: string } = { of: (d) => d.population, label: residents },
        missing = "No estimate for this release") => {
        const seriesOf = (x: Town): Series[] | null => x.demo ? defs.map((q) => {
          const whole = base.of(x.demo!), part = q.of(x.demo!);
          return { key: q.key, label: q.label, color: q.color, values: whole.map((n, i) => (n && part[i] != null ? part[i]! / n * 100 : null)) };
        }) : null;
        const series = seriesOf(t)!;
        const cSeries = c ? seriesOf(c) : null;
        // A chart of one group (women, with a disability) shows it as one picked would: its trend and the comparison's
        const single = series.length === 1;
        const shown = single ? series : visible(series, key);
        const dAt = lastAt(series[0].values);
        // The groups' names keep their capitals mid-sentence ("Hispanic or Latino")
        const sel = single ? series[0].label : shown.length === series.length ? null : shown.length === 1 ? shown[0].label : `${shown.length} selected groups`;
        const shownTotal = totals(shown);
        const overlayAll = c && cSeries && sel ? { key: "cmp", label: `${c.name}, ${sel}`, color: COMPARE_COLOR,
          values: totals(single ? cSeries : visible(cSeries, key)) } : null;
        const overlay = drawn(key, "cmp", overlayAll);
        // Its trend once a group is chosen: a share's line across the releases
        const trendAll = sel ? trendOf(t.name, sel, shownTotal, sharePoints) : null;
        const trend = trendAll ? drawn(key, "trend", trendAll) : null;
        $(`${key}-sub`).replaceChildren(sub + (sel && !single ? " Scale fitted to the selection." : "") + " ", helpTip(help));
        const tv = trendView(key, trend, overlayAll, c?.name ?? "", sharePoints, pctFmt);
        const panel = stackedColumns($(`svg-${key}`) as unknown as SVGSVGElement,
          { width, height: width < 520 ? 240 : 280, years, yTitle: caption, yTitleShort: "Share", sparse: true, trendsOnly: tv.only }, shown, overlay,
          sel ? fitTicks(shown, overlay?.values ?? null) : [0, 25, 50, 75, 100], (v) => `${v}%`, setHover,
          { value: dAt >= 0 ? shownTotal[dAt] : null, text: pctFmt, index: dAt }, [], tv.trends);
        legend($(`legend-${key}`), [
          ...series.map((x) => ({ ...(single ? { spot: x.key } : { key: x.key }), label: x.label, color: x.color, mark: "rect" as const })),
          ...(trendAll && hasLine(trendAll) ? [{ label: trendAll.label, color: TREND_COLOR, mark: "dash" as const, line: "trend" as const,
            detail: pointsDetail(trendAll.values) }] : []),
          ...(overlayAll ? [{ label: overlayAll.label, color: COMPARE_COLOR, mark: "linedot" as const, line: "cmp" as const,
            detail: hasLine(cmpTrendOf(overlayAll)) ? pointsDetail(cmpTrendOf(overlayAll).values) : undefined }] : []),
        ], key);
        fullTables[key] = { caption: `${caption}, ${t.name}: the Census Bureau's five-year estimates, at the fiscal year after each`, cols: [
          ...series.map((x) => ({ label: x.label, values: x.values, fmt: pctFmt })),
          { label: base.label, values: base.of(dm), fmt: count },
          ...(c && cSeries ? cSeries.map((x) => ({ label: `${c.name}, ${x.label}`, values: x.values, fmt: pctFmt })) : []),
        ] };
        const none = { value: "–", label: missing };
        // Between two releases, the band's change: each group's share at either end
        const between = (i: number): TipContent => {
          const before = [...releases].reverse().find((fy) => fy < years[i]);
          const after = releases.find((fy) => fy > years[i]);
          if (before == null || after == null) return { title: `FY${years[i]}`, rows: [{ value: "–", label: `The estimates sit at FY${releases.join(", FY")}` }] };
          const [p0, p1] = [years.indexOf(before), years.indexOf(after)];
          const rows = shown.filter((x) => x.values[p0] != null && x.values[p1] != null).reverse()
            .map((x) => ({ value: `${pctFmt(x.values[p0]!)} → ${pctFmt(x.values[p1]!)}`, color: x.color, mark: "rect" as const,
              label: `${x.label}, ${signed(x.values[p1]! - x.values[p0]!, (v) => `${v.toFixed(1)} points`)}` }));
          return { title: `${span(p0)} to ${span(p1)}`, rows: rows.length ? rows : [none] };
        };
        // With only the trends shown, the groups picked together, and the comparison's (#225); between two
        // releases, each at either end
        const together = (i: number): TipContent => {
          const ends = dm.population[i] == null
            ? ((before, after) => (before == null || after == null ? null : [years.indexOf(before), years.indexOf(after)]))(
              [...releases].reverse().find((fy) => fy < years[i]), releases.find((fy) => fy > years[i]))
            : [i, i];
          if (!ends) return between(i);
          const [p0, p1] = ends;
          const row = (v: Values, label: string, extra: Partial<TipRow>): TipRow[] => (v[p0] == null || v[p1] == null ? [] : [{
            value: p0 === p1 ? pctFmt(v[p0]!) : `${pctFmt(v[p0]!)} → ${pctFmt(v[p1]!)}`,
            label: p0 === p1 ? label : `${label}, ${signed(v[p1]! - v[p0]!, (x) => `${x.toFixed(1)} points`)}`, ...extra }]);
          // The trends run through every year, so their figures are the hovered year's
          const rows = [...row(shownTotal, capital(sel!), { strong: true }), ...trendRow(trend, i, pctFmt, sharePoints),
            ...(overlay ? row(overlay.values, overlay.label, { color: COMPARE_COLOR, mark: "linedot" }) : [])];
          return { title: p0 === p1 ? `${span(p0)}, at FY${years[p0]}` : `${span(p0)} to ${span(p1)}`, rows: rows.length ? rows : [none] };
        };
        const tip = (i: number): TipContent => tv.only && sel ? together(i) : dm.population[i] == null
          ? between(i)
          : base.of(dm)[i] == null ? { title: `${span(i)}, at FY${years[i]}`, rows: [none] }
          : { title: `${span(i)}, at FY${years[i]}`, rows: [
            ...shown.filter((x) => x.values[i] != null).reverse()
              .map((x) => ({ value: pctFmt(x.values[i]!), label: x.label, color: x.color, mark: "rect" as const })),
            { value: count(base.of(dm)[i]!), label: base.label },
            ...trendRow(trend, i, pctFmt),
            ...(overlay && overlay.values[i] != null ? [{ value: pctFmt(overlay.values[i]!), label: overlay.label, color: COMPARE_COLOR, mark: "linedot" as const }] : []),
          ] };
        return { panel, tip };
      };
      const counts = <T extends { key: DemoKey }>(defs: readonly T[]) => defs.map((q) => ({ ...q, of: (d: Demo) => d[q.key] }));
      const acsHelp = "The Census Bureau's American Community Survey asks a sample of households each year; its five-year " +
        "estimates pool five years of answers, which small towns need. Estimates whose years overlap shouldn't be compared, " +
        "so these are the four that don't: 2005–2009, 2010–2014, 2015–2019, and 2020–2024, each at the fiscal year after it " +
        "ends, as the household counts are. A small town's shares can carry margins of error of several points.";
      const theirs = t.kind === "town" ? `${t.name}'s` : "these towns'";
      const pAge = demoStack("tage", counts(AGE_SERIES), "Population by age",
        `Shares of ${theirs} residents, from the Census Bureau's American Community Survey.`, acsHelp);
      const pRace = demoStack("trace", counts(RACE_SERIES), "Population by race and ethnicity",
        `Shares of ${theirs} residents, from the Census Bureau's American Community ` +
          "Survey. Hispanic or Latino residents may be of any " +
          "race; each race counts residents who aren't Hispanic or Latino.",
        acsHelp + "\n\nRace and Hispanic or Latino origin are as residents report them. Another race, or more than one, " +
          "includes American Indian and Alaska Native, Native Hawaiian and Pacific Islander, and residents who name some " +
          "other race or two or more races.");
      const pSex = demoStack("tsex", counts(SEX_SERIES), "Women in the population",
        `The share of ${theirs} residents who are women, from the Census Bureau's American Community Survey.`,
        acsHelp + "\n\nThe survey asks each resident's sex as female or male.");
      const pDis = demoStack("tdis", [
        { key: "disability", label: "With a disability", color: DISABILITY_COLOR, of: (d) => d.disability },
      ], "Population with a disability",
        `The share of ${theirs} residents with a disability, among those not living in institutions such as ` +
          "nursing homes and prisons, from the Census Bureau's American Community Survey, which counts disability from " +
          "2008–2012 on.",
        acsHelp + "\n\nA disability here is serious difficulty with hearing, seeing, concentrating or remembering, walking or " +
          "climbing stairs, dressing or bathing, or, for those 15 and older, doing errands alone. The survey counts it for " +
          "civilians not living in institutions such as nursing homes and prisons, from 2008–2012 on, so 2005–2009 has none.",
        { of: (d) => d.disability_universe, label: "Population not in institutions" }, "The survey counts disability from 2008–2012 on");
      demoPanels.push({ panel: pAge.panel, figure: $("fig-tage"), tip: pAge.tip }, { panel: pRace.panel, figure: $("fig-trace"), tip: pRace.tip },
        { panel: pSex.panel, figure: $("fig-tsex"), tip: pSex.tip }, { panel: pDis.panel, figure: $("fig-tdis"), tip: pDis.tip });
    }

    panels = [
      { panel: p1.panel, figure: $("fig-tspend"), tip: p1.tip },
      { panel: p2.panel, figure: $("fig-trev"), tip: p2.tip },
      ...fiscalPanels,
      ...taxPanels,
      ...debtPanels,
      ...propPanels,
      {
        panel: p3, figure: $("fig-tpop"), tip: popTip,
      },
      ...demoPanels,
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
  // And each chart that can draw trends and a comparison has its Comps and Trends only dials, first in that row, the
  // same place on every chart
  for (const p of Object.keys(hiddenLines) as StackPanel[]) {
    const tools = $(`svg-${p}`).closest("figure.panel")?.querySelector(":scope > .enlarge-tools");
    if (!tools) continue;
    const dial = (label: string, flip: () => void) => {
      const b = dialButton(label);
      b.classList.add("chart-dial");
      b.addEventListener("click", () => {
        if (b.getAttribute("aria-disabled") === "true") return;
        flip();
        askToRemember();
        render();
      });
      return b;
    };
    const comps = dial("Comps", () => (hiddenLines[p].has("cmp") ? hiddenLines[p].delete("cmp") : hiddenLines[p].add("cmp")));
    const trends = dial("Trends only", () => (trendsAlone.has(p) ? trendsAlone.delete(p) : trendsAlone.add(p)));
    const group = document.createElement("span");
    group.className = "chart-dials";
    group.append(comps, trends);
    tools.prepend(group);
    compDials.set(p, comps);
    trendDials.set(p, trends);
  }
  syncDials();
  ["svg-ppe", "svg-sped", "svg-enroll", "svg-ood", "svg-nss", "svg-rev", "svg-tspend", "svg-trev", "svg-tres", "svg-tfc", "svg-tlevy", "svg-tbill",
    "svg-tdebt", "svg-tcap", "svg-tval", "svg-tpar", "svg-teqv", "svg-tpop", "svg-tage", "svg-trace", "svg-tsex", "svg-tdis",
    "svg-nssb", "svg-srace", "svg-sgroups"]
    .forEach((id) => keyboard($(id) as unknown as SVGSVGElement));
  root.classList.remove("is-loading");

  // Redraw at a new width; the root, because the hidden view's panels measure 0
  new ResizeObserver(() => {
    const w = panelBox().clientWidth;
    if (w > 0 && Math.abs(w - lastWidth) > 4) requestAnimationFrame(render);
  }).observe(root);
}
