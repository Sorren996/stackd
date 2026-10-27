import { Link } from "react-router-dom";
import { ArrowRight, KeyRound, MailCheck, Smartphone, LifeBuoy, Trash2 } from "lucide-react";
import PublicShell from "@/components/public/PublicShell";
import PublicPageHeader from "@/components/public/PublicPageHeader";
import PublicSection from "@/components/public/PublicSection";
import useSiteMeta from "@/hooks/useSiteMeta";

const HELP = [
  {
    icon: KeyRound,
    title: "I cannot sign in",
    body: "Use Forgot password to set a new one. If you originally signed up with Apple or Google, use that same button on the sign in screen instead of a password. Check you are using the address you registered with.",
    action: { label: "Reset your password", to: "/forgot-password" },
  },
  {
    icon: MailCheck,
    title: "My invitation will not open",
    body: "Invitations are tied to the email address they were sent to, so sign in with that address. If the link is incomplete or has expired, ask the person who invited you to send a new one from their sharing screen.",
    action: { label: "How sharing works", to: "/sharing" },
  },
  {
    icon: Smartphone,
    title: "Installing is not working",
    body: "Installation is per browser. iPhone and iPad need Safari for the full app experience, Android and desktop browsers have their own install menu. All the steps are on the install page.",
    action: { label: "Install instructions", to: "/install" },
  },
  {
    icon: LifeBuoy,
    title: "Something looks wrong in the app",
    body: "Signed-in accounts have a support request screen under Settings, which records what you saw and, if you agree, a little diagnostic detail such as connection status. That is the fastest way to get it looked at.",
  },
  {
    icon: Trash2,
    title: "I want my data removed",
    body: "Account and data deletion is available from Settings while signed in. The Privacy Notice explains what is stored and how long it is kept.",
    action: { label: "Privacy Notice", to: "/privacy" },
  },
];

/**
 * Public help. Everything on this page works before signing in, and nothing
 * here pretends to be a support channel that does not exist yet.
 */
export default function PublicContactPage() {
  useSiteMeta(
    "Stackd support and self help",
    "Help before you sign in: password reset, invitation problems, installing Stackd, reporting a problem and removing your data.",
  );

  return (
    <PublicShell>
      <PublicPageHeader
        eyebrow="Contact and self help"
        title="Help, before you sign in."
        lede="Most questions people have about Stackd are answered below, without an account and without waiting."
      />

      <PublicSection tone="field" width="narrow" className="!pt-0">
        <div className="space-y-4">
          {HELP.map((item) => (
            <div key={item.title} className="rounded-3xl bg-paper p-6" style={{ border: "1px solid #eadccf" }}>
              <div className="flex items-start gap-4">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "rgba(76, 103, 112, 0.10)" }}
                  aria-hidden="true"
                >
                  <item.icon className="h-5 w-5" style={{ color: "#3f5760" }} strokeWidth={1.8} />
                </span>
                <div>
                  <h2 className="text-[15px] font-semibold text-ink">{item.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{item.body}</p>
                  {item.action && (
                    <Link
                      to={item.action.to}
                      className="mt-3 inline-flex min-h-[36px] items-center gap-2 text-sm font-semibold underline decoration-[#9c5228]/40 underline-offset-4"
                      style={{ color: "#8a4a24" }}
                    >
                      {item.action.label}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-3xl bg-paper-sunk p-6" style={{ border: "1px solid #eadccf" }}>
          <h2 className="text-[15px] font-semibold text-ink">Reaching a person</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Support for Stackd currently starts inside the app: sign in and open Settings, then Contact and Support, to
            send a request and follow its progress. There is no public phone line, mailbox or web form attached to this
            page, so this page does not collect messages or store anything you write here.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            If you cannot get into your account at all, the password reset and invitation steps above are the way back
            in. If none of them work, ask the person who invited you to raise it with us on your behalf.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/login"
              className="inline-flex min-h-[44px] items-center justify-center rounded-full px-5 text-sm font-semibold transition-transform hover:opacity-95 active:scale-[0.98]"
              style={{ background: "#3f3830", color: "#fdf9f2" }}
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[#d8cec2] px-5 text-sm font-semibold text-ink transition-colors hover:bg-black/[0.03]"
            >
              Create an account
            </Link>
          </div>
        </div>
      </PublicSection>
    </PublicShell>
  );
}