import { useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { authApi } from '../../lib/endpoints';
import { toastError } from '../../lib/api';
import { useSessionGuard } from '../../lib/hooks';
import { Card, Loading } from '../../components/ui';

/**
 * 扫码登录网页版（2026-10-23 裁定路线：小程序扫码确认）：
 * 方式一：网页二维码经小程序码/URL Link 直接打开本页（参数 t 为票据）；
 * 方式二：在本页点「扫一扫」读网页二维码，从其中的 t 参数取票据。
 * 确认即以当前小程序登录账号登录网页版，必须本人点确认，不自动放行。
 */
function extractTicket(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/[?&#]t=([0-9a-fA-F-]{36})/);
  if (m) return m[1];
  // 直接就是票据本身（二维码内容简化形态）
  if (/^[0-9a-fA-F-]{36}$/.test(raw.trim())) return raw.trim();
  return null;
}

export default function ScanLogin() {
  const { booted, account } = useSessionGuard();
  const router = useRouter();
  const [ticket, setTicket] = useState<string | null>(extractTicket(router.params.t));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [scanError, setScanError] = useState('');

  const scan = async () => {
    setScanError('');
    try {
      const res = await Taro.scanCode({ scanType: ['qrCode'] });
      const t = extractTicket(res.result);
      if (t) setTicket(t);
      else setScanError('这不是药准时网页版的登录二维码，请重新扫描。');
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
      Taro.showToast({ title: '已确认，请看网页版', icon: 'success' });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  if (!booted) return <Loading text='正在恢复会话…' />;
  if (!account) return <Loading text='正在前往登录…' />;

  return (
    <View className='pg'>
      <Card>
        <View className='col' style={{ gap: '16rpx' }}>
          <Text className='tx-lg tx-strong'>登录药准时网页版</Text>
          {done ? (
            <>
              <Text className='tx-md'>已确认登录，网页版将自动进入您的账号。</Text>
              <Button className='btn btn-primary btn-block' onClick={() => Taro.navigateBack()}>
                返回
              </Button>
            </>
          ) : ticket ? (
            <>
              <Text className='tx-md'>
                将以当前账号「{account.nickname}」登录网页版。请确认是您本人在电脑上操作。
              </Text>
              <Button className='btn btn-primary btn-block' loading={busy} onClick={confirm}>
                确认登录
              </Button>
              <Button
                className='btn btn-ghost btn-block'
                onClick={() => {
                  setTicket(null);
                  setScanError('');
                }}
              >
                换一张二维码
              </Button>
            </>
          ) : (
            <>
              <Text className='tx-md'>请扫描网页版登录页上的二维码。</Text>
              <Button className='btn btn-primary btn-block' onClick={scan}>
                扫一扫
              </Button>
              {scanError ? <Text className='tx-sm tx-sub'>{scanError}</Text> : null}
            </>
          )}
        </View>
      </Card>
      <Text className='tx-sm tx-sub'>
        安全提示：只有您本人在电脑上打开的网页版才应确认；他人发来的二维码不要扫。
      </Text>
    </View>
  );
}
