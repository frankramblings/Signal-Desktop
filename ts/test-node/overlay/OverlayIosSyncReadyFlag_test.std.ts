// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  isOverlayIosSyncReady,
  setOverlayIosSyncReadyForTesting,
  setOverlayCloudSyncEnabledForTesting,
  setOverlayThreadsEnabledForTesting,
} from '../../overlay/OverlayFeatureFlag.std.js';

describe('overlay/OverlayFeatureFlag — iOS sync ready', () => {
  afterEach(() => {
    setOverlayThreadsEnabledForTesting(null);
    setOverlayCloudSyncEnabledForTesting(null);
    setOverlayIosSyncReadyForTesting(null);
  });

  it('defaults to false', () => {
    assert.isFalse(isOverlayIosSyncReady());
  });

  it('returns false when cloud sync is disabled', () => {
    setOverlayThreadsEnabledForTesting(true);
    setOverlayCloudSyncEnabledForTesting(false);
    setOverlayIosSyncReadyForTesting(true);
    assert.isFalse(isOverlayIosSyncReady());
  });

  it('returns false when overlay threads are disabled', () => {
    setOverlayThreadsEnabledForTesting(false);
    setOverlayCloudSyncEnabledForTesting(true);
    setOverlayIosSyncReadyForTesting(true);
    assert.isFalse(isOverlayIosSyncReady());
  });

  it('returns true when all three flags are enabled', () => {
    setOverlayThreadsEnabledForTesting(true);
    setOverlayCloudSyncEnabledForTesting(true);
    setOverlayIosSyncReadyForTesting(true);
    assert.isTrue(isOverlayIosSyncReady());
  });

  it('returns false when ios sync ready is off but others are on', () => {
    setOverlayThreadsEnabledForTesting(true);
    setOverlayCloudSyncEnabledForTesting(true);
    setOverlayIosSyncReadyForTesting(false);
    assert.isFalse(isOverlayIosSyncReady());
  });
});
