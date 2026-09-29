import { jsPDF } from "jspdf";
import { PAGE_W, PAGE_H, BOX, FLOW_BOTTOM, LINE, ASCENT, INK } from "@/lib/pdf/theme";

const EPS = 0.05;
const round = (n) => Math.round(n * 10) / 10;

// ─────────────────────────────────────────────────────────────────────────────
// Flow — the single layout engine every report section goes through.
//
// • Hard boundary: each page is clipped to the content box, so nothing can
//   ever paint into the margins or off the A4 sheet.
// • Blocks: every piece of content is a measured block { h, draw(top) }. A
//   block reserves its FULL height (wrapped text included) before painting,
//   and the cursor only moves forward — so blocks can never overlap.
// • Page breaks: a block that doesn't fit moves to the next page whole.
//   placeTogether() keeps headings with their first content, and captions
//   with their charts.
// • Audit: every paint is checked against its block and the content box;
//   anything outside is recorded in `violations`.
// ─────────────────────────────────────────────────────────────────────────────
export default class Flow {
  constructor() {
    this.doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
    this.page = 1;
    this.y = BOX.y;
    this.block = null;
    this.footer = false;
    this.violations = [];
    this.beginPage();
  }

  beginPage() {
    const d = this.doc;
    d.setFillColor(255, 255, 255);
    d.rect(0, 0, PAGE_W, PAGE_H, "F");
    d.saveGraphicsState();
    d.rect(BOX.x, BOX.y, BOX.w, FLOW_BOTTOM - BOX.y, null);
    d.clip();
    d.discardPath();
  }

  newPage() {
    this.doc.restoreGraphicsState();
    this.doc.addPage();
    this.page += 1;
    this.y = BOX.y;
    this.beginPage();
  }

  finish() {
    this.doc.restoreGraphicsState();
  }

  get atTop() {
    return this.y <= BOX.y + EPS;
  }

  fits(h) {
    return this.y + h <= FLOW_BOTTOM + EPS;
  }

  ensure(h) {
    if (!this.fits(h) && !this.atTop) this.newPage();
    if (!this.fits(h)) this.violations.push({ page: this.page, what: "block taller than a page", h: round(h) });
  }

  // Vertical gap between blocks. Dropped at the top of a page.
  space(n) {
    if (this.atTop) return;
    this.y += n;
    if (this.y > FLOW_BOTTOM) this.newPage();
  }

  place(block) {
    if (!block) return;
    this.ensure(block.h);
    const top = this.y;
    this.block = { y: top, h: block.h, what: block.what || "block" };
    block.draw(top);
    this.block = null;
    this.y = top + block.h;
  }

  // Keep several blocks on the same page (heading + first content, chart +
  // caption). If together they fit on a fresh page, they move as one unit.
  placeTogether(blocks) {
    const list = blocks.filter(Boolean);
    const total = list.reduce((s, b) => s + b.h, 0);
    if (total <= FLOW_BOTTOM - BOX.y) this.ensure(total);
    list.forEach((b) => this.place(b));
  }

  // ── Guard ────────────────────────────────────────────────────────────────
  check(x, y, w, h, what) {
    const limit = this.footer ? BOX.bottom : FLOW_BOTTOM;
    const b = this.block;
    const outPage = x < BOX.x - EPS || x + w > BOX.right + EPS || y < BOX.y - EPS || y + h > limit + EPS;
    const outBlock = !!b && (y < b.y - EPS || y + h > b.y + b.h + EPS);
    if (outPage || outBlock) {
      this.violations.push({
        page: this.page, what: `${b?.what || "footer"}:${what}`,
        x: round(x), y: round(y), w: round(w), h: round(h), outPage, outBlock,
      });
    }
  }

  // ── Text ─────────────────────────────────────────────────────────────────
  // Wrap to `width`; if a single unbreakable token is still wider, shrink.
  fitLines(text, width, size, style) {
    const d = this.doc;
    let s = size;
    for (;;) {
      d.setFont("helvetica", style);
      d.setFontSize(s);
      const lines = d.splitTextToSize(String(text ?? ""), width);
      const widest = Math.max(0, ...lines.map((l) => d.getTextWidth(l)));
      if (widest <= width + EPS || s <= 5) return { lines, size: s };
      s -= 0.5;
    }
  }

  clampLines(lines, width, maxLines) {
    if (!maxLines || lines.length <= maxLines) return lines;
    const out = lines.slice(0, maxLines);
    let last = out[maxLines - 1];
    while (last.length > 1 && this.doc.getTextWidth(`${last}...`) > width) last = last.slice(0, -1);
    out[maxLines - 1] = `${last.trimEnd()}...`;
    return out;
  }

  measure(text, width, { size = 8, style = "normal", maxLines } = {}) {
    const fit = this.fitLines(text, width, size, style);
    const n = maxLines ? Math.min(fit.lines.length, maxLines) : fit.lines.length;
    return n * fit.size * LINE;
  }

  // Draw wrapped text in a box whose TOP edge is `top`. Returns height used.
  text(text, x, top, width, { size = 8, style = "normal", color = INK, align = "left", maxLines } = {}) {
    const d = this.doc;
    const fit = this.fitLines(text, width, size, style);
    const lines = this.clampLines(fit.lines, width, maxLines);
    const s = fit.size;
    const lh = s * LINE;
    d.setFont("helvetica", style);
    d.setFontSize(s);
    d.setTextColor(...color);
    const ax = align === "right" ? x + width : align === "center" ? x + width / 2 : x;
    lines.forEach((ln, i) => d.text(ln, ax, top + s * ASCENT + i * lh, { align }));
    const h = lines.length * lh;
    this.check(x, top, width, h, "text");
    return h;
  }

  // ── Shapes ───────────────────────────────────────────────────────────────
  rect(x, y, w, h, style = "F") {
    this.doc.rect(x, y, w, h, style);
    this.check(x, y, w, h, "rect");
  }

  line(x1, y1, x2, y2) {
    this.doc.line(x1, y1, x2, y2);
    this.check(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1), "line");
  }
}