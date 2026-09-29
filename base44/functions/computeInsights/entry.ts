// Stackd Insights — returns the computed retrospective insight object for the
// authenticated user's selected window. Deterministic, no LLM, Dexcom-only.
// Called fresh on every page open (never stale).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { buildInsights } from '../../shared/insightsLoader.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    const result = await buildInsights(base44, body.windowDays || 14, Number(body.tzOffsetMinutes) || 0);
    if (result.status !== 200) return Response.json({ error: result.error }, { status: result.status });

    return Response.json(result.data);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}