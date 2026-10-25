import { useState } from "react";
import { HeartHandshake, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { NOTICE_VERSION } from "@/lib/access/profileApi";

/**
 * The one notice a viewer genuinely needs.
 *
 * It is about the account and the shared data only — nothing about insulin,
 * plans or sensors, because a viewer is not managing their own treatment here.
 * Accepting is recorded as their own act, never on their behalf, and it is
 * separate from the patient medical acknowledgments, which stay untouched.
 */
export default function SharedDataNotice() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const accept = async () => {
    setBusy(true);
    setError("");
    try {
      await base44.entities.FollowerNotice.create({
        notice_version: NOTICE_VERSION,
        accepted_at: new Date().toISOString(),
      });
      await queryClient.invalidateQueries({ queryKey: ["access-profile"] });
    } catch {
      setError("That did not save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4 pt-2">
      <div className="flex items-center gap-2 px-1">
        <HeartHandshake className="h-5 w-5 shrink-0" style={{ color: "#fdf9f2" }} />
        <h1 className="text-lg font-semibold" style={{ color: "#fdf9f2" }}>
          Before you <span className="font-serif-italic" style={{ fontWeight: 400 }}>look in</span>
        </h1>
      </div>

      <div className="rounded-3xl border p-5" style={{ background: "#FDF9F2", borderColor: "#eadccf" }}>
        <ul className="space-y-3 text-sm" style={{ color: "#3f3830" }}>
          <li>
            Someone has invited you to follow along. You will only ever see what they have switched on, and they can
            change or withdraw it at any time.
          </li>
          <li>
            Their information stays theirs. Please keep what you see here between the two of you.
          </li>
          <li>
            This is not medical advice, and it is not an emergency service. For anything urgent, contact emergency
            services.
          </li>
        </ul>

        {error && (
          <p className="pt-4 text-sm" style={{ color: "#a2564a" }}>
            {error}
          </p>
        )}

        <Button className="mt-5 w-full rounded-full" disabled={busy} onClick={accept}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "I understand"}
        </Button>
      </div>
    </div>
  );
}