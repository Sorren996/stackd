import { useEffect, useState } from "react";
import Sheet from "@/components/Sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { describeAlertState } from "@/lib/sharing/sharingCopy";
import { setFollowerPrefs, describeSharingError } from "@/lib/sharing/sharingApi";

/**
 * The follower's own notification choices.
 *
 * A follower can narrow what reaches them but can never widen what the sharer
 * granted — the owner's switches stay the outer gate.
 */
export default function FollowerPrefsSheet({ relationship, open, onClose, onChanged }) {
  const [prefs, setPrefs] = useState(relationship?.follower_prefs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPrefs(relationship?.follower_prefs);
    setError("");
  }, [relationship]);

  if (!relationship || !prefs) return null;

  const emailState = describeAlertState(relationship, "urgent_low_email");
  const smsState = describeAlertState(relationship, "urgent_low_sms");

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await setFollowerPrefs(relationship.id, prefs);
      onChanged?.();
      onClose?.();
    } catch (err) {
      setError(describeSharingError(err));
    } finally {
      setBusy(false);
    }
  };

  const numberField = (key) => (
    <Input
      className="w-16"
      inputMode="numeric"
      value={prefs[key]}
      onChange={(e) => {
        const next = Number(e.target.value.replace(/[^0-9]/g, ""));
        setPrefs({ ...prefs, [key]: Number.isFinite(next) ? next : prefs[key] });
      }}
    />
  );

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        <h2 className="pb-1 text-lg font-semibold" style={{ color: "#3f3830" }}>
          Your notices
        </h2>
        <p className="pb-5 text-sm" style={{ color: "#746959" }}>
          These can only narrow what reaches you. What {relationship.sharer_display_name} shares stays their choice.
        </p>

        <div className="divide-y" style={{ borderColor: "#eadccf" }}>
          <div className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium" style={{ color: "#3f3830" }}>
                Email notices
              </p>
              <p className="text-xs" style={{ color: "#746959" }}>
                {emailState.state === "off" ? "Not switched on for you." : "Sent for a fresh urgent low reading."}
              </p>
            </div>
            <Switch
              checked={Boolean(prefs.notify_email)}
              onCheckedChange={(value) => setPrefs({ ...prefs, notify_email: value })}
            />
          </div>

          <div className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium" style={{ color: "#3f3830" }}>
                Text notices
              </p>
              <p className="text-xs" style={{ color: "#746959" }}>
                Not available: this app has no text-message provider connected.
              </p>
            </div>
            <Switch
              checked={Boolean(prefs.notify_sms)}
              disabled
              onCheckedChange={(value) => setPrefs({ ...prefs, notify_sms: value })}
            />
          </div>
        </div>

        <div className="space-y-2 pt-5">
          <Label className="text-xs" style={{ color: "#746959" }}>
            Quiet hours (their local time) — an urgent low is always sent
          </Label>
          <div className="flex items-center gap-2">
            {numberField("quiet_hours_start")}
            <span className="text-sm" style={{ color: "#746959" }}>
              to
            </span>
            {numberField("quiet_hours_end")}
          </div>
        </div>

        {error && (
          <p className="pt-3 text-sm" style={{ color: "#a2564a" }}>
            {error}
          </p>
        )}

        <Button className="mt-6 w-full rounded-full" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </Sheet>
  );
}