# M2 UX Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden the overlay UX with thread filtering, empty/error states, soft undo, a11y/i18n, and event-driven refresh.

**Architecture:** All changes stay inside `ts/overlay/` + existing M1 integration points. No new Signal core touchpoints. Thread filter is ConversationView-local state. Event bus replaces polling. Undo is session-scoped in-memory stack.

**Tech Stack:** React, TypeScript, EventTarget, Signal i18n (`i18n('icu:...')`), SCSS with CSS custom properties.

---

### Task 1: OverlayEventBus — event-driven refresh foundation

**Files:**
- Create: `ts/overlay/services/OverlayEventBus.dom.ts`
- Test: `ts/test-node/overlay/OverlayEventBus_test.node.ts`

**Step 1: Write the test file**

```typescript
// ts/test-node/overlay/OverlayEventBus_test.node.ts
import { assert } from 'chai';
import {
  overlayEvents,
  OverlayEventType,
} from '../../overlay/services/OverlayEventBus.dom.js';

describe('overlay/OverlayEventBus', () => {
  it('fires threads-changed event', () => {
    let called = false;
    const handler = () => { called = true; };
    overlayEvents.on(OverlayEventType.ThreadsChanged, handler);
    overlayEvents.emit(OverlayEventType.ThreadsChanged);
    assert.isTrue(called);
    overlayEvents.off(OverlayEventType.ThreadsChanged, handler);
  });

  it('fires messages-changed event', () => {
    let called = false;
    const handler = () => { called = true; };
    overlayEvents.on(OverlayEventType.MessagesChanged, handler);
    overlayEvents.emit(OverlayEventType.MessagesChanged);
    assert.isTrue(called);
    overlayEvents.off(OverlayEventType.MessagesChanged, handler);
  });

  it('fires labels-changed event', () => {
    let called = false;
    const handler = () => { called = true; };
    overlayEvents.on(OverlayEventType.LabelsChanged, handler);
    overlayEvents.emit(OverlayEventType.LabelsChanged);
    assert.isTrue(called);
    overlayEvents.off(OverlayEventType.LabelsChanged, handler);
  });

  it('does not fire for unsubscribed events', () => {
    let called = false;
    const handler = () => { called = true; };
    overlayEvents.on(OverlayEventType.ThreadsChanged, handler);
    overlayEvents.emit(OverlayEventType.MessagesChanged);
    assert.isFalse(called);
    overlayEvents.off(OverlayEventType.ThreadsChanged, handler);
  });

  it('supports multiple listeners', () => {
    let count = 0;
    const h1 = () => { count += 1; };
    const h2 = () => { count += 10; };
    overlayEvents.on(OverlayEventType.ThreadsChanged, h1);
    overlayEvents.on(OverlayEventType.ThreadsChanged, h2);
    overlayEvents.emit(OverlayEventType.ThreadsChanged);
    assert.equal(count, 11);
    overlayEvents.off(OverlayEventType.ThreadsChanged, h1);
    overlayEvents.off(OverlayEventType.ThreadsChanged, h2);
  });

  it('off removes only the specified listener', () => {
    let count = 0;
    const h1 = () => { count += 1; };
    const h2 = () => { count += 10; };
    overlayEvents.on(OverlayEventType.ThreadsChanged, h1);
    overlayEvents.on(OverlayEventType.ThreadsChanged, h2);
    overlayEvents.off(OverlayEventType.ThreadsChanged, h1);
    overlayEvents.emit(OverlayEventType.ThreadsChanged);
    assert.equal(count, 10);
    overlayEvents.off(OverlayEventType.ThreadsChanged, h2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test-node --grep "OverlayEventBus"`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// ts/overlay/services/OverlayEventBus.dom.ts
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// OverlayEventBus: lightweight pub/sub for overlay mutations.
// Components subscribe instead of polling. OverlayService emits after writes.

export enum OverlayEventType {
  ThreadsChanged = 'overlay:threads-changed',
  MessagesChanged = 'overlay:messages-changed',
  LabelsChanged = 'overlay:labels-changed',
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
```

**Step 4: Run test to verify it passes**

Run: `pnpm test-node --grep "OverlayEventBus"`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add ts/overlay/services/OverlayEventBus.dom.ts ts/test-node/overlay/OverlayEventBus_test.node.ts
git commit -m "feat(overlay/m2): add OverlayEventBus for event-driven refresh"
```

---

### Task 2: OverlayUndoManager — session-scoped soft undo

**Files:**
- Create: `ts/overlay/services/OverlayUndoManager.dom.ts`
- Test: `ts/test-node/overlay/OverlayUndoManager_test.node.ts`

**Step 1: Write the test file**

```typescript
// ts/test-node/overlay/OverlayUndoManager_test.node.ts
import { assert } from 'chai';
import {
  overlayUndo,
} from '../../overlay/services/OverlayUndoManager.dom.js';

describe('overlay/OverlayUndoManager', () => {
  beforeEach(() => {
    overlayUndo.clear();
  });

  it('starts empty with nothing to undo', () => {
    assert.isNull(overlayUndo.peek());
  });

  it('pushes an undo entry and peeks it', () => {
    overlayUndo.push({
      description: 'Deleted thread "Alpha"',
      execute: async () => {},
    });
    const entry = overlayUndo.peek();
    assert.isNotNull(entry);
    assert.equal(entry!.description, 'Deleted thread "Alpha"');
  });

  it('pop returns the latest entry and removes it', () => {
    overlayUndo.push({
      description: 'first',
      execute: async () => {},
    });
    overlayUndo.push({
      description: 'second',
      execute: async () => {},
    });
    const popped = overlayUndo.pop();
    assert.equal(popped!.description, 'second');
    assert.equal(overlayUndo.peek()!.description, 'first');
  });

  it('respects max stack depth of 20', () => {
    for (let i = 0; i < 25; i++) {
      overlayUndo.push({
        description: `entry-${i}`,
        execute: async () => {},
      });
    }
    // Only last 20 should remain; first 5 discarded
    assert.equal(overlayUndo.peek()!.description, 'entry-24');

    // Pop 20 entries
    let count = 0;
    while (overlayUndo.pop()) {
      count += 1;
    }
    assert.equal(count, 20);
  });

  it('clear removes all entries', () => {
    overlayUndo.push({
      description: 'will be cleared',
      execute: async () => {},
    });
    overlayUndo.clear();
    assert.isNull(overlayUndo.peek());
  });

  it('execute runs the inverse function', async () => {
    let executed = false;
    overlayUndo.push({
      description: 'undo something',
      execute: async () => { executed = true; },
    });
    const entry = overlayUndo.pop();
    await entry!.execute();
    assert.isTrue(executed);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test-node --grep "OverlayUndoManager"`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// ts/overlay/services/OverlayUndoManager.dom.ts
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// OverlayUndoManager: session-scoped in-memory undo stack.
// Stores inverse operations for destructive overlay actions.
// Max depth 20 — oldest entries discarded when exceeded.

const MAX_STACK_DEPTH = 20;

export type UndoEntry = {
  description: string;
  execute: () => Promise<void>;
};

class OverlayUndoManager {
  private stack: Array<UndoEntry> = [];

  push(entry: UndoEntry): void {
    this.stack.push(entry);
    if (this.stack.length > MAX_STACK_DEPTH) {
      this.stack.splice(0, this.stack.length - MAX_STACK_DEPTH);
    }
  }

  peek(): UndoEntry | null {
    return this.stack.length > 0
      ? this.stack[this.stack.length - 1]
      : null;
  }

  pop(): UndoEntry | null {
    return this.stack.pop() ?? null;
  }

  clear(): void {
    this.stack = [];
  }
}

export const overlayUndo = new OverlayUndoManager();
```

**Step 4: Run test to verify it passes**

Run: `pnpm test-node --grep "OverlayUndoManager"`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add ts/overlay/services/OverlayUndoManager.dom.ts ts/test-node/overlay/OverlayUndoManager_test.node.ts
git commit -m "feat(overlay/m2): add OverlayUndoManager for soft undo"
```

---

### Task 3: Wire OverlayEventBus + UndoManager into OverlayService

**Files:**
- Modify: `ts/overlay/services/OverlayService.dom.ts`

**Step 1: Write tests for event emission and undo capture**

Add to `ts/test-node/overlay/OverlayService_test.node.ts` at the end of the describe block:

```typescript
  // ─── Undo manager ──────────────────────────────────────────────────

  describe('undo entry capture (store-level simulation)', () => {
    it('deleteThread returns data needed for undo', () => {
      const conversationId = 'conv-undo-1';
      const threadRef = 'thread-undo-del';

      createThreadOverlay(db, {
        thread_ref: threadRef,
        conversation_ref: conversationId,
        title: 'Will be deleted',
        is_pinned: true,
      });

      createMessageOverlay(db, {
        id: generateUuid(),
        message_ref: `${conversationId}:msg-undo-1`,
        conversation_ref: conversationId,
        thread_ref: threadRef,
      });

      // Capture thread state before delete (what service would do)
      const threadBefore = getThreadOverlay(db, threadRef);
      const messagesBefore = getMessageOverlaysByThread(db, threadRef);
      assert.isNotNull(threadBefore);
      assert.lengthOf(messagesBefore, 1);

      // Delete
      deleteThreadOverlay(db, threadRef);
      assert.isUndefined(getThreadOverlay(db, threadRef));

      // Simulate undo: recreate thread + reassign messages
      createThreadOverlay(db, {
        thread_ref: threadBefore!.thread_ref,
        conversation_ref: threadBefore!.conversation_ref,
        title: threadBefore!.title,
        color: threadBefore!.color,
        is_pinned: threadBefore!.is_pinned,
      });
      for (const msg of messagesBefore) {
        updateMessageOverlay(db, msg.message_ref, {
          thread_ref: threadRef,
        });
      }

      // Verify undo worked
      const restored = getThreadOverlay(db, threadRef);
      assert.isNotNull(restored);
      assert.equal(restored!.title, 'Will be deleted');
      assert.isTrue(restored!.is_pinned);
      const restoredMsgs = getMessageOverlaysByThread(db, threadRef);
      assert.lengthOf(restoredMsgs, 1);
    });
  });
```

**Step 2: Run test to verify it passes** (this tests the store-level undo pattern)

Run: `pnpm test-node --grep "undo entry capture"`
Expected: PASS

**Step 3: Update OverlayService.dom.ts to emit events and push undo entries**

The full updated `OverlayService.dom.ts` adds:
- Import `overlayEvents` and `OverlayEventType`
- Import `overlayUndo`
- After `createThread`: emit `ThreadsChanged`
- After `updateThread`: emit `ThreadsChanged`
- Before `deleteThread`: snapshot thread + messages, push undo, then delete, emit
- After `togglePinThread`: emit `ThreadsChanged`
- After `assignMessageToThread`: emit `MessagesChanged`
- Before `removeMessageFromThread`: snapshot, push undo, then remove, emit
- After `addLabel`: emit `LabelsChanged`
- Before `removeLabel`: snapshot, push undo, then remove, emit
- After `setNote`: emit `MessagesChanged`

See the modify instructions below for exact code changes.

**Step 4: Run all overlay tests**

Run: `pnpm test-node --grep "overlay"`
Expected: all pass

**Step 5: Commit**

```bash
git add ts/overlay/services/OverlayService.dom.ts ts/test-node/overlay/OverlayService_test.node.ts
git commit -m "feat(overlay/m2): wire event bus + undo into OverlayService"
```

---

### Task 4: i18n keys for overlay UI

**Files:**
- Modify: `_locales/en/messages.json`

**Step 1: Add overlay i18n keys to messages.json**

Append these entries in alphabetical position among existing keys:

```json
  "icu:Overlay--add-label": {
    "messageformat": "Add label",
    "description": "Context menu item to add a label to a message overlay"
  },
  "icu:Overlay--add-to-thread": {
    "messageformat": "Add to thread\u2026",
    "description": "Context menu item to assign message to a thread overlay"
  },
  "icu:Overlay--all-messages": {
    "messageformat": "All",
    "description": "Chip label to clear thread filter and show all messages"
  },
  "icu:Overlay--assign-to-thread": {
    "messageformat": "Assign to thread",
    "description": "Button label in thread dialog to assign message to selected thread"
  },
  "icu:Overlay--close": {
    "messageformat": "Close",
    "description": "Accessible label for close button in overlay dialogs"
  },
  "icu:Overlay--create-and-assign": {
    "messageformat": "Create & assign",
    "description": "Button label to create a new thread and assign a message"
  },
  "icu:Overlay--create-thread": {
    "messageformat": "Create",
    "description": "Button label to create a new thread in the panel"
  },
  "icu:Overlay--delete-thread": {
    "messageformat": "Delete",
    "description": "Button label to delete a thread overlay"
  },
  "icu:Overlay--dialog-add-to-thread": {
    "messageformat": "Add to Thread",
    "description": "Title of the thread assignment dialog"
  },
  "icu:Overlay--dialog-edit-labels": {
    "messageformat": "Labels",
    "description": "Title of the label editor dialog"
  },
  "icu:Overlay--empty-labels": {
    "messageformat": "No labels yet",
    "description": "Shown in label editor when message has no labels"
  },
  "icu:Overlay--empty-threads": {
    "messageformat": "No threads yet. Create one from a message context menu or use the + button above.",
    "description": "Empty state text shown in thread overlay panel"
  },
  "icu:Overlay--error-generic": {
    "messageformat": "Something went wrong with the overlay. Please try again.",
    "description": "Generic error message for overlay operations"
  },
  "icu:Overlay--existing-thread-tab": {
    "messageformat": "Existing thread",
    "description": "Tab label for assigning to existing thread in dialog"
  },
  "icu:Overlay--filter-active": {
    "messageformat": "Showing thread: {title}",
    "description": "Accessible status when thread filter is active"
  },
  "icu:Overlay--loading": {
    "messageformat": "Loading\u2026",
    "description": "Loading state text for overlay components"
  },
  "icu:Overlay--menu-group": {
    "messageformat": "Overlay",
    "description": "Group label for overlay items in context menu"
  },
  "icu:Overlay--new-thread-tab": {
    "messageformat": "New thread",
    "description": "Tab label for creating new thread in dialog"
  },
  "icu:Overlay--pin-thread": {
    "messageformat": "Pin",
    "description": "Button label to pin a thread overlay"
  },
  "icu:Overlay--placeholder-add-label": {
    "messageformat": "Add label\u2026",
    "description": "Placeholder text for label input field"
  },
  "icu:Overlay--placeholder-thread-name": {
    "messageformat": "Thread name\u2026",
    "description": "Placeholder text for thread name input field"
  },
  "icu:Overlay--remove-label": {
    "messageformat": "Remove label \"{label}\"",
    "description": "Accessible label for removing a specific label"
  },
  "icu:Overlay--rename-thread": {
    "messageformat": "Rename",
    "description": "Button label to rename a thread overlay"
  },
  "icu:Overlay--thread-chip-row-label": {
    "messageformat": "Threads:",
    "description": "Label shown before thread chips in chip row"
  },
  "icu:Overlay--thread-count": {
    "messageformat": "{count, plural, one {# msg} other {# msgs}}",
    "description": "Message count shown next to thread in panel"
  },
  "icu:Overlay--thread-overlays-title": {
    "messageformat": "Thread Overlays",
    "description": "Title of the thread overlay panel"
  },
  "icu:Overlay--undo-action": {
    "messageformat": "Undo",
    "description": "Button label on undo toast"
  },
  "icu:Overlay--undo-deleted-thread": {
    "messageformat": "Thread \"{title}\" deleted",
    "description": "Undo toast message after deleting a thread"
  },
  "icu:Overlay--undo-removed-from-thread": {
    "messageformat": "Message removed from thread",
    "description": "Undo toast message after removing message from thread"
  },
  "icu:Overlay--undo-removed-label": {
    "messageformat": "Label \"{label}\" removed",
    "description": "Undo toast message after removing a label"
  },
  "icu:Overlay--unnamed-thread": {
    "messageformat": "Unnamed thread",
    "description": "Fallback title for threads without a name"
  },
  "icu:Overlay--unpin-thread": {
    "messageformat": "Unpin",
    "description": "Button label to unpin a thread overlay"
  },
  "icu:Overlay--untitled": {
    "messageformat": "Untitled",
    "description": "Fallback display name for threads without a title"
  }
```

**Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('_locales/en/messages.json','utf8')); console.log('JSON valid')"`
Expected: "JSON valid"

**Step 3: Commit**

```bash
git add _locales/en/messages.json
git commit -m "feat(overlay/m2): add i18n keys for overlay UI strings"
```

---

### Task 5: OverlayErrorBanner + OverlayUndoToast UI components

**Files:**
- Create: `ts/overlay/ui/OverlayErrorBanner.dom.tsx`
- Create: `ts/overlay/ui/OverlayUndoToast.dom.tsx`

**Step 1: Write OverlayErrorBanner**

```typescript
// ts/overlay/ui/OverlayErrorBanner.dom.tsx
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React, { memo, useCallback, useEffect, useState } from 'react';
import type { LocalizerType } from '../../types/I18N.std.js';

export type OverlayErrorBannerProps = {
  message: string | null;
  onDismiss: () => void;
  i18n: LocalizerType;
};

const AUTO_DISMISS_MS = 8000;

export const OverlayErrorBanner = memo(function OverlayErrorBanner({
  message,
  onDismiss,
  i18n,
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
        aria-label={i18n('icu:Overlay--close')}
      >
        &times;
      </button>
    </div>
  );
});
```

**Step 2: Write OverlayUndoToast**

```typescript
// ts/overlay/ui/OverlayUndoToast.dom.tsx
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React, { memo, useCallback, useEffect, useState } from 'react';
import { overlayUndo } from '../services/OverlayUndoManager.dom.js';
import { overlayEvents, OverlayEventType } from '../services/OverlayEventBus.dom.js';
import type { UndoEntry } from '../services/OverlayUndoManager.dom.js';
import type { LocalizerType } from '../../types/I18N.std.js';

export type OverlayUndoToastProps = {
  i18n: LocalizerType;
};

const TOAST_DURATION_MS = 5000;

export const OverlayUndoToast = memo(function OverlayUndoToast({
  i18n,
}: OverlayUndoToastProps): React.JSX.Element | null {
  const [entry, setEntry] = useState<UndoEntry | null>(null);

  // Listen for new undo entries by subscribing to all mutation events
  useEffect(() => {
    const handler = () => {
      const latest = overlayUndo.peek();
      setEntry(latest);
    };
    overlayEvents.on(OverlayEventType.ThreadsChanged, handler);
    overlayEvents.on(OverlayEventType.MessagesChanged, handler);
    overlayEvents.on(OverlayEventType.LabelsChanged, handler);
    return () => {
      overlayEvents.off(OverlayEventType.ThreadsChanged, handler);
      overlayEvents.off(OverlayEventType.MessagesChanged, handler);
      overlayEvents.off(OverlayEventType.LabelsChanged, handler);
    };
  }, []);

  // Auto-dismiss after timeout
  useEffect(() => {
    if (!entry) return undefined;
    const timer = setTimeout(() => setEntry(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [entry]);

  const handleUndo = useCallback(async () => {
    const popped = overlayUndo.pop();
    if (popped) {
      await popped.execute();
      // Events will be emitted by the undo execution via OverlayService
    }
    setEntry(null);
  }, []);

  const handleDismiss = useCallback(() => {
    setEntry(null);
  }, []);

  if (!entry) return null;

  return (
    <div className="overlay-undo-toast" role="alert" aria-live="polite">
      <span className="overlay-undo-toast__message">{entry.description}</span>
      <button
        type="button"
        className="overlay-undo-toast__undo-btn"
        onClick={() => void handleUndo()}
      >
        {i18n('icu:Overlay--undo-action')}
      </button>
      <button
        type="button"
        className="overlay-undo-toast__dismiss"
        onClick={handleDismiss}
        aria-label={i18n('icu:Overlay--close')}
      >
        &times;
      </button>
    </div>
  );
});
```

**Step 3: Commit**

```bash
git add ts/overlay/ui/OverlayErrorBanner.dom.tsx ts/overlay/ui/OverlayUndoToast.dom.tsx
git commit -m "feat(overlay/m2): add OverlayErrorBanner and OverlayUndoToast components"
```

---

### Task 6: Update ThreadChipRow — filter, events, a11y, i18n

**Files:**
- Modify: `ts/overlay/ui/ThreadChipRow.dom.tsx`

**Step 1: Rewrite ThreadChipRow with all M2 features**

Replace the entire component:

```typescript
// ts/overlay/ui/ThreadChipRow.dom.tsx
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React, { memo, useCallback, useEffect, useState } from 'react';
import type { LocalizerType } from '../../types/I18N.std.js';
import type { ThreadOverlayType } from '../models/OverlayTypes.std.js';
import * as OverlayService from '../services/OverlayService.dom.js';
import { isOverlayThreadsEnabled } from '../OverlayFeatureFlag.std.js';
import { overlayEvents, OverlayEventType } from '../services/OverlayEventBus.dom.js';

export type ThreadChipRowProps = {
  conversationId: string;
  i18n: LocalizerType;
  activeFilterThreadRef: string | null;
  onFilterChange: (threadRef: string | null) => void;
};

export const ThreadChipRow = memo(function ThreadChipRow({
  conversationId,
  i18n,
  activeFilterThreadRef,
  onFilterChange,
}: ThreadChipRowProps): React.JSX.Element | null {
  const [threads, setThreads] = useState<ReadonlyArray<ThreadOverlayType>>([]);

  const loadThreads = useCallback(async () => {
    if (!isOverlayThreadsEnabled()) return;
    const t = await OverlayService.getThreadsForConversation(conversationId);
    setThreads(t);
  }, [conversationId]);

  // Initial load
  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  // Event-driven refresh (replaces 3s polling)
  useEffect(() => {
    if (!isOverlayThreadsEnabled()) return undefined;
    const handler = () => void loadThreads();
    overlayEvents.on(OverlayEventType.ThreadsChanged, handler);
    overlayEvents.on(OverlayEventType.MessagesChanged, handler);
    return () => {
      overlayEvents.off(OverlayEventType.ThreadsChanged, handler);
      overlayEvents.off(OverlayEventType.MessagesChanged, handler);
    };
  }, [loadThreads]);

  const handleChipClick = useCallback(
    (threadRef: string) => {
      onFilterChange(activeFilterThreadRef === threadRef ? null : threadRef);
    },
    [activeFilterThreadRef, onFilterChange]
  );

  const handleAllClick = useCallback(() => {
    onFilterChange(null);
  }, [onFilterChange]);

  if (!isOverlayThreadsEnabled() || threads.length === 0) {
    return null;
  }

  return (
    <div className="overlay-thread-chip-row" role="toolbar" aria-label={i18n('icu:Overlay--thread-chip-row-label')}>
      <span className="overlay-thread-chip-row__label" aria-hidden="true">
        {i18n('icu:Overlay--thread-chip-row-label')}
      </span>
      <div className="overlay-thread-chip-row__chips" role="group">
        <button
          type="button"
          className={`overlay-thread-chip ${activeFilterThreadRef === null ? 'overlay-thread-chip--active' : ''}`}
          onClick={handleAllClick}
          aria-pressed={activeFilterThreadRef === null}
        >
          <span className="overlay-thread-chip__title">
            {i18n('icu:Overlay--all-messages')}
          </span>
        </button>
        {threads.map(thread => {
          const isActive = activeFilterThreadRef === thread.thread_ref;
          const chipClass = [
            'overlay-thread-chip',
            isActive ? 'overlay-thread-chip--active' : '',
            thread.is_pinned ? 'overlay-thread-chip--pinned' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={thread.thread_ref}
              type="button"
              className={chipClass}
              onClick={() => handleChipClick(thread.thread_ref)}
              aria-pressed={isActive}
              title={thread.title ?? i18n('icu:Overlay--unnamed-thread')}
            >
              {thread.is_pinned && (
                <span className="overlay-thread-chip__pin-icon" aria-hidden="true">
                  &#x1f4cc;
                </span>
              )}
              <span className="overlay-thread-chip__title">
                {thread.title || i18n('icu:Overlay--untitled')}
              </span>
            </button>
          );
        })}
      </div>
      {activeFilterThreadRef && (
        <span className="overlay-thread-chip-row__sr-status" role="status" className="sr-only">
          {i18n('icu:Overlay--filter-active', { title: threads.find(t => t.thread_ref === activeFilterThreadRef)?.title || '' })}
        </span>
      )}
    </div>
  );
});
```

Note: The `sr-only` class for the screen-reader status will be added in the SCSS task. If Signal already has a `.sr-only` utility class, use that instead. The duplicate `className` on the status span is a bug in the plan — use only the `sr-only` one. The final code should be:
```tsx
<span role="status" className="sr-only">
```

**Step 2: Run lint/typecheck**

Run: `pnpm tsc --noEmit --project tsconfig.json 2>&1 | grep -i overlay | head -20`

**Step 3: Commit**

```bash
git add ts/overlay/ui/ThreadChipRow.dom.tsx
git commit -m "feat(overlay/m2): ThreadChipRow filter, event-driven refresh, a11y, i18n"
```

---

### Task 7: Update ConversationView — filter state + pass-through

**Files:**
- Modify: `ts/components/conversation/ConversationView.dom.tsx`

**Step 1: Add filter state and pass props to ThreadChipRow**

In `ConversationView.dom.tsx`:

1. Add imports for `useState`, `useCallback`
2. Add `activeFilterThreadRef` state
3. Add `onFilterChange` callback
4. Pass `i18n`, `activeFilterThreadRef`, `onFilterChange` to `<ThreadChipRow>`
5. When `activeFilterThreadRef` is set, add a CSS class to timeline container for filtering (the actual message hiding is done via the overlay data — we pass the filter ref as a data attribute on the timeline container so overlay-aware rendering can use it)

The key change to the render:
```tsx
const [activeFilterThreadRef, setActiveFilterThreadRef] = useState<string | null>(null);

const handleFilterChange = useCallback((threadRef: string | null) => {
  setActiveFilterThreadRef(threadRef);
}, []);

// Reset filter on conversation switch
useEffect(() => {
  setActiveFilterThreadRef(null);
}, [conversationId]);
```

And in JSX:
```tsx
<ThreadChipRow
  conversationId={conversationId}
  i18n={i18n}
  activeFilterThreadRef={activeFilterThreadRef}
  onFilterChange={handleFilterChange}
/>
```

Note: `i18n` must be added to ConversationView props or obtained via `useI18n()` hook — check which pattern Signal uses. The `i18n` is typically passed as a prop in Signal Desktop components.

**Step 2: Commit**

```bash
git add ts/components/conversation/ConversationView.dom.tsx
git commit -m "feat(overlay/m2): thread filter state in ConversationView"
```

---

### Task 8: Update ThreadOverlayPanel — error states, events, a11y, i18n

**Files:**
- Modify: `ts/overlay/ui/ThreadOverlayPanel.dom.tsx`

**Step 1: Rewrite with error handling, event-driven refresh, i18n, a11y**

Key changes:
1. Import `overlayEvents`, `OverlayEventType`, `OverlayErrorBanner`, `i18n`
2. Add `errorMessage` state
3. Wrap all async calls in try/catch → `setErrorMessage(i18n('icu:Overlay--error-generic'))`
4. Subscribe to `ThreadsChanged` + `MessagesChanged` events for auto-refresh
5. Replace all hardcoded strings with `i18n()` calls
6. Add `aria-label` to buttons, `role="list"` to thread list
7. Add keyboard handling (Escape to close create form)

**Step 2: Commit**

```bash
git add ts/overlay/ui/ThreadOverlayPanel.dom.tsx
git commit -m "feat(overlay/m2): ThreadOverlayPanel error states, events, a11y, i18n"
```

---

### Task 9: Update ThreadCreateDialog — error states, a11y, i18n

**Files:**
- Modify: `ts/overlay/ui/ThreadCreateDialog.dom.tsx`

**Step 1: Update with error handling, i18n, a11y**

Key changes:
1. Add `i18n` prop (type `LocalizerType`)
2. Wrap `handleCreate` / `handleAssign` in try/catch → show error via `OverlayErrorBanner`
3. Replace all hardcoded strings
4. Add `aria-labelledby` on dialog referencing the title `id`
5. Add `aria-selected` on tab buttons

**Step 2: Commit**

```bash
git add ts/overlay/ui/ThreadCreateDialog.dom.tsx
git commit -m "feat(overlay/m2): ThreadCreateDialog error states, a11y, i18n"
```

---

### Task 10: Update LabelEditor — error states, a11y, i18n

**Files:**
- Modify: `ts/overlay/ui/LabelEditor.dom.tsx`

**Step 1: Update with error handling, i18n, a11y**

Key changes:
1. Add `i18n` prop
2. Wrap `handleAdd` / `handleRemove` in try/catch
3. Replace hardcoded strings with i18n calls
4. Add `aria-label` on remove buttons: `i18n('icu:Overlay--remove-label', { label })`

**Step 2: Commit**

```bash
git add ts/overlay/ui/LabelEditor.dom.tsx
git commit -m "feat(overlay/m2): LabelEditor error states, a11y, i18n"
```

---

### Task 11: Update OverlayMenuActions — pass i18n through

**Files:**
- Modify: `ts/overlay/ui/OverlayMenuActions.dom.tsx`

**Step 1: Thread i18n prop through to child dialogs**

Add `i18n: LocalizerType` to `OverlayMenuActionsProps`. Pass it to `ThreadCreateDialog` and `LabelEditor`.

**Step 2: Commit**

```bash
git add ts/overlay/ui/OverlayMenuActions.dom.tsx
git commit -m "feat(overlay/m2): pass i18n through OverlayMenuActions"
```

---

### Task 12: Update overlay SCSS — new styles

**Files:**
- Modify: `ts/overlay/ui/styles/overlay.scss`

**Step 1: Add styles for error banner, undo toast, filter active state, sr-only**

Append to overlay.scss:

```scss
// ─── Screen reader only ──────────────────────────────────────────────────
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

// ─── Error banner ────────────────────────────────────────────────────────
.overlay-error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 4px;
  margin: 4px 12px;
  font-size: 12px;
  color: #991b1b;

  &__message {
    flex: 1;
  }

  &__close {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: #991b1b;
    padding: 0 2px;
  }
}

// ─── Undo toast ──────────────────────────────────────────────────────────
.overlay-undo-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1001;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--color-gray-75, #3b3b3b);
  color: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  font-size: 13px;
  animation: overlay-toast-in 0.2s ease-out;

  &__message {
    flex: 1;
  }

  &__undo-btn {
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: #fff;
    padding: 3px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
    }
  }

  &__dismiss {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    font-size: 14px;
    padding: 0 2px;

    &:hover {
      color: #fff;
    }
  }
}

@keyframes overlay-toast-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
```

**Step 2: Commit**

```bash
git add ts/overlay/ui/styles/overlay.scss
git commit -m "feat(overlay/m2): add error banner, undo toast, and a11y styles"
```

---

### Task 13: Update barrel export + add UndoToast to ConversationView

**Files:**
- Modify: `ts/overlay/index.std.ts`
- Modify: `ts/components/conversation/ConversationView.dom.tsx`

**Step 1: Update barrel exports**

Add to `ts/overlay/index.std.ts`:
```typescript
export { overlayEvents, OverlayEventType } from './services/OverlayEventBus.dom.js';
export { overlayUndo } from './services/OverlayUndoManager.dom.js';
export type { UndoEntry } from './services/OverlayUndoManager.dom.js';
```

**Step 2: Add OverlayUndoToast to ConversationView**

Import and render `<OverlayUndoToast i18n={i18n} />` inside the ConversationView, below the composition area.

**Step 3: Commit**

```bash
git add ts/overlay/index.std.ts ts/components/conversation/ConversationView.dom.tsx
git commit -m "feat(overlay/m2): barrel exports + undo toast in conversation view"
```

---

### Task 14: Integration tests for M2 features

**Files:**
- Create: `ts/test-node/overlay/M2_integration_test.node.ts`

**Step 1: Write integration tests**

```typescript
// Tests for:
// 1. OverlayEventBus fires after OverlayService mutations (store-level simulation)
// 2. UndoManager captures and can reverse: deleteThread, removeMessageFromThread, removeLabel
// 3. i18n keys exist in messages.json
```

**Step 2: Run all overlay tests**

Run: `pnpm test-node --grep "overlay"`
Expected: all pass

**Step 3: Commit**

```bash
git add ts/test-node/overlay/M2_integration_test.node.ts
git commit -m "test(overlay/m2): integration tests for event bus, undo, i18n keys"
```

---

### Task 15: Final verification + update memory

**Step 1: Run full overlay test suite**

Run: `pnpm test-node --grep "overlay"`

**Step 2: Run typecheck**

Run: `pnpm tsc --noEmit 2>&1 | grep -i overlay | head -30`

**Step 3: Update MEMORY.md with M2 status**

**Step 4: Final commit if any stragglers**
