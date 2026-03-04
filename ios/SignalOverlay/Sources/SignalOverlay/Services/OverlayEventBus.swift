// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import Combine
import Foundation

public final class OverlayEventBus: @unchecked Sendable {
    public let threadsChanged = PassthroughSubject<Void, Never>()
    public let messagesChanged = PassthroughSubject<Void, Never>()
    public let labelsChanged = PassthroughSubject<Void, Never>()
    public let syncStarted = PassthroughSubject<Void, Never>()
    public let syncCompleted = PassthroughSubject<Void, Never>()
    public let syncFailed = PassthroughSubject<Error, Never>()

    public init() {}

    public func emitThreadsChanged() { threadsChanged.send() }
    public func emitMessagesChanged() { messagesChanged.send() }
    public func emitLabelsChanged() { labelsChanged.send() }
    public func emitSyncStarted() { syncStarted.send() }
    public func emitSyncCompleted() { syncCompleted.send() }
    public func emitSyncFailed(_ error: Error) { syncFailed.send(error) }
}

// Shared singleton (matches desktop's module-level `overlayEvents`)
public let overlayEvents = OverlayEventBus()
