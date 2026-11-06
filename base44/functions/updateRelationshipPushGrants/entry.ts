// What a sharer permits each follower to be notified about.
//
// Separate from the existing scope controls and from email notices: this grants
// push only, and only for the categories the sharer chooses. Turning glucose
// sharing off already stops push, because every evaluation re-checks the
// relationship's own glucose scope.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { ok, fail, currentUser, readBody, loadOwnedRelationship, audit } from "../../shared/sharingAccess.ts";
import { sanitizeSharerGrants, sharerGrants } from "../../shared/notificationCore.ts";

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== "POST") return fail("method_not_allowed", 405);

    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return fail("unauthorized", 401);

    const body = await readBody(req);
    const sr = base44.asServiceRole;

    const loaded = await loadOwnedRelationship(base44, user.id, body.access_id);
    if (loaded.error) return fail(loaded.error, loaded.status || 400);
    const relationship = loaded.access;

    if (relationship.status === "revoked") return fail("revoked", 409);

    const grants = sanitizeSharerGrants(body.grants);
    const now = new Date().toISOString();

    const updated = await sr.entities.SharedAccess.update(relationship.id, {
      push: grants,
      permission_version: (Number(relationship.permission_version) || 1) + 1,
      last_scope_change_at: now,
    });

    await audit(base44, {
      action: "sharing.push_grants_changed",
      actor_user_id: user.id,
      actor_email: user.email,
      subject_user_id: relationship.follower_user_id || null,
      metadata: { access_id: relationship.id, grants },
    });

    return ok({ relationship_id: relationship.id, grants: sharerGrants(updated) });
  } catch (error: any) {
    console.error("[updateRelationshipPushGrants] failed:", error?.message || "unexpected error");
    return fail("server_error", 500);
  }
}