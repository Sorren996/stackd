import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSharingScopes, describeSharingError } from "@/lib/sharing/sharingApi";

/**
 * The sharer's own contact number.
 *
 * Saved encrypted and never shown in full once stored — only a masked form so
 * it is recognisable. Releasing it to a person is a separate, per-relationship
 * choice made in their sharing sheet.
 */
export default function ContactNumberCard({ contact, onSaved }) {
  const [countryCode, setCountryCode] = useState(contact?.country_code || "+1");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const save = async () => {
    setBusy(true);
    setMessage("");
    setIsError(false);
    try {
      // Saving stores the number against this account only. Releasing it to a
      // particular person is a separate switch on their sharing sheet.
      const data = await updateSharingScopes("", "set_contact", {
        country_code: countryCode,
        phone,
      });
      setMessage(`Saved as ${data.contact_masked}.`);
      setPhone("");
      onSaved?.();
    } catch (error) {
      setIsError(true);
      setMessage(describeSharingError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "#746959" }}>
        {contact?.on_file
          ? `On file as ${contact.masked}. Stored encrypted — never shown in full.`
          : "No number saved. Add one so the people you choose can call you."}
      </p>

      <div className="flex gap-2">
        <div className="w-20 shrink-0 space-y-1">
          <Label className="text-xs" style={{ color: "#746959" }}>
            Code
          </Label>
          <Input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} inputMode="tel" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <Label className="text-xs" style={{ color: "#746959" }}>
            Phone number
          </Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="555 010 1234"
          />
        </div>
      </div>

      <p className="text-xs" style={{ color: "#746959" }}>
        Saving alone shares nothing. Each person needs the call permission and their own switch.
      </p>

      <Button className="w-full rounded-full" disabled={busy || !phone.trim()} onClick={save}>
        {busy ? "Saving…" : contact?.on_file ? "Replace my number" : "Save my number"}
      </Button>

      {message && (
        <p className="text-xs" style={{ color: isError ? "#a2564a" : "#4f5a45" }}>
          {message}
        </p>
      )}
    </div>
  );
}