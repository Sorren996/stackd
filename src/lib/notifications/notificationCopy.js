// Wording for the notifications screen, kept in one place so the same category
// is always described the same way. Descriptive only — nothing here advises on
// care, and nothing promises delivery.

export const CATEGORY_COPY = [
  { key: 'low_glucose', label: 'Low glucose', description: 'Every new reading below 70 mg/dL' },
  { key: 'custom_low', label: 'Custom low', description: 'Every new reading below your selected notification level.' },
  { key: 'below_range', label: 'Below target range', description: 'Every new reading below the lower end of their target range.' },
  { key: 'custom_high', label: 'Custom high', description: 'At or above your selected notification level.' },
  { key: 'above_range', label: 'Above target range', description: 'Sustained above the upper end of their target range.' },
  { key: 'falling_fast', label: 'Falling fast', description: 'A measured downward pace, with an optional level condition.' },
  { key: 'rising_fast', label: 'Rising fast', description: 'A measured upward pace, with an optional level condition.' },
  { key: 'urgent_low', label: 'Urgent low', description: 'Below the existing urgent boundary, separate from your other choices.' },
  { key: 'missing_readings', label: 'Missing readings', description: 'When readings stop arriving from your sensor.' },
];

// How a delivered notice is named in the recent list. The six rows are what a
// person chose, so a low is a low and a high is a high — the older per-category
// names are only what was stored.
export const CATEGORY_LABEL = {
  custom_low: 'Low', low_glucose: 'Low', below_range: 'Low',
  custom_high: 'High', above_range: 'High',
  low: 'Low', high: 'High',
  falling_fast: 'Falling fast', rising_fast: 'Rising fast',
  changing_fast: 'Changing fast',
  urgent_low: "Urgent low",
  missing_readings: "Readings haven't updated",
  sensor_problems: "Sensor problems",
  all_readings: 'Every reading',
  low_recovery: 'Back in range',
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

/**
 * How a follower's reachability reads to the person sharing with them. A sharer
 * must never believe alerts are arriving when no device has received one.
 */
export const REACHABILITY_COPY = {
  reachable: null,
  no_device: "Not reachable yet, they have not opened Stackd on a device.",
  not_member: "Not reachable — this account is no longer active.",
  unknown: null,
};

export const PREVIEW_PRIVACY_HINT =
  "Previews stay generic unless you turn this on, so a locked phone never shows a reading on its own.";

export const SUPPLEMENT_NOTE =
  "Notifications are supplemental. They may be delayed, held back or not delivered, and they are not a replacement for the primary alarms on the person's own device.";

export const PERMISSION_NOTE = "Manage iPhone notification permission in Settings.";