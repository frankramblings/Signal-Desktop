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
  return DataWriter.overlayUpdateThread(threadRef, updates);
}

export async function deleteThread(threadRef: string): Promise<boolean> {
  return DataWriter.overlayDeleteThread(threadRef);
}

export async function togglePinThread(
  threadRef: string
): Promise<boolean> {
  const thread = await DataReader.overlayGetThreadOverlay(threadRef);
  if (!thread) {
    return false;
  }
  return DataWriter.overlayUpdateThread(threadRef, {
    is_pinned: !thread.is_pinned,
  });
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
    return {
      ...existing,
      thread_ref: options.threadRef,
      updated_at: Date.now(),
      version: existing.version + 1,
    };
  }

  return DataWriter.overlayCreateMessageOverlay({
    id: generateUuid(),
    message_ref: ref,
    conversation_ref: options.conversationId,
    thread_ref: options.threadRef,
  });
}

export async function removeMessageFromThread(
  messageRefInput: MessageRefInput
): Promise<boolean> {
  const ref = getMessageRef(messageRefInput);
  if (!ref) {
    return false;
  }
  return DataWriter.overlayUpdateMessageOverlay(ref, { thread_ref: null });
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
    return DataWriter.overlayUpdateMessageOverlay(ref, { labels });
  }

  // Create new message overlay with the label.
  await DataWriter.overlayCreateMessageOverlay({
    id: generateUuid(),
    message_ref: ref,
    conversation_ref: conversationId,
    labels: [label],
  });
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
  return DataWriter.overlayUpdateMessageOverlay(ref, { labels });
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
    return DataWriter.overlayUpdateMessageOverlay(ref, { note });
  }

  await DataWriter.overlayCreateMessageOverlay({
    id: generateUuid(),
    message_ref: ref,
    conversation_ref: conversationId,
    note,
  });
  return true;
}
