import TrendArrow from "@/components/glucose/TrendArrow";
import PhoneFrame from "@/components/public/PhoneFrame";
import { Flag, PreviewCard, SampleTag, StatRow } from "@/components/public/parts";

/**
 * What a follower sees: only the scopes the owner switched on, each value
 * labelled as the owner's log or an estimate, and the last-known location shown
 * with its own timestamp rather than presented as live tracking.
 */
export default function FollowerPreview() {
  return (
    <div>
      <div className="mb-3 flex justify-center">
        <SampleTag />
      </div>
      <PhoneFrame>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-semibold" style={{ color: "#3f3830" }}>
            Following Ana
          </span>
          <Flag tone="on">2 shared</Flag>
        </div>

        <PreviewCard>
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-end gap-2">
              <span className="text-[40px] font-black leading-none tabular-nums" style={{ color: "#3f3830" }}>
                118
              </span>
              <span className="pb-1 text-[11px] font-medium" style={{ color: "#746959" }}>
                mg/dL
              </span>
              <span className="pb-1" style={{ color: "#4d5742" }}>
                <TrendArrow icon="right" size={18} label="Holding steady" />
              </span>
            </div>
            <span className="text-[10px] font-medium" style={{ color: "#746959" }}>
              2 min ago
            </span>
          </div>
          <p className="mt-2 text-[11px]" style={{ color: "#746959" }}>
            Ana&apos;s last shared reading. If it goes quiet, Stackd shows the age instead of hiding it.
          </p>
        </PreviewCard>

        <div className="mt-3">
          <PreviewCard label="Shared with you">
            <StatRow label="Glucose readings" value="Shared" note="last 24 hours" />
            <StatRow label="Insulin activity" value="2.6 u" note="estimated" />
            <StatRow label="Last known location" value="Shared 4:02 PM" note="while the app was open" />
            <p className="pt-3 text-[11px] leading-relaxed" style={{ color: "#6b6153" }}>
              Location is the last place Ana's phone reported while Stackd was open on her device. It is not live
              tracking, and it is never collected while the app is closed.
            </p>
          </PreviewCard>
        </div>

        <div className="mt-3 rounded-3xl px-4 py-3" style={{ background: "rgba(253, 249, 242, 0.6)", border: "1px dashed #d8cec2" }}>
          <p className="text-[11px] leading-relaxed" style={{ color: "#6b6153" }}>
            Not shared with you: notes, journal entries, doses Stackd does not estimate, and the whole glucose history.
            Ana can change or withdraw any of it at any time.
          </p>
        </div>
      </PhoneFrame>
    </div>
  );
}