// Stackd Reports — returns the full computed multi-report bundle for the
// authenticated user's selected date range. Deterministic, no LLM, Dexcom-only
// for statistics; insulin/carb entries appear as factual markers and totals.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { buildReports } from '../../shared/reportsLoader.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    const result = await buildReports(
      base44,
      Number(body.windowDays) || 14,
      Number(body.tzOffsetMinutes) || 0
    );
    if (result.status !== 200) return Response.json({ error: result.error }, { status: result.status });

    return Response.json(result.data);
  } catch (error) {
    console.error('[computeReports] failed:', error?.message || error, error?.stack || '');
    return Response.json({ error: error.message || 'Unable to build reports.' }, { status: 500 });
  }
}