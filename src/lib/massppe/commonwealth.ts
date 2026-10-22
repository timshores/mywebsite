// The Commonwealth tab: a gallery of scatterplots of every district in DESE's Chapter 70
// profiles. Each opens full screen, where any two measures can be set against each other
// and the factors are ranked by how closely they line up with the vertical measure.
// Data: src/data/massppe/commonwealth.json (export_explorer_data.commonwealth_data).

import { scatter, spearman, type Group, type Point } from "./scatter";

type Values = (number | null)[];

interface Row {
  org: string;
  name: string;
  id: string | null;
  type: string;
  region: string | null;
  towns: string[];
  valley: boolean;
  v: Record<string, Values>;
}

export interface CwData {
  meta: { years: number[]; latest: number; regions: Record<string, string>; c70_profile_date: string };
  districts: Row[];
}

type Unit = "pct" | "usd" | "count";
type SourceKey = keyof typeof SOURCES;
interface Var { key: string; label: string; short: string; unit: Unit; role: "outcome" | "factor"; src: SourceKey[]; log?: boolean }

const GATEWAY = "https://dls-gw.dor.state.ma.us/reports/rdPage.aspx?rdReport=";
const SOURCES = {
  c70: { name: "DESE Chapter 70 district profiles", url: "https://www.doe.mass.edu/finance/chapter70/default.html" },
  ppe: { name: "DESE per-pupil expenditures", url: "https://educationtocareer.data.mass.gov/d/er3w-dyti" },
  eqv: { name: "DLS equalized valuations", url: `${GATEWAY}PropertyTaxInformation.EQV.EQV` },
  la4: { name: "DLS LA-4 assessed values", url: `${GATEWAY}PropertyTaxInformation.LA4.Parcel_counts_vals` },
  bill: { name: "DLS average single-family tax bill", url: `${GATEWAY}AverageSingleTaxBill.SingleFamTaxBill_wRange` },
  pop: { name: "Census Bureau population estimates", url: "https://www.census.gov/programs-surveys/popest.html" },
};

// School measures first (the usual vertical axis), then size and the towns' wealth
const VARS: Var[] = [
  { key: "nss_pct_fb", label: "Actual net school spending as a share of the foundation budget", short: "spending as % of foundation", unit: "pct", role: "outcome", src: ["c70"] },
  { key: "nss_pct_req", label: "Actual net school spending as a share of required", short: "spending as % of required", unit: "pct", role: "outcome", src: ["c70"] },
  { key: "nss_pfe", label: "Actual net school spending per foundation pupil", short: "net school spending per pupil", unit: "usd", role: "outcome", src: ["c70"] },
  { key: "above_pfe", label: "Spending above the requirement per foundation pupil", short: "spending above required per pupil", unit: "usd", role: "outcome", src: ["c70"] },
  { key: "ppe", label: "In-district spending per pupil", short: "spending per pupil", unit: "usd", role: "outcome", src: ["ppe"] },
  { key: "aid_pfe", label: "Chapter 70 aid per foundation pupil", short: "Chapter 70 aid per pupil", unit: "usd", role: "outcome", src: ["c70"] },
  { key: "aid_share", label: "Chapter 70 aid as a share of the foundation budget", short: "aid as % of foundation", unit: "pct", role: "outcome", src: ["c70"] },
  { key: "rlc_pfe", label: "Required local contribution per foundation pupil", short: "required local contribution per pupil", unit: "usd", role: "outcome", src: ["c70"] },
  { key: "fe", label: "Foundation enrollment", short: "foundation enrollment", unit: "count", role: "factor", src: ["c70"], log: true },
  { key: "fte", label: "In-district FTE pupils", short: "in-district pupils", unit: "count", role: "factor", src: ["ppe"], log: true },
  { key: "eqv_res", label: "Equalized property value per resident of its towns", short: "property value per resident (EQV)", unit: "usd", role: "factor", src: ["eqv", "pop"], log: true },
  { key: "av_res", label: "Assessed property value per resident of its towns", short: "assessed value per resident", unit: "usd", role: "factor", src: ["la4", "pop"], log: true },
  { key: "income_pc", label: "Income per capita of its towns", short: "income per capita", unit: "usd", role: "factor", src: ["bill", "pop"], log: true },
  { key: "sf_bill", label: "Average single-family tax bill in its towns", short: "single-family tax bill", unit: "usd", role: "factor", src: ["bill"] },
  { key: "bill_income", label: "Single-family tax bill as a share of income per capita", short: "tax bill as % of income", unit: "pct", role: "factor", src: ["bill", "pop"] },
  { key: "res_share", label: "Residential share of its towns' assessed value", short: "residential share of value", unit: "pct", role: "factor", src: ["la4"] },
];
const VAR = new Map(VARS.map((v) => [v.key, v]));

// Highlights: the first is the Amherst-Pelham region against the rest of the Connecticut
// River Valley (Franklin, Hampshire and Hampden counties), as in the plot this tab began with
const AP = new Set(["amherst", "pelham", "shutesbury", "leverett", "amherst-pelham"]);
const OTHER: Group = { label: "Other Massachusetts districts", color: "#a9c4e8", shape: "circle", z: 1 };
const HIGHLIGHTS: Record<string, { label: string; groups: Record<string, Group>; of: (d: Row) => string; labels: Set<string> }> = {
  none: { label: "None", groups: { other: { ...OTHER, label: "Massachusetts districts", color: "#6f8fc4" } }, of: () => "other", labels: new Set() },
  ap: {
    label: "Amherst-Pelham and the Valley",
    groups: {
      ap: { label: "Amherst-Pelham four towns", color: "#b65c3d", shape: "triangle", z: 3 },
      valley: { label: "Other Connecticut River Valley districts", color: "#eda100", shape: "square", z: 2 },
      other: OTHER,
    },
    of: (d) => (d.id && AP.has(d.id) ? "ap" : d.valley ? "valley" : "other"),
    labels: new Set([...AP, "northampton", "greenfield", "springfield"]),
  },
  western: {
    label: "Western MA",
    groups: { west: { label: "Western MA districts", color: "#2a78d6", shape: "circle", z: 2 }, other: OTHER },
    of: (d) => (d.region === "Western" ? "west" : "other"),
    labels: new Set(),
  },
  vocational: {
    label: "Vocational districts",
    groups: { voc: { label: "Vocational and technical districts", color: "#6250d6", shape: "square", z: 2 }, other: OTHER },
    of: (d) => (d.type === "vocational" ? "voc" : "other"),
    labels: new Set(),
  },
};
const DEFAULT_HL = "none";

// Left out unless asked for, as in the original plot: a very large district, a very small
// one with very high spending, and districts too small for their ratios to mean much
const OMIT_NAMES = new Set(["Boston", "Provincetown"]);
const MIN_FE = 20;

interface Preset { id: string; title: string; blurb: string; y: string; x: string; log: boolean }
const PRESETS: Preset[] = [
  {
    id: "enrollment", title: "How much is enough?", y: "nss_pct_fb", x: "fe", log: false,
    blurb: "Actual net school spending as a share of each district's foundation budget, against its enrollment. " +
      "The smaller the district, the further above its foundation budget it tends to spend.",
  },
  {
    id: "required", title: "Spending above the requirement", y: "nss_pct_req", x: "fe", log: false,
    blurb: "The same view against required net school spending, the least the state lets each district spend.",
  },
  {
    id: "wealth", title: "Spending and property wealth", y: "nss_pct_fb", x: "eqv_res", log: true,
    blurb: "Spending above the foundation budget against the property value per resident of each district's towns. " +
      "In FY2025 it lines up more closely with property wealth than with enrollment.",
  },
  {
    id: "tax-bill", title: "Spending and the tax bill", y: "nss_pct_fb", x: "bill_income", log: false,
    blurb: "Against the average single-family tax bill as a share of income per capita. Districts that spend more " +
      "tend to be in towns where the bill takes a smaller share of income.",
  },
  {
    id: "aid", title: "The formula at work", y: "aid_share", x: "eqv_res", log: true,
    blurb: "Chapter 70 aid as a share of the foundation budget, against property wealth: the closest fit of any pair " +
      "here, because the formula is built on it.",
  },
];

const pct = (v: number) => `${Math.round(v * 100)}%`;
const fmt = (u: Unit, v: number) =>
  u === "pct" ? pct(v) : u === "usd" ? `$${Math.round(v).toLocaleString("en-US")}` : Math.round(v).toLocaleString("en-US");
const short = (n: number, d: number) => String(Number((n).toFixed(d)));
const axisFmt = (u: Unit) => (v: number) => {
  if (u === "pct") return pct(v);
  const p = u === "usd" ? "$" : "";
  const a = Math.abs(v);
  if (a >= 1e6) return `${p}${short(v / 1e6, 1)}M`;
  if (a >= 1e3) return `${p}${short(v / 1e3, a >= 1e4 ? 0 : 1)}K`;
  return `${p}${short(v, 0)}`;
};
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const rho = (r: number) => `${r < 0 ? "−" : ""}${Math.abs(r).toFixed(2)}`;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

interface View { preset: string | null; y: string; x: string; fy: number; log: boolean; all: boolean; hl: string; find: string | null }

export function startCommonwealth(root: HTMLElement, data: CwData, opts: { openDistrict: (id: string) => void }) {
  const years = data.meta.years;
  const latest = data.meta.latest;
  const at = (fy: number) => years.indexOf(fy);

  /** The districts with both measures in a year, less the omitted ones unless all are asked for. */
  function pointsFor(v: Pick<View, "x" | "y" | "fy" | "log" | "all" | "hl" | "find">) {
    const i = at(v.fy);
    const hl = HIGHLIGHTS[v.hl] ?? HIGHLIGHTS[DEFAULT_HL];
    const pts: Point[] = [];
    const rows: Row[] = [];
    for (const d of data.districts) {
      const x = d.v[v.x]?.[i];
      const y = d.v[v.y]?.[i];
      if (x == null || y == null || (v.log && x <= 0)) continue;
      if (!v.all && (OMIT_NAMES.has(d.name) || (d.v.fe[i] ?? 0) < MIN_FE)) continue;
      pts.push({ x, y, id: d.id ?? d.org, name: d.name, group: hl.of(d),
        label: (d.id != null && hl.labels.has(d.id)) || d.org === v.find });
      rows.push(d);
    }
    return { pts, rows, hl };
  }

  /** Spearman's rho between the vertical measure and every other measure, closest first;
   * measures without data for the year come last. */
  function ranking(v: View) {
    const i = at(v.fy);
    const others = VARS.filter((o) => o.key !== v.y);
    return others.map((o) => {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const d of data.districts) {
        const x = d.v[o.key]?.[i];
        const y = d.v[v.y]?.[i];
        if (x == null || y == null) continue;
        if (!v.all && (OMIT_NAMES.has(d.name) || (d.v.fe[i] ?? 0) < MIN_FE)) continue;
        xs.push(x);
        ys.push(y);
      }
      return { v: o, r: spearman(xs, ys), n: xs.length };
    }).sort((a, b) => (b.r == null ? -1 : Math.abs(b.r)) - (a.r == null ? -1 : Math.abs(a.r)));
  }

  // ---- Gallery ----
  const gallery = el("div", "cw-gallery");
  for (const p of PRESETS) {
    const card = el("button", "cw-card");
    card.type = "button";
    card.setAttribute("aria-haspopup", "dialog");
    const thumb = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    thumb.setAttribute("class", "cw-thumb");
    thumb.setAttribute("aria-hidden", "true");
    const { pts, hl } = pointsFor({ x: p.x, y: p.y, fy: latest, log: p.log, all: false, hl: DEFAULT_HL, find: null });
    scatter(thumb, pts, { width: 320, height: 190, logX: p.log, xFmt: String, yFmt: String, groups: hl.groups, smooth: true, mini: true });
    card.append(thumb, el("span", "cw-card-title", p.title), el("span", "cw-card-blurb", p.blurb),
      el("span", "cw-card-axes", `${capital(VAR.get(p.y)!.short)} · ${VAR.get(p.x)!.short} · FY${latest}`));
    card.addEventListener("click", () => open({ preset: p.id, y: p.y, x: p.x, fy: latest, log: p.log, all: false, hl: DEFAULT_HL, find: null }));
    gallery.append(card);
  }
  root.append(gallery);

  // ---- The full-screen view ----
  const dialog = el("dialog", "cw-dialog");
  dialog.setAttribute("aria-labelledby", "cw-title");
  const head = el("div", "cw-head");
  const title = el("h2", "cw-title");
  title.id = "cw-title";
  const close = el("button", "cw-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  const aboutBtn = el("button", "cw-drawer-toggle", "About ρ");
  const tableBtn = el("button", "cw-drawer-toggle", "Data table");
  for (const b of [aboutBtn, tableBtn]) {
    b.type = "button";
    b.setAttribute("aria-haspopup", "dialog");
  }
  const headTools = el("div", "cw-head-tools");
  headTools.append(aboutBtn, tableBtn, close);
  head.append(title, headTools);

  // The chart's settings fold away, leaving the chart more room
  const settings = el("details", "cw-settings");
  settings.append(el("summary", undefined, "Chart settings"));
  const controls = el("div", "cw-controls");
  settings.append(controls);
  const select = (label: string, options: [string, string, string?][]) => {
    const wrap = el("label", "cw-field");
    const s = el("select");
    let group: HTMLOptGroupElement | null = null;
    for (const [value, text, og] of options) {
      if (og && group?.label !== og) {
        group = el("optgroup");
        group.label = og;
        s.append(group);
      }
      (group ?? s).append(new Option(text, value));
    }
    wrap.append(el("span", undefined, label), s);
    controls.append(wrap);
    return s;
  };
  const varOptions = VARS.map((v) => [v.key, capital(v.label), v.role === "outcome" ? "School spending and aid" : "Size and the towns' wealth"] as [string, string, string]);
  const ySel = select("Vertical", varOptions);
  const fySel = select("Year", [...years].reverse().map((y) => [String(y), `FY${y}`] as [string, string]));
  const hlSel = select("Highlight", Object.entries(HIGHLIGHTS).map(([k, h]) => [k, h.label] as [string, string]));
  const check = (label: string, help?: string) => {
    const wrap = el("label", "cw-check");
    const c = el("input");
    c.type = "checkbox";
    wrap.append(c, el("span", undefined, label));
    if (help) {
      // A plain-language note, shown on hover or focus
      const h = el("span", "cw-help", "?");
      h.tabIndex = 0;
      h.setAttribute("role", "note");
      h.setAttribute("aria-label", help);
      h.dataset.tip = help;
      h.addEventListener("click", (ev) => ev.preventDefault());
      wrap.append(h);
    }
    controls.append(wrap);
    return c;
  };
  const logBox = check("Log scale across",
    "Spreads out the crowded low end. Equal distances along the bottom multiply by the same amount " +
    "(100 to 1,000 to 10,000) instead of adding the same amount, so small and large districts both get room.");
  const allBox = check(`Include Boston, Provincetown, and districts under ${MIN_FE} pupils`);
  const findWrap = el("label", "cw-field cw-find");
  const find = el("input");
  find.type = "search";
  find.placeholder = "Find a district";
  find.setAttribute("list", "cw-names");
  const names = el("datalist");
  names.id = "cw-names";
  for (const d of [...data.districts].sort((a, b) => a.name.localeCompare(b.name))) names.append(new Option(d.name));
  findWrap.append(el("span", undefined, "Label"), find, names);
  controls.append(findWrap);

  const body = el("div", "cw-body");
  const figure = el("figure", "cw-figure");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "cw-chart");
  svg.setAttribute("role", "img");
  const tip = el("div", "cw-tip");
  tip.hidden = true;
  const legend = el("ul", "cw-legend");
  const caption = el("figcaption", "cw-caption");
  const finding = el("p", "cw-finding");
  const findingRow = el("div", "cw-finding-row");
  findingRow.append(finding);
  figure.append(legend, svg, tip, findingRow, caption);

  // The horizontal picker: every other measure, ranked by how closely it lines up with the
  // vertical one. It is part of the chart's settings and folds away with them. How to read
  // it and the data table each open in a window of their own.
  const side = el("aside", "cw-picker");
  side.setAttribute("aria-labelledby", "cw-picker-head");
  const corrPanel = el("div", "cw-picker-panel");
  const tableHolder = el("div", "cw-table");
  const sideHead = el("h3", undefined);
  // What the bars' two colors mean, in the explorer's usual blue and orange
  const barsKey = el("ul", "cw-bars-key");
  for (const [cls, name, text] of [["pos", "Positive", "rise together: higher on one, higher on the other"],
    ["neg", "Negative", "move opposite: higher on one, lower on the other"]]) {
    const li = el("li");
    const words = el("span");
    words.append(el("strong", undefined, name), ` · ${text}`);
    li.append(el("span", `cw-bars-swatch ${cls}`), words);
    barsKey.append(li);
  }
  const bars = el("ol", "cw-bars");
  const why = el("div", "cw-why");
  why.innerHTML =
    "<h4>Why the strongest correlation matters</h4>" +
    "<p>Whether a district spends a lot depends on what you compare it with. The factor that lines up most closely " +
    "with spending is the one that most needs holding steady: two districts alike in that factor make a fairer " +
    "comparison than two that are alike only in a weaker one.</p>" +
    "<p>A correlation doesn't show cause. These factors travel together, and a strong one can stand in for another " +
    "that isn't on the list.</p>" +
    "<h4>Reading ρ</h4>" +
    "<p>Spearman's ρ runs from −1 to 1. It is positive when districts higher on one measure tend to be higher on the " +
    "other, negative when they tend to be lower, and near 0 when there is no consistent order. It compares ranks, so " +
    "it handles curved patterns like enrollment's and isn't swayed by a few extreme districts. As a rough guide, " +
    "below 0.3 is weak, 0.3 to 0.6 moderate, and above 0.6 strong.</p>";
  sideHead.id = "cw-picker-head";
  const sideSub = el("p", "cw-picker-sub");
  corrPanel.append(sideHead, sideSub, barsKey, bars);
  side.append(corrPanel);
  body.append(figure, side);
  dialog.append(head, settings, body);

  /** A window over the plot view: how to read the ranking, or the data table. */
  function subDialog(heading: string, content: HTMLElement) {
    const d = el("dialog", "cw-sub");
    const h = el("div", "cw-head");
    const t = el("h2", "cw-title", heading);
    t.id = `cw-sub-${heading.replace(/\W+/g, "-").toLowerCase()}`;
    d.setAttribute("aria-labelledby", t.id);
    const x = el("button", "cw-close", "×");
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    x.addEventListener("click", () => d.close());
    h.append(t, x);
    const b = el("div", "cw-sub-body");
    b.append(content);
    d.append(h, b);
    d.addEventListener("click", (ev) => {
      if (ev.target === d) d.close();
    });
    dialog.append(d);
    return d;
  }
  const aboutDialog = subDialog("Reading the correlations", why);
  const tableTitle = el("p", "cw-sub-note");
  const tableWrap = el("div");
  tableWrap.append(tableTitle, tableHolder);
  const tableDialog = subDialog("Data table", tableWrap);
  aboutBtn.addEventListener("click", () => aboutDialog.showModal());
  tableBtn.addEventListener("click", () => tableDialog.showModal());

  // The picker shows and hides with the settings, and the chart takes the room either way
  const showPicker = () => {
    side.hidden = !settings.open;
    body.classList.toggle("has-picker", settings.open);
  };
  settings.addEventListener("toggle", () => {
    showPicker();
    requestAnimationFrame(() => draw());
  });
  // Inside the explorer, so it takes the page's colors
  (root.closest(".explorer") ?? document.body).append(dialog);

  let view: View | null = null;

  function open(v: View) {
    view = v;
    if (!dialog.open) {
      // Settings start open where there's room for them beside the chart
      settings.open = window.innerWidth > 700 && window.innerHeight > 640;
      showPicker();
      dialog.showModal();
    }
    draw();
  }

  function setParams() {
    const q = new URLSearchParams(location.search);
    for (const k of ["plot", "x", "y", "fy", "log", "all", "hl", "find"]) q.delete(k);
    if (view) {
      q.set("view", "commonwealth");
      if (view.preset) q.set("plot", view.preset);
      q.set("y", view.y);
      q.set("x", view.x);
      if (view.fy !== latest) q.set("fy", String(view.fy));
      if (view.log) q.set("log", "1");
      if (view.all) q.set("all", "1");
      if (view.hl !== DEFAULT_HL) q.set("hl", view.hl);
      if (view.find) q.set("find", view.find);
    }
    history.replaceState(null, "", `${location.pathname}?${q}`);
  }

  function draw() {
    if (!view) return;
    const v = view;
    const yv = VAR.get(v.y)!;
    const xv = VAR.get(v.x)!;
    const preset = PRESETS.find((p) => p.id === v.preset && p.x === v.x && p.y === v.y);
    title.textContent = preset ? preset.title : `${capital(yv.short)} by ${xv.short}`;
    ySel.value = v.y;
    fySel.value = String(v.fy);
    hlSel.value = v.hl;
    logBox.checked = v.log;
    allBox.checked = v.all;
    find.value = data.districts.find((d) => d.org === v.find)?.name ?? "";

    const { pts, rows, hl } = pointsFor(v);
    describe(v, pts, hl);
    // The chart takes the room the legend, finding and caption leave, so the view never scrolls
    const width = Math.max(300, figure.clientWidth || 800);
    const pad = parseFloat(getComputedStyle(body).paddingTop) + parseFloat(getComputedStyle(body).paddingBottom);
    const room = body.clientHeight - pad - legend.offsetHeight - findingRow.offsetHeight - caption.offsetHeight - 24;
    const height = Math.round(Math.max(220, Math.min(room, width * 0.75)));
    svg.setAttribute("aria-label", `Scatterplot of ${yv.label.toLowerCase()} against ${xv.label.toLowerCase()} for ` +
      `${pts.length} districts, FY${v.fy}. The data table lists every value.`);
    scatter(svg, pts, {
      width, height, logX: v.log, xFmt: axisFmt(xv.unit), yFmt: axisFmt(yv.unit),
      // Narrow screens get the short names, which fit along the axes
      xTitle: width < 640 ? capital(xv.short) : xv.label, yTitle: width < 640 ? capital(yv.short) : yv.label,
      groups: hl.groups, smooth: true,
      onHover: (p, pos) => {
        if (!p || !pos) {
          tip.hidden = true;
          return;
        }
        const d = rows.find((r) => (r.id ?? r.org) === p.id)!;
        tip.replaceChildren(el("strong", undefined, d.name),
          el("div", undefined, `${capital(yv.short)}: ${fmt(yv.unit, p.y)}`),
          el("div", undefined, `${capital(xv.short)}: ${fmt(xv.unit, p.x)}`));
        if (d.towns.length > 1) tip.append(el("div", "cw-tip-towns", `Towns: ${d.towns.join(", ")}`));
        if (d.id) tip.append(el("div", "cw-tip-hint", "Select to open in the School districts tab"));
        tip.hidden = false;
        const box = svg.getBoundingClientRect();
        const fig = figure.getBoundingClientRect();
        const scale = box.width / width;
        const left = box.left - fig.left + pos.left * scale;
        const top = box.top - fig.top + pos.top * scale;
        tip.style.left = `${Math.min(left + 12, fig.width - tip.offsetWidth - 4)}px`;
        tip.style.top = `${Math.max(0, top - tip.offsetHeight - 10)}px`;
      },
      onPick: (p) => {
        const d = rows.find((r) => (r.id ?? r.org) === p.id);
        if (d?.id) {
          dialog.close();
          opts.openDistrict(d.id);
        }
      },
    });

    setParams();
  }

  /** The legend, finding, caption, ranking and table: everything but the chart. */
  function describe(v: View, pts: Point[], hl: (typeof HIGHLIGHTS)[string]) {
    const yv = VAR.get(v.y)!;
    const xv = VAR.get(v.x)!;
    const n = pts.length;
    legend.replaceChildren(...Object.entries(hl.groups).sort((a, b) => b[1].z - a[1].z).map(([, g]) => {
      const li = el("li");
      const key = el("span", `cw-key ${g.shape}`);
      key.style.setProperty("--c", g.color);
      li.append(key, el("span", undefined, g.label));
      return li;
    }), (() => {
      const li = el("li");
      li.append(el("span", "cw-key smooth"), el("span", undefined, "Smoothed trend (LOESS)"));
      return li;
    })());

    const omitted = v.all ? "" : ` Left out: Boston, Provincetown, and districts with fewer than ${MIN_FE} foundation pupils.`;
    const srcs = [...new Set([...yv.src, ...xv.src])].map((k) => SOURCES[k]);
    caption.replaceChildren(`FY${v.fy} · ${n} districts.${omitted} Sources: `);
    srcs.forEach((s, k) => {
      const a = el("a", undefined, s.name);
      a.href = s.url;
      caption.append(...(k ? [", ", a] : [a]));
    });
    caption.append(". Towns' figures pool each district's member towns.");

    // The table: every district drawn, highest first
    const t = el("table");
    const hr = t.createTHead().insertRow();
    hr.append(el("th", undefined, "District"), el("th", undefined, capital(yv.short)), el("th", undefined, capital(xv.short)));
    const tb = t.createTBody();
    for (const p of [...pts].sort((a, b) => b.y - a.y)) {
      const r = tb.insertRow();
      const th = el("th", undefined, p.name);
      th.scope = "row";
      r.append(th, el("td", undefined, fmt(yv.unit, p.y)), el("td", undefined, fmt(xv.unit, p.x)));
    }
    tableHolder.replaceChildren(t);
    tableTitle.textContent = `${capital(yv.label)} and ${xv.label.toLowerCase()}, FY${v.fy}: ${n} districts, highest first.`;

    // The picker: every other measure, closest first
    const rank = ranking(v);
    sideHead.textContent = "Horizontal";
    sideSub.textContent = `Every other measure, ranked by how closely it lines up with ${yv.short} in FY${v.fy}. ` +
      "Select one to put it across the bottom.";
    bars.replaceChildren(...rank.map((o) => {
      const li = el("li");
      const b = el("button", `cw-bar${o.v.key === v.x ? " is-current" : ""}`);
      b.type = "button";
      b.setAttribute("aria-pressed", String(o.v.key === v.x));
      const track = el("span", "cw-bar-track");
      if (o.r != null) {
        const fill = el("span", `cw-bar-fill${o.r < 0 ? " neg" : ""}`);
        fill.style.width = `${Math.abs(o.r) * 50}%`;
        track.append(fill);
      }
      b.append(el("span", "cw-bar-label", capital(o.v.short)), track, el("span", "cw-bar-value", o.r == null ? "–" : rho(o.r)));
      b.title = o.r == null ? `${capital(o.v.label)}: no FY${v.fy} data` : `${capital(o.v.label)}: ρ = ${rho(o.r)} across ${o.n} districts`;
      b.disabled = o.r == null;
      b.addEventListener("click", () => {
        view = { ...v, preset: null, x: o.v.key, log: !!o.v.log };
        draw();
      });
      li.append(b);
      return li;
    }));
    // The finding sets school measures against size and wealth, not against one another
    const kind = rank.filter((o) => o.r != null && o.v.role !== yv.role);
    const top = kind[0];
    const here = rank.find((o) => o.v.key === v.x && o.r != null);
    const among = yv.role === "outcome" ? "Of the measures of size and the towns' wealth" : "Of the school measures";
    finding.textContent = !top ? "" :
      `${among}, ${top.v.short} lines up most closely with ${yv.short} in FY${v.fy} (ρ = ${rho(top.r!)}, ${top.n} districts)` +
      (!here || here === top ? "." : Math.abs(Math.abs(here.r!) - Math.abs(top.r!)) < 0.005
        ? `; ${xv.short}, across the bottom now, is as close.` : `; ${xv.short}, across the bottom now, has ρ = ${rho(here.r!)}.`);
  }

  const change = (patch: Partial<View>) => {
    if (!view) return;
    view = { ...view, preset: null, ...patch };
    draw();
  };
  // A new vertical measure keeps the horizontal one, unless they'd be the same: then the
  // closest measure of the other kind goes across
  ySel.addEventListener("change", () => {
    if (!view) return;
    let x = view.x;
    if (x === ySel.value) {
      const best = ranking({ ...view, y: ySel.value }).find((o) => o.r != null && o.v.role !== VAR.get(ySel.value)!.role);
      x = best?.v.key ?? x;
    }
    change({ y: ySel.value, x, log: x === view.x ? view.log : !!VAR.get(x)?.log });
  });
  fySel.addEventListener("change", () => change({ fy: Number(fySel.value) }));
  hlSel.addEventListener("change", () => change({ hl: hlSel.value }));
  logBox.addEventListener("change", () => change({ log: logBox.checked }));
  allBox.addEventListener("change", () => change({ all: allBox.checked }));
  find.addEventListener("change", () => {
    const d = data.districts.find((r) => r.name.toLowerCase() === find.value.trim().toLowerCase());
    change({ find: d ? d.org : null });
  });
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    view = null;
    tip.hidden = true;
    setParams();
  });
  // Redraw when the room changes: the window, or the settings folding open or shut
  let lastW = 0;
  let lastH = 0;
  new ResizeObserver(() => {
    const w = body.clientWidth;
    const h = body.clientHeight;
    if (dialog.open && (Math.abs(w - lastW) > 8 || Math.abs(h - lastH) > 8)) {
      lastW = w;
      lastH = h;
      draw();
    }
  }).observe(body);

  /** Open the plot a link names: ?view=commonwealth&plot=...&x=...&y=... */
  function openFromUrl() {
    const q = new URLSearchParams(location.search);
    const preset = PRESETS.find((p) => p.id === q.get("plot"));
    const y = VAR.has(q.get("y") ?? "") ? q.get("y")! : preset?.y;
    const x = VAR.has(q.get("x") ?? "") ? q.get("x")! : preset?.x;
    if (!x || !y) return;
    const fy = Number(q.get("fy"));
    open({
      preset: preset?.id ?? null, x, y, fy: years.includes(fy) ? fy : latest,
      log: q.has("log") ? q.get("log") === "1" : preset?.log ?? !!VAR.get(x)?.log,
      all: q.get("all") === "1", hl: q.get("hl") && HIGHLIGHTS[q.get("hl")!] ? q.get("hl")! : DEFAULT_HL, find: q.get("find"),
    });
  }

  return { openFromUrl, close: () => dialog.open && dialog.close() };
}
