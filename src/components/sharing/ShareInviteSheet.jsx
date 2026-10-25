import { useState } from "react";
import { Copy, Check, Send } from "lucide-react";
import Sheet from "@/components/Sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSharingInvitation, describeSharingError } from "@/lib/sharing/sharingApi";

/**
 * Invite someone to follow along.
 *
 * When the app cannot email the invitation (a person who is not yet an app user
 * needs a verified custom domain), the link is shown here so it can be passed on
 * personally — the invitation is never reported as sent when it was not.
 */
export default function ShareInviteSheet({ open, onClose, onInvited, displayName }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setEmail("");
    setError("");
    setResult(null);
    setCopied(false);
  };

  const close = () => {
    reset();
    onClose?.();
  };

  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const data = await createSharingInvitation(email, displayName);
      setResult(data);
      onInvited?.();
    } catch (err) {
      setError(describeSharingError(err));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(result.invite_link);
      setCopied(true);
    } catch {
      setError("Copy the link below to share it.");
    }
  };

  return (
    <Sheet open={open} onClose={close}>
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        <h2 className="pb-1 text-lg font-semibold" style={{ color: "#3f3830" }}>
          Invite someone
        </h2>
        <p className="pb-5 text-sm" style={{ color: "#746959" }}>
          They choose whether to accept. Nothing is shared until you switch it on for them.
        </p>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-2xl border p-4" style={{ borderColor: "#eadccf", background: "#fff" }}>
              <p className="text-sm font-medium" style={{ color: "#3f3830" }}>
                {result.delivery_status === "sent" ? "Invitation sent" : "Invitation ready"}
              </p>
              <p className="pt-1 text-xs" style={{ color: "#746959" }}>
                {result.delivery_status === "sent"
                  ? `An email with a personal link is on its way to ${result.relationship.invited_email}.`
                  : result.delivery_detail}
              </p>
            </div>

            {result.invite_link && (
              <div className="space-y-2">
                <Label className="text-xs" style={{ color: "#746959" }}>
                  Personal link
                </Label>
                <p className="break-all rounded-xl border p-3 text-xs" style={{ borderColor: "#eadccf", background: "#fff", color: "#3f3830" }}>
                  {result.invite_link}
                </p>
                <Button variant="outline" className="w-full rounded-full" onClick={copyLink}>
                  {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
                <p className="text-xs" style={{ color: "#746959" }}>
                  The link only works for {result.relationship.invited_email} and expires in 48 hours.
                </p>
              </div>
            )}

            <Button className="w-full rounded-full" onClick={close}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email" className="text-xs" style={{ color: "#746959" }}>
                Their email address
              </Label>
              <Input
                id="invite-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-sm" style={{ color: "#a2564a" }}>
                {error}
              </p>
            )}

            <Button className="w-full rounded-full" disabled={busy || !email.trim()} onClick={send}>
              <Send className="mr-2 h-4 w-4" />
              {busy ? "Sending…" : "Send invitation"}
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}