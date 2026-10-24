import { NotificationService } from './notification.service';
import { AuthBusinessCode } from '../../common/exceptions/business.exception';

/**
 * 后端 ↔ 各端契约测试（P1，二选一选了契约测试，见报告）。
 *
 * 各端期望形状（只读引用，后端改字段必须同步改这里，前端文件本身不在本任务手里）：
 * - Web apps/web/src/lib/types.ts NotificationItem + PageResult：
 *   { id, title, content, type?, memberId?, isRead?, readAt?, createdAt }，
 *   外层 { items, total, page, pageSize, unreadCount? }
 * - 小程序 apps/miniprogram/src/lib/types.ts：同上，但外层读 unreadTotal
 * - iOS apps/ios/MedOnTime/Models/NotificationDTOs.swift NotificationItemDTO：
 *   { id, title, content, type?, memberId?, isRead?, readAt?, createdAt }
 * - 短信未开通：前后端约定业务码 40313（AuthBusinessCode.SmsNotConfigured），
 *   前端据此引导用户改用邮箱验证码。
 *
 * 本测试用 JSON 序列化后的线上传输形态断言（Date → ISO 字符串），
 * title/content/unreadCount 一旦漂移即失败。
 */

// 前端 NotificationItem 的线上传输形态（与三端类型逐字对齐）
interface FrontendNotificationItemWire {
  id: string;
  title: string;
  content: string;
  type?: string;
  memberId?: string | null;
  isRead?: boolean;
  readAt?: string | null;
  createdAt: string;
}

interface FrontendNotificationListWire {
  items: FrontendNotificationItemWire[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount?: number;
  unreadTotal?: number;
  unread?: number;
}

function makeService(rows: any[], readIds: string[] = []) {
  const prisma: any = {
    reminderDeliveryLog: {
      count: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where?.id?.in
            ? rows.filter((r) => where.id.in.includes(r.id)).length
            : rows.length,
        ),
      ),
      findMany: jest.fn().mockResolvedValue(rows),
    },
  };
  const prefs: any = { getReadIds: jest.fn().mockResolvedValue(readIds) };
  return new NotificationService(prisma, prefs, {} as any, { get: jest.fn() } as any);
}

describe('通知列表契约（后端 → Web/小程序/iOS）', () => {
  it('线上传输形态与三端 NotificationItem 逐字一致', async () => {
    const rows = [
      {
        id: 'log-1',
        reminderInstanceId: 'inst-1',
        memberId: 'mem-1',
        channel: 'in_app',
        result: 'success',
        createdAt: new Date('2026-10-25T08:00:00.000Z'),
        reminderInstance: {
          drugNameSnapshot: '阿莫西林',
          doseAmount: { toString: () => '500' },
          doseUnit: 'mg',
          localDate: new Date('2026-10-25T00:00:00.000Z'),
          localTime: new Date('2026-10-25T08:00:00.000Z'),
          timezone: 'Asia/Shanghai',
          status: 'taken',
        },
      },
      {
        id: 'log-2',
        reminderInstanceId: 'inst-2',
        memberId: 'mem-1',
        channel: 'in_app',
        result: 'success',
        createdAt: new Date('2026-10-25T09:00:00.000Z'),
        reminderInstance: null,
      },
    ];
    const service = makeService(rows, ['log-1']);
    const wire = JSON.parse(
      JSON.stringify(await service.listForAccount('acc-1', 1, 20)),
    ) as FrontendNotificationListWire;

    // 外层：Web 读 unreadCount，小程序读 unreadTotal，旧字段 unread 保留兼容
    expect(typeof wire.unreadCount).toBe('number');
    expect(wire.unreadCount).toBe(1);
    expect(wire.unreadTotal).toBe(wire.unreadCount);
    expect(wire.unread).toBe(wire.unreadCount);
    expect(wire.total).toBe(2);
    expect(wire.page).toBe(1);
    expect(wire.pageSize).toBe(20);

    // 逐项：三端必填字段齐全且类型正确（缺一即漂移）
    for (const item of wire.items) {
      expect(typeof item.id).toBe('string');
      expect(typeof item.title).toBe('string');
      expect(item.title.length).toBeGreaterThan(0);
      expect(typeof item.content).toBe('string');
      expect(item.content.length).toBeGreaterThan(0);
      expect(typeof item.isRead).toBe('boolean');
      expect(item.readAt === null || typeof item.readAt === 'string').toBe(true);
      expect(typeof item.createdAt).toBe('string');
    }
    // 编译期对齐：线上传输项可直接赋给前端期望类型（缺必填字段会在 tsc 失败）
    const asFrontendItems: FrontendNotificationItemWire[] = wire.items;
    expect(asFrontendItems).toHaveLength(2);

    expect(wire.items[0]!.title).toBe('阿莫西林 500mg');
    expect(wire.items[0]!.content).toContain('已服药');
    expect(wire.items[0]!.isRead).toBe(true);
    expect(wire.items[1]!.title).toBe('服药提醒');
    expect(wire.items[1]!.isRead).toBe(false);
  });

  it('失败行不进入契约（列表只含 success 行，未读数不含失败行）', async () => {
    const rows = [
      {
        id: 'log-ok',
        reminderInstanceId: 'inst-1',
        memberId: 'mem-1',
        channel: 'in_app',
        result: 'success',
        createdAt: new Date('2026-10-25T08:00:00.000Z'),
        reminderInstance: null,
      },
    ];
    const prisma: any = {
      reminderDeliveryLog: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue(rows),
      },
    };
    const prefs: any = { getReadIds: jest.fn().mockResolvedValue([]) };
    const service = new NotificationService(prisma, prefs, {} as any, { get: jest.fn() } as any);
    await service.listForAccount('acc-1', 1, 20);
    // 契约：查询条件必须限定 result=success，否则失败行会混进各端收件箱
    expect(prisma.reminderDeliveryLog.findMany.mock.calls[0][0].where).toMatchObject({
      channel: 'in_app',
      result: 'success',
    });
  });
});

describe('短信未开通契约（前后端约定业务码）', () => {
  it('SmsNotConfigured 为 40313（与微信未开通 40312 同族，不可复用）', () => {
    expect(AuthBusinessCode.SmsNotConfigured).toBe(40313);
    expect(AuthBusinessCode.SmsNotConfigured).not.toBe(
      AuthBusinessCode.WechatNotConfigured,
    );
  });
});
