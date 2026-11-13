import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { generateProjectionForUser } from "../../shared/projectionGeneration.ts";

// Stackd Insight Engine — Glucose Projection Generator (HTTP entry point)
//
// Delegates to the single shared pipeline in base44/shared/projectionGeneration.ts
// so server-side reading ingestion, entity workflows (manual readings +
// insulin/carb create, edit, delete), and the client fallback hook all execute
// the exact same projection model without forking.
//
// SAFETY: Informational only. Never recommends or modifies insulin doses.

const ALLOWED_TRIGGER_ENTITIES = new Set(["GlucoseReading", "InsulinDose", "CarbEntry"]);

export default async function (req: Request): Promise<Response> {
  let base44: any = null;
  let userId: string | null = null;
  try {
    base44 = createClientFromRequest(req);
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      /* workflow/scheduler may send empty body */
    }

    const isWorkflowCall = body?.workflow === true || "user_id" in (body || {});

    if (isWorkflowCall) {
      const caller = await base44.auth.me().catch(() => null);
      if (!caller || caller.role !== "admin") {
        try {
          await base44.asServiceRole.entities.DiagnosticReport.create({
            topic: `Projection auth failed — ${new Date().toISOString()}`,
            report_text: `Workflow/frontend call passed user_id/workflow but caller is not admin (role: ${caller?.role || "none"}). The projection workflow may be invoking generateProjection without proper admin context.`,
            report_date: new Date().toISOString(),
            item_count: 1,
          });
        } catch {
          /* logging must never crash the function */
        }
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const rawUserId = typeof body.user_id === "string" ? body.user_id.trim() : "";
      if (rawUserId && rawUserId !== "null" && rawUserId !== "undefined") {
        userId = rawUserId;
      } else if (
        typeof body.entity_name === "string" &&
        ALLOWED_TRIGGER_ENTITIES.has(body.entity_name) &&
        typeof body.entity_id === "string" &&
        body.entity_id
      ) {
        const record = await base44.asServiceRole.entities[body.entity_name]
          .get(body.entity_id)
          .catch(() => null);
        userId = record?.user_id || record?.created_by_id || null;
      }

      if (!userId) {
        return Response.json({ ok: true, skipped: true, reason: "no_target_user" });
      }
    } else {
      const authenticatedUser = await base44.auth.me();
      if (!authenticatedUser) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = authenticatedUser.id;
    }

    const forceRefresh = body?.force === true;
    const payload = await generateProjectionForUser({
      sr: base44.asServiceRole,
      userId,
      forceRefresh,
    });

    return Response.json(payload);
  } catch (error: any) {
    console.error("[generateProjection] failed:", error?.message ?? "unknown_error");
    console.error("[generateProjection] stack:", error?.stack ?? "no stack");
    try {
      if (base44) {
        await base44.asServiceRole.entities.DiagnosticReport.create({
          topic: `Projection generation failed — ${new Date().toISOString()}`,
          report_text: `User: ${userId || "unknown"}\nError: ${error?.message ?? "unknown"}\nStack: ${(error?.stack || "").slice(0, 500)}`,
          report_date: new Date().toISOString(),
          item_count: 1,
        });
      }
    } catch {
      /* logging must never crash the function */
    }
    return Response.json(
      {
        ok: false,
        abstained: true,
        abstain_reason: "we could not build an estimate this time",
        trajectory_length: 0,
        error: error?.message ?? "unknown_error",
      },
      { status: 200 }
    );
  }
}