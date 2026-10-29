import { AccountLifecycleService } from './account-lifecycle.service';

/**
 * 注销终局处理单元测试：手写 Prisma 假件，验证
 * ①到期账号被终局处理（墓碑化+匿名化+审计）；②未到期不处理；
 * ③事务内状态被并发撤销（已非 cancelling）时跳过。
 */
function makeHarness(account: any) {
  const calls: Record<string, any[]> = {};
  const record = (name: string) => (args: any) => {
    (calls[name] ??= []).push(args);
    return Promise.resolve({ count: 1 });
  };
  const tx: any = {
    userAccount: {
      findFirst: jest.fn(() => Promise.resolve(account)),
      update: record('account.update'),
    },
    member: {
      findMany: jest.fn(() => Promise.resolve([{ id: 'm1' }])),
      updateMany: record('member.updateMany'),
    },
    medicationPlan: {
      findMany: jest.fn(() => Promise.resolve([{ id: 'p1' }])),
      updateMany: record('plan.updateMany'),
    },
    reminderInstance: { updateMany: record('instance.updateMany') },
    caregiverAuthorization: { updateMany: record('auth.updateMany') },
    memberMedicalRecord: { deleteMany: record('ehr.delete') },
    memberMedicalHistory: { deleteMany: record('history.delete') },
    emergencyContact: { deleteMany: record('contact.delete') },
    userOauthBinding: { updateMany: record('oauth.updateMany') },
    userDevice: { deleteMany: record('device.delete') },
    auditLog: { create: record('audit.create') },
  };
  const prisma: any = {
    userAccount: {
      findMany: jest.fn(() =>
        Promise.resolve(account ? [{ id: account.id }] : []),
      ),
    },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  const sessions: any = { revokeAllSessions: jest.fn(() => Promise.resolve()) };
  const service = new AccountLifecycleService(prisma, sessions);
  return { service, calls, sessions, tx };
}

const DAY = 24 * 3600 * 1000;
const NOW = new Date('2026-10-30T00:00:00Z');

describe('AccountLifecycleService（注销终局）', () => {
  it('到期账号：墓碑化 + 成员匿名化 + 健康明细删除 + 审计 + 吊销会话', async () => {
    const account = {
      id: 'a1',
      status: 'cancelling',
      cancelApplyAt: new Date(NOW.getTime() - 31 * DAY),
    };
    const { service, calls, sessions } = makeHarness(account);
    const res = await service.runDueCancellations(NOW);
    expect(res.processed).toBe(1);
    const upd = calls['account.update']![0]!;
    expect(upd.data.status).toBe('cancelled');
    expect(upd.data.phone).toBeNull();
    expect(upd.data.emailHash).toBeNull();
    expect(upd.data.passwordHash).toBeNull();
    expect(upd.data.deletedAt).toEqual(NOW);
    const memberUpd = calls['member.updateMany']![0]!;
    expect(memberUpd.data.displayName).toBe('已注销成员');
    expect(memberUpd.data.realNameEnc).toBeNull();
    expect(calls['ehr.delete']).toHaveLength(1);
    expect(calls['contact.delete']).toHaveLength(1);
    const audit = calls['audit.create']![0]!;
    expect(audit.data.actorType).toBe('system');
    expect(audit.data.action).toBe('account:cancel:finalize');
    expect(audit.data.detail.membersAnonymized).toBe(1);
    expect(sessions.revokeAllSessions).toHaveBeenCalledWith('a1');
  });

  it('事务内复核未到期（29 天）时跳过，不写任何数据', async () => {
    const account = {
      id: 'a2',
      status: 'cancelling',
      cancelApplyAt: new Date(NOW.getTime() - 29 * DAY),
    };
    const { service, calls } = makeHarness(account);
    const res = await service.runDueCancellations(NOW);
    expect(res.processed).toBe(0);
    expect(calls['account.update']).toBeUndefined();
  });

  it('状态已被撤销（active）时跳过', async () => {
    const account = {
      id: 'a3',
      status: 'active',
      cancelApplyAt: new Date(NOW.getTime() - 40 * DAY),
    };
    const { service, calls } = makeHarness(account);
    const res = await service.runDueCancellations(NOW);
    expect(res.processed).toBe(0);
    expect(calls['account.update']).toBeUndefined();
  });
});
