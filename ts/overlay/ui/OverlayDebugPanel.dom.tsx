// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// OverlayDebugPanel: development-only panel that shows the derived message_ref
// for a selected message. Visible only when:
//   1. overlayThreadsEnabled feature flag is ON, AND
//   2. running in a dev/internal build (checked by caller).
//
// This component is intentionally minimal — it is a diagnostic tool for M0,
// not production UI. It can be embedded in the existing devtools overlay or
// shown via a keyboard shortcut in dev builds.

import React from 'react';
import {
  deriveMessageRef,
  isPrimaryRef,
} from '../services/MessageRefAdapter.std.js';
import type { MessageRefInput } from '../services/MessageRefAdapter.std.js';

export type OverlayDebugPanelProps = Readonly<{
  // The message being inspected.
  messageInput: MessageRefInput;
  // Whether the overlay feature flag is enabled (checked by parent).
  isEnabled: boolean;
}>;

export function OverlayDebugPanel({
  messageInput,
  isEnabled,
}: OverlayDebugPanelProps): React.JSX.Element | null {
  if (!isEnabled) {
    return null;
  }

  const result = deriveMessageRef(messageInput);
  const { ref, strategy } = result;
  const primary =
    ref != null
      ? isPrimaryRef(ref, messageInput.conversationId)
      : false;

  return (
    <div
      style={{
        fontFamily: 'monospace',
        fontSize: '11px',
        background: '#1a1a2e',
        color: '#e0e0e0',
        border: '1px solid #444',
        borderRadius: '4px',
        padding: '8px 10px',
        maxWidth: '480px',
        wordBreak: 'break-all',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#7ec8e3' }}>
        Overlay Debug — message_ref
      </div>
      <div>
        <span style={{ color: '#aaa' }}>strategy: </span>
        <span style={{ color: strategyColor(strategy) }}>{strategy}</span>
      </div>
      <div>
        <span style={{ color: '#aaa' }}>ref: </span>
        <span style={{ color: ref ? '#b5e7a0' : '#ff6b6b' }}>
          {ref ?? '(none)'}
        </span>
      </div>
      {ref != null && (
        <div>
          <span style={{ color: '#aaa' }}>stable: </span>
          <span style={{ color: primary ? '#b5e7a0' : '#ffd166' }}>
            {primary ? 'yes (primary)' : 'no (fallback — upgrade when ID available)'}
          </span>
        </div>
      )}
    </div>
  );
}

function strategyColor(strategy: string): string {
  if (strategy === 'primary') {
    return '#b5e7a0';
  }
  if (strategy === 'fallback') {
    return '#ffd166';
  }
  return '#ff6b6b';
}
