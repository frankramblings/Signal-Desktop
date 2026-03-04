// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// OverlaySyncMerger: conflict resolution logic for overlay sync.
// Policy: updated_at wins, tie-break by version. Local wins on full tie.

import type { WritableDB } from '../../sql/Interface.std.js';
import { sql } from '../../sql/util.std.js';
import type {
  SyncRecord,
  ThreadSyncRecord,
  MessageSyncRecord,
  ConflictResolution,
} from './OverlaySyncTypes.std.js';
import {
  getThreadOverlay,
  createThreadOverlay,
  updateThreadOverlay,
  deleteThreadOverlay,
  getMessageOverlayByRef,
  createMessageOverlay,
  updateMessageOverlay,
  deleteMessageOverlay,
} from '../store/OverlayStore.node.js';
import type {
  ThreadOverlayType,
  MessageOverlayType,
} from '../models/OverlayTypes.std.js';
import { validateSyncRecord } from '../contract/OverlaySchemaValidator.std.js';

// ─── Conflict resolution ────────────────────────────────────────────────────

export function resolveConflict(
  localUpdatedAt: number,
  localVersion: number,
  remoteUpdatedAt: number,
  remoteVersion: number
): ConflictResolution {
  if (remoteUpdatedAt > localUpdatedAt) {
    return 'keep_remote';
  }
  if (remoteUpdatedAt < localUpdatedAt) {
    return 'keep_local';
  }
  // Tie on updated_at: higher version wins
  if (remoteVersion > localVersion) {
    return 'keep_remote';
  }
  // Full tie or local version higher: local wins
  return 'keep_local';
}

// ─── Merge remote records into local DB ─────────────────────────────────────

export type MergeResult = {
  threadsInserted: number;
  threadsUpdated: number;
  threadsDeleted: number;
  messagesInserted: number;
  messagesUpdated: number;
  messagesDeleted: number;
  conflictsResolved: number;
};

export function mergeRemoteRecords(
  db: WritableDB,
  records: ReadonlyArray<SyncRecord>
): MergeResult {
  const result: MergeResult = {
    threadsInserted: 0,
    threadsUpdated: 0,
    threadsDeleted: 0,
    messagesInserted: 0,
    messagesUpdated: 0,
    messagesDeleted: 0,
    conflictsResolved: 0,
  };

  for (const record of records) {
    const validation = validateSyncRecord(record);
    if (!validation.valid) {
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

  return result;
}

function mergeThreadRecord(
  db: WritableDB,
  remote: ThreadSyncRecord,
  result: MergeResult
): void {
  const local: ThreadOverlayType | undefined = getThreadOverlay(
    db,
    remote.thread_ref
  );

  if (remote._deleted) {
    if (local) {
      deleteThreadOverlay(db, remote.thread_ref);
      result.threadsDeleted += 1;
    }
    return;
  }

  if (!local) {
    // No local record — insert from remote
    createThreadOverlay(db, {
      thread_ref: remote.thread_ref,
      conversation_ref: remote.conversation_ref,
      title: remote.title,
      color: remote.color,
      is_pinned: remote.is_pinned,
    });
    // Overwrite the auto-generated updated_at/version with remote values
    upsertThreadTimestamps(db, remote.thread_ref, remote.updated_at, remote.version);
    result.threadsInserted += 1;
    return;
  }

  // Both exist — resolve conflict
  const resolution = resolveConflict(
    local.updated_at,
    local.version,
    remote.updated_at,
    remote.version
  );
  result.conflictsResolved += 1;

  if (resolution === 'keep_remote') {
    updateThreadOverlay(db, remote.thread_ref, {
      title: remote.title,
      color: remote.color,
      is_pinned: remote.is_pinned,
    });
    // Override timestamps with remote values
    upsertThreadTimestamps(db, remote.thread_ref, remote.updated_at, remote.version);
    result.threadsUpdated += 1;
  }
  // keep_local: no action needed
}

function mergeMessageRecord(
  db: WritableDB,
  remote: MessageSyncRecord,
  result: MergeResult
): void {
  const local: MessageOverlayType | undefined = getMessageOverlayByRef(
    db,
    remote.message_ref
  );

  if (remote._deleted) {
    if (local) {
      deleteMessageOverlay(db, remote.message_ref);
      result.messagesDeleted += 1;
    }
    return;
  }

  if (!local) {
    createMessageOverlay(db, {
      id: remote.id,
      message_ref: remote.message_ref,
      conversation_ref: remote.conversation_ref,
      thread_ref: remote.thread_ref,
      labels: remote.labels,
      note: remote.note,
    });
    upsertMessageTimestamps(db, remote.message_ref, remote.updated_at, remote.version);
    result.messagesInserted += 1;
    return;
  }

  const resolution = resolveConflict(
    local.updated_at,
    local.version,
    remote.updated_at,
    remote.version
  );
  result.conflictsResolved += 1;

  if (resolution === 'keep_remote') {
    updateMessageOverlay(db, remote.message_ref, {
      thread_ref: remote.thread_ref,
      labels: [...remote.labels],
      note: remote.note,
    });
    upsertMessageTimestamps(db, remote.message_ref, remote.updated_at, remote.version);
    result.messagesUpdated += 1;
  }
}

// ─── Timestamp overwrite helpers ────────────────────────────────────────────
// After a create/update via OverlayStore, override timestamps with remote
// values to preserve sync consistency.

function upsertThreadTimestamps(
  db: WritableDB,
  threadRef: string,
  updatedAt: number,
  version: number
): void {
  const [query, params] = sql`
    UPDATE thread_overlay SET updated_at = ${updatedAt}, version = ${version}
    WHERE thread_ref = ${threadRef};
  `;
  db.prepare(query).run(params);
}

function upsertMessageTimestamps(
  db: WritableDB,
  messageRef: string,
  updatedAt: number,
  version: number
): void {
  const [query, params] = sql`
    UPDATE message_overlay SET updated_at = ${updatedAt}, version = ${version}
    WHERE message_ref = ${messageRef};
  `;
  db.prepare(query).run(params);
}
