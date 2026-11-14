import { advanceNotificationEpisodes } from './notificationEpisodes.ts';
import { resolveGlucoseTrend } from './glucoseTrend.ts';
import { PUSH_FUTURE_TOLERANCE_MINUTES } from './notificationTiming.ts';
import { lowBoundaries, lowStreamDecisions } from './notificationLowStream.ts';
import { legacyEpisodeState } from './notificationLegacyEpisodes.ts';
import {
  allReadingsHeldByPause, buildNotificationCopy, decideMissingNotification, destinationFor,
  effectiveFollowerCategories, isHeldByQuietHours, normalizeSamples, notificationEventKey, relationshipAllowsPush,
} from './notificationCore.ts';
import { dispatchNotification } from './notificationDispatch.ts';
import {
  allReadingsCandidate, collapseWinners, readingIdentity, STREAM_MAX_AGE_MINUTES,
} from './notificationReadingWinner.ts';
import { applyFollowerCadence, isFollowerLowCategory } from './notificationFollowerCadence.ts';
import { OWNER_MODEL_VERSION, withLegacyMirrors } from './notificationModel.ts';
import { DEVICE_RETRY_BASE_MS, NOT_MEMBER_REASON } from './notificationReachability.ts';

const array = page => Array.isArray(page) ? page : page?.items || [];
// Quiet hours follow the device the person is holding: the zone their settings
// carry is the one the app last saw the browser in, and a stored zone is only
// used when that is missing.
const quietFrom = (prefs, zone) => ({ enabled: prefs.quiet_hours_enabled, startHour: prefs.quiet_start_hour,
  endHour: prefs.quiet_end_hour, timeZone: zone || prefs.quiet_timezone || 'UTC', urgentDuringQuiet: prefs.urgent_during_quiet });
export function recipientAuthorized(prefs, relationship, ownerId, recipientId, categories, now) {
  if (!prefs || prefs.user_id !== recipientId || prefs.master_enabled !== true) return false;
  if (relationship) {
    if (!relationshipAllowsPush(relationship, now) || relationship.sharer_user_id !== ownerId || relationship.follower_user_id !== recipientId || prefs.shared_access_id !== relationship.id) return false;
    const effective = effectiveFollowerCategories(relationship, prefs.categories);
    return categories.every(key => effective[key] === true);
  }
  return ownerId === recipientId && categories.every(key => prefs.categories?.[key] === true);
}

/**
 * A recipient with no addressable device is retried with backoff instead of
 * being dropped. Only one retry job per owner is kept, so a quiet window of
 * no-device recipients cannot pile up.
 */
async function scheduleDeviceRetry(sr, ownerId, reason, nowMs) {
  try {
    const pending = array(await sr.entities.NotificationDispatchJob.filter({ owner_user_id: ownerId, status: 'pending' }, { limit: 1 }));
    if (pending.length) return;
    await sr.entities.NotificationDispatchJob.create({
      owner_user_id: ownerId,
      reading_ids: [],
      status: 'pending',
      attempts: 0,
      last_error_code: reason,
      next_attempt_at: new Date(nowMs + DEVICE_RETRY_BASE_MS).toISOString(),
    });
  } catch {
    // The sweep re-evaluates stored readings anyway; a lost job is not a lost alert.
  }
}

export async function evaluateRecipient({ sr, ownerId, prefs: storedPreferences, relationship = null, settings, recipientSettings = null, rows, connection, nowMs, absoluteUrl }) {
  const wallStarted = Date.now();
  // An owner row saved with the six-row model is read through the same mirrors
  // the save path writes, so a field left behind by an older write can never
  // change a decision. A follower row carries no model version and is used
  // exactly as it is stored.
  const prefs = Number(storedPreferences?.model_version) === OWNER_MODEL_VERSION
    ? withLegacyMirrors(storedPreferences)
    : storedPreferences;
  const recipientId = prefs?.user_id;
  if (!recipientId || !recipientAuthorized(prefs, relationship, ownerId, recipientId, [], nowMs)) return 'off';
  const scopeKey = relationship ? `follow:${relationship.id}` : 'self';
  // Created on opt-in, not during evaluation: concurrent workers never choose
  // different newly-created anchors for the same scope.
  const ledgers = array(await sr.entities.NotificationLedger.filter({ user_id: recipientId, scope_key: scopeKey }, { sort: 'created_date', limit: 1 }));
  const ledger = ledgers[0];
  if (!ledger) return 'no_ledger';
  const audience = relationship ? 'follower' : 'self';
  const categories = relationship ? effectiveFollowerCategories(relationship, prefs.categories) : prefs.categories;
  const effectivePrefs = { ...prefs, categories };
  const displaySettings = relationship ? recipientSettings : settings;
  const quiet = quietFrom(prefs, displaySettings?.timezone);
  const permitted = key => !isHeldByQuietHours(key, quiet, nowMs);
  const previousState = ledger.episode_state || {};

  const result = advanceNotificationEpisodes({ rows, nowMs, preferences: effectivePrefs,
    thresholds: { low: settings?.target_range_low, high: settings?.target_range_high },
    state: legacyEpisodeState(ledger, rows, settings, ownerId, recipientId, nowMs, prefs.category_activation), allowed: permitted });
  // Persist a cutover watermark once: already-processed legacy episodes must
  // not replay the same fresh reading when this contract is first deployed.
  const lowSince = previousState.fixedLowSince ?? previousState.lastAt ?? 0;
  result.state.fixedLowSince = lowSince;

  // Every distinct fresh reading below an enabled low boundary is its own event.
  const low = lowStreamDecisions({ rows, preferences: effectivePrefs, thresholds: { low: settings?.target_range_low }, nowMs, allowed: permitted })
    .filter(item => item.sample.at > lowSince);

  const samples = normalizeSamples(rows, nowMs);
  // The all-readings stream is the OWNER's own choice. A follower can never opt
  // into it, so it is not even considered for a relationship.
  const stream = relationship ? null : allReadingsCandidate({
    samples, nowMs,
    enabled: prefs.all_readings_enabled === true && permitted('all_readings') && !allReadingsHeldByPause(prefs, nowMs),
  });

  const candidates = [...low];
  if (result.notification) candidates.push(result.notification);
  if (stream) candidates.push(stream);

  // A gap in the stream is not a reading: it keeps its own path and its own key.
  let missingDecision = null;
  if (!candidates.length && categories?.missing_readings) {
    const missing = decideMissingNotification({ rows, nowMs, delayMinutes: prefs.missing_delay_minutes, connection });
    if (missing) {
      const repeat = prefs.repeat_minutes?.missing_readings;
      const index = [15, 30, 60, 120].includes(repeat) ? Math.max(0, Math.floor((missing.quietMinutes - prefs.missing_delay_minutes) / repeat)) : 0;
      missingDecision = { category: 'missing_readings', episodeKey: missing.episodeKey, sample: missing.lastSample,
        durationMinutes: null, repeatIndex: index, coveredEvents: [{ category: 'missing_readings', episodeKey: missing.episodeKey, repeatIndex: index }] };
    }
  }

  // One reading, one push: independent rules collapse to a single winner per
  // measured instant, before anything is claimed or sent.
  const winners = collapseWinners(candidates);

  // A follower hears about a low once, one repeat if it lasts, then a recovery
  // note. The owner's own per-reading rule is untouched.
  let cadenceState = previousState.followerLow || null;
  let toSend = winners;
  if (relationship) {
    const newest = samples.length ? samples[samples.length - 1] : null;
    const bounds = lowBoundaries(effectivePrefs, { low: settings?.target_range_low }, permitted);
    const stillLow = sample => !bounds.length || bounds.some(bound => Number(sample?.value) < bound.mgdl);
    const cadenced = applyFollowerCadence({ winners, state: cadenceState || {}, nowMs, stillLow, recoverySample: newest });
    toSend = cadenced.winners;
    cadenceState = cadenced.state;
  }
  if (missingDecision) toSend = [...toSend, missingDecision];

  const nextState = cadenceState ? { ...result.state, followerLow: cadenceState } : result.state;
  if (JSON.stringify(nextState) !== JSON.stringify(previousState)) {
    const version = ledger.episode_revision;
    const updated = await sr.entities.NotificationLedger.updateMany({ id: ledger.id, user_id: recipientId,
      scope_key: scopeKey, // Optional entity fields are materialized as null, not absent.
      episode_revision: version == null ? null : version },
    { $set: { episode_state: nextState, episode_revision: (version || 0) + 1 } });
    if (Number(updated.updated) !== 1) return 'concurrent_evaluation';
  }

  if (!toSend.length) return 'no_event';
  let status = 'duplicate';
  for (const item of toSend) status = await dispatchDecision(item);
  return status;

  async function dispatchDecision(decision) {
  const covered = Array.isArray(decision.coveredEvents) && decision.coveredEvents.length
    ? decision.coveredEvents
    : [{ category: decision.category, episodeKey: decision.episodeKey, repeatIndex: 0 }];
  const isStream = decision.category === 'all_readings';
  const isRecovery = decision.category === 'low_recovery';
  const lowFamily = isFollowerLowCategory(decision.category);
  // Built from the triggering measurement itself: its value, its timestamp and
  // its own source trend. A later fetch never substitutes for what fired it.
  const copy = buildNotificationCopy({ category: decision.category, value: decision.sample.value,
    readingAt: decision.sample.at, units: displaySettings?.glucose_units || 'mg/dL', timeZone: displaySettings?.timezone || prefs.quiet_timezone || 'UTC',
    showDetails: prefs.show_health_details === true, personName: relationship?.sharer_display_name,
    durationMinutes: decision.durationMinutes, trend: decision.sample.trend ?? null, nowMs,
    resolvedTrend: resolveGlucoseTrend(rows.find(row => Date.parse(row.recorded_at) === decision.sample.at) || { ...decision.sample, recorded_at: new Date(decision.sample.at).toISOString() },
      rows.filter(row => Date.parse(row.recorded_at) <= decision.sample.at),
      { now: nowMs, futureToleranceMinutes: PUSH_FUTURE_TOLERANCE_MINUTES }),
    targetLow: settings?.target_range_low ?? null,
    targetHigh: settings?.target_range_high ?? null,
    coveredCategories: lowFamily ? [] : covered.map(c => c.category) });
  const episodeEvent = `${decision.episodeKey}${decision.repeatIndex ? `:repeat:${decision.repeatIndex}` : ''}`;
  // Recipient plus reading identity. Per category keys are what let one reading
  // produce two pushes; a corrected value for the same recorded_at keeps this
  // identity, so it can never notify again.
  const eventKey = decision.category === 'missing_readings'
    ? notificationEventKey(decision.category, ownerId, recipientId, episodeEvent)
    : `push:${ownerId}:${recipientId}:${scopeKey}:${readingIdentity(decision.sample.at)}`;
  // Older code appended nested claim arrays. Honor those spent keys too, but
  // all new atomic appends use a scalar so $nin actually prevents duplication.
  if ((ledger.claimed_keys || []).flat().includes(eventKey)) return 'duplicate';
  const outcome = await dispatchNotification({ enabled: true, category: decision.category,
    ownerUserId: ownerId, recipientUserId: recipientId, sharedAccessId: relationship?.id || null, audience,
    episodeKey: decision.episodeKey, eventKey, coveredEvents: covered,
    occurredAtMs: decision.sample.at,
    expiresAtMs: decision.category === 'missing_readings'
      ? nowMs + 15 * 60000
      : isStream
        ? decision.sample.at + STREAM_MAX_AGE_MINUTES * 60000
        : decision.sample.at + (decision.category.endsWith('_fast') ? 10 : 8) * 60000,
    copy, detailShown: prefs.show_health_details === true, destination: destinationFor(audience), quiet,
    permissionVersion: relationship?.permission_version || null }, {
    nowMs, absoluteUrl,
    claim: async key => {
      const result = await sr.entities.NotificationLedger.updateMany({ id: ledger.id, user_id: recipientId, scope_key: scopeKey, claimed_keys: { $nin: [key] } }, { $push: { claimed_keys: key } });
      return Number(result.updated) === 1;
    },
    createRecord: row => sr.entities.NotificationDelivery.create(row),
    updateRecord: (id, patch) => sr.entities.NotificationDelivery.update(id, patch),
    // One transport request per reading: a row already recorded for this event
    // key means the push may have been accepted, so it is never sent again.
    alreadySent: async key => array(await sr.entities.NotificationDelivery.filter(
      { event_key: key, status: { $in: ['submitted', 'unknown', 'claimed'] } }, { limit: 1 })).length > 0,
    // Nothing left the server when the recipient could not be addressed, so the
    // claim is released and the notice is retried rather than dropped.
    releaseClaim: async key => {
      await sr.entities.NotificationLedger.updateMany({ id: ledger.id, user_id: recipientId, scope_key: scopeKey, claimed_keys: key }, { $pull: { claimed_keys: key } });
    },
    scheduleRetry: reason => scheduleDeviceRetry(sr, ownerId, reason, nowMs),
    recheck: async () => {
      const entity = relationship ? sr.entities.FollowNotificationPreference : sr.entities.NotificationPreference;
      const storedFresh = await entity.get(prefs.id);
      const fresh = Number(storedFresh?.model_version) === OWNER_MODEL_VERSION
        ? withLegacyMirrors(storedFresh)
        : storedFresh;
      const relation = relationship ? await sr.entities.SharedAccess.get(relationship.id) : null;
      if (isStream) {
        if (fresh?.master_enabled !== true || fresh.all_readings_enabled !== true) return { ok: false, reason: 'permission_changed' };
        if (allReadingsHeldByPause(fresh, Date.now())) return { ok: false, reason: 'quiet_hours' };
      } else if (isRecovery) {
        if (fresh?.master_enabled !== true) return { ok: false, reason: 'permission_changed' };
      } else {
        // Each covered category is re-authorized on its own, moments before the
        // send. A warning revoked while this send was queued drops out of the
        // coverage instead of vetoing the reading's other, still-authorized
        // rule; only losing every matching category blocks the transport.
        const still = covered.filter(event => recipientAuthorized(fresh, relation, ownerId, recipientId, [event.category], Date.now()));
        if (!still.some(event => event.category === decision.category)) return { ok: false, reason: 'permission_changed' };
        covered.splice(0, covered.length, ...still);
      }
      const owner = await sr.entities.User.get(ownerId);
      if (owner.health_data_consent_active !== true || owner.required_reconsent === true || owner.account_status === 'disabled') return { ok: false, reason: 'consent_changed' };
      // The push goes to the RECIPIENT's own account id, so that account has to
      // exist for a device to be reachable at all. Only a definite "no such
      // account" is treated as unreachable; a network blip is not.
      try {
        await sr.entities.User.get(recipientId);
      } catch (error: any) {
        if (Number(error?.status) === 404) return { ok: false, reason: NOT_MEMBER_REASON };
      }
      const elapsed = Math.max(0, Date.now() - wallStarted);
      if (!isRecovery && decision.category !== 'missing_readings') {
        if (isStream) {
          const again = allReadingsCandidate({ samples: normalizeSamples(rows, nowMs), nowMs: nowMs + elapsed, enabled: true });
          if (!again || again.sample.at !== decision.sample.at) return { ok: false, reason: 'expired_or_disabled' };
        } else if (lowFamily) {
          const freshCategories = relation ? effectiveFollowerCategories(relation, fresh.categories) : fresh.categories;
          const stillThere = lowStreamDecisions({ rows, preferences: { ...fresh, categories: freshCategories }, thresholds: { low: settings?.target_range_low }, nowMs: nowMs + elapsed }).some(item => item.sample.at === decision.sample.at);
          if (!stillThere) return { ok: false, reason: 'expired_or_disabled' };
        }
      }
      // An edited preview, threshold, quiet window, pause window, opt-in or
      // relationship must be evaluated again, never sent using a stale snapshot.
      const deliveryFields = ['show_health_details', 'quiet_hours_enabled', 'quiet_start_hour', 'quiet_end_hour', 'quiet_timezone', 'urgent_during_quiet',
        'all_readings_enabled', 'all_readings_pause_enabled', 'all_readings_pause_start_hour', 'all_readings_pause_end_hour', 'all_readings_pause_timezone'];
      const perReading = isStream || isRecovery || lowFamily;
      const relevantChange = perReading
        ? deliveryFields.some(key => fresh[key] !== prefs[key]) || covered.some(event => fresh.category_activation?.[event.category] !== prefs.category_activation?.[event.category])
        : fresh.updated_date !== prefs.updated_date;
      if (relevantChange || (!perReading && relation && relation.permission_version !== relationship.permission_version)) return { ok: false, reason: 'configuration_changed' };
      return { ok: true };
    },
    send: message => sr.integrations.Core.SendPushNotification(message),
  });
  // Episode watermarks are never pruned; only old transport-claim keys are.
  if ((ledger.claimed_keys || []).length > 300) await sr.entities.NotificationLedger.updateMany({ id: ledger.id }, { $pull: { claimed_keys: { $in: ledger.claimed_keys.slice(0, -200) } } });
  return outcome.status;
  }
}