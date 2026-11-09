// The Housing and enrollment tab (#249): the Metropolitan Area Planning Council's studies of housing and school
// enrollment (its October 2017 brief and February 2024 update), the update rebuilt from the Census Bureau's housing
// counts and DESE's enrollment, each town's new growth beside them, MAPC's own 2017 data, and American Farmland Trust's
// table of cost of community services studies. Data: src/data/massppe/housing.json (export_explorer_data.housing_data,
// which fits each line, since a fit's chance needs scipy); schools ppe_report/evidence/housing_enrollment.py checks the
// figures against MAPC's and AFT's published ones. Tim's stance on the studies, as on the cap tab's: curious, open,
// healthily skeptical, leaning toward embrace.

import { addStyles, capital, el, placeTip, pointsAt, svgEl } from "./dom";
import { andList, change as changePct, digits, pct, rho as rhoText, signFor } from "./format";
import { median } from "./stats";
import { pointsAtGroup, scatter, ticksFor, type Group, type Point } from "./scatter";
import { GRAY, GROUP_HUES, ORANGE } from "./palette";
import { showWork, type Work } from "./showWork";
import evidence from "../../data/massppe/evidence.json";
import css from "./housing.css?inline"; // the styles for what this module builds (#237), added as it loads (#238)

addStyles(css);

interface Fit { n: number; slope: number; intercept: number; r2: number; p: number; rho: number }
interface District {
  id: string | null; name: string; type: string; mapc: boolean;
  /** Housing units, 2010 and 2020; enrollment, 2010/11 and 2019/20 */
  hu: [number, number]; enr: [number, number];
  /** New growth applied to the levy limit, FY2011 to FY2020, over the FY2010 limit: residential, and in all */
  ng_res: number; ng_all: number;
  /** Drawn off the chart, as MAPC drew it (Hancock) */
  off?: boolean;
}
interface Mapc17 { name: string; type: string; hu10: number; sf: number; mf: number; perm: number; enr: [number, number]; chg: number }
interface Study { state: string; place: string; res: number; ci: number; wol: number; by: string; year: number }
export interface HousingData {
  meta: { housing_years: [number, number]; enroll_fy: [number, number] };
  districts: District[];
  fits: Record<string, Fit>;
  mapc17: Mapc17[];
  cocs: Study[];
  c70: { fy: number; towns: number; below: number; above: number; property_pct: number; eqv_year: number; source: string };
}
interface Opts { openDistrict(id: string): void }

const MAPC_2024 = "https://www.mapc.org/learn/research-analysis/enrollment/";
const MAPC_2017 = "https://www.mapc.org/learn/research-analysis/enrollment-2017/";
const MAPC_2017_DATA = "https://www.mapc.org/wp-content/uploads/2017/10/SchoolEnrollmentandHousing_Data_Metadata.xlsx";
const MAPC_TYPES = "https://github.com/MAPC/mapcdatakeys";
const CENSUS = "https://www.census.gov/programs-surveys/decennial-census/about/rdo/summary-files.html";
const DESE_ENROLL = "https://educationtocareer.data.mass.gov/Students-and-Teachers/Enrollment-Grade-Race-Ethnicity-Gender-and-Selected-Populations/t8td-gens/about_data";
const DLS_NG = "https://dls-gw.dor.state.ma.us/reports/rdPage.aspx?rdReport=NewGrowth.NewGrowth_dash_v2_test";
const STATUTE = "https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXII/Chapter70/Section2";
const DESE_SUMMARY = "https://www.doe.mass.edu/finance/chapter70/fy2027/chapter-2027-whitepaper.docx";
const AFT = "https://farmlandinfo.org/?p=19267";
const AFT_PDF = "https://farmlandinfo.org/wp-content/uploads/sites/2/2019/09/cost-of-community-services-fact-sheet.pdf";
const KOTCHEN = "https://farmlandinfo.org/wp-content/uploads/sites/2/2019/09/Meta-analysis_COCS_1.pdf";
const RECORD = "https://github.com/timshores/schools/blob/main/ppe_report/evidence/housing_enrollment.md";

// MAPC's community types, in its order, each with the explorer's categorical hues in their fixed order; the shape
// tells them apart without color. MAPC's 2017 file names them in the plural.
const TYPES = ["Inner Core", "Regional Urban Center", "Maturing Suburb", "Developing Suburb", "Rural Town"];
const SHAPES: Group["shape"][] = ["circle", "square", "triangle", "circle", "square"];
const GROUPS: Record<string, Group> = Object.fromEntries(TYPES.map((t, k) =>
  [`t${k}`, { label: t, color: GROUP_HUES[k], shape: SHAPES[k], z: k }]));
const groupOf = (type: string) => `t${Math.max(0, TYPES.indexOf(type.replace(/s$/, "")))}`;

const grew = (a: [number, number]) => (a[1] / a[0] - 1) * 100;
const sharePts = (v: number) => pct(v / 100);
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
/** How often a slope this steep turns up by chance with no link underneath, in words */
const chance = (p: number) => {
  const n = Math.round(1 / p);
  return p < 0.05 ? "fewer than one time in twenty" : `about one time in ${WORDS[n] ?? n}`;
};
/** An axis's percent, with its sign */
const axisPct = (v: number) => `${signFor(v, digits(v))}${digits(v)}%`;
const spread = (r2: number) => (r2 < 0.01 ? "less than 1%" : pct(r2, 0));
const link = (text: string, href: string) => Object.assign(el("a", undefined, text), { href });
/** A paragraph of text and links */
function para(cls: string | undefined, ...parts: (string | Node)[]) {
  const p = el("p", cls);
  p.append(...parts);
  return p;
}

/** A scatterplot with MAPC's community types as its legend, each a toggle that picks its type out with a trend of its
 * own; a tooltip; zero lines; redrawn to the width it's given */
function plot(o: {
  label: string; xTitle: string; yTitle: string; xShort: string; yShort: string;
  points: () => Point[]; tip: (id: string) => (string | HTMLElement)[]; pick?: (id: string) => void;
}) {
  const figure = el("figure", "hs-figure");
  const legend = el("ul", "cw-legend hs-legend");
  const svg = svgEl("svg");
  svg.setAttribute("class", "hs-chart");
  svg.setAttribute("role", "img");
  const tip = el("div", "cw-tip");
  tip.hidden = true;
  figure.append(legend, svg, tip);
  let focus: string[] = [];

  function draw() {
    const pts = o.points();
    const width = Math.max(280, figure.clientWidth || 720);
    const height = Math.round(Math.min(460, Math.max(260, width * 0.6)));
    svg.setAttribute("aria-label", `${o.label}, ${pts.length} points. The data table below lists every value.`);
    scatter(svg, pts, {
      width, height, xFmt: axisPct, yFmt: axisPct, groups: GROUPS, smooth: true, focus,
      xTitle: o.xTitle, yTitle: o.yTitle, xTitleShort: o.xShort, yTitleShort: o.yShort, refY: 0, refX: 0,
      onHover: (p, pos) => {
        if (!p || !pos) {
          tip.hidden = true;
          return;
        }
        tip.replaceChildren(el("strong", undefined, p.name), ...o.tip(p.id));
        tip.hidden = false;
        placeTip(tip, svg, figure, width, pos);
      },
      onPick: o.pick ? (p) => o.pick!(p.id) : undefined,
    });
    drawLegend(pts);
  }

  function drawLegend(pts: Point[]) {
    legend.classList.toggle("has-focus", focus.length > 0);
    legend.replaceChildren(...Object.entries(GROUPS).map(([id, g]) => {
      const li = el("li");
      const key = el("span", `cw-key ${g.shape}`);
      key.style.setProperty("--c", g.color);
      const n = pts.filter((p) => p.group === id).length;
      const on = focus.includes(id);
      const b = el("button", `hs-key-btn${on ? " is-on" : ""}`);
      b.type = "button";
      b.setAttribute("aria-pressed", String(on));
      b.disabled = !n;
      b.append(key, el("span", undefined, `${g.label} (${n})`));
      if (on) {
        const line = el("span", "cw-key smooth");
        line.style.setProperty("--c", g.color);
        b.append(line);
      }
      b.title = on ? "Select to stop picking this type out" : "Select to pick this type out, with its own trend";
      b.addEventListener("click", () => {
        focus = on ? focus.filter((f) => f !== id) : [...focus, id];
        draw();
      });
      pointsAtGroup(b, svg, id);
      li.append(b);
      return li;
    }), (() => {
      const li = el("li");
      li.append(el("span", `cw-key smooth${focus.length ? " all" : ""}`),
        el("span", undefined, focus.length ? "Smoothed trend, every district" : "Smoothed trend"));
      return li;
    })());
  }

  new ResizeObserver(() => draw()).observe(figure);
  return { figure, draw };
}

/** A choice of what the horizontal axis shows, as a row of buttons */
function choice<K extends string>(label: string, options: [K, string][], start: K, on: (k: K) => void) {
  const box = el("div", "hs-choice");
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", label);
  box.append(el("span", "hs-choice-label", label));
  const buttons = options.map(([k, text]) => {
    const b = el("button", "hs-choice-btn", text);
    b.type = "button";
    b.setAttribute("aria-pressed", String(k === start));
    b.addEventListener("click", () => {
      for (const x of buttons) x.setAttribute("aria-pressed", String(x === b));
      on(k);
    });
    return b;
  });
  box.append(...buttons);
  return box;
}

/** A table in a fold of its own, for every value a chart draws */
function tableFold(summary: string, head: string[], rows: (string | number)[][], numeric: boolean[]) {
  const box = el("details", "hs-table-fold");
  box.append(el("summary", undefined, summary));
  const table = el("table", "hs-table");
  const tr = table.createTHead().insertRow();
  head.forEach((h, k) => tr.append(el("th", numeric[k] ? "num" : undefined, h)));
  const body = table.createTBody();
  for (const r of rows) {
    const row = body.insertRow();
    r.forEach((v, k) => row.append(el("td", numeric[k] ? "num" : undefined, String(v))));
  }
  const scroll = Object.assign(el("div", "table-scroll"), { tabIndex: 0 });
  scroll.append(table);
  box.append(scroll);
  return box;
}

/** The evidence record's summary sentence, once the record has run */
function checked(): { status: string; record?: string } {
  const ev = (evidence as Record<string, { links?: number; passed?: number; checked?: string; reviewed?: string | null } | undefined>).housing;
  if (!ev?.links) return { status: "The evidence record for these figures hasn't run yet." };
  return {
    status: `${ev.passed} of ${ev.links} checks against MAPC's, AFT's and DESE's published figures pass, as of ${ev.checked}; ` +
      (ev.reviewed ? `reviewed by ${ev.reviewed}.` : "not yet reviewed by a person."),
    record: RECORD,
  };
}

export function startHousing(root: HTMLElement, data: HousingData, opts: Opts) {
  const [h0, h1] = data.meta.housing_years;
  const [e0, e1] = data.meta.enroll_fy;
  const school = (fy: number) => `${fy - 1}/${String(fy).slice(2)}`;
  const ds = data.districts;
  const byName = new Map(ds.map((d) => [d.name, d]));
  const open = (name: string) => {
    const id = byName.get(name)?.id;
    if (id) opts.openDistrict(id);
  };
  /** The districts drawn off the charts of the decade, so the rest can spread out, each with its figures */
  const offNote = (again = false) => {
    const off = ds.filter((d) => d.off);
    if (!off.length) return "";
    if (again) return `${andList(off.map((d) => d.name))} ${off.length === 1 ? "is" : "are"} drawn off this chart too. `;
    const each = off.map((d) => `${d.name}, ${pct(grew(d.hu) / 100, 0)} more housing and ${d.enr[0]} students to ${d.enr[1]}`);
    return `${off.length === 1 ? "One district is" : `${capital(WORDS[off.length] ?? String(off.length))} districts are`} drawn off the chart so ` +
      `the rest can spread out, though the straight line counts ${off.length === 1 ? "it" : "them"}: ${each.join("; ")}. ` +
      (off.some((d) => d.name === "Hancock") ? "MAPC drew Hancock off its chart too. " : "");
  };
  const point = (d: District, x: number): Point => ({ x, y: grew(d.enr), id: d.name, name: d.name, group: groupOf(d.type) });
  const tipFor = (d: District) => [
    el("div", "cw-tip-towns", `MAPC community type: ${d.type}`),
    el("div", undefined, `Housing units: ${digits(d.hu[0])} to ${digits(d.hu[1])} (${changePct(grew(d.hu) / 100)})`),
    el("div", undefined, `Enrollment: ${digits(d.enr[0])} to ${digits(d.enr[1])} (${changePct(grew(d.enr) / 100)})`),
    ...(d.id ? [el("div", "cw-tip-hint", "Select to open in the School districts tab")] : []),
  ];

  // ---- 1. MAPC's 2024 update, rebuilt ----
  const s1 = el("section", "hs-section");
  {
    const f = data.fits.housing;
    const drawn = ds.filter((d) => !d.off);
    const off = ds.filter((d) => d.off);
    const lost = ds.filter((d) => d.enr[1] < d.enr[0]).length;
    const q = [...ds].sort((a, b) => grew(b.hu) - grew(a.hu)).slice(0, Math.round(ds.length / 4));
    const qLost = q.filter((d) => d.enr[1] < d.enr[0]).length;
    const chart = plot({
      label: `Scatterplot of each municipal school district's enrollment change, ${school(e0)} to ${school(e1)}, against its ` +
        `town's housing growth, ${h0} to ${h1}`,
      xTitle: `Housing units, change ${h0} to ${h1}`, xShort: "Housing growth",
      yTitle: "Enrollment change", yShort: "Enrollment change",
      points: () => drawn.map((d) => point(d, grew(d.hu))),
      tip: (id) => tipFor(byName.get(id)!), pick: open,
    });
    s1.append(el("h3", undefined, `Housing growth and enrollment, ${h0} to ${h1}`),
      para(undefined, `Each point is a town's own school district: its housing units in the ${h0} and ${h1} censuses, and its `,
        `enrollment in the ${school(e0)} and ${school(e1)} school years. Regional districts are left out, as MAPC left them `,
        "out, because their students come from more than one town."),
      chart.figure,
      para("hs-caption", `${ds.length} municipal school districts, colored by MAPC's community types. `, offNote(),
        "Select a district to open it in the School districts tab."),
      para("hs-finding", `A straight line through the ${f.n} districts rises ${f.slope.toFixed(2)} points of enrollment for each `,
        `point of housing growth, and housing growth accounts for ${spread(f.r2)} of the differences in enrollment change. `,
        `A slope that steep turns up by chance ${chance(f.p)} when there's no link at all. Of the ${ds.length} districts, `,
        `${lost} lost students; of the ${q.length} that added the most housing, ${qLost} did.`),
      para(undefined, "MAPC's update reached the same result: “We find no significant association between the change in ",
        "housing unit development and the change in school enrollment at the district level during this period.” ",
        link("Read MAPC's update", MAPC_2024), "."),
      typeTable(),
      showWork(work1(), "Show the work"),
      tableFold(`All ${ds.length} districts`, ["District", "MAPC type", `Housing ${h0}`, `Housing ${h1}`, "Change",
        `Enrollment ${school(e0)}`, `Enrollment ${school(e1)}`, "Change"],
      ds.map((d) => [d.name, d.type, digits(d.hu[0]), digits(d.hu[1]), changePct(grew(d.hu) / 100), digits(d.enr[0]),
        digits(d.enr[1]), changePct(grew(d.enr) / 100)]), [false, false, true, true, true, true, true, true]));
  }

  /** Housing and enrollment pooled by community type: statewide, and in MAPC's own region, as its Figure 2 gives it */
  function typeTable() {
    const box = el("div", "hs-types");
    const rowsFor = (xs: District[]) => [...TYPES, "All"].map((t) => {
      const g = t === "All" ? xs : xs.filter((d) => d.type === t);
      const hu = g.reduce((s, d) => [s[0] + d.hu[0], s[1] + d.hu[1]], [0, 0]) as [number, number];
      const en = g.reduce((s, d) => [s[0] + d.enr[0], s[1] + d.enr[1]], [0, 0]) as [number, number];
      return g.length ? [t === "All" ? "All districts" : t, g.length, changePct(grew(hu) / 100), changePct(grew(en) / 100)] : null;
    }).filter((r): r is (string | number)[] => r != null);
    for (const [title, xs] of [["Statewide", ds], ["MAPC's region, Metro Boston", ds.filter((d) => d.mapc)]] as const) {
      const fig = el("div", "hs-type-table");
      fig.append(el("h4", undefined, title));
      const table = el("table", "hs-table");
      const tr = table.createTHead().insertRow();
      ["Community type", "Districts", "Housing", "Enrollment"].forEach((h, k) => tr.append(el("th", k ? "num" : undefined, h)));
      const body = table.createTBody();
      for (const r of rowsFor(xs)) {
        const row = body.insertRow();
        r.forEach((v, k) => row.append(el("td", k ? "num" : undefined, String(v))));
      }
      const scroll = Object.assign(el("div", "table-scroll"), { tabIndex: 0 });
      scroll.append(table);
      fig.append(scroll);
      box.append(fig);
    }
    box.append(para("hs-caption", "Housing and enrollment summed over each type's districts. Every type added housing; ",
      "the suburbs and rural towns lost students. The Metro Boston figures match MAPC's own table to the tenth of a percent."));
    return box;
  }

  function work1(): Work {
    const hu = ds.reduce((s, d) => [s[0] + d.hu[0], s[1] + d.hu[1]], [0, 0]);
    const en = ds.reduce((s, d) => [s[0] + d.enr[0], s[1] + d.enr[1]], [0, 0]);
    const f = data.fits.housing;
    const g = data.fits.housing_drawn;
    return {
      steps: [
        { value: `${digits(hu[0])} to ${digits(hu[1])}`, label: "Housing units in the districts' towns", kind: "reported",
          source: "Census Bureau", detail: `April 1, ${h0} and ${h1}: the decennial censuses' redistricting files, table H1` },
        { value: `${digits(en[0])} to ${digits(en[1])}`, label: "Enrollment in those districts", kind: "reported", source: "DESE",
          detail: `October 1 of ${school(e0)} and of ${school(e1)}, every student the district enrolls` },
        { value: `${f.slope.toFixed(2)} points`, label: "The straight line's rise for each point of housing growth", kind: "computed",
          detail: `Least squares over all ${f.n}; it accounts for ${spread(f.r2)} of the spread, and the chance of a slope ` +
            `that steep with no link is ${f.p.toFixed(2)}. Leaving out ${andList(ds.filter((d) => d.off).map((d) => d.name))}, ` +
            `the line rises ${g.slope.toFixed(2)} points, accounts for ${spread(g.r2)}, and its chance is ${g.p.toFixed(2)}` },
        { value: changePct(f.intercept / 100), label: "Where the line crosses zero housing growth", kind: "computed",
          detail: "MAPC's update puts it at a 6 percent decline statewide" },
        { value: rhoText(f.rho), label: "Spearman's ρ, the explorer's usual measure of how two figures line up", kind: "computed" },
      ],
      notesHead: "What the comparison counts, and leaves out",
      assumptions: [
        "District enrollment counts the students a district teaches: students who come in through school choice count, and " +
        "the town's students at charter schools, or in another district by choice, don't. MAPC counted the same way.",
        "A decade's change in housing units, net of any torn down or combined; MAPC's 2017 brief used building permits " +
        "instead, which miss conversions and some towns' reports.",
        "Hancock is counted in the line, though drawn off the chart, as MAPC drew it. MAPC's update gives its students as 41 " +
        "to 47; DESE's count is 41 in 2009/10 and 48 in 2010/11, so MAPC's figure likely starts a year early. Every " +
        "other count MAPC gives matches DESE's from 2010/11.",
        "A pattern across districts says nothing about any one development, which may add students to a school that " +
        "has room for them or one that doesn't.",
      ],
      ...checked(),
      sources: [{ text: "MAPC, 2024 update", href: MAPC_2024 }, { text: "Census Bureau, redistricting data", href: CENSUS },
        { text: "DESE, enrollment", href: DESE_ENROLL }, { text: "MAPC's community types", href: MAPC_TYPES }],
    };
  }

  // ---- 2. MAPC's 2017 data: permits, single-family and multifamily ----
  const s2 = el("section", "hs-section");
  {
    type K = "all" | "sf" | "mf";
    let k: K = "all";
    const rows = data.mapc17;
    const byN = new Map(rows.map((r) => [r.name, r]));
    const xOf = (r: Mapc17, kk: K) => (kk === "all" ? r.perm : ((kk === "sf" ? r.sf : r.mf) / r.hu10) * 100);
    const WORD: Record<K, string> = { all: "homes", sf: "single-family homes", mf: "units in multifamily buildings" };
    const finding = el("p", "hs-finding");
    const chart = plot({
      label: "Scatterplot of each municipal school district's enrollment change, 2010/11 to 2016/17, against the homes " +
        "its town permitted, 2010 to 2016, from MAPC's 2017 data",
      xTitle: "Units permitted 2010 to 2016, share of 2010 housing", xShort: "Units permitted",
      yTitle: "Enrollment change", yShort: "Enrollment change",
      points: () => rows.map((r) => ({ x: xOf(r, k), y: r.chg, id: r.name, name: r.name, group: groupOf(r.type) })),
      tip: (id) => {
        const r = byN.get(id)!;
        return [el("div", "cw-tip-towns", `MAPC community type: ${r.type.replace(/s$/, "")}`),
          el("div", undefined, `Permitted, 2010 to 2016: ${digits(r.sf)} single-family, ${digits(r.mf)} multifamily ` +
            `(${sharePts(r.perm)} of its ${digits(r.hu10)} homes)`),
          el("div", undefined, `Enrollment: ${digits(r.enr[0])} to ${digits(r.enr[1])} (${changePct(r.chg / 100)})`),
          ...(byName.get(id)?.id ? [el("div", "cw-tip-hint", "Select to open in the School districts tab")] : [])];
      },
      pick: open,
    });
    const say = () => {
      const f = data.fits[`mapc17_${k}`];
      finding.textContent = `A straight line through the ${f.n} districts rises ${f.slope.toFixed(2)} points of enrollment for ` +
        `each point of ${WORD[k]} permitted, and permits account for ${spread(f.r2)} of the differences in enrollment ` +
        `change. A slope that steep turns up by chance ${chance(f.p)} when there's no link at all.`;
    };
    say();
    const tot = rows.reduce((s, r) => [s[0] + r.sf, s[1] + r.mf], [0, 0]);
    s2.append(el("h3", undefined, "Single-family and multifamily permits, 2010 to 2016"),
      para(undefined, "MAPC's 2017 brief compared the homes each town permitted with its district's enrollment over six ",
        "years, and ", link("published its data", MAPC_2017_DATA),
        `, with the permits split by type: ${digits(tot[0])} single-family homes and ${digits(tot[1])} units in buildings of `,
        "two or more. The worry MAPC describes is about “new housing, and especially new multifamily housing,” so the ",
        "chart can show each kind on its own."),
      choice("Permits", [["all", "All"], ["sf", "Single-family"], ["mf", "Multifamily"]], k, (x) => {
        k = x;
        chart.draw();
        say();
      }),
      chart.figure,
      para("hs-caption", `${rows.length} municipal school districts, as MAPC published them; permits are the Census Bureau's `,
        "building permit survey, as a share of each town's 2010 census housing count."),
      finding,
      para(undefined, "MAPC's conclusion: “The permits don't produce the pupils.” ", link("Read MAPC's 2017 brief", MAPC_2017), "."),
      showWork({
        steps: [
          { value: `${digits(tot[0] + tot[1])}`, label: "Housing units permitted, 2010 to 2016", kind: "reported", source: "MAPC",
            detail: "From the Census Bureau's building permit survey, by town, as MAPC's data file gives them" },
          { value: `${rows.filter((r) => r.chg < 0).length} of ${rows.length}`, label: "Districts that lost students, 2010/11 to 2016/17",
            kind: "reported", source: "MAPC", detail: "MAPC's brief: 159 of 234" },
          { value: "Share of 2010 housing", label: "Each town's permits over its 2010 census housing count", kind: "computed",
            detail: "MAPC's own share for all permits; the explorer's for each kind, from the same count" },
        ],
        notesHead: "What MAPC's data counts",
        assumptions: [
          "A permit is not a home built, and some towns don't report permits every month; MAPC names both limits.",
          "MAPC's brief tested the permits a year or two before each enrollment count; a longer lag might show more.",
        ],
        ...checked(),
        sources: [{ text: "MAPC, 2017 brief", href: MAPC_2017 }, { text: "MAPC's data file", href: MAPC_2017_DATA }],
      }),
      tableFold(`All ${rows.length} districts`, ["District", "MAPC type", "Single-family", "Multifamily", "Share of 2010 housing",
        "Enrollment 2010/11", "2016/17", "Change"],
      rows.map((r) => [r.name, r.type.replace(/s$/, ""), digits(r.sf), digits(r.mf), sharePts(r.perm), digits(r.enr[0]),
        digits(r.enr[1]), changePct(r.chg / 100)]), [false, false, true, true, true, true, true, true]));
  }

  // ---- 3. New growth, enrollment, and Chapter 70 ----
  const s3 = el("section", "hs-section");
  {
    type K = "ng_res" | "ng_all";
    let k: K = "ng_res";
    const c = data.c70;
    const finding = el("p", "hs-finding");
    const chart = plot({
      label: `Scatterplot of each municipal school district's enrollment change, ${school(e0)} to ${school(e1)}, against its ` +
        `town's new growth, FY${e0} to FY${e1}`,
      xTitle: `New growth FY${e0} to FY${e1}, share of the FY${e0 - 1} levy limit`, xShort: "New growth",
      yTitle: "Enrollment change", yShort: "Enrollment change",
      points: () => ds.filter((d) => !d.off).map((d) => point(d, d[k] * 100)),
      tip: (id) => {
        const d = byName.get(id)!;
        return [el("div", "cw-tip-towns", `MAPC community type: ${d.type}`),
          el("div", undefined, `Residential new growth: ${pct(d.ng_res)} of its FY${e0 - 1} levy limit; all: ${pct(d.ng_all)}`),
          el("div", undefined, `Enrollment: ${digits(d.enr[0])} to ${digits(d.enr[1])} (${changePct(grew(d.enr) / 100)})`),
          ...(d.id ? [el("div", "cw-tip-hint", "Select to open in the School districts tab")] : [])];
      },
      pick: open,
    });
    const say = () => {
      const f = data.fits[k];
      finding.textContent = `A straight line through the ${f.n} districts rises ${f.slope.toFixed(2)} points of enrollment for ` +
        `each point of ${k === "ng_res" ? "residential " : ""}new growth, and new growth accounts for ${spread(f.r2)} of the ` +
        `differences in enrollment change. A slope that steep turns up by chance ${chance(f.p)} when there's no link at all.`;
    };
    say();
    s3.append(el("h3", undefined, "New growth, enrollment and Chapter 70"),
      para(undefined, "New growth is the tax on new construction and other new taxable value, which Proposition 2½ adds to a ",
        "town's levy limit each year without a vote, as the ", link("Division of Local Services", DLS_NG), " certifies it. ",
        "Residential new growth is what new homes add to the levy. Here it is beside enrollment, over the same decade ",
        "as the first chart."),
      choice("New growth", [["ng_res", "Residential"], ["ng_all", "All"]], k, (x) => {
        k = x;
        chart.draw();
        say();
      }),
      chart.figure,
      para("hs-caption", `${ds.length} municipal school districts. New growth summed over FY${e0} to FY${e1}, the levy limits `,
        `of those years, against the town's FY${e0 - 1} limit. `, offNote(true)),
      finding,
      el("h4", undefined, "How Chapter 70 counts new growth and enrollment"),
      para(undefined, "New growth enters Chapter 70 in two places. Each year DESE starts a town's required local ",
        "contribution from the year before's and raises it by the town's municipal revenue growth factor, which the ",
        "Department of Revenue figures from the growth in the town's ",
        "local revenue. ", link("State law", STATUTE), " counts the levy limit's 2.5% and the town's average new growth over ",
        "the last three years, with unrestricted state aid and other recurring receipts. So more new growth makes the ",
        "requirement rise faster, until it passes the town's target and the formula brings it back down to the target. ",
        `In FY${c.fy}, ${c.below} of ${c.towns} towns started below their targets. New buildings also add to the town's `,
        "equalized valuation, the state's estimate of all its taxable property, which sets the property part of the ",
        `target: for FY${c.fy}, ${pct(c.property_pct, 3)} of the town's ${c.eqv_year} valuation.`),
      para(undefined, "Enrollment enters on the other side. The students a district pays for on October 1 set its foundation ",
        "budget for the next fiscal year: FY2027's aid rests on the October 1, 2025 count. Where a district's required ",
        "contribution and the year before's aid fall short of that budget, foundation aid makes up the difference. In ",
        "FY2027, 62 districts got foundation aid, and the rest got the year before's aid plus $160 per student, according ",
        "to ", link("DESE's summary of the formula", DESE_SUMMARY), "."),
      showWork({
        steps: [
          { value: "Dollars", label: "New growth applied to the levy limit, each year", kind: "reported", source: "DLS",
            detail: "Residential, and in all, from DLS's New Growth Analysis" },
          { value: "Share", label: `Summed FY${e0} to FY${e1}, over the FY${e0 - 1} levy limit`, kind: "computed" },
          { value: `${c.below} of ${c.towns}`, label: `Towns whose preliminary contribution was below target, FY${c.fy}`,
            kind: "reported", source: "DESE", detail: "From DESE's formula spreadsheet; its summary gives the same count" },
          { value: pct(c.property_pct, 3), label: `The share of ${c.eqv_year} equalized valuation each town's target counts`,
            kind: "reported", source: "DESE" },
        ],
        notesHead: "What the comparison counts",
        assumptions: [
          "New growth counts all new taxable value, renovations and additions as well as new homes, at the year " +
          "before's tax rate, so a town with a high rate gets more for the same building.",
          "A town's new growth and its housing growth line up only loosely: residential new growth and the change in " +
          "housing units have a ρ of about 0.4 across these districts.",
        ],
        ...checked(),
        sources: [{ text: "DLS, New Growth Analysis", href: DLS_NG }, { text: "M.G.L. c. 70, § 2", href: STATUTE },
          { text: `DESE, FY${c.fy} formula summary`, href: DESE_SUMMARY }],
      }));
  }

  // ---- 4. Cost of community services studies ----
  const s4 = el("section", "hs-section");
  {
    const studies = data.cocs.filter((s) => s.state !== "Indiana");
    const indiana = data.cocs.find((s) => s.state === "Indiana");
    const ma = studies.filter((s) => s.state === "Massachusetts");
    const med = (k: "res" | "ci" | "wol") => median(studies.map((s) => s[k]));
    const over = studies.filter((s) => s.res > 1).length;
    const years = studies.map((s) => s.year);
    s4.append(el("h3", undefined, "Cost of community services studies"),
      para(undefined, "These are the studies the claim at the top of this tab draws on. ", link("American Farmland Trust", AFT),
        `'s fact sheet lists ${studies.length} studies outside Indiana, from ${Math.min(...years)} to ${Math.max(...years)}, `,
        "each dividing a community's spending on services by the revenue it raised, for three kinds of land. ",
        `In ${over} of them, homes cost more than they paid: a median of $${med("res").toFixed(2)} for each dollar, against `,
        `$${med("ci").toFixed(2)} for commercial and industrial land and $${med("wol").toFixed(2)} for farms, forests and `,
        "open land."),
      strip(studies),
      para("hs-caption", `Each mark is one study, ${ma.length} of them in Massachusetts, in orange. The dark tick on each row `,
        "is its median, and the dashed line is $1, where costs equal revenue. ",
        indiana ? `AFT also lists a study of ${indiana.place} in Indiana, which its medians leave out, as these do. ` : "",
        "Point at a mark for the community and year."),
      para(undefined, "AFT is clear about what the studies are: “a snapshot in time of costs versus revenues for each type of ",
        "land use. They do not predict future costs or revenues or the impact of future growth.” A ",
        link("meta-analysis of 125 such studies", KOTCHEN), " by Matthew Kotchen and Stacey Schulte found two things that matter ",
        "here. Studies that count the school budget charge all of it to homes, though every kind of property pays toward ",
        "it, which raises the residential ratio by more than 15%. And a community's population growth made no difference to ",
        "its ratios, which led the authors to write that averages from existing land use “may be of questionable value for ",
        "making predictions about future, marginal changes.”"),
      tableFold(`The ${ma.length} Massachusetts studies`, ["Community", "Year", "Homes", "Commercial and industrial",
        "Working and open land", "By"], ma.map((s) => [s.place, s.year, `$${s.res.toFixed(2)}`, `$${s.ci.toFixed(2)}`,
        `$${s.wol.toFixed(2)}`, s.by]), [false, true, true, true, true, false]),
      showWork({
        steps: [
          { value: `${data.cocs.length} rows`, label: "AFT's summary of studies", kind: "reported", source: "AFT",
            detail: "Read from the fact sheet's table, October 2025 edition" },
          { value: `$${med("res").toFixed(2)}, $${med("ci").toFixed(2)}, $${med("wol").toFixed(2)}`, label: "Medians outside Indiana",
            kind: "computed", detail: "AFT's chart gives $1.16, $0.30 and $0.37" },
        ],
        notesHead: "What to keep in mind",
        assumptions: [
          "A ratio is an average over every home a community has, the year it was studied, not the cost of the next one.",
          "Four pairs of Massachusetts rows carry the same three ratios: Franklin and Great Barrington, Gill and " +
          "Haverhill, Southborough and Upton, Sterling and Westford. Some may be studies of two towns together; the " +
          "fact sheet doesn't say.",
          `${capital(WORDS[ma.filter((x) => x.year < 2002).length] ?? String(ma.filter((x) => x.year < 2002).length))} of the ` +
          `${ma.length} Massachusetts studies are from before 2002, the year statewide enrollment peaked, according to ` +
          "MAPC's 2017 brief.",
        ],
        ...checked(),
        sources: [{ text: "AFT, Cost of Community Services Studies (PDF)", href: AFT_PDF },
          { text: "Kotchen and Schulte, working paper, 2008; International Regional Science Review, 2009", href: KOTCHEN }],
      }));
  }

  /** Every study's three ratios, a row each, the $1 line where costs equal revenue; Massachusetts in orange */
  function strip(studies: Study[]) {
    const ROWS: ["res" | "ci" | "wol", string][] = [["res", "Homes"], ["ci", "Commercial and industrial"], ["wol", "Working and open land"]];
    const figure = el("figure", "hs-figure hs-strip");
    const svg = svgEl("svg");
    svg.setAttribute("class", "hs-chart");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Strip chart of the cost of services per dollar of revenue in ${studies.length} cost of ` +
      "community services studies, for homes, commercial and industrial land, and working and open land. The " +
      "Massachusetts studies are listed in the table below.");
    const tip = el("div", "cw-tip");
    tip.hidden = true;
    const legend = el("ul", "cw-legend hs-legend");
    for (const [color, text] of [[ORANGE, "Massachusetts"], [GRAY, "Other states"]]) {
      const li = el("li");
      const key = el("span", "cw-key circle");
      key.style.setProperty("--c", color);
      li.append(key, el("span", undefined, text));
      legend.append(li);
    }
    figure.append(legend, svg, tip);
    const max = Math.max(2.3, ...studies.flatMap((s) => [s.res, s.ci, s.wol]));
    function draw() {
      svg.replaceChildren();
      const width = Math.max(280, figure.clientWidth || 720);
      const narrow = width < 520;
      const m = { top: 8, right: 18, bottom: 40, left: narrow ? 22 : 170 };
      const band = narrow ? 72 : 54;
      const height = m.top + m.bottom + band * ROWS.length;
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      const x = (v: number) => m.left + (v / max) * (width - m.left - m.right);
      const ticks = ticksFor(0, max).filter((t) => t <= max);
      for (const t of ticks) {
        svgEl("line", { x1: x(t), x2: x(t), y1: m.top, y2: height - m.bottom, class: "hs-grid" }, svg);
        svgEl("text", { x: x(t), y: height - m.bottom + 16, class: "hs-tick", "text-anchor": "middle" }, svg).textContent = `$${t.toFixed(2)}`;
      }
      svgEl("line", { x1: x(1), x2: x(1), y1: m.top, y2: height - m.bottom, class: "sc-ref" }, svg);
      svgEl("text", { x: (m.left + width - m.right) / 2, y: height - 4, class: "hs-axis-title", "text-anchor": "middle" }, svg)
        .textContent = "Cost of services for each dollar of revenue";
      ROWS.forEach(([k, label], r) => {
        const y0 = m.top + band * r;
        const mid = y0 + (narrow ? band * 0.64 : band / 2);
        if (narrow) svgEl("text", { x: m.left, y: y0 + 14, class: "hs-row-label" }, svg).textContent = label;
        else svgEl("text", { x: m.left - 10, y: mid + 4, class: "hs-row-label", "text-anchor": "end" }, svg).textContent = label;
        // A steady jitter, so a redraw keeps each mark in its place; Massachusetts on top
        const sorted = [...studies].sort((a, b) => Number(a.state === "Massachusetts") - Number(b.state === "Massachusetts"));
        sorted.forEach((s, i) => {
          const isMa = s.state === "Massachusetts";
          const j = (((i * 2654435761) >>> 0) % 1000) / 1000 - 0.5;
          const c = svgEl("circle", { cx: x(s[k]), cy: mid + j * (band * (narrow ? 0.38 : 0.5)), r: isMa ? 4.5 : 3.5,
            fill: isMa ? ORANGE : GRAY, class: `hs-dot${isMa ? " is-ma" : ""}` }, svg);
          c.addEventListener("pointerenter", (ev) => {
            tip.replaceChildren(el("strong", undefined, `${s.place}, ${s.state}`),
              el("div", undefined, `${label}: $${s[k].toFixed(2)} for each dollar of revenue`),
              el("div", "cw-tip-towns", `${s.by}, ${s.year}`));
            tip.hidden = false;
            const box = svg.getBoundingClientRect();
            placeTip(tip, svg, figure, width, { left: ((ev.clientX - box.left) / box.width) * width, top: ((ev.clientY - box.top) / box.height) * height });
          });
          c.addEventListener("pointerleave", () => (tip.hidden = true));
        });
        const md = median(studies.map((s) => s[k]));
        svgEl("line", { x1: x(md), x2: x(md), y1: mid - band * 0.36, y2: mid + band * 0.36, class: "hs-median" }, svg);
      });
    }
    pointsAt(legend.firstElementChild as HTMLElement, svg, () => svg.querySelectorAll(".hs-dot.is-ma"), false);
    new ResizeObserver(() => draw()).observe(figure);
    return figure;
  }

  root.replaceChildren(s1, s2, s3, s4);
  return { render() { /* each chart draws itself as its width arrives */ } };
}
