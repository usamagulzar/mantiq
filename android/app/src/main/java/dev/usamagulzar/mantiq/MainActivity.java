package dev.usamagulzar.mantiq;

import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(true);
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

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            final String volType = (keyCode == KeyEvent.KEYCODE_VOLUME_UP) ? "up" : "down";
            if (this.bridge != null && this.bridge.getWebView() != null) {
                this.bridge.getWebView().post(new Runnable() {
                    @Override
                    public void run() {
                        bridge.getWebView().evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('mantiqVolumeKey', { detail: { type: '" + volType + "' } }));", 
                            null
                        );
                    }
                });
            }
            return true; // Consume event so OS feedback / shortcuts do NOT trigger!
        }
        return super.onKeyDown(keyCode, event);
    }
}
