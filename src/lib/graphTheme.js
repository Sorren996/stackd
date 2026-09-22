// Warm editorial color tokens for the Activity Graph. Both palettes now
// use the same warm editorial palette — espresso ink curve, warm taupe
// ticks, hairline reference lines, muted mustard projection.
// Shared by ActivityGraph, GraphLowerSection, CandlestickView and
// ReferenceLabels so the graph carries one coherent palette per theme.
const EDITORIAL_GRAPH = {
  inRangeColor: "#3f3830",        // espresso ink — glucose curve
  refLineStroke: "#eadccf",       // hairline reference lines
  tickFill: "#8a7f70",            // warm taupe — tick labels
  tickDotFill: "rgba(138,127,112,0.20)",
  dividerColor: "rgba(234,220,207,0.50)",
  markerColor: "#3f3830",         // espresso ink — meal markers
  pillBg: "#fdf9f2",              // elevated surface — floating pills
  labelOpacityPrimary: 0.45,
  labelOpacitySecondary: 0.7,
};

export function getGraphTheme(isLight) {
  return EDITORIAL_GRAPH;
}