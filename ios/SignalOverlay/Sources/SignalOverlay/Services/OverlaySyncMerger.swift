// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation

public enum ConflictResolution: String, Equatable, Sendable {
    case keepLocal = "keep_local"
    case keepRemote = "keep_remote"
}

public enum MergeAction: Equatable, Sendable {
    case inserted
    case updated
    case deleted
    case noChange
}

public struct OverlaySyncMerger {
    private let store: OverlayStore

    public init(store: OverlayStore) {
        self.store = store
    }

    // MARK: - Conflict Resolution

    public static func resolveConflict(
        localUpdatedAt: Int, localVersion: Int,
        remoteUpdatedAt: Int, remoteVersion: Int
    ) -> ConflictResolution {
        if remoteUpdatedAt > localUpdatedAt { return .keepRemote }
        if remoteUpdatedAt < localUpdatedAt { return .keepLocal }
        if remoteVersion > localVersion { return .keepRemote }
        return .keepLocal
    }

    // MARK: - Thread Merge

    @discardableResult
    public func mergeRemoteThread(
        threadRef: String, conversationRef: String,
        title: String?, color: String?, isPinned: Bool,
        updatedAt: Int, version: Int, isDeleted: Bool
    ) throws -> MergeAction {
        // Validate (skip invalid, don't crash)
        if !isDeleted {
            let validation = OverlaySchemaValidator.validateThreadOverlay(
                threadRef: threadRef, conversationRef: conversationRef,
                isPinned: isPinned, updatedAt: updatedAt, version: version
            )
            if !validation.valid { return .noChange }
        }

        let local = try store.getThread(threadRef: threadRef)

        if isDeleted {
            if local != nil {
                try store.deleteThread(threadRef: threadRef)
                return .deleted
            }
            return .noChange
        }

        guard let local else {
            try store.createThread(
                threadRef: threadRef, conversationRef: conversationRef,
                title: title, color: color, isPinned: isPinned
            )
            try store.overrideTimestamps(threadRef: threadRef, updatedAt: updatedAt, version: version)
            return .inserted
        }

        let resolution = Self.resolveConflict(
            localUpdatedAt: local.updatedAt, localVersion: local.version,
            remoteUpdatedAt: updatedAt, remoteVersion: version
        )

        if resolution == .keepRemote {
            try store.updateThread(threadRef: threadRef, title: title, color: color, isPinned: isPinned)
            try store.overrideTimestamps(threadRef: threadRef, updatedAt: updatedAt, version: version)
            return .updated
        }

        return .noChange
    }

    // MARK: - Message Merge

    @discardableResult
    public func mergeRemoteMessage(
        id: String, messageRef: String, conversationRef: String,
        threadRef: String?, labels: [String], note: String?,
        updatedAt: Int, version: Int, isDeleted: Bool
    ) throws -> MergeAction {
        if !isDeleted {
            let validation = OverlaySchemaValidator.validateMessageOverlay(
                id: id, messageRef: messageRef, conversationRef: conversationRef,
                labels: labels, updatedAt: updatedAt, version: version
            )
            if !validation.valid { return .noChange }
        }

        let local = try store.getMessageOverlayByRef(messageRef: messageRef)

        if isDeleted {
            if local != nil {
                try store.deleteMessageOverlay(messageRef: messageRef)
                return .deleted
            }
            return .noChange
        }

        guard let local else {
            try store.createMessageOverlay(
                id: id, messageRef: messageRef, conversationRef: conversationRef,
                threadRef: threadRef, labels: labels, note: note
            )
            try store.overrideMessageTimestamps(messageRef: messageRef, updatedAt: updatedAt, version: version)
            return .inserted
        }

        let resolution = Self.resolveConflict(
            localUpdatedAt: local.updatedAt, localVersion: local.version,
            remoteUpdatedAt: updatedAt, remoteVersion: version
        )

        if resolution == .keepRemote {
            try store.updateMessageOverlay(
                messageRef: messageRef, threadRef: threadRef,
                labels: labels, note: note
            )
            try store.overrideMessageTimestamps(messageRef: messageRef, updatedAt: updatedAt, version: version)
            return .updated
        }

        return .noChange
    }
}
