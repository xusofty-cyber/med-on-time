import { PropsWithChildren } from 'react';
import Taro, { useLaunch } from '@tarojs/taro';
import { View } from '@tarojs/components';

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
 * 微信登录（code2session）尚未开通：账号体系为手机号 + 密码/短信验证码，
 * /auth/bind/wechat 为占位接口（见设置页）。
 */
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

  return <View className={careOn ? 'care-on' : undefined}>{children}</View>;
}

export default App;
