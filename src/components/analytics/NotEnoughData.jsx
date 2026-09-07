// Calm, centered placeholder shown in place of a calculated figure when the
// selected range doesn't yet have enough data to trust the numbers.
export default function NotEnoughData({ compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "py-3" : "py-6"}`}>
      <p className="text-sm font-semibold text-white/45">Not enough data yet</p>
      <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-white/30">
        Keep logging to reveal your rhythms.
      </p>
    </div>
  );
}