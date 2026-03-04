// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// ThreadCreateDialog: modal dialog for creating a new thread overlay
// or assigning a message to an existing thread. Self-contained.

import React, { memo, useCallback, useEffect, useState } from 'react';
import type { ThreadOverlayType } from '../models/OverlayTypes.std.js';
import * as OverlayService from '../services/OverlayService.dom.js';
import type { MessageRefInput } from '../services/MessageRefAdapter.std.js';
import { OverlayErrorBanner } from './OverlayErrorBanner.dom.js';

const { i18n } = window.SignalContext;

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const convThreads = await OverlayService.getThreadsForConversation(
          messageRefInput.conversationId
        );
        setThreads(convThreads);
        setMode(convThreads.length > 0 ? 'assign' : 'create');
      } catch {
        setErrorMessage(i18n('icu:Overlay--error-generic'));
      }
      setLoading(false);
    })();
  }, [messageRefInput.conversationId]);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) return;
    try {
      await OverlayService.createThread({
        conversationId: messageRefInput.conversationId,
        title: title.trim(),
        messageRefInput,
      });
      onClose();
    } catch {
      setErrorMessage(i18n('icu:Overlay--error-generic'));
    }
  }, [title, messageRefInput, onClose]);

  const handleAssign = useCallback(async () => {
    if (!selectedThreadRef) return;
    try {
      await OverlayService.assignMessageToThread({
        conversationId: messageRefInput.conversationId,
        messageRefInput,
        threadRef: selectedThreadRef,
      });
      onClose();
    } catch {
      setErrorMessage(i18n('icu:Overlay--error-generic'));
    }
  }, [selectedThreadRef, messageRefInput, onClose]);

  const dialogTitleId = 'overlay-thread-dialog-title';

  if (loading) {
    return (
      <div className="overlay-dialog__backdrop" onClick={onClose} role="presentation">
        <div
          className="overlay-dialog"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-labelledby={dialogTitleId}
        >
          <div className="overlay-dialog__body">{i18n('icu:Overlay--loading')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay-dialog__backdrop" onClick={onClose} role="presentation">
      <div
        className="overlay-dialog"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-labelledby={dialogTitleId}
      >
        <div className="overlay-dialog__header">
          <h3 id={dialogTitleId}>{i18n('icu:Overlay--dialog-add-to-thread')}</h3>
          <button
            type="button"
            className="overlay-dialog__close"
            onClick={onClose}
            aria-label={i18n('icu:Overlay--close')}
          >
            &times;
          </button>
        </div>

        <OverlayErrorBanner
          message={errorMessage}
          onDismiss={() => setErrorMessage(null)}
        />

        {threads.length > 0 && (
          <div className="overlay-dialog__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'assign'}
              className={`overlay-dialog__tab ${mode === 'assign' ? 'overlay-dialog__tab--active' : ''}`}
              onClick={() => setMode('assign')}
            >
              {i18n('icu:Overlay--existing-thread-tab')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'create'}
              className={`overlay-dialog__tab ${mode === 'create' ? 'overlay-dialog__tab--active' : ''}`}
              onClick={() => setMode('create')}
            >
              {i18n('icu:Overlay--new-thread-tab')}
            </button>
          </div>
        )}

        <div className="overlay-dialog__body">
          {mode === 'create' ? (
            <div className="overlay-dialog__create">
              <input
                type="text"
                className="overlay-dialog__input"
                placeholder={i18n('icu:Overlay--placeholder-thread-name')}
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
                {i18n('icu:Overlay--create-and-assign')}
              </button>
            </div>
          ) : (
            <div className="overlay-dialog__assign">
              <ul className="overlay-dialog__thread-list" role="listbox">
                {threads.map(thread => (
                  <li
                    key={thread.thread_ref}
                    role="option"
                    aria-selected={selectedThreadRef === thread.thread_ref}
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
                      {thread.is_pinned && <span aria-hidden="true">&#x1f4cc; </span>}
                      {thread.title || i18n('icu:Overlay--untitled')}
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
                {i18n('icu:Overlay--assign-to-thread')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
