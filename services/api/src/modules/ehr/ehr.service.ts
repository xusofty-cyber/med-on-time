import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MemberAllergy, MemberMedicalRecord } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessCode, BusinessException } from '../../common/exceptions/business.exception';
import { FieldCrypto, hashPhone, resolveFieldEncKey } from '../../common/utils/field-crypto';
import { uuidv7 } from '../../common/utils/uuidv7';
import type {
  CreateAdverseRecordDto,
  CreateEmergencyContactDto,
  PageQueryDto,
  PutAllergiesDto,
  UpdateEmergencyContactDto,
  UpsertMedicalRecordDto,
} from './dto/ehr.dto';

/** 服药后不适症状标签默认字典（DB 注释口径；可被 system_config.adverse_symptom_tags 覆盖） */
const DEFAULT_SYMPTOM_TAGS = [
  'dizzy',
  'nausea',
  'rash',
  'palpitation',
  'stomachache',
  'sleepiness',
  'other',
];

/**
 * 档案域（EHR）服务：过敏档案 / 服药后不适 / 紧急联系人 / 病历。
 * 成员隔离由 MemberAccessGuard 前置保证；本服务所有查询再带 memberId 作用域兜底。
 * 病历正文（summary）与紧急联系人电话经 FieldCrypto 加密落库（EHR_ENC_KEY）。
 */
@Injectable()
export class EhrService {
  private readonly logger = new Logger(EhrService.name);
  private readonly encKey: Buffer | null;
  private readonly crypto: FieldCrypto;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.encKey = resolveFieldEncKey(config.get<string>('EHR_ENC_KEY'));
    this.crypto = new FieldCrypto(this.encKey);
    if (!this.crypto.enabled) {
      this.logger.warn(
        'EHR_ENC_KEY 未配置或格式不正确：病历正文/联系电话将明文存储（开发降级），生产环境必须配置 32 字节密钥',
      );
    }
  }

  // ---------------------------------------------------------------- 过敏档案

  async listAllergies(memberId: string): Promise<MemberAllergy[]> {
    return this.prisma.memberAllergy.findMany({
      where: { memberId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** PUT 全量替换：旧行软删、新行整体写入（一个事务）；来源按操作者与成员归属判定。 */
  async replaceAllergies(
    memberId: string,
    operatorAccountId: string,
    dto: PutAllergiesDto,
  ): Promise<MemberAllergy[]> {
    const member = await this.requireMember(memberId);
    // 结构化引用按类型校验（DB V1.2：drug_category / drug 二选一）
    for (const item of dto.items) {
      const type = item.allergenType ?? 'other';
      if (type === 'drug') {
        if (!item.drugId) {
          throw new BusinessException(BusinessCode.BadRequest, 'allergenType=drug 时必须提供 drugId');
        }
        const drug = await this.prisma.drug.findFirst({
          where: { id: item.drugId, deletedAt: null },
          select: { id: true },
        });
        if (!drug) throw new BusinessException(BusinessCode.BadRequest, `drug not found: ${item.drugId}`);
      }
      if (type === 'drug_category') {
        if (!item.drugCategoryId) {
          throw new BusinessException(
            BusinessCode.BadRequest,
            'allergenType=drug_category 时必须提供 drugCategoryId',
          );
        }
        const category = await this.prisma.drugCategory.findFirst({
          where: { id: item.drugCategoryId, deletedAt: null },
          select: { id: true },
        });
        if (!category) {
          throw new BusinessException(BusinessCode.BadRequest, `drug category not found: ${item.drugCategoryId}`);
        }
      }
    }
    const source = member.accountId === operatorAccountId ? 'self_report' : 'caregiver_report';
    await this.prisma.$transaction(async (tx) => {
      await tx.memberAllergy.updateMany({
        where: { memberId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      for (const item of dto.items) {
        await tx.memberAllergy.create({
          data: {
            id: uuidv7(),
            memberId,
            allergen: item.allergen,
            severity: item.severity ?? null,
            reaction: item.reaction ?? null,
            note: item.note ?? null,
            source,
            allergenType: item.allergenType ?? 'other',
            drugCategoryId: item.drugCategoryId ?? null,
            drugId: item.drugId ?? null,
            allergenCode: item.allergenCode ?? null,
          },
        });
      }
    });
    return this.listAllergies(memberId);
  }

  // ------------------------------------------------------------ 服药后不适

  async createAdverseRecord(memberId: string, operatorAccountId: string, dto: CreateAdverseRecordDto) {
    await this.requireMember(memberId);
    // 关联服药事件为可选（DB V1.2 三个关联列均可空，独立记录不适是合法口径）；
    // 传了关联则必须属于该成员并校验存在性（下方逐项校验）。
    // 关联事件必须属于该成员；planItemId 缺省时从关联事件推导（按药聚合口径）
    let planItemId = dto.planItemId ?? null;
    if (dto.intakeRecordId) {
      const record = await this.prisma.medicationIntakeRecord.findFirst({
        where: { id: dto.intakeRecordId, memberId, deletedAt: null },
        select: { id: true, planItemId: true },
      });
      if (!record) throw new BusinessException(BusinessCode.NotFound, 'intake record not found', HttpStatus.NOT_FOUND);
      planItemId ??= record.planItemId;
    }
    if (dto.reminderInstanceId) {
      const instance = await this.prisma.reminderInstance.findFirst({
        where: { id: dto.reminderInstanceId, memberId },
        select: { id: true, planItemId: true },
      });
      if (!instance) throw new BusinessException(BusinessCode.NotFound, 'reminder instance not found', HttpStatus.NOT_FOUND);
      planItemId ??= instance.planItemId;
    }
    if (dto.prnIntakeId) {
      const prn = await this.prisma.prnIntakeRecord.findFirst({
        where: { id: dto.prnIntakeId, memberId, deletedAt: null },
        select: { id: true, planItemId: true },
      });
      if (!prn) throw new BusinessException(BusinessCode.NotFound, 'prn intake record not found', HttpStatus.NOT_FOUND);
      planItemId ??= prn.planItemId;
    }
    const tags = dto.symptomTags ?? [];
    if (tags.length > 0) {
      const dictionary = await this.symptomTagDictionary();
      const invalid = tags.filter((t) => !dictionary.includes(t));
      if (invalid.length > 0) {
        throw new BusinessException(BusinessCode.BadRequest, `unknown symptom tags: ${invalid.join(', ')}`);
      }
    }
    return this.prisma.intakeAdverseRecord.create({
      data: {
        id: uuidv7(),
        memberId,
        intakeRecordId: dto.intakeRecordId ?? null,
        reminderInstanceId: dto.reminderInstanceId ?? null,
        prnIntakeId: dto.prnIntakeId ?? null,
        planItemId,
        symptomTags: tags,
        description: dto.description ?? null,
        severity: dto.severity ?? 'mild',
        occurredAt: new Date(dto.occurredAt),
        recordedByAccountId: operatorAccountId,
      },
    });
  }

  async listAdverseRecords(memberId: string, query: PageQueryDto, severity?: string) {
    const where = {
      memberId,
      deletedAt: null,
      ...(severity ? { severity } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.intakeAdverseRecord.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.intakeAdverseRecord.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  // ------------------------------------------------------------ 紧急联系人

  async listEmergencyContacts(memberId: string) {
    const rows = await this.prisma.emergencyContact.findMany({
      where: { memberId, deletedAt: null },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.toContactView(row));
  }

  async createEmergencyContact(memberId: string, dto: CreateEmergencyContactDto) {
    await this.requireMember(memberId);
    const max = await this.emergencyContactMax();
    const count = await this.prisma.emergencyContact.count({ where: { memberId, deletedAt: null } });
    if (count >= max) {
      throw new BusinessException(BusinessCode.BadRequest, `紧急联系人已达上限（${max}）`);
    }
    const phone = dto.phone.trim();
    const row = await this.prisma.emergencyContact.create({
      data: {
        id: uuidv7(),
        memberId,
        contactName: dto.contactName,
        phoneEnc: this.crypto.encrypt(phone),
        phoneHash: hashPhone(phone, this.encKey),
        relationship: dto.relationship,
        priority: dto.priority ?? count + 1,
        note: dto.note ?? null,
      },
    });
    return this.toContactView(row);
  }

  async updateEmergencyContact(memberId: string, contactId: string, dto: UpdateEmergencyContactDto) {
    const existing = await this.prisma.emergencyContact.findFirst({
      where: { id: contactId, memberId, deletedAt: null },
    });
    if (!existing) {
      throw new BusinessException(BusinessCode.NotFound, 'emergency contact not found', HttpStatus.NOT_FOUND);
    }
    const data: Record<string, unknown> = {};
    if (dto.contactName !== undefined) data.contactName = dto.contactName;
    if (dto.relationship !== undefined) data.relationship = dto.relationship;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.phone !== undefined) {
      const phone = dto.phone.trim();
      data.phoneEnc = this.crypto.encrypt(phone);
      data.phoneHash = hashPhone(phone, this.encKey);
    }
    const row = await this.prisma.emergencyContact.update({ where: { id: contactId }, data });
    return this.toContactView(row);
  }

  async deleteEmergencyContact(memberId: string, contactId: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.emergencyContact.findFirst({
      where: { id: contactId, memberId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      throw new BusinessException(BusinessCode.NotFound, 'emergency contact not found', HttpStatus.NOT_FOUND);
    }
    await this.prisma.emergencyContact.update({
      where: { id: contactId },
      data: { deletedAt: new Date() },
    });
    return { deleted: true };
  }

  // ------------------------------------------------------------------ 病历

  /** 当前病历（一人一份）；无记录返回 null。正文解密后以 summary 返回，明文不落日志。 */
  async getMedicalRecord(memberId: string) {
    const row = await this.prisma.memberMedicalRecord.findFirst({
      where: { memberId, deletedAt: null },
    });
    return row ? this.toMedicalRecordView(row) : null;
  }

  /** POST 写入（upsert 语义）：已有则更新字段，未传字段保留原值。 */
  async upsertMedicalRecord(memberId: string, dto: UpsertMedicalRecordDto) {
    await this.requireMember(memberId);
    const existing = await this.prisma.memberMedicalRecord.findFirst({
      where: { memberId, deletedAt: null },
    });
    const data = {
      bloodType: dto.bloodType ?? existing?.bloodType ?? null,
      heightCm: dto.heightCm ?? existing?.heightCm ?? null,
      weightKg: dto.weightKg ?? existing?.weightKg ?? null,
      primaryHospital: dto.primaryHospital ?? existing?.primaryHospital ?? null,
      summaryEnc:
        dto.summary !== undefined ? this.crypto.encrypt(dto.summary) : (existing?.summaryEnc ?? null),
    };
    const row = existing
      ? await this.prisma.memberMedicalRecord.update({ where: { id: existing.id }, data })
      : await this.prisma.memberMedicalRecord.create({
          data: { id: uuidv7(), memberId, ...data },
        });
    return this.toMedicalRecordView(row);
  }

  // ------------------------------------------------------------------ 内部

  private async requireMember(memberId: string): Promise<{ id: string; accountId: string }> {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, deletedAt: null },
      select: { id: true, accountId: true },
    });
    if (!member) {
      throw new BusinessException(BusinessCode.NotFound, 'member not found', HttpStatus.NOT_FOUND);
    }
    return member;
  }

  private async symptomTagDictionary(): Promise<string[]> {
    const row = await this.prisma.systemConfig.findFirst({
      where: { configKey: 'adverse_symptom_tags', deletedAt: null },
      select: { configValue: true },
    });
    const value = row?.configValue;
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      return value as string[];
    }
    return DEFAULT_SYMPTOM_TAGS;
  }

  private async emergencyContactMax(): Promise<number> {
    const row = await this.prisma.systemConfig.findFirst({
      where: { configKey: 'emergency_contact_max', deletedAt: null },
      select: { configValue: true },
    });
    const value = row?.configValue;
    if (typeof value === 'number' && value > 0) return value;
    if (
      value !== null &&
      typeof value === 'object' &&
      typeof (value as { value?: unknown }).value === 'number'
    ) {
      return (value as { value: number }).value;
    }
    return 3; // DB 设计 V1.2 默认 3
  }

  private toContactView(row: {
    id: string;
    memberId: string;
    contactName: string;
    phoneEnc: string;
    relationship: string;
    priority: number;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
    version: number;
  }) {
    return {
      id: row.id,
      memberId: row.memberId,
      contactName: row.contactName,
      phone: this.crypto.decrypt(row.phoneEnc),
      relationship: row.relationship,
      priority: row.priority,
      note: row.note,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version,
    };
  }

  private toMedicalRecordView(row: MemberMedicalRecord) {
    return {
      id: row.id,
      memberId: row.memberId,
      bloodType: row.bloodType,
      heightCm: row.heightCm === null ? null : Number(row.heightCm),
      weightKg: row.weightKg === null ? null : Number(row.weightKg),
      primaryHospital: row.primaryHospital,
      summary: this.crypto.decrypt(row.summaryEnc),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version,
    };
  }
}
