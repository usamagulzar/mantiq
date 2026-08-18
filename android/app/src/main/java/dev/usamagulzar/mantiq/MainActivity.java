package dev.usamagulzar.mantiq;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Apply native 85% zoom at the Java engine level
        android.webkit.WebView webView = this.bridge.getWebView();
        webView.setInitialScale(85);
        android.webkit.WebSettings settings = webView.getSettings();
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false); // Disable pinch-to-zoom
        settings.setBuiltInZoomControls(false);
    }
}
