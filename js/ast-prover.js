// AST Prover for Minimal IC optimization
// Uses Simulated Annealing to rewrite logic trees and minimize physical IC count.

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
    return {
        type: node.type,
        value: node.value,
        isGate: node.isGate,
        children: node.children ? node.children.map(cloneAST) : []
    };
}

// Flatten cascaded gates of the same type (e.g. AND(AND(A, B), C) -> AND(A, B, C))
// Respecting max fan-in happens natively during evaluation
function flattenAssociative(node) {
    if (!node || !node.isGate) return;
    node.children.forEach(flattenAssociative);

    if (node.type === 'AND' || node.type === 'OR' || node.type === 'XOR') {
        let newChildren = [];
        for (let child of node.children) {
            if (child.isGate && child.type === node.type) {
                newChildren.push(...child.children);
            } else {
                newChildren.push(child);
            }
        }
        node.children = newChildren;
    }
}

// Cancel double NOTs
function cancelDoubleNOTs(node) {
    if (!node || !node.isGate) return node;

    // A NOT gate is either type='NOT', or a single-input NAND/NOR
    function isNot(n) {
        return n && n.isGate && (n.type === 'NOT' || ((n.type === 'NAND' || n.type === 'NOR') && n.children.length === 1));
    }

    // Process children first
    for (let i = 0; i < node.children.length; i++) {
        node.children[i] = cancelDoubleNOTs(node.children[i]);
    }

    if (isNot(node)) {
        let child = node.children[0];
        if (isNot(child)) {
            // double NOT cancelled! Return the grandchild
            return child.children[0];
        }
    }
    return node;
}

// Get flat array of all gate nodes
function getGateNodes(node, arr = []) {
    if (node && node.isGate) {
        arr.push(node);
        node.children.forEach(c => getGateNodes(c, arr));
    }
    return arr;
}

// Evaluate total IC cost
function evaluateIC_Cost(root, familyName, maxFanIn) {
    let gateCounts = {};
    let nodes = getGateNodes(root);
    let db = IC_DB[familyName] || IC_DB['TTL'];

    // If maxFanIn is set (e.g. 2,3,4), we must conceptually split gates that exceed it
    // For cost evaluation, we just figure out how many native gates it takes.
    // e.g. a 5-input AND with maxFanIn=4. 
    // Wait, Mantiq core already strictly enforces maxFanIn before passing the AST!
    // So node.children.length is guaranteed <= maxFanIn.
    
    for (let node of nodes) {
        let type = node.type;
        let fanIn = node.children.length;
        
        // Single-input NAND/NOR is a NOT
        if ((type === 'NAND' || type === 'NOR') && fanIn === 1) {
            type = 'NOT';
        }

        // If a gate doesn't exist natively for this fanIn, we conceptually construct it
        // using 2-input versions (cost penalty). e.g., OR3 -> two OR2s.
        let actualFanIn = fanIn;
        let penaltyMultiplier = 1;
        
        if (!db[type] || !db[type][actualFanIn]) {
            // Fallback: split into 2-input gates
            // A fan-in of N needs (N-1) 2-input gates.
            if (db[type] && db[type][2]) {
                actualFanIn = 2;
                penaltyMultiplier = Math.max(1, fanIn - 1);
            } else {
                // absolute fallback (shouldn't happen for standard gates)
                continue;
            }
        }

        let key = type + '_' + actualFanIn;
        if (!gateCounts[key]) gateCounts[key] = { type: type, fanIn: actualFanIn, count: 0 };
        gateCounts[key].count += penaltyMultiplier;
    }

    let totalICs = 0;
    let breakdown = [];
    
    for (let key in gateCounts) {
        let entry = gateCounts[key];
        let icInfo = db[entry.type][entry.fanIn];
        if (icInfo) {
            let pkgs = Math.ceil(entry.count / icInfo.size);
            totalICs += pkgs;
            breakdown.push({ part: icInfo.part, pkgs: pkgs, gatesUsed: entry.count, maxGates: pkgs * icInfo.size });
        }
    }
    return { cost: totalICs, breakdown: breakdown };
}

// Assign part numbers to nodes for rendering
function assignICLabels(root, familyName) {
    let db = IC_DB[familyName] || IC_DB['TTL'];
    let nodes = getGateNodes(root);
    
    // Track usage per IC part to assign e.g. "74LS00 (1/4)"
    let usage = {};

    for (let node of nodes) {
        let type = node.type;
        let fanIn = node.children.length;
        if ((type === 'NAND' || type === 'NOR') && fanIn === 1) type = 'NOT';

        let actualFanIn = fanIn;
        if (!db[type] || !db[type][actualFanIn]) {
            if (db[type] && db[type][2]) actualFanIn = 2;
        }

        let icInfo = (db[type] && db[type][actualFanIn]) ? db[type][actualFanIn] : null;
        if (icInfo) {
            let part = icInfo.part;
            if (!usage[part]) usage[part] = 0;
            usage[part]++;
            
            // e.g. "74LS00"
            node.icLabel = part;
        } else {
            node.icLabel = "???";
        }
    }
}

// Apply a random valid rewrite rule to a node
function mutateNode(node) {
    if (!node.isGate) return;
    
    let type = node.type;
    let r = Math.random();

    // Helper to wrap children in NOTs
    function invertChildren(children) {
        return children.map(c => ({
            type: 'NOT', value: '', isGate: true, children: [cloneAST(c)]
        }));
    }
    
    // Helper to wrap node in NOT
    function invertSelf(n) {
        return {
            type: 'NOT', value: '', isGate: true, children: [n]
        };
    }

    if (type === 'AND') {
        if (r < 0.33) {
            // AND -> NOT(NAND)
            node.type = 'NAND';
            let inverted = invertSelf(cloneAST(node));
            Object.assign(node, inverted);
        } else if (r < 0.66) {
            // AND -> NOR(NOT(A), NOT(B))
            node.type = 'NOR';
            node.children = invertChildren(node.children);
        }
    } else if (type === 'OR') {
        if (r < 0.33) {
            // OR -> NOT(NOR)
            node.type = 'NOR';
            let inverted = invertSelf(cloneAST(node));
            Object.assign(node, inverted);
        } else if (r < 0.66) {
            // OR -> NAND(NOT(A), NOT(B))
            node.type = 'NAND';
            node.children = invertChildren(node.children);
        }
    } else if (type === 'NAND' && node.children.length > 1) {
        if (r < 0.33) {
            // NAND -> NOT(AND)
            node.type = 'AND';
            let inverted = invertSelf(cloneAST(node));
            Object.assign(node, inverted);
        } else if (r < 0.66) {
            // NAND -> OR(NOT(A), NOT(B))
            node.type = 'OR';
            node.children = invertChildren(node.children);
        }
    } else if (type === 'NOR' && node.children.length > 1) {
        if (r < 0.33) {
            // NOR -> NOT(OR)
            node.type = 'OR';
            let inverted = invertSelf(cloneAST(node));
            Object.assign(node, inverted);
        } else if (r < 0.66) {
            // NOR -> AND(NOT(A), NOT(B))
            node.type = 'AND';
            node.children = invertChildren(node.children);
        }
    } else if (type === 'NOT' || (type === 'NAND' && node.children.length === 1) || (type === 'NOR' && node.children.length === 1)) {
        if (r < 0.5) {
            node.type = 'NAND';
        } else {
            node.type = 'NOR';
        }
    }
}

// Simulated Annealing AST Prover
window.runASTProver = function(baseCircuitStr, family, maxFanIn) {
    if (!baseCircuitStr || baseCircuitStr === "null") return null;
    let baseAST = JSON.parse(baseCircuitStr);
    
    // Start with default, also construct purely NAND and purely NOR baselines
    // Actually, SA will find them, but seeding helps.
    let bestAST = cloneAST(baseAST);
    bestAST = cancelDoubleNOTs(bestAST);
    let bestEval = evaluateIC_Cost(bestAST, family, maxFanIn);
    
    let currentAST = cloneAST(bestAST);
    let currentEval = bestEval;
    
    let T = 1.0;
    const T_min = 0.001;
    const alpha = 0.95;
    const iterationsPerTemp = 50;

    // Optimize
    while (T > T_min) {
        for (let i = 0; i < iterationsPerTemp; i++) {
            let candidateAST = cloneAST(currentAST);
            let nodes = getGateNodes(candidateAST);
            if (nodes.length > 0) {
                // Pick a random node and mutate
                let randNode = nodes[Math.floor(Math.random() * nodes.length)];
                mutateNode(randNode);
                // Clean up any double NOTs created
                candidateAST = cancelDoubleNOTs(candidateAST);
                // Flatten associatives (so NOT(NAND(A, B)) doesn't accidentally grow deep indefinitely)
                flattenAssociative(candidateAST);
                
                let candidateEval = evaluateIC_Cost(candidateAST, family, maxFanIn);
                let delta = candidateEval.cost - currentEval.cost;
                
                // If it uses fewer ICs, or probabilistically accept worse/equal
                // Notice we accept EQUAL with high probability early on to walk the flat IC cost space
                if (delta < 0 || Math.exp(-delta / T) > Math.random()) {
                    currentAST = candidateAST;
                    currentEval = candidateEval;
                    
                    // Track absolute best
                    if (currentEval.cost < bestEval.cost) {
                        bestAST = cloneAST(currentAST);
                        bestEval = currentEval;
                    }
                }
            }
        }
        T *= alpha;
    }
    
    // Assign labels for rendering
    assignICLabels(bestAST, family);
    
    return {
        ast: bestAST,
        cost: bestEval.cost,
        breakdown: bestEval.breakdown
    };
};
