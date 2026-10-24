import { HttpStatus } from '@nestjs/common';
import { BusinessCode, BusinessException } from '../exceptions/business.exception';

/**
 * SSRF 防护校验：
 * 1. 协议白名单（http/https，生产环境强制 https）
 * 2. 拒绝环回地址（127.0.0.0/8, ::1, localhost）
 * 3. 拒绝云厂商元数据与链路本地地址（169.254.0.0/16, fe80::/10）
 * 4. 拒绝内网私有地址（10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7）
 * 5. 生产环境拒绝单段内网主机名（如 postgres, redis）
 */
export function assertSafeAiBaseUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BusinessException(
      BusinessCode.BadRequest,
      'AI provider baseUrl 格式无效',
      HttpStatus.BAD_REQUEST,
    );
  }

  const isProd = process.env.NODE_ENV === 'production';
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BusinessException(
      BusinessCode.BadRequest,
      'AI provider baseUrl 仅允许 http/https 协议',
      HttpStatus.BAD_REQUEST,
    );
  }

  if (isProd && parsed.protocol !== 'https:') {
    throw new BusinessException(
      BusinessCode.BadRequest,
      '生产环境 AI provider baseUrl 必须使用 https 协议',
      HttpStatus.BAD_REQUEST,
    );
  }

  const host = parsed.hostname.toLowerCase();

  // 环回地址与本地主机
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.startsWith('127.') ||
    host === '0.0.0.0'
  ) {
    throw new BusinessException(
      BusinessCode.BadRequest,
      'AI provider baseUrl 禁止指向本地环回地址',
      HttpStatus.BAD_REQUEST,
    );
  }

  // 链路本地与元数据地址（AWS/阿里云等云元数据 169.254.169.254）
  if (host.startsWith('169.254.') || host.startsWith('fe80:')) {
    throw new BusinessException(
      BusinessCode.BadRequest,
      'AI provider baseUrl 禁止指向链路本地/元数据地址',
      HttpStatus.BAD_REQUEST,
    );
  }

  // 私有网段
  if (
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('fc00:') ||
    host.startsWith('fd00:')
  ) {
    throw new BusinessException(
      BusinessCode.BadRequest,
      'AI provider baseUrl 禁止指向内网私有地址',
      HttpStatus.BAD_REQUEST,
    );
  }

  // 172.16.0.0/12
  const ipParts = host.split('.');
  if (ipParts.length === 4) {
    const p0 = Number(ipParts[0]);
    const p1 = Number(ipParts[1]);
    if (p0 === 172 && p1 >= 16 && p1 <= 31) {
      throw new BusinessException(
        BusinessCode.BadRequest,
        'AI provider baseUrl 禁止指向内网私有地址',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // 生产环境下禁止单段容器/内网主机名（如 postgres, redis）
  if (isProd && !host.includes('.')) {
    throw new BusinessException(
      BusinessCode.BadRequest,
      '生产环境 AI provider baseUrl 必须为完整公网域名',
      HttpStatus.BAD_REQUEST,
    );
  }
}
