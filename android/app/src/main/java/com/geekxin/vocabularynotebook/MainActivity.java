package com.geekxin.vocabularynotebook;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 应用内自更新插件：下载新版 APK 并拉起系统安装器
        registerPlugin(AppUpdaterPlugin.class);
        // 系统分享插件：Android WebView 没有 Web Share API，由原生拉起分享面板
        registerPlugin(SharePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
