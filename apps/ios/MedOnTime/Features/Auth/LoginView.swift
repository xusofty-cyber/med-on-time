import SwiftUI

/// 登录：手机号 + 密码，或手机号 + 短信验证码（双通道，与注册口径一致）。
struct LoginView: View {
    @StateObject private var viewModel = AuthViewModel()
    @State private var mode: LoginMode = .password

    private enum LoginMode: String, CaseIterable {
        case password = "密码登录"
        case code = "验证码登录"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    header
                    Picker("登录方式", selection: $mode) {
                        ForEach(LoginMode.allCases, id: \.self) { item in
                            Text(item.rawValue).tag(item)
                        }
                    }
                    .pickerStyle(.segmented)

                    VStack(spacing: 12) {
                        TextField("手机号", text: $viewModel.phone)
                            .keyboardType(.phonePad)
                            .textContentType(.telephoneNumber)
                            .padding(12)
                            .background(Color(.secondarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 10))

                        if mode == .password {
                            SecureField("密码", text: $viewModel.password)
                                .textContentType(.password)
                                .padding(12)
                                .background(Color(.secondarySystemBackground))
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        } else {
                            HStack(spacing: 12) {
                                TextField("验证码", text: $viewModel.code)
                                    .keyboardType(.numberPad)
                                    .padding(12)
                                    .background(Color(.secondarySystemBackground))
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                                Button(viewModel.codeCountdown > 0 ? "\(viewModel.codeCountdown)s" : "发送验证码") {
                                    Task { await viewModel.sendCode(scene: .login) }
                                }
                                .disabled(viewModel.codeCountdown > 0)
                                .foregroundStyle(Theme.primary)
                            }
                        }
                    }

                    if let error = viewModel.errorMessage {
                        ErrorBanner(message: error)
                    }
                    if let info = viewModel.infoMessage {
                        Text(info)
                            .font(.footnote)
                            .foregroundStyle(Theme.primary)
                    }

                    Button {
                        Task {
                            if mode == .password {
                                await viewModel.loginByPassword()
                            } else {
                                await viewModel.loginByCode()
                            }
                        }
                    } label: {
                        Text(viewModel.isSubmitting ? "登录中…" : "登录")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Theme.primary)
                    .disabled(viewModel.isSubmitting || !viewModel.phoneIsValid)

                    HStack {
                        NavigationLink("忘记密码") { ResetPasswordView() }
                        Spacer()
                        NavigationLink("注册账号") { RegisterView() }
                    }
                    .font(.footnote)
                    .foregroundStyle(Theme.primary)
                }
                .padding(24)
            }
            .navigationTitle("药准时")
        }
    }

    private var header: some View {
        VStack(spacing: 8) {
            Image(systemName: "pills.circle.fill")
                .font(.system(size: 56))
                .foregroundStyle(Theme.primary)
            Text("按时吃药，家人放心")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(.top, 24)
    }
}
