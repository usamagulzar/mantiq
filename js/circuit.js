// SVG Circuit Rendering
// ==========================================================================

let _lastCircuitJsonStr = null;
function renderHTMLCircuit() {
    if (!wasmReady) return;
    const jsonStr = queryWasmString('mantiq_getCircuitJSON');
    const origScroll = document.getElementById('original-circuit-scroll');
    const simpScroll = document.getElementById('simplified-circuit-scroll');
    const origPanel = document.getElementById('original-circuit-panel');
    const container = document.getElementById('svg-circuit-container');
    
    if (!origScroll || !simpScroll || !origPanel || !container) return;
    
    if (jsonStr === _lastCircuitJsonStr && origScroll.innerHTML.length > 0) return;
    _lastCircuitJsonStr = jsonStr;
    
    if (!jsonStr) {
        origScroll.innerHTML = getLoadingOrEmptyMsg('No expression processed yet');
        simpScroll.innerHTML = getLoadingOrEmptyMsg('No expression processed yet');
        return;
    }
    
    let circuitData;
    try {
        circuitData = JSON.parse(jsonStr);
    } catch(e) {
        origScroll.innerHTML = '<div style="color:var(--error); text-align:center;">Error parsing circuit data</div>';
        simpScroll.innerHTML = '<div style="color:var(--error); text-align:center;">Error parsing circuit data</div>';
        return;
    }
    
    // Check if original circuit is a dummy / empty
    const isDummy = !circuitData.original || (circuitData.original.type === 'VAR' && circuitData.original.value === 'dummy');
    
    const origDepth = getGateDepth(circuitData.original);
    const simpDepth = getGateDepth(circuitData.simplified);
    
    container.classList.toggle('single-panel-view', isDummy);

    if (isDummy) {
        origPanel.style.display = 'none';
        container.style.gridTemplateColumns = '1fr';
        origScroll.innerHTML = '';
    } else {
        origPanel.style.display = 'flex';
        container.style.gridTemplateColumns = '1fr 1fr';
        
        if (origDepth > 99) { // Setting 99 to disable 10-level limit for original circuit
            origScroll.innerHTML = '<div class="exceeded-msg">Original circuit exceeds 99 levels of gates.</div>';
        } else {
            origScroll.innerHTML = generateSVGForCircuit(circuitData.original, 'orig');
            fitToContainer('orig');
        }
    }
    
    if (circuitData.isAlwaysTrue) {
        simpScroll.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:24px; color:var(--success); font-weight:bold;">Always True (1)</div>';
    } else if (circuitData.isAlwaysFalse) {
        simpScroll.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:24px; color:var(--error); font-weight:bold;">Always False (0)</div>';
    } else if (simpDepth > 99) { // Setting 99 to disable 10-level limit for simplified circuit
        simpScroll.innerHTML = '<div class="exceeded-msg">Simplified circuit exceeds 99 levels of gates.</div>';
    } else if (circuitData.simplified) {
        simpScroll.innerHTML = generateSVGForCircuit(circuitData.simplified, 'simp');
        fitToContainer('simp');
    } else {
        simpScroll.innerHTML = getLoadingOrEmptyMsg('No simplified circuit');
    }
    
    // Wire PNG Export
    const exportBtnOrig = document.getElementById('export-circuit-png-orig');
    if (exportBtnOrig) {
        const newBtn = exportBtnOrig.cloneNode(true);
        exportBtnOrig.parentNode.replaceChild(newBtn, exportBtnOrig);
        newBtn.addEventListener('click', () => {
            const svgEl = origScroll.querySelector('svg');
            if (svgEl) {
                exportSvgToPng(svgEl, `mantiq_original_circuit_${new Date().toISOString().slice(0,19).replace(/[-T:]/g,"_")}.png`);
            } else {
                showToast('No original circuit diagram to export', 'error');
            }
        });
    }

    const exportBtnSimp = document.getElementById('export-circuit-png-simp');
    if (exportBtnSimp) {
        const newBtn = exportBtnSimp.cloneNode(true);
        exportBtnSimp.parentNode.replaceChild(newBtn, exportBtnSimp);
        newBtn.addEventListener('click', () => {
            const svgEl = simpScroll.querySelector('svg');
            if (svgEl) {
                exportSvgToPng(svgEl, `mantiq_simplified_circuit_${new Date().toISOString().slice(0,19).replace(/[-T:]/g,"_")}.png`);
            } else {
                showToast('No simplified circuit diagram to export', 'error');
            }
        });
    }
    
    // Initialize Drag to Pan and Pinch to Zoom (once per panel - re-running this on
    // every render would stack duplicate mouse/touch listeners on top of each other)
    if (!container.dataset.zoomOrigInitialized) {
        initPanAndZoom('original-circuit-scroll', 'orig');
        container.dataset.zoomOrigInitialized = 'true';
    }
    if (!container.dataset.zoomSimpInitialized) {
        initPanAndZoom('simplified-circuit-scroll', 'simp');
        container.dataset.zoomSimpInitialized = 'true';
    }
}

// Resize can fire dozens of times a second during a drag-resize; each call to
// fitToContainer() does layout reads (clientWidth/clientHeight) + a style write.
// Coalesce to one pass per animation frame instead of one per resize event.
let _resizeRaf = null;
window.addEventListener('resize', () => {
    if (_resizeRaf !== null) return;
    _resizeRaf = requestAnimationFrame(() => {
        _resizeRaf = null;
        const activeBtn = document.querySelector('.nav-btn.active');
        if (activeBtn) {
            const view = activeBtn.getAttribute('data-view');
            if (view === '1') {
                fitToContainer('orig');
                fitToContainer('simp');
            } else if (view === '0') {
                fitToContainer('simOrig');
                fitToContainer('simSimp');
            }
        }
    });
});

function fitToContainer(panelType) {
    const m = _measureMetrics(panelType);
    if (!m) return;

    let scale = Math.min(m.cw / m.w, m.ch / m.h) * 0.9;
    // No artificial ceiling so small circuits fill space naturally;
    // floor at 0.05 so the widest circuits still render something visible.
    scale = Math.max(0.05, scale);

    const x = (m.cw - m.w * scale) / 2;
    const y = (m.ch - m.h * scale) / 2;

    // This IS the "maximum size, fully visible, centered" view — so it also
    // becomes the zoom-OUT limit: applyZoom() won't let state.scale go below
    // fitScale, and _clampPan() locks x/y centered whenever scale is at (or
    // below) that point. Zooming out can never go further than what you're
    // looking at right now.
    // contentW/contentH record the diagram size this fit was computed for,
    // so a later re-render can tell whether the diagram actually changed
    // shape (needs a fresh fit) or is the same size as before (safe to just
    // keep the user's existing pan/zoom) — see renderHTMLSimulation.
    panelsState[panelType] = { x, y, scale, fitScale: scale, contentW: m.w, contentH: m.h };
    applyZoom(panelType, false);
    _forceCrispRepaint(m.contentEl);
}

// True if the panel's diagram is a meaningfully different size than the one
// its current pan/zoom was fit to — e.g. typing changed the expression and
// the gate layout grew or shrank. In that case the OLD scale/position (fit
// for the old dimensions) no longer makes sense applied to the new content:
// it can leave the diagram oversized, cut off, or floating off-center
// instead of "not resizing properly". A same-size re-render (e.g. toggling
// a simulation input, which only changes signal colors, not layout) should
// NOT be treated as a resize — that's what preserves the user's zoom/pan
// across toggles.
function _contentSizeChanged(panelType, newW, newH) {
    const state = panelsState[panelType];
    if (!state || state.contentW == null || state.contentH == null) return true;
    const TOL = 1; // px - guards against float rounding, not real changes
    return Math.abs(state.contentW - newW) > TOL || Math.abs(state.contentH - newH) > TOL;
}


// Always use this (not a raw setTimeout guess) to center a panel's default view.
// A single requestAnimationFrame can still land before a just-triggered layout
// change (display:none -> flex, grid-template-columns edit) has been applied by
// the browser; nesting two rAFs guarantees we measure AFTER that layout settles,
// so the default view is reliably centered every time, not just "usually".
function centerPanel(panelType) {
    fitToContainer(panelType);
}

function zoomAtPoint(panelType, factor, px, py, smooth = false) {
    const state = panelsState[panelType];
    const oldScale = state.scale;
    let newScale = oldScale * factor;
    newScale = Math.max(0.05, Math.min(4.0, newScale));
    
    const actualFactor = newScale / oldScale;
    state.x = px - (px - state.x) * actualFactor;
    state.y = py - (py - state.y) * actualFactor;
    state.scale = newScale;
    
    applyZoom(panelType, smooth);

    // Button-triggered (smooth) zooms animate via a CSS transition, then stop
    // changing — force a fresh rasterization once that transition finishes so
    // we're not left showing the GPU-stretched bitmap from mid-animation.
    if (smooth) {
        let scrollId = '';
        if (panelType === 'orig') scrollId = 'original-circuit-scroll';
        else if (panelType === 'simp') scrollId = 'simplified-circuit-scroll';
        else if (panelType === 'simOrig') scrollId = 'original-sim-scroll';
        else if (panelType === 'simSimp') scrollId = 'simplified-sim-scroll';
        const scrollEl = document.getElementById(scrollId);
        const contentEl = scrollEl ? scrollEl.querySelector('.zoom-content-wrapper') : null;
        setTimeout(() => _forceCrispRepaint(contentEl), 160);
    }
}

// ==========================================================================
// Panel Fullscreen System
// ==========================================================================

let _fsPanelType = null;         // which panel is in fullscreen
let _fsState = { x: 0, y: 0, scale: 1 };  // pan/zoom state for the fs overlay
let _fsDragging = false;
let _fsDragStartX = 0, _fsDragStartY = 0, _fsInitX = 0, _fsInitY = 0;
let _fsTouchDist = 0, _fsTouchZoom = 1, _fsTouchMidX = 0, _fsTouchMidY = 0, _fsTouchInitX = 0, _fsTouchInitY = 0;

function _fsScrollId(panelType) {
    if (panelType === 'orig')    return 'original-circuit-scroll';
    if (panelType === 'simp')    return 'simplified-circuit-scroll';
    if (panelType === 'simOrig') return 'original-sim-scroll';
    if (panelType === 'simSimp') return 'simplified-sim-scroll';
    return '';
}

function _applyFsZoom(smooth = false) {
    const wrap = document.querySelector('#panel-fs-scroll .zoom-content-wrapper');
    if (!wrap || !_fsState.cw) return;
    
    // Read from cache instead of querying the DOM (kills layout thrashing!)
    const { cw, ch, w, h } = _fsState;

    if (_fsState.fitScale) {
        _fsState.scale = Math.max(_fsState.fitScale, _fsState.scale);
    }
    _clampPan(_fsState, cw, ch, w, h);

    wrap.style.transition = smooth ? 'transform 0.15s ease-out' : 'none';
    wrap.style.transform = `translate3d(${_fsState.x}px, ${_fsState.y}px, 0) scale3d(${_fsState.scale}, ${_fsState.scale}, 1)`;
}

function _fitFsToContainer() {
    const wrap = document.querySelector('#panel-fs-scroll .zoom-content-wrapper');
    const scrollEl = document.getElementById('panel-fs-scroll');
    if (!wrap || !scrollEl) return;
    const w = parseFloat(wrap.style.width)  || 400;
    const h = parseFloat(wrap.style.height) || 300;
    const cw = scrollEl.clientWidth  || 800;
    const ch = scrollEl.clientHeight || 600;
    // Fit entirely with 3% breathing room — same logic as fitToContainer
    let scale = Math.min(cw / w, ch / h) * 0.97;
    scale = Math.max(0.05, scale);
    const x = (cw - w * scale) / 2;
    const y = (ch - h * scale) / 2;
    _fsState = { x, y, scale, fitScale: scale, cw, ch, w, h };   
    _applyFsZoom(false);
    _forceCrispRepaint(wrap);
}

/**
 * Requests real browser fullscreen on the overlay and, where supported
 * (mainly Android Chrome/Firefox — iOS Safari has no Screen Orientation
 * Lock API), locks the screen to landscape. Orientation lock is only
 * permitted while the document is actually in fullscreen, so this must
 * run after requestFullscreen() resolves. Failures are silently ignored:
 * this is a nice-to-have, not a requirement for the panel to open.
 */
function _enterFsLandscape(overlay) {
    const req = overlay.requestFullscreen
        || overlay.webkitRequestFullscreen
        || overlay.msRequestFullscreen;
    if (!req) return;
    try {
        const result = req.call(overlay);
        const lockLandscape = () => {
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(() => {});
            }
        };
        if (result && typeof result.then === 'function') {
            result.then(lockLandscape).catch(() => {});
        } else {
            lockLandscape();
        }
    } catch (_) { /* fullscreen/orientation lock unsupported — ignore */ }
}

/** Reverses _enterFsLandscape(): unlocks orientation and exits fullscreen. */
function _exitFsLandscape() {
    try {
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
    } catch (_) {}
    const exit = document.exitFullscreen
        || document.webkitExitFullscreen
        || document.msExitFullscreen;
    if (document.fullscreenElement && exit) {
        try { exit.call(document); } catch (_) {}
    }
}

// requestFullscreen() and the orientation lock it enables are both async and,
// on mobile in particular, can resolve well after this frame (the OS still
// has to animate the rotation). _fitFsToContainer() measures the container's
// CURRENT size, so a single fit right after opening can run before that
// resize has actually happened and end up fitting to stale dimensions.
// _fsRefitHandler re-runs the fit whenever the viewport (or fullscreen state)
// actually changes while the overlay is open, so it always catches up.
let _fsRefitHandler = null;

function openPanelFullscreen(panelType) {
    const overlay = document.getElementById('panel-fullscreen-overlay');
    const fsScroll = document.getElementById('panel-fs-scroll');
    if (!overlay || !fsScroll) return;

    // Find source content
    const scrollId = _fsScrollId(panelType);
    const srcScroll = document.getElementById(scrollId);
    const srcWrap   = srcScroll ? srcScroll.querySelector('.zoom-content-wrapper') : null;
    if (!srcWrap) return;

    _fsPanelType = panelType;

    // Move the content into the fullscreen scroll area instead of cloning
    // for much faster transitions on complex circuits.
    fsScroll.innerHTML = '';
    srcWrap.setAttribute('data-original-parent', scrollId);
    
    // Remove any leftover transform — we'll re-fit in a moment
    srcWrap.style.transition = 'none';
    srcWrap.style.transform  = '';
    fsScroll.appendChild(srcWrap);

    // Show overlay
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    // _enterFsLandscape(overlay);

    // Fit after layout settles
    requestAnimationFrame(() => {
        requestAnimationFrame(() => _fitFsToContainer());
    });

    // Keep re-fitting as the real fullscreen/orientation transition catches
    // up (and for any later resize/rotation while the overlay stays open).
    if (!_fsRefitHandler) {
        _fsRefitHandler = () => {
            if (overlay.style.display === 'none') return;
            requestAnimationFrame(() => _fitFsToContainer());
        };
        window.addEventListener('resize', _fsRefitHandler);
        window.addEventListener('orientationchange', _fsRefitHandler);
        document.addEventListener('fullscreenchange', _fsRefitHandler);
        document.addEventListener('webkitfullscreenchange', _fsRefitHandler);
        if (screen.orientation && screen.orientation.addEventListener) {
            screen.orientation.addEventListener('change', _fsRefitHandler);
        }
    }
}

function closePanelFullscreen() {
    const overlay = document.getElementById('panel-fullscreen-overlay');
    if (!overlay) return;
    // _exitFsLandscape();
    overlay.style.display = 'none';
    document.body.style.overflow = '';
    const fsScroll = document.getElementById('panel-fs-scroll');
    const movedWrap = fsScroll.firstElementChild;
    if (movedWrap) {
        const origId = movedWrap.getAttribute('data-original-parent');
        if (origId) {
            const origParent = document.getElementById(origId);
            if (origParent) {
                origParent.appendChild(movedWrap);
                if (_fsPanelType) {
                    applyZoom(_fsPanelType, false);
                }
            }
        }
    }
    fsScroll.innerHTML = '';
    _fsPanelType = null;
    _fsDragging  = false;
    _fsTouchDist = 0;

    if (_fsRefitHandler) {
        window.removeEventListener('resize', _fsRefitHandler);
        window.removeEventListener('orientationchange', _fsRefitHandler);
        document.removeEventListener('fullscreenchange', _fsRefitHandler);
        document.removeEventListener('webkitfullscreenchange', _fsRefitHandler);
        if (screen.orientation && screen.orientation.removeEventListener) {
            screen.orientation.removeEventListener('change', _fsRefitHandler);
        }
        _fsRefitHandler = null;
    }
}

// Wire up fullscreen overlay controls (runs once at startup)
(function initFsOverlay() {
    const overlay  = document.getElementById('panel-fullscreen-overlay');
    const fsScroll = document.getElementById('panel-fs-scroll');
    const btnIn    = document.getElementById('panel-fs-zoom-in');
    const btnOut   = document.getElementById('panel-fs-zoom-out');
    const btnExit  = document.getElementById('panel-fs-exit');
    if (!overlay || !fsScroll || !btnIn || !btnOut || !btnExit) return;

    btnIn.addEventListener('click', () => {
        const cw = fsScroll.clientWidth, ch = fsScroll.clientHeight;
        const oldScale = _fsState.scale;
        let newScale = Math.min(oldScale * 1.2, 6.0);
        const f = newScale / oldScale;
        _fsState.x = cw / 2 - (cw / 2 - _fsState.x) * f;
        _fsState.y = ch / 2 - (ch / 2 - _fsState.y) * f;
        _fsState.scale = newScale;
        _applyFsZoom(true);
        setTimeout(() => _forceCrispRepaint(fsScroll.querySelector('.zoom-content-wrapper')), 160);
    });

    btnOut.addEventListener('click', () => {
        const cw = fsScroll.clientWidth, ch = fsScroll.clientHeight;
        const oldScale = _fsState.scale;
        let newScale = Math.max(oldScale * 0.8, 0.05);
        const f = newScale / oldScale;
        _fsState.x = cw / 2 - (cw / 2 - _fsState.x) * f;
        _fsState.y = ch / 2 - (ch / 2 - _fsState.y) * f;
        _fsState.scale = newScale;
        _applyFsZoom(true);
        setTimeout(() => _forceCrispRepaint(fsScroll.querySelector('.zoom-content-wrapper')), 160);
    });

    btnExit.addEventListener('click', closePanelFullscreen);

    // Keyboard Escape to exit
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.style.display !== 'none') closePanelFullscreen();
    });

    // If the OS/browser exits fullscreen on its own (e.g. Android back
    // gesture), make sure our overlay + orientation lock don't get stuck.
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && overlay.style.display !== 'none') {
            closePanelFullscreen();
        }
    });

    // Mouse wheel zoom
    let _fsWheelSettleTimer = null;
    fsScroll.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = fsScroll.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const oldScale = _fsState.scale;
        let newScale = Math.max(0.05, Math.min(6.0, oldScale * factor));
        const f = newScale / oldScale;
        _fsState.x = px - (px - _fsState.x) * f;
        _fsState.y = py - (py - _fsState.y) * f;
        _fsState.scale = newScale;
        _applyFsZoom(false);
        clearTimeout(_fsWheelSettleTimer);
        _fsWheelSettleTimer = setTimeout(() => {
            _forceCrispRepaint(document.querySelector('#panel-fs-scroll .zoom-content-wrapper'));
        }, 120);
    }, { passive: false });

    // Mouse drag pan
    fsScroll.addEventListener('mousedown', (e) => {
        if (e.target.closest('.panel-fs-controls')) return;
        _fsDragging   = true;
        _fsDragStartX = e.clientX;
        _fsDragStartY = e.clientY;
        _fsInitX      = _fsState.x;
        _fsInitY      = _fsState.y;
        fsScroll.style.cursor = 'grabbing';
    });
    window.addEventListener('mouseup', () => {
        _fsDragging = false;
        fsScroll.style.cursor = '';
        _forceCrispRepaint(document.querySelector('#panel-fs-scroll .zoom-content-wrapper'));
    });
    window.addEventListener('mousemove', (e) => {
        if (!_fsDragging) return;
        _fsState.x = _fsInitX + (e.clientX - _fsDragStartX);
        _fsState.y = _fsInitY + (e.clientY - _fsDragStartY);
        _applyFsZoom(false);
    });

    // Touch pan / pinch zoom
    fsScroll.addEventListener('touchstart', (e) => {
        if (e.target.closest('.panel-fs-controls')) return;
        if (e.touches.length === 1) {
            _fsDragging   = true;
            _fsDragStartX = e.touches[0].clientX;
            _fsDragStartY = e.touches[0].clientY;
            _fsInitX      = _fsState.x;
            _fsInitY      = _fsState.y;
        } else if (e.touches.length === 2) {
            e.preventDefault();
            _fsDragging = false;
            fsScroll._cachedRect = fsScroll.getBoundingClientRect();
            const x1 = e.touches[0].clientX - fsScroll._cachedRect.left, y1 = e.touches[0].clientY - fsScroll._cachedRect.top;
            const x2 = e.touches[1].clientX - fsScroll._cachedRect.left, y2 = e.touches[1].clientY - fsScroll._cachedRect.top;

            _fsTouchDist   = Math.hypot(x1 - x2, y1 - y2);
            _fsTouchMidX   = (x1 + x2) / 2;
            _fsTouchMidY   = (y1 + y2) / 2;
            _fsTouchZoom   = _fsState.scale;
            _fsTouchInitX  = _fsState.x;
            _fsTouchInitY  = _fsState.y;
        }
    }, { passive: false });

    fsScroll.addEventListener('touchend', () => {
        _fsDragging  = false;
        _fsTouchDist = 0;
        _forceCrispRepaint(document.querySelector('#panel-fs-scroll .zoom-content-wrapper'));
    });

    fsScroll.addEventListener('touchmove', (e) => {
        if (_fsDragging && e.touches.length === 1) {
            _fsState.x = _fsInitX + (e.touches[0].clientX - _fsDragStartX);
            _fsState.y = _fsInitY + (e.touches[0].clientY - _fsDragStartY);
            _applyFsZoom(false);
        } else if (e.touches.length === 2) {
            e.preventDefault();
            const rect = fsScroll._cachedRect || fsScroll.getBoundingClientRect();
            const x1 = e.touches[0].clientX - rect.left, y1 = e.touches[0].clientY - rect.top;
            const x2 = e.touches[1].clientX - rect.left, y2 = e.touches[1].clientY - rect.top;
            const dist = Math.hypot(x1 - x2, y1 - y2);
            const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
            if (_fsTouchDist === 0) {

                _fsTouchDist = dist; _fsTouchMidX = midX; _fsTouchMidY = midY;
                _fsTouchZoom = _fsState.scale; _fsTouchInitX = _fsState.x; _fsTouchInitY = _fsState.y;
                return;
            }
            const factor = dist / _fsTouchDist;
            let newScale = _fsTouchZoom * factor;
            
            const floor = _fsState.fitScale || 0.05;
            newScale = Math.max(floor, Math.min(6.0, newScale));
            
            // 2. Now calculate the X/Y safely
            _fsState.x = midX - (_fsTouchMidX - _fsTouchInitX) * (newScale / _fsTouchZoom);
            _fsState.y = midY - (_fsTouchMidY - _fsTouchInitY) * (newScale / _fsTouchZoom);
            _fsState.scale = newScale;
            
            _applyFsZoom(false);
        }
    }, { passive: false });
})();

function generateSVGForCircuit(root, panelType = 'orig') {
    let leafY = 40;
    const ySpacing = 60;
    
    function layoutNode(node, depth) {
        if (!node.children || node.children.length === 0) {
            node.x = 40;
            node.y = leafY;
            leafY += ySpacing;
        } else {
            let sumY = 0;
            let maxX = 0;
            node.children.forEach(child => {
                layoutNode(child, depth + 1);
                sumY += child.y;
                const childR = !child.isGate ? 20 : (child.children.length === 3 ? 25 : (child.children.length === 4 ? 30 : (child.children.length > 4 ? 35 : 20)));
                const childOutputOffset = (child.type === 'XNOR' || child.type === 'NAND' || child.type === 'NOR') ? 10 : 0;
                const childOutputX = child.x + childR + childOutputOffset;
                if (childOutputX > maxX) maxX = childOutputX;
            });
            node.x = maxX + 65;
            
            const numC = node.children.length;
            if (numC === 2) {
                node.y = (node.children[0].y + node.children[1].y) / 2;
            } else if (numC === 3) {
                node.y = node.children[1].y;
            } else if (numC === 4) {
                node.y = (node.children[1].y + node.children[2].y) / 2;
            } else {
                node.y = sumY / numC;
            }
        }
    }
    
    layoutNode(root, 0);
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    function findBounds(node) {
        if (node.x < minX) minX = node.x;
        if (node.x > maxX) maxX = node.x;
        if (node.y < minY) minY = node.y;
        if (node.y > maxY) maxY = node.y;
        if (node.children) {
            node.children.forEach(findBounds);
        }
    }
    findBounds(root);
    maxX = Math.max(maxX, root.x + 130);
    
    const padding = 40;
    // Natural content size before the 300x200 floor is applied.
    const contentW = (maxX - minX) + padding * 2;
    const contentH = (maxY - minY) + padding * 2;
    const width = Math.max(contentW, 300);
    const height = Math.max(contentH, 200);
    // If the enforced minimum is bigger than the natural content, split that
    // extra space evenly on both sides instead of only appending it to the
    // right/bottom - otherwise small circuits sit visibly off-center inside
    // their own SVG box even after the box itself is centered in the panel.
    const extraX = (width - contentW) / 2;
    const extraY = (height - contentH) / 2;
    const dx = padding - minX + extraX;
    const dy = padding - minY + extraY;
    
    function shiftNodes(node) {
        node.x += dx;
        node.y += dy;
        if (node.children) {
            node.children.forEach(shiftNodes);
        }
    }
    shiftNodes(root);
    
    const fitStyle = _calcFitStyle(panelType, width, height);
    let svg = `<div class="zoom-content-wrapper" style="${fitStyle}">`;
    svg += `<svg class="circuit-svg" viewBox="0 0 ${width} ${height}">`;
    
    let wires = '';
    let gates = '';
    
    function drawNode(node) {
        if (node.children) {
            // Sort children so wires don't criss-cross weirdly, though tree layout naturally handles it somewhat
            node.children.forEach((child, idx) => {
                const childR = !child.isGate ? 20 : (child.children.length === 3 ? 25 : (child.children.length === 4 ? 30 : (child.children.length > 4 ? 35 : 20)));
                const childOutputOffset = (child.type === 'XNOR' || child.type === 'NAND' || child.type === 'NOR') ? 10 : 0;
                const cx = child.x + childR + childOutputOffset; // output of child
                
                // input of current node
                let nx = node.x - 20; 
                if (node.type === 'OR') nx = node.x - 15;
                if (node.type === 'NOT') nx = node.x - 15;
                if (node.type === 'XOR' || node.type === 'XNOR') nx = node.x - 21;
                
                let ny = node.y;
                if (node.children.length > 1) {
                    // Spread inputs vertically
                    const numInputs = node.children.length;
                    const span = numInputs === 3 ? 30 : (numInputs === 4 ? 40 : (numInputs > 4 ? 50 : 20));
                    const step = span / (numInputs - 1);
                    ny = node.y - span/2 + idx * step;
                }
                
                const cy = child.y;
                
                let midX = Math.max(cx + 10, nx - 22);
                if (node.children.length === 4 && (idx === 1 || idx === 2)) {
                    midX = Math.max(cx + 5, nx - 38);
                }
                wires += `<path class="circuit-wire" d="M ${cx} ${cy} L ${midX} ${cy} L ${midX} ${ny} L ${nx} ${ny}" />`;
                
                drawNode(child);
            });
        }
        
        if (!node.isGate) {
            gates += `<circle class="var-node" cx="${node.x}" cy="${node.y}" r="20" />`;
            // dy value below is not a generic guess - it's the measured vertical
            // offset for this exact font (Outfit Bold): rendered the glyph,
            // measured its actual ink bounding box, and computed the exact shift
            // needed to align its visual center (not its alphabetic baseline)
            // with the circle's center. 0.35em (the generic rule-of-thumb) was
            // still measurably too small a shift and left the glyph sitting high.
            gates += `<text class="var-text" x="${node.x}" y="${node.y}" text-anchor="middle" dy="0.244em">${typeof formatSubscriptUnicode === 'function' ? formatSubscriptUnicode(node.value) : escapeHtml(node.value)}</text>`;
        } else {
            gates += getGateSVG(node.type, node.x, node.y, node.children ? node.children.length : 2);
        }
    }
    
    drawNode(root);
    
    // Output wire
    const rootR = !root.isGate ? 20 : (root.children.length === 3 ? 25 : (root.children.length === 4 ? 30 : (root.children.length > 4 ? 35 : 20)));
    const rootOutputOffset = (root.type === 'XNOR' || root.type === 'NAND' || root.type === 'NOR') ? 10 : 0;
    const finalOutX = root.x + rootR + rootOutputOffset;
    wires += `<path class="circuit-wire" d="M ${finalOutX} ${root.y} L ${finalOutX + 35} ${root.y}" />`;
    gates += `<text class="var-text" x="${finalOutX + 45}" y="${root.y}" text-anchor="start" dominant-baseline="central">OUTPUT</text>`;
    svg += wires;
    svg += gates;
    svg += `</svg></div>`;
    return svg;
}

function getGateSVG(type, x, y, numInputs = 2) {
    let svg = '';
    let r = 20;
    if (numInputs === 3) r = 25;
    else if (numInputs === 4) r = 30;
    else if (numInputs > 4) r = 35;

    if (type === 'AND') {
        svg += `<path class="gate-shape" d="M ${x-20} ${y-r} L ${x} ${y-r} A ${r} ${r} 0 0 1 ${x} ${y+r} L ${x-20} ${y+r} Z" />`;
    } else if (type === 'OR') {
        svg += `<path class="gate-shape" d="M ${x-20} ${y-r} Q ${x-5} ${y} ${x-20} ${y+r} Q ${x+10} ${y+r} ${x+r} ${y} Q ${x+10} ${y-r} ${x-20} ${y-r} Z" />`;
    } else if (type === 'XOR') {
        svg += `<path class="gate-shape" d="M ${x-26} ${y-r} Q ${x-11} ${y} ${x-26} ${y+r}" />`;
        svg += `<path class="gate-shape" d="M ${x-20} ${y-r} Q ${x-5} ${y} ${x-20} ${y+r} Q ${x+10} ${y+r} ${x+r} ${y} Q ${x+10} ${y-r} ${x-20} ${y-r} Z" />`;
    } else if (type === 'XNOR') {
        svg += `<path class="gate-shape" d="M ${x-26} ${y-r} Q ${x-11} ${y} ${x-26} ${y+r}" />`;
        svg += `<path class="gate-shape" d="M ${x-20} ${y-r} Q ${x-5} ${y} ${x-20} ${y+r} Q ${x+10} ${y+r} ${x+r} ${y} Q ${x+10} ${y-r} ${x-20} ${y-r} Z" />`;
        svg += `<circle class="gate-shape" cx="${x+r+5}" cy="${y}" r="5" />`;
    } else if (type === 'NOT') {
        svg += `<path class="gate-shape" d="M ${x-15} ${y-15} L ${x+10} ${y} L ${x-15} ${y+15} Z" />`;
        svg += `<circle class="gate-shape" cx="${x+15}" cy="${y}" r="5" />`;
    }
    return svg;
}

function initPanAndZoom(containerId, panelType) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Clean up existing observer on this element
    if (container._resizeObserver) {
        container._resizeObserver.disconnect();
    }
    
    const observer = new ResizeObserver((entries) => {
        for (let entry of entries) {
            if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                fitToContainer(panelType);
            }
        }
    });
    observer.observe(container);
    container._resizeObserver = observer;
    
    let isDragging = false;
    let startX, startY;
    let initialX, initialY;
    
    // Mouse drag to pan
    container.addEventListener('mousedown', (e) => {
        if (e.target.closest('.zoom-controls')) return;
        isDragging = true;
        _beginGesture(panelType);
        container.style.cursor = 'grabbing';
        startX = e.clientX;
        startY = e.clientY;
        initialX = panelsState[panelType].x;
        initialY = panelsState[panelType].y;
    });
    
    container.addEventListener('mouseleave', () => {
        if (isDragging) {
            _endGesture(panelType);
            const wrap = container.querySelector('.zoom-content-wrapper');
            _forceCrispRepaint(wrap);
        }
        isDragging = false;
        container.style.cursor = 'default';
    });
    
    container.addEventListener('mouseup', () => {
        if (isDragging) {
            _endGesture(panelType);
        }
        isDragging = false;
        container.style.cursor = 'default';
        const wrap = container.querySelector('.zoom-content-wrapper');
        _forceCrispRepaint(wrap);
    });
    
    container.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        panelsState[panelType].x = initialX + dx;
        panelsState[panelType].y = initialY + dy;
        applyZoom(panelType, false);
    });
    
    // Mouse wheel to zoom at cursor position
    let _wheelSettleTimer = null;
    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        _beginGesture(panelType);
        const rect = container.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        zoomAtPoint(panelType, factor, px, py, false);
        // Debounce: once wheel events stop arriving for a beat, the gesture
        // has settled — force a fresh rasterization at the final scale so
        // we're not left showing a GPU-stretched bitmap from mid-scroll.
        clearTimeout(_wheelSettleTimer);
        _wheelSettleTimer = setTimeout(() => {
            _endGesture(panelType);
            _forceCrispRepaint(container.querySelector('.zoom-content-wrapper'));
        }, 120);
    }, { passive: false });
    
    // Touch events for drag panning and pinch zoom
    let touchStartDist = 0;
    let startZoom = 1.0;
    let startMidX = 0, startMidY = 0;
    let containerRect = null;
    container.addEventListener('touchstart', (e) => {
        if (e.target.closest('.zoom-controls')) return;
        _beginGesture(panelType);
        if (e.touches.length === 1) {
            isDragging = true;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            initialX = panelsState[panelType].x;
            initialY = panelsState[panelType].y;
        } else if (e.touches.length === 2) {
            e.preventDefault();
            isDragging = false;
            container._cachedRect = container.getBoundingClientRect();
            const x1 = e.touches[0].clientX - container._cachedRect.left;
            const y1 = e.touches[0].clientY - container._cachedRect.top;
            const x2 = e.touches[1].clientX - container._cachedRect.left;
            const y2 = e.touches[1].clientY - container._cachedRect.top;
            
            touchStartDist = Math.hypot(x1 - x2, y1 - y2);
            startMidX = (x1 + x2) / 2;
            startMidY = (y1 + y2) / 2;
            // panelsState is always kept in sync by fitToContainer/applyZoom — read directly
            startZoom = panelsState[panelType].scale;
            initialX  = panelsState[panelType].x;
            initialY  = panelsState[panelType].y;
        }
    }, { passive: false });
    
    container.addEventListener('touchend', (e) => {
        if (touchStartDist > 0 && e.touches.length < 2) {
            touchStartDist = 0;
        }
        if (e.touches.length === 0) {
            isDragging = false;
            _endGesture(panelType);
            _forceCrispRepaint(container.querySelector('.zoom-content-wrapper'));
        }
    });
    
    container.addEventListener('touchmove', (e) => {
        if (isDragging && e.touches.length === 1) {
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            panelsState[panelType].x = initialX + dx;
            panelsState[panelType].y = initialY + dy;
            applyZoom(panelType, false);
        } else if (e.touches.length === 2) {
            e.preventDefault();
            const rect = container._cachedRect || container.getBoundingClientRect();
            const x1 = e.touches[0].clientX - rect.left;
            const y1 = e.touches[0].clientY - rect.top;
            const x2 = e.touches[1].clientX - rect.left;
            const y2 = e.touches[1].clientY - rect.top;
            
            const dist = Math.hypot(x1 - x2, y1 - y2);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            
            // Guard: second finger added during move without a proper 2-finger touchstart
            if (touchStartDist === 0) {
                touchStartDist = dist;
                startMidX = midX;
                startMidY = midY;
                startZoom = panelsState[panelType].scale;
                initialX  = panelsState[panelType].x;
                initialY  = panelsState[panelType].y;
                return;
            }
            
            const factor = dist / touchStartDist;
            let newScale = startZoom * factor;
            
            // 1. Apply the floor limit BEFORE calculating X and Y
            const floor = panelsState[panelType].fitScale || 0.05;
            newScale = Math.max(floor, Math.min(4.0, newScale));
            
            // 2. Now calculate the X/Y safely
            panelsState[panelType].x = midX - (startMidX - initialX) * (newScale / startZoom);
            panelsState[panelType].y = midY - (startMidY - initialY) * (newScale / startZoom);
            panelsState[panelType].scale = newScale;
            
            applyZoom(panelType, false);
        }
    }, { passive: false });
}

function exportSvgToPng(svgElement, filename) {
    if (!svgElement) return;
    
    const viewBox = svgElement.getAttribute('viewBox');
    let width = 800;
    let height = 600;
    if (viewBox) {
        const parts = viewBox.split(' ');
        width = parseFloat(parts[2]) || 800;
        height = parseFloat(parts[3]) || 600;
    }
    
    const exportScale = 2.0;
    const canvas = document.createElement('canvas');
    canvas.width = width * exportScale;
    canvas.height = (height * exportScale) + 40; // 40px padding at bottom for watermark
    const ctx = canvas.getContext('2d');
    
    const rootStyle = getComputedStyle(document.documentElement);
    const textPrimary = rootStyle.getPropertyValue('--text-primary').trim() || '#f8fafc';
    const bgSecondary = rootStyle.getPropertyValue('--bg-secondary').trim() || '#1e293b';
    
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        .circuit-wire { fill: none; stroke: ${textPrimary}; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
        .gate-shape { fill: none; stroke: ${textPrimary}; stroke-width: 2.5; }
        .var-node { fill: none; stroke: ${textPrimary}; stroke-width: 2.5; }
        .var-text { font-family: Outfit, sans-serif; font-size: 16px; font-weight: 700; fill: ${textPrimary}; }
        .gate-text { font-family: Outfit, sans-serif; font-size: 14px; fill: ${textPrimary}; font-weight: 600; }
    `;
    
    const clonedSvg = svgElement.cloneNode(true);
    clonedSvg.appendChild(styleEl);
    
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clonedSvg);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    const img = new Image();
    img.onload = () => {
        ctx.fillStyle = bgSecondary;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.scale(exportScale, exportScale);
        ctx.drawImage(img, 0, 0, width, height);
        
        // Reset scale and add watermark
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.font = '500 16px "Outfit", sans-serif';
        ctx.fillStyle = rootStyle.getPropertyValue('--text-muted').trim() || '#8e97a3';
        ctx.textAlign = 'right';
        ctx.fillText('Generated by Mantiq (https://mantiq.usamagulzar.dev)', canvas.width - 15, canvas.height - 15);
        
        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast('Circuit exported as PNG!');
    };
    img.onerror = (err) => {
        console.error('Failed to render SVG image for PNG export:', err);
        showToast('Export failed', 'error');
    };
    img.src = url;
}


// ==========================================
// PCB SIMULATION ENGINE
// ==========================================


// Layout cache populated by generateSVGForSimulation on every full render
// (new expression, resetZoom). Keyed by panelId ('o' / 's'). toggleSimInput
// reads from this instead of re-walking the circuit tree.
const _simLayoutCache = {};

function toggleSimInput(varName) {
    simInputStates[varName] = !simInputStates[varName];

    // Fast path: the circuit shape hasn't changed, only variable states —
    // restyle the ~10-20 affected elements (LED/status-dot colors, trace
    // colors, cap position) directly instead of regenerating and re-parsing
    // thousands of characters of SVG markup for both panels.
    const updatedOrig = updateSimulationColors('o', 'original-sim-scroll');
    const updatedSimp = updateSimulationColors('s', 'simplified-sim-scroll');

    // Fallback for anything the fast path couldn't handle (e.g. no cached
    // layout yet, or the panel's SVG isn't in the DOM) — do a full rebuild.
    if (!updatedOrig && !updatedSimp) {
        renderHTMLSimulation(false);
    }
}
window.toggleSimInput = toggleSimInput; // Expose for events

/**
 * Restyle an already-rendered simulation panel to reflect the current
 * simInputStates, without recomputing layout or regenerating SVG markup.
 * Returns false (and does nothing) if there's no cached layout or the
 * panel's SVG isn't currently in the DOM, so the caller can fall back to
 * a full render.
 */
function updateSimulationColors(panelId, scrollElId) {
    const cache = _simLayoutCache[panelId];
    if (!cache) return false;
    let scrollEl = document.getElementById(scrollElId);
    // If this panel is currently fullscreen, the active SVG is in panel-fs-scroll
    if (_fsPanelType === (panelId === 'o' ? 'simOrig' : 'simSimp')) {
        scrollEl = document.getElementById('panel-fs-scroll');
    }
    if (!scrollEl || !scrollEl.querySelector('svg')) return false;

    const { root, posMap, dx, dy } = cache;

    // Same index sequence generateSVGForSimulation used when it built the ids
    // (copper-traces loop and components loop both walk posMap in this same
    // order, starting at 0), so idx here lines up with the ids in the DOM.
    let idx = 0;
    for (const [node, pos] of posMap.entries()) {
        const myIdx = idx++;
        const y = pos.y + dy;
        const state = evaluateSimLogic(node);

        if (!node.isGate) {
            const isConst = node.value === '0' || node.value === '1';
            if (!isConst) {
                const cap = document.getElementById(`toggle-cap-${panelId}-${myIdx}`);
                if (cap) cap.setAttribute('cy', state ? y : y - 4);
                const dot = document.getElementById(`toggle-dot-${panelId}-${myIdx}`);
                if (dot) dot.setAttribute('fill', state ? '#30d158' : '#ff453a');
            }
            continue;
        }

        const gateDot = document.getElementById(`gate-dot-${panelId}-${myIdx}`);
        if (gateDot) {
            if (state) {
                gateDot.setAttribute('fill', '#60ff60');
                gateDot.setAttribute('filter', `url(#led-glow-small-${panelId})`);
            } else {
                gateDot.setAttribute('fill', '#113311');
                gateDot.removeAttribute('filter');
            }
        }

        if (node.children) {
            for (let i = 0; i < node.children.length; i++) {
                const childState = evaluateSimLogic(node.children[i]);
                const trace = document.getElementById(`trace-${panelId}-${myIdx}-${i}`);
                if (!trace) continue;
                if (childState) {
                    trace.setAttribute('stroke', '#4ade80');
                    trace.setAttribute('filter', `url(#trace-3d-active-${panelId})`);
                } else {
                    trace.setAttribute('stroke', '#154c27');
                    trace.setAttribute('filter', `url(#trace-3d-inactive-${panelId})`);
                }
            }
        }
    }

    // Output trace + LED
    const finalState = evaluateSimLogic(root);
    const outTrace = document.getElementById(`output-trace-${panelId}`);
    if (outTrace) {
        if (finalState) {
            outTrace.setAttribute('stroke', '#4ade80');
            outTrace.setAttribute('filter', `url(#trace-3d-active-${panelId})`);
        } else {
            outTrace.setAttribute('stroke', '#154c27');
            outTrace.setAttribute('filter', `url(#trace-3d-inactive-${panelId})`);
        }
    }
    const ledBase = document.getElementById(`led-base-${panelId}`);
    if (ledBase) ledBase.setAttribute('fill', finalState ? '#882200' : '#220000');
    const ledDome = document.getElementById(`led-dome-${panelId}`);
    if (ledDome) ledDome.setAttribute('fill', `url(#${finalState ? 'led-on' : 'led-off'}-${panelId})`);
    const ledGlow = document.getElementById(`led-glow-circle-${panelId}`);
    if (ledGlow) ledGlow.setAttribute('opacity', finalState ? '0.35' : '0');

    return true;
}

function evaluateSimLogic(node) {
    if (!node) return false;
    if (!node.isGate) {
        if (node.value === '1') return true;
        if (node.value === '0') return false;
        return !!simInputStates[node.value];
    }
    const gateType = node.type;
    const childrenVals = node.children ? node.children.map(evaluateSimLogic) : [];
    
    if (gateType === 'NOT') return !childrenVals[0];
    if (gateType === 'AND') return childrenVals.every(v => v);
    if (gateType === 'OR') return childrenVals.some(v => v);
    if (gateType === 'NAND') return !childrenVals.every(v => v);
    if (gateType === 'NOR') return !childrenVals.some(v => v);
    if (gateType === 'XOR') {
        const sum = childrenVals.reduce((acc, curr) => acc + (curr ? 1 : 0), 0);
        return sum % 2 === 1;
    }
    if (gateType === 'XNOR') {
        const sum = childrenVals.reduce((acc, curr) => acc + (curr ? 1 : 0), 0);
        return sum % 2 === 0;
    }
    return false;
}

let _lastSimulationJsonStr = null;
function renderHTMLSimulation(resetZoom = true) {
    const origSimScroll = document.getElementById('original-sim-scroll');
    const simpSimScroll = document.getElementById('simplified-sim-scroll');
    const container = document.getElementById('simulation-container');
    const origSimPanel = document.getElementById('original-sim-panel');
    if (!origSimScroll || !simpSimScroll || !container) return;
    
    const jsonStr = queryWasmString('mantiq_getCircuitJSON');
    
    if (jsonStr === _lastSimulationJsonStr && origSimScroll.innerHTML.length > 0) return;
    _lastSimulationJsonStr = jsonStr;
    
    if (!jsonStr) {
        origSimScroll.innerHTML = getLoadingOrEmptyMsg('No expression processed yet');
        simpSimScroll.innerHTML = getLoadingOrEmptyMsg('No expression processed yet');
        return;
    }
    
    let circuitData;
    try {
        circuitData = JSON.parse(jsonStr);
    } catch(e) {
        origSimScroll.innerHTML = '<div style="color:var(--error); text-align:center;">Error parsing circuit data</div>';
        simpSimScroll.innerHTML = '<div style="color:var(--error); text-align:center;">Error parsing circuit data</div>';
        return;
    }
    
    const isDummy = !circuitData.original || (!circuitData.original.isGate && circuitData.original.value === 'dummy');

    container.classList.toggle('single-panel-view', isDummy);

    if (isDummy) {
        origSimPanel.style.display = 'none';
        container.style.gridTemplateColumns = '1fr';
        origSimScroll.innerHTML = '';
    } else {
        origSimPanel.style.display = 'flex';
        container.style.gridTemplateColumns = '1fr 1fr';
    }
    
    const initializeInputs = (n) => {
        if (!n.isGate && n.value !== '0' && n.value !== '1') {
            if (simInputStates[n.value] === undefined) simInputStates[n.value] = false;
        }
        if (n.children) n.children.forEach(initializeInputs);
    };
    const origDepth = getGateDepth(circuitData.original);
    const simpDepth = getGateDepth(circuitData.simplified);

    if (resetZoom) {
        simInputStates = {}; 
        if (!isDummy && origDepth <= 99) initializeInputs(circuitData.original);
        if (circuitData.simplified && simpDepth <= 99) initializeInputs(circuitData.simplified);
    }
    
    const injectSVG = (scrollEl, html) => {
        scrollEl.innerHTML = '';
        const ghost = document.createElement('div');
        ghost.innerHTML = html;
        const newWrapper = ghost.firstElementChild;
        if (newWrapper) scrollEl.appendChild(newWrapper);
    };

    // Render original simulation if not dummy
    if (!isDummy) {
        if (origDepth > 99) {
            origSimScroll.innerHTML = '<div class="exceeded-msg">Original simulation exceeds 99 levels of gates.</div>';
        } else {
            injectSVG(origSimScroll, generateSVGForSimulation(circuitData.original, 'o', 'simOrig'));
        }
    }
    
    // Render simplified simulation if available
    if (simpDepth > 99) {
        simpSimScroll.innerHTML = '<div class="exceeded-msg">Simplified simulation exceeds 99 levels of gates.</div>';
    } else if (circuitData.simplified) {
        injectSVG(simpSimScroll, generateSVGForSimulation(circuitData.simplified, 's', 'simSimp'));
    } else {
        simpSimScroll.innerHTML = getLoadingOrEmptyMsg('No simplified circuit');
    }
    
    // Attach click listeners to all toggles in both panels
    const attachToggles = (scrollEl) => {
        const toggles = scrollEl.querySelectorAll('.sim-toggle');
        toggles.forEach(t => {
            t.addEventListener('click', () => toggleSimInput(t.getAttribute('data-var')));
        });
    };
    
    if (!isDummy && origDepth <= 99) attachToggles(origSimScroll);
    if (simpDepth <= 99) attachToggles(simpSimScroll);
    
    if (!isDummy && origDepth <= 99) {
        const firstInit = !container.dataset.zoomOrigInitialized;
        if (resetZoom || firstInit) {
            fitToContainer('simOrig');
        } else {
            delete _metricsCache['simOrig'];
            const m = _measureMetrics('simOrig');
            if (m && _contentSizeChanged('simOrig', m.w, m.h)) {
                fitToContainer('simOrig');
            } else {
                applyZoom('simOrig', false);
            }
        }
        if (firstInit) {
            initPanAndZoom('original-sim-scroll', 'simOrig');
            container.dataset.zoomOrigInitialized = 'true';
            const origSimPanel = document.getElementById('original-sim-panel');
            document.getElementById('zoom-in-sim-orig').onclick = () => zoomAtPoint('simOrig', 1.15, origSimPanel.clientWidth / 2, origSimPanel.clientHeight / 2, true);
            document.getElementById('zoom-out-sim-orig').onclick = () => zoomAtPoint('simOrig', 0.85, origSimPanel.clientWidth / 2, origSimPanel.clientHeight / 2, true);
            document.getElementById('zoom-fullscreen-sim-orig').onclick = () => openPanelFullscreen('simOrig');
        }
    }

    if (simpDepth <= 99 && circuitData.simplified) {
        const firstInit = !container.dataset.zoomSimpInitialized;
        if (resetZoom || firstInit) {
            fitToContainer('simSimp');
        } else {
            delete _metricsCache['simSimp'];
            const m = _measureMetrics('simSimp');
            if (m && _contentSizeChanged('simSimp', m.w, m.h)) {
                fitToContainer('simSimp');
            } else {
                applyZoom('simSimp', false);
            }
        }
        if (firstInit) {
            const simpSimPanel = document.getElementById('simplified-sim-panel');
            if (simpSimPanel) {
                initPanAndZoom('simplified-sim-scroll', 'simSimp');
                container.dataset.zoomSimpInitialized = 'true';

                document.getElementById('zoom-in-sim-simp').onclick = () => zoomAtPoint('simSimp', 1.15, simpSimPanel.clientWidth / 2, simpSimPanel.clientHeight / 2, true);
                document.getElementById('zoom-out-sim-simp').onclick = () => zoomAtPoint('simSimp', 0.85, simpSimPanel.clientWidth / 2, simpSimPanel.clientHeight / 2, true);
                document.getElementById('zoom-fullscreen-sim-simp').onclick = () => openPanelFullscreen('simSimp');
            }
        }
    }
}

function getGateOutputPinRange(type, x, numInputs = 2) {
    if (type === 'NOT') {
        return { startX: x + 22, endX: x + 34 };
    }
    let r = 25;
    if (numInputs === 3) r = 30;
    else if (numInputs === 4) r = 35;
    else if (numInputs > 4) r = 40;

    if (type === 'NAND' || type === 'NOR' || type === 'XNOR') {
        return { startX: x + r + 10, endX: x + r + 22 };
    }
    return { startX: x + r, endX: x + r + 12 }; // AND, OR, default
}

function getSimGateSilkscreen(type, x, y, panelId = 'p', numInputs = 2) {
    let inner = '';
    const offset = 2.5; // Offset to draw silkscreen slightly outside the gate body
    let r = 25;
    if (numInputs === 3) r = 30;
    else if (numInputs === 4) r = 35;
    else if (numInputs > 4) r = 40;

    const ro = r + offset;

    if (type === 'AND') {
        inner = `<path d="M ${x-25-offset} ${y-ro} L ${x} ${y-ro} A ${ro} ${ro} 0 0 1 ${x} ${y+ro} L ${x-25-offset} ${y+ro} Z" />`;
    } else if (type === 'OR') {
        inner = `<path d="M ${x-25-offset} ${y-ro} Q ${x-8} ${y} ${x-25-offset} ${y+ro} Q ${x+10+offset} ${y+ro} ${x+ro} ${y} Q ${x+10+offset} ${y-ro} ${x-25-offset} ${y-ro} Z" />`;
    } else if (type === 'NOT') {
        inner = `<path d="M ${x-20-offset} ${y-20-offset} L ${x+10+offset} ${y} L ${x-20-offset} ${y+20+offset} Z" />
                 <circle cx="${x+16}" cy="${y}" r="${6+offset}" />`;
    } else if (type === 'NAND') {
        inner = `<path d="M ${x-25-offset} ${y-ro} L ${x} ${y-ro} A ${ro} ${ro} 0 0 1 ${x} ${y+ro} L ${x-25-offset} ${y+ro} Z" />
                 <circle cx="${x+r+5}" cy="${y}" r="${5+offset}" />`;
    } else if (type === 'NOR') {
        inner = `<path d="M ${x-25-offset} ${y-ro} Q ${x-8} ${y} ${x-25-offset} ${y+ro} Q ${x+10+offset} ${y+ro} ${x+ro} ${y} Q ${x+10+offset} ${y-ro} ${x-25-offset} ${y-ro} Z" />
                 <circle cx="${x+r+5}" cy="${y}" r="${5+offset}" />`;
    } else if (type === 'XOR') {
        inner = `<path d="M ${x-32-offset} ${y-ro} Q ${x-15} ${y} ${x-32-offset} ${y+ro}" fill="none" />
                 <path d="M ${x-25-offset} ${y-ro} Q ${x-8} ${y} ${x-25-offset} ${y+ro} Q ${x+10+offset} ${y+ro} ${x+ro} ${y} Q ${x+10+offset} ${y-ro} ${x-25-offset} ${y-ro} Z" />`;
    } else if (type === 'XNOR') {
        inner = `<path d="M ${x-32-offset} ${y-ro} Q ${x-15} ${y} ${x-32-offset} ${y+ro}" fill="none" />
                 <path d="M ${x-25-offset} ${y-ro} Q ${x-8} ${y} ${x-25-offset} ${y+ro} Q ${x+10+offset} ${y+ro} ${x+ro} ${y} Q ${x+10+offset} ${y-ro} ${x-25-offset} ${y-ro} Z" />
                 <circle cx="${x+r+5}" cy="${y}" r="${5+offset}" />`;
    } else {
        inner = `<rect x="${x-25-offset}" y="${y-ro}" width="${50+offset*2}" height="${r*2+offset*2}" rx="4" />`;
    }
    return `<g fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.6" filter="url(#silkscreen-${panelId})">${inner}</g>`;
}

function getSimGateShape(type, x, y, panelId = 'p', numInputs = 2) {
    let inner = '';
    let r = 25;
    if (numInputs === 3) r = 30;
    else if (numInputs === 4) r = 35;
    else if (numInputs > 4) r = 40;

    if (type === 'AND') {
        inner = `<path d="M ${x-25} ${y-r} L ${x} ${y-r} A ${r} ${r} 0 0 1 ${x} ${y+r} L ${x-25} ${y+r} Z" />`;
    } else if (type === 'OR') {
        inner = `<path d="M ${x-25} ${y-r} Q ${x-8} ${y} ${x-25} ${y+r} Q ${x+10} ${y+r} ${x+r} ${y} Q ${x+10} ${y-r} ${x-25} ${y-r} Z" />`;
    } else if (type === 'NOT') {
        inner = `<path d="M ${x-20} ${y-20} L ${x+10} ${y} L ${x-20} ${y+20} Z" />
                 <circle cx="${x+16}" cy="${y}" r="6" />`;
    } else if (type === 'NAND') {
        inner = `<path d="M ${x-25} ${y-r} L ${x} ${y-r} A ${r} ${r} 0 0 1 ${x} ${y+r} L ${x-25} ${y+r} Z" />
                 <circle cx="${x+r+5}" cy="${y}" r="5" />`;
    } else if (type === 'NOR') {
        inner = `<path d="M ${x-25} ${y-r} Q ${x-8} ${y} ${x-25} ${y+r} Q ${x+10} ${y+r} ${x+r} ${y} Q ${x+10} ${y-r} ${x-25} ${y-r} Z" />
                 <circle cx="${x+r+5}" cy="${y}" r="5" />`;
    } else if (type === 'XOR') {
        inner = `<path d="M ${x-32} ${y-r} Q ${x-15} ${y} ${x-32} ${y+r}" stroke="#111111" stroke-width="3" fill="none" />
                 <path d="M ${x-25} ${y-r} Q ${x-8} ${y} ${x-25} ${y+r} Q ${x+10} ${y+r} ${x+r} ${y} Q ${x+10} ${y-r} ${x-25} ${y-r} Z" />`;
    } else if (type === 'XNOR') {
        inner = `<path d="M ${x-32} ${y-r} Q ${x-15} ${y} ${x-32} ${y+r}" stroke="#111111" stroke-width="3" fill="none" />
                 <path d="M ${x-25} ${y-r} Q ${x-8} ${y} ${x-25} ${y+r} Q ${x+10} ${y+r} ${x+r} ${y} Q ${x+10} ${y-r} ${x-25} ${y-r} Z" />
                 <circle cx="${x+r+5}" cy="${y}" r="5" />`;
    } else {
        inner = `<rect x="${x-25}" y="${y-r}" width="50" height="${r*2}" rx="4" />`;
    }
    
    return `<g fill="#111111" filter="url(#plastic-3d-${panelId})">${inner}</g>`;
}

