// Copyright 2026 Signal Overlay Contributors
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation
import GRDB

public struct MessageOverlay: Equatable, Sendable {
    public var id: String
    public var messageRef: String
    public var conversationRef: String
    public var threadRef: String?
    public var labels: [String]
    public var note: String?
    public var updatedAt: Int
    public var version: Int

    public init(
        id: String = UUID().uuidString.lowercased(),
        messageRef: String, conversationRef: String,
        threadRef: String? = nil, labels: [String] = [],
        note: String? = nil,
        updatedAt: Int = Int(Date().timeIntervalSince1970 * 1000),
        version: Int = 1
    ) {
        self.id = id; self.messageRef = messageRef
        self.conversationRef = conversationRef
        self.threadRef = threadRef; self.labels = labels
        self.note = note; self.updatedAt = updatedAt; self.version = version
    }
}

extension MessageOverlay: FetchableRecord {
    public init(row: Row) {
        id = row["id"]; messageRef = row["message_ref"]
        conversationRef = row["conversation_ref"]
        threadRef = row["thread_ref"]; note = row["note"]
        updatedAt = row["updated_at"]; version = row["version"]
        let labelsJson: String = row["labels_json"] ?? "[]"
        if let data = labelsJson.data(using: .utf8),
           let parsed = try? JSONDecoder().decode([String].self, from: data) {
            labels = parsed
        } else { labels = [] }
    }
}

extension MessageOverlay: PersistableRecord {
    public static let databaseTableName = "message_overlay"
    public func encode(to container: inout PersistenceContainer) {
        container["id"] = id; container["message_ref"] = messageRef
        container["conversation_ref"] = conversationRef
        container["thread_ref"] = threadRef
        let labelsData = (try? JSONEncoder().encode(labels)) ?? Data("[]".utf8)
        container["labels_json"] = String(data: labelsData, encoding: .utf8)!
        container["note"] = note
        container["updated_at"] = updatedAt; container["version"] = version
    }
}
