import ConsentCheckbox from "./ConsentCheckbox";

export default function NoticeSection({ section, checkboxes, onToggle, openedDocs, onOpenDocument }) {
  const isDocOpened = !section.documentKey || openedDocs.has(section.documentKey);

  return (
    <div
      className="rounded-2xl border p-4 backdrop-blur-sm"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.008))",
        borderColor: "rgba(255,255,255,0.10)",
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
          style={{ color: isDocOpened ? "#5ba88a" : "#7dc8d4" }}
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