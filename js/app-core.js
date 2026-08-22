// --- HOT-PATCH for native export (fixes existing installs that don't update capacitor-wrapper.js) ---
if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    const originalClickCore = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
        if (this.hasAttribute('download') && this.href) {
            console.log('[AppCore HotPatch] Intercepting download:', this.download);
            const filename = this.download || 'download';
            const dataUrl = this.href;
            (async () => {
                try {
                    const { Filesystem, Share } = window.Capacitor.Plugins;
                    let fileData = dataUrl;
                    if (dataUrl.startsWith('data:')) {
                        if (dataUrl.includes(';base64,')) {
                            fileData = dataUrl.split(';base64,')[1];
                        } else {
                            const decoded = decodeURIComponent(dataUrl.substring(dataUrl.indexOf(',') + 1));
                            fileData = btoa(unescape(encodeURIComponent(decoded)));
                        }
                    } else if (dataUrl.startsWith('blob:')) {
                        fileData = await new Promise((resolve, reject) => {
                            fetch(dataUrl).then(r => r.blob()).then(blob => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result.substring(reader.result.indexOf(',') + 1));
                                reader.onerror = reject;
                                reader.readAsDataURL(blob);
                            }).catch(reject);
                        });
                    } else {
                        const decoded = decodeURIComponent(dataUrl.replace(/^data:.*?,/, ''));
                        fileData = btoa(unescape(encodeURIComponent(decoded)));
                    }
                    const result = await Filesystem.writeFile({
                        path: filename,
                        data: fileData,
                        directory: 'CACHE'
                    });
                    if (window.showToast) window.showToast('Ready to share or save!');
                    try { await Share.share({ title: filename, url: result.uri, dialogTitle: 'Save or Share' }); } catch (e) {}
                } catch (e) {
                    console.error('[AppCore HotPatch] Failed to export:', e);
                    alert('Failed to export natively.');
                }
            })();
            return;
        }
        return originalClickCore.call(this);
    };
}
// --- END HOT-PATCH ---

let lastLandingState = null;
function syncLoop() {
    if (wasmReady) {
        // Sync Active View Mode (reads instantly from _state cache)
        try {
            const activeView = _state.currentView;
            const appRootEl = document.getElementById('app-root');
            const isLanding = !!(appRootEl && appRootEl.classList.contains('landing'));

            // Re-run the view switch either when the numeric view mode
            // changes, OR when we transition into/out of the landing
            // screen with the same view mode still selected (e.g. typing
            // an expression while "Simulation" stays the active nav
            // button) — otherwise the panel never gets revealed once
            // landing is removed, since handleViewChange() bails out
            // while landing is active and nothing else re-triggers it.
            if (activeView !== lastActiveView || isLanding !== lastLandingState) {
                lastActiveView = activeView;
                lastLandingState = isLanding;
                elements.navButtons.forEach(btn => {
                    const btnView = parseInt(btn.getAttribute('data-view'));
                    if (btnView === activeView) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
                if (typeof handleViewChange === 'function') {
                    handleViewChange(activeView);
                }
            }
        } catch (e) {
            console.error('[Mantiq] syncLoop error:', e);
        }
    }
    requestAnimationFrame(syncLoop);
}

let _mantiqInitialized = false;
window.onMantiqInit = function() {
    if (_mantiqInitialized) return;
    _mantiqInitialized = true;

    // Dismiss loading overlay
    var overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.visibility = 'hidden';
        setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 600);
    }

    // Initial load from Hash
    if (window.location.hash.startsWith('#expr=')) {
        const initialExpr = decodeURIComponent(window.location.hash.substring(6));
        if (initialExpr.trim() !== '') {
            elements.input.value = initialExpr;
            const appRoot = document.getElementById('app-root');
            if (appRoot) {
                appRoot.classList.remove('landing');
            }
            const clearBtn = document.getElementById('clear-input-btn');
            if (clearBtn) {
                clearBtn.style.display = 'flex';
            }
            Module.ccall('mantiq_setExpression', null, ['string'], [initialExpr]);
        }
    }

    // Set Default active view
    Module.ccall('mantiq_setView', null, ['number'], [0]); // Simulation
    
    // ── FORCE INITIAL LAYOUT REFLOW ON STARTUP ──
    requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
        if (typeof fitToContainer === 'function') {
            fitToContainer('simOrig');
            fitToContainer('simSimp');
        }
        // Dynamically update the version badge from localStorage (Capgo OTA) or Cache Storage
        const capgoVer = localStorage.getItem('mantiq_app_version');
        const updateBadge = (b, verString) => {
            const ver = verString.replace('mantiq-cache-', '');
            b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 2 7l10 5 10-5-10-5Z"></path><path d="m2 17 10 5 10-5"></path><path d="m2 12 10 5 10-5"></path></svg> Version ${ver}`;
        };
        
        const applyBadge = (verString) => {
            const badge = document.getElementById('app-version-badge');
            if (badge) {
                updateBadge(badge, verString);
            } else {
                // Fallback for old APKs where index.html is intercepted natively and misses the ID
                document.querySelectorAll('.about-badge').forEach(b => {
                    if (b.textContent.includes('Version')) updateBadge(b, verString);
                });
            }
        };

        if (capgoVer) {
            applyBadge(capgoVer);
        } else if ('caches' in window) {
            caches.keys().then(keys => {
                const mantiqCache = keys.find(k => k.startsWith('mantiq-cache-v'));
                if (mantiqCache) applyBadge(mantiqCache);
            }).catch(err => console.warn('[AppCore] Could not read caches for version badge', err));
        }
    });

    // Start syncing loop
    requestAnimationFrame(syncLoop);
};

// Immediate check: If WASM worker already fired 'ready' before app-core.js finished parsing, run init now!
if (typeof wasmReady !== 'undefined' && wasmReady) {
    window.onMantiqInit();
}

// Fallback Safety Timer: Guarantee loading overlay dismissal even under extreme cache/hard-reset timing conditions
setTimeout(function() {
    var overlay = document.getElementById('loading-overlay');
    if (overlay && overlay.parentNode) {
        overlay.style.opacity = '0';
        overlay.style.visibility = 'hidden';
        setTimeout(function() { if (overlay.parentNode) overlay.remove(); }, 600);
    }
}, 3000);

// State transitions fade helper
function changeState(actionFn) {
    const mainWorkspace = document.getElementById('main-workspace');
    if (mainWorkspace) {
        mainWorkspace.classList.add('fade-out');
        setTimeout(() => {
            actionFn();
            requestAnimationFrame(() => {
                setTimeout(() => {
                    mainWorkspace.classList.remove('fade-out');
                }, 40);
            });
        }, 150);
    } else {
        actionFn();
    }
}

let inputDebounceTimer = null;

// Event Listeners
elements.input.addEventListener('input', (e) => {
    if (typeof formatInputSubscriptsNative === 'function') formatInputSubscriptsNative(elements.input);
    const expr = e.target.value;
    const clearBtn = document.getElementById('clear-input-btn');
    if (clearBtn) {
        clearBtn.style.display = expr.trim() !== '' ? 'flex' : 'none';
    }
    
    const appRoot = document.getElementById('app-root');
    if (appRoot) {
        if (expr.trim() !== '') {
            appRoot.classList.remove('showing-examples');
        } else {
            // Input was cleared out entirely - reset section to Simulation (0) in background
            if (wasmReady) {
                Module.ccall('mantiq_setView', null, ['number'], [0]);
            }
            if (!appRoot.classList.contains('landing')) {
                // Go back to the landing screen right away, no need to wait on anything.
                changeState(() => {
                    appRoot.classList.add('landing');
                });
            }
        }
        // Note: leaving the landing screen for a non-empty expression is
        // handled in updateFrontend() once the expression is confirmed valid
        // (hasResult) and only after that view has actually been rendered -
        // not here on every keystroke - so an invalid or still-computing
        // expression never flashes an empty/laggy main page.
    }
    
    if (!wasmReady) return;
    
    if (inputDebounceTimer) {
        clearTimeout(inputDebounceTimer);
    }
    
    // Quick buttons insert KMAP(n), which shouldn't feel laggy with a debounce.
    if (expr.toUpperCase().includes('KMAP')) {
        Module.ccall('mantiq_setExpression', null, ['string'], [expr]);
        updateFrontend();
    } else {
        inputDebounceTimer = setTimeout(() => {
            Module.ccall('mantiq_setExpression', null, ['string'], [expr]);
            updateFrontend();
        }, 250);
    }
});

elements.input.addEventListener('scroll', () => {
    if (typeof updateInputDisplay === 'function') updateInputDisplay();
});

elements.input.addEventListener('keyup', () => {
    if (typeof updateInputDisplay === 'function') updateInputDisplay();
});

// Clear input button
const clearBtn = document.getElementById('clear-input-btn');
if (clearBtn) {
    clearBtn.addEventListener('click', () => {
        changeState(() => {
            elements.input.value = '';
            if (typeof updateInputDisplay === 'function') updateInputDisplay();
            clearBtn.style.display = 'none';
            
            const appRoot = document.getElementById('app-root');
            if (appRoot) {
                appRoot.classList.add('landing');
                appRoot.classList.remove('showing-examples');
            }
            
            window.history.replaceState(null, null, ' ');
            
            if (wasmReady) {
                Module.ccall('mantiq_setView', null, ['number'], [0]);
                Module.ccall('mantiq_setExpression', null, ['string'], ['']);
                updateFrontend();
            }
        });
        
        elements.input.focus();
    });
}

// Logo click to return to landing page
const heroLogoWrap = document.getElementById('hero-logo-wrap');
if (heroLogoWrap) {
    heroLogoWrap.addEventListener('click', (e) => {
        e.preventDefault();
        if (document.body.classList.contains('tour-active')) {
            return;
        }
        const appRoot = document.getElementById('app-root');
        
        // Only trigger if we aren't already on the landing page
        if (appRoot && !appRoot.classList.contains('landing')) {
            changeState(() => {
                elements.input.value = '';
                const cBtn = document.getElementById('clear-input-btn');
                if (cBtn) cBtn.style.display = 'none';
                
                appRoot.classList.add('landing');
                appRoot.classList.remove('showing-examples');
                
                window.history.replaceState(null, null, ' ');
                
                if (wasmReady) {
                    Module.ccall('mantiq_setView', null, ['number'], [0]);
                    Module.ccall('mantiq_setExpression', null, ['string'], ['']);
                    updateFrontend();
                }
            });
            // Intentionally not calling focus() here so the mobile keyboard doesn't randomly pop up
        }
    });
}

// Keyboard escape handlers
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        elements.altPopup.style.display = 'none';
        document.getElementById('share-popup').style.display = 'none';
        const formatGuidePopup = document.getElementById('format-guide-popup');
        if (formatGuidePopup) formatGuidePopup.style.display = 'none';
        const examplesPopup = document.getElementById('examples-popup');
        if (examplesPopup) examplesPopup.style.display = 'none';
    }
});

 

if (elements.sopPosPill) {
    elements.sopPosPill.addEventListener('click', () => {
        const isSop = elements.sopPosPill.getAttribute('data-state') === 'sop';
        const newState = isSop ? 'pos' : 'sop';
        
        elements.sopPosPill.setAttribute('data-state', newState);
        elements.sopPosPill.querySelectorAll('.pill-option').forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('data-val') === newState);
        });
        
        // Mantiq setSOP API: 1 = SOP, 0 = POS
        if (wasmReady) {
            Module.ccall('mantiq_setSOP', null, ['number'], [newState === 'sop' ? 1 : 0]);
            
            const expr = elements.input.value.trim();
            if (expr) {
                Module.ccall('mantiq_setExpression', null, ['string'], [expr]);
                updateFrontend();
            }
        }
    });
}

// Theme Manager & Persistence (localStorage 'mantiq_theme')
const THEME_STORAGE_KEY = 'mantiq_theme';

function getSavedTheme() {
    try {
        return localStorage.getItem(THEME_STORAGE_KEY);
    } catch (e) {
        return null;
    }
}

function setSavedTheme(theme) {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (e) {}
}

function applyTheme(theme) {
    const isDark = (theme === 'dark');
    document.documentElement.classList.toggle('dark-mode', isDark);
    document.documentElement.classList.toggle('light-mode', !isDark);

    if (elements.themePill) {
        elements.themePill.setAttribute('data-state', isDark ? 'dark' : 'light');
        elements.themePill.querySelectorAll('.pill-option').forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('data-val') === (isDark ? 'dark' : 'light'));
        });
    }
}

// Initial theme resolution: check localStorage first, then fallback to OS preference
const savedTheme = getSavedTheme();
if (savedTheme) {
    applyTheme(savedTheme);
} else {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
}

// Listen to OS theme changes if user has not explicitly saved a theme preference
if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!getSavedTheme()) {
            applyTheme(e.matches ? 'dark' : 'light');
        }
    });
}

// Theme Toggle Pill Click Handler
if (elements.themePill) {
    elements.themePill.addEventListener('click', () => {
        const isDark = elements.themePill.getAttribute('data-state') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        setSavedTheme(newTheme);
        applyTheme(newTheme);

        if (typeof lastTruthTableData !== 'undefined' && lastTruthTableData) {
            renderHTMLWaveform(lastTruthTableData);
        }
    });
}

// Automatically repaint waveform canvas whenever theme classes change on document.body
if (typeof window !== 'undefined' && window.MutationObserver) {
    const bodyThemeObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.attributeName === 'class' && typeof lastTruthTableData !== 'undefined' && lastTruthTableData) {
                renderHTMLWaveform(lastTruthTableData);
                break;
            }
        }
    });
    bodyThemeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

// Solution View Mobile Tab Toggle
const solutionTypePill = document.getElementById('solution-type-pill');
if (solutionTypePill) {
    solutionTypePill.addEventListener('click', (e) => {
        const targetOption = e.target.closest('.pill-option');
        if (!targetOption) return;
        
        const newVal = targetOption.getAttribute('data-val');
        solutionTypePill.setAttribute('data-state', newVal);
        solutionTypePill.querySelectorAll('.pill-option').forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('data-val') === newVal);
        });
        
        const splitView = document.getElementById('solution-split-view');
        if (splitView) {
            splitView.setAttribute('data-active-tab', newVal);
        }
    });
}

// K-Map View Mode Toggle (Normal / Wrap / 3D).
const kmapViewToggleBtn = document.getElementById('kmap-view-toggle-btn');
if (kmapViewToggleBtn) {
    kmapViewToggleBtn.addEventListener('click', () => {
        const numVars = lastKMapData ? lastKMapData.variables.length : 0;
        if (kmapViewMode === 'normal') {
            kmapViewMode = numVars <= 4 ? 'wrap' : '3d';
        } else {
            kmapViewMode = 'normal';
        }
        renderHTMLKMap();
    });
}


// Keep the K-Map view perfectly fit to its panel whenever the panel's
// size changes for ANY reason (window resize, sidebar collapse/expand,
// orientation change, etc.) rather than only when we explicitly re-render.
let kmapResizePending = false;
function resizeKMapView() {
    if (!lastKMapData) return;
    const kmapContainer = document.getElementById('kmap-container');
    if (!kmapContainer || kmapContainer.classList.contains('view-hidden')) return;

    const { variables, minterms, dontCares, solutions, solutionsPOS } = lastKMapData;
    const numVars = variables.length;

    const sopPosEl = document.getElementById('sop-pos-pill');
    const isSOP = sopPosEl ? sopPosEl.getAttribute('data-state') === 'sop' : true;
    const activeSolutions = isSOP ? solutions : solutionsPOS;
    let selectedIdx = typeof selectedSolutionIndex !== 'undefined' ? selectedSolutionIndex : 0;
    if (selectedIdx >= activeSolutions.length) selectedIdx = 0;
    const activeSolution = activeSolutions.length > 0 ? activeSolutions[selectedIdx] : [];

    if (numVars <= 4) {
        if (kmapViewMode === 'wrap') {
            renderWrapKMap(numVars, variables, minterms, dontCares, activeSolution, isSOP);
        } else {
            render2DKMap(numVars, variables, minterms, dontCares, activeSolution, isSOP, true);
        }
    } else if (kmapViewMode !== '3d') {
        renderMultiple2DKMaps(numVars, variables, minterms, dontCares, activeSolution, isSOP);
    }
}

const kmapVisualWrapperEl = document.getElementById('kmap-visual-wrapper');
if (kmapVisualWrapperEl && window.ResizeObserver) {
    const kmapResizeObserver = new ResizeObserver(() => {
        if (kmapResizePending) return;
        kmapResizePending = true;
        requestAnimationFrame(() => {
            kmapResizePending = false;
            resizeKMapView();
        });
    });
    kmapResizeObserver.observe(kmapVisualWrapperEl);
}

// Keep the waveform canvas perfectly fit to its panel whenever the panel's
// size changes for ANY reason (window resize, sidebar collapse/expand,
// orientation change, mobile viewport chrome show/hide, etc.) - previously
// it was only ever sized once, at render time, so it went stale on mobile
// the moment the layout changed after that.
let waveResizePending = false;
const waveScrollWrapperEl = document.querySelector('.wave-scroll-wrapper');
if (waveScrollWrapperEl && window.ResizeObserver) {
    const waveResizeObserver = new ResizeObserver(() => {
        if (waveResizePending) return;
        waveResizePending = true;
        requestAnimationFrame(() => {
            waveResizePending = false;
            if (lastTruthTableData) renderHTMLWaveform(lastTruthTableData);
        });
    });
    waveResizeObserver.observe(waveScrollWrapperEl);
}

// K-Map panel fullscreen toggle - expands the whole K-Map panel (2D, Wrap,
// or 3D view, whichever is active) to fill the viewport. Reuses the panel
// in place (rather than cloning into the shared #panel-fullscreen-overlay
// like the circuit/simulation panels do) since the K-Map's grid/3D canvas
// aren't built on the .zoom-content-wrapper pattern that overlay expects.
(function initKMapFullscreen() {
    const btn = document.getElementById('kmap-fullscreen-btn');
    const panel = document.querySelector('#kmap-container .kmap-panel');
    if (!btn || !panel) return;

    // #kmap-container (and everything in it) sits inside a z-index:8
    // stacking context. A descendant can set z-index: 999999 and it still
    // won't paint above siblings like the topbar/sidebar (z-index:10),
    // because stacking order is resolved within the nearest ancestor
    // stacking context first - position:fixed only escapes that context
    // for LAYOUT (viewport-relative coordinates), not for paint order. So
    // to actually cover everything, the panel itself is relocated to be a
    // direct child of <body> while fullscreen, then moved back afterwards.
    const anchor = document.createComment('kmap-panel-anchor');
    let isDetached = false;

    const notifyResize = () => {
        // The K-Map's own ResizeObserver picks up the panel's new size
        // automatically; the 3D view only listens for window resize events,
        // so dispatch one to make sure its canvas/camera catch up too.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        });
    };

    const setFullscreen = (on) => {
        if (on && !isDetached) {
            panel.parentNode.insertBefore(anchor, panel);
            document.body.appendChild(panel);
            isDetached = true;
        } else if (!on && isDetached) {
            anchor.parentNode.insertBefore(panel, anchor);
            anchor.remove();
            isDetached = false;
        }
        panel.classList.toggle('kmap-panel-fullscreen', on);
        btn.classList.toggle('active', on);
        btn.title = on ? 'Exit Fullscreen' : 'Fullscreen';
        document.body.style.overflow = on ? 'hidden' : '';
        notifyResize();
    };

    btn.addEventListener('click', () => {
        setFullscreen(!isDetached);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isDetached) {
            setFullscreen(false);
        }
    });
})();

// Sidebar is now fixed-width (no expand/collapse toggle)

// Fix Backspace / Key events being stolen by Emscripten/Raylib
// We must use capturing phase on window/document to intercept before Emscripten
['keydown', 'keyup', 'keypress'].forEach(evt => {
    window.addEventListener(evt, (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            e.stopImmediatePropagation();
        }
    }, true);
    document.addEventListener(evt, (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            e.stopImmediatePropagation();
        }
    }, true);
});



// Sidebar Buttons View Mode changes
elements.navButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (!wasmReady) return;
        const currentExprStr = (_state.expression || (elements.input && elements.input.value) || '').trim();
        const isKmapInput = currentExprStr.toUpperCase().includes('KMAP');
        const viewMode = parseInt(e.currentTarget.getAttribute('data-view'));

        if (isKmapInput && viewMode !== 2 && viewMode !== 3) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // Block switching TO kmap (view 2) when there is only 1 variable
        if (viewMode === 2) {
            try {
                const vars = JSON.parse(queryWasmString('mantiq_getVariables') || '[]');
                if (Array.isArray(vars) && vars.length === 1) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
            } catch(_) {}
        }

        if (e.currentTarget.classList.contains('disabled')) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        
        elements.navButtons.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        Module.ccall('mantiq_setView', null, ['number'], [viewMode]);
        lastActiveView = viewMode;
        handleViewChange(viewMode);
    });
});

// ── Algebraic Proof Rule Explanation Modal ──────────────────────────────────

// Copy Proof Buttons
const copyAlgBtn = document.getElementById('copy-alg-btn');
if (copyAlgBtn) {
    copyAlgBtn.addEventListener('click', () => {
        const body = document.getElementById('alg-body');
        if (body && body.dataset.rawProof) {
            const watermark = '\n\nGenerated by Mantiq (https://mantiq.usamagulzar.dev)';
            navigator.clipboard.writeText(formatSubscript(body.dataset.rawProof) + watermark).then(() => {
                showToast('Algebraic proof copied to clipboard!');
            }).catch(() => {
                showToast('Failed to copy text', 'error');
            });
        }
    });
}

const copyQmBtn = document.getElementById('copy-qm-btn');
if (copyQmBtn) {
    copyQmBtn.addEventListener('click', () => {
        const body = document.getElementById('qm-body');
        if (body && body.dataset.rawProof) {
            const watermark = '\n\nGenerated by Mantiq (https://mantiq.usamagulzar.dev)';
            navigator.clipboard.writeText(formatSubscript(body.dataset.rawProof) + watermark).then(() => {
                showToast('QM steps copied to clipboard!');
            }).catch(() => {
                showToast('Failed to copy text', 'error');
            });
        }
    });
}

// Export K-Map PNG
const exportKmapPngBtn = document.getElementById('kmap-export-png-btn');
if (exportKmapPngBtn) {
    let kmapExportInProgress = false;
    exportKmapPngBtn.addEventListener('click', () => {
        // html2canvas clones the DOM, recomputes styles, then rasterizes at
        // scale:2 - a heavy, mostly-synchronous chunk of main-thread work.
        // Two things made this feel like the UI was frozen:
        //   1. Nothing stopped a second click from starting another export
        //      on top of the first, multiplying the work.
        //   2. The button gave no feedback before the heavy work began, so
        //      the "Exporting..." toast never actually painted until AFTER
        //      html2canvas finished - the same synchronous call that starts
        //      the work also blocks the paint that would show it's running.
        // Guarding re-entrancy and yielding a frame before the heavy call
        // fixes both: the toast/disabled state paints first, then the work
        // starts, so the wait reads as "exporting" instead of "stuck".
        if (kmapExportInProgress) return;

        const kmapVisualWrapper = document.getElementById('kmap-visual-wrapper');
        if (!kmapVisualWrapper) return;

        if (typeof html2canvas === 'undefined') {
            showToast('Export library not loaded', 'error');
            return;
        }

        kmapExportInProgress = true;
        exportKmapPngBtn.disabled = true;
        exportKmapPngBtn.classList.add('is-exporting');
        showToast('Exporting K-Map...');

        const rootStyle = getComputedStyle(document.documentElement);
        const bgColor = rootStyle.getPropertyValue('--bg-secondary').trim() || '#ffffff';

        const finishExport = () => {
            kmapExportInProgress = false;
            exportKmapPngBtn.disabled = false;
            exportKmapPngBtn.classList.remove('is-exporting');
        };

        // Yield to the browser (two rAFs = after the next paint) so the
        // disabled button + toast are actually on screen before html2canvas
        // starts its heavy synchronous work.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const gridContainer = document.getElementById('kmap-grid-container');

            // Capture just the grid container — no wrapper layout changes needed,
            // so CSS zoom and SVG coordinate patches never cause misalignment.
            html2canvas(gridContainer, {
                backgroundColor: bgColor,
                scale: 2,
                ignoreElements: (el) => {
                    return el.classList && (
                        el.classList.contains('kmap-3d-controls') ||
                        el.classList.contains('kmap-controls') ||
                        el.classList.contains('kmap-fs-btn') ||
                        el.classList.contains('zoom-btn-fullscreen')
                    );
                }
            }).then(gridCanvas => {
                // Build the final canvas: grid + groups drawn manually + watermark
                const PAD = 40; // bottom padding for watermark
                const finalCanvas = document.createElement('canvas');
                finalCanvas.width  = gridCanvas.width;
                finalCanvas.height = gridCanvas.height + PAD * 2;
                const ctx = finalCanvas.getContext('2d');

                ctx.fillStyle = bgColor;
                ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
                ctx.drawImage(gridCanvas, 0, PAD);

                // Draw the group loops manually on top of the grid image.
                // We compute each cell's position relative to gridContainer,
                // then scale by html2canvas's pixel ratio (scale: 2).
                const SCALE = 2;
                const gridRect = gridContainer.getBoundingClientRect();

                // Use _lastSVGDrawParams to replay the loop geometry without
                // touching the SVG overlay at all.
                if (window._lastSVGDrawParams) {
                    const { solution, numVars, rowsBits, colsBits, rowGray, colGray, numPlanes, zGray } = window._lastSVGDrawParams;
                    const LOOP_COLORS_LOCAL = [
                        '#007AFF','#34C759','#FF3B30','#FF9500','#AF52DE',
                        '#5856D6','#FF2D55','#5AC8FA','#FFCC00','#00C7BE',
                        '#A2845E','#FF6B22','#E586C6','#8D99AE','#4B8A08','#B53A15'
                    ];
                    const zBits = numVars - rowsBits - colsBits;

                    solution.forEach((term, idx) => {
                        const color = LOOP_COLORS_LOCAL[idx % LOOP_COLORS_LOCAL.length];
                        const zPart = term.slice(0, zBits);

                        const planesForTerm = [];
                        if (numPlanes > 1) {
                            for (let z = 0; z < numPlanes; z++) {
                                const zOffset = zGray[z];
                                let match = true;
                                for (let k = 0; k < zBits; k++) {
                                    if (zPart[k] !== '-' && zPart[k] !== zOffset[k]) { match = false; break; }
                                }
                                if (match) planesForTerm.push(zOffset);
                            }
                        } else {
                            planesForTerm.push('');
                        }

                        planesForTerm.forEach(zOffset => {
                            const rowBits = term.slice(zBits, zBits + rowsBits);
                            const colBits = term.slice(zBits + rowsBits);

                            const rowPresent = rowGray.map(g => {
                                for (let k = 0; k < rowsBits; k++) if (rowBits[k] !== '-' && rowBits[k] !== g[k]) return false;
                                return true;
                            });
                            const colPresent = colGray.map(g => {
                                for (let k = 0; k < colsBits; k++) if (colBits[k] !== '-' && colBits[k] !== g[k]) return false;
                                return true;
                            });

                            // Find bounding cells
                            const rowIndices = rowPresent.reduce((a, v, i) => v ? [...a, i] : a, []);
                            const colIndices = colPresent.reduce((a, v, i) => v ? [...a, i] : a, []);
                            if (!rowIndices.length || !colIndices.length) return;

                            const rLo = Math.min(...rowIndices), rHi = Math.max(...rowIndices);
                            const cLo = Math.min(...colIndices), cHi = Math.max(...colIndices);

                            const tlBin = zOffset + rowGray[rLo] + colGray[cLo];
                            const brBin = zOffset + rowGray[rHi] + colGray[cHi];
                            const tlCell = document.getElementById(`kmap-cell-${parseInt(tlBin, 2)}`);
                            const brCell = document.getElementById(`kmap-cell-${parseInt(brBin, 2)}`);
                            if (!tlCell || !brCell) return;

                            const tlR = tlCell.getBoundingClientRect();
                            const brR = brCell.getBoundingClientRect();

                            // Positions relative to grid container, scaled by canvas scale
                            const x = (tlR.left - gridRect.left) * SCALE;
                            const y = (tlR.top  - gridRect.top)  * SCALE + PAD * SCALE;
                            const w = (brR.right  - tlR.left) * SCALE;
                            const h = (brR.bottom - tlR.top)  * SCALE;

                            const PAD_PX = 5 * SCALE;
                            const rx = 10 * SCALE;

                            // Parse color to rgba for fill
                            ctx.save();
                            ctx.strokeStyle = color;
                            ctx.lineWidth = 3 * SCALE;
                            ctx.setLineDash([]);

                            // Fill
                            ctx.fillStyle = color + '28'; // ~16% opacity
                            ctx.beginPath();
                            ctx.roundRect(x + PAD_PX, y + PAD_PX, w - PAD_PX*2, h - PAD_PX*2, rx);
                            ctx.fill();
                            ctx.stroke();
                            ctx.restore();
                        });
                    });
                }

                // Watermark
                ctx.font = '500 16px "Outfit", sans-serif';
                ctx.fillStyle = rootStyle.getPropertyValue('--text-muted').trim() || '#8e97a3';
                ctx.textAlign = 'right';
                ctx.fillText('Generated by Mantiq (https://mantiq.usamagulzar.dev)', finalCanvas.width - 15, finalCanvas.height - 15);

                const dataUrl = finalCanvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = `mantiq_kmap_${new Date().toISOString().slice(0,19).replace(/[-T:]/g,'_')}.png`;
                link.href = dataUrl;
                link.click();
                showToast('K-Map exported as PNG!');
            }).catch(err => {
                console.error('Failed to export K-Map:', err);
                showToast('Failed to export K-Map', 'error');
            }).finally(() => {
                finishExport();
            });
        }));
    });
}

