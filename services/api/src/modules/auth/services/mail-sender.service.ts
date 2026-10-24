import { Injectable, Logger} from '@nestjs/common';
import { ConfigService} from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter} from 'nodemailer';
import { PhoneCryptoService} from './phone-crypto.service';
import type { CodeScene} from './verification-code.service';

/**
* 邮件发送通道抽象（V1.3 注册验证通道：邮箱验证码先行）。
* 配置经环境变量注入（配置隔离红线：统一经 ConfigService 读取）：
* - SMTP_URL：完整连接串（如 smtp://user:pass@host:587），优先；
* - 或 SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS 组合；
* - SMTP_FROM：发件人（缺省 MedOnTime 药准时 <no-reply@medontime.app>）。
* 未配置 SMTP 时回退 DevStubMailSender（掩码日志 + 启动警告），与短信 stub 同口径。
*/
export abstract class MailSender {
abstract sendVerificationCode(email: string, code: string, scene: CodeScene): Promise<void>;
}

const SCENE_LABEL: Record<CodeScene, string> = {
register: '注册',
login: '登录',
reset_password: '重置密码',
bind: '绑定邮箱',
reset: '重置密码',
};

@Injectable()
export class DevStubMailSender extends MailSender {
private readonly logger = new Logger(DevStubMailSender.name);

constructor() {
super();
this.logger.warn(
'SMTP 未配置（SMTP_URL / SMTP_HOST 均为空），邮箱验证码走 dev stub：不真实发送，仅打掩码日志（生产环境禁止）',
);
}

async sendVerificationCode(email: string, code: string, scene: CodeScene): Promise<void> {
// dev stub：仅打掩码日志（红线 4：日志脱敏，验证码不落日志明文）。
this.logger.log(
`[MAIL stub] scene=${scene} email=${PhoneCryptoService.maskEmail(email)} code=******（未真实发送）`,
);
void code;
}
}

@Injectable()
export class SmtpMailSender extends MailSender {
private readonly logger = new Logger(SmtpMailSender.name);
private readonly transporter: Transporter;
private readonly from: string;

constructor(config: ConfigService) {
super();
const url = config.get<string>('SMTP_URL');
if (url) {
this.transporter = nodemailer.createTransport(url);
} else {
const port = parseInt(config.get<string>('SMTP_PORT')?? '587', 10);
const user = config.get<string>('SMTP_USER');
const pass = config.get<string>('SMTP_PASS');
this.transporter = nodemailer.createTransport({
host: config.get<string>('SMTP_HOST'),
port,
secure: port === 465,
auth: user? { user, pass}: undefined,
});
}
this.from =
config.get<string>('SMTP_FROM')?? 'MedOnTime 药准时 <no-reply@medontime.app>';
}

async sendVerificationCode(email: string, code: string, scene: CodeScene): Promise<void> {
const label = SCENE_LABEL[scene]?? '验证';
await this.transporter.sendMail({
from: this.from,
to: email,
subject: `${label}验证码`,
text: `您的${label}验证码是 ${code}，5 分钟内有效。请勿泄露给他人；如非本人操作请忽略本邮件。`,
});
this.logger.log(
`[MAIL] scene=${scene} email=${PhoneCryptoService.maskEmail(email)} 已发送`,
);
}
}

/** 模块装配用：SMTP 是否已配置（决定 MailSender 绑定到真实实现还是 dev stub）。 */
export function isSmtpConfigured(config: ConfigService): boolean {
return Boolean(config.get<string>('SMTP_URL') || config.get<string>('SMTP_HOST'));
}
