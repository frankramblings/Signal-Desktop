// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation

public struct ValidationResult: Equatable, Sendable {
    public let valid: Bool
    public let errors: [String]
}

public struct OverlaySchemaValidator {

    public static func validateThreadOverlay(
        threadRef: String,
        conversationRef: String,
        isPinned: Bool,
        updatedAt: Int,
        version: Int,
        title: String? = nil,
        color: String? = nil
    ) -> ValidationResult {
        var errors: [String] = []
        if threadRef.isEmpty {
            errors.append("thread_ref must be a non-empty string")
        }
        if conversationRef.isEmpty {
            errors.append("conversation_ref must be a non-empty string")
        }
        validateTimestampAndVersion(updatedAt: updatedAt, version: version, errors: &errors)
        return ValidationResult(valid: errors.isEmpty, errors: errors)
    }

    public static func validateMessageOverlay(
        id: String,
        messageRef: String,
        conversationRef: String,
        labels: [String],
        updatedAt: Int,
        version: Int,
        threadRef: String? = nil,
        note: String? = nil
    ) -> ValidationResult {
        var errors: [String] = []
        if id.isEmpty {
            errors.append("id must be a non-empty string")
        }
        if messageRef.isEmpty {
            errors.append("message_ref must be a non-empty string")
        }
        if conversationRef.isEmpty {
            errors.append("conversation_ref must be a non-empty string")
        }
        validateTimestampAndVersion(updatedAt: updatedAt, version: version, errors: &errors)
        return ValidationResult(valid: errors.isEmpty, errors: errors)
    }

    public static func validateThread(_ thread: ThreadOverlay) -> ValidationResult {
        validateThreadOverlay(
            threadRef: thread.threadRef,
            conversationRef: thread.conversationRef,
            isPinned: thread.isPinned,
            updatedAt: thread.updatedAt,
            version: thread.version,
            title: thread.title,
            color: thread.color
        )
    }

    public static func validateMessage(_ message: MessageOverlay) -> ValidationResult {
        validateMessageOverlay(
            id: message.id,
            messageRef: message.messageRef,
            conversationRef: message.conversationRef,
            labels: message.labels,
            updatedAt: message.updatedAt,
            version: message.version,
            threadRef: message.threadRef,
            note: message.note
        )
    }

    private static func validateTimestampAndVersion(
        updatedAt: Int, version: Int, errors: inout [String]
    ) {
        if updatedAt < 0 {
            errors.append("updated_at must be a non-negative number")
        }
        if version < 1 {
            errors.append("version must be a positive integer")
        }
    }
}
