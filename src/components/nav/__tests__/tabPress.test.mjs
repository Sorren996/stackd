// Bottom-nav tab taps — a tab is a destination, not a bookmark.
//
// These tests pin the reset rules that were the regression: tapping Journal
// while a day or week view was open had to land on the main Journal page (and
// scroll to the top), and the app must never restore a saved sub-path.

import test from "node:test";
import assert from "node:assert/strict";

import { resolveTabPress } from "../tabPress.js";

const press = (pathname, search, tabPath) => resolveTabPress({ pathname, search, tabPath });

test("a Journal day view resets to the main Journal page", () => {
  assert.deepEqual(press("/history", "?day=2026-11-11", "/history"), {
    to: "/history",
    replace: true,
  });
});

test("a Journal week view resets to the main Journal page", () => {
  assert.deepEqual(press("/history", "?month=2026-11", "/history"), {
    to: "/history",
    replace: true,
  });
});

test("a settings sub-page resets to the Profile main page", () => {
  assert.deepEqual(press("/settings/dexcom", "", "/settings"), {
    to: "/settings",
    replace: true,
  });
});

test("tapping the tab you are exactly on only scrolls, never navigates", () => {
  assert.deepEqual(press("/history", "", "/history"), { to: null, replace: false });
  assert.deepEqual(press("/", "", "/"), { to: null, replace: false });
  assert.deepEqual(press("/settings", "", "/settings"), { to: null, replace: false });
});

test("a tab's main page carrying a query is cleaned up, not re-entered", () => {
  assert.deepEqual(press("/", "?ref=card", "/"), { to: "/", replace: true });
});

test("switching tabs goes to the other tab's main page and stacks an entry", () => {
  assert.deepEqual(press("/", "", "/history"), { to: "/history", replace: false });
  assert.deepEqual(press("/settings/dexcom", "", "/history"), { to: "/history", replace: false });
  assert.deepEqual(press("/history", "?day=2026-11-11", "/"), { to: "/", replace: false });
});

test("a non-tab route is never treated as the tab root", () => {
  assert.deepEqual(press("/insights", "", "/"), { to: "/", replace: false });
  assert.deepEqual(press("/split-plan/abc", "", "/history"), { to: "/history", replace: false });
});

test("a similarly-prefixed route is not mistaken for a sub-page", () => {
  assert.deepEqual(press("/historyx", "", "/"), { to: "/", replace: false });
  assert.deepEqual(press("/history-foo", "", "/history"), { to: "/history", replace: false });
});