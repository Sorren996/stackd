import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link2, Mail, Sparkles } from "lucide-react";
import SectionCard from "@/components/editorial/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SharerDashboard from "@/components/follower/SharerDashboard";
import FollowerPrefsSheet from "@/components/sharing/FollowerPrefsSheet";
import SharedDataNotice from "@/pages/SharedDataNotice";
import useAccessProfile from "@/hooks/useAccessProfile";
import { sharerName } from "@/lib/sharing/sharerName";
import { describeProjectionReason } from "@/lib/sharing/sharingCopy";

/** Pull the token out of a pasted invitation link, or accept a bare code. */
function extractToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/[?&]token=([^&\s]+)/);
  if (match) return decodeURIComponent(match[1]);
  try {
    const url = new URL(raw);
    const fromUrl = url.searchParams.get("token");
    if (fromUrl) return fromUrl;
  } catch {
    // not a URL — treat the whole value as the code
  }
  return raw;
}

/**
 * The viewer's home.
 *
 * Following lives here, not inside Settings. One person opens straight into
 * their dashboard; several get a clear selector. A pending invitation goes to
 * acceptance, and an account with no relationships at all gets an honest
 * waiting state — never the patient "log your first reading" screen.
 */
export default function FollowingHome() {
  const navigate = useNavigate();
  const { following, pendingInvitations, isLoading, noticeAccepted } = useAccessProfile();
  const [selectedId, setSelectedId] = useState(null);
  const [prefsFor, setPrefsFor] = useState(null);
  const [link, setLink] = useState("");

  const openLink = () => {
    const token = extractToken(link);
    if (token) navigate(`/follow?token=${encodeURIComponent(token)}`);
  };

  const people = following.filter((r) => r.status === "active" || r.status === "paused");
  const ended = following.filter((r) => r.status === "revoked" || r.status === "expired");
  const selected = people.find((r) => r.id === selectedId) || people[0] || null;

  const linkEntry = (
    <SectionCard label="Have an invitation link?">
      <p className="pb-3 text-xs" style={{ color: "#746959" }}>
        Open the link you were sent and it carries its own code. If you cannot open it, paste the link or code here.
      </p>
      <div className="flex gap-2">
        <Input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Paste your invitation link"
          aria-label="Invitation link"
        />
        <Button className="shrink-0 rounded-full" disabled={!link.trim()} onClick={openLink}>
          <Link2 className="mr-2 h-4 w-4" />
          Open
        </Button>
      </div>
    </SectionCard>
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md space-y-4 pt-2">
        <div className="h-6 w-40 animate-pulse rounded" style={{ background: "rgba(253,249,242,0.25)" }} />
        <div className="h-44 w-full animate-pulse rounded-3xl" style={{ background: "rgba(253,249,242,0.16)" }} />
      </div>
    );
  }

  // The one notice that genuinely applies to viewing someone's shared data.
  if (people.length > 0 && !noticeAccepted) {
    return <SharedDataNotice />;
  }

  if (people.length === 0) {
    return (
      <div className="mx-auto max-w-md space-y-4 pt-2">
        <h1 className="px-1 text-lg font-semibold" style={{ color: "#fdf9f2" }}>
          Following <span className="font-serif-italic" style={{ fontWeight: 400 }}>along</span>
        </h1>

        {pendingInvitations.length > 0 ? (
          <SectionCard label="You're invited">
            <div className="flex gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#9c5228" }} />
              <p className="text-sm" style={{ color: "#746959" }}>
                {pendingInvitations
                  .map((invite) => sharerName(invite.sharer_display_name))
                  .join(", ")}{" "}
                invited you to follow along. Open the invitation link — it only works for the email address it was sent
                to, and it is the only thing that has to happen before you can see anything.
              </p>
            </div>
          </SectionCard>
        ) : (
          <SectionCard label="Nothing shared with you yet">
            <p className="text-sm" style={{ color: "#746959" }}>
              When someone invites you to follow along, you accept it from the link they send you. Only what they
              switch on is ever visible here.
            </p>
          </SectionCard>
        )}

        {linkEntry}

        {ended.length > 0 && (
          <SectionCard label="Ended">
            {ended.map((relationship) => (
              <p key={relationship.id} className="text-sm" style={{ color: "#746959" }}>
                {sharerName(relationship.sharer_display_name)} · {describeProjectionReason(relationship.status)}
              </p>
            ))}
          </SectionCard>
        )}

      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 pt-2">
      {people.length > 1 && (
        <div role="tablist" aria-label="People you follow" className="flex gap-2 overflow-x-auto px-1 pb-1">
          {people.map((relationship) => {
            const isSelected = relationship.id === selected?.id;
            return (
              <button
                key={relationship.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setSelectedId(relationship.id)}
                className="shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition"
                style={{
                  background: isSelected ? "#FDF9F2" : "rgba(253,249,242,0.16)",
                  borderColor: isSelected ? "#FDF9F2" : "rgba(253,249,242,0.35)",
                  color: isSelected ? "#3f3830" : "#fdf9f2",
                }}
              >
                {sharerName(relationship.sharer_display_name)}
              </button>
            );
          })}
        </div>
      )}

      {selected && <SharerDashboard relationship={selected} onOpenPrefs={setPrefsFor} />}

      {ended.length > 0 && (
        <SectionCard label="Ended">
          {ended.map((relationship) => (
            <p key={relationship.id} className="text-sm" style={{ color: "#746959" }}>
              {sharerName(relationship.sharer_display_name)} · {describeProjectionReason(relationship.status)}
            </p>
          ))}
        </SectionCard>
      )}

      <SectionCard>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0" style={{ color: "#9c5228" }} />
          <p className="min-w-0 flex-1 text-xs" style={{ color: "#746959" }}>
            You can change what reaches you, or stop following, at any time in your settings.
          </p>
          <Button variant="outline" className="shrink-0 rounded-full" onClick={() => navigate("/following/settings")}>
            Settings
          </Button>
        </div>
      </SectionCard>

      <FollowerPrefsSheet
        relationship={prefsFor}
        open={Boolean(prefsFor)}
        onClose={() => setPrefsFor(null)}
      />
    </div>
  );
}