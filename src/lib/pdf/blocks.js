import {
  BOX, LINE, ASCENT, INK, GRAY, MUTED, FAINT, HAIR, GRID, RANGE, RANGE_LABEL, BAND_ORDER,
} from "@/lib/pdf/theme";

// Reusable measured blocks: { what, h, draw(top) }. Heights include every
// wrapped line plus the gap below, so the next block never overlaps.

export function textBlock(flow, str, { size = 8, style = "normal", color = GRAY, x = BOX.x, width = BOX.w, after = 0, maxLines } = {}) {
  const h = flow.measure(str, width, { size, style, maxLines }) + after;
  return { what: "text", h, draw: (top) => flow.text(str, x, top, width, { size, style, color, maxLines }) };
}

export function ruleBlock(flow, { weight = 0.8, after = 12 } = {}) {
  return {
    what: "rule",
    h: after + 1,
    draw(top) {
      flow.doc.setDrawColor(...HAIR);
      flow.doc.setLineWidth(weight);
      flow.line(BOX.x, top + 0.5, BOX.right, top + 0.5);
    },
  };
}

// Title on the left; subtitle on the same line only if both fit, otherwise
// the subtitle wraps onto its own line(s) underneath.
export function headingBlock(flow, title, subtitle, { size = 13, rule = true, after = 10 } = {}) {
  const d = flow.doc;
  const subSize = 8.5;
  d.setFont("helvetica", "bold");
  d.setFontSize(size);
  const tw = d.getTextWidth(title);
  d.setFont("helvetica", "normal");
  d.setFontSize(subSize);
  const sw = subtitle ? d.getTextWidth(subtitle) : 0;
  const inline = !!subtitle && tw + 16 + sw <= BOX.w;
  const titleH = flow.measure(title, BOX.w, { size, style: "bold" });
  const subH = subtitle && !inline ? flow.measure(subtitle, BOX.w, { size: subSize }) + 2 : 0;
  const ruleH = rule ? 5 : 0;
  return {
    what: `heading:${title}`,
    h: titleH + subH + ruleH + after,
    draw(top) {
      flow.text(title, BOX.x, top, BOX.w, { size, style: "bold", color: INK });
      if (inline) {
        const subTop = top + (size - subSize) * ASCENT;
        flow.text(subtitle, BOX.x + tw + 16, subTop, BOX.w - tw - 16, { size: subSize, color: MUTED, align: "right" });
      } else if (subtitle) {
        flow.text(subtitle, BOX.x, top + titleH + 2, BOX.w, { size: subSize, color: MUTED });
      }
      if (rule) {
        const ry = top + titleH + subH + 3;
        d.setDrawColor(...HAIR);
        d.setLineWidth(size >= 12 ? 0.8 : 0.6);
        flow.line(BOX.x, ry, BOX.right, ry);
      }
    },
  };
}

// Label / value / sub-caption grid. Row height = tallest wrapped cell.
export function statGridBlock(flow, cells, { cols = 4, gutter = 12 } = {}) {
  const cw = (BOX.w - gutter * (cols - 1)) / cols;
  const parts = (c) => [
    [String(c[0]).toUpperCase(), { size: 6.5, color: FAINT }, 2],
    [String(c[1]), { size: 11, style: "bold", color: INK }, 1],
    ...(c[2] ? [[String(c[2]), { size: 6.5, color: MUTED }, 0]] : []),
  ];
  const cellH = (c) => parts(c).reduce((s, [t, o, g]) => s + flow.measure(t, cw, o) + g, 0);
  const rows = [];
  for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols));
  const rowHs = rows.map((r) => Math.max(...r.map(cellH)) + 10);
  return {
    what: "stat-grid",
    h: rowHs.reduce((a, b) => a + b, 0),
    draw(top) {
      let y = top;
      rows.forEach((r, ri) => {
        r.forEach((c, ci) => {
          const x = BOX.x + ci * (cw + gutter);
          let yy = y;
          for (const [t, o, g] of parts(c)) yy += flow.text(t, x, yy, cw, o) + g;
        });
        y += rowHs[ri];
      });
    },
  };
}

// ── Legends ─────────────────────────────────────────────────────────────────
export function tirItems(bands) {
  return BAND_ORDER
    .map((k) => (bands || []).find((b) => b.key === k))
    .filter((b) => b && (b.percent ?? 0) > 0)
    .map((b) => ({ color: RANGE[b.key], label: `${RANGE_LABEL[b.key]}${b.display ? ` (${b.display})` : ""} — ${b.percent}%` }));
}

// Packs swatch items left→right and wraps to a new row whenever the next item
// would exceed `width` — in narrow columns this naturally stacks vertically.
export function swatchLegend(flow, items, width, { size = 8, sw = 8, gapX = 14 } = {}) {
  const d = flow.doc;
  d.setFont("helvetica", "normal");
  d.setFontSize(size);
  const lh = size * LINE + 3;
  const placed = [];
  let cx = 0;
  let row = 0;
  for (const it of items) {
    const textW = Math.min(d.getTextWidth(it.label), width - sw - 5);
    const iw = sw + 4 + textW;
    if (cx > 0 && cx + iw > width) {
      row += 1;
      cx = 0;
    }
    placed.push({ ...it, dx: cx, row, textW });
    cx += iw + gapX;
  }
  return {
    h: items.length ? (row + 1) * lh : 0,
    draw(x, top) {
      placed.forEach((p) => {
        const ry = top + p.row * lh;
        d.setFillColor(...p.color);
        flow.rect(x + p.dx, ry + (size * LINE - sw) / 2, sw, sw, "F");
        flow.text(p.label, x + p.dx + sw + 4, ry, p.textW + 0.5, { size, color: GRAY, maxLines: 1 });
      });
    },
  };
}

// Five-segment time-in-range bar. Percentages live in the legend, never on
// the colored fill.
export function tirBar(flow, x, y, w, h, bands) {
  const present = BAND_ORDER
    .map((key) => ({ key, percent: (bands || []).find((b) => b.key === key)?.percent ?? 0 }))
    .filter((b) => b.percent > 0);
  const sum = present.reduce((s, b) => s + b.percent, 0);
  if (!present.length) {
    flow.doc.setFillColor(...GRID);
    flow.rect(x, y, w, h, "F");
    return;
  }
  let cx = x;
  for (const b of present) {
    const segW = Math.min((b.percent / sum) * w, x + w - cx);
    flow.doc.setFillColor(...RANGE[b.key]);
    flow.rect(cx, y, segW, h, "F");
    cx += segW;
  }
}

// Full-width bar + legend as one block (they always stay together).
export function tirBlock(flow, bands, { barH = 22 } = {}) {
  const legend = swatchLegend(flow, tirItems(bands), BOX.w);
  return {
    what: "tir",
    h: barH + 8 + legend.h + 4,
    draw(top) {
      tirBar(flow, BOX.x, top, BOX.w, barH, bands);
      legend.draw(BOX.x, top + barH + 8);
    },
  };
}