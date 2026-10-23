import { Component, PropsWithChildren, type ReactNode } from 'react';
import Taro, { useLaunch } from '@tarojs/taro';
import { Text, View } from '@tarojs/components';

import './app.scss';
import { setSessionExpiredHandler, tokenStore } from './lib/api';
import { actions, bootstrap, careModeOn, useApp } from './lib/store';
import { LOGIN_PAGE } from './lib/hooks';

/**
 * 小程序入口：
 * - 启动恢复会话（有 token 拉账号/成员，与 Web 端 App 守卫同逻辑）；
 * - 401 刷新失败时清会话回登录页；
 * - 根节点按当前成员关怀模式挂 .care-on 类（成员级 care-settings 驱动，
 *   对应 Web 端 html[data-care-mode]，样式规则见 app.scss）。
 * 微信登录（code2session）已开通：微信一键登录 / 绑定微信 / 手机号微信核验 /
 * 扫码登录网页版均走真实微信接口（后端 WECHAT_MINIAPP_APPID/SECRET 已配置）。
 * 全局 ErrorBoundary：任一页面渲染抛错时显示错误信息而非白屏，便于真机定位。
 */

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View className='pg'>
          <Text className='tx-title'>页面出错了</Text>
          <Text className='tx-md' style={{ lineHeight: 1.7 }}>
            {String(this.state.error.message ?? this.state.error)}
          </Text>
          <Text className='tx-sm tx-sub' style={{ lineHeight: 1.7 }}>
            请把这一屏截图发给开发者定位，并尝试返回上一页或重启小程序。
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}
function App({ children }: PropsWithChildren) {
  const careSettings = useApp((s) => s.careSettings);
  const careLocal = careSettings?.careMode;
  const careOn = careLocal ?? careModeOn();

  useLaunch(() => {
    setSessionExpiredHandler(() => {
      tokenStore.clear();
      actions.resetSession();
      Taro.reLaunch({ url: LOGIN_PAGE });
    });
    void bootstrap();
  });

  return (
    <View className={careOn ? 'care-on' : undefined}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </View>
  );
}

export default App;
