# Stackd notification customization: implementation and verification

## Scope and isolation

Implemented the approved notification controls in Stackd only. Recent notifications no longer renders in either settings variant, and getNotificationCenter no longer queries NotificationDelivery. Delivery, episode, claim and audit records remain internal. No existing delivery records were deleted.

Notification-only canonical fields are custom_low_mgdl, custom_high_mgdl, custom_high_minutes, falling_fast_rate, rising_fast_rate, falling_fast_level_mgdl, rising_fast_level_mgdl and repeat_minutes. New custom/pace categories and per-follower grants default false. Existing urgent, below-comfort, above-comfort, missing-reading opt-ins, durations, preview and quiet preferences are retained; nothing migrates their consent into new categories. Existing follower above-comfort timing is inherited from the owner's existing timing until the follower chooses their own.

Low is 60–150 mg/dL, high is 100–400 mg/dL, and the separation is at least 20 mg/dL when both are set, including when switches are off. Optional pace-level conditions support 40–400 mg/dL. The controls select canonical integer mg/dL values while displaying the app's chosen units; mmol/L display uses Stackd's existing /18 convention. Values do not turn categories on. Both client and server validate configuration. All saves are restricted to the notification preference entities; no writes to UserSettings or calculation inputs occur. Comfort bounds are displayed read-only, with the exact approved explanatory copy.

No changes were made to startup, consent, onboarding, authentication, global query handling, comfort-zone settings, chart/display trends, daily-balance logic, insulin math, meal analysis, projection logic, or consent/re-consent flags. The RLS objects of the five extended entities retain their existing rules. Account-specific notification query keys and prior account-switch/cache clearing remain unchanged.

## Engine decisions

- Existing new-reading workflow and five-minute server sweep continue to call evaluateNotifications; app-open state is not required. The evaluator reads the latest stored measurement rather than replaying the triggering backlog row.
- Custom low is <= its selected bound; below-comfort is strictly < the existing lower bound; urgent remains strictly <55, not <=55. Custom high is >= its selected bound, while above-comfort remains strictly > the existing upper bound.
- State is independent per recipient, sharing relationship and category. No broad recipient cooldown is introduced. New opt-ins use server-generated category_activation markers, so enabling/re-enabling while already beyond a bound waits for the next fresh measurement and can then begin one episode.
- Simultaneous eligible events coalesce into one push. Urgent wins; among low bounds the lower level is more serious, and among high bounds the higher level is more serious. Threshold stages precede pace-only events. Every covered category/episode/repeat event is recorded on the delivery attempt and consumed in per-stage state. Equal custom/comfort bounds are aliases for coalescing despite their different strict/inclusive comparators, so the next reading does not generate a duplicate.
- Level hysteresis is 5 mg/dL back past the bound, with two consecutive fresh recovery samples spaced 3–7 minutes apart. A stale observation, unknown pace, or a gap does not count as recovery. Pace recovery uses a 0.5 mg/dL/min margin and two fresh qualifying recovery windows. An intervening non-recovery reading prevents re-arming.
- Custom-high first-alert delay is explicitly 0, 15, 30 or 60 minutes; above-comfort keeps its existing 15/30/60 choices. A recovery or an unproven interval longer than seven minutes resets high persistence. Low and urgent crossings have no first-alert delay.
- Repeats are once per episode unless that category's repeat_minutes explicitly selects 15, 30, 60 or 120 minutes. They depend on a fresh still-eligible measurement, except missing-reading repeats, which require explicit configuration and remain bounded by the existing gap-age policy. Opening a push is not treated as care acknowledgment. No five-minute audible escalation, predictive Urgent Low Soon, critical-alert bypass or delivery guarantee is added.
- Existing threshold freshness is eight minutes; the pace fallback permits latest age up to ten minutes. Future, synthetic and replayed measurements do not start threshold episodes.
- Compare-and-set episode_revision serializes decisions on the recipient's stable opt-in ledger. Optional fields are returned as null by the entity service, so initial CAS matches null, not $exists:false. Transport claims append a scalar key, not [key]; the latter creates nested arrays and defeats $nin. Existing nested/spent legacy keys are still recognized. Legacy low/high episode consumption is carried forward conservatively; new categories never inherit it.
- Generic previews contain only Stackd update / Open Stackd for details. Detailed previews remain factual, with measured value and reading time, and no advice. Follower detailed previews use the recipient's own display units. Existing quiet policy is retained, including the separate urgent-during-quiet choice. A permitted urgent event also covers lower simultaneous stages held by quiet hours.

## Source trend availability and rapid-change fallback

Inspected the actual latest five incoming rows: dexcom_share, a string trend field such as FortyFiveDown, and no numeric rate/slope metadata. Also inspected both Share and official API ingestion paths: both currently persist categorical trend, not a validated continuous numeric rate. These categories cannot establish a 2 or 3 mg/dL/min numerical cutoff; they are not converted into fabricated velocities.

The Stackd-only fallback uses least-squares slope on four consecutive, unique, real CGM observations from one source (dexcom or dexcom_share). Their actual timestamps must span 12–18 minutes, with every interval 3–7 minutes, and latest age <=10 minutes. No manual, interpolated, system or projected values are used, and sources are never mixed. Conflicting duplicate IDs/timestamps make pace unknown; out-of-order callbacks cannot replay an already processed instant. Rate 2 includes faster changes and rate 3 includes >=3. The optional level condition must also hold, inclusive at the chosen level.

Additional noise guard: every adjacent interval must agree with the direction, be at least half the selected minimum rate, and be no more than twice the fitted magnitude. This intentionally rejects isolated step spikes and inconsistent directions. It is documented as Stackd behavior, not Dexcom equivalence, and does not alter chart arrows or conversational trend sublines.

## Followers and privacy

Each new category needs an explicit sharer grant and the follower's own opt-in. Settings show only authorized rows. Immediately before transport, the server rereads preferences and relationship, checks owner/recipient/relationship identity, active state, glucose scope, category grants, opt-ins, configuration timestamp and permission version. A changed/removed authorization or changed preview/configuration cancels the queued attempt rather than sending stale details. A failed/ambiguous provider response is not retried automatically. Email consent and phone-call permission remain separate and unchanged.

## Concrete changes

Backend handlers:
- base44/functions/evaluateNotifications/entry.ts: shared per-recipient engine for reading triggers and server sweep, current-reading selection, paginated recipient discovery and recipient display settings.
- base44/functions/getNotificationCenter/entry.ts: no delivery-history fetch, effective grants/preferences and read-only comfort bounds, preserved legacy follower timing.
- base44/functions/updateNotificationPreferences/entry.ts and updateFollowNotificationPreferences/entry.ts: validated new values and server-generated opt-in activation markers.
- updateRelationshipPushGrants handler remains in place and uses the expanded shared category sanitizer; no parallel grant endpoint was introduced.

Shared modules:
- notificationOptions.ts: defaults, input validation and categoryActivation.
- notificationEpisodes.ts: advanceNotificationEpisodes, independent state, hysteresis, high persistence, repeats, priority and coalescing.
- notificationVelocity.ts: episodeSamples, notificationVelocity and velocityMeets.
- notificationRecipient.ts: recipientAuthorized, CAS state transition, final authorization recheck and existing native dispatch integration.
- notificationLegacyEpisodes.ts: legacyEpisodeState compatibility for spent episode keys.
- notificationCore.ts: expanded category contract, preserved preference merging/grant clamping, factual previews and matching app unit formatting.
- notificationDispatch.ts: covered_events audit metadata; existing native transport and conservative failure handling retained.

Extended existing entities: NotificationPreference, FollowNotificationPreference, SharedAccess, NotificationLedger and NotificationDelivery; no new data entity or auth/RLS policy was introduced.

Frontend:
- src/pages/NotificationsPage.jsx: removes Recent UI, opening handler and unused imports.
- PersonalNotificationSettings.jsx and FollowedPersonNotifications.jsx: compact shared editorial rows with retained privacy/quiet controls.
- New focused components NotificationRuleList, NotificationRuleFields, NotificationLevelField, NotificationThresholdNote and NotificationPrivacyControls.
- src/hooks/useNotificationDraft.js and src/lib/notifications/notificationForm.js: local validation, canonical unit presentation and exact isolation copy.
- notificationCopy.js and notificationApi.js: expanded factual category labels and validation messages.
- Existing RelationshipSheet automatically gains the four explicit new grant switches through CATEGORY_COPY; each remains off unless the sharer enables it.

## Verification actually run

111 deterministic tests passed, zero failed:
- 49 retained core/dispatch checks.
- 43 customization, re-arm, recipient/CAS, authorization and static personal/follower rendering checks.
- 19 existing consent/startup regression checks.

Coverage includes defaults/preserved preferences, threshold/calculation-input separation, 100 → exact 70 → below 70 → urgent escalation, <55 equality, simultaneous and equal-bound coalescing, boundary jitter/re-arm, first fresh already-low and re-enabled categories, stale/backfilled/future/duplicate data, high persistence/reset, actual-time pace/rate/level gating, spikes/direction/gaps, quiet hours, generic previews, denied/revoked follower grants and identity, per-user ledger isolation, explicit repeats, and no Recent UI/history fetching. UI tests render the actual personal and follower components, including canonical mmol/L options; they are not browser click-through tests.

Also passed: targeted frontend ESLint, production Vite build, and git diff whitespace checks. Verified no changes to startup/auth/consent/calculation source paths.

Preview backend probes actually run: getNotificationCenter returned 200 with old opt-ins intact, new categories false and no recent history; invalid low, too-small separation and invalid pace returned 400; missing follower/grant access IDs returned 400; the evaluator's nonexistent-reading probe returned no_reading without sending push.

Actual entity concurrency verification used isolated temporary verification ledgers, never real notification scopes: five simultaneous scalar claims produced [1,0,0,0,0], and five simultaneous null-revision CAS transitions produced [1,0,0,0,0]. Only these temporary test records were removed afterward. No existing preferences were edited by the probes and no native push was sent as a test.

## Unverified and deployment

Not verified on a physical iPhone: OS permission handling, native receipt/tap behavior, timing while closed, store-build push credentials, lock-screen rendering or real delivery. Full interactive save/reload and multi-account browser flows also remain for the Testing Agent; suggested goal: save a custom low, verify it persists without changing comfort bounds, then switch accounts and check a follower can configure only granted categories.

Not published. The owner must use Publish at the top of the editor for these frontend and backend versions to reach the published app. The existing native app still needs working push credentials/device permission and the server workflows must remain active. These notification-logic/UI changes ordinarily do not require a new native binary when native push is already configured; changing native permissions or adding native push to a build would require regenerated app files. No new secret, provider, native permission or package was introduced. No claim of native iOS push verification or guaranteed delivery is made.