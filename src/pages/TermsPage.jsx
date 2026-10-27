import { Link } from "react-router-dom";
import PublicShell from "@/components/public/PublicShell";
import PublicPageHeader from "@/components/public/PublicPageHeader";
import PublicSection from "@/components/public/PublicSection";
import LegalDocument from "@/components/public/LegalDocument";
import { LEGAL_DOCUMENTS } from "@/lib/acknowledgmentConfig";
import useSiteMeta from "@/hooks/useSiteMeta";

/**
 * The Terms of Use, readable without an account. This is the same document the
 * acknowledgment step presents, at the same version.
 */
export default function TermsPage() {
  const doc = LEGAL_DOCUMENTS.terms;
  useSiteMeta(
    "Stackd Terms of Use",
    "The Stackd Terms of Use: what Stackd is, what it is not, and what you agree to when you create an account.",
  );

  return (
    <PublicShell>
      <PublicPageHeader
        eyebrow="Legal"
        title="Terms of Use"
        lede={`Readable in full before you create an account. This is the same document you are asked to accept during setup, at version ${doc.version}.`}
      />
      <PublicSection tone="field" width="narrow" className="!pt-0">
        <LegalDocument doc={doc} />
        <p className="mt-6 text-sm leading-relaxed text-field-muted">
          The Privacy Notice explains how your information is handled, and is{" "}
          <Link to="/privacy" className="font-semibold underline decoration-[#fdf9f2]/40 underline-offset-4" style={{ color: "#fdf9f2" }}>
            available here
          </Link>
          .
        </p>
      </PublicSection>
    </PublicShell>
  );
}