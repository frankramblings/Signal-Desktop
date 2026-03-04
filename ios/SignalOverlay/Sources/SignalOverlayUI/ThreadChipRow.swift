// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

#if canImport(UIKit)
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

        let allChip = makeChip(
            title: NSLocalizedString("Overlay.filter.all", comment: "All threads filter"),
            isSelected: activeFilterThreadRef == nil,
            action: #selector(allChipTapped)
        )
        allChip.accessibilityLabel = NSLocalizedString("Overlay.filter.all", comment: "")
        stackView.addArrangedSubview(allChip)

        for (index, thread) in threads.enumerated() {
            let title = thread.title ?? String(thread.threadRef.prefix(8))
            let chip = makeChip(
                title: (thread.isPinned ? "\u{1F4CC} " : "") + title,
                isSelected: activeFilterThreadRef == thread.threadRef,
                action: #selector(threadChipTapped(_:))
            )
            chip.tag = index
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
#endif
