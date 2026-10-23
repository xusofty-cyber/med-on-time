import { Injectable } from '@nestjs/common';

export type ScanTicketStatus = 'pending' | 'confirmed';

export interface ScanLoginTicket {
  id: string;
  status: ScanTicketStatus;
  createdAt: number;
  expiresAt: number;
  /** 确认后回填：扫码账号（小程序端已登录账号） */
  accountId?: string;
  /** 票据创建端（Web）登记的设备信息，collect 时用于落会话 */
  platform?: string;
  deviceName?: string;
}

export const SCAN_TICKET_TTL_MS = 5 * 60_000;

/**
 * 小程序扫码确认登录（2026-10-23 负责人裁定路线）的票据存储。
 * 进程内 Map + TTL：当前生产为单实例部署足够；多副本部署前必须迁到 Redis，
 * 否则跨实例轮询会查不到票据（届时以 ticketId 为键存 Redis 并设 TTL 即可）。
 */
@Injectable()
export class ScanLoginTicketStore {
  private readonly tickets = new Map<string, ScanLoginTicket>();

  create(ticket: ScanLoginTicket): void {
    this.prune();
    this.tickets.set(ticket.id, ticket);
  }

  /** 取票据；pending 已过期视为不存在并顺手删除 */
  get(id: string): ScanLoginTicket | undefined {
    const ticket = this.tickets.get(id);
    if (!ticket) return undefined;
    if (ticket.status === 'pending' && Date.now() > ticket.expiresAt) {
      this.tickets.delete(id);
      return undefined;
    }
    return ticket;
  }

  delete(id: string): void {
    this.tickets.delete(id);
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, ticket] of this.tickets) {
      if (now > ticket.expiresAt + 60_000) this.tickets.delete(id);
    }
  }
}
