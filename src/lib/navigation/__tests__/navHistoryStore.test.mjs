import test from "node:test";
import assert from "node:assert/strict";
import {
  trackNavigation,
  requestBack,
  resetNavigation,
  getLedger,
  __resetForTests,
} from "../navHistoryStore.js";

const track = (href, key, type = "PUSH") =>
  trackNavigation({ href, key, type, userId: "u1", mode: "patient" });

test("a rapid double tap only unwinds one page", () => {
  __resetForTests();
  track("/", "k0");
  track("/history", "k1");

  assert.equal(requestBack(1000).action, "pop");
  // Second press arrives before the router has settled the first unwind.
  assert.equal(requestBack(1050).action, "suppressed");

  // Once the POP is recorded, the next press is a real decision again.
  track("/", "k0", "POP");
  assert.equal(requestBack(1200).action, "fallback");
});

test("logout clears the remembered route path", () => {
  __resetForTests();
  track("/", "k0");
  track("/history", "k1");

  resetNavigation();
  assert.equal(getLedger().entries.length, 0);
  assert.equal(requestBack().action, "fallback");
});

test("a different account never inherits the previous path", () => {
  __resetForTests();
  track("/", "k0");
  track("/history", "k1");

  trackNavigation({ href: "/", key: "a0", type: "PUSH", userId: "u2", mode: "patient" });
  assert.equal(getLedger().userId, "u2");
  assert.equal(getLedger().entries.length, 1);
  assert.equal(requestBack().action, "fallback");
});

test("no account means nothing is remembered", () => {
  __resetForTests();
  trackNavigation({ href: "/history", key: "k0", type: "PUSH", userId: "", mode: "patient" });
  assert.equal(getLedger().entries.length, 0);
  assert.equal(requestBack().action, "fallback");
});