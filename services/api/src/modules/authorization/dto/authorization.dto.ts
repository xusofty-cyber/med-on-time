import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { CaregiverLevel } from '@med-on-time/shared';
import { PHONE_REGEX } from '../../auth/dto/auth.dto';

export const CAREGIVER_LEVELS = [
  CaregiverLevel.L1,
  CaregiverLevel.L2,
  CaregiverLevel.L3,
] as const;

export class CreateAuthorizationDto {
  @IsUUID()
  memberId!: string;

  /** 被邀照护人的注册手机号（手机号即账号根，按 phone_hash 定位账号） */
  @Matches(PHONE_REGEX, { message: '手机号格式不正确' })
  caregiverPhone!: string;

  @IsIn(CAREGIVER_LEVELS)
  level!: string;

  /** 逐项权限开关（schema permissions JsonB，如 ai_data_use / ai_report_view） */
  @IsOptional()
  @IsObject()
  permissions?: Record<string, unknown>;

  /** 过期时间（ISO 8601）；为空表示长期有效 */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  expiresAt?: string;
}

export class RevokeAuthorizationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class ListAuthorizationsQueryDto {
  /** granted = 我授权出去的；received = 授权给我的；缺省两者都返 */
  @IsOptional()
  @IsIn(['granted', 'received'])
  view?: 'granted' | 'received';
}
