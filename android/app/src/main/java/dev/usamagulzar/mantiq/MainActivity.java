package dev.usamagulzar.mantiq;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Force the app to strictly sit within the system bars (Status & Navigation) natively.
        // This prevents the WebView from bleeding underneath Android gestures/buttons.
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(true);
        }
        
        android.webkit.WebView webView = this.bridge.getWebView();
        android.webkit.WebSettings settings = webView.getSettings();
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false); // Disable pinch-to-zoom
        settings.setBuiltInZoomControls(false);
    }
}
