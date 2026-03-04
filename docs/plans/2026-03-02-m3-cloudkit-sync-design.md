# M3 CloudKit Sync Design — Overlay Metadata

## Approach
CloudKit JS Web Services API (HTTP REST). Pure TypeScript, no native modules.
Abstracted behind `CloudKitAdapter` interface for testability and future backend swaps.

## Architecture

```
Renderer (DOM)
  SyncDiagnosticsPanel ←→ IPC ←→ Main Process
                                    OverlaySyncEngine
                                      ├─ OverlaySyncMerger (conflict resolution)
                                      ├─ CloudKitAdapter (interface)
                                      │   └─ CloudKitHttpClient (HTTP impl)
                                      └─ OverlayStore (existing + sync queries)
```

## Sync Flow
1. Load sync state (device_id, last_sync_token) from overlay_sync_state
2. PULL: fetchChanges(last_sync_token) → remote deltas
3. MERGE: for each remote record — updated_at wins, version tie-break
4. PUSH: getDirtySince(last_sync_at) → push local dirty records
5. SAVE: update sync state with new token + timestamp
6. On failure: log, retry with exponential backoff (1s→5min cap)

## Conflict Resolution
- remote.updated_at > local.updated_at → keep remote
- remote.updated_at < local.updated_at → keep local
- tie: remote.version > local.version → keep remote
- tie + same version: keep local

## Sync Schedule
- App start: initial sync after 5s delay
- Periodic: every 5 minutes
- On-demand: user "Sync Now" button
- After local writes: debounced 10s push

## Feature Flag
`overlayCloudSyncEnabled` (default OFF). Requires `overlayThreadsEnabled` to also be ON.

## New Files
- ts/overlay/sync/CloudKitAdapter.std.ts — interface
- ts/overlay/sync/CloudKitHttpClient.node.ts — HTTP implementation
- ts/overlay/sync/OverlaySyncEngine.node.ts — orchestrator
- ts/overlay/sync/OverlaySyncMerger.node.ts — conflict resolution
- ts/overlay/sync/OverlaySyncStoreExtensions.node.ts — delta query helpers
- ts/overlay/sync/OverlaySyncTypes.std.ts — shared types
- ts/overlay/sync/index.node.ts — barrel (node-only, re-exports concrete impls)
- ts/overlay/ui/SyncDiagnosticsPanel.dom.tsx — diagnostics UI
- ts/overlay/ui/styles/sync.scss — sync styles

## Modified Files
- ts/overlay/OverlayFeatureFlag.std.ts — +sync flag
- ts/overlay/services/OverlayEventBus.dom.ts — +sync events
- ts/overlay/index.std.ts — +sync flag exports
- ts/sql/Interface.std.ts — +sync method signatures + OverlaySyncState import
- ts/sql/Server.node.ts — +sync implementations + imports
- _locales/en/messages.json — +13 sync i18n keys

## Tests
- ts/test-node/overlay/OverlaySyncEngine_test.node.ts — engine lifecycle, sync cycle, error handling
- ts/test-node/overlay/OverlaySyncMerger_test.node.ts — conflict resolution, merge threads/messages
- ts/test-node/overlay/OverlaySyncStoreExtensions_test.node.ts — delta queries, sync state CRUD
- ts/test-node/overlay/OverlayCloudSyncFlag_test.node.ts — feature flag gating
