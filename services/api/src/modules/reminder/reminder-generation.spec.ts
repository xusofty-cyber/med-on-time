import { ReminderInstanceStatus } from '@med-on-time/shared';
import { ReminderGenerationService } from './reminder-generation.service';

/**
 * C-1 回归测试（2026-10-30 全项目审查）：计划暂停/改排程会把未来实例置 Cancelled，
 * 被取消行占幂等键使生成节拍 skipDuplicates 永不重建——次日提醒静默空洞。
 * 修复口径：generateForMember 对本轮排程命中的未来 Cancelled 实例复活为 Pending。
 */

type Row = Record<string, any>;

function makeService(seedRows: Row[] = []) {
  const store = new Map<string, Row>();
  for (const r of seedRows) store.set(r.idempotencyKey, { ...r });

  const prisma: any = {
    member: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'mem-1', timezone: 'Asia/Shanghai' }),
    },
    medicationPlan: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'plan-1',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: null,
          items: [
            {
              id: 'item-1',
              courseType: 'continuous',
              courseDays: null,
              frequencyType: 'daily',
              frequencyRule: { times: ['08:00'] },
              doseAmount: 1,
              doseUnit: '片',
              drugId: 'drug-1',
              drugNameSnapshot: '测试药',
            },
          ],
          phases: [],
        },
      ]),
    },
    reminderInstance: {
      createMany: jest.fn(({ data }: any) => {
        let count = 0;
        for (const row of data) {
          if (!store.has(row.idempotencyKey)) {
            store.set(row.idempotencyKey, { ...row });
            count += 1;
          }
        }
        return Promise.resolve({ count });
      }),
      updateMany: jest.fn(({ where, data }: any) => {
        let count = 0;
        for (const row of store.values()) {
          if (!where.idempotencyKey.in.includes(row.idempotencyKey)) continue;
          if (row.status !== where.status) continue;
          if (
            where.scheduledAtUtc?.gt &&
            !(row.scheduledAtUtc > where.scheduledAtUtc.gt)
          )
            continue;
          if (where.deletedAt === null && row.deletedAt != null) continue;
          Object.assign(row, data);
          count += 1;
        }
        return Promise.resolve({ count });
      }),
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(
          [...store.values()].filter((r) =>
            where.idempotencyKey.in.includes(r.idempotencyKey),
          ),
        ),
      ),
    },
  };
  const queue: any = { enqueueDelivery: jest.fn().mockResolvedValue(undefined) };
  const service = new ReminderGenerationService(prisma, {} as any, {} as any, queue);
  return { service, store, queue };
}

const FUTURE_DATE = '2027-01-15';
const FUTURE_KEY = `item-1:${FUTURE_DATE}:08:00:0`;
const PAST_DATE = '2026-01-15';
const PAST_KEY = `item-1:${PAST_DATE}:08:00:0`;

function cancelledRow(key: string, scheduledAtUtc: string): Row {
  return {
    id: `inst-${key}`,
    idempotencyKey: key,
    memberId: 'mem-1',
    planId: 'plan-1',
    planItemId: 'item-1',
    status: ReminderInstanceStatus.Cancelled,
    scheduledAtUtc: new Date(scheduledAtUtc),
    snoozeUntil: new Date(scheduledAtUtc),
    deletedAt: null,
  };
}

describe('ReminderGenerationService.generateForMember（C-1 次日空洞修复）', () => {
  it('未来被取消的实例在计划恢复 active 后被复活并补登记投递', async () => {
    const { service, store, queue } = makeService([
      cancelledRow(FUTURE_KEY, '2027-01-15T00:00:00.000Z'),
    ]);
    const created = await service.generateForMember('mem-1', FUTURE_DATE);
    expect(created).toBe(0); // 复活不是新建
    const row = store.get(FUTURE_KEY)!;
    expect(row.status).toBe(ReminderInstanceStatus.Pending);
    expect(row.snoozeUntil).toBeNull();
    expect(queue.enqueueDelivery).toHaveBeenCalledTimes(1);
    expect(queue.enqueueDelivery.mock.calls[0][0].instanceId).toBe(row.id);
  });

  it('已过时刻的被取消实例不复活（归历史口径）', async () => {
    const { service, store, queue } = makeService([
      cancelledRow(PAST_KEY, '2026-01-15T00:00:00.000Z'),
    ]);
    await service.generateForMember('mem-1', PAST_DATE);
    expect(store.get(PAST_KEY)!.status).toBe(ReminderInstanceStatus.Cancelled);
    expect(queue.enqueueDelivery).not.toHaveBeenCalled();
  });

  it('无既有实例时照常生成并登记投递', async () => {
    const { service, store, queue } = makeService();
    const created = await service.generateForMember('mem-1', FUTURE_DATE);
    expect(created).toBe(1);
    expect(store.get(FUTURE_KEY)!.status).toBe(ReminderInstanceStatus.Pending);
    expect(queue.enqueueDelivery).toHaveBeenCalledTimes(1);
  });
});
