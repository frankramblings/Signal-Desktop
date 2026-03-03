// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// OverlayMenuActions: React component that manages overlay action dialogs
// triggered from the message context menu. Self-contained — does not require
// OverlayProvider. Renders nothing unless a dialog is open.

import React, { memo, useCallback, useState } from 'react';
import type { MessageRefInput } from '../services/MessageRefAdapter.std.js';
import { isOverlayThreadsEnabled } from '../OverlayFeatureFlag.std.js';
import { ThreadCreateDialog } from './ThreadCreateDialog.dom.js';
import { LabelEditor } from './LabelEditor.dom.js';

export type OverlayDialogType = 'thread' | 'label' | null;

export type OverlayMenuActionsProps = {
  messageRefInput: MessageRefInput | null;
  openDialog: OverlayDialogType;
  onClose: () => void;
};

export const OverlayMenuActions = memo(function OverlayMenuActions({
  messageRefInput,
  openDialog,
  onClose,
}: OverlayMenuActionsProps): React.JSX.Element | null {
  if (!isOverlayThreadsEnabled() || !messageRefInput || !openDialog) {
    return null;
  }

  if (openDialog === 'thread') {
    return (
      <ThreadCreateDialog messageRefInput={messageRefInput} onClose={onClose} />
    );
  }

  if (openDialog === 'label') {
    return (
      <LabelEditor
        messageRefInput={messageRefInput}
        onClose={onClose}
      />
    );
  }

  return null;
});

// ─── Hook for managing dialog state ───────────────────────────────────────

export type OverlayMenuState = {
  messageRefInput: MessageRefInput | null;
  openDialog: OverlayDialogType;
};

export function useOverlayMenuState(): {
  state: OverlayMenuState;
  openThreadDialog: (input: MessageRefInput) => void;
  openLabelDialog: (input: MessageRefInput) => void;
  closeDialog: () => void;
} {
  const [state, setState] = useState<OverlayMenuState>({
    messageRefInput: null,
    openDialog: null,
  });

  const openThreadDialog = useCallback((input: MessageRefInput) => {
    setState({ messageRefInput: input, openDialog: 'thread' });
  }, []);

  const openLabelDialog = useCallback((input: MessageRefInput) => {
    setState({ messageRefInput: input, openDialog: 'label' });
  }, []);

  const closeDialog = useCallback(() => {
    setState({ messageRefInput: null, openDialog: null });
  }, []);

  return { state, openThreadDialog, openLabelDialog, closeDialog };
}
