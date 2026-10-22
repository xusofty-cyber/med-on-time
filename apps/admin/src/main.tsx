import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/** 主题色：医嘱绿 #0B6B4F（UI 设计规范 V1.0 定版） */
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#0B6B4F' } }}>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);
