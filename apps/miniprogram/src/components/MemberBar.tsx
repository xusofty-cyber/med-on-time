/** 成员切换条：横向 chips（当前成员高亮）+ 管理入口。各 tab 页顶部共用。 */
import Taro from '@tarojs/taro';
import { ScrollView, Text, View } from '@tarojs/components';
import { actions, useApp } from '../lib/store';
import { relationshipLabels } from '../lib/dict';
import { tr, useT } from '../lib/i18n';

export function MemberBar() {
  const t = useT();
  const members = useApp((s) => s.members);
  const currentMemberId = useApp((s) => s.currentMemberId);
  if (members.length === 0) return null;
  return (
    <ScrollView scrollX style={{ whiteSpace: 'nowrap' }}>
      <View className='row' style={{ gap: '12rpx', padding: '2rpx' }}>
        {members.map((m) => (
          <View
            key={m.id}
            className={`chip${m.id === currentMemberId ? ' chip-on' : ''}`}
            onClick={() => actions.setCurrentMember(m.id)}
          >
            <Text>
              {t('app.memberOption', {
                name: m.displayName,
                inner: `${relationshipLabels()[m.relationship] ?? m.relationship}${m.accessLevel && m.accessLevel !== 'owner' ? ` · ${m.accessLevel}` : ''}`,
              })}
            </Text>
          </View>
        ))}
        <View className='chip' onClick={() => Taro.navigateTo({ url: '/pages/members/index' })}>
          <Text className='tx-green'>{t('app.manageMembers')}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
