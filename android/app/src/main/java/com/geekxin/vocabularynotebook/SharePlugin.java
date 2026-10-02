package com.geekxin.vocabularynotebook;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;

/**
 * Android 系统分享。
 *
 * 为什么必须自己做一个：
 *   Android WebView **不实现** Web Share API —— 壳内 `navigator.share` 是 undefined，
 *   原先 JS 侧只能提示「当前浏览器不支持系统分享」。而分享正是本项目唯一的
 *   「把词汇本从一台设备搬到另一台」的通道（各端本地存储按 origin 隔离，不云同步），
 *   Android 端这条路一断，用户就没有任何搬运手段。
 *
 * 做法：JS 侧把分享页 HTML 作为字符串传进来，原生侧落盘到 cache，
 * 再经 FileProvider 以 `ACTION_SEND` 拉起系统分享面板 —— 与 Web 端
 * `navigator.share({ files: [...] })` 的效果对齐，可发微信 / 邮件 / 存文件。
 *
 * 两个关键点：
 *   1. 必须 `setClipData` 且带 `FLAG_GRANT_READ_URI_PERMISSION`。只加 flag 时，
 *      部分接收方（尤其国产 IM）拿不到读权限，分享会以「无法读取文件」失败；
 *      这是 Android 上 FileProvider 分享最常见的坑。
 *   2. 走 `startActivityForResult` + `@ActivityCallback`：用户取消分享时
 *      返回 `RESULT_CANCELED`，据此上报 `dismissed`，JS 侧才不会把「取消」
 *      当成失败弹提示。
 *
 * 文件名由 JS 侧用 `safeFileName` 清洗过（去掉了路径分隔符等），
 * 这里仍做一次兜底替换，避免任何形式的路径穿越写坏缓存目录。
 */
@CapacitorPlugin(name = "Share")
public class SharePlugin extends Plugin {

    /** 分享文件落在 cache/share 下：不占用户可见空间，系统清理缓存时一并回收。 */
    private static final String DIR_NAME = "share";
    private static final String FALLBACK_NAME = "vocabulary-notebook.html";
    private static final String MIME_HTML = "text/html";

    /**
     * 拉起系统分享面板。
     *
     * 参数：
     *   html     必填，完整的分享页 HTML 文本
     *   fileName 选填，接收方看到的文件名
     *   title    选填，分享面板标题
     *   text     选填，随附的纯文本（部分接收方只取 EXTRA_TEXT）
     *
     * 返回 { shared: true, dismissed: false }；用户取消时
     * { shared: false, dismissed: true }。
     */
    @PluginMethod
    public void shareHtml(final PluginCall call) {
        final String html = call.getString("html");
        if (html == null || html.isEmpty()) {
            call.reject("缺少 html 参数");
            return;
        }

        try {
            File file = writeShareFile(html, call.getString("fileName"));
            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    file);

            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(MIME_HTML);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            // 有些接收方读 EXTRA_TEXT 而不是 EXTRA_STREAM，带上文本更保险
            String text = call.getString("text");
            if (text != null && !text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
            String title = call.getString("title");
            if (title != null && !title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);

            // 只加 FLAG 不够：必须把 uri 放进 ClipData，接收方才会被授予读权限
            send.setClipData(ClipData.newRawUri("", uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            startActivityForResult(call, Intent.createChooser(send, title), "onShareResult");
        } catch (Exception e) {
            call.reject("无法拉起系统分享：" + e.getMessage());
        }
    }

    /** 分享面板关闭后回调：CANCELED 说明用户主动放弃，不是失败。 */
    @ActivityCallback
    private void onShareResult(PluginCall call, androidx.activity.result.ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        boolean canceled = result == null || result.getResultCode() == android.app.Activity.RESULT_CANCELED;
        ret.put("shared", !canceled);
        ret.put("dismissed", canceled);
        call.resolve(ret);
    }

    /** 写入 cache/share/<fileName>，同名直接覆盖（分享文件是一次性的，无需留档）。 */
    private File writeShareFile(String html, String fileName) throws Exception {
        File dir = new File(getContext().getCacheDir(), DIR_NAME);
        if (!dir.exists() && !dir.mkdirs()) {
            throw new Exception("无法创建缓存目录");
        }

        File target = new File(dir, safeName(fileName));
        Writer out = new OutputStreamWriter(new FileOutputStream(target), StandardCharsets.UTF_8);
        try {
            out.write(html);
        } finally {
            try { out.close(); } catch (Exception ignored) {}
        }
        return target;
    }

    /** 兜底清洗文件名：JS 侧已清洗过一次，这里防的是「不经过 JS 清洗的调用」。 */
    private String safeName(String fileName) {
        String name = fileName == null ? "" : fileName.trim();
        if (name.isEmpty()) return FALLBACK_NAME;
        name = name.replaceAll("[\\\\/:*?\"<>|\u0000-\u001f]", "_");
        // 去掉可能被当成目录的写法
        name = name.replace("..", "_");
        if (name.length() > 80) name = name.substring(0, 80);
        return name.isEmpty() ? FALLBACK_NAME : name;
    }
}
