// Element index: a panel along the right of every page, in dev only (astro.config.mjs injects it when the
// command is dev; the build never sees it). It lists the page's elements by id, or its classes, so one can be
// found, outlined on the page, and its selector copied to paste into a request. Pick mode copies the selector of
// whatever is clicked: its id, or the nearest ancestor's id and the path down from it.
// What's clicked stays outlined (pinned) until it's clicked again, cleared, or Esc.
// Alt+Shift+E opens and closes it; Alt+Shift+P picks; Esc stops picking, then clears the pin.
(() => {
  if (window.__elementIndex) return;
  window.__elementIndex = true;
  const KEY = "elementIndex";
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } })();
  const st = { open: !!saved.open, mode: saved.mode || "ids", visible: saved.visible !== false, withText: !!saved.withText, q: "", picking: false };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ open: st.open, mode: st.mode, visible: st.visible, withText: st.withText })); } catch { /* blocked */ } };

  const host = document.createElement("div");
  host.id = "__element-index";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    :host { all: initial; }
    * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, sans-serif; }
    [hidden] { display: none !important; }
    .tab { position: fixed; top: 40%; right: 0; z-index: 2147483646; writing-mode: vertical-rl; transform: rotate(180deg);
      padding: 10px 5px; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; color: #fff; background: #322e29;
      border: 0; border-radius: 0 6px 6px 0; cursor: pointer; opacity: 0.85; }
    .tab:hover { opacity: 1; }
    .panel { position: fixed; top: 0; right: 0; bottom: 0; width: 340px; z-index: 2147483646; display: flex; flex-direction: column;
      background: #fffdf8; color: #322e29; border-left: 1px solid #d8d0c2; box-shadow: -8px 0 24px rgba(0,0,0,0.12); font-size: 12.5px; }
    .head { padding: 8px 10px; border-bottom: 1px solid #e6dfd2; display: grid; gap: 6px; }
    .row1 { display: flex; align-items: center; gap: 6px; }
    .title { font-weight: 700; flex: 1; }
    button { font: inherit; font-size: 12px; padding: 3px 8px; border: 1px solid #cfc6b6; border-radius: 999px; background: #fff; color: #322e29; cursor: pointer; }
    button[aria-pressed="true"] { background: #322e29; color: #fff; border-color: #322e29; }
    input[type=search] { width: 100%; font: inherit; padding: 5px 8px; border: 1px solid #cfc6b6; border-radius: 6px; }
    label { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #5c554b; }
    .opts { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; }
    .status { min-height: 1.3em; font-size: 12px; color: #2f6b3a; word-break: break-all; }
    .list { flex: 1; overflow: auto; padding: 4px 0; }
    .item { display: flex; align-items: baseline; gap: 6px; padding: 3px 10px; cursor: pointer; border-left: 3px solid transparent; }
    .item:hover, .item.on { background: #f3eee4; border-left-color: #d35545; }
    .sel { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #8a2d1f; white-space: nowrap; }
    .tag { color: #8f8a7f; font-size: 11px; }
    .txt { color: #6b645a; font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
    .n { color: #8f8a7f; font-size: 11px; }
    .go { border: 0; background: none; padding: 0 2px; color: #8f8a7f; font-size: 13px; }
    .go:hover { color: #322e29; }
    .foot { padding: 6px 10px; border-top: 1px solid #e6dfd2; font-size: 11px; color: #8f8a7f; }
    .box { position: fixed; z-index: 2147483645; pointer-events: none; border: 2px solid #d35545; background: rgba(211,85,69,0.08); border-radius: 3px; }
    .box.pin { z-index: 2147483644; border: 2.5px solid #2a78d6; background: rgba(42,120,214,0.10); box-shadow: 0 0 0 2px rgba(255,255,255,0.7); }
    .item.pinned { background: #e6eff9; border-left-color: #2a78d6; }
    .clear { border: 0; background: none; padding: 0 0 0 6px; color: #2a78d6; text-decoration: underline; font-size: 12px; }
    .label { position: fixed; z-index: 2147483647; pointer-events: none; padding: 2px 6px; font-family: ui-monospace, monospace; font-size: 11.5px;
      color: #fff; background: #322e29; border-radius: 4px; max-width: 60vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  </style>
  <button class="tab" type="button" title="Element index (Alt+Shift+E)">Elements</button>
  <div class="panel" hidden>
    <div class="head">
      <div class="row1"><span class="title">Elements</span>
        <button type="button" data-mode="ids">IDs</button><button type="button" data-mode="classes">Classes</button>
        <button type="button" class="pick" title="Click anything on the page to copy its selector (Alt+Shift+P; Esc stops)">Pick</button>
        <button type="button" class="close" title="Close (Alt+Shift+E)">×</button></div>
      <input type="search" placeholder="Filter by id, class, tag, or text">
      <div class="opts"><label><input type="checkbox" class="vis"> Visible only</label>
        <label><input type="checkbox" class="wt"> Copy with its text</label></div>
      <div class="status" aria-live="polite"></div>
    </div>
    <div class="list"></div>
    <div class="foot">Hover to outline · click to copy · ↘ to scroll there</div>
  </div>`;
  const $ = (s) => root.querySelector(s);
  const panel = $(".panel"), tab = $(".tab"), list = $(".list"), status = $(".status"), search = $("input[type=search]");
  const boxes = [];
  const pinBoxes = [];
  let label = null;
  // The pinned selection: its selector, found again on every redraw, since the explorer replaces what it draws
  let pinned = null;

  const isMine = (el) => el === host || host.contains(el);
  const shown = (el) => !!(el.offsetParent || el.getClientRects().length) && getComputedStyle(el).visibility !== "hidden";
  const snippet = (el) => (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 70);
  const cssId = (id) => (/^[A-Za-z_][\w-]*$/.test(id) ? `#${id}` : `[id="${id.replace(/"/g, '\\"')}"]`);
  // Classes worth naming: Astro's scope classes (astro-xxxx) say nothing to a reader
  const classesOf = (el) => [...el.classList].filter((c) => !/^astro-/.test(c));

  /** The shortest selector that finds the element alone: its id, or its nearest id'd ancestor and the fewest steps
   * down from there that still find only it */
  function selectorOf(el) {
    if (el.id) return cssId(el.id);
    const steps = [];
    let cur = el;
    while (cur && cur !== document.body && !cur.id) {
      let step = cur.tagName.toLowerCase();
      const cls = classesOf(cur)[0];
      if (cls) step += `.${CSS.escape(cls)}`;
      const parent = cur.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === cur.tagName);
        if (same.length > 1 && (!cls || same.filter((c) => c.classList.contains(cls)).length > 1)) step += `:nth-of-type(${same.indexOf(cur) + 1})`;
      }
      steps.unshift(step);
      cur = parent;
    }
    const anchor = cur && cur.id ? `${cssId(cur.id)} ` : "";
    // From the element up, the first path that finds it alone
    for (let k = 1; k <= steps.length; k++) {
      const s = anchor + steps.slice(-k).join(" > ");
      try {
        const hits = document.querySelectorAll(s);
        if (hits.length === 1 && hits[0] === el) return s;
      } catch { /* an unusual class name */ }
    }
    return anchor + steps.join(" > ");
  }

  function draw(into, els, cls) {
    into.splice(0).forEach((b) => b.remove());
    for (const el of els.slice(0, 60)) {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const b = document.createElement("div");
      b.className = cls;
      Object.assign(b.style, { left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
      root.append(b);
      into.push(b);
    }
  }
  const outline = (els) => draw(boxes, els, "box");
  const pinnedEls = () => {
    if (!pinned) return [];
    try { return [...document.querySelectorAll(pinned)].filter((el) => !isMine(el)); } catch { return []; }
  };
  const drawPin = () => draw(pinBoxes, pinnedEls(), "box pin");
  function pin(sel) {
    pinned = sel;
    drawPin();
    list.querySelectorAll(".item").forEach((it) => it.classList.toggle("pinned", it.dataset.sel === pinned));
  }
  function unpin() {
    pin(null);
    status.textContent = "";
  }
  function tag(text, x, y) {
    label?.remove();
    if (!text) return (label = null);
    label = document.createElement("div");
    label.className = "label";
    label.textContent = text;
    Object.assign(label.style, { left: `${Math.min(x + 12, innerWidth - 360)}px`, top: `${Math.max(4, y - 26)}px` });
    root.append(label);
  }
  async function copy(sel, el) {
    const text = st.withText && el ? `${sel}  "${snippet(el)}"` : sel;
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    status.textContent = `Copied: ${text}`;
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "clear";
    clear.textContent = "Clear";
    clear.addEventListener("click", unpin);
    status.append(clear);
  }

  function render() {
    panel.hidden = !st.open;
    tab.hidden = st.open;
    root.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === st.mode)));
    $(".pick").setAttribute("aria-pressed", String(st.picking));
    $(".vis").checked = st.visible;
    $(".wt").checked = st.withText;
    if (!st.open) return;
    const q = st.q.toLowerCase();
    const all = [...document.body.querySelectorAll("*")].filter((el) => !isMine(el));
    const rows = [];
    if (st.mode === "ids") {
      for (const el of all) {
        if (!el.id || (st.visible && !shown(el))) continue;
        const text = snippet(el);
        const hay = `${el.id} ${el.tagName} ${classesOf(el).join(" ")} ${text}`.toLowerCase();
        if (q && !hay.includes(q)) continue;
        rows.push({ sel: cssId(el.id), els: [el], tag: el.tagName.toLowerCase(), text });
      }
    } else {
      const by = new Map();
      for (const el of all) {
        if (st.visible && !shown(el)) continue;
        for (const c of classesOf(el)) {
          if (!by.has(c)) by.set(c, []);
          by.get(c).push(el);
        }
      }
      for (const [c, els] of [...by].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (q && !c.toLowerCase().includes(q)) continue;
        rows.push({ sel: `.${CSS.escape(c)}`, els, tag: "", text: snippet(els[0]), n: els.length });
      }
    }
    list.replaceChildren(...rows.slice(0, 1500).map((r) => {
      const item = document.createElement("div");
      item.className = r.sel === pinned ? "item pinned" : "item";
      item.dataset.sel = r.sel;
      item.title = r.text;
      const sel = document.createElement("span");
      sel.className = "sel";
      sel.textContent = r.sel;
      const meta = document.createElement("span");
      meta.className = r.n ? "n" : "tag";
      meta.textContent = r.n ? `×${r.n}` : r.tag;
      const txt = document.createElement("span");
      txt.className = "txt";
      txt.textContent = r.text;
      const go = document.createElement("button");
      go.type = "button";
      go.className = "go";
      go.textContent = "↘";
      go.title = "Scroll to it";
      go.addEventListener("click", (e) => {
        e.stopPropagation();
        r.els[0].scrollIntoView({ block: "center", behavior: "smooth" });
        setTimeout(() => outline(r.els), 450);
      });
      item.append(sel, meta, txt, go);
      item.addEventListener("mouseenter", () => outline(r.els));
      item.addEventListener("mouseleave", () => outline([]));
      // Click to copy and pin; click the pinned one again to unpin
      item.addEventListener("click", () => {
        if (pinned === r.sel) return unpin();
        copy(r.sel, r.els[0]);
        pin(r.sel);
      });
      return item;
    }));
    if (rows.length > 1500) list.append(Object.assign(document.createElement("div"), { className: "foot", textContent: `${rows.length - 1500} more; filter to see them` }));
  }

  // Pick: hover anything to see its selector, click to copy it
  const onMove = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isMine(el)) return;
    outline([el]);
    tag(selectorOf(el), e.clientX, e.clientY);
  };
  const onClick = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isMine(el)) return;
    e.preventDefault();
    e.stopPropagation();
    const sel = selectorOf(el);
    copy(sel, el);
    pick(false);
    pin(sel);
  };
  function pick(on) {
    st.picking = on;
    document.documentElement.style.cursor = on ? "crosshair" : "";
    const f = on ? "addEventListener" : "removeEventListener";
    document[f]("mousemove", onMove, true);
    document[f]("click", onClick, true);
    if (!on) { outline([]); tag(""); }
    if (on) status.textContent = "Click an element to copy its selector; Esc to stop.";
    render();
  }

  tab.addEventListener("click", () => { st.open = true; save(); render(); });
  $(".close").addEventListener("click", () => { st.open = false; save(); pick(false); unpin(); });
  root.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { st.mode = b.dataset.mode; save(); render(); }));
  $(".pick").addEventListener("click", () => pick(!st.picking));
  $(".vis").addEventListener("change", (e) => { st.visible = e.target.checked; save(); render(); });
  $(".wt").addEventListener("change", (e) => { st.withText = e.target.checked; save(); });
  search.addEventListener("input", () => { st.q = search.value; render(); });
  addEventListener("keydown", (e) => {
    if (e.altKey && e.shiftKey && e.code === "KeyE") { st.open = !st.open; save(); if (!st.open) { pick(false); unpin(); } render(); }
    else if (e.altKey && e.shiftKey && e.code === "KeyP") { if (!st.open) { st.open = true; save(); } pick(!st.picking); }
    else if (e.key === "Escape" && st.picking) pick(false);
    else if (e.key === "Escape" && pinned) unpin();
  }, true);
  // The explorer redraws as choices change: keep the list current while the panel is open
  let timer = 0;
  new MutationObserver((ms) => {
    if (ms.every((m) => isMine(m.target))) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (st.open) render();
      drawPin();
    }, 400);
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["id", "class", "hidden"] });
  // The hover outline goes on scrolling; the pin follows its element
  let frame = 0;
  const follow = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      drawPin();
    });
  };
  addEventListener("scroll", () => { outline([]); follow(); }, true);
  addEventListener("resize", follow);

  const mount = () => { document.body.append(host); render(); };
  if (document.body) mount();
  else addEventListener("DOMContentLoaded", mount);
})();
