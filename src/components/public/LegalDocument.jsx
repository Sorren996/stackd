/**
 * Renders one of the app's legal documents (see src/lib/acknowledgmentConfig).
 *
 * The text is the same document the acknowledgment step points at, shown here
 * in a readable measure. Nothing is altered for the web: the version the reader
 * sees is the version they acknowledged.
 */
export default function LegalDocument({ doc }) {
  const blocks = doc.content.split("\n\n").filter((block) => block.trim());

  return (
    <article
      className="rounded-3xl bg-paper p-6 sm:p-9"
      style={{ border: "1px solid #eadccf", boxShadow: "0 1px 2px rgba(63, 56, 48, 0.04), 0 14px 40px rgba(24, 35, 39, 0.16)" }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">Version {doc.version}</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink">{doc.title}</h2>
      <div className="mt-6 space-y-5">
        {blocks.map((block, index) => {
          const text = block.trim();
          const isHeading = /^\d+:/.test(text);
          return isHeading ? (
            <h3 key={index} className="pt-2 text-[15px] font-semibold text-ink">
              {text}
            </h3>
          ) : (
            <p key={index} className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
              {text}
            </p>
          );
        })}
      </div>
    </article>
  );
}