/**
 * 超级管理员播种脚本 —— 幂等创建/更新后台管理员账号并授予全部基础角色。
 *
 * 用法（在 services/api 目录下）：
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD='<至少 8 位>' ADMIN_DISPLAY_NAME='系统管理员' \
 *     pnpm exec ts-node prisma/seeds/create-admin.ts
 * 或先构建后：
 *   pnpm build && ADMIN_USERNAME=... ADMIN_PASSWORD=... \
 *     node dist/prisma/seeds/create-admin.js
 * 前置：DATABASE_URL 已指向目标库且迁移已执行（prisma migrate deploy）。
 *
 * 参数（全部经环境变量，禁止把密码写进代码/仓库/命令行历史留痕文件）：
 *   ADMIN_USERNAME      必填，登录用户名（admin_user.username，唯一）
 *   ADMIN_PASSWORD      必填，至少 8 位；以 argon2id 哈希落库，明文不落任何存储
 *   ADMIN_DISPLAY_NAME  可选，展示名（admin_user.real_name），缺省 = 用户名
 *
 * 幂等口径（重复执行安全）：
 * - 基础角色按 code 补齐：super_admin / operator / cs_agent / medical_reviewer
 *   缺哪个建哪个（is_system=true），已存在不改名不删除；
 * - 管理员按 username 查找：不存在则新建；已存在则刷新密码哈希与展示名、
 *   状态置 active 并清除软删除标记（便于密码轮换/账号恢复）；
 * - 四个基础角色全量授予该管理员：admin_user_role 缺失的补建，
 *   被软删除的恢复（granted_by 留空表示脚本授予）。
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { uuidv7 } from '../../src/common/utils/uuidv7';

const BASE_ROLES: { code: string; name: string; description: string }[] = [
  { code: 'super_admin', name: '超级管理员', description: '全量后台权限（系统种子角色）' },
  { code: 'operator', name: '运营', description: '内容/版本等日常运营（系统种子角色）' },
  { code: 'cs_agent', name: '客服', description: '客服裁决与账号协助（系统种子角色）' },
  { code: 'medical_reviewer', name: '医学审校', description: '药品/内容医学核验（系统种子角色）' },
];

async function main(): Promise<void> {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!username) {
    throw new Error('ADMIN_USERNAME is required');
  }
  if (!password || password.length < 8) {
    throw new Error('ADMIN_PASSWORD is required and must be at least 8 characters');
  }
  const displayName = process.env.ADMIN_DISPLAY_NAME?.trim() || username;

  const prisma = new PrismaClient();
  try {
    // 1) 基础角色补齐
    const roleIds = new Map<string, string>();
    for (const role of BASE_ROLES) {
      const existing = await prisma.adminRole.findFirst({
        where: { code: role.code, deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        roleIds.set(role.code, existing.id);
      } else {
        const id = uuidv7();
        await prisma.adminRole.create({
          data: {
            id,
            code: role.code,
            name: role.name,
            description: role.description,
            isSystem: true,
          },
        });
        roleIds.set(role.code, id);
        console.log(`role created: ${role.code}`);
      }
    }

    // 2) 管理员创建/刷新（密码每次执行都按当前环境变量重新哈希）
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const existingAdmin = await prisma.adminUser.findFirst({
      where: { username },
      select: { id: true },
    });
    let adminId: string;
    if (existingAdmin) {
      adminId = existingAdmin.id;
      await prisma.adminUser.update({
        where: { id: adminId },
        data: {
          passwordHash,
          realName: displayName,
          status: 'active',
          deletedAt: null,
        },
      });
      console.log(`admin updated: ${username} (${adminId})`);
    } else {
      adminId = uuidv7();
      await prisma.adminUser.create({
        data: {
          id: adminId,
          username,
          passwordHash,
          realName: displayName,
          status: 'active',
        },
      });
      console.log(`admin created: ${username} (${adminId})`);
    }

    // 3) 全量授予基础角色
    let granted = 0;
    for (const role of BASE_ROLES) {
      const roleId = roleIds.get(role.code) as string;
      const link = await prisma.adminUserRole.findFirst({
        where: { adminUserId: adminId, roleId },
        select: { id: true, deletedAt: true },
      });
      if (!link) {
        await prisma.adminUserRole.create({
          data: { id: uuidv7(), adminUserId: adminId, roleId, grantedBy: null },
        });
        granted += 1;
      } else if (link.deletedAt) {
        await prisma.adminUserRole.update({
          where: { id: link.id },
          data: { deletedAt: null },
        });
        granted += 1;
      }
    }
    console.log(
      `done: admin=${username} roles=[${BASE_ROLES.map((r) => r.code).join(', ')}] newly_granted=${granted}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('create-admin failed:', err);
  process.exit(1);
});
