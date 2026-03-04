// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

#if canImport(UIKit)
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
#endif
