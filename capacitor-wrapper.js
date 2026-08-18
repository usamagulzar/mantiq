// capacitor-wrapper.js
// This script runs only when packaged inside Capacitor. It dynamically intercepts
// web functionality (like downloads) and translates them into native function calls.
// It also fetches updates from the remote site and caches them.

(function initCapacitorWrapper() {
    if (!window.Capacitor || !window.Capacitor.isNativePlatform()) return;

    console.log('[Capacitor Wrapper] Initializing native intercepts...');



    // 1. Auto-hide Install App buttons & Apply true CSS Zoom
    const style = document.createElement('style');
    style.innerHTML = `
        /* Hide PWA install buttons in native app */
        .install-btn, .install-pwa-btn, #install-app-btn {
            display: none !important;
        }

        /* Prevent ugly web artifacts on Android/iOS (text selection, highlights) */
        @media (max-width: 768px) {
            body {
                -webkit-user-select: none !important;
                user-select: none !important;
                -webkit-touch-callout: none !important;
                -webkit-tap-highlight-color: transparent !important;
                overscroll-behavior-y: none !important;
            }
            input, textarea, [contenteditable="true"] {
                -webkit-user-select: auto !important;
                user-select: auto !important;
            }
            #app-root {
                padding-top: env(safe-area-inset-top, 0px) !important;
                padding-bottom: env(safe-area-inset-bottom, 0px) !important;
                padding-left: env(safe-area-inset-left, 0px) !important;
                padding-right: env(safe-area-inset-right, 0px) !important;
                box-sizing: border-box !important;
            }
            body .modal-overlay, 
            body .rule-modal-overlay,
            body #panel-fullscreen-overlay, 
            body .kmap-panel.kmap-panel-fullscreen, 
            body .tt-panel.panel-fullscreen, 
            body .wave-panel.panel-fullscreen {
                width: 117.647vw !important;
                height: 117.647dvh !important;
                right: auto !important;
                bottom: auto !important;
                max-width: none !important;
                max-height: none !important;
                padding-top: env(safe-area-inset-top, 0px) !important;
                padding-bottom: env(safe-area-inset-bottom, 0px) !important;
                padding-left: env(safe-area-inset-left, 0px) !important;
                padding-right: env(safe-area-inset-right, 0px) !important;
                box-sizing: border-box !important;
            }
        }
    `;
    document.head.appendChild(style);

    // 1b. Polyfill DOM Coordinates to fix double-scaling bugs caused by zoom
    if (window.innerWidth <= 768) {
        const SCALE = 0.85;

        // Patch getBoundingClientRect
        const originalGBCR = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function() {
            const rect = originalGBCR.call(this);
            return {
                left: rect.left / SCALE, top: rect.top / SCALE,
                right: rect.right / SCALE, bottom: rect.bottom / SCALE,
                x: rect.x / SCALE, y: rect.y / SCALE,
                width: rect.width / SCALE, height: rect.height / SCALE
            };
        };

        // Patch MouseEvent coordinates
        ['clientX', 'clientY', 'pageX', 'pageY', 'screenX', 'screenY'].forEach(prop => {
            const original = Object.getOwnPropertyDescriptor(MouseEvent.prototype, prop);
            if (original) {
                Object.defineProperty(MouseEvent.prototype, prop, {
                    get: function() { return original.get.call(this) / SCALE; }
                });
            }
        });

        // Patch Touch coordinates
        ['clientX', 'clientY', 'pageX', 'pageY', 'screenX', 'screenY'].forEach(prop => {
            const original = Object.getOwnPropertyDescriptor(Touch.prototype, prop);
            if (original) {
                Object.defineProperty(Touch.prototype, prop, {
                    get: function() { return original.get.call(this) / SCALE; }
                });
            }
        });
    }

    let vp = document.querySelector('meta[name="viewport"]');
    if (!vp) {
        vp = document.createElement('meta');
        vp.name = 'viewport';
        document.head.appendChild(vp);
    }
    vp.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover');

    // 2. Helper for Native Downloads
    const nativeDownload = async (filename, dataUrl) => {
        try {
            const { Filesystem, Share } = window.Capacitor.Plugins;
            let fileData = dataUrl;
            
            // If it's a data URL, extract the base64 part
            if (dataUrl.includes(',')) {
                fileData = dataUrl.split(',')[1];
            } else if (dataUrl.startsWith('blob:')) {
                // Read blob to base64
                fileData = await new Promise((resolve, reject) => {
                    fetch(dataUrl).then(r => r.blob()).then(blob => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result.split(',')[1]);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    }).catch(reject);
                });
            } else {
                // If it's plain text (like CSV content but passed as encodedURI)
                // Decode it first, then convert to base64
                const decoded = decodeURIComponent(dataUrl.replace(/^data:.*?,/, ''));
                fileData = btoa(unescape(encodeURIComponent(decoded)));
            }

            const result = await Filesystem.writeFile({
                path: filename,
                data: fileData,
                directory: 'DOCUMENTS' // Use Documents dir to allow direct saving
            });

            // Alert user it was saved successfully before sharing
            console.log('[Capacitor Wrapper] Saved to Documents: ' + result.uri);
            if (window.showToast) {
                window.showToast('Saved to Documents folder!');
            }
            
            try {
                await Share.share({
                    title: filename,
                    url: result.uri,
                    dialogTitle: 'Save or Share'
                });
            } catch (shareError) {
                // Ignore share cancellation/dismiss errors
                console.log('[Capacitor Wrapper] Share sheet dismissed or failed:', shareError);
            }
        } catch (e) {
            console.error('[Capacitor Wrapper] Native download failed:', e);
            alert('Failed to export natively.');
        }
    };

    // 3. Intercept all <a> tag downloads dynamically
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
        if (this.hasAttribute('download') && this.href) {
            console.log('[Capacitor Wrapper] Intercepting download:', this.download);
            nativeDownload(this.download || 'download', this.href);
            return; // Prevent default web download behavior
        }
        return originalClick.call(this);
    };

    // 4. Background Updater
    const checkUpdates = async () => {
        try {
            console.log('[Capacitor Wrapper] Checking for remote updates...');
            const remoteSw = await fetch('https://mantiq.usamagulzar.dev/sw.js?t=' + Date.now()).then(r => r.text());
            
            const remoteVersionMatch = remoteSw.match(/const\s+CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
            if (!remoteVersionMatch) return;
            
            const remoteVersion = remoteVersionMatch[1];
            const localVersion = localStorage.getItem('mantiq_app_version') || 'mantiq-cache-v2.2.16';
            
            if (remoteVersion !== localVersion) {
                console.log(`[Capacitor Wrapper] Update found! Downloading ${remoteVersion}...`);
                
                const urlsMatch = remoteSw.match(/const\s+urlsToCache\s*=\s*\[([\s\S]*?)\];/);
                if (!urlsMatch) return;
                
                const rawUrls = urlsMatch[1].split('\n')
                    .map(line => line.trim())
                    .filter(line => line.startsWith("'") || line.startsWith('"'))
                    .map(line => line.replace(/['",]/g, ''));
                    
                // Use the currently active local cache so updates take effect immediately
                const cache = await caches.open('mantiq-cache-v2.2.16');
                
                for (const url of rawUrls) {
                    try {
                        const remoteUrl = 'https://mantiq.usamagulzar.dev/' + url.replace('./', '');
                        let response = await fetch(remoteUrl);
                        
                        if (response.ok) {
                            // If it's index.html, inject our wrapper script!
                            if (url === './index.html' || url === './') {
                                let htmlContent = await response.text();
                                // Inject before </body>
                                if (htmlContent.includes('</body>')) {
                                    htmlContent = htmlContent.replace('</body>', '<script src="js/capacitor-wrapper.js"></script></body>');
                                } else {
                                    htmlContent += '<script src="js/capacitor-wrapper.js"></script>';
                                }

                                // Force standard layout sizing
                                htmlContent = htmlContent.replace(
                                    /<meta name="viewport" content="[^"]*"\s*\/?>/,
                                    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover"/>'
                                );

                                response = new Response(htmlContent, {
                                    headers: response.headers,
                                    status: response.status,
                                    statusText: response.statusText
                                });
                            }
                            
                            await cache.put(new Request(url), response);
                        }
                    } catch (err) {
                        console.warn(`[Capacitor Wrapper] Failed to cache ${url}:`, err);
                    }
                }
                
                localStorage.setItem('mantiq_app_version', remoteVersion);
                console.log('[Capacitor Wrapper] Update downloaded and cached. It will be applied on the next launch.');
            } else {
                console.log('[Capacitor Wrapper] App is up to date.');
            }
        } catch (e) {
            console.error('[Capacitor Wrapper] Failed to check for updates', e);
        }
    };

    // Run updater after a short delay
    setTimeout(checkUpdates, 2000);

    // 6. Native Status Bar & Hardware Back Button Interceptor
    if (window.Capacitor && window.Capacitor.Plugins) {
        const { App, StatusBar } = window.Capacitor.Plugins;

        // Force the OS Status Bar to match our dark slate theme (immersive)
        if (StatusBar) {
            try {
                StatusBar.setBackgroundColor({ color: '#0f172a' });
                // Make the icons light colored so they contrast with the dark background
                StatusBar.setStyle({ style: 'DARK' }); 
                // PREVENT the status bar from overlapping the webview (push it down)
                StatusBar.setOverlaysWebView({ overlay: false });
            } catch (e) { console.warn('StatusBar not available', e); }
        }

        // Intercept Android Hardware/Gesture Back Button
        if (App) {
            let lastBackPress = 0;
            App.addListener('backButton', () => {
                // 1. If Fullscreen Panel is open, close it (Mantiq listens to Escape)
                const fsOverlay = document.getElementById('panel-fullscreen-overlay');
                if (fsOverlay && fsOverlay.style.display !== 'none') {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                    return;
                }

                // 2. If any Modal is open, close it
                const openModal = document.querySelector('.modal-overlay:not([style*="display: none"]), .rule-modal-overlay:not([style*="display: none"])');
                if (openModal) {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                    return;
                }

                // 3. Otherwise, if we are safe to exit, require double-tap
                const now = new Date().getTime();
                if (now - lastBackPress < 2000) {
                    App.exitApp();
                } else {
                    lastBackPress = now;
                    // Native-looking Toast
                    const toast = document.createElement('div');
                    toast.textContent = 'Press back again to exit';
                    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.9);color:#fff;padding:12px 24px;border-radius:24px;z-index:999999;font-family:sans-serif;font-size:14px;box-shadow:0 4px 6px rgba(0,0,0,0.3);opacity:0;transition:opacity 0.3s;';
                    document.body.appendChild(toast);
                    
                    // Fade in
                    requestAnimationFrame(() => { toast.style.opacity = '1'; });
                    
                    // Fade out and remove
                    setTimeout(() => {
                        toast.style.opacity = '0';
                        setTimeout(() => toast.remove(), 300);
                    }, 2000);
                }
            });
        }
    }
})();
