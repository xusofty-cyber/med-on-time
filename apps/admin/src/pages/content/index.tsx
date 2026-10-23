import { PageContainer } from '@ant-design/pro-components';
import { Tabs } from 'antd';
import ArticlesTab from './ArticlesTab';
import ConsentsTab from './ConsentsTab';
import OaArticlesTab from './OaArticlesTab';

/** 内容管理：文章多语言组 + 协议文档版本 */
export default function ContentPage() {
  return (
    <PageContainer title="内容管理" subTitle="文章内容组（多语言）与协议文档版本（consent versioning）">
      <Tabs
        defaultActiveKey="articles"
        items={[
          { key: 'articles', label: '文章内容组', children: <ArticlesTab /> },
          { key: 'oa', label: '公众号文章', children: <OaArticlesTab /> },
          { key: 'consents', label: '协议文档版本', children: <ConsentsTab /> },
        ]}
      />
    </PageContainer>
  );
}
