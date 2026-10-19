// District view of the Western MA per-pupil expenditure explorer.
// Data: public/massppe/data/explorer.json, written by the report pipeline
// (github.com/timshores/schools, ppe_report/export_explorer_data.py).

import { compact, lines, niceTicks, stackedColumns, type Panel, type Series, type Val } from "./charts";

type Values = Val[];

interface Entity {
  id: string;
  name: string;
  kind: "district" | "cohort" | "western";
  cohort: string | null;
  members?: number;
  fte?: number;
  compare?: string;
  ppe: Record<string, Values>;
  enroll: { in_district: Values; foundation: Values; out_of_district: Values };
  nss: { ch70_aid: Values; required_local: Values; above_required: Values };
}

interface Meta {
  years: number[];
  latest: number;
  start: number;
  categories: string[];
  cohorts: Record<string, { label: string; short: string; range: [number, number | null] }>;
  cpi: Record<string, number>;
}

interface Data {
  meta: Meta;
  entities: Entity[];
}

type Compare = "cohort" | "western" | "none";
type Dollars = "nominal" | "real";

const PPE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948", "#8f8a7f"];
const NSS_SERIES = [
  { key: "ch70_aid", label: "Chapter 70 state aid", color: "#008300" },
  { key: "required_local", label: "Required local contribution", color: "#eda100" },
  { key: "above_required", label: "Spending above required", color: "#6250d6" },
] as const;
const ENROLL_SERIES = [
  { key: "in_district", label: "In-district FTE", color: "#2a78d6" },
  { key: "foundation", label: "Foundation enrollment", color: "#eb6834" },
  { key: "out_of_district", label: "Out-of-district FTE", color: "#1baf7a" },
] as const;
const COMPARE_COLOR = "#524f45";

const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const fte = (v: number) => (v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1));
const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)}%`;
const sentence = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

function cohortTitle(meta: Meta, key: string) {
  const c = meta.cohorts[key];
  const [lo, hi] = c.range;
  if (hi == null) return `${c.short} (over ${(lo - 1).toLocaleString("en-US")} FTE)`;
  return `${c.short} cohort (${lo.toLocaleString("en-US")}–${hi.toLocaleString("en-US")} FTE)`;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function text(tag: string, content: string, cls?: string) {
  const node = document.createElement(tag);
  node.textContent = content;
  if (cls) node.className = cls;
  return node;
}

function sumAt(groups: Values[], i: number): number | null {
  const vals = groups.map((g) => g[i]);
  return vals.every((v) => v == null) ? null : vals.reduce<number>((a, v) => a + (v ?? 0), 0);
}

function cagr(first: number | null, last: number | null, years: number) {
  if (first == null || last == null || first <= 0 || last <= 0 || years <= 0) return null;
  return (last / first) ** (1 / years) - 1;
}

export async function startExplorer() {
  const root = $("explorer");
  let data: Data;
  try {
    const res = await fetch("/massppe/data/explorer.json");
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch {
    root.replaceChildren(text("p", "The explorer data didn't load. Reload the page to try again.", "load-error"));
    return;
  }
  const { meta } = data;
  const byId = new Map(data.entities.map((e) => [e.id, e]));
  const years = meta.years;
  const last = years.length - 1;

  // ---- State, from the URL ----
  const params = new URLSearchParams(location.search);
  const state = {
    d: byId.has(params.get("d") ?? "") ? params.get("d")! : "leverett",
    cmp: (["cohort", "western", "none"].includes(params.get("cmp") ?? "") ? params.get("cmp") : "cohort") as Compare,
    usd: (params.get("usd") === "real" ? "real" : "nominal") as Dollars,
  };

  // ---- Controls ----
  const select = $<HTMLSelectElement>("pick-district");
  const averages = document.createElement("optgroup");
  averages.label = "Averages";
  for (const e of data.entities.filter((x) => x.kind !== "district")) averages.append(new Option(e.name, e.id));
  select.append(averages);
  for (const key of Object.keys(meta.cohorts)) {
    const group = document.createElement("optgroup");
    group.label = cohortTitle(meta, key);
    data.entities
      .filter((e) => e.kind === "district" && e.cohort === key)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((e) => group.append(new Option(e.name, e.id)));
    if (group.children.length) select.append(group);
  }
  const compareSelect = $<HTMLSelectElement>("pick-compare");
  const dollarInputs = document.querySelectorAll<HTMLInputElement>('input[name="dollars"]');
  document.querySelectorAll("[data-latest]").forEach((n) => (n.textContent = String(meta.latest)));

  select.value = state.d;
  compareSelect.value = state.cmp;
  dollarInputs.forEach((r) => (r.checked = r.value === state.usd));
  select.addEventListener("change", () => update({ d: select.value }));
  compareSelect.addEventListener("change", () => update({ cmp: compareSelect.value as Compare }));
  dollarInputs.forEach((r) => r.addEventListener("change", () => r.checked && update({ usd: r.value as Dollars })));

  function update(patch: Partial<typeof state>) {
    Object.assign(state, patch);
    const q = new URLSearchParams({ d: state.d });
    if (state.cmp !== "cohort") q.set("cmp", state.cmp);
    if (state.usd !== "nominal") q.set("usd", state.usd);
    history.replaceState(null, "", `${location.pathname}?${q}`);
    render();
  }

  // ---- Helpers that depend on state ----
  const deflate = (values: Values): Values => {
    if (state.usd === "nominal") return values;
    const base = meta.cpi[String(meta.latest)];
    return values.map((v, i) => (v == null ? null : (v * base) / meta.cpi[String(years[i])]));
  };

  function comparisonFor(e: Entity): Entity | null {
    if (state.cmp === "none") return null;
    if (state.cmp === "western") return e.id === "western-ma" ? null : byId.get("western-ma") ?? null;
    if (e.kind === "district") return byId.get(e.compare ?? "western-ma") ?? null;
    return e.kind === "cohort" ? byId.get("western-ma") ?? null : null;
  }

  const ppeSeries = (e: Entity): Series[] =>
    meta.categories.map((c, k) => ({ key: c, label: sentence(c), color: PPE_COLORS[k], values: deflate(e.ppe[c]) }));
  const nssSeries = (e: Entity): Series[] =>
    NSS_SERIES.map((s) => ({ ...s, values: deflate(e.nss[s.key]) }));
  const enrollSeries = (e: Entity): Series[] =>
    ENROLL_SERIES.map((s) => ({ ...s, values: e.enroll[s.key] }));
  const totals = (series: Series[]): Values => years.map((_, i) => sumAt(series.map((s) => s.values), i));
  // Actual NSS is the full stack, so it exists only where DESE reported actual spending
  const actualNss = (series: Series[]): Values =>
    years.map((_, i) => (series[2].values[i] == null ? null : sumAt(series.map((s) => s.values), i)));

  // ---- Hover: one year highlighted across every panel, tooltip in the active one ----
  let panels: { panel: Panel; figure: HTMLElement; tip: (i: number) => TipContent }[] = [];
  let hovered: number | null = null;

  interface TipRow { value: string; label: string; color?: string; mark?: "line" | "rect" | "hatch"; strong?: boolean }
  interface TipContent { title: string; rows: TipRow[]; note?: string }

  function showTip(figure: HTMLElement, panel: Panel, i: number, content: TipContent) {
    const tip = figure.querySelector<HTMLElement>(".tooltip")!;
    tip.replaceChildren(text("div", content.title, "tip-title"));
    for (const r of content.rows) {
      const row = document.createElement("div");
      row.className = `tip-row${r.strong ? " strong" : ""}`;
      const key = document.createElement("span");
      key.className = `key ${r.mark ?? "none"}`;
      if (r.color) key.style.setProperty("--c", r.color);
      row.append(key, text("span", r.value, "tip-value"), text("span", r.label, "tip-label"));
      tip.append(row);
    }
    if (content.note) tip.append(text("div", content.note, "tip-note"));
    tip.hidden = false;
    const svgBox = panel.svg.getBoundingClientRect();
    const figBox = figure.getBoundingClientRect();
    const scale = svgBox.width / panel.ax.frame.width;
    const x = svgBox.left - figBox.left + panel.ax.x(i) * scale;
    const w = tip.offsetWidth;
    const left = x + 16 + w > figBox.width ? x - 16 - w : x + 16;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${svgBox.top - figBox.top + 8}px`;
  }

  function setHover(i: number | null, source: SVGSVGElement | null) {
    hovered = i;
    for (const p of panels) {
      p.panel.setHover(i);
      const tipEl = p.figure.querySelector<HTMLElement>(".tooltip")!;
      if (i != null && p.panel.svg === source) showTip(p.figure, p.panel, i, p.tip(i));
      else tipEl.hidden = true;
    }
  }

  function keyboard(svg: SVGSVGElement) {
    svg.addEventListener("focus", () => setHover(hovered ?? last, svg));
    svg.addEventListener("blur", () => setHover(null, null));
    svg.addEventListener("keydown", (ev) => {
      const now = hovered ?? last;
      const next = { ArrowLeft: now - 1, ArrowRight: now + 1, Home: 0, End: last }[ev.key];
      if (next == null) return;
      ev.preventDefault();
      setHover(Math.max(0, Math.min(last, next)), svg);
    });
  }

  // ---- Legend and table builders ----
  function legend(list: HTMLElement, items: { label: string; color: string; mark: "rect" | "line" | "hatch" }[]) {
    list.replaceChildren(
      ...items.map((it) => {
        const li = document.createElement("li");
        const key = document.createElement("span");
        key.className = `key ${it.mark}`;
        key.style.setProperty("--c", it.color);
        li.append(key, text("span", it.label));
        return li;
      }),
    );
  }

  function table(holder: HTMLElement, caption: string, cols: { label: string; values: Values; fmt: (v: number) => string }[]) {
    const t = document.createElement("table");
    t.append(text("caption", caption));
    const head = t.createTHead().insertRow();
    head.append(text("th", "Fiscal year"));
    cols.forEach((c) => head.append(text("th", c.label)));
    const body = t.createTBody();
    years.forEach((y, i) => {
      const row = body.insertRow();
      const th = text("th", String(y));
      th.setAttribute("scope", "row");
      row.append(th);
      cols.forEach((c) => {
        const v = c.values[i];
        row.append(text("td", v == null ? "–" : c.fmt(v)));
      });
    });
    holder.replaceChildren(t);
  }

  // ---- Stat tiles ----
  function tile(label: string, value: string, details: string[]) {
    const div = document.createElement("div");
    div.className = "tile";
    div.append(text("div", label, "tile-label"), text("div", value, "tile-value"));
    details.filter(Boolean).forEach((d) => div.append(text("div", d, "tile-detail")));
    return div;
  }

  // ---- Render ----
  let lastWidth = 0;

  function render() {
    const e = byId.get(state.d)!;
    const c = comparisonFor(e);
    const span = meta.latest - meta.start;
    const real = state.usd === "real";
    const dollarsNote = real ? `FY${meta.latest} dollars` : "Nominal dollars";
    const perDistrict = e.kind === "district" ? "" : ", average per district";

    // Heading
    $("entity-name").textContent = e.name;
    const bits =
      e.kind === "district"
        ? [e.cohort ? cohortTitle(meta, e.cohort) : "", `${fte(e.fte ?? 0)} in-district FTE in FY${meta.latest}`]
        : [`${e.members} districts`, "averages weighted by enrollment"];
    if (c) bits.push(`compared with the ${c.name.replace(/ average$/, "")} average`);
    $("entity-meta").textContent = bits.join(" · ");

    // Series
    const ppe = ppeSeries(e);
    const nss = nssSeries(e);
    const enroll = enrollSeries(e);
    const ppeTotal = totals(ppe);
    const nssTotal = actualNss(nss);
    const cPpeTotal = c ? totals(ppeSeries(c)) : null;
    const cNssTotal = c ? actualNss(nssSeries(c)) : null;
    const cName = c ? c.name : "";

    // Tiles
    const g = cagr(ppeTotal[0], ppeTotal[last], span);
    const enrollChange =
      e.enroll.in_district[0] && e.enroll.in_district[last]
        ? e.enroll.in_district[last]! / e.enroll.in_district[0]! - 1
        : null;
    const aid = nss[0].values[last];
    const above = nss[2].values[last];
    const aidShare = aid != null && nssTotal[last] ? aid / nssTotal[last]! : null;
    const unreported = years.filter((_, i) => nss[2].values[i] == null && nss[0].values[i] != null);
    $("tiles").replaceChildren(
      tile(`Spending per pupil, FY${meta.latest}`, ppeTotal[last] != null ? usd(ppeTotal[last]!) : "–", [
        g != null ? `${pct(g)} a year since FY${meta.start}${real ? ", after inflation" : ""}` : "",
        c && cPpeTotal?.[last] != null ? `${cName}: ${usd(cPpeTotal[last]!)}` : "",
      ]),
      tile(`In-district enrollment, FY${meta.latest}`, e.enroll.in_district[last] != null ? `${fte(e.enroll.in_district[last]!)} FTE` : "–", [
        enrollChange != null ? `${pct(enrollChange)} since FY${meta.start}` : "",
        e.kind === "district" ? "" : "Average per district",
      ]),
      tile(`Chapter 70 aid per foundation pupil, FY${meta.latest}`, aid != null ? usd(aid) : "–", [
        aidShare != null ? `${Math.round(aidShare * 100)}% of actual net school spending` : "",
        c && c.nss.ch70_aid[last] != null ? `${cName}: ${usd(nssSeries(c)[0].values[last]!)}` : "",
      ]),
      tile(`Spending above required, FY${meta.latest}`, above != null ? usd(above) : "Not reported", [
        above != null ? "Per foundation pupil" : `DESE has not reported FY${meta.latest} actual spending`,
        c && c.nss.above_required[last] != null ? `${cName}: ${usd(nssSeries(c)[2].values[last]!)}` : "",
      ]),
    );

    // Shared dollar scale for both dollar panels
    const stackTop = (series: Series[], i: number) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0);
    let dollarMax = 0;
    years.forEach((_, i) => {
      dollarMax = Math.max(dollarMax, stackTop(ppe, i), stackTop(nss, i), cPpeTotal?.[i] ?? 0, cNssTotal?.[i] ?? 0);
    });
    const dollarTicks = niceTicks(dollarMax * 1.04);
    const enrollMax = Math.max(...enroll.flatMap((s) => s.values.map((v) => v ?? 0)));
    const enrollTicks = niceTicks(enrollMax * 1.04, 4);

    const width = $("panels").clientWidth;
    lastWidth = width;
    const tall = width < 520 ? 260 : 320;
    const frame = (height: number) => ({ width, height, years });
    const fmtUsd = (v: number) => compact(v, "$");

    // Panel 1: spending by category
    const fig1 = $("fig-ppe");
    $("ppe-sub").textContent = `${dollarsNote} per in-district FTE pupil${c ? `. Line: ${cName}, total.` : "."}`;
    const ppeOverlay = c ? { key: "cmp", label: `${cName}, total`, color: COMPARE_COLOR, values: cPpeTotal! } : null;
    const p1 = stackedColumns($("svg-ppe") as unknown as SVGSVGElement, frame(tall), ppe, ppeOverlay, dollarTicks, fmtUsd, setHover,
      { value: ppeTotal[last], text: usd });
    legend($("legend-ppe"), [
      ...ppe.map((s) => ({ label: s.label, color: s.color, mark: "rect" as const })),
      ...(ppeOverlay ? [{ label: ppeOverlay.label, color: COMPARE_COLOR, mark: "line" as const }] : []),
    ]);
    table($("table-ppe"), `Spending per in-district FTE pupil by category, ${e.name} (${dollarsNote.toLowerCase()})`, [
      ...ppe.map((s) => ({ label: s.label, values: s.values, fmt: usd })),
      { label: "Total", values: ppeTotal, fmt: usd },
      ...(c ? [{ label: `${cName}, total`, values: cPpeTotal!, fmt: usd }] : []),
    ]);

    // Panel 2: enrollment
    $("enroll-sub").textContent = `Full-time-equivalent pupils${perDistrict}. Not adjusted for dollars.`;
    const p2 = lines($("svg-enroll") as unknown as SVGSVGElement, frame(width < 520 ? 200 : 230), enroll, enrollTicks,
      (v) => compact(v), fte, setHover);
    legend($("legend-enroll"), enroll.map((s) => ({ label: s.label, color: s.color, mark: "line" as const })));
    table($("table-enroll"), `Enrollment, ${e.name}${perDistrict}`, enroll.map((s) => ({ label: s.label, values: s.values, fmt: fte })));

    // Panel 3: Chapter 70 and net school spending
    $("nss-sub").textContent =
      `${dollarsNote} per foundation pupil. Column height is actual net school spending` +
      (c ? `. Line: ${cName}, actual net school spending.` : ".") +
      (unreported.length
        ? ` DESE has not reported actual spending for FY${unreported.join(", FY")}, so ${unreported.length > 1 ? "those faded columns stop" : "that faded column stops"} at the requirement.`
        : "");
    const nssOverlay = c ? { key: "cmp", label: `${cName}, actual NSS`, color: COMPARE_COLOR, values: cNssTotal! } : null;
    const p3 = stackedColumns($("svg-nss") as unknown as SVGSVGElement, frame(tall), nss, nssOverlay, dollarTicks, fmtUsd, setHover,
      { value: nssTotal[last], text: usd }, years.map((_, i) => nss[2].values[i] == null));
    const hasShortfall = nss[2].values.some((v) => v != null && v < 0);
    legend($("legend-nss"), [
      ...nss.map((s) => ({ label: s.label, color: s.color, mark: "rect" as const })),
      ...(hasShortfall ? [{ label: "Below required (shortfall)", color: "#524f45", mark: "hatch" as const }] : []),
      ...(nssOverlay ? [{ label: nssOverlay.label, color: COMPARE_COLOR, mark: "line" as const }] : []),
    ]);
    table($("table-nss"), `Chapter 70 aid and net school spending per foundation pupil, ${e.name} (${dollarsNote.toLowerCase()})`, [
      ...nss.map((s) => ({ label: s.label, values: s.values, fmt: usd })),
      { label: "Actual NSS", values: nssTotal, fmt: usd },
      ...(c ? [{ label: `${cName}, actual NSS`, values: cNssTotal!, fmt: usd }] : []),
    ]);

    // Tooltips
    const yoy = (vals: Values, i: number) =>
      i > 0 && vals[i] != null && vals[i - 1] ? `${pct(vals[i]! / vals[i - 1]! - 1)} from FY${years[i - 1]}` : undefined;
    panels = [
      {
        panel: p1, figure: fig1,
        tip: (i) => ({
          title: `FY${years[i]}`,
          rows: [
            { value: ppeTotal[i] != null ? usd(ppeTotal[i]!) : "–", label: "Total per pupil", strong: true },
            ...[...ppe].reverse().filter((s) => s.values[i] != null && s.values[i]! > 0)
              .map((s) => ({ value: usd(s.values[i]!), label: s.label, color: s.color, mark: "line" as const })),
            ...(c && cPpeTotal?.[i] != null ? [{ value: usd(cPpeTotal[i]!), label: `${cName}, total`, color: COMPARE_COLOR, mark: "line" as const }] : []),
          ],
          note: yoy(ppeTotal, i),
        }),
      },
      {
        panel: p2, figure: $("fig-enroll"),
        tip: (i) => ({
          title: `FY${years[i]}`,
          rows: enroll.filter((s) => s.values[i] != null)
            .map((s) => ({ value: fte(s.values[i]!), label: s.label, color: s.color, mark: "line" as const })),
          note: perDistrict ? "Average per district" : undefined,
        }),
      },
      {
        panel: p3, figure: $("fig-nss"),
        tip: (i) => {
          const required = (nss[0].values[i] ?? 0) + (nss[1].values[i] ?? 0);
          const reported = nss[2].values[i] != null;
          return {
            title: `FY${years[i]}`,
            rows: [
              { value: reported ? usd(nssTotal[i]!) : "Not reported", label: "Actual net school spending", strong: true },
              ...(reported ? [{ value: usd(nss[2].values[i]!), label: nss[2].values[i]! < 0 ? "Below required" : nss[2].label, color: nss[2].color, mark: "line" as const }] : []),
              { value: usd(required), label: "Required net school spending", color: undefined },
              { value: nss[1].values[i] != null ? usd(nss[1].values[i]!) : "–", label: nss[1].label, color: nss[1].color, mark: "line" as const },
              { value: nss[0].values[i] != null ? usd(nss[0].values[i]!) : "–", label: nss[0].label, color: nss[0].color, mark: "line" as const },
              ...(c && cNssTotal?.[i] != null ? [{ value: usd(cNssTotal[i]!), label: `${cName}, actual NSS`, color: COMPARE_COLOR, mark: "line" as const }] : []),
            ],
          };
        },
      },
    ];
    if (hovered != null) setHover(null, null);
  }

  render();
  ["svg-ppe", "svg-enroll", "svg-nss"].forEach((id) => keyboard($(id) as unknown as SVGSVGElement));
  root.classList.remove("is-loading");

  new ResizeObserver(() => {
    const w = $("panels").clientWidth;
    if (Math.abs(w - lastWidth) > 4) requestAnimationFrame(render);
  }).observe($("panels"));
}
