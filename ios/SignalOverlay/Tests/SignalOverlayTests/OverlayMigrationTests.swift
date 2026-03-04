// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
import GRDB
@testable import SignalOverlay

final class OverlayMigrationTests: XCTestCase {

    func testMigrationCreatesAllTables() throws {
        let dbQueue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        OverlayMigration.registerMigrations(&migrator)
        try migrator.migrate(dbQueue)

        try dbQueue.read { db in
            XCTAssertTrue(try db.tableExists("thread_overlay"))
            XCTAssertTrue(try db.tableExists("message_overlay"))
            XCTAssertTrue(try db.tableExists("overlay_sync_state"))
        }
    }

    func testThreadOverlayColumns() throws {
        let dbQueue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        OverlayMigration.registerMigrations(&migrator)
        try migrator.migrate(dbQueue)

        try dbQueue.read { db in
            let columns = try db.columns(in: "thread_overlay")
            let names = columns.map(\.name)
            XCTAssertTrue(names.contains("thread_ref"))
            XCTAssertTrue(names.contains("conversation_ref"))
            XCTAssertTrue(names.contains("title"))
            XCTAssertTrue(names.contains("color"))
            XCTAssertTrue(names.contains("is_pinned"))
            XCTAssertTrue(names.contains("updated_at"))
            XCTAssertTrue(names.contains("version"))
        }
    }

    func testMessageOverlayColumns() throws {
        let dbQueue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        OverlayMigration.registerMigrations(&migrator)
        try migrator.migrate(dbQueue)

        try dbQueue.read { db in
            let columns = try db.columns(in: "message_overlay")
            let names = columns.map(\.name)
            XCTAssertTrue(names.contains("id"))
            XCTAssertTrue(names.contains("message_ref"))
            XCTAssertTrue(names.contains("conversation_ref"))
            XCTAssertTrue(names.contains("thread_ref"))
            XCTAssertTrue(names.contains("labels_json"))
            XCTAssertTrue(names.contains("note"))
            XCTAssertTrue(names.contains("updated_at"))
            XCTAssertTrue(names.contains("version"))
        }
    }

    func testIndexesCreated() throws {
        let dbQueue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        OverlayMigration.registerMigrations(&migrator)
        try migrator.migrate(dbQueue)

        try dbQueue.read { db in
            let indexes = try db.indexes(on: "message_overlay")
            let indexNames = indexes.map(\.name)
            XCTAssertTrue(indexNames.contains("idx_message_overlay_conversation_ref"))
            XCTAssertTrue(indexNames.contains("idx_message_overlay_thread_ref"))

            let threadIndexes = try db.indexes(on: "thread_overlay")
            let threadIndexNames = threadIndexes.map(\.name)
            XCTAssertTrue(threadIndexNames.contains("idx_thread_overlay_conversation_ref"))
            XCTAssertTrue(threadIndexNames.contains("idx_thread_overlay_updated_at"))
        }
    }
}
