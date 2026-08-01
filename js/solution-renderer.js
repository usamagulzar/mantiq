function setAlgProofAvailability(hasAlgProof) {
    const mobileTabs = document.getElementById('solution-mobile-tabs');
    const splitView = document.getElementById('solution-split-view');
    const pill = document.getElementById('solution-type-pill');
    if (!mobileTabs || !splitView) return;

    const wasUnavailable = splitView.classList.contains('alg-unavailable');
    mobileTabs.classList.toggle('alg-unavailable', !hasAlgProof);
    splitView.classList.toggle('alg-unavailable', !hasAlgProof);

    if (!hasAlgProof) {
        // Only auto-switch to QM if the user is currently viewing the alg
        // panel AND it just became unavailable (not on every render while
        // the user is mid-typing). This avoids stealing focus during input.
        const currentTab = splitView.getAttribute('data-active-tab');
        if (!wasUnavailable && currentTab === 'alg') {
            splitView.setAttribute('data-active-tab', 'qm');
            if (pill) {
                pill.setAttribute('data-state', 'qm');
                pill.querySelectorAll('.pill-option').forEach(opt => {
                    opt.classList.toggle('active', opt.getAttribute('data-val') === 'qm');
                });
            }
        }
    } else if (wasUnavailable) {
        // Alg proof became available again — restore the alg tab so the
        // user sees the proof on the next expression that has one.
        const currentTab = splitView.getAttribute('data-active-tab');
        if (currentTab === 'qm') {
            splitView.setAttribute('data-active-tab', 'alg');
            if (pill) {
                pill.setAttribute('data-state', 'alg');
                pill.querySelectorAll('.pill-option').forEach(opt => {
                    opt.classList.toggle('active', opt.getAttribute('data-val') === 'alg');
                });
            }
        }
    }
}

// QM Steps Parser and Renderer
function renderSolutionView() {
    const algBody = document.getElementById('alg-body');
    const qmBody = document.getElementById('qm-body');
    if (!algBody || !qmBody) return;

    if (Module.ccall('mantiq_isAlwaysTrue', 'number', [], []) !== 0 ||
        Module.ccall('mantiq_isAlwaysFalse', 'number', [], []) !== 0) {
        algBody.innerHTML = '<div class="solution-empty">Constant expression, no proof.</div>';
        qmBody.innerHTML = '<div class="solution-empty">Constant expression, no minimization.</div>';
        setAlgProofAvailability(false);
        return;
    }

    let rawSteps = queryWasmString('mantiq_getQMSteps');
    if (!rawSteps) {
        algBody.innerHTML = algHtml || '<div class="solution-empty">No algebraic proof available for this expression.</div>';
        qmBody.innerHTML = qmHtml || '<div class="solution-empty">No Quine-McCluskey steps available.</div>';

        // Store raw text for copying
        algBody.dataset.rawProof = rawAlgText.trim();
        qmBody.dataset.rawProof = rawQmText.trim();

        setAlgProofAvailability(!!algHtml);
        return;
    }

    const selectedIndex = window.globalSelectedSolutionIndex || 0;
    const pill = document.getElementById('sop-pos-pill');
    const format = pill && pill.getAttribute('data-state') === 'pos' ? 'pos' : 'sop';

    const parts = rawSteps.split('=== POS Minimization ===');
    let sopPart = parts[0];
    let posPart = parts[1] ? '=== POS Minimization ===' + parts[1] : '';

    if (format === 'sop') {
        if (selectedIndex > 0) {
            const solRegex = new RegExp(`Solution\\s+${selectedIndex + 1}:\\s*(\\[.*?\\])`);
            const match = sopPart.match(solRegex);
            if (match) {
                const selectedTerms = match[1];
                sopPart = sopPart.replace(/Minimized Terms:\s*\[.*?\]/, `Minimized Terms: ${selectedTerms}`);
            }
        }
        rawSteps = sopPart;
    } else {
        if (posPart) {
            if (selectedIndex > 0) {
                const solRegex = new RegExp(`Solution\\s+${selectedIndex + 1}:\\s*(\\[.*?\\])`);
                const match = posPart.match(solRegex);
                if (match) {
                    const selectedTerms = match[1];
                    posPart = posPart.replace(/Minimized Terms:\s*\[.*?\]/, `Minimized Terms: ${selectedTerms}`);
                }
            }
            rawSteps = posPart;
        } else {
            rawSteps = sopPart; // Fallback
        }
    }

    const lines = rawSteps.split('\n');
    let qmHtml = '';
    let algHtml = '';
    let rawQmText = '';
    let rawAlgText = '';
    let isAlgebraicSection = false;

    let stepCounter = 0;
    let sectionOpen = false;
    let stepOpen = false;
    let blockOpen = false;
    let formCls = '';
    let pendingAlgebraicReason = null;

    const detectForm = (text) => {
        const lower = text.toLowerCase();
        if (/\bsop\b/.test(lower)) return 'sop';
        if (/\bpos\b/.test(lower)) return 'pos';
        return '';
    };
    let isFinalResultSection = false;
    formCls = format; // seed from the SOP/POS pill; inner section titles (e.g.
                      // "Quine-McCluskey Minimization") carry no sop/pos wording
                      // of their own, so without this the very first real
                      // section would blank the accent color out again.

    // QM's working notation is binary/dash codes (001, 0-10, ...). Readers
    // still have to mentally translate each code into the literal term it
    // represents, so wherever we know a token IS such a code (merge pairs,
    // prime-implicant codes, grouped-minterm listings) we render it as a
    // two-line badge: the code on top, the actual literal term (ABC, A'BC,
    // ...) underneath.
    const proofVariables = () => {
        try {
            const vars = JSON.parse(queryWasmString('mantiq_getVariables') || '[]');
            return Array.isArray(vars) ? vars : [];
        } catch (_) {
            return [];
        }
    };
    const isBinaryToken = (tok) => /^[01\-]+$/.test(tok);
    // One span per bit position, in the same order as the binary code above
    // it, so the literal lines up character-for-character instead of
    // drifting once a dash drops a variable (011 -> "A'BC" reads fine, but
    // -11 -> "BC" no longer sits under the code that produced it). A dash
    // position renders as its own muted "-" placeholder, and negation is a
    // bar over the letter (matching textbook notation) rather than a
    // trailing apostrophe, which was shifting the following characters.
    const literalSpans = (binaryStr, vars, isPOS) => {
        let html = '';
        for (let j = 0; j < Math.min(binaryStr.length, vars.length); j++) {
            const bit = binaryStr[j];
            if (bit === '-') {
                html += `<span class="qm-lit-dash">-</span>`;
            } else {
                const negated = isPOS ? (bit === '1') : (bit === '0');
                html += `<span class="qm-lit-var${negated ? ' neg' : ''}">${escapeHtml(vars[j])}</span>`;
            }
        }
        return html || `<span class="qm-lit-dash">-</span>`;
    };
    const termBadge = (rawTok, badgeCls) => {
        const tok = rawTok.trim();
        const vars = proofVariables();
        if (isBinaryToken(tok) && vars.length > 0 && tok.length === vars.length) {
            const literalHtml = literalSpans(tok, vars, formCls === 'pos');
            return `<span class="qm-term-badge ${badgeCls}"><span class="qm-term-bin">${escapeHtml(tok)}</span><span class="qm-term-lit">${literalHtml}</span></span>`;
        }
        return `<span class="badge ${badgeCls}">${escapeHtml(tok)}</span>`;
    };
    // Plain decimal minterm indices (e.g. from "covers [1, 5]" or
    // "Minterms to cover: [...]") aren't codes to translate - just small
    // muted number chips, kept visually distinct from term badges.
    const bracketTokens = (str) => str.trim()
        .replace(/^\[|\]$/g, '')
        .split(/\s*,\s*/)
        .map(t => t.trim())
        .filter(Boolean);
    const numChip = (tok) => `<span class="qm-num-chip">${escapeHtml(tok)}</span>`;
    // Minterm indices covered by a PI, prefixed "m" so a plain "covers
    // [1, 2, 3]" line reads the same way as the Essential rows below it
    // ("-> 'bin' is essential (only one covering m3)"), which already carry
    // the "m" prefix. Without this, PI rows showed bare "1, 2, 3" right next
    // to Essential rows showing "m3" in the very same table.
    const mCovers = (str) => bracketTokens(str).map(t => /^\d+$/.test(t) ? `m${t}` : t);

    const appendHtml = (str) => {
        if (isAlgebraicSection) algHtml += str;
        else qmHtml += str;
    };

    // Merge and prime-implicant/essential lines used to render as one
    // bulky bordered .qm-row per line - for an expression of any real size
    // that's a wall of near-identical boxes. Consecutive lines of the same
    // kind are buffered here and flushed as a single compact table instead,
    // so a run of 8 merges becomes one 8-row table rather than 8 boxes.
    let pendingGroup = null; // { kind: 'merge' | 'pi', rows: [...] }

    const renderMergeTable = (rows) => `
        <div class="qm-merge-list">
            ${rows.map(r => `
                <div class="qm-merge-row">
                    ${termBadge(r.a, 'term')}
                    <span class="qm-merge-op">+</span>
                    ${termBadge(r.b, 'term')}
                    <span class="qm-merge-op">=</span>
                    ${termBadge(r.result, 'result')}
                </div>
            `).join('')}
        </div>
    `;

    const renderPiTable = (rows) => `
        <div class="qm-pi-list">
            ${rows.map(r => `
                <div class="qm-pi-card">
                    <div class="qm-pi-card-top">
                        <span class="qm-pi-card-label">${r.icon} ${escapeHtml(r.label)}</span>
                        ${termBadge(r.term, 'result')}
                    </div>
                    <div class="qm-pi-card-covers">
                        <span class="qm-pi-covers-op">covers</span>
                        <div class="qm-term-list">${r.covers.map(numChip).join('')}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    const flushGroup = () => {
        if (!pendingGroup) return;
        if (!blockOpen) { appendHtml('<div class="qm-block">'); blockOpen = true; }
        appendHtml(pendingGroup.kind === 'merge' ? renderMergeTable(pendingGroup.rows) : renderPiTable(pendingGroup.rows));
        pendingGroup = null;
    };

    const pushGroupRow = (kind, row) => {
        if (pendingGroup && pendingGroup.kind !== kind) flushGroup();
        if (!pendingGroup) pendingGroup = { kind, rows: [] };
        pendingGroup.rows.push(row);
    };

    const closeBlock = () => { flushGroup(); if (blockOpen) { appendHtml('</div>'); blockOpen = false; } };
    const closeStep = () => { closeBlock(); if (stepOpen) { appendHtml('</div></details>'); stepOpen = false; } };
    const closeSection = () => { closeStep(); if (sectionOpen) { appendHtml('</div>'); sectionOpen = false; } };

    lines.forEach(line => {
        if (isAlgebraicSection) rawAlgText += line + '\n';
        else rawQmText += line + '\n';

        const trimmed = line.trim();
        if (!trimmed) return;

        // --- Section headers: "=== Title ===" -----------------------------
        if (trimmed.startsWith('===')) {
            const cleanTitle = trimmed.replace(/=/g, '').trim();

            // The wasm log itself opens with a bare "=== SOP Minimization ==="
            // marker directly in front of "=== Quine-McCluskey Minimization
            // ===", and the SOP/POS split in the caller re-prepends the same
            // pattern ("=== POS Minimization ===") in front of the second,
            // otherwise-identical run. Neither carries any content of its
            // own - it's just the only sop/pos wording in that half - so
            // both are treated as a silent color-switch marker rather than
            // opening a visible section (which is what produced the
            // duplicate "SOP Minimization" / "Quine-McCluskey Minimization"
            // stacked headers).
            const formMarkerMatch = cleanTitle.match(/^(sop|pos) minimization$/i);
            if (formMarkerMatch) {
                formCls = formMarkerMatch[1].toLowerCase();
                return;
            }

            closeSection();
            isAlgebraicSection = cleanTitle.toLowerCase().includes('algebraic');
            const df = detectForm(cleanTitle);
            if (df) formCls = df; // keep prior color through generic-titled sections
            isFinalResultSection = /final minimization result/i.test(cleanTitle);
            appendHtml(`
                <div class="qm-section">
            `);
            sectionOpen = true;
            stepCounter = 0;
            return;
        }

        // --- Numbered step headers: "1. Initial Setup" ---------------------
        if (/^\d+\./.test(trimmed)) {
            closeStep();
            stepCounter++;
            const stepText = trimmed.replace(/^\d+\.\s*/, '');
            appendHtml(`
                <details class="qm-step">
                    <summary class="qm-step-summary">
                        <span class="qm-step-num">${stepCounter}</span>
                        <span class="qm-step-title">${escapeHtml(stepText)}</span>
                        ${Icons.chevronDown}
                    </summary>
                    <div class="qm-step-body">
            `);
            stepOpen = true;
            return;
        }

        if (!blockOpen) { appendHtml('<div class="qm-block">'); blockOpen = true; }

        // --- Algebraic-proof lines (unrelated logger, kept as-is) ----------
        if (trimmed.startsWith('-- (') && trimmed.endsWith(') -->')) {
            pendingAlgebraicReason = trimmed.substring(4, trimmed.length - 5);
            return;
        }
        if (pendingAlgebraicReason !== null) {
            const isGiven = (pendingAlgebraicReason === 'Given');
            const isSimplified = (pendingAlgebraicReason === 'Already Simplified');
            const noDialog = isGiven || isSimplified;
            let displayExpr = trimmed;
            if (isGiven && typeof applySymbolReplacements === 'function') {
                displayExpr = applySymbolReplacements(displayExpr)
                    .replace(/\bXOR\b/gi, '⊕')
                    .replace(/\bXNOR\b/gi, '⊙')
                    .replace(/\bOR\b/gi, '+')
                    .replace(/\bNOT\b/gi, '!');
            }
            appendHtml(`
                <div class="qm-row algebraic-step${noDialog ? ' no-rule-dialog' : ''}" data-rule="${escapeHtml(pendingAlgebraicReason)}" data-expr="${escapeHtml(displayExpr)}"${noDialog ? '' : ' title="Click to view rule details and examples"'}>
                    <div class="alg-expr">${escapeHtml(displayExpr)}</div>
                    <div class="alg-reason">
                        <span class="alg-by">${isGiven || isSimplified ? '' : 'by'}</span>
                        <span class="alg-rule">${escapeHtml(pendingAlgebraicReason)}</span>
                    </div>
                </div>
            `);
            pendingAlgebraicReason = null;
            return;
        }

        // --- "--- Pass 1 (Grouping size 2) ---" subheaders -----------------
        let m;
        if ((m = trimmed.match(/^-{2,}\s*(.+?)\s*-{2,}$/))) {
            closeBlock();
            appendHtml(`<h4 class="qm-h3"><span class="qm-status-dot"></span>${escapeHtml(m[1])}</h4>`);
            return;
        }

        // --- Bare "Label:" subheaders with no value on the line ------------
        // ("Initial Term Binary Representations:", "Final Valid Prime
        // Implicants:", "Finding Essential Prime Implicants:") - matched
        // generically instead of hardcoding each phrase, and crucially
        // NOT routed through the boxed-answer treatment below.
        if (/:$/.test(trimmed) && trimmed.length < 60) {
            closeBlock();
            appendHtml(`<h4 class="qm-h3"><span class="qm-status-dot"></span>${escapeHtml(trimmed.slice(0, -1))}</h4>`);
            return;
        }

        // --- "m0 = 000" / "m0 = 000 (d)" initial term rows -----------------
        if ((m = trimmed.match(/^(m\d+)\s*=\s*([01\-]+)(\s*\(d\))?$/))) {
            appendHtml(`
                <div class="qm-row">
                    <span class="qm-row-label">${escapeHtml(m[1])}</span>
                    <span class="qm-row-op">=</span>
                    ${termBadge(m[2], 'term')}
                    ${m[3] ? '<span class="badge dc">don\'t care</span>' : ''}
                </div>
            `);
            return;
        }

        // --- "Merged: A + B -> C" -- buffered into a compact merge table --
        if (trimmed.startsWith('Merged:')) {
            const rest = trimmed.substring(7).trim();
            const parts = rest.split(/\s*->\s*|\s*\+\s*/);
            if (parts.length >= 3) {
                pushGroupRow('merge', { a: parts[0], b: parts[1], result: parts[2] });
            } else {
                flushGroup();
                appendHtml(`<div class="qm-row">${escapeHtml(trimmed)}</div>`);
            }
            return;
        }

        // --- "* PI: bin covers [minterms]" (newly-found prime implicant) --
        // buffered into a compact PI table alongside the other PI-family
        // rows below (final-list PIs, essentials).
        if (trimmed.startsWith('* PI:')) {
            const rest = trimmed.substring(5).trim();
            const covMatch = rest.match(/^(\S+)\s+covers\s+(\[.*\])$/);
            if (covMatch) {
                pushGroupRow('pi', { icon: '&#9733;', label: 'Prime Implicant', term: covMatch[1], covers: mCovers(covMatch[2]) });
            } else {
                pushGroupRow('pi', { icon: '&#9733;', label: 'PI', term: rest, covers: [] });
            }
            return;
        }

        // --- "bin covers [minterms]" (Final Valid Prime Implicants list) --
        if ((m = trimmed.match(/^([01\-]+)\s+covers\s+(\[.*\])$/))) {
            pushGroupRow('pi', { icon: '&#10003;', label: 'Prime Implicant', term: m[1], covers: mCovers(m[2]) });
            return;
        }

        // --- "-> 'bin' is essential (only one covering m3)" ----------------
        if ((m = trimmed.match(/^->\s*'([^']+)'\s+is essential\s*\(only one covering m(\d+)\)$/))) {
            pushGroupRow('pi', { icon: '&#9733;', label: 'Essential', term: m[1], covers: ['m' + m[2]] });
            return;
        }

        // Every other line type below is unrelated to the merge/PI tables -
        // flush whatever's buffered before rendering it.
        flushGroup();

        // --- "-> bin1 is dominated by bin2 (Discarded)" --------------------
        if ((m = trimmed.match(/^->\s*(\S+)\s+is dominated by\s+(\S+)\s*\(Discarded\)$/))) {
            appendHtml(`
                <div class="qm-row qm-row-discarded">
                    ${termBadge(m[1], 'term discarded')}
                    <span class="qm-row-op">dominated by</span>
                    ${termBadge(m[2], 'term')}
                    <span class="badge discarded">discarded</span>
                </div>
            `);
            return;
        }

        // --- "No more merges possible." / "No essential PIs found." -------
        if (/^No (more merges possible|essential prime implicants found)\.$/.test(trimmed)) {
            appendHtml(`<div class="qm-row qm-row-note">${escapeHtml(trimmed)}</div>`);
            return;
        }

        // --- "Solution 2: [1-0, 0-1]" ---------------------------------------
        if ((m = trimmed.match(/^(Solution\s+\d+):\s*(\[.*\])$/))) {
            appendHtml(`
                <div class="qm-row qm-term-list-row">
                    <span class="qm-row-label">${escapeHtml(m[1])}</span>
                    <div class="qm-term-list">${bracketTokens(m[2]).map(t => termBadge(t, 'term')).join('')}</div>
                </div>
            `);
            return;
        }

        // --- "Minimized Terms: [...]" - the actual final boxed answer -----
        if ((m = trimmed.match(/^Minimized Terms:\s*(\[.*\])$/))) {
            closeBlock();
            const terms = bracketTokens(m[1]);
            // SOP terms are summed ("+"); POS terms are a product of sums,
            // so joining them with "+" is wrong - use a middle-dot instead.
            const joinerHtml = formCls === 'pos'
                ? '<span class="qm-final-plus qm-final-dot">&middot;</span>'
                : '<span class="qm-final-plus">+</span>';
            appendHtml(`
                <div class="qm-final">
                    <span class="qm-final-label">Minimized Result</span>
                    <div class="qm-final-terms">${terms.map(t => termBadge(t, 'result')).join(joinerHtml)}</div>
                </div>
            `);
            return;
        }

        // --- Generic "Label: value" lines (Variables, Minterms to cover,
        // Don't Cares, Solutions found, ...) - decimal listings get plain
        // number chips; anything else prints as-is. --------------------------
        let label = '';
        let rest = trimmed;
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx !== -1 && colonIdx < 48) {
            label = trimmed.substring(0, colonIdx).trim();
            rest = trimmed.substring(colonIdx + 1).trim();
        }
        if (/^\[.*\]$/.test(rest)) {
            const tokens = bracketTokens(rest);
            const vars = proofVariables();
            const isCodeListing = vars.length > 0 && tokens.length > 0 &&
                tokens.every(t => isBinaryToken(t) && t.length === vars.length);
            appendHtml(`
                <div class="qm-row qm-term-list-row">
                    ${label ? `<span class="qm-row-label">${escapeHtml(label)}</span>` : ''}
                    <div class="qm-term-list">${tokens.map(t => isCodeListing ? termBadge(t, 'term') : numChip(t)).join('')}</div>
                </div>
            `);
        } else if (label) {
            appendHtml(`
                <div class="qm-row">
                    <span class="qm-row-label">${escapeHtml(label)}</span>
                    <span class="qm-row-value" style="font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500; color: var(--text-primary); margin-left: 2px;">${escapeHtml(rest)}</span>
                </div>
            `);
        } else {
            appendHtml(`<div class="qm-row">${escapeHtml(trimmed)}</div>`);
        }
    });

    closeSection();
    
    qmBody.innerHTML = qmHtml || '<div class="solution-empty">No Quine-McCluskey steps logged.</div>';
    
    qmBody.dataset.rawProof = rawQmText
        .replace(/===.*?===\n/g, '')
        .replace(/^(\d+\.\s+.*)$/gm, '\n$1\n')
        .split('\n')
        .map(line => {
            if (/^\d+\./.test(line)) return line;
            if (line.trim()) return '  ' + line.trim();
            return '';
        })
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    const currentExpr = (_state.expression || (elements.input && elements.input.value) || '').trim();
    const isShorthand = _isShorthandInput(currentExpr);

    if (isShorthand) {
        algBody.innerHTML = '';
        algBody.dataset.rawProof = '';
        setAlgProofAvailability(false);
    } else if (algHtml) {
        algBody.innerHTML = algHtml;
        algBody.dataset.rawProof = rawAlgText
            .replace(/\r/g, '')
            .replace(/===.*?===\n/g, '')
            .replace(/^[ \t]+/gm, '')
            .replace(/(--\s*\(.*?\)\s*-->)\s*\n\s*/g, '$1 ')
            .trim();
        setAlgProofAvailability(true);
    } else {
        const now = Date.now();
        const elapsed = now - (window._proofStartTime || 0);
        if (elapsed < 3000) {
            algBody.innerHTML = '<div class="solution-empty thinking-spinner"><span class="thinking-dots">Thinking</span></div>';
            setAlgProofAvailability(true);
            if (window._algThinkingTimeout) clearTimeout(window._algThinkingTimeout);
            window._algThinkingTimeout = setTimeout(() => {
                const bodyEl = document.getElementById('alg-body');
                if (bodyEl && bodyEl.querySelector('.thinking-spinner')) {
                    bodyEl.innerHTML = '<div class="solution-empty">No proof logged.</div>';
                    setAlgProofAvailability(false);
                }
            }, Math.max(100, 3000 - elapsed));
        } else {
            algBody.innerHTML = '<div class="solution-empty">No proof logged.</div>';
            setAlgProofAvailability(false);
        }
    }
}

// Render Alternative Solutions list
function renderAlternatives() {
    try {
        const solsJSON = queryWasmString('mantiq_getAllSolutions');
        const sols = JSON.parse(solsJSON || '[]');
        let html = '';
        
        sols.forEach((sol, i) => {
            html += `
                <div class="sol-row">
                    <span class="sol-option">Option ${i + 1}</span>
                    <span class="sol-expr">${sol}</span>
                    <button class="action-icon-btn copy-sol-btn" data-sol="${sol}">
                        ${Icons.copy(14)}
                    </button>
                </div>
            `;
        });
        
        elements.altBody.innerHTML = html || '<p>No alternative solutions.</p>';
        
        // Wire copy buttons inside solutions
        document.querySelectorAll('.copy-sol-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const sol = btn.getAttribute('data-sol');
                const watermark = '\n\nGenerated by Mantiq (https://usamagulzar.github.io/mantiq)';
                navigator.clipboard.writeText(sol + watermark).then(() => {
                    showToast('Solution copied!');
                });
            });
        });
        
    } catch (e) {
        elements.altBody.innerHTML = '<p>Error loading solutions.</p>';
    }
}

// State Syncing Loop
// State Syncing Loop
// Views are updated reactively via state-snapshot messages from the worker.
// This loop only handles lightweight per-frame UI state that must stay in sync
// with user actions (nav button highlights, view transitions).
