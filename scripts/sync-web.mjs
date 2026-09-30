#!/usr/bin/env node
/**
 * 把根目录的 Web 应用同步到 www/ —— Capacitor 的 webDir。
 *
 * 唯一事实来源始终是根目录的 index.html。www/ 是派生产物，
 * 由 .gitignore 排除，不进版本库，避免出现两份会漂移的副本。
 *
 * 用法：node scripts/sync-web.mjs
 */
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root, 'www');

/** 需要进入 www/ 的条目；不存在的只警告，不中断（首次搭建时可能还没生成）。 */
const ENTRIES = ['index.html', 'manifest.json', 'sw.js', 'icons'];

async function main() {
  await rm(www, { recursive: true, force: true });
  await mkdir(www, { recursive: true });

  const missing = [];
  for (const name of ENTRIES) {
    const src = join(root, name);
    if (!existsSync(src)) {
      missing.push(name);
      continue;
    }
    const info = await stat(src);
    await cp(src, join(www, name), { recursive: info.isDirectory() });
  }

  const copied = (await readdir(www)).sort();
  console.log('www/ 已同步：' + copied.join(', '));
  if (missing.length) {
    console.warn('警告：以下条目不存在，已跳过 -> ' + missing.join(', '));
  }
  if (!copied.includes('index.html')) {
    console.error('错误：www/index.html 缺失，Capacitor 无法打包。');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('同步失败：', err);
  process.exit(1);
});
