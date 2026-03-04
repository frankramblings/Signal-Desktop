// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

#if canImport(UIKit)
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
#endif
