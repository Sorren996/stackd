import { Link } from "react-router-dom";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import { ChevronLeft, MessageCircle, Bug, ShieldCheck, CircleHelp } from "lucide-react";

const HELP_OPTIONS = [
  {
    icon: CircleHelp,
    title: "Ask a question",
    body: "Wondering how a reading, estimate, or review works? Open the help (?) icons throughout the app or reach out from Settings.",
  },
  {
    icon: Bug,
    title: "Report a problem",
    body: "If something looks off or a moment didn't save, tell us what you saw. Detail helps us find and gently fix it.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy & data",
    body: "Your health data stays yours. You can review how it's handled on the Privacy Notice page, and delete it any time from Settings.",
  },
];

export default function PublicContactPage() {
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

        <h1 className="text-3xl font-bold tracking-tight md:text-4xl" style={{ color: "#3f3830" }}>
          Contact <span className="font-serif-italic" style={{ fontWeight: 400 }}>support</span>
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed" style={{ color: "#6b6153" }}>
          We're here to help you feel at ease with Stackd. The fastest way to reach us is from inside
          the app: <span className="font-semibold">Settings → Contact &amp; Support</span>. That flow
          shares the details we need to look into things alongside you.
        </p>

        <div className="mt-8 space-y-4">
          {HELP_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <div
                key={option.title}
                className="flex items-start gap-4 rounded-2xl p-5"
                style={{ background: "#fdf9f2", boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)" }}
              >
                <span
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "rgba(91,101,80,0.12)" }}
                >
                  <Icon className="h-4 w-4" style={{ color: "#5b6550" }} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: "#3f3830" }}>{option.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: "#4a423a" }}>{option.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="mt-8 flex items-start gap-3 rounded-2xl p-5"
          style={{ background: "#fdf9f2", boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)" }}
        >
          <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#5b6550" }} />
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "#3f3830" }}>Already have an account?</h2>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "#4a423a" }}>
              Sign in and head to{" "}
              <Link to="/login" className="font-semibold underline" style={{ color: "#3f3830" }}>
                Settings → Contact &amp; Support
              </Link>{" "}
              to send a request directly.
            </p>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}