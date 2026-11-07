// Banner placement: one shared top edge, derived from the real safe area and the
// fixed header, used by both renderers — and never a hardcoded device height.
//
// Run with:
//   node --test src/lib/__tests__/notificationPlacement.test.mjs
//
// The source assertions guard the two things that produced the reported bug:
// a `fixed top-0` container with no inset, and a Sonner toaster left on its
// default position with no offset.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BANNER_HEADER_GAP_PX,
  BANNER_MAX_HEIGHT,
  BANNER_SIDE_LEFT,
  BANNER_SIDE_RIGHT,
  BANNER_SONNER_OFFSET,
  BANNER_TOP,
} from "../notificationPlacement.js";
import { HEADER_BAR_PX } from "../layoutMetrics.js";

const source = (relative) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

const countOf = (haystack, needle) => haystack.split(needle).length - 1;

// Comments talk about the old `fixed top-0` box; only real classes should count.
const codeOnly = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("the top edge is the safe area, then the header bar, then a small gap", () => {
  assert.equal(
    BANNER_TOP,
    `calc(env(safe-area-inset-top) + ${HEADER_BAR_PX + BANNER_HEADER_GAP_PX}px)`
  );
});

test("the inset is applied exactly once per axis, never doubled", () => {
  assert.equal(countOf(BANNER_TOP, "env("), 1, "top reads one inset");
  assert.equal(countOf(BANNER_SIDE_LEFT, "env("), 1, "left reads one inset");
  assert.equal(countOf(BANNER_SIDE_RIGHT, "env("), 1, "right reads one inset");
});

test("sides keep a minimum margin and follow the landscape cut-out inset", () => {
  for (const value of [BANNER_SIDE_LEFT, BANNER_SIDE_RIGHT]) {
    assert.match(value, /^max\(\d+px, env\(safe-area-inset-(left|right)\)\)$/);
  }
});

test("no device height is hardcoded anywhere in the placement", () => {
  const values = [BANNER_TOP, BANNER_SIDE_LEFT, BANNER_SIDE_RIGHT, BANNER_MAX_HEIGHT];
  for (const value of values) {
    for (const deviceHeight of ["44px", "47px", "59px", "62px", "1024px", "844px"]) {
      assert.equal(value.includes(deviceHeight), false, `${deviceHeight} in ${value}`);
    }
  }
});

test("the stack is capped above the dock and the home indicator", () => {
  assert.equal(countOf(BANNER_MAX_HEIGHT, "env("), 2, "top and bottom insets");
  assert.match(BANNER_MAX_HEIGHT, /env\(safe-area-inset-bottom\)/);
  assert.match(BANNER_MAX_HEIGHT, /100dvh/);
});

test("Sonner receives the same placement for desktop and mobile", () => {
  assert.deepEqual(BANNER_SONNER_OFFSET, {
    top: BANNER_TOP,
    left: BANNER_SIDE_LEFT,
    right: BANNER_SIDE_RIGHT,
  });
});

test("the Sonner toaster is handed the offset and does not rely on its default", () => {
  const sonner = source("../../components/ui/sonner.jsx");
  assert.match(sonner, /offset=\{BANNER_SONNER_OFFSET\}/);
  assert.match(sonner, /mobileOffset=\{BANNER_SONNER_OFFSET\}/);
  assert.match(sonner, /expand/, "a collapsed stack is what overlaps");
  assert.match(sonner, /closeButton/, "a banner must be dismissible by touch");
  // No banner may be positioned by a bare default again.
  assert.doesNotMatch(sonner, /position="top-(left|right)"/);
});

test("the older renderer has one fixed surface, not two, and it uses the shared top", () => {
  const toast = codeOnly(source("../../components/ui/toast.jsx"));
  assert.equal(
    (toast.match(/\bfixed\b/g) || []).length,
    1,
    "exactly one fixed container"
  );
  assert.doesNotMatch(toast, /top-0/, "no un-inset top edge");
  assert.match(toast, /top: BANNER_TOP/);
  assert.match(toast, /maxHeight: BANNER_MAX_HEIGHT/);
  assert.match(toast, /paddingLeft: BANNER_SIDE_LEFT/);
  assert.match(toast, /paddingRight: BANNER_SIDE_RIGHT/);
});

test("messages are rendered inside that fixed surface", () => {
  const toaster = source("../../components/ui/toaster.jsx");
  assert.match(toaster, /<ToastViewport>/);
  assert.ok(
    toaster.indexOf("<ToastViewport>") < toaster.indexOf("toasts.map"),
    "the list must be a child of the viewport"
  );
});

test("no entering animation travels down from above the safe line", () => {
  const toast = source("../../components/ui/toast.jsx");
  assert.doesNotMatch(toast, /slide-in-from-top-full/);
  assert.match(toast, /slide-in-from-top-2/);
});

test("the close control is visible without a hover", () => {
  const toast = source("../../components/ui/toast.jsx");
  const close = toast.slice(toast.indexOf("const ToastClose"), toast.indexOf("const ToastTitle"));
  assert.doesNotMatch(close, /opacity-0/, "a touch screen can never hover");
  assert.match(close, /aria-label=/);
});

test("repeating the delivery test updates one banner instead of stacking two", () => {
  const testUi = source("../../components/settings/AdminTestNotification.jsx");
  const ids = testUi.match(/id: "push-delivery-test"/g) || [];
  assert.equal(ids.length, 2, "both outcomes share the stable banner id");
  // "Request sent" must never become "delivered": the app cannot see the phone.
  assert.doesNotMatch(testUi, /toast\.success\("Test delivered/);
  assert.match(testUi, /toast\.success\("Test sent\./);
});