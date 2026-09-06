// AST Prover for Minimal IC optimization
// Evaluates all Boolean representations (Original, SOP, POS, NAND-NAND, NOR-NOR)
// and uses Simulated Annealing with smart gate-sharing (free NAND/NOR/XOR+VCC as NOT)
// to reach the absolute minimum physical IC package count.

const IC_DB = {
    'TTL': {
        'AND':  { 2: {part:'7408', size:4}, 3: {part:'7411', size:3}, 4: {part:'7421', size:2} },
        'OR':   { 2: {part:'7432', size:4} },
        'NOT':  { 1: {part:'7404', size:6} },
        'NAND': { 2: {part:'7400', size:4}, 3: {part:'7410', size:3}, 4: {part:'7420', size:2}, 8: {part:'7430', size:1} },
        'NOR':  { 2: {part:'7402', size:4}, 3: {part:'7427', size:3}, 4: {part:'7425', size:2} },
        'XOR':  { 2: {part:'7486', size:4} },
        'XNOR': { 2: {part:'74266', size:4} }
    },
    'CMOS': {
        'AND':  { 2: {part:'CD4081', size:4}, 3: {part:'CD4073', size:3}, 4: {part:'CD4082', size:2} },
        'OR':   { 2: {part:'CD4071', size:4}, 3: {part:'CD4075', size:3}, 4: {part:'CD4072', size:2} },
        'NOT':  { 1: {part:'CD4069', size:6} },
        'NAND': { 2: {part:'CD4011', size:4}, 3: {part:'CD4023', size:3}, 4: {part:'CD4012', size:2}, 8: {part:'CD4068', size:1} },
        'NOR':  { 2: {part:'CD4001', size:4}, 3: {part:'CD4025', size:3}, 4: {part:'CD4002', size:2}, 8: {part:'CD4078', size:1} },
        'XOR':  { 2: {part:'CD4070', size:4} },
        'XNOR': { 2: {part:'CD4077', size:4} }
    }
};

// Generate LS-TTL from TTL
IC_DB['LS-TTL'] = JSON.parse(JSON.stringify(IC_DB['TTL']));
for (let gate in IC_DB['LS-TTL']) {
    for (let fanin in IC_DB['LS-TTL'][gate]) {
        if (IC_DB['LS-TTL'][gate][fanin].part.startsWith('74')) {
            IC_DB['LS-TTL'][gate][fanin].part = IC_DB['LS-TTL'][gate][fanin].part.replace('74', '74LS');
        }
    }
}

// Deep clone AST
function cloneAST(node) {
    if (!node) return null;
    return {
        type: node.type,
        value: node.value,
        isGate: Boolean(node.isGate),
        children: node.children ? node.children.map(cloneAST) : []
    };
}

// Check if a node acts as an inverter
function isLogicalNot(n) {
    if (!n || !n.isGate) return false;
    if (n.type === 'NOT') return true;
    if ((n.type === 'NAND' || n.type === 'NOR') && n.children && n.children.length === 1) return true;
    if (n.type === 'XOR' && n.children && n.children.length === 2) {
        // XOR with VCC / 1
        const c0 = n.children[0], c1 = n.children[1];
        if ((!c0.isGate && (c0.value === '1' || c0.value === 'VCC')) || (!c1.isGate && (c1.value === '1' || c1.value === 'VCC'))) {
            return true;
        }
    }
    return false;
}

// Get the inverted child of an inverter node
function getInvertedChild(n) {
    if (n.type === 'NOT' || n.type === 'NAND' || n.type === 'NOR') {
        return n.children[0];
    }
    if (n.type === 'XOR' && n.children && n.children.length === 2) {
        const c0 = n.children[0], c1 = n.children[1];
        if (!c0.isGate && (c0.value === '1' || c0.value === 'VCC')) return c1;
        return c0;
    }
    return n.children ? n.children[0] : null;
}

// Cancel double NOTs recursively
function cancelDoubleNOTs(node) {
    if (!node || !node.isGate) return node;

    for (let i = 0; i < node.children.length; i++) {
        node.children[i] = cancelDoubleNOTs(node.children[i]);
    }

    if (isLogicalNot(node)) {
        const child = getInvertedChild(node);
        if (child && isLogicalNot(child)) {
            const grandchild = getInvertedChild(child);
            return cancelDoubleNOTs(grandchild);
        }
    }
    return node;
}

// Flatten associative gates (AND of AND, OR of OR) up to maxFanIn
function flattenAssociative(node, maxFanIn = 4) {
    if (!node || !node.isGate) return;
    if (node.children) node.children.forEach(c => flattenAssociative(c, maxFanIn));

    if (node.type === 'AND' || node.type === 'OR' || node.type === 'NAND' || node.type === 'NOR' || node.type === 'XOR') {
        let newChildren = [];
        for (let child of node.children) {
            if (child.isGate && child.type === node.type && (node.type === 'AND' || node.type === 'OR' || node.type === 'XOR')) {
                newChildren.push(...child.children);
            } else {
                newChildren.push(child);
            }
        }
        if (newChildren.length <= maxFanIn) {
            node.children = newChildren;
        }
    }
}

// Enforce max fan-in by splitting oversized gates into cascades
function enforceFanIn(node, maxFanIn = 4) {
    if (!node || !node.isGate || !node.children) return;
    node.children.forEach(c => enforceFanIn(c, maxFanIn));

    if (node.children.length > maxFanIn && (node.type === 'AND' || node.type === 'OR' || node.type === 'XOR')) {
        while (node.children.length > maxFanIn) {
            const chunk = node.children.splice(0, maxFanIn);
            const subGate = {
                type: node.type,
                value: '',
                isGate: true,
                children: chunk
            };
            node.children.unshift(subGate);
        }
    }
}

// Get flat array of all gate nodes
function getGateNodes(node, arr = []) {
    if (node && node.isGate) {
        arr.push(node);
        if (node.children) node.children.forEach(c => getGateNodes(c, arr));
    }
    return arr;
}

// Check variable equality helper
function isSameVar(n1, n2) {
    return n1 && n2 && !n1.isGate && !n2.isGate && n1.value === n2.value;
}

// Smart Pattern Recognition (XOR / XNOR Detection)
function detectXORPatterns(node) {
    if (!node || !node.isGate || !node.children) return node;
    node.children = node.children.map(detectXORPatterns);

    // Pattern 1: OR( AND(A, !B), AND(!A, B) ) -> XOR(A, B)
    if (node.type === 'OR' && node.children.length === 2) {
        const c0 = node.children[0];
        const c1 = node.children[1];
        if (c0.isGate && c0.type === 'AND' && c0.children.length === 2 &&
            c1.isGate && c1.type === 'AND' && c1.children.length === 2) {
            
            // Check for A, !B and !A, B
            let a = null, b = null;
            const checkXOR = (p1, p2, q1, q2) => {
                if (isLogicalNot(p2) && isLogicalNot(q1)) {
                    const p2Child = getInvertedChild(p2);
                    const q1Child = getInvertedChild(q1);
                    if (isSameVar(p1, q1Child) && isSameVar(p2Child, q2)) {
                        return { a: p1, b: q2 };
                    }
                }
                return null;
            };

            let res = checkXOR(c0.children[0], c0.children[1], c1.children[0], c1.children[1]) ||
                      checkXOR(c0.children[0], c0.children[1], c1.children[1], c1.children[0]) ||
                      checkXOR(c0.children[1], c0.children[0], c1.children[0], c1.children[1]) ||
                      checkXOR(c0.children[1], c0.children[0], c1.children[1], c1.children[0]);

            if (res) {
                return {
                    type: 'XOR',
                    value: '',
                    isGate: true,
                    children: [cloneAST(res.a), cloneAST(res.b)]
                };
            }
        }
    }
    return node;
}

/**
 * Intelligent IC Bin-Packer
 * Allocates primary gates, then packs NOT gates into spare gates of already-used ICs
 * (free NAND as NOT, free NOR as NOT, free XOR with VCC as NOT, free XNOR with GND as NOT).
 */
function evaluateAndPackICs(root, familyName, maxFanIn = 4) {
    const db = IC_DB[familyName] || IC_DB['TTL'];
    const nodes = getGateNodes(root);

    // Categorize nodes
    const primaryGateCounts = {}; // "AND_2", "NAND_2", etc.
    const notNodes = [];
    const nonNotNodes = [];

    for (let node of nodes) {
        const type = node.type;
        const fanIn = node.children ? node.children.length : 0;

        // Is this a dedicated inverter or single-input gate?
        if (type === 'NOT') {
            notNodes.push(node);
        } else if ((type === 'NAND' || type === 'NOR') && fanIn === 1) {
            // This is explicitly a single-input NAND or NOR (drawn with shorted inputs)
            // It uses a physical NAND/NOR gate of smallest available fan-in (2)
            const key = type + '_2';
            if (!primaryGateCounts[key]) primaryGateCounts[key] = { type: type, fanIn: 2, count: 0 };
            primaryGateCounts[key].count++;
            nonNotNodes.push(node);
        } else if (type === 'XOR' && fanIn === 2 && (isSameVar(node.children[1], {value:'1'}) || isSameVar(node.children[1], {value:'VCC'}))) {
            // XOR used as NOT
            const key = 'XOR_2';
            if (!primaryGateCounts[key]) primaryGateCounts[key] = { type: 'XOR', fanIn: 2, count: 0 };
            primaryGateCounts[key].count++;
            nonNotNodes.push(node);
        } else {
            // Multi-input primary gate
            let actualFanIn = fanIn;
            let countWeight = 1;

            if (!db[type] || !db[type][actualFanIn]) {
                // If native gate doesn't exist for this fanIn (e.g. 3-input OR in TTL),
                // split into 2-input gates (e.g. OR3 needs two 2-input ORs)
                if (db[type] && db[type][2]) {
                    actualFanIn = 2;
                    countWeight = Math.max(1, fanIn - 1);
                } else {
                    actualFanIn = 2;
                }
            }

            const key = type + '_' + actualFanIn;
            if (!primaryGateCounts[key]) primaryGateCounts[key] = { type: type, fanIn: actualFanIn, count: 0 };
            primaryGateCounts[key].count += countWeight;
            nonNotNodes.push(node);
        }
    }

    // Step 1: Calculate packages and spare gates for all primary ICs
    const packageUsage = {}; // partName -> { part, pkgs, gatesUsed, capacity, spare }
    let totalICs = 0;

    for (let key in primaryGateCounts) {
        const item = primaryGateCounts[key];
        const icInfo = db[item.type] && db[item.type][item.fanIn];
        if (icInfo) {
            const part = icInfo.part;
            const pkgs = Math.ceil(item.count / icInfo.size);
            const cap = pkgs * icInfo.size;
            const spare = cap - item.count;

            if (!packageUsage[part]) {
                packageUsage[part] = { part: part, type: item.type, fanIn: item.fanIn, pkgs: pkgs, gatesUsed: item.count, capacity: cap, spare: spare };
                totalICs += pkgs;
            } else {
                // Same part used for different fanins (rare)
                const added = item.count;
                packageUsage[part].gatesUsed += added;
                const newPkgs = Math.ceil(packageUsage[part].gatesUsed / icInfo.size);
                totalICs += (newPkgs - packageUsage[part].pkgs);
                packageUsage[part].pkgs = newPkgs;
                packageUsage[part].capacity = newPkgs * icInfo.size;
                packageUsage[part].spare = packageUsage[part].capacity - packageUsage[part].gatesUsed;
            }
        }
    }

    // Step 2: Super Smart Spare-Gate Allocation for NOT gates!
    // Can we satisfy NOT gates using FREE spare gates on chips we ALREADY have?
    let remainingNotCount = notNodes.length;
    const notAssignments = []; // { node, assignedPart, method }

    // Prioritize spare gates from already-purchased ICs:
    // 1. Spare NAND gates (tied inputs = NOT)
    // 2. Spare NOR gates (tied inputs = NOT)
    // 3. Spare XOR gates (one pin to VCC = NOT)
    // 4. Spare XNOR gates (one pin to GND = NOT)
    const spareGatePool = [];
    for (let part in packageUsage) {
        const u = packageUsage[part];
        if (u.spare > 0) {
            if (u.type === 'NAND') spareGatePool.push({ part: u.part, type: 'NAND', available: u.spare, desc: `${u.part} (NAND as NOT)` });
            else if (u.type === 'NOR') spareGatePool.push({ part: u.part, type: 'NOR', available: u.spare, desc: `${u.part} (NOR as NOT)` });
            else if (u.type === 'XOR') spareGatePool.push({ part: u.part, type: 'XOR', available: u.spare, desc: `${u.part} (XOR+VCC as NOT)` });
            else if (u.type === 'XNOR') spareGatePool.push({ part: u.part, type: 'XNOR', available: u.spare, desc: `${u.part} (XNOR+GND as NOT)` });
        }
    }

    let notIdx = 0;
    for (let pool of spareGatePool) {
        while (pool.available > 0 && notIdx < notNodes.length) {
            notAssignments.push({ node: notNodes[notIdx], assignedPart: pool.desc, realPart: pool.part });
            pool.available--;
            remainingNotCount--;
            notIdx++;
        }
    }

    // Step 3: Any leftover NOT gates need dedicated Inverter ICs (7404 / CD4069)
    if (remainingNotCount > 0) {
        const notIc = db['NOT'][1];
        if (notIc) {
            const notPkgs = Math.ceil(remainingNotCount / notIc.size);
            totalICs += notPkgs;
            if (!packageUsage[notIc.part]) {
                packageUsage[notIc.part] = {
                    part: notIc.part,
                    type: 'NOT',
                    fanIn: 1,
                    pkgs: notPkgs,
                    gatesUsed: remainingNotCount,
                    capacity: notPkgs * notIc.size,
                    spare: (notPkgs * notIc.size) - remainingNotCount
                };
            } else {
                packageUsage[notIc.part].pkgs += notPkgs;
                packageUsage[notIc.part].gatesUsed += remainingNotCount;
            }

            while (notIdx < notNodes.length) {
                notAssignments.push({ node: notNodes[notIdx], assignedPart: notIc.part, realPart: notIc.part });
                notIdx++;
            }
        }
    }

    // Build breakdown summary
    const breakdown = Object.values(packageUsage).map(u => ({
        part: u.part,
        pkgs: u.pkgs,
        gatesUsed: u.gatesUsed,
        capacity: u.capacity
    }));

    return {
        cost: totalICs,
        breakdown: breakdown,
        packageUsage: packageUsage,
        notAssignments: notAssignments
    };
}

// Assign part labels to each gate node in the AST
function assignLabelsToAST(root, evaluationResult, familyName) {
    const db = IC_DB[familyName] || IC_DB['TTL'];
    const nodes = getGateNodes(root);
    const notMap = new Map();

    if (evaluationResult.notAssignments) {
        for (let a of evaluationResult.notAssignments) {
            notMap.set(a.node, a.assignedPart);
        }
    }

    for (let node of nodes) {
        const type = node.type;
        const fanIn = node.children ? node.children.length : 0;

        if (notMap.has(node)) {
            node.icLabel = notMap.get(node);
        } else if ((type === 'NAND' || type === 'NOR') && fanIn === 1) {
            const icInfo = db[type] && db[type][2];
            node.icLabel = icInfo ? `${icInfo.part} (inv)` : type;
        } else {
            let actualFanIn = fanIn;
            if (!db[type] || !db[type][actualFanIn]) {
                if (db[type] && db[type][2]) actualFanIn = 2;
            }
            const icInfo = db[type] && db[type][actualFanIn];
            node.icLabel = icInfo ? icInfo.part : type;
        }
    }
}

// Mutate a node using equivalence rules
function mutateNode(node) {
    if (!node || !node.isGate || !node.children) return;
    const type = node.type;
    const r = Math.random();

    function wrapNOT(child) {
        return { type: 'NOT', value: '', isGate: true, children: [cloneAST(child)] };
    }

    if (type === 'AND') {
        if (r < 0.4) {
            // AND -> NOT(NAND)
            node.type = 'NAND';
            const clone = cloneAST(node);
            node.type = 'NOT';
            node.children = [clone];
        } else if (r < 0.8) {
            // AND -> NOR(NOT(A), NOT(B)...)
            node.type = 'NOR';
            node.children = node.children.map(wrapNOT);
        }
    } else if (type === 'OR') {
        if (r < 0.4) {
            // OR -> NOT(NOR)
            node.type = 'NOR';
            const clone = cloneAST(node);
            node.type = 'NOT';
            node.children = [clone];
        } else if (r < 0.8) {
            // OR -> NAND(NOT(A), NOT(B)...)
            node.type = 'NAND';
            node.children = node.children.map(wrapNOT);
        }
    } else if (type === 'NAND' && node.children.length > 1) {
        if (r < 0.4) {
            // NAND -> NOT(AND)
            node.type = 'AND';
            const clone = cloneAST(node);
            node.type = 'NOT';
            node.children = [clone];
        } else if (r < 0.8) {
            // NAND -> OR(NOT(A), NOT(B)...)
            node.type = 'OR';
            node.children = node.children.map(wrapNOT);
        }
    } else if (type === 'NOR' && node.children.length > 1) {
        if (r < 0.4) {
            // NOR -> NOT(OR)
            node.type = 'OR';
            const clone = cloneAST(node);
            node.type = 'NOT';
            node.children = [clone];
        } else if (r < 0.8) {
            // NOR -> AND(NOT(A), NOT(B)...)
            node.type = 'AND';
            node.children = node.children.map(wrapNOT);
        }
    } else if (type === 'NOT' || ((type === 'NAND' || type === 'NOR') && node.children.length === 1)) {
        // Inverter variations: NOT <-> NAND1 <-> NOR1 <-> XOR with VCC
        if (r < 0.3) {
            node.type = 'NAND';
            node.children = [node.children[0]];
        } else if (r < 0.6) {
            node.type = 'NOR';
            node.children = [node.children[0]];
        } else if (r < 0.85) {
            node.type = 'XOR';
            node.children = [node.children[0], { type: 'CONST', value: 'VCC', isGate: false, children: [] }];
        } else {
            node.type = 'NOT';
            node.children = [node.children[0]];
        }
    }
}

/**
 * Run Simulated Annealing from a given AST seed
 */
function optimizeSeedAST(seedAST, family, maxFanIn, iterations = 1000) {
    let best = cloneAST(seedAST);
    best = cancelDoubleNOTs(best);
    best = detectXORPatterns(best);
    flattenAssociative(best, maxFanIn);
    enforceFanIn(best, maxFanIn);

    let bestEval = evaluateAndPackICs(best, family, maxFanIn);
    let current = cloneAST(best);
    let currentEval = bestEval;

    let T = 1.0;
    const alpha = 0.96;
    const stepsPerTemp = 25;
    const numLoops = Math.floor(iterations / stepsPerTemp);

    for (let loop = 0; loop < numLoops; loop++) {
        for (let s = 0; s < stepsPerTemp; s++) {
            const candidate = cloneAST(current);
            const gateList = getGateNodes(candidate);
            if (gateList.length === 0) break;

            const targetNode = gateList[Math.floor(Math.random() * gateList.length)];
            mutateNode(targetNode);

            let clean = cancelDoubleNOTs(candidate);
            clean = detectXORPatterns(clean);
            flattenAssociative(clean, maxFanIn);
            enforceFanIn(clean, maxFanIn);

            const evalRes = evaluateAndPackICs(clean, family, maxFanIn);
            const delta = evalRes.cost - currentEval.cost;

            // Accept if better, or probabilistically if worse (allowing exploration)
            if (delta < 0 || Math.exp(-delta / Math.max(0.01, T)) > Math.random()) {
                current = clean;
                currentEval = evalRes;

                if (currentEval.cost < bestEval.cost) {
                    best = cloneAST(current);
                    bestEval = currentEval;
                }
            }
        }
        T *= alpha;
    }

    return { ast: best, cost: bestEval.cost, eval: bestEval };
}

/**
 * Main AST Prover Entry Point
 * Takes all candidate trees from WASM (Original, SOP Default/NAND/NOR, POS Default/NAND/NOR)
 * and runs optimization across all of them to find the true global minimum.
 */
const _targetScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
_targetScope.runASTProver = function(inputData, family = 'TTL', maxFanIn = 4) {
    if (!inputData) return null;

    const candidates = [];

    // Helper to safely parse and add AST
    const addCandidate = (strOrObj) => {
        if (!strOrObj) return;
        try {
            const parsed = typeof strOrObj === 'string' ? JSON.parse(strOrObj) : strOrObj;
            if (parsed && parsed.isGate) {
                candidates.push(parsed);
            } else if (parsed && parsed.simplified) {
                candidates.push(parsed.simplified);
                if (parsed.original) candidates.push(parsed.original);
            }
        } catch (e) {}
    };

    // inputData can be an array of all candidate trees or a single circuitJSON
    if (Array.isArray(inputData)) {
        for (let item of inputData) {
            if (item.json) addCandidate(item.json);
            else addCandidate(item);
        }
    } else {
        addCandidate(inputData);
    }

    if (candidates.length === 0) return null;

    let globalBest = null;
    let globalBestEval = null;
    let minCost = Infinity;

    // Step 1: Initial evaluation of ALL candidate seeds
    for (let ast of candidates) {
        const cleanAST = detectXORPatterns(cancelDoubleNOTs(cloneAST(ast)));
        enforceFanIn(cleanAST, maxFanIn);
        const evalRes = evaluateAndPackICs(cleanAST, family, maxFanIn);

        if (evalRes.cost < minCost) {
            minCost = evalRes.cost;
            globalBest = cleanAST;
            globalBestEval = evalRes;
        }

        // If cost is already 1 IC, that's the theoretical minimum — we can't beat 1 IC!
        if (minCost <= 1) break;
    }

    // Step 2: If we still need more than 1 IC, run Simulated Annealing on the top candidates
    if (minCost > 1) {
        for (let i = 0; i < Math.min(candidates.length, 5); i++) {
            const seed = candidates[i];
            const saResult = optimizeSeedAST(seed, family, maxFanIn, 800);
            if (saResult.cost < minCost) {
                minCost = saResult.cost;
                globalBest = saResult.ast;
                globalBestEval = saResult.eval;
                if (minCost <= 1) break;
            }
        }
    }

    // Step 3: Assign intelligent labels (e.g. "7400 (NAND as NOT)", "7486 (XOR+VCC as NOT)", "7408")
    assignLabelsToAST(globalBest, globalBestEval, family);

    return {
        ast: globalBest,
        cost: globalBestEval.cost,
        breakdown: globalBestEval.breakdown
    };
};
