import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HeartHandshake, Users } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import SectionCard from "@/components/editorial/SectionCard";
import { Button } from "@/components/ui/button";
import { redeemSharingInvitation, describeSharingError } from "@/lib/sharing/sharingApi";

/**
 * Accept a sharing invitation.
 *
 * Redemption needs a signed-in account whose verified email matches the one the
 * invitation was sent to, so signed-out visitors are sent to sign in first with
 * the link carried through as the return destination. Nothing is shared by
 * accepting — it only binds the follow relationship.
 */
export default function FollowInvite() {
  const navigate = useNavigate();
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
      setAccepted(data.relationship);
    } catch (err) {
      setError(describeSharingError(err));
    } finally {
      setBusy(false);
    }
  };

  const shell = (children) => (
    <div className="mx-auto max-w-md px-4 pb-24 pt-8">{children}</div>
  );

  if (!token) {
    return shell(
      <SectionCard label="Invitation">
        <p className="text-sm" style={{ color: "#746959" }}>
          This link is incomplete. Ask the person who invited you to send it again.
        </p>
      </SectionCard>
    );
  }

  if (accepted) {
    return shell(
      <SectionCard label="You're following">
        <div className="flex items-center gap-3 pb-3">
          <HeartHandshake className="h-5 w-5" style={{ color: "#5b6550" }} />
          <p className="text-base font-semibold" style={{ color: "#3f3830" }}>
            {accepted.sharer_display_name || "They are on your list"}
          </p>
        </div>
        <p className="pb-4 text-sm" style={{ color: "#746959" }}>
          Nothing is being shared yet. They choose what to share and can change or withdraw it at any time. You can
          only ever see what they have switched on.
        </p>
        <Button className="w-full rounded-full" onClick={() => navigate("/shared")}>
          <Users className="mr-2 h-4 w-4" />
          Go to people you follow
        </Button>
      </SectionCard>
    );
  }

  if (!isAuthenticated) {
    return shell(
      <SectionCard label="You're invited">
        <p className="pb-4 text-sm" style={{ color: "#746959" }}>
          Someone would like you to follow their Stackd updates. Sign in or create an account with the email address
          the invitation was sent to, and the invitation will be waiting here.
        </p>
        <div className="space-y-2">
          <Button asChild className="w-full rounded-full">
            <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>Sign in</Link>
          </Button>
          <Button asChild variant="outline" className="w-full rounded-full">
            <Link to={`/register?returnTo=${encodeURIComponent(returnTo)}`}>Create an account</Link>
          </Button>
        </div>
        <p className="pt-3 text-xs" style={{ color: "#746959" }}>
          The invitation only works for the address it was sent to.
        </p>
      </SectionCard>
    );
  }

  return shell(
    <SectionCard label="Invitation">
      <p className="pb-4 text-sm" style={{ color: "#746959" }}>
        Accepting adds this person to your list. It shares nothing by itself — they decide what you can see, and they
        can withdraw it at any time.
      </p>
      {error && (
        <p className="pb-3 text-sm" style={{ color: "#a2564a" }}>
          {error}
        </p>
      )}
      <Button className="w-full rounded-full" disabled={busy} onClick={accept}>
        {busy ? "Accepting…" : "Accept invitation"}
      </Button>
    </SectionCard>
  );
}