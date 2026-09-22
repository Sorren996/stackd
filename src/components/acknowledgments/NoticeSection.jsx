import ConsentCheckbox from "./ConsentCheckbox";

export default function NoticeSection({ section, checkboxes, onToggle, openedDocs, onOpenDocument }) {
  const isDocOpened = !section.documentKey || openedDocs.has(section.documentKey);

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        background: "#fdf9f2",
        borderColor: "#eadccf",
        boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)",
      }}
    >
      <h3 className="mb-2 text-sm font-bold text-white">{section.title}</h3>
      <div className="mb-3 space-y-2">
        {section.notice.split("\n\n").map((para, i) => (
          <p key={i} className="text-xs leading-relaxed text-white/55 whitespace-pre-line">
            {para}
          </p>
        ))}
      </div>
      {section.documentKey && (
        <button
          type="button"
          onClick={() => onOpenDocument(section.documentKey)}
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold transition"
          style={{ color: isDocOpened ? "#5b6550" : "#af751b" }}
        >
          {isDocOpened ? "\u2713 " : ""}
          {isDocOpened ? "Document reviewed" : `Read full ${section.title}`}
        </button>
      )}
      <ConsentCheckbox
        checked={checkboxes[section.checkboxId]}
        onChange={(val) => onToggle(section.checkboxId, val)}
        label={section.checkboxLabel}
      />
    </div>
  );
}