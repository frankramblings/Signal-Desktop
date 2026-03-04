# M4 — iOS Parity Prep Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepare overlay system for cross-platform desktop↔iOS parity with shared contracts, validators, test fixtures, and iOS implementation guide — no production iOS code.

**Architecture:** Contract-First approach. Extract canonical schemas, conflict policy, and serialization rules into documentation + runtime validators + JSON test fixtures that both TypeScript and future Swift code consume. Add validation gate in sync merger. Add iOS sync readiness feature flag.

**Tech Stack:** TypeScript (.std.ts for cross-platform), JSON fixtures, Mocha/Chai tests, Markdown docs.

---

### Task 1: Create shared overlay contract document

**Files:**
- Create: `docs/overlay-contract/overlay-shared-contract.md`

**Step 1: Write the contract document**

```markdown
# Overlay Shared Contract — Cross-Platform Reference

Version: 1.0.0
Last updated: 2026-03-03

This document is the canonical specification for any platform implementing Signal Desktop overlay sync. Both desktop (TypeScript/Electron) and iOS (Swift/CloudKit native) must conform to these definitions.

## 1. Message Reference Format

### Primary Strategy (preferred)
```
<conversationId>:<signalMessageId>
```
- `conversationId`: Signal conversation UUID (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)
- `signalMessageId`: Signal message UUID
- Separator: single colon `:`
- Both segments are UUIDs containing hyphens, never colons

### Fallback Strategy
```
<conversationId>:<senderAciOrId>:<sentAtMs>
```
- `senderAciOrId`: ACI UUID or legacy ID string
- `sentAtMs`: integer millisecond timestamp as string
- Used when `signalMessageId` is unavailable (e.g., during render before ID assignment)

### Detection Rule
To distinguish primary from fallback: after removing the `<conversationId>:` prefix, check for additional colons. Primary refs have none (UUIDs use hyphens). Fallback refs contain at least one additional colon.

### Implementation Rule
All platforms MUST use a single adapter module for reference derivation. Never construct keys inline. Desktop: `MessageRefAdapter.std.ts`. iOS: must implement equivalent `MessageRefAdapter.swift`.

## 2. Schema Definitions

### ThreadOverlay

| Field | Type | SQLite | CloudKit | Nullable | Default | Notes |
|-------|------|--------|----------|----------|---------|-------|
| thread_ref | string | TEXT PK | recordName | No | — | Primary key |
| conversation_ref | string | TEXT | String | No | — | FK-like ref |
| title | string? | TEXT | String? | Yes | null | User-assigned name |
| color | string? | TEXT | String? | Yes | null | Hex color or named |
| is_pinned | boolean | INTEGER (0\|1) | Int64 (0\|1) | No | false / 0 | Pin state |
| updated_at | number | INTEGER | Int64 | No | — | ms since epoch |
| version | number | INTEGER | Int64 | No | 1 | Monotonic counter |

### MessageOverlay

| Field | Type | SQLite | CloudKit | Nullable | Default | Notes |
|-------|------|--------|----------|----------|---------|-------|
| id | string | TEXT PK | recordName | No | — | UUID |
| message_ref | string | TEXT UNIQUE | String | No | — | Derived ref |
| conversation_ref | string | TEXT | String | No | — | FK-like ref |
| thread_ref | string? | TEXT | String? | Yes | null | Thread association |
| labels | string[] | TEXT (JSON) | String (JSON) | No | [] | JSON array of strings |
| note | string? | TEXT | String? | Yes | null | User note |
| updated_at | number | INTEGER | Int64 | No | — | ms since epoch |
| version | number | INTEGER | Int64 | No | 1 | Monotonic counter |

### OverlaySyncState

| Field | Type | SQLite | CloudKit | Notes |
|-------|------|--------|----------|-------|
| device_id | string | TEXT PK | — | Per-device |
| last_sync_token | string? | TEXT | — | CloudKit change token |
| last_sync_at | number? | INTEGER | — | ms since epoch |

## 3. Conflict Resolution Policy

### Rules (applied in order)

1. **Newer `updated_at` wins.** If `remote.updated_at > local.updated_at` → keep remote.
2. **Tie-break by `version`.** If timestamps equal and `remote.version > local.version` → keep remote.
3. **Full tie → local wins.** If both `updated_at` and `version` are equal → keep local.

### Decision Table

| Condition | Result |
|-----------|--------|
| `remote.updated_at > local.updated_at` | keep_remote |
| `remote.updated_at < local.updated_at` | keep_local |
| `updated_at` equal, `remote.version > local.version` | keep_remote |
| `updated_at` equal, `remote.version <= local.version` | keep_local |

### Deletion Handling
- A sync record with `_deleted: true` causes local deletion if the record exists locally.
- If the record doesn't exist locally, the delete is a no-op.
- Deletions don't go through conflict resolution — they always apply.

### Implementation Rule
All platforms MUST implement the same `resolveConflict(localUpdatedAt, localVersion, remoteUpdatedAt, remoteVersion)` function with identical behavior. Test against the shared fixture file `merge-conflict-cases.json`.

## 4. Serialization Format

### CloudKit Records
- Zone: `OverlayZone` in private database
- Record types: `ThreadOverlay`, `MessageOverlay`
- Fields map 1:1 to schema above
- `labels` stored as JSON string in both SQLite and CloudKit (not a native list)
- `is_pinned` stored as integer (0 or 1) in both SQLite and CloudKit

### Type Coercion Rules
| Platform → Storage | `is_pinned` | `labels` |
|--------------------|-------------|----------|
| Runtime → SQLite | boolean → INTEGER 0\|1 | string[] → JSON string |
| Runtime → CloudKit | boolean → Int64 0\|1 | string[] → JSON string |
| SQLite → Runtime | INTEGER 0\|1 → boolean | JSON string → string[] |
| CloudKit → Runtime | Int64 0\|1 → boolean | JSON string → string[] |

### Sync Record Envelope
```json
{
  "_type": "thread_overlay" | "message_overlay",
  "_deleted": false,
  ...fields
}
```

## 5. Versioning and Migration Strategy

### Schema Versioning
- Desktop migration number: `1680` (overlay tables)
- Future schema changes: increment migration number, additive only

### Forward/Backward Compatibility Rules
1. **Add fields with defaults.** New fields must have a default value so older clients can still read records.
2. **Never remove fields.** Deprecate by stopping writes; continue reading.
3. **Never change field types.** Add a new field instead.
4. **Unknown fields: preserve, don't drop.** When reading a record with unknown fields, store them opaquely and re-emit on push.
5. **Version bump required** for any schema change. Document in this contract.

### Migration Coordination
When adding a field:
1. Update this contract document with the new field + default
2. Update validators on all platforms
3. Deploy new desktop version (reads + writes new field)
4. Deploy new iOS version (reads + writes new field)
5. Old clients gracefully ignore the new field
```

**Step 2: Verify the file was written**

Run: `wc -l docs/overlay-contract/overlay-shared-contract.md`
Expected: ~130 lines

**Step 3: Commit**

```bash
git add docs/overlay-contract/overlay-shared-contract.md
git commit -m "docs(overlay/m4): add shared cross-platform overlay contract"
```

---

### Task 2: Create JSON test fixtures — thread and message samples

**Files:**
- Create: `ts/test-node/overlay/fixtures/thread-overlay-samples.json`
- Create: `ts/test-node/overlay/fixtures/message-overlay-samples.json`

**Step 1: Write thread fixture file**

```json
{
  "_comment": "Cross-platform test fixtures for ThreadOverlay. Used by TS (Mocha) and Swift (XCTest).",
  "valid": [
    {
      "thread_ref": "conv-abc123:thread-001",
      "conversation_ref": "conv-abc123",
      "title": "Hiring Pipeline",
      "color": "#3498db",
      "is_pinned": true,
      "updated_at": 1709500000000,
      "version": 3
    },
    {
      "thread_ref": "conv-abc123:thread-002",
      "conversation_ref": "conv-abc123",
      "title": null,
      "color": null,
      "is_pinned": false,
      "updated_at": 1709500001000,
      "version": 1
    },
    {
      "thread_ref": "conv-def456:thread-003",
      "conversation_ref": "conv-def456",
      "title": "Content Planning \ud83d\udcdd",
      "color": "#e74c3c",
      "is_pinned": false,
      "updated_at": 1709500002000,
      "version": 5
    },
    {
      "thread_ref": "conv-ghi789:thread-004",
      "conversation_ref": "conv-ghi789",
      "title": "A",
      "color": "#000000",
      "is_pinned": true,
      "updated_at": 1,
      "version": 1
    }
  ],
  "invalid": [
    {
      "_reason": "missing thread_ref",
      "conversation_ref": "conv-abc123",
      "title": "Bad",
      "color": null,
      "is_pinned": false,
      "updated_at": 1000,
      "version": 1
    },
    {
      "_reason": "missing conversation_ref",
      "thread_ref": "conv-abc123:thread-x",
      "title": "Bad",
      "color": null,
      "is_pinned": false,
      "updated_at": 1000,
      "version": 1
    },
    {
      "_reason": "is_pinned wrong type (string)",
      "thread_ref": "conv-abc123:thread-y",
      "conversation_ref": "conv-abc123",
      "title": "Bad",
      "color": null,
      "is_pinned": "yes",
      "updated_at": 1000,
      "version": 1
    },
    {
      "_reason": "updated_at is negative",
      "thread_ref": "conv-abc123:thread-z",
      "conversation_ref": "conv-abc123",
      "title": "Bad",
      "color": null,
      "is_pinned": false,
      "updated_at": -1,
      "version": 1
    },
    {
      "_reason": "version is zero",
      "thread_ref": "conv-abc123:thread-w",
      "conversation_ref": "conv-abc123",
      "title": "Bad",
      "color": null,
      "is_pinned": false,
      "updated_at": 1000,
      "version": 0
    },
    {
      "_reason": "version is not an integer",
      "thread_ref": "conv-abc123:thread-v",
      "conversation_ref": "conv-abc123",
      "title": "Bad",
      "color": null,
      "is_pinned": false,
      "updated_at": 1000,
      "version": 1.5
    }
  ]
}
```

**Step 2: Write message fixture file**

```json
{
  "_comment": "Cross-platform test fixtures for MessageOverlay. Used by TS (Mocha) and Swift (XCTest).",
  "valid": [
    {
      "id": "a1b2c3d4-0001-4000-8000-000000000001",
      "message_ref": "conv-abc123:msg-001",
      "conversation_ref": "conv-abc123",
      "thread_ref": "conv-abc123:thread-001",
      "labels": ["hiring", "urgent"],
      "note": "Follow up with candidate",
      "updated_at": 1709500000000,
      "version": 2
    },
    {
      "id": "a1b2c3d4-0001-4000-8000-000000000002",
      "message_ref": "conv-abc123:msg-002",
      "conversation_ref": "conv-abc123",
      "thread_ref": null,
      "labels": [],
      "note": null,
      "updated_at": 1709500001000,
      "version": 1
    },
    {
      "id": "a1b2c3d4-0001-4000-8000-000000000003",
      "message_ref": "conv-def456:sender-aci-123:1709500002000",
      "conversation_ref": "conv-def456",
      "thread_ref": "conv-def456:thread-003",
      "labels": ["socialfusion", "wistiaproject", "\u00e9t\u00e9"],
      "note": "Unicode note: \u00e4\u00f6\u00fc\u00df \ud83c\udf1f",
      "updated_at": 1709500002000,
      "version": 1
    },
    {
      "id": "a1b2c3d4-0001-4000-8000-000000000004",
      "message_ref": "conv-ghi789:msg-004",
      "conversation_ref": "conv-ghi789",
      "thread_ref": null,
      "labels": ["a"],
      "note": "",
      "updated_at": 1,
      "version": 1
    }
  ],
  "invalid": [
    {
      "_reason": "missing id",
      "message_ref": "conv-abc123:msg-x",
      "conversation_ref": "conv-abc123",
      "thread_ref": null,
      "labels": [],
      "note": null,
      "updated_at": 1000,
      "version": 1
    },
    {
      "_reason": "missing message_ref",
      "id": "a1b2c3d4-0001-4000-8000-bad000000001",
      "conversation_ref": "conv-abc123",
      "thread_ref": null,
      "labels": [],
      "note": null,
      "updated_at": 1000,
      "version": 1
    },
    {
      "_reason": "labels is string instead of array",
      "id": "a1b2c3d4-0001-4000-8000-bad000000002",
      "message_ref": "conv-abc123:msg-bad2",
      "conversation_ref": "conv-abc123",
      "thread_ref": null,
      "labels": "hiring",
      "note": null,
      "updated_at": 1000,
      "version": 1
    },
    {
      "_reason": "labels contains non-string element",
      "id": "a1b2c3d4-0001-4000-8000-bad000000003",
      "message_ref": "conv-abc123:msg-bad3",
      "conversation_ref": "conv-abc123",
      "thread_ref": null,
      "labels": ["ok", 42],
      "note": null,
      "updated_at": 1000,
      "version": 1
    },
    {
      "_reason": "updated_at is string",
      "id": "a1b2c3d4-0001-4000-8000-bad000000004",
      "message_ref": "conv-abc123:msg-bad4",
      "conversation_ref": "conv-abc123",
      "thread_ref": null,
      "labels": [],
      "note": null,
      "updated_at": "2024-01-01",
      "version": 1
    }
  ]
}
```

**Step 3: Commit**

```bash
git add ts/test-node/overlay/fixtures/thread-overlay-samples.json ts/test-node/overlay/fixtures/message-overlay-samples.json
git commit -m "test(overlay/m4): add cross-platform thread and message fixture data"
```

---

### Task 3: Create JSON test fixtures — merge conflict cases

**Files:**
- Create: `ts/test-node/overlay/fixtures/merge-conflict-cases.json`

**Step 1: Write merge conflict fixture file**

```json
{
  "_comment": "Cross-platform conflict resolution test cases. Both TS and Swift must produce identical results.",
  "conflict_resolution": [
    {
      "name": "remote_newer_timestamp",
      "local": { "updated_at": 1000, "version": 1 },
      "remote": { "updated_at": 2000, "version": 1 },
      "expected": "keep_remote"
    },
    {
      "name": "local_newer_timestamp",
      "local": { "updated_at": 3000, "version": 1 },
      "remote": { "updated_at": 1000, "version": 1 },
      "expected": "keep_local"
    },
    {
      "name": "same_timestamp_remote_higher_version",
      "local": { "updated_at": 5000, "version": 2 },
      "remote": { "updated_at": 5000, "version": 5 },
      "expected": "keep_remote"
    },
    {
      "name": "same_timestamp_local_higher_version",
      "local": { "updated_at": 5000, "version": 5 },
      "remote": { "updated_at": 5000, "version": 2 },
      "expected": "keep_local"
    },
    {
      "name": "full_tie_local_wins",
      "local": { "updated_at": 5000, "version": 3 },
      "remote": { "updated_at": 5000, "version": 3 },
      "expected": "keep_local"
    },
    {
      "name": "both_version_1_remote_newer",
      "local": { "updated_at": 100, "version": 1 },
      "remote": { "updated_at": 200, "version": 1 },
      "expected": "keep_remote"
    },
    {
      "name": "high_version_numbers",
      "local": { "updated_at": 1709500000000, "version": 999 },
      "remote": { "updated_at": 1709500000000, "version": 1000 },
      "expected": "keep_remote"
    },
    {
      "name": "timestamp_1ms_difference_remote_wins",
      "local": { "updated_at": 1709500000000, "version": 10 },
      "remote": { "updated_at": 1709500000001, "version": 1 },
      "expected": "keep_remote"
    },
    {
      "name": "timestamp_1ms_difference_local_wins",
      "local": { "updated_at": 1709500000001, "version": 1 },
      "remote": { "updated_at": 1709500000000, "version": 10 },
      "expected": "keep_local"
    }
  ],
  "merge_scenarios": [
    {
      "name": "remote_insert_no_local",
      "local_record": null,
      "remote_record": {
        "_type": "thread_overlay",
        "thread_ref": "conv-1:thread-new",
        "conversation_ref": "conv-1",
        "title": "New Remote Thread",
        "color": null,
        "is_pinned": false,
        "updated_at": 5000,
        "version": 1
      },
      "expected_action": "insert",
      "expected_local_after": {
        "thread_ref": "conv-1:thread-new",
        "title": "New Remote Thread",
        "updated_at": 5000,
        "version": 1
      }
    },
    {
      "name": "remote_update_wins",
      "local_record": {
        "_type": "thread_overlay",
        "thread_ref": "conv-1:thread-shared",
        "conversation_ref": "conv-1",
        "title": "Old Local",
        "color": null,
        "is_pinned": false,
        "updated_at": 1000,
        "version": 1
      },
      "remote_record": {
        "_type": "thread_overlay",
        "thread_ref": "conv-1:thread-shared",
        "conversation_ref": "conv-1",
        "title": "Updated Remote",
        "color": "#ff0000",
        "is_pinned": true,
        "updated_at": 3000,
        "version": 2
      },
      "expected_action": "update",
      "expected_local_after": {
        "thread_ref": "conv-1:thread-shared",
        "title": "Updated Remote",
        "color": "#ff0000",
        "is_pinned": true,
        "updated_at": 3000,
        "version": 2
      }
    },
    {
      "name": "local_update_wins",
      "local_record": {
        "_type": "thread_overlay",
        "thread_ref": "conv-1:thread-local-wins",
        "conversation_ref": "conv-1",
        "title": "Newer Local",
        "color": "#00ff00",
        "is_pinned": true,
        "updated_at": 5000,
        "version": 3
      },
      "remote_record": {
        "_type": "thread_overlay",
        "thread_ref": "conv-1:thread-local-wins",
        "conversation_ref": "conv-1",
        "title": "Older Remote",
        "color": null,
        "is_pinned": false,
        "updated_at": 2000,
        "version": 1
      },
      "expected_action": "no_change",
      "expected_local_after": {
        "thread_ref": "conv-1:thread-local-wins",
        "title": "Newer Local",
        "updated_at": 5000,
        "version": 3
      }
    },
    {
      "name": "remote_deletes_existing_local",
      "local_record": {
        "_type": "thread_overlay",
        "thread_ref": "conv-1:thread-to-delete",
        "conversation_ref": "conv-1",
        "title": "Will Be Deleted",
        "color": null,
        "is_pinned": false,
        "updated_at": 1000,
        "version": 1
      },
      "remote_record": {
        "_type": "thread_overlay",
        "_deleted": true,
        "thread_ref": "conv-1:thread-to-delete",
        "conversation_ref": "",
        "title": null,
        "color": null,
        "is_pinned": false,
        "updated_at": 0,
        "version": 0
      },
      "expected_action": "delete"
    },
    {
      "name": "remote_deletes_nonexistent_local",
      "local_record": null,
      "remote_record": {
        "_type": "thread_overlay",
        "_deleted": true,
        "thread_ref": "conv-1:thread-ghost",
        "conversation_ref": "",
        "title": null,
        "color": null,
        "is_pinned": false,
        "updated_at": 0,
        "version": 0
      },
      "expected_action": "no_change"
    },
    {
      "name": "offline_edits_same_thread_remote_wins",
      "local_record": {
        "_type": "thread_overlay",
        "thread_ref": "conv-1:offline-thread",
        "conversation_ref": "conv-1",
        "title": "Desktop Offline Edit",
        "color": "#aaa",
        "is_pinned": false,
        "updated_at": 3000,
        "version": 2
      },
      "remote_record": {
        "_type": "thread_overlay",
        "thread_ref": "conv-1:offline-thread",
        "conversation_ref": "conv-1",
        "title": "iOS Offline Edit",
        "color": "#bbb",
        "is_pinned": true,
        "updated_at": 4000,
        "version": 2
      },
      "expected_action": "update",
      "expected_local_after": {
        "thread_ref": "conv-1:offline-thread",
        "title": "iOS Offline Edit",
        "color": "#bbb",
        "is_pinned": true,
        "updated_at": 4000,
        "version": 2
      }
    },
    {
      "name": "message_overlay_remote_insert",
      "local_record": null,
      "remote_record": {
        "_type": "message_overlay",
        "id": "fixture-msg-001",
        "message_ref": "conv-1:msg-remote",
        "conversation_ref": "conv-1",
        "thread_ref": "conv-1:thread-1",
        "labels": ["urgent"],
        "note": "Follow up",
        "updated_at": 5000,
        "version": 1
      },
      "expected_action": "insert",
      "expected_local_after": {
        "id": "fixture-msg-001",
        "message_ref": "conv-1:msg-remote",
        "labels": ["urgent"],
        "note": "Follow up",
        "updated_at": 5000,
        "version": 1
      }
    },
    {
      "name": "message_overlay_label_conflict",
      "local_record": {
        "_type": "message_overlay",
        "id": "fixture-msg-002",
        "message_ref": "conv-1:msg-labels",
        "conversation_ref": "conv-1",
        "thread_ref": null,
        "labels": ["desktop-label"],
        "note": null,
        "updated_at": 3000,
        "version": 2
      },
      "remote_record": {
        "_type": "message_overlay",
        "id": "fixture-msg-002",
        "message_ref": "conv-1:msg-labels",
        "conversation_ref": "conv-1",
        "thread_ref": null,
        "labels": ["ios-label", "shared"],
        "note": "ios note",
        "updated_at": 4000,
        "version": 1
      },
      "expected_action": "update",
      "expected_local_after": {
        "labels": ["ios-label", "shared"],
        "note": "ios note",
        "updated_at": 4000,
        "version": 1
      }
    }
  ]
}
```

**Step 2: Commit**

```bash
git add ts/test-node/overlay/fixtures/merge-conflict-cases.json
git commit -m "test(overlay/m4): add cross-platform merge conflict test fixtures"
```

---

### Task 4: Create JSON test fixtures — serialization roundtrip cases

**Files:**
- Create: `ts/test-node/overlay/fixtures/serialization-roundtrip.json`

**Step 1: Write serialization roundtrip fixture**

```json
{
  "_comment": "Records that must survive SQLite <-> CloudKit roundtrip without data loss. Both platforms validate these.",
  "thread_roundtrips": [
    {
      "name": "basic_thread",
      "record": {
        "thread_ref": "conv-rt1:thread-rt1",
        "conversation_ref": "conv-rt1",
        "title": "Roundtrip Thread",
        "color": "#abcdef",
        "is_pinned": true,
        "updated_at": 1709500000000,
        "version": 7
      },
      "sqlite_row": {
        "thread_ref": "conv-rt1:thread-rt1",
        "conversation_ref": "conv-rt1",
        "title": "Roundtrip Thread",
        "color": "#abcdef",
        "is_pinned": 1,
        "updated_at": 1709500000000,
        "version": 7
      },
      "cloudkit_fields": {
        "thread_ref": "conv-rt1:thread-rt1",
        "conversation_ref": "conv-rt1",
        "title": "Roundtrip Thread",
        "color": "#abcdef",
        "is_pinned": 1,
        "updated_at": 1709500000000,
        "version": 7
      }
    },
    {
      "name": "null_fields_thread",
      "record": {
        "thread_ref": "conv-rt2:thread-rt2",
        "conversation_ref": "conv-rt2",
        "title": null,
        "color": null,
        "is_pinned": false,
        "updated_at": 1,
        "version": 1
      },
      "sqlite_row": {
        "thread_ref": "conv-rt2:thread-rt2",
        "conversation_ref": "conv-rt2",
        "title": null,
        "color": null,
        "is_pinned": 0,
        "updated_at": 1,
        "version": 1
      },
      "cloudkit_fields": {
        "thread_ref": "conv-rt2:thread-rt2",
        "conversation_ref": "conv-rt2",
        "title": null,
        "color": null,
        "is_pinned": 0,
        "updated_at": 1,
        "version": 1
      }
    },
    {
      "name": "unicode_emoji_thread",
      "record": {
        "thread_ref": "conv-rt3:thread-rt3",
        "conversation_ref": "conv-rt3",
        "title": "Planning \ud83d\udcdd \u2014 \u00e9t\u00e9 2026",
        "color": "#ff00ff",
        "is_pinned": false,
        "updated_at": 1709500003000,
        "version": 2
      },
      "sqlite_row": {
        "thread_ref": "conv-rt3:thread-rt3",
        "conversation_ref": "conv-rt3",
        "title": "Planning \ud83d\udcdd \u2014 \u00e9t\u00e9 2026",
        "color": "#ff00ff",
        "is_pinned": 0,
        "updated_at": 1709500003000,
        "version": 2
      },
      "cloudkit_fields": {
        "thread_ref": "conv-rt3:thread-rt3",
        "conversation_ref": "conv-rt3",
        "title": "Planning \ud83d\udcdd \u2014 \u00e9t\u00e9 2026",
        "color": "#ff00ff",
        "is_pinned": 0,
        "updated_at": 1709500003000,
        "version": 2
      }
    }
  ],
  "message_roundtrips": [
    {
      "name": "basic_message",
      "record": {
        "id": "rt-msg-001",
        "message_ref": "conv-rt1:msg-rt1",
        "conversation_ref": "conv-rt1",
        "thread_ref": "conv-rt1:thread-rt1",
        "labels": ["hiring", "urgent"],
        "note": "Call back tomorrow",
        "updated_at": 1709500000000,
        "version": 3
      },
      "sqlite_row": {
        "id": "rt-msg-001",
        "message_ref": "conv-rt1:msg-rt1",
        "conversation_ref": "conv-rt1",
        "thread_ref": "conv-rt1:thread-rt1",
        "labels_json": "[\"hiring\",\"urgent\"]",
        "note": "Call back tomorrow",
        "updated_at": 1709500000000,
        "version": 3
      },
      "cloudkit_fields": {
        "id": "rt-msg-001",
        "message_ref": "conv-rt1:msg-rt1",
        "conversation_ref": "conv-rt1",
        "thread_ref": "conv-rt1:thread-rt1",
        "labels": "[\"hiring\",\"urgent\"]",
        "note": "Call back tomorrow",
        "updated_at": 1709500000000,
        "version": 3
      }
    },
    {
      "name": "empty_labels_null_note",
      "record": {
        "id": "rt-msg-002",
        "message_ref": "conv-rt2:msg-rt2",
        "conversation_ref": "conv-rt2",
        "thread_ref": null,
        "labels": [],
        "note": null,
        "updated_at": 1,
        "version": 1
      },
      "sqlite_row": {
        "id": "rt-msg-002",
        "message_ref": "conv-rt2:msg-rt2",
        "conversation_ref": "conv-rt2",
        "thread_ref": null,
        "labels_json": "[]",
        "note": null,
        "updated_at": 1,
        "version": 1
      },
      "cloudkit_fields": {
        "id": "rt-msg-002",
        "message_ref": "conv-rt2:msg-rt2",
        "conversation_ref": "conv-rt2",
        "thread_ref": null,
        "labels": "[]",
        "note": null,
        "updated_at": 1,
        "version": 1
      }
    },
    {
      "name": "unicode_labels_and_note",
      "record": {
        "id": "rt-msg-003",
        "message_ref": "conv-rt3:msg-rt3",
        "conversation_ref": "conv-rt3",
        "thread_ref": "conv-rt3:thread-rt3",
        "labels": ["\u00e9t\u00e9", "\ud83c\udf1f", "caf\u00e9"],
        "note": "\u00c4\u00d6\u00dc\u00df \ud83c\udf0d",
        "updated_at": 1709500003000,
        "version": 1
      },
      "sqlite_row": {
        "id": "rt-msg-003",
        "message_ref": "conv-rt3:msg-rt3",
        "conversation_ref": "conv-rt3",
        "thread_ref": "conv-rt3:thread-rt3",
        "labels_json": "[\"\u00e9t\u00e9\",\"\ud83c\udf1f\",\"caf\u00e9\"]",
        "note": "\u00c4\u00d6\u00dc\u00df \ud83c\udf0d",
        "updated_at": 1709500003000,
        "version": 1
      },
      "cloudkit_fields": {
        "id": "rt-msg-003",
        "message_ref": "conv-rt3:msg-rt3",
        "conversation_ref": "conv-rt3",
        "thread_ref": "conv-rt3:thread-rt3",
        "labels": "[\"\u00e9t\u00e9\",\"\ud83c\udf1f\",\"caf\u00e9\"]",
        "note": "\u00c4\u00d6\u00dc\u00df \ud83c\udf0d",
        "updated_at": 1709500003000,
        "version": 1
      }
    }
  ]
}
```

**Step 2: Commit**

```bash
git add ts/test-node/overlay/fixtures/serialization-roundtrip.json
git commit -m "test(overlay/m4): add serialization roundtrip test fixtures"
```

---

### Task 5: Create OverlaySchemaValidator

**Files:**
- Create: `ts/overlay/contract/OverlaySchemaValidator.std.ts`

**Step 1: Write the failing test**

Create file `ts/test-node/overlay/OverlayContract_test.std.ts`:

```typescript
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  validateThreadOverlay,
  validateMessageOverlay,
  validateSyncRecord,
  sanitizeForSync,
} from '../../overlay/contract/OverlaySchemaValidator.std.js';
import { resolveConflict } from '../../overlay/sync/OverlaySyncMerger.node.js';
import type { ConflictResolution } from '../../overlay/sync/OverlaySyncTypes.std.js';

function loadFixture(name: string): unknown {
  const raw = readFileSync(
    join(__dirname, 'fixtures', name),
    'utf-8'
  );
  return JSON.parse(raw);
}

describe('overlay/contract/OverlaySchemaValidator', () => {
  // ─── Thread validation ───────────────────────────────────────────────

  describe('validateThreadOverlay', () => {
    it('accepts all valid thread fixtures', () => {
      const fixture = loadFixture('thread-overlay-samples.json') as {
        valid: Array<Record<string, unknown>>;
      };
      for (const record of fixture.valid) {
        const result = validateThreadOverlay(record);
        assert.isTrue(
          result.valid,
          `Expected valid but got errors for ${JSON.stringify(record)}: ${result.errors.join(', ')}`
        );
      }
    });

    it('rejects all invalid thread fixtures', () => {
      const fixture = loadFixture('thread-overlay-samples.json') as {
        invalid: Array<Record<string, unknown>>;
      };
      for (const record of fixture.invalid) {
        const result = validateThreadOverlay(record);
        assert.isFalse(
          result.valid,
          `Expected invalid but passed for ${(record as { _reason?: string })._reason}`
        );
        assert.isAbove(result.errors.length, 0);
      }
    });
  });

  // ─── Message validation ──────────────────────────────────────────────

  describe('validateMessageOverlay', () => {
    it('accepts all valid message fixtures', () => {
      const fixture = loadFixture('message-overlay-samples.json') as {
        valid: Array<Record<string, unknown>>;
      };
      for (const record of fixture.valid) {
        const result = validateMessageOverlay(record);
        assert.isTrue(
          result.valid,
          `Expected valid but got errors for ${JSON.stringify(record)}: ${result.errors.join(', ')}`
        );
      }
    });

    it('rejects all invalid message fixtures', () => {
      const fixture = loadFixture('message-overlay-samples.json') as {
        invalid: Array<Record<string, unknown>>;
      };
      for (const record of fixture.invalid) {
        const result = validateMessageOverlay(record);
        assert.isFalse(
          result.valid,
          `Expected invalid but passed for ${(record as { _reason?: string })._reason}`
        );
        assert.isAbove(result.errors.length, 0);
      }
    });
  });

  // ─── Sync record validation ──────────────────────────────────────────

  describe('validateSyncRecord', () => {
    it('accepts a valid thread sync record', () => {
      const record = {
        _type: 'thread_overlay',
        thread_ref: 'conv-1:t1',
        conversation_ref: 'conv-1',
        title: 'Test',
        color: null,
        is_pinned: false,
        updated_at: 1000,
        version: 1,
      };
      const result = validateSyncRecord(record);
      assert.isTrue(result.valid, result.errors.join(', '));
    });

    it('accepts a valid message sync record', () => {
      const record = {
        _type: 'message_overlay',
        id: 'msg-1',
        message_ref: 'conv-1:msg-1',
        conversation_ref: 'conv-1',
        thread_ref: null,
        labels: ['tag'],
        note: null,
        updated_at: 2000,
        version: 1,
      };
      const result = validateSyncRecord(record);
      assert.isTrue(result.valid, result.errors.join(', '));
    });

    it('rejects sync record with invalid _type', () => {
      const record = {
        _type: 'bad_type',
        thread_ref: 'conv-1:t1',
        conversation_ref: 'conv-1',
        title: null,
        color: null,
        is_pinned: false,
        updated_at: 1000,
        version: 1,
      };
      const result = validateSyncRecord(record);
      assert.isFalse(result.valid);
    });

    it('accepts deleted sync record with minimal fields', () => {
      const record = {
        _type: 'thread_overlay',
        _deleted: true,
        thread_ref: 'conv-1:t-del',
        conversation_ref: '',
        title: null,
        color: null,
        is_pinned: false,
        updated_at: 0,
        version: 0,
      };
      const result = validateSyncRecord(record);
      assert.isTrue(result.valid, result.errors.join(', '));
    });
  });

  // ─── sanitizeForSync ─────────────────────────────────────────────────

  describe('sanitizeForSync', () => {
    it('strips unknown fields from thread sync record', () => {
      const dirty = {
        _type: 'thread_overlay' as const,
        thread_ref: 'conv-1:t1',
        conversation_ref: 'conv-1',
        title: 'Test',
        color: null,
        is_pinned: true,
        updated_at: 1000,
        version: 1,
        _unknownField: 'should be removed',
        extraData: { nested: true },
      };
      const clean = sanitizeForSync(dirty as any);
      assert.isUndefined((clean as any)._unknownField);
      assert.isUndefined((clean as any).extraData);
      assert.equal(clean.thread_ref, 'conv-1:t1');
      assert.equal(clean._type, 'thread_overlay');
    });

    it('strips unknown fields from message sync record', () => {
      const dirty = {
        _type: 'message_overlay' as const,
        id: 'msg-1',
        message_ref: 'conv-1:msg-1',
        conversation_ref: 'conv-1',
        thread_ref: null,
        labels: ['tag'],
        note: null,
        updated_at: 2000,
        version: 1,
        _extraMeta: 'gone',
      };
      const clean = sanitizeForSync(dirty as any);
      assert.isUndefined((clean as any)._extraMeta);
      assert.deepEqual([...clean.labels as string[]], ['tag']);
    });

    it('coerces is_pinned number to boolean for thread records', () => {
      const record = {
        _type: 'thread_overlay' as const,
        thread_ref: 'conv-1:t1',
        conversation_ref: 'conv-1',
        title: null,
        color: null,
        is_pinned: 1 as any,
        updated_at: 1000,
        version: 1,
      };
      const clean = sanitizeForSync(record);
      assert.strictEqual((clean as any).is_pinned, true);
    });
  });

  // ─── Conflict resolution against fixtures ────────────────────────────

  describe('conflict resolution matches fixtures', () => {
    it('resolveConflict matches all fixture expectations', () => {
      const fixture = loadFixture('merge-conflict-cases.json') as {
        conflict_resolution: Array<{
          name: string;
          local: { updated_at: number; version: number };
          remote: { updated_at: number; version: number };
          expected: ConflictResolution;
        }>;
      };

      for (const tc of fixture.conflict_resolution) {
        const result = resolveConflict(
          tc.local.updated_at,
          tc.local.version,
          tc.remote.updated_at,
          tc.remote.version
        );
        assert.equal(
          result,
          tc.expected,
          `Case "${tc.name}": expected ${tc.expected} but got ${result}`
        );
      }
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx electron-mocha --require ts/test-node/setup.ts ts/test-node/overlay/OverlayContract_test.std.ts 2>&1 | head -20`
Expected: FAIL — cannot find module `OverlaySchemaValidator.std.js`

**Step 3: Write OverlaySchemaValidator implementation**

Create file `ts/overlay/contract/OverlaySchemaValidator.std.ts`:

```typescript
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// Cross-platform schema validators for overlay records.
// Pure functions, zero dependencies — safe to use on any platform.
// These validators enforce the shared contract defined in
// docs/overlay-contract/overlay-shared-contract.md.

import type {
  ThreadOverlayType,
  MessageOverlayType,
} from '../models/OverlayTypes.std.js';
import type {
  SyncRecord,
  ThreadSyncRecord,
  MessageSyncRecord,
} from '../sync/OverlaySyncTypes.std.js';

export type ValidationResult = {
  valid: boolean;
  errors: ReadonlyArray<string>;
};

// ─── Thread overlay validation ──────────────────────────────────────────────

export function validateThreadOverlay(obj: unknown): ValidationResult {
  const errors: Array<string> = [];

  if (obj == null || typeof obj !== 'object') {
    return { valid: false, errors: ['Expected an object'] };
  }

  const rec = obj as Record<string, unknown>;

  if (typeof rec.thread_ref !== 'string' || rec.thread_ref.length === 0) {
    errors.push('thread_ref must be a non-empty string');
  }
  if (
    typeof rec.conversation_ref !== 'string' ||
    rec.conversation_ref.length === 0
  ) {
    errors.push('conversation_ref must be a non-empty string');
  }
  if (rec.title !== null && typeof rec.title !== 'string') {
    errors.push('title must be a string or null');
  }
  if (rec.color !== null && typeof rec.color !== 'string') {
    errors.push('color must be a string or null');
  }
  if (typeof rec.is_pinned !== 'boolean') {
    errors.push('is_pinned must be a boolean');
  }
  validateTimestampAndVersion(rec, errors);

  return { valid: errors.length === 0, errors };
}

// ─── Message overlay validation ─────────────────────────────────────────────

export function validateMessageOverlay(obj: unknown): ValidationResult {
  const errors: Array<string> = [];

  if (obj == null || typeof obj !== 'object') {
    return { valid: false, errors: ['Expected an object'] };
  }

  const rec = obj as Record<string, unknown>;

  if (typeof rec.id !== 'string' || rec.id.length === 0) {
    errors.push('id must be a non-empty string');
  }
  if (typeof rec.message_ref !== 'string' || rec.message_ref.length === 0) {
    errors.push('message_ref must be a non-empty string');
  }
  if (
    typeof rec.conversation_ref !== 'string' ||
    rec.conversation_ref.length === 0
  ) {
    errors.push('conversation_ref must be a non-empty string');
  }
  if (rec.thread_ref !== null && typeof rec.thread_ref !== 'string') {
    errors.push('thread_ref must be a string or null');
  }
  if (!Array.isArray(rec.labels)) {
    errors.push('labels must be an array');
  } else {
    for (let i = 0; i < rec.labels.length; i += 1) {
      if (typeof rec.labels[i] !== 'string') {
        errors.push(`labels[${i}] must be a string`);
      }
    }
  }
  if (rec.note !== null && rec.note !== undefined && typeof rec.note !== 'string') {
    errors.push('note must be a string or null');
  }
  validateTimestampAndVersion(rec, errors);

  return { valid: errors.length === 0, errors };
}

// ─── Sync record validation ─────────────────────────────────────────────────

export function validateSyncRecord(obj: unknown): ValidationResult {
  if (obj == null || typeof obj !== 'object') {
    return { valid: false, errors: ['Expected an object'] };
  }

  const rec = obj as Record<string, unknown>;
  const _type = rec._type;

  if (_type !== 'thread_overlay' && _type !== 'message_overlay') {
    return {
      valid: false,
      errors: [`_type must be 'thread_overlay' or 'message_overlay', got '${String(_type)}'`],
    };
  }

  // Deleted records have relaxed validation (only need _type + key)
  if (rec._deleted === true) {
    if (_type === 'thread_overlay') {
      if (typeof rec.thread_ref !== 'string') {
        return { valid: false, errors: ['deleted thread_overlay requires thread_ref'] };
      }
    } else {
      if (typeof rec.message_ref !== 'string') {
        return { valid: false, errors: ['deleted message_overlay requires message_ref'] };
      }
    }
    return { valid: true, errors: [] };
  }

  if (_type === 'thread_overlay') {
    return validateThreadOverlay(rec);
  }
  return validateMessageOverlay(rec);
}

// ─── Sanitize for sync ──────────────────────────────────────────────────────

const THREAD_FIELDS = new Set([
  '_type', '_deleted', 'thread_ref', 'conversation_ref',
  'title', 'color', 'is_pinned', 'updated_at', 'version',
]);

const MESSAGE_FIELDS = new Set([
  '_type', '_deleted', 'id', 'message_ref', 'conversation_ref',
  'thread_ref', 'labels', 'note', 'updated_at', 'version',
]);

export function sanitizeForSync(record: SyncRecord): SyncRecord {
  const allowedFields =
    record._type === 'thread_overlay' ? THREAD_FIELDS : MESSAGE_FIELDS;

  const cleaned: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (allowedFields.has(key)) {
      cleaned[key] = (record as Record<string, unknown>)[key];
    }
  }

  // Coerce is_pinned number → boolean for thread records
  if (
    record._type === 'thread_overlay' &&
    typeof cleaned.is_pinned === 'number'
  ) {
    cleaned.is_pinned = cleaned.is_pinned !== 0;
  }

  return cleaned as SyncRecord;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function validateTimestampAndVersion(
  rec: Record<string, unknown>,
  errors: Array<string>
): void {
  if (typeof rec.updated_at !== 'number' || rec.updated_at < 0) {
    errors.push('updated_at must be a non-negative number');
  }
  if (
    typeof rec.version !== 'number' ||
    rec.version < 1 ||
    !Number.isInteger(rec.version)
  ) {
    errors.push('version must be a positive integer');
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx electron-mocha --require ts/test-node/setup.ts ts/test-node/overlay/OverlayContract_test.std.ts`
Expected: all tests PASS

**Step 5: Commit**

```bash
git add ts/overlay/contract/OverlaySchemaValidator.std.ts ts/test-node/overlay/OverlayContract_test.std.ts
git commit -m "feat(overlay/m4): add schema validator + contract tests against fixtures"
```

---

### Task 6: Add iOS sync readiness feature flag

**Files:**
- Modify: `ts/overlay/OverlayFeatureFlag.std.ts`
- Test: `ts/test-node/overlay/OverlayIosSyncReadyFlag_test.std.ts`

**Step 1: Write the failing test**

Create file `ts/test-node/overlay/OverlayIosSyncReadyFlag_test.std.ts`:

```typescript
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  isOverlayIosSyncReady,
  setOverlayIosSyncReadyForTesting,
  setOverlayCloudSyncEnabledForTesting,
  setOverlayThreadsEnabledForTesting,
} from '../../overlay/OverlayFeatureFlag.std.js';

describe('overlay/OverlayFeatureFlag — iOS sync ready', () => {
  afterEach(() => {
    setOverlayThreadsEnabledForTesting(null);
    setOverlayCloudSyncEnabledForTesting(null);
    setOverlayIosSyncReadyForTesting(null);
  });

  it('defaults to false', () => {
    assert.isFalse(isOverlayIosSyncReady());
  });

  it('returns false when cloud sync is disabled', () => {
    setOverlayThreadsEnabledForTesting(true);
    setOverlayCloudSyncEnabledForTesting(false);
    setOverlayIosSyncReadyForTesting(true);
    assert.isFalse(isOverlayIosSyncReady());
  });

  it('returns false when overlay threads are disabled', () => {
    setOverlayThreadsEnabledForTesting(false);
    setOverlayCloudSyncEnabledForTesting(true);
    setOverlayIosSyncReadyForTesting(true);
    assert.isFalse(isOverlayIosSyncReady());
  });

  it('returns true when all three flags are enabled', () => {
    setOverlayThreadsEnabledForTesting(true);
    setOverlayCloudSyncEnabledForTesting(true);
    setOverlayIosSyncReadyForTesting(true);
    assert.isTrue(isOverlayIosSyncReady());
  });

  it('returns false when ios sync ready is off but others are on', () => {
    setOverlayThreadsEnabledForTesting(true);
    setOverlayCloudSyncEnabledForTesting(true);
    setOverlayIosSyncReadyForTesting(false);
    assert.isFalse(isOverlayIosSyncReady());
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx electron-mocha --require ts/test-node/setup.ts ts/test-node/overlay/OverlayIosSyncReadyFlag_test.std.ts 2>&1 | head -10`
Expected: FAIL — `isOverlayIosSyncReady` is not exported

**Step 3: Add the flag to OverlayFeatureFlag.std.ts**

Append after line 108 of `ts/overlay/OverlayFeatureFlag.std.ts`:

```typescript

// ─── iOS sync readiness flag ────────────────────────────────────────────────

const IOS_SYNC_READY_KEY = 'overlayIosSyncReady';
let _iosSyncReadyOverride: boolean | null = null;

/**
 * Returns true when this desktop instance signals that its overlay contract
 * is stable enough for iOS clients to sync against the same CloudKit zone.
 * Requires both overlayThreadsEnabled and overlayCloudSyncEnabled.
 */
export function isOverlayIosSyncReady(): boolean {
  if (!isOverlayCloudSyncEnabled()) {
    return false;
  }

  if (_iosSyncReadyOverride !== null) {
    return _iosSyncReadyOverride;
  }

  if (
    typeof window !== 'undefined' &&
    window.storage &&
    typeof window.storage.get === 'function'
  ) {
    return window.storage.get(IOS_SYNC_READY_KEY, false) === true;
  }

  return false;
}

export async function setOverlayIosSyncReady(
  enabled: boolean
): Promise<void> {
  if (
    typeof window !== 'undefined' &&
    window.storage &&
    typeof window.storage.put === 'function'
  ) {
    await window.storage.put(IOS_SYNC_READY_KEY, enabled);
  }
}

export function setOverlayIosSyncReadyForTesting(
  value: boolean | null
): void {
  _iosSyncReadyOverride = value;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx electron-mocha --require ts/test-node/setup.ts ts/test-node/overlay/OverlayIosSyncReadyFlag_test.std.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add ts/overlay/OverlayFeatureFlag.std.ts ts/test-node/overlay/OverlayIosSyncReadyFlag_test.std.ts
git commit -m "feat(overlay/m4): add iOS sync readiness feature flag"
```

---

### Task 7: Update barrel exports in index.std.ts

**Files:**
- Modify: `ts/overlay/index.std.ts`

**Step 1: Add validator and flag exports**

After the existing feature flag exports (line 32), add:

```typescript

export {
  validateThreadOverlay,
  validateMessageOverlay,
  validateSyncRecord,
  sanitizeForSync,
} from './contract/OverlaySchemaValidator.std.js';

export type { ValidationResult } from './contract/OverlaySchemaValidator.std.js';

export {
  isOverlayIosSyncReady,
  setOverlayIosSyncReady,
  setOverlayIosSyncReadyForTesting,
} from './OverlayFeatureFlag.std.js';
```

**Step 2: Commit**

```bash
git add ts/overlay/index.std.ts
git commit -m "refactor(overlay/m4): export validators + iOS sync flag from barrel"
```

---

### Task 8: Add validation gate to OverlaySyncMerger

**Files:**
- Modify: `ts/overlay/sync/OverlaySyncMerger.node.ts`

**Step 1: Write a failing test for validation gate**

Add a new describe block to `ts/test-node/overlay/OverlaySyncMerger_test.node.ts` at the end of the file (before the closing `});`):

```typescript
  describe('validation gate', () => {
    it('skips records that fail validation and does not crash', () => {
      const invalidRecord = {
        _type: 'thread_overlay',
        // missing thread_ref — will fail validation
        conversation_ref: 'conv-1',
        title: 'Bad',
        color: null,
        is_pinned: false,
        updated_at: 1000,
        version: 1,
      } as any;

      const validRecord: ThreadSyncRecord = {
        _type: 'thread_overlay',
        thread_ref: 'conv-1:valid-t',
        conversation_ref: 'conv-1',
        title: 'Good',
        color: null,
        is_pinned: false,
        updated_at: 2000,
        version: 1,
      };

      // Should process valid record and skip invalid without throwing
      const result = mergeRemoteRecords(db, [invalidRecord, validRecord]);
      assert.equal(result.threadsInserted, 1);
      assert.ok(getThreadOverlay(db, 'conv-1:valid-t'));
    });
  });
```

**Step 2: Run test to verify it fails**

Run: `npx electron-mocha --require ts/test-node/setup.ts ts/test-node/overlay/OverlaySyncMerger_test.node.ts --grep "validation gate" 2>&1 | head -20`
Expected: FAIL or unexpected behavior (invalid record may cause SQLite error)

**Step 3: Add validation import and check to OverlaySyncMerger**

At line 8 of `ts/overlay/sync/OverlaySyncMerger.node.ts`, add import:

```typescript
import { validateSyncRecord } from '../contract/OverlaySchemaValidator.std.js';
```

In `mergeRemoteRecords`, wrap the loop body with validation. Replace lines 78-86:

```typescript
  for (const record of records) {
    const validation = validateSyncRecord(record);
    if (!validation.valid) {
      // Log and skip invalid records — never crash the merge
      // eslint-disable-next-line no-console
      console.warn(
        'OverlaySyncMerger: skipping invalid remote record:',
        validation.errors
      );
      continue;
    }

    if (record._type === 'thread_overlay') {
      mergeThreadRecord(db, record, result);
    } else {
      mergeMessageRecord(db, record, result);
    }
  }
```

**Step 4: Run full merger tests**

Run: `npx electron-mocha --require ts/test-node/setup.ts ts/test-node/overlay/OverlaySyncMerger_test.node.ts`
Expected: all tests PASS (existing + new validation gate test)

**Step 5: Commit**

```bash
git add ts/overlay/sync/OverlaySyncMerger.node.ts ts/test-node/overlay/OverlaySyncMerger_test.node.ts
git commit -m "feat(overlay/m4): add validation gate in sync merger for remote records"
```

---

### Task 9: Write iOS implementation guide

**Files:**
- Create: `docs/overlay-contract/ios-implementation-guide.md`

**Step 1: Write the guide**

```markdown
# iOS Overlay Implementation Guide

Last updated: 2026-03-03

This guide describes how to implement the Signal overlay system on iOS, achieving behavior parity with the desktop implementation. Read `overlay-shared-contract.md` first — it defines the canonical schemas and rules.

## 1. Module Mapping

| Desktop Module | iOS Equivalent | Notes |
|----------------|---------------|-------|
| `MessageRefAdapter.std.ts` | `MessageRefAdapter.swift` | Same string format logic. Pure function, no I/O. |
| `OverlayStore.node.ts` | `OverlayStore.swift` (GRDB or Core Data) | SQLite CRUD. Use GRDB for closest parity with desktop's better-sqlite3. |
| `OverlayFeatureFlag.std.ts` | `OverlayFeatureFlag.swift` | UserDefaults-backed. Same flag keys. |
| `OverlaySchemaValidator.std.ts` | `OverlaySchemaValidator.swift` | Same validation rules. Test against shared JSON fixtures. |
| `CloudKitHttpClient.node.ts` | `CloudKitNativeAdapter.swift` | iOS uses native CKDatabase, NOT HTTP API. |
| `OverlaySyncEngine.node.ts` | `OverlaySyncEngine.swift` | Same pull→merge→push loop. Use CKFetchRecordZoneChangesOperation. |
| `OverlaySyncMerger.node.ts` | `OverlaySyncMerger.swift` | Identical conflict resolution logic. Must pass same fixture tests. |
| `OverlayService.dom.ts` | `OverlayService.swift` | Renderer facade → iOS ViewModel/Service. |

## 2. CloudKit API Differences

### Desktop (HTTP Web Services API)
- Uses `CloudKitHttpClient` with REST endpoints
- Manual JSON serialization/deserialization
- Polling-based change detection (5min interval + debounced push)

### iOS (Native CloudKit Framework)
- Use `CKDatabase` with `CKFetchRecordZoneChangesOperation`
- Use `CKModifyRecordsOperation` for pushes
- Use `CKDatabaseSubscription` for push notification-driven sync (preferred over polling)
- `CKRecord.ID` maps to `thread_ref` or composite `message_ref`+`id`
- `CKRecordZone` name: `OverlayZone` (must match desktop)

### Shared Requirements
- Zone: `OverlayZone` in `.private` database scope
- Record types: `ThreadOverlay`, `MessageOverlay` (exact names)
- All fields serialize identically (see contract doc type mapping table)
- `labels` stored as JSON string (not CKRecord list), for cross-platform consistency

## 3. Behavior Parity Checklist

### CRUD Operations
- [ ] Create thread overlay (generates UUID thread_ref, sets updated_at + version=1)
- [ ] Read threads by conversation_ref
- [ ] Update thread title/color/is_pinned (bumps updated_at + version)
- [ ] Delete thread overlay (removes all associated message overlays' thread_ref)
- [ ] Create message overlay (generates UUID id, derives message_ref via adapter)
- [ ] Read messages by thread_ref, by conversation_ref, by message_ref
- [ ] Update message labels/note/thread_ref (bumps updated_at + version)
- [ ] Delete message overlay

### Message Reference
- [ ] Primary strategy: `<conversationId>:<signalMessageId>`
- [ ] Fallback strategy: `<conversationId>:<senderAciOrId>:<sentAtMs>`
- [ ] `isPrimaryRef()` detection works identically
- [ ] All ref derivation goes through adapter (never inline)

### Conflict Resolution
- [ ] `updated_at` newer wins
- [ ] Tie-break: higher `version` wins
- [ ] Full tie: local wins
- [ ] Deletion always applies (no conflict check)
- [ ] All `merge-conflict-cases.json` test cases pass

### Sync
- [ ] Pull remote changes before pushing local
- [ ] Merge remote records using conflict policy
- [ ] Push dirty local records (changed since last sync)
- [ ] Save sync token after successful cycle
- [ ] Retry with exponential backoff on failure (1s initial, 5min cap)
- [ ] Validation gate: skip invalid remote records (log, don't crash)

### Feature Flags
- [ ] `overlayThreadsEnabled` (master toggle, default OFF)
- [ ] `overlayCloudSyncEnabled` (requires threads flag, default OFF)
- [ ] `overlayIosSyncReady` (requires cloud sync flag, default OFF)
- [ ] All flags independent of Signal's server-driven RemoteConfig

### Error Handling
- [ ] Overlay failure never blocks core Signal functionality
- [ ] DB corruption → disable overlay feature + notify user
- [ ] Sync failure → retry with backoff, surface status in settings
- [ ] Invalid remote records → skip and log, never crash merge

## 4. Cross-Device Test Matrix

| Scenario | Expected Behavior |
|----------|-------------------|
| Desktop creates thread → iOS pulls | iOS has identical thread (title, color, pinned, timestamps) |
| iOS creates thread → Desktop pulls | Desktop has identical thread |
| Desktop updates title, iOS updates color (different fields) | Last writer's timestamp wins; both fields from winner |
| Desktop and iOS update same field simultaneously | Higher `updated_at` wins; tie → higher `version`; full tie → local wins on each device (may diverge until next sync cycle) |
| Desktop deletes thread → iOS pulls | Thread removed on iOS |
| iOS deletes thread → Desktop pulls | Thread removed on Desktop |
| Desktop offline for 24h, makes edits → reconnects | All edits pushed; conflicts resolved by timestamp |
| Both offline, both edit same thread → both reconnect | Each pulls other's changes; conflict resolution produces same winner on both sides (deterministic) |
| Desktop adds labels ["a","b"], iOS adds labels ["c"] | Winner's entire labels array replaces loser's (no merge of individual labels) |
| Message ref upgrade (fallback → primary) | New primary ref creates new overlay; old fallback ref overlay becomes orphaned (acceptable in v1) |

## 5. SQLite Schema

Use the same schema as desktop migration 1680. If using GRDB:

```swift
try db.create(table: "thread_overlay", options: .strict) { t in
    t.column("thread_ref", .text).notNull().primaryKey()
    t.column("conversation_ref", .text).notNull()
    t.column("title", .text)
    t.column("color", .text)
    t.column("is_pinned", .integer).notNull().defaults(to: 0)
    t.column("updated_at", .integer).notNull()
    t.column("version", .integer).notNull().defaults(to: 1)
}

try db.create(table: "message_overlay", options: .strict) { t in
    t.column("id", .text).notNull().primaryKey()
    t.column("message_ref", .text).notNull().unique()
    t.column("conversation_ref", .text).notNull()
    t.column("thread_ref", .text)
    t.column("labels_json", .text).notNull().defaults(to: "[]")
    t.column("note", .text)
    t.column("updated_at", .integer).notNull()
    t.column("version", .integer).notNull().defaults(to: 1)
}

try db.create(table: "overlay_sync_state", options: .strict) { t in
    t.column("device_id", .text).notNull().primaryKey()
    t.column("last_sync_token", .text)
    t.column("last_sync_at", .integer)
}
```

## 6. Testing

### Unit Tests (Swift XCTest)
1. Load `thread-overlay-samples.json` → validate all valid pass, all invalid fail
2. Load `message-overlay-samples.json` → same
3. Load `merge-conflict-cases.json` → all `conflict_resolution` cases match expected
4. Load `serialization-roundtrip.json` → records survive SQLite write→read and CloudKit encode→decode

### Integration Tests
5. Full sync cycle with mock CKDatabase
6. Offline edit → reconnect → verify merge
7. Feature flag combinations (all three flags)

### Cross-Device Tests (manual QA)
8. Use the test matrix in section 4 above
```

**Step 2: Commit**

```bash
git add docs/overlay-contract/ios-implementation-guide.md
git commit -m "docs(overlay/m4): add iOS overlay implementation guide"
```

---

### Task 10: Final commit — squash into feature commit

**Step 1: Verify all files exist**

Run: `git status`
Expected: clean working tree, all files committed

**Step 2: Check test files parse correctly**

Run: `node -e "const fs = require('fs'); ['thread-overlay-samples.json','message-overlay-samples.json','merge-conflict-cases.json','serialization-roundtrip.json'].forEach(f => { JSON.parse(fs.readFileSync('ts/test-node/overlay/fixtures/' + f, 'utf-8')); console.log(f + ' OK'); })"`
Expected: all 4 print OK

**Step 3: Review file list**

New files:
- `docs/overlay-contract/overlay-shared-contract.md`
- `docs/overlay-contract/ios-implementation-guide.md`
- `docs/plans/2026-03-03-m4-ios-parity-prep-design.md`
- `ts/overlay/contract/OverlaySchemaValidator.std.ts`
- `ts/test-node/overlay/fixtures/thread-overlay-samples.json`
- `ts/test-node/overlay/fixtures/message-overlay-samples.json`
- `ts/test-node/overlay/fixtures/merge-conflict-cases.json`
- `ts/test-node/overlay/fixtures/serialization-roundtrip.json`
- `ts/test-node/overlay/OverlayContract_test.std.ts`
- `ts/test-node/overlay/OverlayIosSyncReadyFlag_test.std.ts`

Modified files:
- `ts/overlay/OverlayFeatureFlag.std.ts`
- `ts/overlay/index.std.ts`
- `ts/overlay/sync/OverlaySyncMerger.node.ts`
- `ts/test-node/overlay/OverlaySyncMerger_test.node.ts`
