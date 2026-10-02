#!/usr/bin/env node
/**
 * 分享通道选择的回归测试。
 *
 * 背景（真实缺陷）：Android 壳内 WebView **不实现** Web Share API，
 * 壳内 `navigator.share` 是 undefined。旧代码只判断 navigator.share，
 * 于是 Android 用户点分享只会看到「当前浏览器不支持系统分享」——
 * 而分享是本项目唯一的跨设备搬运通道，等于把 Android 端的搬运能力整个堵死。
 *
 * 这个脚本把 index.html 里「分享」那一整段真实源码切出来，在 Node 里
 * 用假的 DOM / Capacitor / navigator 跑一遍，断言通道选择与入参。
 * 与 test-sw.mjs 同一套路：不依赖浏览器、不联网、秒级出结果。
 *
 * 用法：
 *   node scripts/test-share.mjs                     # 测根目录 index.html
 *   node scripts/test-share.mjs path/to/index.html  # 测指定文件（用于验证测试本身能变红）
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] ? resolve(process.argv[2]) : join(root, 'index.html');
const html = await readFile(target, 'utf8');

/* ---------------------------------------------------------------
   切出「2.8 分享」整段源码：从 escapeHtmlText 到 2.9 小节标题之前。
   刻意不复制一份代码到这里 —— 复制出来的副本会和 index.html 漂移，
   测试就失去意义。切不到就直接报错，不允许静默跳过。
   --------------------------------------------------------------- */
const START = 'function escapeHtmlText(s) {';
const END = '   2.9 下载应用本体';
const from = html.indexOf(START);
const to = html.indexOf(END);
if (from < 0 || to < 0 || to <= from) {
  console.error('✗ 在 ' + target + ' 里定位不到「分享」源码段（找 ' + START + ' … ' + END + '）');
  process.exit(1);
}
// 2.9 那个标记落在它自己的块注释里，往回退到该注释的 '/*' 之前，
// 否则切出来的代码尾部挂着一个没闭合的注释，vm 会直接语法报错。
let cut = html.lastIndexOf('/*', to);
if (cut < from) cut = to;
const shareSource = html.slice(from, cut);

let failures = 0;
const check = (name, ok, extra) => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failures++;
};

/* 跑一个场景：按需注入 Capacitor / navigator / DOM 桩，返回可断言的记录。 */
function runScenario(env) {
  const calls = { toast: [], native: [], web: [], copied: [], execCommand: 0, warn: [] };

  /* buildShareHtml 会克隆学习页 DOM 并摘掉几个按钮，桩要把这些方法都提供齐，
     否则测到的是「DOM 桩不完整」而不是「分享通道选错了」。 */
  const makeStubView = () => {
    const view = {
      removeAttribute() {},
      querySelector() { return null; },
      outerHTML: '<div class="study-view"><div id="appTitle"></div></div>'
    };
    view.cloneNode = () => makeStubView();
    return view;
  };

  const context = {
    // 吞掉被测代码的 console.warn（那是刻意的诊断输出），另行收集以便断言
    console: { log: () => {}, warn: (...a) => calls.warn.push(a.join(' ')), error: () => {} },
    JSON,
    File,
    Math,
    Date,
    setTimeout: () => 0,          // 提示计时器不参与断言，直接吞掉
    clearTimeout: () => {},
    books: env.books || [{
      id: 'b1',
      title: '四级核心词',
      words: [
        { word: 'abandon', meaningCn: '放弃' },
        { word: 'benefit', meaningCn: '益处' }
      ]
    }],
    studyView: makeStubView(),
    showToast: (msg) => { calls.toast.push(msg); },
    document: {
      querySelector: () => ({ textContent: '/* style */' }),
      createElement: () => ({ style: {}, setAttribute() {}, select() {} }),
      body: { appendChild() {}, removeChild() {} },
      execCommand: () => { calls.execCommand++; return env.execCommandOk !== false; }
    },
    navigator: {},
    window: {}
  };

  if (env.capacitor) {
    const plugin = {
      shareHtml: (args) => {
        calls.native.push(args);
        return env.nativeResult ? env.nativeResult() : Promise.resolve({ shared: true, dismissed: false });
      }
    };
    context.window = { Capacitor: { Plugins: { Share: plugin } } };
    context.Capacitor = context.window.Capacitor;
  }

  if (env.share) {
    context.navigator.share = (data) => {
      calls.web.push(data);
      return env.shareResult ? env.shareResult() : Promise.resolve();
    };
  }
  if (env.canShare !== undefined) context.navigator.canShare = () => env.canShare;
  if (env.clipboard) {
    context.navigator.clipboard = { writeText: (t) => { calls.copied.push(t); return Promise.resolve(); } };
  }

  vm.createContext(context);
  vm.runInContext(shareSource + '\nglobalThis.__shareBook = shareBook;', context, { filename: 'index.html[share]' });
  context.__shareBook('b1');
  return calls;
}

const toastText = (calls) => calls.toast.join(' | ');
const mentionsUnsupported = (calls) => /不支持/.test(toastText(calls));

/* ---- 场景 1：Android 壳（有 SharePlugin，没有 navigator.share）---- */
console.log('Android 壳（navigator.share 不存在）：');
const android = runScenario({ capacitor: true });
check('调用了原生 SharePlugin', android.native.length === 1);
check('没有走 navigator.share', android.web.length === 0);
check('没有提示「不支持系统分享」', !mentionsUnsupported(android), toastText(android));
const args = android.native[0] || {};
check('传入了分享页 HTML', typeof args.html === 'string' && args.html.includes('<!DOCTYPE html>'));
check('传入的文件名以 .html 结尾', /\.html$/.test(String(args.fileName || '')), String(args.fileName));
check('传入了书名作为标题', args.title === '四级核心词');
check('传入了纯文本兜底内容', typeof args.text === 'string' && args.text.includes('abandon'));

/* ---- 场景 2：壳内同时存在 navigator.share 时仍优先原生 ---- */
console.log('Android 壳（两者都在，原生优先）：');
const both = runScenario({ capacitor: true, share: true, canShare: true });
check('优先走原生插件', both.native.length === 1 && both.web.length === 0);

/* ---- 场景 3：Web / PWA（标准 Web Share，支持文件）---- */
console.log('Web / PWA（navigator.share 支持文件）：');
const web = runScenario({ share: true, canShare: true });
check('走 navigator.share', web.web.length === 1);
check('带了 File 对象', !!(web.web[0] && web.web[0].files && web.web[0].files[0]));
check('File 类型是 text/html', String(web.web[0].files[0].type) === 'text/html');
check('没有调用原生插件', web.native.length === 0);

/* ---- 场景 4：Web 但 canShare 不支持文件 → 只分享文本 ---- */
console.log('Web（canShare 拒绝文件）：');
const webText = runScenario({ share: true, canShare: false });
check('仍走 navigator.share', webText.web.length === 1);
check('不带 files，退回纯文本', !(webText.web[0] && webText.web[0].files));
check('文本包含词条', String(webText.web[0].text || '').includes('abandon'));

/* ---- 场景 5：桌面浏览器 / file:// 单文件 → 复制文本 ---- */
console.log('桌面浏览器（两条系统分享都没有）：');
const desktop = runScenario({});
check('走了同步 execCommand 复制', desktop.execCommand === 1);
check('提示已复制', /已复制/.test(toastText(desktop)), toastText(desktop));
check('没有提示「不支持系统分享」', !mentionsUnsupported(desktop), toastText(desktop));

/* ---- 场景 6：execCommand 失败 → 退到异步剪贴板 API ---- */
console.log('桌面浏览器（execCommand 失败）：');
const desktopAsync = runScenario({ execCommandOk: false, clipboard: true });
check('退到 navigator.clipboard.writeText', desktopAsync.copied.length === 1);
check('复制内容含词条', String(desktopAsync.copied[0] || '').includes('benefit'));

/* ---- 场景 7：原生分享被取消 → 不算失败 ---- */
/* 原生通道是 Promise 回调，先跑起来，等一轮微任务后再断言，
   否则断言的是「回调还没执行」而不是「取消被当成了失败」。 */
const dismissed = runScenario({
  capacitor: true,
  nativeResult: () => Promise.resolve({ shared: false, dismissed: true })
});

/* ---- 场景 8：原生插件 reject → 明确报错，不静默 ---- */
const nativeFail = runScenario({
  capacitor: true,
  nativeResult: () => Promise.reject(new Error('无法拉起系统分享：no activity'))
});

await new Promise((r) => setImmediate(r));

console.log('原生分享被取消：');
check('没有报错提示', dismissed.toast.filter((m) => /失败/.test(m)).length === 0, toastText(dismissed));

console.log('原生分享抛错：');
check('提示了失败原因', /系统分享失败/.test(toastText(nativeFail)), toastText(nativeFail));
check('控制台留了诊断日志', nativeFail.warn.some((m) => /系统分享失败/.test(m)));

/* ---- 场景 9：文件名清洗（会一路传到原生侧落盘）---- */
console.log('文件名清洗：');
const dirty = runScenario({ capacitor: true, books: [{
  id: 'b1',
  title: '../../etc/pa*ss?<>|"x',
  words: [{ word: 'abandon', meaningCn: '放弃' }]
}] });
const dirtyName = String((dirty.native[0] || {}).fileName || '');
check('去掉了路径分隔符', !/[\\/]/.test(dirtyName), dirtyName);
check('去掉了通配与引号', !/[*?<>|"]/.test(dirtyName), dirtyName);
check('仍以 .html 结尾', /\.html$/.test(dirtyName), dirtyName);

console.log('');
if (failures) { console.error('✗ 分享通道测试失败：' + failures + ' 项'); process.exit(1); }
console.log('✓ 分享通道全部检查通过');
