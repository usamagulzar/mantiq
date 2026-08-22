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

    // ─── ON-SCREEN DEBUG LOG PANEL ───────────────────────────────────────────
    // Floating panel that shows console output directly on screen for testing.
    // Tap the "LOG" button (bottom-right) to toggle it open/closed.
    (function setupLogPanel() {
        const LOG_KEY = '__mantiq_log_panel_visible';
        const logs = [];

        // Create toggle button
        const btn = document.createElement('div');
        btn.id = '__log_btn';
        btn.textContent = 'LOG';
        btn.style.cssText = [
            'position:fixed', 'bottom:80px', 'right:12px', 'z-index:2147483647',
            'background:#1e40af', 'color:#fff', 'font-size:11px', 'font-weight:700',
            'padding:6px 10px', 'border-radius:8px', 'cursor:pointer',
            'font-family:monospace', 'box-shadow:0 2px 8px rgba(0,0,0,0.5)',
            'user-select:none', '-webkit-user-select:none'
        ].join(';');

        // Create panel
        const panel = document.createElement('div');
        panel.id = '__log_panel';
        const visible = sessionStorage.getItem(LOG_KEY) === '1';
        panel.style.cssText = [
            'position:fixed', 'bottom:120px', 'right:8px', 'left:8px',
            'max-height:40vh', 'z-index:2147483646',
            'background:rgba(0,0,0,0.88)', 'color:#d1fae5',
            'font-size:10px', 'font-family:monospace',
            'border-radius:10px', 'overflow-y:auto',
            'padding:8px', 'box-shadow:0 4px 16px rgba(0,0,0,0.7)',
            'display:' + (visible ? 'block' : 'none')
        ].join(';');

        const addEntry = (level, args) => {
            const text = args.map(a => {
                try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
                catch(e) { return String(a); }
            }).join(' ');
            logs.push({ level, text });
            if (logs.length > 200) logs.shift();

            const line = document.createElement('div');
            line.style.cssText = 'padding:1px 0;border-bottom:1px solid rgba(255,255,255,0.05);word-break:break-all;';
            const colors = { log: '#d1fae5', warn: '#fde68a', error: '#fca5a5' };
            line.style.color = colors[level] || '#d1fae5';
            const now = new Date();
            const ts = `${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
            line.textContent = `[${ts}] ${text}`;
            panel.appendChild(line);
            panel.scrollTop = panel.scrollHeight;
        };

        // Intercept console methods
        ['log', 'warn', 'error'].forEach(level => {
            const orig = console[level].bind(console);
            console[level] = (...args) => {
                orig(...args);
                addEntry(level, args);
            };
        });

        btn.addEventListener('click', () => {
            const isVisible = panel.style.display !== 'none';
            panel.style.display = isVisible ? 'none' : 'block';
            sessionStorage.setItem(LOG_KEY, isVisible ? '0' : '1');
            if (!isVisible) panel.scrollTop = panel.scrollHeight;
        });

        // Mount after DOM is ready
        const mount = () => {
            document.body.appendChild(btn);
            document.body.appendChild(panel);
        };
        if (document.body) mount();
        else document.addEventListener('DOMContentLoaded', mount);
    })();
    // ─────────────────────────────────────────────────────────────────────────





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

        // Expose raw (pre-patch) GBCR and zoom scale for the K-Map PNG export,
        // which needs unscaled visual coordinates to match what html2canvas sees.
        window.__rawGBCR = function(el) { return originalGBCR.call(el); };
        window.__zoomScale = SCALE;

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
            // Step 1: Fetch remote sw.js via NATIVE http (bypasses Service Worker & WebView restrictions)
            console.log('[Updater] Step 1: Fetching sw.js (native)...');
            let remoteSw;
            try {
                const { CapacitorHttp } = window.Capacitor.Plugins;
                if (!CapacitorHttp) throw new Error('CapacitorHttp not available');
                const response = await CapacitorHttp.get({
                    url: 'https://raw.githubusercontent.com/usamagulzar/mantiq/main/sw.js?t=' + Date.now()
                });
                remoteSw = response.data;
                console.log('[Updater] Step 1 OK — got ' + (remoteSw && remoteSw.length) + ' bytes');
            } catch (fetchErr) {
                const msg = fetchErr ? (fetchErr.message || JSON.stringify(fetchErr) || String(fetchErr)) : 'unknown';
                console.error('[Updater] Step 1 FAILED: ' + msg);
                return;
            }

            // Step 2: Parse version and compare
            const match = remoteSw.match(/const\s+CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
            if (!match) { console.warn('[Updater] Step 2: Could not parse version from sw.js'); return; }
            const remoteVersion = match[1];
            const localVersion = localStorage.getItem('mantiq_app_version') || 'mantiq-cache-v2.2.45';
            console.log('[Updater] Step 2: remote=' + remoteVersion + ' | local=' + localVersion);

            if (remoteVersion === localVersion) {
                console.log('[Updater] Already up to date!');
                return;
            }

            // Step 3: Download update
            console.log('[Updater] Step 3: Update found! Downloading...');
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorUpdater) {
                const { CapacitorUpdater } = window.Capacitor.Plugins;
                try {
                    console.log('[Updater] Step 3a: Calling CapacitorUpdater.download()...');
                    const version = await CapacitorUpdater.download({
                        url: 'https://raw.githubusercontent.com/usamagulzar/mantiq/main/update.zip?t=' + Date.now(),
                        version: remoteVersion
                    });
                    console.log('[Updater] Step 3b: Download done! id=' + (version && version.id));
                    localStorage.setItem('mantiq_app_version', remoteVersion);
                    console.log('[Updater] Step 3c: Calling CapacitorUpdater.set() to apply...');
                    await CapacitorUpdater.set({ id: version.id });
                    // App will restart automatically after set()
                } catch (dlErr) {
                    const msg = dlErr ? (dlErr.message || JSON.stringify(dlErr) || String(dlErr)) : 'unknown';
                    console.error('[Updater] Step 3 FAILED (download/set): ' + msg);
                }
            } else {
                console.warn('[Updater] CapacitorUpdater plugin not available');
            }
        } catch (e) {
            const msg = e ? (e.message || JSON.stringify(e) || String(e)) : 'unknown';
            console.error('[Updater] Outer catch: ' + msg);
        }
    };

    // Run updater after a short delay
    // Run checkUpdates immediately, and then every 1 minute as requested
    setTimeout(checkUpdates, 2000);
    setInterval(checkUpdates, 60000);

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
