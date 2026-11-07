# Stackd startup reliability correction

## Findings and evidence boundary

Both reported headings are emitted by `AuthenticatedApp` in `src/App.jsx`, using the unchanged `src/components/StartupRecovery.jsx` presentation:

- **We could not confirm your account status**: the user-scoped acknowledgment query failed. Dependencies: auth readiness, `useAccessProfile`, `loadAcknowledgments`, `UserAcknowledgment.filter`, query-cache error handling and session revalidation.
- **We could not finish checking your set-up**: the user-scoped onboarding/setup query failed after role and consent checks. Dependencies: `UserSettings.filter`, followed where necessary by saved-reading, meal and dose existence checks.

The screenshots identify the failing gates, not their underlying HTTP responses. No device request trace from 10:21 was available, so this correction does not claim a particular live 429, timeout or server outage caused those individual incidents.

### Verified code defects corrected

1. Consent used a 12-second hard deadline that discarded valid slower responses; a subsequent retry could launch another read while the original transport was still pending. The old policy also excluded 429 from retry and did not honor Retry-After. Regression coverage now includes a valid 13-second response and reattachment after a shorter test deadline.
2. Setup had separate redundant settings reads, uncapped existence checks and a Promise.all whose unnecessary sibling failure could defeat an already positive legacy-account signal. Its Retry button invalidated consent, setup, settings and account profile together instead of retrying the failed gate.
3. Startup queries were immediately stale, and reconnect/content refresh could re-run successful gates and replace the working view with a recovery screen. Explicit consent, invitation and self-tracking invalidation remains; routine content refresh no longer restarts startup gates.
4. Account-profile server reads swallowed failures as empty lists. Its shared currentUser helper also converted every auth error, including transient failures, into an unauthenticated answer. The startup endpoint now preserves real 401/403/429 distinctions and fails closed on unavailable/malformed role inputs; other sharing helpers and scope enforcement are unchanged.
5. The client profile hook had a patient fallback on error. Unknown mode now remains null.
6. Bootstrap calls could redundantly restart the application-level checks. Existing attempt-generation protection and SDK auth.me deduplication were already present; there is no evidence that the earlier cold-start/root-route race is the current incident cause. The correction adds application-level single-flight coordination, shares session revalidation with bootstrap, retires cancelled consumers, and ensures post-consent refresh waits for any pre-write session read before starting a fresh check.

## Recovery behavior

- Maximum three attempts per failed read, exponential backoff, no automatic retries for 401/403 or invalid/ownership-mismatched responses.
- Retry-After supports seconds and HTTP dates, including the SDK's originalError response headers. Long waits fail boundedly while suppressing premature requests until the server's wait expires.
- Each wait window allows 45 seconds of foreground time. Document background time does not consume that deadline. Still-live transports are shared across windows; settled promises are never cached.
- Try again retries only the failed gate and joins concurrent retries instead of cancelling/restarting them.
- Failed transient gates may recover on online, pageshow or visibility events, at most twice per account/stage and at least 30 seconds apart. Verified views do not initiate another startup pass just because these events fire.
- Diagnostics contain fixed stages, outcome/error codes, HTTP status, duration and retry count. They do not include tokens, credentials, raw errors, account identifiers or health contents.

## Preserved boundaries

Authorization, entity RLS, relationship scopes, consent checks, settings-confirmation rules and dose calculations were not weakened. No onboarding/account records were reset or marked complete to hide errors. The existing legacy-account eligibility rule remains based on successful server reads, but the check no longer writes onboarding_completed. Existing non-blocking timezone synchronization remains. No new health-data fallback or current-reading inference was added. Insights/day-view implementation, notification evaluation and data records were not modified by this correction's tests.

## Exact production files changed

- `src/App.jsx`
- `src/lib/AuthContext.jsx`
- `src/lib/access/profileApi.js`
- `src/lib/consentStartup.js`
- `src/lib/startupRequest.js`
- `src/lib/startupSetup.js`
- `src/lib/startupDiagnostics.js`
- `src/lib/startupAwait.js`
- `src/lib/startupSession.js`
- `src/lib/startupTransport.js`
- `src/hooks/useAccessProfile.js`
- `src/hooks/useStartupRecovery.js`
- `src/pages/RequiredAcknowledgments.jsx`
- `src/components/settings/ConsentManagement.jsx`
- `src/components/Layout.jsx`
- `src/components/follower/FollowerLayout.jsx`
- `base44/functions/getMyAccessProfile/entry.ts`

## Test files added/updated

- `src/lib/__tests__/consentStartup.test.mjs`
- `src/lib/__tests__/startupReliability.test.mjs`
- `src/lib/__tests__/startupProfile.test.mjs`
- `src/lib/__tests__/startupTestModules.mjs`

The existing `src/lib/__tests__/startupDiagnostics.test.mjs` was also run, without changes. This report is `src/lib/STARTUP_RELIABILITY_REPORT.md`.

## Validation actually performed

- **38 automated tests passed**, zero failures: bounded 429/503 handling, Retry-After parsing/cooldown, fresh retry after failure, real denials, malformed results, owner/account isolation, same-query overlapping retries, session retirement, ignored stale completions, 13-second valid reads, simulated background time, simulated offline/reconnect, quiet verified query resume, read-only new/legacy setup decisions and mocked server follower/personal classification.
- Targeted ESLint completed with exit 0.
- Production build completed with exit 0. It reported an existing outdated Browserslist-data warning.
- Read-only `getMyAccessProfile` tool invocations returned 200 with a valid personal-account profile. No record-writing action was exercised.

## Not verified / native limitations

- No physical iPhone, TestFlight or live browser end-to-end verification was performed; no publication was initiated.
- Unit tests simulate visibility, connectivity and query lifecycle; they do not prove actual iOS suspension, native token restoration or Capacitor event delivery.
- SDK read methods used here do not expose transport cancellation. Cancelled consumers cannot apply stale results, but the native network request may continue. A permanently hung native transport is shared rather than duplicated; if the WebView never settles it, restarting the app may still be required.
- Mounted React recovery-button behavior and complete new-user/follower journeys still need Testing Agent/device validation. Suggested Testing Agent goals: “Cold-start and resume personal and follower accounts through slow, offline and restored connections” and “Exercise 429/5xx recovery, genuine 401/403, repeated retry clicks and account changes without bypassing consent or setup.”