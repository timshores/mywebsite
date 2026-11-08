// The correlation cautions for a pair of the plots' measures (Aggarwal and Ranganathan 2016): what the two count
// in common, and the pitfalls the districts plotted fall into. Moved out of startCommonwealth's closure, where it
// needed only the pair and the points (#238): its words come back as text with the measures' names marked, which
// commonwealth.ts sets in bold, so with no page to build on it runs in Node.

import { capital } from "./dom";
import { pct, rho } from "./format";
import { loess, median, pearson, spearman } from "./stats";
import type { Point } from "./scatter";

/** Words, with each measure's name marked ({ v }) to show in bold, as vn sets it */
export type Words = (string | { v: string })[];
export interface Caution { label: string; text: Words }
/** What the cautions read of a plot: its two measures, by key, its year and whether its scale across is a log */
export interface Pair { x: string; y: string; fy: number; log: boolean }
/** What they read of a district plotted: its key on the plot (id, or org), its region and its towns */
export interface PairRow { id: string | null; org: string; region: string | null; towns: string[] }

// What each measure counts (its numerator or total), to catch a pair that lines up partly by
// construction: one is a component of the other, or both count the same thing. A shared
// denominator alone doesn't count. Required spending is aid plus the required local contribution;
// EQV starts from assessed values.
// A ratio counts its denominator too (#242): spending as a share of the requirement counts the requirement, and a figure
// per foundation pupil counts foundation enrollment
const COUNTS: Record<string, string[]> = {
  nss_pct_fb: ["nss", "fb"], nss_pct_req: ["nss", "req"], nss_pfe: ["nss", "fe"], above_pfe: ["nss", "req", "fe"], ppe: ["ppe"],
  aid_pfe: ["aid", "fe"], aid_share: ["aid", "fb"], rlc_pfe: ["rlc", "fe"], fe: ["fe"], fte: ["fte"], eqv_res: ["eqv"], av_res: ["av"],
  income_pc: ["income"], sf_bill: ["bill"], bill_income: ["bill"], res_share: ["av"],
  ood_pp: ["ood"], sped_share: ["sped"], gap: ["nss"], low_income: ["low"], el: ["el"], swd: ["swd"], soc: ["soc"],
};
// What each part is built from, followed all the way down (#242: one level had missed that the requirement counts
// low-income students). Chapter 70 sets the required local contribution from equalized property value (the state's
// estimate from assessed values) and income, and its aid fills the gap to the foundation budget, so both count what
// the wealth measures count. Required spending, aid and the contribution together, comes to about the foundation
// budget, which doesn't turn on wealth: it counts the foundation budget alone. The foundation budget adds for
// low-income students and English learners, per foundation pupil.
const BUILT_FROM: Record<string, string[]> = {
  req: ["fb"], fb: ["fe", "low", "el"], eqv: ["av"], rlc: ["eqv", "income"], aid: ["rlc", "fb"],
};
const PART_NAME: Record<string, string> = {
  nss: "net school spending", req: "required spending", aid: "Chapter 70 aid", rlc: "the required local contribution",
  fb: "the foundation budget",
  eqv: "equalized property value", av: "assessed property value", bill: "the single-family tax bill", ppe: "in-district spending",
  fe: "foundation enrollment", fte: "in-district pupils", income: "income",
  low: "low-income students", el: "English learners", swd: "students with disabilities", soc: "students of color",
  ood: "out-of-district payments", sped: "special education spending",
};
const counted = (key: string) => {
  const out = new Set<string>();
  const add = (p: string) => {
    if (out.has(p)) return;
    out.add(p);
    for (const q of BUILT_FROM[p] ?? []) add(q);
  };
  for (const p of COUNTS[key] ?? []) add(p);
  return out;
};
/** The parts two measures both count, by name; empty when they're independent of each other. */
export function sharedParts(a: string, b: string): string[] {
  const ca = counted(a);
  return [...counted(b)].filter((p) => ca.has(p)).map((p) => PART_NAME[p]);
}
const TOWN_MEASURES = new Set(["eqv_res", "av_res", "income_pc", "sf_bill", "bill_income", "res_share"]);

// Pairs that share no number, so the ◇ doesn't mark them, but measure one condition two ways: a strong ρ between
// them is expected, and says the two measures agree, not something districts do (#235). Kept by hand: no rule finds
// these the way COUNTS finds a shared number.
const SAME_THING: { pair: [string, string]; text: Words }[] = [
  { pair: ["low_income", "income_pc"], text: [{ v: "Low-income students" }, " and ", { v: "income per capita" },
    " both measure how much money families have. One counts the students whose families are enrolled in programs such " +
    "as SNAP or MassHealth; the other averages the income of every resident of the district's towns. They share no " +
    "number, but a strong ρ between them is expected. It shows that the two measures agree, not something districts do."] },
  { pair: ["soc", "el"], text: [{ v: "Students of color" }, " and ", { v: "English learners" }, " overlap. Many English " +
    "learners are also students of color, so the same students count toward both shares. They share no number, but part " +
    "of their ρ comes from that overlap, not from anything districts do."] },
];

/**
 * The correlation pitfalls this pair falls into (Aggarwal and Ranganathan 2016), checked on the
 * districts plotted. Thresholds were set on FY2025 data to flag real problems, not every wobble.
 * yv and xv: the two measures, for their short names; rows: the districts behind the points.
 */
export function checkPair(v: Pair, yv: { short: string }, xv: { short: string }, pts: Point[], rows: PairRow[]): Caution[] {
  const out: Caution[] = [];
  const n = pts.length;
  const shared = sharedParts(v.x, v.y);
  if (shared.length) {
    out.push({ label: "Counts the same thing", text: [{ v: capital(yv.short) }, " and ", { v: xv.short }, " both count " +
      `${shared.join(" and ")}, so they line up partly by definition: one is built from the other, or both from ` +
      "the same number. Part of their ρ comes from that shared arithmetic, not from anything districts do."] });
  }
  const same = SAME_THING.find((s) => s.pair.includes(v.x) && s.pair.includes(v.y));
  if (same) out.push({ label: "Two views of the same thing", text: same.text });
  if (n < 30) {
    out.push({ label: "Few districts", text: [`Only ${n} districts have both measures in FY${v.fy}. With so few, a ` +
      "pattern can appear by chance."] });
  }
  if (n < 8) return out;
  const xs = pts.map((p) => (v.log ? Math.log10(p.x) : p.x));
  const ys = pts.map((p) => p.y);
  const rs = spearman(xs, ys) ?? 0;
  const rp = pearson(xs, ys);
  const rowOf = new Map(rows.map((r) => [r.id ?? r.org, r]));

  // Extremes: the ordinary correlation drifts from the rank-based one when a few points sit far out
  if (rp != null && Math.abs(rp - rs) >= 0.15) {
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    const sd = (a: number[], m: number) => Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length) || 1;
    const mx = mean(xs), my = mean(ys), sx = sd(xs, mx), sy = sd(ys, my);
    const far = pts.map((p, i) => ({ p, d: ((xs[i] - mx) / sx) ** 2 + ((ys[i] - my) / sy) ** 2 }))
      .sort((a, b) => b.d - a.d).slice(0, 3).map((o) => o.p.name);
    out.push({ label: "Pulled by a few districts", text: [`A few districts far from the rest, such as ` +
      `${far.join(", ")}, pull the ordinary correlation (Pearson's r = ${rho(rp)}) away from the rank-based ` +
      `ρ = ${rho(rs)} shown here. ρ resists them, but the picture can look stronger or weaker than it is.`] });
  }
  // One district: leave each out in turn
  let worst = 0;
  let who = -1;
  let without = rs;
  for (let i = 0; i < n; i++) {
    const r = spearman(xs.filter((_, k) => k !== i), ys.filter((_, k) => k !== i)) ?? rs;
    if (Math.abs(r - rs) > worst) [worst, who, without] = [Math.abs(r - rs), i, r];
  }
  if (worst >= 0.05 && who >= 0) {
    out.push({ label: "One district moves it", text: [`Leaving out ${pts[who].name} alone moves ρ from ${rho(rs)} to ` +
      `${rho(without)}.`] });
  }
  // Curves: a smooth fit that turns back explains more than a one-way ρ can
  const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const curve = loess(xs, ys);
  if (curve.length > 2) {
    const fitAt = (x: number) => {
      let k = curve.findIndex(([cx]) => cx >= x);
      if (k <= 0) return curve[Math.max(0, k)][1];
      const [x0, y0] = curve[k - 1];
      const [x1, y1] = curve[k];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
    };
    const fit = xs.map(fitAt);
    const my = ys.reduce((s, y) => s + y, 0) / n;
    const r2 = 1 - ys.reduce((s, y, i) => s + (y - fit[i]) ** 2, 0) / (ys.reduce((s, y) => s + (y - my) ** 2, 0) || 1);
    const cy = curve.map(([, y]) => y);
    const hi = Math.max(...cy);
    const lo = Math.min(...cy);
    const iHi = cy.indexOf(hi);
    const iLo = cy.indexOf(lo);
    const back = Math.max(iHi > 0 && iHi < cy.length - 1 ? hi - cy[cy.length - 1] : 0,
      iLo > 0 && iLo < cy.length - 1 ? cy[cy.length - 1] - lo : 0);
    if (hi > lo && back / (hi - lo) >= 0.25 && r2 - rs * rs >= 0.08) {
      const upFirst = iHi > 0 && iHi < cy.length - 1 && (iLo === 0 || iHi < iLo);
      out.push({ label: "Curves back", text: [`The trend ${upFirst ? "rises and then falls" : "falls and then rises"} ` +
        `instead of going one way, and ρ only measures one-way patterns. The smoothed curve accounts for ` +
        `${pct(Math.max(0, r2))} of the variation, against ${pct(rs * rs)} for ρ², so ρ understates how closely these ` +
        "line up."] });
    }
    // Uneven spread: the scatter around the curve at the two ends
    const resid = order.map((i) => ys[i] - fit[i]);
    const fifth = Math.floor(n / 5);
    if (fifth >= 8) {
      const iqr = (a: number[]) => {
        const s2 = [...a].sort((p, q) => p - q);
        const at = (q: number) => s2[Math.min(s2.length - 1, Math.max(0, Math.round(q * (s2.length - 1))))];
        return at(0.75) - at(0.25);
      };
      const low = iqr(resid.slice(0, fifth));
      const high = iqr(resid.slice(-fifth));
      const ratio = Math.max(low, high) / (Math.min(low, high) || 1e-9);
      if (ratio >= 2) {
        out.push({ label: "Uneven spread", text: [`Districts at the ${low > high ? "low" : "high"} end of `, { v: xv.short },
          ` scatter about ${ratio.toFixed(1)} times as widely around the trend as those at the other end, so the ` +
          "trend describes one end much better than the other."] });
      }
    }
  }
  // Regions: the pattern within each, against the pattern statewide
  const byRegion = new Map<string, number[]>();
  pts.forEach((p, i) => {
    const reg = rowOf.get(p.id)?.region;
    if (reg) byRegion.set(reg, [...(byRegion.get(reg) ?? []), i]);
  });
  const within = [...byRegion.values()].filter((ix) => ix.length >= 15)
    .map((ix) => spearman(ix.map((i) => xs[i]), ix.map((i) => ys[i])) ?? 0);
  if (within.length >= 3) {
    const med = median(within.map(Math.abs));
    // The median within regions, with its sign, for the text
    const medSigned = median(within);
    const against = within.filter((r) => Math.abs(r) >= 0.1 && Math.sign(r) !== Math.sign(rs)).length;
    if (med - Math.abs(rs) >= 0.2) {
      out.push({ label: "Regions sit apart", text: [`Within each region the pattern is stronger (median ρ about ` +
        `${rho(medSigned)}) than across the state (ρ = ${rho(rs)}). The regions sit at different levels, which blurs ` +
        "the pattern statewide."] });
    } else if (Math.abs(rs) >= 0.3 && med <= 0.5 * Math.abs(rs)) {
      out.push({ label: "Regions sit apart", text: [`Within regions the pattern mostly fades (median ρ about ` +
        `${rho(medSigned)}, against ${rho(rs)} statewide). Much of it comes from differences between regions, not ` +
        "between districts in the same part of the state."] });
    } else if (Math.abs(rs) >= 0.2 && against > within.length / 2) {
      out.push({ label: "Regions sit apart", text: ["In most regions the pattern runs the other way from the statewide " +
        "one, which comes from differences between regions."] });
    }
  }
  // Independence: districts that share towns share their towns' wealth
  if (TOWN_MEASURES.has(v.x) || TOWN_MEASURES.has(v.y)) {
    const count = new Map<string, number>();
    for (const p of pts) for (const t of rowOf.get(p.id)?.towns ?? []) count.set(t, (count.get(t) ?? 0) + 1);
    const sharing = pts.filter((p) => (rowOf.get(p.id)?.towns ?? []).some((t) => (count.get(t) ?? 0) > 1)).length;
    if (sharing / n >= 0.1) {
      out.push({ label: "Shared towns", text: [`${sharing} of these ${n} districts share towns with another district ` +
        "here, such as an elementary district and its regional one. Their towns' wealth counts for each district they " +
        "belong to, so the points aren't fully independent."] });
    }
  }
  return out;
}
