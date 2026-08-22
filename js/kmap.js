// KMap Colors for loops
const LOOP_COLORS = [
    '#007AFF', // Blue
    '#34C759', // Green
    '#FF3B30', // Red
    '#FF9500', // Orange
    '#AF52DE', // Purple
    '#5856D6', // Indigo
    '#FF2D55', // Pink
    '#5AC8FA', // Teal
    '#FFCC00', // Yellow
    '#00C7BE', // Cyan
    '#A2845E', // Brown
    '#FF6B22', // Coral
    '#E586C6', // Mauve
    '#8D99AE', // Slate
    '#4B8A08', // Dark Green
    '#B53A15'  // Rust
];

// Cell size (px) used only by the infinite Wrap view. Kept smaller than the
// Normal view's 80px cells so several repeated tiles are visible at once
// instead of just one screen's worth.
const WRAP_CELL_SIZE = 44;

// Currently-selected implicant term (a binary/don't-care pattern string like
// "1-0-"), clicked from the analysis board's Minimal Expression or Essential
// Prime Implicants sections. When set, every K-map view (normal, wrap, multi-
// plane, 3D) draws only that one group instead of the whole solution — the
// group keeps the exact color it already had (LOOP_COLORS[idx-in-solution]),
// nothing is recolored, only filtered. null means "show everything" (default).
let _selectedImplicantTerm = null;

// Term currently under the mouse in the analysis board (Minimal Expression /
// EPI lists). Kept separate from _selectedImplicantTerm so hovering never
// fights with a click-selection - hover just wins while it's active.
let _hoveredImplicantTerm = null;

/** Whichever term should currently be isolated on the K-map: hover beats a click-selection. */
function _effectiveImplicantTerm() {
    return _hoveredImplicantTerm !== null ? _hoveredImplicantTerm : _selectedImplicantTerm;
}

// Cached parameters from the most recent successful render, used by the
// fast SVG-only redraw path so term selection never rebuilds the DOM.
let _lastSVGDrawParams = null;
// Expose on window so the PNG export in app-core.js can read it without touching the SVG overlay
Object.defineProperty(window, '_lastSVGDrawParams', {
    get() { return _lastSVGDrawParams; },
    set(v) { _lastSVGDrawParams = v; },
    configurable: true
});

// Same idea as _lastSVGDrawParams, but for the Wrap view's tiled loop
// overlay, so selecting a term there redraws just the loops instead of
// rebuilding the whole tile grid (which would reset the user's pan/scroll).
let _lastWrapSVGDrawParams = null;

/** Redraw only the SVG loop overlay using cached render parameters. */
function _redrawSVGOnly() {
    if (!_lastSVGDrawParams) { renderHTMLKMap(); return; }
    const { solution, numVars, rowsBits, colsBits, rowGray, colGray, numPlanes, zGray, scale } = _lastSVGDrawParams;
    const svgOverlay = document.getElementById('kmap-svg-overlay');
    if (!svgOverlay) return;
    svgOverlay.setAttribute('width', svgOverlay.parentElement.clientWidth);
    svgOverlay.setAttribute('height', svgOverlay.parentElement.clientHeight);
    svgOverlay.innerHTML = '';
    if (numPlanes > 1) {
        for (let z = 0; z < numPlanes; z++) {
            drawSVGLoops(solution, numVars, rowsBits, colsBits, rowGray, colGray, true, zGray[z], scale);
        }
    } else {
        drawSVGLoops(solution, numVars, rowsBits, colsBits, rowGray, colGray, false, '', scale);
    }
}

/** Toggle selection of an implicant's K-map group from the analysis board. */
// Applies the .selected / .dimmed classes to the term-boxes in the analysis
// board to match the current _selectedImplicantTerm. This is a targeted
// class toggle rather than a full renderKMapAnalysis() re-render, so that a
// click doesn't blow away DOM state a full re-render would reset - most
// importantly, any <details> sections (EPI/NEPI/Canonical) the user has
// manually expanded, which renderKMapAnalysis() always redraws collapsed.
// Hover intentionally does NOT call this - bold/dim on the term list itself
// is a click-only affordance; hover only isolates the group on the K-map.
function _updateImplicantBoxClasses() {
    const list = document.getElementById('kmap-implicants-list');
    if (!list) return;
    list.querySelectorAll('.term-box.selectable-implicant').forEach(box => {
        const term = box.getAttribute('data-term');
        const isSelected = term === _selectedImplicantTerm;
        const isDimmed = _selectedImplicantTerm !== null && !isSelected;
        box.classList.toggle('selected', isSelected);
        box.classList.toggle('dimmed', isDimmed);
    });
}

function selectImplicantGroup(term) {
    _selectedImplicantTerm = (_selectedImplicantTerm === term) ? null : term;
    // The mouse is necessarily still over the box that was just clicked, so
    // without this, _hoveredImplicantTerm (still == term) would keep forcing
    // that one group to show even after a click just deselected it - the
    // K-map wouldn't visibly change until the mouse moved away. Syncing hover
    // to match the fresh click state makes the click always win instantly.
    _hoveredImplicantTerm = _selectedImplicantTerm;
    _updateImplicantBoxClasses();
    _redrawActiveKMapView();
}
window.selectImplicantGroup = selectImplicantGroup;

function renderHTMLKMap() {
    if (!wasmReady) return;

    // Cell toggles (and any typing) dispatch a synthetic 'input' event that
    // triggers a SYNCHRONOUS updateFrontend() call well before the debounced
    // (60ms) worker request even fires - let alone before the worker has
    // replied. While the KMap view is active, worker-bridge.js deliberately
    // keeps the previous kMapJSON cached across that gap (so switching views
    // doesn't flash empty) rather than clearing it - so at the moment of
    // this early call, `_state.kMapJSON` still holds the *previous* toggle's
    // data. Rendering it anyway is exactly the "noise" bug report: a flash
    // back to the old grid/groups that then gets corrected a beat later once
    // the real snapshot lands and calls updateFrontend() again.
    // `_state.computedForExpr` (see worker-bridge.js) exists precisely to
    // detect this: it only advances when a real snapshot comes back, so a
    // mismatch here means kMapJSON is stale for the expression currently set.
    // Bail out and leave whatever's already on screen alone - it's still the
    // most recently-computed K-map - rather than repaint with stale data.
    if (typeof _state !== 'undefined' && (typeof normalizeExprForCompare === 'function' ? normalizeExprForCompare(_state.computedForExpr) !== normalizeExprForCompare(_state.expression) : _state.computedForExpr !== _state.expression)) return;

    const jsonStr = queryWasmString('mantiq_getKMapJSON');
    const container = document.getElementById('kmap-grid-container');
    const svgOverlay = document.getElementById('kmap-svg-overlay');
    const implicantsList = document.getElementById('kmap-implicants-list');
    
    if (!jsonStr) {
        lastKMapData = null;
        if (container) container.innerHTML = getLoadingOrEmptyMsg('No expression processed yet');
        if (svgOverlay) svgOverlay.innerHTML = '';
        if (implicantsList) implicantsList.innerHTML = '';
        return;
    }
    
    try {
        lastKMapData = JSON.parse(jsonStr);
    } catch (e) {
        console.error("Failed to parse KMap JSON:", e);
        return;
    }

    const { variables, minterms, dontCares, solutions, solutionsPOS } = lastKMapData;
    const numVars = variables.length;

    // K-Map requires at least 2 variables — a 1-variable map is trivial and
    // meaningless in a Karnaugh context.
    if (numVars < 2) {
        if (container) {
            container.innerHTML = `
                <div class="kmap-unavailable-note">
                    <span>K-Map is only available for expressions with <strong>2 or more variables</strong>.</span>
                </div>`;
        }
        // Disable the wrap/fullscreen toolbar buttons
        const toggleBtn = document.getElementById('kmap-view-toggle-btn');
        const fsBtn = document.getElementById('kmap-fullscreen-btn');
        if (toggleBtn) { toggleBtn.disabled = true; toggleBtn.style.opacity = '0.35'; toggleBtn.style.pointerEvents = 'none'; }
        if (fsBtn) { fsBtn.disabled = true; fsBtn.style.opacity = '0.35'; fsBtn.style.pointerEvents = 'none'; }
        if (svgOverlay) svgOverlay.innerHTML = '';
        if (implicantsList) implicantsList.innerHTML = '';
        return;
    }

    const sopPosEl = document.getElementById('sop-pos-pill');
    const isSOP = sopPosEl ? sopPosEl.getAttribute('data-state') === 'sop' : true;
    const activeSolutions = isSOP ? solutions : solutionsPOS;
    let selectedIdx = typeof selectedSolutionIndex !== 'undefined' ? selectedSolutionIndex : 0;
    if (selectedIdx >= activeSolutions.length) selectedIdx = 0;
    
    const activeSolution = activeSolutions.length > 0 ? activeSolutions[selectedIdx] : [];

    // A selection from a previous expression (or the other SOP/POS side) may
    // no longer correspond to anything real — drop it rather than silently
    // filtering every group out of every view.
    if (_selectedImplicantTerm !== null) {
        const activeEPIsForValidity = isSOP ? lastKMapData.essentialPrimeImplicants : lastKMapData.essentialPrimeImplicantsPOS;
        const stillValid = activeSolution.includes(_selectedImplicantTerm) ||
            (activeEPIsForValidity && activeEPIsForValidity.includes(_selectedImplicantTerm));
        if (!stillValid) _selectedImplicantTerm = null;
    }

    // Re-enable the toolbar buttons (they may have been disabled by the 1-var early-out above)
    const toggleBtnReset = document.getElementById('kmap-view-toggle-btn');
    const fsBtnReset = document.getElementById('kmap-fullscreen-btn');
    if (toggleBtnReset) { toggleBtnReset.disabled = false; toggleBtnReset.style.opacity = ''; toggleBtnReset.style.pointerEvents = ''; }
    if (fsBtnReset) { fsBtnReset.disabled = false; fsBtnReset.style.opacity = ''; fsBtnReset.style.pointerEvents = ''; }

    // Setup K-Map view toggle button state
    const kmapViewToggleBtn = document.getElementById('kmap-view-toggle-btn');
    if (kmapViewToggleBtn) {
        if (numVars <= 4) {
            if (kmapViewMode === '3d') kmapViewMode = 'wrap';
            if (kmapViewMode !== 'normal' && kmapViewMode !== 'wrap') kmapViewMode = 'normal';
            
            kmapViewToggleBtn.title = kmapViewMode === 'normal' ? 'Switch to Wrap View' : 'Switch to Normal View';
            kmapViewToggleBtn.innerHTML = kmapViewMode === 'normal' 
                ? '<span style="font-family: \'Outfit\', sans-serif; font-size: 11px; font-weight: 700;">WRP</span>'
                : '<span style="font-family: \'Outfit\', sans-serif; font-size: 11px; font-weight: 700;">2D</span>';
            kmapViewToggleBtn.classList.toggle('active', kmapViewMode === 'wrap');
        } else {
            if (kmapViewMode === 'wrap') kmapViewMode = '3d';
            if (kmapViewMode !== 'normal' && kmapViewMode !== '3d') kmapViewMode = 'normal';

            kmapViewToggleBtn.title = kmapViewMode === 'normal' ? 'Switch to 3D View' : 'Switch to 2D View';
            kmapViewToggleBtn.innerHTML = kmapViewMode === 'normal'
                ? '<span style="font-family: \'Outfit\', sans-serif; font-size: 11px; font-weight: 700;">3D</span>'
                : '<span style="font-family: \'Outfit\', sans-serif; font-size: 11px; font-weight: 700;">2D</span>';
            kmapViewToggleBtn.classList.toggle('active', kmapViewMode === '3d');
        }
    }

    renderKMapAnalysis(activeSolution, isSOP, variables);

    if (numVars <= 4) {
        if (kmapViewMode === 'wrap') {
            renderWrapKMap(numVars, variables, minterms, dontCares, activeSolution, isSOP);
        } else {
            render2DKMap(numVars, variables, minterms, dontCares, activeSolution, isSOP, true);
        }
    } else {
        if (kmapViewMode === '3d') {
            render3DKMap(numVars, variables, minterms, dontCares, activeSolution, isSOP);
        } else {
            renderMultiple2DKMaps(numVars, variables, minterms, dontCares, activeSolution, isSOP);
        }
    }
}

function getGrayCodeStr(numBits) {
    if (numBits <= 0) return [""];
    if (numBits === 1) return ["0", "1"];
    if (numBits === 2) return ["00", "01", "11", "10"];
    const prev = getGrayCodeStr(numBits - 1);
    const result = [];
    for (let i = 0; i < prev.length; i++) {
        result.push("0" + prev[i]);
    }
    for (let i = prev.length - 1; i >= 0; i--) {
        result.push("1" + prev[i]);
    }
    return result;
}

function render2DKMap(numVars, variables, minterms, dontCares, activeSolution, isSOP, showLoops = false) {
    const container = document.getElementById('kmap-grid-container');
    const svgOverlay = document.getElementById('kmap-svg-overlay');
    const wrapper3d = document.getElementById('kmap-3d-container');
    const wrapContainer = document.getElementById('kmap-wrap-container');
    
    container.style.display = 'block';
    container.style.flexWrap = 'unset';
    container.style.gap = '0';
    container.style.justifyContent = 'unset';
    container.style.alignItems = 'unset';
    container.style.gridTemplateColumns = 'unset';
    container.classList.remove('kmap-small');
    container.style.transform = 'none'; // reset scale
    
    svgOverlay.style.display = 'block';
    if(wrapper3d) wrapper3d.style.display = 'none';
    if(wrapContainer) wrapContainer.style.display = 'none';

    let rowsBits = 1;
    let colsBits = 1;
    if (numVars === 3) { rowsBits = 1; colsBits = 2; }
    if (numVars === 4) { rowsBits = 2; colsBits = 2; }
    if (numVars === 2) { rowsBits = 1; colsBits = 1; }

    const rowVars = variables.slice(0, rowsBits);
    const colVars = variables.slice(rowsBits);
    
    const rowGray = getGrayCodeStr(rowsBits);
    const colGray = getGrayCodeStr(colsBits);
    
    let html = '<table class="kmap-table">';
    html += `<tr><th class="kmap-corner" style="position: relative; padding: 0; min-width: 40px; height: 40px;"><svg style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;"><line x1="0" y1="0" x2="100%" y2="100%" stroke="var(--border)" stroke-width="1.5" /></svg><div class="kmap-corner-col">${formatExprHtml(colVars.join(''))}</div><div class="kmap-corner-row">${formatExprHtml(rowVars.join(''))}</div></th>`;
    for (let c of colGray) { html += `<th style="height: 40px; vertical-align: bottom; padding-bottom: 2px;">${c}</th>`; }
    html += '</tr>';

    for (let r = 0; r < rowGray.length; r++) {
        html += `<tr><th style="width: 40px; text-align: right; padding-right: 4px;">${rowGray[r]}</th>`;
        for (let c = 0; c < colGray.length; c++) {
            const binaryStr = rowGray[r] + colGray[c];
            const minterm = parseInt(binaryStr, 2);
            let val = '0';
            if (minterms.includes(minterm)) val = '1';
            if (dontCares.includes(minterm)) val = 'X';
            
            html += `<td id="kmap-cell-${minterm}" class="kmap-cell val-${val}" data-minterm="${minterm}">`;
            html += `<div class="kmap-minterm-label">${minterm}</div>`;
            html += `${val}</td>`;
        }
        html += '</tr>';
    }
    html += '</table>';

    container.innerHTML = html;
    
    // Synchronous layout and scale
    const wrapper = document.getElementById('kmap-visual-wrapper');
    const rect = container.getBoundingClientRect();
    const availW = wrapper.clientWidth - 40;
    const availH = wrapper.clientHeight - 40;
    
    // Scale UP or DOWN to fit perfectly
    const isMobileKMap = window.innerWidth <= 900;
    let scale = Math.min(availW / rect.width, availH / rect.height);
    if (!isFinite(scale) || scale <= 0) scale = 1;
    if (isMobileKMap) {
        scale = Math.min(scale, 1); // keep the K-Map at its default size on mobile, never enlarge it
    } else if (scale > 2.2) {
        scale = 2.2; // Cap max scale so it doesn't get ridiculously huge
    }

    // The 4x4 K-map's cell size (at whatever scale it takes to fit this same
    // available area) is the reference "perfect" size. Smaller maps (2x2,
    // 2x4) have more free space to grow into, but should never end up with
    // bigger cells than that reference - so clamp their scale to whatever a
    // 4x4 map would use here, rather than filling all the extra space.
    const HEADER_PX = 50;
    const CELL_PX = 80;
    const refGridPx = HEADER_PX + 4 * CELL_PX;
    let maxScale4x4 = Math.min(availW / refGridPx, availH / refGridPx);
    if (!isFinite(maxScale4x4) || maxScale4x4 <= 0) maxScale4x4 = scale;
    if (maxScale4x4 > 2.2) maxScale4x4 = 2.2;
    if (numVars < 4) scale = Math.min(scale, maxScale4x4);
    
    container.style.transform = `scale(${scale})`;
    container.style.transformOrigin = 'center center';

    // SVG sizing and drawing must wait 1 tick for the DOM to reflect transform.
    requestAnimationFrame(() => {
        svgOverlay.setAttribute('width', svgOverlay.parentElement.clientWidth);
        svgOverlay.setAttribute('height', svgOverlay.parentElement.clientHeight);
        svgOverlay.innerHTML = '';
        if (showLoops && activeSolution && activeSolution.length > 0) {
            drawSVGLoops(activeSolution, numVars, rowsBits, colsBits, rowGray, colGray, false, '', scale);
        }
        _lastSVGDrawParams = { solution: activeSolution, numVars, rowsBits, colsBits, rowGray, colGray, numPlanes: 1, zGray: null, scale };
    });
}

function _parseShorthandExprStr(exprStr) {
    if (!exprStr) return null;
    const colonIdx = exprStr.indexOf(':');
    if (colonIdx === -1) return null;
    
    const varPart = exprStr.slice(0, colonIdx).trim();
    const mainPart = exprStr.slice(colonIdx + 1).trim();
    
    if (!varPart) return null;
    const variables = varPart.split(',').map(v => v.trim()).filter(Boolean);
    
    if (mainPart.match(/M\s*\(/)) return null;
    
    const mMatch = mainPart.match(/m\s*\(([^)]*)\)/i);
    const dMatch = mainPart.match(/d\s*\(([^)]*)\)/i);
    
    const minterms = [];
    if (mMatch && mMatch[1].trim()) {
        mMatch[1].split(',').forEach(n => {
            const val = parseInt(n.trim(), 10);
            if (!isNaN(val)) minterms.push(val);
        });
    }
    
    const dontCares = [];
    if (dMatch && dMatch[1].trim()) {
        dMatch[1].split(',').forEach(n => {
            const val = parseInt(n.trim(), 10);
            if (!isNaN(val)) dontCares.push(val);
        });
    }
    
    return { variables, minterms, dontCares };
}

// Instantly patches the clicked cell's value in whichever view(s) are
// currently in the DOM (normal/wrap/multi-plane share the same
// `.kmap-cell[data-minterm]` markup, and the 3D lattice keeps its cubes in
// kmap3DState._cubes), WITHOUT waiting for the debounced WASM round trip.
//
// Why this exists: renderHTMLKMap() intentionally bails out until
// _state.computedForExpr matches the live expression (see the comment at the
// top of that function) so it never flashes stale loop/implicant data. That
// guard is correct for the *analysis* (solutions, loops), but it also meant
// the grid's own 0/1/X value - something we already know synchronously,
// right here, from the click - sat frozen for the full worker round trip.
// That's what made toggles feel slow, and it's why a user who clicks again
// before that catches up ends up cycling the same cell twice (0->1->X)
// instead of the single toggle they intended - it wasn't actually "lost",
// it just looked that way because nothing on screen moved yet.
function _optimisticallyPatchKMapCell(minterm, val) {
    document.querySelectorAll(`.kmap-cell[data-minterm="${minterm}"]`).forEach(cell => {
        cell.classList.remove('val-0', 'val-1', 'val-X');
        cell.classList.add(`val-${val}`);
        const label = cell.querySelector('.kmap-minterm-label');
        cell.textContent = '';
        if (label) {
            cell.appendChild(label);
        } else {
            const d = document.createElement('div');
            d.className = 'kmap-minterm-label';
            d.textContent = String(minterm);
            cell.appendChild(d);
        }
        cell.appendChild(document.createTextNode(val));
    });

    // 3D lattice: recolor the matching cube in place, same as the fast
    // in-place update path inside render3DKMap().
    if (typeof kmap3DState !== 'undefined' && kmap3DState._cubes && kmap3DState._cubes.length) {
        const item = kmap3DState._cubes.find(c => !c.isLayerTag && c.minterm === minterm);
        if (item && item.sphere) {
            item.val = val;
            const colorKey = val === '1' ? 'one' : (val === 'X' ? 'dc' : 'zero');
            item.sphere.material.color.setHex(KMAP3D_COLOR[colorKey]);
        }
    }
}

function handleKMapCellClick(minterm) {
    if (kmapViewMode === 'wrap' && typeof wrapDragState !== 'undefined' && wrapDragState.hasMoved) {
        return;
    }

    const inputEl = document.getElementById('expression-input');
    const currentVal = inputEl ? inputEl.value.trim() : '';

    let variables = [];
    let minterms = [];
    let dontCares = [];

    let parsed = _parseShorthandExprStr(currentVal);
    if (parsed) {
        variables = parsed.variables;
        minterms = parsed.minterms;
        dontCares = parsed.dontCares;
    } else if (lastKMapData) {
        variables = lastKMapData.variables || [];
        minterms = lastKMapData.minterms || [];
        dontCares = lastKMapData.dontCares || [];
    } else {
        return;
    }

    let newMinterms = [...minterms];
    let newDontCares = [...dontCares];

    if (newDontCares.includes(minterm)) {
        newDontCares = newDontCares.filter(m => m !== minterm);
    } else if (newMinterms.includes(minterm)) {
        newMinterms = newMinterms.filter(m => m !== minterm);
        newDontCares.push(minterm);
    } else {
        newMinterms.push(minterm);
    }

    newMinterms.sort((a, b) => a - b);
    newDontCares.sort((a, b) => a - b);

    const newVal = newDontCares.includes(minterm) ? 'X' : (newMinterms.includes(minterm) ? '1' : '0');
    _optimisticallyPatchKMapCell(minterm, newVal);

    const parts = [];
    if (newMinterms.length > 0) parts.push(`m(${newMinterms.join(',')})`);
    if (newDontCares.length > 0) parts.push(`d(${newDontCares.join(',')})`);
    if (parts.length === 0) parts.push('m()');

    const newExpr = `${variables.join(',')}: ${parts.join(' ')}`;
    
    if (inputEl) inputEl.value = newExpr;

    if (lastKMapData) {
        lastKMapData.minterms = newMinterms;
        lastKMapData.dontCares = newDontCares;
    }
    
    if (typeof selectedSolutionIndex !== 'undefined') selectedSolutionIndex = 0;
    
    if (inputEl) {
        if (typeof Module !== 'undefined' && Module.ccall) {
            Module.ccall('mantiq_setExpression', null, ['string'], [inputEl.value]);
            if (typeof updateFrontend === 'function') updateFrontend();
        }
    }
}

// Same idea as computeAntiOverlapShrink, but operating on integer grid
// coordinates (row/col index ranges) instead of measured pixel rects. The
// normal 2D K-map is drawn inside a CSS-scaled container (transform:
// scale(...)), so two pieces' pixel edges - even when they're conceptually
// touching the same grid line - can end up a fraction of a pixel apart after
// scaling/rounding, which made the pixel-based epsilon check miss real
// adjacencies. Grid coordinates have no such rounding, so adjacency here is
// exact.
function computeAntiOverlapShrinkGrid(boxes) {
    const n = boxes.length;
    // Per-box, per-edge extra inset (not a single scalar) - a box should
    // only pull back on the specific side(s) that actually run into another
    // group's border, not shrink uniformly on all four sides just because
    // *some* edge somewhere had a conflict.
    const extra = boxes.map(() => ({ top: 0, bottom: 0, left: 0, right: 0 }));
    // Two boxes merely touching (adjacent, different boundary lines) never
    // need help here - each already measures its padding inward from its
    // own edge, so their drawn borders end up naturally separated by 2x the
    // base pad with no extra work. The only real problem case is two boxes
    // whose edges sit on the EXACT SAME boundary line while their interiors
    // overlap (e.g. both start at row 0) - both would then measure the same
    // base pad from the same line and land on identical pixels. For that
    // case only ONE of the two boxes should pull back further, not both -
    // bumping both by the same amount just moves them inward together and
    // leaves them exactly as coincident as before.
    const STEP = 6;
    const CAP = 18;
    const bump = (side, edge) => { side[edge] = Math.min(side[edge] + STEP, CAP); };

    for (let i = 0; i < n; i++) {
        if (!boxes[i]) continue;
        for (let j = i + 1; j < n; j++) {
            if (!boxes[j]) continue;
            const a = boxes[i], b = boxes[j];
            // Different fragments of the SAME wrapped group (e.g. the up to
            // four corner pieces of a four-corners loop) are one logical
            // loop, not two groups touching each other - never push them
            // apart from one another.
            if (a.idx === b.idx) continue;

            const rowOverlap = Math.min(a.rowHi, b.rowHi) - Math.max(a.rowLo, b.rowLo) + 1;
            const colOverlap = Math.min(a.colHi, b.colHi) - Math.max(a.colLo, b.colLo) + 1;

            // --- Horizontal boundaries (top/bottom): only matters while the
            // two boxes' column ranges actually overlap - push only the
            // later box (b) in, so its edge lands visibly inside a's ---
            if (colOverlap > 0) {
                if (a.rowLo === b.rowLo) bump(extra[j], 'top');
                if (a.rowHi === b.rowHi) bump(extra[j], 'bottom');
            }

            // --- Vertical boundaries (left/right): only matters while the
            // two boxes' row ranges actually overlap ---
            if (rowOverlap > 0) {
                if (a.colLo === b.colLo) bump(extra[j], 'left');
                if (a.colHi === b.colHi) bump(extra[j], 'right');
            }
        }
    }

    // --- Keep every fragment of the same wrapped group visually consistent ---
    // A group that wraps around an edge is split into several rectangular
    // pieces (see Pass 1 in drawSVGLoops), all sharing the same idx. The
    // loop above only bumps whichever fragment actually collides with
    // another group's edge, so a group with e.g. 4 corner fragments could
    // end up with 1 shrunk corner and 3 full-size ones - same loop, visibly
    // inconsistent border. Spread the largest per-side shrink found across
    // all of a group's fragments so the whole loop reads as one uniform
    // shape. This can't push a true wrap edge away from the map wall: wrap
    // sides are always drawn flush with 0 padding regardless of this value
    // (see padTop/padBottom/padLeft/padRight in drawSVGLoops).
    const byGroup = new Map();
    boxes.forEach((box, i) => {
        if (!box) return;
        if (!byGroup.has(box.idx)) byGroup.set(box.idx, []);
        byGroup.get(box.idx).push(i);
    });
    byGroup.forEach(indices => {
        if (indices.length <= 1) return;
        const maxSide = { top: 0, bottom: 0, left: 0, right: 0 };
        indices.forEach(i => {
            for (const side of ['top', 'bottom', 'left', 'right']) {
                maxSide[side] = Math.max(maxSide[side], extra[i][side]);
            }
        });
        indices.forEach(i => {
            for (const side of ['top', 'bottom', 'left', 'right']) {
                extra[i][side] = maxSide[side];
            }
        });
    });

    return extra;
}

// Given a list of raw (un-padded) bounding boxes {minX,minY,maxX,maxY} (or
// null for "no box"), figures out extra inset each box needs so that any
// pair of boxes sharing a boundary line (even for just one cell's worth of
// overlap) end up with visibly separated borders instead of drawing right
// on top of each other. Boxes can still touch/cross at a point — only a
// shared, overlapping *edge* gets pushed apart. Returns an array of extra
// px to add (on top of the normal pad) per box, indexed the same way.
function computeAntiOverlapShrink(rects) {
    const n = rects.length;
    const extra = new Array(n).fill(0);
    const eps = 2; // px tolerance for "the same line" (float/rounding slack)

    for (let i = 0; i < n; i++) {
        if (!rects[i]) continue;
        for (let j = i + 1; j < n; j++) {
            if (!rects[j]) continue;
            const a = rects[i], b = rects[j];

            const xOverlap = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
            const yOverlap = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);

            const sharesHorizEdge = xOverlap > eps && (
                Math.abs(a.minY - b.minY) < eps || Math.abs(a.minY - b.maxY) < eps ||
                Math.abs(a.maxY - b.minY) < eps || Math.abs(a.maxY - b.maxY) < eps
            );
            const sharesVertEdge = yOverlap > eps && (
                Math.abs(a.minX - b.minX) < eps || Math.abs(a.minX - b.maxX) < eps ||
                Math.abs(a.maxX - b.minX) < eps || Math.abs(a.maxX - b.maxX) < eps
            );

            if (sharesHorizEdge || sharesVertEdge) {
                // Shrink the later box a bit more so the shared line separates.
                extra[j] = Math.min(extra[j] + 4, 14);
            }
        }
    }
    return extra;
}

// Given a boolean membership array over a cyclic axis (row or column indices
// in Gray-code order, where index 0 and the last index are the two cells
// physically adjacent across the map's edge), splits it into 1+ linear
// (non-wrapping) runs. Because valid K-map groups are always contiguous once
// wraparound is accounted for, membership is either: (a) the whole axis,
// (b) a single contiguous run touching neither end specially, or (c) exactly
// two runs — one touching index 0, one touching the last index — which
// together are really one run that wraps across the array boundary (e.g. a
// four-corners group). Each returned run is tagged with which of its edges,
// if any, is the "wrap" edge — the edge that faces where the group actually
// continues on the opposite side of the map, rather than a true boundary.
function computeAxisRuns(present) {
    const L = present.length;
    if (present.every(p => p)) {
        return [{ lo: 0, hi: L - 1, wrapLow: false, wrapHigh: false }];
    }
    const runs = [];
    let i = 0;
    while (i < L) {
        if (!present[i]) { i++; continue; }
        let j = i;
        while (j + 1 < L && present[j + 1]) j++;
        runs.push({ lo: i, hi: j });
        i = j + 1;
    }
    if (runs.length <= 1) {
        return runs.map(r => ({ lo: r.lo, hi: r.hi, wrapLow: false, wrapHigh: false }));
    }
    // Multiple runs on a cyclic axis: the run touching index 0 wraps on its
    // low side, the run touching the last index wraps on its high side.
    return runs.map(r => ({
        lo: r.lo,
        hi: r.hi,
        wrapLow: r.lo === 0,
        wrapHigh: r.hi === L - 1
    }));
}

// Draws one rectangular piece of a group's outline at (x,y,w,h). Sides
// flagged in wrapSides are the ones where the group actually continues on
// the opposite edge of the map (rather than truly ending there) — those
// sides are simply left open (no line drawn), so the group reads as
// disappearing into that wall and continuing on the other side, instead of
// falsely implying a boundary there.
function drawLoopPieceSVG(svg, x, y, w, h, color, wrapSides, scale) {
    const r = Math.min(12 * scale, w / 2, h / 2);
    const strokeWidth = Math.max(1, 3 * scale);
    const x2 = x + w, y2 = y + h;

    // A corner is only rounded when both of the sides that meet there are
    // real boundaries. If either adjacent side is a wrap edge, that corner
    // is left sharp/flush instead — it isn't a real corner, it's a straight
    // cut where the shape keeps going through the wall.
    const roundTL = !(wrapSides.top || wrapSides.left);
    const roundTR = !(wrapSides.top || wrapSides.right);
    const roundBR = !(wrapSides.bottom || wrapSides.right);
    const roundBL = !(wrapSides.bottom || wrapSides.left);

    const rTL = roundTL ? r : 0;
    const rTR = roundTR ? r : 0;
    const rBR = roundBR ? r : 0;
    const rBL = roundBL ? r : 0;

    // Fill: a single closed outline that matches the same "chopped pill"
    // shape — rounded on real corners, flat/cropped on wrap corners.
    const fillPath =
        `M ${x + rTL} ${y} ` +
        `L ${x2 - rTR} ${y} ` +
        (rTR > 0 ? `A ${rTR} ${rTR} 0 0 1 ${x2} ${y + rTR} ` : `L ${x2} ${y} `) +
        `L ${x2} ${y2 - rBR} ` +
        (rBR > 0 ? `A ${rBR} ${rBR} 0 0 1 ${x2 - rBR} ${y2} ` : `L ${x2} ${y2} `) +
        `L ${x + rBL} ${y2} ` +
        (rBL > 0 ? `A ${rBL} ${rBL} 0 0 1 ${x} ${y2 - rBL} ` : `L ${x} ${y2} `) +
        `L ${x} ${y + rTL} ` +
        (rTL > 0 ? `A ${rTL} ${rTL} 0 0 1 ${x + rTL} ${y} ` : `L ${x} ${y} `) +
        `Z`;

    const fill = document.createElementNS("http://www.w3.org/2000/svg", "path");
    fill.setAttribute("d", fillPath);
    fill.setAttribute("fill", color);
    fill.setAttribute("fill-opacity", "0.2");
    svg.appendChild(fill);

    // Stroke: the exact same outline, except the wrap side(s) are left open
    // (no line, so the box reads as disappearing into the wall) and only
    // the real corners get an arc — matching the rounded style of normal
    // groups everywhere the box isn't touching a wall.
    const segs = [
        !wrapSides.top    && `M ${x + rTL} ${y} L ${x2 - rTR} ${y}`,
        roundTR           && `M ${x2 - rTR} ${y} A ${rTR} ${rTR} 0 0 1 ${x2} ${y + rTR}`,
        !wrapSides.right  && `M ${x2} ${y + rTR} L ${x2} ${y2 - rBR}`,
        roundBR           && `M ${x2} ${y2 - rBR} A ${rBR} ${rBR} 0 0 1 ${x2 - rBR} ${y2}`,
        !wrapSides.bottom && `M ${x2 - rBR} ${y2} L ${x + rBL} ${y2}`,
        roundBL           && `M ${x + rBL} ${y2} A ${rBL} ${rBL} 0 0 1 ${x} ${y2 - rBL}`,
        !wrapSides.left   && `M ${x} ${y2 - rBL} L ${x} ${y + rTL}`,
        roundTL           && `M ${x} ${y + rTL} A ${rTL} ${rTL} 0 0 1 ${x + rTL} ${y}`,
    ].filter(Boolean);

    if (segs.length === 0) return;

    const stroke = document.createElementNS("http://www.w3.org/2000/svg", "path");
    stroke.setAttribute("d", segs.join(' '));
    stroke.setAttribute("fill", "none");
    stroke.setAttribute("stroke", color);
    stroke.setAttribute("stroke-width", String(strokeWidth));
    stroke.setAttribute("stroke-linecap", "butt");
    svg.appendChild(stroke);
}

function drawSVGLoops(solution, numVars, rowsBits, colsBits, rowGray, colGray, is3D, zOffset, scale = 1) {
    const svg = document.getElementById('kmap-svg-overlay');
    if (!is3D) {
        svg.innerHTML = '';
        svg.setAttribute('width', svg.parentElement.clientWidth);
        svg.setAttribute('height', svg.parentElement.clientHeight);
    }
    
    if (!solution || solution.length === 0) return;

    const wrapperRect = svg.parentElement.getBoundingClientRect();
    const zBits = numVars - rowsBits - colsBits;

    // Pass 1: for every group, split it into non-wrapping rectangular pieces
    // — a group needs more than one piece only when it wraps around an edge
    // of the map (e.g. a four-corners group needs four small pieces instead
    // of one box covering the whole map) — and compute each piece's raw
    // (un-padded) pixel box.
    const pieces = [];
    solution.forEach((term, idx) => {
        // A selection restricts which group(s) get drawn, but idx (and so
        // color) still comes from this term's position in the full solution —
        // selecting doesn't recolor anything, only hides the rest.
        const _effTerm = _effectiveImplicantTerm();
        if (_effTerm !== null && term !== _effTerm) return;

        const zPart = term.slice(0, zBits);
        for (let k = 0; k < zBits; k++) {
            if (zPart[k] !== '-' && zPart[k] !== zOffset[k]) return; // term doesn't touch this plane
        }
        const rowBits = term.slice(zBits, zBits + rowsBits);
        const colBits = term.slice(zBits + rowsBits, zBits + rowsBits + colsBits);

        const rowPresent = rowGray.map(g => {
            for (let k = 0; k < rowsBits; k++) if (rowBits[k] !== '-' && rowBits[k] !== g[k]) return false;
            return true;
        });
        const colPresent = colGray.map(g => {
            for (let k = 0; k < colsBits; k++) if (colBits[k] !== '-' && colBits[k] !== g[k]) return false;
            return true;
        });
        if (!rowPresent.some(Boolean) || !colPresent.some(Boolean)) return;

        const rowRuns = computeAxisRuns(rowPresent);
        const colRuns = computeAxisRuns(colPresent);

        rowRuns.forEach(rowRun => {
            colRuns.forEach(colRun => {
                const tlBin = zOffset + rowGray[rowRun.lo] + colGray[colRun.lo];
                const brBin = zOffset + rowGray[rowRun.hi] + colGray[colRun.hi];
                const tlCell = document.getElementById(`kmap-cell-${parseInt(tlBin, 2)}`);
                const brCell = document.getElementById(`kmap-cell-${parseInt(brBin, 2)}`);
                if (!tlCell || !brCell) return;

                const tlRect = tlCell.getBoundingClientRect();
                const brRect = brCell.getBoundingClientRect();

                pieces.push({
                    idx,
                    rect: {
                        minX: tlRect.left - wrapperRect.left,
                        minY: tlRect.top - wrapperRect.top,
                        maxX: brRect.right - wrapperRect.left,
                        maxY: brRect.bottom - wrapperRect.top
                    },
                    rowLo: rowRun.lo, rowHi: rowRun.hi,
                    colLo: colRun.lo, colHi: colRun.hi,
                    wrapTop: rowRun.wrapLow,
                    wrapBottom: rowRun.wrapHigh,
                    wrapLeft: colRun.wrapLow,
                    wrapRight: colRun.wrapHigh
                });
            });
        });
    });

    if (pieces.length === 0) return;

    // Pass 2: figure out which pieces share an overlapping edge (checked in
    // grid-cell coordinates, not pixels - see computeAntiOverlapShrinkGrid).
    // This returns a per-edge (top/bottom/left/right) shrink per piece, not
    // a single scalar — a piece only pulls back on the specific side(s)
    // that actually conflict with another group, and a conflict on one
    // fragment of a wrapped group no longer bleeds into shrinking that
    // group's other, unrelated fragments elsewhere on the map.
    const extraShrink = computeAntiOverlapShrinkGrid(pieces.map(p => ({
        idx: p.idx, rowLo: p.rowLo, rowHi: p.rowHi, colLo: p.colLo, colHi: p.colHi
    })));

    // Pass 3: draw, using the base pad plus any anti-overlap shrink - both
    // scaled down with the map itself, so a shrunk K-map gets proportionally
    // thinner gaps/borders instead of the same fixed pixel amounts eating up
    // a much bigger share of its smaller cells. Wrap edges are drawn dashed
    // instead of solid.
    pieces.forEach((piece, i) => {
        const color = LOOP_COLORS[piece.idx % LOOP_COLORS.length];
        const r = piece.rect;
        const s = extraShrink[i];
        // Wrap sides must stay flush against the map's edge — a piece is
        // only padded away from the wall on the sides that are real
        // boundaries, so the cropped/open side always touches the wall
        // instead of leaving a gap.
        const padTop = piece.wrapTop ? 0 : (5 + s.top) * scale;
        const padBottom = piece.wrapBottom ? 0 : (5 + s.bottom) * scale;
        const padLeft = piece.wrapLeft ? 0 : (5 + s.left) * scale;
        const padRight = piece.wrapRight ? 0 : (5 + s.right) * scale;
        const w = Math.max(2, (r.maxX - r.minX) - padLeft - padRight);
        const h = Math.max(2, (r.maxY - r.minY) - padTop - padBottom);
        drawLoopPieceSVG(svg, r.minX + padLeft, r.minY + padTop, w, h, color, {
            top: piece.wrapTop, bottom: piece.wrapBottom, left: piece.wrapLeft, right: piece.wrapRight
        }, scale);
    });
}

function renderMultiple2DKMaps(numVars, variables, minterms, dontCares, activeSolution, isSOP) {
    const container = document.getElementById('kmap-grid-container');
    const svgOverlay = document.getElementById('kmap-svg-overlay');
    const wrapper3d = document.getElementById('kmap-3d-container');
    const wrapContainer = document.getElementById('kmap-wrap-container');

    if (typeof _stopKmap3DAnimLoops === 'function') _stopKmap3DAnimLoops();
    container.style.display = 'grid';
    container.style.gap = '20px';
    container.style.justifyContent = 'center';
    container.style.alignItems = 'center';
    container.style.gridTemplateColumns = 'repeat(2, max-content)';
    container.classList.remove('kmap-small');
    container.style.transform = 'none'; // reset before measure
    
    svgOverlay.style.display = 'block';

    if(wrapper3d) wrapper3d.style.display = 'none';
    if(wrapContainer) wrapContainer.style.display = 'none';

    const subVars = variables.slice(numVars - 4);
    const rowVars = subVars.slice(0, 2);
    const colVars = subVars.slice(2);
    
    const rowGray = getGrayCodeStr(2);
    const colGray = getGrayCodeStr(2);
    
    const zVars = variables.slice(0, Math.max(0, numVars - 4));
    const zGray = getGrayCodeStr(numVars - 4);
    const numPlanes = (zGray && zGray.length > 0) ? zGray.length : (1 << Math.max(0, numVars - 4));
    
    let html = '';
    for (let z = 0; z < numPlanes; z++) {
        const zPrefix = (zGray && zGray[z] !== undefined) ? zGray[z] : '';
        const planeName = zVars.map((v, idx) => `${v}=${(zPrefix && zPrefix[idx] !== undefined) ? zPrefix[idx] : '0'}`).join(', ');
        
        html += `<div class="kmap-plane-wrapper" style="text-align:center;">`;
        html += `<div style="font-weight:bold; margin-bottom: 10px; color:var(--accent);">${formatExprHtml(planeName)}</div>`;
        html += '<table class="kmap-table" style="margin: 0 auto;">';
        html += `<tr><th class="kmap-corner" style="position: relative; padding: 0; min-width: 40px; height: 40px;"><svg style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;"><line x1="0" y1="0" x2="100%" y2="100%" stroke="var(--border)" stroke-width="1.5" /></svg><div class="kmap-corner-col">${formatExprHtml(colVars.join(''))}</div><div class="kmap-corner-row">${formatExprHtml(rowVars.join(''))}</div></th>`;
        for (let c of colGray) { html += `<th style="height: 40px; vertical-align: bottom; padding-bottom: 2px;">${c}</th>`; }
        html += '</tr>';
        
        for (let r = 0; r < rowGray.length; r++) {
            html += `<tr><th style="width: 40px; text-align: right; padding-right: 4px;">${rowGray[r]}</th>`;
            for (let c = 0; c < colGray.length; c++) {
                const binStr = zPrefix + rowGray[r] + colGray[c];
                const minterm = parseInt(binStr, 2);
                let val = '0';
                if (minterms.includes(minterm)) val = '1';
                if (dontCares.includes(minterm)) val = 'X';
                
                html += `<td id="kmap-cell-${minterm}" class="kmap-cell val-${val}" data-minterm="${minterm}">`;
                html += `<div class="kmap-minterm-label">${minterm}</div>`;
                html += `${val}</td>`;
            }
            html += '</tr>';
        }
        html += '</table></div>';
    }
    container.innerHTML = html;

    const wrapper = document.getElementById('kmap-visual-wrapper');
    const isMobileKMap = window.innerWidth <= 900;

    // Reading offsetWidth forces the browser to flush pending layout so the
    // subsequent getBoundingClientRect reflects the new innerHTML immediately,
    // with no rAF delay and no visible intermediate frame.
    void container.offsetWidth;

    const rect = container.getBoundingClientRect();
    const pad = isMobileKMap ? 24 : 40;
    const availW = wrapper.clientWidth - pad;
    const availH = wrapper.clientHeight - pad;
    let scale = Math.min(availW / rect.width, availH / rect.height);
    if (!isFinite(scale) || scale <= 0) scale = 1;
    if (isMobileKMap) {
        scale = Math.min(scale, 1);
    } else if (scale > 1.6) {
        scale = 1.6;
    }

    container.style.transform = `scale(${scale})`;
    container.style.transformOrigin = 'center center';

    // Reading offsetWidth again flushes the transform so cell rects are
    // correct when drawSVGLoops measures them below.
    void container.offsetWidth;

    svgOverlay.setAttribute('width', svgOverlay.parentElement.clientWidth);
    svgOverlay.setAttribute('height', svgOverlay.parentElement.clientHeight);
    svgOverlay.innerHTML = '';
    for (let z = 0; z < numPlanes; z++) {
        drawSVGLoops(activeSolution, numVars, 2, 2, rowGray, colGray, true, zGray[z], scale);
    }
    _lastSVGDrawParams = { solution: activeSolution, numVars, rowsBits: 2, colsBits: 2, rowGray, colGray, numPlanes, zGray, scale };
}

/** Draws one piece of a group loop on 2D Canvas with smooth continuous corners, rounded real corners, and wrapped dashes. */
function drawLoopPieceCanvas(ctx, x, y, w, h, color, wrapSides, scale) {
    const r = Math.min(14 * scale, w / 2, h / 2);
    const strokeWidth = Math.max(1.5, 3 * scale);
    const x2 = x + w, y2 = y + h;

    const roundTL = !(wrapSides.top || wrapSides.left);
    const roundTR = !(wrapSides.top || wrapSides.right);
    const roundBR = !(wrapSides.bottom || wrapSides.right);
    const roundBL = !(wrapSides.bottom || wrapSides.left);

    const rTL = roundTL ? r : 0;
    const rTR = roundTR ? r : 0;
    const rBR = roundBR ? r : 0;
    const rBL = roundBL ? r : 0;

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // 1. Build the single continuous outline path
    ctx.beginPath();
    ctx.moveTo(x + rTL, y);
    ctx.lineTo(x2 - rTR, y);
    if (rTR > 0) ctx.arcTo(x2, y, x2, y + rTR, rTR); else ctx.lineTo(x2, y);
    ctx.lineTo(x2, y2 - rBR);
    if (rBR > 0) ctx.arcTo(x2, y2, x2 - rBR, y2, rBR); else ctx.lineTo(x2, y2);
    ctx.lineTo(x + rBL, y2);
    if (rBL > 0) ctx.arcTo(x, y2, x, y2 - rBL, rBL); else ctx.lineTo(x, y2);
    ctx.lineTo(x, y + rTL);
    if (rTL > 0) ctx.arcTo(x, y, x + rTL, y, rTL); else ctx.lineTo(x, y);
    ctx.closePath();

    // 2. Fill background
    ctx.fillStyle = color + '30'; // ~19% fill opacity
    ctx.fill();

    // 3. Stroke entire continuous contour for unbroken round corners
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();

    // 4. Overlay dashed lines over wrapped edges (if any)
    const hasWrap = wrapSides.top || wrapSides.right || wrapSides.bottom || wrapSides.left;
    if (hasWrap) {
        const drawDashEdge = (x1, y1, x2, y2) => {
            ctx.beginPath();
            ctx.setLineDash([4 * scale, 4 * scale]);
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        };

        if (wrapSides.top) drawDashEdge(x + rTL, y, x2 - rTR, y);
        if (wrapSides.right) drawDashEdge(x2, y + rTR, x2, y2 - rBR);
        if (wrapSides.bottom) drawDashEdge(x2 - rBR, y2, x + rBL, y2);
        if (wrapSides.left) drawDashEdge(x, y2 - rBL, x, y + rTL);
    }

    ctx.restore();
}

/** Pure 2D Canvas direct K-Map PNG exporter — renders K-Map grid and group loops directly onto canvas with 100% sub-pixel accuracy, zero DOM dependencies, and zero html2canvas/SVG rasterization issues. */
function exportKMapPNGDirect() {
    console.log('[KMap Exporter v2.2.43] Direct 2D Canvas rendering starting...');
    if (!lastKMapData || !_lastSVGDrawParams) {
        if (typeof showToast === 'function') showToast('No K-Map available to export', 'error');
        return;
    }

    const { variables, minterms, dontCares } = lastKMapData;
    const { solution, numVars, rowsBits, colsBits, rowGray, colGray, numPlanes, zGray } = _lastSVGDrawParams;

    const SCALE = 2;
    const cellW = 75 * SCALE;
    const cellH = 75 * SCALE;
    const cornerW = 42 * SCALE;
    const cornerH = 38 * SCALE;

    const numRows = rowGray.length;
    const numCols = colGray.length;

    const tableW = cornerW + numCols * cellW;
    const tableH = cornerH + numRows * cellH;

    const cardPaddingX = 24 * SCALE;
    const cardPaddingTop = (numPlanes > 1 ? 55 : 30) * SCALE;
    const cardPaddingBottom = 25 * SCALE;

    const cardW = tableW + cardPaddingX * 2;
    const cardH = tableH + cardPaddingTop + cardPaddingBottom;

    const gapBetweenCards = 30 * SCALE;
    const outerMargin = 30 * SCALE;
    const watermarkH = 50 * SCALE;

    const planesCount = numPlanes || 1;
    const totalW = outerMargin * 2 + planesCount * cardW + (planesCount - 1) * gapBetweenCards;
    const totalH = outerMargin * 2 + cardH + watermarkH;

    const canvas = document.createElement('canvas');
    canvas.width = totalW;
    canvas.height = totalH;
    const ctx = canvas.getContext('2d');

    // Theme colors matching app UI
    const rootStyle = getComputedStyle(document.documentElement);
    const isDark = document.body.classList.contains('dark-theme') || 
                   (rootStyle.getPropertyValue('--bg-primary') && rootStyle.getPropertyValue('--bg-primary').trim().startsWith('#0'));
    
    const bgColor = isDark ? '#0F172A' : '#F8FAFC';
    const cardBgColor = isDark ? '#1E293B' : '#FFFFFF';
    const borderColor = isDark ? '#334155' : '#E2E8F0';
    const textPrimary = isDark ? '#F8FAFC' : '#1E293B';
    const textMuted = isDark ? '#94A3B8' : '#64748B';
    const accentColor = isDark ? '#3B82F6' : '#2563EB';

    // 1. Draw Canvas Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, totalW, totalH);

    // Variable splits
    const subVars = variables.slice(numVars - (rowsBits + colsBits));
    const rowVars = subVars.slice(0, rowsBits);
    const colVars = subVars.slice(rowsBits);
    const zVars = variables.slice(0, Math.max(0, numVars - (rowsBits + colsBits)));

    // Render each plane
    for (let p = 0; p < planesCount; p++) {
        const cardX = outerMargin + p * (cardW + gapBetweenCards);
        const cardY = outerMargin;

        // Plane Card Shadow + Background
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
        ctx.shadowBlur = 16 * SCALE;
        ctx.shadowOffsetY = 4 * SCALE;
        ctx.fillStyle = cardBgColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2 * SCALE;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(cardX, cardY, cardW, cardH, 16 * SCALE);
        } else {
            ctx.rect(cardX, cardY, cardW, cardH);
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Plane Title (e.g. A=0, A=1 for 5-var)
        if (planesCount > 1 && zGray && zGray[p] !== undefined) {
            const zPrefix = zGray[p];
            const planeName = zVars.map((v, idx) => `${v}=${zPrefix[idx] || '0'}`).join(', ');
            ctx.font = `700 ${18 * SCALE}px "Outfit", sans-serif`;
            ctx.fillStyle = accentColor;
            ctx.textAlign = 'center';
            ctx.fillText(planeName, cardX + cardW / 2, cardY + 36 * SCALE);
        }

        const tableX = cardX + cardPaddingX;
        const tableY = cardY + cardPaddingTop;

        // Outer Table Border
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2 * SCALE;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(tableX, tableY, tableW, tableH, 14 * SCALE);
        } else {
            ctx.rect(tableX, tableY, tableW, tableH);
        }
        ctx.stroke();

        // Corner Diagonal Line
        ctx.beginPath();
        ctx.moveTo(tableX, tableY);
        ctx.lineTo(tableX + cornerW, tableY + cornerH);
        ctx.stroke();

        // Corner Labels
        ctx.font = `700 ${13 * SCALE}px "Outfit", sans-serif`;
        ctx.fillStyle = textPrimary;
        // Col vars (top-right of corner)
        ctx.textAlign = 'right';
        ctx.fillText(colVars.join(''), tableX + cornerW - 4 * SCALE, tableY + 16 * SCALE);
        // Row vars (bottom-left of corner)
        ctx.textAlign = 'left';
        ctx.fillText(rowVars.join(''), tableX + 4 * SCALE, tableY + cornerH - 4 * SCALE);

        // Column Headers
        ctx.font = `600 ${14 * SCALE}px "Outfit", sans-serif`;
        ctx.fillStyle = textMuted;
        ctx.textAlign = 'center';
        for (let c = 0; c < numCols; c++) {
            const cx = tableX + cornerW + c * cellW + cellW / 2;
            ctx.fillText(colGray[c], cx, tableY + cornerH / 2 + 5 * SCALE);
        }

        // Row Headers
        ctx.textAlign = 'right';
        for (let r = 0; r < numRows; r++) {
            const ry = tableY + cornerH + r * cellH + cellH / 2 + 5 * SCALE;
            ctx.fillText(rowGray[r], tableX + cornerW - 10 * SCALE, ry);
        }

        // Cell Borders & Values
        const zPrefix = (zGray && zGray[p] !== undefined) ? zGray[p] : '';
        for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) {
                const cx = tableX + cornerW + c * cellW;
                const cy = tableY + cornerH + r * cellH;

                // Inner Grid Lines
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = 1 * SCALE;
                ctx.strokeRect(cx, cy, cellW, cellH);

                // Minterm Number (small top-left)
                const binStr = zPrefix + rowGray[r] + colGray[c];
                const mintermIndex = parseInt(binStr, 2);

                ctx.font = `500 ${11 * SCALE}px "Outfit", sans-serif`;
                ctx.fillStyle = textMuted;
                ctx.textAlign = 'left';
                ctx.fillText(String(mintermIndex), cx + 5 * SCALE, cy + 15 * SCALE);

                // Minterm Value (1, 0, or X)
                let val = '0';
                if (minterms && minterms.includes(mintermIndex)) val = '1';
                if (dontCares && dontCares.includes(mintermIndex)) val = 'X';

                ctx.font = `700 ${30 * SCALE}px "Outfit", sans-serif`;
                ctx.textAlign = 'center';
                if (val === '1') {
                    ctx.fillStyle = '#30d158'; // Neon iOS Green
                } else if (val === 'X') {
                    ctx.fillStyle = '#8e8e93'; // iOS Gray
                } else {
                    ctx.fillStyle = '#ff453a'; // Neon iOS Red
                }
                ctx.fillText(val, cx + cellW / 2, cy + cellH / 2 + 9 * SCALE);
            }
        }

        // Draw Group Loops on this plane using exact piece & anti-overlap shrink geometry
        if (solution && solution.length > 0) {
            const zBits = numVars - (rowsBits + colsBits);
            const pieces = [];

            solution.forEach((term, idx) => {
                const zPart = term.slice(0, zBits);
                let planeMatches = true;
                for (let k = 0; k < zBits; k++) {
                    if (zPart[k] !== '-' && zPart[k] !== zPrefix[k]) { planeMatches = false; break; }
                }
                if (!planeMatches) return;

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

                if (!rowPresent.some(Boolean) || !colPresent.some(Boolean)) return;

                const rowRuns = computeAxisRuns(rowPresent);
                const colRuns = computeAxisRuns(colPresent);

                rowRuns.forEach(rowRun => {
                    colRuns.forEach(colRun => {
                        pieces.push({
                            idx,
                            rowLo: rowRun.lo, rowHi: rowRun.hi,
                            colLo: colRun.lo, colHi: colRun.hi,
                            wrapTop: rowRun.wrapLow,
                            wrapBottom: rowRun.wrapHigh,
                            wrapLeft: colRun.wrapLow,
                            wrapRight: colRun.wrapHigh
                        });
                    });
                });
            });

            if (pieces.length > 0) {
                // Compute anti-overlap shrinking offsets
                const extraShrink = computeAntiOverlapShrinkGrid(pieces.map(p => ({
                    idx: p.idx, rowLo: p.rowLo, rowHi: p.rowHi, colLo: p.colLo, colHi: p.colHi
                })));

                pieces.forEach((piece, i) => {
                    const color = LOOP_COLORS[piece.idx % LOOP_COLORS.length];
                    const s = extraShrink[i];

                    const rawLx = tableX + cornerW + piece.colLo * cellW;
                    const rawLy = tableY + cornerH + piece.rowLo * cellH;
                    const rawLw = (piece.colHi - piece.colLo + 1) * cellW;
                    const rawLh = (piece.rowHi - piece.rowLo + 1) * cellH;

                    const padTop = piece.wrapTop ? 0 : (5 + s.top) * SCALE;
                    const padBottom = piece.wrapBottom ? 0 : (5 + s.bottom) * SCALE;
                    const padLeft = piece.wrapLeft ? 0 : (5 + s.left) * SCALE;
                    const padRight = piece.wrapRight ? 0 : (5 + s.right) * SCALE;

                    const px = rawLx + padLeft;
                    const py = rawLy + padTop;
                    const pw = Math.max(4 * SCALE, rawLw - padLeft - padRight);
                    const ph = Math.max(4 * SCALE, rawLh - padTop - padBottom);

                    const wrapSides = {
                        top: piece.wrapTop,
                        bottom: piece.wrapBottom,
                        left: piece.wrapLeft,
                        right: piece.wrapRight
                    };

                    drawLoopPieceCanvas(ctx, px, py, pw, ph, color, wrapSides, SCALE);
                });
            }
        }
    }

    // Watermark
    ctx.font = `500 ${14 * SCALE}px "Outfit", sans-serif`;
    ctx.fillStyle = textMuted;
    ctx.textAlign = 'right';
    ctx.fillText('Generated by Mantiq (https://mantiq.usamagulzar.dev)', totalW - outerMargin, totalH - outerMargin + 10 * SCALE);

    // Trigger PNG Download
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `mantiq_kmap_${new Date().toISOString().slice(0,19).replace(/[-T:]/g,'_')}.png`;
    link.href = dataUrl;
    link.click();

    if (typeof showToast === 'function') showToast('K-Map exported as PNG!');
}
window.exportKMapPNGDirect = exportKMapPNGDirect;

function binaryToVariables(binaryStr, variables, isPOS) {
    let term = isPOS ? "(" : "";
    let first = true;
    for (let j = 0; j < Math.min(binaryStr.length, variables.length); j++) {
        let bit = binaryStr[j];
        if (bit !== '-') {
            if (!first && isPOS) {
                term += "+";
            }
            term += formatExprHtml(variables[j]);
            if (isPOS ? (bit === '1') : (bit === '0')) {
                term += "'";
            }
            first = false;
        }
    }
    if (isPOS) term += ")";
    if (term === "" || term === "()") return isPOS ? "0" : "1";
    return term;
}

function renderKMapAnalysis(solution, isSOP, variables) {
    const list = document.getElementById('kmap-implicants-list');
    if (!list) return;

    if (!lastKMapData) {
        list.innerHTML = '<div class="empty-msg">No data available.</div>';
        return;
    }

    const { minterms, dontCares, primeImplicants, essentialPrimeImplicants, primeImplicantsPOS, essentialPrimeImplicantsPOS } = lastKMapData;
    
    // We need to calculate maxterms for POS Canonical form
    const numVars = variables.length;
    const maxCells = Math.pow(2, numVars);
    let maxterms = [];
    for (let i = 0; i < maxCells; i++) {
        if (!minterms.includes(i) && !dontCares.includes(i)) {
            maxterms.push(i);
        }
    }

    // Small helper: one card = uppercase label (+ optional count chip) + body.
    const card = (iconCls, iconText, title, count, bodyHtml) => {
        // Only Minimal Expression stays expanded by default; Canonical, EPI, and NEPI start collapsed
        const isOpen = iconCls === 'minimal' ? 'open' : '';
        return `
        <details class="kmap-analysis-section" ${isOpen}>
            <summary class="kmap-analysis-header">
                <span class="kmap-analysis-title">${title}</span>
                ${count != null ? `<span class="kmap-analysis-count">${count}</span>` : ''}
                ${Icons.chevronDownKmap}
            </summary>
            <div class="kmap-analysis-body">
                ${bodyHtml}
            </div>
        </details>`;
    };

    let cardsHtml = '';

    // 1. Canonical Form
    if (isSOP) {
        const literals = minterms.map(m => {
            let bin = m.toString(2).padStart(numVars, '0');
            return binaryToVariables(bin, variables, false);
        });
        const body = `
            <div class="kmap-analysis-subtitle">Σm(${minterms.join(', ')})</div>
            <div class="term-boxes-container">${literals.map(l => `<span class="term-box">${l}</span>`).join('')}</div>`;
        cardsHtml += card('canonical-sop', 'Σ', 'Canonical Form (SOP)', minterms.length, body);
    } else {
        const literals = maxterms.map(m => {
            let bin = m.toString(2).padStart(numVars, '0');
            return binaryToVariables(bin, variables, true);
        });
        const body = `
            <div class="kmap-analysis-subtitle">Πm(${maxterms.join(', ')})</div>
            <div class="term-boxes-container">${literals.map(l => `<span class="term-box">${l}</span>`).join('')}</div>`;
        cardsHtml += card('canonical-pos', 'Π', 'Canonical Form (POS)', maxterms.length, body);
    }

    // 2. Minimal Expression
    {
        let minimalBody;
        if (!solution || solution.length === 0) {
            minimalBody = `<div class="kmap-analysis-empty">0</div>`;
        } else {
            let colorIdx = 0;
            const solutionHtml = solution.map(term => {
                const color = LOOP_COLORS[colorIdx % LOOP_COLORS.length];
                colorIdx++;
                const literal = binaryToVariables(term, variables, !isSOP);
                const isSelected = term === _selectedImplicantTerm;
                const isDimmed = _selectedImplicantTerm !== null && !isSelected;
                const cls = `term-box selectable-implicant${isSelected ? ' selected' : ''}${isDimmed ? ' dimmed' : ''}`;
                return `<span class="${cls}" data-term="${term}" style="border:1px solid ${color}; color:${color}; background:${color}20;">${literal}</span>`;
            }).join('');
            minimalBody = `<div class="term-boxes-container">${solutionHtml}</div>`;
        }
        cardsHtml += card('minimal', '∴', 'Minimal Expression', solution ? solution.length : 0, minimalBody);
    }

    // 3. Prime Implicants
    const activePIs = isSOP ? primeImplicants : primeImplicantsPOS;
    const activeEPIs = isSOP ? essentialPrimeImplicants : essentialPrimeImplicantsPOS;

    if (activeEPIs && activeEPIs.length > 0) {
        const epiHtml = activeEPIs.map(epi => {
            const literal = binaryToVariables(epi, variables, !isSOP);
            const isSelected = epi === _selectedImplicantTerm;
            const isDimmed = _selectedImplicantTerm !== null && !isSelected;
            const cls = `term-box selectable-implicant${isSelected ? ' selected' : ''}${isDimmed ? ' dimmed' : ''}`;
            return `<span class="${cls}" data-term="${epi}" style="border:1px solid #AF52DE; color:#AF52DE;">${literal}</span>`;
        }).join('');
        cardsHtml += card('epi', 'EPI', 'Essential Prime Implicants', activeEPIs.length, `<div class="term-boxes-container">${epiHtml}</div>`);
    }

    let nonEPIs = [];
    if (activePIs) {
        nonEPIs = activePIs.filter(pi => !activeEPIs.includes(pi));
    }

    if (nonEPIs && nonEPIs.length > 0) {
        const nepiHtml = nonEPIs.map(nepi => {
            const literal = binaryToVariables(nepi, variables, !isSOP);
            return `<span class="term-box" style="border:1px solid #007AFF; color:#007AFF;">${literal}</span>`;
        }).join('');
        cardsHtml += card('nepi', 'PI', 'Non-Essential Prime Implicants', nonEPIs.length, `<div class="term-boxes-container">${nepiHtml}</div>`);
    }

    list.innerHTML = `<div class="kmap-analysis-board">${cardsHtml}</div>`;
}

// ── 3D K-Map: a real WebGL cube lattice (Three.js) ───────────────────────────
//
// Every K-map cell is an actual cube positioned on a 3D grid (columns × rows ×
// layers, one axis per pair of variables). Design goals:
//   1. Real depth, not simulated depth — cubes further from the camera are
//      genuinely further away, so orbiting the scene actually reveals them.
//   2. Cubes use a transparent, low-opacity fill (`transparent: true` +
//      low `opacity`) so outer cells don't block sight/light to inner ones,
//      while a bright wireframe edge on every cube keeps each cell's
//      boundary crisp no matter how faint the fill is.
//   3. Color encodes the cell's value: green = minterm (1), red = don't-care
//      (X), gray = 0 — so the whole cube shows the map's shape at a glance.
//   4. An Explode toggle animates every cube apart along all three axes,
//      opening up gaps so interior cells are easy to reach/inspect.
//   5. A Wireframe-only toggle drops the solid fill entirely (edges only, in
//      each cell's category color) for a pure structural view.
//   6. Prime-implicant groups from the active minimal solution are drawn as
//      colored wireframe bounding boxes wrapped around their member cubes —
//      so groupings that span rows/columns/layers are visible as real 3D
//      boxes, the way they'd be drawn as loops on a flat K-map.
// Clicking a cube toggles that minterm (0 → 1 → X → 0), same as the 2D view.

let kmap3DState = {
    exploded: false,
    wireframeOnly: false,
    _ctx: null,
    _raf: null,
    _renderer: null,
    _scene: null,
    _camera: null,
    _cubes: [],        // { mesh, edges, outline, material, r, c, l, minterm, val, base:{x,y,z}, exploded:{x,y,z} }
    _groupHelpers: [],
    _rot: { theta: 0.7, phi: 1.05, radius: 8.5 },
    _vel: { theta: 0, phi: 0 },
    _drag: { active: false, moved: false, startX: 0, startY: 0, lastX: 0, lastY: 0 },
    _resizeObserver: null,
    _resizeHandler: null
};

function _stopKmap3DAnimLoops() {
    if (kmap3DState._raf) cancelAnimationFrame(kmap3DState._raf);
    kmap3DState._raf = null;
    if (kmap3DState._resizeHandler) {
        window.removeEventListener('resize', kmap3DState._resizeHandler);
        kmap3DState._resizeHandler = null;
    }
    if (kmap3DState._windowMoveHandler) {
        window.removeEventListener('mousemove', kmap3DState._windowMoveHandler);
        kmap3DState._windowMoveHandler = null;
    }
    if (kmap3DState._windowUpHandler) {
        window.removeEventListener('mouseup', kmap3DState._windowUpHandler);
        kmap3DState._windowUpHandler = null;
    }
    if (kmap3DState._resizeObserver) {
        kmap3DState._resizeObserver.disconnect();
        kmap3DState._resizeObserver = null;
    }
    if (kmap3DState._renderer) {
        kmap3DState._renderer.dispose();
        kmap3DState._renderer = null;
    }
    kmap3DState._scene = null;
    kmap3DState._camera = null;
    kmap3DState._cubes = [];
    kmap3DState._groupHelpers = [];
    kmap3DState._ctx = null;
}

const KMAP3D_COLOR = { one: 0x34C759, dc: 0x8A8F98, zero: 0xFF3B30 };
const KMAP3D_OPACITY = { one: 0.55, dc: 0.2, zero: 0.32 };

function _getKMap3DFitRadius(w, h) {
    const aspect = w / h;
    // 11 is a perfect baseline to fit the exploded 6-variable map on desktop.
    // If the screen is narrow (portrait), pull back proportionally.
    return aspect < 1 ? 11 / aspect : 11;
}

function render3DKMap(numVars, variables, minterms, dontCares, activeSolution, isSOP) {
    const container = document.getElementById('kmap-grid-container');
    const svgOverlay = document.getElementById('kmap-svg-overlay');
    const wrapper3d = document.getElementById('kmap-3d-container');
    const wrapContainer = document.getElementById('kmap-wrap-container');

    container.style.display = 'none';
    svgOverlay.style.display = 'none';
    wrapper3d.style.display = 'block';
    if (wrapContainer) wrapContainer.style.display = 'none';

    // Fast in-place update for existing 3D scene (no context teardown / no canvas blink)
    if (kmap3DState._renderer && kmap3DState._scene && kmap3DState._ctx && kmap3DState._ctx.numVars === numVars) {
        kmap3DState._ctx.minterms = minterms;
        kmap3DState._ctx.dontCares = dontCares;
        kmap3DState._ctx.activeSolution = activeSolution;
        kmap3DState._ctx.isSOP = isSOP;
        kmap3DState._ctx.variables = variables;

        for (const item of kmap3DState._cubes) {
            if (item.isLayerTag || !item.sphere) continue;
            const minterm = item.minterm;
            let val = '0';
            if (minterms.includes(minterm)) val = '1';
            if (dontCares.includes(minterm)) val = 'X';
            item.val = val;

            const colorKey = val === '1' ? 'one' : (val === 'X' ? 'dc' : 'zero');
            const stateColor = KMAP3D_COLOR[colorKey];
            item.sphere.material.color.setHex(stateColor);
        }

        _updateKMap3DGroupHelpers();
        return;
    }

    // Capture the outgoing lattice's numVars BEFORE tearing anything down
    const prevNumVars = kmap3DState._ctx ? kmap3DState._ctx.numVars : null;

    _stopKmap3DAnimLoops();
    wrapper3d.innerHTML = '';

    if (typeof THREE === 'undefined') {
        wrapper3d.innerHTML = '<div class="empty-msg" style="padding:40px;">3D engine failed to load.</div>';
        return;
    }

    const numLayers = (numVars === 5) ? 2 : 4;
    const zVars = variables.slice(0, numVars - 4);
    const zGray = getGrayCodeStr(numVars - 4);
    const rowVars = variables.slice(numVars - 4, numVars - 2);
    const colVars = variables.slice(numVars - 2, numVars);
    const rowGray = getGrayCodeStr(2);
    const colGray = getGrayCodeStr(2);

    let html = `<div class="kmap-3d-toolbar">
                    <div class="kmap-3d-tbtn" id="kmap3d-explode-btn" title="Explode / collapse the lattice">${_kmap3dIcon('explode')}</div>
                    <div class="kmap-3d-tbtn" id="kmap3d-wireframe-btn" title="Wireframe-only mode">${_kmap3dIcon('wireframe')}</div>
                    <div class="kmap-3d-tbtn" id="kmap3d-reset-btn" title="Reset view">${_kmap3dIcon('reset')}</div>
                </div>`;
    html += `<div class="kmap-3d-legend">
                    <span><i style="background:#34C759"></i>1</span>
                    <span><i style="background:#FF3B30"></i>0</span>
                    <span><i style="background:#8A8F98"></i>X</span>
                </div>`;
    html += `<div class="kmap-3d-canvas-wrap" id="kmap-3d-canvas-wrap"></div>`;
    html += `<div class="kmap-3d-controls"><span class="ctrl-hint">Drag to rotate &bull; scroll to zoom &bull; click a cube to toggle it &bull; Explode pulls the lattice apart</span></div>`;
    wrapper3d.innerHTML = html;

    const canvasWrap = document.getElementById('kmap-3d-canvas-wrap');
    const width = canvasWrap.clientWidth || 600;
    const height = canvasWrap.clientHeight || 380;

    // A cell click just toggles a minterm and re-renders the same lattice -
    // it shouldn't discard whatever zoom/pan the user had set (pinch on
    // mobile, wheel on desktop). Only snap back to the auto-fit radius the
    // first time this view is built, or when the lattice's shape actually
    // changes (numVars changed, e.g. switching between a 4-var and 5-var
    // K-map), since the fit radius depends on that shape.
    if (prevNumVars === null || prevNumVars !== numVars) {
        kmap3DState._rot.radius = _getKMap3DFitRadius(width, height);
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true,
        preserveDrawingBuffer: true 
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    canvasWrap.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.55);
    dirLight.position.set(5, 7, 6);
    scene.add(dirLight);

    kmap3DState._renderer = renderer;
    kmap3DState._scene = scene;
    kmap3DState._camera = camera;
    kmap3DState._ctx = { numVars, variables, minterms, dontCares, activeSolution, isSOP, numLayers, zGray, rowGray, colGray, zVars, rowVars, colVars };


    // ── Build the cube lattice ──
    const cubeSize = 0.85;
    const spacing = 1.25;     // base center-to-center spacing
    const explodeGap = 1.45;  // extra spacing added per step when exploded

    const axisPos = (idx, count, gap) => (idx - (count - 1) / 2) * gap;

    const cubeGeo = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    const edgesGeo = new THREE.EdgesGeometry(cubeGeo);
    const sphereGeo = new THREE.SphereGeometry(cubeSize * 0.16, 16, 12);

    kmap3DState._cubes = [];

    for (let l = 0; l < numLayers; l++) {
        for (let r = 0; r < rowGray.length; r++) {
            for (let c = 0; c < colGray.length; c++) {
                const binStr = zGray[l] + rowGray[r] + colGray[c];
                const minterm = parseInt(binStr, 2);
                let val = '0';
                if (minterms.includes(minterm)) val = '1';
                if (dontCares.includes(minterm)) val = 'X';

                // The box itself is always neutral gray now — only the small
                // sphere at its center encodes the cell's value (1/0/X), so
                // the lattice's shape is legible without every cube fighting
                // for attention with its own color.
                const colorKey = val === '1' ? 'one' : (val === 'X' ? 'dc' : 'zero');
                const stateColor = KMAP3D_COLOR[colorKey];
                const boxColor = KMAP3D_COLOR.dc;

                const material = new THREE.MeshStandardMaterial({
                    color: boxColor,
                    transparent: true,
                    opacity: KMAP3D_OPACITY.dc,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
                const mesh = new THREE.Mesh(cubeGeo, material);
                mesh.visible = !kmap3DState.wireframeOnly;

                // Shown only in wireframe-only mode; normal mode uses a faint neutral outline instead.
                const edges = _makeThickCubeEdges(edgesGeo, boxColor, 0.65);
                edges.visible = false;

                const outline = _makeThickCubeEdges(edgesGeo, 0xffffff, 0.45);
                outline.visible = !kmap3DState.wireframeOnly;

                const sphereMat = new THREE.MeshStandardMaterial({ color: stateColor, roughness: 0.35, metalness: 0.1 });
                const sphere = new THREE.Mesh(sphereGeo, sphereMat);

                const label = _makeKMap3DLabel(minterm);
                label.position.set(0, cubeSize / 2 + 0.28, 0);

                // A holder group carries position/explode animation for the
                // cube's whole visual (box + edges + outline + sphere +
                // label). Keeping the sphere as a sibling here — rather than
                // a child of `mesh` — means toggling mesh/edges visibility
                // for wireframe mode never hides the state sphere.
                const holder = new THREE.Group();
                holder.add(mesh);
                holder.add(edges);
                holder.add(outline);
                holder.add(sphere);
                holder.add(label);

                const base = {
                    x: axisPos(c, colGray.length, spacing),
                    y: -axisPos(l, numLayers, spacing),
                    z: axisPos(r, rowGray.length, spacing)
                };
                const exploded = {
                    x: axisPos(c, colGray.length, spacing + explodeGap),
                    y: -axisPos(l, numLayers, spacing + explodeGap),
                    z: axisPos(r, rowGray.length, spacing + explodeGap)
                };
                // Start already at whatever layout is currently active (base or exploded) —
                // otherwise every re-render (e.g. after toggling a cell's value) would snap
                // back to collapsed and replay the explode animation from scratch.
                const startPos = kmap3DState.exploded ? exploded : base;
                holder.position.set(startPos.x, startPos.y, startPos.z);
                mesh.userData.minterm = minterm;

                scene.add(holder);
                kmap3DState._cubes.push({ mesh, holder, edges, outline, sphere, material, r, c, l, minterm, val, base, exploded });
            }
        }
    }

    // Small floor labels showing which z-bits each layer represents, so the
    // now-vertical layer axis (top layer = lowest z-bit combination) stays
    // legible.
    if (zVars.length > 0) {
        for (let l = 0; l < numLayers; l++) {
            const text = `${zVars.join('')}=${zGray[l]}`;
            const tag = _makeKMap3DLabel(text, true);
            const tagX = axisPos(0, colGray.length, spacing) - 1.3;
            const tagZ = axisPos(0, rowGray.length, spacing) + 1.3;
            const baseY = -axisPos(l, numLayers, spacing);
            const explodedY = -axisPos(l, numLayers, spacing + explodeGap);
            tag.userData.isLayerTag = true;
            const startY = kmap3DState.exploded ? explodedY : baseY;
            tag.position.set(tagX, startY, tagZ);
            scene.add(tag);
            kmap3DState._cubes.push({ mesh: tag, isLayerTag: true, base: { x: tagX, y: baseY, z: tagZ }, exploded: { x: tagX, y: explodedY, z: tagZ } });
        }
    }

    _updateKMap3DGroupHelpers();
    _updateKMap3DToolbarUI();
    _wireKMap3DInteractions();
    _updateKMap3DCamera();

    kmap3DState._raf = requestAnimationFrame(_kmap3DAnimate);
}

// Builds a cube-edge outline that reads as visibly thicker than a plain
// LineSegments, which is necessary because WebGL/ANGLE ignores
// LineBasicMaterial.linewidth in Chromium-based browsers (it always renders
// at 1px there regardless of the value set). Layering a slightly larger,
// softer "halo" line behind a crisp full-opacity line gives real, consistent
// thickness across browsers without needing an extra fat-lines library.
function _makeThickCubeEdges(edgesGeo, color, opacity) {
    const group = new THREE.Group();

    const haloMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: opacity * 0.5, linewidth: 2 });
    const halo = new THREE.LineSegments(edgesGeo, haloMat);
    halo.scale.setScalar(1.045);
    group.add(halo);

    const coreMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, linewidth: 2 });
    const core = new THREE.LineSegments(edgesGeo, coreMat);
    group.add(core);

    return group;
}

// Small billboard sprite carrying a number/label, built from a canvas texture.
function _makeKMap3DLabel(text, muted) {
    const str = String(text);
    // Muted labels (e.g. "AB=01") are wider than tall; give the canvas that
    // same aspect ratio so the sprite scale doesn't have to squash/stretch a
    // square texture (which is what was distorting and cropping the text).
    const cw = muted ? 256 : 128;
    const ch = muted ? 128 : 128;

    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = muted ? 'rgba(148,163,184,0.95)' : 'rgba(255,255,255,0.95)';

    // Shrink the font until the text fits within the canvas with some margin,
    // so longer labels never get cropped.
    const maxWidth = cw * 0.86;
    let fontSize = muted ? 52 : 56;
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    while (ctx.measureText(str).width > maxWidth && fontSize > 16) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    }
    ctx.fillText(str, cw / 2, ch / 2 + fontSize * 0.05);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    const spriteH = muted ? 0.42 : 0.42;
    sprite.scale.set(spriteH * (cw / ch), spriteH, 1);
    return sprite;
}

// Rebuilds the colored wireframe bounding boxes around each prime-implicant
// group in the active solution. Called on load and again whenever the
// lattice's cube positions change (explode toggle), since the boxes must
// track the cubes they wrap.
//
// Given a boolean membership array over a cyclic axis in 3D world space
// (already padded box coordinates), figures out extra inset per box so that
// any pair of boxes sharing a full face (overlapping on the other two axes,
// with a matching boundary plane) end up visibly separated instead of their
// borders sitting flush against each other. Mirrors computeAntiOverlapShrink
// for the 2D view, just extended to three axes.
function computeAntiOverlapShrink3D(boxes) {
    const n = boxes.length;
    const extra = new Array(n).fill(0);
    const eps = 0.05;

    for (let i = 0; i < n; i++) {
        if (!boxes[i]) continue;
        for (let j = i + 1; j < n; j++) {
            if (!boxes[j]) continue;
            const a = boxes[i], b = boxes[j];

            const xOverlap = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
            const yOverlap = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
            const zOverlap = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);

            const sameXPlane = Math.abs(a.minX - b.minX) < eps || Math.abs(a.minX - b.maxX) < eps ||
                                Math.abs(a.maxX - b.minX) < eps || Math.abs(a.maxX - b.maxX) < eps;
            const sameYPlane = Math.abs(a.minY - b.minY) < eps || Math.abs(a.minY - b.maxY) < eps ||
                                Math.abs(a.maxY - b.minY) < eps || Math.abs(a.maxY - b.maxY) < eps;
            const sameZPlane = Math.abs(a.minZ - b.minZ) < eps || Math.abs(a.minZ - b.maxZ) < eps ||
                                Math.abs(a.maxZ - b.minZ) < eps || Math.abs(a.maxZ - b.maxZ) < eps;

            const sharesFace = (yOverlap > eps && zOverlap > eps && sameXPlane) ||
                                (xOverlap > eps && zOverlap > eps && sameYPlane) ||
                                (xOverlap > eps && yOverlap > eps && sameZPlane);

            if (sharesFace) {
                extra[j] = Math.min(extra[j] + 0.07, 0.22);
            }
        }
    }
    return extra;
}

// Builds a thick cylinder ("tube") mesh running between two points in a
// group's local space. Used instead of THREE.Line so the edge has real
// geometric thickness (WebGL/ANGLE ignores LineBasicMaterial.linewidth in
// Chromium-based browsers).
function _makeEdgeTube(p1, p2, radius, material) {
    const a = new THREE.Vector3(p1[0], p1[1], p1[2]);
    const b = new THREE.Vector3(p2[0], p2[1], p2[2]);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 1e-6) return null;

    const geo = new THREE.CylinderGeometry(radius, radius, len, 6, 1, false);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return mesh;
}

// Adds one box edge (from p1 to p2) to the group as a thick, fully opaque
// tube — solid edges become a single tube, dashed edges (those touching a
// wrap face) are broken into short dash tubes with gaps, so the box reads
// as "this keeps going" rather than a hard boundary. This is real cylinder
// geometry (not THREE.Line), so a single opaque tube already has genuine
// on-screen thickness from every angle — no translucent "halo" layer is
// needed to fake it, and adding one only made some sides look see-through.
function _addGroupBoxEdge(group, p1, p2, dashed, material) {
    const add = (a, b) => {
        const core = _makeEdgeTube(a, b, 0.032, material);
        if (core) group.add(core);
    };

    if (!dashed) { add(p1, p2); return; }

    const a = new THREE.Vector3(p1[0], p1[1], p1[2]);
    const b = new THREE.Vector3(p2[0], p2[1], p2[2]);
    const total = a.distanceTo(b);
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const dash = 0.16, gap = 0.13;
    let t = 0;
    while (t < total) {
        const segEnd = Math.min(t + dash, total);
        const sa = a.clone().addScaledVector(dir, t);
        const sb = a.clone().addScaledVector(dir, segEnd);
        add([sa.x, sa.y, sa.z], [sb.x, sb.y, sb.z]);
        t += dash + gap;
    }
}

// Builds a box wireframe as thick tube edges. wrapFaces flags the box's
// low/high side on each axis that is a "wrap" face — i.e. the group
// actually continues on the opposite side of the lattice there rather than
// truly ending — and edges touching such a face are drawn dashed instead of
// solid, so the box reads as "this keeps going" rather than a hard boundary.
function _makeGroupBoxWireframe(box, colorHex, wrapFaces) {
    const center = box.getCenter(new THREE.Vector3());
    let x0 = box.min.x - center.x, x1 = box.max.x - center.x;
    let y0 = box.min.y - center.y, y1 = box.max.y - center.y;
    let z0 = box.min.z - center.z, z1 = box.max.z - center.z;

    // A wrap face is pushed out a bit further than the box's real boundary
    // (rather than stopping flush there), so that side visibly overshoots
    // the wall — reading as "this keeps going past the edge" instead of a
    // hard stop, which is easy to miss when it's just dashed in place.
    const WRAP_EXTEND = 0.28;
    if (wrapFaces.xLow) x0 -= WRAP_EXTEND;
    if (wrapFaces.xHigh) x1 += WRAP_EXTEND;
    if (wrapFaces.yLow) y0 -= WRAP_EXTEND;
    if (wrapFaces.yHigh) y1 += WRAP_EXTEND;
    if (wrapFaces.zLow) z0 -= WRAP_EXTEND;
    if (wrapFaces.zHigh) z1 += WRAP_EXTEND;

    const group = new THREE.Group();
    group.position.copy(center);

    // Fully opaque — no transparency, so coverage never depends on
    // camera-angle-dependent sort order between overlapping objects.
    const material = new THREE.MeshBasicMaterial({ color: colorHex, transparent: false, opacity: 1 });

    const addEdge = (p1, p2, dashed) => _addGroupBoxEdge(group, p1, p2, dashed, material);

    // Edges running along X (fixed y,z) — each touches a Y face and a Z face.
    addEdge([x0, y0, z0], [x1, y0, z0], wrapFaces.yLow || wrapFaces.zLow);
    addEdge([x0, y0, z1], [x1, y0, z1], wrapFaces.yLow || wrapFaces.zHigh);
    addEdge([x0, y1, z0], [x1, y1, z0], wrapFaces.yHigh || wrapFaces.zLow);
    addEdge([x0, y1, z1], [x1, y1, z1], wrapFaces.yHigh || wrapFaces.zHigh);

    // Edges running along Y (fixed x,z) — each touches an X face and a Z face.
    addEdge([x0, y0, z0], [x0, y1, z0], wrapFaces.xLow || wrapFaces.zLow);
    addEdge([x0, y0, z1], [x0, y1, z1], wrapFaces.xLow || wrapFaces.zHigh);
    addEdge([x1, y0, z0], [x1, y1, z0], wrapFaces.xHigh || wrapFaces.zLow);
    addEdge([x1, y0, z1], [x1, y1, z1], wrapFaces.xHigh || wrapFaces.zHigh);

    // Edges running along Z (fixed x,y) — each touches an X face and a Y face.
    addEdge([x0, y0, z0], [x0, y0, z1], wrapFaces.xLow || wrapFaces.yLow);
    addEdge([x1, y0, z0], [x1, y0, z1], wrapFaces.xHigh || wrapFaces.yLow);
    addEdge([x0, y1, z0], [x0, y1, z1], wrapFaces.xLow || wrapFaces.yHigh);
    addEdge([x1, y1, z0], [x1, y1, z1], wrapFaces.xHigh || wrapFaces.yHigh);

    return group;
}

function _updateKMap3DGroupHelpers() {
    const ctx = kmap3DState._ctx;
    const scene = kmap3DState._scene;
    if (!ctx || !scene) return;

    kmap3DState._groupHelpers.forEach(h => {
        scene.remove(h);
        h.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
    });
    kmap3DState._groupHelpers = [];

    const { activeSolution, numLayers, zGray, rowGray, colGray } = ctx;
    if (!activeSolution || activeSolution.length === 0) return;
    const zBits = ctx.numVars - 4;
    const basePad = 0.55;

    // Pass 1: split every group into non-wrapping pieces (a group only needs
    // more than one piece when it wraps around an edge of the lattice, e.g.
    // a group spanning the two outer layers), and gather each piece's member
    // cubes and wrap-face flags.
    const pieces = []; // { color, members, wrapFaces }
    activeSolution.forEach((term, idx) => {
        // Selection filters which group gets a wireframe drawn; color still
        // comes from this term's position in the full solution, unchanged.
        const _effTerm3D = _effectiveImplicantTerm();
        if (_effTerm3D !== null && term !== _effTerm3D) return;

        const colorStr = LOOP_COLORS[idx % LOOP_COLORS.length];
        const color = parseInt(colorStr.slice(1), 16);
        const zPart = term.slice(0, zBits);
        const rowBits = term.slice(zBits, zBits + 2);
        const colBits = term.slice(zBits + 2, zBits + 4);

        const layerPresent = [];
        for (let l = 0; l < numLayers; l++) {
            let ok = true;
            for (let k = 0; k < zBits; k++) { if (zPart[k] !== '-' && zPart[k] !== zGray[l][k]) { ok = false; break; } }
            layerPresent.push(ok);
        }
        const rowPresent = rowGray.map(g => {
            for (let k = 0; k < 2; k++) if (rowBits[k] !== '-' && rowBits[k] !== g[k]) return false;
            return true;
        });
        const colPresent = colGray.map(g => {
            for (let k = 0; k < 2; k++) if (colBits[k] !== '-' && colBits[k] !== g[k]) return false;
            return true;
        });
        if (!layerPresent.some(Boolean) || !rowPresent.some(Boolean) || !colPresent.some(Boolean)) return;

        const layerRuns = computeAxisRuns(layerPresent);
        const rowRuns = computeAxisRuns(rowPresent);
        const colRuns = computeAxisRuns(colPresent);

        layerRuns.forEach(layerRun => {
            rowRuns.forEach(rowRun => {
                colRuns.forEach(colRun => {
                    const members = kmap3DState._cubes.filter(cube => {
                        if (cube.isLayerTag) return false;
                        return cube.l >= layerRun.lo && cube.l <= layerRun.hi &&
                               cube.r >= rowRun.lo && cube.r <= rowRun.hi &&
                               cube.c >= colRun.lo && cube.c <= colRun.hi;
                    });
                    if (members.length === 0) return;

                    // Layer axis is now laid out inverted (y = -axisPos(l, ...)),
                    // so a run touching layer index 0 (the top level) sits on the
                    // box's high-y side, and a run touching the last layer index
                    // sits on low-y. Rows now sit on the z (depth) axis instead.
                    pieces.push({
                        color,
                        members,
                        wrapFaces: {
                            xLow: colRun.wrapLow, xHigh: colRun.wrapHigh,
                            yLow: layerRun.wrapHigh, yHigh: layerRun.wrapLow,
                            zLow: rowRun.wrapLow, zHigh: rowRun.wrapHigh
                        }
                    });
                });
            });
        });
    });

    if (pieces.length === 0) return;

    // Pass 2: compute each piece's default (base-pad) box, then figure out
    // which pieces share a full face so the later one can be shrunk a touch.
    const boxOf = (piece, pad) => {
        const box = new THREE.Box3();
        piece.members.forEach(m => {
            const p = kmap3DState.exploded ? m.exploded : m.base;
            box.expandByPoint(new THREE.Vector3(p.x - pad, p.y - pad, p.z - pad));
            box.expandByPoint(new THREE.Vector3(p.x + pad, p.y + pad, p.z + pad));
        });
        return box;
    };
    const defaultBoxes = pieces.map(p => boxOf(p, basePad));
    const plainBoxes = defaultBoxes.map(b => ({
        minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z
    }));
    const extraShrink = computeAntiOverlapShrink3D(plainBoxes);

    // Pass 3: draw, shrinking the pad for any piece that needs separation.
    pieces.forEach((piece, i) => {
        const pad = Math.max(0.25, basePad - extraShrink[i]);
        const box = boxOf(piece, pad);
        const helper = _makeGroupBoxWireframe(box, piece.color, piece.wrapFaces);
        scene.add(helper);
        kmap3DState._groupHelpers.push(helper);
    });
}

function _updateKMap3DToolbarUI() {
    const explodeBtn = document.getElementById('kmap3d-explode-btn');
    if (explodeBtn) explodeBtn.classList.toggle('active', kmap3DState.exploded);
    const wireBtn = document.getElementById('kmap3d-wireframe-btn');
    if (wireBtn) wireBtn.classList.toggle('active', kmap3DState.wireframeOnly);
}

function _kmap3dIcon(name) {
    if (name === 'explode') return Icons.kmap3dExplode;
    if (name === 'reset') return Icons.kmap3dReset;
    if (name === 'wireframe') return Icons.kmap3dWireframe;
    return '';
}

function _wireKMap3DInteractions() {
    const ctx = kmap3DState._ctx;
    if (!ctx) return;

    const explodeBtn = document.getElementById('kmap3d-explode-btn');
    if (explodeBtn) explodeBtn.addEventListener('click', () => {
        kmap3DState.exploded = !kmap3DState.exploded;
        _updateKMap3DGroupHelpers();
        _updateKMap3DToolbarUI();
    });

    const wireBtn = document.getElementById('kmap3d-wireframe-btn');
    if (wireBtn) wireBtn.addEventListener('click', () => {
        kmap3DState.wireframeOnly = !kmap3DState.wireframeOnly;
        kmap3DState._cubes.forEach(cube => {
            if (cube.isLayerTag) return;
            // Wireframe-only mode now strips the gray cube boxes entirely —
            // it should read as just the state spheres plus the group loop
            // lines, not a wireframe of every cell.
            cube.mesh.visible = !kmap3DState.wireframeOnly;
            cube.edges.visible = false;
            cube.outline.visible = !kmap3DState.wireframeOnly;
        });
        _updateKMap3DToolbarUI();
    });

    const resetBtn = document.getElementById('kmap3d-reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', () => {
        kmap3DState.exploded = false;
        kmap3DState.wireframeOnly = false;
        kmap3DState._cubes.forEach(cube => {
            if (cube.isLayerTag) return;
            cube.mesh.visible = true;
            cube.edges.visible = false;
            cube.outline.visible = true;
        });
        const cw = canvasWrap.clientWidth || 600;
        const ch = canvasWrap.clientHeight || 380;
        kmap3DState._rot = { theta: 0.7, phi: 1.05, radius: _getKMap3DFitRadius(cw, ch) };
        kmap3DState._vel = { theta: 0, phi: 0 };
        _updateKMap3DGroupHelpers();
        _updateKMap3DCamera();
        _updateKMap3DToolbarUI();
    });

    const canvasWrap = document.getElementById('kmap-3d-canvas-wrap');
    const renderer = kmap3DState._renderer;
    if (!canvasWrap || !renderer) return;
    const dom = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let _dragLastT = 0;

    const onDown = (clientX, clientY) => {
        kmap3DState._drag.active = true;
        kmap3DState._drag.moved = false;
        kmap3DState._drag.startX = clientX;
        kmap3DState._drag.startY = clientY;
        kmap3DState._drag.lastX = clientX;
        kmap3DState._drag.lastY = clientY;
        kmap3DState._vel.theta = 0;
        kmap3DState._vel.phi = 0;
        _dragLastT = performance.now();
        dom.style.cursor = 'grabbing';
    };
    const onMove = (clientX, clientY) => {
        if (!kmap3DState._drag.active) return;
        const dx = clientX - kmap3DState._drag.lastX;
        const dy = clientY - kmap3DState._drag.lastY;
        // Classify drag-vs-tap by TOTAL displacement from the original press
        // point, not a single inter-sample delta. The old "> 6px between
        // this touchmove and the last one" check meant one noisy digitizer
        // sample (a touch's reported (x,y) can jitter several px between
        // samples even while the finger is physically still - more common
        // on touchscreens than with a mouse) was enough to flip `moved` to
        // true, which then made onUp() below skip its raycast/toggle
        // entirely - a stationary tap read as a drag and silently did
        // nothing. Requiring 10px of *cumulative* movement from the actual
        // start point is far more resistant to that per-sample noise while
        // still recognizing a real drag almost immediately.
        const totalDist = Math.hypot(clientX - kmap3DState._drag.startX, clientY - kmap3DState._drag.startY);
        if (totalDist > 10) kmap3DState._drag.moved = true;
        kmap3DState._rot.theta -= dx * 0.008;
        kmap3DState._rot.phi = Math.min(Math.max(kmap3DState._rot.phi - dy * 0.008, 0.25), Math.PI - 0.25);
        kmap3DState._drag.lastX = clientX;
        kmap3DState._drag.lastY = clientY;

        // Estimate instantaneous angular velocity (normalized to a ~60fps
        // step) and blend it into the running velocity so release picks up
        // the most recent flick speed, smoothed against event-rate jitter.
        const now = performance.now();
        const dt = Math.min(Math.max(now - _dragLastT, 1), 100);
        _dragLastT = now;
        const instTheta = (dx * 0.008) * (16.6 / dt);
        const instPhi   = (dy * 0.008) * (16.6 / dt);
        kmap3DState._vel.theta = kmap3DState._vel.theta * 0.5 + instTheta * 0.5;
        kmap3DState._vel.phi   = kmap3DState._vel.phi   * 0.5 + instPhi   * 0.5;

        _updateKMap3DCamera();
    };
    const onUp = (clientX, clientY) => {
        if (kmap3DState._drag.active && !kmap3DState._drag.moved) {
            const rect = dom.getBoundingClientRect();
            mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, kmap3DState._camera);
            const meshes = kmap3DState._cubes.filter(c => !c.isLayerTag).map(c => c.mesh);
            const hits = raycaster.intersectObjects(meshes, false);
            if (hits.length > 0) {
                handleKMapCellClick(hits[0].object.userData.minterm);
            }
        }
        kmap3DState._drag.active = false;
        dom.style.cursor = 'grab';
    };
    dom.style.cursor = 'grab';

    // Mouse controls (desktop)
    dom.addEventListener('mousedown', (e) => onDown(e.clientX, e.clientY));

    // Remove any listeners from a previous wiring pass before attaching new
    // ones — _wireKMap3DInteractions() runs again after every re-render
    // (e.g. every single cell toggle), so without this, stale window
    // listeners referencing the old/detached canvas accumulated forever,
    // each one re-applying the same drag delta and making rotation get
    // progressively more erratic the longer a session went on.
    if (kmap3DState._windowMoveHandler) window.removeEventListener('mousemove', kmap3DState._windowMoveHandler);
    if (kmap3DState._windowUpHandler) window.removeEventListener('mouseup', kmap3DState._windowUpHandler);
    kmap3DState._windowMoveHandler = (e) => onMove(e.clientX, e.clientY);
    kmap3DState._windowUpHandler = (e) => onUp(e.clientX, e.clientY);
    window.addEventListener('mousemove', kmap3DState._windowMoveHandler);
    window.addEventListener('mouseup', kmap3DState._windowUpHandler);

    dom.addEventListener('wheel', (e) => {
        e.preventDefault();
        kmap3DState._rot.radius = Math.min(Math.max(kmap3DState._rot.radius + e.deltaY * 0.01, 4), 50);
        _updateKMap3DCamera();
    }, { passive: false });

    // Touch controls (mobile): one finger drags/rotates & taps to select,
    // two fingers pinch to zoom (mirrors the mouse-drag + wheel-zoom above).
    let _kmap3dPinchDist = 0;
    dom.style.touchAction = 'none';
    dom.addEventListener('touchstart', (e) => {
        // preventDefault here (touch-action is already 'none', so this
        // costs no scroll/pan behavior) stops the browser from firing a
        // delayed "ghost" mousedown/mousemove/mouseup/click at the tap
        // position afterward. Without it, tapping a cell to toggle it also
        // triggered the desktop mouse-drag path a moment later, which read
        // as the view suddenly rotating/resetting right after the tap.
        e.preventDefault();
        if (e.touches.length === 1) {
            onDown(e.touches[0].clientX, e.touches[0].clientY);
        } else if (e.touches.length === 2) {
            kmap3DState._drag.active = false;
            kmap3DState._vel.theta = 0;
            kmap3DState._vel.phi = 0;
            const [t1, t2] = e.touches;
            _kmap3dPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        }
    }, { passive: false });

    dom.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && kmap3DState._drag.active) {
            e.preventDefault();
            onMove(e.touches[0].clientX, e.touches[0].clientY);
        } else if (e.touches.length === 2) {
            e.preventDefault();
            const [t1, t2] = e.touches;
            const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            if (_kmap3dPinchDist > 0) {
                const delta = dist - _kmap3dPinchDist;
                kmap3DState._rot.radius = Math.min(Math.max(kmap3DState._rot.radius - delta * 0.03, 4), 50);
                _updateKMap3DCamera();
            }
            _kmap3dPinchDist = dist;
        }
    }, { passive: false });

    const _kmap3dTouchEnd = (e) => {
        if (e.cancelable) e.preventDefault();
        const lastTouch = e.changedTouches && e.changedTouches[0];
        onUp(lastTouch ? lastTouch.clientX : kmap3DState._drag.lastX, lastTouch ? lastTouch.clientY : kmap3DState._drag.lastY);
        _kmap3dPinchDist = 0;
    };
    dom.addEventListener('touchend', _kmap3dTouchEnd, { passive: false });
    dom.addEventListener('touchcancel', _kmap3dTouchEnd, { passive: false });

    kmap3DState._resizeHandler = () => {
        const w = canvasWrap.clientWidth, h = canvasWrap.clientHeight;
        if (!w || !h || !kmap3DState._renderer) return;
        kmap3DState._camera.aspect = w / h;
        kmap3DState._camera.updateProjectionMatrix();
        kmap3DState._renderer.setSize(w, h);
        
        // Push the camera back if rotating the device caused it to clip
        const minFit = _getKMap3DFitRadius(w, h);
        if (kmap3DState._rot.radius < minFit) {
            kmap3DState._rot.radius = minFit;
            _updateKMap3DCamera();
        }
    };
    window.addEventListener('resize', kmap3DState._resizeHandler);
}

function _updateKMap3DCamera() {
    const camera = kmap3DState._camera;
    if (!camera) return;
    const { theta, phi, radius } = kmap3DState._rot;
    camera.position.set(
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.cos(theta)
    );
    camera.lookAt(0, 0, 0);
}

function _kmap3DAnimate() {
    const cubes = kmap3DState._cubes;
    const renderer = kmap3DState._renderer;
    const scene = kmap3DState._scene;
    const camera = kmap3DState._camera;
    if (!renderer || !scene || !camera) return;

    // Free-wheel inertia: once the user lets go, keep spinning at the
    // last-recorded flick velocity and decay it (friction) each frame
    // until it settles back to a stop.
    if (!kmap3DState._drag.active) {
        const vel = kmap3DState._vel;
        if (Math.abs(vel.theta) > 0.00008 || Math.abs(vel.phi) > 0.00008) {
            kmap3DState._rot.theta -= vel.theta;
            kmap3DState._rot.phi = Math.min(Math.max(kmap3DState._rot.phi - vel.phi, 0.25), Math.PI - 0.25);
            vel.theta *= 0.945;
            vel.phi *= 0.945;
            _updateKMap3DCamera();
        } else {
            vel.theta = 0;
            vel.phi = 0;
        }
    }

    let stillMoving = false;
    cubes.forEach(cube => {
        const target = kmap3DState.exploded ? cube.exploded : cube.base;
        const p = (cube.holder || cube.mesh).position;
        const dx = target.x - p.x, dy = target.y - p.y, dz = target.z - p.z;
        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 0.002) {
            p.x += dx * 0.15; p.y += dy * 0.15; p.z += dz * 0.15;
            stillMoving = true;
        } else {
            p.set(target.x, target.y, target.z);
        }
    });

    renderer.render(scene, camera);
    kmap3DState._raf = requestAnimationFrame(_kmap3DAnimate);
}

let kmapWrapInitialized = false;
let wrapDragState = { isDragging: false, startX: 0, startY: 0, offX: 0, offY: 0, hasMoved: false };

function renderWrapKMap(numVars, variables, minterms, dontCares, activeSolution, isSOP) {
    const container2D = document.getElementById('kmap-grid-container');
    const svgOverlay = document.getElementById('kmap-svg-overlay');
    const wrapper3d = document.getElementById('kmap-3d-container');
    const wrapContainer = document.getElementById('kmap-wrap-container');
    const wrapSurface = document.getElementById('kmap-wrap-surface');
    const wrapSvg = document.getElementById('kmap-wrap-svg-overlay');
    const wrapper = document.getElementById('kmap-visual-wrapper');
    
    if (container2D) container2D.style.display = 'none';
    if (svgOverlay) svgOverlay.style.display = 'none';
    if (wrapper3d) wrapper3d.style.display = 'none';
    if (!wrapContainer) return;
    
    wrapContainer.style.display = 'block';

    let rowsBits = 1;
    let colsBits = 1;
    if (numVars === 3) { rowsBits = 1; colsBits = 2; }
    if (numVars === 4) { rowsBits = 2; colsBits = 2; }
    if (numVars === 2) { rowsBits = 1; colsBits = 1; }

    const rowVars = variables.slice(0, rowsBits);
    const colVars = variables.slice(rowsBits);
    
    const rowGray = getGrayCodeStr(rowsBits);
    const colGray = getGrayCodeStr(colsBits);
    
    // Tiled cells (NO headers to avoid duplicate header glitch)
    let singleTileHtml = '<table style="border-collapse: collapse; margin: 0; padding: 0;">';
    for (let r = 0; r < rowGray.length; r++) {
        singleTileHtml += `<tr>`;
        for (let c = 0; c < colGray.length; c++) {
            const binaryStr = rowGray[r] + colGray[c];
            const minterm = parseInt(binaryStr, 2);
            let val = '0';
            if (minterms.includes(minterm)) val = '1';
            if (dontCares.includes(minterm)) val = 'X';
            singleTileHtml += `<td class="kmap-cell val-${val}" data-minterm="${minterm}" style="width: ${WRAP_CELL_SIZE}px; height: ${WRAP_CELL_SIZE}px; min-width: ${WRAP_CELL_SIZE}px; min-height: ${WRAP_CELL_SIZE}px; border: 1px solid var(--border); box-sizing: border-box; text-align: center; vertical-align: middle; position: relative; font-size: ${Math.round(WRAP_CELL_SIZE * 0.4)}px;">`;
            singleTileHtml += `<div class="kmap-minterm-label">${minterm}</div>`;
            singleTileHtml += `${val}</td>`;
        }
        singleTileHtml += '</tr>';
    }
    singleTileHtml += '</table>';
    
    // Calculate required tiles to cover the screen
    const cellSize = WRAP_CELL_SIZE;
    const w = colGray.length * cellSize;
    const h = rowGray.length * cellSize;
    
    const availW = wrapper.clientWidth;
    const availH = wrapper.clientHeight;
    
    // +2 tiles is enough to cover the viewport itself, but a wrapped
    // (cyclic) group's loop outline is deliberately drawn bleeding past its
    // own tile's edge so it lines up with the next tile (see findCyclicRun
    // below) - that bleed can be almost a full tile wide. Without an extra
    // tile of headroom here, the trailing edge of the rendered buffer can
    // scroll into view mid-pan with nothing behind it to bleed onto, which
    // reads as the map suddenly jumping. +3 guarantees the bleed (always
    // < 1 tile) always lands on real tile content.
    const tilesX = Math.ceil(availW / w) + 3;
    const tilesY = Math.ceil(availH / h) + 3;
    
    let surfaceHtml = `<div style="display: grid; grid-template-columns: repeat(${tilesX}, max-content); grid-template-rows: repeat(${tilesY}, max-content); place-items: center; gap: 0;">`;
    for(let i=0; i< (tilesX * tilesY); i++) {
        surfaceHtml += `<div id="wrap-tile-${i}" style="margin:0; padding:0;">${singleTileHtml}</div>`;
    }
    surfaceHtml += '</div>';
    
    // Floating Headers with SVG line split (50x50 corner)
    let headerHtml = `<div id="wrap-corner" class="kmap-corner" style="position: absolute; top:0; left:0; width:40px; height:40px; background:var(--bg-primary); z-index: 30; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); box-sizing: border-box; padding: 0;">`;
    headerHtml += `<svg style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;"><line x1="0" y1="0" x2="100%" y2="100%" stroke="var(--border)" stroke-width="1.5" /></svg>`;
    headerHtml += `<div class="kmap-corner-col">${formatExprHtml(colVars.join(''))}</div>`;
    headerHtml += `<div class="kmap-corner-row">${formatExprHtml(rowVars.join(''))}</div>`;
    headerHtml += `</div>`;

    headerHtml += `<div id="wrap-top-header" style="position: absolute; top:0; left: 40px; display: flex; z-index: 20; background:var(--bg-primary); height:40px; border-bottom: 1px solid var(--border);">`;
    for(let i=0; i<tilesX; i++) {
        for(let c of colGray) headerHtml += `<div style="width: ${WRAP_CELL_SIZE}px; height: 50px; display:flex; align-items:center; justify-content:center; font-weight:normal; font-size: 0.95em; color:var(--text-secondary); box-sizing: border-box; vertical-align: bottom; padding-bottom: 2px;">${c}</div>`;
    }
    headerHtml += `</div>`;
    
    headerHtml += `<div id="wrap-left-header" style="position: absolute; top: 50px; left: 0; display: flex; flex-direction: column; z-index: 20; background:var(--bg-primary); width:50px; border-right: 1px solid var(--border);">`;
    for(let i=0; i<tilesY; i++) {
        for(let r of rowGray) headerHtml += `<div style="width: 50px; height: ${WRAP_CELL_SIZE}px; display:flex; align-items:center; justify-content:center; font-weight:normal; font-size: 0.95em; color:var(--text-secondary); box-sizing: border-box; text-align: right; padding-right: 4px;">${r}</div>`;
    }
    headerHtml += `</div>`;

    wrapSurface.innerHTML = headerHtml + surfaceHtml;

    // The SVG lives outside #kmap-wrap-surface in the static markup so the
    // innerHTML rebuild above doesn't wipe it - but that makes it a sibling
    // stacking context (both have their own `transform`) that paints above
    // the *whole* surface on DOM order alone, including the headers' own
    // z-index 20/30. Re-parent the same node (not a new one - appendChild
    // on an existing node just moves it) back into the surface so it's
    // ordered by z-index against the headers instead of by DOM order
    // against the surface as a whole: cells (unpositioned) < loops
    // (position:absolute, z-index:auto) < headers (z-index 20/30).
    wrapSurface.appendChild(wrapSvg);

    const updateTransform = () => {
        let tx = wrapDragState.offX % w;
        if (tx > 0) tx -= w;
        let ty = wrapDragState.offY % h;
        if (ty > 0) ty -= h;
        
        const gridEl = wrapSurface.children[3]; // corner (0), top (1), left (2), grid (3)
        gridEl.style.transform = `translate(${tx - w + 50}px, ${ty - h + 50}px)`;
        
        wrapSvg.style.transform = `translate(${tx - w + 50}px, ${ty - h + 50}px)`;
        
        const topHeader = document.getElementById('wrap-top-header');
        if(topHeader) topHeader.style.transform = `translateX(${tx - w}px)`;
        
        const leftHeader = document.getElementById('wrap-left-header');
        if(leftHeader) leftHeader.style.transform = `translateY(${ty - h}px)`;
    };

    if (!kmapWrapInitialized) {
        kmapWrapInitialized = true;
        
        wrapContainer.addEventListener('mousedown', (e) => {
            wrapDragState.isDragging = true;
            wrapDragState.startX = e.clientX;
            wrapDragState.startY = e.clientY;
            wrapDragState.hasMoved = false;
            wrapContainer.style.cursor = 'grabbing';
        });
        // mousemove can fire far more often than the screen actually repaints
        // (especially on high-poll-rate mice/trackpads/touchpads). Calling
        // updateTransform() synchronously on every single event did the
        // style write + forced recalc that many extra times per real frame,
        // which is what made panning feel laggy. Instead, just record the
        // latest offset here (cheap) and let a single rAF tick apply it once
        // per frame - any events that land between frames get coalesced for
        // free.
        let wrapRafPending = false;
        window.addEventListener('mousemove', (e) => {
            if (!wrapDragState.isDragging) return;
            const dx = e.clientX - wrapDragState.startX;
            const dy = e.clientY - wrapDragState.startY;
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                wrapDragState.hasMoved = true;
            }
            wrapDragState.offX += dx;
            wrapDragState.offY += dy;
            wrapDragState.startX = e.clientX;
            wrapDragState.startY = e.clientY;
            if (!wrapRafPending) {
                wrapRafPending = true;
                requestAnimationFrame(() => {
                    wrapRafPending = false;
                    updateTransform();
                });
            }
        });
        window.addEventListener('mouseup', () => {
            wrapDragState.isDragging = false;
            wrapContainer.style.cursor = 'grab';
        });
        window.addEventListener('mouseleave', () => {
            wrapDragState.isDragging = false;
            wrapContainer.style.cursor = 'grab';
        });

        // Touch event listeners for mobile panning
        wrapContainer.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                wrapDragState.isDragging = true;
                wrapDragState.startX = e.touches[0].clientX;
                wrapDragState.startY = e.touches[0].clientY;
                wrapDragState.hasMoved = false;
            }
        }, { passive: false });

        let wrapTouchRafPending = false;
        window.addEventListener('touchmove', (e) => {
            if (wrapDragState.isDragging && e.touches.length === 1) {
                e.preventDefault();
                const dx = e.touches[0].clientX - wrapDragState.startX;
                const dy = e.touches[0].clientY - wrapDragState.startY;
                if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                    wrapDragState.hasMoved = true;
                }
                wrapDragState.offX += dx;
                wrapDragState.offY += dy;
                wrapDragState.startX = e.touches[0].clientX;
                wrapDragState.startY = e.touches[0].clientY;
                if (!wrapTouchRafPending) {
                    wrapTouchRafPending = true;
                    requestAnimationFrame(() => {
                        wrapTouchRafPending = false;
                        updateTransform();
                    });
                }
            }
        }, { passive: false });

        window.addEventListener('touchend', () => {
            wrapDragState.isDragging = false;
        });
        
        window.addEventListener('touchcancel', () => {
            wrapDragState.isDragging = false;
        });
    }
    
    updateTransform();
    _lastWrapSVGDrawParams = { activeSolution, numVars, rowsBits, colsBits, rowGray, colGray, tilesX, tilesY };

    requestAnimationFrame(() => {
        drawWrapSVGLoops(activeSolution, numVars, rowsBits, colsBits, rowGray, colGray, tilesX, tilesY);
    });
}

/** Redraw only the Wrap view's SVG loop overlay using cached render parameters. */
function _redrawWrapSVGOnly() {
    if (!_lastWrapSVGDrawParams) { renderHTMLKMap(); return; }
    const { activeSolution, numVars, rowsBits, colsBits, rowGray, colGray, tilesX, tilesY } = _lastWrapSVGDrawParams;
    drawWrapSVGLoops(activeSolution, numVars, rowsBits, colsBits, rowGray, colGray, tilesX, tilesY);
}

// Given the sorted list of Gray-code indices (in [0,len)) that a term
// matches along one axis, finds the single contiguous *cyclic* run they
// form. A valid power-of-two K-map group's matches are always exactly one
// cyclic run - but that run can wrap past the end of the axis (e.g. rows
// {3,0} in a 4-row axis are adjacent because index 3 is next to index 0
// cyclically). Returns { start, count } where start is always in [0,len)
// but start+count may exceed len - callers should NOT wrap that back into
// range: drawing the overflow past the tile's edge is exactly what makes it
// align seamlessly with the next tile in the infinite wrap view.
function findCyclicRun(matches, len) {
    if (matches.length >= len) return { start: 0, count: len };
    const set = new Set(matches);
    for (const m of matches) {
        const prev = (m - 1 + len) % len;
        if (!set.has(prev)) {
            return { start: m, count: matches.length };
        }
    }
    // Shouldn't happen for a valid K-map group, but fail safe.
    return { start: matches[0], count: matches.length };
}

function drawWrapSVGLoops(solution, numVars, rowsBits, colsBits, rowGray, colGray, tilesX, tilesY) {
    const wrapSvg = document.getElementById('kmap-wrap-svg-overlay');
    const wrapSurface = document.getElementById('kmap-wrap-surface');
    if (!wrapSvg || !wrapSurface) return;
    
    wrapSvg.innerHTML = '';
    const gridEl = wrapSurface.children[3];
    wrapSvg.setAttribute('width', gridEl.scrollWidth);
    wrapSvg.setAttribute('height', gridEl.scrollHeight);
    
    const surfaceRect = gridEl.getBoundingClientRect();
    
    // Use the same palette as every other K-map view (normal 2D, 3D) so a
    // given group reads as the same color no matter which view mode it's
    // seen in.
    const colors = LOOP_COLORS;

    const cellSize = WRAP_CELL_SIZE;

    // The 5px pad / 12px corner-radius / 3px stroke-width used below were
    // tuned for the normal (non-wrap) K-map view's un-scaled 80px cell (see
    // drawLoopPieceSVG). The wrap view's cell is a fixed 44px, so applying
    // those same absolute pixel values here makes the outline read as
    // oversized and over-rounded relative to the smaller cell. Scale them
    // down by the same ratio, the same way drawLoopPieceSVG scales by the
    // normal view's container-fit `scale`.
    const wrapLoopScale = cellSize / 80;

    for (let i = 0; i < (tilesX * tilesY); i++) {
        const tile = document.getElementById(`wrap-tile-${i}`);
        if (!tile) continue;

        // Tile origin in surface coordinates. Position within the tile is
        // computed algebraically from here (start * cellSize) rather than by
        // querying a specific <td>, since a wrapped group's run can extend
        // past this tile's own row/col count into the next tile.
        const tileRect = tile.getBoundingClientRect();
        const tileOriginX = tileRect.left - surfaceRect.left;
        const tileOriginY = tileRect.top - surfaceRect.top;

        // Pass 1: compute every group's raw (un-padded) box within this tile.
        const rects = solution.map(termStr => {
            const term = termStr;

            // As in drawSVGLoops: a selection filters which term gets a box
            // (returning null here, same as a term that doesn't touch this
            // tile), without touching the idx-based color below.
            const _effTermWrap = _effectiveImplicantTerm();
            if (_effTermWrap !== null && termStr !== _effTermWrap) return null;

            const rMatches = [];
            for (let r = 0; r < rowGray.length; r++) {
                let match = true;
                for(let k=0; k<rowsBits; k++) {
                    if (term[k] !== '-' && term[k] !== rowGray[r][k]) { match = false; break; }
                }
                if (match) rMatches.push(r);
            }
            const cMatches = [];
            for (let c = 0; c < colGray.length; c++) {
                let match = true;
                for(let k=0; k<colsBits; k++) {
                    if (term[rowsBits + k] !== '-' && term[rowsBits + k] !== colGray[c][k]) { match = false; break; }
                }
                if (match) cMatches.push(c);
            }

            if (rMatches.length === 0 || cMatches.length === 0) return null;

            // Groups whose matching rows/cols aren't a simple forward range
            // (e.g. row 0 and row 3 of a 4-row axis) wrap cyclically - find
            // where that run actually starts so the box lands in the right
            // place, including spilling into the neighboring tile when it
            // wraps past this tile's edge.
            const { start: rStart, count: rCount } = findCyclicRun(rMatches, rowGray.length);
            const { start: cStart, count: cCount } = findCyclicRun(cMatches, colGray.length);

            const minX = tileOriginX + cStart * cellSize;
            const minY = tileOriginY + rStart * cellSize;
            return { minX, minY, maxX: minX + cCount * cellSize, maxY: minY + rCount * cellSize };
        });

        // Pass 2: figure out which groups (within this tile) share an overlapping edge.
        const extraShrink = computeAntiOverlapShrink(rects);

        // Pass 3: draw, using the base pad plus any anti-overlap shrink, both
        // scaled down to match this view's smaller fixed cell size.
        rects.forEach((r, idx) => {
            if (!r) return;
            const color = colors[idx % colors.length];
            const pad = (5 + extraShrink[idx]) * wrapLoopScale;
            const w = Math.max(2, (r.maxX - r.minX) - pad * 2);
            const h = Math.max(2, (r.maxY - r.minY) - pad * 2);
            const rx = Math.min(12 * wrapLoopScale, w / 2, h / 2);
            const strokeWidth = Math.max(1, 3 * wrapLoopScale);

            const path = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            path.setAttribute("x", r.minX + pad);
            path.setAttribute("y", r.minY + pad);
            path.setAttribute("width", w);
            path.setAttribute("height", h);
            path.setAttribute("fill", color);
            path.setAttribute("fill-opacity", "0.2");
            path.setAttribute("stroke", color);
            path.setAttribute("stroke-width", String(strokeWidth));
            path.setAttribute("rx", String(rx));
            wrapSvg.appendChild(path);
        });
    }
}

// renderAlgebraicSolution removed and merged into renderSolutionView

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        const sopPosPill = document.getElementById('sop-pos-pill');
        if (sopPosPill) {
            const current = sopPosPill.getAttribute('data-state');
            const targetVal = current === 'sop' ? 'pos' : 'sop';
            const btn = sopPosPill.querySelector(`.pill-option[data-val="${targetVal}"]`);
            if (btn) btn.click();
        }
    }
});

// Event Delegation for K-Map Cell Clicks and Implicant Group Selection
document.addEventListener('click', (e) => {
    const cell = e.target.closest('.kmap-cell');
    if (cell && cell.hasAttribute('data-minterm')) {
        const minterm = parseInt(cell.getAttribute('data-minterm'), 10);
        if (!isNaN(minterm)) {
            handleKMapCellClick(minterm);
        }
        return;
    }
    const implicant = e.target.closest('.selectable-implicant');
    if (implicant && implicant.hasAttribute('data-term')) {
        const term = implicant.getAttribute('data-term');
        if (term) {
            selectImplicantGroup(term);
        }
        return;
    }
});

/** Redraw whichever K-map view is active - shared by hover and click paths. */
function _redrawActiveKMapView() {
    if (kmapViewMode === 'wrap') {
        _redrawWrapSVGOnly();
    } else if (kmapViewMode === '3d') {
        _updateKMap3DGroupHelpers();
    } else {
        _redrawSVGOnly();
    }
}

// Event Delegation for Implicant Group Hover-Preview.
// NOTE: mouseenter/mouseleave do NOT bubble, so they can't be delegated from
// document the way 'click' above is - only mouseover/mouseout bubble, so
// those are what we listen for here. closest('.selectable-implicant') plus
// checking relatedTarget is what keeps this from firing repeatedly as the
// mouse moves between child nodes inside the same term-box.
document.addEventListener('mouseover', (e) => {
    const implicant = e.target.closest('.selectable-implicant');
    if (!implicant || !implicant.hasAttribute('data-term')) return;
    if (implicant.contains(e.relatedTarget)) return; // moved within the same box, ignore
    const term = implicant.getAttribute('data-term');
    if (!term || term === _hoveredImplicantTerm) return;
    _hoveredImplicantTerm = term;
    _redrawActiveKMapView();
});

document.addEventListener('mouseout', (e) => {
    const implicant = e.target.closest('.selectable-implicant');
    if (!implicant || !implicant.hasAttribute('data-term')) return;
    if (implicant.contains(e.relatedTarget)) return; // moved within the same box, ignore
    if (_hoveredImplicantTerm === null) return;
    _hoveredImplicantTerm = null;
    _redrawActiveKMapView();
});





