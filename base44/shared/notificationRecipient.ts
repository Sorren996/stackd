import { advanceNotificationEpisodes } from './notificationEpisodes.ts';
import { lowStreamDecisions } from './notificationLowStream.ts';
import { legacyEpisodeState } from './notificationLegacyEpisodes.ts';
import { buildNotificationCopy, effectiveFollowerCategories, relationshipAllowsPush, notificationEventKey, destinationFor, isHeldByQuietHours, decideMissingNotification } from './notificationCore.ts';
import { dispatchNotification } from './notificationDispatch.ts';

const array = page => Array.isArray(page) ? page : page?.items || [];
const quietFrom = (prefs, zone) => ({ enabled: prefs.quiet_hours_enabled, startHour: prefs.quiet_start_hour,
  endHour: prefs.quiet_end_hour, timeZone: prefs.quiet_timezone || zone || 'UTC', urgentDuringQuiet: prefs.urgent_during_quiet });
export function recipientAuthorized(prefs, relationship, ownerId, recipientId, categories, now) {
  if (!prefs || prefs.user_id !== recipientId || prefs.master_enabled !== true) return false;
  if (relationship) {
    if (!relationshipAllowsPush(relationship, now) || relationship.sharer_user_id !== ownerId || relationship.follower_user_id !== recipientId || prefs.shared_access_id !== relationship.id) return false;
    const effective = effectiveFollowerCategories(relationship, prefs.categories);
    return categories.every(key => effective[key] === true);
  }
  return ownerId === recipientId && categories.every(key => prefs.categories?.[key] === true);
}

export async function evaluateRecipient({ sr, ownerId, prefs, relationship = null, settings, recipientSettings = null, rows, connection, nowMs, absoluteUrl }) {
  const wallStarted = Date.now();
  const recipientId = prefs?.user_id;
  if (!recipientId || !recipientAuthorized(prefs, relationship, ownerId, recipientId, [], nowMs)) return 'off';
  const scopeKey = relationship ? `follow:${relationship.id}` : 'self';
  // Created on opt-in, not during evaluation: concurrent workers never choose
  // different newly-created anchors for the same scope.
  const ledgers = array(await sr.entities.NotificationLedger.filter({ user_id: recipientId, scope_key: scopeKey }, { sort: 'created_date', limit: 1 }));
  const ledger = ledgers[0];
  if (!ledger) return 'no_ledger';
  const categories = relationship ? effectiveFollowerCategories(relationship, prefs.categories) : prefs.categories;
  const effectivePrefs = { ...prefs, categories };
  const displaySettings = relationship ? recipientSettings : settings;
  const quiet = quietFrom(prefs, displaySettings?.timezone);
  const permitted = key => !isHeldByQuietHours(key, quiet, nowMs);
  const result = advanceNotificationEpisodes({ rows, nowMs, preferences: effectivePrefs,
    thresholds: { low: settings?.target_range_low, high: settings?.target_range_high },
    state: legacyEpisodeState(ledger, rows, settings, ownerId, recipientId, nowMs, prefs.category_activation), allowed: permitted });
  // Persist a cutover watermark once: already-processed legacy episodes must
  // not replay the same fresh reading when this contract is first deployed.
  const lowSince = ledger.episode_state?.fixedLowSince ?? ledger.episode_state?.lastAt ?? 0;
  result.state.fixedLowSince = lowSince;
  // Every distinct fresh reading below an enabled low boundary is its own event:
  // one decision per measurement, with every matching low category covered.
  const low = lowStreamDecisions({ rows, preferences: effectivePrefs, thresholds: { low: settings?.target_range_low }, nowMs, allowed: permitted })
    .filter(item => item.sample.at > lowSince);
  let decision = result.notification;
  let concurrent = false;
  if (JSON.stringify(result.state) !== JSON.stringify(ledger.episode_state || {})) {
    const version = ledger.episode_revision;
    const updated = await sr.entities.NotificationLedger.updateMany({ id: ledger.id, user_id: recipientId,
      scope_key: scopeKey, // Optional entity fields are materialized as null, not absent.
      episode_revision: version == null ? null : version },
    { $set: { episode_state: result.state, episode_revision: (version || 0) + 1 } });
    concurrent = Number(updated.updated) !== 1;
  }
  if (!decision && categories?.missing_readings) {
    const missing = decideMissingNotification({ rows, nowMs, delayMinutes: prefs.missing_delay_minutes, connection });
    if (missing) {
      const repeat = prefs.repeat_minutes?.missing_readings;
      const index = [15, 30, 60, 120].includes(repeat) ? Math.max(0, Math.floor((missing.quietMinutes - prefs.missing_delay_minutes) / repeat)) : 0;
      decision = { category: 'missing_readings', episodeKey: missing.episodeKey, sample: missing.lastSample,
        durationMinutes: null, repeatIndex: index, coveredEvents: [{ category: 'missing_readings', episodeKey: missing.episodeKey, repeatIndex: index }] };
    }
  }
  if (concurrent) decision = null;
  const decisions = [...low];
  if (decision && !low.some(item => item.sample.at === decision.sample.at)) decisions.push(decision);
  if (!decisions.length) return concurrent ? 'concurrent_evaluation' : 'no_event';
  let status = 'duplicate';
  for (const item of decisions) status = await dispatchDecision(item);
  return status;

  async function dispatchDecision(decision) {
  const audience = relationship ? 'follower' : 'self';
  const covered = decision.coveredEvents;
  // Built from the triggering measurement itself: its value, its timestamp and
  // its own source trend. A later fetch never substitutes for what fired it.
  const copy = buildNotificationCopy({ category: decision.category, value: decision.sample.value,
    readingAt: decision.sample.at, units: displaySettings?.glucose_units || 'mg/dL', timeZone: prefs.quiet_timezone || displaySettings?.timezone || 'UTC',
    showDetails: prefs.show_health_details === true, personName: relationship?.sharer_display_name,
    durationMinutes: decision.durationMinutes, trend: decision.sample.trend ?? null, nowMs,
    thresholdMgdl: decision.lowThreshold ?? null,
    coveredCategories: decision.perReadingLow ? [] : covered.map(c => c.category) });
  const episodeEvent = `${decision.episodeKey}${decision.repeatIndex ? `:repeat:${decision.repeatIndex}` : ''}`;
  const eventKey = decision.perReadingLow
    ? `push:${ownerId}:${recipientId}:${scopeKey}:${decision.episodeKey}`
    : notificationEventKey(decision.category, ownerId, recipientId, episodeEvent);
  // Older code appended nested claim arrays. Honor those spent keys too, but
  // all new atomic appends use a scalar so $nin actually prevents duplication.
  if ((ledger.claimed_keys || []).flat().includes(eventKey)) return 'duplicate';
  const outcome = await dispatchNotification({ enabled: true, category: decision.category,
    ownerUserId: ownerId, recipientUserId: recipientId, sharedAccessId: relationship?.id || null, audience,
    episodeKey: decision.episodeKey, eventKey, coveredEvents: covered,
    occurredAtMs: decision.sample.at, expiresAtMs: decision.category === 'missing_readings' ? nowMs + 15 * 60000 : decision.sample.at + (decision.category.endsWith('_fast') ? 10 : 8) * 60000,
    copy, detailShown: prefs.show_health_details === true, destination: destinationFor(audience), quiet,
    permissionVersion: relationship?.permission_version || null }, {
    nowMs, absoluteUrl,
    claim: async key => {
      const result = await sr.entities.NotificationLedger.updateMany({ id: ledger.id, user_id: recipientId, scope_key: scopeKey, claimed_keys: { $nin: [key] } }, { $push: { claimed_keys: key } });
      return Number(result.updated) === 1;
    },
    createRecord: row => sr.entities.NotificationDelivery.create(row),
    updateRecord: (id, patch) => sr.entities.NotificationDelivery.update(id, patch),
    recheck: async () => {
      const entity = relationship ? sr.entities.FollowNotificationPreference : sr.entities.NotificationPreference;
      const fresh = await entity.get(prefs.id);
      const relation = relationship ? await sr.entities.SharedAccess.get(relationship.id) : null;
      // Each covered category is re-authorized on its own, moments before the
      // send. A warning revoked while this send was queued drops out of the
      // coverage instead of vetoing the reading's other, still-authorized low
      // rule; only losing every low category blocks the transport.
      const still = covered.filter(event => recipientAuthorized(fresh, relation, ownerId, recipientId, [event.category], Date.now()));
      if (!still.some(event => event.category === decision.category)) return { ok: false, reason: 'permission_changed' };
      covered.splice(0, covered.length, ...still);
      const owner = await sr.entities.User.get(ownerId);
      if (owner.health_data_consent_active !== true || owner.required_reconsent === true || owner.account_status === 'disabled') return { ok: false, reason: 'consent_changed' };
      if (decision.perReadingLow && !lowStreamDecisions({ rows, preferences: { ...fresh, categories: relation ? effectiveFollowerCategories(relation, fresh.categories) : fresh.categories }, thresholds: { low: settings?.target_range_low }, nowMs: nowMs + Math.max(0, Date.now() - wallStarted) }).some(item => item.episodeKey === decision.episodeKey)) return { ok: false, reason: 'expired_or_disabled' };
      // An edited preview, threshold, quiet window, opt-in or relationship must
      // be evaluated again, never sent using a stale authorization snapshot.
      const deliveryFields = ['show_health_details', 'quiet_hours_enabled', 'quiet_start_hour', 'quiet_end_hour', 'quiet_timezone', 'urgent_during_quiet'];
      const relevantChange = decision.perReadingLow
        ? deliveryFields.some(key => fresh[key] !== prefs[key]) || covered.some(event => fresh.category_activation?.[event.category] !== prefs.category_activation?.[event.category])
        : fresh.updated_date !== prefs.updated_date;
      if (relevantChange || (!decision.perReadingLow && relation && relation.permission_version !== relationship.permission_version)) return { ok: false, reason: 'configuration_changed' };
      return { ok: true };
    },
    send: message => sr.integrations.Core.SendPushNotification(message),
  });
  // Episode watermarks are never pruned; only old transport-claim keys are.
  if ((ledger.claimed_keys || []).length > 300) await sr.entities.NotificationLedger.updateMany({ id: ledger.id }, { $pull: { claimed_keys: { $in: ledger.claimed_keys.slice(0, -200) } } });
  return outcome.status;
  }
}