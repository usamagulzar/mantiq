package dev.usamagulzar.mantiq;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(true);
        }
        
        // Natively force status bar to black
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(android.graphics.Color.BLACK);
            // Ensure icons are light
            android.view.View decorView = getWindow().getDecorView();
            decorView.setSystemUiVisibility(decorView.getSystemUiVisibility() & ~android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
        
        // Apply native 90% zoom at the Java engine level
        android.webkit.WebView webView = this.bridge.getWebView();
        webView.setInitialScale(90);
        android.webkit.WebSettings settings = webView.getSettings();
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false); // Disable pinch-to-zoom
        settings.setBuiltInZoomControls(false);
    }
}
