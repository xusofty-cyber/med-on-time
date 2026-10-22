import { randomBytes } from 'crypto';

/**
 * UUIDv7 生成（RFC 9562）：48 位毫秒时间戳 + version/variant + 随机位。
 * DB 设计 V1.2 §2.2 约定全库主键为应用层生成的 UUIDv7（时间有序，利于索引局部性），
 * 禁止自增整数外泄为业务编号。
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  // 48-bit unix_ts_ms
  bytes[0] = (now / 2 ** 40) & 0xff;
  bytes[1] = (now / 2 ** 32) & 0xff;
  bytes[2] = (now / 2 ** 24) & 0xff;
  bytes[3] = (now / 2 ** 16) & 0xff;
  bytes[4] = (now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;
  // version 7
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x70;
  // variant 10xx
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
