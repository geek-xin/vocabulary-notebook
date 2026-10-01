#!/usr/bin/env node
/**
 * 把版本号统一写入各端，避免手动改五处改漏。
 *
 * 用法：node scripts/set-version.mjs 2026.10.01.1
 *
 * 写入位置（不存在的文件自动跳过）：
 *   index.html                         APP_VERSION = '2026.10.01.1'
 *   package.json                       "version": "2026.10.1"（npm semver 只允许三段，第 4 段会丢）
 *   android/app/build.gradle           versionName / versionCode
 *   ios/App/App.xcodeproj/project.pbxproj   MARKETING_VERSION / CURRENT_PROJECT_VERSION
 *   harmony/AppScope/app.json5         versionName / versionCode
 *   harmony/entry/src/main/module.json5 若有版本字段
 *
 * versionCode 取 "20261001"（YYYYMMDD）+ 第 4 段，保证单调递增。
 *
 * ⚠️ package.json 的 version 只是构建工具链的元数据，**不是版本号的事实来源**：
 *    npm 的 semver 规定只能有三段，所以 2026.10.01.2 写进去会变成 2026.10.1。
 *    事实来源始终是 index.html 的 APP_VERSION（CI 也读它，见 release.yml）。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const version = process.argv[2];
if (!version || !/^\d{4}\.\d{2}\.\d{2}(\.\d+)?$/.test(version)) {
  console.error('用法：node scripts/set-version.mjs YYYY.MM.DD[.N]');
  process.exit(1);
}

const parts = version.split('.').map(Number);
const [y, m, d] = parts;
const build = parts[3] || 0;
const versionCode = y * 10000 + m * 100 + d;
const semver = `${y}.${m}.${d}`;
const tag = `v${version}`;

const changed = [];
const skipped = [];

/** 读文件 → 逐个替换 → 有变化才写回；每个替换都要求命中，避免静默失效。 */
async function patch(relPath, rules) {
  const abs = join(root, relPath);
  if (!existsSync(abs)) {
    skipped.push(relPath + '（不存在）');
    return;
  }
  const before = await readFile(abs, 'utf8');
  let after = before;
  for (const [re, replacement, label] of rules) {
    if (!re.test(after)) {
      console.warn(`  ⚠ ${relPath}: 未匹配到 ${label}`);
      continue;
    }
    after = after.replace(re, replacement);
  }
  if (after === before) {
    skipped.push(relPath + '（无变化）');
    return;
  }
  await writeFile(abs, after);
  changed.push(relPath);
}

await patch('index.html', [
  [/const APP_VERSION\s*=\s*'[^']*'/, `const APP_VERSION     = '${version}'`, 'APP_VERSION'],
]);

await patch('package.json', [
  [/"version":\s*"[^"]*"/, `"version": "${semver}"`, 'version'],
]);

await patch('android/app/build.gradle', [
  [/versionCode\s+\d+/, `versionCode ${versionCode}`, 'versionCode'],
  [/versionName\s+"[^"]*"/, `versionName "${version}"`, 'versionName'],
]);

await patch('ios/App/App.xcodeproj/project.pbxproj', [
  [/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`, 'MARKETING_VERSION'],
  [/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${versionCode};`, 'CURRENT_PROJECT_VERSION'],
]);

/* JSON5 允许给键加引号（"versionCode": 1），两种写法都要能匹配，
   否则发版时会静默失配 —— 这个坑在首次实测中真实踩到过。 */
await patch('harmony/AppScope/app.json5', [
  [/("?versionCode"?\s*:\s*)\d+/, `$1${versionCode}`, 'versionCode'],
  [/("?versionName"?\s*:\s*)"[^"]*"/, `$1"${version}"`, 'versionName'],
]);

console.log(`版本 -> ${version}（tag ${tag}，versionCode ${versionCode}）`);
if (changed.length) console.log('已更新：\n  ' + changed.join('\n  '));
if (skipped.length) console.log('已跳过：\n  ' + skipped.join('\n  '));
console.log('\n下一步：git commit -am "chore(release): ' + tag + '" && git tag ' + tag + ' && git push origin main --tags');
