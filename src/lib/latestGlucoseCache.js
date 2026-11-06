// The one place the newest reading is kept between launches.
//
// Two facts travel with the reading: the account it belongs to and the moment
// this device saved it. A cached reading is only ever handed back to the
// account that saved it, and its saved time is given to React Query as the
// data's age — so an old observation rehydrated on a cold start is immediately
// stale and revalidates, rather than passing as fresh.
//
// The reading's own `recorded_at` stays the measurement time. The saved time
// says only when this device last confirmed it; neither is ever rewritten to
// make old data look new.

export const LATEST_GLUCOSE_CACHE_KEY = "latest_glucose_cache";
export const LATEST_GLUCOSE_CACHE_META_KEY = "latest_glucose_cache_meta";
export const LOCAL_CACHE_OWNER_KEY = "stackd_local_cache_owner";

function storage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readMeta() {
  const store = storage();
  if (!store) return null;
  try {
    return JSON.parse(store.getItem(LATEST_GLUCOSE_CACHE_META_KEY) || "null");
  } catch {
    return null;
  }
}

/** The account the device-side cache currently belongs to, if known. */
export function readStoredCacheOwner() {
  const store = storage();
  if (!store) return null;
  return store.getItem(LOCAL_CACHE_OWNER_KEY) || null;
}

/**
 * The cached reading, or an empty list when there is none, when it has no
 * recorded owner, or when it belongs to a different account.
 */
export function readCachedLatestGlucose(ownerId = readStoredCacheOwner()) {
  const store = storage();
  if (!store || !ownerId) return [];

  const meta = readMeta();
  if (!meta || meta.ownerId !== ownerId) return [];

  try {
    const reading = JSON.parse(store.getItem(LATEST_GLUCOSE_CACHE_KEY) || "null");
    return reading?.recorded_at ? [reading] : [];
  } catch {
    return [];
  }
}

/** When this device saved the cached reading (0 when there is none). */
export function readCachedLatestGlucoseSavedAt(ownerId = readStoredCacheOwner()) {
  const meta = readMeta();
  if (!meta || !ownerId || meta.ownerId !== ownerId) return 0;
  return Number.isFinite(meta.savedAt) ? meta.savedAt : 0;
}

/**
 * Saves a real measurement for the next launch. Nothing is written without a
 * known owner, so a reading can never be stamped as another account's.
 */
export function writeCachedLatestGlucose(reading) {
  const store = storage();
  const ownerId = readStoredCacheOwner();
  if (!store || !ownerId || !reading?.recorded_at) return;

  const meta = readMeta();
  if (meta && meta.ownerId !== ownerId) return;

  try {
    store.setItem(LATEST_GLUCOSE_CACHE_KEY, JSON.stringify(reading));
    store.setItem(
      LATEST_GLUCOSE_CACHE_META_KEY,
      JSON.stringify({ ownerId, savedAt: Date.now() })
    );
    window.dispatchEvent(new Event("latest-glucose-updated"));
  } catch {
    // Storage is optional; the live query remains the source of truth.
  }
}

export function clearCachedLatestGlucose() {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(LATEST_GLUCOSE_CACHE_KEY);
    store.removeItem(LATEST_GLUCOSE_CACHE_META_KEY);
  } catch {
    // Ignore storage failures.
  }
}