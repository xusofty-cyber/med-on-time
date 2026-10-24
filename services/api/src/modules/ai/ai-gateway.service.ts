import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { assertSafeAiBaseUrl } from '../../common/utils/ssrf.util';
import { AiBusinessCode } from './ai.service';
import {
  AiProviderConfigService,
  ResolvedAiProvider,
} from './ai-provider-config.service';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: unknown; // string 或 OpenAI 多模态 content 数组（视觉调用）
}

/**
 * 大模型网关：按 ai_provider_config 的生效配置调 OpenAI 兼容 chat/completions。
 * 与 AiService（健康助手业务，评测+审校前保持关闭）分工：本服务只做接入与转发，
 * 不含任何医疗建议逻辑；密钥只在内存中短暂持有，禁止进日志。
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(private readonly providers: AiProviderConfigService) {}

  async chatCompletion(input: {
    capability: string;
    messages: ChatMessage[];
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  }): Promise<{ content: string; provider: ResolvedAiProvider }> {
    const provider = await this.providers.resolveActive(input.capability);
    if (!provider) {
      throw new BusinessException(
        AiBusinessCode.NotConfigured,
        '尚未配置可用的大模型接入，请管理员在后台「大模型配置」中设置并启用',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const content = await this.chatWithProvider(provider, input);
    return { content, provider };
  }

  /** 指定配置直调（后台「测试连接」用）：发一条最小请求验证 URL/key/模型。 */
  async testConnection(
    configId: string,
  ): Promise<{ ok: true; model: string; latencyMs: number }> {
    const provider = await this.providers.resolveById(configId);
    if (!provider) {
      throw new BusinessException(
        AiBusinessCode.NotConfigured,
        '配置不存在或密钥不可用',
        HttpStatus.NOT_FOUND,
      );
    }
    const started = Date.now();
    await this.chatWithProvider(provider, {
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 1,
      timeoutMs: 12_000,
    });
    return { ok: true, model: provider.modelName, latencyMs: Date.now() - started };
  }

  private async chatWithProvider(
    provider: ResolvedAiProvider,
    input: {
      messages: ChatMessage[];
      maxTokens?: number;
      temperature?: number;
      timeoutMs?: number;
    },
  ): Promise<string> {
    assertSafeAiBaseUrl(provider.baseUrl);
    const url = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      input.timeoutMs ?? 20_000,
    );
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.modelName,
          messages: input.messages,
          max_tokens: input.maxTokens ?? 512,
          temperature: input.temperature ?? 0.1,
        }),
      });
      if (!res.ok) {
        this.logger.warn(
          `AI 上游失败 config=${provider.configId} model=${provider.modelName} status=${res.status}`,
        );
        throw new BusinessException(
          AiBusinessCode.UpstreamError,
          '大模型服务暂时不可用，请稍后重试',
          HttpStatus.BAD_GATEWAY,
        );
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content) {
        throw new BusinessException(
          AiBusinessCode.UpstreamError,
          '大模型返回为空，请稍后重试',
          HttpStatus.BAD_GATEWAY,
        );
      }
      return content;
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      this.logger.warn(
        `AI 上游异常 config=${provider.configId} model=${provider.modelName}: ${
          err instanceof Error ? err.name : 'unknown'
        }`,
      );
      throw new BusinessException(
        AiBusinessCode.UpstreamError,
        '大模型服务暂时不可用，请稍后重试',
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
