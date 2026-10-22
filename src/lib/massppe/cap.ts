// The 82.5% cap tab: each town's Chapter 70 target local contribution, from DESE's complete
// formula spreadsheet, beside what it would be under another cap or none. Data:
// src/data/massppe/cap.json (export_explorer_data.cap_data).
//
// Any cap keeps the formula's rule that targets add up to 59% of all foundation budgets, so
// both statewide percentages scale by one factor f, found here by bisection, with each town's
// target min(yield x f, cap x foundation budget). f is 1 at 82.5%; at 100% and with no cap
// this reproduces Michael Naughton and Tupper Brown's FY2026 targets to the dollar.

import { groupedPicker } from "./picker";
import { scatter, type Group, type Point } from "./scatter";

interface CapTown {
  lea: number; name: string; id: string; county: string | null; region: string | null;
  pop: number | null; pop_income: number | null;
  eqv: number; income: number; cey: number; foundation: number; max: number; target: number; nocap: number;
  required: number | null; prior: number | null; capped: boolean; floor: boolean;
}

interface CapYear {
  fy: number; eqv_year: number; income_year: number; property_pct: number; income_pct: number; max_pct: number;
  factor: number; source: string; whitepaper: string; pop_year: number;
  totals: { cey: number; target: number; foundation: number; required: number; capped: number;
    up: number; up_sum: number; down: number; down_sum: number };
  towns: CapTown[];
}

export interface CapData { meta: { latest: number }; years: Record<string, CapYear> }

const usd = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
const big = (v: number) => (Math.abs(v) >= 1e9 ? `$${(Math.abs(v) / 1e9).toFixed(2)} billion` : `$${(Math.abs(v) / 1e6).toFixed(1)} million`);
const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;
const rate = (v: number) => `${(v * 100).toFixed(3)}%`;
const capPct = (c: number) => `${Number((c * 100).toFixed(1))}%`;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN;
};
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
const link = (text: string, href: string) => Object.assign(el("a", undefined, text), { href });

const GROUPS: Record<string, Group> = {
  capped: { label: "At today's cap", color: "#6250d6", shape: "square", z: 2 },
  below: { label: "Below it", color: "#2a78d6", shape: "circle", z: 1 },
  town: { label: "Selected town", color: "#b65c3d", shape: "triangle", z: 3 },
};

type YKey = "per_res" | "share_income" | "dollars" | "share_cey";
type XKey = "cey_pc" | "income_pc" | "eqv_pc" | "cey_pct";
const Y_OPTIONS: Record<YKey, { label: string; fmt: (v: number) => string; axis: (v: number) => string }> = {
  per_res: { label: "Change in target, per resident", fmt: signed, axis: (v) => signed(v) },
  share_income: { label: "Change in target, as a share of income", fmt: (v) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(2)}%`, axis: (v) => `${(v * 100).toFixed(1)}%` },
  dollars: { label: "Change in target", fmt: signed, axis: (v) => `${v < 0 ? "−" : ""}$${Math.abs(v) >= 1e6 ? `${Math.abs(v / 1e6).toFixed(0)}M` : `${Math.abs(v / 1e3).toFixed(0)}K`}` },
  // Naughton and Brown's measure: today's target as a share of the town's yield, its "calculated obligation"
  share_cey: { label: "Today's target as a share of the combined effort yield", fmt: (v) => pct(v, 1), axis: (v) => pct(v) },
};
const X_OPTIONS: Record<XKey, { label: string; log: boolean; fmt: (v: number) => string; axis: (v: number) => string }> = {
  // Wealth as the formula measures it, Naughton and Brown's horizontal axis
  cey_pc: { label: "Combined effort yield per resident", log: true, fmt: usd, axis: (v) => `$${v >= 1e4 ? `${Math.round(v / 1000)}K` : Math.round(v).toLocaleString("en-US")}` },
  income_pc: { label: "Income per resident", log: true, fmt: usd, axis: (v) => `$${Math.round(v / 1000)}K` },
  eqv_pc: { label: "Equalized property value per resident", log: true, fmt: usd, axis: (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1000)}K`) },
  cey_pct: { label: "Combined effort yield as a share of foundation budget", log: true, fmt: (v) => pct(v), axis: (v) => pct(v) },
};

/** The factor on DESE's percentages that keeps capped targets at the year's total. */
function solve(towns: CapTown[], total: number, cap: number | null): number {
  let lo = 0;
  let hi = 4;
  for (let k = 0; k < 80; k++) {
    const f = (lo + hi) / 2;
    let sum = 0;
    for (const t of towns) sum += cap == null ? t.cey * f : Math.min(t.cey * f, cap * t.foundation);
    if (sum < total) lo = f;
    else hi = f;
  }
  return (lo + hi) / 2;
}

export function startCap(root: HTMLElement, data: CapData, opts: { town: string }) {
  const yearKeys = Object.keys(data.years).sort().reverse();
  let fy = String(data.meta.latest);
  let townId = data.years[fy].towns.some((t) => t.id === opts.town) ? opts.town : "leverett";
  let yKey: YKey = "per_res";
  let xKey: XKey = "cey_pc";
  /** The cap to compare with today's: null for none */
  let scenario: number | null = null;
  let level = 1;

  // ---- Layout ----
  const yearRow = el("div", "cap-year");
  yearRow.append(el("span", undefined, "Year"));
  const yearButtons = yearKeys.map((k) => {
    const b = el("button", "cap-year-btn", `FY${k}`);
    b.type = "button";
    b.addEventListener("click", () => {
      fy = k;
      render();
    });
    yearRow.append(b);
    return b;
  });
  const how = el("section", "cap-section");
  const tiles = el("div", "cap-tiles");

  // The scenario: no cap, or a cap of the reader's choosing
  const scen = el("section", "cap-section cap-scenario");
  const scenHead = el("h3", undefined, "Try another cap");
  const scenRow = el("div", "cap-scen-row");
  const radio = (value: string, checked: boolean) => {
    const r = el("input");
    r.type = "radio";
    r.name = "cap-scenario";
    r.value = value;
    r.checked = checked;
    return r;
  };
  const noneRadio = radio("none", true);
  const levelRadio = radio("level", false);
  const slider = el("input");
  slider.type = "range";
  slider.min = "60";
  slider.max = "150";
  slider.step = "0.5";
  slider.value = "100";
  slider.setAttribute("aria-label", "Cap, as a share of the foundation budget");
  const out = el("output", "cap-level", "100%");
  const noneLabel = el("label", "cap-radio");
  noneLabel.append(noneRadio, el("span", undefined, "No cap"));
  const levelLabel = el("label", "cap-radio");
  levelLabel.append(levelRadio, el("span", undefined, "A cap of"));
  scenRow.append(el("span", "cap-scen-lead", "Compare today's 82.5% cap with"), noneLabel, levelLabel, slider, out);
  const scenNote = el("p", "cap-note");
  scen.append(scenHead, scenRow, scenNote);
  const setScenario = () => {
    level = Number(slider.value) / 100;
    out.textContent = capPct(level);
    scenario = levelRadio.checked ? level : null;
    render();
  };
  noneRadio.addEventListener("change", setScenario);
  levelRadio.addEventListener("change", setScenario);
  slider.addEventListener("input", () => {
    levelRadio.checked = true;
    setScenario();
  });

  const lookup = el("section", "cap-section");
  const chartBox = el("section", "cap-section");
  const fifths = el("section", "cap-section");
  root.append(yearRow, how, tiles, scen, lookup, chartBox, fifths);

  // The town picker: the explorer's searchable menu, towns by county
  const pickWrap = el("div", "control cap-pick");
  const pickLabel = el("span", undefined, "Town");
  pickLabel.id = "cap-town-label";
  const select = el("select");
  select.id = "cap-town";
  const byCounty = new Map<string, CapTown[]>();
  for (const t of [...data.years[fy].towns].sort((a, b) => a.name.localeCompare(b.name))) {
    const c = t.county ? `${t.county} County` : "Other";
    byCounty.set(c, [...(byCounty.get(c) ?? []), t]);
  }
  for (const c of [...byCounty.keys()].sort()) {
    const og = el("optgroup");
    og.label = c;
    for (const t of byCounty.get(c)!) og.append(new Option(t.name, t.id));
    select.append(og);
  }
  select.value = townId;
  pickWrap.append(pickLabel, select);
  const steps = el("div", "cap-steps");
  lookup.append(el("h3", undefined, "One town, step by step"), pickWrap, steps);
  const picker = groupedPicker(select, "cap-town-label", "towns");
  select.addEventListener("change", () => {
    townId = select.value;
    render();
  });

  // Chart controls
  const chartHead = el("h3", undefined, "Who pays more because of the cap?");
  const chartIntro = el("p", "cap-note");
  const chartControls = el("div", "cap-controls");
  const mkSelect = <K extends string>(label: string, options: Record<K, { label: string }>, value: K, on: (v: K) => void) => {
    const wrap = el("label", "cap-field");
    const s = el("select");
    for (const [k, o] of Object.entries(options) as [K, { label: string }][]) s.append(new Option(o.label, k));
    s.value = value;
    s.addEventListener("change", () => on(s.value as K));
    wrap.append(el("span", undefined, label), s);
    chartControls.append(wrap);
  };
  mkSelect("Vertical", Y_OPTIONS, yKey, (v) => {
    yKey = v;
    render();
  });
  mkSelect("Horizontal", X_OPTIONS, xKey, (v) => {
    xKey = v;
    render();
  });
  const legend = el("ul", "cw-legend");
  const figure = el("figure", "cap-figure");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "cap-chart");
  svg.setAttribute("role", "img");
  const tip = el("div", "cw-tip");
  tip.hidden = true;
  figure.append(legend, svg, tip);
  chartBox.append(chartHead, chartIntro, chartControls, figure);

  function render() {
    const y = data.years[fy];
    const towns = y.towns;
    const t = towns.find((x) => x.id === townId) ?? towns[0];
    yearButtons.forEach((b, k) => b.classList.toggle("is-on", yearKeys[k] === fy));
    picker.sync();

    // The scenario's targets: the same statewide total, a different cap
    const f = solve(towns, y.totals.target, scenario);
    const alt = new Map(towns.map((x) => [x.id,
      Math.round(scenario == null ? x.cey * f : Math.min(x.cey * f, scenario * x.foundation))]));
    const change = (x: CapTown) => alt.get(x.id)! - x.target;
    const scenName = scenario == null ? "with no cap" : `with a ${capPct(scenario)} cap`;
    const atScenarioCap = scenario == null ? 0 : towns.filter((x) => x.foundation && alt.get(x.id)! >= Math.round(scenario! * x.foundation) - 1).length;
    const up = towns.filter((x) => change(x) > 0);
    const down = towns.filter((x) => change(x) < 0);
    const upSum = up.reduce((a, x) => a + change(x), 0);
    const downSum = down.reduce((a, x) => a + change(x), 0);

    // How the cap works, in this year's numbers
    const lift = 1 / y.factor - 1;
    how.replaceChildren(el("h3", undefined, "How the cap works"));
    const p1 = el("p");
    p1.append(`Chapter 70 asks every town for the same share of its wealth. For FY${y.fy}, the formula takes ` +
      `${rate(y.property_pct)} of each town's January ${y.eqv_year} equalized property value and ${rate(y.income_pct)} of ` +
      `its residents' ${y.income_year} income; the sum is the town's combined effort yield. A town's target local ` +
      `contribution is that yield or ${pct(y.max_pct, 1)} of its foundation budget, whichever is less, and ` +
      `${y.totals.capped} towns are at the cap. Their districts get at least ${pct(1 - y.max_pct, 1)} of their foundation ` +
      "budgets from the state, however wealthy the towns.");
    const p2 = el("p");
    p2.append(`The state sets the two percentages so that targets, after the cap, add up to 59% of all foundation ` +
      `budgets: ${big(y.totals.target)} in FY${y.fy}. To get there with the cap in place, the percentages have to climb ` +
      `until the yields add up to ${big(y.totals.cey)}, ${big(y.totals.cey - y.totals.target)} more. Every town below the ` +
      `cap pays the higher percentages. Without the cap, the same 59% would come from ${rate(y.property_pct * y.factor)} ` +
      `of property value and ${rate(y.income_pct * y.factor)} of income: the cap makes the percentages ${pct(lift)} higher ` +
      "than they would otherwise be (", link(`DESE's FY${y.fy} summary`, y.whitepaper), ", ",
      link("formula spreadsheet", y.source), ").");
    how.append(p1, p2);

    // Income fifths: who is in each, for the tiles and the table
    const withIncome = towns.filter((x) => x.pop_income && x.foundation).map((x) => ({ x, inc: x.income / x.pop_income! }))
      .sort((a, b) => a.inc - b.inc);
    const n = withIncome.length;
    const fifthOf = new Map<string, number>();
    withIncome.forEach(({ x }, k) => fifthOf.set(x.id, Math.min(4, Math.floor((k * 5) / n))));
    const upTop = up.filter((x) => fifthOf.get(x.id) === 4).length;

    tiles.replaceChildren(
      tile(`Towns at the cap, FY${y.fy}`, String(y.totals.capped),
        [`Of 351; each district's state aid is at least ${pct(1 - y.max_pct, 1)} of its foundation budget`]),
      tile("Statewide percentages", `${rate(y.property_pct)} · ${rate(y.income_pct)}`,
        ["Of property value and of income, with the cap", `With no cap: ${rate(y.property_pct * y.factor)} · ${rate(y.income_pct * y.factor)}`]),
      tile("What the cap moves", big(y.totals.up_sum), [
        `With no cap, ${y.totals.down} towns' targets would fall by ${big(-y.totals.down_sum)} in all`,
        `and ${y.totals.up} towns' would rise by as much`]),
    );

    scenNote.textContent = (scenario == null
      ? `With no cap, the percentages would be ${rate(y.property_pct * f)} and ${rate(y.income_pct * f)}. `
      : `With a ${capPct(scenario)} cap, the percentages would be ${rate(y.property_pct * f)} and ${rate(y.income_pct * f)}, ` +
        `and ${atScenarioCap} towns would be at that cap. `) +
      `${down.length} towns' FY${y.fy} targets would fall, by ${big(-downSum)} in all, and ${up.length} towns' would rise by ` +
      `${big(upSum)}` + (up.length ? `, ${upTop} of them among the fifth of towns with the highest income per resident.` : ".") +
      " The town lookup, the chart, and the table below all follow this choice.";

    // One town
    const prop = t.eqv * y.property_pct;
    const inc = t.income * y.income_pct;
    const ch = change(t);
    const rows: [string, string, string?][] = [
      [`Equalized property value, January ${y.eqv_year}`, usd(t.eqv), `× ${rate(y.property_pct)} = ${usd(prop)}`],
      [`Residents' income, ${y.income_year}`, usd(t.income), `× ${rate(y.income_pct)} = ${usd(inc)}`],
      ["Combined effort yield", usd(t.cey), t.foundation ? `${pct(t.cey / t.foundation)} of its ${usd(t.foundation)} foundation budget` : "No foundation budget"],
      [`Target local contribution, FY${y.fy}`, usd(t.target), t.capped ? `Capped at ${pct(y.max_pct, 1)} of foundation` : "Its yield: below the cap"],
      [capitalize(scenName), usd(alt.get(t.id)!), `${signed(ch)}${t.pop ? `, ${signed(ch / t.pop)} per resident` : ""}`],
    ];
    if (t.required != null) {
      rows.push([`Required contribution, FY${y.fy}`, usd(t.required),
        t.required < t.target ? "Below its target: requirements climb toward targets a step a year" :
          t.required > t.target ? "Above its target" : "Equal to its target"]);
    }
    const table = el("table", "cap-steps-table");
    for (const [label, value, note] of rows) {
      const r = table.insertRow();
      const th = el("th", undefined, label);
      th.scope = "row";
      r.append(th, el("td", "num", value), el("td", "note", note ?? ""));
    }
    const verdict = el("p", "cap-verdict");
    verdict.textContent = ch < 0
      ? `${capitalize(scenName)}, ${t.name}'s FY${y.fy} target would be ${usd(-ch)} lower.`
      : ch > 0 ? `${capitalize(scenName)}, ${t.name}'s FY${y.fy} target would be ${usd(ch)} higher.`
        : `${capitalize(scenName)}, ${t.name}'s target would not change.`;
    steps.replaceChildren(table, verdict);

    // The chart: every town, the selected one marked
    const yo = Y_OPTIONS[yKey];
    const xo = X_OPTIONS[xKey];
    const value = (x: CapTown, k: XKey | YKey): number | null => {
      const c = change(x);
      switch (k) {
        case "per_res": return x.pop ? c / x.pop : null;
        case "share_income": return x.income ? c / x.income : null;
        case "dollars": return c;
        case "share_cey": return x.cey ? x.target / x.cey : null;
        case "cey_pc": return x.pop ? x.cey / x.pop : null;
        case "income_pc": return x.pop_income ? x.income / x.pop_income : null;
        case "eqv_pc": return x.pop ? x.eqv / x.pop : null;
        case "cey_pct": return x.foundation ? x.cey / x.foundation : null;
      }
    };
    chartIntro.textContent = yKey === "share_cey"
      ? `Each point is a town: across, ${xo.label.toLowerCase()}; up and down, its FY${y.fy} target as a share of its ` +
        "combined effort yield. Below 100%, the cap holds the target under the yield."
      : `Each point is a town: across, ${xo.label.toLowerCase()}; up or down, how its FY${y.fy} target would change ` +
        `${scenName}. Below zero, the town's target is higher with today's cap.`;
    const pts: Point[] = [];
    for (const x of towns) {
      const xv = value(x, xKey);
      const yv = value(x, yKey);
      if (xv == null || yv == null || !isFinite(xv) || !isFinite(yv) || xv <= 0 || !x.foundation) continue;
      pts.push({ x: xv, y: yv, id: x.id, name: x.name, group: x.id === t.id ? "town" : x.capped ? "capped" : "below", label: x.id === t.id });
    }
    const width = Math.max(300, figure.clientWidth || 800);
    const height = Math.round(Math.min(460, Math.max(280, width * 0.5)));
    svg.setAttribute("aria-label", `Scatterplot of ${yo.label.toLowerCase()} against ${xo.label.toLowerCase()} for ${pts.length} towns, FY${y.fy}.`);
    scatter(svg, pts, {
      width, height, logX: xo.log, xFmt: xo.axis, yFmt: yo.axis,
      xTitle: width < 640 ? xo.label.replace(" as a share of foundation budget", " (% of foundation)") : xo.label,
      yTitle: width < 640 ? (yKey === "share_cey" ? "Target ÷ yield" : "Change in target") : yo.label,
      groups: GROUPS, smooth: false, refY: yKey === "share_cey" ? 1 : 0,
      onHover: (p, pos) => {
        if (!p || !pos) {
          tip.hidden = true;
          return;
        }
        const x = towns.find((q) => q.id === p.id)!;
        tip.replaceChildren(el("strong", undefined, x.name),
          el("div", undefined, `Target today: ${usd(x.target)}${x.capped ? " (at the cap)" : ""}`),
          el("div", undefined, `${capitalize(scenName)}: ${usd(alt.get(x.id)!)} (${signed(change(x))})`),
          el("div", undefined, `${xo.label}: ${xo.fmt(p.x)}`),
          el("div", "cw-tip-hint", "Select to walk through it above"));
        tip.hidden = false;
        const box = svg.getBoundingClientRect();
        const fig = figure.getBoundingClientRect();
        const scale = box.width / width;
        tip.style.left = `${Math.min(box.left - fig.left + pos.left * scale + 12, fig.width - tip.offsetWidth - 4)}px`;
        tip.style.top = `${Math.max(0, box.top - fig.top + pos.top * scale - tip.offsetHeight - 10)}px`;
      },
      onPick: (p) => {
        townId = p.id;
        select.value = townId;
        render();
        lookup.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    });
    legend.replaceChildren(...Object.values(GROUPS).map((g) => {
      const li = el("li");
      const key = el("span", `cw-key ${g.shape}`);
      key.style.setProperty("--c", g.color);
      li.append(key, el("span", undefined, g.label === "Selected town" ? t.name : g.label));
      return li;
    }));

    // By income: each fifth of towns
    const tbl = el("table", "cap-fifths-table");
    const hr = tbl.createTHead().insertRow();
    for (const h of ["Towns by income per resident", "Towns", "At today's cap", "Median income per resident",
      `Change in targets ${scenName}`, "Median change per resident", "Median change as a share of income"]) hr.append(el("th", undefined, h));
    const tb = tbl.createTBody();
    const names = ["Lowest fifth", "Second fifth", "Middle fifth", "Fourth fifth", "Highest fifth"];
    for (let q = 0; q < 5; q++) {
      const part = withIncome.filter(({ x }) => fifthOf.get(x.id) === q);
      const sum = part.reduce((a, { x }) => a + change(x), 0);
      const r = tb.insertRow();
      const th = el("th", undefined, names[q]);
      th.scope = "row";
      r.append(th, el("td", "num", String(part.length)), el("td", "num", String(part.filter(({ x }) => x.capped).length)),
        el("td", "num", usd(median(part.map((p) => p.inc)))),
        el("td", "num", `${sum < 0 ? "−" : "+"}${big(sum)}`),
        el("td", "num", signed(median(part.map(({ x }) => change(x) / (x.pop || 1))))),
        el("td", "num", `${(median(part.map(({ x }) => change(x) / x.income)) * 100).toFixed(2)}%`));
    }
    const scroll = Object.assign(el("div", "table-scroll"), { tabIndex: 0 });
    scroll.append(tbl);
    fifths.replaceChildren(el("h3", undefined, "By income"),
      el("p", "cap-note", `The ${n} towns with a foundation budget, in five groups by income per resident (${y.income_year} ` +
        `income over the July ${y.income_year} population estimate). A negative change means the group's targets are ` +
        `higher with today's cap than they would be ${scenName}.`),
      scroll);
  }

  function tile(label: string, value: string, details: string[]) {
    const d = el("div", "tile");
    d.append(el("div", "tile-label", label), el("div", "tile-value", value));
    details.forEach((x) => d.append(el("div", "tile-detail", x)));
    return d;
  }

  let lastW = 0;
  new ResizeObserver(() => {
    const w = figure.clientWidth;
    if (w > 0 && Math.abs(w - lastW) > 8) {
      lastW = w;
      render();
    }
  }).observe(figure);

  return { render };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
