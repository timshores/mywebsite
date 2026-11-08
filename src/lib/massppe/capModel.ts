// The cap tab's model, apart from its page (#242), so a check can run it without a browser: each town's target under
// another cap or none, keeping the year's statewide total, and its required contribution under today's rules. The
// pipeline figures the same targets (export_explorer_data.nocap_factor, at_cap); mywebsite's check:units compares the
// two for every year cap.json has, and ppe_report/evidence/cap_fy2026.py traces FY2026 from DESE's spreadsheet.

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
  if (t.preliminary == null || t.prior == null) return null;
  if (!t.foundation) return 0;
  const P = t.preliminary;
  const H = t.foundation;
  const shortfall = Math.round((target * 100) / H * 100) / 100 - (P * 100) / H;
  const step = shortfall > 7.5 ? 0.02 : shortfall > 2.5 ? 0.01 : 0;
  const T = Math.round(step * t.prior);
  const V = Math.max(P - target, 0);
  const W = yieldPct > 1.75 ? Math.max(target - (P + T), 0) : 0;
  return Math.min(H * 0.9, Math.round(P + T - V + W));
}

/** Whether the cap held a target below the yield it would otherwise be: the one test for "at the cap" on this tab, as
 * the pipeline's at_cap (#242). DESE's target is the lesser of the two, so a capped town's target is below its yield. */
export const atCap = (target: number, cey: number, foundation: number | null) => !!foundation && target < cey - 1;

/** A town's target under a cap, or none, at factor f: none for a town with no foundation budget */
export const targetAt = (cey: number, fb: number, f: number, cap: number | null) => (!fb ? 0 : cap == null ? cey * f : Math.min(cey * f, cap * fb));

/** The same for arrays: one year's yields and foundation budgets, held to that year's total. */
export function solveArrays(ceys: number[], fbs: number[], total: number, cap: number | null): number {
  let lo = 0;
  let hi = 4;
  for (let k = 0; k < 80; k++) {
    const f = (lo + hi) / 2;
    let sum = 0;
    for (let i = 0; i < ceys.length; i++) sum += targetAt(ceys[i], fbs[i], f, cap);
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
    for (const t of towns) sum += targetAt(t.cey, t.foundation, f, cap);
    if (sum < total) lo = f;
    else hi = f;
  }
  return (lo + hi) / 2;
}
