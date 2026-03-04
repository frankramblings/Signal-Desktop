# Rollback Runbook — Overlay Threads v1 RC1

**Date:** 2026-03-03
**Scope:** Disabling or rolling back the overlay thread feature on desktop and iOS

---

## Rollback Strategy

The overlay system is designed for **fail-open** behavior. Disabling the feature flag immediately hides all overlay UI while preserving data in the database for potential re-enablement.

---

## Severity Levels

| Level | Symptom | Action |
|-------|---------|--------|
| **S1 — Critical** | Signal crashes on launch or can't send/receive messages | Disable feature flag immediately (Step 1) |
| **S2 — Major** | Overlay UI broken, errors blocking conversation view | Disable feature flag (Step 1) |
| **S3 — Minor** | Overlay data inconsistency, sync failures, cosmetic issues | Investigate first; disable if unresolvable |
| **S4 — Low** | Missing labels, stale thread counts | Fix forward; no rollback needed |

---

## Step 1: Disable Feature Flag (Immediate — < 1 minute)

This is the primary rollback mechanism. It hides all overlay UI instantly with zero data loss.

### Desktop

Open the developer console (View > Toggle Developer Tools) and run:

```js
window.storage.put('overlayThreadsEnabled', false);
window.storage.put('overlayCloudSyncEnabled', false);
```

Then reload the app (Cmd+R / Ctrl+R).

**What happens:**
- ThreadChipRow returns null (no thread chips rendered)
- Context menu overlay items disappear (null callbacks)
- ThreadOverlayPanel unreachable (panel routing skipped)
- Sync engine stops (flag checked before schedule)
- All overlay data preserved in SQLite (accessible if re-enabled)

### iOS

```swift
UserDefaults.standard.set(false, forKey: "overlayThreadsEnabled")
UserDefaults.standard.set(false, forKey: "overlayCloudSyncEnabled")
```

Or via Settings UI if integrated.

---

## Step 2: Verify Rollback Success

After disabling the flag:

1. **Conversation view** — Confirm no thread chip row above the timeline
2. **Message context menu** — Confirm "Add to thread" / "Add label" items are gone
3. **Send/receive** — Send a test message and verify delivery
4. **Search** — Verify conversation search works normally
5. **Navigation** — Switch between conversations, verify no errors

---

## Step 3: Investigate Root Cause

### Check overlay error state

Desktop developer console:
```js
// Check if overlay store is accessible
window.Signal.Data.getOverlayThreadsForConversation('test-id');
```

### Check sync diagnostics

If the issue is sync-related, the SyncDiagnosticsPanel (if accessible) shows:
- Last sync timestamp
- Last error message
- Thread/message sync counts

### Check logs

Overlay log entries are prefixed with:
- `OverlaySyncEngine:`
- `CloudKitHttpClient:`
- `OverlaySyncMerger:`
- `Overlay:`

---

## Step 4: Data Cleanup (Optional — Only if Needed)

**Use only if overlay data is corrupted and re-enablement is not desired.**

### Desktop — Drop overlay tables

```sql
-- Run via developer console or SQLite CLI
DROP TABLE IF EXISTS message_overlay;
DROP TABLE IF EXISTS thread_overlay;
DROP TABLE IF EXISTS overlay_sync_state;
DROP INDEX IF EXISTS idx_message_overlay_conversation_ref;
DROP INDEX IF EXISTS idx_message_overlay_thread_ref;
DROP INDEX IF EXISTS idx_thread_overlay_conversation_ref;
DROP INDEX IF EXISTS idx_thread_overlay_updated_at;
```

**Warning:** This permanently deletes all overlay data. The tables will be recreated (empty) if the feature is re-enabled and the app restarts through migration 1680.

### iOS — Reset GRDB overlay tables

```swift
try dbWriter.write { db in
    try db.execute(sql: "DROP TABLE IF EXISTS message_overlay")
    try db.execute(sql: "DROP TABLE IF EXISTS thread_overlay")
    try db.execute(sql: "DROP TABLE IF EXISTS overlay_sync_state")
}
```

---

## Step 5: Re-enable (When Fixed)

1. Deploy the fix
2. Set `overlayThreadsEnabled` to `true`
3. Overlay UI reappears with all previously stored data intact
4. If sync was disabled, set `overlayCloudSyncEnabled` to `true` to resume sync

---

## Escalation

| Role | Responsibility |
|------|---------------|
| **On-call engineer** | Execute Steps 1-2 within 15 minutes of S1/S2 report |
| **Engineering Lead** | Root cause analysis (Step 3), decide fix-forward vs. extended disable |
| **Frank (PM)** | Communicate status to stakeholders; approve re-enablement |

---

## Key Design Properties That Enable Safe Rollback

1. **Feature flag gates all UI** — Single boolean disables entire overlay surface
2. **No core Signal mutations** — Overlay tables are separate; dropping them doesn't affect Signal
3. **Fail-open pattern** — Overlay errors are caught and displayed as banners, never crash Signal
4. **Data preservation** — Disabling the flag preserves all data; re-enabling restores it
5. **No network side effects** — Overlay never sends data through Signal servers; only CloudKit (private)
