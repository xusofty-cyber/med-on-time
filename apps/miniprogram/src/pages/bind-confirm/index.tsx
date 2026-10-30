import { useEffect, useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { authApi } from '../../lib/endpoints';
import { toastError, toastOk } from '../../lib/api';
import { fmtDateTime } from '../../lib/time';
import { useSessionGuard } from '../../lib/hooks';
import { Card, Loading, PageShell } from '../../components/ui';
import { tr, useNavTitle, useT } from '../../lib/i18n';

function extractTicket(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (cleaned.startsWith('bind:')) {
    return cleaned.slice(5).trim();
  }
  const m = cleaned.match(/[?&#]t=([^&]+)/);
  if (m?.[1]) {
    const v = decodeURIComponent(m[1]).trim();
    return v.startsWith('bind:') ? v.slice(5).trim() : v;
  }
  return cleaned;
}

export default function BindConfirm() {
  const t = useT();
  useNavTitle('nav.bindConfirm');
  const router = useRouter();
  const ticket = extractTicket(router.params.t);
  const { booted, account } = useSessionGuard();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // 目标账号信息（审查 MP-H2）：确认前必须核对，加载失败禁用确认（fail-closed）
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof authApi.previewBindTicket>> | null>(null);
  const [previewError, setPreviewError] = useState('');
  useEffect(() => {
    if (!ticket || !account) return;
    let cancelled = false;
    authApi
      .previewBindTicket(ticket)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewError(tr('bind.previewError'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ticket, account]);

  const confirm = async () => {
    if (!ticket) {
      toastError(new Error(tr('bind.noTicket')));
      return;
    }
    setBusy(true);
    try {
      let code: string;
      try {
        const res = await Taro.login();
        if (!res.code) throw new Error(tr('auth.wxNoCode'));
        code = res.code;
      } catch {
        toastError(new Error(tr('bind.wxFail')));
        return;
      }

      await authApi.confirmBindTicket(ticket, code);
      setDone(true);
      toastOk(tr('bind.ok'));
      setTimeout(() => {
        Taro.navigateBack();
      }, 1500);
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
          <Text className='tx-h tx-strong'>{t('bind.title')}</Text>
          {done ? (
            <>
              <Text className='tx-md'>{t('bind.done')}</Text>
              <Button className='btn btn-primary btn-block' onClick={() => Taro.navigateBack()}>
                {t('common.back')}
              </Button>
            </>
          ) : ticket ? (
            <>
              <Text className='tx-md'>{t('bind.intro')}</Text>
              {preview ? (
                <View className='col' style={{ gap: '8rpx' }}>
                  <Text className='tx-md tx-strong'>{t('bind.target', { name: preview.targetNickname })}</Text>
                  {preview.targetPhoneMasked ? (
                    <Text className='tx-sm'>{t('bind.phone', { p: preview.targetPhoneMasked })}</Text>
                  ) : null}
                  {preview.targetEmailMasked ? (
                    <Text className='tx-sm'>{t('bind.email', { e: preview.targetEmailMasked })}</Text>
                  ) : null}
                  <Text className='tx-sm'>{t('flow.createdAt', { t: fmtDateTime(preview.createdAt) })}</Text>
                  <Text className='tx-sm'>{t('flow.expiresAt', { t: fmtDateTime(preview.expiresAt) })}</Text>
                </View>
              ) : previewError ? (
                <Text className='tx-sm tx-sub'>{previewError}</Text>
              ) : (
                <Text className='tx-sm tx-sub'>{t('bind.loadingPreview')}</Text>
              )}
              <Text className='tx-sm tx-sub'>
                {t('bind.note')}
              </Text>
              <Button
                className='btn btn-primary btn-block'
                loading={busy}
                disabled={!preview}
                onClick={confirm}
              >
                {t('bind.confirm')}
              </Button>
              <Button
                className='btn btn-ghost btn-block'
                onClick={() => Taro.navigateBack()}
              >
                {t('common.cancel')}
              </Button>
            </>
          ) : (
            <>
              <Text className='tx-md'>{t('bind.noTicketPage')}</Text>
              <Button className='btn btn-primary btn-block' onClick={() => Taro.navigateBack()}>
                {t('common.back')}
              </Button>
            </>
          )}
        </View>
      </Card>
      <Text className='tx-sm tx-sub'>
        {t('bind.security')}
      </Text>
    </PageShell>
  );
}
