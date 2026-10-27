import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import PublicSection from "@/components/public/PublicSection";
import FollowerPreview from "@/components/public/previews/FollowerPreview";
import SharingScopes from "@/components/public/previews/SharingScopes";

/**
 * Following someone. Deliberately a supporting section: the person's own day
 * stays the lead, and this explains what sharing does and does not do.
 */
export default function FollowerSection() {
  return (
    <PublicSection
      id="sharing"
      tone="paper"
      eyebrow="Let someone follow along"
      title="The people you trust, in the picture."
      lede="Invite one person at a time, choose exactly what they can see, and change your mind whenever you want. Sharing is a switch you hold, not a door you open once."
      aside={
        <Link
          to="/sharing"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#d8cec2] px-5 text-sm font-semibold text-ink transition-colors hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9c5228] focus-visible:ring-offset-2"
        >
          How sharing works
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      }
    >
      <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:gap-14">
        <div className="mx-auto w-full max-w-[340px] lg:mx-0">
          <FollowerPreview />
        </div>
        <div className="space-y-6">
          <div className="rounded-3xl bg-paper-sunk p-6" style={{ border: "1px solid #eadccf" }}>
            <h3 className="text-[15px] font-semibold text-ink">They see only what you switch on</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Glucose and insulin can be shared on their own, without your journal, your notes or your whole history.
              Insulin activity is shown to them as the estimate it is, with the basal background kept separate.
            </p>
          </div>

          <SharingScopes />

          <div className="rounded-3xl p-6" style={{ background: "rgba(156, 82, 40, 0.07)", border: "1px solid rgba(156, 82, 40, 0.18)" }}>
            <h3 className="text-[15px] font-semibold text-ink">What sharing is not</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              It is not a monitoring service and not a replacement for emergency care. Location is the last place your
              phone reported while Stackd was open, never background tracking. A low-notice email or text can be delayed
              or missed, so nobody should rely on it as their only safety net.
            </p>
          </div>
        </div>
      </div>
    </PublicSection>
  );
}