// Safety tests for the owner's sharing actions: pause, resume and withdrawal.
//
// Run with:
//   node --test --experimental-strip-types src/lib/sharing/__tests__/*.test.mjs
//
// Fabricated fixtures only. No network, no database, no messages, no health
// records, and no real relationship is ever touched.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ACTION_TIMEOUT_MS, withTimeout, createSubmissionGate } from "../pendingAction.js";
import { reconcileSelection } from "../relationshipSelection.js";
import { describeSharingError } from "../sharingErrorCopy.js";

const relationship = (over = {}) => ({
  id: "rel_1",
  invited_email: "person@example.com",
  status: "active",
  permission_version: 3,
  scopes: { glucose: true, insulin: false, location: false, urgent_low_call: false },
  alert_scopes: { urgent_low_email: false, urgent_low_sms: false },
  ...over,
});

/**
 * The exact lifecycle the sheet runs, with the backend action replaced by a
 * fixture so failure, stalling and double taps can be driven deliberately.
 */
function makeRunner({ send, onPendingChange, timeoutMs = ACTION_TIMEOUT_MS }) {
  const gate = createSubmissionGate();
  let sends = 0;
  const run = async (action) => {
    if (!gate.enter()) return { status: "ignored" }; // a second tap is dropped
    sends += 1;
    onPendingChange?.(true);
    try {
      const data = await withTimeout(send(action), timeoutMs);
      return { status: "ok", data };
    } catch (error) {
      return { status: error?.reason === "timeout" ? "timeout" : "failed", error };
    } finally {
      gate.exit();
      onPendingChange?.(false);
    }
  };
  return { run, sends: () => sends, isPending: () => gate.isPending() };
}

describe("pause", () => {
  test("the paused state shown is the server's own answer, never assumed", async () => {
    const states = [];
    const runner = makeRunner({
      send: async () => ({ relationship: relationship({ status: "paused", permission_version: 4 }) }),
      onPendingChange: (p) => states.push(p),
    });

    const outcome = await runner.run("pause");

    assert.equal(outcome.status, "ok");
    assert.equal(outcome.data.relationship.status, "paused");
    assert.equal(outcome.data.relationship.permission_version, 4);
    assert.deepEqual(states, [true, false]); // pending, then always released
  });

  test("a paused relationship still grants nothing if the change is refused", async () => {
    const runner = makeRunner({
      send: async () => {
        const error = new Error("not_active");
        error.reason = "not_active";
        throw error;
      },
    });

    const outcome = await runner.run("pause");

    assert.equal(outcome.status, "failed");
    assert.equal(runner.isPending(), false);
    assert.equal(describeSharingError(outcome.error), "Sharing is not running for this person right now.");
  });
});

describe("resume", () => {
  test("a paused relationship returns to active on the server's confirmation", async () => {
    const runner = makeRunner({
      send: async (action) => ({ relationship: relationship({ status: action === "resume" ? "active" : "paused" }) }),
    });

    const outcome = await runner.run("resume");

    assert.equal(outcome.status, "ok");
    assert.equal(outcome.data.relationship.status, "active");
    assert.equal(runner.isPending(), false);
  });
});

describe("withdrawal", () => {
  test("withdrawing keeps the server's terminal state and releases the controls", async () => {
    const states = [];
    const runner = makeRunner({
      send: async () => ({ relationship: relationship({ status: "revoked", scopes: {} }) }),
      onPendingChange: (p) => states.push(p),
    });

    const outcome = await runner.run("revoke");

    assert.equal(outcome.status, "ok");
    assert.equal(outcome.data.relationship.status, "revoked");
    assert.deepEqual(states, [true, false]);
  });

  test("a withdrawal that fails leaves no success behind and can be tried again", async () => {
    let attempt = 0;
    const runner = makeRunner({
      send: async () => {
        attempt += 1;
        if (attempt === 1) {
          const error = new Error("server_error");
          error.reason = "server_error";
          throw error;
        }
        return { relationship: relationship({ status: "revoked" }) };
      },
    });

    const first = await runner.run("revoke");
    assert.equal(first.status, "failed");
    assert.equal(runner.isPending(), false);

    const second = await runner.run("revoke");
    assert.equal(second.status, "ok"); // the button came back and worked
    assert.equal(runner.sends(), 2);
  });
});

describe("stalled requests are bounded", () => {
  test("a request that never answers cannot leave the action pending forever", async () => {
    const stated = [];
    const runner = makeRunner({
      send: () => new Promise(() => {}), // never settles
      timeoutMs: 40,
      onPendingChange: (p) => stated.push(p),
    });

    const started = Date.now();
    const outcome = await runner.run("pause");
    const elapsed = Date.now() - started;

    assert.equal(outcome.status, "timeout");
    assert.equal(outcome.error.reason, "timeout");
    assert.equal(runner.isPending(), false);
    assert.deepEqual(stated, [true, false]);
    assert.ok(elapsed < 1000, `expected a bounded wait, took ${elapsed}ms`);
    assert.equal(
      describeSharingError(outcome.error),
      "That took too long to come back. Please check your connection and try again."
    );
  });

  test("the default bound is finite", () => {
    assert.ok(Number.isFinite(ACTION_TIMEOUT_MS));
    assert.ok(ACTION_TIMEOUT_MS > 0);
  });

  test("withTimeout passes a prompt answer through untouched", async () => {
    assert.deepEqual(await withTimeout(Promise.resolve({ ok: true }), 50), { ok: true });
  });
});

describe("double taps", () => {
  test("two taps while one is in flight send exactly one request", async () => {
    let resolve;
    const runner = makeRunner({
      send: () => new Promise((r) => { resolve = r; }),
    });

    const first = runner.run("pause");
    const second = await runner.run("pause"); // same tap again, before the answer

    assert.equal(second.status, "ignored");
    assert.equal(runner.sends(), 1);

    resolve({ relationship: relationship({ status: "paused" }) });
    assert.equal((await first).status, "ok");
    assert.equal(runner.sends(), 1);
    assert.equal(runner.isPending(), false);
  });

  test("a tap straight after a completed action is allowed through", async () => {
    const runner = makeRunner({ send: async () => ({ relationship: relationship({ status: "paused" }) }) });

    await runner.run("pause");
    await runner.run("resume");

    assert.equal(runner.sends(), 2);
  });
});

describe("selection stays honest", () => {
  test("a relationship still in the list stays selected", () => {
    const list = [relationship(), relationship({ id: "rel_2", status: "paused" })];
    assert.equal(reconcileSelection(list, "rel_2"), "rel_2");
  });

  test("a relationship that has left the list is not selected any more", () => {
    const list = [relationship({ id: "rel_2" })];
    assert.equal(reconcileSelection(list, "rel_1"), null);
  });

  test("the last relationship removed clears the selection", () => {
    assert.equal(reconcileSelection([], "rel_1"), null);
    assert.equal(reconcileSelection([], null), null);
    assert.equal(reconcileSelection(undefined, "rel_1"), null);
  });
});