// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation

public enum OverlayFeatureFlag {
    private static let threadsKey = "overlayThreadsEnabled"
    private static let syncKey = "overlayCloudSyncEnabled"

    // Thread-safe test overrides
    private static let lock = NSLock()
    private static var _threadsOverrideStorage: Bool?
    private static var _syncOverrideStorage: Bool?

    private static var _threadsOverride: Bool? {
        get { lock.withLock { _threadsOverrideStorage } }
        set { lock.withLock { _threadsOverrideStorage = newValue } }
    }

    private static var _syncOverride: Bool? {
        get { lock.withLock { _syncOverrideStorage } }
        set { lock.withLock { _syncOverrideStorage = newValue } }
    }

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
