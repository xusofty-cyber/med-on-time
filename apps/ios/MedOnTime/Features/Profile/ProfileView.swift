import SwiftUI

/// 我的：账号头 + 成员切换 / 管理 + 功能入口（关怀设置 / 库存 / 健康档案 / 授权 / 消息 / 设置）。
struct ProfileView: View {
    @EnvironmentObject private var session: AuthSession
    @Environment(\.careMode) private var careMode
    @State private var showAddMember = false
    @State private var memberToDelete: MemberDTO?

    var body: some View {
        NavigationStack {
            List {
                accountSection
                membersSection
                featuresSection
            }
            .navigationTitle("我的")
            .sheet(isPresented: $showAddMember) {
                MemberEditView(member: nil)
            }
            .alert("删除成员？", isPresented: deleteAlertBinding) {
                Button("取消", role: .cancel) { memberToDelete = nil }
                Button("删除", role: .destructive) {
                    if let member = memberToDelete {
                        Task { await deleteMember(member) }
                    }
                    memberToDelete = nil
                }
            } message: {
                Text("删除后该成员的计划与记录将不可见，请谨慎操作。")
            }
        }
    }

    private var accountSection: some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: "person.crop.circle.fill")
                    .font(.system(size: careMode ? 52 : 44))
                    .foregroundStyle(Theme.primary)
                VStack(alignment: .leading, spacing: 4) {
                    Text(session.account?.nickname ?? "药准时用户")
                        .font(careMode ? .title3.bold() : .headline)
                    if let phone = session.account?.phoneMasked {
                        Text(phone)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    if session.account?.status == .cancelling {
                        Text("账号注销冷静期中")
                            .font(.caption)
                            .foregroundStyle(Theme.danger)
                    }
                }
            }
            .careTouchTarget(careMode)
        }
    }

    private var membersSection: some View {
        Section("家庭成员（\(session.members.count)/10）") {
            ForEach(session.members) { member in
                HStack {
                    Button {
                        Task { await session.selectMember(member) }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(member.displayName)
                                    .font(careMode ? .body.bold() : .body)
                                    .foregroundStyle(.primary)
                                Text(memberSubtitle(member))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if member.id == session.currentMember?.id {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(Theme.primary)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    if member.isOwn {
                        NavigationLink {
                            MemberEditView(member: member)
                        } label: {
                            Image(systemName: "pencil")
                        }
                        .frame(width: 32)
                    }
                }
                .careTouchTarget(careMode)
                .swipeActions(edge: .trailing) {
                    if member.isOwn {
                        Button(role: .destructive) {
                            memberToDelete = member
                        } label: {
                            Label("删除", systemImage: "trash")
                        }
                    }
                }
            }
            Button {
                showAddMember = true
            } label: {
                Label("添加成员", systemImage: "person.badge.plus")
            }
            .disabled(session.members.filter(\.isOwn).count >= 10)
        }
    }

    private var featuresSection: some View {
        Section("功能") {
            NavigationLink {
                CareSettingsView()
            } label: {
                Label("关怀模式与提醒设置", systemImage: "textformat.size")
            }
            NavigationLink {
                StockView()
            } label: {
                Label("药品库存", systemImage: "shippingbox")
            }
            NavigationLink {
                EhrView()
            } label: {
                Label("健康档案", systemImage: "heart.text.square")
            }
            NavigationLink {
                AuthorizationsView()
            } label: {
                Label("照护授权", systemImage: "person.2.badge.key")
            }
            NavigationLink {
                NotificationsView()
            } label: {
                Label("消息通知", systemImage: "bell")
            }
            NavigationLink {
                SettingsView()
            } label: {
                Label("设置", systemImage: "gearshape")
            }
        }
    }

    private func memberSubtitle(_ member: MemberDTO) -> String {
        var parts = [member.relationship.label]
        if !member.isOwn, let level = member.accessLevel {
            parts.append("照护授权 \(level)")
        }
        return parts.joined(separator: " · ")
    }

    private var deleteAlertBinding: Binding<Bool> {
        Binding(
            get: { memberToDelete != nil },
            set: { if !$0 { memberToDelete = nil } }
        )
    }

    private func deleteMember(_ member: MemberDTO) async {
        _ = try? await AppEnvironment.shared.memberService.remove(memberId: member.id)
        await session.reloadMembers()
    }
}
