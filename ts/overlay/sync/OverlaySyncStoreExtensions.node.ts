// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// Sync-specific query extensions for the overlay store.
// These functions are separate from OverlayStore.node.ts to keep M3
// additions isolated and avoid modifying the M0/M1 store module.

import type { ReadableDB, WritableDB } from '../../sql/Interface.std.js';
import { sql } from '../../sql/util.std.js';
import type {
  ThreadOverlayType,
  MessageOverlayType,
  ThreadOverlayRow,
  MessageOverlayRow,
} from '../models/OverlayTypes.std.js';
import type { OverlaySyncState } from './OverlaySyncTypes.std.js';

// ─── Row conversion (duplicated from OverlayStore to avoid circular deps) ──

function rowToThread(row: ThreadOverlayRow): ThreadOverlayType {
  return {
    thread_ref: row.thread_ref,
    conversation_ref: row.conversation_ref,
    title: row.title,
    color: row.color,
    is_pinned: row.is_pinned === 1,
    updated_at: row.updated_at,
    version: row.version,
  };
}

function rowToMessage(row: MessageOverlayRow): MessageOverlayType {
  let labels: ReadonlyArray<string>;
  try {
    labels = JSON.parse(row.labels_json) as ReadonlyArray<string>;
  } catch {
    labels = [];
  }
  return {
    id: row.id,
    message_ref: row.message_ref,
    conversation_ref: row.conversation_ref,
    thread_ref: row.thread_ref,
    labels,
    note: row.note,
    updated_at: row.updated_at,
    version: row.version,
  };
}

// ─── Delta queries ──────────────────────────────────────────────────────────

export function getThreadsDirtySince(
  db: ReadableDB,
  sinceTimestamp: number
): ReadonlyArray<ThreadOverlayType> {
  const [query, params] = sql`
    SELECT * FROM thread_overlay
    WHERE updated_at > ${sinceTimestamp}
    ORDER BY updated_at ASC;
  `;
  const rows = db.prepare(query).all<ThreadOverlayRow>(params);
  return rows.map(rowToThread);
}

export function getMessagesDirtySince(
  db: ReadableDB,
  sinceTimestamp: number
): ReadonlyArray<MessageOverlayType> {
  const [query, params] = sql`
    SELECT * FROM message_overlay
    WHERE updated_at > ${sinceTimestamp}
    ORDER BY updated_at ASC;
  `;
  const rows = db.prepare(query).all<MessageOverlayRow>(params);
  return rows.map(rowToMessage);
}

// ─── Sync state persistence ─────────────────────────────────────────────────

export function getSyncState(
  db: ReadableDB,
  deviceId: string
): OverlaySyncState | undefined {
  const [query, params] = sql`
    SELECT * FROM overlay_sync_state WHERE device_id = ${deviceId};
  `;
  const row = db
    .prepare(query)
    .get<{ device_id: string; last_sync_token: string | null; last_sync_at: number | null }>(params);
  if (!row) {
    return undefined;
  }
  return {
    device_id: row.device_id,
    last_sync_token: row.last_sync_token,
    last_sync_at: row.last_sync_at,
  };
}

export function setSyncState(
  db: WritableDB,
  state: OverlaySyncState
): void {
  const [query, params] = sql`
    INSERT INTO overlay_sync_state (device_id, last_sync_token, last_sync_at)
    VALUES (${state.device_id}, ${state.last_sync_token}, ${state.last_sync_at})
    ON CONFLICT(device_id) DO UPDATE SET
      last_sync_token = ${state.last_sync_token},
      last_sync_at = ${state.last_sync_at};
  `;
  db.prepare(query).run(params);
}

export function getAllSyncStates(
  db: ReadableDB
): ReadonlyArray<OverlaySyncState> {
  const [query] = sql`SELECT * FROM overlay_sync_state;`;
  const rows = db
    .prepare(query)
    .all<{ device_id: string; last_sync_token: string | null; last_sync_at: number | null }>();
  return rows.map(row => ({
    device_id: row.device_id,
    last_sync_token: row.last_sync_token,
    last_sync_at: row.last_sync_at,
  }));
}
