package com.geekxin.vocabularynotebook;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * 应用内自更新。
 *
 * 由 JS 侧传入新版 APK 的下载地址，原生侧负责：
 *   1. 下载到 cache 目录（带「已下载则复用」判断，避免重复下 4 MB）
 *   2. 通过 FileProvider 暴露给系统安装器
 *   3. 拉起系统安装界面
 *
 * 为什么必须自己做：Android 只允许「同签名的 APK」互相覆盖安装，
 * 所以这一步的前提是 CI 端用**固定密钥**签名（见 android/app/build.gradle）。
 *
 * 注意：首次拉起安装器时系统会要求用户授予「安装未知应用」权限，
 * 这是 Android 8.0+ 的硬性要求，无法绕过 —— 所以叫「无感」而不是「静默」。
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String APK_NAME = "update.apk";

    /** 已下载的 APK 是否就是目标版本（用 URL 的 SHA-256 做文件名指纹）。 */
    private File apkFileFor(String url) {
        return new File(getContext().getCacheDir(), APK_NAME);
    }

    private String fingerprint(String url) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(url.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 8; i++) sb.append(String.format("%02x", d[i]));
            return sb.toString();
        } catch (Exception e) {
            return "unknown";
        }
    }

    /** 是否允许安装未知来源应用（Android 8.0+）。 */
    private boolean canInstallPackages() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    /** 查询状态，供 JS 决定按钮文案。 */
    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("canInstall", canInstallPackages());
        ret.put("platform", "android");
        call.resolve(ret);
    }

    /** 打开系统的「安装未知应用」授权页。 */
    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("无法打开授权页面：" + e.getMessage());
        }
    }

    /** 下载并拉起安装器。下载在后台线程执行，避免阻塞 WebView 线程。 */
    @PluginMethod
    public void downloadAndInstall(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("缺少 url 参数");
            return;
        }

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    File apk = downloadIfNeeded(url);
                    install(apk);
                    JSObject ret = new JSObject();
                    ret.put("installed", true);
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject("下载或安装失败：" + e.getMessage());
                }
            }
        }).start();
    }

    /** 下载到 cache；若缓存里已有一份且指纹一致，直接复用。 */
    private File downloadIfNeeded(String url) throws Exception {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new Exception("无法创建缓存目录");
        }
        File target = new File(dir, fingerprint(url) + ".apk");
        File marker = new File(dir, fingerprint(url) + ".ok");

        // 已完整下载过：直接复用，避免重复下载
        if (target.exists() && marker.exists() && target.length() > 0) {
            return target;
        }
        if (marker.exists()) marker.delete();

        // 每次更新前清掉旧包，避免缓存目录无限增长
        File[] old = dir.listFiles();
        if (old != null) {
            for (File f : old) {
                if (!f.equals(target)) f.delete();
            }
        }

        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(120000);
        conn.connect();

        int code = conn.getResponseCode();
        if (code < 200 || code >= 300) {
            throw new Exception("HTTP " + code);
        }

        long total = conn.getContentLength();
        long done = 0;
        int lastPct = -1;

        InputStream in = conn.getInputStream();
        FileOutputStream out = new FileOutputStream(target);
        try {
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                done += n;
                if (total > 0) {
                    int pct = (int) (done * 100 / total);
                    // 每 5% 上报一次进度，避免刷爆事件通道
                    if (pct / 5 != lastPct / 5) {
                        lastPct = pct;
                        JSObject p = new JSObject();
                        p.put("percent", pct);
                        notifyListeners("downloadProgress", p);
                    }
                }
            }
        } finally {
            try { in.close(); } catch (Exception ignored) {}
            try { out.close(); } catch (Exception ignored) {}
            conn.disconnect();
        }

        if (target.length() == 0) {
            target.delete();
            throw new Exception("下载结果为空");
        }
        marker.createNewFile();
        return target;
    }

    /** 通过 FileProvider 把 APK 交给系统安装器。 */
    private void install(File apk) throws Exception {
        Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk);

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getContext().startActivity(intent);
    }
}
