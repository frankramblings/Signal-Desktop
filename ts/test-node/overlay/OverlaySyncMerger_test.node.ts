// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import { v4 as generateUuid } from 'uuid';

import { createDB, updateToVersion } from '../sql/helpers.node.js';
import type { WritableDB } from '../../sql/Interface.std.js';
import {
  resolveConflict,
  mergeRemoteRecords,
} from '../../overlay/sync/OverlaySyncMerger.node.js';
import type {
  ThreadSyncRecord,
  MessageSyncRecord,
} from '../../overlay/sync/OverlaySyncTypes.std.js';
import {
  createThreadOverlay,
  getThreadOverlay,
  createMessageOverlay,
  getMessageOverlayByRef,
} from '../../overlay/store/OverlayStore.node.js';

describe('overlay/sync/OverlaySyncMerger', () => {
  let db: WritableDB;

  beforeEach(() => {
    db = createDB();
    updateToVersion(db, 1680);
  });

  afterEach(() => {
    db.close();
  });

  // ─── resolveConflict ──────────────────────────────────────────────────

  describe('resolveConflict', () => {
    it('keeps remote when remote updated_at is newer', () => {
      assert.equal(
        resolveConflict(1000, 1, 2000, 1),
        'keep_remote'
      );
    });

    it('keeps local when local updated_at is newer', () => {
      assert.equal(
        resolveConflict(2000, 1, 1000, 1),
        'keep_local'
      );
    });

    it('tie-breaks on version: higher version wins', () => {
      assert.equal(
        resolveConflict(1000, 1, 1000, 2),
        'keep_remote'
      );
      assert.equal(
        resolveConflict(1000, 3, 1000, 2),
        'keep_local'
      );
    });

    it('full tie: local wins', () => {
      assert.equal(
        resolveConflict(1000, 1, 1000, 1),
        'keep_local'
      );
    });
  });

  // ─── mergeRemoteRecords: threads ──────────────────────────────────────

  describe('mergeRemoteRecords — threads', () => {
    it('inserts new remote thread when no local exists', () => {
      const remote: ThreadSyncRecord = {
        _type: 'thread_overlay',
        thread_ref: 'remote-t1',
        conversation_ref: 'conv-1',
        title: 'Remote Thread',
        color: null,
        is_pinned: false,
        updated_at: 5000,
        version: 1,
      };

      const result = mergeRemoteRecords(db, [remote]);
      assert.equal(result.threadsInserted, 1);

      const local = getThreadOverlay(db, 'remote-t1');
      assert.ok(local);
      assert.equal(local!.title, 'Remote Thread');
      assert.equal(local!.updated_at, 5000);
      assert.equal(local!.version, 1);
    });

    it('updates local thread when remote is newer', () => {
      createThreadOverlay(db, {
        thread_ref: 'shared-t1',
        conversation_ref: 'conv-1',
        title: 'Local Title',
      });
      // Override timestamp to something older
      db.prepare(
        'UPDATE thread_overlay SET updated_at = 1000, version = 1 WHERE thread_ref = ?'
      ).run('shared-t1');

      const remote: ThreadSyncRecord = {
        _type: 'thread_overlay',
        thread_ref: 'shared-t1',
        conversation_ref: 'conv-1',
        title: 'Remote Title',
        color: '#ff0000',
        is_pinned: true,
        updated_at: 3000,
        version: 2,
      };

      const result = mergeRemoteRecords(db, [remote]);
      assert.equal(result.threadsUpdated, 1);
      assert.equal(result.conflictsResolved, 1);

      const local = getThreadOverlay(db, 'shared-t1');
      assert.equal(local!.title, 'Remote Title');
      assert.equal(local!.color, '#ff0000');
      assert.isTrue(local!.is_pinned);
    });

    it('keeps local thread when local is newer', () => {
      createThreadOverlay(db, {
        thread_ref: 'shared-t2',
        conversation_ref: 'conv-1',
        title: 'Local Newer',
      });
      db.prepare(
        'UPDATE thread_overlay SET updated_at = 5000, version = 3 WHERE thread_ref = ?'
      ).run('shared-t2');

      const remote: ThreadSyncRecord = {
        _type: 'thread_overlay',
        thread_ref: 'shared-t2',
        conversation_ref: 'conv-1',
        title: 'Remote Older',
        color: null,
        is_pinned: false,
        updated_at: 2000,
        version: 1,
      };

      const result = mergeRemoteRecords(db, [remote]);
      assert.equal(result.conflictsResolved, 1);
      assert.equal(result.threadsUpdated, 0);

      const local = getThreadOverlay(db, 'shared-t2');
      assert.equal(local!.title, 'Local Newer');
    });

    it('deletes local thread when remote is deleted', () => {
      createThreadOverlay(db, {
        thread_ref: 'del-t1',
        conversation_ref: 'conv-1',
        title: 'To Delete',
      });

      const remote: ThreadSyncRecord = {
        _type: 'thread_overlay',
        _deleted: true,
        thread_ref: 'del-t1',
        conversation_ref: '',
        title: null,
        color: null,
        is_pinned: false,
        updated_at: 0,
        version: 0,
      };

      const result = mergeRemoteRecords(db, [remote]);
      assert.equal(result.threadsDeleted, 1);
      assert.isUndefined(getThreadOverlay(db, 'del-t1'));
    });
  });

  // ─── mergeRemoteRecords: messages ─────────────────────────────────────

  describe('mergeRemoteRecords — messages', () => {
    it('inserts new remote message overlay', () => {
      const id = generateUuid();
      const remote: MessageSyncRecord = {
        _type: 'message_overlay',
        id,
        message_ref: 'conv-1:msg-1',
        conversation_ref: 'conv-1',
        thread_ref: null,
        labels: ['hiring'],
        note: 'remote note',
        updated_at: 4000,
        version: 1,
      };

      const result = mergeRemoteRecords(db, [remote]);
      assert.equal(result.messagesInserted, 1);

      const local = getMessageOverlayByRef(db, 'conv-1:msg-1');
      assert.ok(local);
      assert.deepEqual([...local!.labels], ['hiring']);
      assert.equal(local!.note, 'remote note');
    });

    it('updates local message when remote is newer', () => {
      createMessageOverlay(db, {
        id: 'msg-id-1',
        message_ref: 'conv-1:msg-2',
        conversation_ref: 'conv-1',
        labels: ['old'],
        note: 'old note',
      });
      db.prepare(
        'UPDATE message_overlay SET updated_at = 1000, version = 1 WHERE message_ref = ?'
      ).run('conv-1:msg-2');

      const remote: MessageSyncRecord = {
        _type: 'message_overlay',
        id: 'msg-id-1',
        message_ref: 'conv-1:msg-2',
        conversation_ref: 'conv-1',
        thread_ref: 'thread-1',
        labels: ['new', 'updated'],
        note: 'new note',
        updated_at: 5000,
        version: 3,
      };

      const result = mergeRemoteRecords(db, [remote]);
      assert.equal(result.messagesUpdated, 1);

      const local = getMessageOverlayByRef(db, 'conv-1:msg-2');
      assert.deepEqual([...local!.labels], ['new', 'updated']);
      assert.equal(local!.note, 'new note');
      assert.equal(local!.thread_ref, 'thread-1');
    });

    it('deletes local message when remote is deleted', () => {
      createMessageOverlay(db, {
        id: 'msg-id-del',
        message_ref: 'conv-1:msg-del',
        conversation_ref: 'conv-1',
      });

      const remote: MessageSyncRecord = {
        _type: 'message_overlay',
        _deleted: true,
        id: 'msg-id-del',
        message_ref: 'conv-1:msg-del',
        conversation_ref: '',
        thread_ref: null,
        labels: [],
        note: null,
        updated_at: 0,
        version: 0,
      };

      const result = mergeRemoteRecords(db, [remote]);
      assert.equal(result.messagesDeleted, 1);
      assert.isUndefined(getMessageOverlayByRef(db, 'conv-1:msg-del'));
    });
  });
});
