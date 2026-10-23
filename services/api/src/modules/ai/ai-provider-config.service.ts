import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { uuidv7 } from '../../common/utils/uuidv7';
import {
  FieldCrypto,
  resolveFieldEncKey,
} from '../../common/utils/field-crypto';
import {
  BusinessCode,
  BusinessException,
} from '../../common/exceptions/business.exception';
import { AiBusinessCode } from './ai.service';

/** 后台直配的大模型接入点（OpenAI 兼容）。apiKey 只以密文落库，视图只回掩码。 */
export interface AiProviderConfigView {
  id: string;
  name: string;
  modelName: string;
  baseUrl: string;
  apiKeyMasked: string;
  capability: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResolvedAiProvider {
  configId: string;
  name: string;
  modelName: string;
  baseUrl: string;
  apiKey: string;
}

export interface AiProviderConfigInput {
  name: string;
  modelName: string;
  baseUrl: string;
  apiKey?: string;
  capability?: string;
  isActive?: boolean;
}

@Injectable()
export class AiProviderConfigService {
  private readonly logger = new Logger(AiProviderConfigService.name);
  private readonly crypto: FieldCrypto;
  private cache = new Map<
    string,
    { value: ResolvedAiProvider | null; expiresAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.crypto = new FieldCrypto(
      resolveFieldEncKey(config.get<string>('EHR_ENC_KEY')),
    );
  }

  private toView(row: {
    id: string;
    name: string;
    modelName: string;
    baseUrl: string;
    apiKeyLast4: string;
    capability: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): AiProviderConfigView {
    return {
      id: row.id,
      name: row.name,
      modelName: row.modelName,
      baseUrl: row.baseUrl,
      apiKeyMasked: `••••${row.apiKeyLast4}`,
      capability: row.capability,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async list(): Promise<AiProviderConfigView[]> {
    const rows = await this.prisma.aiProviderConfig.findMany({
      where: { deletedAt: null },
      orderBy: [{ capability: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  private assertCryptoReady(): void {
    if (!this.crypto.enabled) {
      throw new BusinessException(
        AiBusinessCode.NotConfigured,
        '服务器未配置字段加密密钥（EHR_ENC_KEY），暂不能保存 API key',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async create(input: AiProviderConfigInput): Promise<AiProviderConfigView> {
    this.assertCryptoReady();
    if (!input.apiKey) {
      throw new BusinessException(
        BusinessCode.BadRequest,
        '新建配置必须填写 API key',
        HttpStatus.BAD_REQUEST,
      );
    }
    const capability = input.capability ?? 'general';
    const row = await this.prisma.$transaction(async (tx) => {
      if (input.isActive) {
        await tx.aiProviderConfig.updateMany({
          where: { capability, isActive: true, deletedAt: null },
          data: { isActive: false },
        });
      }
      return tx.aiProviderConfig.create({
        data: {
          id: uuidv7(),
          name: input.name,
          modelName: input.modelName,
          baseUrl: input.baseUrl,
          apiKeyCipher: this.crypto.encrypt(input.apiKey!),
          apiKeyLast4: input.apiKey!.slice(-4),
          capability,
          isActive: input.isActive ?? false,
        },
      });
    });
    this.cache.clear();
    return this.toView(row);
  }

  async update(
    id: string,
    input: Partial<AiProviderConfigInput>,
  ): Promise<AiProviderConfigView> {
    const existing = await this.prisma.aiProviderConfig.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new BusinessException(
        BusinessCode.NotFound,
        '配置不存在',
        HttpStatus.NOT_FOUND,
      );
    }
    const capability = input.capability ?? existing.capability;
    const row = await this.prisma.$transaction(async (tx) => {
      if (input.isActive) {
        await tx.aiProviderConfig.updateMany({
          where: { capability, isActive: true, deletedAt: null, id: { not: id } },
          data: { isActive: false },
        });
      }
      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.modelName !== undefined) data.modelName = input.modelName;
      if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl;
      if (input.capability !== undefined) data.capability = input.capability;
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.apiKey) {
        this.assertCryptoReady();
        data.apiKeyCipher = this.crypto.encrypt(input.apiKey);
        data.apiKeyLast4 = input.apiKey.slice(-4);
      }
      return tx.aiProviderConfig.update({ where: { id }, data });
    });
    this.cache.clear();
    return this.toView(row);
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const existing = await this.prisma.aiProviderConfig.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new BusinessException(
        BusinessCode.NotFound,
        '配置不存在',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prisma.aiProviderConfig.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    this.cache.clear();
    return { id, deleted: true };
  }

  /** 按 id 解密一条配置（测试连接用，不要求 active）。 */
  async resolveById(id: string): Promise<ResolvedAiProvider | null> {
    const row = await this.prisma.aiProviderConfig.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) return null;
    const apiKey = this.crypto.decrypt(row.apiKeyCipher);
    if (!apiKey) return null;
    return {
      configId: row.id,
      name: row.name,
      modelName: row.modelName,
      baseUrl: row.baseUrl,
      apiKey,
    };
  }

  /** 生效配置解析：capability 精确命中优先，回落 general；30 秒缓存。 */
  async resolveActive(
    capability: string,
  ): Promise<ResolvedAiProvider | null> {
    const cached = this.cache.get(capability);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    let row = await this.prisma.aiProviderConfig.findFirst({
      where: { capability, isActive: true, deletedAt: null },
    });
    if (!row && capability !== 'general') {
      row = await this.prisma.aiProviderConfig.findFirst({
        where: { capability: 'general', isActive: true, deletedAt: null },
      });
    }
    let value: ResolvedAiProvider | null = null;
    if (row) {
      const apiKey = this.crypto.decrypt(row.apiKeyCipher);
      if (apiKey) {
        value = {
          configId: row.id,
          name: row.name,
          modelName: row.modelName,
          baseUrl: row.baseUrl,
          apiKey,
        };
      } else {
        this.logger.warn(`AI 配置 ${row.id} 密钥解密失败，按未配置处理`);
      }
    }
    this.cache.set(capability, { value, expiresAt: Date.now() + 30_000 });
    return value;
  }
}

