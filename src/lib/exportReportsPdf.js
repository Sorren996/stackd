import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

// Render one or more mounted report nodes into a single combined PDF — one
// section per selected report — so a download always contains every report
// the user picked, not just the one currently on screen.

const A4_W_PT = 595.28;   // A4 width in points
const A4_H_PT = 841.89;   // A4 height
const MARGIN_PT = 36;
const TOP_PT = 44;
const COL_W = A4_W_PT - MARGIN_PT * 2;   // used column width in points
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

/** Slice a tall canvas into page-sized JPEG bands and add them to the doc. */
function addCanvasBands(doc, canvas, x, startY) {
  // Height of the whole canvas when scaled onto the A4 column.
  const scale = COL_W / canvas.width;
  const fullHpt = canvas.height * scale;
  const usableHpt = A4_H_PT - 56 - TOP_PT;   // page height below the header strip
  let srcY = 0;
  let dstY = startY;

  while (srcY < canvas.height) {
    // Pixels of the source canvas that fit in one usable page band.
    const srcH = Math.ceil(usableHpt / scale);
    const bandH = Math.min(srcH, canvas.height - srcY);

    const band = document.createElement("canvas");
    band.width = canvas.width;
    band.height = bandH;
    const ctx = band.getContext("2d");
    ctx.drawImage(canvas, 0, srcY, canvas.width, bandH, 0, 0, canvas.width, bandH);
    const img = band.toDataURL("image/jpeg", 0.92);

    if (dstY + bandH * scale > A4_H_PT - 56) {
      doc.addPage();
      dstY = TOP_PT;
    }
    doc.addImage(img, "JPEG", x, dstY, COL_W, bandH * scale, undefined, "FAST");
    dstY += bandH * scale;
    srcY += bandH;
  }
  return dstY;
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
  doc.rect(0, 0, A4_W_PT, 76, "F");
  doc.setTextColor(247, 241, 232);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Stackd Reports", MARGIN_PT, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Combined report from your CGM data", MARGIN_PT, 56);

  let y = TOP_PT;
  for (const node of valid) {
    const canvas = await snapshotNode(node);
    y = addCanvasBands(doc, canvas, MARGIN_PT, y);
    // Small gap before the next report.
    y += 24;
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