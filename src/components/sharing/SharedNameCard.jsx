import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setSharerDisplayName, describeSharingError } from "@/lib/sharing/sharingApi";

const PLACEHOLDERS = ["no user", "unknown", "your contact", "someone"];

/** The name as stored, or "" when it is really a fallback rather than a name. */
function realName(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || PLACEHOLDERS.includes(raw.toLowerCase())) return "";
  return raw;
}

/**
 * The name your followers see.
 *
 * Correcting it changes a label on your own relationships and nothing else — it
 * cannot change what anyone is allowed to see.
 */
export default function SharedNameCard({ currentName, onSaved }) {
  const [value, setValue] = useState(() => realName(currentName));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await setSharerDisplayName(value.trim());
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError(describeSharingError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Label className="text-xs" style={{ color: "#746959" }}>
        The name your followers see
      </Label>
      <div className="flex gap-2 pt-2">
        <Input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          placeholder="e.g. Alex"
          aria-label="The name your followers see"
          maxLength={60}
        />
        <Button className="shrink-0 rounded-full" disabled={busy || !value.trim()} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
      <p className="pt-2 text-xs" style={{ color: "#746959" }}>
        {error
          ? error
          : saved
            ? "Saved. Everyone who follows you now sees this name."
            : "Leave it as it is if you would rather not be named — your followers then see “Shared profile”."}
      </p>
    </div>
  );
}