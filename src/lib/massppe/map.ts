// The Commonwealth tab's map: every city and town, colored by a measure of how it has changed, or
// how the school district that serves it has. Towns that share a district share its color. A
// change is shown on a diverging scale around zero (blue up, orange down, gray near none), a level
// on one blue scale, light to dark; both cut into five classes so a color reads as a range.
// Hovering names the town and its value; a click opens it, or its district, in its own tab.
// Grouped (Group by), each town shows its group's average, a region's or a size's, and a click opens the group.
// Once the measures' years arrive (map-years.json), a change can be measured between any two years,
// and a level shown for any year, or played from the first year to the latest.

import { el, svgEl } from "./dom";
import { enlargeButton } from "./enlarge";
import { asShown, change, count, measured, pct, usd, yearly } from "./format";
import { cagr, linearFit, median, quantile } from "./stats";

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
/** A grouping: each town's (or district's) group of one kind, as the explorer compares it; its groups in order,
 * and whether that order runs one way (by size, income, or density), so one ramp colors them */
interface Grouping { key: string; label: string; ordered: boolean; groups: string[]; of: Record<string, string> }
export interface MapData {
  /** The groupings for each layer, and each group's name, its towns or districts, and its values */
  groupings?: Record<Layer, Grouping[]>;
  /** Each group's name, size and figures; an outlier is a town population group within a region that has too few
   * towns for a comparison, kept on the map rather than moved to the statewide group (#219) */
  groups?: Record<string, { name: string; members?: number | null; v: Record<string, Val>; outlier?: boolean }>;
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
  /** The group averages' */
  groups?: Record<string, Record<string, Arr>>;
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
  /** The parts of About the data it draws on, by id less "about-" (notes.ts) */
  notes?: string[];
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
  /** A long tail above the fifths: a sixth class from this quantile of the values up, so the few towns far above
   * the rest don't share the top color with the many just over the last fifth */
  tail?: number;
  /** Once the years arrive: "range", a change between two years chosen; "year", one year at a time, which
   * can play. Without it, the measure has one year, shown but not chosen. */
  years?: "range" | "year";
  /** Figures every few years (the census's five-year estimates): a year between keeps the one before */
  hold?: boolean;
}
const inDollars = (m: MapData["meta"], real: boolean) => (real ? `in FY${m.latest} dollars, after inflation` : "in nominal dollars, before inflation");
/** What the trend is, for the "?" beside a measure of growth */
const TREND_NOTE = "The trend is the straight line that best fits every year's value. Its growth is the yearly rate that " +
  "carries the line from its first year to its last. Because the line weighs every year, an unusual first or last year " +
  "moves it less than it would move growth measured from the first year's value to the last year's, and the line " +
  "doesn't always start on the first year's value.";

// The figures as format.ts writes them (#237): growth and changes signed to a tenth of a percent, shares to a tenth,
// dollars whole, density to a tenth under 100. A legend's cut points are round numbers, as an axis's ticks are.
const yearlyShort = (v: number) => change(v);
const share = (v: number) => pct(v);
const money = (v: number) => usd(v, true);
const dollars = (v: number) => usd(v);
const dense = (v: number) => measured(v);
const denseShort = (v: number) => (v < 10 && v % 1 ? v.toFixed(1) : Math.round(v).toLocaleString("en-US"));
const none = () => "";
/** The American Community Survey release a fiscal year's figure comes from: the five years ending the year before */
const acs = (y: Yrs) => `${y.to - 5}–${y.to - 1}`;

const TOWN_MEASURES: Measure[] = [
  {
    key: "ct", label: "Community type", kind: "type", fmt: none, short: none,
    notes: ["community-types"],
    about: () => "The Inner Core is Boston and 15 neighboring cities and towns, as the Metropolitan Area Planning " +
      "Council defines it. The Gateway Cities are the state's other 22 mid-size cities. A rural town has fewer than 500 " +
      "residents per square mile. Every other town counts as suburban and other.",
  },
  {
    key: "density", label: "Population per square mile", kind: "level", fmt: dense, short: denseShort, cuts: [250, 500, 1000, 2500],
    notes: ["community-types"],
    unit: " residents per square mile", years: "year",
    about: (m, real, y) => `Each town's population in July ${y.to - 1}, divided by its land area. A town with fewer than 500 ` +
      "residents per square mile counts as rural.",
  },
  {
    key: "spend", label: "Spending per resident, yearly growth", kind: "change", fmt: yearly, short: yearlyShort, dollars: true,
    notes: ["town-budgets"],
    subject: "spending per resident", years: "range",
    about: (m, real, y) => `How fast each town's general fund spending per resident grew each year on trend, from FY${y.from} ` +
      `to FY${y.to}, ${inDollars(m, real)}.`,
  },
  {
    key: "edu", label: "Education's share of spending", kind: "level", fmt: share, short: share, years: "year",
    notes: ["town-budgets", "town-and-school-budgets-overlap-without-lining-up"],
    about: (m, real, y) => `The share of each town's general fund spending in FY${y.to} that went to education: its own ` +
      "school department and what it paid regional and vocational school districts.",
  },
  {
    key: "pop", label: "Population change", kind: "change", fmt: change, short: change, subject: "population", years: "range",
    notes: ["population-estimates"],
    about: (m, real, y) => `How much each town's population changed from July ${y.from - 1} to July ${y.to - 1}.`,
  },
  {
    key: "unemp", label: "Unemployment rate", kind: "level", fmt: share, short: share, years: "year",
    notes: ["labor-force"],
    about: (m, real, y) => `The share of each town's labor force out of work in ${y.to - 1}, the state's average for the year. ` +
      "The figures end with 2022, which the map shows at FY2023.",
  },
  {
    key: "eqv", label: "Property value per resident, yearly growth", kind: "change", fmt: yearly, short: yearlyShort, dollars: true,
    notes: ["equalized-valuation-eqv"],
    subject: "property value per resident", years: "range",
    about: (m, real, y) => "How fast each town's equalized property value per resident grew each year on trend, from " +
      `FY${y.from} to FY${y.to}, ${inDollars(m, real)}. The state sets equalized values every other year.`,
  },
  {
    key: "income", label: "Income per resident", kind: "level", fmt: dollars, short: dollars, fifths: "towns",
    notes: ["income-fifths"],
    about: (m) => `Each town's residents' income for the Chapter 70 formula, from ${m.fifths.year} state tax returns, ` +
      `divided by its population in July ${m.fifths.year}. The five colors are the income fifths, 70 or 71 towns each.`,
  },
  {
    key: "levy_room", label: "Room under the levy limit", kind: "level", fmt: share, short: share, years: "year",
    notes: ["the-property-tax-levy"],
    about: (m, real, y) => `Each town's unused levy capacity in FY${y.to}, as a share of its Proposition 2½ levy limit. The ` +
      "lightest towns are taxing at or near their limit.",
  },
  {
    key: "override", label: "Override capacity", kind: "level", fmt: share, short: share, years: "year",
    notes: ["the-property-tax-levy"],
    about: (m, real, y) => `Each town's override capacity in FY${y.to}: the room between its Proposition 2½ levy limit and its ` +
      "levy ceiling, 2½% of its assessed value, as a share of the ceiling. The darkest towns could raise the most with an override.",
  },
  {
    key: "reserves", label: "Reserves as a share of the budget", kind: "level", fmt: share, short: share, years: "year",
    notes: ["reserves"],
    about: (m, real, y) => `Each town's free cash and stabilization funds at the end of FY${y.to}, as a share of its operating ` +
      "budget: the revenue its budget raises, without enterprise or Community Preservation Act funds.",
  },
  {
    key: "debt_service", label: "Debt service as a share of the budget", kind: "level", fmt: share, short: share, years: "year",
    notes: ["long-term-debt"],
    about: (m, real, y) => `What each town's general fund paid in FY${y.to} on its long-term debt, principal and interest, as a ` +
      "share of its operating budget.",
  },
  {
    key: "bill_income", label: "Single-family tax bill as a share of income", kind: "level", fmt: share, short: share, years: "year",
    notes: ["property"],
    tail: 0.95,
    about: (m, real, y) => `The average single-family tax bill in FY${y.to}, as a share of income per capita. College towns run ` +
      "high because their students count as residents but report little income.",
  },
  {
    key: "older", hold: true, label: "Population 65 and older", kind: "level", fmt: share, short: share, years: "year",
    notes: ["population-by-age-race-and-ethnicity"],
    about: (m, real, y) => `The share of each town's residents 65 and older, in the Census Bureau's American Community Survey ` +
      `estimates for ${acs(y)}, shown at FY${y.to}.`,
  },
  {
    key: "poc", hold: true, label: "Population of color", kind: "level", fmt: share, short: share, years: "year",
    notes: ["population-by-age-race-and-ethnicity"],
    about: (m, real, y) => "The share of each town's residents who are Hispanic or Latino, or of a race other than white, " +
      `in the Census Bureau's American Community Survey estimates for ${acs(y)}, shown at FY${y.to}.`,
  },
  {
    key: "disability", hold: true, label: "Population with a disability", kind: "level", fmt: share, short: share, years: "year",
    notes: ["population-by-age-race-and-ethnicity"],
    about: (m, real, y) => "The share of each town's residents with a disability, of those not living in institutions such " +
      `as nursing homes, in the Census Bureau's American Community Survey estimates for ${acs(y)}, shown at FY${y.to}. The ` +
      "survey counts disability from 2008–2012 on.",
  },
  {
    key: "debt_pc", label: "Long-term debt per resident", kind: "level", fmt: dollars, short: dollars, years: "year", tail: 0.95,
    notes: ["long-term-debt"],
    about: (m, real, y) => `Each town's long-term debt outstanding at the end of FY${y.to}, per resident, in nominal dollars.`,
  },
  {
    key: "overrides", label: "Prop 2½ overrides passed since FY2005", kind: "level", fmt: count,
    notes: ["proposition-2-votes"],
    short: count, cuts: [0, 1, 3, 6], over: true,
    classes: ["None", "One", "Two or three", "Four to six", "Seven or more"],
    about: (m) => "How many Proposition 2½ overrides each town's voters passed from FY2005 on, as the Division of Local " +
      `Services records them; debt and capital exclusions aren't counted.`,
  },
  {
    key: "cap_hh", label: "The 82.5% cap: change per household with no cap", kind: "change", fmt: money, short: money, years: "year",
    notes: ["equalized-valuation-eqv"],
    about: (m, real, y) => `How much more or less each town would be asked to pay toward its schools in FY${y.to} with no cap, ` +
      "per household, keeping that year's statewide total. The cap saves the blue towns money and costs the orange towns money.",
    split: (up, down, n) => `With no cap, ${up} of ${n} towns would be asked for more and the other ${down} would be asked for less.`,
  },
];

const DISTRICT_MEASURES: Measure[] = [
  {
    key: "ct", label: "Community type", kind: "type", fmt: none, short: none,
    notes: ["community-types"],
    about: () => "A district is rural if it has 35 or fewer students per square mile, the test DESE uses for rural school " +
      "aid. Inner Core districts are the school districts of Boston and its 15 neighbors. Gateway City districts are the " +
      "school districts of the other 22 Gateway Cities. Every other district counts as suburban and other.",
  },
  {
    key: "density", label: "Students per square mile", kind: "level", fmt: dense, short: denseShort, cuts: [11, 21, 35, 200],
    notes: ["community-types"],
    over: true, classes: ["11 or fewer (rural, tier 1)", "Over 11 to 21 (rural, tier 2)", "Over 21 to 35 (rural, tier 3)",
      "Over 35 to 200", "Over 200"],
    unit: " students per square mile", years: "year",
    about: (m, real, y) => `Each district's FY${y.to} foundation enrollment, divided by the land area of its towns. DESE ` +
      "counts a district with 35 or fewer students per square mile as rural.",
  },
  {
    key: "ppe", label: "Spending per pupil, yearly growth", kind: "change", fmt: yearly, short: yearlyShort, dollars: true,
    notes: ["spending-per-pupil"],
    subject: "spending per pupil", years: "range",
    about: (m, real, y) => `How fast each district's in-district spending per pupil grew each year on trend, from FY${y.from} ` +
      `to FY${y.to}, ${inDollars(m, real)}.`,
  },
  {
    key: "enroll", label: "Enrollment change", kind: "change", fmt: change, short: change, subject: "enrollment", years: "range",
    notes: ["enrollment"],
    about: (m, real, y) => `How much each district's in-district enrollment changed from FY${y.from} to FY${y.to}.`,
  },
  {
    key: "income", label: "Income per resident of its towns", kind: "level", fmt: dollars, short: dollars, fifths: "districts",
    notes: ["income-fifths"],
    about: (m) => `The combined income of each district's towns for the Chapter 70 formula, from ${m.fifths.year} state ` +
      `tax returns, divided by their combined population. The five colors are the districts' income fifths.`,
  },
  {
    key: "above", label: "Local contribution above required", kind: "level", fmt: share, short: share, years: "year",
    notes: ["chapter-70-aid-and-net-school-spending"],
    about: (m, real, y) => `How far each district's actual net school spending in FY${y.to} ran above the state's required ` +
      "minimum, as a share of that minimum.",
  },
  {
    key: "aid", label: "Chapter 70 aid's share of required spending", kind: "level", fmt: share, short: share, years: "year",
    notes: ["chapter-70-aid-and-net-school-spending"],
    about: (m, real, y) => `The share of each district's required spending in FY${y.to} that Chapter 70 aid covers. The ` +
      "district's towns pay the rest.",
  },
  {
    key: "gap", label: "Actual vs. budget", kind: "change", fmt: change, short: change, years: "year",
    notes: ["budgets"],
    // Fixed cuts, the same every year, with a class past 5% either way (#223)
    cuts: [-0.05, -0.02, -0.005, 0.005, 0.02, 0.05],
    classes: ["Below −5.0%", "−5.0% to −2.0%", "−2.0% to −0.5%", "−0.5% to +0.5%", "+0.5% to +2.0%", "+2.0% to +5.0%", "+5.0% and up"],
    about: (m, real, y) => `How far each district's net school spending in FY${y.to} came from the budget it reported to DESE, ` +
      "as a share of that budget: orange districts spent less than they budgeted, blue more, and gray within half a " +
      "percent either way. Budgets begin with FY2011.",
    split: (up, down, n) => `${up} of ${n} districts spent more than they budgeted, and ${down} spent less.`,
  },
  {
    key: "sped_share", label: "Special education's share of spending", kind: "level", fmt: share, short: share, years: "year",
    notes: ["special-education"],
    about: (m, real, y) => `Special education's share of each district's spending in FY${y.to}, from DESE's RADAR figures: ` +
      "teaching, services, tuition elsewhere, and transportation.",
  },
  {
    key: "swd", label: "Students with disabilities", kind: "level", fmt: share, short: share, years: "year",
    notes: ["students"],
    about: (m, real, y) => `The share of each district's students with disabilities, those with an Individualized Education ` +
      `Program, on October 1, ${y.to - 1} (FY${y.to}).`,
  },
  {
    key: "el", label: "English learners", kind: "level", fmt: share, short: share, years: "year",
    notes: ["students"],
    about: (m, real, y) => `The share of each district's students who are English learners, on October 1, ${y.to - 1} (FY${y.to}).`,
  },
  {
    key: "low_income", label: "Low-income students", kind: "level", fmt: share, short: share, years: "year",
    notes: ["students"],
    about: (m, real, y) => `The share of each district's students who are low income, on October 1, ${y.to - 1} (FY${y.to}), by ` +
      "the measure DESE has counted since FY2022; its earlier measures don't compare.",
  },
  {
    key: "high_needs", label: "Students with high needs", kind: "level", fmt: share, short: share, years: "year",
    notes: ["students"],
    about: (m, real, y) => `The share of each district's students with high needs on October 1, ${y.to - 1} (FY${y.to}): those ` +
      "with a disability, English learners now or recently, or low income, each counted once. It shifts when low income's " +
      "measure does, in FY2015 and FY2022.",
  },
  {
    key: "soc", label: "Students of color", kind: "level", fmt: share, short: share, years: "year",
    notes: ["students"],
    about: (m, real, y) => "The share of each district's students who are Hispanic or Latino, or of a race other than white, " +
      `on October 1, ${y.to - 1} (FY${y.to}).`,
  },
];
/** "Western MA towns": a group's name. The explorer names its comparisons for their averages; on the map a group is
 * its towns or districts. */
const groupName = (n: string) => n.replace(/,? average\b/, "").replace(/ average,/, ",");
/** A group's name, short, for the groups' table under the map: "Lowest income fifth", "Western MA", "Tiny",
 * "1,000–2,499", "Rural" */
const shortGroup = (n: string) => groupName(n).replace(/ (enrollment|peer) group\b/, "").replace(/^Statewide /, "")
  .replace(/ (towns|districts)$/, "").replace(/^(Towns|Districts) in the (\w)/, (_, _w, c: string) => c.toUpperCase())
  .replace(/^Towns of /, "").replace(/^Towns under /, "Under ");
// The measure menu's groups, in order
const GROUPS: Record<Layer, [string, string[]][]> = {
  towns: [
    ["Place and people", ["ct", "density", "pop", "income", "unemp", "older", "poc", "disability"]],
    ["Town finances", ["spend", "edu", "eqv", "levy_room", "override", "overrides", "reserves", "debt_service", "debt_pc", "bill_income"]],
    ["Schools", ["cap_hh"]],
  ],
  districts: [
    ["Place", ["ct", "density", "income"]],
    ["Spending", ["ppe", "above", "aid", "gap", "sped_share"]],
    ["Students", ["enroll", "swd", "el", "low_income", "high_needs", "soc"]],
  ],
};

// Five classes. Change: orange for down, gray near zero, blue for up, as elsewhere in the explorer.
// Level: the palette's blue ramp, light to dark.
const DIVERGING = ["#c2541f", "#f2a77f", "#e9e6df", "#86b6ef", "#1c5cab"];
// Seven steps, for a change with fixed cuts and a class past each end (Actual vs. budget, #223): each half a
// one-hue ramp that passes the dataviz validator's ordinal checks, neighbors ΔE 18 or more (16 under CVD)
const DIVERGING7 = ["#7a2c0c", "#c2541f", "#ee9d70", "#e9e6df", "#86b6ef", "#3279d2", "#0c3266"];
const SEQUENTIAL = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"];
// Six steps of the same blue, for a measure with a sixth class on its tail
const SEQUENTIAL6 = ["#cde2fb", "#97c0f1", "#5f9de7", "#3279d2", "#1b55a0", "#0c3266"];
// The groups themselves, each grouping in its own palette and none in the measures' blue, so a map of groups
// doesn't pass for a map of values: regions in the palette's fixed order of hues, less its blue (checked with the
// dataviz palette check; the key, the tooltip and the table name each); size in greens, community type in
// purples, income in ambers, each light to dark (smallest, least dense, lowest first); size within a region in its
// region's hue, light to dark by size
const GROUP_HUES = ["#eb6834", "#1baf7a", "#6250d6", "#eda100", "#e87ba4", "#00897b", "#008300", "#e34948"];
const GREENS = ["#d9f2e3", "#a3dfbd", "#62c492", "#2e9e66", "#16744a", "#0a4a2f"];
const PURPLES = ["#ddd6f7", "#a99bec", "#7461d6", "#43309e"];
const AMBERS = ["#fde9c9", "#f8c27a", "#ec9431", "#c26a12", "#7f430a"];
// School districts, from no district of its own to its own for every grade: roses, light to dark
const ROSES = ["#f2bcb4", "#e58b7e", "#cf5a49", "#8f2c20"];
// A group a grouping within regions falls back to, statewide, where a region has too few of its size: gray
const STATEWIDE_HUE = "#8f8a7f";
/** n steps of a ramp, spread across it */
const steps = (ramp: string[], n: number) => Array.from({ length: n }, (_, k) => ramp[n < 2 ? ramp.length - 1 : Math.round((k * (ramp.length - 1)) / (n - 1))]);
/** A color moved toward another, by t from 0 to 1 */
function mix(a: string, b: string, t: number) {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, "0")).join("")}`;
}
/** A hue's step k of n, light to dark: the lightest well toward white, the darkest a little toward black */
const shade = (hex: string, k: number, n: number) => ((f) => (f <= 0.6 ? mix(hex, "#ffffff", 0.72 * (1 - f / 0.6))
  : mix(hex, "#000000", 0.4 * ((f - 0.6) / 0.4))))(n > 1 ? k / (n - 1) : 0.6);
// A grouping within regions: its region's grouping, and its size grouping, for the outline and the colors
const WITHIN: Record<string, { region: string; size: string }> = { peer: { region: "region", size: "peer_state" },
  cohort: { region: "region", size: "cohort_state" } };
// The region outline on hover: the page's accent red, apart from the black of the group's
const RING_COLOR = "#d35545";
// No value: hatched, so it can't pass for the gray near zero (the pattern is in each map's defs)
const NO_DATA = "url(#map-nodata)";
// A group of towns defined by what they lack, the towns with no school district of their own: hatched as no data
// is, but a group like any other, with its key entry, its count and its figures (Tim, #218). Its own pattern, so
// the code that finds the towns with no data or no group passes it by.
const HATCHED_GROUPS = new Set(["towns-schools-none"]);
const HATCH = "url(#map-hatch)";
/** How long each year stays on the map as it plays */
const PLAY_MS = 900;

/** A round number near x: 1, 1.5, 2, 2.5, 3 or 5 times a power of ten */
function nice(x: number) {
  if (!(x > 0)) return 0;
  const p = 10 ** Math.floor(Math.log10(x));
  return [1, 1.5, 2, 2.5, 3, 5, 10].map((m) => m * p).reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
}
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
// Each class runs from its cut up to the next, [a, b): a figure shown equal to a cut takes the class above it. The
// cuts carry float error (1.5 × 10⁻¹ is 0.15000000000000002), so the test allows a hair under.
const classOf = (v: number, c: number[]) => c.filter((x) => v >= x - 1e-9).length;

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


/**
 * real and setReal: the explorer's Dollars choice, which the map shares; refresh() redraws it when
 * that choice changes elsewhere; setSeries() hands it the measures' years when they arrive.
 */
/** The measures on each layer, for About the data's links back to them (#227) */
export const MAP_MEASURES: Record<Layer, readonly Measure[]> = { towns: TOWN_MEASURES, districts: DISTRICT_MEASURES };

export function startMap(root: HTMLElement, data: MapData, opts: {
  openTown: (id: string) => void; openDistrict: (id: string) => void; real: () => boolean; setReal: (real: boolean) => void;
  /** "About the data:" and the parts named, linked */
  about: (parts: string[]) => HTMLElement | null;
}) {
  const { meta } = data;
  let layer: Layer = "districts";
  let grades: Grades = "all";
  let townKey = TOWN_MEASURES[0].key;
  let districtKey = "above";
  let S: MapSeries | null = null;
  /** The grouping each layer shows, by key; "" for each town or district alone */
  const groupBy: Record<Layer, string> = { towns: "", districts: "" };
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
  // The first year at the track's left (#222): a span's, or the scale's for one year; the last, or the year, at its right
  const yearFrom = el("output", "map-years-from");
  const yearOut = el("output", "map-years-out");
  const play = el("button", "map-play");
  play.type = "button";
  yearBox.append(yearLabel, yearFrom, track, yearOut, play);
  const groupWrap = el("label", "map-measure map-group");
  const groupSel = el("select");
  groupWrap.append(el("span", undefined, "Group by"), groupSel);
  groupSel.addEventListener("change", () => {
    groupBy[layer] = groupSel.value;
    // A grouping picked shows its groups first; a measure picked after colors them by their averages
    if (groupSel.value) {
      if (layer === "towns") townKey = "group";
      else districtKey = "group";
    }
    stop();
    draw();
  });
  // Three rows, the same on either layer: what the map colors (and, for districts, which grades), then how it groups
  // and what it measures, then dollars; the years, when a measure has them, under all three
  const rowEnd = () => el("span", "map-controls-break");
  controls.append(layerSeg.box, gradeSeg.box, rowEnd(), groupWrap, measureWrap, rowEnd(), dollarSeg.box, yearBox);
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
  const svg = svgEl("svg");
  svg.setAttribute("class", "map-svg");
  svg.setAttribute("viewBox", `0 0 ${meta.width} ${meta.height}`);
  svg.setAttribute("role", "img");
  const defs = svgEl("defs");
  defs.innerHTML = ["map-nodata", "map-hatch"].map((id) => `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse" ` +
    'patternTransform="rotate(45)"><rect width="8" height="8" fill="#f4f1e8"/><line x1="0" y1="0" x2="0" y2="8" stroke="#bdb7aa" ' +
    'stroke-width="3"/></pattern>').join("");
  const shapes = svgEl("g");
  shapes.setAttribute("class", "map-shapes");
  // The hovered group's region, within a grouping by region: a red line around its outside edge (each town's
  // outline, drawn wide, and masked off inside the region, leaves only the edge)
  const ring = svgEl("g");
  ring.setAttribute("class", "map-ring");
  ring.setAttribute("mask", "url(#map-ring-mask)");
  const ringMask = svgEl("mask");
  ringMask.id = "map-ring-mask";
  ringMask.setAttribute("maskUnits", "userSpaceOnUse");
  defs.append(ringMask);
  const lift = svgEl("g");  // the hovered town, or district, drawn on top
  svg.append(defs, shapes, ring, lift);
  function showRing(towns: MapTown[]) {
    ring.replaceChildren();
    ringMask.replaceChildren();
    if (!towns.length) return;
    const all = svgEl("rect");
    for (const [k, v] of Object.entries({ x: -20, y: -20, width: meta.width + 40, height: meta.height + 40, fill: "#fff" })) all.setAttribute(k, String(v));
    ringMask.append(all);
    for (const t of towns) {
      const inside = svgEl("path");
      inside.setAttribute("d", t.d);
      inside.setAttribute("fill", "#000");
      ringMask.append(inside);
      const edge = svgEl("path");
      edge.setAttribute("d", t.d);
      edge.setAttribute("stroke", RING_COLOR);
      ring.append(edge);
    }
  }
  const tip = el("div", "map-tip");
  tip.hidden = true;
  // Grouped, the groups' figures, in a table where the state leaves room under its western half (on a narrow
  // screen, under the map)
  const stage = el("div", "map-stage");
  const groupTable = el("div", "map-gtable");
  groupTable.hidden = true;
  stage.append(svg, groupTable);
  figure.append(legend, stage, tip);
  const tableBox = el("details", "map-table");
  const tableSum = el("summary");
  const tableHolder = el("div", "table-scroll");
  tableBox.append(tableSum, tableHolder);
  const src = el("p", "map-source");
  // After the outlines, the parts of About the data the measure draws on, set as it's drawn
  const srcAbout = el("span");
  src.append("Outlines: the Census Bureau's ", Object.assign(el("a", undefined, "cartographic boundary file"), { href: meta.outlines }),
    " of county subdivisions. ", srcAbout);
  // Enlarge takes the controls, the measure's name and the map, not the text and table around them
  const mapBox = el("div", "map-box");
  mapBox.append(enlargeButton(mapBox), controls, fold, figure);
  section.append(head, mapBox, tableBox, src);
  root.replaceChildren(section);

  // One path per town, made once; each draw only recolors them
  const paths = new Map<string, SVGPathElement>();
  for (const t of data.towns) {
    const p = svgEl("path");
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
  /** The least-squares line's yearly growth from its first year to its last, between lo and hi; none where the line
   * starts or ends at or below zero, as the pipeline rules for the figures in map.json */
  function trendOn(a: Arr, lo: number, hi: number): Val | null {
    const fit = linearFit(S!.years.map((_, i) => (i < lo || i > hi ? null : get(a, i))));
    const at = fit.flatMap((v, i) => (v == null ? [] : [i]));
    if (!at.length) return null;
    const [a0, b0] = [at[0], at[at.length - 1]];
    const g = cagr(fit[a0], fit[b0], b0 - a0);
    return g == null ? null : [round(g, 5), S!.years[a0], S!.years[b0]];
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
    if (v != null) return [v, y.to];
    // A census figure holds until the next release: the latest at or before the year, with its own year
    if (m.hold) for (let k = i - 1; k >= 0; k--) {
      const x = get(row[m.key], k);
      if (x != null) return [x, S!.years[k]];
    }
    return null;
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
    if (m.years === "year") {
      // A share of the students or of spending, each district's weighted by the town's pupils in it
      const i = yi(y.to);
      const a = get(r1[m.key], i);
      const b = get(r2[m.key], i);
      return a == null || b == null ? null : [round((w1 * a + w2 * b) / (w1 + w2), 4), y.to];
    }
    return null;
  }
  /** The grouping shown on this layer, if any */
  const groupingNow = () => (data.groupings?.[layer] ?? []).find((g) => g.key === groupBy[layer]) ?? null;
  /** The rows a layer's colors come from: its towns' or districts', or its groups' */
  const rowsOf = (onTowns: boolean): Record<string, Record<string, Arr>>[] => {
    const g = groupingNow();
    if (g) return g.groups.map((id) => ({ [id]: S?.groups?.[id] ?? {} }));
    return [onTowns ? S!.towns : S!.districts];
  };
  /** The years a measure has on this layer, first to last */
  function yearsOf(m: Measure, onTowns: boolean): number[] {
    if (!S || !m.years) return [];
    let lo = Infinity;
    let hi = -1;
    for (const row of rowsOf(onTowns).flatMap((r) => Object.values(r))) {
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
  const measureNow = () => (layer === "towns" ? TOWN_MEASURES.find((m) => m.key === townKey) ?? TOWN_MEASURES[0]
    : DISTRICT_MEASURES.find((m) => m.key === districtKey) ?? DISTRICT_MEASURES[0]);

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
      yearFrom.hidden = true;
      yearOut.textContent = m.fifths ? `${meta.fifths.year} tax returns` : "";
      return;
    }
    yearFrom.hidden = ys.length < 2;
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
    yearFrom.textContent = `FY${m.years === "range" ? y!.from : ys[0]}`;
    yearFrom.classList.toggle("is-scale", m.years !== "range");
    yearOut.textContent = `FY${y!.to}`;
    play.setAttribute("aria-label", `${timer ? "Pause" : "Play"} the years, FY${ys[0]} to FY${ys[ys.length - 1]}`);
  }

  // What a town shows: its own value, or its district's
  let current: { measure: Measure; districtOf: (t: MapTown) => string | null; value: (t: MapTown) => Val | null; c: number[];
    combinedAt: (t: MapTown) => boolean; kindOf?: (t: MapTown) => Kind | null; groupOf?: (t: MapTown) => string | null;
    regionOf?: (t: MapTown) => string | null; statewide?: (g: string) => boolean } | null = null;

  function draw() {
    const onTowns = layer === "towns";
    layerSeg.set(layer);
    gradeSeg.set(grades);
    gradeSeg.box.hidden = onTowns;
    // Group by: each town or district alone, or a grouping, whose groups' averages color the towns
    const gs = data.groupings?.[layer] ?? [];
    groupWrap.hidden = !gs.length;
    groupSel.replaceChildren(new Option(onTowns ? "Each town alone" : "Each district alone", ""), ...gs.map((g) => new Option(g.label, g.key)));
    if (!gs.some((g) => g.key === groupBy[layer])) groupBy[layer] = "";
    groupSel.value = groupBy[layer];
    const grouping = groupingNow();
    // A grouping within regions: the region each group sits in, outlined on hover
    const within = grouping ? WITHIN[grouping.key] : undefined;
    // Grouped, the measures figured for the groups' averages (not those for one town alone, such as density), and
    // the groups themselves where there are few enough to color apart
    const forGroups = (m: Measure) => m.kind === "type" || grouping!.groups.some((g) => data.groups?.[g]?.v[m.key] != null);
    // A grouping within regions colors its many groups by region and size, so it shows them too
    const showsGroups = !!grouping && (grouping.groups.length <= 8 || !!within);
    const list = onTowns ? TOWN_MEASURES : DISTRICT_MEASURES;
    measureSel.replaceChildren(...(showsGroups ? [(() => {
      const g = document.createElement("optgroup");
      g.label = "Groups";
      g.append(new Option(`Each ${onTowns ? "town" : "district"}'s group`, "group"));
      return g;
    })()] : []), ...GROUPS[layer].map(([name, keys]) => {
      const g = document.createElement("optgroup");
      g.label = name;
      g.append(...keys.map((k) => list.find((m) => m.key === k)).filter((m): m is Measure => !!m).map((m) => {
        const o = new Option(m.label, m.key);
        o.disabled = !!grouping && !forGroups(m);
        return o;
      }));
      return g;
    }));
    // A measure the grouping can't show gives way to the groups themselves, or the first it can
    const keyNow = onTowns ? townKey : districtKey;
    const usable = (k: string) => (k === "group" ? showsGroups : !grouping || forGroups(list.find((m) => m.key === k) ?? list[0]));
    const key = usable(keyNow) ? keyNow : showsGroups ? "group" : list.find((m) => !grouping || forGroups(m))!.key;
    if (onTowns) townKey = key;
    else districtKey = key;
    measureSel.value = key;
    const notes = list.find((m) => m.key === key)?.notes;
    srcAbout.replaceChildren((notes && opts.about(notes)) || "Data: the explorer's own, as the Data tab describes.");
    // All grades: a town with one district takes it; a town split between two takes the two combined
    const combinedAt = (t: MapTown) => !onTowns && grades === "all" && !!t.elem && t.elem !== t.high;
    const districtOf = (t: MapTown) => (onTowns || combinedAt(t) ? null : grades === "high" ? t.high : t.elem);
    /** A town's group: its own, or its district's. A town split between two districts takes the group of the one
     * for its younger grades, usually its own, as that district's page does: Shutesbury, Pelham and Leverett are
     * all tiny, where taking the district that teaches more of a town's pupils put two of the three in Amherst-
     * Pelham's medium group on a few pupils' difference (#234). */
    const inGrouping = (g: Grouping, t: MapTown): string | null => {
      if (onTowns) return g.of[t.id] ?? null;
      const d = combinedAt(t) ? t.elem : districtOf(t);
      return d ? g.of[d] ?? null : null;
    };
    const groupOf = (t: MapTown): string | null => (grouping ? inGrouping(grouping, t) : null);
    const regions = within ? gs.find((g) => g.key === within.region) ?? null : null;
    const regionOf = regions ? (t: MapTown) => inGrouping(regions, t) : undefined;
    // Its statewide groups, where a region had too few of a size: no region to outline
    const sizeGroups = within ? gs.find((g) => g.key === within.size) ?? null : null;
    const statewide = (id: string) => !!sizeGroups?.groups.includes(id);
    // A pin holds while the groups themselves show
    // A pin holds while the map shows what it was pinned on: the same layer, grouping and measure
    view = `${layer}:${groupBy[layer]}:${key}`;
    if (pinned && pinnedIn !== view) pinned = null;
    drawGroupTable(null);
    if (key === "group") {
      const sizes = within ? gs.find((g) => g.key === within.size) ?? null : null;
      drawGroups(grouping!, onTowns, groupOf, districtOf, combinedAt, regionOf, regions, sizes ? (t: MapTown) => inGrouping(sizes, t) : undefined,
        sizes);
      return;
    }
    const measure = list.find((m) => m.key === key)!;
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
    /** A group's value: its average's, over the years chosen, or as map.json has it */
    const groupVal = (g: string, after: boolean, yy: Yrs | null): Val | null =>
      (bySeries ? fromRow(measure, S!.groups?.[g], yy!, after) : inMode(data.groups?.[g]?.v[measure.key], after));
    const valueAt = (t: MapTown, after: boolean, yy: Yrs | null): Val | null => {
      if (!grouping) return valueIn(t, after, yy);
      const g = groupOf(t);
      return g ? groupVal(g, after, yy) : null;
    };
    const value = (t: MapTown) => valueAt(t, real, y);
    // Community type: each town its own, or its district's (a town split between two takes its own district's)
    if (measure.kind === "type") {
      drawTypes(measure, onTowns, (t) => (onTowns ? t.ct ?? null
        : data.districts[(combinedAt(t) ? t.elem : districtOf(t)) ?? ""]?.ct ?? null), districtOf, combinedAt);
      if (grouping) Object.assign(current!, { groupOf, regionOf, statewide });
      return;
    }
    // Each district counts once, however many towns it covers; with all grades, each town counts. Grouped, each
    // group counts once.
    const byTown = !grouping && (onTowns || grades === "all");
    const shownDistricts = [...new Set(data.towns.map(districtOf).filter((d): d is string => !!d))];
    const shownGroups = grouping ? [...new Set(data.towns.map(groupOf).filter((g): g is string => !!g))] : [];
    const unitsIn = (after: boolean, yy: Yrs | null) => (grouping ? shownGroups.map((g) => groupVal(g, after, yy)).filter(Boolean) as Val[]
      : byTown ? data.towns.map((t) => valueIn(t, after, yy)).filter(Boolean) as Val[]
      : shownDistricts.map((d) => districtVal(d, after, yy)).filter(Boolean) as Val[]);
    const units = unitsIn(real, y);
    const values = units.map((u) => u[0]);
    // A level's classes are cut on every year's values together, so a color holds one range in every year and a
    // town that changes color as the years play has moved between ranges. Growth in dollars: the classes are
    // cut on its values before and after inflation together, so both share one set of ranges and the Dollars
    // switch moves towns between them, as inflation would.
    const pooled = bySeries && measure.years === "year" ? ys.flatMap((yr) => unitsIn(real, { from: yr, to: yr }).map((u) => u[0])) : values;
    const base = (measure.fifths ? meta.fifths[measure.fifths] : null) ?? measure.cuts
      ?? (measure.dollars ? growthCuts([...unitsIn(true, y), ...unitsIn(false, y)].map((u) => u[0])) : cuts(measure.kind, pooled));
    const tailCut = measure.tail ? Number(quantile(pooled, measure.tail).toPrecision(2)) : null;
    const c = tailCut != null && tailCut > base[base.length - 1] ? [...base, tailCut] : base;
    const classOfV = (raw: number) => {
      const v = asShown(measure.fmt, raw);
      return measure.over ? c.filter((x) => v > x + 1e-9).length : classOf(v, c);
    };
    const colors = measure.dollars ? GROWTH : measure.kind === "change" ? (c.length === 6 ? DIVERGING7 : DIVERGING)
      : c.length === 5 ? SEQUENTIAL6 : SEQUENTIAL;
    current = { measure, districtOf, value, c, combinedAt, groupOf, regionOf, statewide };
    let none = 0;
    for (const t of data.towns) {
      const v = value(t);
      if (!v) none++;
      paths.get(t.id)!.setAttribute("fill", v ? colors[classOfV(v[0])] : NO_DATA);
    }

    // What it shows, and how the towns or districts split
    const what = grouping ? "groups" : byTown ? "towns" : "districts";
    measureTitle.textContent = measure.label;
    const yy = y ?? { from: meta.start, to: measure.key === "cap_hh" ? meta.cap_fy : meta.latest };
    // A census figure held between releases: the words name the release it comes from
    const release = measure.hold && y ? Math.max(...units.map((u) => u[1]).filter((x) => x <= y.to), -Infinity) : -Infinity;
    about.replaceChildren(measure.about(meta, real, release > 0 ? { from: release, to: release } : yy));
    if (measure.hold && y && release > 0 && release < y.to) about.append(` FY${y.to} keeps that release's figures until the next.`);
    if (measure.dollars) about.append(" ", trendHelp());
    const up = values.filter((v) => v > 0).length;
    const n = values.length;
    about.append(" " + (measure.split ? measure.split(up, n - up, n)
      : measure.kind === "change" ? (up === n ? `In all ${n} ${what}, ${measure.subject} grew` : up === 0 ? `In none of the ${n} ${what} did ${measure.subject} grow`
        : `In ${up} of ${n} ${what}, ${measure.subject} grew`) + (measure.dollars && real ? " faster than prices" : "") +
        (up === n || up === 0 ? "." : `; in the other ${n - up}, it did not.`)
      : `The median across ${n} ${what} is ${measure.fmt(median(values))}${measure.unit ?? ""}.`));
    if (bySeries && measure.years === "year" && ys.length > 1) {
      about.append(` Each color covers the same range in every year, FY${ys[0]} to FY${ys[ys.length - 1]}.`);
    }
    if (!onTowns && !grouping) about.append(gradeNote(measure));
    if (grouping) about.append(groupNote(grouping, onTowns));

    // Legend: each class's range, then the gray for none
    const fifthWords = ["Lowest fifth", "Second", "Middle", "Fourth", "Highest fifth"];
    const top = c.length;
    const label = (k: number) => measure.fifths ? `${fifthWords[k]}: ${k === 0 ? `under ${measure.short(c[0])}`
      : k === top ? `${measure.short(c[top - 1])} and up` : `${measure.short(c[k - 1])} to ${measure.short(c[k] - 1)}`}`
      : measure.classes?.[k] ?? (k === 0 ? (measure.dollars ? "Down, below 0%" : `Below ${measure.short(c[0])}`) : k === top
      ? `${measure.short(c[top - 1])} and up` : `${measure.short(c[k - 1])} to ${measure.short(c[k])}`);
    legend.classList.remove("by-region");
    // Each range points out its towns on the map, and pins them, as a group's entry does (#221)
    legend.replaceChildren(...colors.map((col, k) => {
      const li = el("li", "map-group-key");
      li.dataset.class = String(k);
      li.dataset.fill = col;
      li.tabIndex = 0;
      const sw = el("span", "map-swatch");
      sw.style.background = col;
      li.append(sw, el("span", undefined, label(k)));
      pinnable(li, `class:${k}`, () => pointToClass(k));
      return li;
    }), ...(none ? [noneKey(onTowns && !grouping ? "No data" : grouping ? "No group, or no data" : "No district of its own, or no data")] : []));
    if (grouping) {
      const sizes = within ? gs.find((g) => g.key === within.size) ?? null : null;
      drawGroupTable({ g: grouping, measure, value: (g) => groupVal(g, real, y), color: (v) => colors[classOfV(v)], groupOf,
        regions, regionOf, sizes, sizeOf: sizes ? (t) => inGrouping(sizes, t) : undefined });
    }
    const when = y ? (measure.years === "range" ? `, FY${y.from} to FY${y.to}` : `, FY${y.to}`) : "";
    svg.setAttribute("aria-label", `Map of Massachusetts's 351 cities and towns, colored by ${measure.label.toLowerCase()}${when}` +
      (onTowns ? "." : ` of the ${{ elem: "district serving their elementary grades", high: "district serving their secondary grades",
        all: "districts serving all their grades" }[grades]}.`) + " The table below has every value.");

    // The table: highest first
    const rows = grouping
      ? shownGroups.map((g) => ({ name: groupName(data.groups?.[g]?.name ?? g), v: groupVal(g, real, y) })).filter((r): r is { name: string; v: Val } => !!r.v)
      : byTown
      ? data.towns.filter((t) => value(t)).map((t) => ({ name: onTowns || schoolsOf(t) === t.name ? t.name : `${t.name} (${schoolsOf(t)})`,
        v: value(t)! }))
      : shownDistricts.map((d) => ({ name: data.districts[d]?.name ?? d, v: districtVal(d, real, y) }))
        .filter((r): r is { name: string; v: Val } => !!r.v);
    rows.sort((a, b) => b.v[0] - a.v[0]);
    tableSum.textContent = `Every ${what.slice(0, -1)}, highest first`;
    const t = el("table");
    const hr = t.createTHead().insertRow();
    hr.append(el("th", undefined, grouping ? "Group" : onTowns ? "Town" : byTown ? "Town (its districts)" : "District"), el("th", "num", measure.label),
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
  /** The key's words for towns without a group: on the district layer, those with no district (they tuition their
   * pupils elsewhere) say so; otherwise it's a town or district the grouping leaves out, not missing data */
  function noGroup(groupOf: (t: MapTown) => string | null, onTowns: boolean) {
    const loose = data.towns.filter((t) => !groupOf(t));
    return !onTowns && loose.every((t) => !t.elem && !t.high) ? "No school district of its own" : "In no group of this kind";
  }
  /** What each town shows, grouped */
  function groupNote(g: Grouping, onTowns: boolean) {
    const of = onTowns ? "its group" : "its district's group";
    return ` Grouped by ${g.label.toLowerCase()}, each town shows ${of}'s figure: its ${onTowns ? "towns" : "districts"} ` +
      "pooled, as the explorer's comparisons pool them. Point to a town to see its whole group; select it to open the group." +
      (onTowns ? "" : " A town split between two districts takes the group of the one for its younger grades, usually its own.");
  }
  /** The groups themselves: each its color, with how many towns it covers, and the table of towns by group. A
   * grouping within regions colors each group in its region's hue, light to dark by size. */
  function drawGroups(g: Grouping, onTowns: boolean, groupOf: (t: MapTown) => string | null,
    districtOf: (t: MapTown) => string | null, combinedAt: (t: MapTown) => boolean, regionOf?: (t: MapTown) => string | null,
    regions?: Grouping | null, sizeOf?: (t: MapTown) => string | null, sizes?: Grouping | null) {
    const counts = new Map<string, number>();
    const member = new Map<string, MapTown>();
    for (const t of data.towns) {
      const id = groupOf(t);
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
      if (!member.has(id)) member.set(id, t);
    }
    // Where a group sits: its region's place among the regions, its size's among the sizes
    const regionAt = (id: string) => (regions && regionOf ? regions.groups.indexOf(regionOf(member.get(id)!) ?? "") : -1);
    const sizeAt = (id: string) => (sizes && sizeOf ? sizes.groups.indexOf(sizeOf(member.get(id)!) ?? "") : -1);
    const typeKind = (id: string) => KINDS.find((k) => id.endsWith(`type-${k}`));
    // Within regions, a group that's the statewide one (its region had too few of its size) sorts last, in gray
    const statewide = (id: string) => !!regions && !!sizes?.groups.includes(id);
    const lineOf = (id: string) => (statewide(id) ? 999 : regionAt(id));
    // Only the groups with a town on the map: a group of districts that teach no town's grades shown has none
    const present = g.groups.filter((id) => counts.has(id));
    const shown = regions
      ? [...present].sort((a, b) => lineOf(a) - lineOf(b) || sizeAt(a) - sizeAt(b))
      : g.key === "type" ? [...present].sort((a, b) => KINDS.indexOf(typeKind(a)!) - KINDS.indexOf(typeKind(b)!)) : present;
    const ramp = g.key === "type" ? PURPLES : g.key === "fifth" ? AMBERS : g.key === "schools" ? ROSES : GREENS;
    // A hatched group takes no step of the ramp
    const order = (g.key === "type" ? shown : g.groups.filter((id) => counts.has(id))).filter((id) => !HATCHED_GROUPS.has(id));
    const color = (id: string) => (HATCHED_GROUPS.has(id) ? HATCH : regions
      ? shade(statewide(id) ? STATEWIDE_HUE : GROUP_HUES[regionAt(id) % GROUP_HUES.length] ?? STATEWIDE_HUE, sizeAt(id), sizes?.groups.length ?? 1)
      : g.ordered ? steps(ramp, order.length)[order.indexOf(id)] : GROUP_HUES[order.indexOf(id) % GROUP_HUES.length]);
    current = { measure: { key: "group", label: g.label, kind: "type", fmt: () => "", short: () => "", about: () => "" },
      districtOf, value: () => null, c: [], combinedAt, groupOf, regionOf, statewide };
    // The groups have no years, and no dollars
    yearBox.hidden = true;
    dollarSeg.box.classList.add("is-idle");
    dollarSeg.box.querySelectorAll("button").forEach((b) => (b.disabled = true));
    for (const t of data.towns) {
      const id = groupOf(t);
      paths.get(t.id)!.setAttribute("fill", id ? color(id) : NO_DATA);
    }
    measureTitle.textContent = `${onTowns ? "Each town's" : "Each district's"} group: ${g.label.toLowerCase()}`;
    about.replaceChildren(`The groups the explorer compares ${onTowns ? "towns" : "districts"} with, by ` +
      `${g.label.toLowerCase()}: each town takes ${onTowns ? "its own" : "its district's"} group. Point to a group, on the map or ` +
      "in the key, to see all of it; select it in the key to keep it lit and open its page. Select a town to open " +
      `${onTowns ? "it" : "its district"}, and pick a measure to color each group by its figure.`);
    if (regions) about.append(" Each region has its own hue, light to dark from the smallest group to the largest; pointing " +
      "to a town outlines its group in black and its region in red. " + (shown.some((id) => data.groups?.[id]?.outlier)
      ? `A region's group with fewer than three ${onTowns ? "towns" : "districts"} is marked as a regional outlier: the ` +
        `explorer compares those ${onTowns ? "towns" : "districts"} with the statewide group of their size.`
      : `Where a region has too few ${onTowns ? "towns" : "districts"} of a size for a group of its own, they join the ` +
        "statewide group of that size, as the explorer's comparisons do, shown in gray."));
    if (!onTowns) about.append(" A town split between two districts takes the group of the one for its younger grades, usually its own.");
    // The key: each group, which points out its towns on the map. Within regions, each region a line of its own,
    // a hairline between, and no more room than a wrapped line takes
    legend.classList.toggle("by-region", !!regions);
    const rule = () => {
      const li = el("li", "map-legend-break");
      li.setAttribute("aria-hidden", "true");
      return li;
    };
    // Within regions, each line starts with its region's name, once, and its entries are the sizes alone
    const regionName = (id: string) => (statewide(id) ? "Statewide"
      : ((r) => (r ? shortGroup(data.groups?.[r]?.name ?? r) : ""))(regionOf?.(member.get(id)!) ?? null));
    const sizeName = (id: string) => ((sz) => (sz ? shortGroup(data.groups?.[sz]?.name ?? sz) : null))(sizeOf?.(member.get(id)!) ?? null);
    const head = (id: string) => {
      const li = el("li", "map-legend-region", regionName(id));
      return li;
    };
    legend.replaceChildren(...shown.flatMap((id, k) => [...(regions && k && lineOf(id) !== lineOf(shown[k - 1]) ? [rule()] : []),
      ...(regions && (!k || lineOf(id) !== lineOf(shown[k - 1])) ? [head(id)] : []), (() => {
      const li = el("li", "map-group-key");
      li.dataset.group = id;
      li.tabIndex = 0;
      const sw = el("span", HATCHED_GROUPS.has(id) ? "map-swatch nodata" : "map-swatch");
      if (!HATCHED_GROUPS.has(id)) sw.style.background = color(id);
      // The key leaves out "enrollment group" to save room; the tooltip and the table keep it
      const n = counts.get(id)!;
      // The key also leaves the income fifths' "Towns in the" off: "Lowest income fifth"
      const words = (regions ? sizeName(id) : null) ?? groupName(data.groups?.[id]?.name ?? id).replace(/ enrollment group\b/, "")
        .replace(/^(Towns|Districts) in the (\w)/, (_, _w, c: string) => c.toUpperCase());
      li.append(sw, el("span", undefined, `${words} (${n} ${n === 1 ? "town" : "towns"})`));
      li.setAttribute("aria-label", `${groupName(data.groups?.[id]?.name ?? id)}, ${n} ${n === 1 ? "town" : "towns"}` +
        `${data.groups?.[id]?.outlier ? ", a regional outlier" : ""}`);
      pinnable(li, id, () => pointTo(id), () => (onTowns ? opts.openTown : opts.openDistrict)(id));
      return li;
    })()]), ...(data.towns.some((t) => !groupOf(t))
      ? [...(regions ? [rule()] : []), noneKey(((n) => `${noGroup(groupOf, onTowns)} (${n} ${n === 1 ? "town" : "towns"})`)(data.towns.filter((t) => !groupOf(t)).length))] : []));
    svg.setAttribute("aria-label", `Map of Massachusetts's 351 cities and towns, colored by ${onTowns ? "their" : "their districts'"} ` +
      `group by ${g.label.toLowerCase()}. The table below lists each.`);
    tableSum.textContent = "Every town, by group";
    const t = el("table");
    t.createTHead().insertRow().append(el("th", undefined, "Town"), el("th", undefined, "Group"));
    const tb = t.createTBody();
    const rows = data.towns.map((x) => ({ name: x.name, g: groupOf(x) }))
      .sort((a, b) => (a.g ? shown.indexOf(a.g) : 999) - (b.g ? shown.indexOf(b.g) : 999) || a.name.localeCompare(b.name));
    for (const r of rows) {
      const tr = tb.insertRow();
      const th = el("th", undefined, r.name);
      th.scope = "row";
      tr.append(th, el("td", undefined, r.g ? groupName(data.groups?.[r.g]?.name ?? r.g) : "–"));
    }
    tableHolder.replaceChildren(t);
    tip.hidden = true;
    // A pin holds while its group is on the map, lit again in the new key
    if (pinned && pinned !== "(none)" && !counts.has(pinned)) pinned = null;
    clearLift();
    unlift();
  }
  /** The groups' figures, beside the map: each group in the grouping's order, its color on the map and its figure;
   * within regions, a row for each region and a column for each size, a cell gray where the region has too few of
   * that size and its towns are in the statewide group. Pointing to a row or a cell points out its group on the map,
   * as pointing to a town on the map lights its row. */
  function drawGroupTable(spec: {
    g: Grouping; measure: Measure; value: (id: string) => Val | null; color: (v: number) => string;
    groupOf: (t: MapTown) => string | null; regions?: Grouping | null; regionOf?: (t: MapTown) => string | null;
    sizes?: Grouping | null; sizeOf?: (t: MapTown) => string | null;
  } | null) {
    groupTable.hidden = !spec;
    if (!spec) {
      groupTable.replaceChildren();
      return;
    }
    const { g, measure, value, color } = spec;
    const name = (id: string) => shortGroup(data.groups?.[id]?.name ?? id);
    /** A row or cell that points out its group, from a town in it (whose region the ring outlines) */
    const lights = <T extends HTMLElement>(node: T, id: string, from?: MapTown) => {
      node.dataset.group = id;
      node.tabIndex = 0;
      node.addEventListener("pointerenter", () => pointTo(id, from));
      node.addEventListener("focus", () => pointTo(id, from));
      node.addEventListener("pointerleave", () => unlift());
      node.addEventListener("blur", () => unlift());
      return node;
    };
    const figureIn = (td: HTMLTableCellElement, v: Val | null, fmt: (x: number) => string) => {
      if (!v) {
        td.textContent = "–";
        return td;
      }
      const sw = el("span", "map-swatch");
      sw.style.background = color(v[0]);
      td.append(sw, el("span", undefined, fmt(v[0])));
      return td;
    };
    const t = el("table");
    const first = [...new Set(data.towns.map(spec.groupOf))].map((id) => (id ? value(id) : null)).find((v) => v);
    const years = first ? (first.length > 2 ? `FY${first[1]}–FY${first[2]}` : `FY${first[1]}`) : "";
    // The years head the figures' column, or, within regions, where every column is figures, follow the caption
    const grid = !!(spec.regions && spec.sizes && spec.regionOf && spec.sizeOf);
    t.createCaption().textContent = `${measure.label}${grid && years ? `, ${years}` : ""}`;
    const hr = t.createTHead().insertRow();
    const tb = t.createTBody();
    const note: string[] = [];
    if (spec.regions && spec.sizes && spec.regionOf && spec.sizeOf) {
      // Each region and size: the group its towns are in, and a town of them
      const at = new Map<string, { id: string; town: MapTown }>();
      for (const x of data.towns) {
        const id = spec.groupOf(x), r = spec.regionOf(x), sz = spec.sizeOf(x);
        if (id && r && sz && !at.has(`${r}|${sz}`)) at.set(`${r}|${sz}`, { id, town: x });
      }
      const keys = [...at.keys()];
      const sizes = spec.sizes.groups.filter((sz) => keys.some((k) => k.endsWith(`|${sz}`)));
      const regions = spec.regions.groups.filter((r) => keys.some((k) => k.startsWith(`${r}|`)));
      t.classList.add("is-grid");
      hr.append(el("th", undefined, "Region"), ...sizes.map((sz) => el("th", "num", name(sz))));
      for (const r of regions) {
        const tr = tb.insertRow();
        const th = el("th", undefined, name(r));
        th.scope = "row";
        tr.append(th, ...sizes.map((sz) => {
          const c = at.get(`${r}|${sz}`);
          const td = el("td", "num");
          if (!c) {
            td.textContent = "";
            return td;
          }
          const wide = spec.sizes!.groups.includes(c.id);
          const outlier = !!data.groups?.[c.id]?.outlier;
          td.classList.toggle("is-statewide", wide);
          if (wide) note[0] = "Gray: the statewide group, where a region has too few of a size.";
          if (outlier) note[1] = `*Regional outlier: fewer than three ${layer === "towns" ? "towns" : "districts"} of its size in its region.`;
          td.title = wide ? `${name(c.id)}, statewide` : `${groupName(data.groups?.[c.id]?.name ?? c.id)}${outlier ? ", an outlier" : ""}`;
          lights(figureIn(td, value(c.id), measure.short), c.id, c.town);
          if (outlier && td.lastElementChild) td.lastElementChild.append("*");
          return td;
        }));
      }
    } else {
      const present = new Set(data.towns.map(spec.groupOf).filter((id): id is string => !!id));
      const typeKind = (id: string) => KINDS.findIndex((k) => id.endsWith(`type-${k}`));
      const order = (g.key === "type" ? [...g.groups].sort((a, b) => typeKind(a) - typeKind(b)) : g.groups).filter((id) => present.has(id));
      hr.append(el("th", undefined, g.label.replace(/, statewide$/, "")), el("th", "num", years));
      for (const id of order) {
        const tr = lights(tb.insertRow(), id);
        const th = el("th", undefined, name(id));
        th.scope = "row";
        tr.append(th, figureIn(el("td", "num"), value(id), measure.fmt));
      }
    }
    groupTable.replaceChildren(t, ...note.filter(Boolean).map((n) => el("p", "map-gtable-note", n)));
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
    legend.classList.remove("by-region");
    // Each type points out its towns on the map, and pins them, as a measure's ranges do (#222)
    legend.replaceChildren(...KINDS.map((k) => {
      const li = el("li", "map-group-key");
      li.dataset.class = k;
      li.dataset.fill = KIND_COLOR[k];
      li.tabIndex = 0;
      const sw = el("span", "map-swatch");
      sw.style.background = KIND_COLOR[k];
      li.append(sw, el("span", undefined, `${KIND_NAME[k]} (${count(k)})`));
      pinnable(li, `class:${k}`, () => pointToClass(k));
      return li;
    }), ...(data.towns.some((t) => !kindOf(t)) ? [noneKey("No district of its own")] : []));
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
  /** The group a key entry keeps lit, "(none)" for the towns without one, "class:2" for a measure's third range */
  let pinned: string | null = null;
  /** What the map shows (layer, grouping, measure), and what it showed when the pin was set */
  let view = "";
  let pinnedIn = "";
  root.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape" || !pinned) return;
    pinned = null;
    draw();
  });
  let lastPointer: { x: number; y: number; id: string } | null = null;
  /** Nothing pointed out */
  const clearLift = () => {
    for (const p of [...lift.children]) shapes.append(p);
    svg.classList.remove("is-pointing");
    showRing([]);
    legend.querySelectorAll(".is-lit").forEach((li) => li.classList.remove("is-lit"));
    groupTable.querySelectorAll(".is-lit").forEach((n) => n.classList.remove("is-lit"));
    hovered = null;
  };
  /** Back to the group a key entry pinned, or to nothing. Already there, it leaves the map alone: moving a town's
   * outline between a press and its release would swallow the click (the key's blur comes between them). */
  const unlift = () => {
    if (pinned && hovered === pinned) return;
    clearLift();
    if (pinned === "(none)") pointToNone();
    else if (pinned?.startsWith("class:")) pointToClass(pinned.slice(6));
    else if (pinned) pointTo(pinned);
  };
  /** The key's hatched entry ("No group", "No data"): pointing to it, or, grouped, to a town without a group, lifts
   * every hatched town and lights it */
  function noneKey(words: string) {
    const li = el("li", "map-group-key");
    li.dataset.none = "1";
    li.tabIndex = 0;
    li.append(el("span", "map-swatch nodata"), el("span", undefined, words));
    pinnable(li, "(none)", pointToNone);
    return li;
  }
  /** A key entry clicked, or pressed with Enter or Space, keeps its group lit, while pointing elsewhere shows others
   * for a moment; clicked again, or Esc, lets it go. A pinned entry offers its group's own page. */
  function pinnable(li: HTMLLIElement, id: string, show: () => void, open?: () => void) {
    li.setAttribute("role", "button");
    li.setAttribute("aria-pressed", String(pinned === id));
    li.title = "Select to keep it lit; again to let it go";
    li.classList.toggle("is-pinned", pinned === id);
    if (pinned === id && open) {
      const b = el("button", "map-group-open", "Open ›");
      b.type = "button";
      b.title = "Open this group in its tab";
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        open();
      });
      li.append(b);
    }
    const toggle = () => {
      pinned = pinned === id ? null : id;
      pinnedIn = view;
      draw();
      legend.querySelector<HTMLElement>(id === "(none)" ? "[data-none]" : id.startsWith("class:") ? `[data-class="${id.slice(6)}"]`
        : `[data-group="${CSS.escape(id)}"]`)?.focus();
    };
    li.addEventListener("click", toggle);
    li.addEventListener("keydown", (ev) => {
      if (ev.target === li && (ev.key === "Enter" || ev.key === " ")) {
        ev.preventDefault();
        toggle();
      }
    });
    li.addEventListener("pointerenter", show);
    li.addEventListener("focus", show);
    li.addEventListener("pointerleave", () => unlift());
    li.addEventListener("blur", () => unlift());
  }
  /** A range of the measure's key, or a community type: its towns drawn on top, the rest faded, its entry lit */
  function pointToClass(k: number | string) {
    clearLift();
    hovered = `class:${k}`;
    const li = legend.querySelector<HTMLElement>(`[data-class="${k}"]`);
    for (const t of data.towns) if (paths.get(t.id)!.getAttribute("fill") === li?.dataset.fill) lift.append(paths.get(t.id)!);
    svg.classList.add("is-pointing");
    li?.classList.add("is-lit");
  }
  function pointToNone() {
    clearLift();
    hovered = "(none)";
    for (const t of data.towns) if (paths.get(t.id)!.getAttribute("fill") === NO_DATA) lift.append(paths.get(t.id)!);
    // The rest fade, where black outlines alone don't set the set apart
    svg.classList.add("is-pointing");
    legend.querySelector("[data-none]")?.classList.add("is-lit");
  }
  /** A group's towns drawn on top, outlined, its region ringed, and its key lit */
  function pointTo(g: string, from?: MapTown) {
    if (!current?.groupOf) return;
    clearLift();
    hovered = g;
    const towns = data.towns.filter((x) => current!.groupOf!(x) === g);
    for (const x of towns) lift.append(paths.get(x.id)!);
    // The towns outside the group fade, where black outlines alone don't set it apart
    svg.classList.add("is-pointing");
    const r = current.statewide?.(g) ? null : current.regionOf?.(from ?? towns[0] ?? data.towns[0]);
    if (r) showRing(data.towns.filter((x) => current!.regionOf!(x) === r));
    legend.querySelector(`[data-group="${CSS.escape(g)}"]`)?.classList.add("is-lit");
    groupTable.querySelectorAll(`[data-group="${CSS.escape(g)}"]`).forEach((n) => n.classList.add("is-lit"));
  }
  function showTip(at: { x: number; y: number; id: string }) {
    if (!current) return;
    const t = townById.get(at.id)!;
    const g = current.groupOf?.(t) ?? null;
    const d = current.districtOf(t);
    const key = g ?? d ?? t.id;
    // Grouped, a town without a group points to all of them, as the key's "No group" does
    const loose = !!current.groupOf && !g && paths.get(t.id)!.getAttribute("fill") === NO_DATA;
    if (loose) {
      if (hovered !== "(none)") pointToNone();
    } else if (hovered !== key) {
      if (g) pointTo(g, t);
      else {
        unlift();
        hovered = key;
        for (const x of d ? data.towns.filter((y) => current!.districtOf(y) === d) : [t]) lift.append(paths.get(x.id)!);
        // Its range in the key lights, as a group's entry does for a town of the group
        legend.querySelector(`[data-fill="${paths.get(t.id)!.getAttribute("fill")}"]`)?.classList.add("is-lit");
      }
    }
    const v = current.value(t);
    tip.replaceChildren(el("strong", undefined, t.name));
    if (current.groupOf) {
      tip.append(el("div", undefined, g ? groupName(data.groups?.[g]?.name ?? g) : "No group"));
      const r = g && !current.statewide?.(g) ? current.regionOf?.(t) : null;
      if (r) tip.append(el("div", "map-tip-region", `In ${groupName(data.groups?.[r]?.name ?? r)}, outlined in red`));
      else if (g && current.statewide?.(g)) tip.append(el("div", "map-tip-region", "Statewide: no region of its own"));
      if (g && data.groups?.[g]?.outlier) tip.append(el("div", undefined, "Regional outlier"));
      if (current.measure.key !== "group" && current.measure.kind !== "type") {
        tip.append(el("div", undefined, v ? `${current.measure.fmt(v[0])}, ${v.length > 2 ? `FY${v[1]}–FY${v[2]}` : `FY${v[1]}`}` : "No data"));
      }
      tip.append(el("div", "cw-tip-hint", layer === "districts" && (d || t.elem) ? "Select to open the district" : "Select to open the town"));
    } else if (layer === "districts") {
      tip.append(el("div", undefined, current.combinedAt(t) ? `${schoolsOf(t)}, combined` : d ? `${data.districts[d].name} district`
        : "No district of its own"));
    }
    const kind = current.kindOf?.(t);
    if (!current.groupOf) tip.append(el("div", undefined, current.measure.kind === "type" ? (kind ? KIND_NAME[kind] : "No district of its own")
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
    /** A link from About the data: the measure on its layer, in view */
    show(on: Layer, key: string) {
      layer = on;
      if (on === "towns") townKey = key;
      else districtKey = key;
      stop();
      draw();
      section.scrollIntoView({ block: "start" });
    },
  };
}
