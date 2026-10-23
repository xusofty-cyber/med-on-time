import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';
import { DrugModule } from '../drug/drug.module';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [DrugModule],
  controllers: [StockController],
  providers: [StockService, JwtAuthGuard, MemberAccessGuard],
  exports: [StockService],
})
export class StockModule {}
