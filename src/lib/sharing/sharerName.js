// How a followed person is named.
//
// Only what the sharer configured (or their own account name) is ever shown. A
// missing or placeholder value reads "Shared profile" — never the viewer's own
// name, and never an invented identity.

const PLACEHOLDERS = [
  "no user",
  "unknown",
  "unnamed",
  "null",
  "undefined",
  "n/a",
  "na",
  "your contact",
  "someone",
  "-",
];

export function sharerName(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "Shared profile";
  if (PLACEHOLDERS.includes(raw.toLowerCase())) return "Shared profile";
  return raw;
}