// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// ThreadCreateDialog: modal dialog for creating a new thread overlay
// or assigning a message to an existing thread. Self-contained — calls
// OverlayService directly without requiring OverlayProvider.

import React, { memo, useCallback, useEffect, useState } from 'react';
import type { ThreadOverlayType } from '../models/OverlayTypes.std.js';
import * as OverlayService from '../services/OverlayService.dom.js';
import type { MessageRefInput } from '../services/MessageRefAdapter.std.js';

export type ThreadCreateDialogProps = {
  messageRefInput: MessageRefInput;
  onClose: () => void;
};

export const ThreadCreateDialog = memo(function ThreadCreateDialog({
  messageRefInput,
  onClose,
}: ThreadCreateDialogProps): React.JSX.Element {
  const [threads, setThreads] = useState<ReadonlyArray<ThreadOverlayType>>([]);
  const [mode, setMode] = useState<'create' | 'assign'>('create');
  const [title, setTitle] = useState('');
  const [selectedThreadRef, setSelectedThreadRef] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load existing threads for this conversation.
  useEffect(() => {
    void (async () => {
      const convThreads = await OverlayService.getThreadsForConversation(
        messageRefInput.conversationId
      );
      setThreads(convThreads);
      setMode(convThreads.length > 0 ? 'assign' : 'create');
      setLoading(false);
    })();
  }, [messageRefInput.conversationId]);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) return;
    await OverlayService.createThread({
      conversationId: messageRefInput.conversationId,
      title: title.trim(),
      messageRefInput,
    });
    onClose();
  }, [title, messageRefInput, onClose]);

  const handleAssign = useCallback(async () => {
    if (!selectedThreadRef) return;
    await OverlayService.assignMessageToThread({
      conversationId: messageRefInput.conversationId,
      messageRefInput,
      threadRef: selectedThreadRef,
    });
    onClose();
  }, [selectedThreadRef, messageRefInput, onClose]);

  if (loading) {
    return (
      <div className="overlay-dialog__backdrop" onClick={onClose} role="presentation">
        <div className="overlay-dialog" onClick={e => e.stopPropagation()} role="dialog" aria-label="Thread overlay">
          <div className="overlay-dialog__body">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay-dialog__backdrop" onClick={onClose} role="presentation">
      <div className="overlay-dialog" onClick={e => e.stopPropagation()} role="dialog" aria-label="Thread overlay">
        <div className="overlay-dialog__header">
          <h3>Add to Thread</h3>
          <button type="button" className="overlay-dialog__close" onClick={onClose}>
            &times;
          </button>
        </div>

        {threads.length > 0 && (
          <div className="overlay-dialog__tabs">
            <button
              type="button"
              className={`overlay-dialog__tab ${mode === 'assign' ? 'overlay-dialog__tab--active' : ''}`}
              onClick={() => setMode('assign')}
            >
              Existing thread
            </button>
            <button
              type="button"
              className={`overlay-dialog__tab ${mode === 'create' ? 'overlay-dialog__tab--active' : ''}`}
              onClick={() => setMode('create')}
            >
              New thread
            </button>
          </div>
        )}

        <div className="overlay-dialog__body">
          {mode === 'create' ? (
            <div className="overlay-dialog__create">
              <input
                type="text"
                className="overlay-dialog__input"
                placeholder="Thread name..."
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void handleCreate();
                  if (e.key === 'Escape') onClose();
                }}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
              <button
                type="button"
                className="overlay-dialog__btn overlay-dialog__btn--primary"
                onClick={() => void handleCreate()}
                disabled={!title.trim()}
              >
                Create & assign
              </button>
            </div>
          ) : (
            <div className="overlay-dialog__assign">
              <ul className="overlay-dialog__thread-list">
                {threads.map(thread => (
                  <li
                    key={thread.thread_ref}
                    className={`overlay-dialog__thread-item ${
                      selectedThreadRef === thread.thread_ref
                        ? 'overlay-dialog__thread-item--selected'
                        : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="overlay-dialog__thread-btn"
                      onClick={() => setSelectedThreadRef(thread.thread_ref)}
                    >
                      {thread.is_pinned && <span aria-hidden>&#x1f4cc; </span>}
                      {thread.title || 'Untitled'}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="overlay-dialog__btn overlay-dialog__btn--primary"
                onClick={() => void handleAssign()}
                disabled={!selectedThreadRef}
              >
                Assign to thread
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
