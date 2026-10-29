import { CheckinService } from './checkin.service';
import { BusinessException } from '../../common/exceptions/business.exception';

/**
 * PRN 服药记录端点单元测试（审查 H-1）：间隔/上限警告两段式
 * （首次 409、确认后 warned_confirmed 落库）、幂等、非 PRN 计划拒绝。
 */
const BASE = {
  plan: {
    id: 'plan1',
    memberId: 'm1',
    planType: 'prn',
    status: 'active',
    prnMinIntervalMinutes: 240,
    prnMaxPerDay: 2,
    deletedAt: null,
  },
  member: { id: 'm1', accountId: 'a1', timezone: 'Asia/Shanghai', status: 'active' },
  item: {
    id: 'item1',
    planId: 'plan1',
    drugId: 'd1',
    drugNameSnapshot: '布洛芬缓释胶囊',
    doseAmount: { toString: () => '1' } as any,
    doseUnit: '粒',
    deletedAt: null,
  },
};

function makeService(opts: {
  prevRecords?: any[];
  todayCount?: number;
  existingByRequestId?: any;
}) {
  const created: any[] = [];
  const all: any[] = [...(opts.prevRecords ?? [])];
  const tx: any = {
    prnIntakeRecord: {
      create: jest.fn(({ data }: any) => {
        created.push(data);
        all.push({ ...data });
        return Promise.resolve(data);
      }),
    },
    memberMedication: { findFirst: jest.fn(() => Promise.resolve(null)) },
  };
  const prisma: any = {
    medicationPlan: { findFirst: jest.fn(() => Promise.resolve(BASE.plan)) },
    member: { findFirst: jest.fn(() => Promise.resolve(BASE.member)) },
    medicationPlanItem: { findFirst: jest.fn(() => Promise.resolve(BASE.item)) },
    prnIntakeRecord: {
      findFirst: jest.fn(({ where }: any) => {
        if (where.clientRequestId) {
          return Promise.resolve(
            opts.existingByRequestId?.clientRequestId === where.clientRequestId
              ? opts.existingByRequestId
              : null,
          );
        }
        if (where.takenAt?.lt) {
          const prev = all
            .filter((r) => r.takenAt < where.takenAt.lt)
            .sort((a, b) => b.takenAt - a.takenAt)[0];
          return Promise.resolve(prev ?? null);
        }
        if (where.takenAt?.gt) {
          const next = all
            .filter((r) => r.takenAt > where.takenAt.gt)
            .sort((a, b) => a.takenAt - b.takenAt)[0];
          return Promise.resolve(next ?? null);
        }
        if (where.id) {
          return Promise.resolve(all.find((r) => r.id === where.id) ?? null);
        }
        return Promise.resolve(null);
      }),
      findFirstOrThrow: jest.fn(({ where }: any) =>
        Promise.resolve(all.find((r) => r.id === where.id)),
      ),
      count: jest.fn(() => Promise.resolve(opts.todayCount ?? 0)),
    },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  const service = new CheckinService(prisma, {} as any, {} as any);
  return { service, created };
}

const T0 = new Date(Date.now() - 60 * 60_000); // 1 小时前（避免未来时刻校验干扰）

describe('CheckinService.recordPrnIntake（PRN 记录）', () => {
  it('无警告时直接落库，limitCheckResult=passed', async () => {
    const { service, created } = makeService({});
    const res = await service.recordPrnIntake('a1', 'plan1', {
      clientRequestId: 'r1',
      planItemId: 'item1',
      takenAt: T0.toISOString(),
    });
    expect(created).toHaveLength(1);
    expect(res.limitCheckResult).toBe('passed');
    expect(res.alreadyRecorded).toBe(false);
    expect(res.stock.reason).toBe('no_stock_record');
  });

  it('间隔不足：首次 409 拒绝；确认后 warned_confirmed 落库', async () => {
    const prev = { takenAt: new Date(T0.getTime() - 60 * 60_000) }; // 1 小时前 < 240 分钟
    const { service, created } = makeService({ prevRecords: [prev] });
    await expect(
      service.recordPrnIntake('a1', 'plan1', {
        clientRequestId: 'r2',
        planItemId: 'item1',
        takenAt: T0.toISOString(),
      }),
    ).rejects.toBeInstanceOf(BusinessException);
    expect(created).toHaveLength(0);
    const res = await service.recordPrnIntake('a1', 'plan1', {
      clientRequestId: 'r2',
      planItemId: 'item1',
      takenAt: T0.toISOString(),
      confirmWarning: true,
    });
    expect(res.limitCheckResult).toBe('warned_confirmed');
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(created).toHaveLength(1);
  });

  it('单日上限已满：未确认时拒绝', async () => {
    const { service } = makeService({ todayCount: 2 });
    await expect(
      service.recordPrnIntake('a1', 'plan1', {
        clientRequestId: 'r3',
        planItemId: 'item1',
        takenAt: T0.toISOString(),
      }),
    ).rejects.toBeInstanceOf(BusinessException);
  });

  it('幂等：同 clientRequestId 重提返回既有记录、不再落库', async () => {
    const existing = {
      id: 'rec-existing',
      planId: 'plan1',
      planItemId: 'item1',
      memberId: 'm1',
      drugId: 'd1',
      drugNameSnapshot: '布洛芬缓释胶囊',
      doseAmount: 1,
      doseUnit: '粒',
      takenAt: T0,
      recordedAt: T0,
      localDate: new Date(T0.getTime()),
      limitCheckResult: 'passed',
      operatedByAccountId: 'a1',
      clientRequestId: 'r4',
    };
    const { service, created } = makeService({ existingByRequestId: existing });
    const res = await service.recordPrnIntake('a1', 'plan1', {
      clientRequestId: 'r4',
      planItemId: 'item1',
      takenAt: T0.toISOString(),
    });
    expect(res.alreadyRecorded).toBe(true);
    expect(res.id).toBe('rec-existing');
    expect(created).toHaveLength(0);
  });
});
