// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// Overlay M0: create local metadata overlay tables for thread grouping,
// labeling, pinning, and notes. These tables store only user-authored
// metadata — never Signal message bodies or protocol data.

import type { WritableDB } from '../Interface.std.js';
import { sql } from '../util.std.js';

export default function updateToSchemaVersion1680(db: WritableDB): void {
  const [query] = sql`
    CREATE TABLE thread_overlay (
      thread_ref       TEXT NOT NULL PRIMARY KEY,
      conversation_ref TEXT NOT NULL,
      title            TEXT,
      color            TEXT,
      is_pinned        INTEGER NOT NULL DEFAULT 0,
      updated_at       INTEGER NOT NULL,
      version          INTEGER NOT NULL DEFAULT 1
    ) STRICT;

    CREATE TABLE message_overlay (
      id               TEXT NOT NULL PRIMARY KEY,
      message_ref      TEXT NOT NULL UNIQUE,
      conversation_ref TEXT NOT NULL,
      thread_ref       TEXT,
      labels_json      TEXT NOT NULL DEFAULT '[]',
      note             TEXT,
      updated_at       INTEGER NOT NULL,
      version          INTEGER NOT NULL DEFAULT 1
    ) STRICT;

    -- overlay_sync_state is reserved for v2 CloudKit sync; created now so
    -- the schema migration is complete and forward-compatible.
    CREATE TABLE overlay_sync_state (
      device_id      TEXT NOT NULL PRIMARY KEY,
      last_sync_token TEXT,
      last_sync_at    INTEGER
    ) STRICT;

    CREATE INDEX idx_message_overlay_conversation_ref
      ON message_overlay (conversation_ref);

    CREATE INDEX idx_message_overlay_thread_ref
      ON message_overlay (thread_ref);

    CREATE INDEX idx_thread_overlay_conversation_ref
      ON thread_overlay (conversation_ref);

    CREATE INDEX idx_thread_overlay_updated_at
      ON thread_overlay (updated_at);
  `;

  db.exec(query);
}
