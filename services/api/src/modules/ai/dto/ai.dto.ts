import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AiCapability, AiSessionChannel } from '@med-on-time/shared';

export const AI_CAPABILITY_VALUES = [
  AiCapability.HealthQa,
  AiCapability.LabReportInterpretation,
  AiCapability.MedicalRecordAnalysis,
  AiCapability.SymptomAnalysis,
] as const;

export const AI_CHANNEL_VALUES = [
  AiSessionChannel.Web,
  AiSessionChannel.WechatMiniapp,
  AiSessionChannel.Android,
  AiSessionChannel.Ios,
  AiSessionChannel.Pc,
] as const;

/** AI 分析任务类型（DB 9.9 中 MVP 范围两项） */
export const AI_TASK_TYPE_VALUES = ['medical_record_analysis', 'lab_report_interpretation'] as const;

export class CreateAiSessionDto {
  @IsString()
  memberId!: string;

  @IsIn(AI_CAPABILITY_VALUES)
  capability!: string;

  @IsOptional()
  @IsIn(AI_CHANNEL_VALUES)
  channel?: string;
}

export class SendAiMessageDto {
  /** 与路径会话所属成员一致性由服务层复核（隔离兜底） */
  @IsString()
  memberId!: string;

  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class CreateAiTaskDto {
  @IsString()
  memberId!: string;

  @IsIn(AI_TASK_TYPE_VALUES)
  taskType!: string;

  @IsOptional()
  @IsString({ each: true })
  sourceFileIds?: string[];
}
