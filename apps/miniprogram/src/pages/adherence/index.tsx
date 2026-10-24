import { useEffect, useMemo, useState } from 'react';
import { Text, View } from '@tarojs/components';
import { adherenceApi } from '../../lib/endpoints';
import { useApp } from '../../lib/store';
import { useSessionGuard } from '../../lib/hooks';
import { monthOf, pct, shiftMonth, todayInTz } from '../../lib/time';
import type { AdherenceCalendarDay, AdherenceSummary } from '../../lib/types';
import { Btn, Card, EmptyState, ErrorLine, Loading, PageShell, SegTabs, StatCard } from '../../components/ui';
import { MemberBar } from '../../components/MemberBar';

function rate(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

function buildMonthCells(month: string, days: AdherenceCalendarDay[]): (AdherenceCalendarDay | null)[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // 周一为首列
  const daysInMonth = new Date(y, m, 0).getDate();
  const byDate = new Map(days.map((d) => [d.date, d]));
  const cells: (AdherenceCalendarDay | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    cells.push(
      byDate.get(date) ?? {
        date,
        scheduledCount: 0,
        takenCount: 0,
        onTimeCount: 0,
        missedCount: 0,
        skippedCount: 0,
        adherenceRate: null,
      },
    );
  }
  return cells;
}

function heatClass(cell: AdherenceCalendarDay): string {
  if (cell.scheduledCount === 0) return 'cal-heat-none';
  const r = cell.adherenceRate ?? rate(cell.takenCount, cell.scheduledCount) ?? 0;
  if (cell.takenCount === cell.scheduledCount && cell.onTimeCount === cell.scheduledCount) return 'cal-heat-full';
  if (r >= 0.8 && cell.missedCount === 0) return 'cal-heat-good';
  if (r >= 0.5 && cell.missedCount === 0) return 'cal-heat-mid';
  return 'cal-heat-bad';
}

/** 依从统计（tab）：周/月汇总 + 月历热力。与 Web 端 Adherence 同口径。 */
export default function Adherence() {
  useSessionGuard();
  const memberId = useApp((s) => s.currentMemberId);
  const members = useApp((s) => s.members);
  const member = members.find((m) => m.id === memberId) ?? null;
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [summary, setSummary] = useState<AdherenceSummary | null>(null);
  const [calendar, setCalendar] = useState<AdherenceCalendarDay[] | null>(null);
  const [month, setMonth] = useState(() => monthOf(todayInTz(member?.timezone ?? 'Asia/Shanghai')));
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!memberId) return;
    let alive = true;
    setSummary(null);
    adherenceApi
      .summary(memberId, range)
      .then((res) => {
        if (alive) {
          setSummary(res);
          setError(null);
        }
      })
      .catch((e) => {
        if (alive) setError(e);
      });
    return () => {
      alive = false;
    };
  }, [memberId, range]);

  useEffect(() => {
    if (!memberId) return;
    let alive = true;
    setCalendar(null);
    adherenceApi
      .calendar(memberId, month)
      .then((res) => {
        if (alive) {
          setCalendar(res);
          setError(null);
        }
      })
      .catch((e) => {
        if (alive) setError(e);
      });
    return () => {
      alive = false;
    };
  }, [memberId, month]);

  const cells = useMemo(() => buildMonthCells(month, calendar ?? []), [month, calendar]);
  const weeks = useMemo(() => {
    const rows: (AdherenceCalendarDay | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cells]);

  if (!memberId) {
    return (
      <PageShell>
        <MemberBar />
        <Card>
          <EmptyState text='请先添加成员。' />
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <MemberBar />
      <Text className='tx-title'>{member?.displayName ?? ''} · 依从统计</Text>
      <ErrorLine error={error} />
      <Card title='汇总'>
        <SegTabs
          options={[
            { value: 'week', label: '本周' },
            { value: 'month', label: '本月' },
          ]}
          value={range}
          onChange={(v) => setRange(v as 'week' | 'month')}
        />
        <View style={{ marginTop: '20rpx' }}>
          {summary === null ? (
            <Loading />
          ) : summary.scheduledCount === 0 ? (
            <EmptyState text='该时段暂无应服药记录。' />
          ) : (
            <View className='col' style={{ gap: '12rpx' }}>
              <View className='row' style={{ gap: '12rpx' }}>
                <View className='grow'>
                  <StatCard label='应服' value={`${summary.scheduledCount} 次`} />
                </View>
                <View className='grow'>
                  <StatCard label='实服' value={`${summary.takenCount} 次`} />
                </View>
              </View>
              <View className='row' style={{ gap: '12rpx' }}>
                <View className='grow'>
                  <StatCard
                    label='按时率'
                    value={pct(summary.onTimeRate ?? rate(summary.onTimeCount, summary.scheduledCount))}
                    highlight
                  />
                </View>
                <View className='grow'>
                  <StatCard
                    label='服药率'
                    value={pct(summary.adherenceRate ?? rate(summary.takenCount, summary.scheduledCount))}
                    highlight
                  />
                </View>
              </View>
              <View className='row' style={{ gap: '12rpx' }}>
                <View className='grow'>
                  <StatCard label='按时服用' value={`${summary.onTimeCount} 次`} />
                </View>
                <View className='grow'>
                  <StatCard label='漏服' value={`${summary.missedCount} 次`} warn={summary.missedCount > 0} />
                </View>
                <View className='grow'>
                  <StatCard label='主动跳过' value={`${summary.skippedCount} 次`} />
                </View>
              </View>
            </View>
          )}
        </View>
        <Text className='tx-sm tx-sub' style={{ display: 'block', marginTop: '16rpx' }}>
          口径：补记计入实服但不计按时；PRN 按需服药不进按时率分母；漏服与跳过分开统计。
        </Text>
      </Card>

      <Card title='月历'>
        <View className='row-between' style={{ marginBottom: '16rpx' }}>
          <Btn variant='ghost' onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            ← 上月
          </Btn>
          <Text className='tx-h'>{month.replace('-', ' 年 ')} 月</Text>
          <Btn variant='ghost' onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            下月 →
          </Btn>
        </View>
        <View className='row' style={{ gap: '6rpx', marginBottom: '6rpx' }}>
          {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
            <View key={d} className='grow' style={{ textAlign: 'center' }}>
              <Text className='tx-sm tx-sub'>周{d}</Text>
            </View>
          ))}
        </View>
        {calendar === null ? (
          <Loading />
        ) : (
          <View className='col' style={{ gap: '6rpx' }}>
            {weeks.map((week, wi) => (
              <View key={wi} className='row' style={{ gap: '6rpx' }}>
                {week.map((cell, ci) =>
                  cell ? (
                    <View key={cell.date} className={`cal-cell grow ${heatClass(cell)}`}>
                      <Text className='tx-sm tx-strong'>{Number(cell.date.slice(8))}</Text>
                      {cell.scheduledCount > 0 && (
                        <Text className='tx-xs' style={{ marginTop: 'auto' }}>
                          {cell.takenCount}/{cell.scheduledCount} ·{' '}
                          {pct(cell.adherenceRate ?? rate(cell.takenCount, cell.scheduledCount))}
                        </Text>
                      )}
                    </View>
                  ) : (
                    <View key={`empty-${ci}`} className='cal-cell grow' style={{ background: '#FAFBFA' }} />
                  ),
                )}
                {week.length < 7 &&
                  Array.from({ length: 7 - week.length }).map((_, i) => (
                    <View key={`pad-${i}`} className='cal-cell grow' style={{ background: 'transparent' }} />
                  ))}
              </View>
            ))}
          </View>
        )}
        <View className='row-wrap' style={{ marginTop: '18rpx' }}>
          <Legend cls='cal-heat-full' label='全部按时' />
          <Legend cls='cal-heat-good' label='服药率 ≥80%' />
          <Legend cls='cal-heat-mid' label='服药率 50%–80%' />
          <Legend cls='cal-heat-bad' label='服药率 <50% 或有漏服' />
          <Legend cls='cal-heat-none' label='无安排' />
        </View>
      </Card>
    </PageShell>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <View className='row' style={{ gap: '8rpx' }}>
      <View className={cls} style={{ width: '28rpx', height: '28rpx', borderRadius: '8rpx' }} />
      <Text className='tx-sm tx-sub'>{label}</Text>
    </View>
  );
}
