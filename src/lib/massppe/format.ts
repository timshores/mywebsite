// Numbers as the explorer writes them: one rule for each kind of figure, so the same figure reads the same on the
// map, the plots, the tables, the hover cards and the district and town pages (#237). The rules follow two old
// standards of statistical presentation: round to the two or three digits a reader compares (Ehrenberg,
// "Rudiments of Numeracy," 1977), and give a measure the same decimals wherever it appears, so its values line up
// and compare (Few, Show Me the Numbers), never more than the data holds.
//
// - Percentages, shares, changes, rates and gaps, to one decimal: 4.3%, 43.2%, +3.4%. A measure whose values run
//   well under 1% keeps two (debt as a share of equalized value), where one would erase the differences.
// - A change or a difference carries its sign, a true minus; one that rounds to zero carries none.
// - Dollars per pupil, resident or household in whole dollars; totals from a million in three significant digits
//   with the word: $1.23 million, $18.4 million, $423 million, $4.23 billion.
// - Counts in whole numbers; measured amounts that span orders of magnitude (FTE pupils, density) to one decimal
//   under 100, whole from there.
// - Axis ticks are round numbers, compact from a thousand (5K, 1.5M), one style for each axis.
// - ρ to two decimals.
// - Rates the state publishes keep its form: tax rates in dollars and cents per $1,000, Chapter 70's effort rates
//   and growth factor to the decimals DESE gives (cap.ts).
// - Halves round away from zero, once, here; a color or a class is the class of the figure as shown (#231).

/** v rounded to d decimals, halves away from zero, without binary error: 0.0495 to three decimals is 0.05 */
export function round(v: number, d = 0): number {
  const s = Number((Math.abs(v) * 10 ** d).toPrecision(12));
  return (Math.sign(v) * Math.round(s)) / 10 ** d;
}

/** A figure's sign, by the figure as printed: none for one that shows as zero, a true minus below zero, and with
 * plus, "+" above it */
export const signFor = (v: number, shown: string, plus = false) =>
  (!/[1-9]/.test(shown) ? "" : v < 0 ? "−" : plus && v > 0 ? "+" : "");

/** The digits of |v| to d decimals, with thousands commas */
export function digits(v: number, d = 0): string {
  return Math.abs(round(v, d)).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** A share or a level in percent: "4.3%", "43.2%", "−1.2%" */
export function pct(v: number, d = 1): string {
  const s = digits(v * 100, d);
  return `${signFor(v, s)}${s}%`;
}

/** A change or a gap in percent, signed: "+3.4%", "−0.5%", "0.0%" */
export function change(v: number, d = 1): string {
  const s = digits(v * 100, d);
  return `${signFor(v, s, true)}${s}%`;
}

/** Yearly growth: "+2.0% a year" */
export const yearly = (v: number) => `${change(v)} a year`;

/** Percentage points, given in points: "0.4 points"; two decimals under a tenth, where one would show nothing */
export function points(v: number, plus = false): string {
  const s = digits(v, Math.abs(v) < 0.1 ? 2 : 1);
  return `${signFor(v, s, plus)}${s} points`;
}

/** Whole dollars: "$18,345", "−$310"; with plus, "+$310" */
export function usd(v: number, plus = false): string {
  const s = digits(v);
  return `${signFor(v, s, plus)}$${s}`;
}

/** Three significant digits of a number from 1 to 1,000 */
const sig3 = (n: number) => digits(n, n >= 99.95 ? 0 : n >= 9.995 ? 1 : 2);

/** A total: whole dollars under a million, then three significant digits with the word: "$1.23 million",
 * "$423 million", "$4.23 billion" */
export function total(v: number, plus = false): string {
  const a = Math.abs(v);
  if (round(a) < 1e6) return usd(v, plus);
  const [n, unit] = round(a / 1e6, 0) >= 1000 ? [a / 1e9, "billion"] : [a / 1e6, "million"];
  const s = sig3(n);
  return `${signFor(v, s, plus)}$${s} ${unit}`;
}

/** A count: "1,234" */
export const count = (v: number) => `${signFor(v, digits(v))}${digits(v)}`;

/** A measured amount that spans orders of magnitude, such as FTE pupils or density: "57.5", "1,234" */
export function measured(v: number): string {
  const s = digits(v, Math.abs(round(v, 1)) < 100 ? 1 : 0);
  return `${signFor(v, s)}${s}`;
}

/** ρ, to two decimals: "0.80", "−0.53" */
export function rho(r: number): string {
  const s = digits(r, 2);
  return `${signFor(r, s)}${s}`;
}

/** An axis tick, compact from a thousand, so every tick of an axis that reaches thousands takes one style, with a
 * decimal only where the tick needs one: "500", "5K", "1.5M" */
export function compact(v: number, prefix = ""): string {
  const a = Math.abs(v);
  for (const [unit, size] of [["B", 1e9], ["M", 1e6], ["K", 1e3]] as const) {
    if (a >= size) {
      const k = round(a / size, 1);
      const s = Number.isInteger(k) ? String(k) : k.toFixed(1);
      return `${signFor(v, s)}${prefix}${s}${unit}`;
    }
  }
  const s = digits(v);
  return `${signFor(v, s)}${prefix}${s}`;
}

/** "a", "a and b", "a, b, and c" */
export const andList = (xs: string[]) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`);

/** A figure as its words give it: the number its format prints, read back ("+2.0% a year" is 0.02), so a color or
 * a class is that of the figure a reader sees (#231) */
export function asShown(fmt: (v: number) => string, v: number): number {
  const s = fmt(v);
  const n = Number(s.replace(/−/g, "-").replace(/[^\d.-]/g, ""));
  return /\d/.test(s) && Number.isFinite(n) ? (s.includes("%") ? n / 100 : n) : v;
}
