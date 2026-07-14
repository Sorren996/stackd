import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  const startedAt = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({
        retrievalStatus: 'failed',
        error: 'Unauthorized',
        metadata: { authenticated: false, retrievalDurationMs: Date.now() - startedAt }
      }, { status: 401 });
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    const {
      timeRange = '7d',
      startTime: customStart,
      endTime: customEnd,
      dataTypes,
      timezone = 'UTC',
      insightId,
    } = body;

    // Calculate time window
    const now = new Date();
    let rangeStart: Date;
    let rangeEnd: Date = now;

    if (customStart && customEnd) {
      rangeStart = new Date(customStart);
      rangeEnd = new Date(customEnd);
    } else {
      const dayMs = 24 * 60 * 60 * 1000;
      switch (timeRange) {
        case 'today': rangeStart = new Date(now.getTime() - dayMs); break;
        case '1d': rangeStart = new Date(now.getTime() - dayMs); break;
        case '7d': rangeStart = new Date(now.getTime() - 7 * dayMs); break;
        case '14d': rangeStart = new Date(now.getTime() - 14 * dayMs); break;
        case '30d': rangeStart = new Date(now.getTime() - 30 * dayMs); break;
        default: rangeStart = new Date(now.getTime() - 7 * dayMs);
      }
    }

    // If insightId is provided, load the insight and use its observation window
    let insightContext: any = null;
    if (insightId) {
      try {
        const insights = await base44.entities.CoachInsight.filter({ id: insightId });
        if (insights.length > 0) {
          insightContext = {
            id: insights[0].id,
            insight_type: insights[0].insight_type,
            title: insights[0].title,
            summary: insights[0].summary,
            observation_start_at: insights[0].observation_start_at,
            observation_end_at: insights[0].observation_end_at,
            supporting_glucose_log_ids: insights[0].supporting_glucose_log_ids || [],
            supporting_carb_log_ids: insights[0].supporting_carb_log_ids || [],
            supporting_insulin_log_ids: insights[0].supporting_insulin_log_ids || [],
            supporting_journal_entry_ids: insights[0].supporting_journal_entry_ids || [],
          };
          if (insightContext.observation_start_at && insightContext.observation_end_at) {
            rangeStart = new Date(insightContext.observation_start_at);
            rangeEnd = new Date(insightContext.observation_end_at);
          }
        }
      } catch (e) {
        console.log('[CoachContext] Could not load insight:', e.message);
      }
    }

    const types: string[] = dataTypes || ['glucose', 'carbs', 'insulin', 'journal', 'split_plans'];
    const startISO = rangeStart.toISOString();
    const endISO = rangeEnd.toISOString();

    const result: any = {
      requestedAt: now.toISOString(),
      timezone,
      range: { start: startISO, end: endISO },
      insightContext,
      glucoseLogs: [],
      carbLogs: [],
      insulinLogs: [],
      journalEntries: [],
      highProteinMealWindows: [],
      splitDosePlans: [],
      metadata: {
        authenticated: true,
        userId: user.id,
        timeRange,
        retrievalStatus: 'success',
        retrievalDurationMs: 0,
        glucoseLogCount: 0,
        carbLogCount: 0,
        insulinLogCount: 0,
        journalEntryCount: 0,
        splitDosePlanCount: 0,
        newestRecordAt: null,
        oldestRecordAt: null,
      },
    };

    // Query each entity type independently — one failure must not block others
    if (types.includes('glucose')) {
      try {
        const records = await base44.entities.GlucoseReading.filter(
          { recorded_at: { $gte: startISO, $lte: endISO } },
          '-recorded_at', 500
        );
        result.glucoseLogs = records.map((r: any) => ({
          id: r.id, value: r.value, recorded_at: r.recorded_at, notes: r.notes || null,
        }));
        result.metadata.glucoseLogCount = records.length;
      } catch (e) {
        console.log('[CoachContext] Glucose query failed:', e.message);
      }
    }

    if (types.includes('carbs')) {
      try {
        const records = await base44.entities.CarbEntry.filter(
          { consumed_at: { $gte: startISO, $lte: endISO } },
          '-consumed_at', 500
        );
        result.carbLogs = records.map((r: any) => ({
          id: r.id,
          food_name: r.food_name,
          carbs: r.carbs,
          consumed_at: r.consumed_at,
          is_high_protein_fat_meal: r.is_high_protein_fat_meal || false,
          absorption_profile: r.absorption_profile || null,
          notes: r.notes || null,
        }));
        result.metadata.carbLogCount = records.length;
        result.highProteinMealWindows = records
          .filter((r: any) => r.is_high_protein_fat_meal)
          .map((r: any) => ({
            id: r.id, food_name: r.food_name, consumed_at: r.consumed_at,
          }));
      } catch (e) {
        console.log('[CoachContext] Carb query failed:', e.message);
      }
    }

    if (types.includes('insulin')) {
      try {
        const records = await base44.entities.InsulinDose.filter(
          { administered_at: { $gte: startISO, $lte: endISO } },
          '-administered_at', 500
        );
        result.insulinLogs = records.map((r: any) => ({
          id: r.id,
          insulin_type: r.insulin_type,
          units: r.units,
          administered_at: r.administered_at,
          notes: r.notes || null,
        }));
        result.metadata.insulinLogCount = records.length;
      } catch (e) {
        console.log('[CoachContext] Insulin query failed:', e.message);
      }
    }

    if (types.includes('journal')) {
      try {
        // Check if user has excluded journal from AI review
        const settingsRecords = await base44.entities.UserSettings.list('-created_date', 1);
        const settings = settingsRecords[0];
        if (settings?.coach_exclude_journal) {
          result.metadata.journalEntryCount = 0;
        } else {
          const records = await base44.entities.JournalEntry.filter(
            { entry_date: { $gte: startISO, $lte: endISO } },
            '-entry_date', 200
          );
          result.journalEntries = records.map((r: any) => ({
            id: r.id,
            mood: r.mood || null,
            entry_date: r.entry_date,
            content: r.content ? r.content.substring(0, 500) : null,
          }));
          result.metadata.journalEntryCount = records.length;
        }
      } catch (e) {
        console.log('[CoachContext] Journal query failed:', e.message);
      }
    }

    if (types.includes('split_plans')) {
      try {
        const records = await base44.entities.SplitDosePlan.filter(
          { created_date: { $gte: startISO, $lte: endISO } },
          '-created_date', 50
        );
        result.splitDosePlans = records.map((r: any) => ({
          id: r.id,
          meal_name: r.meal_name,
          status: r.status,
          total_planned_units: r.total_planned_units,
          first_planned_units: r.first_planned_units,
          follow_up_planned_units: r.follow_up_planned_units,
          current_review_at: r.current_review_at,
        }));
        result.metadata.splitDosePlanCount = records.length;
      } catch (e) {
        console.log('[CoachContext] SplitDosePlan query failed:', e.message);
      }
    }

    // Calculate newest/oldest record timestamps
    const allDates: string[] = [
      ...result.glucoseLogs.map((r: any) => r.recorded_at),
      ...result.carbLogs.map((r: any) => r.consumed_at),
      ...result.insulinLogs.map((r: any) => r.administered_at),
      ...result.journalEntries.map((r: any) => r.entry_date),
    ].filter(Boolean).sort();

    if (allDates.length > 0) {
      result.metadata.oldestRecordAt = allDates[0];
      result.metadata.newestRecordAt = allDates[allDates.length - 1];
    }

    result.metadata.retrievalDurationMs = Date.now() - startedAt;

    // If all queries returned empty and there were no errors, still report success
    // with an honest empty result. The Coach must not pretend it has data.
    if (
      result.metadata.glucoseLogCount === 0 &&
      result.metadata.carbLogCount === 0 &&
      result.metadata.insulinLogCount === 0 &&
      result.metadata.journalEntryCount === 0 &&
      result.metadata.splitDosePlanCount === 0
    ) {
      result.metadata.retrievalStatus = 'success_empty';
    }

    console.log(`[CoachContext] User ${user.id} | range=${timeRange} | glucose=${result.metadata.glucoseLogCount} carbs=${result.metadata.carbLogCount} insulin=${result.metadata.insulinLogCount} journal=${result.metadata.journalEntryCount} | ${result.metadata.retrievalDurationMs}ms`);

    return Response.json(result);
  } catch (error) {
    console.error('[CoachContext] Fatal error:', error.message);
    return Response.json({
      retrievalStatus: 'failed',
      error: error.message,
      metadata: {
        authenticated: false,
        retrievalDurationMs: Date.now() - startedAt,
      },
    }, { status: 500 });
  }
});