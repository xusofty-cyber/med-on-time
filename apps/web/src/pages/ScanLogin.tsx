import { Card } from '../components/ui';
import { navigate } from '../lib/router';

/**
 * 扫码登录落地页：用户用微信「扫一扫」直接扫开网页二维码时会落到这里。
 * 真正的确认动作在小程序内完成（小程序「扫一扫」读票据 → 确认页点确认），
 * 本页只做说明引导，避免用户在手机浏览器里对着登录框发愣。
 */
export default function ScanLogin() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <h1 className="mb-2 text-center text-3xl font-bold text-medgreen">药准时 MedOnTime</h1>
      <p className="mb-8 text-center text-neutral-600">扫码登录确认</p>
      <Card>
        <div className="flex flex-col gap-4 text-base leading-relaxed">
          <p>您正在登录药准时网页版。请按下面步骤确认：</p>
          <ol className="list-decimal pl-5">
            <li>打开微信中的「药准时」小程序；</li>
            <li>在小程序里点「扫一扫」，扫描电脑网页上的二维码；</li>
            <li>在小程序确认页核对账号后点「确认登录」。</li>
          </ol>
          <p className="text-neutral-600">
            如果您是直接用微信扫一扫打开的本页，请回到电脑前，用小程序内的扫一扫重新扫描。
          </p>
          <button className="text-medgreen-dark underline" onClick={() => navigate('/login')}>
            返回登录页
          </button>
        </div>
      </Card>
    </main>
  );
}
