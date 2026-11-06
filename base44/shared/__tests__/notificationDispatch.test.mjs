import test from "node:test";
import assert from "node:assert/strict";

import { classifySendOutcome, dispatchNotification, keysToPrune } from "../notificationDispatch.ts";

const NOW = Date.parse("2026-06-01T12:00:00.000Z");

function baseInput(overrides = {}) {
  return {
    enabled: true,
    category: "urgent_low",
    ownerUserId: "owner-1",
    recipientUserId: "recipient-1",
    sharedAccessId: null,
    audience: "self",
    episodeKey: "low:r1",
    eventKey: "urgent_low|owner-1|recipient-1|low:r1|push",
    occurredAtMs: NOW - 3 * 60_000,
    expiresAtMs: NOW + 5 * 60_000,
    copy: { title: "Stackd update", body: "Open Stackd for details." },
    detailShown: false,
    destination: "/",
    quiet: null,
    permissionVersion: null,
    ...overrides,
  };
}

/** A stand-in for the real ledger: one claim per key, atomically. */
function makeDeps(options = {}) {
  const claimed = new Set();
  const records = [];
  const sends = [];
  const updates = [];
  let nextId = 0;

  const deps = {
    async claim(key) {
      // Yield first, so concurrent callers genuinely interleave.
      await Promise.resolve();
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
    async createRecord(row) {
      nextId += 1;
      const record = { id: `delivery-${nextId}`, ...row };
      records.push(record);
      return record;
    },
    async updateRecord(id, patch) {
      updates.push({ id, patch });
      const record = records.find((r) => r.id === id);
      if (record) Object.assign(record, patch);
    },
    async recheck() {
      return options.recheck ? options.recheck() : { ok: true };
    },
    async send(message) {
      if (options.sendError) throw options.sendError;
      sends.push(message);
    },
    nowMs: NOW,
    absoluteUrl: (path) => `https://stackdinsight.base44.app${path}`,
  };

  return { deps, claimed, records, sends, updates };
}

// ── Off means off ─────────────────────────────────────────────────────────

test("a recipient with notifications off gets nothing at all", async () => {
  const { deps, claimed, records, sends } = makeDeps();
  const outcome = await dispatchNotification(baseInput({ enabled: false }), deps);

  assert.equal(outcome.status, "skipped");
  assert.equal(outcome.reason, "preference_off");
  assert.equal(claimed.size, 0, "nothing claimed");
  assert.equal(records.length, 0, "no delivery row");
  assert.equal(sends.length, 0, "zero sends");
});

// ── Quiet hours ───────────────────────────────────────────────────────────

test("quiet hours hold a notice back before the episode is consumed", async () => {
  const { deps, claimed, sends } = makeDeps();
  const quiet = {
    enabled: true,
    startHour: 12,
    endHour: 14,
    timeZone: "UTC",
    urgentDuringQuiet: false,
  };
  const outcome = await dispatchNotification(baseInput({ quiet }), deps);

  assert.equal(outcome.status, "skipped");
  assert.equal(outcome.reason, "quiet_hours");
  assert.equal(claimed.size, 0, "the episode is not burned, so current eligibility is re-checked later");
  assert.equal(sends.length, 0);
});

test("the separate urgent-during-quiet option lets an urgent low through", async () => {
  const { deps, sends } = makeDeps();
  const quiet = { enabled: true, startHour: 12, endHour: 14, timeZone: "UTC", urgentDuringQuiet: true };
  const outcome = await dispatchNotification(baseInput({ quiet }), deps);

  assert.equal(outcome.status, "submitted");
  assert.equal(sends.length, 1);
});

// ── Freshness expiry ──────────────────────────────────────────────────────

test("news that has gone stale is dropped rather than sent", async () => {
  const { deps, claimed, sends } = makeDeps();
  const outcome = await dispatchNotification(baseInput({ expiresAtMs: NOW - 60_000 }), deps);

  assert.equal(outcome.status, "skipped");
  assert.equal(outcome.reason, "expired");
  assert.equal(claimed.size, 0);
  assert.equal(sends.length, 0);
});

// ── The happy path ────────────────────────────────────────────────────────

test("a permitted notice is claimed, recorded and submitted once", async () => {
  const { deps, records, sends } = makeDeps();
  const outcome = await dispatchNotification(baseInput(), deps);

  assert.equal(outcome.status, "submitted");
  assert.equal(outcome.deliveryId, "delivery-1");
  assert.equal(sends.length, 1);
  assert.deepEqual(sends[0], {
    user_id: "recipient-1",
    title: "Stackd update",
    content: "Open Stackd for details.",
    action_url: "https://stackdinsight.base44.app/",
  });

  const record = records[0];
  assert.equal(record.status, "submitted");
  assert.equal(record.audience, "self");
  assert.equal(record.channel, "push");
  assert.equal(record.detail_shown, false);
  assert.ok(record.submitted_at, "submission time recorded");
  assert.ok(!("value" in record), "no glucose value is stored on the history row");
});

test("the follower destination is the shared view", async () => {
  const { deps, sends } = makeDeps();
  await dispatchNotification(baseInput({ audience: "follower", destination: "/shared" }), deps);
  assert.equal(sends[0].action_url, "https://stackdinsight.base44.app/shared");
});

// ── One notification per event ────────────────────────────────────────────

test("a repeated event is never sent twice", async () => {
  const { deps, sends } = makeDeps();
  const first = await dispatchNotification(baseInput(), deps);
  const second = await dispatchNotification(baseInput(), deps);

  assert.equal(first.status, "submitted");
  assert.equal(second.status, "duplicate");
  assert.equal(sends.length, 1);
});

test("concurrent evaluations of the same event produce exactly one send", async () => {
  const { deps, sends } = makeDeps();
  const outcomes = await Promise.all([
    dispatchNotification(baseInput(), deps),
    dispatchNotification(baseInput(), deps),
    dispatchNotification(baseInput(), deps),
  ]);

  assert.equal(outcomes.filter((o) => o.status === "submitted").length, 1);
  assert.equal(outcomes.filter((o) => o.status === "duplicate").length, 2);
  assert.equal(sends.length, 1);
});

// ── Permissions re-checked immediately before transport ───────────────────

test("a revoke that lands between evaluation and send cancels the notification", async () => {
  const { deps, records, sends } = makeDeps({
    recheck: async () => ({ ok: false, reason: "access_revoked" }),
  });
  const outcome = await dispatchNotification(baseInput({ audience: "follower" }), deps);

  assert.equal(outcome.status, "skipped");
  assert.equal(outcome.reason, "access_revoked");
  assert.equal(sends.length, 0, "nothing left the server");
  assert.equal(records[0].status, "skipped");
  assert.equal(records[0].reason, "access_revoked");
});

test("turning the category off mid-flight also cancels the send", async () => {
  const { deps, sends } = makeDeps({ recheck: async () => ({ ok: false, reason: "category_off" }) });
  const outcome = await dispatchNotification(baseInput(), deps);
  assert.equal(outcome.status, "skipped");
  assert.equal(sends.length, 0);
});

// ── Transport failures ────────────────────────────────────────────────────

test("a clear refusal is recorded as failed", async () => {
  const error = Object.assign(new Error("invalid push token"), { status: 400 });
  const { deps, records, sends } = makeDeps({ sendError: error });
  const outcome = await dispatchNotification(baseInput(), deps);

  assert.equal(outcome.status, "failed");
  assert.equal(sends.length, 0);
  assert.equal(records[0].status, "failed");
  assert.equal(records[0].reason, "transport_failed");
});

test("an ambiguous failure is recorded as unknown and never resent", async () => {
  const error = Object.assign(new Error("request timed out"), { status: 504 });
  const { deps, records, sends } = makeDeps({ sendError: error });

  const first = await dispatchNotification(baseInput(), deps);
  assert.equal(first.status, "unknown");
  assert.equal(records[0].status, "unknown");
  assert.equal(records[0].reason, "transport_unknown");

  // A retry of the same event finds the claim already spent: no second attempt.
  const retry = await dispatchNotification(baseInput(), deps);
  assert.equal(retry.status, "duplicate");
  assert.equal(sends.length, 0);
});

test("send outcomes are classified conservatively", () => {
  assert.equal(classifySendOutcome({ status: 429 }), "not_accepted");
  assert.equal(classifySendOutcome({ status: 400 }), "not_accepted");
  assert.equal(classifySendOutcome({ status: 500 }), "ambiguous");
  assert.equal(classifySendOutcome({ status: 502 }), "ambiguous");
  assert.equal(classifySendOutcome({ message: "socket hang up" }), "ambiguous");
  assert.equal(classifySendOutcome({ message: "something odd" }), "ambiguous");
});

// ── Ledger size ───────────────────────────────────────────────────────────

test("the claim ledger stays bounded", () => {
  assert.deepEqual(keysToPrune(["a", "b", "c"]), [], "small ledgers are left alone");
  const big = Array.from({ length: 400 }, (_, i) => `k${i}`);
  const stale = keysToPrune(big, 200);
  assert.equal(stale.length, 200);
  assert.equal(stale[0], "k0");
  assert.equal(stale[stale.length - 1], "k199");
});