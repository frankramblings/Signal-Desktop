// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// CloudKitAdapter: abstract interface for CloudKit sync operations.
// Decouples sync engine from HTTP transport for testability and
// potential future backend swaps.

import type {
  SyncRecord,
  FetchChangesResult,
  PushResult,
  CloudKitConfig,
} from './OverlaySyncTypes.std.js';

export interface CloudKitAdapter {
  /**
   * Initialize the adapter with config and ensure the record zone exists.
   * Must be called before any sync operations.
   */
  initialize(config: CloudKitConfig): Promise<void>;

  /**
   * Fetch changes from CloudKit since the given sync token.
   * Pass null for initial full fetch.
   */
  fetchChanges(syncToken: string | null): Promise<FetchChangesResult>;

  /**
   * Push local records to CloudKit.
   * Returns which records succeeded and which failed.
   */
  pushRecords(records: ReadonlyArray<SyncRecord>): Promise<PushResult>;

  /**
   * Check if the adapter is properly initialized and authenticated.
   */
  isReady(): boolean;
}
