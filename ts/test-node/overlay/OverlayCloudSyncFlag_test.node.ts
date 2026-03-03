// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  isOverlayCloudSyncEnabled,
  setOverlayCloudSyncEnabledForTesting,
  setOverlayThreadsEnabledForTesting,
} from '../../overlay/OverlayFeatureFlag.std.js';

describe('overlay/OverlayFeatureFlag — cloud sync', () => {
  afterEach(() => {
    setOverlayThreadsEnabledForTesting(null);
    setOverlayCloudSyncEnabledForTesting(null);
  });

  it('defaults to false', () => {
    assert.isFalse(isOverlayCloudSyncEnabled());
  });

  it('returns false when overlayThreads is disabled even if sync override is true', () => {
    setOverlayThreadsEnabledForTesting(false);
    setOverlayCloudSyncEnabledForTesting(true);
    assert.isFalse(isOverlayCloudSyncEnabled());
  });

  it('returns true when both overlayThreads and sync are enabled', () => {
    setOverlayThreadsEnabledForTesting(true);
    setOverlayCloudSyncEnabledForTesting(true);
    assert.isTrue(isOverlayCloudSyncEnabled());
  });

  it('returns false when overlayThreads is enabled but sync is not', () => {
    setOverlayThreadsEnabledForTesting(true);
    setOverlayCloudSyncEnabledForTesting(false);
    assert.isFalse(isOverlayCloudSyncEnabled());
  });
});
