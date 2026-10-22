import { PropsWithChildren } from 'react';
import { useLaunch } from '@tarojs/taro';

import './app.scss';

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // 小程序启动：后续接入 code2session 登录与订阅消息授权检查（架构 §3.1 auth）
  });

  return children;
}

export default App;
