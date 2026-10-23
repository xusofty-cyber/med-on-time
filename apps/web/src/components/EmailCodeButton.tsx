import { useEffect, useRef, useState } from 'react';
import { authApi, type EmailCodeScene } from '../lib/endpoints';
import { actions } from '../lib/store';
import { Button } from './ui';

/** 邮箱验证码发送按钮（60 秒倒计时）；镜像 SmsCodeButton 的倒计时与 toast 口径。 */
export function EmailCodeButton({ email, scene }: { email: string; scene: EmailCodeScene }) {
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      actions.toast('error', '请先输入正确的邮箱地址');
      return;
    }
    setSending(true);
    try {
      await authApi.sendEmailCode(email, scene);
      actions.toast('success', '验证码已发送，请注意查收邮件');
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
