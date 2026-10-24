package com.medontime.app.feature.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.medontime.app.core.ApiException
import com.medontime.app.core.LocalAppContainer
import com.medontime.app.data.model.EmailCodeScene
import com.medontime.app.data.repository.AuthRepository
import com.medontime.app.ui.components.CareButton
import com.medontime.app.ui.components.CareTextButton
import com.medontime.app.ui.components.viewModelFactory
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AuthUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val smsHint: String? = null,
    /** 发码后 60 秒重发倒计时（与后端 60 秒重发间隔一致，短信/邮箱通道共用）。 */
    val codeCooldown: Int = 0,
)

class AuthViewModel(private val repo: AuthRepository) : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state.asStateFlow()
    private var cooldownJob: Job? = null

    private fun run(block: suspend () -> Unit) {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                block()
            } catch (e: ApiException) {
                _state.update { it.copy(loading = false, error = e.message) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "操作失败") }
            }
        }
    }

    /** 发码成功后起 60 秒倒计时；倒计时内再次点击直接忽略（后端同样会限频报错）。 */
    private fun startCooldown() {
        cooldownJob?.cancel()
        cooldownJob = viewModelScope.launch {
            _state.update { it.copy(codeCooldown = 60) }
            while (true) {
                delay(1000)
                val next = _state.value.codeCooldown - 1
                _state.update { it.copy(codeCooldown = next.coerceAtLeast(0)) }
                if (next <= 0) break
            }
        }
    }

    /**
     * 短信通道暂未开通（个人拿不到腾讯云短信签名/模板，需企业认证；网关暂缓上线）：
     * 发码/提交一律不调后端接口，直接提示并由界面切到邮箱 tab。邮箱是唯一可用验证码通道。
     */
    fun notifySmsUnavailable() {
        _state.update { it.copy(error = "短信通道暂未开通，请使用邮箱验证码") }
    }

    fun sendEmailCode(email: String, scene: EmailCodeScene) {
        if (_state.value.codeCooldown > 0) return
        if (!EMAIL_REGEX.matches(email)) {
            _state.update { it.copy(error = "请输入正确的邮箱地址") }
            return
        }
        run {
            repo.sendEmailCode(email, scene)
            _state.update { it.copy(loading = false, smsHint = "验证码已发送，请注意查收邮件") }
            startCooldown()
        }
    }

    /** 密码登录：account 为手机号或邮箱（与 Web 端同口径，后端含 @ 按邮箱查）。 */
    fun login(account: String, password: String) {
        if (!PHONE_REGEX.matches(account) && !EMAIL_REGEX.matches(account)) {
            _state.update { it.copy(error = "请输入正确的手机号或邮箱") }
            return
        }
        // 登录成功后会话流驱动 AppRoot 切换到主界面，这里只需结束 loading。
        run { repo.login(account, password) }
    }

    // 以下手机通道方法暂无界面调用（短信网关暂缓上线，界面已诚实拦截）；网关接通后恢复界面接线即可。
    fun loginByCode(phone: String, smsCode: String) {
        if (!PHONE_REGEX.matches(phone)) {
            _state.update { it.copy(error = "请输入正确的手机号") }
            return
        }
        run { repo.loginByCode(phone, smsCode) }
    }

    fun loginByEmailCode(email: String, code: String) {
        if (!EMAIL_REGEX.matches(email)) {
            _state.update { it.copy(error = "请输入正确的邮箱地址") }
            return
        }
        run { repo.loginByEmailCode(email, code) }
    }

    fun register(phone: String, password: String, smsCode: String, nickname: String) {
        if (!PHONE_REGEX.matches(phone)) {
            _state.update { it.copy(error = "请输入正确的手机号") }
            return
        }
        if (!PASSWORD_REGEX.matches(password)) {
            _state.update { it.copy(error = "密码须 8–64 位且同时包含字母与数字") }
            return
        }
        run { repo.register(phone, password, smsCode, nickname.ifBlank { null }) }
    }

    /** 邮箱注册（必验码；phone 选填仅登记不验证，与 Web 端同口径）。 */
    fun registerByEmail(email: String, password: String, code: String, nickname: String, phone: String) {
        if (!EMAIL_REGEX.matches(email)) {
            _state.update { it.copy(error = "请输入正确的邮箱地址") }
            return
        }
        if (phone.isNotBlank() && !PHONE_REGEX.matches(phone)) {
            _state.update { it.copy(error = "请输入正确的手机号") }
            return
        }
        if (!PASSWORD_REGEX.matches(password)) {
            _state.update { it.copy(error = "密码须 8–64 位且同时包含字母与数字") }
            return
        }
        run { repo.registerByEmail(email, password, code, nickname.ifBlank { null }, phone.ifBlank { null }) }
    }

    fun resetPassword(phone: String, smsCode: String, newPassword: String, onDone: () -> Unit) {
        if (!PASSWORD_REGEX.matches(newPassword)) {
            _state.update { it.copy(error = "密码须 8–64 位且同时包含字母与数字") }
            return
        }
        run {
            repo.resetPassword(phone, smsCode, newPassword)
            _state.update { it.copy(loading = false, smsHint = "密码已重置，请用新密码登录") }
            onDone()
        }
    }

    fun resetPasswordByEmail(email: String, code: String, newPassword: String, onDone: () -> Unit) {
        if (!EMAIL_REGEX.matches(email)) {
            _state.update { it.copy(error = "请输入正确的邮箱地址") }
            return
        }
        if (!PASSWORD_REGEX.matches(newPassword)) {
            _state.update { it.copy(error = "密码须 8–64 位且同时包含字母与数字") }
            return
        }
        run {
            repo.resetPasswordByEmail(email, code, newPassword)
            _state.update { it.copy(loading = false, smsHint = "密码已重置，请用新密码登录") }
            onDone()
        }
    }

    override fun onCleared() {
        cooldownJob?.cancel()
        super.onCleared()
    }

    companion object {
        val PHONE_REGEX = Regex("^1[3-9]\\d{9}$")
        val EMAIL_REGEX = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
        val PASSWORD_REGEX = Regex("^(?=.*[A-Za-z])(?=.*\\d).{8,64}$")
    }
}

/** 发码按钮文案：倒计时内显示剩余秒数（与 Web 端 EmailCodeButton / SmsCodeButton 同口径）。 */
@Composable
private fun sendCodeText(cooldown: Int, loading: Boolean): String =
    if (cooldown > 0) "${cooldown} 秒后重发" else if (loading) "发送中…" else "发送验证码"

@Composable
fun LoginScreen(onGoRegister: () -> Unit) {
    val container = LocalAppContainer.current
    val vm: AuthViewModel = viewModel(factory = viewModelFactory { AuthViewModel(container.authRepository) })
    val state by vm.state.collectAsState()
    var tab by remember { mutableIntStateOf(0) }
    // 验证码/找回通道：0 手机号（暂未开通，仅保留入口），1 邮箱（默认，唯一可用通道）
    var channel by remember { mutableIntStateOf(1) }
    var account by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var smsCode by remember { mutableStateOf("") }
    var emailCode by remember { mutableStateOf("") }
    var showReset by remember { mutableStateOf(false) }
    var newPassword by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("药准时", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
        Text("让每一次服药都不迟到", style = MaterialTheme.typography.bodyLarge)
        Spacer(Modifier.height(24.dp))

        TabRow(selectedTabIndex = tab) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("密码登录") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("验证码登录") })
        }
        Spacer(Modifier.height(16.dp))

        if (tab == 0) {
            OutlinedTextField(
                value = account,
                onValueChange = { account = it.take(64) },
                label = { Text("手机号或邮箱") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("密码") },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
            CareButton(
                text = if (state.loading) "登录中…" else "登录",
                enabled = !state.loading,
                onClick = { vm.login(account, password) },
                modifier = Modifier.fillMaxWidth(),
            )
            CareTextButton(text = "忘记密码？", onClick = { showReset = !showReset })
            if (showReset) {
                TabRow(selectedTabIndex = channel) {
                    Tab(selected = channel == 0, onClick = { channel = 0 }, text = { Text("手机号（暂未开通）") })
                    Tab(selected = channel == 1, onClick = { channel = 1 }, text = { Text("邮箱") })
                }
                Spacer(Modifier.height(12.dp))
                if (channel == 0) {
                    Text("短信通道暂未开通，请使用邮箱验证码", color = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = phone,
                        onValueChange = { phone = it.filter { c -> c.isDigit() }.take(11) },
                        label = { Text("手机号") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = smsCode,
                        onValueChange = { smsCode = it.filter { c -> c.isDigit() }.take(6) },
                        label = { Text("短信验证码") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    CareTextButton(
                        text = "发送验证码",
                        onClick = { vm.notifySmsUnavailable(); channel = 1 },
                    )
                } else {
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it.take(254) },
                        label = { Text("邮箱") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = emailCode,
                        onValueChange = { emailCode = it.filter { c -> c.isDigit() }.take(6) },
                        label = { Text("邮箱验证码") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    CareTextButton(
                        text = sendCodeText(state.codeCooldown, state.loading),
                        enabled = state.codeCooldown <= 0 && !state.loading,
                        onClick = { vm.sendEmailCode(email, EmailCodeScene.Reset) },
                    )
                }
                OutlinedTextField(
                    value = newPassword,
                    onValueChange = { newPassword = it },
                    label = { Text("新密码（8–64 位，含字母与数字）") },
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                CareButton(
                    text = "重置密码",
                    enabled = !state.loading,
                    onClick = {
                        if (channel == 0) { vm.notifySmsUnavailable(); channel = 1 }
                        else vm.resetPasswordByEmail(email, emailCode, newPassword) { showReset = false }
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        } else {
            TabRow(selectedTabIndex = channel) {
                Tab(selected = channel == 0, onClick = { channel = 0 }, text = { Text("手机号（暂未开通）") })
                Tab(selected = channel == 1, onClick = { channel = 1 }, text = { Text("邮箱") })
            }
            Spacer(Modifier.height(12.dp))
            if (channel == 0) {
                Text("短信通道暂未开通，请使用邮箱验证码", color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it.filter { c -> c.isDigit() }.take(11) },
                    label = { Text("手机号") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = smsCode,
                    onValueChange = { smsCode = it.filter { c -> c.isDigit() }.take(6) },
                    label = { Text("短信验证码") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                CareTextButton(
                    text = "发送验证码",
                    onClick = { vm.notifySmsUnavailable(); channel = 1 },
                )
                CareButton(
                    text = if (state.loading) "登录中…" else "登录",
                    enabled = !state.loading,
                    onClick = { vm.notifySmsUnavailable(); channel = 1 },
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it.take(254) },
                    label = { Text("邮箱") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = emailCode,
                    onValueChange = { emailCode = it.filter { c -> c.isDigit() }.take(6) },
                    label = { Text("邮箱验证码") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                CareTextButton(
                    text = sendCodeText(state.codeCooldown, state.loading),
                    enabled = state.codeCooldown <= 0 && !state.loading,
                    onClick = { vm.sendEmailCode(email, EmailCodeScene.Login) },
                )
                CareButton(
                    text = if (state.loading) "登录中…" else "登录",
                    enabled = !state.loading,
                    onClick = { vm.loginByEmailCode(email, emailCode) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        state.smsHint?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.primary)
        }
        state.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(16.dp))
        CareTextButton(text = "没有账号？去注册", onClick = onGoRegister)
    }
}

@Composable
fun RegisterScreen(onBackToLogin: () -> Unit) {
    val container = LocalAppContainer.current
    val vm: AuthViewModel = viewModel(factory = viewModelFactory { AuthViewModel(container.authRepository) })
    val state by vm.state.collectAsState()
    // 0 手机号（暂未开通，仅保留入口），1 邮箱（默认，唯一可用通道）
    var channel by remember { mutableIntStateOf(1) }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var smsCode by remember { mutableStateOf("") }
    var emailCode by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var nickname by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("注册账号", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(16.dp))
        TabRow(selectedTabIndex = channel) {
            Tab(selected = channel == 0, onClick = { channel = 0 }, text = { Text("手机号（暂未开通）") })
            Tab(selected = channel == 1, onClick = { channel = 1 }, text = { Text("邮箱") })
        }
        Spacer(Modifier.height(12.dp))
        if (channel == 0) {
            Text("短信通道暂未开通，请使用邮箱验证码", color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = phone,
                onValueChange = { phone = it.filter { c -> c.isDigit() }.take(11) },
                label = { Text("手机号（即账号）") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = smsCode,
                onValueChange = { smsCode = it.filter { c -> c.isDigit() }.take(6) },
                label = { Text("短信验证码") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            CareTextButton(
                text = "发送验证码",
                onClick = { vm.notifySmsUnavailable(); channel = 1 },
            )
        } else {
            OutlinedTextField(
                value = email,
                onValueChange = { email = it.take(254) },
                label = { Text("邮箱") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = emailCode,
                onValueChange = { emailCode = it.filter { c -> c.isDigit() }.take(6) },
                label = { Text("邮箱验证码") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            CareTextButton(
                text = sendCodeText(state.codeCooldown, state.loading),
                enabled = state.codeCooldown <= 0 && !state.loading,
                onClick = { vm.sendEmailCode(email, EmailCodeScene.Register) },
            )
        }
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("设置密码（8–64 位，含字母与数字）") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = nickname,
            onValueChange = { nickname = it },
            label = { Text("昵称（可选）") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        if (channel == 1) {
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = phone,
                onValueChange = { phone = it.filter { c -> c.isDigit() }.take(11) },
                label = { Text("手机号（选填，未验证）") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Spacer(Modifier.height(16.dp))
        CareButton(
            text = if (state.loading) "注册中…" else "注册并登录",
            enabled = !state.loading,
            onClick = {
                if (channel == 0) { vm.notifySmsUnavailable(); channel = 1 }
                else vm.registerByEmail(email, password, emailCode, nickname, phone)
            },
            modifier = Modifier.fillMaxWidth(),
        )
        state.smsHint?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.primary)
        }
        state.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
        CareTextButton(text = "已有账号？去登录", onClick = onBackToLogin)
    }
}
