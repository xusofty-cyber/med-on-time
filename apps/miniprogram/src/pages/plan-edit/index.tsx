import { useEffect, useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { planApi } from '../../lib/endpoints';
import { useApp } from '../../lib/store';
import { useSessionGuard } from '../../lib/hooks';
import type { Plan } from '../../lib/types';
import { EmptyState, Loading, PageShell } from '../../components/ui';
import { PlanForm } from '../../components/PlanForm';
import { useNavTitle, useT } from '../../lib/i18n';

/** 计划新建/编辑页：编辑时从成员计划列表按 planId 取全量对象（与 Web 端从列表传入同口径）。 */
export default function PlanEdit() {
  const t = useT();
  useNavTitle('nav.planEdit');
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
      <PageShell>
        <EmptyState text={t('plan.selectMemberFirst')} />
      </PageShell>
    );
  }
  if (!ready) {
    return (
      <PageShell>
        <Loading text={t('plan.loading')} />
      </PageShell>
    );
  }
  if (planId && !plan) {
    return (
      <PageShell>
        <EmptyState text={t('plan.notFound')} />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PlanForm
        memberId={memberId}
        plan={plan}
        onClose={() => Taro.navigateBack()}
        onSaved={() => Taro.navigateBack()}
      />
    </PageShell>
  );
}
