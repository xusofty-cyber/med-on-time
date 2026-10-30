import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { accountApi, authApi } from '../lib/endpoints';
import { actions, useApp } from '../lib/store';
import { Badge, Button, Card, ErrorText, Field, Modal, Select, Spinner, TextInput } from '../components/ui';
import { accountStatusLabels } from '../lib/dict';
import { fmtDateTime, isValidTimeZone } from '../lib/time';
import { qrToDataUrl } from '../lib/qr';
import { applyThemeId, getStoredThemeId, themes, type ThemeId } from '../lib/theme';
import { LOCALES, tr, useT, type Locale } from '../lib/i18n';
import type { UserSession } from '../lib/types';

const TZ_CITIES = [
  ['Asia/Shanghai', 'settings.tz.beijing'],
  ['Asia/Chongqing', 'settings.tz.chongqing'],
  ['Asia/Hong_Kong', 'settings.tz.hongkong'],
  ['Asia/Taipei', 'settings.tz.taipei'],
  ['Asia/Singapore', 'settings.tz.singapore'],
  ['Asia/Tokyo', 'settings.tz.tokyo'],
  ['Asia/Seoul', 'settings.tz.seoul'],
  ['Asia/Bangkok', 'settings.tz.bangkok'],
  ['Asia/Dubai', 'settings.tz.dubai'],
  ['Europe/London', 'settings.tz.london'],
  ['Europe/Paris', 'settings.tz.paris'],
  ['America/New_York', 'settings.tz.newyork'],
  ['America/Chicago', 'settings.tz.chicago'],
  ['America/Denver', 'settings.tz.denver'],
  ['America/Los_Angeles', 'settings.tz.losangeles'],
  ['Australia/Sydney', 'settings.tz.sydney'],
  ['UTC', 'settings.tz.utc'],
] as const;

function commonTimezoneOptions(): { value: string; label: string }[] {
  return TZ_CITIES.map(([value, cityKey]) => ({
    value,
    label: tr('settings.tzLabel', { iana: value, city: tr(cityKey) }),
  }));
}

export default function Settings() {
  const tr = useT();
  const account = useApp((s) => s.account);
  const locale = useApp((s) => s.locale);
  const [nickname, setNickname] = useState('');
  const [timezone, setTimezone] = useState('Asia/Shanghai');
  const [profileError, setProfileError] = useState<unknown>(null);
  const [sessions, setSessions] = useState<UserSession[] | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [bindOpen, setBindOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /* 界面主题（阶段 2）：三套切换，localStorage 持久化，切换即时生效。 */
  const [themeId, setThemeId] = useState<ThemeId>(() => getStoredThemeId());
  const changeTheme = (id: ThemeId) => {
    applyThemeId(id);
    setThemeId(id);
  };

  const timezoneOptions = useMemo(() => {
    const common = commonTimezoneOptions();
    const trimmed = timezone.trim();
    if (trimmed && !common.some((o) => o.value === trimmed)) {
      return [{ value: trimmed, label: tr('settings.tzCurrent', { tz: trimmed }) }, ...common];
    }
    return common;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timezone, locale]);

  useEffect(() => {
    accountApi
      .profile()
      .then((p) => {
        actions.setAccount(p);
        setNickname(p.nickname);
        setTimezone(p.timezone);
      })
      .catch(setProfileError);
    accountApi
      .sessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    const tz = timezone.trim() || 'Asia/Shanghai';
    if (!isValidTimeZone(tz)) {
      setProfileError(new Error(tr('settings.invalidTz')));
      return;
    }
    setProfileError(null);
    try {
      const saved = await accountApi.updateProfile({ nickname, timezone: tz });
      actions.setAccount(saved);
      actions.toast('success', tr('settings.profileSavedToast'));
    } catch (err) {
      setProfileError(err);
    }
  };

  const revoke = async (s: UserSession) => {
    try {
      await accountApi.revokeSession(s.id);
      setSessions((list) => (list ?? []).filter((x) => x.id !== s.id));
      actions.toast('success', tr('settings.sessionRevokedToast'));
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : tr('common.operationFailed'));
    }
  };

  const applyCancel = async () => {
    setBusy(true);
    try {
      await accountApi.cancel(cancelReason || undefined);
      actions.toast('info', tr('settings.cancelSubmittedToast'));
      setCancelOpen(false);
      const p = await accountApi.profile();
      actions.setAccount(p);
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : tr('settings.submitFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onBindSuccess = async () => {
    setBindOpen(false);
    try {
      const p = await accountApi.profile();
      actions.setAccount(p);
    } catch {
      /* ignore */
    }
    actions.toast('success', tr('settings.wechatBoundToast'));
  };

  const cancelling = account?.status === 'cancelling';

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-medgreen-dark">{tr('nav.settings')}</h1>

      <Card title={tr('settings.profileCard')}>
        <ErrorText error={profileError} />
        {!account ? (
          <Spinner />
        ) : (
          <form className="flex flex-col gap-4" onSubmit={saveProfile}>
            <div className="flex flex-col gap-2 text-neutral-600">
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  {tr('settings.phoneLine', { phone: account.phoneMasked ?? '—' })}
                </span>
                {typeof account.phoneVerified === 'boolean' &&
                  (account.phoneVerified ? (
                    <Badge tone="green">{tr('settings.verified')}</Badge>
                  ) : (
                    <Badge tone="amber">{tr('settings.unverified')}</Badge>
                  ))}
                <Badge tone={cancelling ? 'amber' : 'green'}>
                  {accountStatusLabels()[account.status] ?? account.status}
                </Badge>
                {account.registeredAt && <span>{tr('settings.registeredAt', { time: fmtDateTime(account.registeredAt) })}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span>{tr('settings.emailLine', { email: account.emailMasked ?? tr('settings.emailUnbound') })}</span>
                {account.emailVerified && <Badge tone="green">{tr('settings.verified')}</Badge>}
              </div>
            </div>
            <Field label={tr('settings.nickname')}>
              <TextInput value={nickname} onChange={setNickname} />
            </Field>
            <Field label={tr('settings.timezone')} hint={tr('settings.timezoneHint')}>
              <Select value={timezone} onChange={setTimezone} options={timezoneOptions} />
            </Field>
            <div>
              <Button type="submit">{tr('settings.saveProfile')}</Button>
            </div>
          </form>
        )}
      </Card>

      <Card title={tr('settings.themeCard')}>
        <fieldset>
          <legend className="sr-only">{tr('settings.themeCard')}</legend>
          <div className="flex flex-col gap-3" role="radiogroup" aria-label={tr('settings.themeCard')}>
            {themes().map((t) => (
              <label
                key={t.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${
                  themeId === t.id ? 'border-medgreen bg-medgreen-light' : 'border-neutral-200 hover:border-medgreen'
                }`}
              >
                <input
                  type="radio"
                  name="medontime-theme"
                  value={t.id}
                  checked={themeId === t.id}
                  onChange={() => changeTheme(t.id)}
                  className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-brand-primary)]"
                />
                <span>
                  <span className="block font-medium">{t.label}</span>
                  <span className="block text-sm text-neutral-500">{t.description}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-3 text-sm text-neutral-500">{tr('settings.themeNote')}</p>
        </fieldset>
      </Card>

      <Card title={tr('settings.languageCard')}>
        <Field label={tr('common.language')}>
          <Select
            value={locale}
            onChange={(v) => actions.setLocale(v as Locale)}
            options={LOCALES.map((l) => ({ value: l.value, label: tr(l.labelKey) }))}
          />
        </Field>
      </Card>

      <Card title={tr('settings.bindingCard')}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">{tr('settings.wechatBind')}</p>
              {account?.hasWechat && <Badge tone="green">{tr('settings.bound')}</Badge>}
            </div>
            <p className="text-sm text-neutral-500">
              {account?.hasWechat
                ? tr('settings.wechatBoundDesc')
                : tr('settings.wechatUnboundDesc')}
            </p>
          </div>
          {!account?.hasWechat && (
            <Button variant="soft" onClick={() => setBindOpen(true)}>
              {tr('settings.bindWechatBtn')}
            </Button>
          )}
        </div>
      </Card>

      <Card title={tr('settings.sessionsCard')}>
        {sessions === null ? (
          <Spinner />
        ) : sessions.length === 0 ? (
          <p className="text-neutral-500">{tr('settings.noSessions')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-neutral-50 px-4 py-3">
                <div>
                  <p className="font-medium">
                    {s.deviceName ?? s.userAgent ?? tr('settings.unknownDevice')}
                    {s.current && (
                      <span className="ml-2">
                        <Badge tone="green">{tr('settings.currentDevice')}</Badge>
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {s.ipAddress ? `IP ${s.ipAddress} · ` : ''}
                    {s.lastActiveAt ? tr('settings.lastActive', { time: fmtDateTime(s.lastActiveAt) }) : s.createdAt ? tr('settings.loggedInAt', { time: fmtDateTime(s.createdAt) }) : ''}
                  </p>
                </div>
                {!s.current && (
                  <Button variant="ghost" onClick={() => revoke(s)}>
                    {tr('settings.revokeBtn')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={tr('settings.cancelCard')}>
        {cancelling ? (
          <div className="flex flex-col gap-3">
            <p className="text-amber-700">
              {tr('settings.cancellingText', {
                appliedAt: account?.cancelApplyAt
                  ? tr('settings.cancelAppliedAt', { time: fmtDateTime(account.cancelApplyAt) })
                  : '',
              })}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-neutral-600">
              {tr('settings.cancelIntroA')}
              <strong>{tr('settings.cancelCooling')}</strong>
              {tr('settings.cancelIntroB')}
            </p>
            <div>
              <Button variant="danger" onClick={() => setCancelOpen(true)}>
                {tr('settings.applyCancelBtn')}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal open={cancelOpen} title={tr('settings.cancelModalTitle')} onClose={() => setCancelOpen(false)}>
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-amber-800">
            <p className="font-medium">{tr('settings.cancelRulesTitle')}</p>
            <ul className="mt-2 list-disc pl-5">
              <li>{tr('settings.cancelRule1')}</li>
              <li>{tr('settings.cancelRule2')}</li>
              <li>{tr('settings.cancelRule3')}</li>
              <li>{tr('settings.cancelRule4')}</li>
            </ul>
          </div>
          <Field label={tr('settings.cancelReason')}>
            <TextInput value={cancelReason} onChange={setCancelReason} placeholder={tr('settings.cancelReasonPlaceholder')} />
          </Field>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setCancelOpen(false)}>
              {tr('settings.thinkAgain')}
            </Button>
            <Button variant="danger" className="flex-1" disabled={busy} onClick={applyCancel}>
              {busy ? tr('stock.submitting') : tr('settings.confirmCancel')}
            </Button>
          </div>
        </div>
      </Modal>
      <BindWechatModal
        open={bindOpen}
        onClose={() => setBindOpen(false)}
        onSuccess={onBindSuccess}
      />
    </div>
  );
}

/**
 * 微信扫码绑定弹窗：建票 → 渲染二维码（内容以 bind: 开头） → 每 2 秒轮询状态
 * confirmed 后关弹窗、刷新账号信息、提示「微信已绑定」；过期显示「二维码已过期，重新生成」。
 */
function BindWechatModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [qr, setQr] = useState('');
  const [state, setState] = useState<'loading' | 'waiting' | 'expired' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    let timer: number | undefined;
    let cancelled = false;
    doneRef.current = false;
    setState('loading');
    setQr('');

    (async () => {
      try {
        const ticket = await authApi.createBindTicket();
        const content = ticket.qrContent || `bind:${ticket.ticketId}`;
        const url = qrToDataUrl(content, 220);
        if (cancelled) return;
        setQr(url);
        setState('waiting');

        timer = window.setInterval(async () => {
          try {
            const res = await authApi.getBindTicket(ticket.ticketId);
            if (cancelled || doneRef.current) return;
            if (res.status === 'confirmed') {
              doneRef.current = true;
              window.clearInterval(timer);
              onSuccess();
            } else if (res.status === 'expired') {
              window.clearInterval(timer);
              setState('expired');
            }
          } catch {
            if (cancelled) return;
            window.clearInterval(timer);
            setState('expired');
          }
        }, 2000);
      } catch {
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [open, reloadKey, onSuccess]);

  return (
    <Modal open={open} title={tr('settings.bindModalTitle')} onClose={onClose}>
      <div className="flex flex-col items-center gap-4 py-2">
        {state === 'loading' && <Spinner text={tr('auth.qrGenerating')} />}
        {state === 'waiting' && qr && (
          <>
            <img src={qr} alt={tr('settings.bindQrAlt')} width={220} height={220} />
            <p className="text-center text-sm text-neutral-600">
              {tr('settings.bindHintA')}
              <br />
              {tr('settings.bindHintB')}
            </p>
          </>
        )}
        {(state === 'expired' || state === 'error') && (
          <>
            <p className="text-neutral-700">
              {state === 'expired' ? tr('settings.qrExpiredRegen') : tr('settings.qrFailedRetry')}
            </p>
            <Button
              onClick={() => {
                setState('loading');
                setReloadKey((k) => k + 1);
              }}
            >
              {tr('settings.regenerate')}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
