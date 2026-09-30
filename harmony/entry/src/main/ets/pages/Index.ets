/**
 * 词汇本 HarmonyOS NEXT 壳页面。
 *
 * 应用本体（index.html）由 Web 组件从 rawfile 加载：
 *   entry/src/main/resources/rawfile/index.html
 * 该文件是**派生产物**，由 harmony/scripts/sync-rawfile.sh 从仓库根 index.html 复制，
 * 已列入 .gitignore，请勿手工编辑。
 *
 * 属性/接口出处（华为官方文档）：
 *   Web 组件属性：https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/arkts-basic-components-web-attributes
 *   WebviewController：https://developer.huawei.com/consumer/cn/doc/doccenter-references/api/arkts-apis-webview-WebviewController
 *   页面生命周期 onBackPress：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/arkts-routing
 */
import { webview } from '@kit.ArkWeb';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN: number = 0x0000;
const TAG: string = 'VocabularyNotebook';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  /** 控制首次加载失败提示条的显隐 */
  @State private loadFailed: boolean = false;

  /**
   * 页面级返回键回调（仅 @Entry 组件可用）。
   * 返回 true  —— 页面自己处理了返回逻辑（回退 Web 历史 / 退出应用）；
   * 返回 false —— 交回系统默认路由返回逻辑。
   */
  onBackPress(): boolean {
    if (this.controller.accessBackward()) {
      this.controller.backward();
      return true;
    }
    // 没有可回退的历史记录：交回系统处理，由系统结束当前 UIAbility（等价于退出应用）
    return false;
  }

  build() {
    Stack({ alignContent: Alignment.Top }) {
      Web({ src: $rawfile('index.html'), controller: this.controller })
        // ---- 存储：词汇本的数据落在 WebView 的本地存储里，这三项必须开 ----
        .domStorageAccess(true)   // localStorage / sessionStorage
        .databaseAccess(true)     // Web SQL / IndexedDB 相关存储能力
        .fileAccess(true)         // 允许访问应用文件系统（应用内资源走 file 协议）
        // ---- 资源加载 ----
        .imageAccess(true)        // 自动加载图片
        .onlineImageAccess(true)  // 允许从网络加载图片
        .javaScriptAccess(true)   // 应用本体是 JS 应用
        .mixedMode(MixedMode.All) // 允许 HTTPS 页面加载 HTTP 资源（更新检查可能跨源）
        // ---- 交互 ----
        .zoomAccess(false)        // 应用自带字号控制，禁用手势缩放以免与页面手势冲突
        .horizontalScrollBarAccess(false)
        .verticalScrollBarAccess(false)
        .darkMode(WebDarkMode.Auto)
        .onPageEnd(() => {
          this.loadFailed = false;
        })
        .onErrorReceive((event) => {
          if (event && event.request.isMainFrame()) {
            hilog.error(DOMAIN, TAG, 'load index.html failed: %{public}s', event.error.getErrorInfo());
            this.loadFailed = true;
          }
        })
        .width('100%')
        .height('100%')

      // rawfile 缺失时的兜底提示（正常情况下不会出现：
      // CI 会先跑 harmony/scripts/sync-rawfile.sh 校验该文件存在）
      if (this.loadFailed) {
        Column() {
          Text('页面资源加载失败')
            .fontSize(16)
            .fontColor(Color.White)
          Text('请确认 entry/src/main/resources/rawfile/index.html 已由 sync-rawfile.sh 生成')
            .fontSize(12)
            .fontColor(Color.White)
            .margin({ top: 8 })
            .textAlign(TextAlign.Center)
        }
        .width('100%')
        .padding(16)
        .backgroundColor('#CC000000')
      }
    }
    .width('100%')
    .height('100%')
  }
}
