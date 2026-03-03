// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// Overlay module public API barrel.
// Import from this file for types and feature flag access.
// Import directly from submodules for store operations (node-only).

export type {
  ThreadOverlayType,
  MessageOverlayType,
  CreateThreadOverlayInput,
  UpdateThreadOverlayInput,
  CreateMessageOverlayInput,
  UpdateMessageOverlayInput,
} from './models/OverlayTypes.std.js';

export {
  deriveMessageRef,
  getMessageRef,
  isPrimaryRef,
} from './services/MessageRefAdapter.std.js';

export type { MessageRefInput, MessageRefResult } from './services/MessageRefAdapter.std.js';

export {
  isOverlayThreadsEnabled,
  setOverlayThreadsEnabled,
  setOverlayThreadsEnabledForTesting,
} from './OverlayFeatureFlag.std.js';
