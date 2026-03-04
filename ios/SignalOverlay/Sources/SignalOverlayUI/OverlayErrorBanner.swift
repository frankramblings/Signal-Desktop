// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

#if canImport(UIKit)
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
#endif
