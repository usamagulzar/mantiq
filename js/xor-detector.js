/**
 * xor-detector.js
 * Commutative-friendly partial pattern matcher for N-variable XOR/XNOR logic.
 */

// Uses the parseTermLitsJS from ui-core.js (assumed to be loaded globally before this)
// If not available, we define a fallback (this shouldn't happen if loaded correctly).
function parseLits(termStr) {
    if (typeof parseTermLitsJS === 'function') {
        return parseTermLitsJS(termStr);
    }
    const lits = [];
    const clean = termStr.replace(/[()]/g, '');
    const re = /([a-zA-Z]\d?|\d)(['!]?)/g;
    let match;
    while ((match = re.exec(clean)) !== null) {
        lits.push({ var: match[1], comp: match[2] === "'" || match[2] === "!" });
    }
    return lits;
}

/**
 * Returns combinations of an array of elements of a given size.
 */
function getCombinations(array, size) {
    const result = [];
    function backtrack(start, combo) {
        if (combo.length === size) {
            result.push([...combo]);
            return;
        }
        for (let i = start; i < array.length; i++) {
            combo.push(array[i]);
            backtrack(i + 1, combo);
            combo.pop();
        }
    }
    backtrack(0, []);
    return result;
}

/**
 * Generates all minterms (true/false assignments) for a given set of variables.
 * Returns an array of assignments, where each assignment is a map of var -> isComplemented.
 */
function generateMinterms(vars, wantOddParity) {
    const minterms = [];
    const numVars = vars.length;
    const total = 1 << numVars;
    
    for (let i = 0; i < total; i++) {
        let uncomplementedCount = 0;
        const assignment = {};
        for (let j = 0; j < numVars; j++) {
            // If bit is 1, it's uncomplemented. If 0, it's complemented.
            const isUncomp = (i & (1 << j)) !== 0;
            if (isUncomp) uncomplementedCount++;
            assignment[vars[j]] = !isUncomp;
        }
        
        const isOdd = (uncomplementedCount % 2 !== 0);
        if ((wantOddParity && isOdd) || (!wantOddParity && !isOdd)) {
            minterms.push(assignment);
        }
    }
    return minterms;
}

/**
 * Checks if a parsed term exactly matches a required prefix + a specific minterm assignment.
 */
function termMatches(parsedTerm, prefixLits, mintermAssignment) {
    const requiredLits = [...prefixLits];
    for (const [v, comp] of Object.entries(mintermAssignment)) {
        requiredLits.push({ var: v, comp });
    }
    
    if (parsedTerm.length !== requiredLits.length) return false;
    
    // Check if every required literal exists in the parsed term
    for (const req of requiredLits) {
        const found = parsedTerm.find(l => l.var === req.var && l.comp === req.comp);
        if (!found) return false;
    }
    return true;
}

/**
 * Main function to detect and replace partial XOR/XNOR patterns in a SOP expression.
 */
function extractXorPatterns(exprStr) {
    if (!exprStr) return null;
    
    let isPos = false;
    let originalTerms = [];
    const cleanStr = exprStr.trim();
    
    // Naive POS detection: strictly starts with (, ends with ), and contains no + outside parens
    if (cleanStr.startsWith('(') && cleanStr.endsWith(')')) {
        let depth = 0;
        let hasOutsidePlus = false;
        for (let i = 0; i < cleanStr.length; i++) {
            if (cleanStr[i] === '(') depth++;
            else if (cleanStr[i] === ')') depth--;
            else if (cleanStr[i] === '+' && depth === 0) {
                hasOutsidePlus = true;
                break;
            }
        }
        if (!hasOutsidePlus) {
            isPos = true;
        }
    }
    
    if (isPos) {
        let inner = cleanStr.substring(1, cleanStr.length - 1);
        originalTerms = inner.split(/\)\s*\(/).map(s => s.trim()).filter(Boolean);
    } else {
        originalTerms = cleanStr.split('+').map(s => s.trim()).filter(Boolean);
    }
    
    if (originalTerms.length < 2) return null;

    // Parse all terms into literal arrays
    let parsedTerms = originalTerms.map(t => ({
        original: t,
        lits: parseLits(t)
    }));

    // Collect all unique variables present in the expression
    const allVarsSet = new Set();
    parsedTerms.forEach(t => t.lits.forEach(l => allVarsSet.add(l.var)));
    const allVars = Array.from(allVarsSet).sort((a, b) => a.localeCompare(b));

    let modified = false;
    let finalTerms = [];

    // Try finding N-variable XOR patterns, from largest possible to 2
    for (let N = Math.min(6, allVars.length); N >= 2; N--) {
        const varCombos = getCombinations(allVars, N);
        
        for (const targetVars of varCombos) {
            // For a given set of target variables, we might have multiple prefixes.
            // A prefix is whatever literals are left in a term when we remove the target variables.
            const prefixMap = new Map(); // prefix string -> array of parsed terms that have this prefix
            
            for (const pTerm of parsedTerms) {
                // Ensure the term has exactly the target variables + some other variables
                let hasAllTargets = true;
                for (const tv of targetVars) {
                    if (!pTerm.lits.find(l => l.var === tv)) {
                        hasAllTargets = false;
                        break;
                    }
                }
                if (!hasAllTargets) continue;
                
                // Extract prefix
                const prefixLits = pTerm.lits.filter(l => !targetVars.includes(l.var));
                // Sort prefix to create a canonical key
                const prefixKey = prefixLits
                    .sort((a, b) => a.var.localeCompare(b.var))
                    .map(l => l.var + (l.comp ? "'" : ""))
                    .join('');
                    
                if (!prefixMap.has(prefixKey)) prefixMap.set(prefixKey, { lits: prefixLits, terms: [] });
                prefixMap.get(prefixKey).terms.push(pTerm);
            }

            // Generate expected minterms (POS requires flipped parity rules)
            const oddMinterms = generateMinterms(targetVars, isPos ? (N % 2 !== 0) : true); // XOR
            const evenMinterms = generateMinterms(targetVars, isPos ? (N % 2 === 0) : false); // XNOR

            for (const [prefixKey, prefixData] of prefixMap.entries()) {
                const termsWithPrefix = prefixData.terms;
                if (termsWithPrefix.length !== oddMinterms.length) continue; // must have exactly 2^(N-1) terms

                // Check if they match Odd parity (XOR)
                let matchesOdd = true;
                for (const minterm of oddMinterms) {
                    if (!termsWithPrefix.some(t => termMatches(t.lits, prefixData.lits, minterm))) {
                        matchesOdd = false;
                        break;
                    }
                }

                // Check if they match Even parity (XNOR)
                let matchesEven = false;
                if (!matchesOdd) {
                    matchesEven = true;
                    for (const minterm of evenMinterms) {
                        if (!termsWithPrefix.some(t => termMatches(t.lits, prefixData.lits, minterm))) {
                            matchesEven = false;
                            break;
                        }
                    }
                }

                if (matchesOdd || matchesEven) {
                    // We found a match!
                    // Remove these terms from parsedTerms
                    parsedTerms = parsedTerms.filter(t => !termsWithPrefix.includes(t));
                    
                    // Construct replacement
                    const op = matchesOdd ? '⊕' : '⊙';
                    const xorExpr = targetVars.join(` ${op} `);
                    
                    let replacement = '';
                    if (prefixData.lits.length > 0) {
                        const prefixStr = prefixData.lits.map(l => l.var + (l.comp ? "'" : "")).join(isPos ? '+' : '');
                        replacement = isPos ? `${prefixStr}+(${xorExpr})` : `${prefixStr}(${xorExpr})`;
                    } else {
                        // Avoid unnecessary parens if it's the only thing
                        replacement = xorExpr;
                        if (parsedTerms.length > 0) {
                            replacement = `(${xorExpr})`;
                        }
                    }
                    
                    finalTerms.push(replacement);
                    modified = true;
                }
            }
        }
    }

    // Add remaining unmatched terms
    for (const pTerm of parsedTerms) {
        finalTerms.push(pTerm.original);
    }

    if (modified) {
        if (isPos) {
            return finalTerms.map(t => t.startsWith('(') ? t : '(' + t + ')').join('');
        }
        return finalTerms.join(' + ');
    }
    
    return null;
}

// Attach to window if running in browser
if (typeof window !== 'undefined') {
    window.extractXorPatterns = extractXorPatterns;
} else if (typeof module !== 'undefined') {
    module.exports = { extractXorPatterns };
}
