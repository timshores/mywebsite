// Checks of the explorer in a browser, for a change that should leave what readers see as it was, or change only
// what it means to (#237). Run against a dev server or the live site:
//
//   node scripts/check/explorer.mjs snapshot BASE OUT.json   the words and numbers of a set of views: headings,
//                                                            tiles, each chart's caption, legend, axis labels and
//                                                            drawn marks, its comparison table and full data table;
//                                                            the map's legend, about and group table for each
//                                                            measure; a plot's finding, cautions and caption
//   node scripts/check/explorer.mjs compare A.json B.json    what differs between two snapshots or style records;
//                                                            exits 1 if anything does
//   node scripts/check/explorer.mjs styles BASE OUT.json     every explorer element's computed style and box, on
//                                                            each tab at 1280px and 375px, for a CSS change
//   node scripts/check/explorer.mjs overflow BASE            sideways scroll on every tab at 320, 375, 768, 1366px
//   node scripts/check/explorer.mjs colors BASE              on the map, every figure shown in one color (#231)
//
// BASE is the explorer's address, such as http://localhost:4321/muni-spending/. Playwright isn't a dependency of
// this site: it comes from PLAYWRIGHT_FROM, a directory whose node_modules has it (seahag's evals by default), and
// the browser's libraries from CHROMIUM_LIBS where the system lacks them.
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const from = process.env.PLAYWRIGHT_FROM ?? join(homedir(), "projects/seahag/evals");
const { chromium } = createRequire(join(from, "package.json"))("playwright");
const libs = process.env.CHROMIUM_LIBS ?? join(homedir(), "projects/seahag/local/chromium-libs/root/usr/lib/x86_64-linux-gnu");
const launch = () => chromium.launch({ env: { ...process.env, ...(existsSync(libs) ? { LD_LIBRARY_PATH: libs } : {}) } });

// The views a snapshot reads: districts, averages, a charter school, a former district, Since 1990, totals; towns
// with each kind of comparison; a plot with groups picked out
const VIEWS = [
  "?d=leverett", "?d=leverett&cmp=region&hist=on", "?d=ashburnham-westminster&cmp=cohort", "?d=amherst-pelham&cmp=state&dper=total",
  "?d=region-western", "?d=statewide-all&hist=on", "?d=abby-kelley-foster-charter-public-district", "?d=acton&hist=on",
  "?view=towns&t=amherst&tcmp=peer", "?view=towns&t=leverett&per=parcel", "?view=towns&t=boston&tcmp=state",
  "?view=commonwealth&y=soc&x=el&hl=region&focus=west", "?view=cap",
];
const MAP_LAYERS = ["districts", "towns"];

const errorsOf = (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
};
const settle = (page, ms = 900) => page.waitForTimeout(ms);
const squash = (s) => (s == null ? null : s.replace(/\s+/g, " ").trim());

async function readView(page) {
  return page.evaluate(() => {
    // innerText, the words as shown; a comparison table folded away is read whole (textContent)
    const t = (n) => (n ? n.innerText.replace(/\s+/g, " ").trim() : null);
    const shown = (n) => n && !n.closest("[hidden]") && n.offsetParent !== null;
    const out = { name: t(document.getElementById("entity-name")), meta: t(document.getElementById("entity-meta")),
      tiles: t(document.getElementById("tiles")) };
    for (const f of document.querySelectorAll("figure.panel")) {
      if (!shown(f)) continue;
      const svg = f.querySelector("svg[role=img]");
      const marks = svg ? ["rect", "path", "circle", "line"].map((k) => `${k} ${svg.querySelectorAll(k).length}`).join(", ") : null;
      out[f.id] = { title: t(f.querySelector("h3")), sub: t(f.querySelector(".panel-sub")), none: t([...f.querySelectorAll(".panel-none")].find(shown)),
        legend: t(f.querySelector("[class*=legend]")), axes: svg ? [...svg.querySelectorAll("text")].map((x) => x.textContent).join(" | ") : null,
        marks, compare: document.getElementById(`cmp-${f.id.replace(/^fig-/, "")}`)?.textContent.replace(/\s+/g, " ").trim() ?? null };
    }
    const dialog = document.querySelector("dialog.cw-dialog[open]");
    if (dialog) out.plot = { title: t(dialog.querySelector(".cw-title")), legend: t(dialog.querySelector(".cw-legend")),
      finding: t(dialog.querySelector(".cw-finding")), cautions: t(dialog.querySelector(".cw-cautions")), caption: t(dialog.querySelector(".cw-caption")),
      marks: dialog.querySelectorAll(".sc-pt").length + " points, " + dialog.querySelectorAll(".sc-pt.is-faded").length + " faded",
      axes: [...dialog.querySelectorAll("svg.cw-chart text")].map((x) => x.textContent).join(" | ") };
    // The cap tab: its words and its charts' labels
    const cap = document.getElementById("cap-view");
    if (shown(cap)) out.cap = { text: t(cap), axes: [...cap.querySelectorAll("svg text")].map((x) => x.textContent).join(" | ") };
    return out;
  });
}

/** Each chart's full data table, opened from its button, read, and closed */
async function fullTables(page) {
  const out = {};
  const buttons = page.locator("button.table-open:visible");
  for (let i = 0; i < await buttons.count(); i++) {
    const b = buttons.nth(i);
    const key = await b.getAttribute("data-table");
    await b.click();
    await settle(page, 250);
    out[key] = squash(await page.locator("#table-dialog").innerText());
    await page.locator("#table-dialog .dialog-close").click();
    await settle(page, 100);
  }
  return out;
}

async function readMap(page) {
  const out = {};
  await page.goto(`${base}?view=commonwealth`, { waitUntil: "networkidle" });
  await settle(page);
  for (const layer of MAP_LAYERS) {
    await page.click(`.map-seg-btn[data-v="${layer}"]`);
    await settle(page, 400);
    const [groupSel, measureSel] = await page.$$("#cw-map select");
    for (const g of ["", "region"]) {
      await groupSel.selectOption(g);
      await settle(page, 200);
      for (const m of await measureSel.evaluate((s) => [...s.options].map((o) => o.value))) {
        await measureSel.selectOption(m);
        await settle(page, 150);
        out[`${layer}/${g || "none"}/${m}`] = await page.evaluate(() => {
          const root = document.getElementById("cw-map");
          const t = (n) => (n ? n.innerText.replace(/\s+/g, " ").trim() : null);
          return { legend: [...root.querySelectorAll(".map-group-key")].filter((l) => l.offsetParent).map((l) => `${l.dataset.fill ?? ""} ${t(l)}`).join(" | "),
            about: t(root.querySelector(".map-measure-title")?.nextElementSibling ?? null),
            groups: t(root.querySelector(".map-groups, .map-group-table, table")) };
        });
      }
    }
  }
  return out;
}

async function snapshot(out) {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = errorsOf(page);
  const snap = {};
  for (const v of VIEWS) {
    await page.goto(base + v, { waitUntil: "networkidle" });
    await settle(page, 1200);
    snap[v] = { ...(await readView(page)), ...(/view=(commonwealth|cap)/.test(v) ? {} : { tables: await fullTables(page) }) };
  }
  snap.map = await readMap(page);
  snap.errors = errors;
  writeFileSync(out, JSON.stringify(snap, null, 1));
  console.log(`${VIEWS.length} views and ${Object.keys(snap.map).length} map measures saved to ${out}; page errors: ${errors.length || "none"}`);
  await browser.close();
}

/** Every element in the explorer, by its place in the page, with the styles a CSS change could move */
const PROPS = ["display", "position", "visibility", "color", "background-color", "font-size", "font-weight", "font-family",
  "line-height", "margin", "padding", "border", "border-radius", "gap", "overflow-x", "pointer-events", "opacity", "white-space",
  "text-align", "box-shadow"];

async function styles(out) {
  const browser = await launch();
  const record = {};
  for (const width of [1280, 375]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    errorsOf(page);
    for (const v of ["?d=leverett&cmp=region", "?view=towns&t=amherst&tcmp=peer", "?view=commonwealth", "?view=cap", "?view=data"]) {
      await page.goto(base + v, { waitUntil: "networkidle" });
      await settle(page, 1200);
      Object.assign(record, await page.evaluate(([label, props]) => {
        const path = (n) => {
          const parts = [];
          for (let x = n; x && x.id !== "explorer"; x = x.parentElement) {
            if (x.id) { parts.unshift(`#${x.id}`); break; }
            const same = [...(x.parentElement?.children ?? [])].filter((c) => c.tagName === x.tagName);
            parts.unshift(`${x.tagName.toLowerCase()}${same.length > 1 ? `:${same.indexOf(x) + 1}` : ""}`);
          }
          return parts.join(">");
        };
        const r = {};
        for (const n of document.querySelectorAll("#explorer *")) {
          if (n.closest("svg") && n.tagName.toLowerCase() !== "svg") continue;
          const cs = getComputedStyle(n);
          const b = n.getBoundingClientRect();
          r[`${label} ${path(n)}`] = `${props.map((p) => cs.getPropertyValue(p)).join("; ")}; box ${Math.round(b.width)}x${Math.round(b.height)}`;
        }
        return r;
      }, [`${width} ${v}`, PROPS]));
    }
    await page.close();
  }
  writeFileSync(out, JSON.stringify(record));
  console.log(`${Object.keys(record).length} elements' styles saved to ${out}`);
  await browser.close();
}

function compare(a, b) {
  const x = JSON.parse(readFileSync(a, "utf8"));
  const y = JSON.parse(readFileSync(b, "utf8"));
  let n = 0;
  const walk = (p, u, v) => {
    if (JSON.stringify(u) === JSON.stringify(v)) return;
    if (u && v && typeof u === "object" && typeof v === "object") {
      for (const k of new Set([...Object.keys(u), ...Object.keys(v)])) walk(p ? `${p} ${k}` : k, u[k], v[k]);
      return;
    }
    n++;
    if (n <= 40) console.log(`DIFF ${p}\n  before: ${String(JSON.stringify(u)).slice(0, 300)}\n  after:  ${String(JSON.stringify(v)).slice(0, 300)}`);
  };
  walk("", x, y);
  console.log(`${n} difference(s)`);
  process.exitCode = n ? 1 : 0;
}

async function overflow() {
  const browser = await launch();
  let bad = 0;
  for (const width of [320, 375, 768, 1366]) {
    const page = await browser.newPage({ viewport: { width, height: 812 } });
    const errors = errorsOf(page);
    const row = [];
    for (const v of ["districts", "towns", "commonwealth", "cap", "housing", "data"]) {
      await page.goto(`${base}?view=${v}`, { waitUntil: "networkidle" });
      await settle(page);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      bad += over > 0;
      row.push(`${v} ${over}`);
    }
    console.log(`${width}px, sideways scroll by tab: ${row.join(", ")}${errors.length ? `; page errors: ${errors.join(" | ")}` : ""}`);
    bad += errors.length;
    await page.close();
  }
  console.log(bad ? `${bad} problem(s)` : "no sideways scroll, no page errors");
  process.exitCode = bad ? 1 : 0;
  await browser.close();
}

async function colors() {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = errorsOf(page);
  await page.goto(`${base}?view=commonwealth`, { waitUntil: "networkidle" });
  await settle(page);
  let bad = 0;
  let checked = 0;
  for (const layer of MAP_LAYERS) {
    await page.click(`.map-seg-btn[data-v="${layer}"]`);
    await settle(page, 400);
    const [groupSel, measureSel] = await page.$$("#cw-map select");
    for (const d of ["nominal", "real"]) {
      for (const g of await groupSel.evaluate((s) => [...s.options].map((o) => o.value))) {
        await groupSel.selectOption(g);
        await settle(page, 100);
        for (const m of await measureSel.evaluate((s) => [...s.options].map((o) => o.value))) {
          await measureSel.selectOption(m);
          await settle(page, 120);
          const btn = await page.$(`.map-seg-btn[data-v="${d}"]:visible:enabled`);
          if (btn) { await btn.click(); await settle(page, 120); }
          const cells = await page.evaluate(() => [...document.querySelectorAll("#cw-map table .map-swatch")]
            .map((s) => ({ fill: getComputedStyle(s).backgroundColor, text: s.nextElementSibling?.textContent ?? "" })));
          const by = new Map();
          for (const c of cells) {
            if (!c.text || c.text === "–") continue;
            if (!by.has(c.text)) by.set(c.text, new Set());
            by.get(c.text).add(c.fill);
            checked++;
          }
          for (const [t, fs] of by) if (fs.size > 1) { bad++; console.log(`  ${layer}/${d}/${g || "none"}/${m}: ${t} in ${[...fs].join(", ")}`); }
        }
      }
    }
  }
  console.log(`${checked} figures checked, ${bad} shown in two colors; page errors: ${errors.length ? errors.join(" | ") : "none"}`);
  process.exitCode = bad || errors.length ? 1 : 0;
  await browser.close();
}

const [cmd, ...args] = process.argv.slice(2);
const base = cmd === "compare" ? null : args[0];
if (cmd === "snapshot" && args[1]) await snapshot(args[1]);
else if (cmd === "styles" && args[1]) await styles(args[1]);
else if (cmd === "compare" && args[1]) compare(args[0], args[1]);
else if (cmd === "overflow" && base) await overflow();
else if (cmd === "colors" && base) await colors();
else {
  console.log("usage: explorer.mjs snapshot BASE OUT.json | styles BASE OUT.json | compare A.json B.json | overflow BASE | colors BASE");
  process.exitCode = 2;
}
