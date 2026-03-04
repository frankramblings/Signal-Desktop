// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
@testable import SignalOverlay

final class OverlaySchemaValidatorTests: XCTestCase {

    func testValidThread() {
        let result = OverlaySchemaValidator.validateThreadOverlay(
            threadRef: "t1", conversationRef: "c1", isPinned: false,
            updatedAt: 1000, version: 1
        )
        XCTAssertTrue(result.valid)
        XCTAssertTrue(result.errors.isEmpty)
    }

    func testInvalidThreadMissingRef() {
        let result = OverlaySchemaValidator.validateThreadOverlay(
            threadRef: "", conversationRef: "c1", isPinned: false,
            updatedAt: 1000, version: 1
        )
        XCTAssertFalse(result.valid)
        XCTAssertTrue(result.errors.contains("thread_ref must be a non-empty string"))
    }

    func testInvalidThreadNegativeTimestamp() {
        let result = OverlaySchemaValidator.validateThreadOverlay(
            threadRef: "t1", conversationRef: "c1", isPinned: false,
            updatedAt: -1, version: 1
        )
        XCTAssertFalse(result.valid)
    }

    func testInvalidThreadVersionZero() {
        let result = OverlaySchemaValidator.validateThreadOverlay(
            threadRef: "t1", conversationRef: "c1", isPinned: false,
            updatedAt: 1000, version: 0
        )
        XCTAssertFalse(result.valid)
    }

    func testValidMessage() {
        let result = OverlaySchemaValidator.validateMessageOverlay(
            id: "m1", messageRef: "c1:msg1", conversationRef: "c1",
            labels: ["label"], updatedAt: 1000, version: 1
        )
        XCTAssertTrue(result.valid)
    }

    func testInvalidMessageMissingId() {
        let result = OverlaySchemaValidator.validateMessageOverlay(
            id: "", messageRef: "c1:msg1", conversationRef: "c1",
            labels: [], updatedAt: 1000, version: 1
        )
        XCTAssertFalse(result.valid)
    }
}
