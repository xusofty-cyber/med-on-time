import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MemberService } from './member.service';

@ApiTags('member')
@Controller('members')
export class MemberController {
  constructor(private readonly service: MemberService) {}
}
