// Wording for the notifications screen, kept in one place so the same category
// is always described the same way. Descriptive only — nothing here advises on
// care, and nothing promises delivery.

export const CATEGORY_COPY = [
  {
    key: "urgent_low",
    label: "Urgent low",
    description: "When a reading is below your urgent level.",
  },
  {
    key: "below_range",
    label: "Below comfort zone",
    description: "When a reading is below the range you set.",
  },
  {
    key: "above_range",
    label: "Above comfort zone",
    description: "When readings stay above your range for a while.",
  },
  {
    key: "missing_readings",
    label: "Readings haven't updated",
    description: "When readings stop arriving from your sensor.",
  },
];

export const CATEGORY_LABEL = {
  urgent_low: "Urgent low",
  below_range: "Below comfort zone",
  above_range: "Above comfort zone",
  missing_readings: "Readings haven't updated",
};

export const ABOVE_DURATION_OPTIONS = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hr" },
];

export const MISSING_DELAY_OPTIONS = [
  { value: 15, label: "15 min" },
  { value: 20, label: "20 min" },
  { value: 30, label: "30 min" },
];

export const STATUS_COPY = {
  submitted: "Submitted",
  skipped: "Not sent",
  failed: "Not sent",
  unknown: "Unconfirmed",
  claimed: "Pending",
};

export const PREVIEW_PRIVACY_HINT =
  "Previews stay generic unless you turn this on, so a locked phone never shows a reading on its own.";

export const SUPPLEMENT_NOTE =
  "Notifications are supplemental. They may be delayed, held back or not delivered, and they are not a replacement for the primary alarms on the person's own device.";

export const PERMISSION_NOTE = "Manage iPhone notification permission in Settings.";