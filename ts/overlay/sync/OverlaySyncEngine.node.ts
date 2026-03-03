// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// OverlaySyncEngine: orchestrates the pull→merge→push sync loop.
// Runs in the main Node process. Non-blocking — failures never block
// local overlay operations.

import { v4 as generateUuid } from 'uuid';
import type { WritableDB } from '../../sql/Interface.std.js';
import type { CloudKitAdapter } from './CloudKitAdapter.std.js';
import {
  SyncStatus,
  type SyncDiagnostics,
  type SyncRecord,
  type ThreadSyncRecord,
  type MessageSyncRecord,
  type CloudKitConfig,
  type OverlaySyncState,
} from './OverlaySyncTypes.std.js';
import { mergeRemoteRecords } from './OverlaySyncMerger.node.js';
import {
  getThreadsDirtySince,
  getMessagesDirtySince,
  getSyncState,
  setSyncState,
} from './OverlaySyncStoreExtensions.node.js';
import * as log from '../../logging/log.js';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STARTUP_DELAY_MS = 5 * 1000; // 5 seconds after app start
const DEBOUNCE_PUSH_MS = 10 * 1000; // 10 seconds after local write
const MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes
const INITIAL_BACKOFF_MS = 1000; // 1 second

export class OverlaySyncEngine {
  private adapter: CloudKitAdapter;
  private db: WritableDB | null = null;
  private deviceId: string;

  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  private currentBackoff = INITIAL_BACKOFF_MS;
  private consecutiveFailures = 0;
  private isSyncing = false;
  private stopped = false;

  // Diagnostics state
  private _status: SyncStatus = SyncStatus.Idle;
  private _lastSyncAt: number | null = null;
  private _lastError: string | null = null;
  private _lastErrorAt: number | null = null;
  private _threadsSynced = 0;
  private _messagesSynced = 0;

  // Listeners for diagnostics changes
  private listeners: Array<() => void> = [];

  constructor(adapter: CloudKitAdapter) {
    this.adapter = adapter;
    this.deviceId = generateUuid();
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  async start(db: WritableDB, config: CloudKitConfig): Promise<void> {
    if (this.stopped) {
      return;
    }

    this.db = db;

    try {
      await this.adapter.initialize(config);
    } catch (err) {
      log.error('OverlaySyncEngine: failed to initialize adapter', err);
      this.setError(
        err instanceof Error ? err.message : 'Adapter init failed'
      );
      return;
    }

    // Load existing device ID from sync state if available
    const existing = getSyncState(db, this.deviceId);
    if (existing) {
      this._lastSyncAt = existing.last_sync_at;
    }

    // Schedule initial sync after startup delay
    setTimeout(() => {
      if (!this.stopped) {
        void this.sync();
      }
    }, STARTUP_DELAY_MS);

    // Schedule periodic sync
    this.intervalTimer = setInterval(() => {
      if (!this.stopped) {
        void this.sync();
      }
    }, SYNC_INTERVAL_MS);

    log.info('OverlaySyncEngine: started');
  }

  stop(): void {
    this.stopped = true;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    log.info('OverlaySyncEngine: stopped');
  }

  // ─── Trigger sync on local writes ──────────────────────────────────────

  notifyLocalChange(): void {
    if (this.stopped || !this.db) {
      return;
    }

    // Debounce: wait 10s after last write before pushing
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      if (!this.stopped) {
        void this.sync();
      }
    }, DEBOUNCE_PUSH_MS);
  }

  // ─── Manual sync trigger ──────────────────────────────────────────────

  async syncNow(): Promise<void> {
    return this.sync();
  }

  // ─── Core sync loop ───────────────────────────────────────────────────

  private async sync(): Promise<void> {
    if (this.isSyncing || this.stopped || !this.db || !this.adapter.isReady()) {
      return;
    }

    this.isSyncing = true;
    this.setStatus(SyncStatus.Syncing);

    try {
      const db = this.db;

      // 1. Load sync state
      const syncState = getSyncState(db, this.deviceId);
      let syncToken = syncState?.last_sync_token ?? null;
      const lastSyncAt = syncState?.last_sync_at ?? 0;

      // 2. PULL: fetch remote changes
      let hasMore = true;
      let pulledThreads = 0;
      let pulledMessages = 0;

      while (hasMore) {
        const result = await this.adapter.fetchChanges(syncToken);
        if (result.records.length > 0) {
          const mergeResult = mergeRemoteRecords(db, result.records);
          pulledThreads +=
            mergeResult.threadsInserted + mergeResult.threadsUpdated + mergeResult.threadsDeleted;
          pulledMessages +=
            mergeResult.messagesInserted + mergeResult.messagesUpdated + mergeResult.messagesDeleted;
          log.info(
            `OverlaySyncEngine: merged ${result.records.length} remote records`,
            mergeResult
          );
        }
        syncToken = result.newSyncToken;
        hasMore = result.hasMore;
      }

      // 3. PUSH: send local dirty records
      const dirtyThreads = getThreadsDirtySince(db, lastSyncAt);
      const dirtyMessages = getMessagesDirtySince(db, lastSyncAt);

      const dirtyRecords: Array<SyncRecord> = [
        ...dirtyThreads.map(
          (t): ThreadSyncRecord => ({ ...t, _type: 'thread_overlay' })
        ),
        ...dirtyMessages.map(
          (m): MessageSyncRecord => ({ ...m, _type: 'message_overlay' })
        ),
      ];

      if (dirtyRecords.length > 0) {
        const pushResult = await this.adapter.pushRecords(dirtyRecords);
        if (pushResult.failedRecords.length > 0) {
          log.warn(
            `OverlaySyncEngine: ${pushResult.failedRecords.length} records failed to push`
          );
        }
        log.info(
          `OverlaySyncEngine: pushed ${pushResult.savedRecords.length} records`
        );
      }

      // 4. Save sync state
      const now = Date.now();
      setSyncState(db, {
        device_id: this.deviceId,
        last_sync_token: syncToken,
        last_sync_at: now,
      });

      // Update diagnostics
      this._lastSyncAt = now;
      this._threadsSynced += dirtyThreads.length + pulledThreads;
      this._messagesSynced += dirtyMessages.length + pulledMessages;
      this.consecutiveFailures = 0;
      this.currentBackoff = INITIAL_BACKOFF_MS;
      this.setStatus(SyncStatus.Idle);

      const totalPulled = pulledThreads + pulledMessages;
      log.info(
        `OverlaySyncEngine: sync completed. Pulled ${totalPulled}, pushed ${dirtyRecords.length}`
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown sync error';
      log.error('OverlaySyncEngine: sync failed', err);
      this.setError(message);
      this.scheduleRetry();
    } finally {
      this.isSyncing = false;
    }
  }

  // ─── Retry with exponential backoff ───────────────────────────────────

  private scheduleRetry(): void {
    this.consecutiveFailures += 1;
    this.currentBackoff = Math.min(
      INITIAL_BACKOFF_MS * Math.pow(2, this.consecutiveFailures - 1),
      MAX_BACKOFF_MS
    );

    log.info(
      `OverlaySyncEngine: scheduling retry in ${this.currentBackoff}ms ` +
        `(attempt ${this.consecutiveFailures})`
    );

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
    this.retryTimer = setTimeout(() => {
      if (!this.stopped) {
        void this.sync();
      }
    }, this.currentBackoff);
  }

  // ─── Diagnostics ──────────────────────────────────────────────────────

  getDiagnostics(): SyncDiagnostics {
    return {
      status: this._status,
      lastSyncAt: this._lastSyncAt,
      lastError: this._lastError,
      lastErrorAt: this._lastErrorAt,
      threadsSynced: this._threadsSynced,
      messagesSynced: this._messagesSynced,
    };
  }

  onDiagnosticsChange(handler: () => void): () => void {
    this.listeners.push(handler);
    return () => {
      this.listeners = this.listeners.filter(h => h !== handler);
    };
  }

  private setStatus(status: SyncStatus): void {
    this._status = status;
    this.notifyListeners();
  }

  private setError(message: string): void {
    this._status = SyncStatus.Error;
    this._lastError = message;
    this._lastErrorAt = Date.now();
    this.notifyListeners();
  }

  private notifyListeners(): void {
    for (const handler of this.listeners) {
      try {
        handler();
      } catch {
        // Never let a listener crash the engine
      }
    }
  }
}
