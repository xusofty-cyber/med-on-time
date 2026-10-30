import { useEffect, useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { authApi } from '../../lib/endpoints';
import { toastError } from '../../lib/api';
import { fmtDateTime } from '../../lib/time';
import { consumePendingScanTicket, setPendingScanTicket, useSessionGuard } from '../../lib/hooks';
import { Card, Loading, PageShell } from '../../components/ui';
import { tr, useNavTitle, useT } from '../../lib/i18n';

/**
 * 扫码登录网页版（2026-10-23 裁定路线：小程序扫码确认）：
 * 方式一：网页二维码经小程序码/URL Link 直接打开本页（参数 t 为票据）；
 * 方式二：在本页点「扫一扫」读网页二维码，从其中的 t 参数取票据。
 * 确认即以当前小程序登录账号登录网页版，必须本人点确认，不自动放行。
 */
function extractTicket(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/[?&#]t=([0-9a-fA-F-]{36})/);
  if (m?.[1]) return m[1];
  // 直接就是票据本身（二维码内容简化形态）
  if (/^[0-9a-fA-F-]{36}$/.test(raw.trim())) return raw.trim();
  return null;
}

export default function ScanLogin() {
  const t = useT();
  useNavTitle('nav.scanLogin');
  const router = useRouter();
  const initialTicket = extractTicket(router.params.t);
  const { booted, account } = useSessionGuard();
  if (initialTicket && !account) {
    setPendingScanTicket(initialTicket);
  }
  const [ticket, setTicket] = useState<string | null>(initialTicket);
  useEffect(() => {
    if (account) consumePendingScanTicket();
    if (router.params.t?.startsWith('bind:')) {
      const bindTicket = router.params.t.slice(5).trim();
      Taro.redirectTo({ url: `/pages/bind-confirm/index?t=${encodeURIComponent(bindTicket)}` });
    }
  }, [account, router.params.t]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [scanError, setScanError] = useState('');
  // 发起端信息（审查 MP-H1）：确认前必须展示，加载失败禁用确认（fail-closed）
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof authApi.previewScanTicket>> | null>(null);
  const [previewError, setPreviewError] = useState('');
  useEffect(() => {
    if (!ticket || !account) return;
    let cancelled = false;
    setPreview(null);
    setPreviewError('');
    authApi
      .previewScanTicket(ticket)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewError(tr('scan.previewError'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ticket, account]);

  const scan = async () => {
    setScanError('');
    try {
      const res = await Taro.scanCode({ scanType: ['qrCode'] });
      const raw = res.result?.trim() || '';
      if (raw.startsWith('bind:')) {
        const bindTicket = raw.slice(5).trim();
        Taro.navigateTo({ url: `/pages/bind-confirm/index?t=${encodeURIComponent(bindTicket)}` });
        return;
      }
      const t = extractTicket(raw);
      if (t) setTicket(t);
      else setScanError(tr('scan.invalid'));
    } catch {
      /* 用户取消扫码不提示 */
    }
  };

  const confirm = async () => {
    if (!ticket) return;
    setBusy(true);
    try {
      await authApi.confirmScanTicket(ticket);
      setDone(true);
      Taro.showToast({ title: tr('scan.confirmedToast'), icon: 'success' });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  if (!booted) return <Loading text={tr('flow.restoring')} />;
  if (!account) return <Loading text={tr('flow.toLogin')} />;

  return (
    <PageShell>
      <Card>
        <View className='col' style={{ gap: '16rpx' }}>
          <Text className='tx-h tx-strong'>{t('scan.title')}</Text>
          {done ? (
            <>
              <Text className='tx-md'>{t('scan.done')}</Text>
              <Button className='btn btn-primary btn-block' onClick={() => Taro.navigateBack()}>
                {t('common.back')}
              </Button>
            </>
          ) : ticket ? (
            <>
              <Text className='tx-md'>
                {t('scan.intro', { name: account.nickname })}
              </Text>
              {preview ? (
                <View className='col' style={{ gap: '8rpx' }}>
                  <Text className='tx-sm'>{t('scan.platform', { p: preview.platform === 'web' ? t('scan.platformWeb') : preview.platform })}</Text>
                  <Text className='tx-sm'>{t('scan.device', { name: preview.deviceName ?? t('scan.unknownDevice') })}</Text>
                  <Text className='tx-sm'>{t('flow.createdAt', { t: fmtDateTime(preview.createdAt) })}</Text>
                  <Text className='tx-sm'>{t('flow.expiresAt', { t: fmtDateTime(preview.expiresAt) })}</Text>
                </View>
              ) : previewError ? (
                <Text className='tx-sm tx-sub'>{previewError}</Text>
              ) : (
                <Text className='tx-sm tx-sub'>{t('scan.loadingPreview')}</Text>
              )}
              <Button
                className='btn btn-primary btn-block'
                loading={busy}
                disabled={!preview}
                onClick={confirm}
              >
                {t('scan.confirm')}
              </Button>
              <Button
                className='btn btn-ghost btn-block'
                onClick={() => {
                  setTicket(null);
                  setScanError('');
                }}
              >
                {t('scan.rescan')}
              </Button>
            </>
          ) : (
            <>
              <Text className='tx-md'>{t('scan.hint')}</Text>
              <Button className='btn btn-primary btn-block' onClick={scan}>
                {t('scan.scanBtn')}
              </Button>
              {scanError ? <Text className='tx-sm tx-sub'>{scanError}</Text> : null}
            </>
          )}
        </View>
      </Card>
      <Text className='tx-sm tx-sub'>
        {t('scan.security')}
      </Text>
    </PageShell>
  );
}
