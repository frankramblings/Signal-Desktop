# M5 Design: iOS Overlay Implementation

**Date:** 2026-03-03
**Branch:** feat/overlay-m5-ios-implementation
**Approach:** Swift Package (logic + UIKit views) in `ios/` subdirectory
**Dependencies:** M4 shared contract, JSON test fixtures

---

## 1. Package Structure

```
ios/SignalOverlay/
├── Package.swift                             # SPM manifest (GRDB dependency)
├── Sources/
│   ├── SignalOverlay/                        # Core logic library (no UIKit dep)
│   │   ├── Models/
│   │   │   ├── ThreadOverlay.swift           # GRDB PersistableRecord
│   │   │   ├── MessageOverlay.swift          # GRDB PersistableRecord
│   │   │   └── OverlaySyncState.swift        # GRDB PersistableRecord
│   │   ├── Services/
│   │   │   ├── MessageRefAdapter.swift       # Byte-identical ref derivation
│   │   │   ├── OverlayStore.swift            # GRDB CRUD + queries
│   │   │   ├── OverlaySchemaValidator.swift  # Port of TS validator
│   │   │   ├── OverlaySyncMerger.swift       # Conflict resolution
│   │   │   ├── OverlayEventBus.swift         # Combine-based pub/sub
│   │   │   └── OverlayUndoManager.swift      # Session-scoped stack (max 20)
│   │   ├── Store/
│   │   │   └── OverlayMigration.swift        # GRDB migration (overlay-v1)
│   │   └── OverlayFeatureFlag.swift          # UserDefaults-based flags
│   │
│   └── SignalOverlayUI/                      # UIKit views library
│       ├── ThreadChipRow.swift               # Horizontal chip scroll
│       ├── ThreadListViewController.swift    # Thread list panel
│       ├── ThreadCreateViewController.swift  # Create/assign dialog
│       ├── LabelEditorViewController.swift   # Label add/remove
│       ├── OverlayErrorBanner.swift          # Non-blocking error banner (8s)
│       ├── OverlayUndoToast.swift            # 5s undo toast
│       └── OverlayMenuActions.swift          # UIMenu provider for context menus
│
├── Tests/
│   ├── SignalOverlayTests/
│   │   ├── MessageRefAdapterTests.swift
│   │   ├── OverlayStoreTests.swift
│   │   ├── OverlaySchemaValidatorTests.swift
│   │   ├── OverlaySyncMergerTests.swift
│   │   ├── OverlayFeatureFlagTests.swift
│   │   ├── OverlayEventBusTests.swift
│   │   ├── OverlayUndoManagerTests.swift
│   │   └── ContractCompatibilityTests.swift  # Loads shared JSON fixtures
│   └── Fixtures/                             # Copies from ts/test-node/overlay/fixtures/
│       ├── thread-overlay-samples.json
│       ├── message-overlay-samples.json
│       ├── merge-conflict-cases.json
│       └── serialization-roundtrip.json
```

---

## 2. Data Layer

Matches M4 contract exactly. GRDB records with:

- **ThreadOverlay**: `is_pinned` stored as INTEGER 0|1, coerced to Bool at runtime
- **MessageOverlay**: `labels_json` stored as TEXT, decoded to `[String]` at runtime with `[]` fallback on parse error
- **OverlaySyncState**: local-only sync token persistence
- **OverlayMigration**: GRDB migration "overlay-v1" producing identical tables to desktop migration 1680
- **OverlayStore**: CRUD + query methods
  - Threads by conversation: `ORDER BY is_pinned DESC, updated_at DESC`
  - Messages by thread: `ORDER BY updated_at ASC`

Database isolation: separate `overlay.sqlite` file, NOT in Signal's main DB.

Fail-open: if overlay DB can't open, disable overlay features, log error, continue Signal normally.

---

## 3. MessageRefAdapter

Pure Swift, zero dependencies. Byte-identical output to `MessageRefAdapter.std.ts`:

```swift
enum MessageRefStrategy {
    case primary(ref: String)
    case fallback(ref: String)
    case none
}

struct MessageRefAdapter {
    static func deriveMessageRef(
        conversationId: String,
        signalMessageId: String?,
        senderAciOrId: String?,
        sentAtMs: Int?
    ) -> MessageRefStrategy

    static func isPrimaryRef(_ ref: String, conversationId: String) -> Bool
}
```

- Primary: `<conversationId>:<signalMessageId>`
- Fallback: `<conversationId>:<senderAciOrId>:<sentAtMs>`
- None: insufficient inputs

---

## 4. Conflict Resolution (OverlaySyncMerger)

Port of `OverlaySyncMerger.node.ts`:

1. Newer `updated_at` wins
2. Tie-break: higher `version` wins
3. Full tie: local wins

Validation gate: validate incoming records via OverlaySchemaValidator before merge. Invalid records logged and skipped.

---

## 5. Schema Validator

Port of `OverlaySchemaValidator.std.ts`. Same constraints:

- `thread_ref`, `conversation_ref`: non-empty strings
- `is_pinned`: boolean
- `updated_at`: non-negative integer
- `version`: positive integer >= 1
- `id`, `message_ref`: non-empty strings (MessageOverlay)
- `labels`: array of strings

---

## 6. Event Bus (Combine)

```swift
class OverlayEventBus {
    let threadsChanged = PassthroughSubject<Void, Never>()
    let messagesChanged = PassthroughSubject<Void, Never>()
    let labelsChanged = PassthroughSubject<Void, Never>()
    let syncStarted = PassthroughSubject<Void, Never>()
    let syncCompleted = PassthroughSubject<Void, Never>()
    let syncFailed = PassthroughSubject<Error, Never>()
}
```

---

## 7. Undo Manager

Session-scoped, max 20 entries. Thread-safe via serial DispatchQueue.

```swift
struct UndoEntry {
    let description: String
    let undoAction: () async throws -> Void
}

class OverlayUndoManager {
    func push(_ entry: UndoEntry)
    func undo() async throws -> UndoEntry?
    func clear()
    var canUndo: Bool { get }
    var lastDescription: String? { get }
}
```

---

## 8. Feature Flags

UserDefaults-based, matching desktop storage keys exactly:

| Flag | Key | Default | Depends On |
|---|---|---|---|
| Overlay threads | `overlayThreadsEnabled` | `false` | -- |
| Cloud sync | `overlayCloudSyncEnabled` | `false` | `overlayThreadsEnabled` |

Test overrides via static vars for unit tests.

---

## 9. UIKit Views

All programmatic layout. VoiceOver labels/traits on all interactive elements.

| Component | Description |
|---|---|
| `ThreadChipRow` | UIScrollView with horizontal chip buttons, "All" filter chip, pinned-first |
| `ThreadListViewController` | UITableViewController, empty state, error banner, pull-to-refresh placeholder |
| `ThreadCreateViewController` | Modal with title input, optional color, create/cancel actions |
| `LabelEditorViewController` | Modal with freeform input, existing labels as removable chips |
| `OverlayErrorBanner` | UIView banner, 8s auto-dismiss, VoiceOver announcement |
| `OverlayUndoToast` | UIView toast, 5s with undo button, VoiceOver announcement |
| `OverlayMenuActions` | Static factory returning UIMenu for message context menus |

---

## 10. Accessibility

- All buttons: `accessibilityLabel` + `.button` trait
- Error banner: `UIAccessibility.post(.announcement)`
- Modals: focus first input via `becomeFirstResponder`
- Undo toast: `.announcement` post
- Thread chips: `accessibilityLabel = "\(title), \(count) messages"`

---

## 11. Localization

`Localizable.strings` with `Overlay.*` key namespace (~35 strings matching desktop).

---

## 12. Tests

| Test Class | Strategy | Coverage |
|---|---|---|
| MessageRefAdapterTests | Direct assertions | primary, fallback, none, empty, isPrimaryRef |
| OverlayStoreTests | In-memory GRDB | CRUD roundtrip, query ordering, migration, corrupt labels |
| OverlaySchemaValidatorTests | Fixture-driven | All valid + invalid samples from shared JSON |
| OverlaySyncMergerTests | Fixture-driven | All conflict cases + deletion + validation gate |
| OverlayFeatureFlagTests | UserDefaults mock | Defaults, dependency chain, test overrides |
| OverlayEventBusTests | Combine expectations | Subscribe, emit, multiple subscribers |
| OverlayUndoManagerTests | Direct assertions | Push, undo, max capacity (20), clear |
| ContractCompatibilityTests | Fixture-driven | All 4 fixture files produce identical results |

---

## 13. Parity Map

| Feature | Desktop | iOS (M5) | Status |
|---|---|---|---|
| Thread CRUD | OverlayStore.node.ts | OverlayStore.swift | Parity |
| Message overlay CRUD | OverlayStore.node.ts | OverlayStore.swift | Parity |
| MessageRefAdapter | MessageRefAdapter.std.ts | MessageRefAdapter.swift | Parity |
| Feature flags | OverlayFeatureFlag.std.ts | OverlayFeatureFlag.swift | Parity |
| Schema validator | OverlaySchemaValidator.std.ts | OverlaySchemaValidator.swift | Parity |
| Conflict resolution | OverlaySyncMerger.node.ts | OverlaySyncMerger.swift | Parity |
| Event bus | OverlayEventBus.dom.ts | OverlayEventBus.swift (Combine) | Parity |
| Undo manager | OverlayUndoManager.dom.ts | OverlayUndoManager.swift | Parity |
| Thread chip row | ThreadChipRow.dom.tsx | ThreadChipRow.swift | Parity |
| Thread list panel | ThreadOverlayPanel.dom.tsx | ThreadListViewController.swift | Parity |
| Thread create | ThreadCreateDialog.dom.tsx | ThreadCreateViewController.swift | Parity |
| Label editor | LabelEditor.dom.tsx | LabelEditorViewController.swift | Parity |
| Error banner | OverlayErrorBanner.dom.tsx | OverlayErrorBanner.swift | Parity |
| Undo toast | OverlayUndoToast.dom.tsx | OverlayUndoToast.swift | Parity |
| Context menu | OverlayMenuActions.dom.tsx | OverlayMenuActions.swift | Parity |
| CloudKit sync engine | OverlaySyncEngine.node.ts | -- | Deferred M6 |
| Sync diagnostics UI | SyncDiagnosticsPanel.dom.tsx | -- | Deferred M6 |

---

## 14. Known Risks + Follow-Ups

1. **UIKit views are standalone** — will need adaptation when integrating into Signal-iOS's actual navigation/view hierarchy
2. **No host app for visual testing** — consider adding a minimal demo target in M6
3. **GRDB version pinning** — must match whatever Signal-iOS uses (currently unknown)
4. **CloudKit sync deferred** — sync engine, push/pull, diagnostics all M6 scope
5. **Localizable.strings format** — Signal-iOS may use a different localization system; strings may need format migration
