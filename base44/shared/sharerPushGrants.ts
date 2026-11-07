// Changing one follower's permitted push categories.
//
// Two authorities meet here and stay separate:
//   * the SHARER decides which categories this follower MAY be notified about,
//   * the FOLLOWER alone decides whether to receive any of them, and owns their
//     device token and OS permission.
//
// This module only ever touches the sharer's permission field. It never writes
// a follower preference, never registers a device, and never changes a data
// scope.

import { applySharerGrantPatch, sharerGrants, CATEGORY_KEYS } from "./notificationCore.ts";
import { effectiveStatus } from "./sharingCore.ts";

/** A relationship the sharer may still configure: invited, active or paused. */
const CONFIGURABLE = ["pending", "active", "paused"];

export type GrantUpdatePlan =
  | { grants: Record<string, boolean>; changed: boolean }
  | { error: string; status: number };

/**
 * Decide what a request would do, before anything is written.
 *
 * The category is validated against the canonical list, the value must be a
 * real boolean, and the new grants are merged onto the STORED permission — a
 * request can never describe a whole permission set.
 */
export function planSharerGrantUpdate(
  relationship: any,
  body: { category?: unknown; value?: unknown } | null | undefined,
  now: number = Date.now()
): GrantUpdatePlan {
  if (!relationship?.id) return { error: "not_found", status: 404 };

  const status = effectiveStatus(relationship, now);
  if (!CONFIGURABLE.includes(status)) {
    return { error: status === "revoked" ? "revoked" : status === "expired" ? "expired" : "not_available", status: 409 };
  }

  // The category must exist for a sharer to grant or withdraw it.
  if (typeof body?.category !== "string" || !CATEGORY_KEYS.includes(body.category as any)) {
    return { error: "invalid_grant_category", status: 400 };
  }
  if (typeof body?.value !== "boolean") return { error: "invalid_grant_value", status: 400 };

  const patched = applySharerGrantPatch(relationship.push, body.category, body.value);
  if (patched.error) return { error: patched.error, status: 400 };

  const before = sharerGrants(relationship);
  const changed = CATEGORY_KEYS.some((key) => before[key] !== patched.grants[key]);
  return { grants: patched.grants, changed };
}