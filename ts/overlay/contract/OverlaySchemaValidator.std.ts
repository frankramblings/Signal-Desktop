// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// Cross-platform schema validators for overlay records.
// Pure functions, zero dependencies beyond local overlay types — safe to use
// on any platform (desktop, iOS bridge, test harness).

import type { SyncRecord } from '../sync/OverlaySyncTypes.std.js';

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

  if (typeof rec.thread_ref !== 'string' || rec.thread_ref.length === 0) {
    errors.push('thread_ref must be a non-empty string');
  }
  if (
    typeof rec.conversation_ref !== 'string' ||
    rec.conversation_ref.length === 0
  ) {
    errors.push('conversation_ref must be a non-empty string');
  }
  if (rec.title !== null && typeof rec.title !== 'string') {
    errors.push('title must be a string or null');
  }
  if (rec.color !== null && typeof rec.color !== 'string') {
    errors.push('color must be a string or null');
  }
  if (typeof rec.is_pinned !== 'boolean') {
    errors.push('is_pinned must be a boolean');
  }
  validateTimestampAndVersion(rec, errors);

  return { valid: errors.length === 0, errors };
}

// ─── Message overlay validation ────────────────────────────────────────────

export function validateMessageOverlay(obj: unknown): ValidationResult {
  const errors: Array<string> = [];

  if (obj == null || typeof obj !== 'object') {
    return { valid: false, errors: ['Expected an object'] };
  }

  const rec = obj as Record<string, unknown>;

  if (typeof rec.id !== 'string' || rec.id.length === 0) {
    errors.push('id must be a non-empty string');
  }
  if (
    typeof rec.message_ref !== 'string' ||
    rec.message_ref.length === 0
  ) {
    errors.push('message_ref must be a non-empty string');
  }
  if (
    typeof rec.conversation_ref !== 'string' ||
    rec.conversation_ref.length === 0
  ) {
    errors.push('conversation_ref must be a non-empty string');
  }
  if (rec.thread_ref !== null && typeof rec.thread_ref !== 'string') {
    errors.push('thread_ref must be a string or null');
  }
  if (!Array.isArray(rec.labels)) {
    errors.push('labels must be an array');
  } else {
    for (let i = 0; i < rec.labels.length; i += 1) {
      if (typeof rec.labels[i] !== 'string') {
        errors.push(`labels[${i}] must be a string`);
      }
    }
  }
  if (
    rec.note !== null &&
    rec.note !== undefined &&
    typeof rec.note !== 'string'
  ) {
    errors.push('note must be a string or null');
  }
  validateTimestampAndVersion(rec, errors);

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
