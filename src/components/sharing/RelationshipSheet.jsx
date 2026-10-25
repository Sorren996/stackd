import { useEffect, useRef, useState } from "react";
import Sheet from "@/components/Sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  SCOPE_COPY,
  ALERT_COPY,
  describeAlertState,
  describeProjectionReason,
} from "@/lib/sharing/sharingCopy";
import { updateSharingScopes, describeSharingError } from "@/lib/sharing/sharingApi";
import { createSubmissionGate } from "@/lib/sharing/pendingAction";

/**
 * Manage one relationship.
 *
 * Every change goes through the same guarded backend action, which bumps the
 * relationship's permission version so the follower's screen clears anything
 * that is no longer shared.
 */
export default function RelationshipSheet({ relationship, open, onClose, onChanged, onRevoked }) {
  const [local, setLocal] = useState(relationship);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  // One submission at a time: a second tap while a change is in flight is
  // ignored rather than queued, so a slow connection can never apply it twice.
  const gateRef = useRef(null);
  if (!gateRef.current) gateRef.current = createSubmissionGate();

  // Which relationship the sheet is showing. A reply that arrives after the
  // sheet has moved on to someone else is discarded instead of painting the
  // wrong person's state into it.
  const activeIdRef = useRef(relationship?.id || null);

  useEffect(() => {
    setLocal(relationship);
    setError("");
    activeIdRef.current = relationship?.id || null;
  }, [relationship]);

  if (!local) return null;

  const scopes = local.scopes || {};
  const alerts = local.alert_scopes || {};
  const terminal = local.status === "revoked";

  const apply = async (action, extra) => {
    if (!gateRef.current.enter()) return; // a second tap while one is in flight
    setBusy(true);
    setPendingAction(action);
    setError("");
    const idAtSubmit = local.id;
    try {
      const data = await updateSharingScopes(local.id, action, extra);
      // Nothing is reported as done until the server has confirmed it.
      if (activeIdRef.current !== idAtSubmit) return;
      setLocal(data.relationship);
      if (action === "revoke") {
        // Withdrawn for good: the sheet closes and the list shows the state.
        onRevoked?.();
      } else if (data.alerts_cleared) {
        setError("Notices were switched off because glucose sharing is now off.");
      }
      onChanged?.();
    } catch (err) {
      // A failed or stalled request always comes back: the reason is shown and
      // every switch stays usable, so nothing has to be reloaded to recover.
      if (activeIdRef.current === idAtSubmit) setError(describeSharingError(err));
    } finally {
      gateRef.current.exit();
      setBusy(false);
      setPendingAction("");
    }
  };

  // Closing the sheet must never leave a confirmation stranded over it.
  const closeSheet = () => {
    setConfirmRevoke(false);
    onClose?.();
  };

  const toggleScope = (key, value) => apply("set_scopes", { scopes: { ...scopes, [key]: value } });
  const toggleAlert = (key, value) => apply("set_alerts", { alert_scopes: { ...alerts, [key]: value } });

  return (
    <>
      <Sheet open={open} onClose={closeSheet}>
        <div className="flex-1 overflow-y-auto px-6 pb-8">
          <h2 className="break-all text-lg font-semibold" style={{ color: "#3f3830" }}>
            {local.invited_email}
          </h2>
          <p className="pt-1 text-xs" style={{ color: "#746959" }}>
            {local.status === "pending"
              ? "Waiting for them to accept the invitation."
              : describeProjectionReason(local.status)}
          </p>

          <div className="pt-5">
            <p className="section-label pb-1">What they can see</p>
            <div className="divide-y" style={{ borderColor: "#eadccf" }}>
              {SCOPE_COPY.map((scope) => (
                <div key={scope.key} className="flex items-start gap-3 py-3" style={{ borderColor: "#eadccf" }}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium" style={{ color: "#3f3830" }}>
                      {scope.label}
                    </p>
                    <p className="text-xs" style={{ color: "#746959" }}>
                      {scope.blurb}
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(scopes[scope.key])}
                    disabled={busy || terminal}
                    onCheckedChange={(value) => toggleScope(scope.key, value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="pt-6">
            <p className="section-label pb-1">Notices</p>
            <div className="divide-y" style={{ borderColor: "#eadccf" }}>
              {ALERT_COPY.map((alert) => {
                const state = describeAlertState(local, alert.key);
                return (
                  <div key={alert.key} className="flex items-start gap-3 py-3" style={{ borderColor: "#eadccf" }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium" style={{ color: "#3f3830" }}>
                        {alert.label}
                      </p>
                      <p className="text-xs" style={{ color: "#746959" }}>
                        {alert.blurb}
                      </p>
                      {state.state === "armed" && (
                        <p className="pt-0.5 text-xs" style={{ color: "#8a6326" }}>
                          {state.label}
                        </p>
                      )}
                    </div>
                    <Switch
                      checked={Boolean(alerts[alert.key])}
                      disabled={busy || terminal || alert.key === "urgent_low_sms"}
                      onCheckedChange={(value) => toggleAlert(alert.key, value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-6">
            <p className="section-label pb-1">Your contact number</p>
            <div className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: "#3f3830" }}>
                  {local.contact_shared ? "Released to them" : "Not released"}
                </p>
                <p className="text-xs" style={{ color: "#746959" }}>
                  Only works while the call permission is on. Save your number on the Sharing page first.
                </p>
              </div>
              <Switch
                checked={Boolean(local.contact_shared)}
                disabled={busy || terminal || !scopes.urgent_low_call}
                onCheckedChange={(value) => apply("set_contact", { release: value })}
              />
            </div>
          </div>

          {error && (
            <p className="pt-4 text-sm" style={{ color: "#a2564a" }}>
              {error}
            </p>
          )}

          <div className="space-y-2 pt-6">
            {local.status === "active" && (
              <Button variant="outline" className="w-full rounded-full" disabled={busy} onClick={() => apply("pause")}>
                {pendingAction === "pause" ? "Pausing…" : "Pause sharing"}
              </Button>
            )}
            {local.status === "paused" && (
              <Button variant="outline" className="w-full rounded-full" disabled={busy} onClick={() => apply("resume")}>
                {pendingAction === "resume" ? "Resuming…" : "Resume sharing"}
              </Button>
            )}
            {!terminal && (
              <Button
                variant="ghost"
                className="w-full rounded-full"
                style={{ color: "#a2564a" }}
                disabled={busy}
                onClick={() => setConfirmRevoke(true)}
              >
                {pendingAction === "revoke" ? "Withdrawing…" : "Revoke sharing"}
              </Button>
            )}
          </div>
        </div>
      </Sheet>

      {/* Radix's alert dialog is always modal: while it is open it disables
          pointer events on everything else. That is fine for a confirmation —
          but only as long as the confirmation is actually ON TOP. Its own layer
          is z-50 and the sheet's is z-[70], so untargeted it opened *behind* the
          sheet: the page went inert with nothing visible, which is the freeze.
          The content is therefore layered above the sheet explicitly, and it is
          closed whenever the sheet closes so it can never be left stranded. */}
      <AlertDialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <AlertDialogContent style={{ zIndex: 95 }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke sharing?</AlertDialogTitle>
            <AlertDialogDescription>
              They will lose access straight away and everything currently shared is switched off. This cannot be
              undone — you would send a new invitation to share again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep sharing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmRevoke(false);
                apply("revoke");
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}