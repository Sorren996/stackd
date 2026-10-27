import { Link } from "react-router-dom";
import PublicShell from "@/components/public/PublicShell";
import PublicPageHeader from "@/components/public/PublicPageHeader";
import PublicSection from "@/components/public/PublicSection";
import LegalDocument from "@/components/public/LegalDocument";
import { LEGAL_DOCUMENTS, ACKNOWLEDGMENT_VERSIONS } from "@/lib/acknowledgmentConfig";
import useSiteMeta from "@/hooks/useSiteMeta";

const SUMMARY = [
  {
    title: "What is collected",
    body: "The glucose values, insulin doses, meals, notes and connected device data you choose to enter, plus the estimates the app derives from them. Technical details such as device type and timezone are recorded when you complete the acknowledgment steps.",
  },
  {
    title: "Who can see it",
    body: "You, and only you, by default. If you invite someone to follow you, they can see the parts you switch on for them, and nothing else. People who operate the app can process it as needed to run the service; it is not sold, and it is not used for advertising.",
  },
  {
    title: "Optional meal estimates",
    body: "If you use the optional estimate from a meal description or photo, that text or image is sent to an AI service to produce the suggestion. Manual logging never uses it, and you can leave the feature unused entirely.",
  },
  {
    title: "Removing it",
    body: "You can delete your account and its data from Settings. Withdrawing health-data consent restricts the health features without deleting what is already stored, which the notice below explains in full.",
  },
];

/**
 * The Privacy Notice, readable without an account, in the same words the app
 * asks people to acknowledge. The plain-language summary above it is a summary,
 * not a replacement, and the version shown here is the version that applies.
 */
export default function PrivacyPage() {
  const doc = LEGAL_DOCUMENTS.privacy;
  useSiteMeta(
    "Stackd Privacy Notice",
    "How Stackd collects, uses, stores and shares the information you enter or connect, including optional AI-assisted meal estimates and who can see your records.",
  );

  return (
    <PublicShell>
      <PublicPageHeader
        eyebrow="Privacy"
        title="Privacy Notice"
        lede="What Stackd collects, why, who can see it and how to remove it, in the same words the app asks you to acknowledge."
      />

      <PublicSection tone="field" width="narrow" className="!pt-0">
        <div className="grid gap-4 sm:grid-cols-2">
          {SUMMARY.map((item) => (
            <div key={item.title} className="rounded-3xl p-5" style={{ background: "rgba(253, 249, 242, 0.06)", border: "1px solid rgba(253, 249, 242, 0.22)" }}>
              <h2 className="text-[15px] font-semibold text-field-ink">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-field-ink">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-3xl bg-paper-sunk p-5" style={{ border: "1px solid #eadccf" }}>
          <h2 className="text-[15px] font-semibold text-ink">A note on versions</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            This notice is version {ACKNOWLEDGMENT_VERSIONS.privacy_notice_version} and last updated on 27 October 2026.
            The wording about who can access your records, and about what the optional AI-assisted meal estimate sends,
            has been corrected so it matches what the app actually does. Nothing about what is shared has been widened.
            If you acknowledged an earlier version, Stackd asks you to review and acknowledge this one the next time you
            sign in, and your earlier acknowledgment records are kept as they were.
          </p>
        </div>

        <div className="mt-8">
          <LegalDocument doc={doc} />
        </div>

        <p className="mt-6 text-sm leading-relaxed text-field-muted">
          The{" "}
          <Link to="/terms" className="font-semibold underline decoration-[#fdf9f2]/40 underline-offset-4" style={{ color: "#fdf9f2" }}>
            Terms of Use
          </Link>{" "}
          cover what Stackd is and is not. If you have a question about any of this, the{" "}
          <Link to="/contact" className="font-semibold underline decoration-[#fdf9f2]/40 underline-offset-4" style={{ color: "#fdf9f2" }}>
            help page
          </Link>{" "}
          explains how to reach us.
        </p>
      </PublicSection>
    </PublicShell>
  );
}