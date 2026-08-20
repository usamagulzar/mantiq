// capacitor-wrapper.js
// This script runs only when packaged inside Capacitor. It dynamically intercepts
// web functionality (like downloads) and translates them into native function calls.
// It also fetches updates from the remote site and caches them.

(function initCapacitorWrapper() {
    if (!window.Capacitor || !window.Capacitor.isNativePlatform()) return;
    
    if (window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorUpdater) {
        window.Capacitor.Plugins.CapacitorUpdater.notifyAppReady().then(() => {
            console.log('[Capacitor Wrapper] Capgo App Ready Notified!');
        }).catch(e => {
            console.warn('[Capacitor Wrapper] notifyAppReady failed', e);
        });
    }

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
                zoom: 0.90 !important;
                width: 111.111vw !important;
                height: 111.111dvh !important;
                overflow: hidden !important;
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
            body .modal-overlay, 
            body .rule-modal-overlay,
            body #panel-fullscreen-overlay, 
            body .kmap-panel.kmap-panel-fullscreen, 
            body .tt-panel.panel-fullscreen, 
            body .wave-panel.panel-fullscreen {
                width: 111.111vw !important;
                height: 111.111dvh !important;
                right: auto !important;
                bottom: auto !important;
                max-width: none !important;
                max-height: none !important;
            }
        }
    `;
    document.head.appendChild(style);

    // 1b. Polyfill DOM Coordinates to fix double-scaling bugs caused by zoom
    if (window.innerWidth <= 768) {
        const SCALE = 0.90;

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
    vp.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=auto');

    // 2. Helper for Native Downloads
    const nativeDownload = async (filename, dataUrl) => {
        try {
            const { Filesystem, Share } = window.Capacitor.Plugins;
            let fileData = dataUrl;
            
            if (dataUrl.startsWith('data:')) {
                if (dataUrl.includes(';base64,')) {
                    fileData = dataUrl.split(';base64,')[1];
                } else {
                    // Plain text data URL (like CSV)
                    const decoded = decodeURIComponent(dataUrl.substring(dataUrl.indexOf(',') + 1));
                    fileData = btoa(unescape(encodeURIComponent(decoded)));
                }
            } else if (dataUrl.startsWith('blob:')) {
                // Read blob to base64
                fileData = await new Promise((resolve, reject) => {
                    fetch(dataUrl).then(r => r.blob()).then(blob => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result.substring(reader.result.indexOf(',') + 1));
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    }).catch(reject);
                });
            } else {
                // Fallback
                const decoded = decodeURIComponent(dataUrl.replace(/^data:.*?,/, ''));
                fileData = btoa(unescape(encodeURIComponent(decoded)));
            }

            const result = await Filesystem.writeFile({
                path: filename,
                data: fileData,
                directory: 'CACHE' // CACHE allows direct saving without Android 11+ storage permissions
            });

            console.log('[Capacitor Wrapper] Saved to Cache: ' + result.uri);
            if (window.showToast) {
                window.showToast('Ready to share or save!');
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
            const localVersion = localStorage.getItem('mantiq_app_version') || 'mantiq-cache-v2.2.25';
            
            if (remoteVersion !== localVersion) {
                console.log(`[Capacitor Wrapper] Update found! Downloading ${remoteVersion} via Capgo...`);
                
                if (window.Capacitor && window.Capacitor.Plugins.CapacitorUpdater) {
                    const { CapacitorUpdater } = window.Capacitor.Plugins;
                    try {
                        const version = await CapacitorUpdater.download({
                            url: 'https://mantiq.usamagulzar.dev/update.zip?t=' + Date.now(),
                            version: remoteVersion
                        });
                        console.log('[Capacitor Wrapper] Update downloaded natively. Setting as active...');
                        await CapacitorUpdater.set({ id: version.id });
                        localStorage.setItem('mantiq_app_version', remoteVersion);
                        // The app will restart automatically after set()
                    } catch (err) {
                        console.error('[Capacitor Wrapper] Capgo download failed:', err);
                    }
                } else {
                    console.log('[Capacitor Wrapper] Capgo not found. PWA or missing plugin.');
                }
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
        const { App } = window.Capacitor.Plugins;

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
