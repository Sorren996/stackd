// Isolated tests for the account deletion pipeline.
//
// Run with:
//   node --test --experimental-strip-types base44/shared/__tests__/accountDeletion.test.mjs
//
// These use a MOCKED service role. They prove the sequence and the scoping of
// the deletes. They do NOT prove anything about the platform's auth user
// deletion or session revocation — that can only be shown on a real disposable
// account against the live app.

import test from "node:test";
import assert from "node:assert/strict";

import {
  closeAccount,
  deletionQueries,
  deletionTuning,
  deleteAuthIdentity,
  purgeUserData,
  sweepRecreatedRecords,
} from "../accountDeletion.ts";

// Real pacing waits whole seconds of a rate-limit window; the fixture does not
// need the wall-clock time to prove the behaviour.
deletionTuning.retryDelaysMs = [0, 0, 0];
deletionTuning.batchGapMs = 0;

const A = "user-a";
const B = "user-b";

function matches(data, query) {
  return Object.entries(query).every(([key, value]) => {
    // A merged query matches a row if ANY of its field conditions do.
    if (key === "$or") return value.some((sub) => matches(data, sub));
    return data[key] === value;
  });
}

/** Every id a (possibly merged) query compares against. */
function scopedValues(node) {
  return Object.entries(node).flatMap(([key, value]) =>
    key === "$or" ? value.flatMap(scopedValues) : [value],
  );
}

function makeSr(options = {}) {
  const state = {
    rows: [],
    users: new Map(),
    failEntities: new Set(options.failEntities || []),
    transient429: { ...(options.transient429 || {}) },
    noopUserDelete: options.noopUserDelete === true,
    recreateOnUserDelete: options.recreateOnUserDelete || null,
    calls: [],
  };

  const handler = (entity) => ({
    async deleteMany(query) {
      state.calls.push({ entity, op: "deleteMany", query });
      if (state.transient429[entity] > 0) {
        // The platform's delete burst limit: a rejection, then it clears.
        state.transient429[entity] -= 1;
        const error = new Error("Too many requests");
        error.status = 429;
        throw error;
      }
      if (state.failEntities.has(entity)) throw new Error("unavailable");
      const keep = [];
      let deleted = 0;
      for (const row of state.rows) {
        if (row.entity === entity && matches(row.data, query)) deleted += 1;
        else keep.push(row);
      }
      state.rows = keep;
      return { deleted };
    },
    async delete(id) {
      state.calls.push({ entity, op: "delete", id });
      if (state.failEntities.has(entity)) throw new Error("unavailable");
      if (entity === "User" && !state.noopUserDelete) {
        state.users.delete(id);
        if (state.recreateOnUserDelete) state.recreateOnUserDelete(state);
      }
    },
    async get(id) {
      state.calls.push({ entity, op: "get", id });
      if (!state.users.has(id)) {
        const error = new Error("Not found");
        error.status = 404;
        throw error;
      }
      return state.users.get(id);
    },
  });

  const sr = {
    state,
    entities: new Proxy({}, { get: (_target, name) => handler(String(name)) }),
  };
  return sr;
}

function seed(sr, entity, data) {
  sr.state.rows.push({ entity, data });
}

function rowsFor(sr, entity, key, id) {
  return sr.state.rows.filter((row) => row.entity === entity && row.data[key] === id);
}

const noEvents = async () => {};

test("the delete plan is always scoped to the one account", () => {
  const queries = deletionQueries(A);
  assert.ok(queries.length > 20);
  for (const q of queries) {
    assert.ok(Object.keys(q.query).length >= 1, `${q.label} has no scope`);
    for (const id of scopedValues(q.query)) assert.equal(id, A, `${q.label} leaks a scope`);
  }
  assert.equal(new Set(queries.map((q) => q.label)).size, queries.length);
});

test("the whole plan fits inside one delete burst", async () => {
  const sr = makeSr();
  sr.state.users.set(A, { id: A });

  await closeAccount(sr, A, noEvents);

  // The platform meters deletes per caller (60 per 30s) and one service-role
  // function is one caller for every account. Crossing it is what reported a
  // populated account's records as unremovable, so the plan is budgeted.
  const deletes = sr.state.calls.filter((c) => c.op === "deleteMany").length;
  assert.ok(deletes <= 45, `${deletes} deletes issued in one burst`);
});

test("a rate-limited delete is retried, not reported as unremovable data", async () => {
  const sr = makeSr({ transient429: { GlucoseReading: 1 } });
  sr.state.users.set(A, { id: A });
  seed(sr, "GlucoseReading", { created_by_id: A });

  const result = await closeAccount(sr, A, noEvents);

  assert.equal(result.ok, true);
  assert.equal(rowsFor(sr, "GlucoseReading", "created_by_id", A).length, 0);
  assert.equal(sr.state.users.has(A), false);
});

test("purges only the requesting account's rows", async () => {
  const sr = makeSr();
  sr.state.users.set(A, { id: A });
  sr.state.users.set(B, { id: B });
  for (const entity of ["GlucoseReading", "InsulinDose", "CarbEntry", "UserSettings"]) {
    seed(sr, entity, { created_by_id: A, user_id: A, value: "a" });
    seed(sr, entity, { created_by_id: B, user_id: B, value: "b" });
  }

  const result = await closeAccount(sr, A, noEvents);

  assert.equal(result.ok, true);
  assert.equal(sr.state.rows.filter((row) => row.data.created_by_id === A).length, 0);
  assert.equal(sr.state.rows.filter((row) => row.data.created_by_id === B).length, 4);
  assert.equal(sr.state.users.has(A), false);
  assert.equal(sr.state.users.has(B), true);
});

test("sharing relationships are removed on both sides and nobody else's are touched", async () => {
  const sr = makeSr();
  sr.state.users.set(A, { id: A });
  seed(sr, "SharedAccess", { sharer_user_id: A, follower_user_id: "friend-1" });
  seed(sr, "SharedAccess", { sharer_user_id: "friend-2", follower_user_id: A });
  seed(sr, "SharedAccess", { sharer_user_id: "friend-3", follower_user_id: "friend-4" });
  seed(sr, "SharedInvitation", { sharer_user_id: A, invited_email: "friend-1@example.test" });
  seed(sr, "FollowerAlertDelivery", { sharer_user_id: A, follower_user_id: "friend-1" });
  seed(sr, "FollowerAlertDelivery", { sharer_user_id: "friend-2", follower_user_id: A });

  await closeAccount(sr, A, noEvents);

  assert.equal(rowsFor(sr, "SharedAccess", "sharer_user_id", A).length, 0);
  assert.equal(rowsFor(sr, "SharedAccess", "follower_user_id", A).length, 0);
  assert.equal(rowsFor(sr, "SharedInvitation", "sharer_user_id", A).length, 0);
  assert.equal(rowsFor(sr, "FollowerAlertDelivery", "sharer_user_id", A).length, 0);
  assert.equal(rowsFor(sr, "FollowerAlertDelivery", "follower_user_id", A).length, 0);
  // A relationship between two other people is left alone.
  assert.equal(rowsFor(sr, "SharedAccess", "sharer_user_id", "friend-3").length, 1);
});

test("a failed purge keeps the account open, keeps the identity, and reports failure", async () => {
  const sr = makeSr({ failEntities: ["GlucoseReading"] });
  sr.state.users.set(A, { id: A });
  seed(sr, "GlucoseReading", { created_by_id: A });

  const result = await closeAccount(sr, A, noEvents);

  assert.equal(result.ok, false);
  assert.equal(result.code, "purge_incomplete");
  assert.equal(sr.state.users.has(A), true);
  assert.equal(sr.state.calls.some((c) => c.entity === "User" && c.op === "delete"), false);
});

test("a retry after a failed purge completes and does not widen the scope", async () => {
  const sr = makeSr({ failEntities: ["GlucoseReading"] });
  sr.state.users.set(A, { id: A });
  seed(sr, "GlucoseReading", { created_by_id: A });
  seed(sr, "UserSettings", { created_by_id: A });

  await closeAccount(sr, A, noEvents);
  sr.state.failEntities.clear();
  const second = await closeAccount(sr, A, noEvents);

  assert.equal(second.ok, true);
  const plan = new Set(deletionQueries(A).map((q) => JSON.stringify([q.entity, q.query])));
  const performed = sr.state.calls
    .filter((c) => c.op === "deleteMany")
    .map((c) => JSON.stringify([c.entity, c.query]));
  for (const call of performed) {
    assert.ok(plan.has(call), `unplanned delete: ${call}`);
  }
  assert.equal(sr.state.users.has(A), false);
});

test("an identity that survives the delete call is never reported as success", async () => {
  const sr = makeSr({ noopUserDelete: true });
  sr.state.users.set(A, { id: A });
  seed(sr, "UserSettings", { created_by_id: A });

  const result = await closeAccount(sr, A, noEvents);

  assert.equal(result.ok, false);
  assert.equal(result.code, "identity_removal_failed");
  assert.equal(sr.state.users.has(A), true);
  assert.equal(await deleteAuthIdentity(sr, A), false);
});

test("a write that lands while the identity is being removed is swept afterwards", async () => {
  let recreated = false;
  const sr = makeSr({
    recreateOnUserDelete: (state) => {
      // Stands in for an in-flight settings save from a still-open screen.
      recreated = true;
      state.rows.push({ entity: "UserSettings", data: { created_by_id: A, user_id: A } });
      state.rows.push({ entity: "UserAcknowledgment", data: { created_by_id: A } });
    },
  });
  sr.state.users.set(A, { id: A });

  const result = await closeAccount(sr, A, noEvents);

  assert.equal(recreated, true);
  assert.equal(result.ok, true);
  assert.equal(rowsFor(sr, "UserSettings", "created_by_id", A).length, 0);
  assert.equal(rowsFor(sr, "UserAcknowledgment", "created_by_id", A).length, 0);

  const identityIndex = sr.state.calls.findIndex((c) => c.entity === "User" && c.op === "delete");
  const lastSweepIndex = sr.state.calls
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.op === "deleteMany" && c.entity === "UserSettings")
    .pop().i;
  assert.ok(lastSweepIndex > identityIndex, "sweep must run after the identity is removed");
});

test("the pipeline is safe to repeat: a second run finds nothing and deletes nothing", async () => {
  const sr = makeSr();
  sr.state.users.set(A, { id: A });
  seed(sr, "InsulinDose", { created_by_id: A });

  assert.equal((await closeAccount(sr, A, noEvents)).ok, true);
  const rowsAfterFirst = sr.state.rows.length;
  const second = await closeAccount(sr, A, noEvents);

  assert.equal(second.ok, true);
  assert.equal(second.residual, 0);
  assert.equal(sr.state.rows.length, rowsAfterFirst);
});

test("purge and sweep report the failing step instead of throwing", async () => {
  const sr = makeSr({ failEntities: ["LatestLocation"] });
  sr.state.users.set(A, { id: A });

  const purge = await purgeUserData(sr, A);
  assert.ok(purge.failed.some((f) => f.label.startsWith("LatestLocation")));
  assert.equal(purge.failed[0].code, "unknown");

  const residualFailures = await sweepRecreatedRecords(sr, A);
  assert.ok(residualFailures.some((f) => f.label.startsWith("LatestLocation")));
});

test("every close reports its outcome to the audit callback", async () => {
  const seen = [];
  const sr = makeSr();
  sr.state.users.set(A, { id: A });
  await closeAccount(sr, A, async (action, metadata) => {
    seen.push({ action, metadata });
  });
  assert.equal(seen.at(-1).action, "account_deleted");
  assert.equal(seen.at(-1).metadata.residual_steps, 0);
});