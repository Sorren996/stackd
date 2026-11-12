import { ALERT_TONES, previewAlertTone } from "@/lib/notificationFeedback";

/**
 * Tap-to-hear previews of the three in-app tones. Each chip plays immediately on
 * the device you are holding, so you can tell the descending tone from the
 * ascending one without sending anything. This plays THIS device only — the
 * tone on a locked phone is chosen by iOS from Stackd's own notification
 * settings.
 */
export default function AlertTonePreview() {
  return (
    <div className="mt-3">
      <div className="flex gap-1.5" role="group" aria-label="Alert tone previews">
        {Object.entries(ALERT_TONES).map(([tone, { label }]) => (
          <button
            key={tone}
            type="button"
            onClick={() => previewAlertTone(tone)}
            aria-label={`Play the ${label.toLowerCase()} alert tone`}
            className="flex-1 rounded-xl border py-2 text-xs font-semibold transition hover:opacity-70"
            style={{ borderColor: "#eadccf", background: "#fdf9f2", color: "#3f3830" }}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "#746959" }}>
        Tap to hear each tone on this device. The tone on a locked phone comes from the
        phone&rsquo;s notification settings.
      </p>
    </div>
  );
}