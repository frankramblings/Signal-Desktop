// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import {
  deriveMessageRef,
  getMessageRef,
  isPrimaryRef,
} from '../../overlay/services/MessageRefAdapter.std.js';

describe('overlay/MessageRefAdapter', () => {
  const CONV_ID = 'conv-abc-123';
  const MSG_ID = 'msg-uuid-456';
  const SENDER = 'aci-sender-789';
  const SENT_AT = 1_700_000_000_000;

  describe('deriveMessageRef', () => {
    it('uses primary strategy when signalMessageId is present', () => {
      const result = deriveMessageRef({
        conversationId: CONV_ID,
        signalMessageId: MSG_ID,
      });
      assert.equal(result.strategy, 'primary');
      assert.equal(result.ref, `${CONV_ID}:${MSG_ID}`);
    });

    it('uses fallback strategy when signalMessageId is absent', () => {
      const result = deriveMessageRef({
        conversationId: CONV_ID,
        senderAciOrId: SENDER,
        sentAtMs: SENT_AT,
      });
      assert.equal(result.strategy, 'fallback');
      assert.equal(result.ref, `${CONV_ID}:${SENDER}:${SENT_AT}`);
    });

    it('prefers primary over fallback when both are present', () => {
      const result = deriveMessageRef({
        conversationId: CONV_ID,
        signalMessageId: MSG_ID,
        senderAciOrId: SENDER,
        sentAtMs: SENT_AT,
      });
      assert.equal(result.strategy, 'primary');
      assert.equal(result.ref, `${CONV_ID}:${MSG_ID}`);
    });

    it('returns none when conversationId is missing', () => {
      const result = deriveMessageRef({
        conversationId: '',
        signalMessageId: MSG_ID,
      });
      assert.equal(result.strategy, 'none');
      assert.isNull(result.ref);
    });

    it('returns none when only conversationId is present', () => {
      const result = deriveMessageRef({ conversationId: CONV_ID });
      assert.equal(result.strategy, 'none');
      assert.isNull(result.ref);
    });

    it('returns none when fallback fields are incomplete (no sentAtMs)', () => {
      const result = deriveMessageRef({
        conversationId: CONV_ID,
        senderAciOrId: SENDER,
        // sentAtMs intentionally omitted
      });
      assert.equal(result.strategy, 'none');
      assert.isNull(result.ref);
    });

    it('returns none when fallback fields are incomplete (no sender)', () => {
      const result = deriveMessageRef({
        conversationId: CONV_ID,
        sentAtMs: SENT_AT,
        // senderAciOrId intentionally omitted
      });
      assert.equal(result.strategy, 'none');
      assert.isNull(result.ref);
    });
  });

  describe('getMessageRef', () => {
    it('returns the ref string for a valid primary input', () => {
      const ref = getMessageRef({ conversationId: CONV_ID, signalMessageId: MSG_ID });
      assert.equal(ref, `${CONV_ID}:${MSG_ID}`);
    });

    it('returns null for an incomplete input', () => {
      const ref = getMessageRef({ conversationId: CONV_ID });
      assert.isNull(ref);
    });
  });

  describe('isPrimaryRef', () => {
    it('returns true for a primary ref', () => {
      const ref = `${CONV_ID}:${MSG_ID}`;
      assert.isTrue(isPrimaryRef(ref, CONV_ID));
    });

    it('returns false for a fallback ref (has second colon)', () => {
      const ref = `${CONV_ID}:${SENDER}:${SENT_AT}`;
      assert.isFalse(isPrimaryRef(ref, CONV_ID));
    });

    it('returns false when conversationId prefix does not match', () => {
      const ref = `other-conv:${MSG_ID}`;
      assert.isFalse(isPrimaryRef(ref, CONV_ID));
    });
  });
});
