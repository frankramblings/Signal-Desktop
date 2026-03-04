// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// OverlayStore: SQLite CRUD operations for overlay metadata tables.
// Runs in the main Node process only (.node.ts) because it accesses the DB.
//
// Design: stateless functions that receive a WritableDB/ReadableDB instance.
// This makes each function independently testable and keeps state in the DB.

import { v4 as generateUuid } from 'uuid';
import type { ReadableDB, WritableDB } from '../../sql/Interface.std.js';
import { sql } from '../../sql/util.std.js';
import type {
  ThreadOverlayType,
  MessageOverlayType,
  ThreadOverlayRow,
  MessageOverlayRow,
  CreateThreadOverlayInput,
  UpdateThreadOverlayInput,
  CreateMessageOverlayInput,
  UpdateMessageOverlayInput,
} from '../models/OverlayTypes.std.js';

// ─── Conversion helpers ────────────────────────────────────────────────────

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

// ─── Thread overlay CRUD ───────────────────────────────────────────────────

export function createThreadOverlay(
  db: WritableDB,
  input: CreateThreadOverlayInput
): ThreadOverlayType {
  const now = Date.now();
  const row: ThreadOverlayRow = {
    thread_ref: input.thread_ref,
    conversation_ref: input.conversation_ref,
    title: input.title ?? null,
    color: input.color ?? null,
    is_pinned: input.is_pinned ? 1 : 0,
    updated_at: now,
    version: 1,
  };

  const [query, params] = sql`
    INSERT INTO thread_overlay
      (thread_ref, conversation_ref, title, color, is_pinned, updated_at, version)
    VALUES
      (${row.thread_ref}, ${row.conversation_ref}, ${row.title}, ${row.color},
       ${row.is_pinned}, ${row.updated_at}, ${row.version});
  `;
  db.prepare(query).run(params);

  return rowToThread(row);
}

export function getThreadOverlay(
  db: ReadableDB,
  threadRef: string
): ThreadOverlayType | undefined {
  const [query, params] = sql`
    SELECT * FROM thread_overlay WHERE thread_ref = ${threadRef};
  `;
  const row = db.prepare(query).get<ThreadOverlayRow>(params);
  return row ? rowToThread(row) : undefined;
}

export function getThreadsByConversation(
  db: ReadableDB,
  conversationRef: string
): ReadonlyArray<ThreadOverlayType> {
  const [query, params] = sql`
    SELECT * FROM thread_overlay
    WHERE conversation_ref = ${conversationRef}
    ORDER BY is_pinned DESC, updated_at DESC;
  `;
  const rows = db.prepare(query).all<ThreadOverlayRow>(params);
  return rows.map(rowToThread);
}

export function updateThreadOverlay(
  db: WritableDB,
  threadRef: string,
  updates: UpdateThreadOverlayInput
): boolean {
  const existing = getThreadOverlay(db, threadRef);
  if (!existing) {
    return false;
  }

  const title = 'title' in updates ? (updates.title ?? null) : existing.title;
  const color = 'color' in updates ? (updates.color ?? null) : existing.color;
  const is_pinned =
    'is_pinned' in updates
      ? (updates.is_pinned ? 1 : 0)
      : (existing.is_pinned ? 1 : 0);
  const updated_at = Date.now();
  const version = existing.version + 1;

  const [query, params] = sql`
    UPDATE thread_overlay
    SET title = ${title}, color = ${color}, is_pinned = ${is_pinned},
        updated_at = ${updated_at}, version = ${version}
    WHERE thread_ref = ${threadRef};
  `;
  const result = db.prepare(query).run(params);
  return result.changes > 0;
}

export function deleteThreadOverlay(
  db: WritableDB,
  threadRef: string
): boolean {
  // Also clear thread associations on message overlays (soft remove).
  const [unlinkQuery, unlinkParams] = sql`
    UPDATE message_overlay SET thread_ref = NULL
    WHERE thread_ref = ${threadRef};
  `;
  db.prepare(unlinkQuery).run(unlinkParams);

  const [query, params] = sql`
    DELETE FROM thread_overlay WHERE thread_ref = ${threadRef};
  `;
  const result = db.prepare(query).run(params);
  return result.changes > 0;
}

// ─── Message overlay CRUD ─────────────────────────────────────────────────

export function createMessageOverlay(
  db: WritableDB,
  input: CreateMessageOverlayInput
): MessageOverlayType {
  const now = Date.now();
  const row: MessageOverlayRow = {
    id: input.id || generateUuid(),
    message_ref: input.message_ref,
    conversation_ref: input.conversation_ref,
    thread_ref: input.thread_ref ?? null,
    labels_json: JSON.stringify(input.labels ?? []),
    note: input.note ?? null,
    updated_at: now,
    version: 1,
  };

  const [query, params] = sql`
    INSERT INTO message_overlay
      (id, message_ref, conversation_ref, thread_ref, labels_json, note,
       updated_at, version)
    VALUES
      (${row.id}, ${row.message_ref}, ${row.conversation_ref},
       ${row.thread_ref}, ${row.labels_json}, ${row.note},
       ${row.updated_at}, ${row.version});
  `;
  db.prepare(query).run(params);

  return rowToMessage(row);
}

export function getMessageOverlayByRef(
  db: ReadableDB,
  messageRef: string
): MessageOverlayType | undefined {
  const [query, params] = sql`
    SELECT * FROM message_overlay WHERE message_ref = ${messageRef};
  `;
  const row = db.prepare(query).get<MessageOverlayRow>(params);
  return row ? rowToMessage(row) : undefined;
}

export function getMessageOverlayById(
  db: ReadableDB,
  id: string
): MessageOverlayType | undefined {
  const [query, params] = sql`
    SELECT * FROM message_overlay WHERE id = ${id};
  `;
  const row = db.prepare(query).get<MessageOverlayRow>(params);
  return row ? rowToMessage(row) : undefined;
}

export function getMessageOverlaysByThread(
  db: ReadableDB,
  threadRef: string
): ReadonlyArray<MessageOverlayType> {
  const [query, params] = sql`
    SELECT * FROM message_overlay
    WHERE thread_ref = ${threadRef}
    ORDER BY updated_at ASC;
  `;
  const rows = db.prepare(query).all<MessageOverlayRow>(params);
  return rows.map(rowToMessage);
}

export function updateMessageOverlay(
  db: WritableDB,
  messageRef: string,
  updates: UpdateMessageOverlayInput
): boolean {
  const existing = getMessageOverlayByRef(db, messageRef);
  if (!existing) {
    return false;
  }

  const thread_ref =
    'thread_ref' in updates ? (updates.thread_ref ?? null) : existing.thread_ref;
  const labels_json = JSON.stringify(
    'labels' in updates ? (updates.labels ?? []) : existing.labels
  );
  const note = 'note' in updates ? (updates.note ?? null) : existing.note;
  const updated_at = Date.now();
  const version = existing.version + 1;

  const [query, params] = sql`
    UPDATE message_overlay
    SET thread_ref = ${thread_ref}, labels_json = ${labels_json},
        note = ${note}, updated_at = ${updated_at}, version = ${version}
    WHERE message_ref = ${messageRef};
  `;
  const result = db.prepare(query).run(params);
  return result.changes > 0;
}

export function deleteMessageOverlay(
  db: WritableDB,
  messageRef: string
): boolean {
  const [query, params] = sql`
    DELETE FROM message_overlay WHERE message_ref = ${messageRef};
  `;
  const result = db.prepare(query).run(params);
  return result.changes > 0;
}
