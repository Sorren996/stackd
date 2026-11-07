// Provider-schema tests for what the two remote-push paths actually send.
//
// Why this file exists: the owner reported sound inside the app but silence on
// the lock screen and when the app is closed. The in-app sound is Web Audio
// played by the open app; it says nothing about the remote alert. These tests
// pin down the opposite end — the exact object handed to the platform's push
// integration — on BOTH paths, and prove neither invents a sound field the
// provider does not accept.
//
// Every send is mocked. Nothing is delivered, no token is used, no record and
// no real health reading is touched.
//
// Run with:
//   node --test --experimental-strip-types base44/shared/__tests__/

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PUSH_MESSAGE_FIELDS,
  PUSH_SOUND_SUPPORTED,
  dispatchNotification,
} from "../notificationDispatch.ts";
import {
  runTestPushNotification,
  TEST_PUSH_TITLE,
  TEST_PUSH_MESSAGE,
} from "../testPushNotification.ts";

// Keys iOS would need in order to make an alert audible while locked. None of
// them exists in the integration's input schema, so none may be sent.
const NOT_REQUESTABLE = [
  "sound",
  "sound_name",
  "soundName",
  "interruption_level",
  "interruptionLevel",
  "aps",
  "alert",
  "priority",
  "critical",
];

const NOW = Date.parse("2026-11-07T16:00:00.000Z");

function fieldsOf(message) {
  return Object.keys(message).sort();
}

// ── The supported schema itself ───────────────────────────────────────────

test("the sendable field set is exactly the documented integration schema", () => {
  assert.deepEqual(PUSH_MESSAGE_FIELDS.slice().sort(), [
    "action_url",
    "content",
    "title",
    "user_id",
  ]);
  assert.equal(PUSH_SOUND_SUPPORTED, false, "this app cannot request a remote sound");
});

test("no field that could make a locked alert audible is in the supported set", () => {
  for (const field of NOT_REQUESTABLE) {
    assert.ok(
      !PUSH_MESSAGE_FIELDS.includes(field),
      `${field} is not part of the integration schema and must never be sent`
    );
  }
});

// ── Automatic glucose-alert path ──────────────────────────────────────────

function makeDeps() {
  const sends = [];
  const deps = {
    async claim() {
      return true;
    },
    async createRecord(row) {
      return { id: "delivery-1", ...row };
    },
    async updateRecord() {},
    async recheck() {
      return { ok: true };
    },
    async send(message) {
      sends.push(message);
    },
    nowMs: NOW,
    absoluteUrl: (path) => `https://stackdinsight.base44.app${path}`,
  };
  return { deps, sends };
}

test("an automatic alert sends exactly the supported fields, and no sound", async () => {
  const { deps, sends } = makeDeps();
  const outcome = await dispatchNotification(
    {
      enabled: true,
      category: "urgent_low",
      ownerUserId: "owner-1",
      recipientUserId: "recipient-1",
      sharedAccessId: null,
      audience: "self",
      episodeKey: "low-stream:v1:dexcom:1",
      eventKey: "urgent_low|owner-1|recipient-1|low-stream:v1:dexcom:1|push",
      occurredAtMs: NOW - 60_000,
      expiresAtMs: NOW + 5 * 60_000,
      copy: { title: "Urgent low: 54 mg/dL", body: "Open Stackd for details." },
      detailShown: true,
      destination: "/",
      quiet: null,
      permissionVersion: 3,
    },
    deps
  );

  assert.equal(outcome.status, "submitted");
  assert.equal(sends.length, 1);
  assert.deepEqual(fieldsOf(sends[0]), PUSH_MESSAGE_FIELDS);
  for (const field of NOT_REQUESTABLE) {
    assert.ok(!(field in sends[0]), `the automatic path must not send ${field}`);
  }
});

test("a sound smuggled onto the dispatch input never reaches the provider", async () => {
  const { deps, sends } = makeDeps();
  await dispatchNotification(
    {
      enabled: true,
      category: "custom_low",
      ownerUserId: "owner-2",
      recipientUserId: "recipient-2",
      sharedAccessId: null,
      audience: "self",
      episodeKey: "low-stream:v1:dexcom:2",
      eventKey: "custom_low|owner-2|recipient-2|low-stream:v1:dexcom:2|push",
      occurredAtMs: NOW - 60_000,
      expiresAtMs: NOW + 5 * 60_000,
      copy: { title: "Below your alert level", body: "Open Stackd for details." },
      detailShown: false,
      destination: "/",
      quiet: null,
      permissionVersion: null,
      // Not part of the input type; proves the message is built, not forwarded.
      sound: "default",
      interruption_level: "timeSensitive",
    },
    deps
  );

  assert.equal(sends.length, 1);
  assert.deepEqual(fieldsOf(sends[0]), PUSH_MESSAGE_FIELDS);
  assert.ok(!("sound" in sends[0]));
  assert.ok(!("interruption_level" in sends[0]));
});

// ── Admin test path ───────────────────────────────────────────────────────

test("the test notification sends the same auditable shape, and no sound", async () => {
  const sends = [];
  const base44 = {
    asServiceRole: {
      integrations: {
        Core: {
          SendPushNotification: async (message) => {
            sends.push(message);
            return { ok: true };
          },
        },
      },
    },
  };

  const result = await runTestPushNotification(
    base44,
    { id: "u-admin-sound-schema", role: "admin" },
    NOW
  );

  assert.equal(result.status, 200);
  assert.equal(sends.length, 1);
  assert.ok(!("sound" in sends[0]), "the test path must not send an unsupported sound field");
  for (const field of NOT_REQUESTABLE) {
    assert.ok(!(field in sends[0]), `the test path must not send ${field}`);
  }

  // Every field it does send is one the integration documents, and the shape is
  // the same one the automatic path sends.
  for (const field of Object.keys(sends[0])) {
    assert.ok(
      ["user_id", "title", "content", "action_url"].includes(field),
      `${field} is not a documented push field`
    );
  }
  assert.deepEqual(fieldsOf(sends[0]), PUSH_MESSAGE_FIELDS);

  // Identical in shape to an automatic alert, so a locked-phone test reproduces
  // a real alert rather than a shorter payload.
  assert.deepEqual(sends[0], {
    user_id: "u-admin-sound-schema",
    title: TEST_PUSH_TITLE,
    content: TEST_PUSH_MESSAGE,
    action_url: "https://stackdinsight.base44.app/",
  });
});