#!/usr/bin/env node
/**
 * 语法检查 index.html 里的内联 <script>。
 *
 * 应用是单文件零构建，没有打包器帮忙做语法校验；这个脚本补上这一环，
 * 让 CI 能在发布前拦住明显的语法错误。
 *
 * 用 vm.Script 而不是 new Function：前者按「脚本」解析，
 * 顶层的 return / import 会被正确判为非法，不会像函数体那样放行。
 *
 * 用法：node scripts/check-inline-js.mjs
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(join(root, 'index.html'), 'utf8');

// 逐个抓取 <script ...> ... </script>；带 src 的外链脚本跳过（不是内联代码）
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m;
let index = 0;
let failures = 0;
let checked = 0;

while ((m = re.exec(html)) !== null) {
  index += 1;
  const attrs = m[1] || '';
  const code = m[2] || '';
  if (/\bsrc\s*=/.test(attrs)) continue;
  if (!code.trim()) continue;
  if (/type\s*=\s*["']?(?!text\/javascript|module|application\/javascript)/i.test(attrs)) continue;

  const line = html.slice(0, m.index).split('\n').length;
  checked += 1;
  try {
    // eslint-disable-next-line no-new
    new vm.Script(code, { filename: 'index.html:script#' + index });
  } catch (err) {
    failures += 1;
    console.error('✗ 第 ' + index + ' 个内联脚本（index.html 第 ' + line + ' 行起）语法错误：');
    console.error('  ' + err.message);
  }
}

if (checked === 0) {
  console.error('✗ 没有在 index.html 里找到任何内联脚本，检查逻辑可能失效了。');
  process.exit(1);
}

if (failures > 0) {
  console.error('✗ ' + failures + '/' + checked + ' 个内联脚本有语法错误。');
  process.exit(1);
}

console.log('✓ index.html 内联脚本语法检查通过（共 ' + checked + ' 个）');
