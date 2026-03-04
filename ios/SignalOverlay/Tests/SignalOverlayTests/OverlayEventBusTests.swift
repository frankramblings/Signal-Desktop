// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
import Combine
@testable import SignalOverlay

final class OverlayEventBusTests: XCTestCase {
    var cancellables = Set<AnyCancellable>()

    override func tearDown() {
        cancellables.removeAll()
    }

    func testThreadsChangedEmits() {
        let bus = OverlayEventBus()
        let expectation = expectation(description: "threadsChanged")

        bus.threadsChanged
            .sink { expectation.fulfill() }
            .store(in: &cancellables)

        bus.emitThreadsChanged()
        wait(for: [expectation], timeout: 1.0)
    }

    func testMessagesChangedEmits() {
        let bus = OverlayEventBus()
        let expectation = expectation(description: "messagesChanged")

        bus.messagesChanged
            .sink { expectation.fulfill() }
            .store(in: &cancellables)

        bus.emitMessagesChanged()
        wait(for: [expectation], timeout: 1.0)
    }

    func testMultipleSubscribers() {
        let bus = OverlayEventBus()
        let exp1 = expectation(description: "sub1")
        let exp2 = expectation(description: "sub2")

        bus.threadsChanged.sink { exp1.fulfill() }.store(in: &cancellables)
        bus.threadsChanged.sink { exp2.fulfill() }.store(in: &cancellables)

        bus.emitThreadsChanged()
        wait(for: [exp1, exp2], timeout: 1.0)
    }

    func testSyncEvents() {
        let bus = OverlayEventBus()
        let started = expectation(description: "started")
        let completed = expectation(description: "completed")

        bus.syncStarted.sink { started.fulfill() }.store(in: &cancellables)
        bus.syncCompleted.sink { completed.fulfill() }.store(in: &cancellables)

        bus.emitSyncStarted()
        bus.emitSyncCompleted()
        wait(for: [started, completed], timeout: 1.0)
    }
}
