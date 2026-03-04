# M5: iOS Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement iOS overlay module (local persistence, message ref parity, UI components, tests) as a Swift Package in `ios/SignalOverlay/`.

**Architecture:** Swift Package with two library targets (`SignalOverlay` for logic, `SignalOverlayUI` for UIKit views) and one test target. GRDB for SQLite. Combine for event bus. All behavior matches desktop contract from M4.

**Tech Stack:** Swift 5.9+, GRDB 6.x (SPM), Combine, UIKit, XCTest

**Design doc:** `docs/plans/2026-03-03-m5-ios-overlay-design.md`

---

## Task 1: Package Scaffold

**Files:**
- Create: `ios/SignalOverlay/Package.swift`
- Create: `ios/SignalOverlay/Sources/SignalOverlay/SignalOverlay.swift` (namespace placeholder)
- Create: `ios/SignalOverlay/Sources/SignalOverlayUI/SignalOverlayUI.swift` (namespace placeholder)
- Create: `ios/SignalOverlay/Tests/SignalOverlayTests/PlaceholderTest.swift`

**Step 1: Create Package.swift**

```swift
// ios/SignalOverlay/Package.swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SignalOverlay",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "SignalOverlay", targets: ["SignalOverlay"]),
        .library(name: "SignalOverlayUI", targets: ["SignalOverlayUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/groue/GRDB.swift.git", from: "6.24.0"),
    ],
    targets: [
        .target(
            name: "SignalOverlay",
            dependencies: [.product(name: "GRDB", package: "GRDB.swift")],
            path: "Sources/SignalOverlay"
        ),
        .target(
            name: "SignalOverlayUI",
            dependencies: ["SignalOverlay"],
            path: "Sources/SignalOverlayUI"
        ),
        .testTarget(
            name: "SignalOverlayTests",
            dependencies: ["SignalOverlay", "SignalOverlayUI"],
            path: "Tests/SignalOverlayTests",
            resources: [.copy("Fixtures")]
        ),
    ]
)
```

**Step 2: Create placeholder sources**

```swift
// ios/SignalOverlay/Sources/SignalOverlay/SignalOverlay.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
// SignalOverlay module — iOS overlay logic library.
```

```swift
// ios/SignalOverlay/Sources/SignalOverlayUI/SignalOverlayUI.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only
// SignalOverlayUI module — UIKit overlay views.
import UIKit
```

**Step 3: Create placeholder test**

```swift
// ios/SignalOverlay/Tests/SignalOverlayTests/PlaceholderTest.swift
import XCTest
@testable import SignalOverlay

final class PlaceholderTest: XCTestCase {
    func testPackageBuilds() {
        XCTAssertTrue(true)
    }
}
```

**Step 4: Copy test fixtures**

Copy these files from `ts/test-node/overlay/fixtures/` to `ios/SignalOverlay/Tests/SignalOverlayTests/Fixtures/`:
- `thread-overlay-samples.json`
- `message-overlay-samples.json`
- `merge-conflict-cases.json`
- `serialization-roundtrip.json`

**Step 5: Verify build**

Run: `cd ios/SignalOverlay && swift build 2>&1 | tail -5`
Expected: Build succeeded

Run: `cd ios/SignalOverlay && swift test 2>&1 | tail -10`
Expected: Test Suite passed, 1 test

**Step 6: Commit**

```bash
git add ios/SignalOverlay/
git commit -m "feat(overlay/m5): scaffold iOS Swift Package with GRDB dep"
```

---

## Task 2: Models (ThreadOverlay, MessageOverlay, OverlaySyncState)

**Files:**
- Create: `ios/SignalOverlay/Sources/SignalOverlay/Models/ThreadOverlay.swift`
- Create: `ios/SignalOverlay/Sources/SignalOverlay/Models/MessageOverlay.swift`
- Create: `ios/SignalOverlay/Sources/SignalOverlay/Models/OverlaySyncState.swift`

**Step 1: Write ThreadOverlay model**

```swift
// ios/SignalOverlay/Sources/SignalOverlay/Models/ThreadOverlay.swift
// Copyright 2026 Signal Messenger, LLC
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
        threadRef: String,
        conversationRef: String,
        title: String? = nil,
        color: String? = nil,
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
```

**Step 2: Write MessageOverlay model**

```swift
// ios/SignalOverlay/Sources/SignalOverlay/Models/MessageOverlay.swift
// Copyright 2026 Signal Messenger, LLC
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
        messageRef: String,
        conversationRef: String,
        threadRef: String? = nil,
        labels: [String] = [],
        note: String? = nil,
        updatedAt: Int = Int(Date().timeIntervalSince1970 * 1000),
        version: Int = 1
    ) {
        self.id = id
        self.messageRef = messageRef
        self.conversationRef = conversationRef
        self.threadRef = threadRef
        self.labels = labels
        self.note = note
        self.updatedAt = updatedAt
        self.version = version
    }
}

extension MessageOverlay: FetchableRecord {
    public init(row: Row) {
        id = row["id"]
        messageRef = row["message_ref"]
        conversationRef = row["conversation_ref"]
        threadRef = row["thread_ref"]
        note = row["note"]
        updatedAt = row["updated_at"]
        version = row["version"]

        let labelsJson: String = row["labels_json"] ?? "[]"
        if let data = labelsJson.data(using: .utf8),
           let parsed = try? JSONDecoder().decode([String].self, from: data) {
            labels = parsed
        } else {
            labels = []
        }
    }
}

extension MessageOverlay: PersistableRecord {
    public static let databaseTableName = "message_overlay"

    public func encode(to container: inout PersistenceContainer) {
        container["id"] = id
        container["message_ref"] = messageRef
        container["conversation_ref"] = conversationRef
        container["thread_ref"] = threadRef
        let labelsData = (try? JSONEncoder().encode(labels)) ?? Data("[]".utf8)
        container["labels_json"] = String(data: labelsData, encoding: .utf8)!
        container["note"] = note
        container["updated_at"] = updatedAt
        container["version"] = version
    }
}
```

**Step 3: Write OverlaySyncState model**

```swift
// ios/SignalOverlay/Sources/SignalOverlay/Models/OverlaySyncState.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation
import GRDB

public struct OverlaySyncState: Codable, Equatable, Sendable, FetchableRecord, PersistableRecord {
    public static let databaseTableName = "overlay_sync_state"

    public var deviceId: String
    public var lastSyncToken: String?
    public var lastSyncAt: Int?

    enum CodingKeys: String, CodingKey {
        case deviceId = "device_id"
        case lastSyncToken = "last_sync_token"
        case lastSyncAt = "last_sync_at"
    }

    public init(deviceId: String, lastSyncToken: String? = nil, lastSyncAt: Int? = nil) {
        self.deviceId = deviceId
        self.lastSyncToken = lastSyncToken
        self.lastSyncAt = lastSyncAt
    }
}
```

**Step 4: Verify build**

Run: `cd ios/SignalOverlay && swift build 2>&1 | tail -5`
Expected: Build succeeded

**Step 5: Commit**

```bash
git add ios/SignalOverlay/Sources/SignalOverlay/Models/
git commit -m "feat(overlay/m5): add GRDB model types (ThreadOverlay, MessageOverlay, OverlaySyncState)"
```

---

## Task 3: GRDB Migration

**Files:**
- Create: `ios/SignalOverlay/Sources/SignalOverlay/Store/OverlayMigration.swift`
- Create: `ios/SignalOverlay/Tests/SignalOverlayTests/OverlayMigrationTests.swift`

**Step 1: Write failing migration test**

```swift
// ios/SignalOverlay/Tests/SignalOverlayTests/OverlayMigrationTests.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
import GRDB
@testable import SignalOverlay

final class OverlayMigrationTests: XCTestCase {

    func testMigrationCreatesAllTables() throws {
        let dbQueue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        OverlayMigration.registerMigrations(&migrator)
        try migrator.migrate(dbQueue)

        try dbQueue.read { db in
            XCTAssertTrue(try db.tableExists("thread_overlay"))
            XCTAssertTrue(try db.tableExists("message_overlay"))
            XCTAssertTrue(try db.tableExists("overlay_sync_state"))
        }
    }

    func testThreadOverlayColumns() throws {
        let dbQueue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        OverlayMigration.registerMigrations(&migrator)
        try migrator.migrate(dbQueue)

        try dbQueue.read { db in
            let columns = try db.columns(in: "thread_overlay")
            let names = columns.map(\.name)
            XCTAssertTrue(names.contains("thread_ref"))
            XCTAssertTrue(names.contains("conversation_ref"))
            XCTAssertTrue(names.contains("title"))
            XCTAssertTrue(names.contains("color"))
            XCTAssertTrue(names.contains("is_pinned"))
            XCTAssertTrue(names.contains("updated_at"))
            XCTAssertTrue(names.contains("version"))
        }
    }

    func testMessageOverlayColumns() throws {
        let dbQueue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        OverlayMigration.registerMigrations(&migrator)
        try migrator.migrate(dbQueue)

        try dbQueue.read { db in
            let columns = try db.columns(in: "message_overlay")
            let names = columns.map(\.name)
            XCTAssertTrue(names.contains("id"))
            XCTAssertTrue(names.contains("message_ref"))
            XCTAssertTrue(names.contains("conversation_ref"))
            XCTAssertTrue(names.contains("thread_ref"))
            XCTAssertTrue(names.contains("labels_json"))
            XCTAssertTrue(names.contains("note"))
            XCTAssertTrue(names.contains("updated_at"))
            XCTAssertTrue(names.contains("version"))
        }
    }

    func testIndexesCreated() throws {
        let dbQueue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        OverlayMigration.registerMigrations(&migrator)
        try migrator.migrate(dbQueue)

        try dbQueue.read { db in
            let indexes = try db.indexes(on: "message_overlay")
            let indexNames = indexes.map(\.name)
            XCTAssertTrue(indexNames.contains("idx_message_overlay_conversation_ref"))
            XCTAssertTrue(indexNames.contains("idx_message_overlay_thread_ref"))

            let threadIndexes = try db.indexes(on: "thread_overlay")
            let threadIndexNames = threadIndexes.map(\.name)
            XCTAssertTrue(threadIndexNames.contains("idx_thread_overlay_conversation_ref"))
            XCTAssertTrue(threadIndexNames.contains("idx_thread_overlay_updated_at"))
        }
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cd ios/SignalOverlay && swift test --filter OverlayMigrationTests 2>&1 | tail -10`
Expected: FAIL — `OverlayMigration` not found

**Step 3: Write migration implementation**

```swift
// ios/SignalOverlay/Sources/SignalOverlay/Store/OverlayMigration.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import GRDB

public struct OverlayMigration {
    public static func registerMigrations(_ migrator: inout DatabaseMigrator) {
        migrator.registerMigration("overlay-v1") { db in
            try db.create(table: "thread_overlay") { t in
                t.column("thread_ref", .text).notNull().primaryKey()
                t.column("conversation_ref", .text).notNull()
                t.column("title", .text)
                t.column("color", .text)
                t.column("is_pinned", .integer).notNull().defaults(to: 0)
                t.column("updated_at", .integer).notNull()
                t.column("version", .integer).notNull().defaults(to: 1)
            }

            try db.create(table: "message_overlay") { t in
                t.column("id", .text).notNull().primaryKey()
                t.column("message_ref", .text).notNull().unique()
                t.column("conversation_ref", .text).notNull()
                t.column("thread_ref", .text)
                t.column("labels_json", .text).notNull().defaults(to: "[]")
                t.column("note", .text)
                t.column("updated_at", .integer).notNull()
                t.column("version", .integer).notNull().defaults(to: 1)
            }

            try db.create(table: "overlay_sync_state") { t in
                t.column("device_id", .text).notNull().primaryKey()
                t.column("last_sync_token", .text)
                t.column("last_sync_at", .integer)
            }

            try db.create(
                index: "idx_message_overlay_conversation_ref",
                on: "message_overlay", columns: ["conversation_ref"]
            )
            try db.create(
                index: "idx_message_overlay_thread_ref",
                on: "message_overlay", columns: ["thread_ref"]
            )
            try db.create(
                index: "idx_thread_overlay_conversation_ref",
                on: "thread_overlay", columns: ["conversation_ref"]
            )
            try db.create(
                index: "idx_thread_overlay_updated_at",
                on: "thread_overlay", columns: ["updated_at"]
            )
        }
    }
}
```

**Step 4: Run test to verify it passes**

Run: `cd ios/SignalOverlay && swift test --filter OverlayMigrationTests 2>&1 | tail -10`
Expected: All 4 tests pass

**Step 5: Commit**

```bash
git add ios/SignalOverlay/Sources/SignalOverlay/Store/OverlayMigration.swift
git add ios/SignalOverlay/Tests/SignalOverlayTests/OverlayMigrationTests.swift
git commit -m "feat(overlay/m5): GRDB migration matching desktop 1680 schema"
```

---

## Task 4: MessageRefAdapter

**Files:**
- Create: `ios/SignalOverlay/Sources/SignalOverlay/Services/MessageRefAdapter.swift`
- Create: `ios/SignalOverlay/Tests/SignalOverlayTests/MessageRefAdapterTests.swift`

**Step 1: Write failing test**

```swift
// ios/SignalOverlay/Tests/SignalOverlayTests/MessageRefAdapterTests.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
@testable import SignalOverlay

final class MessageRefAdapterTests: XCTestCase {

    func testPrimaryRefDerivation() {
        let result = MessageRefAdapter.deriveMessageRef(
            conversationId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            signalMessageId: "f0e1d2c3-b4a5-6789-0123-456789abcdef"
        )
        guard case .primary(let ref) = result else {
            return XCTFail("Expected primary strategy")
        }
        XCTAssertEqual(ref, "a1b2c3d4-e5f6-7890-abcd-ef1234567890:f0e1d2c3-b4a5-6789-0123-456789abcdef")
    }

    func testFallbackRefDerivation() {
        let result = MessageRefAdapter.deriveMessageRef(
            conversationId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            senderAciOrId: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
            sentAtMs: 1709500000000
        )
        guard case .fallback(let ref) = result else {
            return XCTFail("Expected fallback strategy")
        }
        XCTAssertEqual(ref, "a1b2c3d4-e5f6-7890-abcd-ef1234567890:b2c3d4e5-f6a7-8901-bcde-f12345678901:1709500000000")
    }

    func testNoneStrategy() {
        let result = MessageRefAdapter.deriveMessageRef(
            conversationId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        )
        guard case .none = result else {
            return XCTFail("Expected none strategy")
        }
    }

    func testEmptyConversationId() {
        let result = MessageRefAdapter.deriveMessageRef(
            conversationId: "",
            signalMessageId: "msg-id"
        )
        guard case .none = result else {
            return XCTFail("Expected none for empty conversationId")
        }
    }

    func testPrimaryPreferredOverFallback() {
        let result = MessageRefAdapter.deriveMessageRef(
            conversationId: "conv-id",
            signalMessageId: "msg-id",
            senderAciOrId: "sender-id",
            sentAtMs: 1234567890
        )
        guard case .primary = result else {
            return XCTFail("Primary should be preferred when both available")
        }
    }

    func testIsPrimaryRef() {
        let convId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        let primaryRef = "\(convId):f0e1d2c3-b4a5-6789-0123-456789abcdef"
        let fallbackRef = "\(convId):sender-id:1709500000000"

        XCTAssertTrue(MessageRefAdapter.isPrimaryRef(primaryRef, conversationId: convId))
        XCTAssertFalse(MessageRefAdapter.isPrimaryRef(fallbackRef, conversationId: convId))
    }

    func testIsPrimaryRefWrongPrefix() {
        XCTAssertFalse(MessageRefAdapter.isPrimaryRef("wrong:msg-id", conversationId: "conv-id"))
    }

    func testGetMessageRef() {
        let ref = MessageRefAdapter.getMessageRef(
            conversationId: "conv-id",
            signalMessageId: "msg-id"
        )
        XCTAssertEqual(ref, "conv-id:msg-id")

        let nilRef = MessageRefAdapter.getMessageRef(conversationId: "")
        XCTAssertNil(nilRef)
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cd ios/SignalOverlay && swift test --filter MessageRefAdapterTests 2>&1 | tail -10`
Expected: FAIL — `MessageRefAdapter` not found

**Step 3: Write implementation**

```swift
// ios/SignalOverlay/Sources/SignalOverlay/Services/MessageRefAdapter.swift
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
```

**Step 4: Run test to verify it passes**

Run: `cd ios/SignalOverlay && swift test --filter MessageRefAdapterTests 2>&1 | tail -10`
Expected: All 8 tests pass

**Step 5: Commit**

```bash
git add ios/SignalOverlay/Sources/SignalOverlay/Services/MessageRefAdapter.swift
git add ios/SignalOverlay/Tests/SignalOverlayTests/MessageRefAdapterTests.swift
git commit -m "feat(overlay/m5): MessageRefAdapter with byte-identical ref derivation"
```

---

## Task 5: OverlayStore (CRUD)

**Files:**
- Create: `ios/SignalOverlay/Sources/SignalOverlay/Services/OverlayStore.swift`
- Create: `ios/SignalOverlay/Tests/SignalOverlayTests/OverlayStoreTests.swift`

**Step 1: Write failing tests**

```swift
// ios/SignalOverlay/Tests/SignalOverlayTests/OverlayStoreTests.swift
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
        // Create a message associated with thread
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
        // Insert directly with corrupt JSON
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
```

**Step 2: Run test to verify it fails**

Run: `cd ios/SignalOverlay && swift test --filter OverlayStoreTests 2>&1 | tail -10`
Expected: FAIL — `OverlayStore` not found

**Step 3: Write implementation**

```swift
// ios/SignalOverlay/Sources/SignalOverlay/Services/OverlayStore.swift
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
        var thread = ThreadOverlay(
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
            // Unlink messages
            try db.execute(
                sql: "UPDATE message_overlay SET thread_ref = NULL WHERE thread_ref = ?",
                arguments: [threadRef]
            )
            return try db.execute(
                sql: "DELETE FROM thread_overlay WHERE thread_ref = ?",
                arguments: [threadRef]
            ).changes > 0
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
        var msg = MessageOverlay(
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
            try db.execute(
                sql: "DELETE FROM message_overlay WHERE message_ref = ?",
                arguments: [messageRef]
            ).changes > 0
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
```

**Step 4: Run test to verify it passes**

Run: `cd ios/SignalOverlay && swift test --filter OverlayStoreTests 2>&1 | tail -10`
Expected: All 11 tests pass

**Step 5: Commit**

```bash
git add ios/SignalOverlay/Sources/SignalOverlay/Services/OverlayStore.swift
git add ios/SignalOverlay/Tests/SignalOverlayTests/OverlayStoreTests.swift
git commit -m "feat(overlay/m5): OverlayStore CRUD with GRDB, query ordering, fail-open labels"
```

---

## Task 6: OverlaySchemaValidator

**Files:**
- Create: `ios/SignalOverlay/Sources/SignalOverlay/Services/OverlaySchemaValidator.swift`
- Create: `ios/SignalOverlay/Tests/SignalOverlayTests/OverlaySchemaValidatorTests.swift`

**Step 1: Write failing test**

```swift
// ios/SignalOverlay/Tests/SignalOverlayTests/OverlaySchemaValidatorTests.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
@testable import SignalOverlay

final class OverlaySchemaValidatorTests: XCTestCase {

    func testValidThread() {
        let result = OverlaySchemaValidator.validateThreadOverlay(
            threadRef: "t1", conversationRef: "c1", isPinned: false,
            updatedAt: 1000, version: 1
        )
        XCTAssertTrue(result.valid)
        XCTAssertTrue(result.errors.isEmpty)
    }

    func testInvalidThreadMissingRef() {
        let result = OverlaySchemaValidator.validateThreadOverlay(
            threadRef: "", conversationRef: "c1", isPinned: false,
            updatedAt: 1000, version: 1
        )
        XCTAssertFalse(result.valid)
        XCTAssertTrue(result.errors.contains("thread_ref must be a non-empty string"))
    }

    func testInvalidThreadNegativeTimestamp() {
        let result = OverlaySchemaValidator.validateThreadOverlay(
            threadRef: "t1", conversationRef: "c1", isPinned: false,
            updatedAt: -1, version: 1
        )
        XCTAssertFalse(result.valid)
    }

    func testInvalidThreadVersionZero() {
        let result = OverlaySchemaValidator.validateThreadOverlay(
            threadRef: "t1", conversationRef: "c1", isPinned: false,
            updatedAt: 1000, version: 0
        )
        XCTAssertFalse(result.valid)
    }

    func testValidMessage() {
        let result = OverlaySchemaValidator.validateMessageOverlay(
            id: "m1", messageRef: "c1:msg1", conversationRef: "c1",
            labels: ["label"], updatedAt: 1000, version: 1
        )
        XCTAssertTrue(result.valid)
    }

    func testInvalidMessageMissingId() {
        let result = OverlaySchemaValidator.validateMessageOverlay(
            id: "", messageRef: "c1:msg1", conversationRef: "c1",
            labels: [], updatedAt: 1000, version: 1
        )
        XCTAssertFalse(result.valid)
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cd ios/SignalOverlay && swift test --filter OverlaySchemaValidatorTests 2>&1 | tail -10`
Expected: FAIL — `OverlaySchemaValidator` not found

**Step 3: Write implementation**

```swift
// ios/SignalOverlay/Sources/SignalOverlay/Services/OverlaySchemaValidator.swift
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
```

**Step 4: Run test to verify it passes**

Run: `cd ios/SignalOverlay && swift test --filter OverlaySchemaValidatorTests 2>&1 | tail -10`
Expected: All 6 tests pass

**Step 5: Commit**

```bash
git add ios/SignalOverlay/Sources/SignalOverlay/Services/OverlaySchemaValidator.swift
git add ios/SignalOverlay/Tests/SignalOverlayTests/OverlaySchemaValidatorTests.swift
git commit -m "feat(overlay/m5): OverlaySchemaValidator matching desktop contract constraints"
```

---

## Task 7: OverlaySyncMerger (Conflict Resolution)

**Files:**
- Create: `ios/SignalOverlay/Sources/SignalOverlay/Services/OverlaySyncMerger.swift`
- Create: `ios/SignalOverlay/Tests/SignalOverlayTests/OverlaySyncMergerTests.swift`

**Step 1: Write failing test**

```swift
// ios/SignalOverlay/Tests/SignalOverlayTests/OverlaySyncMergerTests.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
import GRDB
@testable import SignalOverlay

final class OverlaySyncMergerTests: XCTestCase {

    func testRemoteNewerTimestampWins() {
        let result = OverlaySyncMerger.resolveConflict(
            localUpdatedAt: 1000, localVersion: 1,
            remoteUpdatedAt: 2000, remoteVersion: 1
        )
        XCTAssertEqual(result, .keepRemote)
    }

    func testLocalNewerTimestampWins() {
        let result = OverlaySyncMerger.resolveConflict(
            localUpdatedAt: 3000, localVersion: 1,
            remoteUpdatedAt: 1000, remoteVersion: 1
        )
        XCTAssertEqual(result, .keepLocal)
    }

    func testTieBreakByVersionRemoteHigher() {
        let result = OverlaySyncMerger.resolveConflict(
            localUpdatedAt: 5000, localVersion: 2,
            remoteUpdatedAt: 5000, remoteVersion: 5
        )
        XCTAssertEqual(result, .keepRemote)
    }

    func testTieBreakByVersionLocalHigher() {
        let result = OverlaySyncMerger.resolveConflict(
            localUpdatedAt: 5000, localVersion: 5,
            remoteUpdatedAt: 5000, remoteVersion: 2
        )
        XCTAssertEqual(result, .keepLocal)
    }

    func testFullTieLocalWins() {
        let result = OverlaySyncMerger.resolveConflict(
            localUpdatedAt: 5000, localVersion: 3,
            remoteUpdatedAt: 5000, remoteVersion: 3
        )
        XCTAssertEqual(result, .keepLocal)
    }

    func testMergeInsertNewThread() throws {
        let dbQueue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        OverlayMigration.registerMigrations(&migrator)
        try migrator.migrate(dbQueue)
        let store = OverlayStore(dbWriter: dbQueue)
        let merger = OverlaySyncMerger(store: store)

        let result = try merger.mergeRemoteThread(
            threadRef: "t1", conversationRef: "c1",
            title: "Remote Thread", color: nil, isPinned: false,
            updatedAt: 1000, version: 1, isDeleted: false
        )
        XCTAssertEqual(result, .inserted)

        let fetched = try store.getThread(threadRef: "t1")
        XCTAssertEqual(fetched?.title, "Remote Thread")
        XCTAssertEqual(fetched?.updatedAt, 1000)
        XCTAssertEqual(fetched?.version, 1)
    }

    func testMergeDeleteExistingThread() throws {
        let dbQueue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        OverlayMigration.registerMigrations(&migrator)
        try migrator.migrate(dbQueue)
        let store = OverlayStore(dbWriter: dbQueue)
        let merger = OverlaySyncMerger(store: store)

        _ = try store.createThread(threadRef: "t1", conversationRef: "c1")

        let result = try merger.mergeRemoteThread(
            threadRef: "t1", conversationRef: "c1",
            title: nil, color: nil, isPinned: false,
            updatedAt: 0, version: 0, isDeleted: true
        )
        XCTAssertEqual(result, .deleted)
        XCTAssertNil(try store.getThread(threadRef: "t1"))
    }

    func testMergeConflictRemoteWins() throws {
        let dbQueue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        OverlayMigration.registerMigrations(&migrator)
        try migrator.migrate(dbQueue)
        let store = OverlayStore(dbWriter: dbQueue)
        let merger = OverlaySyncMerger(store: store)

        _ = try store.createThread(threadRef: "t1", conversationRef: "c1", title: "Local")
        try store.overrideTimestamps(threadRef: "t1", updatedAt: 1000, version: 1)

        let result = try merger.mergeRemoteThread(
            threadRef: "t1", conversationRef: "c1",
            title: "Remote", color: nil, isPinned: true,
            updatedAt: 2000, version: 2, isDeleted: false
        )
        XCTAssertEqual(result, .updated)

        let fetched = try store.getThread(threadRef: "t1")
        XCTAssertEqual(fetched?.title, "Remote")
        XCTAssertTrue(fetched?.isPinned ?? false)
    }

    func testMergeConflictLocalWins() throws {
        let dbQueue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        OverlayMigration.registerMigrations(&migrator)
        try migrator.migrate(dbQueue)
        let store = OverlayStore(dbWriter: dbQueue)
        let merger = OverlaySyncMerger(store: store)

        _ = try store.createThread(threadRef: "t1", conversationRef: "c1", title: "Local")
        try store.overrideTimestamps(threadRef: "t1", updatedAt: 5000, version: 5)

        let result = try merger.mergeRemoteThread(
            threadRef: "t1", conversationRef: "c1",
            title: "Remote", color: nil, isPinned: false,
            updatedAt: 1000, version: 2, isDeleted: false
        )
        XCTAssertEqual(result, .noChange)
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cd ios/SignalOverlay && swift test --filter OverlaySyncMergerTests 2>&1 | tail -10`
Expected: FAIL — `OverlaySyncMerger` not found

**Step 3: Write implementation**

```swift
// ios/SignalOverlay/Sources/SignalOverlay/Services/OverlaySyncMerger.swift
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
```

**Step 4: Run test to verify it passes**

Run: `cd ios/SignalOverlay && swift test --filter OverlaySyncMergerTests 2>&1 | tail -10`
Expected: All 9 tests pass

**Step 5: Commit**

```bash
git add ios/SignalOverlay/Sources/SignalOverlay/Services/OverlaySyncMerger.swift
git add ios/SignalOverlay/Tests/SignalOverlayTests/OverlaySyncMergerTests.swift
git commit -m "feat(overlay/m5): OverlaySyncMerger with conflict resolution parity"
```

---

## Task 8: OverlayFeatureFlag

**Files:**
- Create: `ios/SignalOverlay/Sources/SignalOverlay/OverlayFeatureFlag.swift`
- Create: `ios/SignalOverlay/Tests/SignalOverlayTests/OverlayFeatureFlagTests.swift`

**Step 1: Write failing test**

```swift
// ios/SignalOverlay/Tests/SignalOverlayTests/OverlayFeatureFlagTests.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
@testable import SignalOverlay

final class OverlayFeatureFlagTests: XCTestCase {

    override func tearDown() {
        OverlayFeatureFlag.setOverlayThreadsEnabledForTesting(nil)
        OverlayFeatureFlag.setOverlayCloudSyncEnabledForTesting(nil)
        UserDefaults.standard.removeObject(forKey: "overlayThreadsEnabled")
        UserDefaults.standard.removeObject(forKey: "overlayCloudSyncEnabled")
    }

    func testDefaultsOff() {
        XCTAssertFalse(OverlayFeatureFlag.isOverlayThreadsEnabled)
        XCTAssertFalse(OverlayFeatureFlag.isOverlayCloudSyncEnabled)
    }

    func testTestOverride() {
        OverlayFeatureFlag.setOverlayThreadsEnabledForTesting(true)
        XCTAssertTrue(OverlayFeatureFlag.isOverlayThreadsEnabled)

        OverlayFeatureFlag.setOverlayThreadsEnabledForTesting(nil)
        XCTAssertFalse(OverlayFeatureFlag.isOverlayThreadsEnabled)
    }

    func testSyncRequiresThreads() {
        OverlayFeatureFlag.setOverlayCloudSyncEnabledForTesting(true)
        // Threads not enabled, so sync should be false
        XCTAssertFalse(OverlayFeatureFlag.isOverlayCloudSyncEnabled)

        // Enable threads too
        OverlayFeatureFlag.setOverlayThreadsEnabledForTesting(true)
        XCTAssertTrue(OverlayFeatureFlag.isOverlayCloudSyncEnabled)
    }

    func testUserDefaultsPersistence() {
        UserDefaults.standard.set(true, forKey: "overlayThreadsEnabled")
        XCTAssertTrue(OverlayFeatureFlag.isOverlayThreadsEnabled)
    }

    func testOverrideTakesPrecedence() {
        UserDefaults.standard.set(true, forKey: "overlayThreadsEnabled")
        OverlayFeatureFlag.setOverlayThreadsEnabledForTesting(false)
        XCTAssertFalse(OverlayFeatureFlag.isOverlayThreadsEnabled)
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cd ios/SignalOverlay && swift test --filter OverlayFeatureFlagTests 2>&1 | tail -10`
Expected: FAIL — `OverlayFeatureFlag` not found

**Step 3: Write implementation**

```swift
// ios/SignalOverlay/Sources/SignalOverlay/OverlayFeatureFlag.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation

public enum OverlayFeatureFlag {
    private static let threadsKey = "overlayThreadsEnabled"
    private static let syncKey = "overlayCloudSyncEnabled"

    // Test overrides
    private static var _threadsOverride: Bool?
    private static var _syncOverride: Bool?

    public static var isOverlayThreadsEnabled: Bool {
        if let override = _threadsOverride { return override }
        return UserDefaults.standard.bool(forKey: threadsKey)
    }

    public static var isOverlayCloudSyncEnabled: Bool {
        guard isOverlayThreadsEnabled else { return false }
        if let override = _syncOverride { return override }
        return UserDefaults.standard.bool(forKey: syncKey)
    }

    public static func setOverlayThreadsEnabled(_ enabled: Bool) {
        UserDefaults.standard.set(enabled, forKey: threadsKey)
    }

    public static func setOverlayCloudSyncEnabled(_ enabled: Bool) {
        UserDefaults.standard.set(enabled, forKey: syncKey)
    }

    public static func setOverlayThreadsEnabledForTesting(_ value: Bool?) {
        _threadsOverride = value
    }

    public static func setOverlayCloudSyncEnabledForTesting(_ value: Bool?) {
        _syncOverride = value
    }
}
```

**Step 4: Run test to verify it passes**

Run: `cd ios/SignalOverlay && swift test --filter OverlayFeatureFlagTests 2>&1 | tail -10`
Expected: All 5 tests pass

**Step 5: Commit**

```bash
git add ios/SignalOverlay/Sources/SignalOverlay/OverlayFeatureFlag.swift
git add ios/SignalOverlay/Tests/SignalOverlayTests/OverlayFeatureFlagTests.swift
git commit -m "feat(overlay/m5): OverlayFeatureFlag with UserDefaults + test overrides"
```

---

## Task 9: OverlayEventBus (Combine)

**Files:**
- Create: `ios/SignalOverlay/Sources/SignalOverlay/Services/OverlayEventBus.swift`
- Create: `ios/SignalOverlay/Tests/SignalOverlayTests/OverlayEventBusTests.swift`

**Step 1: Write failing test**

```swift
// ios/SignalOverlay/Tests/SignalOverlayTests/OverlayEventBusTests.swift
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
```

**Step 2: Run test to verify it fails**

Run: `cd ios/SignalOverlay && swift test --filter OverlayEventBusTests 2>&1 | tail -10`
Expected: FAIL — `OverlayEventBus` not found

**Step 3: Write implementation**

```swift
// ios/SignalOverlay/Sources/SignalOverlay/Services/OverlayEventBus.swift
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
```

**Step 4: Run test to verify it passes**

Run: `cd ios/SignalOverlay && swift test --filter OverlayEventBusTests 2>&1 | tail -10`
Expected: All 4 tests pass

**Step 5: Commit**

```bash
git add ios/SignalOverlay/Sources/SignalOverlay/Services/OverlayEventBus.swift
git add ios/SignalOverlay/Tests/SignalOverlayTests/OverlayEventBusTests.swift
git commit -m "feat(overlay/m5): OverlayEventBus with Combine publishers"
```

---

## Task 10: OverlayUndoManager

**Files:**
- Create: `ios/SignalOverlay/Sources/SignalOverlay/Services/OverlayUndoManager.swift`
- Create: `ios/SignalOverlay/Tests/SignalOverlayTests/OverlayUndoManagerTests.swift`

**Step 1: Write failing test**

```swift
// ios/SignalOverlay/Tests/SignalOverlayTests/OverlayUndoManagerTests.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
@testable import SignalOverlay

final class OverlayUndoManagerTests: XCTestCase {

    func testPushAndPop() async throws {
        let mgr = SignalOverlay.OverlayUndoManager()
        XCTAssertFalse(mgr.canUndo)

        mgr.push(UndoEntry(description: "test") {})
        XCTAssertTrue(mgr.canUndo)
        XCTAssertEqual(mgr.lastDescription, "test")

        let entry = mgr.pop()
        XCTAssertEqual(entry?.description, "test")
        XCTAssertFalse(mgr.canUndo)
    }

    func testMaxCapacity() {
        let mgr = SignalOverlay.OverlayUndoManager()
        for i in 0..<25 {
            mgr.push(UndoEntry(description: "entry-\(i)") {})
        }
        // Should have trimmed to 20
        var count = 0
        while mgr.pop() != nil { count += 1 }
        XCTAssertEqual(count, 20)
    }

    func testMaxCapacityKeepsNewest() {
        let mgr = SignalOverlay.OverlayUndoManager()
        for i in 0..<25 {
            mgr.push(UndoEntry(description: "entry-\(i)") {})
        }
        // Last entry should be entry-24 (newest)
        XCTAssertEqual(mgr.lastDescription, "entry-24")
        // First pop should be entry-24
        let last = mgr.pop()
        XCTAssertEqual(last?.description, "entry-24")
    }

    func testClear() {
        let mgr = SignalOverlay.OverlayUndoManager()
        mgr.push(UndoEntry(description: "a") {})
        mgr.push(UndoEntry(description: "b") {})
        mgr.clear()
        XCTAssertFalse(mgr.canUndo)
        XCTAssertNil(mgr.pop())
    }

    func testUndoExecutesClosure() async throws {
        let mgr = SignalOverlay.OverlayUndoManager()
        var executed = false
        mgr.push(UndoEntry(description: "undo") { executed = true })

        let entry = mgr.pop()
        try await entry?.execute()
        XCTAssertTrue(executed)
    }
}
```

**Step 2: Run test to verify it fails**

Run: `cd ios/SignalOverlay && swift test --filter OverlayUndoManagerTests 2>&1 | tail -10`
Expected: FAIL — `OverlayUndoManager` not found

**Step 3: Write implementation**

```swift
// ios/SignalOverlay/Sources/SignalOverlay/Services/OverlayUndoManager.swift
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
```

**Step 4: Run test to verify it passes**

Run: `cd ios/SignalOverlay && swift test --filter OverlayUndoManagerTests 2>&1 | tail -10`
Expected: All 5 tests pass

**Step 5: Commit**

```bash
git add ios/SignalOverlay/Sources/SignalOverlay/Services/OverlayUndoManager.swift
git add ios/SignalOverlay/Tests/SignalOverlayTests/OverlayUndoManagerTests.swift
git commit -m "feat(overlay/m5): OverlayUndoManager with session-scoped stack (max 20)"
```

---

## Task 11: Contract Compatibility Tests (Fixture-Driven)

**Files:**
- Create: `ios/SignalOverlay/Tests/SignalOverlayTests/ContractCompatibilityTests.swift`

**Step 1: Write fixture-loading tests**

```swift
// ios/SignalOverlay/Tests/SignalOverlayTests/ContractCompatibilityTests.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
import GRDB
@testable import SignalOverlay

// MARK: - Fixture Decodable types

struct ThreadSample: Decodable {
    let name: String
    let record: ThreadRecord
    var _reason: String?

    struct ThreadRecord: Decodable {
        var thread_ref: String?
        var conversation_ref: String?
        let title: String?
        let color: String?
        var is_pinned: AnyCodable?
        var updated_at: AnyCodable?
        var version: AnyCodable?
    }
}

struct ThreadFixture: Decodable {
    let valid: [ThreadSample]
    let invalid: [ThreadSample]
}

struct MessageSample: Decodable {
    let name: String
    let record: MessageRecord
    var _reason: String?

    struct MessageRecord: Decodable {
        var id: String?
        var message_ref: String?
        var conversation_ref: String?
        let thread_ref: String?
        var labels: AnyCodable?
        let note: String?
        var updated_at: AnyCodable?
        var version: AnyCodable?
    }
}

struct MessageFixture: Decodable {
    let valid: [MessageSample]
    let invalid: [MessageSample]
}

struct ConflictCase: Decodable {
    let name: String
    let local: TimestampVersion
    let remote: TimestampVersion
    let expected: String

    struct TimestampVersion: Decodable {
        let updated_at: Int
        let version: Int
    }
}

struct MergeFixture: Decodable {
    let conflict_resolution: [ConflictCase]
}

// Simple AnyCodable for decoding mixed types from fixtures
struct AnyCodable: Decodable {
    let value: Any

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let b = try? container.decode(Bool.self) { value = b }
        else if let i = try? container.decode(Int.self) { value = i }
        else if let d = try? container.decode(Double.self) { value = d }
        else if let s = try? container.decode(String.self) { value = s }
        else if let a = try? container.decode([AnyCodable].self) { value = a.map(\.value) }
        else { value = NSNull() }
    }

    var intValue: Int? { value as? Int }
    var boolValue: Bool? { value as? Bool }
    var doubleValue: Double? { value as? Double }
    var stringArray: [String]? {
        (value as? [Any])?.compactMap { $0 as? String }
    }
}

final class ContractCompatibilityTests: XCTestCase {

    func fixtureURL(_ name: String) -> URL {
        Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")!
    }

    func testThreadOverlayValidSamples() throws {
        let data = try Data(contentsOf: fixtureURL("thread-overlay-samples"))
        let fixture = try JSONDecoder().decode(ThreadFixture.self, from: data)

        for sample in fixture.valid {
            let r = sample.record
            let result = OverlaySchemaValidator.validateThreadOverlay(
                threadRef: r.thread_ref ?? "",
                conversationRef: r.conversation_ref ?? "",
                isPinned: r.is_pinned?.boolValue ?? false,
                updatedAt: r.updated_at?.intValue ?? -1,
                version: r.version?.intValue ?? 0
            )
            XCTAssertTrue(result.valid, "'\(sample.name)' should be valid: \(result.errors)")
        }
    }

    func testThreadOverlayInvalidSamples() throws {
        let data = try Data(contentsOf: fixtureURL("thread-overlay-samples"))
        let fixture = try JSONDecoder().decode(ThreadFixture.self, from: data)

        for sample in fixture.invalid {
            let r = sample.record
            let result = OverlaySchemaValidator.validateThreadOverlay(
                threadRef: r.thread_ref ?? "",
                conversationRef: r.conversation_ref ?? "",
                isPinned: r.is_pinned?.boolValue ?? false,
                updatedAt: r.updated_at?.intValue ?? -1,
                version: r.version?.intValue ?? 0
            )
            XCTAssertFalse(result.valid, "'\(sample.name)' should be invalid")
        }
    }

    func testConflictResolutionFixtures() throws {
        let data = try Data(contentsOf: fixtureURL("merge-conflict-cases"))
        let fixture = try JSONDecoder().decode(MergeFixture.self, from: data)

        for testCase in fixture.conflict_resolution {
            let result = OverlaySyncMerger.resolveConflict(
                localUpdatedAt: testCase.local.updated_at,
                localVersion: testCase.local.version,
                remoteUpdatedAt: testCase.remote.updated_at,
                remoteVersion: testCase.remote.version
            )
            let expected: ConflictResolution = testCase.expected == "keep_remote" ? .keepRemote : .keepLocal
            XCTAssertEqual(
                result, expected,
                "Case '\(testCase.name)': expected \(testCase.expected), got \(result.rawValue)"
            )
        }
    }

    func testMessageOverlayValidSamples() throws {
        let data = try Data(contentsOf: fixtureURL("message-overlay-samples"))
        let fixture = try JSONDecoder().decode(MessageFixture.self, from: data)

        for sample in fixture.valid {
            let r = sample.record
            let result = OverlaySchemaValidator.validateMessageOverlay(
                id: r.id ?? "",
                messageRef: r.message_ref ?? "",
                conversationRef: r.conversation_ref ?? "",
                labels: r.labels?.stringArray ?? [],
                updatedAt: r.updated_at?.intValue ?? -1,
                version: r.version?.intValue ?? 0
            )
            XCTAssertTrue(result.valid, "'\(sample.name)' should be valid: \(result.errors)")
        }
    }

    func testMessageOverlayInvalidSamples() throws {
        let data = try Data(contentsOf: fixtureURL("message-overlay-samples"))
        let fixture = try JSONDecoder().decode(MessageFixture.self, from: data)

        for sample in fixture.invalid {
            let r = sample.record
            let result = OverlaySchemaValidator.validateMessageOverlay(
                id: r.id ?? "",
                messageRef: r.message_ref ?? "",
                conversationRef: r.conversation_ref ?? "",
                labels: r.labels?.stringArray ?? [],
                updatedAt: r.updated_at?.intValue ?? -1,
                version: r.version?.intValue ?? 0
            )
            XCTAssertFalse(result.valid, "'\(sample.name)' should be invalid")
        }
    }
}
```

**Step 2: Run test to verify it passes**

Run: `cd ios/SignalOverlay && swift test --filter ContractCompatibilityTests 2>&1 | tail -15`
Expected: All 5 tests pass

**Step 3: Commit**

```bash
git add ios/SignalOverlay/Tests/SignalOverlayTests/ContractCompatibilityTests.swift
git commit -m "test(overlay/m5): contract compatibility tests against shared JSON fixtures"
```

---

## Task 12: UIKit Views — ThreadChipRow + OverlayErrorBanner + OverlayUndoToast

**Files:**
- Create: `ios/SignalOverlay/Sources/SignalOverlayUI/ThreadChipRow.swift`
- Create: `ios/SignalOverlay/Sources/SignalOverlayUI/OverlayErrorBanner.swift`
- Create: `ios/SignalOverlay/Sources/SignalOverlayUI/OverlayUndoToast.swift`

**Step 1: Write ThreadChipRow**

```swift
// ios/SignalOverlay/Sources/SignalOverlayUI/ThreadChipRow.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import UIKit
import SignalOverlay

public protocol ThreadChipRowDelegate: AnyObject {
    func threadChipRow(_ chipRow: ThreadChipRow, didSelectThreadRef: String?)
}

public final class ThreadChipRow: UIView {
    public weak var delegate: ThreadChipRowDelegate?
    public private(set) var activeFilterThreadRef: String?

    private let scrollView = UIScrollView()
    private let stackView = UIStackView()
    private var threads: [ThreadOverlay] = []

    public override init(frame: CGRect) {
        super.init(frame: frame)
        setupUI()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) not implemented") }

    private func setupUI() {
        scrollView.showsHorizontalScrollIndicator = false
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(scrollView)

        stackView.axis = .horizontal
        stackView.spacing = 8
        stackView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(stackView)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            scrollView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            scrollView.bottomAnchor.constraint(equalTo: bottomAnchor),
            scrollView.heightAnchor.constraint(equalToConstant: 40),

            stackView.topAnchor.constraint(equalTo: scrollView.topAnchor),
            stackView.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
            stackView.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
            stackView.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
            stackView.heightAnchor.constraint(equalTo: scrollView.heightAnchor),
        ])
    }

    public func update(threads: [ThreadOverlay], activeFilter: String?) {
        self.threads = threads
        self.activeFilterThreadRef = activeFilter
        rebuildChips()
    }

    private func rebuildChips() {
        stackView.arrangedSubviews.forEach { $0.removeFromSuperview() }

        // "All" chip
        let allChip = makeChip(
            title: NSLocalizedString("Overlay.filter.all", comment: "All threads filter"),
            isSelected: activeFilterThreadRef == nil,
            action: #selector(allChipTapped)
        )
        allChip.accessibilityLabel = NSLocalizedString("Overlay.filter.all", comment: "")
        stackView.addArrangedSubview(allChip)

        for thread in threads {
            let title = thread.title ?? thread.threadRef.prefix(8).description
            let chip = makeChip(
                title: (thread.isPinned ? "📌 " : "") + title,
                isSelected: activeFilterThreadRef == thread.threadRef,
                action: #selector(threadChipTapped(_:))
            )
            chip.tag = threads.firstIndex(where: { $0.threadRef == thread.threadRef }) ?? 0
            chip.accessibilityLabel = title
            chip.accessibilityTraits = .button
            stackView.addArrangedSubview(chip)
        }
    }

    private func makeChip(title: String, isSelected: Bool, action: Selector) -> UIButton {
        var config = UIButton.Configuration.filled()
        config.title = title
        config.cornerStyle = .capsule
        config.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12)
        config.baseBackgroundColor = isSelected ? .systemBlue : .secondarySystemFill
        config.baseForegroundColor = isSelected ? .white : .label
        let button = UIButton(configuration: config)
        button.addTarget(self, action: action, for: .touchUpInside)
        button.accessibilityTraits = .button
        return button
    }

    @objc private func allChipTapped() {
        activeFilterThreadRef = nil
        delegate?.threadChipRow(self, didSelectThreadRef: nil)
        rebuildChips()
    }

    @objc private func threadChipTapped(_ sender: UIButton) {
        guard sender.tag < threads.count else { return }
        let ref = threads[sender.tag].threadRef
        activeFilterThreadRef = ref
        delegate?.threadChipRow(self, didSelectThreadRef: ref)
        rebuildChips()
    }
}
```

**Step 2: Write OverlayErrorBanner**

```swift
// ios/SignalOverlay/Sources/SignalOverlayUI/OverlayErrorBanner.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import UIKit

public final class OverlayErrorBanner: UIView {
    private let label = UILabel()
    private var dismissTimer: Timer?
    private static let autoDismissInterval: TimeInterval = 8.0

    public override init(frame: CGRect) {
        super.init(frame: frame)
        setupUI()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) not implemented") }

    private func setupUI() {
        backgroundColor = .systemRed.withAlphaComponent(0.9)
        layer.cornerRadius = 8
        clipsToBounds = true

        label.textColor = .white
        label.font = .preferredFont(forTextStyle: .footnote)
        label.numberOfLines = 2
        label.translatesAutoresizingMaskIntoConstraints = false
        addSubview(label)

        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: topAnchor, constant: 8),
            label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            label.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -8),
        ])

        isAccessibilityElement = true
        accessibilityTraits = .staticText
    }

    public func show(message: String, in parentView: UIView) {
        label.text = message
        accessibilityLabel = message
        translatesAutoresizingMaskIntoConstraints = false

        parentView.addSubview(self)
        NSLayoutConstraint.activate([
            topAnchor.constraint(equalTo: parentView.safeAreaLayoutGuide.topAnchor, constant: 8),
            leadingAnchor.constraint(equalTo: parentView.leadingAnchor, constant: 16),
            trailingAnchor.constraint(equalTo: parentView.trailingAnchor, constant: -16),
        ])

        UIAccessibility.post(notification: .announcement, argument: message)

        dismissTimer?.invalidate()
        dismissTimer = Timer.scheduledTimer(withTimeInterval: Self.autoDismissInterval, repeats: false) { [weak self] _ in
            self?.dismiss()
        }
    }

    public func dismiss() {
        dismissTimer?.invalidate()
        dismissTimer = nil
        UIView.animate(withDuration: 0.3, animations: { self.alpha = 0 }) { _ in
            self.removeFromSuperview()
        }
    }
}
```

**Step 3: Write OverlayUndoToast**

```swift
// ios/SignalOverlay/Sources/SignalOverlayUI/OverlayUndoToast.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import UIKit
import SignalOverlay

public final class OverlayUndoToast: UIView {
    private let messageLabel = UILabel()
    private let undoButton = UIButton(type: .system)
    private var dismissTimer: Timer?
    private var onUndo: (() -> Void)?
    private static let autoDismissInterval: TimeInterval = 5.0

    public override init(frame: CGRect) {
        super.init(frame: frame)
        setupUI()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) not implemented") }

    private func setupUI() {
        backgroundColor = UIColor(white: 0.15, alpha: 0.95)
        layer.cornerRadius = 8

        messageLabel.textColor = .white
        messageLabel.font = .preferredFont(forTextStyle: .subheadline)

        undoButton.setTitle(NSLocalizedString("Overlay.undo", comment: "Undo"), for: .normal)
        undoButton.setTitleColor(.systemYellow, for: .normal)
        undoButton.addTarget(self, action: #selector(undoTapped), for: .touchUpInside)
        undoButton.accessibilityLabel = NSLocalizedString("Overlay.undo", comment: "")
        undoButton.accessibilityTraits = .button

        let stack = UIStackView(arrangedSubviews: [messageLabel, undoButton])
        stack.axis = .horizontal
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)

        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor, constant: 10),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -10),
        ])
    }

    public func show(message: String, in parentView: UIView, onUndo: @escaping () -> Void) {
        self.onUndo = onUndo
        messageLabel.text = message
        translatesAutoresizingMaskIntoConstraints = false

        parentView.addSubview(self)
        NSLayoutConstraint.activate([
            bottomAnchor.constraint(equalTo: parentView.safeAreaLayoutGuide.bottomAnchor, constant: -16),
            leadingAnchor.constraint(equalTo: parentView.leadingAnchor, constant: 16),
            trailingAnchor.constraint(equalTo: parentView.trailingAnchor, constant: -16),
        ])

        UIAccessibility.post(notification: .announcement, argument: message)

        dismissTimer?.invalidate()
        dismissTimer = Timer.scheduledTimer(withTimeInterval: Self.autoDismissInterval, repeats: false) { [weak self] _ in
            self?.dismiss()
        }
    }

    @objc private func undoTapped() {
        dismissTimer?.invalidate()
        onUndo?()
        dismiss()
    }

    public func dismiss() {
        dismissTimer?.invalidate()
        dismissTimer = nil
        UIView.animate(withDuration: 0.3, animations: { self.alpha = 0 }) { _ in
            self.removeFromSuperview()
        }
    }
}
```

**Step 4: Verify build**

Run: `cd ios/SignalOverlay && swift build 2>&1 | tail -5`
Expected: Build succeeded

**Step 5: Commit**

```bash
git add ios/SignalOverlay/Sources/SignalOverlayUI/ThreadChipRow.swift
git add ios/SignalOverlay/Sources/SignalOverlayUI/OverlayErrorBanner.swift
git add ios/SignalOverlay/Sources/SignalOverlayUI/OverlayUndoToast.swift
git commit -m "feat(overlay/m5): ThreadChipRow, OverlayErrorBanner, OverlayUndoToast UIKit views"
```

---

## Task 13: UIKit Views — ThreadListVC + ThreadCreateVC + LabelEditorVC + MenuActions

**Files:**
- Create: `ios/SignalOverlay/Sources/SignalOverlayUI/ThreadListViewController.swift`
- Create: `ios/SignalOverlay/Sources/SignalOverlayUI/ThreadCreateViewController.swift`
- Create: `ios/SignalOverlay/Sources/SignalOverlayUI/LabelEditorViewController.swift`
- Create: `ios/SignalOverlay/Sources/SignalOverlayUI/OverlayMenuActions.swift`

**Step 1: Write ThreadListViewController**

```swift
// ios/SignalOverlay/Sources/SignalOverlayUI/ThreadListViewController.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import UIKit
import Combine
import SignalOverlay

public protocol ThreadListViewControllerDelegate: AnyObject {
    func threadListViewController(_ vc: ThreadListViewController, didSelectThread: ThreadOverlay)
    func threadListViewControllerDidRequestCreateThread(_ vc: ThreadListViewController)
}

public final class ThreadListViewController: UITableViewController {
    public weak var threadDelegate: ThreadListViewControllerDelegate?
    public var conversationRef: String = ""

    private var threads: [ThreadOverlay] = []
    private var store: OverlayStore?
    private var cancellables = Set<AnyCancellable>()
    private let errorBanner = OverlayErrorBanner()
    private let emptyLabel = UILabel()

    public override func viewDidLoad() {
        super.viewDidLoad()
        title = NSLocalizedString("Overlay.threadList.title", comment: "Thread Overlays")
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "ThreadCell")

        navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .add,
            target: self,
            action: #selector(createThreadTapped)
        )
        navigationItem.rightBarButtonItem?.accessibilityLabel =
            NSLocalizedString("Overlay.threadList.create", comment: "Create thread")

        emptyLabel.text = NSLocalizedString("Overlay.threadList.empty", comment: "No threads yet")
        emptyLabel.textColor = .secondaryLabel
        emptyLabel.textAlignment = .center
        emptyLabel.isHidden = true
        tableView.backgroundView = emptyLabel

        overlayEvents.threadsChanged
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.loadThreads() }
            .store(in: &cancellables)

        loadThreads()
    }

    public func configure(store: OverlayStore, conversationRef: String) {
        self.store = store
        self.conversationRef = conversationRef
        if isViewLoaded { loadThreads() }
    }

    private func loadThreads() {
        do {
            threads = try store?.getThreadsByConversation(conversationRef: conversationRef) ?? []
            emptyLabel.isHidden = !threads.isEmpty
            tableView.reloadData()
        } catch {
            errorBanner.show(
                message: NSLocalizedString("Overlay.error.loadFailed", comment: "Failed to load threads"),
                in: view
            )
        }
    }

    @objc private func createThreadTapped() {
        threadDelegate?.threadListViewControllerDidRequestCreateThread(self)
    }

    // MARK: - UITableViewDataSource

    public override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        threads.count
    }

    public override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "ThreadCell", for: indexPath)
        let thread = threads[indexPath.row]
        var content = cell.defaultContentConfiguration()
        content.text = (thread.isPinned ? "📌 " : "") + (thread.title ?? thread.threadRef)
        content.secondaryText = thread.color
        cell.contentConfiguration = content
        cell.accessibilityLabel = thread.title ?? thread.threadRef
        cell.accessibilityTraits = .button
        return cell
    }

    public override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        threadDelegate?.threadListViewController(self, didSelectThread: threads[indexPath.row])
    }

    public override func tableView(
        _ tableView: UITableView,
        trailingSwipeActionsConfigurationForRowAt indexPath: IndexPath
    ) -> UISwipeActionsConfiguration? {
        let thread = threads[indexPath.row]
        let delete = UIContextualAction(style: .destructive, title:
            NSLocalizedString("Overlay.delete", comment: "Delete")
        ) { [weak self] _, _, completion in
            guard let self, let store = self.store else { completion(false); return }
            do {
                _ = try store.deleteThread(threadRef: thread.threadRef)
                overlayEvents.emitThreadsChanged()
                completion(true)
            } catch {
                completion(false)
            }
        }
        return UISwipeActionsConfiguration(actions: [delete])
    }
}
```

**Step 2: Write ThreadCreateViewController**

```swift
// ios/SignalOverlay/Sources/SignalOverlayUI/ThreadCreateViewController.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import UIKit
import SignalOverlay

public protocol ThreadCreateViewControllerDelegate: AnyObject {
    func threadCreateViewController(_ vc: ThreadCreateViewController, didCreate thread: ThreadOverlay)
    func threadCreateViewControllerDidCancel(_ vc: ThreadCreateViewController)
}

public final class ThreadCreateViewController: UIViewController {
    public weak var createDelegate: ThreadCreateViewControllerDelegate?
    public var conversationRef: String = ""
    public var store: OverlayStore?

    private let titleField = UITextField()
    private let errorBanner = OverlayErrorBanner()

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        title = NSLocalizedString("Overlay.createThread.title", comment: "New Thread")

        navigationItem.leftBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .cancel, target: self, action: #selector(cancelTapped)
        )
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .done, target: self, action: #selector(createTapped)
        )
        navigationItem.rightBarButtonItem?.accessibilityLabel =
            NSLocalizedString("Overlay.createThread.create", comment: "Create")

        titleField.placeholder = NSLocalizedString("Overlay.createThread.placeholder", comment: "Thread title")
        titleField.borderStyle = .roundedRect
        titleField.accessibilityLabel = NSLocalizedString("Overlay.createThread.placeholder", comment: "")
        titleField.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(titleField)

        NSLayoutConstraint.activate([
            titleField.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
            titleField.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            titleField.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            titleField.heightAnchor.constraint(equalToConstant: 44),
        ])

        titleField.becomeFirstResponder()
    }

    @objc private func cancelTapped() {
        createDelegate?.threadCreateViewControllerDidCancel(self)
    }

    @objc private func createTapped() {
        guard let store else { return }
        let threadTitle = titleField.text?.trimmingCharacters(in: .whitespacesAndNewlines)
        let ref = UUID().uuidString.lowercased()

        do {
            let thread = try store.createThread(
                threadRef: ref, conversationRef: conversationRef,
                title: threadTitle?.isEmpty == false ? threadTitle : nil
            )
            overlayEvents.emitThreadsChanged()
            createDelegate?.threadCreateViewController(self, didCreate: thread)
        } catch {
            errorBanner.show(
                message: NSLocalizedString("Overlay.error.createFailed", comment: "Failed to create thread"),
                in: view
            )
        }
    }
}
```

**Step 3: Write LabelEditorViewController**

```swift
// ios/SignalOverlay/Sources/SignalOverlayUI/LabelEditorViewController.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import UIKit
import SignalOverlay

public protocol LabelEditorViewControllerDelegate: AnyObject {
    func labelEditorViewController(_ vc: LabelEditorViewController, didUpdateLabels labels: [String])
    func labelEditorViewControllerDidCancel(_ vc: LabelEditorViewController)
}

public final class LabelEditorViewController: UIViewController {
    public weak var labelDelegate: LabelEditorViewControllerDelegate?
    public var messageRef: String = ""
    public var store: OverlayStore?

    private let inputField = UITextField()
    private let chipStack = UIStackView()
    private var labels: [String] = []
    private let errorBanner = OverlayErrorBanner()

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        title = NSLocalizedString("Overlay.labelEditor.title", comment: "Edit Labels")

        navigationItem.leftBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .cancel, target: self, action: #selector(cancelTapped)
        )
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .done, target: self, action: #selector(doneTapped)
        )

        inputField.placeholder = NSLocalizedString("Overlay.labelEditor.placeholder", comment: "Add label")
        inputField.borderStyle = .roundedRect
        inputField.returnKeyType = .done
        inputField.delegate = self
        inputField.accessibilityLabel = NSLocalizedString("Overlay.labelEditor.placeholder", comment: "")
        inputField.translatesAutoresizingMaskIntoConstraints = false

        chipStack.axis = .vertical
        chipStack.spacing = 8
        chipStack.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(inputField)
        view.addSubview(chipStack)

        NSLayoutConstraint.activate([
            inputField.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
            inputField.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            inputField.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            inputField.heightAnchor.constraint(equalToConstant: 44),

            chipStack.topAnchor.constraint(equalTo: inputField.bottomAnchor, constant: 16),
            chipStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            chipStack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
        ])

        loadExistingLabels()
        inputField.becomeFirstResponder()
    }

    private func loadExistingLabels() {
        if let msg = try? store?.getMessageOverlayByRef(messageRef: messageRef) {
            labels = msg.labels
        }
        rebuildChips()
    }

    private func rebuildChips() {
        chipStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for label in labels {
            let row = UIStackView()
            row.axis = .horizontal
            row.spacing = 8

            let chip = UILabel()
            chip.text = label
            chip.font = .preferredFont(forTextStyle: .body)

            let removeBtn = UIButton(type: .close)
            removeBtn.accessibilityLabel = String(
                format: NSLocalizedString("Overlay.labelEditor.remove", comment: "Remove %@"), label
            )
            removeBtn.tag = labels.firstIndex(of: label) ?? 0
            removeBtn.addTarget(self, action: #selector(removeLabelTapped(_:)), for: .touchUpInside)

            row.addArrangedSubview(chip)
            row.addArrangedSubview(removeBtn)
            row.addArrangedSubview(UIView()) // spacer
            chipStack.addArrangedSubview(row)
        }
    }

    @objc private func removeLabelTapped(_ sender: UIButton) {
        guard sender.tag < labels.count else { return }
        labels.remove(at: sender.tag)
        rebuildChips()
    }

    private func addLabel(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !labels.contains(trimmed) else { return }
        labels.append(trimmed)
        rebuildChips()
    }

    @objc private func cancelTapped() {
        labelDelegate?.labelEditorViewControllerDidCancel(self)
    }

    @objc private func doneTapped() {
        guard let store else { return }
        do {
            _ = try store.updateMessageOverlay(messageRef: messageRef, labels: labels)
            overlayEvents.emitLabelsChanged()
            labelDelegate?.labelEditorViewController(self, didUpdateLabels: labels)
        } catch {
            errorBanner.show(
                message: NSLocalizedString("Overlay.error.labelSaveFailed", comment: "Failed to save labels"),
                in: view
            )
        }
    }
}

extension LabelEditorViewController: UITextFieldDelegate {
    public func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        if let text = textField.text {
            addLabel(text)
            textField.text = ""
        }
        return false
    }
}
```

**Step 4: Write OverlayMenuActions**

```swift
// ios/SignalOverlay/Sources/SignalOverlayUI/OverlayMenuActions.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import UIKit
import SignalOverlay

public struct OverlayMenuActions {
    public static func contextMenu(
        for messageRef: String,
        onAddToThread: @escaping () -> Void,
        onCreateThread: @escaping () -> Void,
        onAddLabel: @escaping () -> Void
    ) -> UIMenu {
        let addToThread = UIAction(
            title: NSLocalizedString("Overlay.menu.addToThread", comment: "Add to Thread…"),
            image: UIImage(systemName: "text.line.first.and.arrowtriangle.forward")
        ) { _ in onAddToThread() }

        let createThread = UIAction(
            title: NSLocalizedString("Overlay.menu.createThread", comment: "Create Thread from Message"),
            image: UIImage(systemName: "plus.bubble")
        ) { _ in onCreateThread() }

        let addLabel = UIAction(
            title: NSLocalizedString("Overlay.menu.addLabel", comment: "Add Label"),
            image: UIImage(systemName: "tag")
        ) { _ in onAddLabel() }

        return UIMenu(
            title: NSLocalizedString("Overlay.menu.title", comment: "Thread Overlay"),
            children: [addToThread, createThread, addLabel]
        )
    }
}
```

**Step 5: Verify build**

Run: `cd ios/SignalOverlay && swift build 2>&1 | tail -5`
Expected: Build succeeded

**Step 6: Commit**

```bash
git add ios/SignalOverlay/Sources/SignalOverlayUI/ThreadListViewController.swift
git add ios/SignalOverlay/Sources/SignalOverlayUI/ThreadCreateViewController.swift
git add ios/SignalOverlay/Sources/SignalOverlayUI/LabelEditorViewController.swift
git add ios/SignalOverlay/Sources/SignalOverlayUI/OverlayMenuActions.swift
git commit -m "feat(overlay/m5): ThreadList, ThreadCreate, LabelEditor, MenuActions UIKit views"
```

---

## Task 14: Localizable.strings

**Files:**
- Create: `ios/SignalOverlay/Sources/SignalOverlayUI/Resources/en.lproj/Localizable.strings`

**Step 1: Write strings file**

```
/* ios/SignalOverlay/Sources/SignalOverlayUI/Resources/en.lproj/Localizable.strings */
"Overlay.filter.all" = "All";
"Overlay.threadList.title" = "Thread Overlays";
"Overlay.threadList.create" = "Create Thread";
"Overlay.threadList.empty" = "No threads yet. Create one from a message.";
"Overlay.createThread.title" = "New Thread";
"Overlay.createThread.placeholder" = "Thread title";
"Overlay.createThread.create" = "Create";
"Overlay.labelEditor.title" = "Edit Labels";
"Overlay.labelEditor.placeholder" = "Add label";
"Overlay.labelEditor.remove" = "Remove %@";
"Overlay.menu.title" = "Thread Overlay";
"Overlay.menu.addToThread" = "Add to Thread…";
"Overlay.menu.createThread" = "Create Thread from Message";
"Overlay.menu.addLabel" = "Add Label";
"Overlay.undo" = "Undo";
"Overlay.delete" = "Delete";
"Overlay.error.loadFailed" = "Failed to load overlay data.";
"Overlay.error.createFailed" = "Failed to create thread.";
"Overlay.error.labelSaveFailed" = "Failed to save labels.";
"Overlay.error.generic" = "An overlay error occurred.";
"Overlay.pin" = "Pin";
"Overlay.unpin" = "Unpin";
"Overlay.thread.pinned" = "Pinned";
"Overlay.thread.messages" = "%d messages";
"Overlay.undo.threadDeleted" = "Thread deleted";
"Overlay.undo.messageRemoved" = "Message removed from thread";
"Overlay.undo.labelRemoved" = "Label removed";
```

Note: Update `Package.swift` SignalOverlayUI target to include resources:

```swift
.target(
    name: "SignalOverlayUI",
    dependencies: ["SignalOverlay"],
    path: "Sources/SignalOverlayUI",
    resources: [.process("Resources")]
),
```

**Step 2: Verify build**

Run: `cd ios/SignalOverlay && swift build 2>&1 | tail -5`
Expected: Build succeeded

**Step 3: Commit**

```bash
git add ios/SignalOverlay/Sources/SignalOverlayUI/Resources/
git add ios/SignalOverlay/Package.swift
git commit -m "feat(overlay/m5): Localizable.strings with ~25 Overlay.* keys"
```

---

## Task 15: Remove Placeholder, Clean Up, Final Build + Test

**Files:**
- Delete: `ios/SignalOverlay/Tests/SignalOverlayTests/PlaceholderTest.swift`
- Modify: `ios/SignalOverlay/Sources/SignalOverlay/SignalOverlay.swift` (add public re-exports)

**Step 1: Update namespace file with public re-exports**

```swift
// ios/SignalOverlay/Sources/SignalOverlay/SignalOverlay.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// SignalOverlay module — re-export key types for convenience.

@_exported import struct SignalOverlay.ThreadOverlay
@_exported import struct SignalOverlay.MessageOverlay
@_exported import struct SignalOverlay.OverlaySyncState
@_exported import struct SignalOverlay.MessageRefAdapter
@_exported import class SignalOverlay.OverlayStore
@_exported import enum SignalOverlay.OverlayFeatureFlag
@_exported import class SignalOverlay.OverlayEventBus
@_exported import class SignalOverlay.OverlayUndoManager
@_exported import struct SignalOverlay.OverlaySchemaValidator
@_exported import struct SignalOverlay.OverlaySyncMerger
```

Actually, since all types are in the same module, re-exports are unnecessary. Just make it a doc comment:

```swift
// ios/SignalOverlay/Sources/SignalOverlay/SignalOverlay.swift
// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// SignalOverlay — iOS overlay logic library.
// Public API: ThreadOverlay, MessageOverlay, OverlayStore, MessageRefAdapter,
// OverlayFeatureFlag, OverlayEventBus, OverlayUndoManager,
// OverlaySchemaValidator, OverlaySyncMerger, OverlayMigration
```

**Step 2: Delete placeholder test**

Delete `ios/SignalOverlay/Tests/SignalOverlayTests/PlaceholderTest.swift`

**Step 3: Full build + test**

Run: `cd ios/SignalOverlay && swift build 2>&1 | tail -5`
Expected: Build succeeded

Run: `cd ios/SignalOverlay && swift test 2>&1 | tail -20`
Expected: All tests pass (approximately 50+ tests across 8 test files)

**Step 4: Commit**

```bash
git rm ios/SignalOverlay/Tests/SignalOverlayTests/PlaceholderTest.swift
git add ios/SignalOverlay/Sources/SignalOverlay/SignalOverlay.swift
git commit -m "chore(overlay/m5): clean up placeholder, finalize module exports"
```

---

## Task 16: Update Memory + Design Doc

**Step 1: Update MEMORY.md with M5 status**

**Step 2: Final commit with all docs**

```bash
git add docs/plans/2026-03-03-m5-ios-overlay-design.md
git add docs/plans/2026-03-03-m5-ios-overlay.md
git commit -m "docs(overlay/m5): design doc and implementation plan"
```

---

## Summary

| Task | Component | Tests |
|------|-----------|-------|
| 1 | Package scaffold | 1 placeholder |
| 2 | Models (3 GRDB records) | -- |
| 3 | GRDB Migration | 4 tests |
| 4 | MessageRefAdapter | 8 tests |
| 5 | OverlayStore (CRUD) | 11 tests |
| 6 | OverlaySchemaValidator | 6 tests |
| 7 | OverlaySyncMerger | 9 tests |
| 8 | OverlayFeatureFlag | 5 tests |
| 9 | OverlayEventBus | 4 tests |
| 10 | OverlayUndoManager | 5 tests |
| 11 | Contract compatibility (fixtures) | 5 tests |
| 12 | UIKit: ThreadChipRow, ErrorBanner, UndoToast | build-only |
| 13 | UIKit: ThreadList, ThreadCreate, LabelEditor, MenuActions | build-only |
| 14 | Localizable.strings | -- |
| 15 | Cleanup + final test | full suite |
| 16 | Memory + docs | -- |

**Total: ~57 tests, 16 tasks, ~20 Swift source files**
