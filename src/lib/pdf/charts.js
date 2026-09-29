import { BOX, GRID, FAINT, CURVE, RANGE } from "@/lib/pdf/theme";

// Vector chart blocks. Every chart keeps its y-axis labels in an inner left
// gutter and its x-axis labels inside its own reserved height, so axis text
// can never spill into the margin or into the next block.

const GUTTER = 22;
const PAD_TOP = 5;
const X_LABEL_H = 13;
const MIN_V = 40;
const MAX_V = 250;
const TICKS = [40, 90, 140, 190, 240];
const DAY_TICKS = [[0, "12a"], [0.25, "6a"], [0.5, "12p"], [0.75, "6p"], [1, "12a"]];

const clampV = (v) => Math.max(MIN_V, Math.min(v, MAX_V));

function frame(top, plotH, { x = BOX.x, w = BOX.w, gutter = GUTTER } = {}) {
  const x0 = x + gutter;
  const pw = w - gutter;
  const t = top + PAD_TOP;
  return {
    x0, w: pw, top: t, h: plotH,
    px: (f) => x0 + Math.max(0, Math.min(f, 1)) * pw,
    py: (v) => t + plotH - ((clampV(v) - MIN_V) / (MAX_V - MIN_V)) * plotH,
  };
}

function grid(flow, f) {
  const d = flow.doc;
  for (const t of TICKS) {
    d.setDrawColor(...GRID);
    d.setLineWidth(0.5);
    flow.line(f.x0, f.py(t), f.x0 + f.w, f.py(t));
    flow.text(String(t), f.x0 - GUTTER, f.py(t) - 4, GUTTER - 4, { size: 6.5, color: FAINT, align: "right" });
  }
}

function xLabels(flow, f) {
  const lw = 24;
  const y = f.top + f.h + 3;
  for (const [frac, label] of DAY_TICKS) {
    if (frac === 0) flow.text(label, f.x0, y, lw, { size: 6.5, color: FAINT });
    else if (frac === 1) flow.text(label, f.x0 + f.w - lw, y, lw, { size: 6.5, color: FAINT, align: "right" });
    else flow.text(label, f.px(frac) - lw / 2, y, lw, { size: 6.5, color: FAINT, align: "center" });
  }
}

function targetBand(flow, f, target) {
  flow.doc.setFillColor(214, 238, 213);
  flow.rect(f.x0, f.py(target.high), f.w, f.py(target.low) - f.py(target.high), "F");
}

// series: [{ min, value }] — minutes into the day.
function polyline(flow, f, series, color, width) {
  const pts = (series || []).filter((p) => p && p.value != null);
  if (pts.length < 2) return;
  const d = flow.doc;
  d.setDrawColor(...color);
  d.setLineWidth(width);
  for (let i = 1; i < pts.length; i++) {
    d.line(f.px(pts[i - 1].min / 1440), f.py(pts[i - 1].value), f.px(pts[i].min / 1440), f.py(pts[i].value));
  }
  flow.check(f.x0, f.top, f.w, f.h, "series");
}

const chartH = (plotH) => PAD_TOP + plotH + X_LABEL_H;

export function dayChartBlock(flow, series, target, { plotH = 96 } = {}) {
  return {
    what: "day-chart",
    h: chartH(plotH),
    draw(top) {
      const f = frame(top, plotH);
      grid(flow, f);
      targetBand(flow, f, target);
      flow.doc.setDrawColor(...RANGE.target);
      flow.doc.setLineWidth(0.5);
      flow.line(f.x0, f.py(target.high), f.x0 + f.w, f.py(target.high));
      flow.line(f.x0, f.py(target.low), f.x0 + f.w, f.py(target.low));
      polyline(flow, f, series, CURVE, 1.3);
      xLabels(flow, f);
    },
  };
}

// Hour-of-day percentile envelope (5–95 light, 25–75 mid) + median line.
export function percentileChartBlock(flow, hourBands, { plotH = 118 } = {}) {
  const bands = hourBands || [];
  return {
    what: "percentile-chart",
    h: chartH(plotH),
    draw(top) {
      const f = frame(top, plotH);
      grid(flow, f);
      const d = flow.doc;
      const envelope = (lo, hi, rgb) => {
        for (let h = 0; h < 24; h++) {
          const b = bands[h];
          if (!b || b[lo] == null || b[hi] == null) continue;
          d.setFillColor(...rgb);
          flow.rect(f.px(h / 24), f.py(b[hi]), f.px((h + 1) / 24) - f.px(h / 24), f.py(b[lo]) - f.py(b[hi]), "F");
        }
      };
      envelope("p5", "p95", [214, 228, 236]);
      envelope("p25", "p75", [186, 211, 224]);
      d.setDrawColor(...CURVE);
      d.setLineWidth(1.4);
      for (let h = 1; h < 24; h++) {
        const a = bands[h - 1];
        const b = bands[h];
        if (a?.p50 == null || b?.p50 == null) continue;
        flow.line(f.px((h - 1) / 24), f.py(a.p50), f.px(h / 24), f.py(b.p50));
      }
      xLabels(flow, f);
    },
  };
}

// All days of one week on a single 24-hour chart.
export function overlayChartBlock(flow, days, target, colors, { plotH = 105 } = {}) {
  return {
    what: "overlay-chart",
    h: chartH(plotH),
    draw(top) {
      const f = frame(top, plotH);
      grid(flow, f);
      targetBand(flow, f, target);
      (days || []).forEach((d) => {
        if (d.hasData) polyline(flow, f, d.series, colors[d.weekday % colors.length], 0.9);
      });
      xLabels(flow, f);
    },
  };
}

// Compact sparkline inside a fixed cell (no axis labels).
export function sparkline(flow, x, y, w, h, series) {
  const f = frame(y - PAD_TOP, h, { x, w, gutter: 0 });
  flow.doc.setDrawColor(...GRID);
  flow.doc.setLineWidth(0.5);
  flow.line(x, y + h, x + w, y + h);
  polyline(flow, f, series, CURVE, 1);
}