// Global Cached Data Snapshots
var lastKMapData = null;
var lastTruthTableData = null;

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
            if (vMode !== '2') {
                b.classList.add('disabled');
                b.title = 'Navigation locked to K-Map view for KMAP input';
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
        const stripped = expr.replace(/XOR|KMAP|TRUE|FALSE/gi, '');
        uniqueVars = new Set(stripped.match(/[a-zA-Z]/g) || []);
    }
    if (uniqueVars.size > 6) return "Maximum 6 variables supported.";

    // 4. Operator Syntax Checks
    if (/[+\-*>^|&]\s*$/.test(expr)) return "Expression ends with an operator.";
    if (/^\s*[+\-*>^|&]/.test(expr)) return "Expression starts with an operator.";
    if (/[+\-*>^|&]\s*[+\-*>^|&]/.test(expr)) return "Consecutive operators detected.";

    return ""; // Return empty string if no explicit error found
}

// Sync WASM State with DOM Layout
function updateFrontend() {
    if (!wasmReady) return;

    const expr = elements.input.value.trim();
    
    elements.syntaxErrorLine.style.display = 'none';
    elements.errorFeedback.style.display = 'none';

    // Check if input is a KMAP command — force shift to K-Map section and lock navigation
    const isKmapInput = expr.toUpperCase().includes('KMAP');
    if (isKmapInput) {
        setAlgProofAvailability(false);
        if (_state.currentView !== 2) {
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
        
function parseTermLitsJS(term) {
    const lits = [];
    const clean = term.replace(/[()]/g, '');
    const re = /([a-zA-Z0-9_]+)(['!]?)/g;
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
            return litsA[i].var.localeCompare(litsB[i].var);
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
        if (a.var !== b.var) return a.var.localeCompare(b.var);
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
                    const varA = a.replace(/['!]/g, '');
                    const varB = b.replace(/['!]/g, '');
                    if (varA !== varB) return varA.localeCompare(varB);
                    const compA = a.includes("'") || a.includes("!");
                    const compB = b.includes("'") || b.includes("!");
                    return compA === compB ? 0 : (compA ? 1 : -1);
                });
                clauses.push('(' + lits.join('+') + ')');
                i = end + 1;
            } else if (/[a-zA-Z0-9_]/.test(expr[i])) {
                let start = i;
                while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) i++;
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
        
        // Render into Carousel
        elements.solutionsCarousel.innerHTML = '';
        
        const currentActiveIdx = (typeof selectedSolutionIndex !== 'undefined') ? selectedSolutionIndex : 0;

        solutions.forEach((sol, index) => {
            const isSelected = (index === currentActiveIdx);
            const card = document.createElement('div');
            card.className = 'solution-card' + (isSelected ? ' selected-solution' : '');
            
            const textSpan = document.createElement('span');
            textSpan.className = 'expr-text';
            textSpan.style.color = isSelected ? 'var(--success)' : 'var(--text-primary)';
            textSpan.textContent = sol.expr;

            if (solutions.length > 1) {
                textSpan.style.cursor = 'pointer';
                textSpan.title = 'Click to select this solution for Circuit/Verilog/Simulation';
                textSpan.addEventListener('click', () => {
                    document.querySelectorAll('.solution-card').forEach(c => {
                        c.classList.remove('selected-solution');
                        const txt = c.querySelector('.expr-text');
                        if (txt) txt.style.color = 'var(--text-primary)';
                    });
                    card.classList.add('selected-solution');
                    textSpan.style.color = 'var(--success)';
                    
                    if (typeof Module !== 'undefined' && Module.ccall) {
                        Module.ccall('mantiq_setSelectedSolution', null, ['number'], [index]);
                        
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
                });
            }
            
            const copyBtn = document.createElement('button');
            copyBtn.className = 'action-icon-btn copy-sol-btn';
            copyBtn.title = 'Copy expression';
            copyBtn.innerHTML = Icons.copy(18);
            
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(sol.expr).then(() => {
                    showToast('Expression copied!', 'success');
                }).catch(() => {
                    showToast('Failed to copy', 'error');
                });
            });
            
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'solution-card-actions';
            actionsDiv.appendChild(copyBtn);
            
            card.appendChild(textSpan);
            card.appendChild(actionsDiv);
            elements.solutionsCarousel.appendChild(card);
        });
        
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
    if (hasResult && _state.computedForExpr === expr) {
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
