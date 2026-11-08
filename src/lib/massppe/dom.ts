// The DOM helpers every explorer module builds with, defined once (#237)

const SVG = "http://www.w3.org/2000/svg";

/** An HTML element, with its class and text */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** el with its text first, as the district and town views write it: text("td", "$1,234", "num") */
export const text = <K extends keyof HTMLElementTagNameMap>(tag: K, content: string, cls?: string) => el(tag, cls, content);

/** An SVG element with its attributes, appended to parent if one is given */
export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

/** A measure's name, bold wherever text describes it (the plots and the cap tab) */
export const vn = (s: string) => el("strong", "cw-var", s);

/** "spending per pupil" -> "Spending per pupil" */
export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Spending per pupil" -> "spending per pupil", to run inside a sentence. Labels are in sentence case, so only the
 * first letter changes, and not when the label opens on a name or an initialism: "Chapter 70 state aid", "FTE" (#241) */
const NAMED = /^(Chapter|Prop|Amherst|Massachusetts|Inner Core|Gateway Cities|Hispanic|Asian|Black|White)\b/;
export const lower = (s: string) => (NAMED.test(s) || /^[A-Z][A-Z0-9]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

/** A window over the page, as the plots and the cap tab open for help, cautions and tables: its heading and a close
 * button, closing too on a click outside it; put in holder, so it takes the page's colors */
export function modal(id: string, title: string, holder: Element): { dialog: HTMLDialogElement; body: HTMLDivElement } {
  const dialog = el("dialog", "cw-sub");
  dialog.setAttribute("aria-labelledby", id);
  const head = el("div", "cw-head");
  const heading = el("h2", "cw-title", title);
  heading.id = id;
  const close = el("button", "cw-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", () => dialog.close());
  head.append(heading, close);
  const body = el("div", "cw-sub-body");
  dialog.append(head, body);
  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog) dialog.close();
  });
  holder.append(dialog);
  return { dialog, body };
}

/** A scatterplot's hover card, right of the point and above it, kept inside its figure; pos is the point in the
 * chart's own units, width the chart's drawn width */
export function placeTip(tip: HTMLElement, svg: SVGSVGElement, figure: HTMLElement, width: number, pos: { left: number; top: number }) {
  const box = svg.getBoundingClientRect();
  const fig = figure.getBoundingClientRect();
  const scale = box.width / width;
  tip.style.left = `${Math.min(box.left - fig.left + pos.left * scale + 12, fig.width - tip.offsetWidth - 4)}px`;
  tip.style.top = `${Math.max(0, box.top - fig.top + pos.top * scale - tip.offsetHeight - 10)}px`;
}

/** A module's stylesheet, added to the page when the module first loads, so a tab's styles arrive with the tab
 * (#238). Imported as text (?inline): imported as a stylesheet, Astro links every module's sheet from the page's
 * head, wanted or not. It goes after the page's own sheet, as it did when linked. */
export function addStyles(css: string) {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
}

/** A legend entry pointing at marks in its chart: they stay, the rest fade (svg.is-spotlit, with the CSS's rules for
 * [data-key] marks and scatter points), on hover, and on keyboard focus where the entry is a control; every chart's
 * legend answers a pointer this way (#239) */
export function pointsAt(entry: HTMLElement, svg: SVGSVGElement, marks: () => Iterable<Element>, focusable = true) {
  const on = () => {
    for (const m of marks()) m.classList.add("is-lit");
    svg.classList.add("is-spotlit");
  };
  const off = () => {
    svg.querySelectorAll(".is-lit").forEach((m) => m.classList.remove("is-lit"));
    svg.classList.remove("is-spotlit");
  };
  entry.addEventListener("pointerenter", on);
  entry.addEventListener("pointerleave", off);
  if (focusable) {
    entry.addEventListener("focus", on);
    entry.addEventListener("blur", off);
  }
}
