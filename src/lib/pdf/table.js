import { BOX, LINE, GRAY, INK, GRID } from "@/lib/pdf/theme";
import { textBlock } from "@/lib/pdf/blocks";

const PAD_X = 3;

// Flowing table.
// cols: [{ label, frac, align, bold }] — fractions are normalised so the table
//   is exactly the content width, never wider.
// Rows grow to fit wrapped cell text (long meal names wrap, never overlap).
// `lead` blocks (e.g. the section heading) are kept on the same page as the
// header row AND the first data row; on a page break the header repeats.
export function flowTable(flow, cols, rows, { lead = [], size = 8, headSize = 7, padY = 4, continued } = {}) {
  const total = cols.reduce((s, c) => s + (c.frac ?? 1), 0);
  let acc = BOX.x;
  const cs = cols.map((c) => {
    const w = ((c.frac ?? 1) / total) * BOX.w;
    const out = { ...c, x: acc, w, inner: w - PAD_X * 2 };
    acc += w;
    return out;
  });

  const headH = Math.max(...cs.map((c) => flow.measure(c.label, c.inner, { size: headSize, style: "bold" }))) + padY * 2;
  const header = () => ({
    what: "table-header",
    h: headH,
    draw(top) {
      flow.doc.setFillColor(245, 245, 245);
      flow.rect(BOX.x, top, BOX.w, headH, "F");
      cs.forEach((c) =>
        flow.text(c.label, c.x + PAD_X, top + padY, c.inner, { size: headSize, style: "bold", color: GRAY, align: c.align })
      );
    },
  });

  const rowBlock = (r) => {
    const opt = (c) => ({ size, style: c.bold ? "bold" : "normal" });
    const cellH = cs.map((c, i) => (r[i] == null || r[i] === "" ? 0 : flow.measure(String(r[i]), c.inner, opt(c))));
    const h = Math.max(size * LINE, ...cellH) + padY * 2;
    return {
      what: "table-row",
      h,
      draw(top) {
        flow.doc.setDrawColor(...GRID);
        flow.doc.setLineWidth(0.4);
        flow.line(BOX.x, top + 0.2, BOX.right, top + 0.2);
        cs.forEach((c, i) => {
          if (r[i] == null || r[i] === "") return;
          flow.text(String(r[i]), c.x + PAD_X, top + padY, c.inner, { ...opt(c), color: INK, align: c.align });
        });
      },
    };
  };

  const blocks = rows.map(rowBlock);
  flow.placeTogether([...lead, header(), blocks[0]]);
  for (let i = 1; i < blocks.length; i++) {
    if (!flow.fits(blocks[i].h)) {
      flow.newPage();
      flow.placeTogether([
        continued ? textBlock(flow, `${continued} (continued)`, { size: 8, style: "bold", color: GRAY, after: 5 }) : null,
        header(),
        blocks[i],
      ]);
    } else {
      flow.place(blocks[i]);
    }
  }
}