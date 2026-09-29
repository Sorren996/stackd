import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

// Render one or more mounted report nodes into a single combined PDF — one
// section per selected report — so a download always contains every report
// the user picked, not just the one currently on screen.
//
// Pagination strategy: each report is broken into its top-level blocks (one
// card / disclaimer each). Each block is captured to its own canvas and placed
// as a whole unit — a block that doesn't fit in the remaining page height is
// pushed to a fresh page, and only an oversized *single* block gets sliced.
// This keeps charts, captions, and the disclaimer together on one page instead
// of being split mid-shape or mid-sentence, and removes the tall-canvas
// duplication that inflated the old export to dozens of pages.

const A4_W_PT = 595.28;   // A4 width in points
const A4_H_PT = 841.89;   // A4 height
const MARGIN_PT = 36;
const HEADER_H = 76;      // teal header strip on page 1 only
const TOP_PT = 84;        // where content starts after the page-1 header
const CONT_TOP_PT = 44;   // where content starts on continuation pages
const COL_W = A4_W_PT - MARGIN_PT * 2;   // used column width in points
const MAX_Y = A4_H_PT - 64;              // content must not go below this (footer clears it)
const BLOCK_GAP = 16;                    // vertical gap between blocks
const FOOTER = "Describes your CGM data. Not medical advice. Not a dose recommendation.";

/** Snapshot a node to a full-height canvas at phone width (420px). */
async function snapshotNode(node) {
  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: "#fdf9f2",
    useCORS: true,
    logging: false,
    windowWidth: 420,
    width: node.scrollWidth,
    height: node.scrollHeight,
  });
  return canvas;
}

/** Height of a canvas (scaled to column width) in points. */
function canvasHpt(canvas) {
  return canvas.height * (COL_W / canvas.width);
}

/** Slice a single tall canvas into page-sized bands, starting at the given y
 *  and advancing to fresh pages as it fills. Used only for the rare card that
 *  is taller than a whole usable page. Returns the final y. */
function placeBands(doc, canvas, x, startY) {
  const scale = COL_W / canvas.width;
  const usableHpt = MAX_Y - CONT_TOP_PT;
  let srcY = 0;
  let y = startY;
  while (srcY < canvas.height) {
    if (y > MAX_Y) {
      doc.addPage();
      y = CONT_TOP_PT;
    }
    const srcH = Math.ceil(usableHpt / scale);
    const bandH = Math.min(srcH, canvas.height - srcY);

    const band = document.createElement("canvas");
    band.width = canvas.width;
    band.height = bandH;
    const ctx = band.getContext("2d");
    ctx.drawImage(canvas, 0, srcY, canvas.width, bandH, 0, 0, canvas.width, bandH);
    const img = band.toDataURL("image/jpeg", 0.92);
    doc.addImage(img, "JPEG", x, y, COL_W, bandH * scale, undefined, "FAST");
    y += bandH * scale;
    srcY += bandH;
  }
  return y;
}

/**
 * Compose a combined PDF from an array of mounted (hidden) report nodes.
 * Returns { filename, blob } or null on failure.
 */
export async function composeReportsPdf(nodes) {
  const valid = nodes.filter(Boolean);
  if (!valid.length) return null;

  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });

  // Header strip on the first page.
  doc.setFillColor(76, 103, 112);
  doc.rect(0, 0, A4_W_PT, HEADER_H, "F");
  doc.setTextColor(247, 241, 232);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Stackd Reports", MARGIN_PT, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Combined report from your CGM data", MARGIN_PT, 56);

  const FULL_USABLE = MAX_Y - CONT_TOP_PT;
  let y = TOP_PT;

  for (const node of valid) {
    // Break the report into its top-level blocks (cards + disclaimer), so each
    // unit stays intact on a single page whenever possible.
    const blocks = Array.from(node.children || []).filter((b) => b && b.nodeType === 1);

    for (const block of blocks) {
      const canvas = await snapshotNode(block);
      const blockHpt = canvasHpt(canvas);
      const usableRemain = MAX_Y - y;

      if (blockHpt <= usableRemain) {
        // Fits on the current page — place it whole.
        doc.addImage(canvas, "JPEG", MARGIN_PT, y, COL_W, blockHpt, undefined, "FAST");
        y += blockHpt + BLOCK_GAP;
      } else if (blockHpt <= FULL_USABLE) {
        // Moves as a whole unit to the next page (page-break-avoid).
        doc.addPage();
        y = CONT_TOP_PT;
        doc.addImage(canvas, "JPEG", MARGIN_PT, y, COL_W, blockHpt, undefined, "FAST");
        y += blockHpt + BLOCK_GAP;
      } else {
        // Oversized block: move it to a fresh page if it can't start near the
        // top, then slice within that page. Guards against mid-card splits.
        if (y > CONT_TOP_PT + 8) {
          doc.addPage();
          y = CONT_TOP_PT;
        }
        y = placeBands(doc, canvas, MARGIN_PT, y);
        y += BLOCK_GAP;
      }

      if (y > MAX_Y) {
        doc.addPage();
        y = CONT_TOP_PT;
      }
    }

    // Small gap before the next report.
    y += 16;
  }

  // Footer disclaimer on every page.
  const pages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(116, 105, 89);
    doc.text(FOOTER, MARGIN_PT, A4_H_PT - 24, { maxWidth: COL_W, align: "center" });
  }

  const filename = `stackd-reports-${new Date().toISOString().slice(0, 10)}.pdf`;
  return { filename, blob: doc.output("blob") };
}