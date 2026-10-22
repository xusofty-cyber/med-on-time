import { Text, View } from '@tarojs/components';

/** 小程序首页脚手架占位：今日用药列表按用户端需求 V1.8 迭代接入。 */
export default function Index() {
  return (
    <View style={{ padding: '32rpx' }}>
      <Text style={{ fontSize: '44rpx', fontWeight: 600, color: '#0B6B4F' }}>
        药准时 MedOnTime
      </Text>
      <View style={{ marginTop: '24rpx' }}>
        <Text style={{ fontSize: '30rpx', lineHeight: 1.6 }}>
          今日用药将在此呈现（脚手架占位）。登录后按提醒实例逐条打卡，
          照护家人可在授权范围内协助确认。
        </Text>
      </View>
    </View>
  );
}
