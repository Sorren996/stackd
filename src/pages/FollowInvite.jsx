import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { HeartHandshake, Users } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { redeemSharingInvitation, describeSharingError } from "@/lib/sharing/sharingApi";
import useSiteMeta from "@/hooks/useSiteMeta";

const LOGO_URL =
  "https://media.base44.com/images/public/6a1b93f234a8611ee1595134/9cd3c84cf_stackdappiconver3tran.png";

/**
 * Accept a sharing invitation.
 *
 * Redemption needs a signed-in account whose verified email matches the one the
 * invitation was sent to, so signed-out visitors are sent to sign in first with
 * the link carried through as the return destination. Nothing is shared by
 * accepting nothing is shared: it only binds the follow relationship.
 *
 * Presented in the same shell as the rest of the public and account screens, so
 * an invitation that arrives in an inbox looks like it came from the same place
 * as everything else.
 */
export default function FollowInvite() {
  useSiteMeta("Stackd invitation", "Accept a Stackd sharing invitation.");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(null);

  const token = new URLSearchParams(window.location.search).get("token") || "";
  const returnTo = `/follow?token=${encodeURIComponent(token)}`;

  const accept = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await redeemSharingInvitation(token);
      // The relationship exists now, so refresh what this account is allowed to
      // see and the app routes straight to the dashboard it just unlocked.
      await queryClient.invalidateQueries({ queryKey: ["access-profile"] });
      setAccepted(data.relationship);
    } catch (err) {
      setError(describeSharingError(err));
    } finally {
      setBusy(false);
    }
  };

  const card = (eyebrow, title, body) => (
    <div className="min-h-screen bg-field px-4 py-12 text-field-ink sm:py-20">
      <div className="mx-auto w-full max-w-md">
        <Link to="/" className="mx-auto flex w-fit items-center gap-2 rounded-full px-2 py-1" aria-label="Stackd home">
          <img src={LOGO_URL} alt="" width="30" height="30" decoding="async" className="h-[30px] w-[30px] rounded-[9px] object-contain" />
          <span className="text-[17px] font-bold tracking-tight">Stackd</span>
        </Link>
        <div
          className="mt-6 rounded-3xl bg-paper p-6 sm:p-8"
          style={{ boxShadow: "0 2px 4px rgba(24, 35, 39, 0.2), 0 24px 60px rgba(24, 35, 39, 0.28)" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">{eyebrow}</p>
          <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
          <div className="mt-4 space-y-4">{body}</div>
        </div>
      </div>
    </div>
  );

  if (!token) {
    return card(
      "Invitation",
      "This link is incomplete",
      <p className="text-sm leading-relaxed text-ink-muted">
        Ask the person who invited you to send it again from their sharing screen. Invitations are tied to the email
        address they were sent to, so the new one needs to go to the same address.
      </p>,
    );
  }

  if (accepted) {
    return card(
      "You are following",
      accepted.sharer_display_name || "They are on your list",
      <>
        <div className="flex items-center gap-3">
          <HeartHandshake className="h-5 w-5" style={{ color: "#4d5742" }} aria-hidden="true" />
          <p className="text-sm font-semibold text-ink">The invitation is accepted.</p>
        </div>
        <p className="text-sm leading-relaxed text-ink-muted">
          Nothing is being shared yet. They choose what to share and can change or withdraw it at any time. You can only
          ever see what they have switched on.
        </p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition-transform hover:opacity-95 active:scale-[0.98]"
          style={{ background: "#9c5228", color: "#fdf9f2" }}
        >
          <Users className="h-4 w-4" aria-hidden="true" />
          See what they share
        </button>
      </>,
    );
  }

  if (!isAuthenticated) {
    return card(
      "You are invited",
      "Sign in to accept",
      <>
        <p className="text-sm leading-relaxed text-ink-muted">
          Someone would like you to follow their Stackd updates. Sign in, or create an account, with the email address
          the invitation was sent to. The invitation will be waiting here when you come back.
        </p>
        <div className="space-y-2">
          <Link
            to={`/login?returnTo=${encodeURIComponent(returnTo)}`}
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full px-6 text-sm font-semibold transition-transform hover:opacity-95 active:scale-[0.98]"
            style={{ background: "#9c5228", color: "#fdf9f2" }}
          >
            Sign in
          </Link>
          <Link
            to={`/register?returnTo=${encodeURIComponent(returnTo)}`}
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full border border-[#d8cec2] px-6 text-sm font-semibold text-ink transition-colors hover:bg-black/[0.03]"
          >
            Create an account
          </Link>
        </div>
        <p className="text-xs leading-relaxed text-ink-muted">
          The invitation only works for the address it was sent to. If it has expired or the link is incomplete, ask for
          a new one.
        </p>
      </>,
    );
  }

  return card(
    "Invitation",
    "Accept this invitation",
    <>
      <p className="text-sm leading-relaxed text-ink-muted">
        Accepting adds this person to your list. It shares nothing by itself: they decide what you can see, and they can
        withdraw it at any time.
      </p>
      {error && (
        <p className="rounded-2xl p-3 text-sm leading-relaxed" style={{ background: "rgba(156, 63, 46, 0.08)", color: "#9c3f2e" }}>
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={accept}
        disabled={busy}
        className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full px-6 text-sm font-semibold transition-transform hover:opacity-95 active:scale-[0.98] disabled:opacity-70"
        style={{ background: "#9c5228", color: "#fdf9f2" }}
      >
        {busy ? "Accepting" : "Accept invitation"}
      </button>
    </>,
  );
}