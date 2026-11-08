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
