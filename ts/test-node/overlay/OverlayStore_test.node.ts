// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import { v4 as generateUuid } from 'uuid';

import { createDB, updateToVersion } from '../sql/helpers.node.js';
import type { WritableDB } from '../../sql/Interface.std.js';
import {
  createThreadOverlay,
  getThreadOverlay,
  getThreadsByConversation,
  updateThreadOverlay,
  deleteThreadOverlay,
  createMessageOverlay,
  getMessageOverlayByRef,
  getMessageOverlaysByThread,
  updateMessageOverlay,
  deleteMessageOverlay,
} from '../../overlay/store/OverlayStore.node.js';

describe('overlay/OverlayStore', () => {
  let db: WritableDB;

  beforeEach(() => {
    db = createDB();
    updateToVersion(db, 1680);
  });

  afterEach(() => {
    db.close();
  });

  // ─── Thread overlay ──────────────────────────────────────────────────────

  describe('createThreadOverlay', () => {
    it('inserts a thread and returns it', () => {
      const thread = createThreadOverlay(db, {
        thread_ref: 'tref-1',
        conversation_ref: 'conv-1',
        title: 'Design Sync',
        is_pinned: false,
      });

      assert.equal(thread.thread_ref, 'tref-1');
      assert.equal(thread.title, 'Design Sync');
      assert.isFalse(thread.is_pinned);
      assert.equal(thread.version, 1);
    });

    it('defaults is_pinned to false and version to 1', () => {
      const thread = createThreadOverlay(db, {
        thread_ref: 'tref-2',
        conversation_ref: 'conv-1',
      });
      assert.isFalse(thread.is_pinned);
      assert.equal(thread.version, 1);
    });
  });

  describe('getThreadOverlay', () => {
    it('returns the thread by ref', () => {
      createThreadOverlay(db, { thread_ref: 'tref-3', conversation_ref: 'conv-1' });
      const found = getThreadOverlay(db, 'tref-3');
      assert.ok(found);
      assert.equal(found?.thread_ref, 'tref-3');
    });

    it('returns undefined for unknown ref', () => {
      assert.isUndefined(getThreadOverlay(db, 'no-such-ref'));
    });
  });

  describe('getThreadsByConversation', () => {
    it('returns threads ordered pinned-first, then by updated_at desc', () => {
      createThreadOverlay(db, {
        thread_ref: 'tref-a',
        conversation_ref: 'conv-2',
        title: 'A',
        is_pinned: false,
      });
      createThreadOverlay(db, {
        thread_ref: 'tref-b',
        conversation_ref: 'conv-2',
        title: 'B',
        is_pinned: true,
      });

      const threads = getThreadsByConversation(db, 'conv-2');
      assert.equal(threads.length, 2);
      assert.equal(threads[0].thread_ref, 'tref-b'); // pinned first
    });

    it('returns empty array for unknown conversation', () => {
      const threads = getThreadsByConversation(db, 'conv-nonexistent');
      assert.deepEqual(threads, []);
    });
  });

  describe('updateThreadOverlay', () => {
    it('updates title and increments version', () => {
      createThreadOverlay(db, { thread_ref: 'tref-4', conversation_ref: 'conv-1' });
      const ok = updateThreadOverlay(db, 'tref-4', { title: 'Updated Title' });
      assert.isTrue(ok);

      const updated = getThreadOverlay(db, 'tref-4');
      assert.equal(updated?.title, 'Updated Title');
      assert.equal(updated?.version, 2);
    });

    it('returns false for unknown ref', () => {
      assert.isFalse(updateThreadOverlay(db, 'no-thread', { title: 'x' }));
    });
  });

  describe('deleteThreadOverlay', () => {
    it('deletes a thread and unlinks associated messages', () => {
      createThreadOverlay(db, { thread_ref: 'tref-5', conversation_ref: 'conv-1' });
      const msgRef = 'conv-1:msg-uuid-001';
      createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: msgRef,
        conversation_ref: 'conv-1',
        thread_ref: 'tref-5',
      });

      const deleted = deleteThreadOverlay(db, 'tref-5');
      assert.isTrue(deleted);
      assert.isUndefined(getThreadOverlay(db, 'tref-5'));

      const msg = getMessageOverlayByRef(db, msgRef);
      assert.ok(msg);
      assert.isNull(msg?.thread_ref); // unlinked
    });

    it('returns false for unknown ref', () => {
      assert.isFalse(deleteThreadOverlay(db, 'no-thread'));
    });
  });

  // ─── Message overlay ─────────────────────────────────────────────────────

  describe('createMessageOverlay', () => {
    it('inserts and returns a message overlay', () => {
      const msg = createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: 'conv-1:msg-uuid-002',
        conversation_ref: 'conv-1',
        labels: ['hiring', 'urgent'],
        note: 'Follow up',
      });

      assert.equal(msg.message_ref, 'conv-1:msg-uuid-002');
      assert.deepEqual(msg.labels, ['hiring', 'urgent']);
      assert.equal(msg.note, 'Follow up');
      assert.equal(msg.version, 1);
    });

    it('defaults labels to [] and note to null', () => {
      const msg = createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: 'conv-1:msg-uuid-003',
        conversation_ref: 'conv-1',
      });
      assert.deepEqual(msg.labels, []);
      assert.isNull(msg.note);
    });
  });

  describe('getMessageOverlayByRef', () => {
    it('returns message by message_ref', () => {
      const id = generateUuid();
      createMessageOverlay(db, {
        id,
        message_ref: 'conv-1:msg-uuid-004',
        conversation_ref: 'conv-1',
      });
      const found = getMessageOverlayByRef(db, 'conv-1:msg-uuid-004');
      assert.ok(found);
      assert.equal(found?.id, id);
    });

    it('returns undefined for unknown ref', () => {
      assert.isUndefined(getMessageOverlayByRef(db, 'no-ref'));
    });
  });

  describe('getMessageOverlaysByThread', () => {
    it('returns messages belonging to a thread', () => {
      createThreadOverlay(db, { thread_ref: 'tref-6', conversation_ref: 'conv-3' });

      createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: 'conv-3:msg-001',
        conversation_ref: 'conv-3',
        thread_ref: 'tref-6',
      });
      createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: 'conv-3:msg-002',
        conversation_ref: 'conv-3',
        thread_ref: 'tref-6',
      });
      createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: 'conv-3:msg-003',
        conversation_ref: 'conv-3',
        // no thread
      });

      const msgs = getMessageOverlaysByThread(db, 'tref-6');
      assert.equal(msgs.length, 2);
    });
  });

  describe('updateMessageOverlay', () => {
    it('updates labels and increments version', () => {
      createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: 'conv-1:msg-uuid-005',
        conversation_ref: 'conv-1',
        labels: ['old'],
      });

      const ok = updateMessageOverlay(db, 'conv-1:msg-uuid-005', {
        labels: ['new', 'tag'],
      });
      assert.isTrue(ok);

      const updated = getMessageOverlayByRef(db, 'conv-1:msg-uuid-005');
      assert.deepEqual(updated?.labels, ['new', 'tag']);
      assert.equal(updated?.version, 2);
    });

    it('returns false for unknown ref', () => {
      assert.isFalse(updateMessageOverlay(db, 'no-ref', { note: 'x' }));
    });
  });

  describe('deleteMessageOverlay', () => {
    it('deletes by message_ref', () => {
      createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: 'conv-1:msg-uuid-006',
        conversation_ref: 'conv-1',
      });

      assert.isTrue(deleteMessageOverlay(db, 'conv-1:msg-uuid-006'));
      assert.isUndefined(getMessageOverlayByRef(db, 'conv-1:msg-uuid-006'));
    });

    it('returns false for unknown ref', () => {
      assert.isFalse(deleteMessageOverlay(db, 'no-ref'));
    });
  });
});
