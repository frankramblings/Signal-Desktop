// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
@testable import SignalOverlay

final class OverlayUndoManagerTests: XCTestCase {

    func testPushAndPop() async throws {
        let mgr = SignalOverlay.OverlayUndoManager()
        XCTAssertFalse(mgr.canUndo)

        mgr.push(UndoEntry(description: "test") {})
        XCTAssertTrue(mgr.canUndo)
        XCTAssertEqual(mgr.lastDescription, "test")

        let entry = mgr.pop()
        XCTAssertEqual(entry?.description, "test")
        XCTAssertFalse(mgr.canUndo)
    }

    func testMaxCapacity() {
        let mgr = SignalOverlay.OverlayUndoManager()
        for i in 0..<25 {
            mgr.push(UndoEntry(description: "entry-\(i)") {})
        }
        var count = 0
        while mgr.pop() != nil { count += 1 }
        XCTAssertEqual(count, 20)
    }

    func testMaxCapacityKeepsNewest() {
        let mgr = SignalOverlay.OverlayUndoManager()
        for i in 0..<25 {
            mgr.push(UndoEntry(description: "entry-\(i)") {})
        }
        XCTAssertEqual(mgr.lastDescription, "entry-24")
        let last = mgr.pop()
        XCTAssertEqual(last?.description, "entry-24")
    }

    func testClear() {
        let mgr = SignalOverlay.OverlayUndoManager()
        mgr.push(UndoEntry(description: "a") {})
        mgr.push(UndoEntry(description: "b") {})
        mgr.clear()
        XCTAssertFalse(mgr.canUndo)
        XCTAssertNil(mgr.pop())
    }

    func testUndoExecutesClosure() async throws {
        let mgr = SignalOverlay.OverlayUndoManager()
        var executed = false
        mgr.push(UndoEntry(description: "undo") { executed = true })

        let entry = mgr.pop()
        try await entry?.execute()
        XCTAssertTrue(executed)
    }
}
