'use strict';
// 测试辅助：重构分包后的「受保护文件清单」。
// 原来守卫只盯几个大文件；分包后同一个功能散在多个模块里，守卫必须覆盖新目录，
// 否则有人改动模块内的代码，哈希守卫会静默放过（那正是这些守卫存在的意义）。
//
// 新增模块目录时，在 GUARD_DIRS 里补一行即可；新增单文件补到 GUARD_FILES。
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// 单文件（保持原有条目）
export const GUARD_FILES = [
  'online/server.js', 'online/room.js', 'online/shared/world.js', 'online/shared/scene.js',
  'online/public/game.js', 'online/public/index.html', 'online/public/styles.css',
  'demo/main.js', 'demo/index.html', 'demo/styles.css',
];
// 模块目录（递归展开其中的 .js/.css）
export const GUARD_DIRS = [
  'online/shared/world',
  'online/room',
  'online/server',
  'online/server/routes',
  'online/public/js',
  'online/public/js/core',
  'online/public/js/render',
  'online/public/js/markup',
  // 需求③：搜打撤物品格（图标 + 面板）——新增目录必须在这里登记，否则哈希守卫不覆盖。
  'online/public/js/search',
  'online/public/js/minigame',
  'online/public/styles',
];

function listDir(rel) {
  return readdirSync(join(REPO_ROOT, rel), { withFileTypes: true })
    .filter(e => e.isFile() && /\.(js|css)$/.test(e.name))
    .map(e => `${rel}/${e.name}`)
    .sort();
}

// 相对仓库根的完整守卫清单（浏览器测试里用 join(root, f) 直接读取）
export const MODULE_FILES = GUARD_DIRS.flatMap(listDir);
export const GUARD_PATHS = [...GUARD_FILES, ...MODULE_FILES];
