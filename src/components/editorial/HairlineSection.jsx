/**
 * Hairline section: 10px uppercase letterspaced (#a89e8d, 0.16em) label,
 * 1px #eadccf rule below, content under it, whitespace between sections.
 * No card boxes, no borders/shadows on the content area.
 */
export default function HairlineSection({ label, children, className = "" }) {
  return (
    <section className={`px-1 ${className}`}>
      {label && (
        <div className="section-label">
          {label}
        </div>
      )}
      <div className="pt-3">{children}</div>
    </section>
  );
}