// A searchable menu with collapsible groups, laid over a native <select>. The select
// stays the source of truth: its option groups and options fill the menu, choosing an
// option sets its value and fires "change", and it remains in the page, hidden, so the
// explorer's code reads and writes it as before. Groups start collapsed; typing in the
// search box shows only matches, opening the groups they are in.

export interface Picker {
  /** Rebuild the menu from the select's current option groups. */
  rebuild(): void;
  /** Show the select's current value on the button. */
  sync(): void;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

let openPicker: (() => void) | null = null;

export function groupedPicker(select: HTMLSelectElement, labelId: string, noun: string): Picker {
  const wrap = document.createElement("div");
  wrap.className = "picker";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "picker-button";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-labelledby", `${labelId} ${select.id}-value`);
  const value = document.createElement("span");
  value.className = "picker-value";
  value.id = `${select.id}-value`;
  const caret = document.createElement("span");
  caret.className = "picker-caret";
  caret.setAttribute("aria-hidden", "true");
  button.append(value, caret);

  const panel = document.createElement("div");
  panel.className = "picker-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", labelId);
  const search = document.createElement("input");
  search.type = "search";
  search.className = "picker-search";
  search.autocomplete = "off";
  search.spellcheck = false;
  const groupsBox = document.createElement("div");
  groupsBox.className = "picker-groups";
  const empty = document.createElement("p");
  empty.className = "picker-empty";
  empty.textContent = "No matches";
  empty.hidden = true;
  panel.append(search, groupsBox, empty);
  wrap.append(button, panel);
  select.hidden = true;
  select.tabIndex = -1;
  select.insertAdjacentElement("afterend", wrap);

  interface Group {
    head: HTMLButtonElement; count: HTMLElement; list: HTMLUListElement; box: HTMLElement; open: boolean;
    items: { li: HTMLLIElement; btn: HTMLButtonElement; text: string }[];
  }
  let groups: Group[] = [];

  function setOpen(g: Group, open: boolean) {
    g.head.setAttribute("aria-expanded", String(open));
    g.list.hidden = !open;
  }

  function rebuild() {
    groups = [];
    groupsBox.replaceChildren();
    // Distinct choices: an option can sit in more than one group (a Gateway City district
    // is also in its region's)
    const distinct = new Set<string>();
    for (const og of select.querySelectorAll("optgroup")) {
      const box = document.createElement("section");
      box.className = "picker-group";
      // A group that starts a new kind of choice (Gateway Cities, averages) gets a line above it
      if (og.dataset.section !== undefined) box.classList.add("picker-section");
      const head = document.createElement("button");
      head.type = "button";
      head.className = "picker-group-head";
      const list = document.createElement("ul");
      list.className = "picker-options";
      list.id = `${select.id}-group-${groups.length}`;
      head.setAttribute("aria-controls", list.id);
      const options = [...og.querySelectorAll("option")];
      options.forEach((o) => distinct.add(o.value));
      const count = Object.assign(document.createElement("span"), { textContent: String(options.length), className: "picker-count" });
      head.append(Object.assign(document.createElement("span"), { textContent: og.label, className: "picker-group-label" }), count);
      const g: Group = { head, count, list, box, open: false, items: [] };
      for (const o of options) {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "picker-option";
        btn.dataset.value = o.value;
        btn.textContent = o.textContent ?? o.value;
        btn.addEventListener("click", () => choose(o.value));
        li.append(btn);
        list.append(li);
        g.items.push({ li, btn, text: fold(btn.textContent) });
      }
      head.addEventListener("click", () => {
        g.open = !g.open;
        setOpen(g, g.open);
      });
      setOpen(g, false);
      box.append(head, list);
      groupsBox.append(box);
      groups.push(g);
    }
    search.placeholder = `Search ${distinct.size.toLocaleString("en-US")} ${noun}`;
    search.setAttribute("aria-label", `Search ${noun}`);
    sync();
  }

  function sync() {
    const opt = select.selectedOptions[0];
    value.textContent = opt ? opt.textContent : "";
  }

  /** Disabled options and the current choice, read from the select each time the menu opens. */
  function mark() {
    const disabled = new Set([...select.options].filter((o) => o.disabled).map((o) => o.value));
    for (const g of groups) {
      let current = false;
      for (const it of g.items) {
        const isCurrent = it.btn.dataset.value === select.value;
        it.btn.disabled = disabled.has(it.btn.dataset.value!);
        it.btn.classList.toggle("is-current", isCurrent);
        it.btn.setAttribute("aria-current", String(isCurrent));
        current ||= isCurrent;
      }
      g.head.classList.toggle("has-current", current);
    }
  }

  function filter() {
    const q = fold(search.value.trim());
    let shown = 0;
    for (const g of groups) {
      let n = 0;
      for (const it of g.items) {
        const hit = !q || it.text.includes(q);
        it.li.hidden = !hit;
        if (hit) n++;
      }
      g.box.hidden = q !== "" && n === 0;
      // While searching, a group counts its matches
      g.count.textContent = q ? `${n} of ${g.items.length}` : String(g.items.length);
      // Matches show inside their groups; with the box cleared, groups go back to how they were
      setOpen(g, q ? n > 0 : g.open);
      shown += n;
    }
    empty.hidden = shown > 0;
  }

  function open() {
    if (openPicker && openPicker !== close) openPicker();
    mark();
    search.value = "";
    filter();
    panel.hidden = false;
    // Shift left if the panel would run past the right edge of the window
    panel.style.left = "0px";
    const over = panel.getBoundingClientRect().right - (document.documentElement.clientWidth - 8);
    if (over > 0) panel.style.left = `${-over}px`;
    button.setAttribute("aria-expanded", "true");
    openPicker = close;
    search.focus();
    document.addEventListener("pointerdown", outside, true);
  }

  function close(refocus = false) {
    if (panel.hidden) return;
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (openPicker === close) openPicker = null;
    document.removeEventListener("pointerdown", outside, true);
    if (refocus) button.focus();
  }

  function outside(ev: PointerEvent) {
    if (!wrap.contains(ev.target as Node)) close();
  }

  function choose(v: string) {
    close(true);
    if (v === select.value) return;
    select.value = v;
    sync();
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /** Everything the arrow keys move through: group heads and the options showing. */
  const focusables = () =>
    [...panel.querySelectorAll<HTMLElement>(".picker-group:not([hidden]) .picker-group-head, .picker-options:not([hidden]) li:not([hidden]) .picker-option:not(:disabled)")];

  button.addEventListener("click", () => (panel.hidden ? open() : close(true)));
  button.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" && panel.hidden) {
      ev.preventDefault();
      open();
    }
  });
  search.addEventListener("input", filter);
  panel.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close(true);
      return;
    }
    if (ev.key === "Enter" && ev.target === search) {
      // Enter in the box takes the first match
      ev.preventDefault();
      const first = focusables().find((el) => el.classList.contains("picker-option"));
      if (first && search.value.trim()) choose(first.dataset.value!);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(ev.key)) return;
    ev.preventDefault();
    const items = focusables();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = ev.key === "Home" ? 0 : ev.key === "End" ? items.length - 1
      : ev.key === "ArrowDown" ? at + 1 : at - 1;
    if (next < 0) search.focus();
    else items[Math.min(next, items.length - 1)]?.focus();
  });
  panel.addEventListener("focusout", (ev) => {
    if (!wrap.contains(ev.relatedTarget as Node | null) && ev.relatedTarget) close();
  });

  rebuild();
  return { rebuild, sync };
}
