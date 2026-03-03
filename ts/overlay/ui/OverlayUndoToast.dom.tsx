// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// OverlayUndoToast: fixed-position toast shown after destructive overlay actions.
// Shows for 5s with an Undo button. Listens to OverlayEventBus for new undo entries.

import React, { memo, useCallback, useEffect, useState } from 'react';
import { overlayUndo } from '../services/OverlayUndoManager.dom.js';
import { overlayEvents, OverlayEventType } from '../services/OverlayEventBus.dom.js';
import type { UndoEntry } from '../services/OverlayUndoManager.dom.js';

const { i18n } = window.SignalContext;

const TOAST_DURATION_MS = 5000;

export const OverlayUndoToast = memo(function OverlayUndoToast(): React.JSX.Element | null {
  const [entry, setEntry] = useState<UndoEntry | null>(null);

  // Listen for new undo entries by checking after every mutation event
  useEffect(() => {
    const handler = () => {
      const latest = overlayUndo.peek();
      setEntry(latest);
    };
    overlayEvents.on(OverlayEventType.ThreadsChanged, handler);
    overlayEvents.on(OverlayEventType.MessagesChanged, handler);
    overlayEvents.on(OverlayEventType.LabelsChanged, handler);
    return () => {
      overlayEvents.off(OverlayEventType.ThreadsChanged, handler);
      overlayEvents.off(OverlayEventType.MessagesChanged, handler);
      overlayEvents.off(OverlayEventType.LabelsChanged, handler);
    };
  }, []);

  // Auto-dismiss after timeout
  useEffect(() => {
    if (!entry) return undefined;
    const timer = setTimeout(() => setEntry(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [entry]);

  const handleUndo = useCallback(async () => {
    const popped = overlayUndo.pop();
    if (popped) {
      await popped.execute();
    }
    setEntry(null);
  }, []);

  const handleDismiss = useCallback(() => {
    setEntry(null);
  }, []);

  if (!entry) return null;

  return (
    <div className="overlay-undo-toast" role="alert" aria-live="polite">
      <span className="overlay-undo-toast__message">{entry.description}</span>
      <button
        type="button"
        className="overlay-undo-toast__undo-btn"
        onClick={() => void handleUndo()}
      >
        {i18n('icu:Overlay--undo-action')}
      </button>
      <button
        type="button"
        className="overlay-undo-toast__dismiss"
        onClick={handleDismiss}
        aria-label="Close"
      >
        &times;
      </button>
    </div>
  );
});
