import SwiftUI

/// 忘记密码：手机号 + 验证码重置。
struct ResetPasswordView: View {
    @StateObject private var viewModel = AuthViewModel()
    @State private var newPassword = ""
    @State private var succeeded = false
    @Environment(\.dismiss) private var dismiss

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
                        Task { await viewModel.sendCode(scene: .reset) }
                    }
                    .disabled(viewModel.codeCountdown > 0)
                    .foregroundStyle(Theme.primary)
                }

                SecureField("新密码", text: $newPassword)
                    .textContentType(.newPassword)
                    .fieldStyle()

                if let error = viewModel.errorMessage {
                    ErrorBanner(message: error)
                }
                if succeeded {
                    Text("密码已重置，请用新密码登录")
                        .font(.footnote)
                        .foregroundStyle(Theme.primary)
                }

                Button {
                    Task {
                        succeeded = await viewModel.resetPassword(newPassword: newPassword)
                        if succeeded {
                            dismiss()
                        }
                    }
                } label: {
                    Text(viewModel.isSubmitting ? "提交中…" : "重置密码")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.primary)
                .disabled(viewModel.isSubmitting || !viewModel.phoneIsValid || viewModel.code.isEmpty || newPassword.count < 6)
            }
            .padding(24)
        }
        .navigationTitle("重置密码")
    }
}
