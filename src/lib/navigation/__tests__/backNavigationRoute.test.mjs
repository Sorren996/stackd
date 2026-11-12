import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryRouter } from "react-router-dom";
import { emptyLedger, recordNavigation, resolveBack, parseLedger, serializeLedger } from "../backLedger.js";

/**
 * Route integration: drives the real React Router (memory history) and feeds
 * the ledger from what the router actually reports, so the ledger is checked
 * against genuine PUSH / REPLACE / POP behaviour rather than a mock.
 */
function harness(initialEntries = ["/"], { initialIndex, restored } = {}) {
  const router = createMemoryRouter([{ path: "*", element: null }], { initialEntries, initialIndex });
  let ledger = restored || emptyLedger("u1", "patient");

  const record = (state) => {
    const loc = state.location;
    ledger = recordNavigation(ledger, {
      href: `${loc.pathname}${loc.search}${loc.hash}`,
      key: loc.key,
      type: state.historyAction,
      userId: "u1",
      mode: "patient",
    });
  };

  record(router.state);
  router.subscribe(record);

  const here = () => {
    const loc = router.state.location;
    return `${loc.pathname}${loc.search}`;
  };

  const goBack = async (fallback = "/history") => {
    const decision = resolveBack(ledger);
    if (decision.action === "pop") {
      await router.navigate(-1);
      return "pop";
    }
    await router.navigate(fallback, { replace: true });
    return "fallback";
  };

  return { router, goBack, here, ledger: () => ledger };
}

test("Journal -> Week -> Day unwinds in reverse order through the real router", async () => {
  const h = harness(["/"]);
  await h.router.navigate("/history");
  await h.router.navigate("/history?month=2026-11");
  await h.router.navigate("/history?month=2026-11&day=2026-11-05");

  assert.equal(await h.goBack(), "pop");
  assert.equal(h.here(), "/history?month=2026-11");

  assert.equal(await h.goBack(), "pop");
  assert.equal(h.here(), "/history");

  assert.equal(await h.goBack(), "pop");
  assert.equal(h.here(), "/");

  // Nothing left to unwind: the documented fallback replaces, never stacks.
  assert.equal(await h.goBack("/history"), "fallback");
  assert.equal(h.here(), "/history");
});

test("Insights -> Day -> Back returns to Insights with its period intact", async () => {
  const h = harness(["/insights"]);
  await h.router.navigate("/history?day=2026-11-05");

  assert.equal(await h.goBack(), "pop");
  assert.equal(h.here(), "/insights");
});

test("day chevron paging replaces, so Back still lands on the week", async () => {
  const h = harness(["/history?month=2026-11"]);
  await h.router.navigate("/history?month=2026-11&day=2026-11-05");
  await h.router.navigate("/history?month=2026-11&day=2026-11-04", { replace: true });
  await h.router.navigate("/history?month=2026-11&day=2026-11-03", { replace: true });

  assert.equal(await h.goBack(), "pop");
  assert.equal(h.here(), "/history?month=2026-11");
});

test("browser Back then Forward keeps the ledger aligned, with no loop", async () => {
  const h = harness(["/history"]);
  await h.router.navigate("/history?month=2026-11");
  await h.router.navigate("/history?month=2026-11&day=2026-11-05");

  await h.router.navigate(-1);
  assert.equal(h.here(), "/history?month=2026-11");
  assert.equal(h.ledger().index, 1);

  await h.router.navigate(1);
  assert.equal(h.here(), "/history?month=2026-11&day=2026-11-05");
  assert.equal(h.ledger().index, 2);

  // Repeated Back/Forward must alternate cleanly, never revisit the same pair.
  const seen = [];
  for (let i = 0; i < 4; i += 1) {
    await h.router.navigate(-1);
    seen.push(h.here());
    await h.router.navigate(1);
    seen.push(h.here());
  }
  assert.deepEqual(seen, [
    "/history?month=2026-11",
    "/history?month=2026-11&day=2026-11-05",
    "/history?month=2026-11",
    "/history?month=2026-11&day=2026-11-05",
    "/history?month=2026-11",
    "/history?month=2026-11&day=2026-11-05",
    "/history?month=2026-11",
    "/history?month=2026-11&day=2026-11-05",
  ]);
});

test("a replace redirect does not hide the real previous page", async () => {
  const h = harness(["/"]);
  await h.router.navigate("/history");
  await h.router.navigate("/history?month=2026-11", { replace: true });
  assert.equal(h.ledger().entries.length, 2);

  assert.equal(await h.goBack(), "pop");
  assert.equal(h.here(), "/");
});

test("identical pushes are de-duplicated but distinct same-path views are kept", async () => {
  const h = harness(["/history?month=2026-11"]);
  await h.router.navigate("/history?month=2026-11");
  assert.equal(h.ledger().entries.length, 1);

  await h.router.navigate("/history?month=2026-10");
  assert.equal(h.ledger().entries.length, 2);
  assert.equal(await h.goBack(), "pop");
  assert.equal(h.here(), "/history?month=2026-11");
});

test("a direct deep link has no internal previous page", async () => {
  const h = harness(["/history?day=2026-11-05"]);
  assert.equal(await h.goBack(), "fallback");
  assert.equal(h.here(), "/history");
});

test("reloading on a day view keeps the real previous page", async () => {
  const first = harness(["/"]);
  await first.router.navigate("/history");
  await first.router.navigate("/history?month=2026-11");
  await first.router.navigate("/history?month=2026-11&day=2026-11-05");
  const stored = parseLedger(serializeLedger(first.ledger()), { userId: "u1", mode: "patient" });

  // A same-tab reload: the browser keeps the stack, the router re-keys every
  // entry, and the ledger comes back from sessionStorage.
  const reloaded = harness(
    ["/", "/history", "/history?month=2026-11", "/history?month=2026-11&day=2026-11-05"],
    { initialIndex: 3, restored: stored }
  );
  assert.equal(await reloaded.goBack(), "pop");
  assert.equal(reloaded.here(), "/history?month=2026-11");
});

test("a reload on an address the ledger never recorded is untrusted", async () => {
  const stored = parseLedger(
    serializeLedger({
      userId: "u1",
      mode: "patient",
      entries: [{ href: "/", key: "k0" }, { href: "/history", key: "k1" }],
      index: 1,
    }),
    { userId: "u1", mode: "patient" }
  );

  const h = harness(["/analytics"], { restored: stored });
  assert.equal(await h.goBack("/history"), "fallback");
  assert.equal(h.here(), "/history");
});

test("rapid repeated Back cannot skip a page or loop", async () => {
  const h = harness(["/"]);
  await h.router.navigate("/history");
  await h.router.navigate("/history?month=2026-11");
  await h.router.navigate("/history?month=2026-11&day=2026-11-05");

  const visited = [];
  for (let i = 0; i < 5; i += 1) {
    await h.goBack();
    visited.push(h.here());
  }
  assert.deepEqual(visited.slice(0, 3), ["/history?month=2026-11", "/history", "/"]);
  // After the stack is exhausted the fallback repeats deterministically.
  assert.equal(visited.at(-1), "/history");
});