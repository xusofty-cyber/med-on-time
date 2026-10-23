export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/plans/index',
    'pages/adherence/index',
    'pages/me/index',
    'pages/login/index',
    'pages/register/index',
    'pages/plan-edit/index',
    'pages/members/index',
    'pages/authorizations/index',
    'pages/notifications/index',
    'pages/settings/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#0B6B4F',
    navigationBarTitleText: '药准时',
    navigationBarTextStyle: 'white',
  },
  // 四个主 tab：今日提醒 / 计划 / 依从 / 我的（tab 图标待 UI 资源到位后补 iconPath）
  tabBar: {
    color: '#5B6660',
    selectedColor: '#0B6B4F',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      { pagePath: 'pages/index/index', text: '今日提醒' },
      { pagePath: 'pages/plans/index', text: '计划' },
      { pagePath: 'pages/adherence/index', text: '依从' },
      { pagePath: 'pages/me/index', text: '我的' },
    ],
  },
});
