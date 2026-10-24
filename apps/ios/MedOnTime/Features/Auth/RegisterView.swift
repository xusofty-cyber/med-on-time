import SwiftUI

/// 注册：邮箱 + 邮箱验证码 + 密码（邮箱为唯一可用验证码通道，与 Web 端同口径）。
/// 短信通道暂未开通：入口保留并标注，点发码/提交时提示并切回邮箱。
struct RegisterView: View {
    @StateObject private var viewModel = AuthViewModel()

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Picker("注册方式", selection: $viewModel.codeChannel) {
                    ForEach(AuthViewModel.CodeChannel.allCases, id: \.self) { item in
                        Text(item.rawValue).tag(item)
                    }
                }
                .pickerStyle(.segmented)

                if viewModel.codeChannel == .phone {
                    Text("短信通道暂未开通，请使用邮箱验证码")
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    TextField("手机号", text: $viewModel.phone)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                        .fieldStyle()

                    HStack(spacing: 12) {
                        TextField("短信验证码", text: $viewModel.code)
                            .keyboardType(.numberPad)
                            .fieldStyle()
                        Button("发送验证码") {
                            viewModel.smsUnavailable()
                        }
                        .foregroundStyle(Theme.primary)
                    }
                } else {
                    TextField("邮箱", text: $viewModel.email)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .autocapitalization(.none)
                        .fieldStyle()

                    HStack(spacing: 12) {
                        TextField("邮箱验证码", text: $viewModel.emailCode)
                            .keyboardType(.numberPad)
                            .fieldStyle()
                        Button(viewModel.emailCountdown > 0 ? "\(viewModel.emailCountdown)s" : "发送验证码") {
                            Task { await viewModel.sendEmailCode(scene: .register) }
                        }
                        .disabled(viewModel.emailCountdown > 0)
                        .foregroundStyle(Theme.primary)
                    }
                }

                SecureField("设置密码", text: $viewModel.password)
                    .textContentType(.newPassword)
                    .fieldStyle()

                TextField("昵称（选填）", text: $viewModel.nickname)
                    .fieldStyle()

                if viewModel.codeChannel == .email {
                    TextField("手机号（选填，未验证）", text: $viewModel.emailPhone)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                        .fieldStyle()
                }

                if let error = viewModel.errorMessage {
                    ErrorBanner(message: error)
                }
                if let info = viewModel.infoMessage {
                    Text(info).font(.footnote).foregroundStyle(Theme.primary)
                }

                Button {
                    Task { await viewModel.register() }
                } label: {
                    Text(viewModel.isSubmitting ? "注册中…" : "注册并登录")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.primary)
                .disabled(viewModel.isSubmitting || !canSubmit)
            }
            .padding(24)
        }
        .navigationTitle("注册账号")
    }

    /// 短信通道下提交按钮保持可点：点击后提示未开通并切回邮箱（见 ViewModel.smsUnavailable）。
    private var canSubmit: Bool {
        if viewModel.codeChannel == .phone { return true }
        return viewModel.emailIsValid && !viewModel.emailCode.isEmpty && viewModel.passwordIsValid
    }
}

extension View {
    /// 登录 / 注册表单统一输入框样式。
    func fieldStyle() -> some View {
        padding(12)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
