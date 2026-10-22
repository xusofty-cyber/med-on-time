/**
 * Web 用户门户脚手架首页（响应式双形态：PC + 移动，P0 同步验收口径）。
 * 正式页面按用户端需求 V1.8 与 UI 规范 V1.0 迭代：今日用药、计划管理、
 * 家庭照护、健康档案、AI 健康助手。数据经 @med-on-time/api-client 调用。
 */
export default function App() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-medgreen">药准时 MedOnTime</h1>
        <p className="mt-2 text-base text-neutral-600">
          按时吃药，家人放心。今日用药将在此呈现（脚手架占位）。
        </p>
      </header>
      <section className="rounded-2xl bg-medgreen-light p-6">
        <h2 className="text-xl font-semibold text-medgreen-dark">今日用药</h2>
        <p className="mt-3 text-base leading-relaxed">
          登录并为成员建立用药计划后，这里会按提醒实例逐条列出待服药品，
          具体提醒将展示药名、剂量与存放位置（需求 V1.8 定版口径）。
        </p>
      </section>
    </main>
  );
}
