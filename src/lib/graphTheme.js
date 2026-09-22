// Warm editorial color tokens for the Activity Graph. Both palettes now
// use the same warm editorial palette — espresso ink curve, warm taupe
// ticks, hairline reference lines, muted mustard projection.
// Shared by ActivityGraph, GraphLowerSection, CandlestickView and
// ReferenceLabels so the graph carries one coherent palette per theme.
const EDITORIAL_GRAPH = {
  inRangeColor: "#5b6550",        // sage green — glucose curve in-range (visibly distinct from ink)
  refLineStroke: "#eadccf",       // hairline reference lines
  tickFill: "#a89e8d",            // warm taupe — tick labels
  tickDotFill: "rgba(168,158,141,0.25)",
  dividerColor: "rgba(234,220,207,0.50)",
  markerColor: "#3f3830",         // espresso ink — meal markers
  pillBg: "#fdf9f2",              // elevated surface — floating pills
  insulinCurveColor: "#8a9488",   // cool sage-gray — insulin curves (recedes behind glucose line)
  insulinCurveOpacity: 0.28,
  insulinCurveWidth: 1.25,
  basalBandColor: "#5b6550",
  basalBandOpacity: 0.07,
  projectionColor: "#af751b",    // muted mustard — projection past NOW
  labelOpacityPrimary: 0.45,
  labelOpacitySecondary: 0.7,
};

export function getGraphTheme(isLight) {
  return EDITORIAL_GRAPH;
}