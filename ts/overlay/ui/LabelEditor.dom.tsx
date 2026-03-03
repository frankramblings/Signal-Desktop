// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// LabelEditor: compact dialog for adding/removing labels on a message
// overlay. Self-contained — calls OverlayService directly.

import React, { memo, useCallback, useEffect, useState } from 'react';
import * as OverlayService from '../services/OverlayService.dom.js';
import type { MessageRefInput } from '../services/MessageRefAdapter.std.js';

export type LabelEditorProps = {
  messageRefInput: MessageRefInput;
  onClose: () => void;
};

export const LabelEditor = memo(function LabelEditor({
  messageRefInput,
  onClose,
}: LabelEditorProps): React.JSX.Element {
  const [labels, setLabels] = useState<ReadonlyArray<string>>([]);
  const [newLabel, setNewLabel] = useState('');
  const [loading, setLoading] = useState(true);

  // Load existing labels for this message.
  useEffect(() => {
    void (async () => {
      const overlay = await OverlayService.getMessageOverlay(messageRefInput);
      setLabels(overlay?.labels ?? []);
      setLoading(false);
    })();
  }, [messageRefInput]);

  const handleAdd = useCallback(async () => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    await OverlayService.addLabel(
      messageRefInput,
      messageRefInput.conversationId,
      trimmed
    );
    setLabels(prev => [...prev, trimmed]);
    setNewLabel('');
  }, [newLabel, messageRefInput]);

  const handleRemove = useCallback(
    async (label: string) => {
      await OverlayService.removeLabel(messageRefInput, label);
      setLabels(prev => prev.filter(l => l !== label));
    },
    [messageRefInput]
  );

  if (loading) {
    return (
      <div className="overlay-dialog__backdrop" onClick={onClose} role="presentation">
        <div className="overlay-label-editor" onClick={e => e.stopPropagation()} role="dialog" aria-label="Edit labels">
          <div style={{ padding: 16 }}>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay-dialog__backdrop" onClick={onClose} role="presentation">
      <div
        className="overlay-label-editor"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Edit labels"
      >
        <div className="overlay-label-editor__header">
          <h4>Labels</h4>
          <button
            type="button"
            className="overlay-dialog__close"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <div className="overlay-label-editor__tags">
          {labels.map(label => (
            <span key={label} className="overlay-label-editor__tag">
              {label}
              <button
                type="button"
                className="overlay-label-editor__tag-remove"
                onClick={() => void handleRemove(label)}
                title={`Remove label "${label}"`}
              >
                &times;
              </button>
            </span>
          ))}
          {labels.length === 0 && (
            <span className="overlay-label-editor__no-tags">No labels yet</span>
          )}
        </div>

        <div className="overlay-label-editor__input-row">
          <input
            type="text"
            className="overlay-dialog__input"
            placeholder="Add label..."
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void handleAdd();
              if (e.key === 'Escape') onClose();
            }}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <button
            type="button"
            className="overlay-dialog__btn overlay-dialog__btn--primary"
            onClick={() => void handleAdd()}
            disabled={!newLabel.trim()}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
});
