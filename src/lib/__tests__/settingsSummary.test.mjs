import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  attentionItems,
  insulinRatioLabel,
  notificationsSummary,
  readingAgeLabel,
  sensorSessionSummary,
  statusBand,
} from "../settingsSummary.js";

const NOW = Date.parse("2026-11-14T10:00:00.000Z");
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const connected = { status: "connected", cgm_model: "G7" };

test("a healthy connection reads as the connected wording", () => {
  const band = statusBand({
    connection: connected,
    modelId: "G7",
    latestAtMs: NOW - 2 * MINUTE,
    remainingMs: 5 * DAY,
    nowMs: NOW,
  });
  assert.equal(band.tone, "ok");
  assert.equal(band.title, "Dexcom G7 connected");
  assert.equal(band.detail, "Reading every 5 minutes · latest 2 min ago");
  assert.equal(band.to, "/settings/dexcom");
});

test("the band becomes the fix when something is wrong", () => {
  assert.equal(statusBand({ connection: null, nowMs: NOW }).title, "Connect your glucose source");
  assert.equal(statusBand({ connection: null, nowMs: NOW }).to, "/settings/dexcom");

  const dropped = statusBand({ connection: { status: "error" }, nowMs: NOW });
  assert.equal(dropped.title, "Connection dropped");
  assert.equal(dropped.tone, "attention");

  const expired = statusBand({
    connection: connected,
    modelId: "G7",
    latestAtMs: NOW - MINUTE,
    remainingMs: -HOUR,
    nowMs: NOW,
  });
  assert.equal(expired.title, "Sensor session ended");
  assert.equal(expired.to, "/settings/sensor");

  const stopped = statusBand({
    connection: connected,
    modelId: "G7",
    latestAtMs: NOW - 21 * MINUTE,
    remainingMs: 5 * DAY,
    nowMs: NOW,
  });
  assert.equal(stopped.tone, "attention");
  assert.equal(stopped.title, "Readings have stopped");
});

test("reading age is measured, never guessed", () => {
  assert.equal(readingAgeLabel(NOW - 20 * 1000, NOW), "just now");
  assert.equal(readingAgeLabel(NOW - 2 * MINUTE, NOW), "2 min ago");
  assert.equal(readingAgeLabel(NOW - 3 * HOUR, NOW), "3 hr ago");
  assert.equal(readingAgeLabel(NaN, NOW), null);
});

test("attention collapses to nothing when there is nothing to fix", () => {
  const items = attentionItems({
    personal: { master_enabled: true },
    sensor: { hasSession: true, remainingMs: 6 * DAY },
    connection: connected,
    latestAtMs: NOW - MINUTE,
    nowMs: NOW,
  });
  assert.deepEqual(items, []);
});

test("attention names only what needs a tap", () => {
  const items = attentionItems({
    personal: { master_enabled: false },
    sensor: { hasSession: true, remainingMs: 30 * HOUR },
    connection: connected,
    latestAtMs: NOW - 2 * HOUR,
    nowMs: NOW,
  });
  assert.deepEqual(
    items.map((item) => [item.key, item.to]),
    [
      ["notifications", "/settings/notifications"],
      ["sensor", "/settings/sensor"],
      ["readings", "/settings/dexcom"],
    ]
  );
  assert.equal(items[1].text, "Sensor ends in 30 hours");
});

test("a session outside the 48 hour window is not flagged early", () => {
  const items = attentionItems({
    personal: { master_enabled: true },
    sensor: { hasSession: true, remainingMs: 72 * HOUR },
    connection: connected,
    latestAtMs: NOW - MINUTE,
    nowMs: NOW,
  });
  assert.deepEqual(items, []);
});

test("the sensor row reads as a day and an expiry date", () => {
  const startedAt = NOW - 5 * DAY;
  const summary = sensorSessionSummary({
    modelId: "G7",
    startedAtMs: startedAt,
    remainingMs: 5 * DAY,
    nowMs: NOW,
  });
  assert.equal(summary.hasSession, true);
  assert.equal(summary.value, "Day 6 of 10");
  assert.equal(summary.note, "Expires Nov 19");
  assert.equal(summary.expired, false);

  assert.equal(
    sensorSessionSummary({ modelId: null, startedAtMs: null }).hasSession,
    false,
    "no session is a legitimate state, not an error"
  );
});

test("notifications summarise the owner's own levels, or say off", () => {
  assert.equal(
    notificationsSummary({ personal: { master_enabled: true, low_mgdl: 70, high_mgdl: 180 }, units: "mg/dL" }),
    "On · low 70 · high 180"
  );
  assert.equal(notificationsSummary({ personal: { master_enabled: false }, units: "mg/dL" }), "Off");
  assert.equal(
    notificationsSummary({ personal: { master_enabled: true, low_mgdl: 72, high_mgdl: 180 }, units: "mmol/L" }),
    "On · low 4.0 · high 10.0"
  );
});

test("the insulin row shows the stored carb ratio, or claims none", () => {
  assert.equal(insulinRatioLabel(0.5), "1:10");
  assert.equal(insulinRatioLabel(0.625), "1:8");
  assert.equal(insulinRatioLabel(null), null);
});

// The approved order is structural, so it is checked against the page itself.
test("the settings page renders its rows in the approved order", async () => {
  const source = await readFile(new URL("../../pages/Settings.jsx", import.meta.url), "utf8");
  const order = [...source.matchAll(/to="(\/[^"]*)"/g)].map((match) => match[1]);
  const expectedOrder = [
    "/settings/sensor",
    "/settings/notifications",
    // Reminders sits directly under Notifications and is its own page.
    "/settings/reminders",
    "/settings/insulin",
    "/settings/display",
    "/settings/sharing",
    "/shared",
    "/settings/privacy-consent",
    "/settings/contact-support",
    "/settings/support-inbox",
    "/settings/profile",
    "/install",
    "/privacy",
    "/terms",
  ];
  assert.deepEqual(order, expectedOrder);
  assert.ok(
    source.indexOf("<SettingsStatusBand") < source.indexOf("<SectionCard"),
    "the status band sits above every group"
  );
  assert.ok(
    source.indexOf("Sign out") > source.lastIndexOf("<SectionCard label="),
    "sign out is the last row on the page"
  );
});