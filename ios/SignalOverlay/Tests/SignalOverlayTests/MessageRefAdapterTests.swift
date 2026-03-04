// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
@testable import SignalOverlay

final class MessageRefAdapterTests: XCTestCase {

    func testPrimaryRefDerivation() {
        let result = MessageRefAdapter.deriveMessageRef(
            conversationId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            signalMessageId: "f0e1d2c3-b4a5-6789-0123-456789abcdef"
        )
        guard case .primary(let ref) = result else {
            return XCTFail("Expected primary strategy")
        }
        XCTAssertEqual(ref, "a1b2c3d4-e5f6-7890-abcd-ef1234567890:f0e1d2c3-b4a5-6789-0123-456789abcdef")
    }

    func testFallbackRefDerivation() {
        let result = MessageRefAdapter.deriveMessageRef(
            conversationId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            senderAciOrId: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
            sentAtMs: 1709500000000
        )
        guard case .fallback(let ref) = result else {
            return XCTFail("Expected fallback strategy")
        }
        XCTAssertEqual(ref, "a1b2c3d4-e5f6-7890-abcd-ef1234567890:b2c3d4e5-f6a7-8901-bcde-f12345678901:1709500000000")
    }

    func testNoneStrategy() {
        let result = MessageRefAdapter.deriveMessageRef(
            conversationId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        )
        guard case .none = result else {
            return XCTFail("Expected none strategy")
        }
    }

    func testEmptyConversationId() {
        let result = MessageRefAdapter.deriveMessageRef(
            conversationId: "",
            signalMessageId: "msg-id"
        )
        guard case .none = result else {
            return XCTFail("Expected none for empty conversationId")
        }
    }

    func testPrimaryPreferredOverFallback() {
        let result = MessageRefAdapter.deriveMessageRef(
            conversationId: "conv-id",
            signalMessageId: "msg-id",
            senderAciOrId: "sender-id",
            sentAtMs: 1234567890
        )
        guard case .primary = result else {
            return XCTFail("Primary should be preferred when both available")
        }
    }

    func testIsPrimaryRef() {
        let convId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        let primaryRef = "\(convId):f0e1d2c3-b4a5-6789-0123-456789abcdef"
        let fallbackRef = "\(convId):sender-id:1709500000000"

        XCTAssertTrue(MessageRefAdapter.isPrimaryRef(primaryRef, conversationId: convId))
        XCTAssertFalse(MessageRefAdapter.isPrimaryRef(fallbackRef, conversationId: convId))
    }

    func testIsPrimaryRefWrongPrefix() {
        XCTAssertFalse(MessageRefAdapter.isPrimaryRef("wrong:msg-id", conversationId: "conv-id"))
    }

    func testGetMessageRef() {
        let ref = MessageRefAdapter.getMessageRef(
            conversationId: "conv-id",
            signalMessageId: "msg-id"
        )
        XCTAssertEqual(ref, "conv-id:msg-id")

        let nilRef = MessageRefAdapter.getMessageRef(conversationId: "")
        XCTAssertNil(nilRef)
    }
}
