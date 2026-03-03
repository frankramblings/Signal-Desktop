// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { createDB, updateToVersion } from '../sql/helpers.node.js';
import type { WritableDB } from '../../sql/Interface.std.js';
import {
  getThreadsDirtySince,
  getMessagesDirtySince,
  getSyncState,
  setSyncState,
  getAllSyncStates,
} from '../../overlay/sync/OverlaySyncStoreExtensions.node.js';
import {
  createThreadOverlay,
  createMessageOverlay,
} from '../../overlay/store/OverlayStore.node.js';
import type { OverlaySyncState } from '../../overlay/sync/OverlaySyncTypes.std.js';

describe('overlay/sync/OverlaySyncStoreExtensions', () => {
  let db: WritableDB;

  beforeEach(() => {
    db = createDB();
    updateToVersion(db, 1680);
  });

  afterEach(() => {
    db.close();
  });

  // ─── Delta queries ────────────────────────────────────────────────────

  describe('getThreadsDirtySince', () => {
    it('returns threads updated after the given timestamp', () => {
      createThreadOverlay(db, {
        thread_ref: 't1',
        conversation_ref: 'conv-1',
        title: 'Thread 1',
      });
      // Set timestamp to something known
      db.prepare(
        'UPDATE thread_overlay SET updated_at = 2000 WHERE thread_ref = ?'
      ).run('t1');

      createThreadOverlay(db, {
        thread_ref: 't2',
        conversation_ref: 'conv-1',
        title: 'Thread 2',
      });
      db.prepare(
        'UPDATE thread_overlay SET updated_at = 5000 WHERE thread_ref = ?'
      ).run('t2');

      const dirty = getThreadsDirtySince(db, 3000);
      assert.equal(dirty.length, 1);
      assert.equal(dirty[0].thread_ref, 't2');
    });

    it('returns empty array when nothing is dirty', () => {
      createThreadOverlay(db, {
        thread_ref: 't1',
        conversation_ref: 'conv-1',
      });
      db.prepare(
        'UPDATE thread_overlay SET updated_at = 1000 WHERE thread_ref = ?'
      ).run('t1');

      const dirty = getThreadsDirtySince(db, 5000);
      assert.equal(dirty.length, 0);
    });

    it('returns all threads when sinceTimestamp is 0', () => {
      createThreadOverlay(db, { thread_ref: 't1', conversation_ref: 'c1' });
      createThreadOverlay(db, { thread_ref: 't2', conversation_ref: 'c1' });

      const dirty = getThreadsDirtySince(db, 0);
      assert.equal(dirty.length, 2);
    });
  });

  describe('getMessagesDirtySince', () => {
    it('returns messages updated after the given timestamp', () => {
      createMessageOverlay(db, {
        id: 'm1',
        message_ref: 'conv-1:msg-1',
        conversation_ref: 'conv-1',
        labels: ['tag1'],
      });
      db.prepare(
        'UPDATE message_overlay SET updated_at = 2000 WHERE id = ?'
      ).run('m1');

      createMessageOverlay(db, {
        id: 'm2',
        message_ref: 'conv-1:msg-2',
        conversation_ref: 'conv-1',
        labels: ['tag2'],
      });
      db.prepare(
        'UPDATE message_overlay SET updated_at = 6000 WHERE id = ?'
      ).run('m2');

      const dirty = getMessagesDirtySince(db, 4000);
      assert.equal(dirty.length, 1);
      assert.equal(dirty[0].message_ref, 'conv-1:msg-2');
    });
  });

  // ─── Sync state persistence ───────────────────────────────────────────

  describe('getSyncState / setSyncState', () => {
    it('returns undefined when no state exists', () => {
      assert.isUndefined(getSyncState(db, 'device-1'));
    });

    it('persists and retrieves sync state', () => {
      const state: OverlaySyncState = {
        device_id: 'device-1',
        last_sync_token: 'token-abc',
        last_sync_at: 12345,
      };
      setSyncState(db, state);

      const retrieved = getSyncState(db, 'device-1');
      assert.ok(retrieved);
      assert.equal(retrieved!.device_id, 'device-1');
      assert.equal(retrieved!.last_sync_token, 'token-abc');
      assert.equal(retrieved!.last_sync_at, 12345);
    });

    it('upserts on conflict (same device_id)', () => {
      setSyncState(db, {
        device_id: 'device-1',
        last_sync_token: 'token-1',
        last_sync_at: 1000,
      });
      setSyncState(db, {
        device_id: 'device-1',
        last_sync_token: 'token-2',
        last_sync_at: 2000,
      });

      const retrieved = getSyncState(db, 'device-1');
      assert.equal(retrieved!.last_sync_token, 'token-2');
      assert.equal(retrieved!.last_sync_at, 2000);
    });

    it('supports null token and timestamp', () => {
      setSyncState(db, {
        device_id: 'device-2',
        last_sync_token: null,
        last_sync_at: null,
      });

      const retrieved = getSyncState(db, 'device-2');
      assert.ok(retrieved);
      assert.isNull(retrieved!.last_sync_token);
      assert.isNull(retrieved!.last_sync_at);
    });
  });

  describe('getAllSyncStates', () => {
    it('returns all sync states', () => {
      setSyncState(db, {
        device_id: 'd1',
        last_sync_token: 't1',
        last_sync_at: 100,
      });
      setSyncState(db, {
        device_id: 'd2',
        last_sync_token: 't2',
        last_sync_at: 200,
      });

      const all = getAllSyncStates(db);
      assert.equal(all.length, 2);
    });
  });
});
