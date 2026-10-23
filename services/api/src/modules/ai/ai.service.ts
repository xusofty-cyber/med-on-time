import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiCapability } from '@med-on-time/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';

/** AI 域业务码（403 段，通用码表之外单独登记，禁止与 BusinessCode 复用） */
export const AiBusinessCode = {
  NotEnabled: 40310, // AI 未开通（总开关关闭）
  QuotaExceeded: 42901, // 配额耗尽（开通后启用）
  NotConfigured: 50311, // 未配置可用的大模型接入（ai_provider_config 无生效行/密钥不可用）
  UpstreamError: 50211, // 大模型上游调用失败（网关统一口径，细节只进日志不回前端）
} as const;

/** 免费口径配额（需求定版：健康问答 20 次/日、报告解读 10 次/月，按成员计） */
export const AI_QUOTAS = {
  qaPerDay: 20,
  reportPerMonth: 10,
} as const;

const QA_CAPABILITIES: string[] = [AiCapability.HealthQa, AiCapability.SymptomAnalysis];
const REPORT_CAPABILITIES: string[] = [
  AiCapability.LabReportInterpretation,
  AiCapability.MedicalRecordAnalysis,
];

/**
 * AI 健康助手（占位实现）：POC-2 模型评测未完成 + 上线前一次性外部医学审校未过，
 * 入口保持关闭（需求红线）。全部业务方法先过 assertEnabled()，总开关关闭时
 * 统一抛「未开通」业务码；配额计数骨架已就位（以 ai_call_log 成功调用计），
 * 待评测与审校通过、AI_ENABLED=true 后再接真实网关实现。
 */
@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** 总开关：仅环境变量 AI_ENABLED=true 才视为开通（缺省关闭）。 */
  get enabled(): boolean {
    return this.config.get<string>('AI_ENABLED') === 'true';
  }

  assertEnabled(): void {
    if (!this.enabled) {
      throw new BusinessException(
        AiBusinessCode.NotEnabled,
        'AI 健康助手尚未开通（模型评测与外部医学审校完成前入口保持关闭）',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /**
   * 配额判断骨架：问答类按自然日、报告类按自然月统计 ai_call_log 的成功调用
   * （blocked/failed 不计额度，DB 9.11 口径）。总开关关闭时本方法不会被业务路径触达，
   * 仅供开通后复用与单测。
   */
  async checkQuota(
    accountId: string,
    memberId: string,
    capability: string,
  ): Promise<{ limit: number; used: number; remaining: number }> {
    const isReport = REPORT_CAPABILITIES.includes(capability);
    const capabilities = isReport ? REPORT_CAPABILITIES : QA_CAPABILITIES;
    const limit = isReport ? AI_QUOTAS.reportPerMonth : AI_QUOTAS.qaPerDay;
    const now = new Date();
    const since = isReport
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const used = await this.prisma.aiCallLog.count({
      where: {
        accountId,
        memberId,
        capability: { in: capabilities },
        status: 'success',
        createdAt: { gte: since },
      },
    });
    return { limit, used, remaining: Math.max(0, limit - used) };
  }

  // 以下业务入口在总开关关闭期间一律返回「未开通」；开通后在此接入 AI 网关。

  private async placeholder(): Promise<never> {
    this.assertEnabled();
    // 总开关打开但网关尚未接入时的兜底（评测/审校通过后替换为真实实现）
    throw new BusinessException(50010, 'AI 网关尚未接入', HttpStatus.NOT_IMPLEMENTED);
  }

  async createSession(_accountId: string, _dto: unknown): Promise<never> {
    void _accountId; void _dto;
    return this.placeholder();
  }

  async listSessions(_accountId: string, _memberId: string): Promise<never> {
    void _accountId; void _memberId;
    return this.placeholder();
  }

  async sendMessage(_accountId: string, _sessionId: string, _dto: unknown): Promise<never> {
    void _accountId; void _sessionId; void _dto;
    return this.placeholder();
  }

  async createTask(_accountId: string, _dto: unknown): Promise<never> {
    void _accountId; void _dto;
    return this.placeholder();
  }

  async listTasks(_accountId: string, _memberId: string): Promise<never> {
    void _accountId; void _memberId;
    return this.placeholder();
  }

  async getQuota(_accountId: string, _memberId: string): Promise<never> {
    void _accountId; void _memberId;
    return this.placeholder();
  }
}
