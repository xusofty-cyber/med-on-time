import SwiftUI

/// 登录：手机号/邮箱 + 密码，或邮箱 + 邮箱验证码（邮箱为唯一可用验证码通道，与 Web 端同口径）。
/// 短信通道暂未开通：入口保留并标注，点发码/提交时提示并切回邮箱。
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

                    if mode == .password {
                        VStack(spacing: 12) {
                            TextField("手机号或邮箱", text: $viewModel.account)
                                .keyboardType(.emailAddress)
                                .textContentType(.username)
                                .autocapitalization(.none)
                                .padding(12)
                                .background(Color(.secondarySystemBackground))
                                .clipShape(RoundedRectangle(cornerRadius: 10))

                            SecureField("密码", text: $viewModel.password)
                                .textContentType(.password)
                                .padding(12)
                                .background(Color(.secondarySystemBackground))
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                    } else {
                        VStack(spacing: 12) {
                            Picker("验证码接收方式", selection: $viewModel.codeChannel) {
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
                                    .padding(12)
                                    .background(Color(.secondarySystemBackground))
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                                HStack(spacing: 12) {
                                    TextField("验证码", text: $viewModel.code)
                                        .keyboardType(.numberPad)
                                        .padding(12)
                                        .background(Color(.secondarySystemBackground))
                                        .clipShape(RoundedRectangle(cornerRadius: 10))
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
                                    .padding(12)
                                    .background(Color(.secondarySystemBackground))
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                                HStack(spacing: 12) {
                                    TextField("邮箱验证码", text: $viewModel.emailCode)
                                        .keyboardType(.numberPad)
                                        .padding(12)
                                        .background(Color(.secondarySystemBackground))
                                        .clipShape(RoundedRectangle(cornerRadius: 10))
                                    Button(viewModel.emailCountdown > 0 ? "\(viewModel.emailCountdown)s" : "发送验证码") {
                                        Task { await viewModel.sendEmailCode(scene: .login) }
                                    }
                                    .disabled(viewModel.emailCountdown > 0)
                                    .foregroundStyle(Theme.primary)
                                }
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
                    .disabled(viewModel.isSubmitting || !canSubmit)

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

    /// 短信通道下提交按钮保持可点：点击后提示未开通并切回邮箱（见 ViewModel.smsUnavailable）。
    private var canSubmit: Bool {
        if mode == .password { return viewModel.accountIsValid }
        if viewModel.codeChannel == .phone { return true }
        return viewModel.emailIsValid && !viewModel.emailCode.isEmpty
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
