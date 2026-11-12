import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyLedger,
  recordNavigation,
  resolveBack,
  isAllowedTarget,
  isInternalHref,
  isAuthHref,
  parseLedger,
  serializeLedger,
  LEDGER_LIMIT,
} from "../backLedger.js";

// A tiny scripted router: PUSH/REPLACE/POP exactly as the router reports them.
function run(steps, { userId = "u1", mode = "patient" } = {}) {
  return steps.reduce(
    (ledger, step) => recordNavigation(ledger, { ...step, userId, mode }),
    emptyLedger(userId, mode)
  );
}

const push = (href, key) => ({ href, key, type: "PUSH" });
const replace = (href, key) => ({ href, key, type: "REPLACE" });
const pop = (href, key) => ({ href, key, type: "POP" });

test("Journal list -> Week -> Day unwinds in reverse order, then falls back", () => {
  const ledger = run([
    push("/", "k0"),
    push("/history", "k1"),
    push("/history?month=2026-11", "k2"),
    push("/history?month=2026-11&day=2026-11-05", "k3"),
  ]);

  assert.deepEqual(resolveBack(ledger), { action: "pop", href: "/history?month=2026-11" });

  const atWeek = recordNavigation(ledger, { ...pop("/history?month=2026-11", "k2"), userId: "u1" });
  assert.deepEqual(resolveBack(atWeek), { action: "pop", href: "/history" });

  const atRoot = recordNavigation(atWeek, { ...pop("/history", "k1"), userId: "u1" });
  assert.deepEqual(resolveBack(atRoot), { action: "pop", href: "/" });

  const atHome = recordNavigation(atRoot, { ...pop("/", "k0"), userId: "u1" });
  assert.equal(resolveBack(atHome).action, "fallback");
});

test("Insights -> Day returns to Insights, not the Journal", () => {
  const ledger = run([push("/insights", "k0"), push("/history?day=2026-11-05", "k1")]);
  assert.deepEqual(resolveBack(ledger), { action: "pop", href: "/insights" });
});

test("date paging REPLACES, so Back from any day returns to its week", () => {
  const ledger = run([
    push("/history", "k0"),
    push("/history?month=2026-11", "k1"),
    // Opening the day is a drill-down…
    push("/history?month=2026-11&day=2026-11-05", "k2"),
    // …then the day chevrons page the date in place.
    replace("/history?month=2026-11&day=2026-11-04", "k3"),
    replace("/history?month=2026-11&day=2026-11-03", "k4"),
    replace("/history?month=2026-11&day=2026-11-02", "k5"),
  ]);

  assert.equal(ledger.index, 2, "paging must not deepen the stack");
  assert.deepEqual(resolveBack(ledger), { action: "pop", href: "/history?month=2026-11" });
});

test("same pathname with a different month/day/query stays distinct", () => {
  const ledger = run([
    push("/history", "k0"),
    push("/history?month=2026-11", "k1"),
    push("/history?month=2026-10", "k2"),
    push("/history?month=2026-10&day=2026-10-30", "k3"),
  ]);
  assert.deepEqual(resolveBack(ledger), { action: "pop", href: "/history?month=2026-10" });
});

test("POP moves the pointer instead of recording a new entry (Back then Forward)", () => {
  const ledger = run([
    push("/history", "k0"),
    push("/history?month=2026-11", "k1"),
    push("/history?month=2026-11&day=2026-11-05", "k2"),
  ]);
  const back = recordNavigation(ledger, { ...pop("/history?month=2026-11", "k1"), userId: "u1" });
  assert.equal(back.index, 1);
  assert.equal(back.entries.length, 3, "Forward entries must survive a Back");

  const forward = recordNavigation(back, {
    ...pop("/history?month=2026-11&day=2026-11-05", "k2"),
    userId: "u1",
  });
  assert.equal(forward.index, 2);
  assert.deepEqual(resolveBack(forward), { action: "pop", href: "/history?month=2026-11" });
});

test("a PUSH after a Back discards forward entries, like a browser", () => {
  const ledger = run([
    push("/history", "k0"),
    push("/history?month=2026-11", "k1"),
    push("/history?month=2026-11&day=2026-11-05", "k2"),
    pop("/history?month=2026-11", "k1"),
    push("/history?month=2026-09", "k9"),
  ]);
  assert.deepEqual(ledger.entries.map((e) => e.href), ["/history", "/history?month=2026-11", "/history?month=2026-09"]);
  assert.equal(ledger.index, 2);
});

test("a same-tab reload keeps provenance when the stored pointer is this page", () => {
  const ledger = run([
    push("/history", "k0"),
    push("/history?month=2026-11", "k1"),
    push("/history?month=2026-11&day=2026-11-05", "k2"),
  ]);
  // Reload: the router restores the same href under a fresh initial key.
  const reloaded = recordNavigation(ledger, { ...pop("/history?month=2026-11&day=2026-11-05", "default"), userId: "u1" });
  assert.equal(reloaded.index, 2);
  assert.deepEqual(resolveBack(reloaded), { action: "pop", href: "/history?month=2026-11" });
});

test("a deep link / new tab cannot invent a previous page", () => {
  const deep = run([pop("/history?day=2026-11-05", "default")]);
  assert.equal(deep.index, 0);
  assert.equal(resolveBack(deep).action, "fallback");

  // An untrusted entry arriving mid-session resets the ledger to this page.
  const ledger = run([
    push("/history", "k0"),
    push("/history?month=2026-11", "k1"),
    pop("/elsewhere", "unknown-key"),
  ]);
  assert.equal(ledger.index, 0);
  assert.equal(resolveBack(ledger).action, "fallback");
});

test("an identical push collapses instead of stacking the same page twice", () => {
  const ledger = run([
    push("/history?month=2026-11", "k0"),
    push("/history?month=2026-11", "k1"),
  ]);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].key, "k1");
  assert.equal(resolveBack(ledger).action, "fallback");
});

test("REPLACE keeps depth, PUSH onto a new page grows it", () => {
  const afterReplace = run([push("/history", "k0"), replace("/history?month=2026-11", "k1")]);
  assert.equal(afterReplace.entries.length, 1);
  assert.equal(resolveBack(afterReplace).action, "fallback");

  const afterPush = recordNavigation(afterReplace, {
    href: "/history?month=2026-11&day=2026-11-05",
    key: "k2",
    type: "PUSH",
    userId: "u1",
  });
  assert.equal(afterPush.entries.length, 2);
});

test("auth boundaries are never a Back target", () => {
  const ledger = run([push("/login", "k0"), push("/history", "k1")]);
  assert.equal(resolveBack(ledger).action, "fallback");
  assert.equal(isAuthHref("/login"), true);
  assert.equal(isAuthHref("/reset-password?token=x"), true);
  assert.equal(isAllowedTarget("/login"), false);
  assert.equal(isAllowedTarget("/reset-password?token=abc"), false);
});

test("external and relative-looking hrefs are refused", () => {
  assert.equal(isInternalHref("https://example.com/history"), false);
  assert.equal(isInternalHref("//example.com"), false);
  assert.equal(isInternalHref("history"), false);
  assert.equal(isInternalHref("/history?day=2026-11-05"), true);
  assert.equal(isAllowedTarget("https://example.com"), false);
});

test("a viewer can only be returned to permitted following surfaces", () => {
  const ledger = run(
    [push("/insights", "k0"), push("/", "k1")],
    { userId: "v1", mode: "follower" }
  );
  assert.equal(resolveBack(ledger).action, "fallback");

  const allowed = run(
    [push("/", "k0"), push("/following/settings", "k1")],
    { userId: "v1", mode: "follower" }
  );
  assert.deepEqual(resolveBack(allowed), { action: "pop", href: "/" });
  assert.equal(isAllowedTarget("/following/notifications", "follower"), true);
  assert.equal(isAllowedTarget("/history", "follower"), false);
});

test("switching account or surface starts a clean ledger", () => {
  const patient = run([push("/", "k0"), push("/history", "k1")], { userId: "u1", mode: "patient" });
  const otherAccount = recordNavigation(patient, {
    href: "/",
    key: "a0",
    type: "PUSH",
    userId: "u2",
    mode: "patient",
  });
  assert.equal(otherAccount.userId, "u2");
  assert.equal(otherAccount.entries.length, 1);
  assert.equal(resolveBack(otherAccount).action, "fallback");

  const switchedSurface = recordNavigation(patient, {
    href: "/",
    key: "f0",
    type: "PUSH",
    userId: "u1",
    mode: "follower",
  });
  assert.equal(switchedSurface.mode, "follower");
  assert.equal(switchedSurface.entries.length, 1);
});

test("the ledger is bounded and keeps the newest entries", () => {
  const steps = [];
  for (let i = 0; i < LEDGER_LIMIT + 10; i += 1) steps.push(push(`/history?month=m${i}`, `k${i}`));
  const ledger = run(steps);
  assert.equal(ledger.entries.length, LEDGER_LIMIT);
  assert.equal(ledger.index, LEDGER_LIMIT - 1);
  assert.equal(ledger.entries.at(-1).href, `/history?month=m${LEDGER_LIMIT + 9}`);
});

test("stored ledgers round-trip and refuse another identity or bad data", () => {
  const ledger = run([push("/", "k0"), push("/history", "k1")]);
  const raw = serializeLedger(ledger);

  assert.deepEqual(parseLedger(raw, { userId: "u1", mode: "patient" }), ledger);
  assert.equal(parseLedger(raw, { userId: "u2", mode: "patient" }), null);
  assert.equal(parseLedger(raw, { userId: "u1", mode: "follower" }), null);
  assert.equal(parseLedger("{", { userId: "u1", mode: "patient" }), null);
  assert.equal(parseLedger(JSON.stringify({ userId: "u1", mode: "patient", entries: [], index: 4 }), {
    userId: "u1",
    mode: "patient",
  }), null);
  assert.equal(parseLedger(JSON.stringify({ userId: "u1", mode: "patient", entries: [{ href: "https://x.test", key: "k" }], index: 0 }), {
    userId: "u1",
    mode: "patient",
  }), null);
});