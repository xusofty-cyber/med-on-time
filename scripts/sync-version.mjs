#!/usr/bin/env node
/**
 * 版本号单一事实源同步（第三批对齐）：
 * 唯一事实源 = 根 package.json 的 version。发版时只改根版本号，再跑
 *   pnpm version:sync
 * 本脚本把同一版本号同步到：各 workspace 包 package.json、安卓 versionName、
 * iOS MARKETING_VERSION、API Swagger setVersion。
 * 不在本脚本范围（须人工处理）：
 * - 安卓 versionCode：每次发版手动 +1（商店单调递增计数，与语义版本不同维度）；
 * - iOS CURRENT_PROJECT_VERSION：构建号单调计数，同理人工递增；
 * - packages/api-client 已移除（空壳决策，见 SESSION_STATE 第三批记录）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`根版本号不合法：${version}`);
  process.exit(1);
}

const changed = [];
function sync(relPath, patterns) {
  const path = join(root, relPath);
  let text = readFileSync(path, 'utf8');
  const before = text;
  for (const [re, tail] of patterns) {
    text = text.replace(re, (m, p1) => `${p1}${version}${tail}`);
  }
  if (text !== before) {
    writeFileSync(path, text);
    changed.push(relPath);
  }
}

const pkgJsonVersion = [[/("version":\s*")[^"]*"/, '"']];
for (const rel of [
  'services/api/package.json',
  'apps/web/package.json',
  'apps/admin/package.json',
  'apps/desktop/package.json',
  'apps/miniprogram/package.json',
  'packages/shared/package.json',
]) {
  sync(rel, pkgJsonVersion);
}
sync('apps/android/app/build.gradle.kts', [[/(versionName = ")[^"]*"/, '"']]);
sync('apps/ios/project.yml', [[/(MARKETING_VERSION: ")[^"]*"/, '"']]);
sync('services/api/src/main.ts', [[/(setVersion\(')[^']*'/, "'"]]);

console.log(`版本同步完成：${version}（更新 ${changed.length} 个文件）`);
for (const f of changed) console.log(`  - ${f}`);
console.log('提醒：安卓 versionCode 与 iOS 构建号为单调计数，发版时人工递增。');
