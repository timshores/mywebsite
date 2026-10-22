// A chart, enlarged in a window of its own. The chart's own element moves into the window, so its
// legend, hover, tables and controls keep working, and moves back when the window closes. So do the
// tab's own controls, in a strip across the top, to change while the chart is enlarged. The window
// sizes the chart to fit the screen without scrolling: as wide as there's room for, unless the
// chart would then run too tall.

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

/** The chart itself: the largest drawing in the element. */
function chartOf(box: HTMLElement) {
  let best: SVGSVGElement | null = null;
  let area = 0;
  box.querySelectorAll<SVGSVGElement>("svg[viewBox]").forEach((svg) => {
    const vb = svg.viewBox.baseVal;
    if (vb && vb.width * vb.height > area) {
      area = vb.width * vb.height;
      best = svg;
    }
  });
  return best as SVGSVGElement | null;
}

/** Narrow the element until it fits the window's height, a few passes since its text rewraps. */
function fit(box: HTMLElement, dialog: HTMLDialogElement, strip: HTMLElement, body: HTMLElement) {
  const svg = chartOf(box);
  if (!svg) return;
  const vb = svg.viewBox.baseVal;
  const cs = getComputedStyle(body);
  const roomH = window.innerHeight * 0.94 - (strip.hidden ? 0 : strip.offsetHeight) - parseFloat(cs.paddingTop) -
    parseFloat(cs.paddingBottom) - (dialog.offsetHeight - dialog.clientHeight);
  const roomW = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  box.style.width = "";
  for (let k = 0; k < 3; k++) {
    const other = box.offsetHeight - svg.getBoundingClientRect().height;
    const w = Math.min(roomW, ((roomH - other) * vb.width) / vb.height);
    box.style.width = `${Math.max(280, Math.floor(w))}px`;
  }
}

/**
 * A button that opens `box` enlarged. `onClose` runs after it's back in place, for a chart that
 * should redraw at its usual size. `controls`, if given, returns the tab's controls to bring along.
 */
export function enlargeButton(box: HTMLElement, onClose?: () => void, controls?: () => HTMLElement | null): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "enlarge-open";
  b.setAttribute("aria-haspopup", "dialog");
  b.innerHTML = `${ICON}<span>Enlarge</span>`;
  b.addEventListener("click", () => {
    const { dialog, strip, body } = windowFor(box);
    const title = box.querySelector("h2, h3")?.textContent ?? "Chart";
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
    const refit = () => fit(box, dialog, strip, body);
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
    dialog.addEventListener("close", () => {
      window.removeEventListener("resize", soon);
      redraws.disconnect();
      stripSize.disconnect();
      box.classList.remove("is-enlarged");
      box.style.width = "";
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

/** Whether `box` is open in the window now. */
export const isEnlarged = (box: HTMLElement) => box.classList.contains("is-enlarged");
