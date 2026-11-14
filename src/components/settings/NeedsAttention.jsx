import { Link } from "react-router-dom";

/**
 * "Needs attention" — only the things worth a tap right now. With nothing to
 * report it renders nothing at all, so the page never carries an empty block.
 */
export default function NeedsAttention({ items = [] }) {
  if (!items.length) return null;
  return (
    <section
      className="rounded-2xl border px-4 py-3"
      style={{ background: "#fdf9f2", borderColor: "#eadccf" }}
      aria-label="Needs attention"
    >
      <h2 className="section-label">Needs attention</h2>
      <div className="pt-1">
        {items.map((item) => (
          <Link
            key={item.key}
            to={item.to}
            className="flex items-center gap-2 py-2 transition hover:opacity-70 active:opacity-50"
          >
            <span className="flex-1 text-sm font-medium" style={{ color: "#2e2420" }}>
              {item.text}
            </span>
            <span aria-hidden="true" className="text-sm" style={{ color: "#6b6153" }}>
              ›
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}