import test from "node:test";
import assert from "node:assert/strict";

import { collapseWinners, allReadingsCandidate, readingIdentity } from "../notificationReadingWinner.ts";
import { applyFollowerCadence } from "../notificationFollowerCadence.ts";
import { classifyRecipientRefusal, reachabilityFromRows } from "../notificationReachability.ts";
import { dispatchNotification } from "../notificationDispatch.ts";

const NOW = Date.parse("2026-11-12T02:15:00.000Z");
const at = (minutes) => NOW - minutes * 60_000;

function sample(minutesAgo, value = 62) {
  return { id: `r${minutesAgo}`, at: at(minutesAgo), value, source: "dexcom_share", trend: null };
}

function lowDecision(minutesAgo, category = "low_glucose") {
  const s = sample(minutesAgo);
  return {
    category,
    episodeKey: `low-stream:v1:dexcom_share:${s.at}`,
    sample: s,
    durationMinutes: null,
    repeatIndex: 0,
    perReadingLow: true,
    lowThreshold: 70,
    coveredEvents: [{ category, episodeKey: `low-stream:v1:dexcom_share:${s.at}`, repeatIndex: 0 }],
  };
}

// ── One reading, one push ─────────────────────────────────────────────────

test("one reading produces exactly one winner, and urgent low outranks the stream", () => {
  const winners = collapseWinners([
    lowDecision(1, "low_glucose"),
    { category: "all_readings", episodeKey: "all-readings:1", sample: sample(1), durationMinutes: null,
      coveredEvents: [{ category: "all_readings", episodeKey: "all-readings:1" }] },
  ]);

  assert.equal(winners.length, 1);
  assert.equal(winners[0].category, "low_glucose");
  assert.ok(winners[0].coveredEvents.some((event) => event.category === "all_readings"));
});

test("urgent low wins over every other category for the same measurement", () => {
  const winners = collapseWinners([
    lowDecision(1, "custom_high"),
    lowDecision(1, "low_glucose"),
    lowDecision(1, "urgent_low"),
  ]);
  assert.equal(winners.length, 1);
  assert.equal(winners[0].category, "urgent_low");
});

test("two different readings both speak, which one reading can never do", () => {
  const winners = collapseWinners([lowDecision(1), lowDecision(6)]);
  assert.equal(winners.length, 2);
});

test("a corrected value for the same recorded_at keeps one identity", () => {
  assert.equal(readingIdentity(at(1)), readingIdentity(at(1)));
  const winners = collapseWinners([lowDecision(1), { ...lowDecision(1), sample: { ...sample(1), value: 71 } }]);
  assert.equal(winners.length, 1);
});

test("the stream never replays a backlog and sends only the newest in a minute", () => {
  assert.equal(allReadingsCandidate({ samples: [sample(6)], nowMs: NOW, enabled: true }), null);
  const base = at(1);
  const stream = allReadingsCandidate({
    samples: [{ ...sample(1), at: base }, { ...sample(1), at: base + 20_000, value: 128 }],
    nowMs: NOW,
    enabled: true,
  });
  assert.equal(stream.sample.value, 128);
  assert.equal(allReadingsCandidate({ samples: [sample(1)], nowMs: NOW, enabled: false }), null);
});

// ── Follower cadence ──────────────────────────────────────────────────────

function runCadence(sequence) {
  let state = {};
  const sent = [];
  for (const minutesAgo of sequence) {
    const winner = lowDecision(minutesAgo);
    const result = applyFollowerCadence({
      winners: [winner],
      state,
      nowMs: at(minutesAgo),
      stillLow: () => true,
      recoverySample: winner.sample,
    });
    state = result.state;
    sent.push(...result.winners.filter((item) => item.category !== "missing_readings").map((item) => [minutesAgo, item.category]));
  }
  return { sent, state };
}

test("a follower low episode speaks once, then once more after 25 minutes, never per reading", () => {
  // The logged barrage: readings every five minutes through one episode.
  const { sent } = runCadence([45, 40, 35, 30, 25, 20, 15, 10, 1]);
  assert.deepEqual(sent.map(([, category]) => category), ["low_glucose", "low_glucose"]);
  assert.equal(sent[0][0], 45);
  assert.equal(sent[1][0], 20); // exactly 25 minutes later
});

test("a follower episode closes with at most one recovery note", () => {
  let state = {};
  const lows = [45, 40, 35];
  for (const minutesAgo of lows) {
    state = applyFollowerCadence({ winners: [lowDecision(minutesAgo)], state, nowMs: at(minutesAgo), stillLow: () => true, recoverySample: sample(minutesAgo) }).state;
  }
  const recovered = applyFollowerCadence({
    winners: [],
    state,
    nowMs: at(30),
    stillLow: () => false,
    recoverySample: sample(30, 110),
  });
  assert.deepEqual(recovered.winners.map((item) => item.category), ["low_recovery"]);

  const again = applyFollowerCadence({ winners: [], state: recovered.state, nowMs: at(29), stillLow: () => false, recoverySample: sample(29, 112) });
  assert.equal(again.winners.length, 0);
});

// ── Reachability ──────────────────────────────────────────────────────────

test("the push service's own refusal for an unknown account is a membership reason", () => {
  const error = Object.assign(new Error("Cannot send a push to a user outside the app"), { status: 404 });
  assert.equal(classifyRecipientRefusal(error), "recipient_not_member");
});

test("a missing device is reported as no_device_token, a rejected token stays transport", () => {
  assert.equal(classifyRecipientRefusal(Object.assign(new Error("no device registered"), { status: 400 })), "no_device_token");
  assert.equal(classifyRecipientRefusal(Object.assign(new Error("invalid push token"), { status: 400 })), null);
  assert.equal(classifyRecipientRefusal(Object.assign(new Error("request timed out"), { status: 504 })), null);
});

test("reachability is read from what the delivery rows recorded, never guessed", () => {
  assert.equal(reachabilityFromRows([{ status: "submitted" }]), "reachable");
  assert.equal(reachabilityFromRows([{ status: "skipped", reason: "no_device_token" }]), "no_device");
  assert.equal(reachabilityFromRows([{ status: "skipped", reason: "recipient_not_member" }]), "not_member");
  assert.equal(reachabilityFromRows([]), "unknown");
});

test("an unreachable recipient releases the claim and schedules a retry instead of dropping", async () => {
  const released = [];
  const retries = [];
  const records = [];
  const outcome = await dispatchNotification(
    {
      enabled: true,
      category: "low_glucose",
      ownerUserId: "owner-1",
      recipientUserId: "follower-1",
      sharedAccessId: "rel-1",
      audience: "follower",
      episodeKey: "low:1",
      eventKey: "reading:v2:1",
      occurredAtMs: at(1),
      expiresAtMs: NOW + 60_000,
      copy: { title: "Stackd update", body: "Open Stackd for details." },
      detailShown: false,
      destination: "/shared",
      quiet: null,
      coveredEvents: [{ category: "low_glucose", episodeKey: "low:1", repeatIndex: 0 }],
    },
    {
      nowMs: NOW,
      absoluteUrl: (path) => `https://stackdinsight.base44.app${path}`,
      claim: async () => true,
      createRecord: async (row) => { records.push({ id: "d1", ...row }); return { id: "d1" }; },
      updateRecord: async (id, patch) => { Object.assign(records[0], patch); },
      recheck: async () => ({ ok: true }),
      send: async () => { throw Object.assign(new Error("no device registered"), { status: 400 }); },
      releaseClaim: async (key) => released.push(key),
      scheduleRetry: async (reason) => retries.push(reason),
    }
  );

  assert.equal(outcome.status, "skipped");
  assert.equal(outcome.reason, "no_device_token");
  assert.equal(records[0].status, "skipped");
  assert.equal(records[0].reason, "no_device_token");
  assert.deepEqual(released, ["reading:v2:1"]);
  assert.deepEqual(retries, ["no_device_token"]);
});