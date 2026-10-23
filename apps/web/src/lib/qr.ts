import qrcode from './qrcode-generator.js';

/**
 * 文本 → 二维码 PNG data URL（扫码登录用）。
 * 生成库为内置的 qrcode-generator（MIT © Kazuhiko Arase，见 qrcode-generator.js 头部），
 * 不引入 npm 依赖；从小版本号起逐级试到能装下内容为止。
 */
export function qrToDataUrl(text: string, size = 220, marginModules = 2): string {
  let qr: ReturnType<typeof qrcode> | null = null;
  for (let typeNumber = 4; typeNumber <= 40; typeNumber++) {
    try {
      const candidate = qrcode(typeNumber, 'M');
      candidate.addData(text, 'Byte');
      candidate.make();
      qr = candidate;
      break;
    } catch {
      /* 容量不足，试更大的版本号 */
    }
  }
  if (!qr) throw new Error('二维码内容过长');
  const count = qr.getModuleCount();
  const total = count + marginModules * 2;
  const cell = Math.max(1, Math.floor(size / total));
  const canvasSize = cell * total;
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 不可用');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasSize, canvasSize);
  ctx.fillStyle = '#000000';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillRect((col + marginModules) * cell, (row + marginModules) * cell, cell, cell);
      }
    }
  }
  return canvas.toDataURL('image/png');
}
