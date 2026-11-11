// The cap tab's model, apart from its page (#242), so a check can run it without a browser: each town's target under
// another cap or none, keeping the year's statewide total, and its required contribution under today's rules. The
// pipeline figures the same targets (export_explorer_data.nocap_factor, at_cap); mywebsite's check:units compares the
// two for every year cap.json has, and ppe_report/evidence/cap.py traces each year from DESE's spreadsheet.

/** What the model reads of a town: its yield, its foundation budget, and how its required contribution moves */
export interface ModelTown {
  cey: number; foundation: number; preliminary?: number | null; prior?: number | null;
}

/**
 * The required contribution under today's rules for a given target (DESE's Townwide Contributions
 * sheet, columns P-X): last year's grown by the growth factor; down to the target if that's above
 * it; up 1% or 2% of last year's if it falls short by more than 2.5 or 7.5 points of foundation; at
 * least the target for a town whose yield is 175% of foundation or more; at most 90% of foundation.
 * With today's targets this reproduces every town's required contribution, FY2026 and FY2027 (check:units). A town
 * with no foundation budget has none, as it has no target (#242).
 */
export function requiredFor(t: ModelTown, target: number, yieldPct: number): number | null {
  return requiredSteps(t, target, yieldPct)?.required ?? null;
}

/** The same, step by step, for the cap tab's Show the work (#253): the gap between the target and the preliminary
 * contribution in points of foundation, the increment it earns (as a rate and in dollars), what comes off where the
 * preliminary contribution is above the target, what the 175% rule adds, the limit of 90% of foundation, and the
 * required contribution those make. Null where DESE gives no prior-year figures. */
export function requiredSteps(t: ModelTown, target: number, yieldPct: number) {
  if (t.preliminary == null || t.prior == null) return null;
  const P = t.preliminary;
  const H = t.foundation;
  if (!H) return { gap: 0, rate: 0, increment: 0, excess: 0, special: 0, limit: 0, limited: false, required: 0 };
  const gap = Math.round((target * 100) / H * 100) / 100 - (P * 100) / H;
  const rate = gap > 7.5 ? 0.02 : gap > 2.5 ? 0.01 : 0;
  const increment = Math.round(rate * t.prior);
  const excess = Math.max(P - target, 0);
  const special = yieldPct > 1.75 ? Math.max(target - (P + increment), 0) : 0;
  const before = Math.round(P + increment - excess + special);
  const limit = H * 0.9;
  return { gap, rate, increment, excess, special, limit, limited: before > limit, required: Math.min(limit, before) };
}

/** Whether the cap held a target below the yield it would otherwise be: the one test for "at the cap" on this tab, as
 * the pipeline's at_cap (#242). DESE's target is the lesser of the two, so a capped town's target is below its yield. */
export const atCap = (target: number, cey: number, foundation: number | null) => !!foundation && target < cey - 1;

/** A town's target under a cap, or none, at factor f. A town with no foundation budget (Gosnold) takes no part in
 * setting f; with no cap its target is still its yield times f, as Michael Naughton's FY2026 workbook gives it (Tim,
 * #243), and under any cap a share of a $0 budget is $0 */
export const targetAt = (cey: number, fb: number, f: number, cap: number | null) => (cap == null ? cey * f : !fb ? 0 : Math.min(cey * f, cap * fb));

/** The same for arrays: one year's yields and foundation budgets, held to that year's total. */
export function solveArrays(ceys: number[], fbs: number[], total: number, cap: number | null): number {
  let lo = 0;
  let hi = 4;
  for (let k = 0; k < 80; k++) {
    const f = (lo + hi) / 2;
    let sum = 0;
    for (let i = 0; i < ceys.length; i++) if (fbs[i]) sum += targetAt(ceys[i], fbs[i], f, cap);
    if (sum < total) lo = f;
    else hi = f;
  }
  return (lo + hi) / 2;
}

/** The factor on DESE's percentages that keeps capped targets at the year's total. */
export function solve(towns: ModelTown[], total: number, cap: number | null): number {
  let lo = 0;
  let hi = 4;
  for (let k = 0; k < 80; k++) {
    const f = (lo + hi) / 2;
    let sum = 0;
    for (const t of towns) if (t.foundation) sum += targetAt(t.cey, t.foundation, f, cap);
    if (sum < total) lo = f;
    else hi = f;
  }
  return (lo + hi) / 2;
}

/** The towns ranked by income per capita (the formula's income over the population estimate for July of the income
 * year) and cut into five groups as near equal in size as the count allows, as the explorer's income fifths are: each
 * town's fifth, 0 (lowest) to 4, and the ranked towns with their income per capita (#246) */
export function incomeFifths<T extends { id: string; income: number; pop_income: number | null }>(towns: T[]) {
  const withIncome = towns.filter((x) => x.pop_income && x.income).map((x) => ({ x, inc: x.income / x.pop_income! }))
    .sort((a, b) => a.inc - b.inc);
  const n = withIncome.length;
  const fifthOf = new Map<string, number>();
  withIncome.forEach(({ x }, k) => fifthOf.set(x.id, Math.min(4, Math.floor((k * 5) / n))));
  return { withIncome, n, fifthOf };
}
