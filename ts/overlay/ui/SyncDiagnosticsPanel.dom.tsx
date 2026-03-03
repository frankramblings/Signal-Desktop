// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// SyncDiagnosticsPanel: displays CloudKit sync status, last sync time,
// errors, and a manual "Sync Now" button. Shown in overlay settings area.

import React, { useCallback, useEffect, useState } from 'react';
import { SyncStatus } from '../sync/OverlaySyncTypes.std.js';
import type { SyncDiagnostics } from '../sync/OverlaySyncTypes.std.js';

const { i18n } = window.SignalContext;

export type SyncDiagnosticsPanelProps = {
  getDiagnostics: () => SyncDiagnostics;
  onDiagnosticsChange: (handler: () => void) => () => void;
  onSyncNow: () => void;
};

function formatTimestamp(ts: number | null): string {
  if (ts == null) {
    return i18n('icu:Overlay--sync-never');
  }
  return new Date(ts).toLocaleString();
}

function statusLabel(status: SyncStatus): string {
  switch (status) {
    case SyncStatus.Idle:
      return i18n('icu:Overlay--sync-status-idle');
    case SyncStatus.Syncing:
      return i18n('icu:Overlay--sync-status-syncing');
    case SyncStatus.Error:
      return i18n('icu:Overlay--sync-status-error');
    default:
      return status;
  }
}

function statusIndicatorClass(status: SyncStatus): string {
  switch (status) {
    case SyncStatus.Idle:
      return 'overlay-sync-indicator--idle';
    case SyncStatus.Syncing:
      return 'overlay-sync-indicator--syncing';
    case SyncStatus.Error:
      return 'overlay-sync-indicator--error';
    default:
      return '';
  }
}

export function SyncDiagnosticsPanel({
  getDiagnostics,
  onDiagnosticsChange,
  onSyncNow,
}: SyncDiagnosticsPanelProps): JSX.Element {
  const [diagnostics, setDiagnostics] = useState<SyncDiagnostics>(
    getDiagnostics
  );

  useEffect(() => {
    const unsubscribe = onDiagnosticsChange(() => {
      setDiagnostics(getDiagnostics());
    });
    return unsubscribe;
  }, [getDiagnostics, onDiagnosticsChange]);

  const handleSyncNow = useCallback(() => {
    onSyncNow();
  }, [onSyncNow]);

  const isSyncing = diagnostics.status === SyncStatus.Syncing;

  return (
    <div
      className="overlay-sync-diagnostics"
      role="region"
      aria-label={i18n('icu:Overlay--sync-diagnostics-label')}
    >
      <h3 className="overlay-sync-diagnostics__title">
        {i18n('icu:Overlay--sync-diagnostics-title')}
      </h3>

      <div className="overlay-sync-diagnostics__row">
        <span className="overlay-sync-diagnostics__label">
          {i18n('icu:Overlay--sync-status')}
        </span>
        <span className="overlay-sync-diagnostics__value">
          <span
            className={`overlay-sync-indicator ${statusIndicatorClass(diagnostics.status)}`}
            aria-hidden="true"
          />
          {statusLabel(diagnostics.status)}
        </span>
      </div>

      <div className="overlay-sync-diagnostics__row">
        <span className="overlay-sync-diagnostics__label">
          {i18n('icu:Overlay--sync-last-sync')}
        </span>
        <span className="overlay-sync-diagnostics__value">
          {formatTimestamp(diagnostics.lastSyncAt)}
        </span>
      </div>

      {diagnostics.lastError && (
        <div
          className="overlay-sync-diagnostics__row overlay-sync-diagnostics__row--error"
          role="alert"
        >
          <span className="overlay-sync-diagnostics__label">
            {i18n('icu:Overlay--sync-last-error')}
          </span>
          <span className="overlay-sync-diagnostics__value overlay-sync-diagnostics__value--error">
            {diagnostics.lastError}
            {diagnostics.lastErrorAt && (
              <span className="overlay-sync-diagnostics__error-time">
                {' '}({formatTimestamp(diagnostics.lastErrorAt)})
              </span>
            )}
          </span>
        </div>
      )}

      <div className="overlay-sync-diagnostics__row">
        <span className="overlay-sync-diagnostics__label">
          {i18n('icu:Overlay--sync-threads-synced')}
        </span>
        <span className="overlay-sync-diagnostics__value">
          {diagnostics.threadsSynced}
        </span>
      </div>

      <div className="overlay-sync-diagnostics__row">
        <span className="overlay-sync-diagnostics__label">
          {i18n('icu:Overlay--sync-messages-synced')}
        </span>
        <span className="overlay-sync-diagnostics__value">
          {diagnostics.messagesSynced}
        </span>
      </div>

      <button
        type="button"
        className="overlay-sync-diagnostics__sync-button"
        onClick={handleSyncNow}
        disabled={isSyncing}
        aria-busy={isSyncing}
      >
        {isSyncing
          ? i18n('icu:Overlay--sync-syncing')
          : i18n('icu:Overlay--sync-now')}
      </button>
    </div>
  );
}
