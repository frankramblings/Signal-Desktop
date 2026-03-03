// Copyright 2026 Signal Overlay Contributors
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation
import GRDB

public struct ThreadOverlay: Equatable, Sendable {
    public var threadRef: String
    public var conversationRef: String
    public var title: String?
    public var color: String?
    public var isPinned: Bool
    public var updatedAt: Int
    public var version: Int

    public init(
        threadRef: String, conversationRef: String,
        title: String? = nil, color: String? = nil,
        isPinned: Bool = false,
        updatedAt: Int = Int(Date().timeIntervalSince1970 * 1000),
        version: Int = 1
    ) {
        self.threadRef = threadRef
        self.conversationRef = conversationRef
        self.title = title
        self.color = color
        self.isPinned = isPinned
        self.updatedAt = updatedAt
        self.version = version
    }
}

extension ThreadOverlay: FetchableRecord {
    public init(row: Row) {
        threadRef = row["thread_ref"]
        conversationRef = row["conversation_ref"]
        title = row["title"]
        color = row["color"]
        isPinned = (row["is_pinned"] as Int) != 0
        updatedAt = row["updated_at"]
        version = row["version"]
    }
}

extension ThreadOverlay: PersistableRecord {
    public static let databaseTableName = "thread_overlay"
    public func encode(to container: inout PersistenceContainer) {
        container["thread_ref"] = threadRef
        container["conversation_ref"] = conversationRef
        container["title"] = title
        container["color"] = color
        container["is_pinned"] = isPinned ? 1 : 0
        container["updated_at"] = updatedAt
        container["version"] = version
    }
}
