import { PageContainer } from '@ant-design/pro-components';
import { Tabs } from 'antd';
import ArticlesTab from './ArticlesTab';
import ConsentsTab from './ConsentsTab';
import OaArticlesTab from './OaArticlesTab';
import { useT } from '../../i18n';

/** 内容管理：文章多语言组 + 协议文档版本 */
export default function ContentPage() {
  const t = useT();
  return (
    <PageContainer title={t('cnt.title')} subTitle={t('cnt.subTitle')}>
      <Tabs
        defaultActiveKey="articles"
        items={[
          { key: 'articles', label: t('cnt.tabArticles'), children: <ArticlesTab /> },
          { key: 'oa', label: t('cnt.tabOa'), children: <OaArticlesTab /> },
          { key: 'consents', label: t('cnt.tabConsents'), children: <ConsentsTab /> },
        ]}
      />
    </PageContainer>
  );
}
