// The explorer's number formats and statistics, case by case (#237): each pair is what a function returns and what
// a reader should see. scripts/check/units.mjs runs these before every build.
import * as f from "../../src/lib/massppe/format";
import { median } from "../../src/lib/massppe/stats";

export const cases: [string, unknown, unknown][] = [
  // Percentages to one decimal; a level's sign only below zero
  ["pct share", f.pct(0.043), "4.3%"],
  ["pct large share", f.pct(0.4321), "43.2%"],
  ["pct over 100", f.pct(1.382), "138.2%"],
  ["pct below zero", f.pct(-0.004), "−0.4%"],
  ["pct rounds to zero", f.pct(0.0004), "0.0%"],
  // Changes signed, a true minus; none for one that rounds to zero
  ["change up", f.change(0.03), "+3.0%"],
  ["change half away from zero", f.change(-0.0495), "−5.0%"],
  ["change rounds to zero", f.change(0.00049), "0.0%"],
  ["change just down", f.change(-0.00051), "−0.1%"],
  ["change to two decimals", f.change(0.0012, 2), "+0.12%"],
  ["yearly", f.yearly(0.01996), "+2.0% a year"],
  ["yearly down", f.yearly(-0.0495), "−5.0% a year"],
  // Percentage points: two decimals under a tenth
  ["points small", f.points(0.05), "0.05 points"],
  ["points signed", f.points(0.4, true), "+0.4 points"],
  ["points down", f.points(-1.25), "−1.3 points"],
  // Dollars whole; totals from a million in three significant digits
  ["usd", f.usd(18345.5), "$18,346"],
  ["usd down", f.usd(-310.4), "−$310"],
  ["usd signed", f.usd(310, true), "+$310"],
  ["usd rounds to zero", f.usd(0.4, true), "$0"],
  ["total under a million", f.total(999_499), "$999,499"],
  ["total millions", f.total(1_234_000), "$1.23 million"],
  ["total tens of millions", f.total(18_440_000), "$18.4 million"],
  ["total hundreds of millions", f.total(423_400_000), "$423 million"],
  ["total rounds up to a billion", f.total(999_600_000), "$1.00 billion"],
  ["total billions", f.total(4_234_000_000), "$4.23 billion"],
  ["total down", f.total(-2_500_000), "−$2.50 million"],
  // Counts whole; measured amounts to a tenth under 100
  ["count", f.count(1234.4), "1,234"],
  ["measured", f.measured(82), "82.0"],
  ["measured rounds to 100", f.measured(99.96), "100"],
  ["measured large", f.measured(1234.5), "1,235"],
  // rho to two decimals
  ["rho", f.rho(0.799), "0.80"],
  ["rho rounds to zero", f.rho(-0.004), "0.00"],
  // Axis ticks compact from a thousand
  ["compact thousands", f.compact(1500, "$"), "$1.5K"],
  ["compact zero", f.compact(0), "0"],
  ["compact whole thousands", f.compact(20000), "20K"],
  ["compact millions down", f.compact(-2_500_000, "$"), "−$2.5M"],
  ["compact under a thousand", f.compact(950), "950"],
  // Rounding without binary error
  ["round half away from zero", f.round(0.0495, 3), 0.05],
  ["round negative", f.round(-2.5), -3],
  // A figure as shown, for the map's classes (#231)
  ["asShown yearly", f.asShown(f.yearly, 0.01996), 0.02],
  ["asShown dollars", f.asShown((v) => f.usd(v, true), -310.4), -310],
  ["andList", f.andList(["a", "b", "c"]), "a, b, and c"],
  ["andList two", f.andList(["a", "b"]), "a and b"],
  // The median: the mean of the middle two for an even count
  ["median odd", median([3, 1, 2]), 2],
  ["median even", median([1, 2, 3, 10]), 2.5],
  ["median none", Number.isNaN(median([])), true],
];
