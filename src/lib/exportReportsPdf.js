import { jsPDF } from "jspdf";

// ─────────────────────────────────────────────────────────────────────────────
// Stackd Reports — typeset print renderer.
//
// This draws the report as a REAL print document straight from the `reports`
// data object. It never touches the DOM and takes no screenshots: every number
// is set as text, every chart is vector geometry (lines + filled shapes) drawn
// at print resolution. The output looks like a Dexcom Clarity report — white
// page, near-black text, thin light-gray gridlines, small muted sans axis labels.
//
// Color is used ONLY as data semantics (Clarity range palette): green = in
// range, reds = low, ambers = high. Everything is WCAG AA on white. Time-in-range
// percentages always render BELOW their bands (never on top of a fill).
// ─────────────────────────────────────────────────────────────────────────────

// ── Page geometry (A4 portrait, points) ────────────────────────────────────
const W = 595.28;
const H = 841.89;
const M = 42;        // side margin
const CW = W - M * 2; // content width
const BOTTOM = H - 54; // content must not cross the footer
const FOOTER_PADDING = 40; // extra bottom space so footnote clears footer

// ── Ink & grid (all WCAG AA on white) ───────────────────────────────────────
const INK = [26, 26, 26];        // near-black body text  (>18:1)
const GRAY = [72, 72, 72];       // secondary/table text  (8:1)
const MUTED = [96, 96, 96];      // small axis + captions (5.5:1)
const FAINT = [120, 120, 120];   // tiny tick labels      (4.5:1)
const GRID = [232, 232, 232];    // thin gridlines
const HAIR = [206, 206, 206];    // rules + table borders
const CURVE = [40, 108, 140];    // glucose line (data, neutral teal)

// Clarity-style range palette — color only as data semantics.
const RANGE = {
  veryLow: [176, 58, 46],
  low: [214, 69, 65],
  target: [63, 162, 79],
  high: [224, 166, 32],
  veryHigh: [209, 138, 18],
};
const RANGE_LABEL = {
  veryLow: "Very Low",
  low: "Low",
  target: "Target",
  high: "High",
  veryHigh: "Very High",
};

const FOOTER =
  "Describes your own logged data. Not medical advice. Not a dose recommendation.";

// ── Formatting helpers ──────────────────────────────────────────────────────
function fmtDate(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDay(dateStr) {
  // "YYYY-MM-DD" already in the user's local timezone.
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtTime(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ── Base document + page machinery ──────────────────────────────────────────
function makeDoc() {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  // Clean white page background.
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, "F");
  return doc;
}

// Draw the plain-text footer on every page that exists so far.
function stampFooter(doc) {
  const n = doc.internal.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.6);
    doc.line(M, H - 40, W - M, H - 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(FOOTER, W / 2, H - 28, { align: "center", maxWidth: CW });
  }
}

// Ensure at least `needed` points of space remain from the current y.
function ensureSpace(doc, y, needed) {
  if (y + needed > H - FOOTER_PADDING) {
    doc.addPage();
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, W, H, "F");
    return M + 6;
  }
  return y;
}

// ── Inline section header (no standalone header pages) ──────────────────────
function sectionHeader(doc, y, title, subtitle) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(title, M, y);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    const tw = doc.getTextWidth(subtitle);
    doc.text(subtitle, W - M - tw, y);
  }
  y += 5;
  doc.setDrawColor(...HAIR);
  doc.setLineWidth(0.8);
  doc.line(M, y, W - M, y);
  return y + 12;
}

// ── Time-in-range bar (5 colored segments, NO on-band % text) ───────────────
// Percentages render below in the legend as plain dark text. This keeps every
// label readable and matches Clarity's "read the bars, read the legend" style.
function tirBar(doc, x, y, w, h, bands) {
  const order = ["veryLow", "low", "target", "high", "veryHigh"];
  let cx = x;
  let sum = 0;
  const present = order
    .map((key) => {
      const b = (bands || []).find((bb) => bb.key === key);
      const percent = b?.percent ?? 0;
      sum += percent;
      return { key, percent };
    })
    .filter((b) => b.percent > 0);

  if (!present.length) {
    doc.setFillColor(...GRID);
    doc.rect(x, y, w, h, "F");
    return { y: y + h };
  }
  for (const b of present) {
    const segW = (b.percent / sum) * w;
    doc.setFillColor(...RANGE[b.key]);
    doc.rect(cx, y, Math.max(segW, 0.5), h, "F");
    cx += segW;
  }
  return { y: y + h };
}

// Legend below the bar — colored dot + label + % as dark text, two columns.
function tirLegend(doc, x, y, bands) {
  const order = ["veryLow", "low", "target", "high", "veryHigh"];
  const present = order
    .filter((key) => (bands || []).find((b) => b.key === key && (b.percent ?? 0) > 0))
    .map((key) => {
      const b = (bands || []).find((bb) => bb.key === key);
      return { key, percent: b.percent, display: b.display || "" };
    });
  const colW = CW / 2;
  let yy = y;
  present.forEach((it, i) => {
    const col = Math.floor(i / 3);
    const row = i % 3;
    const lx = x + col * colW;
    const ly = yy + row * 17;
    doc.setFillColor(...RANGE[it.key]);
    doc.rect(lx, ly - 7, 8, 8, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(
      `${RANGE_LABEL[it.key]}${it.display ? ` (${it.display})` : ""} — ${it.percent}%`,
      lx + 12,
      ly
    );
  });
  return yy + Math.ceil(present.length / 3) * 17;
}

// ── Vector glucose line chart ───────────────────────────────────────────────
// series: [{ min: minutes-into-day, value }] (already downsampled). Domain 40..240.
function glucoseChart(doc, x, y, w, h, series, opts = {}) {
  const lo = opts.targetLow ?? 70;
  const hi = opts.targetHigh ?? 180;
  const minV = 40;
  const maxV = 250;

  const px = (min) => x + (min / 1440) * w;
  const py = (v) => y + h - ((Math.max(minV, Math.min(v, maxV)) - minV) / (maxV - minV)) * h;

  // Horizontal gridlines + muted y labels.
  const ticks = [40, 90, 140, 190, 240];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  for (const t of ticks) {
    const ty = py(t);
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.5);
    doc.line(x, ty, x + w, ty);
    doc.setTextColor(...FAINT);
    doc.text(String(t), x - 5, ty + 2, { align: "right" });
  }

  // Target band — light green fill, thin outlines.
  doc.setFillColor(214, 238, 213);
  doc.rect(x, py(hi), w, py(lo) - py(hi), "F");
  doc.setDrawColor(...RANGE.target);
  doc.setLineWidth(0.5);
  doc.line(x, py(hi), x + w, py(hi));
  doc.line(x, py(lo), x + w, py(lo));

  // Time ticks — every 6 hours.
  doc.setFontSize(6.5);
  doc.setTextColor(...FAINT);
  const labels = [
    [0, "12a"], [360, "6a"], [720, "12p"], [1080, "6p"], [1440, "12a"],
  ];
  for (const [min, label] of labels) {
    doc.text(label, px(min), y + h + 9, { align: min === 0 ? "left" : min === 1440 ? "right" : "center" });
  }

  // Glucose curve.
  const pts = (series || []).filter((p) => p && p.value != null);
  if (pts.length) {
    doc.setDrawColor(...(opts.color || CURVE));
    doc.setLineWidth(opts.width ?? 1.3);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      doc.line(px(a.min), py(a.value), px(b.min), py(b.value));
    }
  }
  return y + h + 16;
}

// ── Compact sparkline thumbnail (vector) ────────────────────────────────────
function sparkline(doc, x, y, w, h, series, opts = {}) {
  const minV = 40, maxV = 250;
  const px = (min) => x + (min / 1440) * w;
  const py = (v) => y + h - ((Math.max(minV, Math.min(v, maxV)) - minV) / (maxV - minV)) * h;
  const pts = (series || []).filter((p) => p && p.value != null);
  // base line
  doc.setDrawColor(...GRID);
  doc.setLineWidth(0.5);
  doc.line(x, y + h, x + w, y + h);
  if (pts.length) {
    doc.setDrawColor(...(opts.color || CURVE));
    doc.setLineWidth(1);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      doc.line(px(a.min), py(a.value), px(b.min), py(b.value));
    }
  }
}

// ── Simple data table ───────────────────────────────────────────────────────
// cols: [{ label, width, align, bold? }]; rows: array of cell arrays.
function table(doc, x, y, cols, rows, opts = {}) {
  const headerH = opts.headerH ?? 18;
  const rowH = opts.rowH ?? 17;
  const colX = [];
  let acc = x;
  for (const c of cols) {
    colX.push(acc);
    acc += c.width;
  }

  // Header.
  doc.setFillColor(245, 245, 245);
  doc.rect(x, y - 11, CW, headerH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...GRAY);
  cols.forEach((c, i) => {
    const cx = colX[i];
    doc.text(String(c.label), c.align === "right" ? cx + c.width : cx, y, {
      align: c.align === "right" ? "right" : "left",
      maxWidth: c.width,
    });
  });
  let yy = y + headerH - 5;

  for (const r of rows) {
    if (yy + rowH > BOTTOM) {
      doc.addPage();
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, W, H, "F");
      yy = M + 6;
      // repeat header on continuation
      doc.setFillColor(245, 245, 245);
      doc.rect(x, yy - 11, CW, headerH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY);
      cols.forEach((c, i) => {
        const cx = colX[i];
        doc.text(String(c.label), c.align === "right" ? cx + c.width : cx, yy, {
          align: c.align === "right" ? "right" : "left",
          maxWidth: c.width,
        });
      });
      yy += headerH - 5;
    }
    // hairline between rows
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.4);
    doc.line(x, yy - 0.5, x + CW, yy - 0.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...(opts.dimRows ? GRAY : INK));
    r.forEach((cell, i) => {
      if (cell == null || cell === "") return;
      const c = cols[i];
      doc.setFont("helvetica", c.bold ? "bold" : "normal");
      doc.text(
        String(cell),
        c.align === "right" ? colX[i] + c.width : colX[i] + 2,
        yy + 9,
        { align: c.align === "right" ? "right" : "left", maxWidth: c.width - 2 }
      );
    });
    yy += rowH;
  }
  return yy + 6;
}

// ── Section: header / cover block (inline on page 1) ────────────────────────
function renderCover(doc, reports) {
  const meta = reports?.meta || {};
  let y = M + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...GRAY);
  doc.text("STACKD REPORTS", M, y);
  y += 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text("Your CGM report", M, y);
  y += 24;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GRAY);
  doc.text(`${fmtDate(reports.rangeStart)} — ${fmtDate(reports.rangeEnd)}`, M, y);
  y += 16;
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  const who = `${meta.displayName || "Stackd user"}${meta.email ? ` · ${meta.email}` : ""}`;
  doc.text(
    `${who} · generated ${meta.generatedAt ? fmtDate(meta.generatedAt) : "just now"} · ${meta.cgmSystem || "Dexcom"} · ${reports.windowDays}-day window`,
    M,
    y,
    { maxWidth: CW }
  );
  y += 10;
  doc.setDrawColor(...HAIR);
  doc.setLineWidth(1);
  doc.line(M, y, W - M, y);
  return y + 18;
}

// ── Section: Overview ───────────────────────────────────────────────────────
function renderOverview(doc, reports, y) {
  const o = reports?.overview;
  if (!o) return y;
  y = ensureSpace(doc, y, 60);
  y = sectionHeader(doc, y, "Overview", "Your glucose across this whole window");

  // Headline stat grid (2 rows x 4 cols).
  const stats = o.stats || {};
  const cells = [
    ["GMI", stats.gmi != null ? `${stats.gmi}%` : "—", "avg glucose, hbA1c-like"],
    ["Mean", stats.mean != null ? `${stats.mean} mg/dL` : "—", "average reading"],
    ["Variability", stats.sd != null ? `\u00B1${stats.sd}` : "—", "standard deviation"],
    ["%CV", stats.cv != null ? `${stats.cv}%` : "—", "coefficient of variation"],
    ["Days with data", o.completeness?.daysWithData ?? "—", `of ${o.completeness?.totalDays ?? reports.windowDays} days`],
    ["Data captured", o.completeness?.percentCaptured != null ? `${o.completeness.percentCaptured}%` : "—", "readings collected"],
    ["Best day in range", o.bestDay ? `${fmtDay(o.bestDay.date)} · ${o.bestDay.tirPercent}%` : "—", "highest target time"],
    ["Readings", stats.count?.toLocaleString?.() ?? stats.count ?? "—", "dexcom readings"],
  ];
  const colW = CW / 4;
  let yy = y;
  cells.forEach((cell, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const cx = M + col * colW;
    const cy = yy + row * 34;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...FAINT);
    doc.text(String(cell[0]).toUpperCase(), cx, cy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(String(cell[1]), cx, cy + 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(String(cell[2]), cx, cy + 22, { maxWidth: colW });
  });
  y = yy + 2 * 34 + 14;

  // TIR band.
  y = ensureSpace(doc, y, 90);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text("Time in range", M, y);
  y += 9;
  const bar = tirBar(doc, M, y, CW, 22, o.bands || []);
  y = bar.y + 10;
  y = tirLegend(doc, M, y, o.bands || []) + 14;

  // Hour-of-day percentile chart.
  y = ensureSpace(doc, y, 150);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text("Glucose by hour of day", M, y);
  y += 9;
  const hw = CW;
  const hh = 120;
  const base = y;
  // 10/25/50/75/90 percentile envelope as vector fills + median line.
  const bands = o.hourBands || [];
  const minV = 40, maxV = 250;
  const px = (hora) => M + (hora / 24) * hw;
  const py = (v) => base + hh - ((Math.max(minV, Math.min(v, maxV)) - minV) / (maxV - minV)) * hh;

  // Gridlines.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  for (const t of [40, 90, 140, 190, 240]) {
    const ty = py(t);
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.5);
    doc.line(M, ty, M + hw, ty);
    doc.setTextColor(...FAINT);
    doc.text(String(t), M - 5, ty + 2, { align: "right" });
  }
  // P5–P95 band (light).
  doc.setFillColor(214, 228, 236);
  const env = (bandPct) => {
    const poly = [];
    for (let h = 0; h < 24; h++) {
      const b = bands[h];
      if (b && b[bandPct] != null) poly.push([px(h), py(b[bandPct])]);
    }
    return poly;
  };
  const upper = env("p5");
  const lower = env("p95");
  if (upper.length && lower.length) {
    let path = `M ${upper[0][0]} ${upper[0][1]} `;
    for (let i = 1; i < upper.length; i++) path += `L ${upper[i][0]} ${upper[i][1]} `;
    for (let i = lower.length - 1; i >= 0; i--) path += `L ${lower[i][0]} ${lower[i][1]} `;
    path += "Z";
    // jsPDF supports path() via doc.path in newer versions; fall back to lines.
    doc.setFillColor(214, 228, 236);
    // draw as thin vertical strips to be safe (no fill path dependency):
    for (let h = 0; h < 24; h++) {
      const b = bands[h];
      if (!b || b.p5 == null || b.p95 == null) continue;
      const x0 = px(h), x1 = px(h + 1);
      doc.setFillColor(214, 228, 236);
      doc.rect(x0, py(b.p95), Math.max(x1 - x0, 0.5), py(b.p5) - py(b.p95), "F");
    }
  }
  // P25–P75 band (mid).
  for (let h = 0; h < 24; h++) {
    const b = bands[h];
    if (!b || b.p25 == null || b.p75 == null) continue;
    const x0 = px(h), x1 = px(h + 1);
    doc.setFillColor(186, 211, 224);
    doc.rect(x0, py(b.p75), Math.max(x1 - x0, 0.5), py(b.p25) - py(b.p75), "F");
  }
  // Median line.
  doc.setDrawColor(...CURVE);
  doc.setLineWidth(1.4);
  for (let h = 1; h < 24; h++) {
    const a = bands[h - 1], b = bands[h];
    if (a?.p50 == null || b?.p50 == null) continue;
    doc.line(px(h - 1), py(a.p50), px(h), py(b.p50));
  }
  // Time ticks.
  doc.setFontSize(6.5);
  doc.setTextColor(...FAINT);
  for (const [hora, label] of [[0, "12a"], [6, "6a"], [12, "12p"], [18, "6p"], [24, "12a"]]) {
    doc.text(label, px(hora), base + hh + 9, { align: hora === 0 ? "left" : hora === 24 ? "right" : "center" });
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text("Shaded bands are the 5th–95th and 25th–75th percentiles; the line is the median.", M, base + hh + 22);
  y = base + hh + 30;
  return y;
}

// ── Section: Patterns ───────────────────────────────────────────────────────
function renderPatterns(doc, reports, y) {
  const p = reports?.patterns;
  if (!p) return y;
  y = ensureSpace(doc, y, 30);
  y = sectionHeader(doc, y, "Patterns", "Recurring highs and lows");

  const recurring = p.recurring || [];
  if (!recurring.length) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text("No recurring out-of-range hour windows were detected in this window.", M, y);
    y += 20;
  } else {
    for (const pat of recurring) {
      y = ensureSpace(doc, y, 44);
      const isHigh = pat.type === "high";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...(isHigh ? RANGE.high : RANGE.low));
      doc.text(`${isHigh ? "Times above target" : "Times below target"} · mostly ${pat.windowLabel}`, M, y);
      y += 13;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...INK);
      doc.text(`${pat.count} of ${pat.ofDays} days, mostly between ${pat.windowLabel}`, M, y);
      y += 12;
      if (pat.evidenceDates && pat.evidenceDates.length) {
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        doc.text("Seen on: " + pat.evidenceDates.slice(0, 10).map(fmtDay).join(", "), M, y, { maxWidth: CW });
        y += 14;
      }
    }
  }
  return y + 6;
}

// ── One full-detail day (chart + event table) — used for Best & Hardest ────
// Best/Hardest day detail lives under patterns.bestDay/worstDay (dayDetail) and
// their event rows once under daily.pages (matched by date) — never duplicated.
function renderDayDetail(doc, reports, y, title, tag, day, events) {
  y = ensureSpace(doc, y, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(title, M, y);
  if (day) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(`${tag} · ${day.tirPercent}% in target`, W - M, y, { align: "right" });
  }
  y += 4;
  doc.setDrawColor(...HAIR);
  doc.setLineWidth(0.7);
  doc.line(M, y, W - M, y);
  y += 12;

  if (!day) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text("Not enough data yet for a full day.", M, y);
    return y + 18;
  }

  // Daily glucose chart (vector).
  y = ensureSpace(doc, y, 140);
  y = glucoseChart(doc, M, y, CW, 96, day.series, {
    targetLow: reportsTarget(reports).low,
    targetHigh: reportsTarget(reports).high,
    color: CURVE,
  }) + 8;

  // Event table — each dose/meal/manual reading exactly once as a row.
  const rows = (events || []).map((e) => [
    fmtTime(e.time),
    e.type || "Event",
    e.details || e.name || "—",
    e.valueText || "",
  ]);
  if (rows.length) {
    y = ensureSpace(doc, y, rows.length * 17 + 30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text("Day events", M, y + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text("Each support dose and nourishment you logged appears here once.", W - M, y + 4, { align: "right" });
    y += 12;
    const cols = [
      { label: "Time", width: 70, align: "left" },
      { label: "Type", width: 120, align: "left" },
      { label: "Details", width: CW - 70 - 120 - 90, align: "left" },
      { label: "Amount", width: 90, align: "right", bold: true },
    ];
    y = table(doc, M, y, cols, rows, { rowH: 16 }) + 6;
  }

  // Small stat footer for this day.
  const s = day.stats;
  if (s) {
    y = ensureSpace(doc, y, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(
      `Readings ${s.count ?? "—"} · Mean ${s.mean ?? "—"} mg/dL · Low–high ${s.min ?? "—"}\u2013${s.max ?? "—"} · TIR ${day.tirPercent}%`,
      M,
      y
    );
    y += 16;
  }
  return y + 6;
}

function reportsTarget(reports) {
  return {
    low: reports?.targetLow ?? 70,
    high: reports?.targetHigh ?? 180,
  };
}

// ── Section: Overlay (week-by-week) ─────────────────────────────────────────
const WEEK_COLORS = [
  [120, 120, 120], [100, 150, 120], [145, 120, 170], [200, 140, 60],
  [80, 130, 170], [170, 100, 100], [90, 150, 150],
];

function renderOverlay(doc, reports, y) {
  const weeks = reports?.overlay || [];
  if (!weeks.length) return y;
  y = ensureSpace(doc, y, 30);
  y = sectionHeader(doc, y, "Weekly Overlay", "Each day of a week on one 24-hour chart");

  for (const wk of weeks) {
    y = ensureSpace(doc, y, 150);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(`Week of ${fmtDay(wk.weekStart)}`, M, y);
    y += 8;
    const base = y;
    const hh = 105;
    const minV = 40, maxV = 250;
    const px = (min) => M + (min / 1440) * CW;
    const py = (v) => base + hh - ((Math.max(minV, Math.min(v, maxV)) - minV) / (maxV - minV)) * hh;

    // grid + target band
    for (const t of [40, 90, 140, 190, 240]) {
      doc.setDrawColor(...GRID);
      doc.setLineWidth(0.5);
      doc.line(M, py(t), M + CW, py(t));
    }
    doc.setFillColor(214, 238, 213);
    doc.rect(M, py(reportsTarget(reports).high), CW, py(reportsTarget(reports).low) - py(reportsTarget(reports).high), "F");

    // each day
    (wk.days || []).forEach((d) => {
      if (!d.hasData || !d.series?.length) return;
      const col = WEEK_COLORS[d.weekday % WEEK_COLORS.length];
      doc.setDrawColor(...col);
      doc.setLineWidth(0.9);
      for (let i = 1; i < d.series.length; i++) {
        const a = d.series[i - 1], b = d.series[i];
        doc.line(px(a.min), py(a.value), px(b.min), py(b.value));
      }
    });

    // time ticks
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...FAINT);
    for (const [min, label] of [[0, "12a"], [360, "6a"], [720, "12p"], [1080, "6p"], [1440, "12a"]]) {
      doc.text(label, px(min), base + hh + 9, { align: min === 0 ? "left" : min === 1440 ? "right" : "center" });
    }
    // legend — weekday names with colored dots
    let lx = M;
    doc.setFontSize(6.5);
    doc.setTextColor(...GRAY);
    const days = wk.days || [];
    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (let d = 0; d < 7; d++) {
      const any = days.find((x) => x.weekday === d);
      doc.setFillColor(...WEEK_COLORS[d]);
      doc.rect(lx, base + hh + 15, 6, 6, "F");
      doc.text(any && any.hasData ? dayLabels[d] : dayLabels[d], lx + 9, base + hh + 20);
      lx += 9 + doc.getTextWidth(dayLabels[d]) + 12;
    }
    y = base + hh + 30;
  }
  return y + 4;
}

// ── Section: Daily — compact summary table + sparkline thumbnails ───────────
function renderDaily(doc, reports, y) {
  const daily = reports?.daily;
  const patterns = reports?.patterns;
  if (!daily && !patterns) return y;

  // 1) Full-detail days — Best and Hardest ONLY (the 66-page driver is gone).
  if (patterns && (patterns.bestDay || patterns.worstDay)) {
    const findEvents = (date) =>
      date ? (reports.daily?.pages || []).find((pg) => pg.date === date)?.events || [] : [];
    if (patterns.bestDay) {
      y = renderDayDetail(
        doc,
        reports,
        y,
        `Best day · ${fmtDay(patterns.bestDay.date)}`,
        "Most time in target",
        patterns.bestDay,
        findEvents(patterns.bestDay.date)
      );
    }
    if (patterns.worstDay) {
      y = ensureSpace(doc, y, 30);
      y = renderDayDetail(
        doc,
        reports,
        y,
        `Hardest day · ${fmtDay(patterns.worstDay.date)}`,
        "Least time in target",
        patterns.worstDay,
        findEvents(patterns.worstDay.date)
      );
    }
  }

  // 2) Compact per-day summary table (all days, one row each).
  const pages = (daily?.pages || []).slice();
  if (pages.length) {
    y = ensureSpace(doc, y, 40);
    y = sectionHeader(doc, y, "All Days", "One row per day — a glanceable summary");

    const rows = pages.map((pg) => {
      const s = pg.stats || {};
      let totalIns = 0, doseCount = 0;
      for (const d of pg.markers?.doses || []) {
        totalIns += Number(d.units) || 0;
        doseCount += 1;
      }
      return [
        fmtDay(pg.date),
        s.mean != null ? `${s.mean}` : "—",
        `${pg.tirPercent ?? 0}%`,
        s.min != null ? `${s.min}\u2013${s.max}` : "—",
        totalIns > 0 ? `${Math.round(totalIns * 10) / 10}u` : "—",
        doseCount > 0 ? String(doseCount) : "—",
      ];
    });
    const colW = CW / 6;
    const cols = [
      { label: "Date", width: colW * 1.45, align: "left", bold: true },
      { label: "Avg mg/dL", width: colW * 1.15, align: "right" },
      { label: "TIR %", width: colW * 0.9, align: "right" },
      { label: "Low–High", width: colW * 1.2, align: "right" },
      { label: "Insulin", width: colW * 0.85, align: "right" },
      { label: "# Doses", width: colW * 0.7, align: "right" },
    ];
    y = table(doc, M, y, cols, rows, { rowH: 15 }) + 6;
  }

  // 3) Sparkline thumbnails for each day (with date + TIR%).
  if (pages.length) {
    y = ensureSpace(doc, y, 40);
    y = sectionHeader(doc, y, "Day Thumbnails", "Glucose shape for every day");
    const perRow = 2;         // 2 columns
    const itemsPerBlock = 6;  // 3 rows of 2
    const cellW = (CW - 24) / 2;
    const cellH = 56;
    const rows2 = [];
    for (const pg of pages) {
      rows2.push({ date: pg.date, tir: pg.tirPercent ?? 0, series: pg.series || [] });
    }
    for (let i = 0; i < rows2.length; i += itemsPerBlock) {
      const block = rows2.slice(i, i + itemsPerBlock);
      y = ensureSpace(doc, y, 3 * cellH + 8);
      block.forEach((item, bi) => {
        const col = bi % perRow;
        const row = Math.floor(bi / perRow);
        const cx = M + col * (cellW + 24);
        const cy = y + row * cellH;
        // label + TIR
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(...INK);
        doc.text(fmtDay(item.date), cx, cy);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...item.tir >= 70 ? RANGE.target : GRAY);
        doc.text(`TIR ${item.tir}%`, cx + 66, cy);
        sparkline(doc, cx, cy + 4, cellW, cellH - 10, item.series);
        doc.setDrawColor(...GRID);
        doc.setLineWidth(0.4);
        doc.rect(cx, cy + 2, cellW, cellH - 8);
      });
      y += 3 * cellH + 10;
    }
  }
  return y + 4;
}

// ── Section: Compare ────────────────────────────────────────────────────────
function renderCompare(doc, reports, y) {
  const c = reports?.compare;
  if (!c) return y;
  y = ensureSpace(doc, y, 40);
  y = sectionHeader(
    doc,
    y,
    "Compare",
    "This window against the equal-length window just before it"
  );

  const half = CW / 2;
  let leftY = y;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text("This stretch", M, leftY);
  leftY += 14;
  let rightY = y;
  doc.text("The stretch before", M + half + 20, rightY);
  rightY += 14;

  const sideCols = (data) => [
    ["Mean mg/dL", data?.stats?.mean != null ? String(data.stats.mean) : "—"],
    ["GMI %", data?.stats?.gmi != null ? String(data.stats.gmi) : "—"],
    ["Variability", data?.stats?.sd != null ? `\u00B1${data.stats.sd}` : "—"],
    ["%CV", data?.stats?.cv != null ? `${data.stats.cv}%` : "—"],
    ["Total insulin", data?.insulin?.totalUnits != null ? `${data.insulin.totalUnits} u` : "—"],
    ["Doses", data?.insulin?.doseCount != null ? String(data.insulin.doseCount) : "—"],
  ];
  const colW = half - 20;
  function drawSideStub(dd, xx, yy0, tag) {
    let yy = yy0;
    for (const [k, v] of sideCols(dd)) {
      yy = ensureSpace(doc, yy, 14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(k, xx + 2, yy);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...INK);
      doc.text(v, xx + colW, yy, { align: "right" });
      doc.setDrawColor(...GRID);
      doc.setLineWidth(0.4);
      doc.line(xx, yy + 2, xx + colW, yy + 2);
      yy += 13;
    }
    yy += 4;
    tirBar(doc, xx, yy, colW, 14, dd?.bands || []);
    return yy + 24;
  }

  leftY = drawSideStub(c.current, M, leftY, "now");
  rightY = drawSideStub(c.prior, M + half + 20, rightY, "prior");
  // TIR legends beneath each bar.
  leftY = tirLegend(doc, M, leftY, c.current?.bands || []) + 12;
  rightY = tirLegend(doc, M + half + 20, rightY, c.prior?.bands || []) + 12;
  return Math.max(leftY, rightY) + 6;
}

// ── Section: Daily Statistics (daytime / overnight weekly tables) ──────────
function renderDailyStats(doc, reports, y) {
  const ds = reports?.dailyStats;
  if (!ds) return y;
  y = ensureSpace(doc, y, 40);
  y = sectionHeader(doc, y, "Daily Statistics", "Day of week, split into daytime and overnight");

  const dayCols = [1, 2, 3, 4, 5, 6, 0];
  const colW = (CW - 70) / 7;
  const cols = [
    { label: "Metric", width: 70, align: "left", bold: true },
    ...dayCols.map((dc) => ({
      label: ds.columns[dayCols.indexOf(dc)],
      width: colW,
      align: "right",
    })),
  ];

  for (const modeKey of ["daytime", "overnight"]) {
    const mode = ds[modeKey] || {};
    y = ensureSpace(doc, y, 30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(modeKey === "daytime" ? "Daytime (6am–10pm)" : "Overnight (10pm–6am)", M, y + 4);
    y += 12;
    const metricRows = [
      ["Avg mg/dL", (c) => (c ? `${c.mean ?? "—"}` : "—")],
      ["In target %", (c) => (c ? `${c.target ?? "—"}%` : "—")],
      ["Low–High", (c) => (c ? `${c.min ?? "—"}\u2013${c.max ?? "—"}` : "—")],
      ["CV %", (c) => (c ? `${c.cv ?? "—"}` : "—")],
      ["Readings", (c) => (c ? String(c.count ?? "—") : "—")],
    ];
    const rows = metricRows.map(([label, f]) => [
      label,
      ...dayCols.map((dc) => f(mode[dc])),
    ]);
    y = table(doc, M, y, cols, rows, { rowH: 15 }) + 8;
  }
  return y + 4;
}

// ── Section: Hourly Statistics ──────────────────────────────────────────────
function renderHourlyStats(doc, reports, y) {
  const hs = reports?.hourlyStats;
  if (!hs || !hs.length) return y;
  y = ensureSpace(doc, y, 40);
  y = sectionHeader(doc, y, "Hourly Statistics", "The same numbers, hour by hour");

  const colW = (CW - 70) / 6;
  const cols = [
    { label: "Hour", width: 70, align: "left", bold: true },
    { label: "Avg", width: colW, align: "right" },
    { label: "In target %", width: colW, align: "right" },
    { label: "Low–High", width: colW * 1.4, align: "right" },
    { label: "CV %", width: colW, align: "right" },
    { label: "Readings", width: colW, align: "right" },
  ];
  // Show only hours with readings; two columns of rows to keep pages tight.
  const present = hs.filter((h) => h.values?.count > 0);
  const rowArr = present.map((h) => {
    const v = h.values;
    const label = `${h.hour % 12 === 0 ? 12 : h.hour % 12}${h.hour < 12 ? "am" : "pm"}`;
    return [
      label,
      v.mean != null ? `${v.mean}` : "—",
      v.target != null ? `${v.target}%` : "—",
      v.min != null ? `${v.min}\u2013${v.max}` : "—",
      v.cv != null ? `${v.cv}` : "—",
      v.count != null ? String(v.count) : "—",
    ];
  });
  y = table(doc, M, y, cols, rowArr, { rowH: 14 }) + 6;
  return y + 4;
}

// ── Section: AGP — standard glucose profile ─────────────────────────────────
function renderAgp(doc, reports, y) {
  const agp = reports?.agp;
  if (!agp) return y;
  y = ensureSpace(doc, y, 50);
  y = sectionHeader(doc, y, "Glucose Profile (AGP)", "Standard percentile profile");

  // Headline
  const hl = agp.headline || {};
  y = ensureSpace(doc, y, 34);
  const cells = [
    ["Mean", hl.mean != null ? `${hl.mean} mg/dL` : "—"],
    ["GMI", hl.gmi != null ? `${hl.gmi}%` : "—"],
    ["Variability", hl.cv != null ? `${hl.cv}% CV` : "—"],
    ["Days with data", hl.activePercent != null ? `${hl.activePercent}%` : "—"],
  ];
  const colW = CW / 4;
  cells.forEach((c, i) => {
    const cx = M + i * colW;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...FAINT);
    doc.text(String(c[0]).toUpperCase(), cx, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(String(c[1]), cx, y + 13);
  });
  y += 26;

  // Percentile curve (same envelope style as overview hourBands).
  const bands = agp.hourBands || [];
  y = ensureSpace(doc, y, 150);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text("Hour-of-day pattern", M, y);
  y += 9;
  const hh = 116;
  const base = y;
  const minV = 40, maxV = 250;
  const px = (hora) => M + (hora / 24) * CW;
  const py = (v) => base + hh - ((Math.max(minV, Math.min(v, maxV)) - minV) / (maxV - minV)) * hh;
  for (const t of [40, 90, 140, 190, 240]) {
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.5);
    doc.line(M, py(t), M + CW, py(t));
  }
  for (let h = 0; h < 24; h++) {
    const b = bands[h];
    if (!b) continue;
    const x0 = px(h), x1 = px(h + 1);
    if (b.p5 != null && b.p95 != null) {
      doc.setFillColor(214, 228, 236);
      doc.rect(x0, py(b.p95), Math.max(x1 - x0, 0.5), py(b.p5) - py(b.p95), "F");
    }
    if (b.p25 != null && b.p75 != null) {
      doc.setFillColor(186, 211, 224);
      doc.rect(x0, py(b.p75), Math.max(x1 - x0, 0.5), py(b.p25) - py(b.p75), "F");
    }
  }
  doc.setDrawColor(...CURVE);
  doc.setLineWidth(1.4);
  for (let h = 1; h < 24; h++) {
    const a = bands[h - 1], b0 = bands[h];
    if (a?.p50 == null || b0?.p50 == null) continue;
    doc.line(px(h - 1), py(a.p50), px(h), py(b0.p50));
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...FAINT);
  for (const [hora, label] of [[0, "12a"], [6, "6a"], [12, "12p"], [18, "6p"], [24, "12a"]]) {
    doc.text(label, px(hora), base + hh + 9, { align: hora === 0 ? "left" : hora === 24 ? "right" : "center" });
  }
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text("IQR envelope and median, like the standard AGP format.", M, base + hh + 22);
  y = base + hh + 30;

  // Daily mini-profiles (week-by-week texture) — small vector tiles.
  const profs = agp.dailyProfiles || [];
  if (profs.length) {
    y = ensureSpace(doc, y, 40);
    y = sectionHeader(doc, y, "Daily Profiles", "A small curve for each day");
    const perRow = 4;
    const cellW = (CW - 3 * 16) / perRow;
    const cellH = 52;
    profs.forEach((dp, i) => {
      if (i > 0 && i % (perRow) === 0) y = ensureSpace(doc, y, cellH + 12);
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const cx = M + col * (cellW + 16);
      const cy = y + row * (cellH + 16);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...GRAY);
      doc.text(fmtDay(dp.date), cx, cy);
      sparkline(doc, cx, cy + 3, cellW, cellH - 10, dp.series);
      doc.setDrawColor(...GRID);
      doc.setLineWidth(0.4);
      doc.rect(cx, cy + 2, cellW, cellH - 6);
    });
    y += Math.ceil(profs.length / perRow) * (cellH + 16) + 6;
  }
  return y + 4;
}

// ── Entry point ─────────────────────────────────────────────────────────────
// Compose a combined typeset PDF from the reports data object + selected report
// IDs (in REPORT_ORDER). Returns { filename, blob }.
export async function composeReportsPdf(reports, reportIds = []) {
  const doc = makeDoc();
  let y = renderCover(doc, reports);

  const order = [
    "overview",
    "patterns",
    "overlay",
    "daily",
    "compare",
    "dailyStats",
    "hourlyStats",
    "agp",
  ];
  const wanted = new Set(reportIds.length ? reportIds : order);
  const renderers = {
    overview: renderOverview,
    patterns: renderPatterns,
    overlay: renderOverlay,
    daily: renderDaily,
    compare: renderCompare,
    dailyStats: renderDailyStats,
    hourlyStats: renderHourlyStats,
    agp: renderAgp,
  };

  for (const id of order) {
    if (!wanted.has(id)) continue;
    const fn = renderers[id];
    if (!fn) continue;
    y = fn(doc, reports, y);
    y += 8;
  }

  stampFooter(doc);

  const filename = `stackd-reports-${new Date().toISOString().slice(0, 10)}.pdf`;
  return { filename, blob: doc.output("blob") };
}