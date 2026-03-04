# Signal Desktop Fork — Overlay Threads v1 RC1 Release Notes

**Version:** v1-rc1
**Date:** 2026-03-03
**Branch:** `feat/overlay-m3-cloudkit-sync`

---

## What's New

### Thread Overlay System (M0-M5)

A local metadata overlay that adds pseudo-thread grouping, labels, pinning, and notes to Signal Desktop conversations — without modifying Signal protocol, encryption, or server behavior.

### Desktop Features

- **Thread grouping** — Select messages and group them into named threads within any conversation
- **Labels/tags** — Attach freeform labels to threads and individual messages (e.g., `hiring`, `project-x`)
- **Pinning** — Pin important threads within a conversation; pinned threads appear first in the chip row
- **Notes** — Add short private notes to message overlays
- **Thread filter** — Filter conversation view to show only messages in a specific thread
- **Undo** — Session-scoped undo for delete/remove/unlabel actions (up to 20 operations)
- **Error resilience** — Non-blocking error banners; overlay failures never break base Signal
- **CloudKit sync** — Sync overlay metadata across Apple devices via iCloud private database (opt-in)
- **Sync diagnostics** — Settings panel showing sync status, last error, and manual retry

### iOS Parity (Swift Package)

- **SignalOverlay** — Swift Package with GRDB-backed store, matching desktop schema exactly
- **SignalOverlayUI** — UIKit views (ThreadChipRow, ThreadList, ThreadCreate, LabelEditor)
- **Contract compatibility** — Shared JSON fixtures validate cross-platform data interop
- **Conflict resolution** — Identical merge policy (updated_at wins, version tie-break)

---

## How to Enable

The overlay system ships **disabled by default** behind feature flags.

### Desktop
1. Open Signal Desktop developer tools or settings
2. Set `overlayThreadsEnabled` to `true` in local storage
3. (Optional) Set `overlayCloudSyncEnabled` to `true` for iCloud sync

### iOS
1. Set `overlayThreadsEnabled` in UserDefaults
2. (Optional) Set `overlayCloudSyncEnabled` for sync

---

## Architecture

- **Metadata-only** — Overlay tables store refs, titles, labels, notes, timestamps. Never message bodies.
- **Additive changes** — Core Signal files modified only with optional callback props and sibling components
- **Isolated module** — All overlay code in `ts/overlay/` (desktop) and `ios/SignalOverlay/` (iOS)
- **Migration 1680** — Creates 3 new tables + 4 indexes; zero ALTER on existing Signal tables

---

## Milestones Included

| Milestone | Description | Status |
|-----------|-------------|--------|
| M0 | Schema, migration, MessageRefAdapter, feature flags | Complete |
| M1 | Local overlay MVP — CRUD, UI panels, context menu | Complete |
| M2 | UX hardening — filter, undo, error states, a11y, i18n | Complete |
| M3 | CloudKit sync — adapter, engine, merger, diagnostics | Complete |
| M4 | iOS parity prep — contract docs, validators, fixtures | Complete |
| M5 | iOS overlay — Swift Package, GRDB, UIKit views, tests | Complete |

---

## Test Coverage

- **Desktop:** 13 test files covering migration, store CRUD, service behavior, event bus, undo manager, sync engine, merger, feature flags, contract validation, integration
- **iOS:** 57 test functions across 13 test files covering all services, migration, contract compatibility

---

## Dependencies

- No new npm dependencies added to desktop
- iOS: GRDB 6.24+ (Swift Package Manager)

---

## Compatibility

- Fully compatible with upstream Signal network behavior
- No protocol, encryption, or server changes
- Feature can be disabled at any time without data loss (see rollback runbook)
