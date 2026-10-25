import { describeStatus } from "@/lib/sharing/sharingCopy";

const TONE = {
  on: { bg: "rgba(91,101,80,0.14)", fg: "#4f5a45" },
  waiting: { bg: "rgba(196,146,74,0.16)", fg: "#8a6326" },
  off: { bg: "rgba(116,105,89,0.13)", fg: "#746959" },
};

/** One person in a sharing list: who, the state, and what is shared. */
export default function RelationshipRow({ title, subtitle, status, onOpen }) {
  const copy = describeStatus(status);
  const tone = TONE[copy.tone] || TONE.off;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full py-2.5 text-left transition hover:opacity-70 active:opacity-50"
    >
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "#3f3830" }}>
          {title}
        </span>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{ background: tone.bg, color: tone.fg }}
        >
          {copy.label}
        </span>
        <span className="shrink-0 text-sm" style={{ color: "#746959" }}>
          ›
        </span>
      </div>
      {subtitle && (
        <p className="mt-0.5 truncate text-xs" style={{ color: "#746959" }}>
          {subtitle}
        </p>
      )}
    </button>
  );
}