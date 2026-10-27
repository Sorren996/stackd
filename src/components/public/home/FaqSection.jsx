import { Link } from "react-router-dom";
import PublicSection from "@/components/public/PublicSection";
import FaqList from "@/components/public/FaqList";

const FAQ = [
  {
    q: "Is Stackd a medical device?",
    a: "No. Stackd helps you record and see information you enter or connect. It does not diagnose, does not prescribe, and does not approve treatment. Decisions about your care stay with you and your healthcare team.",
  },
  {
    q: "Does Stackd tell me how much insulin to take?",
    a: "No. Stackd shows what you logged, the settings you confirmed, and estimates calculated from them. It does not decide a dose for you, and an estimate on screen is never treatment approval.",
  },
  {
    q: "Where does the glucose data come from?",
    a: "From a supported Dexcom Share account you connect yourself, from readings you enter by hand, or both. Manual logging can be switched off if a sensor already covers you.",
  },
  {
    q: "What can someone I share with see?",
    a: "Only the switches you turn on for that one person. Glucose and insulin can be shared without your journal, notes or full history. You can change or end it at any time, and the change applies straight away.",
  },
  {
    q: "Is the active insulin figure exact?",
    a: "No. It is an estimate drawn from the doses you logged and the settings you confirmed. Long-acting basal insulin is kept on its own line and is never counted as active rapid-acting insulin.",
  },
  {
    q: "Do I have to use the meal estimates?",
    a: "Never. Describing a meal or adding a photo is optional, and any numbers suggested are yours to edit or ignore. Nothing is saved until you review it, and you can log values by hand whenever you prefer.",
  },
  {
    q: "Can I use Stackd on my phone?",
    a: "Yes. Stackd runs in the browser and can be added to your home screen on iPhone, iPad, Android and desktop. It is not in an app store, and adding it does not give Stackd any background access to your location or alarms.",
  },
  {
    q: "What happens to my information?",
    a: "It is used to provide the features you use, and it is not sold or used for advertising. Anyone you authorise can see the parts you share with them. You can read the full Privacy Notice and delete your account and its data from Settings.",
  },
];

/** Useful questions, then the boundaries in plain language, then the documents. */
export default function FaqSection() {
  return (
    <PublicSection
      id="faq"
      tone="paper"
      eyebrow="Questions"
      title="The things people ask first."
      lede="Short answers, including the ones about what Stackd does not do."
    >
      <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
        <FaqList items={FAQ} />

        <aside
          className="h-fit rounded-3xl bg-paper-sunk p-6"
          style={{ border: "1px solid #eadccf" }}
        >
          <h3 className="text-[15px] font-semibold text-ink">Worth knowing before you start</h3>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-muted">
            <li>A low alert by email or text is a courtesy, not a guarantee. It can be delayed or never arrive.</li>
            <li>Shared location is the last place reported while the app was open, not live tracking.</li>
            <li>Estimated values describe your logs. They are not measurements and not clinical advice.</li>
            <li>Stackd is not a substitute for prescribed treatment, a sensor alarm or emergency services.</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/privacy" className="text-sm font-semibold underline decoration-[#9c5228]/40 underline-offset-4" style={{ color: "#8a4a24" }}>
              Privacy Notice
            </Link>
            <Link to="/terms" className="text-sm font-semibold underline decoration-[#9c5228]/40 underline-offset-4" style={{ color: "#8a4a24" }}>
              Terms of Use
            </Link>
            <Link to="/contact" className="text-sm font-semibold underline decoration-[#9c5228]/40 underline-offset-4" style={{ color: "#8a4a24" }}>
              Contact and self help
            </Link>
          </div>
        </aside>
      </div>
    </PublicSection>
  );
}