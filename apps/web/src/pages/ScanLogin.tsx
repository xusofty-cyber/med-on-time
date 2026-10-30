import { Card } from '../components/ui';
import { useT } from '../lib/i18n';
import { navigate } from '../lib/router';

/**
 * 扫码登录落地页：用户用微信「扫一扫」直接扫开网页二维码时会落到这里。
 * 真正的确认动作在小程序内完成（小程序「扫一扫」读票据 → 确认页点确认），
 * 本页只做说明引导，避免用户在手机浏览器里对着登录框发愣。
 */
export default function ScanLogin() {
  const tr = useT();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <h1 className="mb-2 text-center text-3xl font-bold text-medgreen">{tr('auth.brandTitle')}</h1>
      <p className="mb-8 text-center text-neutral-600">{tr('scan.subtitle')}</p>
      <Card>
        <div className="flex flex-col gap-4 text-base leading-relaxed">
          <p>{tr('scan.intro')}</p>
          <ol className="list-decimal pl-5">
            <li>{tr('scan.step1')}</li>
            <li>{tr('scan.step2')}</li>
            <li>{tr('scan.step3')}</li>
          </ol>
          <p className="text-neutral-600">
            {tr('scan.note')}
          </p>
          <button className="text-medgreen-dark underline" onClick={() => navigate('/login')}>
            {tr('scan.backLogin')}
          </button>
        </div>
      </Card>
    </main>
  );
}
