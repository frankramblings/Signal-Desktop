# Overlay Shared Contract

Canonical cross-platform reference for the Signal Desktop fork overlay system.
All platforms (Desktop, iOS, future Android) MUST conform to this contract for
interoperability via CloudKit sync.

**Version:** 1.0
**Last updated:** 2026-03-03
**Desktop migration:** 1680

---

## 1. Message Reference Format

All platforms derive message references through a single adapter module.
Inline key construction in UI components or business logic is prohibited.

### 1.1 Primary Format

```
<conversationId>:<signalMessageId>
```

- `conversationId` is a UUID with hyphens (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)
- `signalMessageId` is a UUID with hyphens (same format)
- The separator is a single colon `:`
- Neither component ever contains colons

**Example:**
```
a1b2c3d4-e5f6-7890-abcd-ef1234567890:f0e1d2c3-b4a5-6789-0123-456789abcdef
```

### 1.2 Fallback Format

Used when `signalMessageId` is unavailable (e.g., incoming message rendered
before ID assignment).

```
<conversationId>:<senderAciOrId>:<sentAtMs>
```

- `senderAciOrId` is a UUID or identifier string
- `sentAtMs` is a millisecond-precision Unix epoch timestamp (integer, no decimals)

**Example:**
```
a1b2c3d4-e5f6-7890-abcd-ef1234567890:b2c3d4e5-f6a7-8901-bcde-f12345678901:1709500000000
```

### 1.3 Detection: Primary vs. Fallback

After removing the `<conversationId>:` prefix, the remainder is inspected:

| Condition                         | Format   |
|-----------------------------------|----------|
| Remainder contains **no** colons  | Primary  |
| Remainder contains **one+** colon | Fallback |

This works because UUID components use hyphens, never colons.

### 1.4 Adapter Rule

Every platform MUST implement a single adapter module responsible for all
reference derivation. The adapter:

1. Accepts message attributes (conversationId, signalMessageId, senderAciOrId, sentAtMs)
2. Returns a result indicating `primary`, `fallback`, or `none` strategy
3. Is the ONLY code path that constructs `message_ref` values

Desktop reference implementation: `ts/overlay/services/MessageRefAdapter.std.ts`

---

## 2. Schema Definitions

### 2.1 ThreadOverlay

| Column            | SQLite Type | CloudKit Type | Nullable | Default | Runtime Type       | Notes                                    |
|-------------------|-------------|---------------|----------|---------|--------------------|------------------------------------------|
| `thread_ref`      | TEXT        | STRING        | NO       | --      | `string`           | Primary key                              |
| `conversation_ref`| TEXT        | STRING        | NO       | --      | `string`           | Conversation namespace                   |
| `title`           | TEXT        | STRING        | YES      | NULL    | `string \| null`   | User-assigned thread title               |
| `color`           | TEXT        | STRING        | YES      | NULL    | `string \| null`   | Hex color (e.g., `#3498db`)              |
| `is_pinned`       | INTEGER     | INT64         | NO       | 0       | `boolean`          | Storage: 0\|1; runtime: boolean          |
| `updated_at`      | INTEGER     | INT64         | NO       | --      | `number`           | Millisecond-precision Unix epoch         |
| `version`         | INTEGER     | INT64         | NO       | 1       | `number`           | Monotonically increasing, starts at 1    |

**SQLite DDL:**
```sql
CREATE TABLE thread_overlay (
    thread_ref       TEXT NOT NULL PRIMARY KEY,
    conversation_ref TEXT NOT NULL,
    title            TEXT,
    color            TEXT,
    is_pinned        INTEGER NOT NULL DEFAULT 0,
    updated_at       INTEGER NOT NULL,
    version          INTEGER NOT NULL DEFAULT 1
) STRICT;
```

**CloudKit record type:** `ThreadOverlay`
**CloudKit record name pattern:** `thread:<thread_ref>`

### 2.2 MessageOverlay

| Column            | SQLite Type | CloudKit Type | Nullable | Default | Runtime Type             | Notes                                    |
|-------------------|-------------|---------------|----------|---------|--------------------------|------------------------------------------|
| `id`              | TEXT        | STRING        | NO       | --      | `string`                 | Primary key (UUID)                       |
| `message_ref`     | TEXT        | STRING        | NO       | --      | `string`                 | UNIQUE; derived by MessageRefAdapter     |
| `conversation_ref`| TEXT        | STRING        | NO       | --      | `string`                 | Conversation namespace                   |
| `thread_ref`      | TEXT        | STRING        | YES      | NULL    | `string \| null`         | FK to thread_overlay.thread_ref          |
| `labels_json`     | TEXT        | STRING        | NO       | `'[]'`  | `string[]` (at runtime)  | JSON array of strings in storage         |
| `note`            | TEXT        | STRING        | YES      | NULL    | `string \| null`         | User-authored private note               |
| `updated_at`      | INTEGER     | INT64         | NO       | --      | `number`                 | Millisecond-precision Unix epoch         |
| `version`         | INTEGER     | INT64         | NO       | 1       | `number`                 | Monotonically increasing, starts at 1    |

**SQLite DDL:**
```sql
CREATE TABLE message_overlay (
    id               TEXT NOT NULL PRIMARY KEY,
    message_ref      TEXT NOT NULL UNIQUE,
    conversation_ref TEXT NOT NULL,
    thread_ref       TEXT,
    labels_json      TEXT NOT NULL DEFAULT '[]',
    note             TEXT,
    updated_at       INTEGER NOT NULL,
    version          INTEGER NOT NULL DEFAULT 1
) STRICT;
```

**CloudKit record type:** `MessageOverlay`
**CloudKit record name pattern:** `message:<id>`

### 2.3 OverlaySyncState

| Column            | SQLite Type | Nullable | Default | Runtime Type       | Notes                                    |
|-------------------|-------------|----------|---------|--------------------|------------------------------------------|
| `device_id`       | TEXT        | NO       | --      | `string`           | Primary key                              |
| `last_sync_token` | TEXT        | YES      | NULL    | `string \| null`   | CloudKit sync continuation token         |
| `last_sync_at`    | INTEGER     | YES      | NULL    | `number \| null`   | Millisecond-precision Unix epoch         |

**SQLite DDL:**
```sql
CREATE TABLE overlay_sync_state (
    device_id       TEXT NOT NULL PRIMARY KEY,
    last_sync_token TEXT,
    last_sync_at    INTEGER
) STRICT;
```

This table is local-only and is NOT synced via CloudKit.

### 2.4 Indexes

```sql
CREATE INDEX idx_message_overlay_conversation_ref ON message_overlay (conversation_ref);
CREATE INDEX idx_message_overlay_thread_ref       ON message_overlay (thread_ref);
CREATE INDEX idx_thread_overlay_conversation_ref  ON thread_overlay (conversation_ref);
CREATE INDEX idx_thread_overlay_updated_at        ON thread_overlay (updated_at);
```

---

## 3. Conflict Resolution Policy

All platforms MUST implement identical conflict resolution logic for sync merges.

### 3.1 Rules (in priority order)

| Priority | Rule                                         | Winner       |
|----------|----------------------------------------------|--------------|
| 1        | Newer `updated_at` timestamp wins            | Higher value |
| 2        | Tie-break: higher `version` number wins      | Higher value |
| 3        | Full tie (same `updated_at` AND `version`)   | Local wins   |

### 3.2 Decision Table

| Local `updated_at` | Remote `updated_at` | Local `version` | Remote `version` | Result       |
|---------------------|---------------------|-----------------|-------------------|--------------|
| 1000                | 2000                | *any*           | *any*             | keep_remote  |
| 3000                | 1000                | *any*           | *any*             | keep_local   |
| 5000                | 5000                | 2               | 5                 | keep_remote  |
| 5000                | 5000                | 5               | 2                 | keep_local   |
| 5000                | 5000                | 3               | 3                 | keep_local   |

### 3.3 Deletion Handling

- Deletion markers (`_deleted: true`) are ALWAYS applied without conflict checks.
- If a remote record is marked deleted and a local record exists, the local record is deleted.
- If a remote record is marked deleted and no local record exists, no action is taken.

### 3.4 Merge Procedure

For each incoming remote record:

1. Look up the corresponding local record by key (`thread_ref` for threads, `message_ref` for messages).
2. If the remote record is deleted, apply deletion (see 3.3).
3. If no local record exists, insert the remote record.
4. If both exist, apply conflict resolution rules (see 3.1).
5. If the remote wins, update the local record with remote values including `updated_at` and `version`.
6. If the local wins, take no action.

Desktop reference implementation: `ts/overlay/sync/OverlaySyncMerger.node.ts`

---

## 4. Serialization Format

### 4.1 CloudKit Configuration

| Property       | Value                              |
|----------------|-------------------------------------|
| Zone name      | `OverlayZone`                       |
| Database       | Private (user's iCloud account)     |
| Record types   | `ThreadOverlay`, `MessageOverlay`   |

### 4.2 Type Coercion Table

Platforms MUST apply these coercions when reading from and writing to each storage layer.

| Field         | Runtime Type    | SQLite Storage   | CloudKit Storage | Coercion Notes                                              |
|---------------|-----------------|------------------|------------------|--------------------------------------------------------------|
| `is_pinned`   | `boolean`       | `INTEGER` (0\|1) | `INT64` (0\|1)   | Write: `true`->1, `false`->0. Read: nonzero->true, 0->false |
| `labels`      | `string[]`      | `TEXT` (JSON)    | `STRING` (JSON)  | Write: `JSON.stringify(labels)`. Read: `JSON.parse(labels_json)`. Fallback: `[]` on parse error |
| `updated_at`  | `number`        | `INTEGER`        | `INT64`          | Millisecond-precision Unix epoch. No coercion needed         |
| `version`     | `number`        | `INTEGER`        | `INT64`          | Positive integer >= 1. No coercion needed                    |
| `title`       | `string \| null`| `TEXT`           | `STRING`         | NULL in storage maps to `null` at runtime                    |
| `color`       | `string \| null`| `TEXT`           | `STRING`         | NULL in storage maps to `null` at runtime                    |
| `note`        | `string \| null`| `TEXT`           | `STRING`         | NULL in storage maps to `null` at runtime                    |
| `thread_ref`  | `string \| null`| `TEXT`           | `STRING`         | NULL in storage maps to `null` at runtime                    |

### 4.3 Labels Serialization

Labels are ALWAYS stored as a JSON-encoded string (not a native list type):

- **Runtime:** `["hiring", "urgent"]` (native array of strings)
- **SQLite:** `'["hiring","urgent"]'` (TEXT column `labels_json`)
- **CloudKit:** `'["hiring","urgent"]'` (STRING field `labels_json`)

On read, if `JSON.parse` fails, fall back to an empty array `[]`.

### 4.4 CloudKit Record Name Conventions

| Record Type     | Record Name Pattern       | Example                                              |
|-----------------|---------------------------|------------------------------------------------------|
| ThreadOverlay   | `thread:<thread_ref>`     | `thread:a1b2c3d4-e5f6-7890-abcd-ef1234567890`       |
| MessageOverlay  | `message:<id>`            | `message:f0e1d2c3-b4a5-6789-0123-456789abcdef`      |

### 4.5 Push Operation Type

When pushing records to CloudKit, use `forceReplace` (not `create`) to handle
re-syncing existing records without conflict errors from CloudKit itself.
Deleted records use the `delete` operation type.

---

## 5. Versioning and Migration Strategy

### 5.1 Current State

| Platform | Migration Number | Status    |
|----------|------------------|-----------|
| Desktop  | 1680             | Shipped   |
| iOS      | TBD              | Planned   |

### 5.2 Schema Evolution Rules

All platforms MUST follow these rules for any schema change:

| Rule | Description                                      | Rationale                                            |
|------|--------------------------------------------------|------------------------------------------------------|
| 1    | New fields MUST have defaults                    | Existing records must remain valid after migration   |
| 2    | Never remove a field                             | Deprecate instead; other platforms may still write it |
| 3    | Never change a field's type                      | Add a new field with the desired type instead         |
| 4    | Unknown fields MUST be preserved, not dropped    | Forward compatibility for newer-schema peers          |
| 5    | Any schema change requires a `version` bump      | All platforms can detect schema generation            |
| 6    | Migrations MUST be additive-only                 | Destructive changes break older clients              |

### 5.3 Cross-Platform Sync Compatibility

When two devices are on different schema versions:

1. The device with the **newer** schema may write fields the older device does not know about.
2. The older device MUST preserve unknown fields in local storage and re-push them on sync (Rule 4).
3. The older device MUST NOT fail or crash on encountering unknown fields.
4. The newer device MUST handle records that are missing new fields by using defaults.

### 5.4 Field Deprecation Process

1. Mark the field as deprecated in this contract document.
2. Stop writing to the field in new code (but keep reading it).
3. Add a new field to replace it (with a default value).
4. After all platforms have shipped the replacement, the deprecated field may be ignored on read but MUST NOT be removed from the schema.

---

## Appendix A: Validation Constraints

These constraints MUST be enforced by all platforms when creating or updating records.

| Field          | Constraint                                                |
|----------------|-----------------------------------------------------------|
| `thread_ref`   | Non-empty string                                          |
| `conversation_ref` | Non-empty string                                      |
| `is_pinned`    | Boolean at runtime; integer 0 or 1 in storage             |
| `updated_at`   | Positive integer (milliseconds since Unix epoch)          |
| `version`      | Positive integer >= 1                                     |
| `id`           | Non-empty string (MessageOverlay only)                    |
| `message_ref`  | Non-empty string (MessageOverlay only)                    |
| `labels_json`  | Valid JSON array of strings; defaults to `'[]'`           |

## Appendix B: Desktop File References

| Purpose                 | File Path                                                |
|-------------------------|----------------------------------------------------------|
| Type definitions        | `ts/overlay/models/OverlayTypes.std.ts`                  |
| Message ref adapter     | `ts/overlay/services/MessageRefAdapter.std.ts`           |
| Overlay store (SQLite)  | `ts/overlay/store/OverlayStore.node.ts`                  |
| Feature flags           | `ts/overlay/OverlayFeatureFlag.std.ts`                   |
| Sync types              | `ts/overlay/sync/OverlaySyncTypes.std.ts`                |
| Sync merger             | `ts/overlay/sync/OverlaySyncMerger.node.ts`              |
| CloudKit HTTP client    | `ts/overlay/sync/CloudKitHttpClient.node.ts`             |
| Sync engine             | `ts/overlay/sync/OverlaySyncEngine.node.ts`              |
| Migration               | `ts/sql/migrations/1680-overlay-tables.std.ts`           |
