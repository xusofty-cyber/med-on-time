import { useEffect, useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { authApi } from '../../lib/endpoints';
import { toastError, toastOk } from '../../lib/api';
import { fmtDateTime } from '../../lib/time';
import { useSessionGuard } from '../../lib/hooks';
import { Card, Loading, PageShell } from '../../components/ui';

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
          setPreviewError('无法读取目标账号信息，为安全起见已禁用确认，请返回重新扫码。');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ticket, account]);

  const confirm = async () => {
    if (!ticket) {
      toastError(new Error('未找到有效的绑定票据，请重新扫码'));
      return;
    }
    setBusy(true);
    try {
      let code: string;
      try {
        const res = await Taro.login();
        if (!res.code) throw new Error('未获取到微信登录凭证');
        code = res.code;
      } catch {
        toastError(new Error('微信登录失败，请重试'));
        return;
      }

      await authApi.confirmBindTicket(ticket, code);
      setDone(true);
      toastOk('微信绑定成功');
      setTimeout(() => {
        Taro.navigateBack();
      }, 1500);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  if (!booted) return <Loading text='正在恢复会话…' />;
  if (!account) return <Loading text='正在前往登录…' />;

  return (
    <PageShell>
      <Card>
        <View className='col' style={{ gap: '16rpx' }}>
          <Text className='tx-h tx-strong'>绑定微信账号</Text>
          {done ? (
            <>
              <Text className='tx-md'>微信已成功绑定到网页账号，即将返回。</Text>
              <Button className='btn btn-primary btn-block' onClick={() => Taro.navigateBack()}>
                返回
              </Button>
            </>
          ) : ticket ? (
            <>
              <Text className='tx-md'>将当前微信绑定到下方网页账号，请仔细核对：</Text>
              {preview ? (
                <View className='col' style={{ gap: '8rpx' }}>
                  <Text className='tx-md tx-strong'>目标账号：{preview.targetNickname}</Text>
                  {preview.targetPhoneMasked ? (
                    <Text className='tx-sm'>手机号：{preview.targetPhoneMasked}</Text>
                  ) : null}
                  {preview.targetEmailMasked ? (
                    <Text className='tx-sm'>邮箱：{preview.targetEmailMasked}</Text>
                  ) : null}
                  <Text className='tx-sm'>发起时间：{fmtDateTime(preview.createdAt)}</Text>
                  <Text className='tx-sm'>有效期至：{fmtDateTime(preview.expiresAt)}</Text>
                </View>
              ) : previewError ? (
                <Text className='tx-sm tx-sub'>{previewError}</Text>
              ) : (
                <Text className='tx-sm tx-sub'>正在读取目标账号信息…</Text>
              )}
              <Text className='tx-sm tx-sub'>
                绑定后，您可以使用当前微信扫码登录药准时网页版，并接收用药提醒通知。若上方账号不是您本人的，请勿确认。
              </Text>
              <Button
                className='btn btn-primary btn-block'
                loading={busy}
                disabled={!preview}
                onClick={confirm}
              >
                确认绑定
              </Button>
              <Button
                className='btn btn-ghost btn-block'
                onClick={() => Taro.navigateBack()}
              >
                取消
              </Button>
            </>
          ) : (
            <>
              <Text className='tx-md'>未检测到绑定票据，请返回重新扫码。</Text>
              <Button className='btn btn-primary btn-block' onClick={() => Taro.navigateBack()}>
                返回
              </Button>
            </>
          )}
        </View>
      </Card>
      <Text className='tx-sm tx-sub'>
        安全提示：只有您本人在电脑上发起的微信绑定才应确认；他人发来的二维码请勿扫描或确认。
      </Text>
    </PageShell>
  );
}
