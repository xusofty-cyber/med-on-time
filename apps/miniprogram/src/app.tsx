import { Component, PropsWithChildren, type ReactNode } from 'react';
import Taro, { useLaunch } from '@tarojs/taro';
import { Text, View } from '@tarojs/components';

import './app.scss';
import { setSessionExpiredHandler, tokenStore } from './lib/api';
import { actions, bootstrap, careModeOn, useApp } from './lib/store';
import { HOME_TAB, LOGIN_PAGE } from './lib/hooks';
import { Btn } from './components/ui';
import { subscribeLocale, tr } from './lib/i18n';

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
          <Text className='tx-title'>{tr('app.errorTitle')}</Text>
          <Text className='tx-md' style={{ lineHeight: 1.7 }}>
            {String(this.state.error.message ?? this.state.error)}
          </Text>
          <Text className='tx-sm tx-sub' style={{ lineHeight: 1.7 }}>
            {tr('app.errorHint')}
          </Text>
          <View className='row' style={{ gap: '12rpx' }}>
            <View className='grow'>
              <Btn variant='soft' block onClick={() => this.setState({ error: null })}>
                {tr('app.retry')}
              </Btn>
            </View>
            <View className='grow'>
              <Btn
                block
                onClick={() => {
                  this.setState({ error: null });
                  Taro.switchTab({ url: HOME_TAB });
                }}
              >
                {tr('app.backHome')}
              </Btn>
            </View>
          </View>
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
  const themeId = useApp((s) => s.themeId);

  useLaunch(() => {
    syncTabBarLabels();
    subscribeLocale(syncTabBarLabels);
    setSessionExpiredHandler(() => {
      tokenStore.clear();
      actions.resetSession();
      Taro.reLaunch({ url: LOGIN_PAGE });
    });
    void bootstrap();
  });

  /* 根节点同时挂主题类与关怀类：.theme-a（主题 A 变量覆盖）与 .care-on（字号/触控放大）
   * 是两个独立维度，可叠加；.care-on 的规则在 app.scss 中后写，冲突时关怀值优先。 */
  const rootClass = ['app-root', themeId === 'a' ? 'theme-a' : '', careOn ? 'care-on' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <View className={rootClass}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </View>
  );
}

export default App;

/** tabBar 文案按当前语言同步（app.config.ts 仅为简体默认，语言切换后即时刷新）。 */
function syncTabBarLabels(): void {
  const items = [
    { index: 0, text: tr('nav.today') },
    { index: 1, text: tr('nav.planTab') },
    { index: 2, text: tr('nav.adherenceTab') },
    { index: 3, text: tr('nav.me') },
  ];
  items.forEach((item) => {
    Taro.setTabBarItem(item).catch(() => undefined);
  });
}
