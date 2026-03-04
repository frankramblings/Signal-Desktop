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
        XCTAssertFalse(OverlayFeatureFlag.isOverlayCloudSyncEnabled)

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
