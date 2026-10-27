import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

/**
 * The opening block of a public subpage. Short by design: a public page should
 * explain itself without a scroll of marketing first.
 */
export default function PublicPageHeader({ eyebrow, title, lede, backTo = "/", backLabel = "Stackd home" }) {
  return (
    <div className="px-4 pb-10 pt-10 sm:px-8 sm:pb-14 sm:pt-14">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          to={backTo}
          className="inline-flex min-h-[36px] items-center gap-1.5 text-sm font-medium text-field-muted transition-colors hover:text-field-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fdf9f2]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </Link>
        {eyebrow && (
          <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "#dde5e8" }}>
            {eyebrow}
          </p>
        )}
        <h1 className="mt-3 text-[32px] font-bold leading-[1.1] tracking-tight text-field-ink sm:text-5xl">{title}</h1>
        {lede && <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-field-muted sm:text-lg">{lede}</p>}
      </div>
    </div>
  );
}