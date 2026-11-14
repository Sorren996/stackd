import test from 'node:test';
import assert from 'node:assert/strict';
import { lowStreamDecisions, lowBoundaries, fixedLowKey } from '../notificationLowStream.ts';
import { buildNotificationCopy, effectiveFollowerCategories } from '../notificationCore.ts';

// Pure functions only: no database, no transport, no readings written, no saved
// settings touched.
const NOW = Date.parse('2026-11-06T12:00:00.000Z');
const at = (minutesAgo) => new Date(NOW - minutesAgo * 60_000).toISOString();

let seq = 0;
const reading = (value, minutesAgo, extra = {}) => ({
  id: `row-${(seq += 1)}`,
  source: 'dexcom_share',
  value,
  recorded_at: at(minutesAgo),
  ...extra,
});

const prefs = (categories, extra = {}) => ({ master_enabled: true, categories, ...extra });
const decide = (categories, rows, extra = {}) =>
  lowStreamDecisions({
    rows,
    preferences: prefs(categories, extra.preferences),
    thresholds: { low: 70 },
    nowMs: NOW,
    ...extra.options,
  });

// ── Every distinct reading below an enabled boundary ───────────────────────

test('custom 100 plus comfort 70 with 99, 95, 69, 65 sends four, never six', () => {
  const rows = [reading(99, 6), reading(95, 4), reading(69, 2), reading(65, 1)];
  const items = decide({ custom_low: true, below_range: true }, rows, { preferences: { custom_low_mgdl: 100 } });

  assert.equal(items.length, 4, 'one event per reading, not one per matching category');
  assert.deepEqual(items.map((i) => i.category), ['custom_low', 'custom_low', 'below_range', 'below_range']);
  assert.deepEqual(items.map((i) => i.lowThreshold), [100, 100, 70, 70]);
  assert.equal(new Set(items.map((i) => i.episodeKey)).size, 4);

  // The reading that meets both boundaries is still ONE event, covering both.
  assert.deepEqual(items[2].coveredEvents.map((e) => e.category).sort(), ['below_range', 'custom_low']);
  assert.equal(items[2].coveredEvents.length, 2);
});

test('a custom-low-only reading carries the trend word, never its level', () => {
  const [item] = decide({ custom_low: true }, [reading(99, 3)], { preferences: { custom_low_mgdl: 100 } });
  assert.equal(item.category, 'custom_low');
  assert.equal(item.lowThreshold, 100);
  const copy = buildNotificationCopy({
    category: item.category, value: item.sample.value, units: 'mg/dL',
    showDetails: true, nowMs: NOW, thresholdMgdl: item.lowThreshold,
  });
  assert.equal(copy.title, '99 mg/dL');
  assert.equal(copy.body, 'New reading');
  assert.doesNotMatch(copy.body, /70|100/, 'no boundary ever reaches a preview');
});

test('a comfort-only reading uses the real comfort boundary, not the custom one', () => {
  const items = decide({ custom_low: true, below_range: true }, [reading(65, 2)], { preferences: { custom_low_mgdl: 60 } });
  assert.equal(items.length, 1);
  assert.equal(items[0].category, 'below_range');
  assert.equal(items[0].lowThreshold, 70);
  const copy = buildNotificationCopy({
    category: items[0].category, value: 65, units: 'mg/dL', showDetails: true, nowMs: NOW, thresholdMgdl: items[0].lowThreshold,
  });
  assert.equal(copy.title, '65 mg/dL');
  assert.equal(copy.body, 'New reading');
});

test('the boundary itself is not below it, and 70 is not below a fixed-70 rule', () => {
  assert.equal(decide({ custom_low: true }, [reading(100, 2)], { preferences: { custom_low_mgdl: 100 } }).length, 0);
  assert.equal(decide({ low_glucose: true }, [reading(70, 2)]).length, 0);
  assert.equal(decide({ low_glucose: true }, [reading(69, 2)]).length, 1);
  assert.equal(decide({ low_glucose: true }, [reading(69, 2)])[0].lowThreshold, 70);
});

test('successive fresh readings each send without a crossing or recovery', () => {
  const items = decide({ custom_low: true }, [reading(100, 8), reading(99, 6), reading(98, 4), reading(97, 2)], {
    preferences: { custom_low_mgdl: 100 },
  });
  // 100 is exactly the boundary, so only the three readings strictly below it.
  assert.deepEqual(items.map((i) => i.sample.value), [99, 98, 97]);
});

test('the same value measured twice is two events; reprocessing one record is one', () => {
  const rows = [reading(95, 6), reading(95, 3)];
  const first = decide({ custom_low: true }, rows, { preferences: { custom_low_mgdl: 100 } });
  assert.equal(first.length, 2, 'same number, different measurement instant');
  assert.equal(new Set(first.map((i) => i.episodeKey)).size, 2);
  // Re-running the exact same rows yields the exact same identities, so the
  // atomic claim in the dispatcher turns the second run into a duplicate.
  const again = decide({ custom_low: true }, rows, { preferences: { custom_low_mgdl: 100 } });
  assert.deepEqual(again.map((i) => i.episodeKey), first.map((i) => i.episodeKey));
});

// ── Legacy frequency settings cannot suppress a low reading ────────────────

test('stored repeat/delay values are ignored for every low boundary', () => {
  const rows = [reading(99, 6), reading(95, 4), reading(69, 2), reading(65, 1)];
  const legacy = {
    custom_low: 120, below_range: 15, urgent_low: 15, low_glucose: 30,
  };
  const items = decide({ custom_low: true, below_range: true, low_glucose: true }, rows, {
    preferences: { custom_low_mgdl: 100, repeat_minutes: legacy, custom_high_minutes: 60, missing_delay_minutes: 30 },
  });
  assert.equal(items.length, 4);
  // Every decision is per-reading: no repeat index, no duration gate.
  assert.deepEqual(items.map((i) => i.repeatIndex), [0, 0, 0, 0]);
  assert.deepEqual(items.map((i) => i.durationMinutes), [null, null, null, null]);
});

test('an opt-in still cannot replay a reading measured before it', () => {
  const rows = [reading(90, 5), reading(91, 2)];
  const items = decide({ custom_low: true }, rows, {
    preferences: {
      custom_low_mgdl: 100,
      category_activation: { custom_low: `${at(3)}|activation` },
    },
  });
  assert.deepEqual(items.map((i) => i.sample.value), [91]);
});

// ── Overlap with urgent, severity and coverage ─────────────────────────────

test('one reading below urgent and two low boundaries is one urgent notification', () => {
  const [item] = decide({ urgent_low: true, custom_low: true, below_range: true }, [reading(54, 2)], {
    preferences: { custom_low_mgdl: 100 },
  });
  assert.equal(item.category, 'urgent_low');
  assert.equal(item.lowThreshold, null, 'urgent keeps its own approved copy');
  assert.deepEqual(item.coveredEvents.map((e) => e.category).sort(), ['below_range', 'custom_low', 'urgent_low']);
});

test('an urgent reading without the urgent opt-in still notifies as the low rule that matched', () => {
  const [item] = decide({ custom_low: true }, [reading(54, 2)], { preferences: { custom_low_mgdl: 100 } });
  assert.equal(item.category, 'custom_low');
  assert.equal(item.lowThreshold, 100);
});

test('a value of exactly 55 is not urgent; 54 is', () => {
  assert.equal(decide({ urgent_low: true }, [reading(55, 2)]).length, 0);
  assert.equal(decide({ urgent_low: true }, [reading(54, 2)])[0].category, 'urgent_low');
});

// ── Disabled and unauthorized combinations ─────────────────────────────────

test('master off, both low rules off, or a single rule off all behave exactly as chosen', () => {
  const rows = [reading(69, 2)];
  assert.equal(lowStreamDecisions({ rows, preferences: prefs({ custom_low: true, below_range: true }, { master_enabled: false }), thresholds: { low: 70 }, nowMs: NOW }).length, 0);
  assert.equal(decide({}, rows).length, 0);
  assert.deepEqual(decide({ below_range: true }, rows).map((i) => i.category), ['below_range']);
  assert.deepEqual(decide({ custom_low: true }, rows, { preferences: { custom_low_mgdl: 100 } }).map((i) => i.category), ['custom_low']);
});

test('a follower only receives the categories the sharer granted and they chose', () => {
  const relationship = {
    id: 'access', status: 'active', sharer_user_id: 'owner', follower_user_id: 'follower',
    scopes: { glucose: true }, push: { below_range: true }, permission_version: 1,
  };
  const effective = effectiveFollowerCategories(relationship, { custom_low: true, below_range: true });
  const items = lowStreamDecisions({
    rows: [reading(65, 2)],
    preferences: prefs(effective, { custom_low_mgdl: 100 }),
    thresholds: { low: 70 },
    nowMs: NOW,
  });
  assert.deepEqual(items.map((i) => i.coveredEvents.map((e) => e.category)), [['below_range']]);
  assert.equal(lowBoundaries(prefs(effective, { custom_low_mgdl: 100 }), { low: 70 }).some((b) => b.category === 'custom_low'), false);
});

test('quiet hours hold a boundary back instead of being bypassed', () => {
  const items = lowStreamDecisions({
    rows: [reading(65, 2)],
    preferences: prefs({ urgent_low: true, below_range: true, custom_low: true }, { custom_low_mgdl: 100 }),
    thresholds: { low: 70 },
    nowMs: NOW,
    allowed: (key) => key === 'urgent_low',
  });
  assert.equal(items.length, 0, 'no permitted low category for a 65 reading');
  const urgent = lowStreamDecisions({
    rows: [reading(54, 2)],
    preferences: prefs({ urgent_low: true, below_range: true, custom_low: true }, { custom_low_mgdl: 100 }),
    thresholds: { low: 70 },
    nowMs: NOW,
    allowed: (key) => key === 'urgent_low',
  });
  assert.equal(urgent.length, 1);
  assert.deepEqual(urgent[0].coveredEvents.map((e) => e.category), ['urgent_low']);
});

// ── Freshness: stale, backfilled and synthetic readings never queue ─────────

test('stale, future, synthetic, backfilled and conflicting readings are never eligible', () => {
  const stale = reading(69, 9);
  const future = { ...reading(69, 0), recorded_at: new Date(NOW + 120_001).toISOString() };
  const synthetic = reading(69, 2, { source: 'system' });
  const backfilled = reading(69, 30, { created_date: new Date(NOW).toISOString() });
  const ahead = reading(69, 2, { created_date: new Date(NOW + 5 * 60_000).toISOString() });
  for (const row of [stale, future, synthetic, backfilled, ahead]) {
    assert.equal(decide({ custom_low: true }, [row], { preferences: { custom_low_mgdl: 100 } }).length, 0, JSON.stringify(row));
  }
  // Two rows for one measurement that disagree are unusable data, not news.
  const conflict = [reading(69, 2), { ...reading(69, 2), id: 'other', value: 140 }];
  assert.equal(decide({ custom_low: true }, conflict, { preferences: { custom_low_mgdl: 100 } }).length, 0);
});

// ── Legacy fixed-70 choice is preserved, never remapped ────────────────────

test('the legacy "below comfort zone at exactly 70" choice stays the low stream', () => {
  assert.equal(fixedLowKey(prefs({ below_range: true }), { low: 70 }), 'below_range');
  const legacy = decide({ below_range: true }, [reading(69, 2)]);
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].category, 'below_range');
  assert.equal(legacy[0].lowThreshold, 70);
  // With a real comfort boundary the fixed stream is the 70 rule instead, and
  // the comfort boundary stays its own separate choice.
  assert.equal(fixedLowKey(prefs({ below_range: true }), { low: 85 }), 'low_glucose');
  assert.deepEqual(
    lowBoundaries(prefs({ below_range: true }, { custom_low_mgdl: null }), { low: 85 }).map((b) => [b.category, b.mgdl]),
    [['below_range', 85]]
  );
});

// ── Copy: units, follower wording and privacy ──────────────────────────────

test('copy follows the recipient’s own units and stays private unless details are on', () => {
  const mmol = buildNotificationCopy({
    category: 'custom_low', value: 99, units: 'mmol/L', showDetails: true, nowMs: NOW,
  });
  assert.equal(mmol.title, '5.5 mmol/L');
  assert.equal(mmol.body, 'New reading');

  const follower = buildNotificationCopy({
    category: 'below_range', value: 65, units: 'mg/dL', showDetails: true, nowMs: NOW,
    thresholdMgdl: 70, personName: 'Chris',
  });
  assert.equal(follower.title, 'Chris · 65 mg/dL');
  assert.equal(follower.body, "New reading");

  const priv = buildNotificationCopy({
    category: 'custom_low', value: 99, units: 'mg/dL', showDetails: false, nowMs: NOW, thresholdMgdl: 100,
  });
  assert.deepEqual(priv, { title: 'Stackd update', body: 'Open Stackd to review.' });
});