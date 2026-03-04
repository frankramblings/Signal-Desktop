// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// OverlayEventBus: lightweight pub/sub for overlay mutations.
// Components subscribe instead of polling. OverlayService emits after writes.

export enum OverlayEventType {
  ThreadsChanged = 'overlay:threads-changed',
  MessagesChanged = 'overlay:messages-changed',
  LabelsChanged = 'overlay:labels-changed',
  SyncStarted = 'overlay:sync-started',
  SyncCompleted = 'overlay:sync-completed',
  SyncFailed = 'overlay:sync-failed',
}

type Handler = () => void;

class OverlayEventBus {
  private listeners = new Map<OverlayEventType, Set<Handler>>();

  on(event: OverlayEventType, handler: Handler): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
  }

  off(event: OverlayEventType, handler: Handler): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: OverlayEventType): void {
    this.listeners.get(event)?.forEach(h => h());
  }
}

export const overlayEvents = new OverlayEventBus();
