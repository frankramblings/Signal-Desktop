// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { createDB, updateToVersion } from './helpers.node.js';
import type { WritableDB } from '../../sql/Interface.std.js';

describe('SQL/updateToSchemaVersion1680', () => {
  let db: WritableDB;

  beforeEach(() => {
    db = createDB();
    updateToVersion(db, 1670);
  });

  afterEach(() => {
    db.close();
  });

  it('creates thread_overlay table with correct columns', () => {
    updateToVersion(db, 1680);

    const info = db
      .prepare("SELECT name FROM pragma_table_info('thread_overlay') ORDER BY cid;")
      .all<{ name: string }>();

    const columns = info.map(r => r.name);
    assert.includeMembers(columns, [
      'thread_ref',
      'conversation_ref',
      'title',
      'color',
      'is_pinned',
      'updated_at',
      'version',
    ]);
  });

  it('creates message_overlay table with correct columns', () => {
    updateToVersion(db, 1680);

    const info = db
      .prepare("SELECT name FROM pragma_table_info('message_overlay') ORDER BY cid;")
      .all<{ name: string }>();

    const columns = info.map(r => r.name);
    assert.includeMembers(columns, [
      'id',
      'message_ref',
      'conversation_ref',
      'thread_ref',
      'labels_json',
      'note',
      'updated_at',
      'version',
    ]);
  });

  it('creates overlay_sync_state table', () => {
    updateToVersion(db, 1680);

    const info = db
      .prepare("SELECT name FROM pragma_table_info('overlay_sync_state') ORDER BY cid;")
      .all<{ name: string }>();

    const columns = info.map(r => r.name);
    assert.includeMembers(columns, ['device_id', 'last_sync_token', 'last_sync_at']);
  });

  it('creates required indexes', () => {
    updateToVersion(db, 1680);

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%overlay%' ORDER BY name;"
      )
      .all<{ name: string }>()
      .map(r => r.name);

    assert.includeMembers(indexes, [
      'idx_message_overlay_conversation_ref',
      'idx_message_overlay_thread_ref',
      'idx_thread_overlay_conversation_ref',
      'idx_thread_overlay_updated_at',
    ]);
  });

  it('can insert and retrieve a thread_overlay row', () => {
    updateToVersion(db, 1680);

    db.prepare(`
      INSERT INTO thread_overlay
        (thread_ref, conversation_ref, title, color, is_pinned, updated_at, version)
      VALUES
        ('tref1', 'conv1', 'My Thread', NULL, 0, 1700000000000, 1);
    `).run();

    const row = db
      .prepare('SELECT * FROM thread_overlay WHERE thread_ref = ?')
      .get<{ thread_ref: string; title: string; is_pinned: number }>('tref1');

    assert.ok(row);
    assert.equal(row?.thread_ref, 'tref1');
    assert.equal(row?.title, 'My Thread');
    assert.equal(row?.is_pinned, 0);
  });

  it('enforces UNIQUE constraint on message_overlay.message_ref', () => {
    updateToVersion(db, 1680);

    const insert = db.prepare(`
      INSERT INTO message_overlay
        (id, message_ref, conversation_ref, labels_json, updated_at, version)
      VALUES (?, ?, ?, '[]', 1700000000000, 1);
    `);

    insert.run('id1', 'mref1', 'conv1');

    assert.throws(() => {
      insert.run('id2', 'mref1', 'conv1'); // duplicate message_ref
    });
  });
});
