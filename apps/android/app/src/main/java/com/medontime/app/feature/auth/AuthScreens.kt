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
import com.medontime.app.data.model.SmsScene
import com.medontime.app.data.repository.AuthRepository
import com.medontime.app.ui.components.CareButton
import com.medontime.app.ui.components.CareTextButton
import com.medontime.app.ui.components.viewModelFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AuthUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val smsHint: String? = null,
)

class AuthViewModel(private val repo: AuthRepository) : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

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

    fun sendCode(phone: String, scene: SmsScene) {
        if (!PHONE_REGEX.matches(phone)) {
            _state.update { it.copy(error = "请输入正确的手机号") }
            return
        }
        run {
            val seconds = repo.sendSmsCode(phone, scene)
            _state.update { it.copy(loading = false, smsHint = "验证码已发送（${seconds} 秒内有效）") }
        }
    }

    fun login(phone: String, password: String) {
        if (!PHONE_REGEX.matches(phone)) {
            _state.update { it.copy(error = "请输入正确的手机号") }
            return
        }
        // 登录成功后会话流驱动 AppRoot 切换到主界面，这里只需结束 loading。
        run { repo.login(phone, password) }
    }

    fun loginByCode(phone: String, smsCode: String) {
        if (!PHONE_REGEX.matches(phone)) {
            _state.update { it.copy(error = "请输入正确的手机号") }
            return
        }
        run { repo.loginByCode(phone, smsCode) }
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

    companion object {
        val PHONE_REGEX = Regex("^1[3-9]\\d{9}$")
        val PASSWORD_REGEX = Regex("^(?=.*[A-Za-z])(?=.*\\d).{8,64}$")
    }
}

@Composable
fun LoginScreen(onGoRegister: () -> Unit) {
    val container = LocalAppContainer.current
    val vm: AuthViewModel = viewModel(factory = viewModelFactory { AuthViewModel(container.authRepository) })
    val state by vm.state.collectAsState()
    var tab by remember { mutableIntStateOf(0) }
    var phone by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var smsCode by remember { mutableStateOf("") }
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

        OutlinedTextField(
            value = phone,
            onValueChange = { phone = it.filter { c -> c.isDigit() }.take(11) },
            label = { Text("手机号") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))

        if (tab == 0) {
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
                onClick = { vm.login(phone, password) },
                modifier = Modifier.fillMaxWidth(),
            )
            CareTextButton(text = "忘记密码？", onClick = { showReset = !showReset })
            if (showReset) {
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
                    onClick = { vm.sendCode(phone, SmsScene.Reset) },
                )
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
                    onClick = { vm.resetPassword(phone, smsCode, newPassword) { showReset = false } },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        } else {
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
                onClick = { vm.sendCode(phone, SmsScene.Login) },
            )
            CareButton(
                text = if (state.loading) "登录中…" else "登录",
                enabled = !state.loading,
                onClick = { vm.loginByCode(phone, smsCode) },
                modifier = Modifier.fillMaxWidth(),
            )
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
    var phone by remember { mutableStateOf("") }
    var smsCode by remember { mutableStateOf("") }
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
        CareTextButton(text = "发送验证码", onClick = { vm.sendCode(phone, SmsScene.Register) })
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
        Spacer(Modifier.height(16.dp))
        CareButton(
            text = if (state.loading) "注册中…" else "注册并登录",
            enabled = !state.loading,
            onClick = { vm.register(phone, password, smsCode, nickname) },
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
