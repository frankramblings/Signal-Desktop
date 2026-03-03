// Copyright 2026 Signal Overlay Contributors
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
        self.deviceId = deviceId; self.lastSyncToken = lastSyncToken; self.lastSyncAt = lastSyncAt
    }
}
