import { Link } from "react-router-dom";
import { ArrowRight, MailCheck, ShieldQuestion, UserMinus, UserRoundCheck } from "lucide-react";
import PublicShell from "@/components/public/PublicShell";
import PublicPageHeader from "@/components/public/PublicPageHeader";
import PublicSection from "@/components/public/PublicSection";
import FollowerPreview from "@/components/public/previews/FollowerPreview";
import SharingScopes from "@/components/public/previews/SharingScopes";
import useSiteMeta from "@/hooks/useSiteMeta";

const STEPS = [
  {
    icon: MailCheck,
    title: "You invite one person by email",
    body: "Stackd sends them a link tied to that address. The invitation cannot be passed on to someone else, because access opens against the address it was sent to.",
  },
  {
    icon: UserRoundCheck,
    title: "They sign in or create an account",
    body: "They use that same email address, with a password or an Apple or Google account. Accepting simply adds you to their list.",
  },
  {
    icon: ShieldQuestion,
    title: "Nothing is shared yet",
    body: "Accepting gives them nothing on its own. Your switches stay off until you turn on what you actually want them to see.",
  },
  {
    icon: UserMinus,
    title: "You can change or end it whenever",
    body: "Turn a switch off, pause the relationship or end it entirely. The change applies immediately, and the person keeps nothing new from that point.",
  },
];

export default function SharingExplained() {
  useSiteMeta(
    "Sharing with Stackd: who can see what",
    "How sharing works in Stackd: invitations bound to one email address, per person permissions you switch on yourself, what a follower can and cannot see, and how to change or end it.",
  );

  return (
    <PublicShell>
      <PublicPageHeader
        eyebrow="Sharing"
        title="Someone you trust, in the picture."
        lede="Sharing in Stackd is one invitation, one person and one set of switches. This page explains exactly how far it reaches, including the parts it does not."
      />

      <PublicSection
        tone="paper"
        eyebrow="How an invitation works"
        title="Four steps, and none of them share anything by accident."
      >
        <ol className="grid gap-4 sm:grid-cols-2">
          {STEPS.map((step) => (
            <li key={step.title} className="rounded-3xl bg-paper-sunk p-6" style={{ border: "1px solid #eadccf" }}>
              <span
                className="flex h-11 w-11 items-center justify-center rounded-full"
                style={{ background: "rgba(76, 103, 112, 0.10)" }}
                aria-hidden="true"
              >
                <step.icon className="h-5 w-5" style={{ color: "#3f5760" }} strokeWidth={1.8} />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl p-6" style={{ background: "rgba(156, 82, 40, 0.07)", border: "1px solid rgba(156, 82, 40, 0.18)" }}>
            <h3 className="text-[15px] font-semibold text-ink">If a link will not work</h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-muted">
              <li>Signed out? The invitation waits behind sign in, and it opens for the address it was sent to.</li>
              <li>Opened in a different account? Access only opens for the email address the invitation names.</li>
              <li>Link incomplete or expired? Ask the person who invited you to send a fresh invitation.</li>
            </ul>
          </div>
          <div className="rounded-3xl bg-paper-sunk p-6" style={{ border: "1px solid #eadccf" }}>
            <h3 className="text-[15px] font-semibold text-ink">Where to find it in the app</h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              Everything on this page lives in Settings, under Sharing: invite someone, see who is following, change what
              any one person can see, or stop sharing completely. Invitations sent by email require a connected email
              domain for your app, so delivery and resends are managed there.
            </p>
          </div>
        </div>
      </PublicSection>

      <PublicSection
        tone="field"
        eyebrow="What you control"
        title="One set of permissions per person."
        lede="Glucose and insulin can be shared on their own. Location, low notices and call permission are separate decisions, and each one starts switched off."
      >
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="mx-auto w-full max-w-[360px] lg:mx-0">
            <SharingScopes />
          </div>
          <ul className="space-y-5">
            <li>
              <h3 className="text-[15px] font-semibold text-field-ink">Changing a switch takes effect at once</h3>
              <p className="mt-1 text-sm leading-relaxed text-field-muted">
                There is nothing to wait for and nothing to confirm on their side. What they can see changes the moment
                you change it.
              </p>
            </li>
            <li>
              <h3 className="text-[15px] font-semibold text-field-ink">Pausing is not ending</h3>
              <p className="mt-1 text-sm leading-relaxed text-field-muted">
                You can pause a relationship while keeping the person on your list, or end it and invite them again
                later.
              </p>
            </li>
            <li>
              <h3 className="text-[15px] font-semibold text-field-ink">Your contact number stays yours</h3>
              <p className="mt-1 text-sm leading-relaxed text-field-muted">
                If you choose to share a phone number with one person, it is released to that person only, and never
                shown to anyone else.
              </p>
            </li>
          </ul>
        </div>
      </PublicSection>

      <PublicSection
        tone="paper"
        eyebrow="What a follower sees"
        title="A small window, not your record."
        lede="The person following you has their own read-only view. They never get your journal, your notes or a door into your account."
      >
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:gap-14">
          <div className="mx-auto w-full max-w-[340px] lg:mx-0">
            <FollowerPreview />
          </div>
          <div className="space-y-5">
            <div className="rounded-3xl bg-paper-sunk p-6" style={{ border: "1px solid #eadccf" }}>
              <h3 className="text-[15px] font-semibold text-ink">The honest limits</h3>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-muted">
                <li>Location is the last place reported while your phone had the app open. There is no background or closed app tracking.</li>
                <li>A low notice by email or text is a courtesy and can be delayed, suppressed or missed. It is not emergency monitoring.</li>
                <li>Permission to call you is exactly that. It does not place calls on its own and does not replace emergency services.</li>
                <li>Insulin activity is shared as the estimate it is, with the basal background kept separate from active rapid-acting insulin.</li>
                <li>They never see your projections, your whole glucose history, or a note you did not share.</li>
              </ul>
            </div>
            <p className="text-sm leading-relaxed text-ink-muted">
              If you received an invitation, open it from the email and sign in with that address. More on what is stored
              and who can see it is in the{" "}
              <Link to="/privacy" className="font-semibold underline decoration-[#9c5228]/40 underline-offset-4" style={{ color: "#8a4a24" }}>
                Privacy Notice
              </Link>
              .
            </p>
          </div>
        </div>
      </PublicSection>

      <PublicSection tone="field" width="narrow">
        <div className="rounded-3xl bg-paper p-7 text-center sm:p-9" style={{ border: "1px solid #eadccf" }}>
          <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Share only what helps.</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-muted">
            Create an account to set up your own day, and decide about sharing later when you know what you want to keep
            private.
          </p>
          <Link
            to="/register"
            className="mt-6 inline-flex min-h-[50px] items-center justify-center gap-2 rounded-full px-7 text-[15px] font-semibold transition-transform hover:opacity-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9c5228] focus-visible:ring-offset-2"
            style={{ background: "#9c5228", color: "#fdf9f2" }}
          >
            Create an account
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </PublicSection>
    </PublicShell>
  );
}