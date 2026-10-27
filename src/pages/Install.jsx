import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Compass, MoreVertical, Share, Smartphone } from "lucide-react";
import { base44 } from "@/api/base44Client";
import PublicShell from "@/components/public/PublicShell";
import PublicPageHeader from "@/components/public/PublicPageHeader";
import PublicSection from "@/components/public/PublicSection";
import useSiteMeta from "@/hooks/useSiteMeta";

const STEPS = [
  {
    icon: Share,
    platform: "iPhone and iPad",
    browser: "Safari",
    steps: [
      "Open Stackd in Safari.",
      "Tap the Share button in the toolbar.",
      "Scroll the list and choose Add to Home Screen.",
      "Name it Stackd, then tap Add.",
    ],
    note: "Safari is the browser that gives iPhone and iPad the full home-screen app experience.",
  },
  {
    icon: Share,
    platform: "iPhone and iPad",
    browser: "Chrome, Firefox, Edge",
    steps: [
      "Open the browser menu and look for Share or Add to Home Screen.",
      "Follow the prompt to add the shortcut.",
      "Note that on iOS this usually opens Stackd inside the browser rather than as its own app.",
    ],
    note: "For the app-style window on iOS, Safari is the one to use.",
  },
  {
    icon: MoreVertical,
    platform: "Android",
    browser: "Chrome, Edge, Samsung Internet",
    steps: [
      "Open Stackd in the browser.",
      "Tap the menu in the top corner.",
      "Choose Install app, or Add to Home screen.",
      "Confirm, and Stackd appears with your other apps.",
    ],
    note: "Android browsers install it as a proper app window once the menu offers Install app.",
  },
  {
    icon: Compass,
    platform: "Desktop",
    browser: "Chrome, Edge, Safari on macOS",
    steps: [
      "Open Stackd in your browser.",
      "Chrome and Edge: use the install icon in the address bar, or menu then Install Stackd.",
      "Safari on macOS: choose File, then Add to Dock.",
    ],
    note: "Handy as a small always-available window next to your other work.",
  },
];

export default function Install() {
  const [isAuthed, setIsAuthed] = useState(false);

  useSiteMeta(
    "Install Stackd on your phone, tablet or desktop",
    "Step by step instructions for adding Stackd to your home screen on iPhone, iPad, Android and desktop, and what home-screen installation does and does not do.",
  );

  useEffect(() => {
    base44.auth.isAuthenticated().then(setIsAuthed).catch(() => setIsAuthed(false));
  }, []);

  // Reached from Settings while signed in: keep the way back to the app, stay on
  // the app's own warm canvas rather than the public field, and share the same
  // instructions.
  if (isAuthed) {
    return (
      <div className="bg-paper-sunk pb-16 text-ink">
        <div className="sticky top-0 z-30 flex items-center px-4 py-3" style={{ background: "rgba(244, 236, 225, 0.94)", backdropFilter: "blur(10px)" }}>
          <Link to="/settings/profile" className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-semibold text-ink">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Profile
          </Link>
        </div>
        <div className="px-4 pt-6 sm:px-8">
          <h1 className="mx-auto max-w-3xl text-[30px] font-bold leading-tight tracking-tight text-ink sm:text-4xl">
            Install Stackd
          </h1>
          <div className="mx-auto mt-8 max-w-3xl">
            <InstallBody embedded />
          </div>
        </div>
      </div>
    );
  }

  return (
    <PublicShell>
      <PublicPageHeader
        eyebrow="Install"
        title="Add Stackd to your home screen."
        lede="Stackd runs in your browser and installs from it, on any phone, tablet or computer. There is no app store involved."
      />
      <InstallBody />
    </PublicShell>
  );
}

function InstallBody({ embedded = false }) {
  return (
    <>
      <PublicSection tone={embedded ? "sunk" : "field"} width="narrow" className="!pt-0">
        <div className="space-y-4">
          {STEPS.map((step) => (
            <div key={`${step.platform}-${step.browser}`} className="rounded-3xl bg-paper p-6" style={{ border: "1px solid #eadccf" }}>
              <div className="flex items-center gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "rgba(76, 103, 112, 0.10)" }}
                  aria-hidden="true"
                >
                  <step.icon className="h-5 w-5" style={{ color: "#3f5760" }} strokeWidth={1.8} />
                </span>
                <div>
                  <h2 className="text-[15px] font-semibold text-ink">{step.platform}</h2>
                  <p className="text-xs text-ink-muted">{step.browser}</p>
                </div>
              </div>
              <ol className="mt-4 space-y-2">
                {step.steps.map((line) => (
                  <li key={line} className="flex gap-3 text-sm leading-relaxed text-ink-muted">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#4d5742" }} strokeWidth={2.4} aria-hidden="true" />
                    <span>{line}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs leading-relaxed text-ink-muted">{step.note}</p>
            </div>
          ))}
        </div>
      </PublicSection>

      <PublicSection
        tone={embedded ? "sunk" : "paper"}
        eyebrow="Worth knowing"
        title="What installing does, and does not do."
        lede="It gives you a tidier way to open Stackd. It does not change how the app handles your information."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl bg-paper-sunk p-6" style={{ border: "1px solid #eadccf" }}>
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <Smartphone className="h-4 w-4" style={{ color: "#3f5760" }} aria-hidden="true" />
              What you get
            </h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-muted">
              <li>Stackd opens in its own window, without browser chrome.</li>
              <li>It stays one tap away on your home screen or dock.</li>
              <li>Your account and data are the same as in the browser.</li>
            </ul>
          </div>
          <div className="rounded-3xl p-6" style={{ background: "rgba(156, 82, 40, 0.07)", border: "1px solid rgba(156, 82, 40, 0.18)" }}>
            <h3 className="text-[15px] font-semibold text-ink">What it does not do</h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-muted">
              <li>It does not add background or closed-app location tracking.</li>
              <li>It does not turn Stackd into a medical device or an emergency monitor.</li>
              <li>Notifications still depend on your device settings and can be delayed, suppressed or missed.</li>
              <li>It does not store anything differently from the browser version.</li>
            </ul>
          </div>
        </div>
      </PublicSection>
    </>
  );
}