/**
 * Mantiq HTML5 Bridge Controller & UI Synchronizer
 *
 * Architecture (non-blocking backend):
 *   The WASM engine runs entirely inside a Web Worker (wasm/mantiq-worker.js).
 *   Heavy computation (ASTProver, Quine-McCluskey) never touches the main thread.
 *
 *   Latest-wins protocol: every write (setExpression, setSOP, etc.) gets a
 *   monotonically-increasing sequence number (_latestSeq). The worker includes
 *   that number in its snapshot reply. The main thread only applies a snapshot
 *   when its seq === _latestSeq — all older, stale snapshots are silently dropped.
 *
 *   Computed fields (kmap, truth table, circuit, verilog) are cleared immediately
 *   when a new expression is sent so no stale data is ever shown while the worker
 *   is still computing.
 */

// ── Web Worker bridge ─────────────────────────────────────────────────────────

/** Cached state — populated by the worker after every computation. */
const _state = {
    hasResult:        false,
    isAlwaysTrue:     false,
    isAlwaysFalse:    false,
    expression:       '',
    simplifiedExpr:   '',
    allSolutions:     '[]',
    qmSteps:          '',
    variables:        '[]',
    variableStates:   '{}',
    truthTableJSON:   '',
    kMapJSON:         '',
    circuitJSON:      '',
    verilogGate:          '',
    verilogDataflow:      '',
    addTestbenchGate:     true,
    addTestbenchDataflow: true,
    currentView:          0,
    // Which expression the CACHED computed fields (kMapJSON/truthTableJSON/...)
    // actually correspond to. Unlike _state.expression (which is updated the
    // instant setExpression is called, before the worker has done anything),
    // this only ever advances when a real snapshot comes back from the worker.
    // Views must check this before trusting the cache, or they'll render
    // stale data from a still-in-flight request.
    computedForExpr:      ''
};

/** Monotonically-increasing sequence counter for latest-wins. */
let _latestSeq = 0;

/** Pending promise map for request-response calls. */
const _pending = new Map();
let   _nextId  = 1;
let   _proofTimeout = null;

/**
 * Mirrors ExpressionProcessor::tryParseShorthand()'s regexes (kmapPattern,
 * shortPattern, shortPatternOnlyDC in ExpressionProcessor.cpp). Shorthand
 * input (m(...)/M(...)/KMAP(...)) is resolved entirely inside that function
 * and never reaches the ASTProver branch, so there is no algebraic-proof
 * narrative to produce for it — scheduling _runProofAndSnapshot for shorthand
 * would just recompute an identical snapshot.
 */
const _KMAP_CMD_RE          = /^\s*KMAP\s*\(([^)]+)\)\s*$/i;
const _SHORTHAND_RE         = /^\s*(?:[a-zA-Z0-9_,'\s]+:)?\s*[mM]\s*\([\d,\s]*\)(?:\s*[dD]\s*\([\d,\s]*\))?\s*$/;
const _SHORTHAND_DC_ONLY_RE = /^\s*(?:[a-zA-Z0-9_,'\s]+:)?\s*[dD]\s*\([\d,\s]*\)\s*$/;

function _isShorthandInput(expr) {
    return _KMAP_CMD_RE.test(expr) || _SHORTHAND_RE.test(expr) || _SHORTHAND_DC_ONLY_RE.test(expr);
}

/**
 * Mirrors the worker's VIEW_FIELDS map (mantiq-worker.js). Used to decide,
 * on a view switch, whether the field(s) that view needs were actually
 * included in the last snapshot — buildSnapshot() now only computes the
 * heavy fields for whichever view was active at the time of the write.
 */
const VIEW_FIELDS_JS = {
    0: ['circuitJSON'],                     // SIMULATION
    1: ['circuitJSON'],                     // CIRCUIT
    2: ['kMapJSON'],                        // KMAP
    3: ['truthTableJSON'],                  // TRUTHTABLE
    4: ['verilogGate', 'verilogDataflow'],  // VERILOG
    5: []                                   // SOLUTION
};

/** Heavy fields known-fresh for the current expression/result. Reset on every content-changing snapshot. */
const _freshFields = new Set();

/** Spawn the worker that hosts the WASM engine. */
const _worker = new Worker('wasm/mantiq-worker.js?v=1.4.0');

_worker.onmessage = function (event) {
    const msg = event.data;

    // WASM initialised
    if (msg.type === 'ready') {
        wasmReady = true;
        if (window.onMantiqInit) window.onMantiqInit();
        return;
    }

    // State snapshot — only apply if this is from the LATEST request.
    // Stale snapshots (from superseded requests) are discarded entirely.
    if (msg.type === 'state-snapshot') {
        if (msg.seq === _latestSeq) {
            _applySnapshot(msg.snapshot);
            if (window.requestAnimationFrame) {
                requestAnimationFrame(() => updateFrontend());
            } else {
                updateFrontend();
            }
        }
        return;
    }

    // Regular request-response
    if (msg.id !== undefined) {
        const { resolve, reject } = _pending.get(msg.id) || {};
        _pending.delete(msg.id);
        if (msg.error) {
            console.error('[Mantiq Worker Error]:', msg.error);
            if (reject) reject(new Error(msg.error));
        } else {
            if (resolve) resolve(msg.result);
        }
    }
};

_worker.onerror = function (e) {
    console.error('[Mantiq] Worker system error:', e);
};

let _textDecoder = null;

/** Apply a state snapshot from the worker to the local cache. */
function _applySnapshot(snap) {
    if (!snap) return;
    
    if (!_textDecoder) _textDecoder = new TextDecoder('utf-8');
    
    // Decode transferables back to JS strings (zero-copy from WASM to worker bridge!)
    const heavyFields = ['truthTableJSON', 'kMapJSON', 'circuitJSON', 'verilogGate', 'verilogDataflow'];
    heavyFields.forEach(f => {
        if (snap[f] instanceof ArrayBuffer) {
            snap[f] = _textDecoder.decode(snap[f]);
        }
    });
    
    Object.assign(_state, snap);
    if (snap.expression !== undefined) _state.computedForExpr = snap.expression;
    // computedFields lists which heavy fields (truthTableJSON/kMapJSON/circuitJSON/
    // verilogGate/verilogDataflow) this snapshot actually refreshed. A field left out
    // of the snapshot keeps whatever was cached before — it belongs to a different
    // view and wasn't recomputed. resetFreshness distinguishes two cases: a real
    // content change (setExpression/setSOP/setSelectedSolution/runProof) means every
    // previously-cached heavy field is now suspect except the one(s) just rebuilt, so
    // the freshness set is dropped and replaced. A non-content-changing snapshot
    // (toggleVariable, or backfilling a view's field on switch) can't have made any
    // other view's cached field stale, so it only ADDS to what's already fresh.
    if (Array.isArray(snap.computedFields)) {
        if (snap.resetFreshness !== false) {
            _freshFields.clear();
        }
        snap.computedFields.forEach(f => _freshFields.add(f));
    }
    if (snap.variableStates) {
        try { simInputStates = JSON.parse(snap.variableStates); } catch (_) {}
    }
}

/**
 * Clear all computed/derived fields immediately so stale values from the
 * previous expression are never shown while the worker is computing.
 */
function _clearComputedState() {
    _state.hasResult       = false;
    _state.isAlwaysTrue    = false;
    _state.isAlwaysFalse   = false;
    _state.simplifiedExpr  = '';
    _state.allSolutions    = '[]';
    _state.qmSteps         = '';
    _state.variables       = '[]';
    _state.variableStates  = '{}';
    _state.truthTableJSON  = '';
    _state.kMapJSON        = '';
    _state.circuitJSON     = '';
    _state.verilogGate     = '';
    _state.verilogDataflow = '';
}

/**
 * Fire an aggregate call to the worker.
 * Increments _latestSeq so any in-flight older computation is ignored when it
 * eventually replies. The seq is passed to the worker so it can also skip
 * building the snapshot if a newer request already arrived.
 */
function _workerWriteCall(fn, args, view) {
    const seq = ++_latestSeq;
    const id  = _nextId++;
    _pending.set(id, { resolve: () => {}, reject: () => {} });
    // buildSnapshot() in the worker only marshals the heavy field(s) that `view`
    // needs (defaults to whatever view is currently on screen) — no point paying
    // for KMap/TruthTable/Circuit/Verilog JSON on every keystroke if none of
    // those views are visible.
    _worker.postMessage({ id, fn, args: args || [], seq, view: view !== undefined ? view : _state.currentView, addTestbenchGate: _state.addTestbenchGate, addTestbenchDataflow: _state.addTestbenchDataflow });
}

/** Fire a regular (non-snapshot) call to the worker. */
function _workerCall(fn, args) {
    return new Promise((resolve, reject) => {
        const id = _nextId++;
        _pending.set(id, { resolve, reject });
        _worker.postMessage({ id, fn, args: args || [] });
    });
}

/**
 * Drop-in replacement for Module.ccall() — reads synchronously from cache.
 * Write operations are forwarded to the worker asynchronously (latest-wins).
 */
const Module = {
    ccall(fn, returnType, argTypes, args) {
        switch (fn) {
            // ── Reads (instant from cache) ──────────────────────────────────
            case 'mantiq_hasResult':     return _state.hasResult     ? 1 : 0;
            case 'mantiq_isAlwaysTrue':  return _state.isAlwaysTrue  ? 1 : 0;
            case 'mantiq_isAlwaysFalse': return _state.isAlwaysFalse ? 1 : 0;
            case 'mantiq_getView':       return _state.currentView;
            case 'mantiq_isSyntaxValid': return 1;

            case 'mantiq_getExpression':     return _state.expression     || 0;
            case 'mantiq_getSimplifiedExpr': return _state.simplifiedExpr || 0;
            case 'mantiq_getAllSolutions':    return _state.allSolutions   || 0;
            case 'mantiq_getQMSteps':        return _state.qmSteps        || 0;
            case 'mantiq_getVariables':      return _state.variables       || 0;
            case 'mantiq_getVariableStates': return _state.variableStates  || 0;
            case 'mantiq_getTruthTableJSON': return _state.truthTableJSON  || 0;
            case 'mantiq_getKMapJSON':       return _state.kMapJSON        || 0;
            case 'mantiq_getCircuitJSON':    return _state.circuitJSON     || 0;
            case 'mantiq_getVerilogCode':    return (args && args[0]) ? _state.verilogGate : _state.verilogDataflow;

            // ── Writes (async, latest-wins) ─────────────────────────────────
            case 'mantiq_setExpression': {
                const expr = (args && args[0]) || '';
                const exprChanged = _state.expression !== expr;
                _state.expression = expr;
                if (expr.trim() === '') {
                    _clearComputedState();
                } else if (exprChanged) {
                    // if expression changes: keep cache of only the current section selected, and delete for others
                    const keepFields = VIEW_FIELDS_JS[_state.currentView] || [];
                    const allFields = ['truthTableJSON', 'kMapJSON', 'circuitJSON', 'verilogGate', 'verilogDataflow'];
                    allFields.forEach(f => {
                        if (!keepFields.includes(f)) {
                            _state[f] = '';
                            _freshFields.delete(f);
                        }
                    });
                }
                if (typeof _exprDebounceTimeout !== 'undefined' && _exprDebounceTimeout) clearTimeout(_exprDebounceTimeout);
                _exprDebounceTimeout = setTimeout(() => {
                    _workerWriteCall('_setExpressionAndSnapshot', [expr]);
                    if (_proofTimeout) clearTimeout(_proofTimeout);
                    if (expr.trim() !== '' && !_isShorthandInput(expr)) {
                        window._proofStartTime = Date.now();
                        _proofTimeout = setTimeout(() => {
                            _workerWriteCall('_runProofAndSnapshot', []);
                        }, 300);
                    }
                }, 60);
                return undefined;
            }

            case 'mantiq_setSOP': {
                const sop = (args && args[0]) ? 1 : 0;
                _workerWriteCall('_setSopAndSnapshot', [sop]);
                if (_proofTimeout) clearTimeout(_proofTimeout);
                if (_state.expression.trim() !== '' && !_isShorthandInput(_state.expression)) {
                    window._proofStartTime = Date.now();
                    _proofTimeout = setTimeout(() => {
                        _workerWriteCall('_runProofAndSnapshot', []);
                    }, 400);
                }
                return undefined;
            }

            case 'mantiq_setView': {
                const view = (args && args[0]) || 0;
                _state.currentView = view;
                _workerCall(fn, args);
                // The last snapshot only computed heavy fields for whichever view was
                // active at the time. If we're switching to a view whose field(s)
                // weren't included, backfill with a cheap single-purpose fetch — this
                // just re-serializes the already-processed result, no QM recompute.
                const needed = VIEW_FIELDS_JS[view] || [];
                if (_state.hasResult && needed.some(f => !_freshFields.has(f))) {
                    _workerWriteCall('_refreshViewFields', [], view);
                }
                return undefined;
            }

            case 'mantiq_setSelectedSolution': {
                const idx = (args && args[0]) || 0;
                _workerWriteCall('_setSelectedSolutionAndSnapshot', [idx]);
                if (_proofTimeout) clearTimeout(_proofTimeout);
                if (_state.expression.trim() !== '' && !_isShorthandInput(_state.expression)) {
                    window._proofStartTime = Date.now();
                    _proofTimeout = setTimeout(() => {
                        _workerWriteCall('_runProofAndSnapshot', []);
                    }, 400);
                }
                return undefined;
            }

            case 'mantiq_freeStr':
                return undefined; // No-op — strings come from JS cache

            default:
                _workerCall(fn, args);
                return undefined;
        }
    },
    UTF8ToString(val) {
        return (typeof val === 'string') ? val : '';
    }
};


// ── Global state ─────────────────────────────────────────────────────────────
let wasmReady = false;
let lastSimplifiedExpr = '';
let lastActiveView = -1;
let kmapViewMode = 'normal';
let simInputStates = {};
let panelsState = {
    orig: { x: 0, y: 0, scale: 1.0, fitScale: 1.0 },
    simp: { x: 0, y: 0, scale: 1.0, fitScale: 1.0 },
    simOrig: { x: 0, y: 0, scale: 1.0, fitScale: 1.0 },
    simSimp: { x: 0, y: 0, scale: 1.0, fitScale: 1.0 }
};
