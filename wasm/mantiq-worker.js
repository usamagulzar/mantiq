/**
 * mantiq-worker.js
 *
 * Runs the lean Mantiq WASM engine inside a Web Worker so the main
 * thread (GUI) is NEVER blocked, even during heavy computations like
 * ASTProver or Quine-McCluskey on large expressions.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Message Protocol  (postMessage in both directions):
 *
 *   Main → Worker:
 *     { id, fn, args, seq, view }
 *       id   — unique request id (echoed back in response)
 *       fn   — mantiq_* WASM function name  OR  one of the special
 *              aggregate helpers prefixed with '_':
 *                _setExpressionAndSnapshot(expr)
 *                _setSopAndSnapshot(sopInt)
 *                _setSelectedSolutionAndSnapshot(index)
 *                _toggleVariableAndSnapshot(varName)
 *                _refreshViewFields()   — no mutation, just re-serializes the
 *                                          already-processed result for `view`
 *       args — JS argument array (strings / numbers)
 *       view — ViewMode int the main thread currently has on screen.
 *              buildSnapshot() only marshals the heavy field(s) that view
 *              needs (see VIEW_FIELDS below) instead of all five every time.
 *
 *   Worker → Main:
 *     { id, result }            normal return value
 *     { id, error }             exception string
 *     { type: 'ready' }         WASM fully initialised
 *     { type: 'state-snapshot', snapshot: {...} }
 *                               computed state pushed after any write
 *                               operation so the main thread can update its
 *                               cache and refresh the UI. snapshot.computedFields
 *                               lists which heavy fields (truthTableJSON/
 *                               kMapJSON/circuitJSON/verilogGate/verilogDataflow)
 *                               this snapshot actually refreshed.
 *                               snapshot.resetFreshness (true unless the write
 *                               couldn't have changed the underlying result —
 *                               toggleVariable, refreshViewFields) tells the
 *                               main thread whether to drop everything it
 *                               previously considered fresh, or just add to it.
 * ─────────────────────────────────────────────────────────────────────
 */

'use strict';

// ── WASM Module bootstrap ────────────────────────────────────────────────────

var Module = {
    noInitialRun: false,

    onRuntimeInitialized: function () {
        // Signal the main thread that the engine is ready
        postMessage({ type: 'ready' });
    },

    print:    function (text) { /* silence stdout in worker */ },
    printErr: function (text) { console.error('[mantiq-wasm]', text); },

    // No canvas / GL in a worker
    canvas: null,

    // Suppress "no canvas" and FS warnings
    setStatus: function () {},
    totalDependencies: 0,
    monitorRunDependencies: function () {},

    locateFile: function (path) {
        if (path.endsWith('.wasm')) {
            return path + '?v=1.3.0';
        }
        return path;
    }
};

// Load the Emscripten-generated glue.
// Path is relative to the worker location (mantiq-main/wasm/).
importScripts('./index.js?v=1.3.0');

let g_addTestbenchGate = true;
let g_addTestbenchDataflow = true;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Call a WASM string-returning function, read the UTF-8 result, free the
 * C buffer, and return a plain JS string (or null).
 */
function wasmStr(fn, argTypes, args) {
    const ptr = Module.ccall(fn, 'number', argTypes || [], args || []);
    if (!ptr) return null;
    const str = Module.UTF8ToString(ptr);
    Module.ccall('mantiq_freeStr', null, ['number'], [ptr]);
    return str;
}

/**
 * Which of the 5 heavy fields each ViewMode (see app/ViewMode.h) actually
 * needs on screen. mantiq_get*JSON()/mantiq_getVerilogCode() don't re-run
 * QM minimization — they just serialize the already-processed
 * AppState::processResult — but each one is still its own
 * allocate → UTF8 decode → free round trip, so skipping the ones nobody's
 * looking at is a real, cheap win on every keystroke.
 */
const VIEW_FIELDS = {
    0: ['circuitJSON'],                     // SIMULATION
    1: ['circuitJSON'],                     // CIRCUIT
    2: ['kMapJSON'],                        // KMAP
    3: ['truthTableJSON'],                  // TRUTHTABLE
    4: ['verilogGate', 'verilogDataflow'],  // VERILOG
    5: []                                   // SOLUTION — no heavy field needed
};

/**
 * The cheap fields every snapshot carries regardless of view — none of these
 * cost more than a single small-string marshal, so there's no reason to ever
 * skip them.
 */
function buildLightFields() {
    return {
        hasResult:       Module.ccall('mantiq_hasResult',    'number', [], []) !== 0,
        isAlwaysTrue:    Module.ccall('mantiq_isAlwaysTrue', 'number', [], []) !== 0,
        isAlwaysFalse:   Module.ccall('mantiq_isAlwaysFalse','number', [], []) !== 0,
        expression:      wasmStr('mantiq_getExpression')      || '',
        simplifiedExpr:  wasmStr('mantiq_getSimplifiedExpr')  || '',
        allSolutions:    wasmStr('mantiq_getAllSolutions')     || '[]',
        qmSteps:         wasmStr('mantiq_getQMSteps')         || '',
        variables:       wasmStr('mantiq_getVariables')       || '[]',
        variableStates:  wasmStr('mantiq_getVariableStates')  || '{}',
        currentView:     Module.ccall('mantiq_getView', 'number', [], [])
    };
}

/**
 * Build a state snapshot by querying the WASM getters. Called after any
 * write operation so the main thread's cache stays consistent. Only the
 * heavy field(s) relevant to `view` are marshaled — fields left out of the
 * returned snapshot are simply absent as keys, so Object.assign() on the
 * main thread leaves whatever was cached there before untouched (that
 * cache is tracked via `computedFields` so the main thread knows what's
 * actually fresh). All calls are synchronous inside the worker — that is
 * fine, the worker has its own OS thread.
 */
function buildSnapshot(view) {
    const snapshot = buildLightFields();
    snapshot.resetFreshness = true; // this snapshot reflects a real content change — old heavy-field cache is suspect
    snapshot.computedFields = [];

    if (!snapshot.hasResult) {
        // Cheap regardless — no result means all five are just ''.
        snapshot.truthTableJSON  = '';
        snapshot.kMapJSON        = '';
        snapshot.circuitJSON     = '';
        snapshot.verilogGate     = '';
        snapshot.verilogDataflow = '';
        snapshot.computedFields  = ['truthTableJSON', 'kMapJSON', 'circuitJSON', 'verilogGate', 'verilogDataflow'];
        return snapshot;
    }

    const needed = (view === -1 || view === 'all')
        ? new Set(['truthTableJSON', 'kMapJSON', 'circuitJSON', 'verilogGate', 'verilogDataflow'])
        : new Set(VIEW_FIELDS[view] || []);
    if (needed.has('truthTableJSON'))  snapshot.truthTableJSON  = wasmStr('mantiq_getTruthTableJSON') || '';
    if (needed.has('kMapJSON'))        snapshot.kMapJSON        = wasmStr('mantiq_getKMapJSON')       || '';
    if (needed.has('circuitJSON'))     snapshot.circuitJSON     = wasmStr('mantiq_getCircuitJSON')    || '';
    if (needed.has('verilogGate'))     snapshot.verilogGate     = wasmStr('mantiq_getVerilogCode', ['number', 'number'], [1, g_addTestbenchGate ? 1 : 0]) || '';
    if (needed.has('verilogDataflow')) snapshot.verilogDataflow = wasmStr('mantiq_getVerilogCode', ['number', 'number'], [0, g_addTestbenchDataflow ? 1 : 0]) || '';
    snapshot.computedFields = Array.from(needed);

    return snapshot;
}

// ── Regular dispatcher ───────────────────────────────────────────────────────

/** Dispatch a single mantiq_* WASM function call and return the result. */
function dispatchRaw(fn, args) {
    const STRING_RETURNS = new Set([
        'mantiq_getExpression', 'mantiq_getSimplifiedExpr',
        'mantiq_getAllSolutions', 'mantiq_getQMSteps',
        'mantiq_getVariables', 'mantiq_getVariableStates',
        'mantiq_getTruthTableJSON', 'mantiq_getKMapJSON',
        'mantiq_getCircuitJSON', 'mantiq_getVerilogCode'
    ]);

    const argTypes = (args || []).map(a => typeof a === 'string' ? 'string' : 'number');

    if (STRING_RETURNS.has(fn)) {
        return wasmStr(fn, argTypes, args);
    } else {
        return Module.ccall(fn, 'number', argTypes, args || []);
    }
}

// ── Aggregate (snapshot) handlers ───────────────────────────────────────────

/**
 * Handle the special aggregate helpers sent by the main thread.
 * These mutate WASM state, then push a full snapshot back.
 * Returns { snapshot } on success, throws on failure.
 */
function handleAggregate(fn, args, view) {
    switch (fn) {
        case '_setExpressionAndSnapshot': {
            const expr = (args && args[0]) || '';
            Module.ccall('mantiq_setExpression', null, ['string'], [expr]);
            return buildSnapshot(view);
        }
        case '_setSopAndSnapshot': {
            // ExpressionProcessor::process() computes BOTH simplifiedTerms (SOP) and
            // simplifiedTermsPOS (POS) unconditionally in a single pass (see
            // ExpressionProcessor.cpp) — isSopMode only decides which of the two
            // already-computed result sets getSimplifiedExpression()/getAllSolutions()
            // read from. mantiq_setSOP() just flips that flag and marks the circuit
            // dirty for rebuild; it does NOT require re-tokenizing, re-evaluating the
            // truth table, or re-running Quine-McCluskey. The re-call to
            // mantiq_setExpression() that used to sit here reran all of that for
            // nothing on every SOP/POS toggle.
            const sop = (args && args[0]) ? 1 : 0;
            Module.ccall('mantiq_setSOP', null, ['number'], [sop]);
            return buildSnapshot(view);
        }
        case '_setSelectedSolutionAndSnapshot': {
            const idx = (args && args[0]) || 0;
            Module.ccall('mantiq_setSelectedSolution', null, ['number'], [idx]);
            return buildSnapshot(view);
        }
        case '_toggleVariableAndSnapshot': {
            // toggleVariable only flips a bool on a CircuitNode leaf. nodeToJSON()
            // (WebBridge_web.cpp) never serializes that bool — it only outputs
            // isGate/type/value/children — so circuitJSON (and every other heavy
            // field) is structurally identical before and after a toggle. The only
            // thing that actually changes is variableStates, which is already a
            // "light" field. Skip the 5 heavy fields entirely instead of
            // re-marshaling circuitJSON on every switch flip in the simulator.
            const name = (args && args[0]) || '';
            Module.ccall('mantiq_toggleVariable', null, ['string'], [name]);
            const snapshot = buildLightFields();
            snapshot.resetFreshness = false; // nothing about the underlying result changed
            snapshot.computedFields = [];
            return snapshot;
        }
        case '_runProofAndSnapshot': {
            Module.ccall('mantiq_runAlgebraicProof', null, [], []);
            return buildSnapshot(view);
        }
        case '_refreshViewFields': {
            // No WASM state mutation — the main thread switched to a view whose
            // heavy field(s) weren't in the last snapshot. Just re-serialize the
            // already-processed result for the new view. Cheap: no QM recompute.
            // This ADDS to what's fresh rather than resetting it — the fields
            // already cached for other views are still valid, nothing changed.
            const snapshot = buildSnapshot(view);
            snapshot.resetFreshness = false;
            return snapshot;
        }
        default:
            return null;
    }
}

// ── Message handler ──────────────────────────────────────────────────────────

self.onmessage = function (event) {
    const { id, fn, args, seq, view, addTestbenchGate, addTestbenchDataflow } = event.data;
    if (addTestbenchGate !== undefined) {
        g_addTestbenchGate = addTestbenchGate;
    }
    if (addTestbenchDataflow !== undefined) {
        g_addTestbenchDataflow = addTestbenchDataflow;
    }

    try {
        // Aggregate helpers → mutate + snapshot
        if (fn && fn.startsWith('_')) {
            const snapshot = handleAggregate(fn, args, view);
            // Reply to the originating request (so _pending resolves)
            postMessage({ id, result: null });
            // Also push the state snapshot for the main thread cache
            postMessage({ type: 'state-snapshot', snapshot, seq });
            return;
        }

        // Regular WASM call
        const result = dispatchRaw(fn, args);
        postMessage({ id, result });

    } catch (err) {
        console.error('[Worker Error]:', err);
        postMessage({ id, error: String(err) });
    }
};

