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
