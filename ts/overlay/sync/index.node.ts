// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// Overlay sync module barrel exports.

export type {
  SyncRecord,
  ThreadSyncRecord,
  MessageSyncRecord,
  SyncRecordType,
  OverlaySyncState,
  SyncDiagnostics,
  CloudKitConfig,
  ConflictResolution,
  FetchChangesResult,
  PushResult,
} from './OverlaySyncTypes.std.js';

export { SyncStatus } from './OverlaySyncTypes.std.js';

export type { CloudKitAdapter } from './CloudKitAdapter.std.js';

export { resolveConflict, mergeRemoteRecords } from './OverlaySyncMerger.node.js';
export type { MergeResult } from './OverlaySyncMerger.node.js';

export { OverlaySyncEngine } from './OverlaySyncEngine.node.js';

export { CloudKitHttpClient } from './CloudKitHttpClient.node.js';

export {
  getThreadsDirtySince,
  getMessagesDirtySince,
  getSyncState,
  setSyncState,
} from './OverlaySyncStoreExtensions.node.js';
