// The explorer's colors for things, each named once (#237). The categorical hues are the dataviz palette in its fixed
// order, checked for colorblind separation; a chart takes them in that order, and a color keeps its meaning across
// the charts, the map and the plots: blue and orange for a pair (spending and budget, one rating agency and the
// other), each region its own hue wherever regions are shown. The map's ramps for values live in map.ts.

export const BLUE = "#2a78d6";
export const ORANGE = "#eb6834";
export const GREEN = "#1baf7a";
export const AMBER = "#eda100";
export const PINK = "#e87ba4";
export const TEAL = "#00897b";
export const DEEP_GREEN = "#008300";
export const VIOLET = "#6250d6";
export const RED = "#e34948";
export const GRAY = "#8f8a7f";

/** The map's groups, in order: the categorical hues less blue, so a map of groups doesn't pass for a map of values */
export const GROUP_HUES = [ORANGE, GREEN, VIOLET, AMBER, PINK, TEAL, DEEP_GREEN, RED];

/** The six regions, west to east, in the map's hues for them, wherever regions are colored */
export const REGION_HUES = GROUP_HUES.slice(0, 6);

/** The income fifths, lowest to highest: one blue ramp, light to dark */
export const FIFTH_RAMP = ["#86b6ef", "#5598e7", BLUE, "#1c5cab", "#0d366b"];
