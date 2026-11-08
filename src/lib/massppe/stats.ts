// The explorer's statistics, each computed one way wherever it appears (#237).

/** The median: the middle value, or the mean of the middle two when the count is even; NaN for none */
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN;
}
