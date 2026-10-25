import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import SettingsSubPage from "@/components/settings/SettingsSubPage";
import SectionCard from "@/components/editorial/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import FollowedPersonCard from "@/components/sharing/FollowedPersonCard";
import FollowerPrefsSheet from "@/components/sharing/FollowerPrefsSheet";
import { getSharedWithMe } from "@/lib/sharing/sharingApi";

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

/** The follower's home: the people they follow, and their notice settings. */
export default function SharedWithMe() {
  const navigate = useNavigate();
  const [link, setLink] = useState("");
  const [prefsFor, setPrefsFor] = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["shared-with-me"],
    queryFn: getSharedWithMe,
  });

  const relationships = data?.relationships || [];

  const openLink = () => {
    const token = extractToken(link);
    if (token) navigate(`/follow?token=${encodeURIComponent(token)}`);
  };

  return (
    <SettingsSubPage title="People" italicWord="you follow">
      {isLoading ? (
        <SectionCard>
          <div className="h-4 w-40 animate-pulse rounded" style={{ background: "rgba(116,105,89,0.12)" }} />
        </SectionCard>
      ) : relationships.length === 0 ? (
        <SectionCard label="Nothing yet">
          <p className="text-sm" style={{ color: "#746959" }}>
            When someone invites you to follow along, you accept it from the link they send. Only what they switch on
            is ever visible here.
          </p>
        </SectionCard>
      ) : (
        relationships.map((relationship) => (
          <FollowedPersonCard key={relationship.id} relationship={relationship} onOpenPrefs={setPrefsFor} />
        ))
      )}

      <SectionCard label="Have an invitation link?">
        <p className="pb-3 text-xs" style={{ color: "#746959" }}>
          Paste the link or code you were sent. The link only works for the email address it was sent to.
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

      <FollowerPrefsSheet
        relationship={prefsFor}
        open={Boolean(prefsFor)}
        onClose={() => setPrefsFor(null)}
        onChanged={refetch}
      />
    </SettingsSubPage>
  );
}