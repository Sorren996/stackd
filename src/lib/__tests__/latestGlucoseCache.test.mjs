// Tests for the between-launch reading cache: ownership and freshness.
//
// Run with:
//   node --test --experimental-strip-types src/lib/__tests__/
//
// Synthetic readings only — no patient data, no network, no database.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

function installLocalStorage() {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    dispatchEvent: () => true,
  };
  return store;
}

const {
  LATEST_GLUCOSE_CACHE_KEY,
  LATEST_GLUCOSE_CACHE_META_KEY,
  LOCAL_CACHE_OWNER_KEY,
  clearCachedLatestGlucose,
  readCachedLatestGlucose,
  readCachedLatestGlucoseSavedAt,
  readStoredCacheOwner,
  writeCachedLatestGlucose,
} = await import("../latestGlucoseCache.js");

const READING = {
  id: "reading-1",
  value: 142,
  source: "dexcom_share",
  recorded_at: "2026-11-06T09:00:00.000Z",
};

describe("latest glucose cache", () => {
  let store;

  beforeEach(() => {
    store = installLocalStorage();
  });

  test("nothing is written without a known account", () => {
    writeCachedLatestGlucose(READING);
    assert.equal(store.get(LATEST_GLUCOSE_CACHE_KEY), undefined);
    assert.deepEqual(readCachedLatestGlucose(), []);
  });

  test("a reading is read back for the account that saved it", () => {
    store.set(LOCAL_CACHE_OWNER_KEY, "user-a");
    writeCachedLatestGlucose(READING);

    assert.equal(readStoredCacheOwner(), "user-a");
    assert.deepEqual(readCachedLatestGlucose(), [READING]);
    assert.ok(readCachedLatestGlucoseSavedAt() > 0);
  });

  test("another account on the same device never receives it", () => {
    store.set(LOCAL_CACHE_OWNER_KEY, "user-a");
    writeCachedLatestGlucose(READING);

    // The device is handed to a second person without a logout.
    store.set(LOCAL_CACHE_OWNER_KEY, "user-b");
    assert.deepEqual(readCachedLatestGlucose(), []);
    assert.equal(readCachedLatestGlucoseSavedAt(), 0);
  });

  test("a cache with no recorded owner is never used", () => {
    // A reading left behind by an older build, with no owner stamp.
    store.set(LATEST_GLUCOSE_CACHE_KEY, JSON.stringify(READING));
    store.set(LOCAL_CACHE_OWNER_KEY, "user-a");

    assert.deepEqual(readCachedLatestGlucose(), []);
  });

  test("one account's reading is never re-stamped as another's", () => {
    store.set(LOCAL_CACHE_OWNER_KEY, "user-a");
    writeCachedLatestGlucose(READING);

    store.set(LOCAL_CACHE_OWNER_KEY, "user-b");
    writeCachedLatestGlucose({ ...READING, id: "reading-2" });

    // The stale owner stamp stays, so user-b still reads nothing.
    assert.deepEqual(readCachedLatestGlucose("user-b"), []);
  });

  test("the saved time is separate from the measurement time", () => {
    store.set(LOCAL_CACHE_OWNER_KEY, "user-a");
    writeCachedLatestGlucose(READING);

    const savedAt = readCachedLatestGlucoseSavedAt();
    const measuredAt = new Date(readCachedLatestGlucose()[0].recorded_at).getTime();

    // Saving an old observation does not make it new: the measurement keeps
    // its own, older timestamp.
    assert.ok(savedAt > measuredAt);
    assert.equal(new Date(READING.recorded_at).getTime(), measuredAt);
  });

  test("an old observation carries an old saved time, so it is immediately stale", () => {
    store.set(LOCAL_CACHE_OWNER_KEY, "user-a");
    store.set(
      LATEST_GLUCOSE_CACHE_KEY,
      JSON.stringify(READING)
    );
    store.set(
      LATEST_GLUCOSE_CACHE_META_KEY,
      JSON.stringify({ ownerId: "user-a", savedAt: Date.now() - 60 * 60 * 1000 })
    );

    const savedAt = readCachedLatestGlucoseSavedAt();
    assert.ok(Date.now() - savedAt >= 30 * 1000);
  });

  test("clearing removes both the reading and its stamp", () => {
    store.set(LOCAL_CACHE_OWNER_KEY, "user-a");
    writeCachedLatestGlucose(READING);

    clearCachedLatestGlucose();

    assert.equal(store.get(LATEST_GLUCOSE_CACHE_KEY), undefined);
    assert.equal(store.get(LATEST_GLUCOSE_CACHE_META_KEY), undefined);
    assert.deepEqual(readCachedLatestGlucose(), []);
  });
});