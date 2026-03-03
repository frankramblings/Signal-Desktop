// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// ThreadChipRow: compact row of thread chips shown above the conversation
// timeline when overlay is enabled. Self-contained — loads data from
// OverlayService directly.

import React, { memo, useCallback, useEffect, useState } from 'react';
import type { ThreadOverlayType } from '../models/OverlayTypes.std.js';
import * as OverlayService from '../services/OverlayService.dom.js';
import { isOverlayThreadsEnabled } from '../OverlayFeatureFlag.std.js';

export type ThreadChipRowProps = {
  conversationId: string;
};

export const ThreadChipRow = memo(function ThreadChipRow({
  conversationId,
}: ThreadChipRowProps): React.JSX.Element | null {
  const [threads, setThreads] = useState<ReadonlyArray<ThreadOverlayType>>([]);
  const [selectedThreadRef, setSelectedThreadRef] = useState<string | null>(null);

  useEffect(() => {
    if (!isOverlayThreadsEnabled()) return;
    let cancelled = false;
    void (async () => {
      const t = await OverlayService.getThreadsForConversation(conversationId);
      if (!cancelled) setThreads(t);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Refresh on a moderate interval to pick up changes from context menu actions.
  useEffect(() => {
    if (!isOverlayThreadsEnabled()) return undefined;
    const interval = setInterval(async () => {
      const t = await OverlayService.getThreadsForConversation(conversationId);
      setThreads(t);
    }, 3000);
    return () => clearInterval(interval);
  }, [conversationId]);

  const handleChipClick = useCallback(
    (threadRef: string) => {
      setSelectedThreadRef(prev =>
        prev === threadRef ? null : threadRef
      );
    },
    []
  );

  if (!isOverlayThreadsEnabled() || threads.length === 0) {
    return null;
  }

  return (
    <div className="overlay-thread-chip-row">
      <span className="overlay-thread-chip-row__label">Threads:</span>
      <div className="overlay-thread-chip-row__chips">
        {threads.map(thread => {
          const isActive = selectedThreadRef === thread.thread_ref;
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
              title={thread.title ?? 'Unnamed thread'}
            >
              {thread.is_pinned && (
                <span className="overlay-thread-chip__pin-icon" aria-hidden>
                  &#x1f4cc;
                </span>
              )}
              <span className="overlay-thread-chip__title">
                {thread.title || 'Untitled'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
