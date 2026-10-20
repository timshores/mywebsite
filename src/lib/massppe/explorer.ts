// District view of the Western MA per-pupil expenditure explorer.
// Data: public/massppe/data/explorer.json, written by the report pipeline
// (github.com/timshores/schools, ppe_report/export_explorer_data.py).

import { compact, lines, niceTicks, niceTicksRange, stackedColumns, type Panel, type Series, type Val } from "./charts";

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

type Compare = "cohort" | "western" | "other" | "none";
type Dollars = "nominal" | "real";
type StackPanel = "ppe" | "nss";

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

// The report's comparison shading (ppe_report/compose_pdf.py): amber above the
// baseline, teal below, darker as the gap grows. Dollars and enrollment shade
// from a 5% relative gap, growth rates from 0.5 percentage points.
const ABOVE_SHADES = ["#FFF4E6", "#FFE8CC", "#FFD9A8", "#FFC97A", "#FFB84D"];
const BELOW_SHADES = ["#E0F7FA", "#B2EBF2", "#80DEEA", "#4DD0E1", "#26C6DA"];
const SHADE_BINS_REL = [0.05, 0.1, 0.15, 0.2];
const SHADE_BINS_PP = [0.005, 0.01, 0.015, 0.02];

function shade(delta: number | null, bins: number[]) {
  if (delta == null || !Number.isFinite(delta) || Math.abs(delta) < bins[0]) return null;
  const idx = Math.min(ABOVE_SHADES.length - 1, bins.filter((b) => b <= Math.abs(delta)).length - 1);
  return delta > 0 ? ABOVE_SHADES[idx] : BELOW_SHADES[idx];
}

const usd = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
const fte = (v: number) => (v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1));
const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)}%`;
const sentence = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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

/** Sum only when every part is present. */
function sumStrict(groups: Values[], i: number): number | null {
  const vals = groups.map((g) => g[i]);
  return vals.some((v) => v == null) ? null : vals.reduce<number>((a, v) => a + v!, 0);
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
  const span = meta.latest - meta.start;

  // ---- State, from the URL ----
  const params = new URLSearchParams(location.search);
  const vsParam = params.get("vs");
  const state = {
    d: byId.has(params.get("d") ?? "") ? params.get("d")! : "leverett",
    cmp: (["cohort", "western", "other", "none"].includes(params.get("cmp") ?? "") ? params.get("cmp") : "cohort") as Compare,
    // The entity picked in the second dropdown when comparing with another district or average
    vs: vsParam && byId.has(vsParam) ? vsParam : null as string | null,
    usd: (params.get("usd") === "real" ? "real" : "nominal") as Dollars,
  };
  if (state.cmp === "other" && !state.vs) state.cmp = "cohort";
  // Legend selections; empty means every segment shows. Kept across districts so
  // one category can be followed from district to district.
  const isolated: Record<StackPanel, Set<string>> = { ppe: new Set(), nss: new Set() };

  // ---- Controls ----
  // The district menu and its duplicate for comparisons list the same entities
  function fillEntities(sel: HTMLSelectElement) {
    const averages = document.createElement("optgroup");
    averages.label = "Averages";
    for (const e of data.entities.filter((x) => x.kind !== "district")) averages.append(new Option(e.name, e.id));
    sel.append(averages);
    for (const key of Object.keys(meta.cohorts)) {
      const group = document.createElement("optgroup");
      group.label = cohortTitle(meta, key);
      data.entities
        .filter((e) => e.kind === "district" && e.cohort === key)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((e) => group.append(new Option(e.name, e.id)));
      if (group.children.length) sel.append(group);
    }
  }
  const select = $<HTMLSelectElement>("pick-district");
  const vsSelect = $<HTMLSelectElement>("pick-vs");
  fillEntities(select);
  fillEntities(vsSelect);
  const compareSelect = $<HTMLSelectElement>("pick-compare");
  const dollarInputs = document.querySelectorAll<HTMLInputElement>('input[name="dollars"]');
  document.querySelectorAll("[data-latest]").forEach((n) => (n.textContent = String(meta.latest)));

  select.value = state.d;
  compareSelect.value = state.cmp;
  dollarInputs.forEach((r) => (r.checked = r.value === state.usd));
  select.addEventListener("change", () => update({ d: select.value }));
  compareSelect.addEventListener("change", () => {
    const cmp = compareSelect.value as Compare;
    // Start the second menu on whatever was being compared, so nothing jumps
    const vs = cmp === "other" && !state.vs ? (comparisonFor(byId.get(state.d)!)?.id ?? "western-ma") : state.vs;
    update({ cmp, vs });
  });
  vsSelect.addEventListener("change", () => update({ vs: vsSelect.value }));
  dollarInputs.forEach((r) => r.addEventListener("change", () => r.checked && update({ usd: r.value as Dollars })));

  function update(patch: Partial<typeof state>) {
    Object.assign(state, patch);
    const q = new URLSearchParams({ d: state.d });
    if (state.cmp !== "cohort") q.set("cmp", state.cmp);
    if (state.cmp === "other" && state.vs) q.set("vs", state.vs);
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
    if (state.cmp === "other") {
      const v = state.vs ? byId.get(state.vs) : undefined;
      return v && v.id !== e.id ? v : null;
    }
    if (state.cmp === "western") return e.id === "western-ma" ? null : byId.get("western-ma") ?? null;
    if (e.kind === "district") return byId.get(e.compare ?? "western-ma") ?? null;
    return e.kind === "cohort" ? byId.get("western-ma") ?? null : null;
  }

  /** "Shutesbury" or "the Tiny cohort average", for use mid-sentence. */
  const refName = (c: Entity) => (c.kind === "district" ? c.name : `the ${c.name}`);

  const ppeSeries = (e: Entity): Series[] =>
    meta.categories.map((c, k) => ({ key: c, label: sentence(c), color: PPE_COLORS[k], values: deflate(e.ppe[c]) }));
  const nssSeries = (e: Entity): Series[] =>
    NSS_SERIES.map((s) => ({ ...s, values: deflate(e.nss[s.key]) }));
  const enrollSeries = (e: Entity): Series[] =>
    ENROLL_SERIES.map((s) => ({ ...s, values: e.enroll[s.key] }));
  const totals = (series: Series[]): Values => years.map((_, i) => sumAt(series.map((s) => s.values), i));
  const strictTotals = (series: Series[]): Values => years.map((_, i) => sumStrict(series.map((s) => s.values), i));
  // Actual NSS is the full stack, so it exists only where DESE reported actual spending
  const actualNss = (series: Series[]): Values =>
    years.map((_, i) => (series[2].values[i] == null ? null : sumAt(series.map((s) => s.values), i)));
  const visible = (series: Series[], panel: StackPanel) =>
    isolated[panel].size ? series.filter((s) => isolated[panel].has(s.key)) : series;
  /** "teachers", "3 selected categories", or null when everything shows. */
  const selectionName = (shown: Series[], all: Series[], noun: string) =>
    shown.length === all.length ? null : shown.length === 1 ? shown[0].label.toLowerCase() : `${shown.length} selected ${noun}`;

  /** Ticks fitted to the columns actually drawn, including any that hang below zero. */
  function fitTicks(series: Series[], overlay: Values | null) {
    let lo = 0;
    let hi = 0;
    years.forEach((_, i) => {
      const vals = series.map((s) => s.values[i]);
      const pos = vals.reduce<number>((a, v) => a + Math.max(0, v ?? 0), 0);
      const tot = vals.reduce<number>((a, v) => a + (v ?? 0), 0);
      const o = overlay?.[i] ?? 0;
      hi = Math.max(hi, pos, o);
      lo = Math.min(lo, pos === 0 ? tot : 0, o);
    });
    return niceTicksRange(lo * 1.04, hi * 1.04);
  }

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

  // ---- Legend: stacked segments are toggle buttons that isolate them ----
  interface LegendItem { label: string; color: string; mark: "rect" | "line" | "hatch"; key?: string }
  let refocus: { panel: StackPanel; key: string } | null = null;

  function legend(list: HTMLElement, items: LegendItem[], panel?: StackPanel) {
    const set = panel ? isolated[panel] : null;
    const toggles = items.filter((it) => it.key);
    const swatch = (it: LegendItem) => {
      const key = document.createElement("span");
      key.className = `key ${it.mark}`;
      key.style.setProperty("--c", it.color);
      return key;
    };
    const nodes = items.map((it) => {
      const li = document.createElement("li");
      if (!set || !it.key) {
        li.className = "legend-static";
        li.append(swatch(it), text("span", it.label));
        return li;
      }
      const key = it.key;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "legend-btn";
      btn.dataset.key = key;
      btn.setAttribute("aria-pressed", String(set.has(key)));
      if (set.size && !set.has(key)) btn.classList.add("is-off");
      btn.append(swatch(it), text("span", it.label));
      btn.addEventListener("click", () => {
        if (set.has(key)) set.delete(key);
        else set.add(key);
        if (set.size === toggles.length) set.clear();
        refocus = { panel: panel!, key };
        render();
      });
      li.append(btn);
      return li;
    });
    if (set?.size) {
      const li = document.createElement("li");
      const reset = text("button", "Show all", "legend-reset") as HTMLButtonElement;
      reset.type = "button";
      reset.addEventListener("click", () => {
        set.clear();
        refocus = { panel: panel!, key: toggles[0].key! };
        render();
      });
      li.append(reset);
      nodes.push(li);
    }
    list.replaceChildren(...nodes);
  }

  // ---- Full data table: every year, shown in an overlay wider than the page column ----
  type TableCol = { label: string; values: Values; fmt: (v: number) => string };
  const fullTables: Record<string, { caption: string; cols: TableCol[] }> = {};
  const dialog = $<HTMLDialogElement>("table-dialog");

  function table(cols: TableCol[]) {
    const t = document.createElement("table");
    t.setAttribute("aria-labelledby", "table-dialog-title");
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
    return t;
  }

  document.querySelectorAll<HTMLButtonElement>(".table-open").forEach((btn) =>
    btn.addEventListener("click", () => {
      const spec = fullTables[btn.dataset.table ?? ""];
      if (!spec) return;
      $("table-dialog-title").textContent = spec.caption;
      $("table-dialog-body").replaceChildren(table(spec.cols));
      $("table-dialog-body").scrollTo(0, 0);
      dialog.showModal();
    }),
  );
  dialog.querySelector(".dialog-close")!.addEventListener("click", () => dialog.close());
  // A click on the dimmed backdrop lands on the dialog element itself
  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog) dialog.close();
  });

  // ---- Comparison table: the report's start year, growth rates and last two years,
  // shaded against the comparison ----
  interface CmpRow { label: string; color: string; mark: "rect" | "line"; values: Values; base: Values | null; total?: boolean }

  function compareTable(holder: HTMLElement, caption: string, rowLabel: string, rows: CmpRow[], kind: "usd" | "fte", cmp: Entity | null) {
    const cName = cmp ? cmp.name : null;
    const fmt = kind === "usd" ? usd : fte;
    const unit = kind === "usd" ? " $/pupil" : "";
    const prior = last - 1;
    const windows = [span, 10, 5];
    const t = document.createElement("table");
    t.append(text("caption", caption));
    const head = t.createTHead().insertRow();
    const blank = text("th", "");
    blank.className = "swatch-col";
    head.append(blank, text("th", rowLabel, "label-col"), text("th", `${years[0]}${unit}`),
      ...windows.map((n) => text("th", `CAGR ${n}y`)),
      text("th", `${years[prior]}${unit}`), text("th", `${years[last]}${unit}`));

    const sr = (above: boolean) => text("span", above ? " (above comparison)" : " (below comparison)", "sr-only");
    const level = (r: CmpRow, i: number) => {
      const v = r.values[i];
      const td = text("td", v == null ? "—" : fmt(v));
      const b = r.base?.[i];
      if (v != null && b != null && b > 0 && cName) {
        const rel = (v - b) / b;
        const bg = shade(rel, SHADE_BINS_REL);
        td.title = `${cName}: ${fmt(b)} (${rel >= 0 ? "+" : "−"}${Math.abs(rel * 100).toFixed(0)}%)`;
        if (bg) {
          td.style.background = bg;
          td.append(sr(rel > 0));
        }
      }
      return td;
    };
    const growth = (r: CmpRow, n: number) => {
      const g = cagr(r.values[last - n], r.values[last], n);
      const td = text("td", g == null ? "—" : pct(g));
      const gb = r.base ? cagr(r.base[last - n], r.base[last], n) : null;
      if (g != null && gb != null && cName) {
        const delta = g - gb;
        const bg = shade(delta, SHADE_BINS_PP);
        td.title = `${cName}: ${pct(gb)} (${delta >= 0 ? "+" : "−"}${Math.abs(delta * 100).toFixed(1)} pp)`;
        if (bg) {
          td.style.background = bg;
          td.append(sr(delta > 0));
        }
      }
      return td;
    };

    const body = t.createTBody();
    for (const r of rows) {
      const tr = body.insertRow();
      if (r.total) tr.className = "total";
      const sw = document.createElement("td");
      sw.className = "swatch-col";
      if (!r.total) {
        const key = document.createElement("span");
        key.className = `key ${r.mark}`;
        key.style.setProperty("--c", r.color);
        sw.append(key);
      }
      const th = text("th", r.label);
      th.setAttribute("scope", "row");
      tr.append(sw, th, level(r, 0), ...windows.map((n) => growth(r, n)), level(r, prior), level(r, last));
    }

    const note = document.createElement("div");
    note.className = "compare-legend";
    if (cName) {
      const chip = (color: string, label: string) => {
        const s = document.createElement("span");
        s.className = "chip";
        const box = document.createElement("span");
        box.className = "chip-box";
        box.style.background = color;
        s.append(box, text("span", label));
        return s;
      };
      const chips = document.createElement("div");
      chips.className = "chips";
      chips.append(chip(ABOVE_SHADES[2], `Above ${cName}`), chip(BELOW_SHADES[2], `Below ${cName}`));
      note.append(chips, text("p",
        `Shaded where a value differs from ${refName(cmp!)} by 5% or more (${kind === "usd" ? "dollars" : "enrollment"}) ` +
        "or a growth rate by 0.5 percentage points or more; darker shading marks a larger gap. " +
        "Hover a cell for the comparison value. CAGR is the compound annual growth rate, (end\u00a0÷\u00a0start)^(1\u00a0÷\u00a0years)\u00a0−\u00a01."));
    } else {
      note.append(text("p", "Choose a comparison above to shade this table against it. CAGR is the compound annual growth rate, (end\u00a0÷\u00a0start)^(1\u00a0÷\u00a0years)\u00a0−\u00a01."));
    }
    // The box takes the table's width; the note stretches to match it
    const box = document.createElement("div");
    box.className = "compare-box";
    box.append(t, note);
    holder.replaceChildren(box);
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
    const real = state.usd === "real";
    const dollarsNote = real ? `FY${meta.latest} dollars` : "Nominal dollars";
    const perDistrict = e.kind === "district" ? "" : ", average per district";

    // Comparison menu: shown only for "Another district or average"
    $("vs-control").hidden = state.cmp !== "other";
    if (state.vs) vsSelect.value = state.vs;
    for (const o of vsSelect.options) o.disabled = o.value === e.id;

    // Heading
    $("entity-name").textContent = e.name;
    const bits =
      e.kind === "district"
        ? [e.cohort ? cohortTitle(meta, e.cohort) : "", `${fte(e.fte ?? 0)} in-district FTE in FY${meta.latest}`]
        : [`${e.members} districts`, "averages weighted by enrollment"];
    if (c) bits.push(`compared with ${refName(c)}`);
    else if (state.cmp === "other") bits.push("pick a different district or average to compare with");
    $("entity-meta").textContent = bits.join(" · ");

    // Series
    const ppe = ppeSeries(e);
    const nss = nssSeries(e);
    const enroll = enrollSeries(e);
    const cPpe = c ? ppeSeries(c) : null;
    const cNss = c ? nssSeries(c) : null;
    const cEnroll = c ? enrollSeries(c) : null;
    const ppeTotal = totals(ppe);
    const nssTotal = actualNss(nss);
    const cPpeTotal = cPpe ? totals(cPpe) : null;
    const cNssTotal = cNss ? actualNss(cNss) : null;
    const cName = c ? c.name : "";

    // Tiles (always whole totals, whatever the legend isolates)
    const g = cagr(ppeTotal[0], ppeTotal[last], span);
    const enrollChange =
      e.enroll.in_district[0] && e.enroll.in_district[last]
        ? e.enroll.in_district[last]! / e.enroll.in_district[0]! - 1
        : null;
    const aid = nss[0].values[last];
    const above = nss[2].values[last];
    const aidShare = aid != null && nssTotal[last] ? aid / nssTotal[last]! : null;
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
        cNss && cNss[0].values[last] != null ? `${cName}: ${usd(cNss[0].values[last]!)}` : "",
      ]),
      tile(`Spending above required, FY${meta.latest}`, above != null ? usd(above) : "Not reported", [
        above != null ? "Per foundation pupil" : `DESE has not reported FY${meta.latest} actual spending`,
        cNss && cNss[2].values[last] != null ? `${cName}: ${usd(cNss[2].values[last]!)}` : "",
      ]),
    );

    // Shared dollar scale for both dollar panels while nothing is isolated
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
    const yoy = (vals: Values, i: number) =>
      i > 0 && vals[i] != null && vals[i - 1] ? `${pct(vals[i]! / vals[i - 1]! - 1)} from FY${years[i - 1]}` : undefined;

    // Panel 1: spending by category
    const ppeShown = visible(ppe, "ppe");
    const ppeSel = selectionName(ppeShown, ppe, "categories");
    const ppeShownTotal = totals(ppeShown);
    const cPpeShownTotal = cPpe ? totals(visible(cPpe, "ppe")) : null;
    const ppeOverlay = c ? { key: "cmp", label: `${cName}, ${ppeSel ?? "total"}`, color: COMPARE_COLOR, values: cPpeShownTotal! } : null;
    $("ppe-sub").textContent =
      `${dollarsNote} per in-district FTE pupil.${c ? ` Line: ${ppeOverlay!.label}.` : ""} ` +
      (ppeSel
        ? `Showing ${ppeShown.length} of ${ppe.length} categories, with the scale fitted to them.`
        : "Select categories in the legend to isolate them.");
    const p1 = stackedColumns($("svg-ppe") as unknown as SVGSVGElement, frame(tall), ppeShown, ppeOverlay,
      ppeSel ? fitTicks(ppeShown, cPpeShownTotal) : dollarTicks, fmtUsd, setHover,
      { value: ppeShownTotal[last], text: usd });
    legend($("legend-ppe"), [
      ...ppe.map((s) => ({ key: s.key, label: s.label, color: s.color, mark: "rect" as const })),
      ...(ppeOverlay ? [{ label: ppeOverlay.label, color: COMPARE_COLOR, mark: "line" as const }] : []),
    ], "ppe");
    compareTable($("cmp-ppe"), `Spending per in-district FTE pupil, ${e.name} (${dollarsNote.toLowerCase()})`, "Category", [
      ...[...ppe].reverse().map((s, k) => ({
        label: s.label, color: s.color, mark: "rect" as const, values: s.values,
        base: cPpe ? cPpe[ppe.length - 1 - k].values : null,
      })),
      { label: "Total", color: "", mark: "rect" as const, values: ppeTotal, base: cPpeTotal, total: true },
    ], "usd", c);
    fullTables.ppe = { caption: `Spending per in-district FTE pupil by category, ${e.name} (${dollarsNote.toLowerCase()})`, cols: [
      ...ppe.map((s) => ({ label: s.label, values: s.values, fmt: usd })),
      { label: "Total", values: ppeTotal, fmt: usd },
      ...(c ? [{ label: `${cName}, total`, values: cPpeTotal!, fmt: usd }] : []),
    ] };

    // Panel 2: enrollment
    $("enroll-sub").textContent = `Full-time-equivalent pupils${perDistrict}. Not adjusted for dollars.`;
    const p2 = lines($("svg-enroll") as unknown as SVGSVGElement, frame(width < 520 ? 200 : 230), enroll, enrollTicks,
      (v) => compact(v), fte, setHover);
    legend($("legend-enroll"), enroll.map((s) => ({ label: s.label, color: s.color, mark: "line" as const })));
    compareTable($("cmp-enroll"), `Enrollment, ${e.name}${perDistrict}`, "Measure",
      enroll.map((s, k) => ({ label: s.label, color: s.color, mark: "line" as const, values: s.values, base: cEnroll ? cEnroll[k].values : null })),
      "fte", c);
    fullTables.enroll = { caption: `Enrollment, ${e.name}${perDistrict}`, cols: enroll.map((s) => ({ label: s.label, values: s.values, fmt: fte })) };

    // Panel 3: Chapter 70 and net school spending
    const nssShown = visible(nss, "nss");
    const nssSel = selectionName(nssShown, nss, "components");
    const showsAbove = nssShown.some((s) => s.key === "above_required");
    const nssShownTotal = nssSel ? strictTotals(nssShown) : nssTotal;
    const cNssShownTotal = cNss ? (nssSel ? strictTotals(visible(cNss, "nss")) : cNssTotal) : null;
    const nssOverlay = c
      ? { key: "cmp", label: `${cName}, ${nssSel ?? "actual NSS"}`, color: COMPARE_COLOR, values: cNssShownTotal! }
      : null;
    const unreported = showsAbove ? years.filter((_, i) => nss[2].values[i] == null && nss[0].values[i] != null) : [];
    $("nss-sub").textContent =
      `${dollarsNote} per foundation pupil. ` +
      (nssSel
        ? `Showing ${nssShown.length} of ${nss.length} components, with the scale fitted to them.`
        : "Column height is actual net school spending.") +
      (c ? ` Line: ${nssOverlay!.label}.` : "") +
      (unreported.length
        ? ` DESE has not reported actual spending for FY${unreported.join(", FY")}, so ${unreported.length > 1 ? "those faded columns stop" : "that faded column stops"} short.`
        : "");
    const p3 = stackedColumns($("svg-nss") as unknown as SVGSVGElement, frame(tall), nssShown, nssOverlay,
      nssSel ? fitTicks(nssShown, cNssShownTotal) : dollarTicks, fmtUsd, setHover,
      { value: nssShownTotal[last], text: usd }, years.map((_, i) => showsAbove && nss[2].values[i] == null));
    // The hatch only appears when a shortfall sits on top of other segments
    const hasShortfall = showsAbove && nssShown.length > 1 && nss[2].values.some((v) => v != null && v < 0);
    legend($("legend-nss"), [
      ...nss.map((s) => ({ key: s.key, label: s.label, color: s.color, mark: "rect" as const })),
      ...(hasShortfall ? [{ label: "Below required (shortfall)", color: "#524f45", mark: "hatch" as const }] : []),
      ...(nssOverlay ? [{ label: nssOverlay.label, color: COMPARE_COLOR, mark: "line" as const }] : []),
    ], "nss");
    compareTable($("cmp-nss"), `Chapter 70 aid and net school spending per foundation pupil, ${e.name} (${dollarsNote.toLowerCase()})`, "Component", [
      ...[...nss].reverse().map((s, k) => ({
        label: s.label, color: s.color, mark: "rect" as const, values: s.values,
        base: cNss ? cNss[nss.length - 1 - k].values : null,
      })),
      { label: "Actual net school spending", color: "", mark: "rect" as const, values: nssTotal, base: cNssTotal, total: true },
    ], "usd", c);
    fullTables.nss = { caption: `Chapter 70 aid and net school spending per foundation pupil, ${e.name} (${dollarsNote.toLowerCase()})`, cols: [
      ...nss.map((s) => ({ label: s.label, values: s.values, fmt: usd })),
      { label: "Actual NSS", values: nssTotal, fmt: usd },
      ...(c ? [{ label: `${cName}, actual NSS`, values: cNssTotal!, fmt: usd }] : []),
    ] };

    // Tooltips
    panels = [
      {
        panel: p1, figure: $("fig-ppe"),
        tip: (i) => {
          const money = (v: number | null) => (v == null ? "–" : usd(v));
          const rows: TipRow[] = [];
          const segments = [...ppeShown].reverse().filter((s) => s.values[i] != null && s.values[i]! > 0)
            .map((s) => ({ value: usd(s.values[i]!), label: s.label, color: s.color, mark: "line" as const }));
          if (!ppeSel) {
            rows.push({ value: money(ppeTotal[i]), label: "Total per pupil", strong: true }, ...segments);
          } else {
            rows.push({ value: money(ppeShownTotal[i]), label: capital(ppeSel), strong: true });
            if (ppeShown.length > 1) rows.push(...segments);
            rows.push({ value: money(ppeTotal[i]), label: "Total per pupil, all categories" });
          }
          if (ppeOverlay && ppeOverlay.values[i] != null) {
            rows.push({ value: usd(ppeOverlay.values[i]!), label: ppeOverlay.label, color: COMPARE_COLOR, mark: "line" });
          }
          return { title: `FY${years[i]}`, rows, note: yoy(ppeSel ? ppeShownTotal : ppeTotal, i) };
        },
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
              { value: usd(required), label: "Required net school spending" },
              { value: nss[1].values[i] != null ? usd(nss[1].values[i]!) : "–", label: nss[1].label, color: nss[1].color, mark: "line" as const },
              { value: nss[0].values[i] != null ? usd(nss[0].values[i]!) : "–", label: nss[0].label, color: nss[0].color, mark: "line" as const },
              ...(nssOverlay && nssOverlay.values[i] != null ? [{ value: usd(nssOverlay.values[i]!), label: nssOverlay.label, color: COMPARE_COLOR, mark: "line" as const }] : []),
            ],
          };
        },
      },
    ];
    if (hovered != null) setHover(null, null);

    // Keep keyboard focus on the legend button that was just pressed
    if (refocus) {
      const { panel, key } = refocus;
      refocus = null;
      document.querySelector<HTMLButtonElement>(`#legend-${panel} [data-key="${CSS.escape(key)}"]`)?.focus();
    }
  }

  // Plain-language note on the two dollar modes, with a worked example from the index
  const factor = meta.cpi[String(meta.latest)] / meta.cpi[String(meta.start)];
  $("dollars-note").replaceChildren(
    text("strong", "Nominal dollars"),
    ` are the amounts districts reported spending each year, with no adjustment for inflation. `,
    text("strong", `FY${meta.latest} dollars`),
    ` restate every year in what a dollar bought in FY${meta.latest}, using the Northeast consumer price index: ` +
      `$1,000 spent in FY${meta.start} is about ${usd(1000 * factor)} in FY${meta.latest} dollars. ` +
      "Use them to see whether spending grew faster than prices.",
  );

  render();
  ["svg-ppe", "svg-enroll", "svg-nss"].forEach((id) => keyboard($(id) as unknown as SVGSVGElement));
  root.classList.remove("is-loading");

  new ResizeObserver(() => {
    const w = $("panels").clientWidth;
    if (Math.abs(w - lastWidth) > 4) requestAnimationFrame(render);
  }).observe($("panels"));
}
