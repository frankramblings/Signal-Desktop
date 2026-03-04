// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// MessageRefAdapter: single source of truth for deriving stable message_ref
// keys from Signal message attributes. Byte-identical output to desktop.

import Foundation

public enum MessageRefResult: Equatable, Sendable {
    case primary(ref: String)
    case fallback(ref: String)
    case none
}

public struct MessageRefAdapter {
    public static func deriveMessageRef(
        conversationId: String,
        signalMessageId: String? = nil,
        senderAciOrId: String? = nil,
        sentAtMs: Int? = nil
    ) -> MessageRefResult {
        guard !conversationId.isEmpty else {
            return .none
        }

        // Primary strategy
        if let signalMessageId, !signalMessageId.isEmpty {
            return .primary(ref: "\(conversationId):\(signalMessageId)")
        }

        // Fallback strategy
        if let senderAciOrId, !senderAciOrId.isEmpty, let sentAtMs {
            return .fallback(ref: "\(conversationId):\(senderAciOrId):\(sentAtMs)")
        }

        return .none
    }

    public static func getMessageRef(
        conversationId: String,
        signalMessageId: String? = nil,
        senderAciOrId: String? = nil,
        sentAtMs: Int? = nil
    ) -> String? {
        let result = deriveMessageRef(
            conversationId: conversationId,
            signalMessageId: signalMessageId,
            senderAciOrId: senderAciOrId,
            sentAtMs: sentAtMs
        )
        switch result {
        case .primary(let ref), .fallback(let ref):
            return ref
        case .none:
            return nil
        }
    }

    public static func isPrimaryRef(_ ref: String, conversationId: String) -> Bool {
        let prefix = "\(conversationId):"
        guard ref.hasPrefix(prefix) else { return false }
        let rest = String(ref.dropFirst(prefix.count))
        return !rest.contains(":")
    }
}
