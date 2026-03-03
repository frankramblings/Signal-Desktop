// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// Local feature flag for overlay thread functionality.
//
// Intentionally kept independent of Signal's server-driven RemoteConfig so
// that the overlay feature can be toggled locally without a server round-trip.
// Default is OFF for all build types; toggle via dev settings or tests.

const FLAG_KEY = 'overlayThreadsEnabled';
const SYNC_FLAG_KEY = 'overlayCloudSyncEnabled';

// Module-level overrides, used in tests and dev builds.
let _override: boolean | null = null;
let _syncOverride: boolean | null = null;

/**
 * Returns true when the overlay threads feature is enabled.
 *
 * Resolution order:
 *   1. Test/dev override set via `setOverlayThreadsEnabledForTesting()`
 *   2. Value from window.storage (persisted user preference)
 *   3. Default: false
 */
export function isOverlayThreadsEnabled(): boolean {
  if (_override !== null) {
    return _override;
  }

  // In browser/preload context, window.storage may be available.
  if (
    typeof window !== 'undefined' &&
    window.storage &&
    typeof window.storage.get === 'function'
  ) {
    return window.storage.get(FLAG_KEY, false) === true;
  }

  return false;
}

/**
 * Persists the flag value via window.storage when available.
 * Used by the dev settings panel.
 */
export async function setOverlayThreadsEnabled(enabled: boolean): Promise<void> {
  if (
    typeof window !== 'undefined' &&
    window.storage &&
    typeof window.storage.put === 'function'
  ) {
    await window.storage.put(FLAG_KEY, enabled);
  }
}

/**
 * Synchronous override for use in unit tests only.
 * Call with `null` to restore default behaviour.
 */
export function setOverlayThreadsEnabledForTesting(
  value: boolean | null
): void {
  _override = value;
}

// ─── CloudKit sync feature flag ──────────────────────────────────────────────

/**
 * Returns true when CloudKit sync for overlay data is enabled.
 * Requires overlayThreadsEnabled to also be true.
 */
export function isOverlayCloudSyncEnabled(): boolean {
  if (!isOverlayThreadsEnabled()) {
    return false;
  }

  if (_syncOverride !== null) {
    return _syncOverride;
  }

  if (
    typeof window !== 'undefined' &&
    window.storage &&
    typeof window.storage.get === 'function'
  ) {
    return window.storage.get(SYNC_FLAG_KEY, false) === true;
  }

  return false;
}

export async function setOverlayCloudSyncEnabled(
  enabled: boolean
): Promise<void> {
  if (
    typeof window !== 'undefined' &&
    window.storage &&
    typeof window.storage.put === 'function'
  ) {
    await window.storage.put(SYNC_FLAG_KEY, enabled);
  }
}

export function setOverlayCloudSyncEnabledForTesting(
  value: boolean | null
): void {
  _syncOverride = value;
}
