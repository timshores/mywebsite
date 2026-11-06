// About the data's contents (#216): a list of its parts, made from the notes themselves (each paragraph's bold
// lead, with the bold words later in it under that, the groups list's headings, Source files), held beside the notes as the page scrolls with the part in
// view marked. On a narrow screen it folds into a bar under the tabs that names the part in view and opens the
// list. A link to a part or a group, from the contents, the notes or the comparison's name, lands on it and
// opens the group.

export interface NotesContents {
  /** On the Data tab, drawn: go to the part or group the address names, once for each address */
  show(): void;
  /** From another tab: name the part or group to go to once the Data tab is drawn */
  go(id: string): void;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function notesContents(onData: () => boolean): NotesContents {
  const nav = document.getElementById("notes-toc");
  const body = document.getElementById("notes-body");
  return nav && body ? contents(nav, body, onData) : { show() {}, go() {} };
}

function contents(nav: HTMLElement, body: HTMLElement, onData: () => boolean): NotesContents {
  const list = nav.querySelector("ol")!;
  const toggle = nav.querySelector<HTMLButtonElement>(".notes-toc-toggle")!;
  const current = nav.querySelector<HTMLElement>(".notes-toc-current")!;
  const folded = matchMedia("(max-width: 860px)");

  type Part = { target: HTMLElement; link: HTMLAnchorElement; name: string };
  const parts: Part[] = [];
  const add = (target: HTMLElement, name: string, sub = false) => {
    if (!target.id) target.id = `about-${slug(name)}`;
    const li = document.createElement("li");
    if (sub) li.className = "is-sub";
    const a = document.createElement("a");
    a.href = `#${target.id}`;
    a.textContent = name;
    li.append(a);
    list.append(li);
    parts.push({ target, link: a, name });
  };
  const named = (b: Element) => {
    const t = b.textContent!.trim().replace(/\.$/, "");
    return t[0].toUpperCase() + t.slice(1);
  };
  for (const n of body.children) {
    if (n instanceof HTMLParagraphElement) {
      // A part begins with a paragraph that opens on bold words; bold words later in it are parts within it
      const first = [...n.childNodes].find((c) => c.nodeType !== Node.TEXT_NODE || c.textContent!.trim());
      const bold = [...n.querySelectorAll<HTMLElement>(":scope > strong")];
      if (first instanceof HTMLElement && first.tagName === "STRONG") add(n, named(bold.shift()!));
      else if (!parts.length) continue;
      bold.forEach((b) => add(b, named(b), true));
    } else if (n.id === "groups") {
      add(n as HTMLElement, n.querySelector("h3")?.textContent?.trim() ?? "Groups and their members");
      n.querySelectorAll<HTMLElement>(":scope > .view").forEach((v) =>
        add(v, v.querySelector("h4")?.textContent?.trim() ?? v.id, true));
    } else if (n instanceof HTMLHeadingElement) {
      add(n, n.textContent!.trim());
    }
  }

  // ---- The part in view: the last whose top has passed just under the tabs (and, folded, the bar), where a
  // link to it lands, or the last part once the page can scroll no further ----
  let active: Part | null = null;
  function spy() {
    if (!onData() || !parts.length) return;
    const line = (folded.matches ? toggle.getBoundingClientRect().bottom : nav.getBoundingClientRect().top) + 12;
    let now = parts[0];
    for (const p of parts) {
      if (p.target.getBoundingClientRect().top > line) break;
      now = p;
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) now = parts[parts.length - 1];
    if (now === active) return;
    active?.link.removeAttribute("aria-current");
    now.link.setAttribute("aria-current", "location");
    active = now;
    current.textContent = now.name;
    // The list scrolls when it's taller than the screen: keep the marked part in it
    const box = folded.matches ? list : nav;
    const r = now.link.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (r.top < b.top || r.bottom > b.bottom) box.scrollTop += r.top - b.top - (b.height - r.height) / 2;
  }
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      spy();
    });
  }, { passive: true });
  window.addEventListener("resize", spy);

  // ---- Folded: the bar opens and closes the list; following a link, Esc, or a click elsewhere closes it ----
  const fold = (open: boolean) => {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () => fold(!nav.classList.contains("is-open")));
  list.addEventListener("click", (ev) => {
    if ((ev.target as HTMLElement).closest("a")) fold(false);
  });
  document.addEventListener("click", (ev) => {
    if (nav.classList.contains("is-open") && !nav.contains(ev.target as Node)) fold(false);
  });
  nav.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && nav.classList.contains("is-open")) {
      fold(false);
      toggle.focus();
    }
  });

  // ---- Going to a part or a group: the browser scrolls to a link's target on the page; a group opens too ----
  let shown = "";
  const target = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    return id ? document.getElementById(id) : null;
  };
  const open = (t: HTMLElement | null) => {
    if (t instanceof HTMLDetailsElement) t.open = true;
  };
  window.addEventListener("hashchange", () => {
    if (!onData()) return;
    shown = location.hash;
    open(target());
  });
  function show() {
    if (location.hash === shown) return;
    shown = location.hash;
    const t = target();
    if (!t || !body.contains(t)) return;
    open(t);
    // After the tab is drawn, so what's above the part has its height
    requestAnimationFrame(() => {
      t.scrollIntoView({ block: "start" });
      spy();
    });
  }
  function go(id: string) {
    history.replaceState(null, "", `#${id}`);
    shown = "";
  }
  return { show, go };
}
