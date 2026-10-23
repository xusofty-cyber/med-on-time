import { Module } from '@nestjs/common';
import { WechatOaService } from './wechat-oa.service';

@Module({
  providers: [WechatOaService],
  exports: [WechatOaService],
})
export class WechatOaModule {}
