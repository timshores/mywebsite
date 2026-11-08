// The map's measures year by year (map-years.json): each figure over the years a reader chooses, by the rules the
// pipeline uses for the figures in map.json. Moved out of startMap's closure, where it read the series from a
// variable there (#238): here each function takes the series, and the latest year where it needs one, so with no
// page and no styles to load it runs in Node, to be checked against map.json's own figures.

import { cagr, linearFit } from "./stats";

/** [value, year] for a level; [value, first year, last year] for a change */
export type Val = number[];
/** A measure year by year, along MapSeries.years */
export type Arr = (number | null)[];
/** The years a value covers: one year has from equal to to */
export interface Yrs { from: number; to: number }
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
/** What the figures need of one of the map's measures: its key; "range" for a change between two years, "year" for
 * one year at a time; growth in dollars, figured before or after inflation; a census figure, held between releases */
export interface SeriesMeasure { key: string; years?: "range" | "year"; dollars?: boolean; hold?: boolean }
/** What the figures need of a town: its own row's key, and the districts serving its elementary and secondary grades */
export interface SeriesTown { id: string; elem: string | null; high: string | null }

export const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
export const get = (a: Arr | undefined, i: number) => (a && i >= 0 && i < a.length ? a[i] : null);
/** The first and last years with a positive value, between lo and hi */
export function endsOn(a: Arr | undefined, lo: number, hi: number): [number, number] | null {
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

const yi = (S: MapSeries, y: number) => S.years.indexOf(y);
/** The least-squares line's yearly growth from its first year to its last, between lo and hi; none where the line
 * starts or ends at or below zero, as the pipeline rules for the figures in map.json */
export function trendOn(S: MapSeries, a: Arr, lo: number, hi: number): Val | null {
  const fit = linearFit(S.years.map((_, i) => (i < lo || i > hi ? null : get(a, i))));
  const at = fit.flatMap((v, i) => (v == null ? [] : [i]));
  if (!at.length) return null;
  const [a0, b0] = [at[0], at[at.length - 1]];
  const g = cagr(fit[a0], fit[b0], b0 - a0);
  return g == null ? null : [round(g, 5), S.years[a0], S.years[b0]];
}
/** Trend growth after inflation (in the latest year's dollars) or before; the pipeline fits each on its own */
export function growthOn(S: MapSeries, latest: number, a: Arr, lo: number, hi: number, after: boolean): Val | null {
  const cpi = S.cpi;
  const base = cpi[yi(S, latest)]!;
  const real = S.years.map((_, i) => {
    const v = get(a, i);
    return v == null || cpi[i] == null ? null : (v * base) / cpi[i]!;
  });
  const r = trendOn(S, real, lo, hi);
  const nom = trendOn(S, a, lo, hi);
  if (!r || !nom) return null;
  return after ? r : nom;
}
export function changeOn(S: MapSeries, a: Arr, lo: number, hi: number): Val | null {
  const e = endsOn(a, lo, hi);
  return e ? [round(get(a, e[1])! / get(a, e[0])! - 1, 4), S.years[e[0]], S.years[e[1]]] : null;
}
/** A measure's value from one town's or district's row, over the years chosen */
export function fromRow(S: MapSeries, latest: number, m: SeriesMeasure, row: Record<string, Arr> | undefined, y: Yrs,
  after: boolean): Val | null {
  if (!row) return null;
  if (m.years === "range") {
    const a = row[m.key];
    if (!a) return null;
    return m.dollars ? growthOn(S, latest, a, yi(S, y.from), yi(S, y.to), after) : changeOn(S, a, yi(S, y.from), yi(S, y.to));
  }
  const i = yi(S, y.to);
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
    if (x != null) return [x, S.years[k]];
  }
  return null;
}
/** A split town's two districts as one, each weighted by the town's pupils in it */
export function combinedRow(S: MapSeries, latest: number, m: SeriesMeasure, t: SeriesTown, y: Yrs, after: boolean): Val | null {
  const w = S.towns[t.id]?.w;
  const r1 = S.districts[t.elem!];
  const r2 = S.districts[t.high!];
  if (!w || !r1 || !r2) return null;
  const [w1, w2] = w as number[];
  const lo = yi(S, y.from);
  const hi = yi(S, y.to);
  if (m.key === "ppe") {
    const mix = S.years.map((_, k) => {
      const a = get(r1.ppe, k);
      const b = get(r2.ppe, k);
      return a == null || b == null ? null : (w1 * a + w2 * b) / (w1 + w2);
    });
    return growthOn(S, latest, mix, lo, hi, after);
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
    return [round((w1 * c1 + w2 * c2) / (w1 + w2), 4), S.years[a], S.years[b]];
  }
  if (m.key === "above" || m.key === "aid") {
    // Each needs only its own figure and the requirement: aid can be had in a year above-required wasn't reported
    const i = yi(S, y.to);
    const [v1, q1, v2, q2] = [r1, r2].flatMap((r) => [get(r[m.key], i), get(r.req, i)]);
    if ([v1, q1, v2, q2].some((v) => v == null)) return null;
    const req = w1 * q1! + w2 * q2!;
    if (!req) return null;
    return [round((w1 * v1! + w2 * v2!) / req, 4), y.to];
  }
  if (m.years === "year") {
    // A share of the students or of spending, each district's weighted by the town's pupils in it
    const i = yi(S, y.to);
    const a = get(r1[m.key], i);
    const b = get(r2[m.key], i);
    return a == null || b == null ? null : [round((w1 * a + w2 * b) / (w1 + w2), 4), y.to];
  }
  return null;
}
/** The years a measure has in these rows (a layer's towns or districts, or its groups), first to last */
export function yearsIn(S: MapSeries, key: string, rows: Record<string, Record<string, Arr>>[]): number[] {
  let lo = Infinity;
  let hi = -1;
  for (const row of rows.flatMap((r) => Object.values(r))) {
    const a = row[key];
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
export const minSpan = (m: SeriesMeasure) => (m.key === "eqv" ? 4 : m.dollars ? 2 : 1);
