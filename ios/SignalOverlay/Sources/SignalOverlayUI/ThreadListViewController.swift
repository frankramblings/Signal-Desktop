// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

#if canImport(UIKit)
import UIKit
import Combine
import SignalOverlay

public protocol ThreadListViewControllerDelegate: AnyObject {
    func threadListViewController(_ vc: ThreadListViewController, didSelectThread: ThreadOverlay)
    func threadListViewControllerDidRequestCreateThread(_ vc: ThreadListViewController)
}

public final class ThreadListViewController: UITableViewController {
    public weak var threadDelegate: ThreadListViewControllerDelegate?
    public var conversationRef: String = ""

    private var threads: [ThreadOverlay] = []
    private var store: OverlayStore?
    private var cancellables = Set<AnyCancellable>()
    private let errorBanner = OverlayErrorBanner()
    private let emptyLabel = UILabel()

    public override func viewDidLoad() {
        super.viewDidLoad()
        title = NSLocalizedString("Overlay.threadList.title", comment: "Thread Overlays")
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "ThreadCell")

        navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .add,
            target: self,
            action: #selector(createThreadTapped)
        )
        navigationItem.rightBarButtonItem?.accessibilityLabel =
            NSLocalizedString("Overlay.threadList.create", comment: "Create thread")

        emptyLabel.text = NSLocalizedString("Overlay.threadList.empty", comment: "No threads yet")
        emptyLabel.textColor = .secondaryLabel
        emptyLabel.textAlignment = .center
        emptyLabel.isHidden = true
        tableView.backgroundView = emptyLabel

        overlayEvents.threadsChanged
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.loadThreads() }
            .store(in: &cancellables)

        loadThreads()
    }

    public func configure(store: OverlayStore, conversationRef: String) {
        self.store = store
        self.conversationRef = conversationRef
        if isViewLoaded { loadThreads() }
    }

    private func loadThreads() {
        do {
            threads = try store?.getThreadsByConversation(conversationRef: conversationRef) ?? []
            emptyLabel.isHidden = !threads.isEmpty
            tableView.reloadData()
        } catch {
            errorBanner.show(
                message: NSLocalizedString("Overlay.error.loadFailed", comment: "Failed to load threads"),
                in: view
            )
        }
    }

    @objc private func createThreadTapped() {
        threadDelegate?.threadListViewControllerDidRequestCreateThread(self)
    }

    // MARK: - UITableViewDataSource

    public override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        threads.count
    }

    public override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "ThreadCell", for: indexPath)
        let thread = threads[indexPath.row]
        var content = cell.defaultContentConfiguration()
        content.text = (thread.isPinned ? "\u{1F4CC} " : "") + (thread.title ?? thread.threadRef)
        content.secondaryText = thread.color
        cell.contentConfiguration = content
        cell.accessibilityLabel = thread.title ?? thread.threadRef
        cell.accessibilityTraits = .button
        return cell
    }

    public override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        threadDelegate?.threadListViewController(self, didSelectThread: threads[indexPath.row])
    }

    public override func tableView(
        _ tableView: UITableView,
        trailingSwipeActionsConfigurationForRowAt indexPath: IndexPath
    ) -> UISwipeActionsConfiguration? {
        let thread = threads[indexPath.row]
        let delete = UIContextualAction(style: .destructive, title:
            NSLocalizedString("Overlay.delete", comment: "Delete")
        ) { [weak self] _, _, completion in
            guard let self, let store = self.store else { completion(false); return }
            do {
                _ = try store.deleteThread(threadRef: thread.threadRef)
                overlayEvents.emitThreadsChanged()
                completion(true)
            } catch {
                completion(false)
            }
        }
        return UISwipeActionsConfiguration(actions: [delete])
    }
}
#endif
