import SwiftUI

/// 注册：手机号 + 短信验证码 + 密码（手机号为账号根，微信绑定为后续可选通道）。
struct RegisterView: View {
    @StateObject private var viewModel = AuthViewModel()

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                TextField("手机号", text: $viewModel.phone)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .fieldStyle()

                HStack(spacing: 12) {
                    TextField("短信验证码", text: $viewModel.code)
                        .keyboardType(.numberPad)
                        .fieldStyle()
                    Button(viewModel.codeCountdown > 0 ? "\(viewModel.codeCountdown)s" : "发送验证码") {
                        Task { await viewModel.sendCode(scene: .register) }
                    }
                    .disabled(viewModel.codeCountdown > 0)
                    .foregroundStyle(Theme.primary)
                }

                SecureField("设置密码", text: $viewModel.password)
                    .textContentType(.newPassword)
                    .fieldStyle()

                TextField("昵称（选填）", text: $viewModel.nickname)
                    .fieldStyle()

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
                .disabled(viewModel.isSubmitting || !viewModel.phoneIsValid || viewModel.code.isEmpty || viewModel.password.count < 6)
            }
            .padding(24)
        }
        .navigationTitle("注册账号")
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
