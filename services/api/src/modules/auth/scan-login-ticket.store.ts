import { Injectable } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';

export type ScanTicketStatus = 'pending' | 'confirmed';
export type ScanTicketPurpose = 'login' | 'bind_wechat';

export interface ScanLoginTicket {
  id: string;
  status: ScanTicketStatus;
  createdAt: number;
  expiresAt: number;
  purpose?: ScanTicketPurpose;
  ownerAccountId?: string;
  /** 确认后回填：扫码账号（小程序端已登录账号） */
  accountId?: string;
  /** 票据创建端（Web）登记的设备信息，collect 时用于落会话 */
  platform?: string;
  deviceName?: string;
}

export const SCAN_TICKET_TTL_MS = 5 * 60_000;

/**
 * 小程序扫码确认登录（2026-10-23 负责人裁定路线）的票据存储。
 * P1 迁移：默认 Redis 实现（键 medontime:scan-ticket:<id>，TTL = 票据剩余有效期
 * 5 分钟），API 重启/多副本下 Web 轮询仍能查到票据；内存实现仅留作测试与回退。
 * 方法均为异步（Redis）；调用方（AuthService）须 await，且原地改票据状态后
 * 须调 save() 回写——Redis 里取出的对象是反序列化副本，原地改动不会自动落盘。
 */
export abstract class ScanLoginTicketStore {
  abstract create(ticket: ScanLoginTicket): Promise<void>;
  /** 取票据；任何状态若已过期均视为不存在并顺手删除 */
  abstract get(id: string): Promise<ScanLoginTicket | undefined>;
  /** 取票据原始记录（不静默清理，供状态查询判断 expired） */
  abstract getRaw(id: string): Promise<ScanLoginTicket | undefined>;
  abstract delete(id: string): Promise<void>;
  /** 原地修改后的回写（upsert，保留剩余 TTL） */
  abstract save(ticket: ScanLoginTicket): Promise<void>;
}

@Injectable()
export class InMemoryScanLoginTicketStore extends ScanLoginTicketStore {
  private readonly tickets = new Map<string, ScanLoginTicket>();

  async create(ticket: ScanLoginTicket): Promise<void> {
    this.prune();
    this.tickets.set(ticket.id, ticket);
  }

  async get(id: string): Promise<ScanLoginTicket | undefined> {
    const ticket = this.tickets.get(id);
    if (!ticket) return undefined;
    if (Date.now() > ticket.expiresAt) {
      this.tickets.delete(id);
      return undefined;
    }
    return ticket;
  }

  async getRaw(id: string): Promise<ScanLoginTicket | undefined> {
    return this.tickets.get(id);
  }

  async delete(id: string): Promise<void> {
    this.tickets.delete(id);
  }

  async save(ticket: ScanLoginTicket): Promise<void> {
    this.tickets.set(ticket.id, ticket);
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, ticket] of this.tickets) {
      if (now > ticket.expiresAt + 60_000) this.tickets.delete(id);
    }
  }
}

@Injectable()
export class RedisScanLoginTicketStore extends ScanLoginTicketStore {
  constructor(private readonly redis: RedisService) {
    super();
  }

  private key(id: string): string {
    return `medontime:scan-ticket:${id}`;
  }

  async create(ticket: ScanLoginTicket): Promise<void> {
    await this.save(ticket);
  }

  async get(id: string): Promise<ScanLoginTicket | undefined> {
    const ticket = await this.getRaw(id);
    if (!ticket) return undefined;
    if (Date.now() > ticket.expiresAt) {
      await this.delete(id);
      return undefined;
    }
    return ticket;
  }

  async getRaw(id: string): Promise<ScanLoginTicket | undefined> {
    const raw = await this.redis.getClient().get(this.key(id));
    return raw ? (JSON.parse(raw) as ScanLoginTicket) : undefined;
  }

  async delete(id: string): Promise<void> {
    await this.redis.getClient().del(this.key(id));
  }

  async save(ticket: ScanLoginTicket): Promise<void> {
    const ttlMs = Math.max(1000, ticket.expiresAt - Date.now());
    await this.redis
      .getClient()
      .set(this.key(ticket.id), JSON.stringify(ticket), 'PX', ttlMs);
  }
}
