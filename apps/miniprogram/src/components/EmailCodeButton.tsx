import { useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';
import { View } from '@tarojs/components';
import { authApi, type EmailCodeScene } from '../lib/endpoints';
import { toastError, toastOk } from '../lib/api';
import { Btn } from './ui';

/** 邮箱验证码发送按钮（60 秒倒计时）；镜像 SmsCodeButton 的倒计时与 toast 口径，与 Web 端 EmailCodeButton 同逻辑。 */
export function EmailCodeButton({ email, scene }: { email: string; scene: EmailCodeScene }) {
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toastError(new Error(tr('auth.emailFirst')));
      return;
    }
    setSending(true);
    try {
      await authApi.sendEmailCode(email, scene);
      toastOk(tr('auth.emailCodeSent'));
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
        {seconds > 0 ? tr('auth.resendIn', { seconds }) : sending ? tr('auth.sending') : tr('auth.sendCode')}
      </Btn>
    </View>
  );
}
