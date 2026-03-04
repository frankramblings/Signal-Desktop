// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

#if canImport(UIKit)
import UIKit
import SignalOverlay

public protocol LabelEditorViewControllerDelegate: AnyObject {
    func labelEditorViewController(_ vc: LabelEditorViewController, didUpdateLabels labels: [String])
    func labelEditorViewControllerDidCancel(_ vc: LabelEditorViewController)
}

public final class LabelEditorViewController: UIViewController {
    public weak var labelDelegate: LabelEditorViewControllerDelegate?
    public var messageRef: String = ""
    public var store: OverlayStore?

    private let inputField = UITextField()
    private let chipStack = UIStackView()
    private var labels: [String] = []
    private let errorBanner = OverlayErrorBanner()

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        title = NSLocalizedString("Overlay.labelEditor.title", comment: "Edit Labels")

        navigationItem.leftBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .cancel, target: self, action: #selector(cancelTapped)
        )
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .done, target: self, action: #selector(doneTapped)
        )

        inputField.placeholder = NSLocalizedString("Overlay.labelEditor.placeholder", comment: "Add label")
        inputField.borderStyle = .roundedRect
        inputField.returnKeyType = .done
        inputField.delegate = self
        inputField.accessibilityLabel = NSLocalizedString("Overlay.labelEditor.placeholder", comment: "")
        inputField.translatesAutoresizingMaskIntoConstraints = false

        chipStack.axis = .vertical
        chipStack.spacing = 8
        chipStack.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(inputField)
        view.addSubview(chipStack)

        NSLayoutConstraint.activate([
            inputField.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
            inputField.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            inputField.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            inputField.heightAnchor.constraint(equalToConstant: 44),
            chipStack.topAnchor.constraint(equalTo: inputField.bottomAnchor, constant: 16),
            chipStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            chipStack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
        ])

        loadExistingLabels()
        inputField.becomeFirstResponder()
    }

    private func loadExistingLabels() {
        if let msg = try? store?.getMessageOverlayByRef(messageRef: messageRef) {
            labels = msg.labels
        }
        rebuildChips()
    }

    private func rebuildChips() {
        chipStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        for (index, label) in labels.enumerated() {
            let row = UIStackView()
            row.axis = .horizontal
            row.spacing = 8

            let chip = UILabel()
            chip.text = label
            chip.font = .preferredFont(forTextStyle: .body)

            let removeBtn = UIButton(type: .close)
            removeBtn.accessibilityLabel = String(
                format: NSLocalizedString("Overlay.labelEditor.remove", comment: "Remove %@"), label
            )
            removeBtn.tag = index
            removeBtn.addTarget(self, action: #selector(removeLabelTapped(_:)), for: .touchUpInside)

            row.addArrangedSubview(chip)
            row.addArrangedSubview(removeBtn)
            row.addArrangedSubview(UIView()) // spacer
            chipStack.addArrangedSubview(row)
        }
    }

    @objc private func removeLabelTapped(_ sender: UIButton) {
        guard sender.tag < labels.count else { return }
        labels.remove(at: sender.tag)
        rebuildChips()
    }

    private func addLabel(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !labels.contains(trimmed) else { return }
        labels.append(trimmed)
        rebuildChips()
    }

    @objc private func cancelTapped() {
        labelDelegate?.labelEditorViewControllerDidCancel(self)
    }

    @objc private func doneTapped() {
        guard let store else { return }
        do {
            _ = try store.updateMessageOverlay(messageRef: messageRef, labels: labels)
            overlayEvents.emitLabelsChanged()
            labelDelegate?.labelEditorViewController(self, didUpdateLabels: labels)
        } catch {
            errorBanner.show(
                message: NSLocalizedString("Overlay.error.labelSaveFailed", comment: "Failed to save labels"),
                in: view
            )
        }
    }
}

extension LabelEditorViewController: UITextFieldDelegate {
    public func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        if let text = textField.text {
            addLabel(text)
            textField.text = ""
        }
        return false
    }
}
#endif
