import { useEffect, useState, type ReactNode } from 'react';
import Taro from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import { authorizationApi, memberApi } from '../../lib/endpoints';
import { toastError, toastOk } from '../../lib/api';
import { actions, useApp } from '../../lib/store';
import { useSessionGuard } from '../../lib/hooks';
import { AUTH_STATUS_LABELS, LEVEL_LABELS } from '../../lib/dict';
import { fmtDate } from '../../lib/time';
import type { Authorization } from '../../lib/types';
import { Badge, Btn, Card, DatePick, EmptyState, ErrorLine, Field, Loading, PageShell, Pick, Sheet, TxtInput } from '../../components/ui';

const MAX_CAREGIVERS = 5;

/** 照护授权：我授权的人 / 授权我的人两组；发起、接受、拒绝、撤销。与 Web 端 Authorizations 同逻辑。 */
export default function Authorizations() {
  useSessionGuard();
  const members = useApp((s) => s.members);
  const [groups, setGroups] = useState<{ granted: Authorization[]; received: Authorization[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      setGroups(await authorizationApi.list());
      setError(null);
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const mine = groups?.granted ?? [];
  const incoming = groups?.received ?? [];
  const memberName = (id: string) => members.find((m) => m.id === id)?.displayName ?? '成员';

  const act = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id);
    try {
      await fn();
      toastOk(ok);
      await load();
      try {
        actions.setMembers(await memberApi.list());
      } catch {
        /* 成员列表刷新失败不阻塞当前授权操作 */
      }
    } catch (e) {
      toastError(e);
    } finally {
      setBusyId(null);
    }
  };

  const revoke = async (a: Authorization) => {
    const res = await Taro.showModal({
      title: '撤销授权',
      content: '确定撤销这份授权吗？撤销后对方立即无法访问该成员数据。',
      confirmText: '撤销',
      confirmColor: '#DC2626',
    });
    if (res.confirm) await act(a.id, () => authorizationApi.revoke(a.id), '授权已撤销');
  };

  return (
    <PageShell>
      <View className='row-between'>
        <Text className='tx-title'>照护授权</Text>
        <Btn onClick={() => setFormOpen(true)}>+ 发起授权</Btn>
      </View>
      <Text className='tx-md tx-sub'>
        授权家人或照护人代为查看（L1）、协助打卡（L2）或配置计划（L3）。每位成员最多 {MAX_CAREGIVERS}{' '}
        位照护人；所有代操作都会双记录操作人与归属成员。
      </Text>
      <ErrorLine error={error} />
      {groups === null ? (
        <Loading />
      ) : (
        <>
          <Card title='我授权的人（我把成员托付给他人照护）'>
            {mine.length === 0 ? (
              <EmptyState text='暂无发出的授权。' />
            ) : (
              <View className='col' style={{ gap: '16rpx' }}>
                {mine.map((a) => (
                  <AuthRow key={a.id} auth={a} title={`${a.caregiverNickname ?? '受邀人'} 照护 ${memberName(a.memberId)}`}>
                    {(a.status === 'active' || a.status === 'pending_accept') && (
                      <Btn variant='ghost' disabled={busyId === a.id} onClick={() => void revoke(a)}>
                        撤销
                      </Btn>
                    )}
                  </AuthRow>
                ))}
              </View>
            )}
          </Card>
          <Card title='授权我的人（他人把成员托付给我照护）'>
            {incoming.length === 0 ? (
              <EmptyState text='暂无收到的授权邀请。' />
            ) : (
              <View className='col' style={{ gap: '16rpx' }}>
                {incoming.map((a) => (
                  <AuthRow
                    key={a.id}
                    auth={a}
                    title={`${a.grantorNickname ?? '授权人'} 邀请您照护 ${a.memberName ?? memberName(a.memberId)}`}
                  >
                    {a.status === 'pending_accept' && (
                      <>
                        <Btn
                          disabled={busyId === a.id}
                          onClick={() =>
                            void act(a.id, () => authorizationApi.accept(a.id), '已接受授权，可切换到该成员查看')
                          }
                        >
                          接受
                        </Btn>
                        <Btn
                          variant='ghost'
                          disabled={busyId === a.id}
                          onClick={() => void act(a.id, () => authorizationApi.reject(a.id), '已拒绝该邀请')}
                        >
                          拒绝
                        </Btn>
                      </>
                    )}
                  </AuthRow>
                ))}
              </View>
            )}
          </Card>
        </>
      )}
      <CreateAuthSheet open={formOpen} onClose={() => setFormOpen(false)} onCreated={load} />
    </PageShell>
  );
}

function AuthRow({
  auth,
  title,
  children,
}: {
  auth: Authorization;
  title: string;
  children?: ReactNode;
}) {
  return (
    <View style={{ background: '#F6F8F7', borderRadius: '16rpx', padding: '18rpx 20rpx' }}>
      <View className='row-between' style={{ alignItems: 'flex-start' }}>
        <Text className='tx-md tx-strong grow'>{title}</Text>
        <Badge tone={auth.status === 'active' ? 'green' : auth.status === 'pending_accept' ? 'amber' : 'gray'}>
          {AUTH_STATUS_LABELS[auth.status] ?? auth.status}
        </Badge>
      </View>
      <Text className='tx-sm tx-sub' style={{ display: 'block', marginTop: '6rpx' }}>
        {LEVEL_LABELS[auth.level] ?? auth.level} · 邀请于 {fmtDate(auth.invitedAt)}
        {auth.expiresAt ? ` · 有效期至 ${fmtDate(auth.expiresAt)}` : ' · 长期有效'}
        {auth.caregiverPhoneMasked ? ` · ${auth.caregiverPhoneMasked}` : ''}
      </Text>
      {children && (
        <View className='row' style={{ gap: '12rpx', marginTop: '14rpx' }}>
          {children}
        </View>
      )}
    </View>
  );
}

function CreateAuthSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}) {
  const members = useApp((s) => s.members);
  const ownMembers = members.filter((m) => !m.accessLevel || m.accessLevel === 'owner');
  const [memberId, setMemberId] = useState('');
  const [caregiverPhone, setCaregiverPhone] = useState('');
  const [level, setLevel] = useState('L2');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && !memberId && ownMembers[0]) setMemberId(ownMembers[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  const submit = async () => {
    if (!memberId) {
      setError(new Error('请先选择要托付照护的成员'));
      return;
    }
    if (!/^1\d{10}$/.test(caregiverPhone)) {
      setError(new Error('请输入受邀人的 11 位手机号（对方需已注册药准时）'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authorizationApi.create({
        memberId,
        caregiverPhone,
        level,
        expiresAt: expiresAt ? `${expiresAt}T23:59:59+08:00` : null,
      });
      toastOk('授权邀请已发出，等待对方接受');
      onClose();
      await onCreated();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} title='发起照护授权' onClose={onClose}>
      <View className='col' style={{ gap: '24rpx' }}>
        <Field label='要托付照护的成员'>
          <Pick
            value={memberId}
            onChange={setMemberId}
            options={ownMembers.map((m) => ({ value: m.id, label: m.displayName }))}
          />
        </Field>
        <Field label='受邀人手机号' hint='对方需已注册药准时账号，接受后生效'>
          <TxtInput value={caregiverPhone} onChange={setCaregiverPhone} placeholder='11 位手机号' type='number' maxlength={11} />
        </Field>
        <Field label='授权级别'>
          <Pick
            value={level}
            onChange={setLevel}
            options={Object.entries(LEVEL_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <Field label='有效期至（留空 = 长期有效）'>
          <View className='row' style={{ gap: '12rpx' }}>
            <View className='grow'>
              <DatePick value={expiresAt} onChange={setExpiresAt} placeholder='长期有效' />
            </View>
            {expiresAt && (
              <Btn variant='ghost' onClick={() => setExpiresAt('')}>
                清除
              </Btn>
            )}
          </View>
        </Field>
        <ErrorLine error={error} />
        <View className='row' style={{ gap: '12rpx' }}>
          <View className='grow'>
            <Btn variant='ghost' block onClick={onClose}>
              取消
            </Btn>
          </View>
          <View className='grow'>
            <Btn block disabled={busy} onClick={submit}>
              {busy ? '发送中…' : '发出邀请'}
            </Btn>
          </View>
        </View>
      </View>
    </Sheet>
  );
}
