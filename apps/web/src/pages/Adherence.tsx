import { useEffect, useMemo, useState } from 'react';
import { adherenceApi } from '../lib/endpoints';
import { useApp } from '../lib/store';
import { Button, Card, EmptyState, ErrorText, Spinner } from '../components/ui';
import { monthOf, pct, shiftMonth, todayInTz } from '../lib/time';
import type { AdherenceCalendarDay, AdherenceSummary } from '../lib/types';

export default function Adherence() {
  const memberId = useApp((s) => s.currentMemberId);
  const members = useApp((s) => s.members);
  const member = members.find((m) => m.id === memberId) ?? null;
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [summary, setSummary] = useState<AdherenceSummary | null>(null);
  const [calendar, setCalendar] = useState<AdherenceCalendarDay[] | null>(null);
  const [month, setMonth] = useState(() => monthOf(todayInTz('Asia/Shanghai')));
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!memberId) return;
    setSummary(null);
    adherenceApi
      .summary(memberId, range)
      .then(setSummary)
      .catch(setError);
  }, [memberId, range]);

  useEffect(() => {
    if (!memberId) return;
    setCalendar(null);
    adherenceApi
      .calendar(memberId, month)
      .then(setCalendar)
      .catch(setError);
  }, [memberId, month]);

  const cells = useMemo(() => buildMonthCells(month, calendar ?? []), [month, calendar]);

  if (!memberId) {
    return (
      <Card>
        <EmptyState text="请先添加成员。" />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-medgreen-dark">{member?.displayName ?? ''} · 依从统计</h1>
      <ErrorText error={error} />
      <Card title="汇总">
        <div className="mb-4 flex gap-2">
          <Button variant={range === 'week' ? 'primary' : 'ghost'} onClick={() => setRange('week')}>
            本周
          </Button>
          <Button variant={range === 'month' ? 'primary' : 'ghost'} onClick={() => setRange('month')}>
            本月
          </Button>
        </div>
        {summary === null ? (
          <Spinner />
        ) : summary.scheduledCount === 0 ? (
          <EmptyState text="该时段暂无应服药记录。" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="应服" value={`${summary.scheduledCount} 次`} />
            <StatCard label="实服" value={`${summary.takenCount} 次`} />
            <StatCard label="按时率" value={pct(summary.onTimeRate ?? rate(summary.onTimeCount, summary.scheduledCount))} highlight />
            <StatCard label="服药率" value={pct(summary.adherenceRate ?? rate(summary.takenCount, summary.scheduledCount))} highlight />
            <StatCard label="按时服用" value={`${summary.onTimeCount} 次`} />
            <StatCard label="漏服" value={`${summary.missedCount} 次`} warn={summary.missedCount > 0} />
            <StatCard label="主动跳过" value={`${summary.skippedCount} 次`} />
          </div>
        )}
        <p className="mt-3 text-sm text-neutral-500">口径：补记计入实服但不计按时；PRN 按需服药不进按时率分母；漏服与跳过分开统计。</p>
      </Card>

      <Card title="月历热力">
        <div className="mb-4 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            ← 上月
          </Button>
          <span className="text-lg font-semibold">{month.replace('-', ' 年 ')} 月</span>
          <Button variant="ghost" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            下月 →
          </Button>
        </div>
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-sm text-neutral-500">
          {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
            <span key={d}>周{d}</span>
          ))}
        </div>
        {calendar === null ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, i) =>
              cell ? (
                <div
                  key={cell.date}
                  className={`flex min-h-[64px] flex-col rounded-lg p-1.5 ${heatClass(cell)}`}
                  title={`${cell.date}：应服 ${cell.scheduledCount}，实服 ${cell.takenCount}，按时 ${cell.onTimeCount}，漏服 ${cell.missedCount}`}
                >
                  <span className="text-sm font-medium">{Number(cell.date.slice(8))}</span>
                  {cell.scheduledCount > 0 && (
                    <span className="mt-auto text-xs">
                      {cell.takenCount}/{cell.scheduledCount} · {pct(cell.adherenceRate ?? rate(cell.takenCount, cell.scheduledCount))}
                    </span>
                  )}
                </div>
              ) : (
                <div key={`empty-${i}`} className="min-h-[64px] rounded-lg bg-neutral-50" />
              ),
            )}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-neutral-600">
          <Legend className="bg-[#0B6B4F] text-white" label="全部按时" />
          <Legend className="bg-[#7FB8A4]" label="服药率 ≥80%" />
          <Legend className="bg-amber-200" label="服药率 50%–80%" />
          <Legend className="bg-red-200" label="服药率 <50% 或有漏服" />
          <Legend className="bg-neutral-100" label="无安排" />
        </div>
      </Card>
    </div>
  );
}

function rate(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}

function StatCard({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-xl px-4 py-3 ${warn ? 'bg-red-50' : highlight ? 'bg-medgreen-light' : 'bg-neutral-50'}`}>
      <p className="text-sm text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${warn ? 'text-red-700' : 'text-medgreen-dark'}`}>{value}</p>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3.5 w-3.5 rounded ${className}`} />
      {label}
    </span>
  );
}

function heatClass(day: AdherenceCalendarDay): string {
  if (day.scheduledCount === 0) return 'bg-neutral-100 text-neutral-400';
  const r = day.adherenceRate ?? rate(day.takenCount, day.scheduledCount) ?? 0;
  if (day.missedCount === 0 && day.onTimeCount >= day.takenCount && r >= 1) return 'bg-[#0B6B4F] text-white';
  if (day.missedCount > 0 && r < 0.5) return 'bg-red-200 text-red-900';
  if (r >= 0.8) return 'bg-[#7FB8A4] text-[#07382a]';
  if (r >= 0.5) return 'bg-amber-200 text-amber-900';
  return 'bg-red-200 text-red-900';
}

function buildMonthCells(month: string, days: AdherenceCalendarDay[]): (AdherenceCalendarDay | null)[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const byDate = new Map(days.map((d) => [d.date.slice(0, 10), d]));
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // 周一为首列
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (AdherenceCalendarDay | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    cells.push(
      byDate.get(date) ?? { date, scheduledCount: 0, takenCount: 0, onTimeCount: 0, missedCount: 0, skippedCount: 0, adherenceRate: null },
    );
  }
  return cells;
}
