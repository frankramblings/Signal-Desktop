// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// Cross-platform schema validators for overlay records.
// Pure functions, zero dependencies beyond local overlay types — safe to use
// on any platform (desktop, iOS bridge, test harness).

import type {
  ThreadOverlayType,
  MessageOverlayType,
} from '../models/OverlayTypes.std.js';
import type {
  SyncRecord,
  ThreadSyncRecord,
  MessageSyncRecord,
} from '../sync/OverlaySyncTypes.std.js';

// ─── Validation result ─────────────────────────────────────────────────────

export type ValidationResult = {
  valid: boolean;
  errors: ReadonlyArray<string>;
};

// ─── Thread overlay validation ─────────────────────────────────────────────

export function validateThreadOverlay(obj: unknown): ValidationResult {
  const errors: Array<string> = [];

  if (obj == null || typeof obj !== 'object') {
    return { valid: false, errors: ['Expected an object'] };
  }

  const rec = obj as Record<string, unknown>;

  // Handle wrapped format from fixtures: { name: ..., record: {...} }
  const data =
    rec.record != null && typeof rec.record === 'object'
      ? (rec.record as Record<string, unknown>)
      : rec;

  if (typeof data.thread_ref !== 'string' || data.thread_ref.length === 0) {
    errors.push('thread_ref must be a non-empty string');
  }
  if (
    typeof data.conversation_ref !== 'string' ||
    data.conversation_ref.length === 0
  ) {
    errors.push('conversation_ref must be a non-empty string');
  }
  if (data.title !== null && typeof data.title !== 'string') {
    errors.push('title must be a string or null');
  }
  if (data.color !== null && typeof data.color !== 'string') {
    errors.push('color must be a string or null');
  }
  if (typeof data.is_pinned !== 'boolean') {
    errors.push('is_pinned must be a boolean');
  }
  validateTimestampAndVersion(data, errors);

  return { valid: errors.length === 0, errors };
}

// ─── Message overlay validation ────────────────────────────────────────────

export function validateMessageOverlay(obj: unknown): ValidationResult {
  const errors: Array<string> = [];

  if (obj == null || typeof obj !== 'object') {
    return { valid: false, errors: ['Expected an object'] };
  }

  const rec = obj as Record<string, unknown>;

  // Handle wrapped format from fixtures: { name: ..., record: {...} }
  const data =
    rec.record != null && typeof rec.record === 'object'
      ? (rec.record as Record<string, unknown>)
      : rec;

  if (typeof data.id !== 'string' || data.id.length === 0) {
    errors.push('id must be a non-empty string');
  }
  if (
    typeof data.message_ref !== 'string' ||
    data.message_ref.length === 0
  ) {
    errors.push('message_ref must be a non-empty string');
  }
  if (
    typeof data.conversation_ref !== 'string' ||
    data.conversation_ref.length === 0
  ) {
    errors.push('conversation_ref must be a non-empty string');
  }
  if (data.thread_ref !== null && typeof data.thread_ref !== 'string') {
    errors.push('thread_ref must be a string or null');
  }
  if (!Array.isArray(data.labels)) {
    errors.push('labels must be an array');
  } else {
    for (let i = 0; i < data.labels.length; i += 1) {
      if (typeof data.labels[i] !== 'string') {
        errors.push(`labels[${i}] must be a string`);
      }
    }
  }
  if (
    data.note !== null &&
    data.note !== undefined &&
    typeof data.note !== 'string'
  ) {
    errors.push('note must be a string or null');
  }
  validateTimestampAndVersion(data, errors);

  return { valid: errors.length === 0, errors };
}

// ─── Sync record validation ────────────────────────────────────────────────

export function validateSyncRecord(obj: unknown): ValidationResult {
  if (obj == null || typeof obj !== 'object') {
    return { valid: false, errors: ['Expected an object'] };
  }

  const rec = obj as Record<string, unknown>;
  const _type = rec._type;

  if (_type !== 'thread_overlay' && _type !== 'message_overlay') {
    return {
      valid: false,
      errors: [
        `_type must be 'thread_overlay' or 'message_overlay', got '${String(_type)}'`,
      ],
    };
  }

  // Deleted records only need the primary key present
  if (rec._deleted === true) {
    if (_type === 'thread_overlay') {
      if (typeof rec.thread_ref !== 'string') {
        return {
          valid: false,
          errors: ['deleted thread_overlay requires thread_ref'],
        };
      }
    } else {
      if (typeof rec.message_ref !== 'string') {
        return {
          valid: false,
          errors: ['deleted message_overlay requires message_ref'],
        };
      }
    }
    return { valid: true, errors: [] };
  }

  // Non-deleted: delegate to type-specific validators (pass flat, not wrapped)
  if (_type === 'thread_overlay') {
    return validateThreadOverlay(rec);
  }
  return validateMessageOverlay(rec);
}

// ─── Sanitize for sync ─────────────────────────────────────────────────────
// Strips unknown fields and coerces storage-format values (e.g. is_pinned
// integer -> boolean) for safe cross-platform transmission.

const THREAD_FIELDS = new Set([
  '_type',
  '_deleted',
  'thread_ref',
  'conversation_ref',
  'title',
  'color',
  'is_pinned',
  'updated_at',
  'version',
]);

const MESSAGE_FIELDS = new Set([
  '_type',
  '_deleted',
  'id',
  'message_ref',
  'conversation_ref',
  'thread_ref',
  'labels',
  'note',
  'updated_at',
  'version',
]);

export function sanitizeForSync(record: SyncRecord): SyncRecord {
  const allowedFields =
    record._type === 'thread_overlay' ? THREAD_FIELDS : MESSAGE_FIELDS;

  const cleaned: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (allowedFields.has(key)) {
      cleaned[key] = (record as Record<string, unknown>)[key];
    }
  }

  // Coerce SQLite integer is_pinned (0|1) to boolean for sync wire format
  if (record._type === 'thread_overlay' && typeof cleaned.is_pinned === 'number') {
    cleaned.is_pinned = cleaned.is_pinned !== 0;
  }

  return cleaned as SyncRecord;
}

// ─── Internal helpers ──────────────────────────────────────────────────────

function validateTimestampAndVersion(
  rec: Record<string, unknown>,
  errors: Array<string>
): void {
  if (typeof rec.updated_at !== 'number' || rec.updated_at < 0) {
    errors.push('updated_at must be a non-negative number');
  }
  if (
    typeof rec.version !== 'number' ||
    rec.version < 1 ||
    !Number.isInteger(rec.version)
  ) {
    errors.push('version must be a positive integer');
  }
}
