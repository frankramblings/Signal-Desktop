// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// MessageRefAdapter: single source of truth for deriving stable message_ref
// keys from Signal message attributes.
//
// Integration boundary: all overlay code must use this module for reference
// derivation — never construct keys inline elsewhere.

export type MessageRefInput = {
  // The Signal message ID (UUID-based, preferred key source).
  signalMessageId?: string | null;
  // Conversation ID (always required for namespacing).
  conversationId: string;
  // Fallback fields used when signalMessageId is unavailable.
  senderAciOrId?: string | null;
  sentAtMs?: number | null;
};

export type MessageRefResult =
  | { strategy: 'primary'; ref: string }
  | { strategy: 'fallback'; ref: string }
  | { strategy: 'none'; ref: null };

/**
 * Derives a stable, namespaced overlay reference for a Signal message.
 *
 * Strategy 1 (preferred): `<conversationId>:<signalMessageId>`
 *   — stable across app restarts, unique per conversation namespace.
 *
 * Strategy 2 (fallback): `<conversationId>:<senderAciOrId>:<sentAtMs>`
 *   — used when signalMessageId is not yet available (e.g. incoming message
 *   being rendered before ID assignment). Less stable but functional.
 *
 * Returns `{ strategy: 'none', ref: null }` when neither strategy can
 * produce a valid key. Callers must handle this gracefully.
 */
export function deriveMessageRef(input: MessageRefInput): MessageRefResult {
  const { conversationId, signalMessageId, senderAciOrId, sentAtMs } = input;

  if (!conversationId) {
    return { strategy: 'none', ref: null };
  }

  // Primary strategy
  if (signalMessageId) {
    return {
      strategy: 'primary',
      ref: `${conversationId}:${signalMessageId}`,
    };
  }

  // Fallback strategy
  if (senderAciOrId && sentAtMs != null) {
    return {
      strategy: 'fallback',
      ref: `${conversationId}:${senderAciOrId}:${sentAtMs}`,
    };
  }

  return { strategy: 'none', ref: null };
}

/**
 * Convenience wrapper: returns the ref string or null.
 */
export function getMessageRef(input: MessageRefInput): string | null {
  const result = deriveMessageRef(input);
  return result.ref;
}

/**
 * Returns true if the ref was derived via the stable primary strategy.
 * Useful for deciding whether to upgrade a fallback ref after message ID
 * becomes available.
 */
export function isPrimaryRef(ref: string, conversationId: string): boolean {
  // Primary refs have exactly two colon-delimited segments:
  // <conversationId>:<signalMessageId>
  const prefix = `${conversationId}:`;
  if (!ref.startsWith(prefix)) {
    return false;
  }
  const rest = ref.slice(prefix.length);
  // Fallback refs contain a second colon (for sentAtMs); primary refs do not
  // contain additional colons beyond the UUID structure.
  // UUID has hyphens not colons, so we check that the rest has no colon.
  return !rest.includes(':');
}
