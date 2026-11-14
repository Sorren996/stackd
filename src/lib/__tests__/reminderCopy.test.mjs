import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ROWS,
  REMINDER_NOTES,
  daysLabel,
  mealDelayLabel,
  minutesToTimeValue,
  reminderCountLabel,
  reminderPayloadFrom,
  reminderTimingLine,
  timeValueToMinutes,
} from "../../lib/reminders/reminderCopy.js";

test("the timing line under a row matches the example wording", () => {
  assert.equal(reminderTimingLine(DEFAULT_ROWS.basal), "Daily at 9:00 PM");
  assert.equal(reminderTimingLine(DEFAULT_ROWS.meal), "2 hours after you log a meal");
  assert.equal(reminderTimingLine(DEFAULT_ROWS.custom), "Mon, Wed, Fri at 8:00 AM");
  assert.equal(daysLabel([0, 2, 4]), "Sun, Tue, Thu");
  assert.equal(mealDelayLabel(180), "3 hours after you log a meal");
});

test("the value on the notifications row is the count, or Off", () => {
  assert.equal(reminderCountLabel([]), "Off");
  assert.equal(reminderCountLabel([{ enabled: true }, { enabled: true }]), "2 on");
});

test("the time field round-trips", () => {
  assert.equal(minutesToTimeValue(21 * 60), "21:00");
  assert.equal(timeValueToMinutes("21:00"), 1260);
  assert.equal(timeValueToMinutes("9:00 AM"), null);
});

test("a save carries only what the server accepts, and every default is off", () => {
  assert.equal(DEFAULT_ROWS.basal.enabled, false);
  assert.equal(DEFAULT_ROWS.meal.enabled, false);
  assert.equal(DEFAULT_ROWS.custom.enabled, false);
  assert.equal(DEFAULT_ROWS.custom.name, "");

  const payload = reminderPayloadFrom({ ...DEFAULT_ROWS.meal, enabled: true }, "America/Chicago");
  assert.deepEqual(payload, {
    type: "meal", name: "Meal review", days: [], time_minutes: 0,
    delay_minutes: 120, enabled: true, skip_quiet: true, timezone: "America/Chicago",
  });
});

test("nothing shown on the page names a dose, a unit or a reading", () => {
  const text = [
    ...Object.values(REMINDER_NOTES),
    reminderTimingLine(DEFAULT_ROWS.basal),
    reminderTimingLine(DEFAULT_ROWS.meal),
    reminderTimingLine(DEFAULT_ROWS.custom),
  ].join(" ");
  assert.ok(!/\b(unit|units|dose|doses|bolus|inject|injection|increase|decrease|take|mg\/dl|mmol)\b/i.test(text));
  assert.ok(!/comfort zone/i.test(text));
});