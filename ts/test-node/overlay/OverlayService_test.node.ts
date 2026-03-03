// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// M1 overlay service tests — validates the complete CRUD flows for thread
// overlays, message overlays, labels, and pin/unpin operations at the store
// layer (since OverlayService.dom.ts depends on the IPC bridge which requires
// a running Electron process, we test the underlying store operations that
// the service delegates to).

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
import {
  deriveMessageRef,
  getMessageRef,
  isPrimaryRef,
} from '../../overlay/services/MessageRefAdapter.std.js';
import {
  isOverlayThreadsEnabled,
  setOverlayThreadsEnabledForTesting,
} from '../../overlay/OverlayFeatureFlag.std.js';

describe('overlay/M1 — OverlayService flows', () => {
  let db: WritableDB;

  beforeEach(() => {
    db = createDB();
    updateToVersion(db, 1680);
    setOverlayThreadsEnabledForTesting(true);
  });

  afterEach(() => {
    setOverlayThreadsEnabledForTesting(null);
    db.close();
  });

  // ─── Thread creation from message ─────────────────────────────────────

  describe('thread creation from message', () => {
    it('creates a thread and assigns a message to it', () => {
      const conversationId = 'conv-100';
      const threadRef = generateUuid();
      const messageRef = `${conversationId}:msg-1`;

      // Step 1: Create thread
      const thread = createThreadOverlay(db, {
        thread_ref: threadRef,
        conversation_ref: conversationId,
        title: 'Project Alpha',
      });
      assert.equal(thread.title, 'Project Alpha');
      assert.isFalse(thread.is_pinned);

      // Step 2: Create message overlay and assign to thread
      const msgOverlay = createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: messageRef,
        conversation_ref: conversationId,
        thread_ref: threadRef,
      });
      assert.equal(msgOverlay.thread_ref, threadRef);
      assert.deepEqual(msgOverlay.labels, []);

      // Step 3: Verify thread has the message
      const threadMessages = getMessageOverlaysByThread(db, threadRef);
      assert.lengthOf(threadMessages, 1);
      assert.equal(threadMessages[0].message_ref, messageRef);
    });

    it('derives message ref and creates overlay with it', () => {
      const conversationId = 'conv-200';
      const signalMessageId = generateUuid();
      const ref = getMessageRef({ conversationId, signalMessageId });
      assert.isNotNull(ref);
      assert.isTrue(isPrimaryRef(ref!, conversationId));

      const overlay = createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: ref!,
        conversation_ref: conversationId,
      });
      assert.equal(overlay.message_ref, ref);
    });
  });

  // ─── Assign/remove message from thread ────────────────────────────────

  describe('assign/remove message from thread', () => {
    it('assigns a message to a thread, then removes it', () => {
      const conversationId = 'conv-300';
      const threadRef = generateUuid();
      const messageRef = `${conversationId}:msg-assign-1`;

      createThreadOverlay(db, {
        thread_ref: threadRef,
        conversation_ref: conversationId,
        title: 'Thread for assign test',
      });

      // Create message overlay without a thread
      createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: messageRef,
        conversation_ref: conversationId,
      });

      let overlay = getMessageOverlayByRef(db, messageRef);
      assert.isNull(overlay?.thread_ref);

      // Assign to thread
      updateMessageOverlay(db, messageRef, { thread_ref: threadRef });
      overlay = getMessageOverlayByRef(db, messageRef);
      assert.equal(overlay?.thread_ref, threadRef);

      // Verify thread has the message
      let threadMessages = getMessageOverlaysByThread(db, threadRef);
      assert.lengthOf(threadMessages, 1);

      // Remove from thread
      updateMessageOverlay(db, messageRef, { thread_ref: null });
      overlay = getMessageOverlayByRef(db, messageRef);
      assert.isNull(overlay?.thread_ref);

      threadMessages = getMessageOverlaysByThread(db, threadRef);
      assert.lengthOf(threadMessages, 0);
    });
  });

  // ─── Label add/remove ─────────────────────────────────────────────────

  describe('label operations', () => {
    it('adds labels to a message overlay', () => {
      const conversationId = 'conv-400';
      const messageRef = `${conversationId}:msg-label-1`;

      createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: messageRef,
        conversation_ref: conversationId,
        labels: ['hiring'],
      });

      let overlay = getMessageOverlayByRef(db, messageRef);
      assert.deepEqual([...overlay!.labels], ['hiring']);

      // Add another label
      updateMessageOverlay(db, messageRef, {
        labels: ['hiring', 'urgent'],
      });
      overlay = getMessageOverlayByRef(db, messageRef);
      assert.deepEqual([...overlay!.labels], ['hiring', 'urgent']);
    });

    it('removes a label from a message overlay', () => {
      const conversationId = 'conv-401';
      const messageRef = `${conversationId}:msg-label-2`;

      createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: messageRef,
        conversation_ref: conversationId,
        labels: ['alpha', 'beta', 'gamma'],
      });

      // Remove 'beta'
      updateMessageOverlay(db, messageRef, {
        labels: ['alpha', 'gamma'],
      });
      const overlay = getMessageOverlayByRef(db, messageRef);
      assert.deepEqual([...overlay!.labels], ['alpha', 'gamma']);
    });

    it('creates overlay with labels when none exists', () => {
      const conversationId = 'conv-402';
      const messageRef = `${conversationId}:msg-label-3`;

      const overlay = createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: messageRef,
        conversation_ref: conversationId,
        labels: ['new-label'],
      });
      assert.deepEqual([...overlay.labels], ['new-label']);
    });
  });

  // ─── Pin/unpin thread ─────────────────────────────────────────────────

  describe('pin/unpin thread', () => {
    it('pins a thread and it appears first in listing', () => {
      const conversationId = 'conv-500';

      createThreadOverlay(db, {
        thread_ref: 'thread-a',
        conversation_ref: conversationId,
        title: 'Unpinned thread',
        is_pinned: false,
      });

      // Small delay to ensure different timestamps
      createThreadOverlay(db, {
        thread_ref: 'thread-b',
        conversation_ref: conversationId,
        title: 'Pinned thread',
        is_pinned: true,
      });

      const threads = getThreadsByConversation(db, conversationId);
      assert.lengthOf(threads, 2);
      // Pinned should come first
      assert.equal(threads[0].thread_ref, 'thread-b');
      assert.isTrue(threads[0].is_pinned);
      assert.equal(threads[1].thread_ref, 'thread-a');
    });

    it('unpins a previously pinned thread', () => {
      const conversationId = 'conv-501';

      createThreadOverlay(db, {
        thread_ref: 'thread-pinned',
        conversation_ref: conversationId,
        title: 'Will be unpinned',
        is_pinned: true,
      });

      let thread = getThreadOverlay(db, 'thread-pinned');
      assert.isTrue(thread?.is_pinned);

      updateThreadOverlay(db, 'thread-pinned', { is_pinned: false });
      thread = getThreadOverlay(db, 'thread-pinned');
      assert.isFalse(thread?.is_pinned);
    });

    it('toggles pin state correctly', () => {
      const conversationId = 'conv-502';

      createThreadOverlay(db, {
        thread_ref: 'thread-toggle',
        conversation_ref: conversationId,
        title: 'Toggle pin',
        is_pinned: false,
      });

      // Pin
      updateThreadOverlay(db, 'thread-toggle', { is_pinned: true });
      let thread = getThreadOverlay(db, 'thread-toggle');
      assert.isTrue(thread?.is_pinned);

      // Unpin
      updateThreadOverlay(db, 'thread-toggle', { is_pinned: false });
      thread = getThreadOverlay(db, 'thread-toggle');
      assert.isFalse(thread?.is_pinned);
    });
  });

  // ─── Thread deletion ──────────────────────────────────────────────────

  describe('thread deletion', () => {
    it('deletes a thread and unlinks its messages', () => {
      const conversationId = 'conv-600';
      const threadRef = 'thread-to-delete';

      createThreadOverlay(db, {
        thread_ref: threadRef,
        conversation_ref: conversationId,
        title: 'Ephemeral',
      });

      createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: `${conversationId}:msg-d1`,
        conversation_ref: conversationId,
        thread_ref: threadRef,
      });

      createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: `${conversationId}:msg-d2`,
        conversation_ref: conversationId,
        thread_ref: threadRef,
      });

      // Verify messages are assigned
      let threadMessages = getMessageOverlaysByThread(db, threadRef);
      assert.lengthOf(threadMessages, 2);

      // Delete thread
      const deleted = deleteThreadOverlay(db, threadRef);
      assert.isTrue(deleted);

      // Thread gone
      assert.isUndefined(getThreadOverlay(db, threadRef));

      // Messages still exist but unlinked
      threadMessages = getMessageOverlaysByThread(db, threadRef);
      assert.lengthOf(threadMessages, 0);

      const msg1 = getMessageOverlayByRef(db, `${conversationId}:msg-d1`);
      assert.isNotNull(msg1);
      assert.isNull(msg1?.thread_ref);
    });
  });

  // ─── Feature flag ─────────────────────────────────────────────────────

  describe('feature flag behavior', () => {
    it('respects test override', () => {
      setOverlayThreadsEnabledForTesting(true);
      assert.isTrue(isOverlayThreadsEnabled());

      setOverlayThreadsEnabledForTesting(false);
      assert.isFalse(isOverlayThreadsEnabled());

      setOverlayThreadsEnabledForTesting(null);
      // Without window.storage, defaults to false
      assert.isFalse(isOverlayThreadsEnabled());
    });
  });

  // ─── Message ref derivation ───────────────────────────────────────────

  describe('message ref derivation for overlay', () => {
    it('produces primary ref for message with signalMessageId', () => {
      const result = deriveMessageRef({
        conversationId: 'conv-700',
        signalMessageId: 'uuid-12345',
      });
      assert.equal(result.strategy, 'primary');
      assert.equal(result.ref, 'conv-700:uuid-12345');
    });

    it('produces fallback ref when missing signalMessageId', () => {
      const result = deriveMessageRef({
        conversationId: 'conv-700',
        senderAciOrId: 'sender-abc',
        sentAtMs: 1700000000000,
      });
      assert.equal(result.strategy, 'fallback');
      assert.equal(result.ref, 'conv-700:sender-abc:1700000000000');
    });

    it('returns none when insufficient data', () => {
      const result = deriveMessageRef({
        conversationId: 'conv-700',
      });
      assert.equal(result.strategy, 'none');
      assert.isNull(result.ref);
    });
  });

  // ─── Multi-thread conversation ────────────────────────────────────────

  describe('multi-thread conversation', () => {
    it('supports multiple threads in one conversation', () => {
      const conversationId = 'conv-800';

      createThreadOverlay(db, {
        thread_ref: 'thread-1',
        conversation_ref: conversationId,
        title: 'Thread One',
      });
      createThreadOverlay(db, {
        thread_ref: 'thread-2',
        conversation_ref: conversationId,
        title: 'Thread Two',
        is_pinned: true,
      });
      createThreadOverlay(db, {
        thread_ref: 'thread-3',
        conversation_ref: conversationId,
        title: 'Thread Three',
      });

      const threads = getThreadsByConversation(db, conversationId);
      assert.lengthOf(threads, 3);
      // Pinned first
      assert.equal(threads[0].thread_ref, 'thread-2');
    });

    it('keeps threads isolated across conversations', () => {
      createThreadOverlay(db, {
        thread_ref: 'thread-conv-a',
        conversation_ref: 'conv-A',
        title: 'Thread A',
      });
      createThreadOverlay(db, {
        thread_ref: 'thread-conv-b',
        conversation_ref: 'conv-B',
        title: 'Thread B',
      });

      const threadsA = getThreadsByConversation(db, 'conv-A');
      assert.lengthOf(threadsA, 1);
      assert.equal(threadsA[0].title, 'Thread A');

      const threadsB = getThreadsByConversation(db, 'conv-B');
      assert.lengthOf(threadsB, 1);
      assert.equal(threadsB[0].title, 'Thread B');
    });
  });

  // ─── Note operations ──────────────────────────────────────────────────

  describe('note operations', () => {
    it('sets and clears a note on a message overlay', () => {
      const messageRef = 'conv-900:msg-note-1';

      createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: messageRef,
        conversation_ref: 'conv-900',
        note: 'Initial note',
      });

      let overlay = getMessageOverlayByRef(db, messageRef);
      assert.equal(overlay?.note, 'Initial note');

      // Update note
      updateMessageOverlay(db, messageRef, { note: 'Updated note' });
      overlay = getMessageOverlayByRef(db, messageRef);
      assert.equal(overlay?.note, 'Updated note');

      // Clear note
      updateMessageOverlay(db, messageRef, { note: null });
      overlay = getMessageOverlayByRef(db, messageRef);
      assert.isNull(overlay?.note);
    });
  });

  // ─── Version tracking ─────────────────────────────────────────────────

  describe('version tracking', () => {
    it('increments version on thread update', () => {
      createThreadOverlay(db, {
        thread_ref: 'thread-version',
        conversation_ref: 'conv-1000',
        title: 'v1',
      });

      let thread = getThreadOverlay(db, 'thread-version');
      assert.equal(thread?.version, 1);

      updateThreadOverlay(db, 'thread-version', { title: 'v2' });
      thread = getThreadOverlay(db, 'thread-version');
      assert.equal(thread?.version, 2);
      assert.equal(thread?.title, 'v2');

      updateThreadOverlay(db, 'thread-version', { is_pinned: true });
      thread = getThreadOverlay(db, 'thread-version');
      assert.equal(thread?.version, 3);
    });

    it('increments version on message overlay update', () => {
      const messageRef = 'conv-1001:msg-ver-1';

      createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: messageRef,
        conversation_ref: 'conv-1001',
      });

      let overlay = getMessageOverlayByRef(db, messageRef);
      assert.equal(overlay?.version, 1);

      updateMessageOverlay(db, messageRef, { labels: ['tag1'] });
      overlay = getMessageOverlayByRef(db, messageRef);
      assert.equal(overlay?.version, 2);
    });
  });
});
