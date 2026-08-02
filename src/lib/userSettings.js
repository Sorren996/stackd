import { base44 } from "@/api/base44Client";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { SUPPORTIVE_ERRORS } from "@/lib/supportiveErrors";

// Local storage keys that mirror server-side UserSettings fields.
// Used only as a temporary cache scoped to the authenticated user.
const LOCAL_KEYS = [
  "insulin_sensitivity_mgdl_per_unit",
  "correction_target_glucose",
  "meal_insulin_units_per_5g",
  "meal_insulin_types",
  "insulin_library",
  "meal_prebolus_window_minutes",
  "meal_postbolus_window_minutes",
  "meal_outcome_window_minutes",
  "target_range_low",
  "target_range_high",
  "stacking_alerts_enabled",
  "coach_reviews_enabled",
  "coach_insight_notifications_enabled",
  "coach_exclude_journal",
];

function getDefaultMealInsulinTypes() {
  return Object.entries(INSULIN_PROFILES)
    .filter(([, profile]) => ["Rapid-Acting", "Short-Acting"].includes(profile.category))
    .map(([name]) => name);
}

function getDefaultInsulinLibrary() {
  return Object.keys(INSULIN_PROFILES);
}

/**
 * Read current local-storage settings into a plain object.
 * Returns only keys that actually exist in localStorage.
 */
function readLocalSettings() {
  const result = {};
  for (const key of LOCAL_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;

    if (key === "meal_insulin_types" || key === "insulin_library") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) result[key] = parsed;
      } catch {}
    } else if (["stacking_alerts_enabled", "coach_reviews_enabled", "coach_insight_notifications_enabled", "coach_exclude_journal"].includes(key)) {
      result[key] = raw === "true";
    } else {
      const num = Number(raw);
      if (Number.isFinite(num) && num > 0) result[key] = num;
    }
  }
  return result;
}

/**
 * Validate a settings object before saving to the server.
 * Returns { valid, sanitized } where invalid fields are dropped.
 */
function validateSettings(raw) {
  const sanitized = {};
  const fields = [
    "insulin_sensitivity_mgdl_per_unit",
    "correction_target_glucose",
    "meal_insulin_units_per_5g",
    "meal_prebolus_window_minutes",
    "meal_postbolus_window_minutes",
    "meal_outcome_window_minutes",
    "target_range_low",
    "target_range_high",
  ];

  for (const field of fields) {
    if (raw[field] === undefined || raw[field] === null || raw[field] === "") continue;
    const num = Number(raw[field]);
    if (Number.isFinite(num) && num > 0) {
      sanitized[field] = num;
    }
  }

  // Validate ranges
  if (sanitized.target_range_low && sanitized.target_range_high) {
    if (sanitized.target_range_low >= sanitized.target_range_high) {
      delete sanitized.target_range_low;
      delete sanitized.target_range_high;
    }
  }
  if (sanitized.target_range_low && (sanitized.target_range_low < 40 || sanitized.target_range_low > 200)) {
    delete sanitized.target_range_low;
  }
  if (sanitized.target_range_high && (sanitized.target_range_high < 100 || sanitized.target_range_high > 300)) {
    delete sanitized.target_range_high;
  }

  if (Array.isArray(raw.meal_insulin_types) && raw.meal_insulin_types.length) {
    sanitized.meal_insulin_types = raw.meal_insulin_types;
  }

  if (Array.isArray(raw.insulin_library) && raw.insulin_library.length) {
    sanitized.insulin_library = raw.insulin_library;
  }

  if (typeof raw.stacking_alerts_enabled === "boolean") {
    sanitized.stacking_alerts_enabled = raw.stacking_alerts_enabled;
  }

  if (typeof raw.coach_reviews_enabled === "boolean") {
    sanitized.coach_reviews_enabled = raw.coach_reviews_enabled;
  }

  if (typeof raw.coach_insight_notifications_enabled === "boolean") {
    sanitized.coach_insight_notifications_enabled = raw.coach_insight_notifications_enabled;
  }

  if (typeof raw.coach_exclude_journal === "boolean") {
    sanitized.coach_exclude_journal = raw.coach_exclude_journal;
  }

  if (raw.glucose_units === "mg/dL" || raw.glucose_units === "mmol/L") {
    sanitized.glucose_units = raw.glucose_units;
  }

  // Pass through username for backend identification (not validated numerically)
  if (typeof raw.username === "string" && raw.username.trim()) {
    sanitized.username = raw.username.trim();
  }

  return { valid: Object.keys(sanitized).length > 0, sanitized };
}

/**
 * Write settings back to localStorage as a user-scoped cache.
 */
export function cacheSettingsLocally(userId, settings) {
  if (!userId) return;
  for (const key of LOCAL_KEYS) {
    if (settings[key] === undefined || settings[key] === null) continue;
    const val = settings[key];
    if (typeof val === "boolean") {
      localStorage.setItem(key, val ? "true" : "false");
    } else if (Array.isArray(val)) {
      localStorage.setItem(key, JSON.stringify(val));
    } else {
      localStorage.setItem(key, String(val));
    }
  }
}

/**
 * Remove all cached clinical settings from localStorage.
 * Called during logout and account switching.
 */
export function clearLocalSettingsCache() {
  for (const key of LOCAL_KEYS) {
    localStorage.removeItem(key);
  }
  localStorage.removeItem("latest_glucose_cache");
}

/**
 * Load the authenticated user's settings from the server.
 * Returns null if no settings record exists yet.
 */
export async function loadUserSettings() {
  try {
    const records = await base44.entities.UserSettings.list("-created_date", 1);
    return records && records.length > 0 ? records[0] : null;
  } catch (error) {
    console.error("Failed to load user settings:", error);
    throw new Error(SUPPORTIVE_ERRORS.load);
  }
}

/**
 * Save settings to the server. Creates a new record if none exists,
 * or updates the existing one.
 * Returns the saved record from the server.
 */
export async function saveUserSettings(settingsData) {
  const { valid, sanitized } = validateSettings(settingsData);
  if (!valid) {
    throw new Error("Please check your entries — some values need adjustment before saving.");
  }

  const existing = await loadUserSettings();

  let saved;
  if (existing) {
    saved = await base44.entities.UserSettings.update(existing.id, sanitized);
  } else {
    saved = await base44.entities.UserSettings.create(sanitized);
  }

  return saved;
}

/**
 * One-time migration of local-storage settings into the user's server-side account.
 * Only runs if local settings exist and no server record exists yet.
 * After successful migration, local storage remains as cache but server is authoritative.
 */
export async function migrateLocalSettingsIfNeeded() {
  const localSettings = readLocalSettings();
  if (Object.keys(localSettings).length === 0) return null;

  const existing = await loadUserSettings();
  if (existing) {
    // Server record already exists — local settings are stale cache, mark migrated
    return existing;
  }

  // No server record but local settings exist — migrate
  const { valid, sanitized } = validateSettings(localSettings);
  if (!valid) return null;

  try {
    // Attach username during migration for backend identification
    try {
      const user = await base44.auth.me();
      if (user?.full_name || user?.email) {
        sanitized.username = user.full_name || user.email;
      }
    } catch {
      // Non-fatal — username is optional
    }

    const saved = await base44.entities.UserSettings.create({
      ...sanitized,
      settings_migrated_from_local: true,
    });
    return saved;
  } catch (error) {
    console.error("Settings migration failed:", error);
    return null;
  }
}

export { getDefaultMealInsulinTypes, getDefaultInsulinLibrary, LOCAL_KEYS };