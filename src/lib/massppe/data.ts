// The shapes of the explorer's data files, as export_explorer_data.py writes them, for the modules and pages that
// read them (#237): the district and town lists and their metadata. A district's or town's full record, whose
// series keys come from the charts' own lists, is explorer.ts's Entity and Town.

/** Community types, from least dense to most */
export type CommunityType = "rural" | "suburban" | "gateway" | "core";

/** Which fifth of the state a town, or a district's towns together, falls in by income per capita (1 lowest) */
export interface IncomeFifth { fifth: number; income_pc: number; year: number }
/** The Inner Core (Boston and its densest neighbors), the other Gateway Cities, rural, or suburban and
 * other, with students (districts) or residents (towns) per square mile; rural districts carry DESE's
 * rural aid tier */
export interface Community { type: CommunityType; density: number; tier?: number | null; fy: number }
/** What the menus need to know of a district or average before its file loads */
export interface Listed {
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
export interface ListedTown {
  id: string; name: string; chunk: string; region: string | null; county?: string | null; peer?: string | null;
  scope?: string; gateway?: boolean;
}
export interface TownData {
  meta: {
    years: number[]; latest: number; members_fy: number; regions: Record<string, string>;
    apart: string[]; peer_year: number; peers: { id: string; label: string }[];
    property?: boolean;
    /** FY2025 Chapter 70 target local contribution: percentages of EQV and income, the cap */
    c70_target?: { fy: number; eqv_year: number; income_year: number; property_pct: number; income_pct: number;
      target_share: number; cap: number };
  };
  averages: ListedTown[];
  towns: ListedTown[];
}
export interface Meta {
  years: number[];
  latest: number;
  start: number;
  categories: string[];
  /** Each enrollment group: its range of in-district FTE, [low, high], high null for the open top; null for a group
   * by kind (vocational, charter, Gateway) */
  cohorts: Record<string, { label: string; short: string; range: (number | null)[] | null }>;
  regions: Record<string, string>;
  cpi: Record<string, number>;
  /** Census revenue years, which trail the DESE years */
  revenue: { first: number; latest: number; min_members: number } | null;
  /** The earlier years, for Since 1990: their years, the year the explorer's own measure begins, the
   * day program's years [first, last], and the years DESE's membership and NCES enrollment ([first, last]) weight its
   * averages */
  history?: { years: number[]; functional_from: number; day: number[]; membership_from: number;
    chapter70_from: number; nces: number[] };
}

export interface Data {
  meta: Meta;
  averages: Listed[];
  districts: Listed[];
  /** Districts the older files or the Hub have and the explorer's own years don't */
  former?: Listed[];
}
