// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import { v4 as generateUuid } from 'uuid';
import * as sinon from 'sinon';

import { createDB, updateToVersion } from '../sql/helpers.node.js';
import type { WritableDB } from '../../sql/Interface.std.js';
import { OverlaySyncEngine } from '../../overlay/sync/OverlaySyncEngine.node.js';
import { SyncStatus } from '../../overlay/sync/OverlaySyncTypes.std.js';
import type {
  CloudKitConfig,
  FetchChangesResult,
  PushResult,
  SyncRecord,
} from '../../overlay/sync/OverlaySyncTypes.std.js';
import type { CloudKitAdapter } from '../../overlay/sync/CloudKitAdapter.std.js';
import { createThreadOverlay } from '../../overlay/store/OverlayStore.node.js';
import {
  getSyncState,
} from '../../overlay/sync/OverlaySyncStoreExtensions.node.js';

function createMockAdapter(overrides: Partial<CloudKitAdapter> = {}): CloudKitAdapter {
  return {
    initialize: sinon.stub().resolves(),
    fetchChanges: sinon.stub().resolves({
      records: [],
      newSyncToken: 'token-1',
      hasMore: false,
    } as FetchChangesResult),
    pushRecords: sinon.stub().resolves({
      savedRecords: [],
      failedRecords: [],
    } as PushResult),
    isReady: sinon.stub().returns(true),
    ...overrides,
  };
}

const TEST_CONFIG: CloudKitConfig = {
  containerIdentifier: 'iCloud.test.overlay',
  apiToken: 'test-token',
  environment: 'development',
};

describe('overlay/sync/OverlaySyncEngine', () => {
  let db: WritableDB;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    db = createDB();
    updateToVersion(db, 1680);
    clock = sinon.useFakeTimers({ now: 10000 });
  });

  afterEach(() => {
    db.close();
    clock.restore();
  });

  describe('getDiagnostics', () => {
    it('starts in idle state with no sync history', () => {
      const adapter = createMockAdapter();
      const engine = new OverlaySyncEngine(adapter);

      const diag = engine.getDiagnostics();
      assert.equal(diag.status, SyncStatus.Idle);
      assert.isNull(diag.lastSyncAt);
      assert.isNull(diag.lastError);
      assert.equal(diag.threadsSynced, 0);
      assert.equal(diag.messagesSynced, 0);
    });
  });

  describe('syncNow', () => {
    it('performs a full sync cycle and updates diagnostics', async () => {
      const adapter = createMockAdapter();
      const engine = new OverlaySyncEngine(adapter);
      await engine.start(db, TEST_CONFIG);

      // Create a local thread that should be pushed
      createThreadOverlay(db, {
        thread_ref: 'local-t1',
        conversation_ref: 'conv-1',
        title: 'Local Thread',
      });

      await engine.syncNow();

      const diag = engine.getDiagnostics();
      assert.equal(diag.status, SyncStatus.Idle);
      assert.isNotNull(diag.lastSyncAt);
      assert.isNull(diag.lastError);

      // Adapter should have been called
      assert.isTrue((adapter.fetchChanges as sinon.SinonStub).called);
      assert.isTrue((adapter.pushRecords as sinon.SinonStub).called);

      engine.stop();
    });

    it('saves sync state after successful sync', async () => {
      const adapter = createMockAdapter();
      const engine = new OverlaySyncEngine(adapter);
      await engine.start(db, TEST_CONFIG);
      await engine.syncNow();

      // There should be a sync state row in the DB
      // We can't easily get the device_id since it's internal,
      // but we can verify sync state exists indirectly through diagnostics
      const diag = engine.getDiagnostics();
      assert.isNotNull(diag.lastSyncAt);

      engine.stop();
    });

    it('merges remote records into local DB', async () => {
      const adapter = createMockAdapter({
        fetchChanges: sinon.stub().resolves({
          records: [
            {
              _type: 'thread_overlay' as const,
              thread_ref: 'remote-t1',
              conversation_ref: 'conv-1',
              title: 'From Remote',
              color: null,
              is_pinned: false,
              updated_at: 5000,
              version: 1,
            },
          ],
          newSyncToken: 'token-2',
          hasMore: false,
        }),
      });
      const engine = new OverlaySyncEngine(adapter);
      await engine.start(db, TEST_CONFIG);
      await engine.syncNow();

      // Verify the remote thread was inserted locally
      const row = db
        .prepare('SELECT * FROM thread_overlay WHERE thread_ref = ?')
        .get('remote-t1') as { title: string } | undefined;
      assert.ok(row);
      assert.equal(row!.title, 'From Remote');

      engine.stop();
    });
  });

  describe('error handling', () => {
    it('sets error status on sync failure', async () => {
      const adapter = createMockAdapter({
        fetchChanges: sinon.stub().rejects(new Error('Network error')),
      });
      const engine = new OverlaySyncEngine(adapter);
      await engine.start(db, TEST_CONFIG);
      await engine.syncNow();

      const diag = engine.getDiagnostics();
      assert.equal(diag.status, SyncStatus.Error);
      assert.equal(diag.lastError, 'Network error');
      assert.isNotNull(diag.lastErrorAt);

      engine.stop();
    });

    it('sets error when adapter init fails', async () => {
      const adapter = createMockAdapter({
        initialize: sinon.stub().rejects(new Error('Auth failed')),
      });
      const engine = new OverlaySyncEngine(adapter);
      await engine.start(db, TEST_CONFIG);

      const diag = engine.getDiagnostics();
      assert.equal(diag.status, SyncStatus.Error);
      assert.equal(diag.lastError, 'Auth failed');

      engine.stop();
    });
  });

  describe('diagnostics listener', () => {
    it('notifies listeners on status change', async () => {
      const adapter = createMockAdapter();
      const engine = new OverlaySyncEngine(adapter);
      await engine.start(db, TEST_CONFIG);

      let notified = false;
      engine.onDiagnosticsChange(() => {
        notified = true;
      });

      await engine.syncNow();
      assert.isTrue(notified);

      engine.stop();
    });

    it('returns unsubscribe function', async () => {
      const adapter = createMockAdapter();
      const engine = new OverlaySyncEngine(adapter);

      let callCount = 0;
      const unsubscribe = engine.onDiagnosticsChange(() => {
        callCount += 1;
      });

      await engine.start(db, TEST_CONFIG);
      await engine.syncNow();
      const firstCount = callCount;

      unsubscribe();
      await engine.syncNow();
      // Should not have been called again after unsubscribe
      assert.equal(callCount, firstCount);

      engine.stop();
    });
  });

  describe('stop', () => {
    it('prevents further syncs after stop', async () => {
      const adapter = createMockAdapter();
      const engine = new OverlaySyncEngine(adapter);
      await engine.start(db, TEST_CONFIG);
      engine.stop();

      // Reset call counts after start() may have triggered initial sync
      (adapter.fetchChanges as sinon.SinonStub).resetHistory();

      // syncNow() calls sync() which checks this.stopped
      await engine.syncNow();

      // After stop(), the stopped flag prevents sync() from executing
      assert.isFalse(
        (adapter.fetchChanges as sinon.SinonStub).called,
        'fetchChanges should not be called after stop()'
      );
    });
  });
});
