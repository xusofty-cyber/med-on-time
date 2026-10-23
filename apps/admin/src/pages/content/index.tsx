import { PageContainer } from '@ant-design/pro-components';
import { Tabs } from 'antd';
import ArticlesTab from './ArticlesTab';
import ConsentsTab from './ConsentsTab';

/** 内容管理：文章多语言组 + 协议文档版本 */
export default function ContentPage() {
  return (
    <PageContainer title="内容管理" subTitle="文章内容组（多语言）与协议文档版本（consent versioning）">
      <Tabs
        defaultActiveKey="articles"
        items={[
          { key: 'articles', label: '文章内容组', children: <ArticlesTab /> },
          { key: 'consents', label: '协议文档版本', children: <ConsentsTab /> },
        ]}
      />
    </PageContainer>
  );
}
