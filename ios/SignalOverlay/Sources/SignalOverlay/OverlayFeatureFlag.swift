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
