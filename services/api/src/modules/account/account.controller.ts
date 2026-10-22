import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccountService } from './account.service';

@ApiTags('account')
@Controller('accounts')
export class AccountController {
  constructor(private readonly service: AccountService) {}
}
