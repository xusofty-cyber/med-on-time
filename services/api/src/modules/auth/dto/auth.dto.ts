import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  CODE_SCENES,
  SMS_SCENES,
  type CodeScene,
  type SmsScene,
} from '../services/verification-code.service';

/** 大陆手机号（账号根标识，DB 定版口径） */
export const PHONE_REGEX = /^1[3-9]\d{9}$/;
/** 注册渠道（schema user_account.register_channel 注释口径） */
export const REGISTER_CHANNELS = ['wechat_miniapp', 'android', 'ios', 'web', 'pc'] as const;
/** 设备平台（schema user_device.platform 注释口径） */
export const DEVICE_PLATFORMS = [
  'wechat_miniapp',
  'android',
  'ios',
  'windows',
  'linux',
  'macos',
  'web',
] as const;

export class SendSmsCodeDto {
  @Matches(PHONE_REGEX, { message: '手机号格式不正确' })
  phone!: string;

  @IsIn(SMS_SCENES)
  scene!: SmsScene;
}

export class DeviceInfoDto {
  @IsOptional()
  @IsIn(DEVICE_PLATFORMS)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceName?: string;
}

export class RegisterDto extends DeviceInfoDto {
  @Matches(PHONE_REGEX, { message: '手机号格式不正确' })
  phone!: string;

  /** 密码口径：8–64 位，须同时含字母与数字 */
  @IsString()
  @Length(8, 64)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: '密码须同时包含字母与数字' })
  password!: string;

  /** V1.3 裁定：短信网关未接前手机号可未验证注册；带码则校验并置已验证（网关接通后向前兼容）。 */
  @IsOptional()
  @Matches(/^\d{6}$/, { message: '验证码为 6 位数字' })
  smsCode?: string;

  @IsOptional()
  @IsIn(REGISTER_CHANNELS)
  registerChannel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nickname?: string;
}

export class LoginDto extends DeviceInfoDto {
  /**
   * 账号（V1.3 扩展）：手机号或邮箱（含 @ 按邮箱查，否则按手机号查）。
   * 与下方旧字段 phone 二选一，account 优先；旧客户端 {phone, password} 保持兼容。
   */
  @IsOptional()
  @IsString()
  @MaxLength(254)
  account?: string;

  @IsOptional()
  @Matches(PHONE_REGEX, { message: '手机号格式不正确' })
  phone?: string;

  @IsString()
  @Length(1, 64)
  password!: string;
}

export class LoginByCodeDto extends DeviceInfoDto {
  @Matches(PHONE_REGEX, { message: '手机号格式不正确' })
  phone!: string;

  @Matches(/^\d{6}$/, { message: '验证码为 6 位数字' })
  smsCode!: string;
}

export class RefreshDto {
  @IsString()
  @Length(1, 4096)
  refreshToken!: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  @Length(1, 4096)
  refreshToken?: string;
}

export class ResetPasswordDto {
  @Matches(PHONE_REGEX, { message: '手机号格式不正确' })
  phone!: string;

  @Matches(/^\d{6}$/, { message: '验证码为 6 位数字' })
  smsCode!: string;

  @IsString()
  @Length(8, 64)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: '密码须同时包含字母与数字' })
  newPassword!: string;
}

export class BindWechatDto {
  /** wx.login 的 code（V1.3 起绑定走真实换取 openid，code 必填） */
  @IsString()
  @Length(1, 256)
  code!: string;
}

export class SendEmailCodeDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(254)
  email!: string;

  @IsIn(CODE_SCENES)
  scene!: CodeScene;
}

export class RegisterByEmailDto extends DeviceInfoDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(254)
  email!: string;

  @Matches(/^\d{6}$/, { message: '验证码为 6 位数字' })
  code!: string;

  /** 密码口径与手机号注册一致：8–64 位，须同时含字母与数字 */
  @IsString()
  @Length(8, 64)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: '密码须同时包含字母与数字' })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nickname?: string;

  /** 选填：登记为账号根手机号但不验证（phoneVerifiedAt 为空，三受限生效） */
  @IsOptional()
  @Matches(PHONE_REGEX, { message: '手机号格式不正确' })
  phone?: string;

  @IsOptional()
  @IsIn(REGISTER_CHANNELS)
  registerChannel?: string;
}

export class WechatMiniappLoginDto extends DeviceInfoDto {
  /** wx.login 的 code */
  @IsString()
  @Length(1, 256)
  code!: string;

  /** getPhoneNumber 的 code（选填）：一并完成手机号核验登记 */
  @IsOptional()
  @IsString()
  @Length(1, 256)
  phoneCode?: string;
}

export class WechatPhoneVerifyDto {
  /** getPhoneNumber 的 code */
  @IsString()
  @Length(1, 256)
  phoneCode!: string;
}
