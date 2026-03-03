// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// OverlayErrorBanner: non-blocking inline error banner for overlay operations.
// Auto-dismisses after 8s. Closeable via button.

import React, { memo, useEffect } from 'react';

const AUTO_DISMISS_MS = 8000;

export type OverlayErrorBannerProps = {
  message: string | null;
  onDismiss: () => void;
};

export const OverlayErrorBanner = memo(function OverlayErrorBanner({
  message,
  onDismiss,
}: OverlayErrorBannerProps): React.JSX.Element | null {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div className="overlay-error-banner" role="alert">
      <span className="overlay-error-banner__message">{message}</span>
      <button
        type="button"
        className="overlay-error-banner__close"
        onClick={onDismiss}
        aria-label="Close"
      >
        &times;
      </button>
    </div>
  );
});
