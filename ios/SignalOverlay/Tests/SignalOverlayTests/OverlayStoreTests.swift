// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
import GRDB
@testable import SignalOverlay

final class OverlayStoreTests: XCTestCase {
    var store: OverlayStore!

    override func setUp() async throws {
        let dbQueue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        OverlayMigration.registerMigrations(&migrator)
        try migrator.migrate(dbQueue)
        store = OverlayStore(dbWriter: dbQueue)
    }

    // MARK: - Thread CRUD

    func testCreateAndGetThread() throws {
        let thread = try store.createThread(
            threadRef: "t1", conversationRef: "c1", title: "Test Thread"
        )
        XCTAssertEqual(thread.threadRef, "t1")
        XCTAssertEqual(thread.title, "Test Thread")
        XCTAssertEqual(thread.version, 1)
        XCTAssertFalse(thread.isPinned)

        let fetched = try store.getThread(threadRef: "t1")
        XCTAssertEqual(fetched?.threadRef, "t1")
    }

    func testGetThreadNotFound() throws {
        let result = try store.getThread(threadRef: "nonexistent")
        XCTAssertNil(result)
    }

    func testGetThreadsByConversation() throws {
        _ = try store.createThread(threadRef: "t1", conversationRef: "c1", title: "B")
        _ = try store.createThread(threadRef: "t2", conversationRef: "c1", title: "A", isPinned: true)
        _ = try store.createThread(threadRef: "t3", conversationRef: "c2", title: "Other")

        let threads = try store.getThreadsByConversation(conversationRef: "c1")
        XCTAssertEqual(threads.count, 2)
        // Pinned first
        XCTAssertEqual(threads[0].threadRef, "t2")
        XCTAssertTrue(threads[0].isPinned)
    }

    func testUpdateThread() throws {
        _ = try store.createThread(threadRef: "t1", conversationRef: "c1", title: "Old")
        let updated = try store.updateThread(threadRef: "t1", title: "New", isPinned: true)
        XCTAssertTrue(updated)

        let fetched = try store.getThread(threadRef: "t1")
        XCTAssertEqual(fetched?.title, "New")
        XCTAssertTrue(fetched?.isPinned ?? false)
        XCTAssertEqual(fetched?.version, 2)
    }

    func testUpdateNonexistentThread() throws {
        let updated = try store.updateThread(threadRef: "nope", title: "X")
        XCTAssertFalse(updated)
    }

    func testDeleteThread() throws {
        _ = try store.createThread(threadRef: "t1", conversationRef: "c1")
        _ = try store.createMessageOverlay(
            messageRef: "m1", conversationRef: "c1", threadRef: "t1"
        )

        let deleted = try store.deleteThread(threadRef: "t1")
        XCTAssertTrue(deleted)
        XCTAssertNil(try store.getThread(threadRef: "t1"))

        // Message should have thread_ref set to nil
        let msg = try store.getMessageOverlayByRef(messageRef: "m1")
        XCTAssertNil(msg?.threadRef)
    }

    // MARK: - Message Overlay CRUD

    func testCreateAndGetMessage() throws {
        let msg = try store.createMessageOverlay(
            messageRef: "c1:msg1", conversationRef: "c1",
            labels: ["hiring", "urgent"], note: "Follow up"
        )
        XCTAssertEqual(msg.messageRef, "c1:msg1")
        XCTAssertEqual(msg.labels, ["hiring", "urgent"])
        XCTAssertEqual(msg.note, "Follow up")
        XCTAssertEqual(msg.version, 1)

        let fetched = try store.getMessageOverlayByRef(messageRef: "c1:msg1")
        XCTAssertEqual(fetched?.labels, ["hiring", "urgent"])
    }

    func testGetMessagesByThread() throws {
        _ = try store.createThread(threadRef: "t1", conversationRef: "c1")
        _ = try store.createMessageOverlay(messageRef: "m1", conversationRef: "c1", threadRef: "t1")
        _ = try store.createMessageOverlay(messageRef: "m2", conversationRef: "c1", threadRef: "t1")
        _ = try store.createMessageOverlay(messageRef: "m3", conversationRef: "c1")

        let messages = try store.getMessagesByThread(threadRef: "t1")
        XCTAssertEqual(messages.count, 2)
    }

    func testUpdateMessage() throws {
        _ = try store.createMessageOverlay(messageRef: "m1", conversationRef: "c1")
        let updated = try store.updateMessageOverlay(
            messageRef: "m1", labels: ["new-label"], note: "New note"
        )
        XCTAssertTrue(updated)

        let fetched = try store.getMessageOverlayByRef(messageRef: "m1")
        XCTAssertEqual(fetched?.labels, ["new-label"])
        XCTAssertEqual(fetched?.note, "New note")
        XCTAssertEqual(fetched?.version, 2)
    }

    func testDeleteMessage() throws {
        _ = try store.createMessageOverlay(messageRef: "m1", conversationRef: "c1")
        let deleted = try store.deleteMessageOverlay(messageRef: "m1")
        XCTAssertTrue(deleted)
        XCTAssertNil(try store.getMessageOverlayByRef(messageRef: "m1"))
    }

    func testCorruptLabelsJsonFallsBackToEmpty() throws {
        try store.dbWriter.write { db in
            try db.execute(
                sql: """
                INSERT INTO message_overlay (id, message_ref, conversation_ref, labels_json, updated_at, version)
                VALUES ('x', 'mx', 'cx', 'not-valid-json', 1000, 1)
                """
            )
        }
        let msg = try store.getMessageOverlayByRef(messageRef: "mx")
        XCTAssertEqual(msg?.labels, [])
    }
}
