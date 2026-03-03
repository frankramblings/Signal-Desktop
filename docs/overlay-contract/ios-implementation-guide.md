# iOS Implementation Guide -- Overlay System Parity

This document is the primary reference for the iOS engineering team to implement
the overlay system (thread grouping, labels, pins, notes) with full behavioral
parity to the Signal Desktop fork. It should be read alongside the
[Overlay Shared Contract](./overlay-shared-contract.md), which defines the
canonical cross-platform data model, serialization, and conflict resolution
rules.

**Version:** 1.0
**Last updated:** 2026-03-03
**Desktop milestone:** M3 (CloudKit sync shipped)
**Target iOS milestone:** M4

---

## Table of Contents

1. [Module Mapping Table](#1-module-mapping-table)
2. [CloudKit API Differences](#2-cloudkit-api-differences)
3. [Behavior Parity Checklist](#3-behavior-parity-checklist)
4. [Cross-Device Test Matrix](#4-cross-device-test-matrix)
5. [SQLite Schema (GRDB)](#5-sqlite-schema-grdb)
6. [Testing](#6-testing)
7. [Architecture Notes](#7-architecture-notes)
8. [Feature Flags](#8-feature-flags)
9. [Appendix: Desktop File Reference](#appendix-desktop-file-reference)

---

## 1. Module Mapping Table

Each desktop TypeScript module has a direct Swift counterpart. The table below
shows the mapping, recommended framework, and implementation notes.

| Desktop Module | iOS Module | Framework | Notes |
|---|---|---|---|
| `MessageRefAdapter.std.ts` | `MessageRefAdapter.swift` | Pure Swift | Same string format (`<conversationId>:<signalMessageId>` or `<conversationId>:<senderAciOrId>:<sentAtMs>`). Pure function, no dependencies. Must produce byte-identical output to desktop for the same inputs. |
| `OverlayStore.node.ts` | `OverlayStore.swift` | GRDB (recommended) | GRDB provides the closest SQLite parity to desktop's better-sqlite3. Core Data is an alternative but adds ORM overhead and makes it harder to guarantee schema-level parity. |
| `OverlayFeatureFlag.std.ts` | `OverlayFeatureFlag.swift` | `UserDefaults` | Same flag keys: `overlayThreadsEnabled`, `overlayCloudSyncEnabled`. Resolution order: test override, then UserDefaults, then default `false`. |
| `OverlaySchemaValidator.std.ts` | `OverlaySchemaValidator.swift` | Pure Swift | Same validation rules. Must load and pass the same JSON fixture files as desktop (see Section 6). |
| `CloudKitHttpClient.node.ts` | `CloudKitNativeAdapter.swift` | CloudKit framework | Desktop uses REST/HTTP because Electron has no native CloudKit access. iOS MUST use the native `CKDatabase` API instead. See Section 2 for detailed differences. |
| `OverlaySyncEngine.node.ts` | `OverlaySyncEngine.swift` | Foundation + CloudKit | Same pull-then-merge-then-push loop. Replace polling with `CKDatabaseSubscription` for push notifications. Timers for periodic fallback sync. |
| `OverlaySyncMerger.node.ts` | `OverlaySyncMerger.swift` | Pure Swift | Identical conflict resolution algorithm. The `resolveConflict` function must produce the same output as desktop for all fixture inputs. |
| `OverlayService.dom.ts` | `OverlayService.swift` / `OverlayViewModel.swift` | SwiftUI / UIKit | Desktop's renderer-side facade becomes an iOS ViewModel (or service layer). Wraps OverlayStore CRUD, emits events, manages undo stack. |
| `OverlaySyncStoreExtensions.node.ts` | `OverlaySyncStoreExtensions.swift` | GRDB | Delta queries (`getThreadsDirtySince`, `getMessagesDirtySince`) and sync state CRUD. Keep separate from core OverlayStore as desktop does. |
| `OverlaySyncTypes.std.ts` | `OverlaySyncTypes.swift` | Pure Swift | Enums and structs: `SyncStatus`, `SyncDiagnostics`, `SyncRecord`, `ConflictResolution`, etc. |
| `OverlayTypes.std.ts` | `OverlayTypes.swift` | Pure Swift | `ThreadOverlay`, `MessageOverlay`, row types, input types. Use `Codable` for JSON/SQLite serialization. |
| `OverlayEventBus.dom.ts` | `OverlayEventBus.swift` | Combine / NotificationCenter | Pub/sub for overlay changes. Desktop uses a custom event bus; iOS should use Combine publishers or NotificationCenter. |
| `OverlayUndoManager.dom.ts` | `OverlayUndoManager.swift` | Foundation `UndoManager` or custom | Session-scoped undo stack, max 20 entries. Can wrap Foundation's `UndoManager` or implement the same custom stack as desktop. |

### Recommended Project Structure

```
Signal-iOS/
  Overlay/
    Models/
      OverlayTypes.swift
    Services/
      MessageRefAdapter.swift
      OverlayService.swift
      OverlayEventBus.swift
      OverlayUndoManager.swift
    Store/
      OverlayStore.swift
      OverlaySyncStoreExtensions.swift
    Contract/
      OverlaySchemaValidator.swift
    Sync/
      CloudKitNativeAdapter.swift
      OverlaySyncEngine.swift
      OverlaySyncMerger.swift
      OverlaySyncTypes.swift
    FeatureFlags/
      OverlayFeatureFlag.swift
    UI/
      ThreadChipRow.swift
      ThreadOverlayPanel.swift
      ThreadCreateView.swift
      LabelEditorView.swift
      SyncDiagnosticsView.swift
      OverlayErrorBanner.swift
      OverlayUndoToast.swift
```

---

## 2. CloudKit API Differences

Desktop and iOS access the same CloudKit private database and zone, but use
fundamentally different APIs. This section documents the mapping.

### 2.1 Transport Layer

| Concern | Desktop (`CloudKitHttpClient.node.ts`) | iOS (`CloudKitNativeAdapter.swift`) |
|---|---|---|
| **API style** | CloudKit Web Services REST (HTTP POST) | Native CloudKit framework (`CKDatabase`) |
| **Authentication** | API token in `Authorization: Bearer` header | Automatic via signed-in iCloud account |
| **Configuration** | `CloudKitConfig { containerIdentifier, apiToken, environment }` | `CKContainer(identifier:)` -- no API token needed |
| **Serialization** | Manual JSON: `{ fields: { key: { value: ... } } }` | Native `CKRecord` key-value coding |
| **Zone creation** | POST to `/zones/modify` | `CKModifyRecordZonesOperation` |
| **Fetch changes** | POST to `/records/changes` with `syncToken` | `CKFetchRecordZoneChangesOperation` with `CKServerChangeToken` |
| **Push records** | POST to `/records/modify` with `forceReplace` operation type | `CKModifyRecordsOperation` with `savePolicy = .changedKeys` or `.allKeys` |
| **Delete records** | `operationType: "delete"` in modify request | Set `recordIDsToDelete` on `CKModifyRecordsOperation` |
| **Push notifications** | Not available (polling only) | `CKDatabaseSubscription` + silent push via `didReceiveRemoteNotification` |
| **Error handling** | HTTP status codes + JSON error body | `CKError` codes (`.serverRecordChanged`, `.zoneNotFound`, etc.) |

### 2.2 Shared Constants

These values MUST be identical on both platforms:

| Constant | Value |
|---|---|
| Zone name | `OverlayZone` |
| Database | Private (`CKContainer.default().privateCloudDatabase`) |
| Record type: threads | `ThreadOverlay` |
| Record type: messages | `MessageOverlay` |
| Thread record name pattern | `thread:<thread_ref>` |
| Message record name pattern | `message:<id>` |
| Labels storage format | JSON string in a single `STRING` field (`labels_json`) |
| Push operation | `forceReplace` (desktop) / `savePolicy: .allKeys` (iOS) |

### 2.3 iOS-Specific: CKRecord Field Mapping

```swift
// Writing a ThreadOverlay to CKRecord
func toCKRecord(_ thread: ThreadOverlay, in zone: CKRecordZone.ID) -> CKRecord {
    let recordID = CKRecord.ID(
        recordName: "thread:\(thread.threadRef)",
        zoneID: zone
    )
    let record = CKRecord(recordType: "ThreadOverlay", recordID: recordID)
    record["thread_ref"] = thread.threadRef as CKRecordValue
    record["conversation_ref"] = thread.conversationRef as CKRecordValue
    record["title"] = thread.title as CKRecordValue?
    record["color"] = thread.color as CKRecordValue?
    record["is_pinned"] = NSNumber(value: thread.isPinned ? 1 : 0)
    record["updated_at"] = NSNumber(value: thread.updatedAt)
    record["version"] = NSNumber(value: thread.version)
    return record
}

// Writing a MessageOverlay to CKRecord
func toCKRecord(_ message: MessageOverlay, in zone: CKRecordZone.ID) -> CKRecord {
    let recordID = CKRecord.ID(
        recordName: "message:\(message.id)",
        zoneID: zone
    )
    let record = CKRecord(recordType: "MessageOverlay", recordID: recordID)
    record["id"] = message.id as CKRecordValue
    record["message_ref"] = message.messageRef as CKRecordValue
    record["conversation_ref"] = message.conversationRef as CKRecordValue
    record["thread_ref"] = message.threadRef as CKRecordValue?
    // Labels are stored as a JSON string, NOT a CKRecord list
    let labelsData = try? JSONEncoder().encode(message.labels)
    record["labels_json"] = String(data: labelsData ?? Data("[]".utf8), encoding: .utf8)! as CKRecordValue
    record["note"] = message.note as CKRecordValue?
    record["updated_at"] = NSNumber(value: message.updatedAt)
    record["version"] = NSNumber(value: message.version)
    return record
}
```

### 2.4 iOS-Specific: CKRecord Parsing

```swift
func parseThreadOverlay(from record: CKRecord) -> ThreadOverlay? {
    guard record.recordType == "ThreadOverlay" else { return nil }
    guard let threadRef = record["thread_ref"] as? String,
          let conversationRef = record["conversation_ref"] as? String,
          let updatedAt = record["updated_at"] as? Int64,
          let version = record["version"] as? Int64 else {
        return nil
    }
    let isPinnedRaw = record["is_pinned"] as? Int64 ?? 0
    return ThreadOverlay(
        threadRef: threadRef,
        conversationRef: conversationRef,
        title: record["title"] as? String,
        color: record["color"] as? String,
        isPinned: isPinnedRaw != 0,
        updatedAt: Int(updatedAt),
        version: Int(version)
    )
}

func parseMessageOverlay(from record: CKRecord) -> MessageOverlay? {
    guard record.recordType == "MessageOverlay" else { return nil }
    guard let id = record["id"] as? String,
          let messageRef = record["message_ref"] as? String,
          let conversationRef = record["conversation_ref"] as? String,
          let updatedAt = record["updated_at"] as? Int64,
          let version = record["version"] as? Int64 else {
        return nil
    }
    var labels: [String] = []
    if let labelsJson = record["labels_json"] as? String,
       let data = labelsJson.data(using: .utf8) {
        labels = (try? JSONDecoder().decode([String].self, from: data)) ?? []
    }
    return MessageOverlay(
        id: id,
        messageRef: messageRef,
        conversationRef: conversationRef,
        threadRef: record["thread_ref"] as? String,
        labels: labels,
        note: record["note"] as? String,
        updatedAt: Int(updatedAt),
        version: Int(version)
    )
}
```

### 2.5 iOS-Specific: Push Notifications via CKDatabaseSubscription

Desktop polls every 5 minutes because CloudKit Web Services does not support
push notifications. iOS can and should use `CKDatabaseSubscription` for
real-time change notification.

```swift
func subscribeToOverlayChanges() {
    let subscription = CKDatabaseSubscription(subscriptionID: "overlay-changes")
    let notificationInfo = CKSubscription.NotificationInfo()
    notificationInfo.shouldSendContentAvailable = true // silent push
    subscription.notificationInfo = notificationInfo

    let operation = CKModifySubscriptionsOperation(
        subscriptionsToSave: [subscription],
        subscriptionIDsToDelete: nil
    )
    operation.modifySubscriptionsResultBlock = { result in
        switch result {
        case .success:
            // Subscription active
            break
        case .failure(let error):
            // Log and fall back to polling
            print("Subscription failed: \(error)")
        }
    }
    CKContainer.default().privateCloudDatabase.add(operation)
}
```

When a silent push arrives in `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)`,
trigger `OverlaySyncEngine.syncNow()`.

### 2.6 Sync Timing Comparison

| Trigger | Desktop | iOS |
|---|---|---|
| Startup delay | 5 seconds | 5 seconds |
| Periodic poll | 5 minutes | 5 minutes (fallback; push is primary) |
| After local write | 10 second debounce | 10 second debounce |
| Push notification | N/A | Immediate sync on silent push |
| Retry backoff | 1s initial, 2x exponential, 5min cap | Same: 1s initial, 2x exponential, 5min cap |

---

## 3. Behavior Parity Checklist

Every item below MUST behave identically on iOS and desktop. The checklist is
organized by category. Mark each item as passing during implementation review.

### CRUD Operations

| # | Behavior | Acceptance Criteria |
|---|---|---|
| 1 | Create thread overlay | Given a `thread_ref` and `conversation_ref`, a `ThreadOverlay` record is created with `version=1`, `updated_at=Date.now()`, `is_pinned=false`. |
| 2 | Update thread overlay | Setting `title`, `color`, or `is_pinned` increments `version` by 1 and sets `updated_at` to current timestamp. |
| 3 | Delete thread overlay | Deleting a thread sets `thread_ref=NULL` on all associated `MessageOverlay` records before removing the thread row. |
| 4 | Create message overlay | Given a `message_ref` derived by `MessageRefAdapter`, a `MessageOverlay` record is created with `version=1`, `labels=[]`, `note=null`. |
| 5 | Update message overlay labels | Labels are replaced wholesale (entire array), not merged element-by-element. `version` increments, `updated_at` updates. |
| 6 | Update message overlay note | Setting `note` to a string or `null` increments `version` and updates `updated_at`. |
| 7 | Delete message overlay | Row is removed from `message_overlay`. No cascade to other tables. |
| 8 | Query threads by conversation | Returns threads ordered by `is_pinned DESC, updated_at DESC`. |
| 9 | Query messages by thread | Returns messages ordered by `updated_at ASC`. |

### Message Reference

| # | Behavior | Acceptance Criteria |
|---|---|---|
| 10 | Primary ref derivation | `deriveMessageRef` with valid `conversationId` and `signalMessageId` returns `{ strategy: "primary", ref: "<conversationId>:<signalMessageId>" }`. |
| 11 | Fallback ref derivation | When `signalMessageId` is nil but `senderAciOrId` and `sentAtMs` are present, returns `{ strategy: "fallback", ref: "<conversationId>:<senderAciOrId>:<sentAtMs>" }`. |
| 12 | None strategy | When neither primary nor fallback inputs are sufficient, returns `{ strategy: "none", ref: nil }`. |
| 13 | Primary ref detection | `isPrimaryRef` returns `true` when the remainder after `<conversationId>:` contains no colons. |
| 14 | Empty conversationId | Returns `none` strategy. |

### Conflict Resolution

| # | Behavior | Acceptance Criteria |
|---|---|---|
| 15 | Newer `updated_at` wins | `resolveConflict(local: 1000, remote: 2000)` returns `keep_remote` regardless of version values. |
| 16 | Older `updated_at` loses | `resolveConflict(local: 3000, remote: 1000)` returns `keep_local`. |
| 17 | Tie-break by version | When `updated_at` matches, higher `version` wins. |
| 18 | Full tie: local wins | When both `updated_at` and `version` match, `keep_local` is returned. |
| 19 | Deletion always applied | A remote record with `_deleted: true` is applied without conflict checks. If local record exists, it is deleted. If no local record, no-op. |
| 20 | Merge fixture parity | All entries in `merge-conflict-cases.json` produce identical results on iOS and desktop. |

### Sync

| # | Behavior | Acceptance Criteria |
|---|---|---|
| 21 | Pull-merge-push order | Sync loop always: (1) pull remote changes, (2) merge into local DB, (3) push local dirty records. Never push before pulling. |
| 22 | Sync token persistence | After each successful sync, `last_sync_token` and `last_sync_at` are persisted in `overlay_sync_state`. |
| 23 | Delta queries | `getThreadsDirtySince(timestamp)` returns threads where `updated_at > timestamp`. Same for messages. |
| 24 | Non-blocking | Sync failures never block local overlay operations. User can always create/edit/delete overlays even when sync is down. |
| 25 | Exponential backoff | After failure: 1s, 2s, 4s, 8s, ..., capped at 5 minutes. Reset to 1s after successful sync. |
| 26 | Force-replace push | When pushing records, use `forceReplace` semantics (desktop) / `savePolicy: .allKeys` (iOS) to overwrite server records. |
| 27 | Diagnostics | `SyncDiagnostics` struct exposes `status`, `lastSyncAt`, `lastError`, `lastErrorAt`, `threadsSynced`, `messagesSynced`. |

### Feature Flags

| # | Behavior | Acceptance Criteria |
|---|---|---|
| 28 | Overlay flag default | `isOverlayThreadsEnabled()` returns `false` by default. |
| 29 | Sync flag requires overlay | `isOverlayCloudSyncEnabled()` returns `false` unless `isOverlayThreadsEnabled()` is also `true`. |
| 30 | Flag keys match | UserDefaults keys: `overlayThreadsEnabled`, `overlayCloudSyncEnabled`. Must match desktop `window.storage` keys exactly. |
| 31 | Test override | Provide `setOverlayThreadsEnabledForTesting(_:)` and `setOverlayCloudSyncEnabledForTesting(_:)` for unit tests. |

### Error Handling

| # | Behavior | Acceptance Criteria |
|---|---|---|
| 32 | Fail-open on DB error | If the overlay SQLite database is corrupt or unavailable, the base Signal experience must continue normally. Overlay features are disabled and the user is notified. |
| 33 | Invalid sync records skipped | `mergeRemoteRecords` validates each incoming record via `OverlaySchemaValidator`. Invalid records are logged and skipped, not fatal. |
| 34 | Labels parse fallback | If `labels_json` cannot be parsed as `[String]`, fall back to an empty array `[]`. Never crash on malformed labels. |
| 35 | Sync error surfacing | Sync errors are shown as non-blocking UI (banner or status in settings). No alerts, no modals. |

---

## 4. Cross-Device Test Matrix

These scenarios verify that Desktop and iOS sync correctly via CloudKit.
Execute them in the order shown. Each row is a discrete test case.

| # | Scenario | Steps | Expected Result |
|---|---|---|---|
| 1 | Desktop creates, iOS pulls | Desktop: create thread "Project Alpha" in conversation C1. Wait for sync push. iOS: trigger sync. | iOS shows thread "Project Alpha" in conversation C1 with identical `thread_ref`, `title`, `updated_at`, `version`. |
| 2 | iOS creates, Desktop pulls | iOS: create thread "Mobile Sprint" in conversation C2. Wait for sync push. Desktop: wait for 5-min poll or manual sync. | Desktop shows thread "Mobile Sprint" with identical fields. |
| 3 | Simultaneous edits, same winner | Desktop: rename thread T1 to "AAA" at time 5000, version 3. iOS: rename thread T1 to "BBB" at time 6000, version 2. Both sync. | Both platforms converge on "BBB" (higher `updated_at` wins). |
| 4 | Simultaneous edits, version tie-break | Desktop: update thread T2 at time 5000, version 5. iOS: update thread T2 at time 5000, version 3. Both sync. | Both platforms converge on Desktop's version (higher `version` wins on `updated_at` tie). |
| 5 | Full tie, local wins | Desktop: update thread T3 at time 5000, version 3. iOS: update thread T3 at time 5000, version 3. Both sync. | Each platform keeps its own local version. On next sync cycle, the versions may diverge and re-resolve. This is acceptable -- eventual convergence is guaranteed because one platform will get a newer `updated_at` on its next local write. |
| 6 | Offline edits, merge convergence | Desktop: go offline, create threads T4 and T5. iOS: go offline, create thread T6 and edit T4 (if pulled earlier). Both come online. | After both sync: T4 resolved by conflict policy, T5 present on both, T6 present on both. |
| 7 | Deletion propagates | Desktop: delete thread T1. Sync pushes deletion marker. iOS: next sync pulls the deletion. | Thread T1 is removed from iOS. Associated `MessageOverlay.thread_ref` set to `NULL` on iOS. |
| 8 | Labels replaced wholesale | Desktop: message M1 has labels `["hiring", "urgent"]`. iOS: sync pulls M1. iOS then updates M1 labels to `["hiring", "backlog"]`. Desktop pulls. | Desktop shows `["hiring", "backlog"]`. Labels are NOT merged -- the entire array was replaced. `"urgent"` is gone. |
| 9 | Message ref upgrade (fallback to primary) | Desktop: create overlay for message using fallback ref `C1:sender1:1709500000000`. Later, `signalMessageId` becomes available. Desktop creates a new overlay with primary ref `C1:msg-uuid`. | Two separate overlay records exist. The fallback-ref overlay is effectively orphaned. iOS sees both records after sync. The app should prefer the primary-ref overlay when displaying. |
| 10 | iOS pin, Desktop sees pin | iOS: pin thread T7 in conversation C3. Sync pushes `is_pinned=1`. Desktop pulls. | Desktop shows T7 as pinned. `is_pinned` is `true` at runtime, `1` in SQLite. |
| 11 | Large batch sync | Desktop: create 50 threads and 200 message overlays in one session. Trigger sync. iOS: pull. | iOS receives all records. `threadsSynced` and `messagesSynced` diagnostics reflect correct counts. |
| 12 | Sync token continuity | Desktop syncs, saves token T1. iOS syncs, saves token T2. Desktop syncs again using T1. | Desktop only receives changes since T1, not full re-fetch. Each device maintains its own sync token. |
| 13 | Note sync | Desktop: add note "Follow up Monday" to message overlay M2. Sync pushes. iOS pulls. | iOS displays "Follow up Monday" for M2. |
| 14 | Color sync | Desktop: set thread T8 color to `#3498db`. Sync pushes. iOS pulls. | iOS shows `#3498db` as the thread color for T8. |
| 15 | Null field handling | Desktop: create thread with `title=null`, `color=null`. Sync pushes. iOS pulls. | iOS correctly stores `nil` for `title` and `color`, not empty strings. |

---

## 5. SQLite Schema (GRDB)

Use GRDB migrations that produce tables identical to desktop's migration 1680.
The DDL must be character-for-character equivalent at the SQL level (column
names, types, defaults, constraints).

### 5.1 GRDB Migration

```swift
import GRDB

struct OverlayMigration {
    static func registerMigrations(_ migrator: inout DatabaseMigrator) {
        migrator.registerMigration("overlay-v1") { db in
            // thread_overlay
            try db.create(table: "thread_overlay") { t in
                t.column("thread_ref", .text).notNull().primaryKey()
                t.column("conversation_ref", .text).notNull()
                t.column("title", .text)
                t.column("color", .text)
                t.column("is_pinned", .integer).notNull().defaults(to: 0)
                t.column("updated_at", .integer).notNull()
                t.column("version", .integer).notNull().defaults(to: 1)
            }

            // message_overlay
            try db.create(table: "message_overlay") { t in
                t.column("id", .text).notNull().primaryKey()
                t.column("message_ref", .text).notNull().unique()
                t.column("conversation_ref", .text).notNull()
                t.column("thread_ref", .text)
                t.column("labels_json", .text).notNull().defaults(to: "[]")
                t.column("note", .text)
                t.column("updated_at", .integer).notNull()
                t.column("version", .integer).notNull().defaults(to: 1)
            }

            // overlay_sync_state (local only, not synced via CloudKit)
            try db.create(table: "overlay_sync_state") { t in
                t.column("device_id", .text).notNull().primaryKey()
                t.column("last_sync_token", .text)
                t.column("last_sync_at", .integer)
            }

            // Indexes
            try db.create(
                index: "idx_message_overlay_conversation_ref",
                on: "message_overlay",
                columns: ["conversation_ref"]
            )
            try db.create(
                index: "idx_message_overlay_thread_ref",
                on: "message_overlay",
                columns: ["thread_ref"]
            )
            try db.create(
                index: "idx_thread_overlay_conversation_ref",
                on: "thread_overlay",
                columns: ["conversation_ref"]
            )
            try db.create(
                index: "idx_thread_overlay_updated_at",
                on: "thread_overlay",
                columns: ["updated_at"]
            )
        }
    }
}
```

### 5.2 GRDB Record Types

```swift
import GRDB

// MARK: - ThreadOverlay

struct ThreadOverlay: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "thread_overlay"

    var threadRef: String
    var conversationRef: String
    var title: String?
    var color: String?
    var isPinned: Bool
    var updatedAt: Int
    var version: Int

    // GRDB column mapping to match desktop snake_case column names
    enum CodingKeys: String, CodingKey {
        case threadRef = "thread_ref"
        case conversationRef = "conversation_ref"
        case title
        case color
        case isPinned = "is_pinned"
        case updatedAt = "updated_at"
        case version
    }

    // Custom encoding: is_pinned must be stored as INTEGER 0|1
    func encode(to container: inout PersistenceContainer) {
        container["thread_ref"] = threadRef
        container["conversation_ref"] = conversationRef
        container["title"] = title
        container["color"] = color
        container["is_pinned"] = isPinned ? 1 : 0
        container["updated_at"] = updatedAt
        container["version"] = version
    }

    // Custom decoding: is_pinned comes back as INTEGER, coerce to Bool
    init(row: Row) throws {
        threadRef = row["thread_ref"]
        conversationRef = row["conversation_ref"]
        title = row["title"]
        color = row["color"]
        isPinned = (row["is_pinned"] as Int) != 0
        updatedAt = row["updated_at"]
        version = row["version"]
    }
}

// MARK: - MessageOverlay

struct MessageOverlay: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "message_overlay"

    var id: String
    var messageRef: String
    var conversationRef: String
    var threadRef: String?
    var labels: [String]  // Runtime type: array of strings
    var note: String?
    var updatedAt: Int
    var version: Int

    // Storage uses labels_json (TEXT), runtime uses labels ([String])
    enum CodingKeys: String, CodingKey {
        case id
        case messageRef = "message_ref"
        case conversationRef = "conversation_ref"
        case threadRef = "thread_ref"
        case labelsJson = "labels_json"
        case note
        case updatedAt = "updated_at"
        case version
    }

    func encode(to container: inout PersistenceContainer) {
        container["id"] = id
        container["message_ref"] = messageRef
        container["conversation_ref"] = conversationRef
        container["thread_ref"] = threadRef
        let labelsData = (try? JSONEncoder().encode(labels)) ?? Data("[]".utf8)
        container["labels_json"] = String(data: labelsData, encoding: .utf8)!
        container["note"] = note
        container["updated_at"] = updatedAt
        container["version"] = version
    }

    init(row: Row) throws {
        id = row["id"]
        messageRef = row["message_ref"]
        conversationRef = row["conversation_ref"]
        threadRef = row["thread_ref"]
        note = row["note"]
        updatedAt = row["updated_at"]
        version = row["version"]

        // Deserialize labels_json TEXT -> [String], fallback to []
        let labelsJson: String = row["labels_json"] ?? "[]"
        if let data = labelsJson.data(using: .utf8),
           let parsed = try? JSONDecoder().decode([String].self, from: data) {
            labels = parsed
        } else {
            labels = []
        }
    }
}

// MARK: - OverlaySyncState (local only)

struct OverlaySyncState: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "overlay_sync_state"

    var deviceId: String
    var lastSyncToken: String?
    var lastSyncAt: Int?

    enum CodingKeys: String, CodingKey {
        case deviceId = "device_id"
        case lastSyncToken = "last_sync_token"
        case lastSyncAt = "last_sync_at"
    }
}
```

### 5.3 Schema Verification Query

After migration, run this query to verify the schema matches desktop:

```sql
SELECT name, sql FROM sqlite_master
WHERE type = 'table' AND name IN ('thread_overlay', 'message_overlay', 'overlay_sync_state')
ORDER BY name;
```

The output DDL should match desktop's migration 1680 exactly (modulo GRDB's
DDL generation style).

---

## 6. Testing

### 6.1 Shared JSON Test Fixtures

Desktop ships shared JSON fixture files in `ts/test-node/overlay/fixtures/`.
These fixtures define the canonical test inputs and expected outputs that all
platforms must pass. Copy these files into the iOS test bundle.

| Fixture File | Purpose |
|---|---|
| `thread-overlay-samples.json` | Valid and invalid `ThreadOverlay` records for schema validation |
| `message-overlay-samples.json` | Valid and invalid `MessageOverlay` records for schema validation |
| `merge-conflict-cases.json` | Conflict resolution inputs + expected `ConflictResolution` results |
| `serialization-roundtrip.json` | Runtime, SQLite, and CloudKit representations for roundtrip verification |

### 6.2 Unit Tests (Swift XCTest)

Each test category below loads the shared fixtures and asserts identical
behavior to desktop.

#### MessageRefAdapter Tests

```swift
import XCTest
@testable import SignalOverlay

class MessageRefAdapterTests: XCTestCase {

    func testPrimaryRefDerivation() {
        let result = MessageRefAdapter.deriveMessageRef(
            conversationId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            signalMessageId: "f0e1d2c3-b4a5-6789-0123-456789abcdef",
            senderAciOrId: nil,
            sentAtMs: nil
        )
        XCTAssertEqual(result.strategy, .primary)
        XCTAssertEqual(
            result.ref,
            "a1b2c3d4-e5f6-7890-abcd-ef1234567890:f0e1d2c3-b4a5-6789-0123-456789abcdef"
        )
    }

    func testFallbackRefDerivation() {
        let result = MessageRefAdapter.deriveMessageRef(
            conversationId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            signalMessageId: nil,
            senderAciOrId: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
            sentAtMs: 1709500000000
        )
        XCTAssertEqual(result.strategy, .fallback)
        XCTAssertEqual(
            result.ref,
            "a1b2c3d4-e5f6-7890-abcd-ef1234567890:b2c3d4e5-f6a7-8901-bcde-f12345678901:1709500000000"
        )
    }

    func testNoneStrategy() {
        let result = MessageRefAdapter.deriveMessageRef(
            conversationId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            signalMessageId: nil,
            senderAciOrId: nil,
            sentAtMs: nil
        )
        XCTAssertEqual(result.strategy, .none)
        XCTAssertNil(result.ref)
    }

    func testEmptyConversationId() {
        let result = MessageRefAdapter.deriveMessageRef(
            conversationId: "",
            signalMessageId: "msg-id",
            senderAciOrId: nil,
            sentAtMs: nil
        )
        XCTAssertEqual(result.strategy, .none)
        XCTAssertNil(result.ref)
    }

    func testIsPrimaryRef() {
        let convId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        let primaryRef = "\(convId):f0e1d2c3-b4a5-6789-0123-456789abcdef"
        let fallbackRef = "\(convId):sender-id:1709500000000"

        XCTAssertTrue(MessageRefAdapter.isPrimaryRef(primaryRef, conversationId: convId))
        XCTAssertFalse(MessageRefAdapter.isPrimaryRef(fallbackRef, conversationId: convId))
    }
}
```

#### Schema Validator Tests (Fixture-Driven)

```swift
import XCTest
@testable import SignalOverlay

class OverlaySchemaValidatorTests: XCTestCase {

    // Load shared fixture from test bundle
    func loadFixture<T: Decodable>(_ filename: String) throws -> T {
        let bundle = Bundle(for: type(of: self))
        let url = bundle.url(forResource: filename, withExtension: nil)!
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(T.self, from: data)
    }

    func testThreadOverlayValidSamples() throws {
        let fixture: ThreadOverlaySamplesFixture = try loadFixture(
            "thread-overlay-samples.json"
        )
        for sample in fixture.valid {
            let result = OverlaySchemaValidator.validateThreadOverlay(sample.record)
            XCTAssertTrue(result.valid, "Expected '\(sample.name)' to be valid: \(result.errors)")
        }
    }

    func testThreadOverlayInvalidSamples() throws {
        let fixture: ThreadOverlaySamplesFixture = try loadFixture(
            "thread-overlay-samples.json"
        )
        for sample in fixture.invalid {
            let result = OverlaySchemaValidator.validateThreadOverlay(sample.record)
            XCTAssertFalse(result.valid, "Expected '\(sample.name)' to be invalid")
            XCTAssertFalse(result.errors.isEmpty)
        }
    }

    func testMessageOverlayValidSamples() throws {
        let fixture: MessageOverlaySamplesFixture = try loadFixture(
            "message-overlay-samples.json"
        )
        for sample in fixture.valid {
            let result = OverlaySchemaValidator.validateMessageOverlay(sample.record)
            XCTAssertTrue(result.valid, "Expected '\(sample.name)' to be valid: \(result.errors)")
        }
    }

    func testMessageOverlayInvalidSamples() throws {
        let fixture: MessageOverlaySamplesFixture = try loadFixture(
            "message-overlay-samples.json"
        )
        for sample in fixture.invalid {
            let result = OverlaySchemaValidator.validateMessageOverlay(sample.record)
            XCTAssertFalse(result.valid, "Expected '\(sample.name)' to be invalid")
        }
    }
}
```

#### Conflict Resolution Tests (Fixture-Driven)

```swift
import XCTest
@testable import SignalOverlay

class OverlaySyncMergerTests: XCTestCase {

    func testConflictResolutionFixtures() throws {
        let fixture: MergeConflictFixture = try loadFixture(
            "merge-conflict-cases.json"
        )
        for testCase in fixture.conflictResolution {
            let result = OverlaySyncMerger.resolveConflict(
                localUpdatedAt: testCase.local.updatedAt,
                localVersion: testCase.local.version,
                remoteUpdatedAt: testCase.remote.updatedAt,
                remoteVersion: testCase.remote.version
            )
            XCTAssertEqual(
                result, testCase.expected,
                "Case '\(testCase.name)': expected \(testCase.expected), got \(result)"
            )
        }
    }
}
```

#### Serialization Roundtrip Tests (Fixture-Driven)

```swift
import XCTest
@testable import SignalOverlay

class SerializationRoundtripTests: XCTestCase {

    func testThreadIsPinnedCoercion() throws {
        let fixture: SerializationRoundtripFixture = try loadFixture(
            "serialization-roundtrip.json"
        )
        for entry in fixture.threadRoundtrips {
            let runtimePinned = entry.record.isPinned
            let sqlitePinned = entry.sqliteRow.isPinned  // Int: 0 or 1
            XCTAssertEqual(
                sqlitePinned,
                runtimePinned ? 1 : 0,
                "'\(entry.name)': SQLite is_pinned should be \(runtimePinned ? 1 : 0)"
            )
        }
    }

    func testMessageLabelsCoercion() throws {
        let fixture: SerializationRoundtripFixture = try loadFixture(
            "serialization-roundtrip.json"
        )
        for entry in fixture.messageRoundtrips {
            let runtimeLabels = entry.record.labels   // [String]
            let sqliteLabelsJson = entry.sqliteRow.labelsJson  // String
            let decoded = try JSONDecoder().decode(
                [String].self,
                from: sqliteLabelsJson.data(using: .utf8)!
            )
            XCTAssertEqual(
                decoded, runtimeLabels,
                "'\(entry.name)': labels roundtrip mismatch"
            )
        }
    }
}
```

### 6.3 Integration Tests

| Test | Description | Setup |
|---|---|---|
| GRDB CRUD roundtrip | Insert, update, query, delete for both thread and message overlays using an in-memory GRDB database. | In-memory `DatabaseQueue` with `OverlayMigration` applied. |
| CloudKit adapter mock | Verify `OverlaySyncEngine` calls `fetchChanges` then `pushRecords` in correct order. | Mock `CloudKitNativeAdapter` that records method calls. |
| Sync engine lifecycle | Start, trigger sync, stop. Verify timers are created and cleaned up. | `OverlaySyncEngine` with mock adapter and in-memory DB. |
| Feature flag gating | When `isOverlayThreadsEnabled()` is `false`, all UI entry points are hidden and sync does not start. | Toggle `UserDefaults` flag. |
| Error recovery | Corrupt `labels_json` value in DB. Verify read returns `[]` and does not crash. | Direct SQL insert of `"not-valid-json"` into `labels_json`. |

### 6.4 Cross-Device Manual QA

Execute the full [Cross-Device Test Matrix](#4-cross-device-test-matrix) with:

1. One desktop instance (dev build with overlay feature flag ON)
2. One iOS device or Simulator (same iCloud account)

Verify:
- Records appear on both devices after sync
- Conflict resolution produces the same winner on both
- Deletion propagates in both directions
- Diagnostics panel shows correct sync status, timestamps, and counts
- Feature toggle OFF disables overlay UI without data loss
- App restart preserves all overlay data

---

## 7. Architecture Notes

### 7.1 Database Isolation

The overlay tables (`thread_overlay`, `message_overlay`, `overlay_sync_state`)
MUST be stored in a separate GRDB `DatabasePool` or `DatabaseQueue` from
Signal-iOS's main database. This provides:

- Fail-open behavior: if the overlay DB is corrupt, main Signal DB is unaffected
- Independent migration lifecycle
- Clear module boundary

### 7.2 Fail-Open Contract

If the overlay database fails to open, migrate, or execute queries:

1. Log the error
2. Disable all overlay UI features
3. Display a non-intrusive notification to the user
4. Continue normal Signal operation with zero degradation
5. On next app launch, attempt to re-initialize the overlay database

### 7.3 Thread Safety

- `OverlayStore` reads and writes MUST be serialized through GRDB's built-in
  writer queue
- `OverlaySyncEngine` sync loop MUST not run concurrently (use an internal
  `isSyncing` flag, identical to desktop)
- UI reads can use GRDB's reader pool for concurrent access

### 7.4 Undo Support

Desktop implements a custom `OverlayUndoManager` with a session-scoped stack
(max 20 entries). Each entry captures the inverse operation needed to undo a
change.

iOS options:
1. Wrap Foundation's `UndoManager` to match desktop behavior
2. Port the custom stack directly

Either approach is acceptable. The key constraint is that undo is session-scoped
(cleared on app restart) and capped at 20 entries.

### 7.5 Event Bus

Desktop uses a lightweight custom pub/sub (`OverlayEventBus`) with these event
types:

- `ThreadsChanged`
- `MessagesChanged`
- `LabelsChanged`
- `SyncStarted`
- `SyncCompleted`
- `SyncFailed`

iOS should use Combine publishers or NotificationCenter to emit equivalent
events. UI components observe these to refresh when overlay data changes.

---

## 8. Feature Flags

### 8.1 Flag Definitions

| Flag Key | Default | Depends On | Purpose |
|---|---|---|---|
| `overlayThreadsEnabled` | `false` | -- | Master toggle for the entire overlay feature |
| `overlayCloudSyncEnabled` | `false` | `overlayThreadsEnabled` | Enables CloudKit sync |
| `overlayIosSyncReady` | `false` | `overlayCloudSyncEnabled` | Desktop signals its contract is stable for iOS sync |

### 8.2 iOS Implementation

```swift
import Foundation

enum OverlayFeatureFlag {
    private static let overlayThreadsKey = "overlayThreadsEnabled"
    private static let overlayCloudSyncKey = "overlayCloudSyncEnabled"

    // Test overrides
    private static var _threadsOverride: Bool?
    private static var _syncOverride: Bool?

    static func isOverlayThreadsEnabled() -> Bool {
        if let override = _threadsOverride { return override }
        return UserDefaults.standard.bool(forKey: overlayThreadsKey)
    }

    static func setOverlayThreadsEnabled(_ enabled: Bool) {
        UserDefaults.standard.set(enabled, forKey: overlayThreadsKey)
    }

    static func isOverlayCloudSyncEnabled() -> Bool {
        guard isOverlayThreadsEnabled() else { return false }
        if let override = _syncOverride { return override }
        return UserDefaults.standard.bool(forKey: overlayCloudSyncKey)
    }

    static func setOverlayCloudSyncEnabled(_ enabled: Bool) {
        UserDefaults.standard.set(enabled, forKey: overlayCloudSyncKey)
    }

    // Test helpers
    static func setOverlayThreadsEnabledForTesting(_ value: Bool?) {
        _threadsOverride = value
    }

    static func setOverlayCloudSyncEnabledForTesting(_ value: Bool?) {
        _syncOverride = value
    }
}
```

### 8.3 Gate All Entry Points

Every overlay UI component and sync operation MUST check the feature flag before
executing:

```swift
guard OverlayFeatureFlag.isOverlayThreadsEnabled() else { return }
```

For sync:
```swift
guard OverlayFeatureFlag.isOverlayCloudSyncEnabled() else { return }
```

---

## Appendix: Desktop File Reference

Complete list of desktop source files relevant to the iOS implementation. Read
these for detailed behavioral reference.

| Category | File | Purpose |
|---|---|---|
| **Types** | `ts/overlay/models/OverlayTypes.std.ts` | Domain types, row types, input types |
| **Types** | `ts/overlay/sync/OverlaySyncTypes.std.ts` | Sync record types, status enum, diagnostics, config |
| **MessageRef** | `ts/overlay/services/MessageRefAdapter.std.ts` | Reference derivation (pure functions) |
| **Store** | `ts/overlay/store/OverlayStore.node.ts` | SQLite CRUD operations |
| **Store** | `ts/overlay/sync/OverlaySyncStoreExtensions.node.ts` | Delta queries, sync state persistence |
| **Validator** | `ts/overlay/contract/OverlaySchemaValidator.std.ts` | Cross-platform validation, sanitization |
| **Flags** | `ts/overlay/OverlayFeatureFlag.std.ts` | Feature flag logic |
| **Sync** | `ts/overlay/sync/CloudKitAdapter.std.ts` | Adapter interface (4 methods) |
| **Sync** | `ts/overlay/sync/CloudKitHttpClient.node.ts` | HTTP implementation (REST API) |
| **Sync** | `ts/overlay/sync/OverlaySyncEngine.node.ts` | Sync orchestrator (pull/merge/push) |
| **Sync** | `ts/overlay/sync/OverlaySyncMerger.node.ts` | Conflict resolution + merge logic |
| **Migration** | `ts/sql/migrations/1680-overlay-tables.std.ts` | DDL for all overlay tables |
| **Fixtures** | `ts/test-node/overlay/fixtures/thread-overlay-samples.json` | Validation test data |
| **Fixtures** | `ts/test-node/overlay/fixtures/message-overlay-samples.json` | Validation test data |
| **Fixtures** | `ts/test-node/overlay/fixtures/merge-conflict-cases.json` | Conflict resolution test data |
| **Fixtures** | `ts/test-node/overlay/fixtures/serialization-roundtrip.json` | Coercion/roundtrip test data |
| **Contract** | `docs/overlay-contract/overlay-shared-contract.md` | Cross-platform contract document |
