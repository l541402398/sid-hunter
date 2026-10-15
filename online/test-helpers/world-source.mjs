'use strict';
// 测试辅助：按「浏览器加载顺序」读取 world 子模块 + 聚合器源码。
// world 已拆成 online/shared/world/*（见 online/shared/world.js 头部说明），
// 因此「把单文件源码丢进 vm 沙箱求值」这类加载契约检查统一走这里：
// 拼接后的源码与 index.html / demo/index.html 的 <script> 顺序完全一致。
//
// 新增 world 子模块时，只需在 WORLD_PART_FILES 中按加载顺序补一行。
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ONLINE_DIR = dirname(dirname(fileURLToPath(import.meta.url))); // online/
export const WORLD_PART_FILES = ['config', 'geometry', 'furniture', 'floors', 'sprite']
  .map(name => `shared/world/${name}.js`);
export const WORLD_ENTRY_FILE = 'shared/world.js';

export async function readWorldSource() {
  const files = [...WORLD_PART_FILES, WORLD_ENTRY_FILE];
  const sources = await Promise.all(files.map(f => readFile(join(ONLINE_DIR, f), 'utf8')));
  return sources.join('\n;\n');
}
