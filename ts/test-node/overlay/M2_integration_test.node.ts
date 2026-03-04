// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// M2 integration tests — validates event bus, undo manager, and
// store-level undo patterns for overlay operations.

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
} from '../../overlay/store/OverlayStore.node.js';
import {
  overlayEvents,
  OverlayEventType,
} from '../../overlay/services/OverlayEventBus.dom.js';
import { overlayUndo } from '../../overlay/services/OverlayUndoManager.dom.js';

describe('overlay/M2 — integration tests', () => {
  let db: WritableDB;

  beforeEach(() => {
    db = createDB();
    updateToVersion(db, 1680);
    overlayUndo.clear();
  });

  afterEach(() => {
    db.close();
  });

  // ─── Event bus integration ─────────────────────────────────────────────

  describe('event bus fires on store operations', () => {
    it('emitting ThreadsChanged triggers subscribers', () => {
      let notified = false;
      const handler = () => { notified = true; };
      overlayEvents.on(OverlayEventType.ThreadsChanged, handler);

      // Simulate what OverlayService does after createThread
      createThreadOverlay(db, {
        thread_ref: 'thread-evt-1',
        conversation_ref: 'conv-evt-1',
        title: 'Event test',
      });
      overlayEvents.emit(OverlayEventType.ThreadsChanged);

      assert.isTrue(notified);
      overlayEvents.off(OverlayEventType.ThreadsChanged, handler);
    });

    it('MessagesChanged and LabelsChanged are independent', () => {
      let msgNotified = false;
      let lblNotified = false;
      const msgHandler = () => { msgNotified = true; };
      const lblHandler = () => { lblNotified = true; };

      overlayEvents.on(OverlayEventType.MessagesChanged, msgHandler);
      overlayEvents.on(OverlayEventType.LabelsChanged, lblHandler);

      overlayEvents.emit(OverlayEventType.MessagesChanged);
      assert.isTrue(msgNotified);
      assert.isFalse(lblNotified);

      overlayEvents.emit(OverlayEventType.LabelsChanged);
      assert.isTrue(lblNotified);

      overlayEvents.off(OverlayEventType.MessagesChanged, msgHandler);
      overlayEvents.off(OverlayEventType.LabelsChanged, lblHandler);
    });
  });

  // ─── Undo: delete thread ───────────────────────────────────────────────

  describe('undo delete thread', () => {
    it('restores thread and re-assigns messages after undo', async () => {
      const conversationId = 'conv-undo-del';
      const threadRef = 'thread-undo-del';

      createThreadOverlay(db, {
        thread_ref: threadRef,
        conversation_ref: conversationId,
        title: 'To be undone',
        is_pinned: true,
      });

      createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: `${conversationId}:msg-u1`,
        conversation_ref: conversationId,
        thread_ref: threadRef,
      });

      createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: `${conversationId}:msg-u2`,
        conversation_ref: conversationId,
        thread_ref: threadRef,
      });

      // Snapshot before delete (simulating OverlayService behavior)
      const threadBefore = getThreadOverlay(db, threadRef)!;
      const messagesBefore = getMessageOverlaysByThread(db, threadRef);

      // Push undo entry
      overlayUndo.push({
        description: `Thread "${threadBefore.title}" deleted`,
        execute: async () => {
          createThreadOverlay(db, {
            thread_ref: threadBefore.thread_ref,
            conversation_ref: threadBefore.conversation_ref,
            title: threadBefore.title,
            color: threadBefore.color,
            is_pinned: threadBefore.is_pinned,
          });
          for (const msg of messagesBefore) {
            updateMessageOverlay(db, msg.message_ref, {
              thread_ref: threadRef,
            });
          }
        },
      });

      // Delete
      deleteThreadOverlay(db, threadRef);
      assert.isUndefined(getThreadOverlay(db, threadRef));
      assert.lengthOf(getMessageOverlaysByThread(db, threadRef), 0);

      // Undo
      const undoEntry = overlayUndo.pop();
      assert.isNotNull(undoEntry);
      await undoEntry!.execute();

      // Verify restoration
      const restored = getThreadOverlay(db, threadRef);
      assert.isNotNull(restored);
      assert.equal(restored!.title, 'To be undone');
      assert.isTrue(restored!.is_pinned);

      const restoredMsgs = getMessageOverlaysByThread(db, threadRef);
      assert.lengthOf(restoredMsgs, 2);
    });
  });

  // ─── Undo: remove message from thread ──────────────────────────────────

  describe('undo remove message from thread', () => {
    it('re-assigns message to thread after undo', async () => {
      const conversationId = 'conv-undo-rm';
      const threadRef = 'thread-undo-rm';
      const messageRef = `${conversationId}:msg-rm1`;

      createThreadOverlay(db, {
        thread_ref: threadRef,
        conversation_ref: conversationId,
        title: 'Thread for removal',
      });

      createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: messageRef,
        conversation_ref: conversationId,
        thread_ref: threadRef,
      });

      // Snapshot
      const previousThreadRef = threadRef;

      // Push undo
      overlayUndo.push({
        description: 'Message removed from thread',
        execute: async () => {
          updateMessageOverlay(db, messageRef, {
            thread_ref: previousThreadRef,
          });
        },
      });

      // Remove
      updateMessageOverlay(db, messageRef, { thread_ref: null });
      const removed = getMessageOverlayByRef(db, messageRef);
      assert.isNull(removed?.thread_ref);

      // Undo
      const undoEntry = overlayUndo.pop();
      await undoEntry!.execute();

      const restored = getMessageOverlayByRef(db, messageRef);
      assert.equal(restored?.thread_ref, threadRef);
    });
  });

  // ─── Undo: remove label ────────────────────────────────────────────────

  describe('undo remove label', () => {
    it('restores removed label after undo', async () => {
      const conversationId = 'conv-undo-lbl';
      const messageRef = `${conversationId}:msg-lbl1`;
      const removedLabel = 'important';

      createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: messageRef,
        conversation_ref: conversationId,
        labels: ['hiring', 'important', 'urgent'],
      });

      // Push undo for removing 'important'
      overlayUndo.push({
        description: `Label "${removedLabel}" removed`,
        execute: async () => {
          const current = getMessageOverlayByRef(db, messageRef);
          if (current) {
            const restored = [...current.labels, removedLabel];
            updateMessageOverlay(db, messageRef, { labels: restored });
          }
        },
      });

      // Remove label
      updateMessageOverlay(db, messageRef, {
        labels: ['hiring', 'urgent'],
      });

      let overlay = getMessageOverlayByRef(db, messageRef);
      assert.deepEqual([...overlay!.labels], ['hiring', 'urgent']);

      // Undo
      const undoEntry = overlayUndo.pop();
      await undoEntry!.execute();

      overlay = getMessageOverlayByRef(db, messageRef);
      assert.include([...overlay!.labels], removedLabel);
    });
  });

  // ─── Undo stack depth ──────────────────────────────────────────────────

  describe('undo stack depth limit', () => {
    it('only keeps last 20 entries', () => {
      for (let i = 0; i < 25; i++) {
        overlayUndo.push({
          description: `entry-${i}`,
          execute: async () => {},
        });
      }

      // Should have entry-24 at top
      assert.equal(overlayUndo.peek()!.description, 'entry-24');

      // Pop all - should get exactly 20
      let count = 0;
      while (overlayUndo.pop()) {
        count += 1;
      }
      assert.equal(count, 20);
    });
  });
});
