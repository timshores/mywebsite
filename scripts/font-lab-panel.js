// Font lab panel. astro.fontlab.config.mjs inlines this into every page's <head>, in dev only.
// It loads the chosen Google Fonts under the site's own family names ("Karla" for body
// text, "Besley" for headings), so every rule that names those families picks up the choice,
// including scoped component styles and chart SVGs.
(() => {
  const BASE = { body: "Karla", head: "Besley" };
  const SAME = "Same as body";
  const KEY = "fontLab";

  // [family, group, Google Fonts css2 family spec]. Weights are clipped to 400–700, the range the
  // site uses; body fonts carry italics where the family has them.
  const BODY = [
    ["Space Grotesk", "Sans serif", "Space+Grotesk:wght@400..700"],
    ["Inter", "Sans serif", "Inter:ital,opsz,wght@0,14..32,400..700;1,14..32,400..700"],
    ["Source Sans 3", "Sans serif", "Source+Sans+3:ital,wght@0,400..700;1,400..700"],
    ["IBM Plex Sans", "Sans serif", "IBM+Plex+Sans:ital,wght@0,400..700;1,400..700"],
    ["Public Sans", "Sans serif", "Public+Sans:ital,wght@0,400..700;1,400..700"],
    ["DM Sans", "Sans serif", "DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700"],
    ["Work Sans", "Sans serif", "Work+Sans:ital,wght@0,400..700;1,400..700"],
    ["Figtree", "Sans serif", "Figtree:ital,wght@0,400..700;1,400..700"],
    ["Manrope", "Sans serif", "Manrope:wght@400..700"],
    ["Plus Jakarta Sans", "Sans serif", "Plus+Jakarta+Sans:ital,wght@0,400..700;1,400..700"],
    ["Hanken Grotesk", "Sans serif", "Hanken+Grotesk:ital,wght@0,400..700;1,400..700"],
    ["Instrument Sans", "Sans serif", "Instrument+Sans:ital,wght@0,400..700;1,400..700"],
    ["Schibsted Grotesk", "Sans serif", "Schibsted+Grotesk:ital,wght@0,400..700;1,400..700"],
    ["Libre Franklin", "Sans serif", "Libre+Franklin:ital,wght@0,400..700;1,400..700"],
    ["Karla", "Sans serif", "Karla:ital,wght@0,400..700;1,400..700"],
    ["Nunito Sans", "Sans serif", "Nunito+Sans:ital,opsz,wght@0,6..12,400..700;1,6..12,400..700"],
    ["Lato", "Sans serif", "Lato:ital,wght@0,400;0,700;1,400;1,700"],
    ["Open Sans", "Sans serif", "Open+Sans:ital,wght@0,400..700;1,400..700"],
    ["Geist", "Sans serif", "Geist:ital,wght@0,400..700;1,400..700"],
    ["Albert Sans", "Sans serif", "Albert+Sans:ital,wght@0,400..700;1,400..700"],
    ["Red Hat Text", "Sans serif", "Red+Hat+Text:ital,wght@0,400..700;1,400..700"],
    ["Lexend", "Sans serif", "Lexend:wght@400..700"],
    ["Atkinson Hyperlegible Next", "Sans serif", "Atkinson+Hyperlegible+Next:ital,wght@0,400..700;1,400..700"],
    ["Source Serif 4", "Serif", "Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..700"],
    ["Literata", "Serif", "Literata:ital,opsz,wght@0,7..72,400..700;1,7..72,400..700"],
    ["Newsreader", "Serif", "Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700"],
    ["Lora", "Serif", "Lora:ital,wght@0,400..700;1,400..700"],
    ["Merriweather", "Serif", "Merriweather:ital,opsz,wght@0,18..144,400..700;1,18..144,400..700"],
    ["IBM Plex Serif", "Serif", "IBM+Plex+Serif:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700"],
    ["PT Serif", "Serif", "PT+Serif:ital,wght@0,400;0,700;1,400;1,700"],
    ["Spectral", "Serif", "Spectral:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700"],
    ["Crimson Pro", "Serif", "Crimson+Pro:ital,wght@0,400..700;1,400..700"],
    ["EB Garamond", "Serif", "EB+Garamond:ital,wght@0,400..700;1,400..700"],
    ["Libre Baskerville", "Serif", "Libre+Baskerville:ital,wght@0,400..700;1,400..700"],
    ["Alegreya", "Serif", "Alegreya:ital,wght@0,400..700;1,400..700"],
    ["Charis SIL", "Serif", "Charis+SIL:ital,wght@0,400;0,700;1,400;1,700"],
    ["Gelasio", "Serif", "Gelasio:ital,wght@0,400..700;1,400..700"],
  ];

  const HEAD = [
    ["Fraunces", "Serif", "Fraunces:opsz,wght@9..144,400..700"],
    ["Source Serif 4", "Serif", "Source+Serif+4:opsz,wght@8..60,400..700"],
    ["Newsreader", "Serif", "Newsreader:opsz,wght@6..72,400..700"],
    ["Literata", "Serif", "Literata:opsz,wght@7..72,400..700"],
    ["Lora", "Serif", "Lora:wght@400..700"],
    ["Merriweather", "Serif", "Merriweather:opsz,wght@18..144,400..700"],
    ["Playfair Display", "Serif", "Playfair+Display:wght@400..700"],
    ["DM Serif Display", "Serif", "DM+Serif+Display:wght@400"],
    ["Instrument Serif", "Serif", "Instrument+Serif:wght@400"],
    ["Young Serif", "Serif", "Young+Serif:wght@400"],
    ["Libre Baskerville", "Serif", "Libre+Baskerville:wght@400..700"],
    ["Libre Caslon Text", "Serif", "Libre+Caslon+Text:wght@400;700"],
    ["EB Garamond", "Serif", "EB+Garamond:wght@400..700"],
    ["Cormorant Garamond", "Serif", "Cormorant+Garamond:wght@400..700"],
    ["Spectral", "Serif", "Spectral:wght@400;500;600;700"],
    ["Crimson Pro", "Serif", "Crimson+Pro:wght@400..700"],
    ["Besley", "Serif", "Besley:wght@400..700"],
    ["Bodoni Moda", "Serif", "Bodoni+Moda:opsz,wght@6..96,400..700"],
    ["Roboto Slab", "Slab serif", "Roboto+Slab:wght@400..700"],
    ["Zilla Slab", "Slab serif", "Zilla+Slab:wght@400;500;600;700"],
    ["Bitter", "Slab serif", "Bitter:wght@400..700"],
    ["Arvo", "Slab serif", "Arvo:wght@400;700"],
    ["Space Grotesk", "Sans serif", "Space+Grotesk:wght@400..700"],
    ["Inter Tight", "Sans serif", "Inter+Tight:wght@400..700"],
    ["Bricolage Grotesque", "Sans serif", "Bricolage+Grotesque:opsz,wght@12..96,400..700"],
    ["Sora", "Sans serif", "Sora:wght@400..700"],
    ["Epilogue", "Sans serif", "Epilogue:wght@400..700"],
    ["Archivo", "Sans serif", "Archivo:wght@400..700"],
    ["Manrope", "Sans serif", "Manrope:wght@400..700"],
    ["Outfit", "Sans serif", "Outfit:wght@400..700"],
    ["Schibsted Grotesk", "Sans serif", "Schibsted+Grotesk:wght@400..700"],
    ["Instrument Sans", "Sans serif", "Instrument+Sans:wght@400..700"],
    ["Plus Jakarta Sans", "Sans serif", "Plus+Jakarta+Sans:wght@400..700"],
    ["DM Sans", "Sans serif", "DM+Sans:opsz,wght@9..40,400..700"],
    ["Hanken Grotesk", "Sans serif", "Hanken+Grotesk:wght@400..700"],
    ["Work Sans", "Sans serif", "Work+Sans:wght@400..700"],
    ["Familjen Grotesk", "Sans serif", "Familjen+Grotesk:wght@400..700"],
  ];

  // [body, headings, note]
  const PAIRINGS = [
    ["Karla", "Besley", "current site"],
    ["Space Grotesk", "Fraunces", "previous site"],
    ["Inter", "Fraunces", "same headings, plainer body"],
    ["Atkinson Hyperlegible Next", "Fraunces", "most legible body"],
    ["Source Sans 3", "Source Serif 4", "Adobe superfamily"],
    ["IBM Plex Sans", "IBM Plex Serif", "IBM superfamily"],
    ["Public Sans", "Newsreader", "civic, editorial"],
    ["DM Sans", "DM Serif Display", "matched set"],
    ["Libre Franklin", "Libre Baskerville", "classic American"],
    ["Hanken Grotesk", "Instrument Serif", "modern editorial"],
    ["Lato", "Merriweather", "long-standing web pair"],
    ["Newsreader", "Inter Tight", "serif body"],
    ["Source Serif 4", "Bricolage Grotesque", "serif body"],
  ];

  const bodySpec = new Map(BODY.map(([name, , spec]) => [name, spec]));
  const headSpec = new Map(HEAD.map(([name, , spec]) => [name, spec]));
  const headName = (s) => (s.head === SAME ? s.body : s.head);
  const specFor = (name, role) => (role === "head" && headSpec.get(name)) || bodySpec.get(name);
  const cssUrl = (spec) => `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;

  const load = () => {
    const s = { body: BASE.body, head: BASE.head, size: 100, open: true };
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (bodySpec.has(saved.body)) s.body = saved.body;
      if (saved.head === SAME || headSpec.has(saved.head)) s.head = saved.head;
      if (saved.size >= 85 && saved.size <= 120) s.size = saved.size;
      if (typeof saved.open === "boolean") s.open = saved.open;
    } catch {}
    return s;
  };
  const state = load();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  };

  // Font CSS is cached per tab so moving between pages swaps fonts before first paint.
  const memo = new Map();
  const cachedCss = (url) => {
    if (memo.has(url)) return memo.get(url);
    try {
      const text = sessionStorage.getItem(`${KEY}:${url}`);
      if (text) memo.set(url, text);
      return text;
    } catch {
      return null;
    }
  };
  const fetchCss = async (url) => {
    const hit = cachedCss(url);
    if (hit) return hit;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const text = await res.text();
    memo.set(url, text);
    try { sessionStorage.setItem(`${KEY}:${url}`, text); } catch {}
    return text;
  };
  const alias = (css, family) => css.replace(/font-family:\s*['"][^'"]+['"]/g, `font-family: '${family}'`);

  const styleEl = (id) => {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      (document.head || document.documentElement).appendChild(el);
    }
    return el;
  };

  // The layout's own Google Fonts link is switched off while a different pair is showing, so
  // its faces cannot mix with the aliased ones. The observer catches it if it parses after us.
  let muted = false;
  const muteOriginals = () => {
    for (const link of document.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]')) {
      if (/Space\+Grotesk|Fraunces/.test(link.href)) link.media = muted ? "not all" : "all";
    }
  };
  const watcher = new MutationObserver(muteOriginals);
  watcher.observe(document.documentElement, { childList: true, subtree: true });

  let setStatus = () => {};
  let ticket = 0;
  const apply = () => {
    const t = ++ticket;
    styleEl("font-lab-size").textContent = state.size === 100 ? "" : `html { font-size: ${state.size}%; }`;
    const head = headName(state);
    if (state.body === BASE.body && head === BASE.head) {
      muted = false;
      muteOriginals();
      styleEl("font-lab-faces").textContent = "";
      setStatus("");
      return;
    }
    const parts = [
      [cssUrl(specFor(state.body, "body")), BASE.body],
      [cssUrl(specFor(head, "head")), BASE.head],
    ];
    // Display faces that only come in one weight show at that weight rather than faux bold.
    const done = (texts) => {
      if (t !== ticket) return;
      styleEl("font-lab-faces").textContent =
        texts.map((css, i) => alias(css, parts[i][1])).join("\n") + "\n* { font-synthesis-weight: none; }";
      muted = true;
      muteOriginals();
      setStatus("");
    };
    const hits = parts.map(([url]) => cachedCss(url));
    if (hits.every(Boolean)) return done(hits);
    setStatus("Loading…");
    Promise.all(parts.map(([url]) => fetchCss(url))).then(done, () => {
      if (t === ticket) setStatus("Couldn't reach Google Fonts");
    });
  };
  apply();

  const PANEL_CSS = `
    #font-lab { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; width: 340px;
      max-width: calc(100vw - 32px); font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #1f1f1c; background: #fffdf8; border: 1px solid #cfc6b6; border-radius: 12px;
      box-shadow: 0 10px 30px rgba(31, 31, 28, 0.18); }
    #font-lab * { box-sizing: border-box; font: inherit; color: inherit; letter-spacing: normal; }
    #font-lab .fl-pill { display: none; border: 0; background: none; padding: 8px 12px; cursor: pointer;
      font-weight: 600; white-space: nowrap; }
    #font-lab.is-closed { width: auto; }
    #font-lab.is-closed .fl-pill { display: block; }
    #font-lab.is-closed .fl-panel { display: none; }
    #font-lab .fl-panel { padding: 10px 12px 12px; display: grid; gap: 8px; }
    #font-lab .fl-top { display: flex; align-items: center; gap: 8px; }
    #font-lab .fl-top strong { font-weight: 700; }
    #font-lab .fl-status { flex: 1; color: #8a6d3b; font-size: 12px; }
    #font-lab .fl-row { display: grid; grid-template-columns: 64px 26px 1fr 26px; gap: 4px; align-items: center; }
    #font-lab .fl-row.wide { grid-template-columns: 64px 1fr; }
    #font-lab .fl-row.size { grid-template-columns: 64px 1fr 40px; }
    #font-lab .fl-label { color: #524f45; font-size: 12px; }
    #font-lab select { width: 100%; min-width: 0; padding: 4px 6px; border: 1px solid #cfc6b6; border-radius: 6px;
      background: #fff; }
    #font-lab button { border: 1px solid #cfc6b6; border-radius: 6px; background: #f4f1e8; cursor: pointer;
      padding: 3px 0; }
    #font-lab button:hover { background: #ebe5d6; }
    #font-lab .fl-close { width: 26px; }
    #font-lab .fl-hint { font-size: 12px; color: #6b675c; margin: 0; min-height: 0; }
    #font-lab .fl-hint:empty { display: none; }
    #font-lab input[type="range"] { width: 100%; }
    #font-lab output { text-align: right; font-variant-numeric: tabular-nums; }
    #font-lab .fl-reset { padding: 5px 0; }
  `;

  const options = (list, extra) => {
    const groups = new Map();
    for (const [name, group] of list) {
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(name);
    }
    const esc = (v) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    let html = extra ? `<option value="${esc(extra)}">${esc(extra)}</option>` : "";
    for (const [group, names] of groups) {
      html += `<optgroup label="${esc(group)}">`;
      for (const name of names) {
        const tag = name === BASE.body || name === BASE.head ? `${name} (current)` : name;
        html += `<option value="${esc(name)}">${esc(tag)}</option>`;
      }
      html += "</optgroup>";
    }
    return html;
  };

  const build = () => {
    styleEl("font-lab-ui").textContent = PANEL_CSS;
    const root = document.createElement("div");
    root.id = "font-lab";
    root.innerHTML = `
      <button type="button" class="fl-pill" aria-label="Open font lab">Aa · Font lab</button>
      <div class="fl-panel">
        <div class="fl-top"><strong>Font lab</strong><span class="fl-status"></span>
          <button type="button" class="fl-close" aria-label="Collapse font lab">–</button></div>
        <div class="fl-row wide"><span class="fl-label">Pairing</span><select data-k="pair"></select></div>
        <div class="fl-row"><span class="fl-label">Body text</span><button type="button" data-step="body" data-dir="-1" aria-label="Previous body font">‹</button>
          <select data-k="body">${options(BODY)}</select><button type="button" data-step="body" data-dir="1" aria-label="Next body font">›</button></div>
        <div class="fl-row"><span class="fl-label">Headings</span><button type="button" data-step="head" data-dir="-1" aria-label="Previous heading font">‹</button>
          <select data-k="head">${options(HEAD, SAME)}</select><button type="button" data-step="head" data-dir="1" aria-label="Next heading font">›</button></div>
        <p class="fl-hint"></p>
        <div class="fl-row size"><span class="fl-label">Text size</span><input type="range" min="85" max="120" step="1" data-k="size"><output></output></div>
        <button type="button" class="fl-reset">Back to the current site</button>
      </div>`;
    document.body.appendChild(root);

    const $ = (sel) => root.querySelector(sel);
    const pair = $('[data-k="pair"]');
    const body = $('[data-k="body"]');
    const head = $('[data-k="head"]');
    const size = $('[data-k="size"]');
    const status = $(".fl-status");
    const hint = $(".fl-hint");
    setStatus = (text) => { status.textContent = text; };

    pair.innerHTML = `<option value="custom" disabled>Custom pairing</option>` +
      PAIRINGS.map(([b, h], i) => `<option value="${i}">${b} + ${h}</option>`).join("");

    const sync = () => {
      root.classList.toggle("is-closed", !state.open);
      body.value = state.body;
      head.value = state.head;
      size.value = String(state.size);
      $("output").textContent = `${state.size}%`;
      const h = headName(state);
      const match = PAIRINGS.findIndex(([b, hd]) => b === state.body && hd === h);
      pair.value = match >= 0 ? String(match) : "custom";
      const note = match >= 0 ? `Pairing: ${PAIRINGS[match][2]}.` : "";
      const weight = /:wght@400$/.test(specFor(h, "head")) ? `${h} comes in one weight, so headings show unbolded.` : "";
      hint.textContent = [note, weight].filter(Boolean).join(" ");
    };
    const update = (patch) => {
      Object.assign(state, patch);
      save();
      sync();
      apply();
    };

    pair.addEventListener("change", () => {
      const [b, h] = PAIRINGS[Number(pair.value)];
      update({ body: b, head: h });
    });
    body.addEventListener("change", () => update({ body: body.value }));
    head.addEventListener("change", () => update({ head: head.value }));
    size.addEventListener("input", () => update({ size: Number(size.value) }));
    for (const btn of root.querySelectorAll("[data-step]")) {
      btn.addEventListener("click", () => {
        const select = btn.dataset.step === "body" ? body : head;
        const values = [...select.options].map((o) => o.value);
        const i = values.indexOf(select.value) + Number(btn.dataset.dir);
        update({ [btn.dataset.step]: values[(i + values.length) % values.length] });
      });
    }
    $(".fl-reset").addEventListener("click", () => update({ body: BASE.body, head: BASE.head, size: 100 }));
    $(".fl-close").addEventListener("click", () => update({ open: false }));
    $(".fl-pill").addEventListener("click", () => update({ open: true }));
    sync();
  };

  document.addEventListener("DOMContentLoaded", () => {
    muteOriginals();
    watcher.disconnect();
    build();
  });
})();
