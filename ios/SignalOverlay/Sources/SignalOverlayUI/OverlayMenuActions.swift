// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

#if canImport(UIKit)
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
            title: NSLocalizedString("Overlay.menu.addToThread", comment: "Add to Thread..."),
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
#endif
