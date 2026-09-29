import { Link } from "react-router-dom";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import { LEGAL_DOCUMENTS } from "@/lib/acknowledgmentConfig";
import { ChevronLeft } from "lucide-react";

export default function PrivacyPage() {
  const doc = LEGAL_DOCUMENTS.privacy;

  return (
    <div id="top" className="min-h-screen" style={{ background: "#f7f1e8" }}>
      <LandingNav />
      <main className="mx-auto max-w-2xl px-4 py-12">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1 text-sm font-semibold transition-colors hover:opacity-70"
          style={{ color: "#5a5048" }}
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </Link>

        <h1
          className="text-3xl font-bold tracking-tight md:text-4xl"
          style={{ color: "#3f3830" }}
        >
          {doc.title}
        </h1>
        <p className="mt-2 text-sm" style={{ color: "#6b6153" }}>
          Last updated July 4, 2026 · Version {doc.version}
        </p>

        <div
          className="mt-8 rounded-2xl p-6"
          style={{ background: "#fdf9f2", boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)" }}
        >
          <div className="space-y-4 text-sm leading-relaxed" style={{ color: "#3f3830" }}>
            {doc.content
              .split("\n\n")
              .filter((block) => block.trim())
              .map((block, i) => {
                const isHeading = /^\d:/.test(block.trim());
                return (
                  <div key={i}>
                    {isHeading ? (
                      <h2 className="mb-1 text-base font-semibold" style={{ color: "#3f3830" }}>{block.trim()}</h2>
                    ) : (
                      <div className="whitespace-pre-wrap" style={{ color: "#4a423a" }}>{block.trim()}</div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}