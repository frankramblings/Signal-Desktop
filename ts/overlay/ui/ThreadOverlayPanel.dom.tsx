// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// ThreadOverlayPanel: full panel showing thread list for a conversation,
// with actions for pin/unpin, rename, and delete. Event-driven refresh.

import React, { memo, useCallback, useEffect, useState } from 'react';
import type { ThreadOverlayType, MessageOverlayType } from '../models/OverlayTypes.std.js';
import * as OverlayService from '../services/OverlayService.dom.js';
import { overlayEvents, OverlayEventType } from '../services/OverlayEventBus.dom.js';
import { OverlayErrorBanner } from './OverlayErrorBanner.dom.js';

const { i18n } = window.SignalContext;

export type ThreadOverlayPanelProps = {
  conversationId: string;
};

export const ThreadOverlayPanel = memo(function ThreadOverlayPanel({
  conversationId,
}: ThreadOverlayPanelProps): React.JSX.Element {
  const [threads, setThreads] = useState<ReadonlyArray<ThreadOverlayType>>([]);
  const [messageOverlays, setMessageOverlays] = useState<
    ReadonlyArray<MessageOverlayType>
  >([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [t, m] = await Promise.all([
        OverlayService.getThreadsForConversation(conversationId),
        OverlayService.getMessageOverlaysForConversation(conversationId),
      ]);
      setThreads(t);
      setMessageOverlays(m);
    } catch {
      setErrorMessage(i18n('icu:Overlay--error-generic'));
    }
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Event-driven refresh
  useEffect(() => {
    const handler = () => void loadData();
    overlayEvents.on(OverlayEventType.ThreadsChanged, handler);
    overlayEvents.on(OverlayEventType.MessagesChanged, handler);
    return () => {
      overlayEvents.off(OverlayEventType.ThreadsChanged, handler);
      overlayEvents.off(OverlayEventType.MessagesChanged, handler);
    };
  }, [loadData]);

  const handleCreateThread = useCallback(async () => {
    if (!newTitle.trim()) return;
    try {
      await OverlayService.createThread({
        conversationId,
        title: newTitle.trim(),
      });
      setNewTitle('');
      setShowCreate(false);
    } catch {
      setErrorMessage(i18n('icu:Overlay--error-generic'));
    }
  }, [newTitle, conversationId]);

  const handleRename = useCallback(
    async (threadRef: string, title: string) => {
      try {
        await OverlayService.updateThread(threadRef, { title });
      } catch {
        setErrorMessage(i18n('icu:Overlay--error-generic'));
      }
    },
    []
  );

  const handleTogglePin = useCallback(
    async (threadRef: string) => {
      try {
        await OverlayService.togglePinThread(threadRef);
      } catch {
        setErrorMessage(i18n('icu:Overlay--error-generic'));
      }
    },
    []
  );

  const handleDelete = useCallback(
    async (threadRef: string) => {
      try {
        await OverlayService.deleteThread(threadRef);
      } catch {
        setErrorMessage(i18n('icu:Overlay--error-generic'));
      }
    },
    []
  );

  if (loading) {
    return (
      <div className="overlay-panel overlay-panel--loading">
        {i18n('icu:Overlay--loading')}
      </div>
    );
  }

  return (
    <div className="overlay-panel">
      <OverlayErrorBanner
        message={errorMessage}
        onDismiss={() => setErrorMessage(null)}
      />

      <div className="overlay-panel__header">
        <h3 className="overlay-panel__title">
          {i18n('icu:Overlay--thread-overlays-title')}
        </h3>
        <button
          type="button"
          className="overlay-panel__add-btn"
          onClick={() => setShowCreate(!showCreate)}
          aria-label={i18n('icu:Overlay--create-thread-button')}
        >
          +
        </button>
      </div>

      {showCreate && (
        <div className="overlay-panel__create-form">
          <input
            type="text"
            className="overlay-panel__input"
            placeholder={i18n('icu:Overlay--placeholder-thread-name')}
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void handleCreateThread();
              if (e.key === 'Escape') setShowCreate(false);
            }}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <button
            type="button"
            className="overlay-panel__create-btn"
            onClick={() => void handleCreateThread()}
            disabled={!newTitle.trim()}
          >
            {i18n('icu:Overlay--create-thread')}
          </button>
        </div>
      )}

      {threads.length === 0 && !showCreate ? (
        <div className="overlay-panel__empty">
          {i18n('icu:Overlay--empty-threads')}
        </div>
      ) : (
        <ul className="overlay-panel__list" role="list">
          {threads.map(thread => (
            <ThreadListItem
              key={thread.thread_ref}
              thread={thread}
              messageCount={
                messageOverlays.filter(
                  m => m.thread_ref === thread.thread_ref
                ).length
              }
              onRename={handleRename}
              onTogglePin={handleTogglePin}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
});

// ─── Thread list item ─────────────────────────────────────────────────────

type ThreadListItemProps = {
  thread: ThreadOverlayType;
  messageCount: number;
  onRename: (threadRef: string, title: string) => Promise<void>;
  onTogglePin: (threadRef: string) => Promise<void>;
  onDelete: (threadRef: string) => Promise<void>;
};

const ThreadListItem = memo(function ThreadListItem({
  thread,
  messageCount,
  onRename,
  onTogglePin,
  onDelete,
}: ThreadListItemProps): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(thread.title ?? '');

  const handleRename = useCallback(async () => {
    if (editTitle.trim()) {
      await onRename(thread.thread_ref, editTitle.trim());
    }
    setIsEditing(false);
  }, [editTitle, thread.thread_ref, onRename]);

  const handlePin = useCallback(
    () => onTogglePin(thread.thread_ref),
    [thread.thread_ref, onTogglePin]
  );

  const handleDelete = useCallback(
    () => onDelete(thread.thread_ref),
    [thread.thread_ref, onDelete]
  );

  const itemClass = [
    'overlay-panel__item',
    thread.is_pinned ? 'overlay-panel__item--pinned' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={itemClass}>
      <div className="overlay-panel__item-main">
        {thread.is_pinned && (
          <span className="overlay-panel__pin-badge" aria-hidden="true">
            &#x1f4cc;
          </span>
        )}
        {isEditing ? (
          <input
            type="text"
            className="overlay-panel__input overlay-panel__input--inline"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void handleRename();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            onBlur={() => void handleRename()}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        ) : (
          <span className="overlay-panel__item-title">
            {thread.title || i18n('icu:Overlay--untitled')}
          </span>
        )}
        <span className="overlay-panel__item-count">
          {i18n('icu:Overlay--message-count', { count: messageCount })}
        </span>
      </div>
      <div className="overlay-panel__item-actions">
        <button
          type="button"
          aria-label={i18n('icu:Overlay--rename-thread')}
          onClick={() => {
            setEditTitle(thread.title ?? '');
            setIsEditing(true);
          }}
        >
          {i18n('icu:Overlay--rename-thread')}
        </button>
        <button
          type="button"
          aria-label={thread.is_pinned ? i18n('icu:Overlay--unpin-thread') : i18n('icu:Overlay--pin-thread')}
          onClick={() => void handlePin()}
        >
          {thread.is_pinned ? i18n('icu:Overlay--unpin-thread') : i18n('icu:Overlay--pin-thread')}
        </button>
        <button
          type="button"
          aria-label={i18n('icu:Overlay--delete-thread')}
          onClick={() => void handleDelete()}
        >
          {i18n('icu:Overlay--delete-thread')}
        </button>
      </div>
    </li>
  );
});
