// Light/Dark color tokens for the Activity Graph. Dark values reproduce the
// graph's original appearance exactly; light values are a purpose-built light
// treatment. Shared by ActivityGraph, GraphLowerSection, CandlestickView and
// ReferenceLabels so the graph carries one coherent palette per theme.
export function getGraphTheme(isLight) {
  return isLight
    ? {
        inRangeColor: "#3a3a3c",
        refLineStroke: "rgba(60,60,67,0.22)",
        tickFill: "rgba(60,60,67,0.50)",
        tickDotFill: "rgba(60,60,67,0.16)",
        dividerColor: "rgba(60,60,67,0.06)",
        markerColor: "#3a3a3c",
        pillBg: "rgba(255,255,255,0.78)",
        labelOpacityPrimary: 0.45,
        labelOpacitySecondary: 0.7,
      }
    : {
        inRangeColor: "#ffffff",
        refLineStroke: "rgba(255,255,255,0.18)",
        tickFill: "rgba(255,255,255,0.22)",
        tickDotFill: "rgba(255,255,255,0.12)",
        dividerColor: "rgba(255,255,255,0.04)",
        markerColor: "#ffffff",
        pillBg: "rgba(10,16,14,0.72)",
        labelOpacityPrimary: 0.25,
        labelOpacitySecondary: 0.6,
      };
}