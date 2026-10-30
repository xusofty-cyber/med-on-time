import { useEffect, useState, type ReactNode } from 'react';
import Taro from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import { authorizationApi, memberApi } from '../../lib/endpoints';
import { toastError, toastOk } from '../../lib/api';
import { actions, useApp } from '../../lib/store';
import { useSessionGuard } from '../../lib/hooks';
import { authStatusLabels, levelLabels } from '../../lib/dict';
import { fmtDate } from '../../lib/time';
import type { Authorization } from '../../lib/types';
import { Badge, Btn, Card, DatePick, EmptyState, ErrorLine, Field, Loading, PageShell, Pick, Sheet, TxtInput } from '../../components/ui';
import { tr, useNavTitle, useT } from '../../lib/i18n';

const MAX_CAREGIVERS = 5;

/** 照护授权：我授权的人 / 授权我的人两组；发起、接受、拒绝、撤销。与 Web 端 Authorizations 同逻辑。 */
export default function Authorizations() {
  const t = useT();
  useNavTitle('nav.authorizations');
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
  const memberName = (id: string) => members.find((m) => m.id === id)?.displayName ?? t('authz.memberFallback');

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
      title: t('authz.revokeTitle'),
      content: t('authz.revokeContent'),
      confirmText: t('authz.revoke'),
      confirmColor: '#DC2626',
    });
    if (res.confirm) await act(a.id, () => authorizationApi.revoke(a.id), t('authz.revokedOk'));
  };

  return (
    <PageShell>
      <View className='row-between'>
        <Text className='tx-title'>{t('authz.title')}</Text>
        <Btn onClick={() => setFormOpen(true)}>{t('authz.create')}</Btn>
      </View>
      <Text className='tx-md tx-sub'>
        {t('authz.introA', { max: MAX_CAREGIVERS })}
      </Text>
      <ErrorLine error={error} />
      {groups === null ? (
        <Loading />
      ) : (
        <>
          <Card title={t('authz.grantedCard')}>
            {mine.length === 0 ? (
              <EmptyState text={t('authz.grantedEmpty')} />
            ) : (
              <View className='col' style={{ gap: '16rpx' }}>
                {mine.map((a) => (
                  <AuthRow key={a.id} auth={a} title={t('authz.grantedTitle', { caregiver: a.caregiverNickname ?? t('authz.inviteeFallback'), member: memberName(a.memberId) })}>
                    {(a.status === 'active' || a.status === 'pending_accept') && (
                      <Btn variant='ghost' disabled={busyId === a.id} onClick={() => void revoke(a)}>
                        {t('authz.revoke')}
                      </Btn>
                    )}
                  </AuthRow>
                ))}
              </View>
            )}
          </Card>
          <Card title={t('authz.receivedCard')}>
            {incoming.length === 0 ? (
              <EmptyState text={t('authz.receivedEmpty')} />
            ) : (
              <View className='col' style={{ gap: '16rpx' }}>
                {incoming.map((a) => (
                  <AuthRow
                    key={a.id}
                    auth={a}
                    title={t('authz.receivedTitle', { grantor: a.grantorNickname ?? t('authz.grantorFallback'), member: a.memberName ?? memberName(a.memberId) })}
                  >
                    {a.status === 'pending_accept' && (
                      <>
                        <Btn
                          disabled={busyId === a.id}
                          onClick={() =>
                            void act(a.id, () => authorizationApi.accept(a.id), t('authz.acceptedOk'))
                          }
                        >
                          {t('authz.accept')}
                        </Btn>
                        <Btn
                          variant='ghost'
                          disabled={busyId === a.id}
                          onClick={() => void act(a.id, () => authorizationApi.reject(a.id), t('authz.rejectedOk'))}
                        >
                          {t('authz.reject')}
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
    <View style={{ background: 'var(--color-background-page)', borderRadius: '16rpx', padding: '18rpx 20rpx' }}>
      <View className='row-between' style={{ alignItems: 'flex-start' }}>
        <Text className='tx-md tx-strong grow'>{title}</Text>
        <Badge tone={auth.status === 'active' ? 'green' : auth.status === 'pending_accept' ? 'amber' : 'gray'}>
          {authStatusLabels()[auth.status] ?? auth.status}
        </Badge>
      </View>
      <Text className='tx-sm tx-sub' style={{ display: 'block', marginTop: '6rpx' }}>
        {levelLabels()[auth.level] ?? auth.level}{tr('authz.invitedAt', { date: fmtDate(auth.invitedAt) })}
        {auth.expiresAt ? tr('authz.expires', { date: fmtDate(auth.expiresAt) }) : tr('authz.longTerm')}
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
      setError(new Error(tr('authz.selectMember')));
      return;
    }
    if (!/^1\d{10}$/.test(caregiverPhone)) {
      setError(new Error(tr('authz.invalidPhone')));
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
      toastOk(tr('authz.sentOk'));
      onClose();
      await onCreated();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} title={tr('authz.createTitle')} onClose={onClose}>
      <View className='col' style={{ gap: '24rpx' }}>
        <Field label={tr('authz.memberField')}>
          <Pick
            value={memberId}
            onChange={setMemberId}
            options={ownMembers.map((m) => ({ value: m.id, label: m.displayName }))}
          />
        </Field>
        <Field label={tr('authz.phoneField')} hint={tr('authz.phoneHint')}>
          <TxtInput value={caregiverPhone} onChange={setCaregiverPhone} placeholder={tr('reg.phonePlaceholder')} type='number' maxlength={11} />
        </Field>
        <Field label={tr('authz.levelField')}>
          <Pick
            value={level}
            onChange={setLevel}
            options={Object.entries(levelLabels()).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        <Field label={tr('authz.expiresField')}>
          <View className='row' style={{ gap: '12rpx' }}>
            <View className='grow'>
              <DatePick value={expiresAt} onChange={setExpiresAt} placeholder={tr('authz.longTermPlain')} />
            </View>
            {expiresAt && (
              <Btn variant='ghost' onClick={() => setExpiresAt('')}>
                {tr('pf.clear')}
              </Btn>
            )}
          </View>
        </Field>
        <ErrorLine error={error} />
        <View className='row' style={{ gap: '12rpx' }}>
          <View className='grow'>
            <Btn variant='ghost' block onClick={onClose}>
              {tr('common.cancel')}
            </Btn>
          </View>
          <View className='grow'>
            <Btn block disabled={busy} onClick={submit}>
              {busy ? tr('authz.sending') : tr('authz.send')}
            </Btn>
          </View>
        </View>
      </View>
    </Sheet>
  );
}
