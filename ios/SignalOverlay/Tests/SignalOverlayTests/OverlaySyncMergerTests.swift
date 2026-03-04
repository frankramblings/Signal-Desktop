// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
import GRDB
@testable import SignalOverlay

final class OverlaySyncMergerTests: XCTestCase {

    func testRemoteNewerTimestampWins() {
        let result = OverlaySyncMerger.resolveConflict(
            localUpdatedAt: 1000, localVersion: 1,
            remoteUpdatedAt: 2000, remoteVersion: 1
        )
        XCTAssertEqual(result, .keepRemote)
    }

    func testLocalNewerTimestampWins() {
        let result = OverlaySyncMerger.resolveConflict(
            localUpdatedAt: 3000, localVersion: 1,
            remoteUpdatedAt: 1000, remoteVersion: 1
        )
        XCTAssertEqual(result, .keepLocal)
    }

    func testTieBreakByVersionRemoteHigher() {
        let result = OverlaySyncMerger.resolveConflict(
            localUpdatedAt: 5000, localVersion: 2,
            remoteUpdatedAt: 5000, remoteVersion: 5
        )
        XCTAssertEqual(result, .keepRemote)
    }

    func testTieBreakByVersionLocalHigher() {
        let result = OverlaySyncMerger.resolveConflict(
            localUpdatedAt: 5000, localVersion: 5,
            remoteUpdatedAt: 5000, remoteVersion: 2
        )
        XCTAssertEqual(result, .keepLocal)
    }

    func testFullTieLocalWins() {
        let result = OverlaySyncMerger.resolveConflict(
            localUpdatedAt: 5000, localVersion: 3,
            remoteUpdatedAt: 5000, remoteVersion: 3
        )
        XCTAssertEqual(result, .keepLocal)
    }

    func testMergeInsertNewThread() throws {
        let dbQueue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        OverlayMigration.registerMigrations(&migrator)
        try migrator.migrate(dbQueue)
        let store = OverlayStore(dbWriter: dbQueue)
        let merger = OverlaySyncMerger(store: store)

        let result = try merger.mergeRemoteThread(
            threadRef: "t1", conversationRef: "c1",
            title: "Remote Thread", color: nil, isPinned: false,
            updatedAt: 1000, version: 1, isDeleted: false
        )
        XCTAssertEqual(result, .inserted)

        let fetched = try store.getThread(threadRef: "t1")
        XCTAssertEqual(fetched?.title, "Remote Thread")
        XCTAssertEqual(fetched?.updatedAt, 1000)
        XCTAssertEqual(fetched?.version, 1)
    }

    func testMergeDeleteExistingThread() throws {
        let dbQueue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        OverlayMigration.registerMigrations(&migrator)
        try migrator.migrate(dbQueue)
        let store = OverlayStore(dbWriter: dbQueue)
        let merger = OverlaySyncMerger(store: store)

        _ = try store.createThread(threadRef: "t1", conversationRef: "c1")

        let result = try merger.mergeRemoteThread(
            threadRef: "t1", conversationRef: "c1",
            title: nil, color: nil, isPinned: false,
            updatedAt: 0, version: 0, isDeleted: true
        )
        XCTAssertEqual(result, .deleted)
        XCTAssertNil(try store.getThread(threadRef: "t1"))
    }

    func testMergeConflictRemoteWins() throws {
        let dbQueue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        OverlayMigration.registerMigrations(&migrator)
        try migrator.migrate(dbQueue)
        let store = OverlayStore(dbWriter: dbQueue)
        let merger = OverlaySyncMerger(store: store)

        _ = try store.createThread(threadRef: "t1", conversationRef: "c1", title: "Local")
        try store.overrideTimestamps(threadRef: "t1", updatedAt: 1000, version: 1)

        let result = try merger.mergeRemoteThread(
            threadRef: "t1", conversationRef: "c1",
            title: "Remote", color: nil, isPinned: true,
            updatedAt: 2000, version: 2, isDeleted: false
        )
        XCTAssertEqual(result, .updated)

        let fetched = try store.getThread(threadRef: "t1")
        XCTAssertEqual(fetched?.title, "Remote")
        XCTAssertTrue(fetched?.isPinned ?? false)
    }

    func testMergeConflictLocalWins() throws {
        let dbQueue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        OverlayMigration.registerMigrations(&migrator)
        try migrator.migrate(dbQueue)
        let store = OverlayStore(dbWriter: dbQueue)
        let merger = OverlaySyncMerger(store: store)

        _ = try store.createThread(threadRef: "t1", conversationRef: "c1", title: "Local")
        try store.overrideTimestamps(threadRef: "t1", updatedAt: 5000, version: 5)

        let result = try merger.mergeRemoteThread(
            threadRef: "t1", conversationRef: "c1",
            title: "Remote", color: nil, isPinned: false,
            updatedAt: 1000, version: 2, isDeleted: false
        )
        XCTAssertEqual(result, .noChange)
    }
}
