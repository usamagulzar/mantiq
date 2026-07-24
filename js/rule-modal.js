const RULE_EXPLANATIONS = {
    // ── Distributive ─────────────────────────────────────────────────────────
    'Distributive Law': {
        title: 'Distributive Law',
        formula: 'A(B + C) = AB + AC  |  A + BC = (A + B)(A + C)',
        desc: 'Distributes a factor over a sum (or factors out a common literal), expanding brackets or compressing terms.',
        stepDesc: 'Expanded or factored terms using the Distributive Law.',
        examples: ['x(y + z) ➔ xy + xz', 'A + B\'C ➔ (A + B\')(A + C)', '(A + B)(C + D) ➔ AC + AD + BC + BD']
    },

    // ── Absorption ───────────────────────────────────────────────────────────
    'Absorption Law': {
        title: 'Absorption Law',
        formula: 'A + AB = A  |  A(A + B) = A',
        desc: 'The longer term AB is completely "absorbed" by the shorter A because AB is never true when A is false.',
        stepDesc: 'Dropped a longer term that was fully contained in a shorter one.',
        examples: ['x + xy ➔ x', 'A(A + B + C) ➔ A', 'xy + xyz ➔ xy']
    },
    'XOR Absorption': {
        title: 'XOR / XNOR Absorption',
        formula: 'A ⊕ A = 0  |  A ↔ A = 1  |  A ⊕ 0 = A  |  A ↔ 1 = A',
        desc: 'A variable XOR-ed (or XNOR-ed) with itself or with a constant collapses to a constant or the variable itself.',
        stepDesc: 'Collapsed XOR / XNOR self-application or constant interaction.',
        examples: ['x ⊕ x ➔ 0', 'y ↔ y ➔ 1', 'A ⊕ 0 ➔ A', 'B ↔ 1 ➔ B']
    },
    'XNOR Absorption': {
        title: 'XOR / XNOR Absorption',
        formula: 'A ⊕ A = 0  |  A ↔ A = 1  |  A ⊕ 0 = A  |  A ↔ 1 = A',
        desc: 'A variable XOR-ed (or XNOR-ed) with itself or with a constant collapses to a constant or the variable itself.',
        stepDesc: 'Collapsed XNOR / XOR self-application or constant interaction.',
        examples: ['x ↔ x ➔ 1', 'y ⊕ y ➔ 0', 'A ↔ 1 ➔ A', 'B ⊕ 0 ➔ B']
    },

    // ── Adjacency / Combining ─────────────────────────────────────────────────
    'Adjacency': {
        title: 'Adjacency (Combining Law)',
        formula: 'AB + AB\' = A  |  (A + B)(A + B\') = A',
        desc: 'Two terms that differ in exactly one literal (one normal, one complemented) combine to drop that literal entirely. This is the same thing you do when you merge two cells on a K-map.',
        stepDesc: 'Merged adjacent terms differing by exactly one complemented variable.',
        examples: ['xy + xy\' ➔ x', 'ABC + ABC\' ➔ AB', '(A+B+C)(A+B+C\') ➔ A+B']
    },
    'Combining Law': {
        title: 'Combining Law (Adjacency)',
        formula: 'AB + AB\' = A  |  (A + B)(A + B\') = A',
        desc: 'Identical to the Adjacency rule: two minterms / maxterms that differ in exactly one variable are combined by dropping that variable.',
        stepDesc: 'Combined two terms differing by one variable to eliminate it.',
        examples: ['xy + xy\' ➔ x', 'A\'B + AB ➔ B', 'ABCD + ABCD\' ➔ ABC']
    },

    // ── Consensus ─────────────────────────────────────────────────────────────
    'Consensus Theorem': {
        title: 'Consensus Theorem (Term Eliminated)',
        formula: 'AB + A\'C + BC = AB + A\'C',
        desc: 'When AB and A\'C are both present, the "consensus" term BC is completely covered by them and can be dropped without changing the function.',
        stepDesc: 'Dropped the redundant consensus term because it is already covered by the other two terms.',
        examples: ['xy + x\'z + yz ➔ xy + x\'z', 'AB + A\'C + BC ➔ AB + A\'C', '(A+B)(A\'+C)(B+C) ➔ (A+B)(A\'+C)']
    },
    'Consensus Theorem (Term Added)': {
        title: 'Consensus Theorem (Term Added)',
        formula: 'AB + A\'C = AB + A\'C + BC',
        desc: 'The reverse of elimination. You add the consensus term BC back in on purpose, even though it is redundant, because it can unlock another step right after it.',
        stepDesc: 'Introduced the consensus term to unlock a subsequent simplification step.',
        examples: [
            'xy + x\'z ➔ xy + x\'z + yz',
            'AB + A\'C ➔ AB + A\'C + BC',
            'x\'y + xy\' ➔ x\'y + xy\' + x\'y\''
        ]
    },

    // ── Complementarity ───────────────────────────────────────────────────────
    'Complementarity': {
        title: 'Complementarity Law',
        formula: 'A + A\' = 1  |  A · A\' = 0',
        desc: 'A variable OR-ed with its own complement is always 1; AND-ed with its complement is always 0.',
        stepDesc: 'Resolved a complementary pair of literals to a Boolean constant.',
        examples: ['x + x\' ➔ 1', 'y · y\' ➔ 0', 'AB + AB\' ➔ A (via adjacency → A·1)']
    },
    'Complementarity (XOR)': {
        title: 'XOR Self-Complement',
        formula: 'A ⊕ A\' = 1  |  A ⊕ A = 0',
        desc: 'A XOR its own complement is always 1; a variable XOR itself is always 0.',
        stepDesc: 'Resolved XOR of a variable with its complement to 1.',
        examples: ['x ⊕ x\' ➔ 1', 'A ⊕ A ➔ 0']
    },
    'Complementarity (XNOR)': {
        title: 'XNOR Self-Complement',
        formula: 'A ↔ A\' = 0  |  A ↔ A = 1',
        desc: 'A XNOR its own complement is always 0; a variable XNOR itself is always 1.',
        stepDesc: 'Resolved XNOR of a variable with its complement to 0.',
        examples: ['x ↔ x\' ➔ 0', 'A ↔ A ➔ 1']
    },
    'Complementarity (XOR/XNOR)': {
        title: 'XOR / XNOR Complementarity',
        formula: 'A ⊕ A\' = 1  |  A ↔ A\' = 0',
        desc: 'Complementary inputs to XOR or XNOR always evaluate to a constant regardless of other variables.',
        stepDesc: 'Resolved a complementary XOR/XNOR pair to a Boolean constant.',
        examples: ['x ⊕ x\' ➔ 1', 'y ↔ y\' ➔ 0']
    },

    // ── De Morgan ─────────────────────────────────────────────────────────────
    'De Morgan\'s Law': {
        title: 'De Morgan\'s Law',
        formula: '(A + B)\' = A\'B\'  |  (AB)\' = A\' + B\'',
        desc: 'Push negation through parentheses: a negated OR becomes AND of negations, a negated AND becomes OR of negations.',
        stepDesc: 'Pushed negation inward, swapping the AND/OR operator.',
        examples: ['(x + y)\' ➔ x\'y\'', '(ab)\' ➔ a\' + b\'', '(A + B\'C)\' ➔ A\'(B + C\')']
    },

    // ── Identity ──────────────────────────────────────────────────────────────
    'Identity': {
        title: 'Identity Law',
        formula: 'A + 0 = A  |  A · 1 = A',
        desc: 'OR-ing with 0 or AND-ing with 1 leaves a variable unchanged. 0 is the identity value for OR, and 1 is the identity value for AND.',
        stepDesc: 'Dropped the identity element (0 in OR, 1 in AND) to simplify.',
        examples: ['A + 0 ➔ A', 'B · 1 ➔ B', '(x + y) + 0 ➔ x + y']
    },
    'Identity (XOR)': {
        title: 'XOR Identity',
        formula: 'A ⊕ 0 = A  |  A ⊕ 1 = A\'',
        desc: 'XOR with 0 leaves the input unchanged; XOR with 1 inverts the input.',
        stepDesc: 'Applied XOR identity element rule.',
        examples: ['x ⊕ 0 ➔ x', 'y ⊕ 1 ➔ y\'', 'A ⊕ 0 ➔ A']
    },
    'Identity (XNOR)': {
        title: 'XNOR Identity',
        formula: 'A ↔ 1 = A  |  A ↔ 0 = A\'',
        desc: 'XNOR with 1 leaves the input unchanged; XNOR with 0 inverts the input.',
        stepDesc: 'Applied XNOR identity element rule.',
        examples: ['x ↔ 1 ➔ x', 'y ↔ 0 ➔ y\'', 'A ↔ 1 ➔ A']
    },

    // ── Idempotence ───────────────────────────────────────────────────────────
    'Idempotence': {
        title: 'Idempotence Law',
        formula: 'A + A = A  |  A · A = A',
        desc: 'Repeating the same term in an OR or AND changes nothing, so the duplicate can be removed safely.',
        stepDesc: 'Removed a duplicate identical term.',
        examples: ['x + x ➔ x', 'y · y ➔ y', 'AB + AB ➔ AB']
    },

    // ── Involution ────────────────────────────────────────────────────────────
    'Involution': {
        title: 'Involution (Double Negation)',
        formula: '(A\'\') = A',
        desc: 'Double negation cancels out exactly, restoring the original expression.',
        stepDesc: 'Cancelled a double-negation to recover the original term.',
        examples: ['(x\')\' ➔ x', '((A + B)\')\' ➔ A + B', '(AB)\'\' ➔ AB']
    },

    // ── Annihilation ─────────────────────────────────────────────────────────
    'Annihilation': {
        title: 'Annihilation Law',
        formula: 'A + 1 = 1  |  A · 0 = 0',
        desc: 'OR with 1 always gives 1 regardless of A; AND with 0 always gives 0 regardless of A.',
        stepDesc: 'Collapsed expression to a constant via the annihilating element.',
        examples: ['A + 1 ➔ 1', 'B · 0 ➔ 0', '(x + y) · 0 ➔ 0', 'xy + 1 ➔ 1']
    },

    // ── Associativity ────────────────────────────────────────────────────────
    'Associativity': {
        title: 'Associativity',
        formula: '(A + B) + C = A + (B + C)  |  (AB)C = A(BC)',
        desc: 'Regrouping terms in an AND or OR chain does not change the outcome, so brackets can be moved around freely.',
        stepDesc: 'Regrouped terms to prepare for a subsequent simplification.',
        examples: ['(A + B) + C ➔ A + (B + C)', '(xy)z ➔ x(yz)', 'A + (B + C) ➔ (A + B) + C']
    },

    // ── Constant Folding / Negation ───────────────────────────────────────────
    'Constant Folding': {
        title: 'Constant Folding',
        formula: '0 + 0 = 0  |  1 · 1 = 1  |  0 · x = 0  |  1 + x = 1',
        desc: 'When both operands of AND/OR are known constants, the result can be computed directly at "compile time".',
        stepDesc: 'Evaluated a constant sub-expression directly.',
        examples: ['0 + 0 ➔ 0', '1 · 1 ➔ 1', '0 · A ➔ 0', '1 + B ➔ 1']
    },
    'Constant Negation': {
        title: 'Constant Negation',
        formula: '0\' = 1  |  1\' = 0',
        desc: 'Negating a known constant immediately yields the opposite constant.',
        stepDesc: 'Negated a Boolean constant.',
        examples: ['0\' ➔ 1', '1\' ➔ 0', '(0 + 0)\' ➔ 1']
    },

    // ── Simplification ────────────────────────────────────────────────────────
    'Simplification': {
        title: 'Simplification',
        formula: 'Various identities applied together',
        desc: 'A catch-all step where multiple small boolean identities (Identity, Annihilation, Idempotence, etc.) are combined in one pass to reduce the expression.',
        stepDesc: 'Applied combined boolean algebra simplification identities.',
        examples: ['A · 1 + B · 0 ➔ A + 0 ➔ A', '(A + 0)(1) ➔ A', 'A\'\' + B · B ➔ A + B']
    },

    // ── Implication variants ──────────────────────────────────────────────────
    'Implication (Self)': {
        title: 'Implication (Self)',
        formula: 'A → A = 1',
        desc: 'A statement always implies itself, so the result is always true.',
        stepDesc: 'Resolved self-implication to 1 (tautology).',
        examples: ['x → x ➔ 1', '(A+B) → (A+B) ➔ 1']
    },
    'Implication (Complement)': {
        title: 'Implication (Complement)',
        formula: 'A → A\' = A\'  |  A\' → A = A',
        desc: 'An implication where the consequent is the complement of the antecedent simplifies to just the complement.',
        stepDesc: 'Resolved complement-implication to the negated antecedent.',
        examples: ['x → x\' ➔ x\'', 'A\' → A ➔ A']
    },
    'Implication (False Antecedent)': {
        title: 'Implication (False Antecedent)',
        formula: '0 → B = 1',
        desc: 'When the antecedent is 0 (false), the implication is vacuously true regardless of the consequent.',
        stepDesc: 'Resolved implication with false antecedent to 1 (vacuous truth).',
        examples: ['0 → y ➔ 1', '0 → (A+B) ➔ 1']
    },
    'Implication (True Antecedent)': {
        title: 'Implication (True Antecedent)',
        formula: '1 → B = B',
        desc: 'When the antecedent is 1 (true), the implication reduces to just the consequent.',
        stepDesc: 'Reduced implication with true antecedent to its consequent.',
        examples: ['1 → y ➔ y', '1 → (A+B) ➔ A+B']
    },
    'Implication (False Consequent)': {
        title: 'Implication (False Consequent)',
        formula: 'A → 0 = A\'',
        desc: 'An implication with a false consequent is equivalent to the negation of the antecedent.',
        stepDesc: 'Simplified implication with false consequent to antecedent\'s complement.',
        examples: ['x → 0 ➔ x\'', '(A+B) → 0 ➔ (A+B)\'']
    },
    'Implication (True Consequent)': {
        title: 'Implication (True Consequent)',
        formula: 'A → 1 = 1',
        desc: 'An implication with a true consequent is always true regardless of the antecedent.',
        stepDesc: 'Resolved implication with true consequent to 1.',
        examples: ['x → 1 ➔ 1', '(A+B) → 1 ➔ 1']
    },

    // ── XOR / XNOR negation forms ────────────────────────────────────────────
    'Negation (XOR)': {
        title: 'XOR Negation',
        formula: '(A ⊕ B)\' = A ↔ B',
        desc: 'The negation of XOR is XNOR. Flipping the output of XOR is the same as checking whether the inputs are equal.',
        stepDesc: 'Converted negated XOR to XNOR.',
        examples: ['(x ⊕ y)\' ➔ x ↔ y', '(A ⊕ B)\' ➔ A ↔ B']
    },
    'Negation (XNOR)': {
        title: 'XNOR Negation',
        formula: '(A ↔ B)\' = A ⊕ B',
        desc: 'The negation of XNOR is XOR. Flipping the equality check gives you the opposite, an inequality check.',
        stepDesc: 'Converted negated XNOR to XOR.',
        examples: ['(x ↔ y)\' ➔ x ⊕ y', '(A ↔ B)\' ➔ A ⊕ B']
    },
    'NOT-XOR to XNOR': {
        title: 'NOT-XOR → XNOR Rewrite',
        formula: '¬(A ⊕ B) = A ↔ B',
        desc: 'Rewriting a negated XOR as XNOR to use the canonical equivalence operator.',
        stepDesc: 'Rewritten NOT-XOR as XNOR for canonical form.',
        examples: ['¬(x ⊕ y) ➔ x ↔ y', '(A ⊕ B)\' ➔ A ↔ B']
    },
    'NOT-XNOR to XOR': {
        title: 'NOT-XNOR → XOR Rewrite',
        formula: '¬(A ↔ B) = A ⊕ B',
        desc: 'Rewriting a negated XNOR as XOR to use the canonical exclusive-or operator.',
        stepDesc: 'Rewritten NOT-XNOR as XOR for canonical form.',
        examples: ['¬(x ↔ y) ➔ x ⊕ y', '(A ↔ B)\' ➔ A ⊕ B']
    },

    // ── Normalization expansions ──────────────────────────────────────────────
    'Normalization (Expand XOR)': {
        title: 'Normalization: XOR Expansion',
        formula: 'A ⊕ B = AB\' + A\'B',
        desc: 'Rewrites XOR using AND, OR, and NOT, so the regular Boolean simplification rules can be used on it.',
        stepDesc: 'Expanded XOR (⊕) into sum-of-products form.',
        examples: ['x ⊕ y ➔ xy\' + x\'y', 'A ⊕ B ➔ AB\' + A\'B', '(A ⊕ B)\' ➔ AB + A\'B\'']
    },
    'Normalization (Expand XNOR)': {
        title: 'Normalization: XNOR Expansion',
        formula: 'A ↔ B = AB + A\'B\'',
        desc: 'Rewrites XNOR using AND, OR, and NOT. This is the opposite of the XOR expansion above.',
        stepDesc: 'Expanded XNOR (↔) into sum-of-products form.',
        examples: ['x ↔ y ➔ xy + x\'y\'', 'A ↔ B ➔ AB + A\'B\'']
    },
    'Normalization (Expand Implication)': {
        title: 'Normalization: Implication Expansion',
        formula: 'A → B = A\' + B',
        desc: 'Converts logical implication into standard OR/NOT form, removing the → operator entirely.',
        stepDesc: 'Converted implication (→) into standard OR/NOT form.',
        examples: ['p → q ➔ p\' + q', 'A → (B + C) ➔ A\' + B + C', '(AB) → C ➔ (AB)\' + C ➔ A\' + B\' + C']
    },

    // ── Bridge / proof-level labels ───────────────────────────────────────────
    'Equivalent Minimal Form (Verified by Truth Table)': {
        title: 'Verified Equivalence (Truth Table)',
        formula: 'f(input) ≡ f(minimized)  ∀ inputs',
        desc: 'The minimized form could not be algebraically connected step-by-step in the allotted time, so the prover fell back to exhaustive truth-table verification to confirm the two expressions are logically identical.',
        stepDesc: 'Confirmed equivalence to the minimized form via truth-table check across all variable assignments.',
        examples: [
            'A\'BC + AB\'C + ABC ≡ BC + AC  (verified by enumerating all 8 rows)',
            'Complex 4-var expressions verified across all 16 combinations'
        ]
    },
};


function showRuleExplanationModal(ruleKey, currentExpr, prevExpr) {
    const existing = document.getElementById('rule-explanation-modal');
    if (existing) existing.remove();

    let ruleData = RULE_EXPLANATIONS[ruleKey];
    if (!ruleData) {
        // Fallback matching for rules like "Distributive Law (SOP Expansion)"
        const baseKey = Object.keys(RULE_EXPLANATIONS).find(k => ruleKey && ruleKey.startsWith(k));
        ruleData = baseKey ? RULE_EXPLANATIONS[baseKey] : {
            title: ruleKey || 'Boolean Algebra Rule',
            formula: 'Standard Transformation Rule',
            desc: 'A standard identity or algebraic transformation applied during Boolean minimization.',
            stepDesc: 'Applied algebraic transformation to simplify the expression.',
            examples: ['A + 0 ➔ A', 'A · 1 ➔ A']
        };
    }

    const modal = document.createElement('div');
    modal.className = 'rule-modal-overlay';
    modal.id = 'rule-explanation-modal';
    modal.innerHTML = `
        <div class="rule-modal-card glass-panel">
            <div class="rule-modal-header">
                <div class="rule-modal-title-group">
                    <span class="rule-modal-badge">${escapeHtml(ruleData.title)}</span>
                    <h3 class="rule-modal-heading">Rule Details</h3>
                </div>
                <button class="rule-modal-close" id="rule-modal-close" aria-label="Close">&times;</button>
            </div>
            <div class="rule-modal-body">
                <div class="rule-modal-section">
                    <div class="rule-modal-section-title">
                        ${Icons.clock}
                        How this step worked here
                    </div>
                    <div class="rule-modal-step-diff">
                        ${prevExpr ? `<div class="rule-diff-before"><span class="diff-tag">BEFORE</span> <code>${escapeHtml(prevExpr)}</code></div>` : ''}
                        <div class="rule-diff-after"><span class="diff-tag">AFTER</span> <code>${escapeHtml(currentExpr)}</code></div>
                    </div>
                    <p class="rule-modal-desc">${escapeHtml(ruleData.stepDesc)}</p>
                </div>

                <div class="rule-modal-section">
                    <div class="rule-modal-section-title">
                        ${Icons.book}
                        General Formula & Standard Rule
                    </div>
                    <div class="rule-formula-box"><code>${escapeHtml(ruleData.formula)}</code></div>
                    <p class="rule-modal-desc">${escapeHtml(ruleData.desc)}</p>
                </div>

                <div class="rule-modal-section">
                    <div class="rule-modal-section-title">
                        ${Icons.star}
                        Common Examples
                    </div>
                    <ul class="rule-examples-list">
                        ${ruleData.examples.map(ex => `<li><code>${escapeHtml(ex)}</code></li>`).join('')}
                    </ul>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('#rule-modal-close');
    const closeModal = () => modal.remove();

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    const keyHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', keyHandler);
        }
    };
    document.addEventListener('keydown', keyHandler);
}

// Delegate clicks on algebraic-step items to open the Rule Explanation Modal
document.addEventListener('click', (e) => {
    const stepEl = e.target.closest('.algebraic-step');
    if (!stepEl) return;
    // Don't open modal for Given or Already Simplified steps
    if (stepEl.classList.contains('no-rule-dialog')) return;

    const ruleKey = stepEl.getAttribute('data-rule') || '';
    const currentExpr = stepEl.getAttribute('data-expr') || '';

    // Find preceding algebraic step for before/after comparison
    let prevExpr = '';
    const allSteps = Array.from(document.querySelectorAll('.algebraic-step'));
    const idx = allSteps.indexOf(stepEl);
    if (idx > 0) {
        prevExpr = allSteps[idx - 1].getAttribute('data-expr') || '';
    }

    showRuleExplanationModal(ruleKey, currentExpr, prevExpr);
});



