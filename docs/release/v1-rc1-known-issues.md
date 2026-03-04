# Known Issues — Overlay Threads v1 RC1

**Date:** 2026-03-03

---

## Open Issues

### KI-1: No pagination for large overlay datasets
**Severity:** Low
**Component:** OverlayStore
**Description:** `getThreadsForConversation()` and `getMessageOverlaysByConversation()` fetch all rows without pagination. Conversations with 1000+ overlay entries may experience slower load times.
**Workaround:** None needed for typical usage (< 100 threads per conversation).
**Plan:** Add cursor-based pagination in a future release if user feedback warrants it.

### KI-2: No explicit performance benchmarks
**Severity:** Low
**Component:** All
**Description:** The spec requires "overlay actions under 100ms perceived latency" but no automated performance tests validate this. Code review confirms proper indexing, memoization, and event-driven updates are in place.
**Workaround:** N/A — no user-facing issue expected at normal scale.
**Plan:** Add perf benchmarks before general availability.

### KI-3: Generic error messages in UI
**Severity:** Low
**Component:** UI (ThreadCreateDialog, LabelEditor, ThreadOverlayPanel)
**Description:** All overlay operation failures show the same generic error message (`icu:Overlay--error-generic`). Users cannot distinguish between DB errors, IPC failures, or validation issues from the UI alone.
**Workaround:** Check developer console logs for specific error details.
**Plan:** Introduce structured error types with user-facing differentiation in a future release.

### KI-4: No external telemetry integration
**Severity:** Low
**Component:** Observability
**Description:** Error and sync diagnostics are visible locally (SyncDiagnosticsPanel, console logs) but not wired to an external monitoring service. Acceptable for personal-use fork; would need telemetry for broader distribution.
**Workaround:** Monitor via SyncDiagnosticsPanel in settings and developer console.
**Plan:** Evaluate Sentry or equivalent if distributing beyond personal use.

### KI-5: iOS UIKit views are standalone
**Severity:** Info
**Component:** SignalOverlayUI (iOS)
**Description:** UIKit view controllers are self-contained and will need adaptation when integrating into Signal-iOS's navigation and theming system. This is expected — M5 delivers the building blocks, not the integration.
**Workaround:** N/A — integration is a future milestone.
**Plan:** M6+ will address Signal-iOS integration.

### KI-6: CloudKit sync requires manual Apple credentials configuration
**Severity:** Medium
**Component:** CloudKitHttpClient
**Description:** The CloudKit HTTP client requires API token, container ID, and environment configuration. There is no onboarding UI to guide credential setup.
**Workaround:** Configure via developer tools / local storage.
**Plan:** Add a sync setup wizard in a future UX pass.

### KI-7: Localization coverage is English-only
**Severity:** Low
**Component:** i18n
**Description:** All 35+ `icu:Overlay--*` keys are defined in `en/messages.json` only. No other locale translations exist.
**Workaround:** All UI renders in English.
**Plan:** Add translations if/when the fork targets non-English users.

---

## Resolved in This Release

| Issue | Resolution |
|-------|-----------|
| Thread-safety in iOS OverlayFeatureFlag | Fixed with NSLock in `b8f5643d8` |
| Potential memory leaks in iOS UIKit views | Fixed with weak delegate refs in `b8f5643d8` |
| Polling-based UI refresh (3s timer) | Replaced with EventBus pub/sub in M2 |
| No undo for destructive overlay actions | Session-scoped UndoManager added in M2 |
| Sync merger accepted invalid records | Validation gate added in M4 |
