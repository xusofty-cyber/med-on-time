import SwiftUI

/// 消息通知 ViewModel（站内通知分页列表）。
@MainActor
final class NotificationsViewModel: ObservableObject {
    @Published private(set) var items: [NotificationItemDTO] = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let notificationService: NotificationService

    init(notificationService: NotificationService = AppEnvironment.shared.notificationService) {
        self.notificationService = notificationService
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let page = try await notificationService.list()
            items = page.items
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.message ?? "消息加载失败"
        }
    }

    func markRead(_ item: NotificationItemDTO) async {
        guard item.unread else { return }
        _ = try? await notificationService.markRead(id: item.id)
        await load()
    }
}

/// 消息通知：站内消息列表，点开即标记已读。
struct NotificationsView: View {
    @StateObject private var viewModel = NotificationsViewModel()

    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.items.isEmpty {
                ProgressView("正在加载消息…")
            } else if viewModel.items.isEmpty {
                EmptyStateView(title: "暂无消息", systemImage: "bell.slash", description: nil)
            } else {
                List {
                    if let error = viewModel.errorMessage {
                        Section {
                            ErrorBanner(message: error)
                        }
                    }
                    ForEach(viewModel.items) { item in
                        Button {
                            Task { await viewModel.markRead(item) }
                        } label: {
                            HStack(alignment: .top, spacing: 10) {
                                Circle()
                                    .fill(item.unread ? Theme.primary : Color.clear)
                                    .frame(width: 8, height: 8)
                                    .padding(.top, 6)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.title)
                                        .font(.headline)
                                        .foregroundStyle(.primary)
                                    Text(item.content)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(3)
                                    Text(item.createdAt.formatted(date: .abbreviated, time: .shortened))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .navigationTitle("消息通知")
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }
}
