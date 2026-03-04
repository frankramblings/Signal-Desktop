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
