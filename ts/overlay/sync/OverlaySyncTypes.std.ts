// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// Shared types for overlay CloudKit sync (M3).
// Used by both main process (.node.ts) and shared modules (.std.ts).

import type {
  ThreadOverlayType,
  MessageOverlayType,
} from '../models/OverlayTypes.std.js';

// ─── Sync record types ──────────────────────────────────────────────────────

export type SyncRecordType = 'thread_overlay' | 'message_overlay';

export type ThreadSyncRecord = ThreadOverlayType & {
  readonly _type: 'thread_overlay';
  readonly _deleted?: boolean;
};

export type MessageSyncRecord = MessageOverlayType & {
  readonly _type: 'message_overlay';
  readonly _deleted?: boolean;
};

export type SyncRecord = ThreadSyncRecord | MessageSyncRecord;

// ─── Sync state ─────────────────────────────────────────────────────────────

export type OverlaySyncState = {
  device_id: string;
  last_sync_token: string | null;
  last_sync_at: number | null;
};

// ─── Sync status ────────────────────────────────────────────────────────────

export enum SyncStatus {
  Idle = 'idle',
  Syncing = 'syncing',
  Error = 'error',
}

export type SyncDiagnostics = {
  status: SyncStatus;
  lastSyncAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  threadsSynced: number;
  messagesSynced: number;
};

// ─── CloudKit configuration ─────────────────────────────────────────────────

export type CloudKitConfig = {
  containerIdentifier: string;
  apiToken: string;
  environment: 'development' | 'production';
};

// ─── Conflict resolution ────────────────────────────────────────────────────

export type ConflictResolution = 'keep_local' | 'keep_remote';

// ─── Fetch changes result ───────────────────────────────────────────────────

export type FetchChangesResult = {
  records: ReadonlyArray<SyncRecord>;
  newSyncToken: string;
  hasMore: boolean;
};

// ─── Push result ────────────────────────────────────────────────────────────

export type PushResult = {
  savedRecords: ReadonlyArray<SyncRecord>;
  failedRecords: ReadonlyArray<{
    record: SyncRecord;
    reason: string;
  }>;
};
