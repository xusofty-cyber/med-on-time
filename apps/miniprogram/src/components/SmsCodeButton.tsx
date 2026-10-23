import { useEffect, useRef, useState } from 'react';
import { View } from '@tarojs/components';
import { authApi } from '../lib/endpoints';
import { toastError, toastOk } from '../lib/api';
import { Btn } from './ui';

/** 短信验证码发送按钮（60 秒倒计时）；dev 期后端走 stub 通道。与 Web 端同逻辑。 */
export function SmsCodeButton({ phone, scene }: { phone: string; scene: 'register' | 'login' | 'reset' }) {
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  const send = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      toastError(new Error('请先输入正确的 11 位手机号'));
      return;
    }
    setSending(true);
    try {
      await authApi.sendSmsCode(phone, scene);
      toastOk('验证码已发送');
      setSeconds(60);
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s <= 1 && timer.current) clearInterval(timer.current);
          return Math.max(0, s - 1);
        });
      }, 1000);
    } catch (e) {
      toastError(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ flexShrink: 0 }}>
      <Btn variant='soft' disabled={seconds > 0 || sending} onClick={send}>
        {seconds > 0 ? `${seconds} 秒后重发` : sending ? '发送中…' : '发送验证码'}
      </Btn>
    </View>
  );
}
