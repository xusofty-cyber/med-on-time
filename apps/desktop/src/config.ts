/**
 * 内容加载目标解析（配置隔离：只从环境变量 / 打包资源读，不在深层硬编码）。
 *
 * 优先级：
 * 1. DESKTOP_WEB_URL —— 部署形态：指向服务器上的 Web 用户端地址（https）。
 * 2. WEB_DEV_URL    —— 开发形态：apps/web 的 Vite dev server（保留脚手架既有口径）。
 * 3. 本地打包产物   —— apps/web 的构建产物 dist：打包时经 electron-builder
 *    extraResources 拷入 resources/web；未打包（本地直跑）时回退仓库相对路径
 *    ../../web/dist。以自定义协议 medontime://app/ 承载，兼容 web 构建产物
 *    的绝对资源路径（/assets/...），并附带 SPA 路由回退。
 */
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export const APP_SCHEME = 'medontime';
export const APP_HOST = 'app';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

export type ContentTarget =
  | { kind: 'remote'; url: string }
  | { kind: 'local'; webRoot: string; url: string };

function localWebRoot(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'web');
  // 未打包：apps/desktop/src|dist 的上两级即 apps/，web 产物在 apps/web/dist
  return path.resolve(__dirname, '..', '..', 'web', 'dist');
}

export function resolveContentTarget(): ContentTarget {
  const remote = process.env['DESKTOP_WEB_URL']?.trim();
  if (remote) return { kind: 'remote', url: remote };

  const dev = process.env['WEB_DEV_URL']?.trim();
  if (dev) return { kind: 'remote', url: dev };

  const webRoot = localWebRoot();
  return { kind: 'local', webRoot, url: `${APP_ORIGIN}/index.html` };
}

export function localBundleExists(target: ContentTarget): boolean {
  return target.kind !== 'local' || fs.existsSync(path.join(target.webRoot, 'index.html'));
}

/** 允许窗口内导航的 URL 前缀（其余一律拦截，http(s) 转系统浏览器）。 */
export function allowedNavigationPrefixes(target: ContentTarget, errorPagePath: string): string[] {
  const prefixes = [`file://${errorPagePath}`];
  if (target.kind === 'local') prefixes.push(`${APP_ORIGIN}/`);
  else {
    try {
      prefixes.push(new URL(target.url).origin + '/');
    } catch {
      prefixes.push(target.url);
    }
  }
  return prefixes;
}
