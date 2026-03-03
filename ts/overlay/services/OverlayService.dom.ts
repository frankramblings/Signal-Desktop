// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// OverlayService: renderer-side facade for overlay CRUD operations.
// Wraps DataReader/DataWriter (IPC bridge) and provides convenience
// methods for the UI layer. All public methods are async.

import { v4 as generateUuid } from 'uuid';
import { DataReader, DataWriter } from '../../sql/Client.preload.js';
import {
  deriveMessageRef,
  getMessageRef,
  isOverlayThreadsEnabled,
} from '../index.std.js';
import type {
  ThreadOverlayType,
  MessageOverlayType,
  UpdateThreadOverlayInput,
  UpdateMessageOverlayInput,
} from '../models/OverlayTypes.std.js';
import type { MessageRefInput } from '../services/MessageRefAdapter.std.js';
import { overlayEvents, OverlayEventType } from './OverlayEventBus.dom.js';
import { overlayUndo } from './OverlayUndoManager.dom.js';

const { i18n } = window.SignalContext;

export type CreateThreadOptions = {
  conversationId: string;
  title?: string;
  color?: string;
  messageRefInput?: MessageRefInput;
};

export type AssignMessageOptions = {
  conversationId: string;
  messageRefInput: MessageRefInput;
  threadRef: string;
};

// ─── Thread operations ────────────────────────────────────────────────────

export async function createThread(
  options: CreateThreadOptions
): Promise<ThreadOverlayType | null> {
  if (!isOverlayThreadsEnabled()) {
    return null;
  }

  const threadRef = generateUuid();
  const thread = await DataWriter.overlayCreateThread({
    thread_ref: threadRef,
    conversation_ref: options.conversationId,
    title: options.title ?? null,
    color: options.color ?? null,
    is_pinned: false,
  });

  // If a message ref was provided, assign the first message to the thread.
  if (options.messageRefInput) {
    await assignMessageToThread({
      conversationId: options.conversationId,
      messageRefInput: options.messageRefInput,
      threadRef,
    });
  }

  overlayEvents.emit(OverlayEventType.ThreadsChanged);
  return thread;
}

export async function getThreadsForConversation(
  conversationId: string
): Promise<ReadonlyArray<ThreadOverlayType>> {
  if (!isOverlayThreadsEnabled()) {
    return [];
  }
  return DataReader.overlayGetThreadsByConversation(conversationId);
}

export async function getThread(
  threadRef: string
): Promise<ThreadOverlayType | undefined> {
  return DataReader.overlayGetThreadOverlay(threadRef);
}

export async function updateThread(
  threadRef: string,
  updates: UpdateThreadOverlayInput
): Promise<boolean> {
  const result = await DataWriter.overlayUpdateThread(threadRef, updates);
  if (result) {
    overlayEvents.emit(OverlayEventType.ThreadsChanged);
  }
  return result;
}

export async function deleteThread(threadRef: string): Promise<boolean> {
  // Snapshot for undo before deleting
  const thread = await DataReader.overlayGetThreadOverlay(threadRef);
  const messages = thread
    ? await DataReader.overlayGetMessageOverlaysByThread(threadRef)
    : [];

  const result = await DataWriter.overlayDeleteThread(threadRef);
  if (result && thread) {
    overlayUndo.push({
      description: i18n('icu:Overlay--undo-deleted-thread', { title: thread.title || i18n('icu:Overlay--untitled') }),
      execute: async () => {
        await DataWriter.overlayCreateThread({
          thread_ref: thread.thread_ref,
          conversation_ref: thread.conversation_ref,
          title: thread.title,
          color: thread.color,
          is_pinned: thread.is_pinned,
        });
        for (const msg of messages) {
          await DataWriter.overlayUpdateMessageOverlay(msg.message_ref, {
            thread_ref: threadRef,
          });
        }
        overlayEvents.emit(OverlayEventType.ThreadsChanged);
        overlayEvents.emit(OverlayEventType.MessagesChanged);
      },
    });
    overlayEvents.emit(OverlayEventType.ThreadsChanged);
  }
  return result;
}

export async function togglePinThread(
  threadRef: string
): Promise<boolean> {
  const thread = await DataReader.overlayGetThreadOverlay(threadRef);
  if (!thread) {
    return false;
  }
  const result = await DataWriter.overlayUpdateThread(threadRef, {
    is_pinned: !thread.is_pinned,
  });
  if (result) {
    overlayEvents.emit(OverlayEventType.ThreadsChanged);
  }
  return result;
}

// ─── Message overlay operations ───────────────────────────────────────────

export async function assignMessageToThread(
  options: AssignMessageOptions
): Promise<MessageOverlayType | null> {
  if (!isOverlayThreadsEnabled()) {
    return null;
  }

  const ref = getMessageRef(options.messageRefInput);
  if (!ref) {
    return null;
  }

  const existing = await DataReader.overlayGetMessageOverlayByRef(ref);
  if (existing) {
    await DataWriter.overlayUpdateMessageOverlay(ref, {
      thread_ref: options.threadRef,
    });
    overlayEvents.emit(OverlayEventType.MessagesChanged);
    return {
      ...existing,
      thread_ref: options.threadRef,
      updated_at: Date.now(),
      version: existing.version + 1,
    };
  }

  const result = await DataWriter.overlayCreateMessageOverlay({
    id: generateUuid(),
    message_ref: ref,
    conversation_ref: options.conversationId,
    thread_ref: options.threadRef,
  });
  overlayEvents.emit(OverlayEventType.MessagesChanged);
  return result;
}

export async function removeMessageFromThread(
  messageRefInput: MessageRefInput
): Promise<boolean> {
  const ref = getMessageRef(messageRefInput);
  if (!ref) {
    return false;
  }

  // Snapshot for undo
  const existing = await DataReader.overlayGetMessageOverlayByRef(ref);
  const previousThreadRef = existing?.thread_ref ?? null;

  const result = await DataWriter.overlayUpdateMessageOverlay(ref, { thread_ref: null });
  if (result && previousThreadRef) {
    overlayUndo.push({
      description: i18n('icu:Overlay--undo-removed-from-thread'),
      execute: async () => {
        await DataWriter.overlayUpdateMessageOverlay(ref, {
          thread_ref: previousThreadRef,
        });
        overlayEvents.emit(OverlayEventType.MessagesChanged);
      },
    });
    overlayEvents.emit(OverlayEventType.MessagesChanged);
  }
  return result;
}

export async function getMessagesInThread(
  threadRef: string
): Promise<ReadonlyArray<MessageOverlayType>> {
  return DataReader.overlayGetMessageOverlaysByThread(threadRef);
}

export async function getMessageOverlay(
  messageRefInput: MessageRefInput
): Promise<MessageOverlayType | undefined> {
  const ref = getMessageRef(messageRefInput);
  if (!ref) {
    return undefined;
  }
  return DataReader.overlayGetMessageOverlayByRef(ref);
}

export async function getMessageOverlaysForConversation(
  conversationId: string
): Promise<ReadonlyArray<MessageOverlayType>> {
  if (!isOverlayThreadsEnabled()) {
    return [];
  }
  return DataReader.overlayGetMessageOverlaysByConversation(conversationId);
}

// ─── Label operations ─────────────────────────────────────────────────────

export async function addLabel(
  messageRefInput: MessageRefInput,
  conversationId: string,
  label: string
): Promise<boolean> {
  if (!isOverlayThreadsEnabled()) {
    return false;
  }

  const ref = getMessageRef(messageRefInput);
  if (!ref) {
    return false;
  }

  const existing = await DataReader.overlayGetMessageOverlayByRef(ref);
  if (existing) {
    const labels = [...existing.labels];
    if (!labels.includes(label)) {
      labels.push(label);
    }
    const updateResult = await DataWriter.overlayUpdateMessageOverlay(ref, { labels });
    if (updateResult) {
      overlayEvents.emit(OverlayEventType.LabelsChanged);
    }
    return updateResult;
  }

  // Create new message overlay with the label.
  await DataWriter.overlayCreateMessageOverlay({
    id: generateUuid(),
    message_ref: ref,
    conversation_ref: conversationId,
    labels: [label],
  });
  overlayEvents.emit(OverlayEventType.LabelsChanged);
  return true;
}

export async function removeLabel(
  messageRefInput: MessageRefInput,
  label: string
): Promise<boolean> {
  const ref = getMessageRef(messageRefInput);
  if (!ref) {
    return false;
  }

  const existing = await DataReader.overlayGetMessageOverlayByRef(ref);
  if (!existing) {
    return false;
  }

  const labels = existing.labels.filter(l => l !== label);
  const result = await DataWriter.overlayUpdateMessageOverlay(ref, { labels });
  if (result) {
    overlayUndo.push({
      description: i18n('icu:Overlay--undo-removed-label', { label }),
      execute: async () => {
        const current = await DataReader.overlayGetMessageOverlayByRef(ref);
        if (current) {
          const restored = [...current.labels, label];
          await DataWriter.overlayUpdateMessageOverlay(ref, { labels: restored });
        }
        overlayEvents.emit(OverlayEventType.LabelsChanged);
      },
    });
    overlayEvents.emit(OverlayEventType.LabelsChanged);
  }
  return result;
}

// ─── Thread label operations ──────────────────────────────────────────────
// Thread-level labels are stored as a comma-separated string in the
// thread title prefix convention: "[label1,label2] Title".
// For M1 we keep labels at the message level only.
// Thread-level labels are deferred to M2.

// ─── Note operations ─────────────────────────────────────────────────────

export async function setNote(
  messageRefInput: MessageRefInput,
  conversationId: string,
  note: string | null
): Promise<boolean> {
  if (!isOverlayThreadsEnabled()) {
    return false;
  }

  const ref = getMessageRef(messageRefInput);
  if (!ref) {
    return false;
  }

  const existing = await DataReader.overlayGetMessageOverlayByRef(ref);
  if (existing) {
    const updateResult = await DataWriter.overlayUpdateMessageOverlay(ref, { note });
    if (updateResult) {
      overlayEvents.emit(OverlayEventType.MessagesChanged);
    }
    return updateResult;
  }

  await DataWriter.overlayCreateMessageOverlay({
    id: generateUuid(),
    message_ref: ref,
    conversation_ref: conversationId,
    note,
  });
  overlayEvents.emit(OverlayEventType.MessagesChanged);
  return true;
}
