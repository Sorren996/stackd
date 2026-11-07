// What a sharer permits each follower to be notified about.
//
// Separate from the existing scope controls and from email notices: this grants
// push only, and only for the categories the sharer chooses. Turning glucose
// sharing off already stops push, because every evaluation re-checks the
// relationship's own glucose scope.
//
// ONE category per request, merged onto the permission the server already has
// stored. The browser never sends a whole permission set, so a copy that is
// missing a category cannot switch it off.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { ok, fail, currentUser, readBody, loadOwnedRelationship, audit } from "../../shared/sharingAccess.ts";
import { sharerGrants } from "../../shared/notificationCore.ts";
import { planSharerGrantUpdate } from "../../shared/sharerPushGrants.ts";

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== "POST") return fail("method_not_allowed", 405);

    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return fail("unauthorized", 401);

    const body = await readBody(req);
    const sr = base44.asServiceRole;

    // Ownership is established from the session on every request: the sharer id
    // in the payload is never trusted, and an unrelated account is refused.
    const loaded = await loadOwnedRelationship(base44, user.id, body.access_id);
    if (loaded.error) return fail(loaded.error, loaded.status || 400);
    const relationship = loaded.access;

    const plan = planSharerGrantUpdate(relationship, body);
    if (plan.error) return fail(plan.error, plan.status);

    // A tap that changes nothing writes nothing and does not churn the
    // relationship's permission version.
    if (!plan.changed) {
      return ok({
        relationship_id: relationship.id,
        grants: sharerGrants(relationship),
        permission_version: Number(relationship.permission_version) || 1,
        changed: false,
      });
    }

    const now = new Date().toISOString();
    const permissionVersion = (Number(relationship.permission_version) || 1) + 1;

    const updated = await sr.entities.SharedAccess.update(relationship.id, {
      push: plan.grants,
      permission_version: permissionVersion,
      last_scope_change_at: now,
    });

    await audit(base44, {
      action: "sharing.push_grants_changed",
      actor_user_id: user.id,
      actor_email: user.email,
      subject_user_id: relationship.follower_user_id || null,
      metadata: { access_id: relationship.id, category: body.category, value: body.value },
    });

    return ok({
      relationship_id: relationship.id,
      grants: sharerGrants(updated),
      permission_version: Number(updated?.permission_version) || permissionVersion,
      changed: true,
    });
  } catch (error: any) {
    console.error("[updateRelationshipPushGrants] failed:", error?.message || "unexpected error");
    return fail("server_error", 500);
  }
}