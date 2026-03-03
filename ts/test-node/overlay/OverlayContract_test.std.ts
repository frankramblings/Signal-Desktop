// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  validateThreadOverlay,
  validateMessageOverlay,
  validateSyncRecord,
  sanitizeForSync,
} from '../../overlay/contract/OverlaySchemaValidator.std.js';
import { resolveConflict } from '../../overlay/sync/OverlaySyncMerger.node.js';
import type { ConflictResolution } from '../../overlay/sync/OverlaySyncTypes.std.js';
import type { SyncRecord } from '../../overlay/sync/OverlaySyncTypes.std.js';

// ─── Fixture loading ────────────────────────────────────────────────────────

function loadFixture<T>(filename: string): T {
  const raw = readFileSync(
    join(__dirname, 'fixtures', filename),
    'utf-8'
  );
  return JSON.parse(raw) as T;
}

type FixtureSample = {
  name: string;
  _reason?: string;
  record: Record<string, unknown>;
};

type ThreadOverlaySamplesFixture = {
  valid: ReadonlyArray<FixtureSample>;
  invalid: ReadonlyArray<FixtureSample>;
};

type MessageOverlaySamplesFixture = {
  valid: ReadonlyArray<FixtureSample>;
  invalid: ReadonlyArray<FixtureSample>;
};

type ConflictCase = {
  name: string;
  local: { updated_at: number; version: number };
  remote: { updated_at: number; version: number };
  expected: ConflictResolution;
};

type MergeConflictFixture = {
  conflict_resolution: ReadonlyArray<ConflictCase>;
  merge_scenarios: ReadonlyArray<Record<string, unknown>>;
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('overlay/contract/OverlaySchemaValidator', () => {
  // ─── validateThreadOverlay ────────────────────────────────────────────

  describe('validateThreadOverlay', () => {
    const fixture = loadFixture<ThreadOverlaySamplesFixture>(
      'thread-overlay-samples.json'
    );

    describe('valid samples', () => {
      for (const sample of fixture.valid) {
        it(`accepts "${sample.name}"`, () => {
          const result = validateThreadOverlay(sample.record);
          assert.isTrue(
            result.valid,
            `Expected valid but got errors: ${result.errors.join(', ')}`
          );
          assert.isEmpty(result.errors);
        });
      }
    });

    describe('invalid samples', () => {
      for (const sample of fixture.invalid) {
        it(`rejects "${sample.name}"`, () => {
          const result = validateThreadOverlay(sample.record);
          assert.isFalse(
            result.valid,
            `Expected invalid but got valid for "${sample.name}"`
          );
          assert.isNotEmpty(result.errors);
        });
      }
    });

    it('rejects null', () => {
      const result = validateThreadOverlay(null);
      assert.isFalse(result.valid);
      assert.deepEqual(result.errors, ['Expected an object']);
    });

    it('rejects undefined', () => {
      const result = validateThreadOverlay(undefined);
      assert.isFalse(result.valid);
      assert.deepEqual(result.errors, ['Expected an object']);
    });

    it('rejects a non-object primitive', () => {
      const result = validateThreadOverlay(42);
      assert.isFalse(result.valid);
      assert.deepEqual(result.errors, ['Expected an object']);
    });

  });

  // ─── validateMessageOverlay ───────────────────────────────────────────

  describe('validateMessageOverlay', () => {
    const fixture = loadFixture<MessageOverlaySamplesFixture>(
      'message-overlay-samples.json'
    );

    describe('valid samples', () => {
      for (const sample of fixture.valid) {
        it(`accepts "${sample.name}"`, () => {
          const result = validateMessageOverlay(sample.record);
          assert.isTrue(
            result.valid,
            `Expected valid but got errors: ${result.errors.join(', ')}`
          );
          assert.isEmpty(result.errors);
        });
      }
    });

    describe('invalid samples', () => {
      for (const sample of fixture.invalid) {
        it(`rejects "${sample.name}"`, () => {
          const result = validateMessageOverlay(sample.record);
          assert.isFalse(
            result.valid,
            `Expected invalid but got valid for "${sample.name}"`
          );
          assert.isNotEmpty(result.errors);
        });
      }
    });

    it('rejects null', () => {
      const result = validateMessageOverlay(null);
      assert.isFalse(result.valid);
      assert.deepEqual(result.errors, ['Expected an object']);
    });

    it('rejects undefined', () => {
      const result = validateMessageOverlay(undefined);
      assert.isFalse(result.valid);
      assert.deepEqual(result.errors, ['Expected an object']);
    });

    it('rejects a non-object primitive', () => {
      const result = validateMessageOverlay('bad');
      assert.isFalse(result.valid);
      assert.deepEqual(result.errors, ['Expected an object']);
    });

  });

  // ─── validateSyncRecord ──────────────────────────────────────────────

  describe('validateSyncRecord', () => {
    it('accepts a valid thread sync record', () => {
      const threadFixture = loadFixture<ThreadOverlaySamplesFixture>(
        'thread-overlay-samples.json'
      );
      const sample = threadFixture.valid[0].record;
      const syncRecord = { ...sample, _type: 'thread_overlay' };
      const result = validateSyncRecord(syncRecord);
      assert.isTrue(
        result.valid,
        `Expected valid: ${result.errors.join(', ')}`
      );
    });

    it('accepts a valid message sync record', () => {
      const msgFixture = loadFixture<MessageOverlaySamplesFixture>(
        'message-overlay-samples.json'
      );
      const sample = msgFixture.valid[0].record;
      const syncRecord = { ...sample, _type: 'message_overlay' };
      const result = validateSyncRecord(syncRecord);
      assert.isTrue(
        result.valid,
        `Expected valid: ${result.errors.join(', ')}`
      );
    });

    it('rejects a record with invalid _type', () => {
      const result = validateSyncRecord({
        _type: 'unknown_type',
        thread_ref: 'abc',
      });
      assert.isFalse(result.valid);
      assert.match(result.errors[0], /_type must be/);
    });

    it('rejects a record with missing _type', () => {
      const result = validateSyncRecord({ thread_ref: 'abc' });
      assert.isFalse(result.valid);
      assert.match(result.errors[0], /_type must be/);
    });

    it('rejects null', () => {
      const result = validateSyncRecord(null);
      assert.isFalse(result.valid);
      assert.deepEqual(result.errors, ['Expected an object']);
    });

    describe('deleted records (relaxed validation)', () => {
      it('accepts deleted thread_overlay with thread_ref present', () => {
        const result = validateSyncRecord({
          _type: 'thread_overlay',
          _deleted: true,
          thread_ref: 'some-ref',
        });
        assert.isTrue(
          result.valid,
          `Expected valid: ${result.errors.join(', ')}`
        );
      });

      it('rejects deleted thread_overlay without thread_ref', () => {
        const result = validateSyncRecord({
          _type: 'thread_overlay',
          _deleted: true,
        });
        assert.isFalse(result.valid);
        assert.match(result.errors[0], /thread_ref/);
      });

      it('accepts deleted message_overlay with message_ref present', () => {
        const result = validateSyncRecord({
          _type: 'message_overlay',
          _deleted: true,
          message_ref: 'conv:msg',
        });
        assert.isTrue(
          result.valid,
          `Expected valid: ${result.errors.join(', ')}`
        );
      });

      it('rejects deleted message_overlay without message_ref', () => {
        const result = validateSyncRecord({
          _type: 'message_overlay',
          _deleted: true,
        });
        assert.isFalse(result.valid);
        assert.match(result.errors[0], /message_ref/);
      });

      it('accepts deleted records from merge-conflict fixtures', () => {
        const mergeFixture = loadFixture<MergeConflictFixture>(
          'merge-conflict-cases.json'
        );
        // Find merge_scenarios with _deleted: true in remote_record
        for (const scenario of mergeFixture.merge_scenarios) {
          const remote = scenario.remote_record as Record<string, unknown>;
          if (remote && remote._deleted === true) {
            const result = validateSyncRecord(remote);
            assert.isTrue(
              result.valid,
              `Deleted fixture "${scenario.name}" should validate: ${result.errors.join(', ')}`
            );
          }
        }
      });
    });
  });

  // ─── sanitizeForSync ─────────────────────────────────────────────────

  describe('sanitizeForSync', () => {
    it('strips unknown fields from thread sync record', () => {
      const dirty = {
        _type: 'thread_overlay' as const,
        thread_ref: 't1',
        conversation_ref: 'c1',
        title: 'Test',
        color: null,
        is_pinned: true,
        updated_at: 1000,
        version: 1,
        _unknownField: 'should be stripped',
        extraData: { nested: true },
      } as unknown as SyncRecord;

      const cleaned = sanitizeForSync(dirty);
      assert.notProperty(cleaned, '_unknownField');
      assert.notProperty(cleaned, 'extraData');
      assert.equal((cleaned as Record<string, unknown>).thread_ref, 't1');
      assert.equal((cleaned as Record<string, unknown>).title, 'Test');
    });

    it('strips unknown fields from message sync record', () => {
      const dirty = {
        _type: 'message_overlay' as const,
        id: 'm1',
        message_ref: 'c1:msg1',
        conversation_ref: 'c1',
        thread_ref: null,
        labels: ['hiring'],
        note: null,
        updated_at: 2000,
        version: 1,
        _internal: 'strip me',
        debugInfo: 123,
      } as unknown as SyncRecord;

      const cleaned = sanitizeForSync(dirty);
      assert.notProperty(cleaned, '_internal');
      assert.notProperty(cleaned, 'debugInfo');
      assert.equal((cleaned as Record<string, unknown>).id, 'm1');
      assert.deepEqual((cleaned as Record<string, unknown>).labels, [
        'hiring',
      ]);
    });

    it('coerces is_pinned from number (1) to boolean (true)', () => {
      const record = {
        _type: 'thread_overlay' as const,
        thread_ref: 't1',
        conversation_ref: 'c1',
        title: null,
        color: null,
        is_pinned: 1,
        updated_at: 1000,
        version: 1,
      } as unknown as SyncRecord;

      const cleaned = sanitizeForSync(record);
      assert.strictEqual(
        (cleaned as Record<string, unknown>).is_pinned,
        true
      );
    });

    it('coerces is_pinned from number (0) to boolean (false)', () => {
      const record = {
        _type: 'thread_overlay' as const,
        thread_ref: 't2',
        conversation_ref: 'c2',
        title: null,
        color: null,
        is_pinned: 0,
        updated_at: 2000,
        version: 1,
      } as unknown as SyncRecord;

      const cleaned = sanitizeForSync(record);
      assert.strictEqual(
        (cleaned as Record<string, unknown>).is_pinned,
        false
      );
    });

    it('preserves is_pinned when already a boolean', () => {
      const record = {
        _type: 'thread_overlay' as const,
        thread_ref: 't3',
        conversation_ref: 'c3',
        title: null,
        color: null,
        is_pinned: true,
        updated_at: 3000,
        version: 1,
      } as unknown as SyncRecord;

      const cleaned = sanitizeForSync(record);
      assert.strictEqual(
        (cleaned as Record<string, unknown>).is_pinned,
        true
      );
    });

    it('retains _deleted field for deleted records', () => {
      const record = {
        _type: 'thread_overlay' as const,
        _deleted: true,
        thread_ref: 't4',
        conversation_ref: '',
        title: null,
        color: null,
        is_pinned: false,
        updated_at: 0,
        version: 0,
      } as unknown as SyncRecord;

      const cleaned = sanitizeForSync(record);
      assert.strictEqual(
        (cleaned as Record<string, unknown>)._deleted,
        true
      );
      assert.equal((cleaned as Record<string, unknown>).thread_ref, 't4');
    });
  });

  // ─── serialization roundtrip validation ─────────────────────────────

  describe('serialization roundtrip fixtures', () => {
    type RoundtripEntry = {
      name: string;
      record: Record<string, unknown>;
      sqlite_row: Record<string, unknown>;
      cloudkit_fields: Record<string, unknown>;
    };
    type RoundtripFixture = {
      thread_roundtrips: ReadonlyArray<RoundtripEntry>;
      message_roundtrips: ReadonlyArray<RoundtripEntry>;
    };

    const roundtrip = loadFixture<RoundtripFixture>(
      'serialization-roundtrip.json'
    );

    describe('thread roundtrips — record validates', () => {
      for (const entry of roundtrip.thread_roundtrips) {
        it(`"${entry.name}" record passes validateThreadOverlay`, () => {
          const result = validateThreadOverlay(entry.record);
          assert.isTrue(
            result.valid,
            `Expected valid: ${result.errors.join(', ')}`
          );
        });
      }
    });

    describe('message roundtrips — record validates', () => {
      for (const entry of roundtrip.message_roundtrips) {
        it(`"${entry.name}" record passes validateMessageOverlay`, () => {
          const result = validateMessageOverlay(entry.record);
          assert.isTrue(
            result.valid,
            `Expected valid: ${result.errors.join(', ')}`
          );
        });
      }
    });

    describe('type coercion checks', () => {
      for (const entry of roundtrip.thread_roundtrips) {
        it(`"${entry.name}" is_pinned: runtime boolean → SQLite integer`, () => {
          const runtimeVal = entry.record.is_pinned;
          const sqliteVal = entry.sqlite_row.is_pinned;
          assert.strictEqual(
            sqliteVal,
            runtimeVal ? 1 : 0,
            'SQLite is_pinned should be 1 or 0'
          );
        });
      }

      for (const entry of roundtrip.message_roundtrips) {
        it(`"${entry.name}" labels: runtime array → SQLite JSON string`, () => {
          const runtimeLabels = entry.record.labels;
          const sqliteLabelsJson = entry.sqlite_row.labels_json;
          assert.isArray(runtimeLabels);
          assert.isString(sqliteLabelsJson);
          assert.deepEqual(
            JSON.parse(sqliteLabelsJson as string),
            runtimeLabels
          );
        });
      }
    });
  });

  // ─── resolveConflict (fixture-driven) ────────────────────────────────

  describe('resolveConflict (fixture-driven)', () => {
    const mergeFixture = loadFixture<MergeConflictFixture>(
      'merge-conflict-cases.json'
    );

    for (const testCase of mergeFixture.conflict_resolution) {
      it(`${testCase.name}: expects ${testCase.expected}`, () => {
        const result = resolveConflict(
          testCase.local.updated_at,
          testCase.local.version,
          testCase.remote.updated_at,
          testCase.remote.version
        );
        assert.equal(result, testCase.expected);
      });
    }
  });
});
