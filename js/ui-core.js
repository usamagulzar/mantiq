// Global App Domain URL
window.url = 'mantiq.usamagulzar.dev';

// Dismiss startup loader veil
window.addEventListener('load', function() {
    setTimeout(function() {
        var loader = document.getElementById('init-loader-screen');
        if (loader) {
            loader.style.opacity = '0';
            loader.style.visibility = 'hidden';
            setTimeout(function() { if (loader.parentNode) loader.parentNode.removeChild(loader); }, 300);
        }
    }, 250);
});

// Global Cached Data Snapshots
var lastKMapData = null;
var lastTruthTableData = null;

// Solutions currently shown in the carousel - kept in sync with each
// updateFrontend() render so the overflow badge/popup can reference them
// without re-deriving from WASM.
let _lastRenderedSolutions = [];

window.getLoadingOrEmptyMsg = function(msg) {
    const exprTrimmed = _state.expression ? _state.expression.trim() : '';
    if (exprTrimmed === '') {
        return `<div class="empty-msg" style="color:var(--text-muted); text-align:center; margin-top:20px;">${msg}</div>`;
    }
    const isComputing = typeof normalizeExprForCompare === 'function' 
        ? normalizeExprForCompare(exprTrimmed) !== normalizeExprForCompare(_state.computedForExpr)
        : exprTrimmed !== _state.computedForExpr;
    if (isComputing || _state.hasResult) {
        return '<div class="solution-empty thinking-spinner" style="margin-top:20px;"><span class="thinking-dots">Thinking</span></div>';
    }
    return `<div class="empty-msg" style="color:var(--text-muted); text-align:center; margin-top:20px;">Invalid expression</div>`;
};

// DOM Elements
const elements = {
    input: document.getElementById('expression-input'),
    syntaxErrorLine: document.getElementById('syntax-error-line'),
    sopPosPill: document.getElementById('sop-pos-pill'),
    themePill: document.getElementById('theme-pill'),
    resultRow: document.getElementById('result-row'),
    solutionsCarousel: document.getElementById('solutions-carousel'),
    errorFeedback: document.getElementById('error-feedback'),
    emptyState: document.getElementById('empty-state'),
    canvas: document.getElementById('canvas'),
    
    // Modals
    altPopup: document.getElementById('alt-popup'),
    altBody: document.getElementById('alt-body'),
    altClose: document.getElementById('alt-close'),

    // Solutions overflow indicator
    solutionsOverflowBtn: document.getElementById('solutions-overflow-btn'),
    solutionsOverflowCount: document.getElementById('solutions-overflow-count'),
    
    // Nav
    navButtons: document.querySelectorAll('.nav-btn'),
    toastContainer: document.getElementById('toast-container'),
    kmapViewPill: document.getElementById('kmap-view-pill')
};

/**
 * queryWasmString — reads from JS-side state cache (never blocks).
 * Arguments are passed through for compatibility but ignored for cached fns.
 */
function queryWasmString(funcName, args = [], argTypes = []) {
    if (!wasmReady) return '';
    try {
        switch (funcName) {
            case 'mantiq_getExpression':     return _state.expression     || '';
            case 'mantiq_getSimplifiedExpr': return _state.simplifiedExpr || '';
            case 'mantiq_getAllSolutions':    return _state.allSolutions   || '[]';
            case 'mantiq_getQMSteps':        return _state.qmSteps        || '';
            case 'mantiq_getVariables':      return _state.variables       || '[]';
            case 'mantiq_getVariableStates': return _state.variableStates  || '{}';
            case 'mantiq_getTruthTableJSON': return _state.truthTableJSON  || '';
            case 'mantiq_getKMapJSON':       return _state.kMapJSON        || '';
            case 'mantiq_getCircuitJSON':    return _state.circuitJSON     || '';
            case 'mantiq_getVerilogCode':
                return (args && args[0]) ? _state.verilogGate : _state.verilogDataflow;
            default:
                return '';
        }
    } catch (e) {
        console.error(`[Mantiq] queryWasmString(${funcName}):`, e);
        return '';
    }
}

// Toast Notifications
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '✨';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    
    toast.innerHTML = `<span>${icon}</span> <div>${message}</div>`;
    elements.toastContainer.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 50);
    
    // Dismiss
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Apply the given solution index as the active selection everywhere: DOM
 * card highlighting (in both the carousel and the "all solutions" popup if
 * it's open), the WASM-side selected solution, and whichever view is
 * currently on screen. Shared by the carousel card's own click handler and
 * the popup so the two selection paths can never drift out of sync.
 */
function selectSolutionByIndex(index) {
    if (!_lastRenderedSolutions[index]) return;

    document.querySelectorAll('.solution-card').forEach(c => {
        const isMatch = parseInt(c.getAttribute('data-solution-index'), 10) === index;
        c.classList.toggle('selected-solution', isMatch);
        const txt = c.querySelector('.expr-text');
        if (txt) txt.style.color = isMatch ? 'var(--success)' : 'var(--text-primary)';
    });

    if (typeof Module !== 'undefined' && Module.ccall) {
        Module.ccall('mantiq_setSelectedSolution', null, ['number'], [index]);
        
        // Re-apply custom expression if this card is currently toggled to XOR
        const targetCard = document.querySelector(`.solution-card[data-solution-index="${index}"]`);
        if (targetCard) {
            const xorBtn = targetCard.querySelector('.xor-toggle-btn');
            if (xorBtn && xorBtn.classList.contains('active')) {
                const exprText = targetCard.querySelector('.expr-text').textContent;
                Module.ccall('mantiq_setCustomSimplifiedExpr', null, ['string'], [exprText]);
            }
        }

        selectedSolutionIndex = index;
        window.globalSelectedSolutionIndex = index;

        const activeBtn = document.querySelector('.nav-btn.active');
        if (activeBtn) {
            const viewMode = activeBtn.getAttribute('data-view');
            if (viewMode === '3' && typeof renderTruthTableAndWaveform === 'function') renderTruthTableAndWaveform();
            else if (viewMode === '4' && typeof renderVerilogHTML === 'function') renderVerilogHTML();
            else if (viewMode === '0' && typeof renderHTMLSimulation === 'function') renderHTMLSimulation();
            else if (viewMode === '1' && typeof renderHTMLCircuit === 'function') renderHTMLCircuit();
            else if (viewMode === '5' && typeof renderSolutionView === 'function') renderSolutionView();
        }
    }

    // Bring the selected card into view within the carousel. block:'nearest'
    // keeps this from touching page-level vertical scroll - the card is
    // already vertically in view, only the carousel's own horizontal scroll
    // needs to move.
    const targetCard = document.querySelector(`.solution-card[data-solution-index="${index}"]`);
    if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }

    // Keep the popup's own list (if open) in sync with the new selection.
    document.querySelectorAll('.alt-solution-item').forEach(item => {
        item.classList.toggle('active', parseInt(item.getAttribute('data-solution-index'), 10) === index);
    });
}
window.selectSolutionByIndex = selectSolutionByIndex;

/**
 * Show/hide the "+N" round badge at the right of the solutions carousel.
 * N is however many solution cards are ACTUALLY scrolled out of the
 * carousel's current visible width - recomputed on scroll/resize (see
 * listeners below), not just at render time, so it tracks true overflow
 * rather than a fixed "total minus one" count.
 */
function updateSolutionsOverflowBadge() {
    const carousel = elements.solutionsCarousel;
    const btn = elements.solutionsOverflowBtn;
    const countEl = elements.solutionsOverflowCount;
    if (!carousel || !btn || !countEl) return;

    requestAnimationFrame(() => {
        if (_lastRenderedSolutions.length <= 1 || carousel.scrollWidth <= carousel.clientWidth + 1) {
            btn.style.display = 'none';
            return;
        }

        const viewLeft = carousel.scrollLeft;
        const viewRight = viewLeft + carousel.clientWidth;
        let hiddenCount = 0;
        Array.from(carousel.children).forEach(card => {
            const cardLeft = card.offsetLeft;
            const cardRight = cardLeft + card.offsetWidth;
            if (cardLeft < viewLeft - 1 || cardRight > viewRight + 1) hiddenCount++;
        });

        if (hiddenCount <= 0) {
            btn.style.display = 'none';
            return;
        }

        countEl.textContent = '+' + hiddenCount;
        btn.style.display = 'flex';
    });
}

/** Build and show the "all solutions" popup - reuses the existing #alt-popup modal shell. */
function openAllSolutionsPopup() {
    if (!elements.altPopup || !elements.altBody) return;

    const currentActiveIdx = (typeof selectedSolutionIndex !== 'undefined') ? selectedSolutionIndex : 0;

    elements.altBody.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'alt-solutions-list';

    _lastRenderedSolutions.forEach((sol, index) => {
        const item = document.createElement('div');
        item.className = 'alt-solution-item' + (index === currentActiveIdx ? ' active' : '');
        item.setAttribute('data-solution-index', String(index));

        const textSpan = document.createElement('span');
        textSpan.className = 'expr-text';
        textSpan.textContent = sol.expr;

        const indexTag = document.createElement('span');
        indexTag.className = 'alt-solution-index';
        indexTag.textContent = 'Sol ' + (index + 1);

        item.appendChild(textSpan);
        item.appendChild(indexTag);

        item.addEventListener('click', () => {
            selectSolutionByIndex(index);
            elements.altPopup.style.display = 'none';
        });

        list.appendChild(item);
    });

    elements.altBody.appendChild(list);
    elements.altPopup.style.display = 'flex';
}

if (elements.solutionsOverflowBtn) {
    elements.solutionsOverflowBtn.addEventListener('click', openAllSolutionsPopup);
}
if (elements.altClose) {
    elements.altClose.addEventListener('click', () => {
        elements.altPopup.style.display = 'none';
    });
}
if (elements.altPopup) {
    elements.altPopup.addEventListener('click', (e) => {
        if (e.target === elements.altPopup) elements.altPopup.style.display = 'none';
    });
}
if (elements.solutionsCarousel) {
    elements.solutionsCarousel.addEventListener('scroll', () => updateSolutionsOverflowBadge());
    if (window.ResizeObserver) {
        new ResizeObserver(() => updateSolutionsOverflowBadge()).observe(elements.solutionsCarousel);
    }
}

// Helper: Calculate gate depth of a circuit node
function getGateDepth(node) {
    if (!node) return 0;
    if (!node.isGate) return 0;
    let maxChildDepth = 0;
    if (node.children && node.children.length > 0) {
        maxChildDepth = Math.max(...node.children.map(getGateDepth));
    }
    return 1 + maxChildDepth;
}

// Check gate levels and update navigation state
function updateNavigationState() {
    if (!wasmReady) return;

    const exprStr = (_state.expression || (elements.input && elements.input.value) || '').trim();
    const isKmapInput = exprStr.toUpperCase().includes('KMAP');

    if (isKmapInput) {
        elements.navButtons.forEach(b => {
            const vMode = b.getAttribute('data-view');
            if (vMode !== '2' && vMode !== '3') {
                b.classList.add('disabled');
                b.title = 'Navigation locked to K-Map/Truth Table view for KMAP input';
            } else {
                b.classList.remove('disabled');
                b.removeAttribute('title');
            }
        });
        return;
    }
    
    // Reset ALL nav buttons to enabled state when not a KMAP command
    elements.navButtons.forEach(b => {
        b.classList.remove('disabled');
        b.removeAttribute('title');
    });

    // If there is only 1 variable, K-Map is meaningless — disable that tab.
    // We do NOT force-switch away if the user is already on KMAP; they'll see
    // the note inside the panel and can navigate away themselves.
    try {
        const vars = JSON.parse(queryWasmString('mantiq_getVariables') || '[]');
        if (Array.isArray(vars) && vars.length === 1) {
            const btnKmap = document.getElementById('btn-view-kmap');
            if (btnKmap) {
                btnKmap.classList.add('disabled');
                btnKmap.title = 'K-Map requires 2 or more variables';
            }
            return;
        }
    } catch(_) {}

    const btnSim = document.getElementById('btn-view-sim');
    const btnCircuit = document.getElementById('btn-view-circuit');
    if (!btnSim || !btnCircuit) return;
    
    const jsonStr = queryWasmString('mantiq_getCircuitJSON');
    if (!jsonStr) return;
    
    let circuitData;
    try {
        circuitData = JSON.parse(jsonStr);
    } catch(e) {
        return;
    }
    
    const origDepth = getGateDepth(circuitData.original);
    const simpDepth = getGateDepth(circuitData.simplified);
    
    const maxAllowedDepth = 99; // Set to 99 to effectively disable the limit for now
    const bothExceeded = (origDepth > maxAllowedDepth) && (simpDepth > maxAllowedDepth);
    
    if (bothExceeded) {
        btnSim.classList.add('disabled');
        btnCircuit.classList.add('disabled');
        
        const note = "Circuits exceed 99 levels of gates.";
        btnSim.title = note;
        btnCircuit.title = note;
        
        // If current active view is simulation (0) or circuit diagram (1), switch to K-map (2) or Verilog (4)
        const activeBtn = document.querySelector('.nav-btn.active');
        if (activeBtn) {
            const currentView = activeBtn.getAttribute('data-view');
            if (currentView === '0' || currentView === '1') {
                const kmapBtn = document.getElementById('btn-view-kmap');
                const verilogBtn = document.getElementById('btn-view-verilog');
                const targetBtn = kmapBtn || verilogBtn;
                if (targetBtn) {
                    targetBtn.click();
                }
            }
        }
    } else {
        btnSim.classList.remove('disabled');
        btnCircuit.classList.remove('disabled');
        btnSim.removeAttribute('title');
        btnCircuit.removeAttribute('title');
    }
}

// Diagnose why an expression failed to parse, for the error-state tooltip
function diagnoseExpressionError(expr) {
    if (!expr) return "";

    // 1. Parentheses Mismatch
    const openParen = (expr.match(/\(/g) || []).length;
    const closeParen = (expr.match(/\)/g) || []).length;
    if (openParen > closeParen) return "Missing closing parenthesis ')'.";
    if (closeParen > openParen) return "Extra closing parenthesis ')'.";

    // 2. Minterm / Don't Care Overlap Check
    const mMatch = expr.match(/[mM]\s*\(([\d,\s]+)\)/);
    const dMatch = expr.match(/[dD]\s*\(([\d,\s]+)\)/);
    if (mMatch && dMatch) {
        const mTerms = mMatch[1].split(',').map(s => s.trim()).filter(s => s !== '');
        const dTerms = dMatch[1].split(',').map(s => s.trim()).filter(s => s !== '');
        const overlap = mTerms.find(t => dTerms.includes(t));
        if (overlap !== undefined) return `Conflict: Term ${overlap} is in both minterms and don't cares.`;
    }

    // 3. Variable Limit Check (> 6 variables)
    let uniqueVars = new Set();
    const varPrefixMatch = expr.match(/^([a-zA-Z0-9_,'\s]+):/);
    if (varPrefixMatch) {
        // Shorthand format: "A,B,C: m(1)"
        uniqueVars = new Set(varPrefixMatch[1].match(/[a-zA-Z]/g) || []);
    } else if (!/[mMdD]\s*\(/.test(expr)) {
        // Algebraic format: Strip known keywords first
        const stripped = expr.replace(/XOR|XNOR|KMAP|TRUE|FALSE/gi, '');
        uniqueVars = new Set(stripped.match(/[a-zA-Z]/g) || []);
    }
    if (uniqueVars.size > 6) return "Maximum 6 variables supported.";

    // 4. Operator Syntax Checks
    if (/[+\-*>^|&]\s*$/.test(expr)) return "Expression ends with an operator.";
    if (/^\s*[+\-*>^|&]/.test(expr)) return "Expression starts with an operator.";
    if (/[+\-*>^|&]\s*[+\-*>^|&]/.test(expr)) return "Consecutive operators detected.";

    return ""; // Return empty string if no explicit error found
}

window.formatInputSubscriptsNative = function(inputEl) {
    if (!inputEl || !inputEl.value) return;
    const oldVal = inputEl.value;
    const oldPos = inputEl.selectionStart;
    const subMap = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
    const revMap = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };

    // Live typing converts digits to subscript characters as soon as they're
    // typed. If we only ever matched plain digits, a digit typed after an
    // already-subscripted one (e.g. the "2" in "a12", typed after "1" was
    // already turned into "₁") would no longer sit next to a plain digit or
    // letter, so it could never join the same run. Un-subscript everything
    // back to plain digits first, then re-run the formatter over the whole
    // (now normalized) string so runs of any length re-merge correctly.
    const normalized = oldVal.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, d => revMap[d]);

    const newVal = normalized.replace(/([a-zA-Z])(\d+)/g, (m, p1, p2) => {
        return p1 + p2.split('').map(d => subMap[d] || d).join('');
    });

    if (newVal !== oldVal) {
        inputEl.value = newVal;
        try {
            inputEl.setSelectionRange(oldPos, oldPos);
        } catch (e) {}
    }
};

// Sync WASM State with DOM Layout
function updateFrontend() {
    if (!wasmReady) return;

    if (elements.input) {
        formatInputSubscriptsNative(elements.input);
    }

    const expr = elements.input.value.trim();
    
    elements.syntaxErrorLine.style.display = 'none';
    elements.errorFeedback.style.display = 'none';

    // Check if input is a KMAP command — force shift to K-Map section and lock navigation.
    // This also re-runs asynchronously whenever a worker state-snapshot lands
    // (see worker-bridge.js), which happens on a delay after typing/toggling.
    // If the user clicks over to Truth Table (view 3, still allowed for KMAP
    // input) in that window, a naive "!== 2" check here would force them back
    // to K-Map the instant the snapshot arrives - the "first click resets,
    // second click works" bug. Treat both allowed views as already-settled.
    const isKmapInput = expr.toUpperCase().includes('KMAP');
    if (isKmapInput) {
        setAlgProofAvailability(false);
        if (_state.currentView !== 2 && _state.currentView !== 3) {
            _state.currentView = 2;
            Module.ccall('mantiq_setView', null, ['number'], [2]);
            lastActiveView = 2;
            elements.navButtons.forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-view') === '2');
            });
            handleViewChange(2);
        }
    }

    // 1. Run client-side syntax diagnosis
    const manualError = diagnoseExpressionError(expr);
    
    // 2. Check if WASM currently holds a valid result
    const wasmHasResult = Module.ccall('mantiq_hasResult', 'number', [], []) !== 0;
    
    // An expression is only fully valid if WASM has a result AND there are no manual syntax errors
    const hasResult = wasmHasResult && !manualError;

    if (hasResult) {
        elements.emptyState.style.display = 'none';
        elements.resultRow.style.display = 'flex';
        
        updateNavigationState();
        
function compareNaturalJS(a, b) {
    if (a === b) return 0;
    const matchA = String(a).match(/^([a-zA-Z]+)(\d*)$/);
    const matchB = String(b).match(/^([a-zA-Z]+)(\d*)$/);
    if (matchA && matchB) {
        if (matchA[1] !== matchB[1]) {
            return matchA[1].localeCompare(matchB[1]);
        }
        const numA = matchA[2] !== '' ? parseInt(matchA[2], 10) : -1;
        const numB = matchB[2] !== '' ? parseInt(matchB[2], 10) : -1;
        if (numA !== numB) {
            return numA - numB;
        }
    }
    return String(a).localeCompare(String(b));
}

window.formatSubscript = function(str) {
    if (!str || typeof str !== 'string') return '';
    const subMap = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
    const revMap = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
    // Normalize any pre-existing subscript digits back to plain digits first
    // so a full run of any length (not just 1-2 digits) formats as one unit.
    const normalized = str.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, d => revMap[d]);
    return normalized.replace(/([a-zA-Z])(\d+)/g, (m, p1, p2) => {
        return p1 + p2.split('').map(d => subMap[d] || d).join('');
    });
};

window.formatSubscriptUnicode = window.formatSubscript;

window.formatExprHtml = function(str) {
    if (!str || typeof str !== 'string') return '';
    const safe = typeof escapeHtml === 'function' ? escapeHtml(str) : String(str);
    return window.formatSubscript(safe);
};

function parseTermLitsJS(term) {
    const lits = [];
    const clean = term.replace(/[()]/g, '');
    const re = /([a-zA-Z][a-zA-Z0-9_\u2080-\u2089]*|\d)(['!]?)/g;
    let match;
    while ((match = re.exec(clean)) !== null) {
        lits.push({ var: match[1], comp: match[2] === "'" || match[2] === "!" });
    }
    return lits;
}

function compareSopTermsJS(a, b) {
    if (a === b) return 0;
    const litsA = parseTermLitsJS(a);
    const litsB = parseTermLitsJS(b);

    if (litsA.length !== litsB.length) {
        return litsA.length - litsB.length;
    }

    const minLen = Math.min(litsA.length, litsB.length);
    for (let i = 0; i < minLen; i++) {
        if (litsA[i].var !== litsB[i].var) {
            return compareNaturalJS(litsA[i].var, litsB[i].var);
        }
        if (litsA[i].comp !== litsB[i].comp) {
            return litsA[i].comp ? 1 : -1;
        }
    }
    return a.localeCompare(b);
}

function sortLiteralsInSingleTermJS(term) {
    const lits = parseTermLitsJS(term);
    if (lits.length === 0) return term;
    lits.sort((a, b) => {
        if (a.var !== b.var) return compareNaturalJS(a.var, b.var);
        return a.comp === b.comp ? 0 : (a.comp ? 1 : -1);
    });
    const hasParens = term.trim().startsWith('(') && term.trim().endsWith(')');
    const body = lits.map(l => l.var + (l.comp ? "'" : '')).join('');
    return hasParens ? '(' + body + ')' : body;
}

function sortBooleanExpression(expr) {
    if (!expr || expr === '0' || expr === '1' || expr === 'TRUE' || expr === 'FALSE') return expr;
    if (expr.includes('(') && expr.includes(')')) {
        const clauses = [];
        let i = 0;
        while (i < expr.length) {
            if (expr[i] === '(') {
                let end = expr.indexOf(')', i);
                if (end === -1) end = expr.length;
                const rawClause = expr.substring(i + 1, end);
                const lits = rawClause.split('+').map(s => s.trim()).filter(Boolean);
                lits.sort((a, b) => {
                    const matchA = a.match(/^([a-zA-Z]\d?|\d)/);
                    const matchB = b.match(/^([a-zA-Z]\d?|\d)/);
                    const varA = matchA ? matchA[1] : a[0];
                    const varB = matchB ? matchB[1] : b[0];
                    if (varA !== varB) return compareNaturalJS(varA, varB);
                    const compA = a.includes("'") || a.includes("!");
                    const compB = b.includes("'") || b.includes("!");
                    return compA === compB ? 0 : (compA ? 1 : -1);
                });
                clauses.push('(' + lits.join('+') + ')');
                i = end + 1;
            } else if (/[a-zA-Z0-9]/.test(expr[i])) {
                let start = i;
                if (/[a-zA-Z]/.test(expr[i])) {
                    i++;
                    if (i < expr.length && /\d/.test(expr[i])) i++;
                } else {
                    i++;
                }
                while (i < expr.length && (expr[i] === "'" || expr[i] === "!")) i++;
                clauses.push(expr.substring(start, i));
            } else {
                i++;
            }
        }
        if (clauses.length > 0) {
            clauses.sort(compareSopTermsJS);
            return clauses.join('');
        }
    }

    const terms = expr.split('+').map(s => s.trim()).filter(Boolean);
    if (terms.length <= 1) {
        return sortLiteralsInSingleTermJS(expr.trim());
    }

    const sortedTerms = terms.map(t => sortLiteralsInSingleTermJS(t));
    sortedTerms.sort(compareSopTermsJS);
    return sortedTerms.join(' + ');
}

        // Generate Solutions Array
        let solutions = [];
        let primaryExpr = '';
        if (Module.ccall('mantiq_isAlwaysTrue', 'number', [], []) !== 0) {
            primaryExpr = 'TRUE';
            solutions = [{ expr: 'TRUE' }];
        } else if (Module.ccall('mantiq_isAlwaysFalse', 'number', [], []) !== 0) {
            primaryExpr = 'FALSE';
            solutions = [{ expr: 'FALSE' }];
        } else {
            primaryExpr = sortBooleanExpression(queryWasmString('mantiq_getSimplifiedExpr'));
            solutions.push({ expr: primaryExpr });
            try {
                const solsJSON = queryWasmString('mantiq_getAllSolutions');
                const sols = JSON.parse(solsJSON || '[]');
                sols.forEach(s => {
                    const sortedS = sortBooleanExpression(s);
                    if (sortedS !== solutions[0].expr && !solutions.some(item => item.expr === sortedS)) {
                        solutions.push({ expr: sortedS });
                    }
                });
            } catch (e) {}
        }
        lastSimplifiedExpr = primaryExpr;
        const newSolsStr = JSON.stringify(solutions);
        const oldSolsStr = JSON.stringify(_lastRenderedSolutions);
        if (newSolsStr !== oldSolsStr) {
            window.toggledXorIndices = new Set();
        }
        _lastRenderedSolutions = solutions;
        // Render into Carousel
        elements.solutionsCarousel.innerHTML = '';
        
        const currentActiveIdx = (typeof selectedSolutionIndex !== 'undefined') ? selectedSolutionIndex : 0;

        solutions.forEach((sol, index) => {
            const isSelected = (index === currentActiveIdx);
            const card = document.createElement('div');
            card.className = 'solution-card' + (isSelected ? ' selected-solution' : '');
            card.setAttribute('data-solution-index', String(index));
            
            const textSpan = document.createElement('span');
            textSpan.className = 'expr-text';
            textSpan.style.color = isSelected ? 'var(--success)' : 'var(--text-primary)';
            textSpan.innerHTML = formatExprHtml(sol.expr);

            if (solutions.length > 1) {
                const numSpan = document.createElement('span');
                numSpan.textContent = (index + 1) + '. ';
                numSpan.style.fontSize = '0.85em';
                numSpan.style.opacity = '0.6';
                numSpan.style.fontWeight = '500';
                textSpan.prepend(numSpan);

                textSpan.style.cursor = 'pointer';
                textSpan.title = 'Click to select this solution for Circuit/Verilog/Simulation';
                textSpan.addEventListener('click', () => selectSolutionByIndex(index));
            }
            
            const copyBtn = document.createElement('button');
            copyBtn.className = 'action-icon-btn copy-sol-btn';
            copyBtn.title = 'Copy expression';
            copyBtn.innerHTML = Icons.copy(18);
            
            // Check for XOR/XNOR pattern using the dedicated module
            let xorEq = null;
            try {
                if (typeof extractXorPatterns === 'function') {
                    xorEq = extractXorPatterns(sol.expr);
                }
            } catch (e) {}

            copyBtn.addEventListener('click', () => {
                const isToggled = window.toggledXorIndices && window.toggledXorIndices.has(index) && xorEq;
                const textToCopy = formatSubscript(isToggled ? xorEq : sol.expr);
                navigator.clipboard.writeText(textToCopy).then(() => {
                    showToast('Expression copied!', 'success');
                }).catch(() => {
                    showToast('Failed to copy', 'error');
                });
            });

            let xorBtn = null;
            if (xorEq) {
                xorBtn = document.createElement('button');
                xorBtn.className = 'action-icon-btn xor-toggle-btn';
                xorBtn.title = 'Toggle XOR/XNOR form';
                xorBtn.innerHTML = Icons.star || '★';
                
                // Restore toggle state
                window.toggledXorIndices = window.toggledXorIndices || new Set();
                if (window.toggledXorIndices.has(index)) {
                    xorBtn.classList.add('active');
                    textSpan.textContent = xorEq;
                }
                
                xorBtn.addEventListener('click', () => {
                    const isActive = xorBtn.classList.contains('active');
                    if (isActive) {
                        xorBtn.classList.remove('active');
                        window.toggledXorIndices.delete(index);
                        textSpan.textContent = sol.expr;
                        if (isSelected && typeof Module !== 'undefined' && Module.ccall) {
                            Module.ccall('mantiq_setCustomSimplifiedExpr', null, ['string'], ['']);
                        }
                    } else {
                        xorBtn.classList.add('active');
                        window.toggledXorIndices.add(index);
                        textSpan.textContent = xorEq;
                        if (isSelected && typeof Module !== 'undefined' && Module.ccall) {
                            Module.ccall('mantiq_setCustomSimplifiedExpr', null, ['string'], [xorEq]);
                        }
                    }
                });
            }
            
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'solution-card-actions';
            actionsDiv.appendChild(copyBtn);
            if (xorBtn) actionsDiv.appendChild(xorBtn);

            
            card.appendChild(textSpan);
            card.appendChild(actionsDiv);
            elements.solutionsCarousel.appendChild(card);
        });

        updateSolutionsOverflowBadge();
        
    } else if (expr === '') {
        elements.emptyState.style.display = 'flex';
        elements.resultRow.style.display = 'none';
    }
    // Note: If `expr` is non-empty but currently invalid/incomplete (hasResult is false), 
    // we intentionally skip hiding the result row or views, preserving the last stable cache on screen!

    const appRootEl = document.getElementById('app-root');
    if (appRootEl) {
        if (expr === '') {
            appRootEl.classList.add('landing');
            if (wasmReady && typeof Module !== 'undefined' && Module.ccall) {
                Module.ccall('mantiq_setView', null, ['number'], [0]);
            }
        } else if (wasmHasResult && appRootEl.classList.contains('landing')) {
            appRootEl.classList.remove('landing');
            appRootEl.classList.remove('showing-examples');
        }
    }

    // Expression status button (error / share icon)
    const exprStatusBtn = document.getElementById('expr-status-btn');
    if (exprStatusBtn) {
        if (expr === '' || (appRootEl && appRootEl.classList.contains('landing'))) {
            exprStatusBtn.style.display = 'none';
        } else if (!manualError && wasmHasResult) {
            // Valid State -> Show Share Icon
            exprStatusBtn.style.display = 'flex';
            exprStatusBtn.className = 'state-share';
            exprStatusBtn.removeAttribute('title');
        } else {
            // Error State -> Show Error Icon and specific message
            exprStatusBtn.style.display = 'flex';
            exprStatusBtn.className = 'state-error';
            exprStatusBtn.setAttribute('title', manualError || "Invalid logic expression syntax");
        }
    }

    // Circuit Recognizer — show explain button when expression matches a known circuit
    const circuitExplainBtn = document.getElementById('circuit-explain-btn');
    if (circuitExplainBtn) {
        let matchedCircuits = null;
        if (!manualError && wasmHasResult && expr !== '' && typeof recognizeCircuit === 'function') {
            try {
                let vars = null;
                let minterms = null;

                const kmapJson = queryWasmString('mantiq_getKMapJSON');
                if (kmapJson) {
                    const kmapData = JSON.parse(kmapJson);
                    if (kmapData && Array.isArray(kmapData.minterms) && Array.isArray(kmapData.variables)) {
                        vars = kmapData.variables;
                        minterms = kmapData.minterms;
                    }
                }

                if (!minterms) {
                    const ttJson = queryWasmString('mantiq_getTruthTableJSON');
                    if (ttJson) {
                        const ttData = JSON.parse(ttJson);
                        if (Array.isArray(ttData) && ttData.length > 0 && ttData[0].inputs) {
                            vars = Object.keys(ttData[0].inputs);
                            minterms = ttData.filter(r => String(r.output) === '1').map(r => r.row);
                        }
                    }
                }

                if (vars && minterms) {
                    matchedCircuits = recognizeCircuit(vars.length, minterms);
                }
            } catch (e) {}
        }
        window._lastRecognizedCircuits = matchedCircuits;
        if (matchedCircuits && matchedCircuits.length && !appRootEl?.classList.contains('landing')) {
            circuitExplainBtn.style.display = 'flex';
            circuitExplainBtn.title = matchedCircuits.length === 1
                ? `What is this? — ${matchedCircuits[0].name}`
                : `What is this? — ${matchedCircuits.length} circuits recognized: ${matchedCircuits.map(m => m.name).join(', ')}`;
        } else {
            circuitExplainBtn.style.display = 'none';
        }
    }

    // Sync Hash
    if (expr && !manualError) {
        window.location.hash = `#expr=${encodeURIComponent(expr)}`;
    } else if (expr === '') {
        window.history.replaceState(null, null, ' ');
    }

    // Update active views only if we have a valid result to prevent jittering,
    // AND only once the cached computed fields (kMapJSON/truthTableJSON/etc.)
    // actually correspond to the expression currently in the box. Right after
    // a K-map/Truth-table cell click, updateFrontend() runs synchronously
    // before the debounced worker round trip has finished -- re-rendering
    // here with the still-stale cache would revert the just-clicked cell and
    // cause a rapid follow-up click to compute its toggle from the wrong
    // baseline, silently dropping earlier clicks in the burst. The later,
    // async updateFrontend() call (triggered once the worker's snapshot
    // actually arrives) is what performs the real render.
    const isExprMatched = typeof normalizeExprForCompare === 'function'
        ? normalizeExprForCompare(_state.computedForExpr) === normalizeExprForCompare(expr)
        : _state.computedForExpr === expr;
    if (hasResult && isExprMatched) {
        const activeBtn = document.querySelector('.nav-btn.active');
        if (activeBtn) {
            const viewMode = activeBtn.getAttribute('data-view');
            if (viewMode === '3' && typeof renderTruthTableAndWaveform === 'function') renderTruthTableAndWaveform();
            else if (viewMode === '4' && typeof renderVerilogHTML === 'function') renderVerilogHTML();
            else if (viewMode === '1' && typeof renderHTMLCircuit === 'function') renderHTMLCircuit();
            else if (viewMode === '0' && typeof renderHTMLSimulation === 'function') renderHTMLSimulation(false);
            else if (viewMode === '2' && typeof renderHTMLKMap === 'function') renderHTMLKMap();
            else if (viewMode === '5' && typeof renderSolutionView === 'function') renderSolutionView();
        }
    }
}

// Small helper to keep dynamically-inserted log text safe
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function applySymbolReplacements(text) {
    if (!text) return text;
    return text
        // 1. Multi-character operators FIRST (so sub-parts don't trigger single replacements)
        .replace(/<->/g, '↔')
        .replace(/->/g, '→')
        
        // 2. Single-character ASCII logical equivalents
        .replace(/!/g, '¬')
        .replace(/~/g, '¬')
        .replace(/\|/g, '∨')
        .replace(/&/g, '∧')
        .replace(/\^/g, '⊕')
        .replace(/=/g, '↔') // Single '=' maps to biconditional/equivalence
}

// Global replacement listener for inputs, textareas, and contenteditable elements
document.addEventListener('input', (e) => {
    const target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const originalValue = target.value;
        const newValue = applySymbolReplacements(originalValue);

        if (originalValue !== newValue) {
            target.value = newValue;
            
            // Maintain cursor position accurately after replacement
            const diff = newValue.length - originalValue.length;
            target.setSelectionRange(start + diff, end + diff);

            // If it's the main expression input, trigger an input event simulation 
            // so Mantiq's reactive pipeline immediately picks up the new symbol
            if (target.id === 'expression-input') {
                target.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }
}, true);

function handleViewChange(viewMode) {
    if (typeof window._closeTruthTableAndWaveFullscreen === 'function') {
        window._closeTruthTableAndWaveFullscreen();
    }

    const views = {
        tt: document.getElementById('truthtable-container'),
        verilog: document.getElementById('verilog-container'),
        svg: document.getElementById('svg-circuit-container'),
        sim: document.getElementById('simulation-container'),
        kmap: document.getElementById('kmap-container'),
        solution: document.getElementById('solution-container'),
        canvas: document.getElementById('canvas')
    };

    // Hide every view; CSS (not JS) owns each container's actual display
    // type (grid/flex/block), so we only ever toggle a class here.
    Object.values(views).forEach(el => el && el.classList.add('view-hidden'));

    // While the app is showing the landing screen (no expression loaded
    // yet), never reveal a view container. Without this, the unconditional
    // mantiq_setView(0) call at startup (and the view-mode cache firing
    // through syncLoop) un-hides the simulation panels before an
    // expression exists, and they render behind the centered hero/search
    // bar. Same risk applies when the input is cleared back to landing.
    const appRootEl = document.getElementById('app-root');
    if (appRootEl && appRootEl.classList.contains('landing')) {
        return;
    }

    const show = (key) => { if (views[key]) views[key].classList.remove('view-hidden'); };

    const renderActiveView = () => {
        if (viewMode === 3) {
            show('tt');
            if (typeof renderTruthTableAndWaveform === 'function') renderTruthTableAndWaveform();
        } else if (viewMode === 4) {
            show('verilog');
            if (typeof renderVerilogHTML === 'function') renderVerilogHTML();
        } else if (viewMode === 1) {
            show('svg');
            if (typeof renderHTMLCircuit === 'function') renderHTMLCircuit();
        } else if (viewMode === 0) {
            show('sim');
            if (typeof renderHTMLSimulation === 'function') renderHTMLSimulation();
        } else if (viewMode === 2) {
            show('kmap');
            if (typeof renderHTMLKMap === 'function') renderHTMLKMap();
        } else if (viewMode === 5) {
            show('solution');
            if (typeof renderSolutionView === 'function') renderSolutionView();
        } else {
            show('canvas');
        }
    };

    // 1. Immediate synchronous render to fetch & display cached state
    renderActiveView();

    // 2. Schedule a post-unhide frame pass so layout metrics and SVG/Canvas
    // fitting recalculate once the DOM un-hides
    requestAnimationFrame(() => {
        renderActiveView();
        window.dispatchEvent(new Event('resize'));
    });

    if (typeof maybeShowViewTip === 'function') {
        maybeShowViewTip(viewMode);
    }
}
