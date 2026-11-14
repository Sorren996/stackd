import test from "node:test";
import assert from "node:assert/strict";

import {
  BASAL_BODY,
  MAX_REMINDER_NAME,
  RETRY_MINUTES,
  SENSOR_BODIES,
  clockFireState,
  createLimitError,
  daysLabel,
  groupDueItems,
  mealFireState,
  mergedReminderCopy,
  reminderCopy,
  reminderCountLabel,
  reminderPayload,
  reminderTimingLine,
  sensorStageDue,
  sensorStages,
} from "../reminderSchedule.ts";

const ALL = [0, 1, 2, 3, 4, 5, 6];

const basal = (over = {}) => ({
  id: "basal-1", type: "basal", name: "Basal log", days: ALL,
  time_minutes: 21 * 60, delay_minutes: null, timezone: "America/Chicago",
  last_sent_date: null, last_retry_sent_date: null, ...over,
});

// 21:04 on Saturday 2026-11-14 in Chicago (CST, UTC−6) is 03:04Z on the 15th.
const CHICAGO_2104 = Date.parse("2026-11-15T03:04:00Z");
const CHICAGO_2116 = Date.parse("2026-11-15T03:16:00Z");
const CHICAGO_2140 = Date.parse("2026-11-15T03:40:00Z");

test("a reminder fires once inside its window, then once 15 minutes later, never again that day", () => {
  const first = clockFireState(basal(), CHICAGO_2104);
  assert.equal(first.firstDue, true);
  assert.equal(first.retryDue, false);
  assert.equal(first.dateKey, "2026-11-14");

  const retry = clockFireState(basal({ last_sent_date: "2026-11-14" }), CHICAGO_2116);
  assert.equal(retry.firstDue, false);
  assert.equal(retry.retryDue, true);

  const done = clockFireState(basal({ last_sent_date: "2026-11-14", last_retry_sent_date: "2026-11-14" }), CHICAGO_2116);
  assert.equal(done.firstDue, false);
  assert.equal(done.retryDue, false);

  // Ten minutes after the moment is inside the 15-minute sweep window.
  assert.equal(clockFireState(basal(), CHICAGO_2104 + 10 * 60_000).firstDue, true);
  // Twenty minutes after is not: the day is not replayed late.
  assert.equal(clockFireState(basal(), CHICAGO_2104 + 20 * 60_000).firstDue, false);
  assert.ok(RETRY_MINUTES === 15);
});

test("a reminder only fires on the days it was given", () => {
  const weekdaysOnly = basal({ days: [1, 2, 3, 4, 5] });
  assert.equal(clockFireState(weekdaysOnly, CHICAGO_2104).firstDue, false); // Saturday
  assert.equal(clockFireState(basal({ days: [6] }), CHICAGO_2104).firstDue, true); // Saturday
});

test("the meal reminder is measured from the meal itself", () => {
  const mealAt = CHICAGO_2104;
  const reminder = { type: "meal", name: "Meal review", delay_minutes: 120, timezone: "America/Chicago" };
  const state = mealFireState(reminder, mealAt, mealAt + 2 * 60 * 60_000 + 60_000);
  assert.equal(state.firstDue, true);
  assert.equal(state.scheduledAtMs, mealAt + 120 * 60_000);
  assert.equal(mealFireState(reminder, mealAt, mealAt + 60 * 60_000).firstDue, false);
});

test("reminders due within ten minutes are one push", () => {
  const at = (minutes) => ({ scheduledAtMs: 1_000_000 + minutes * 60_000 });
  const groups = groupDueItems([at(0), at(2), at(4), at(40)]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].length, 3);
  assert.equal(groups[1].length, 1);
  assert.deepEqual(mergedReminderCopy(["Basal log", "Meal review"]), {
    title: "Two reminders", body: "Basal log, Meal review",
  });
  assert.deepEqual(mergedReminderCopy(["A", "B", "C"]), { title: "Three reminders", body: "A, B, C" });
});

test("reminder copy names no dose, no unit and no glucose number", () => {
  const copies = [
    reminderCopy({ type: "basal" }),
    reminderCopy({ type: "meal", timezone: "America/Chicago" }, CHICAGO_2104),
    reminderCopy({ type: "custom", name: "Check my bag" }),
    mergedReminderCopy(["Basal log", "Meal review"]),
    mergedReminderCopy(["Check my bag", "Refill water", "Call Mum"]),
  ];

  const dosing = /\b(unit|units|dose|doses|bolus|basal rate|inject|injection|shot|increase|decrease|take|mg\/dl|mmol|reading|level)\b/i;
  for (const copy of copies) {
    assert.ok(!dosing.test(`${copy.title} ${copy.body}`), `dosing word in: ${copy.body}`);
    // No number big enough to be a glucose value; a clock time is fine.
    const numbers = (copy.body.match(/\d+/g) || []).map(Number);
    assert.ok(numbers.every((value) => value < 20), `glucose-like number in: ${copy.body}`);
    assert.ok(!/comfort zone/i.test(copy.body));
  }

  assert.equal(reminderCopy({ type: "basal" }).body, "No basal logged today. Is it time?");
  assert.equal(BASAL_BODY, "No basal logged today. Is it time?");
  assert.match(reminderCopy({ type: "meal", timezone: "America/Chicago" }, CHICAGO_2104).body, /^Your 9:04 PM meal is ready to review$/);
  assert.equal(reminderCopy({ type: "custom", name: "Check my bag" }).body, "Check my bag");

  for (const body of Object.values(SENSOR_BODIES)) {
    assert.ok(!dosing.test(body), `dosing word in sensor copy: ${body}`);
    assert.ok(!/\d/.test(body), `number in sensor copy: ${body}`);
  }
});

test("the sensor prompts exist only for a recorded session, at three moments", () => {
  // No session start time, or no recognised sensor, means no sensor prompts.
  assert.deepEqual(sensorStages(Number.NaN, "G6"), []);
  assert.deepEqual(sensorStages(Date.parse("2026-11-01T12:00:00Z"), "unknown"), []);
  assert.equal(sensorStages(Date.parse("2026-11-01T12:00:00Z"), "G6").length, 3);

  const stages = sensorStages(Date.parse("2026-11-01T12:00:00Z"), "G7_15");
  assert.deepEqual(stages.map((stage) => stage.stage), ["warning", "ended", "overdue"]);
  const endMs = Date.parse("2026-11-16T12:00:00Z");
  assert.equal(stages[1].atMs, endMs);
  assert.equal(stages[0].atMs, endMs - 24 * 60 * 60_000);
  assert.equal(stages[2].atMs, endMs + 12 * 60 * 60_000);

  assert.equal(sensorStageDue(stages[0].atMs, stages[0].atMs + 60_000), true);
  assert.equal(sensorStageDue(stages[0].atMs, stages[0].atMs + 30 * 60_000), false);
});

test("the timing line states the exact time", () => {
  assert.equal(reminderTimingLine(basal()), "Daily at 9:00 PM");
  assert.equal(reminderTimingLine({ type: "custom", days: [1, 3, 5], time_minutes: 8 * 60 }), "Mon, Wed, Fri at 8:00 AM");
  assert.equal(reminderTimingLine({ type: "meal", delay_minutes: 120 }), "2 hours after you log a meal");
  assert.equal(daysLabel([0, 1, 2, 3, 4, 5, 6]), "Daily");
});

test("the row value counts only the enabled reminders", () => {
  assert.equal(reminderCountLabel([]), "Off");
  assert.equal(reminderCountLabel([{ enabled: false }, { enabled: false }]), "Off");
  assert.equal(reminderCountLabel([{ enabled: true }, { enabled: true }, { enabled: false }]), "2 on");
});

test("one basal, one meal and three custom reminders — enforced here", () => {
  assert.equal(createLimitError("basal", [{ type: "basal" }]), "already_exists");
  assert.equal(createLimitError("basal", []), null);
  assert.equal(createLimitError("meal", [{ type: "basal" }]), null);
  assert.equal(createLimitError("custom", [{ type: "custom" }, { type: "custom" }]), null);
  assert.equal(createLimitError("custom", [{ type: "custom" }, { type: "custom" }, { type: "custom" }]), "custom_limit");
});

test("what may be stored, and what is refused", () => {
  const custom = reminderPayload({ type: "custom", name: "  Check   my bag ", days: [3, 1, 1], time_minutes: 480 });
  assert.equal(custom.value.name, "Check my bag");
  assert.deepEqual(custom.value.days, [1, 3]);
  assert.equal(custom.value.skip_quiet, true);
  assert.equal(custom.value.enabled, false);

  assert.equal(reminderPayload({ type: "custom", name: "x".repeat(80), days: [1], time_minutes: 60 }).value.name.length, MAX_REMINDER_NAME);
  assert.equal(reminderPayload({ type: "custom", name: "   ", days: [1], time_minutes: 60 }).error, "name_required");
  assert.equal(reminderPayload({ type: "custom", name: "A", days: [], time_minutes: 60 }).error, "no_days");
  assert.equal(reminderPayload({ type: "custom", name: "A", days: [1], time_minutes: 1440 }).error, "bad_time");
  assert.equal(reminderPayload({ type: "meal", delay_minutes: 45 }).error, "unknown_delay");
  assert.equal(reminderPayload({ type: "nonsense" }).error, "unknown_type");
  assert.equal(reminderPayload({ type: "basal", days: [1], time_minutes: 60, name: "Renamed" }).value.name, "Basal log");
});