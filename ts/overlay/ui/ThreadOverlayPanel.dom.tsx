// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// ThreadOverlayPanel: full panel showing thread list for a conversation,
// with actions for pin/unpin, rename, and delete. Self-contained — calls
// OverlayService directly.

import React, { memo, useCallback, useEffect, useState } from 'react';
import type { ThreadOverlayType, MessageOverlayType } from '../models/OverlayTypes.std.js';
import * as OverlayService from '../services/OverlayService.dom.js';

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

  const loadData = useCallback(async () => {
    const [t, m] = await Promise.all([
      OverlayService.getThreadsForConversation(conversationId),
      OverlayService.getMessageOverlaysForConversation(conversationId),
    ]);
    setThreads(t);
    setMessageOverlays(m);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateThread = useCallback(async () => {
    if (!newTitle.trim()) return;
    await OverlayService.createThread({
      conversationId,
      title: newTitle.trim(),
    });
    setNewTitle('');
    setShowCreate(false);
    await loadData();
  }, [newTitle, conversationId, loadData]);

  const handleRename = useCallback(
    async (threadRef: string, title: string) => {
      await OverlayService.updateThread(threadRef, { title });
      await loadData();
    },
    [loadData]
  );

  const handleTogglePin = useCallback(
    async (threadRef: string) => {
      await OverlayService.togglePinThread(threadRef);
      await loadData();
    },
    [loadData]
  );

  const handleDelete = useCallback(
    async (threadRef: string) => {
      await OverlayService.deleteThread(threadRef);
      await loadData();
    },
    [loadData]
  );

  if (loading) {
    return (
      <div className="overlay-panel overlay-panel--loading">
        Loading threads...
      </div>
    );
  }

  return (
    <div className="overlay-panel">
      <div className="overlay-panel__header">
        <h3 className="overlay-panel__title">Thread Overlays</h3>
        <button
          type="button"
          className="overlay-panel__add-btn"
          onClick={() => setShowCreate(!showCreate)}
          title="Create new thread"
        >
          +
        </button>
      </div>

      {showCreate && (
        <div className="overlay-panel__create-form">
          <input
            type="text"
            className="overlay-panel__input"
            placeholder="Thread name..."
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
            Create
          </button>
        </div>
      )}

      {threads.length === 0 && !showCreate ? (
        <div className="overlay-panel__empty">
          No threads yet. Create one from a message context menu or use the +
          button above.
        </div>
      ) : (
        <ul className="overlay-panel__list">
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
          <span className="overlay-panel__pin-badge" title="Pinned">
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
            {thread.title || 'Untitled'}
          </span>
        )}
        <span className="overlay-panel__item-count">
          {messageCount} msg{messageCount !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="overlay-panel__item-actions">
        <button
          type="button"
          title="Rename"
          onClick={() => {
            setEditTitle(thread.title ?? '');
            setIsEditing(true);
          }}
        >
          Rename
        </button>
        <button
          type="button"
          title={thread.is_pinned ? 'Unpin' : 'Pin'}
          onClick={() => void handlePin()}
        >
          {thread.is_pinned ? 'Unpin' : 'Pin'}
        </button>
        <button
          type="button"
          title="Delete"
          onClick={() => void handleDelete()}
        >
          Delete
        </button>
      </div>
    </li>
  );
});
