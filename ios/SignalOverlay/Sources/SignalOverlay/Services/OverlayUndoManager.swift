// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation

private let maxStackDepth = 20

public struct UndoEntry: Sendable {
    public let description: String
    public let execute: @Sendable () async throws -> Void

    public init(description: String, execute: @escaping @Sendable () async throws -> Void) {
        self.description = description
        self.execute = execute
    }
}

public final class OverlayUndoManager: @unchecked Sendable {
    private let queue = DispatchQueue(label: "overlay.undo")
    private var stack: [UndoEntry] = []

    public init() {}

    public func push(_ entry: UndoEntry) {
        queue.sync {
            stack.append(entry)
            if stack.count > maxStackDepth {
                stack.removeFirst(stack.count - maxStackDepth)
            }
        }
    }

    public func pop() -> UndoEntry? {
        queue.sync {
            stack.isEmpty ? nil : stack.removeLast()
        }
    }

    public var canUndo: Bool {
        queue.sync { !stack.isEmpty }
    }

    public var lastDescription: String? {
        queue.sync { stack.last?.description }
    }

    public func clear() {
        queue.sync { stack.removeAll() }
    }
}

public let overlayUndo = OverlayUndoManager()
