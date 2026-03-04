# M4 — iOS Parity Prep Design

**Date:** 2026-03-03
**Milestone:** M4
**Approach:** Contract-First (Approach A)

## Goal

Prepare the overlay system for cross-platform parity between Signal Desktop and a future iOS implementation. No production iOS code in this PR — only contracts, validators, test fixtures, documentation, and feature flag stubs.

## Deliverables

### 1. Shared Overlay Contract Document

`docs/overlay-contract/overlay-shared-contract.md`

Canonical reference for any platform implementing overlay sync:

- **Message reference format** — primary (`<convId>:<signalMsgId>`) and fallback (`<convId>:<senderAci>:<sentAtMs>`) strategies with parsing rules
- **Schema definitions** — `ThreadOverlay` and `MessageOverlay` with field types, constraints, nullability, defaults
- **Conflict policy** — `updated_at` newest wins, `version` tie-break, local wins on full tie
- **Versioning strategy** — additive-only field policy, unknown field handling, deprecation rules
- **Serialization format** — JSON for CloudKit, type mapping between SQLite and CloudKit

### 2. Cross-Platform Test Fixtures

`ts/test-node/overlay/fixtures/`

Language-agnostic JSON files:

- `thread-overlay-samples.json` — valid and edge-case thread records
- `message-overlay-samples.json` — valid and edge-case message records
- `merge-conflict-cases.json` — `{ local, remote, expected_winner }` tuples
- `serialization-roundtrip.json` — records that must survive SQLite <-> CloudKit roundtrip

### 3. Schema Validators

`ts/overlay/contract/OverlaySchemaValidator.std.ts`

Pure functions, zero dependencies:

- `validateThreadOverlay(obj)` — returns `{ valid, errors }`
- `validateMessageOverlay(obj)` — returns `{ valid, errors }`
- `validateSyncRecord(obj)` — returns `{ valid, errors }`
- `sanitizeForSync(record)` — strips unknown fields, normalizes types

Integration: `OverlaySyncMerger` calls `validateSyncRecord` on incoming remote records.

### 4. iOS Implementation Guide

`docs/overlay-contract/ios-implementation-guide.md`

- Module mapping (desktop -> iOS equivalents)
- Behavior parity checklist (20 items)
- Cross-device test matrix
- API differences (CloudKit HTTP vs native CKDatabase)

### 5. Feature Flags

`ts/overlay/OverlayFeatureFlag.std.ts` additions:

- `isOverlayIosSyncReady()` — signals contract stability for iOS sync
- Setter + test override

## Files

### New

| File | Purpose |
|------|---------|
| `docs/overlay-contract/overlay-shared-contract.md` | Cross-platform contract |
| `docs/overlay-contract/ios-implementation-guide.md` | iOS implementation guide |
| `ts/overlay/contract/OverlaySchemaValidator.std.ts` | Runtime validators |
| `ts/test-node/overlay/fixtures/thread-overlay-samples.json` | Thread fixtures |
| `ts/test-node/overlay/fixtures/message-overlay-samples.json` | Message fixtures |
| `ts/test-node/overlay/fixtures/merge-conflict-cases.json` | Conflict fixtures |
| `ts/test-node/overlay/fixtures/serialization-roundtrip.json` | Roundtrip fixtures |
| `ts/test-node/overlay/OverlayContract_test.std.ts` | Contract tests |
| `docs/plans/2026-03-03-m4-ios-parity-prep-design.md` | This design doc |

### Modified

| File | Change |
|------|--------|
| `ts/overlay/OverlayFeatureFlag.std.ts` | +iOS sync ready flag |
| `ts/overlay/index.std.ts` | +validator + flag re-exports |
| `ts/overlay/sync/OverlaySyncMerger.node.ts` | +validation before merge |

## Risks

- Contract drift if iOS team deviates from spec (mitigated by shared test fixtures)
- CloudKit native API behavior differences vs HTTP API (documented in guide)
- Schema evolution across platforms requires coordination (mitigated by additive-only policy)
