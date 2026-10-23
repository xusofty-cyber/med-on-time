# MedOnTime 注册验证通道（V1.3 定版，2026-10-23）

## 决策记录

- **背景**：短信网关尚未接通，原注册唯一路径「手机号 + 短信验证码」在网关就绪前不可用，
  阻塞试点用户自助注册。
- **拍板（用户，2026-10-23）**：短信网关未接前，注册验证走**微信 / 邮箱先行**；
  **手机号保持账号根**，但可**未验证登记**；未验证手机号执行**三受限**（见下）。
- **数据模型**：DB V1.3 迁移 `20261023110000_v13_auth_channels` 给 `user_account` 新增
  `email`（密文）/ `email_hash`（HMAC 查找哈希，`email:` 域分隔）/ `email_verified_at` /
  `phone_verified_at` 四列；`email_hash` 部分唯一索引
  （`WHERE deleted_at IS NULL AND email_hash IS NOT NULL`，与 V1.2 phone_hash 口径一致）。
  存量回填（试点期口径）：迁移前手机号注册一律经短信验证码核验，故 phone 非空的既有账号
  `phone_verified_at = registered_at`；迁移后先行通道登记的手机号保持 NULL 直至补验。

## 验证状态语义

| 字段 | 置值时机 | 为空含义 |
|---|---|---|
| `phone_verified_at` | 短信验证码注册时；微信 getPhoneNumber 核验通过后 | 手机号仅登记、未核验归属 → 三受限生效 |
| `email_verified_at` | 邮箱验证码注册成功时 | 邮箱未核验（当前邮箱只经验证码通道写入，故注册即已验证） |

账号视图（`GET /auth/me`、`GET/PATCH /account/profile`）输出：
`hasPhone / phoneVerified / phoneVerifiedAt / hasEmail / emailMasked / emailVerified /
emailVerifiedAt / hasWechat`（hasWechat = 存在未解绑的微信 oauth 绑定）。

## 通道与端点清单（基路径 /api，信封与业务码风格同契约）

| 端点 | 说明 |
|---|---|
| POST /auth/sms/send | 既有。短信验证码（场景 register/login/reset，reset 内部归一为 reset_password） |
| POST /auth/email/send | 邮箱验证码 {email, scene}；scene ∈ register/login/reset_password/bind；限频与短信同口径：60 秒重发间隔、5 次/小时、码 5 分钟有效、最多试 5 次 |
| POST /auth/register | 既有。手机号 + 短信码注册，成功即置 `phone_verified_at` |
| POST /auth/register/email | {email, code, password, nickname?, phone?}：验码建号（email 置已验证、自动建 self 成员、签发令牌）；phone 给了则登记（唯一性校验）但 `phone_verified_at` 保持空 |
| POST /auth/login | 扩展 {account, password}：account 含 `@` 按 email_hash 查、否则按 phone_hash 查；旧 {phone, password} 保持兼容 |
| POST /auth/wechat/miniapp/login | {code, phoneCode?}：jscode2session 换 openid/unionid → 按 `user_oauth_binding(provider=wechat, openid, unbound_at IS NULL)` 找账号登录；无则建号（register_channel=wechat_miniapp、无手机无密码）+ 绑定 + self 成员。带 phoneCode 时经 getPhoneNumber 取微信核验真号并按下方规则落库 |
| POST /auth/wechat/bind | 需登录 {code}：绑定 openid 到当前账号；已被他人绑定 → 40900 冲突。旧路径 POST /auth/bind/wechat 同实现保留 |
| POST /auth/phone/verify/wechat | 需登录 {phoneCode}：微信核验手机号验证/补登（规则同下） |

**微信核验手机号落库规则**（账号根不可静默覆盖）：账号无手机号 → 落库并置已验证
（被他人占用 → 40900）；已有且哈希一致 → 仅置已验证；已有且不一致 →
**40910 PhoneMismatch** 拒绝，不覆盖。

## 三受限（未验证手机号）

| # | 场景 | 规则 | 业务码 |
|---|---|---|---|
| 1 | PUT /notification-prefs 开启 sms 通道 | `phone_verified_at` 为空 → 拒绝 | 40320 PhoneNotVerified |
| 2 | POST /auth/password/reset（短信找回密码） | 目标账号 `phone_verified_at` 为空 → 拒绝 | 40320 PhoneNotVerified |
| 3 | POST /authorizations/:id/accept | 接受者 `phone_verified_at` 为空 → 拒绝；且接受者手机号哈希须与授权记录邀请的照护人手机号哈希一致，不一致 → 拒绝。邀请创建不变 | 40321 PhoneVerificationRequired / 40910 PhoneMismatch |

其余 auth 段码：**40312 WechatNotConfigured**（WECHAT_MINIAPP_APPID/SECRET 未配置时
全部微信入口返回此码，不伪造登录态）。

## 环境变量清单（新增）

| 变量 | 用途 | 未配置后果 |
|---|---|---|
| SMTP_URL | 邮件发送连接串（smtp://user:pass@host:587），优先于分项 | 与 SMTP_HOST 均为空 → DevStubMailSender（掩码日志 + 启动警告，验证码不真实发送） |
| SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS | SMTP 分项配置（PORT 缺省 587，465 自动走 TLS） | 同上 |
| SMTP_FROM | 发件人（缺省 `MedOnTime 药准时 <no-reply@medontime.app>`） | 用缺省值 |
| WECHAT_MINIAPP_APPID / WECHAT_MINIAPP_SECRET | 微信小程序服务端凭证（公众平台「开发管理 → 开发设置」，须与小程序 appid 同一主体） | 微信登录/绑定/手机号验证返回 40312 |

手机号/邮箱加解密与哈希沿用 PHONE_ENCRYPTION_KEY / PHONE_HMAC_KEY（邮箱哈希的 HMAC
输入加 `email:` 域分隔前缀，与手机号哈希不串味）。

## 短信网关接通后的存量补验口径

1. 网关就绪后，短信注册/验证码登录恢复为主通道（现有实现即以验证码核验为准，
   注册置 `phone_verified_at` 的逻辑不变）。
2. 存量未验证账号（`phone IS NOT NULL AND phone_verified_at IS NULL`）：在用户下次登录
   或开启短信提醒/接受授权被三受限拦截时，引导走一轮短信验证码补验，核验通过置
   `phone_verified_at`；补验端点随网关接入一并落地（本轮未做，避免与 stub 通道混淆）。
3. 微信 getPhoneNumber 补验通道长期保留（小程序内免短信成本完成真验证）。

## 本轮不做与待办

- **Web 微信扫码登录不在本轮**：微信开放平台网站应用登录要求开放平台账号完成
  **企业认证**（含对公审核与年审费用），属商务前置而非技术问题；认证就绪后按
  oauth2 authorize → code 换 openid/unionid → 复用 `user_oauth_binding` 落点接入，
  数据模型无需再变。小程序端登录不受此限（小程序 appid 凭证即可）。
- **邮箱补绑/换绑端点未落地**：验证码 `bind` 场景与 /auth/email/send 已支持，
  账号邮箱目前仅经邮箱注册写入；已注册账号补绑邮箱的端点列入下一迭代。
- **微信 access_token 为进程内存缓存**：API 多副本部署时各实例独立缓存会互相顶号
  （微信同 appid 的 token 全局单例），扩容前须改为集中式 token 中控（Redis）。
- **未实测**：微信真实接口（无正式 appid/secret，未联调 jscode2session/getPhoneNumber）、
  SMTP 真实发信（未配真实 SMTP，未实发）——均为配置到位后的一次性联调项，不改代码。
- 原生 Android / iOS 本轮不改：新端点均为标准 REST，API 就绪即可，两端后续迭代接入
  （邮箱注册/登录的 account 字段与微信登录入口）。
