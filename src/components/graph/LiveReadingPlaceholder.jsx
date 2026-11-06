/**
 * The live-reading area before this device has confirmed the newest saved
 * reading. It shows no value, trend or status — nothing that could be read as
 * current — only that an update is on its way.
 */
export default function LiveReadingPlaceholder() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[52px] flex-col justify-center">
      <p className="text-[13px] font-medium" style={{ color: "#6b6153" }}>
        Updating your reading
      </p>
      <p className="mt-1 text-[11px]" style={{ color: "#746959" }}>
        Checking the latest saved reading on your account.
      </p>
    </div>
  );
}