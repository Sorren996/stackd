// Automated tests for the admin-only native push delivery test.
//
// Run with:
//   node --test --experimental-strip-types base44/shared/__tests__/
//
// Every send here is mocked: no notification is delivered, no credentials are
// used, and no network, database or patient record is touched.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  runTestPushNotification,
  TEST_PUSH_TITLE,
  TEST_PUSH_MESSAGE,
} from "../testPushNotification.ts";

function fakeClient() {
  const calls = [];
  const client = {
    asServiceRole: {
      integrations: {
        Core: {
          SendPushNotification: async (args) => {
            calls.push(args);
            return { ok: true };
          },
        },
      },
    },
  };
  return { client, calls };
}

describe("sendMyTestPushNotification", () => {
  test("anonymous callers are rejected before any service-role use", async () => {
    const { client, calls } = fakeClient();
    const res = await runTestPushNotification(client, null, 1_000_000);
    assert.equal(res.status, 401);
    assert.equal(calls.length, 0);
  });

  test("non-admin accounts are rejected before any service-role use", async () => {
    const { client, calls } = fakeClient();
    const res = await runTestPushNotification(
      client,
      { id: "u-regular-1", role: "user" },
      1_000_000
    );
    assert.equal(res.status, 403);
    assert.equal(calls.length, 0);
  });

  test("an admin send goes to the caller only, with the shared two-line layout and no image or diagnostic fields", async () => {
    const { client, calls } = fakeClient();
    const res = await runTestPushNotification(
      client,
      { id: "u-admin-recipient", role: "admin" },
      2_000_000
    );

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(calls.length, 1);

    assert.equal(TEST_PUSH_TITLE, "145 mg/dL →");
    assert.equal(TEST_PUSH_MESSAGE, "Holding steady");
    assert.deepEqual(calls[0], {
      user_id: "u-admin-recipient",
      title: "145 mg/dL →",
      content: "Holding steady",
      action_url: "https://stackdinsight.base44.app/",
    });
  });

  test("repeated taps are rate limited per account", async () => {
    const { client, calls } = fakeClient();
    const admin = { id: "u-admin-cooldown", role: "admin" };

    await runTestPushNotification(client, admin, 3_000_000);
    const again = await runTestPushNotification(client, admin, 3_001_000);

    assert.equal(again.status, 429);
    assert.match(again.body.error, /try again/i);
    assert.equal(calls.length, 1);
  });

  test("a failed send returns a readable error and frees the cooldown", async () => {
    let attempts = 0;
    const client = {
      asServiceRole: {
        integrations: {
          Core: {
            SendPushNotification: async () => {
              attempts += 1;
              throw new Error("push provider not configured");
            },
          },
        },
      },
    };
    const admin = { id: "u-admin-failure", role: "admin" };

    const first = await runTestPushNotification(client, admin, 4_000_000);
    assert.equal(first.status, 503);
    assert.match(first.body.error, /not available/i);
    assert.equal(first.body.ok, undefined);
    assert.equal(first.body.diagnostic, undefined);

    // The cooldown was released, so a genuine retry is attempted rather than
    // being blocked behind the failed tap.
    const retry = await runTestPushNotification(client, admin, 4_001_000);
    assert.equal(retry.status, 503);
    assert.equal(attempts, 2);
  });
});