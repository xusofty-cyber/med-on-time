import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { SMS_SCENES, type SmsScene } from '../services/verification-code.service';

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

  @Matches(/^\d{6}$/, { message: '验证码为 6 位数字' })
  smsCode!: string;

  @IsIn(REGISTER_CHANNELS)
  registerChannel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nickname?: string;
}

export class LoginDto extends DeviceInfoDto {
  @Matches(PHONE_REGEX, { message: '手机号格式不正确' })
  phone!: string;

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
  @IsOptional()
  @IsString()
  @MaxLength(128)
  code?: string;
}
