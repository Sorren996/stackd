# Owner feedback correction

## Behavior
- Fixed low: every distinct fresh real measurement strictly below 70 mg/dL, on/off only.
- Urgent: every distinct measurement below 55 mg/dL, on/off only. A single shared per-measurement claim coalesces low/urgent, including urgent presentation when only low is enabled.
- Existing below-range choices at exactly 70 remain effective unless explicitly superseded by a fixed-low choice. Different comfort boundaries retain their existing independent category and settings. No saved records were migrated to enable a new category.
- Freshness is eight minutes; synthetic/future/stale data, historical backfill and measurements before timestamped opt-in do not qualify. Legacy processed-reading cutover prevents re-announcing a previously processed sample.
- Fixed eligibility ignores episode recovery, repeats, custom-low configuration and unrelated preference/grant changes. Unrelated alert timing remains available.
- Atomic recipient/subject/source-measurement claims protect concurrency and callback retries. Unknown transport outcomes are not resent; failed/refused submissions are never labeled successful. This is at-most-once submission, not guaranteed OS delivery.
- Final permission, scope, consent, preview and quiet-hour checks remain server-side. New follower fixed-low access needs its explicit grant; legacy below-range permission is reused only for its identical 70 boundary.

## Appearance and interaction
Reuses SectionCard, the logging LogSheetShell (compact mode), existing switches and the logging/profile palette and pill-button conventions. Notification-only switch colors and thumb styling avoid changing other switches. Header/dock are unchanged. The sheet portal sits above the dock; its compact viewport follows visualViewport for the keyboard, with scrollable content and safe-area footer.
Switch feedback is optimistic and per-setting. A FIFO patch queue preserves later intentions while earlier writes settle, rolls failures back and displays errors. No full-page save refetch. Pending reads are canceled before cache-confirmed writes, and the local write timeout is bypassed so it cannot abandon an in-flight preference write. Editors open locally, validate before submit, and keep unsaved changes local on Cancel.

## Changed files
### Server
- base44/shared/notificationFixedLow.ts (new)
- base44/shared/notificationCore.ts
- base44/shared/notificationEpisodes.ts
- base44/shared/notificationRecipient.ts
- base44/shared/notificationDispatch.ts
- base44/shared/notificationEvaluation.ts (contract comment)
- base44/shared/notificationOptions.ts
- base44/entities/NotificationPreference.jsonc
- base44/entities/FollowNotificationPreference.jsonc
- base44/entities/NotificationDelivery.jsonc
- base44/entities/SharedAccess.jsonc
### UI
- src/pages/NotificationsPage.jsx
- src/hooks/useNotificationDraft.js
- src/lib/notifications/notificationSaveQueue.js (new)
- src/lib/notifications/notificationApi.js
- src/lib/notifications/notificationCopy.js
- src/lib/notifications/notificationPresentation.js
- src/components/forms/LogSheetShell.jsx
- src/components/ui/switch.jsx
- src/components/notifications/NotificationRuleList.jsx
- src/components/notifications/NotificationRuleRow.jsx
- src/components/notifications/NotificationRuleEditor.jsx
- src/components/notifications/NotificationLevelField.jsx
- src/components/notifications/NotificationTimingFields.jsx
- src/components/notifications/ChoiceRow.jsx
- src/components/notifications/ToggleRow.jsx
- src/components/notifications/PersonalNotificationSettings.jsx
- src/components/notifications/FollowedPersonNotifications.jsx
- src/components/notifications/NotificationPrivacyControls.jsx
- src/components/notifications/QuietHoursFields.jsx
- src/components/notifications/NotificationHowItWorks.jsx
### Checks
- base44/shared/__tests__/notificationFixedLow.test.mjs (new)
- base44/shared/__tests__/notificationRecipient.test.mjs
- base44/shared/__tests__/notificationCustomization.test.mjs
- base44/shared/__tests__/notificationCopy.test.mjs
- base44/shared/__tests__/notificationCore.test.mjs
- base44/shared/__tests__/notificationIngest.test.mjs
- base44/shared/__tests__/notificationRearm.test.mjs
- src/lib/__tests__/notificationSaveQueue.test.mjs (new)
- src/lib/__tests__/notificationSettings.test.mjs
- src/lib/__tests__/notificationPresentation.test.mjs

## Actual verification
152 isolated notification tests passed, covering 69/68/54/53, low/urgent opt-in combinations, exact boundaries, duplicate source identities, concurrent workers, stale/backfill rejection, consent/grant withdrawal, ignored legacy frequency, optional warning independence, refused/ambiguous sends, independent high/pace/missing timing, optimistic ordering, rollback, server denial, validation and unsaved draft isolation. Existing regression expectations were updated only where superseded by the new contract. Production build, scoped ESLint and diff whitespace checks passed.

No real health test pushes or demonstration user-record changes were made. Browser save/cancel and reload persistence, 320/375/390px rendering, larger text, keyboard/dock behavior, latency and native push delivery were NOT exercised on a device. The reload check is an isolated queue-state restoration check, not a live browser reload. No frontend publication was performed. For interactive QA, use the Testing Agent with a goal to check notification toggles, failure rollback, editor Save/Cancel and mobile sheet clearance without sending real pushes.