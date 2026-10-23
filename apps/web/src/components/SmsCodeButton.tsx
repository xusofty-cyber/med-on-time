import { useEffect, useRef, useState } from 'react';
import { authApi } from '../lib/endpoints';
import { actions } from '../lib/store';
import { Button } from './ui';

/** 短信验证码发送按钮（60 秒倒计时）；dev 期后端走 stub 通道。 */
export function SmsCodeButton({ phone, scene }: { phone: string; scene: 'register' | 'login' | 'reset' }) {
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearInterval(timer.current);
    },
    [],
  );

  const send = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      actions.toast('error', '请先输入正确的 11 位手机号');
      return;
    }
    setSending(true);
    try {
      await authApi.sendSmsCode(phone, scene);
      actions.toast('success', '验证码已发送，请注意查收短信');
      setSeconds(60);
      timer.current = window.setInterval(() => {
        setSeconds((s) => {
          if (s <= 1 && timer.current) window.clearInterval(timer.current);
          return Math.max(0, s - 1);
        });
      }, 1000);
    } catch (e) {
      actions.toast('error', e instanceof Error ? e.message : '验证码发送失败');
    } finally {
      setSending(false);
    }
  };

  return (
    <Button variant="soft" onClick={send} disabled={seconds > 0 || sending} className="shrink-0 whitespace-nowrap">
      {seconds > 0 ? `${seconds} 秒后重发` : sending ? '发送中…' : '发送验证码'}
    </Button>
  );
}
