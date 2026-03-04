// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation
import GRDB

public final class OverlayStore: Sendable {
    public let dbWriter: any DatabaseWriter

    public init(dbWriter: any DatabaseWriter) {
        self.dbWriter = dbWriter
    }

    // MARK: - Thread CRUD

    @discardableResult
    public func createThread(
        threadRef: String,
        conversationRef: String,
        title: String? = nil,
        color: String? = nil,
        isPinned: Bool = false
    ) throws -> ThreadOverlay {
        let now = Int(Date().timeIntervalSince1970 * 1000)
        let thread = ThreadOverlay(
            threadRef: threadRef,
            conversationRef: conversationRef,
            title: title,
            color: color,
            isPinned: isPinned,
            updatedAt: now,
            version: 1
        )
        try dbWriter.write { db in
            try thread.insert(db)
        }
        return thread
    }

    public func getThread(threadRef: String) throws -> ThreadOverlay? {
        try dbWriter.read { db in
            try ThreadOverlay.fetchOne(db, sql:
                "SELECT * FROM thread_overlay WHERE thread_ref = ?",
                arguments: [threadRef]
            )
        }
    }

    public func getThreadsByConversation(conversationRef: String) throws -> [ThreadOverlay] {
        try dbWriter.read { db in
            try ThreadOverlay.fetchAll(db, sql:
                """
                SELECT * FROM thread_overlay
                WHERE conversation_ref = ?
                ORDER BY is_pinned DESC, updated_at DESC
                """,
                arguments: [conversationRef]
            )
        }
    }

    @discardableResult
    public func updateThread(
        threadRef: String,
        title: String?? = nil,
        color: String?? = nil,
        isPinned: Bool? = nil
    ) throws -> Bool {
        try dbWriter.write { db in
            guard var existing = try ThreadOverlay.fetchOne(db, sql:
                "SELECT * FROM thread_overlay WHERE thread_ref = ?",
                arguments: [threadRef]
            ) else { return false }

            if let title { existing.title = title }
            if let color { existing.color = color }
            if let isPinned { existing.isPinned = isPinned }
            existing.updatedAt = Int(Date().timeIntervalSince1970 * 1000)
            existing.version += 1

            try existing.update(db)
            return true
        }
    }

    @discardableResult
    public func deleteThread(threadRef: String) throws -> Bool {
        try dbWriter.write { db in
            // Unlink messages first
            try db.execute(
                sql: "UPDATE message_overlay SET thread_ref = NULL WHERE thread_ref = ?",
                arguments: [threadRef]
            )
            let count = try db.execute(
                sql: "DELETE FROM thread_overlay WHERE thread_ref = ?",
                arguments: [threadRef]
            ).changes
            return count > 0
        }
    }

    // MARK: - Message Overlay CRUD

    @discardableResult
    public func createMessageOverlay(
        id: String? = nil,
        messageRef: String,
        conversationRef: String,
        threadRef: String? = nil,
        labels: [String] = [],
        note: String? = nil
    ) throws -> MessageOverlay {
        let now = Int(Date().timeIntervalSince1970 * 1000)
        let msg = MessageOverlay(
            id: id ?? UUID().uuidString.lowercased(),
            messageRef: messageRef,
            conversationRef: conversationRef,
            threadRef: threadRef,
            labels: labels,
            note: note,
            updatedAt: now,
            version: 1
        )
        try dbWriter.write { db in
            try msg.insert(db)
        }
        return msg
    }

    public func getMessageOverlayByRef(messageRef: String) throws -> MessageOverlay? {
        try dbWriter.read { db in
            try MessageOverlay.fetchOne(db, sql:
                "SELECT * FROM message_overlay WHERE message_ref = ?",
                arguments: [messageRef]
            )
        }
    }

    public func getMessageOverlayById(id: String) throws -> MessageOverlay? {
        try dbWriter.read { db in
            try MessageOverlay.fetchOne(db, sql:
                "SELECT * FROM message_overlay WHERE id = ?",
                arguments: [id]
            )
        }
    }

    public func getMessagesByThread(threadRef: String) throws -> [MessageOverlay] {
        try dbWriter.read { db in
            try MessageOverlay.fetchAll(db, sql:
                """
                SELECT * FROM message_overlay
                WHERE thread_ref = ?
                ORDER BY updated_at ASC
                """,
                arguments: [threadRef]
            )
        }
    }

    @discardableResult
    public func updateMessageOverlay(
        messageRef: String,
        threadRef: String?? = nil,
        labels: [String]? = nil,
        note: String?? = nil
    ) throws -> Bool {
        try dbWriter.write { db in
            guard var existing = try MessageOverlay.fetchOne(db, sql:
                "SELECT * FROM message_overlay WHERE message_ref = ?",
                arguments: [messageRef]
            ) else { return false }

            if let threadRef { existing.threadRef = threadRef }
            if let labels { existing.labels = labels }
            if let note { existing.note = note }
            existing.updatedAt = Int(Date().timeIntervalSince1970 * 1000)
            existing.version += 1

            try existing.update(db)
            return true
        }
    }

    @discardableResult
    public func deleteMessageOverlay(messageRef: String) throws -> Bool {
        try dbWriter.write { db in
            let count = try db.execute(
                sql: "DELETE FROM message_overlay WHERE message_ref = ?",
                arguments: [messageRef]
            ).changes
            return count > 0
        }
    }

    // MARK: - Timestamp override (for sync merger)

    public func overrideTimestamps(
        threadRef: String, updatedAt: Int, version: Int
    ) throws {
        try dbWriter.write { db in
            try db.execute(
                sql: "UPDATE thread_overlay SET updated_at = ?, version = ? WHERE thread_ref = ?",
                arguments: [updatedAt, version, threadRef]
            )
        }
    }

    public func overrideMessageTimestamps(
        messageRef: String, updatedAt: Int, version: Int
    ) throws {
        try dbWriter.write { db in
            try db.execute(
                sql: "UPDATE message_overlay SET updated_at = ?, version = ? WHERE message_ref = ?",
                arguments: [updatedAt, version, messageRef]
            )
        }
    }
}
