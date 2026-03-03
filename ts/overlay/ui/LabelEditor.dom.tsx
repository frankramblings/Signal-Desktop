// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// LabelEditor: compact dialog for adding/removing labels on a message
// overlay. Self-contained.

import React, { memo, useCallback, useEffect, useState } from 'react';
import * as OverlayService from '../services/OverlayService.dom.js';
import type { MessageRefInput } from '../services/MessageRefAdapter.std.js';
import { OverlayErrorBanner } from './OverlayErrorBanner.dom.js';

const { i18n } = window.SignalContext;

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const overlay = await OverlayService.getMessageOverlay(messageRefInput);
        setLabels(overlay?.labels ?? []);
      } catch {
        setErrorMessage(i18n('icu:Overlay--error-generic'));
      }
      setLoading(false);
    })();
  }, [messageRefInput]);

  const handleAdd = useCallback(async () => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    try {
      await OverlayService.addLabel(
        messageRefInput,
        messageRefInput.conversationId,
        trimmed
      );
      setLabels(prev => [...prev, trimmed]);
      setNewLabel('');
    } catch {
      setErrorMessage(i18n('icu:Overlay--error-generic'));
    }
  }, [newLabel, messageRefInput]);

  const handleRemove = useCallback(
    async (label: string) => {
      try {
        await OverlayService.removeLabel(messageRefInput, label);
        setLabels(prev => prev.filter(l => l !== label));
      } catch {
        setErrorMessage(i18n('icu:Overlay--error-generic'));
      }
    },
    [messageRefInput]
  );

  const dialogTitleId = 'overlay-label-editor-title';

  if (loading) {
    return (
      <div className="overlay-dialog__backdrop" onClick={onClose} role="presentation">
        <div
          className="overlay-label-editor"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-labelledby={dialogTitleId}
        >
          <div style={{ padding: 16 }}>{i18n('icu:Overlay--loading')}</div>
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
        aria-labelledby={dialogTitleId}
      >
        <div className="overlay-label-editor__header">
          <h4 id={dialogTitleId}>{i18n('icu:Overlay--dialog-edit-labels')}</h4>
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

        <div className="overlay-label-editor__tags">
          {labels.map(label => (
            <span key={label} className="overlay-label-editor__tag">
              {label}
              <button
                type="button"
                className="overlay-label-editor__tag-remove"
                onClick={() => void handleRemove(label)}
                aria-label={i18n('icu:Overlay--remove-label', { label })}
              >
                &times;
              </button>
            </span>
          ))}
          {labels.length === 0 && (
            <span className="overlay-label-editor__no-tags">
              {i18n('icu:Overlay--empty-labels')}
            </span>
          )}
        </div>

        <div className="overlay-label-editor__input-row">
          <input
            type="text"
            className="overlay-dialog__input"
            placeholder={i18n('icu:Overlay--placeholder-add-label')}
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
            {i18n('icu:Overlay--label-add')}
          </button>
        </div>
      </div>
    </div>
  );
});
