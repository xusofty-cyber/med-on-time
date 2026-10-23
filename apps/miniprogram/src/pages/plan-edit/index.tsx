import { useEffect, useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { View } from '@tarojs/components';
import { planApi } from '../../lib/endpoints';
import { useApp } from '../../lib/store';
import { useSessionGuard } from '../../lib/hooks';
import type { Plan } from '../../lib/types';
import { EmptyState, Loading } from '../../components/ui';
import { PlanForm } from '../../components/PlanForm';

/** 计划新建/编辑页：编辑时从成员计划列表按 planId 取全量对象（与 Web 端从列表传入同口径）。 */
export default function PlanEdit() {
  useSessionGuard();
  const router = useRouter();
  const planId = router.params.planId;
  const memberId = useApp((s) => s.currentMemberId);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [ready, setReady] = useState(!planId);

  useEffect(() => {
    if (!planId || !memberId) {
      setReady(true);
      return;
    }
    let alive = true;
    planApi
      .list(memberId)
      .then((list) => {
        if (!alive) return;
        setPlan(list.find((p) => p.id === planId) ?? null);
        setReady(true);
      })
      .catch(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [planId, memberId]);

  if (!memberId) {
    return (
      <View className='pg'>
        <EmptyState text='请先选择成员。' />
      </View>
    );
  }
  if (!ready) {
    return (
      <View className='pg'>
        <Loading text='正在加载计划…' />
      </View>
    );
  }
  if (planId && !plan) {
    return (
      <View className='pg'>
        <EmptyState text='未找到该计划（可能已被删除，或不属于当前成员）。' />
      </View>
    );
  }

  return (
    <View className='pg'>
      <PlanForm
        memberId={memberId}
        plan={plan}
        onClose={() => Taro.navigateBack()}
        onSaved={() => Taro.navigateBack()}
      />
    </View>
  );
}
