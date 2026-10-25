import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AdminThemeProvider, applyThemeId, getStoredThemeId } from './theme';
import './theme.css';

dayjs.locale('zh-cn');

/* 启动时先应用已存主题（localStorage medontime-theme，默认主题 0），避免闪烁。 */
applyThemeId(getStoredThemeId());

/** 主题色由 AdminThemeProvider 按当前主题下发（见 apps/admin/src/theme.tsx）。 */
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AdminThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AdminThemeProvider>
  </React.StrictMode>,
);
