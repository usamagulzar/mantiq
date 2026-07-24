
function _scrollIdFor(panelType) {
    if (panelType === 'orig') return 'original-circuit-scroll';
    if (panelType === 'simp') return 'simplified-circuit-scroll';
    if (panelType === 'simOrig') return 'original-sim-scroll';
    if (panelType === 'simSimp') return 'simplified-sim-scroll';
    return '';
}

// Per-panel cache of container/content metrics, populated once at the START
// of a gesture (mousedown/touchstart/wheel) and reused for every frame of
// that gesture, instead of calling getBoundingClientRect() on every single
// touchmove/wheel event. Repeatedly reading layout geometry while also
// writing style.transform every frame is classic layout-thrashing and was
// the main source of the pinch/drag lag — this caches the read so a gesture
// costs one layout read total, not one per frame.
let _metricsCache = {};

function _measureMetrics(panelType) {
    const scrollEl = document.getElementById(_scrollIdFor(panelType));
    const contentEl = scrollEl ? scrollEl.querySelector('.zoom-content-wrapper') : null;
    if (!scrollEl || !contentEl) return null;
    const containerRect = scrollEl.getBoundingClientRect();
    let cw = containerRect.width;
    let ch = containerRect.height;
    if (!cw || !ch) {
        const mainArea = document.querySelector('.main-content-area') || document.querySelector('.main-content') || document.body;
        const mainRect = mainArea.getBoundingClientRect();
        const container = document.getElementById('svg-circuit-container') || document.getElementById('simulation-container');
        const isSingle = container && container.classList.contains('single-panel-view');
        const mainW = mainRect.width > 0 ? mainRect.width : (window.innerWidth - 260);
        const mainH = mainRect.height > 0 ? mainRect.height : (window.innerHeight - 100);
        cw = isSingle ? Math.max(200, mainW - 40) : Math.max(200, (mainW - 60) / 2);
        ch = Math.max(200, mainH - 120);
    }
    const m = {
        scrollEl, contentEl,
        cw: cw,
        ch: ch,
        w: parseFloat(contentEl.style.width) || 400,
        h: parseFloat(contentEl.style.height) || 300
    };
    _metricsCache[panelType] = m;
    return m;
}

function _calcFitStyle(panelType, w, h) {
    let cw = 0, ch = 0;
    const scrollEl = document.getElementById(_scrollIdFor(panelType));
    if (scrollEl) {
        const rect = scrollEl.getBoundingClientRect();
        cw = rect.width;
        ch = rect.height;
    }
    if (!cw || !ch) {
        const mainArea = document.querySelector('.main-content-area') || document.querySelector('.main-content') || document.body;
        const mainRect = mainArea.getBoundingClientRect();
        const container = document.getElementById('svg-circuit-container') || document.getElementById('simulation-container');
        const isSingle = container && container.classList.contains('single-panel-view');
        const mainW = mainRect.width > 0 ? mainRect.width : (window.innerWidth - 260);
        const mainH = mainRect.height > 0 ? mainRect.height : (window.innerHeight - 100);
        cw = isSingle ? Math.max(200, mainW - 40) : Math.max(200, (mainW - 60) / 2);
        ch = Math.max(200, mainH - 120);
    }
    let scale = Math.min(cw / w, ch / h) * 0.9;
    scale = Math.max(0.05, scale);
    const x = (cw - w * scale) / 2;
    const y = (ch - h * scale) / 2;

    panelsState[panelType] = { x, y, scale, fitScale: scale, contentW: w, contentH: h };

    return `position: absolute; width: ${w}px; height: ${h}px; transform-origin: 0 0; transform: translate3d(${x}px, ${y}px, 0) scale3d(${scale}, ${scale}, 1);`;
}

// Call at the start of a drag/pinch/wheel gesture to cache metrics for its duration.
function _beginGesture(panelType) {
    return _measureMetrics(panelType);
}

// Call when a gesture ends so the next one measures fresh (handles resizes etc).
function _endGesture(panelType) {
    delete _metricsCache[panelType];
}

function _getMetrics(panelType) {
    return _metricsCache[panelType] || _measureMetrics(panelType);
}

/**
 * Clamp pan so content never leaves the container with dead space around it
 * beyond what the fit-to-container view already shows — the same rule real
 * photo viewers and map apps use: if the content is smaller than (or equal
 * to) the viewport at this scale, it's locked centered; only once you've
 * zoomed in past that point can you pan, and then only until the content's
 * edge reaches the container's edge.
 */
function _clampPan(state, cw, ch, w, h) {
    const scaledW = w * state.scale;
    const scaledH = h * state.scale;

    if (scaledW <= cw + 0.5) {
        state.x = (cw - scaledW) / 2;
    } else {
        state.x = Math.max(cw - scaledW, Math.min(0, state.x));
    }

    if (scaledH <= ch + 0.5) {
        state.y = (ch - scaledH) / 2;
    } else {
        state.y = Math.max(ch - scaledH, Math.min(0, state.y));
    }
}

function applyZoom(panelType, smooth = false) {
    const m = _getMetrics(panelType);
    if (!m) return;
    const state = panelsState[panelType];

    // Zoom-out limit: never smaller than the fit-to-container scale — that
    // view is already "as much of the circuit, as big as possible, fully
    // visible" by definition, so zooming out further would only add dead
    // space. This also means _clampPan's centered-lock branch above kicks in
    // exactly at that limit, so hitting the floor always settles centered.
    if (state.fitScale) {
        state.scale = Math.max(state.fitScale, state.scale);
    }

    _clampPan(state, m.cw, m.ch, m.w, m.h);

    m.contentEl.style.transition = smooth ? 'transform 0.15s ease-out' : 'none';
    // translate3d/scale3d (not translate/scale) is deliberate: this keeps the
    // element on a real GPU-composited layer on every single applied frame.
    // A 2D transform here can let WebKit fall back to stretching a cached
    // raster of the filtered gate shapes (plastic-3d/silkscreen) during
    // continuous pinch updates, which is what caused the blur.
    m.contentEl.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale3d(${state.scale}, ${state.scale}, 1)`;
}

/**
 * A composited layer (which scale3d/translate3d deliberately promotes onto,
 * see applyZoom above) is only rasterized by the browser occasionally, not
 * on every transform frame. Between rasterizations the GPU just stretches
 * the last cached bitmap of the SVG to match the current transform. That's
 * exactly what we want *during* an active drag/pinch (cheap, smooth), but
 * it means the element can be left showing a stretched, blurry bitmap once
 * the gesture ends and the transform stops changing, until something else
 * happens to force a repaint.
 *
 * Call this right after a zoom/pan gesture settles (pointerup, touchend,
 * wheel-zoom debounce, fullscreen open/close) to force the browser to drop
 * the cached bitmap and re-rasterize the SVG crisply at the final scale.
 */
function _forceCrispRepaint(el) {
    if (!el) return;
    const prevWillChange = el.style.willChange;
    el.style.willChange = 'auto';   // drop the promoted layer / cached raster
    void el.offsetHeight;           // flush layout (cheap, but transforms don't need this to repaint)

    // Demoting the layer only matters once the browser actually PAINTS in the
    // un-promoted state — offsetHeight only flushes layout, not paint. Without
    // waiting a real frame, the browser can defer that paint indefinitely until
    // something unrelated (e.g. a click anywhere else) forces a paint pass —
    // which is exactly the "blurry until I click a button" symptom. Two nested
    // rAFs guarantee a real paint happens in between before we re-promote.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.style.willChange = prevWillChange || 'transform';
        });
    });
}

