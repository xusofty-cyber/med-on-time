import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AccountStatus } from '@med-on-time/shared';

export class AdminLoginDto {
  @IsString()
  @MaxLength(64)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export class ListAccountsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn([AccountStatus.Active, AccountStatus.Frozen, AccountStatus.Cancelling, AccountStatus.Cancelled])
  status?: string;

  /** 按昵称模糊（手机号为密文列，不支持检索） */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class ListMembersQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsIn(['active', 'archived', 'removed'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

/** 药品 review_status（DB 5.2）：draft / pending_review / approved / rejected / off_shelf */
export const DRUG_REVIEW_STATUS_VALUES = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'off_shelf',
] as const;

export class ListDrugsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(DRUG_REVIEW_STATUS_VALUES)
  reviewStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

/**
 * 药品双人核验（两段）：
 *  - stage=verify：核验人对 pending_review 药品做第一段核验（状态不变，落审计）；
 *  - stage=decide：复核人（不得与核验人为同一人）据 decision 定 approved / rejected。
 */
export class DrugReviewDto {
  @IsIn(['verify', 'decide'])
  stage!: string;

  @IsOptional()
  @IsIn(['approve', 'reject'])
  decision?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListPlansQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @IsIn(['active', 'paused', 'finished', 'stopped'])
  status?: string;
}

export class ListDisputesQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['open', 'processing', 'resolved', 'closed'])
  status?: string;

  @IsOptional()
  @IsIn(['usage', 'bug', 'drug_data', 'other'])
  category?: string;
}

/** 客服裁决（全权裁决）：resolution 为裁决结论，落库 + 审计双记录前后值 */
export class ResolveDisputeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  resolution!: string;
}

export class ListAuditLogsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['admin', 'account', 'system'])
  actorType?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  action?: string;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsUUID()
  memberId?: string;
}

export const APP_PLATFORM_VALUES = [
  'wechat_miniapp',
  'android',
  'ios',
  'windows',
  'linux',
  'macos',
  'web',
] as const;

export class ListAppVersionsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(APP_PLATFORM_VALUES)
  platform?: string;
}

export class CreateAppVersionDto {
  @IsIn(APP_PLATFORM_VALUES)
  platform!: string;

  @IsString()
  @MaxLength(32)
  version!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  minSupportedVersion?: string;

  @IsOptional()
  @IsString()
  releaseNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  downloadUrl?: string;

  @IsOptional()
  @IsIn(['active', 'deprecated'])
  status?: string;
}

export class UpdateAppVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  minSupportedVersion?: string;

  @IsOptional()
  @IsString()
  releaseNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  downloadUrl?: string;

  @IsOptional()
  @IsIn(['active', 'deprecated'])
  status?: string;
}
