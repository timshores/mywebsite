// A chart, enlarged in a window of its own. The chart's own element moves into the window, so its
// legend, hover, tables and controls keep working, and moves back when the window closes. So do the
// tab's own controls, in a strip across the top, to change while the chart is enlarged. The element
// takes the window's full width, and the chart fits the screen's height: as wide as there's room for,
// unless it would then run too tall, when it narrows and centers.

const ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" ' +
  'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let win: { dialog: HTMLDialogElement; strip: HTMLElement; body: HTMLElement } | null = null;

function windowFor(near: Element) {
  if (win) return win;
  const dialog = document.createElement("dialog");
  dialog.className = "enlarge-dialog";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "enlarge-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";
  close.addEventListener("click", () => dialog.close());
  // The strip takes the docked controls' compact look (.controls-dock-body)
  const strip = document.createElement("div");
  strip.className = "enlarge-controls controls-dock-body";
  const body = document.createElement("div");
  body.className = "enlarge-body";
  dialog.append(close, strip, body);
  // A click on the dimmed backdrop lands on the dialog element itself
  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog) dialog.close();
  });
  (near.closest(".explorer") ?? document.body).append(dialog);
  win = { dialog, strip, body };
  return win;
}

/** The chart itself: the largest drawing in the element, other than its own button's icon. */
function chartOf(box: HTMLElement) {
  let best: SVGSVGElement | null = null;
  let area = 0;
  box.querySelectorAll<SVGSVGElement>("svg[viewBox]").forEach((svg) => {
    if (svg.closest(".enlarge-open")) return;
    const vb = svg.viewBox.baseVal;
    if (vb && vb.width * vb.height > area) {
      area = vb.width * vb.height;
      best = svg;
    }
  });
  return best as SVGSVGElement | null;
}

/** What below the chart stays in view with it: a line or two of links; anything taller scrolls */
const KEEP_BELOW = 80;

/** The chart's room in the window: the element's width, and the window's height less the controls
 * strip, the padding, what sits above the chart and a line or two below it. */
function room(box: HTMLElement, svg: SVGSVGElement) {
  const { dialog, strip, body } = win!;
  const cs = getComputedStyle(body);
  const boxR = box.getBoundingClientRect();
  const svgR = svg.getBoundingClientRect();
  const below = Math.min(KEEP_BELOW, Math.max(0, boxR.bottom - svgR.bottom));
  const height = window.innerHeight * 0.94 - (strip.hidden ? 0 : strip.offsetHeight) - parseFloat(cs.paddingTop) -
    parseFloat(cs.paddingBottom) - (dialog.offsetHeight - dialog.clientHeight) - (svgR.top - boxR.top) - below;
  return { width: box.clientWidth, height };
}

/** The room for the chart in `box` while it's enlarged, for a chart that draws to the window's size. */
export function chartRoom(box: HTMLElement) {
  const svg = chartOf(box);
  return win && svg && isEnlarged(box) ? room(box, svg) : null;
}

/**
 * Fit the chart to the window: the element keeps the window's full width, for its text and tables,
 * and only the chart narrows, centered, when at full width it would run taller than its room. Where
 * fitting would shrink it past half its width or under 280px, as on a phone, it keeps its width and
 * the window scrolls.
 */
function fit(box: HTMLElement) {
  const svg = chartOf(box);
  if (!svg) return;
  const vb = svg.viewBox.baseVal;
  box.style.width = "";
  svg.style.width = "";
  svg.style.marginLeft = "";
  svg.style.marginRight = "";
  const maxH = room(box, svg).height;
  const fullH = svg.getBoundingClientRect().height;
  const w = Math.floor((maxH * vb.width) / vb.height);
  if (fullH > maxH && w >= Math.max(280, svg.getBoundingClientRect().width / 2)) {
    svg.style.width = `${w}px`;
    svg.style.marginLeft = "auto";
    svg.style.marginRight = "auto";
  }
}

/**
 * A button that opens `box` enlarged. `onClose` runs after it's back in place, for a chart that
 * should redraw at its usual size. `controls`, if given, returns the tab's controls to bring along.
 * `onOpen` runs once the window is open, for a chart that redraws at the window's size.
 */
export function enlargeButton(box: HTMLElement, onClose?: () => void, controls?: () => HTMLElement | null,
  onOpen?: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "enlarge-open";
  b.setAttribute("aria-haspopup", "dialog");
  b.innerHTML = `${ICON}<span>Enlarge</span>`;
  b.addEventListener("click", () => {
    const { dialog, strip, body } = windowFor(box);
    const title = box.querySelector("h2, h3, h4")?.textContent ?? "Chart";
    dialog.setAttribute("aria-label", title);
    // Hold each element's place, so the page behind doesn't shift
    const hold = (el: HTMLElement) => {
      const h = document.createElement("div");
      h.style.height = `${el.offsetHeight}px`;
      h.style.margin = getComputedStyle(el).margin;
      el.before(h);
      return h;
    };
    const ctl = controls?.() ?? null;
    const ctlHolder = ctl ? hold(ctl) : null;
    strip.replaceChildren(...(ctl ? [ctl] : []));
    strip.hidden = !ctl;
    const holder = hold(box);
    box.classList.add("is-enlarged");
    body.replaceChildren(box);
    dialog.showModal();
    onOpen?.();
    const refit = () => fit(box);
    refit();
    // Fit again when the window resizes or the chart redraws
    let frame = 0;
    const soon = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(refit);
    };
    window.addEventListener("resize", soon);
    const redraws = new MutationObserver(soon);
    redraws.observe(box, { subtree: true, attributes: true, attributeFilter: ["viewBox"] });
    const stripSize = new ResizeObserver(soon);
    stripSize.observe(strip);
    // Opening or closing a table inside it refits the chart
    box.addEventListener("toggle", soon, true);
    dialog.addEventListener("close", () => {
      window.removeEventListener("resize", soon);
      redraws.disconnect();
      stripSize.disconnect();
      box.removeEventListener("toggle", soon, true);
      box.classList.remove("is-enlarged");
      box.style.width = "";
      const svg = chartOf(box);
      if (svg) {
        svg.style.width = "";
        svg.style.marginLeft = "";
        svg.style.marginRight = "";
      }
      if (holder.isConnected) holder.replaceWith(box);
      else box.remove();
      if (ctl && ctlHolder) {
        if (ctlHolder.isConnected) ctlHolder.replaceWith(ctl);
        else ctl.remove();
      }
      onClose?.();
      b.focus();
    }, { once: true });
  });
  return b;
}

/** Close the window, if it's open: a link inside the chart that goes to another tab closes it first. */
export function closeEnlarged() {
  if (win?.dialog.open) win.dialog.close();
}

/** Whether `box` is open in the window now. */
export const isEnlarged = (box: HTMLElement) => box.classList.contains("is-enlarged");
