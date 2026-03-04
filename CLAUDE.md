# CLAUDE.md — Signal Desktop Fork Spec (Thread Overlay + iCloud Sync)

## Project
Signal Desktop fork with a **local metadata overlay** that adds:
- pseudo-thread grouping
- labels/tags
- pinning
- lightweight notes

without modifying Signal protocol, message encryption, or server behavior.

---

## Problem Statement
Signal is excellent for secure messaging, but high-context workflows (personal assistant use, multi-project coordination, interview pipelines, content planning) suffer without native threads.

We need thread-like organization that:
1. works locally without touching message ciphertext,
2. preserves full compatibility with upstream Signal network behavior,
3. can later sync metadata across Apple devices via iCloud (CloudKit).

---

## Product Principles
1. **Protocol-safe:** Never alter Signal transport/encryption semantics.
2. **Metadata-only:** Store only overlay metadata, not message body content.
3. **Fail-open:** If overlay fails, base Signal experience must continue normally.
4. **Incremental:** Ship desktop local-first, then sync, then iOS parity.
5. **Upstream-friendly boundaries:** Keep forked changes isolated and documented.

---

## Scope

## In scope (v1 desktop)
- Local thread overlays on top of existing conversations
- Tagging/labeling messages and threads
- Pinning overlay threads
- Optional short notes on thread/message overlays
- Dedicated “Thread View” filter per conversation
- Local persistence (SQLite)

## In scope (v2 desktop)
- CloudKit sync for overlay metadata (Apple ID private DB)
- Conflict handling (last-write-wins + version tie-break)
- Sync diagnostics panel

## Out of scope
- Any change to Signal E2EE protocol
- Sending overlay metadata through Signal messages
- Multi-user/shared overlay collaboration
- Non-Apple sync in first release
- Full iOS implementation in this repo (spec prepares for it)

---

## User Stories
1. As a user, I can group related messages into a named pseudo-thread.
2. As a user, I can tag a thread (e.g., `hiring`, `socialfusion`, `wistiaproject`).
3. As a user, I can pin important threads within a conversation.
4. As a user, I can filter conversation view by thread/tag.
5. As a user, I can add a short private note to a thread.
6. As a user, if the overlay DB fails, I can still use Signal normally.

---

## Architecture Overview

### Layers
1. **Signal Core (unchanged)**
   - message transport
   - encryption/decryption
   - storage and UI baseline

2. **Overlay Domain Layer (new)**
   - overlay models
   - message reference adapter
   - business logic (thread assignment, labels, pins)

3. **Overlay Persistence Layer (new)**
   - SQLite schema + migration manager

4. **Overlay UI Layer (new)**
   - panels, chips, filters, actions

5. **Sync Adapter Layer (v2)**
   - CloudKit push/pull delta sync

---

## Data Model (desktop local)

### `thread_overlay`
- `thread_ref` TEXT PRIMARY KEY
- `conversation_ref` TEXT NOT NULL
- `title` TEXT NULL
- `color` TEXT NULL
- `is_pinned` INTEGER NOT NULL DEFAULT 0
- `updated_at` INTEGER NOT NULL
- `version` INTEGER NOT NULL DEFAULT 1

### `message_overlay`
- `id` TEXT PRIMARY KEY
- `message_ref` TEXT NOT NULL UNIQUE
- `conversation_ref` TEXT NOT NULL
- `thread_ref` TEXT NULL
- `labels_json` TEXT NOT NULL DEFAULT '[]'
- `note` TEXT NULL
- `updated_at` INTEGER NOT NULL
- `version` INTEGER NOT NULL DEFAULT 1

### `overlay_sync_state` (v2)
- `device_id` TEXT PRIMARY KEY
- `last_sync_token` TEXT NULL
- `last_sync_at` INTEGER NULL

### Indexes
- `idx_message_overlay_conversation_ref`
- `idx_message_overlay_thread_ref`
- `idx_thread_overlay_conversation_ref`
- `idx_thread_overlay_updated_at`

---

## Message Reference Strategy
`message_ref` must be stable across app restarts and robust across render updates.

Preferred key:
`<conversation_ref>:<signal_message_id>`

Fallback if necessary:
`<conversation_ref>:<sender_aci_or_id>:<sent_at_ms>`

### Requirement
Create one adapter module responsible for reference derivation. No inline key construction in UI components.

---

## UX Spec (desktop)

## Conversation View Additions
- Per-message context menu:
  - “Add to thread…”
  - “Create new thread from message”
  - “Add label”
  - “Add note”

- Thread chip row (top of conversation):
  - pinned threads first
  - shows title + count + tags

- Filter mode toggle:
  - All messages (default)
  - Thread view

## Thread View
- Left rail/list of threads in current conversation
- Right pane: messages in selected overlay thread
- Optional thread note shown at top

## Global Search Extension (optional v1.1)
- Search by label/thread title (metadata only)

---

## Functional Requirements
1. Creating a thread overlay must not mutate original Signal message records.
2. Deleting a thread overlay must only clear overlay associations.
3. Labels must be attachable at message and thread level.
4. Pins are per-conversation overlays, not global by default.
5. Overlay operations must be undo-safe in UI (soft undo within session).
6. Overlay DB corruption must degrade gracefully (disable feature + notify user).

---

## Non-Functional Requirements
- Overlay actions under 100ms perceived latency on common hardware.
- No measurable impact on message send/receive performance.
- Migration-safe schema evolution.
- Telemetry/logging for overlay errors only (no message content logging).

---

## Security & Privacy Requirements
1. Never store plaintext Signal message bodies in overlay tables.
2. Notes are user-authored metadata; expose optional local encryption toggle later.
3. Keep sync data to private user scope only.
4. Do not transmit metadata through Signal servers.
5. Respect existing app lock/privacy controls where feasible.

---

## CloudKit Sync Spec (v2)

## Record Types
- `ThreadOverlay`
- `MessageOverlay`

## Conflict policy (v2 initial)
- Primary: `updated_at` newest wins
- Tie-break: higher `version`

## Sync loop
1. Load last sync token
2. Pull remote deltas
3. Merge locally (conflict policy)
4. Push local dirty records
5. Save new sync token

## Failure behavior
- Retry with exponential backoff
- Surface non-blocking sync status in settings
- No blocking of local overlay actions

---

## Repository Integration Plan

## New modules (suggested)
- `ts/overlay/models/*`
- `ts/overlay/store/*`
- `ts/overlay/services/MessageRefAdapter.ts`
- `ts/overlay/services/OverlayService.ts`
- `ts/overlay/ui/*`
- `ts/overlay/sync/*` (v2)

## Touch points
- conversation message item context menu
- conversation header/filter controls
- settings panel (feature flag + diagnostics)

---

## Feature Flags
- `overlayThreadsEnabled` (default OFF)
- `overlayCloudSyncEnabled` (default OFF, v2)

Roll out behind flags first; enable for dev builds before broader usage.

---

## Milestones

## M0 — Foundations
- schema + migration
- message reference adapter
- feature flags
- unit tests for data layer

## M1 — Local Overlay MVP (desktop)
- create thread
- assign/remove message thread
- labels
- pin/unpin
- thread list UI
- basic settings toggle

## M2 — UX Hardening
- thread filter UX polish
- undo interactions
- error states
- performance tuning

## M3 — CloudKit Sync (desktop)
- sync schema mappings
- push/pull deltas
- conflict resolution
- sync diagnostics

## M4 — iOS Parity Prep (separate repo)
- shared model contract doc
- compatibility tests for references and merge policy

---

## Test Plan

## Unit tests
- key derivation in MessageRefAdapter
- CRUD + migration for overlay tables
- merge/conflict rules

## Integration tests
- overlay actions in conversation view
- feature flag on/off behavior
- DB corruption fallback behavior

## Manual QA
- create/update/delete overlays during active messaging
- app restart persistence
- large conversation performance
- sync with two desktop instances signed into same iCloud account (v2)

---

## Acceptance Criteria (M1)
1. User can create and name a thread overlay from any message.
2. User can view all messages associated with an overlay thread.
3. User can add/remove labels and pins.
4. No protocol/network regressions in baseline Signal operations.
5. Feature can be disabled cleanly without data loss.

---

## Risks & Mitigations
- **Risk:** unstable message IDs in UI layer
  - **Mitigation:** isolate derivation in adapter + fallback strategy
- **Risk:** overlay UI complexity causes confusion
  - **Mitigation:** opt-in feature flag + concise onboarding tooltip
- **Risk:** CloudKit drift/conflicts
  - **Mitigation:** deterministic merge policy + sync diagnostics
- **Risk:** fork drift from upstream Signal updates
  - **Mitigation:** isolate overlay modules and minimize invasive patches

---

## Open Questions
1. Should pins be conversation-local or global by default?
2. Should notes be message-level only in v1 to reduce complexity?
3. Should labels be freeform only, or include suggested presets?
4. Is CloudKit mandatory for v2, or optional per user setting?

---

## Engineering Working Rules
- Keep overlay code path separate from core message transport.
- Prefer additive UI controls over rewiring existing message rendering.
- Avoid speculative abstractions; ship local overlay first.
- Document any upstream-touching patch clearly in commit messages.

---

## Deliverables for First PR (M0)
1. `overlay` module scaffolding
2. SQLite schema + migration
3. MessageRefAdapter with tests
4. Feature flag plumbing
5. Minimal debug panel showing derived refs for selected message

---

## Definition of Done (Project v1)
- Stable local thread overlay workflow in desktop app
- No regression in core Signal functionality
- Sufficient docs for iOS team to implement parity later
