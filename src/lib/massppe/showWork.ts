// "Show the work" (Project Regain Custody, Pass 3; #244): beneath a result the explorer states, what it rests on, step
// by step. Each step says whose figure it is: an agency's as published, one the explorer computed from them, or one
// a model made under assumptions no agency made. Then the assumptions, and how far the result has been checked, which
// the evidence record writes (schools ppe_report/evidence/). Any tab can use it for any result.

import { el } from "./dom";

/** reported: an agency's figure as published (the source names the agency); computed: arithmetic on reported figures;
 * modeled: a figure that depends on an assumption no agency made */
export type WorkKind = "reported" | "computed" | "modeled";

/** part: a heading over this step and the ones after it; calc: the step's arithmetic, in its own figures */
export interface WorkStep { value: string; label: string; detail?: string; calc?: string; part?: string; kind: WorkKind; source?: string }

export interface Work {
  steps: WorkStep[];
  /** Number the steps, so one can refer to another ("step 5") */
  numbered?: boolean;
  assumptions?: string[];
  /** The heading over the assumptions: what a model assumes, or what a measure counts */
  notesHead?: string;
  /** How far it's been checked, in a sentence, and the record that says so */
  status: string;
  record?: string;
  sources?: { text: string; href: string }[];
}

const KIND: Record<WorkKind, string> = { reported: "Reported", computed: "Computed", modeled: "Modeled" };

/** A closed disclosure: the steps as a table, the assumptions, the checks and the sources */
export function showWork(work: Work, summary = "Show the work"): HTMLDetailsElement {
  const box = el("details", "show-work");
  box.append(el("summary", undefined, summary));
  const table = el("table", "show-work-steps");
  const head = table.createTHead().insertRow();
  // Two columns at any width: whose figure it is sits under the figure, so a phone keeps room for the words
  for (const h of ["Figure", "What it is"]) head.append(el("th", undefined, h));
  const body = table.createTBody();
  work.steps.forEach((s, k) => {
    if (s.part) {
      const head = body.insertRow();
      head.className = "show-work-part";
      head.append(Object.assign(el("th", undefined, s.part), { colSpan: 2, scope: "colgroup" }));
    }
    const r = body.insertRow();
    r.className = `show-work-${s.kind}`;
    const what = el("td");
    what.append(el("span", "show-work-label", work.numbered ? `${k + 1}. ${s.label}` : s.label));
    if (s.detail) what.append(el("span", "show-work-detail", s.detail));
    if (s.calc) what.append(el("span", "show-work-calc", s.calc));
    const fig = el("td", "num", s.value);
    fig.append(el("span", "show-work-kind", s.kind === "reported" && s.source ? s.source : KIND[s.kind]));
    r.append(fig, what);
  });
  const scroll = Object.assign(el("div", "table-scroll"), { tabIndex: 0 });
  scroll.append(table);
  box.append(scroll);
  if (work.assumptions?.length) {
    box.append(el("p", "show-work-head", work.notesHead ?? "What the model assumes"));
    const ul = el("ul");
    for (const a of work.assumptions) ul.append(el("li", undefined, a));
    box.append(ul);
  }
  const checked = el("p", "show-work-status");
  checked.append(work.status);
  if (work.record) {
    const a = el("a", undefined, "Evidence record");
    a.href = work.record;
    checked.append(" ", a, ".");
  }
  box.append(checked);
  if (work.sources?.length) {
    const p = el("p", "show-work-sources", "Sources: ");
    work.sources.forEach((s, k) => {
      const a = el("a", undefined, s.text);
      a.href = s.href;
      p.append(...(k ? ["; ", a] : [a]));
    });
    p.append(".");
    box.append(p);
  }
  return box;
}
