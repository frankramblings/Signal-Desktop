// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

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
    assert.equal(overlayUndo.peek()!.description, 'entry-24');

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
