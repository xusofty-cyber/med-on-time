import { useEffect, useMemo, useState } from 'react';
import { adherenceApi } from '../lib/endpoints';
import { useApp } from '../lib/store';
import { Button, Card, EmptyState, ErrorText, Spinner } from '../components/ui';
import { monthOf, pct, shiftMonth, todayInTz } from '../lib/time';
import { weekdayLabels } from '../lib/dict';
import { useT } from '../lib/i18n';
import type { AdherenceCalendarDay, AdherenceSummary } from '../lib/types';

export default function Adherence() {
  const tr = useT();
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
        <EmptyState text={tr('ehr.noMember')} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-medgreen-dark">{tr('adh.heading', { name: member?.displayName ?? '' })}</h1>
      <ErrorText error={error} />
      <Card title={tr('adh.summaryCard')}>
        <div className="mb-4 flex gap-2">
          <Button variant={range === 'week' ? 'primary' : 'ghost'} onClick={() => setRange('week')}>
            {tr('adh.week')}
          </Button>
          <Button variant={range === 'month' ? 'primary' : 'ghost'} onClick={() => setRange('month')}>
            {tr('adh.month')}
          </Button>
        </div>
        {summary === null ? (
          <Spinner />
        ) : summary.scheduledCount === 0 ? (
          <EmptyState text={tr('adh.empty')} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={tr('adh.statScheduled')} value={tr('adh.times', { n: summary.scheduledCount })} />
            <StatCard label={tr('adh.statTaken')} value={tr('adh.times', { n: summary.takenCount })} />
            <StatCard label={tr('adh.statOnTimeRate')} value={pct(summary.onTimeRate ?? rate(summary.onTimeCount, summary.scheduledCount))} highlight />
            <StatCard label={tr('adh.statAdherenceRate')} value={pct(summary.adherenceRate ?? rate(summary.takenCount, summary.scheduledCount))} highlight />
            <StatCard label={tr('adh.statOnTime')} value={tr('adh.times', { n: summary.onTimeCount })} />
            <StatCard label={tr('adh.statMissed')} value={tr('adh.times', { n: summary.missedCount })} warn={summary.missedCount > 0} />
            <StatCard label={tr('adh.statSkipped')} value={tr('adh.times', { n: summary.skippedCount })} />
          </div>
        )}
        <p className="mt-3 text-sm text-neutral-500">{tr('adh.note')}</p>
      </Card>

      <Card title={tr('adh.calendarCard')}>
        <div className="mb-4 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            {tr('adh.prevMonth')}
          </Button>
          <span className="text-lg font-semibold">{tr('adh.monthTitle', { y: month.slice(0, 4), m: Number(month.slice(5, 7)) })}</span>
          <Button variant="ghost" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            {tr('adh.nextMonth')}
          </Button>
        </div>
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-sm text-neutral-500">
          {weekdayLabels().map((d) => (
            <span key={d}>{tr('planForm.weekdayBtn', { label: d })}</span>
          ))}
        </div>
        {calendar === null ? (
          <Spinner />
        ) : (
          <div className="heat-grid grid grid-cols-7 gap-1">
            {cells.map((cell, i) =>
              cell ? (
                <div
                  key={cell.date}
                  className={`flex min-h-[64px] flex-col rounded-lg p-1.5 ${heatClass(cell)}`}
                  title={tr('adh.cellTitle', { date: cell.date, s: cell.scheduledCount, t: cell.takenCount, o: cell.onTimeCount, m: cell.missedCount })}
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
          <Legend className="bg-[var(--chart-heat-full)] text-white" label={tr('adh.legendFull')} />
          <Legend className="bg-[var(--chart-heat-good)]" label={tr('adh.legendGood')} />
          <Legend className="bg-amber-200" label={tr('adh.legendMid')} />
          <Legend className="bg-red-200" label={tr('adh.legendBad')} />
          <Legend className="bg-neutral-100" label={tr('adh.legendNone')} />
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
      <p className={`stat-value mt-1 text-2xl font-bold ${warn ? 'text-red-700' : 'text-medgreen-dark'}`}>{value}</p>
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
  if (day.missedCount === 0 && day.onTimeCount >= day.takenCount && r >= 1) return 'bg-[var(--chart-heat-full)] text-white';
  if (day.missedCount > 0 && r < 0.5) return 'bg-red-200 text-red-900';
  if (r >= 0.8) return 'bg-[var(--chart-heat-good)] text-[var(--color-text-primary)]';
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
