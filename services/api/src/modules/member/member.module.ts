import { Module } from '@nestjs/common';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { ReminderModule } from '../reminder/reminder.module';
import { MemberController } from './member.controller';
import { MemberService } from './member.service';

/**
 * 成员模块：关怀设置自 2026-10-23 集成收口起统一落 NotificationPrefsService
 * （system_config 键 member_care_settings:<memberId>，与 reminder 引擎读取侧
 * 同一实现同一形状）；原内存 CareSettingsStore 已移除——成员其余操作本就
 * 强依赖 DB，内存回退只会形成第二数据源，不保留。
 */
@Module({
  imports: [AuthModule, NotificationModule, ReminderModule],
  controllers: [MemberController],
  providers: [MemberService, MemberAccessGuard],
  exports: [MemberService],
})
export class MemberModule {}
