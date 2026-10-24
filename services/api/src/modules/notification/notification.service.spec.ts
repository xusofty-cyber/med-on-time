import { NotificationService } from './notification.service';

function makeInstance(overrides: Record<string, unknown> = {}) {
  return {
    drugNameSnapshot: '阿莫西林',
    doseAmount: { toString: () => '500' },
    doseUnit: 'mg',
    localDate: new Date('2026-10-25T00:00:00.000Z'),
    localTime: new Date('2026-10-25T08:00:00.000Z'),
    timezone: 'Asia/Shanghai',
    status: 'pending',
    ...overrides,
  };
}

function makeService(rows: any[], readIds: string[] = []) {
  const count = jest.fn();
  // count 先后被调两次：total 与 readCount；按 where 是否含 id.in 区分
  count.mockImplementation(({ where }: any) => {
    if (where?.id?.in) {
      return Promise.resolve(rows.filter((r) => where.id.in.includes(r.id)).length);
    }
    return Promise.resolve(rows.length);
  });
  const prisma: any = {
    reminderDeliveryLog: {
      count,
      findMany: jest.fn().mockResolvedValue(rows),
    },
  };
  const prefs: any = { getReadIds: jest.fn().mockResolvedValue(readIds) };
  const wechat: any = {};
  const config: any = { get: jest.fn().mockReturnValue(undefined) };
  return new NotificationService(prisma, prefs, wechat, config);
}

describe('NotificationService.listForAccount (P0 通知修复)', () => {
  it('有 instance 时合成 title/content，isRead 复用 read，readAt 为 null', async () => {
    const row = {
      id: 'log-1',
      reminderInstanceId: 'inst-1',
      memberId: 'mem-1',
      channel: 'in_app',
      result: 'success',
      createdAt: new Date('2026-10-25T08:00:00.000Z'),
      reminderInstance: makeInstance(),
    };
    const service = makeService([row], []);
    const res = await service.listForAccount('acc-1', 1, 20);

    expect(res.total).toBe(1);
    expect(res.items).toHaveLength(1);
    const item = res.items[0]!;
    expect(item.title).toBe('阿莫西林 500mg');
    expect(item.content).toContain('2026-10-25 08:00');
    expect(item.content).toContain('Asia/Shanghai');
    expect(item.content).toContain('待服药');
    expect(item.isRead).toBe(false);
    expect(item.read).toBe(false);
    expect(item.readAt).toBeNull();
    expect(item.instance?.drugNameSnapshot).toBe('阿莫西林');
    expect(res.unreadCount).toBe(1);
    expect(res.unread).toBe(1);
    expect(res.unreadTotal).toBe(1);
  });

  it('无 instance 时仍有兜底 title/content，不崩溃', async () => {
    const row = {
      id: 'log-2',
      reminderInstanceId: 'inst-2',
      memberId: 'mem-1',
      channel: 'in_app',
      result: 'success',
      createdAt: new Date('2026-10-25T08:00:00.000Z'),
      reminderInstance: null,
    };
    const service = makeService([row], []);
    const res = await service.listForAccount('acc-1', 1, 20);
    expect(res.items[0]!.title).toBe('服药提醒');
    expect(res.items[0]!.content).toContain('已送达');
    expect(res.items[0]!.instance).toBeNull();
  });

  it('已读行 isRead/read 为 true，未读数为剩余', async () => {
    const rows = [1, 2, 3].map((i) => ({
      id: `log-${i}`,
      reminderInstanceId: `inst-${i}`,
      memberId: 'mem-1',
      channel: 'in_app',
      result: 'success',
      createdAt: new Date('2026-10-25T08:00:00.000Z'),
      reminderInstance: makeInstance(),
    }));
    const service = makeService(rows, ['log-1', 'log-3']);
    const res = await service.listForAccount('acc-1', 1, 20);
    expect(res.items.map((x) => x.isRead)).toEqual([true, false, true]);
    expect(res.items.map((x) => x.read)).toEqual(res.items.map((x) => x.isRead));
    expect(res.unreadCount).toBe(1);
  });

  it('只向 Prisma 查询 result=success 的行（失败行被排除）', async () => {
    const row = {
      id: 'log-1',
      reminderInstanceId: 'inst-1',
      memberId: 'mem-1',
      channel: 'in_app',
      result: 'success',
      createdAt: new Date('2026-10-25T08:00:00.000Z'),
      reminderInstance: makeInstance(),
    };
    const prisma: any = {
      reminderDeliveryLog: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([row]),
      },
    };
    const prefs: any = { getReadIds: jest.fn().mockResolvedValue([]) };
    const service = new NotificationService(prisma, prefs, {} as any, { get: jest.fn() } as any);
    await service.listForAccount('acc-1', 1, 20);

    const where = prisma.reminderDeliveryLog.findMany.mock.calls[0][0].where;
    expect(where.result).toBe('success');
    expect(where.channel).toBe('in_app');
    expect(prisma.reminderDeliveryLog.count.mock.calls[0][0].where.result).toBe('success');
  });

  it('unreadCount 只统计 success 行中的未读（total - 已读 success 行）', async () => {
    const rows = [1, 2].map((i) => ({
      id: `log-${i}`,
      reminderInstanceId: `inst-${i}`,
      memberId: 'mem-1',
      channel: 'in_app',
      result: 'success',
      createdAt: new Date('2026-10-25T08:00:00.000Z'),
      reminderInstance: makeInstance(),
    }));
    const service = makeService(rows, ['log-1']);
    const res = await service.listForAccount('acc-1', 1, 20);
    expect(res.total).toBe(2);
    expect(res.unreadCount).toBe(1);
    expect(res.unread).toBe(res.unreadCount);
  });
});
