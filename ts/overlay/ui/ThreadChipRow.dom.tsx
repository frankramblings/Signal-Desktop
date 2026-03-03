// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// ThreadChipRow: compact row of thread chips shown above the conversation
// timeline when overlay is enabled. Supports filtering by thread.
// Event-driven refresh via OverlayEventBus (no polling).

import React, { memo, useCallback, useEffect, useState } from 'react';
import type { ThreadOverlayType } from '../models/OverlayTypes.std.js';
import * as OverlayService from '../services/OverlayService.dom.js';
import { isOverlayThreadsEnabled } from '../OverlayFeatureFlag.std.js';
import { overlayEvents, OverlayEventType } from '../services/OverlayEventBus.dom.js';

const { i18n } = window.SignalContext;

export type ThreadChipRowProps = {
  conversationId: string;
  activeFilterThreadRef: string | null;
  onFilterChange: (threadRef: string | null) => void;
};

export const ThreadChipRow = memo(function ThreadChipRow({
  conversationId,
  activeFilterThreadRef,
  onFilterChange,
}: ThreadChipRowProps): React.JSX.Element | null {
  const [threads, setThreads] = useState<ReadonlyArray<ThreadOverlayType>>([]);

  const loadThreads = useCallback(async () => {
    if (!isOverlayThreadsEnabled()) return;
    try {
      const t = await OverlayService.getThreadsForConversation(conversationId);
      setThreads(t);
    } catch {
      // Fail open — show no chips rather than crash
    }
  }, [conversationId]);

  // Initial load
  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  // Event-driven refresh (replaces 3s polling)
  useEffect(() => {
    if (!isOverlayThreadsEnabled()) return undefined;
    const handler = () => void loadThreads();
    overlayEvents.on(OverlayEventType.ThreadsChanged, handler);
    overlayEvents.on(OverlayEventType.MessagesChanged, handler);
    return () => {
      overlayEvents.off(OverlayEventType.ThreadsChanged, handler);
      overlayEvents.off(OverlayEventType.MessagesChanged, handler);
    };
  }, [loadThreads]);

  const handleChipClick = useCallback(
    (threadRef: string) => {
      onFilterChange(activeFilterThreadRef === threadRef ? null : threadRef);
    },
    [activeFilterThreadRef, onFilterChange]
  );

  const handleAllClick = useCallback(() => {
    onFilterChange(null);
  }, [onFilterChange]);

  if (!isOverlayThreadsEnabled() || threads.length === 0) {
    return null;
  }

  return (
    <div
      className="overlay-thread-chip-row"
      role="toolbar"
      aria-label={i18n('icu:Overlay--thread-chip-row-label')}
    >
      <span className="overlay-thread-chip-row__label" aria-hidden="true">
        {i18n('icu:Overlay--thread-chip-row-label')}
      </span>
      <div className="overlay-thread-chip-row__chips" role="group">
        <button
          type="button"
          className={`overlay-thread-chip ${
            activeFilterThreadRef === null ? 'overlay-thread-chip--active' : ''
          }`}
          onClick={handleAllClick}
          aria-pressed={activeFilterThreadRef === null}
        >
          <span className="overlay-thread-chip__title">
            {i18n('icu:Overlay--all-messages')}
          </span>
        </button>
        {threads.map(thread => {
          const isActive = activeFilterThreadRef === thread.thread_ref;
          const chipClass = [
            'overlay-thread-chip',
            isActive ? 'overlay-thread-chip--active' : '',
            thread.is_pinned ? 'overlay-thread-chip--pinned' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={thread.thread_ref}
              type="button"
              className={chipClass}
              onClick={() => handleChipClick(thread.thread_ref)}
              aria-pressed={isActive}
              title={thread.title ?? i18n('icu:Overlay--unnamed-thread')}
            >
              {thread.is_pinned && (
                <span className="overlay-thread-chip__pin-icon" aria-hidden="true">
                  &#x1f4cc;
                </span>
              )}
              <span className="overlay-thread-chip__title">
                {thread.title || i18n('icu:Overlay--untitled')}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
