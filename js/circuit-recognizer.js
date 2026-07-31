/**
 * circuit-recognizer.js
 * Identifies a Boolean function by its minterm set + variable count
 * and returns a rich description of the known circuit.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helper: sort and stringify a minterm array into a canonical key
// ─────────────────────────────────────────────────────────────────────────────
function _mintermKey(minterms) {
    return [...minterms].sort((a, b) => a - b).join(',');
}

// ─────────────────────────────────────────────────────────────────────────────
// Build lookup table: key = "numVars:m0,m1,..." → circuit info object
// ─────────────────────────────────────────────────────────────────────────────
const _circuitDB = new Map();

function _reg(numVars, minterms, info) {
    _circuitDB.set(`${numVars}:${_mintermKey(minterms)}`, info);
}

// ── SECTION 1: PARITY ───────────────────────────────────────────────────────

// 2-var Odd Parity (XOR)
_reg(2, [1,2], {
    name: 'Odd Parity Generator / XOR Gate',
    subtitle: 'Output is 1 when inputs differ',
    category: 'Parity',
    description: 'This is a 2-input XOR gate. Its output is 1 when exactly one of the two inputs is 1 — i.e., when the number of 1s is odd.',
    howItWorks: 'The XOR operation checks for inequality. If both inputs are the same (00 or 11), output is 0. If they differ (01 or 10), output is 1. This makes it perfect for checking whether the total count of 1s is odd.',
    canonicalExpr: "A ⊕ B",
    useCases: ['Parity bit generation in serial data transmission (UART, SPI)', 'CRC (Cyclic Redundancy Check) error detection', 'Bitwise difference detection', 'Half adder SUM output'],
    funFact: 'XOR is the fundamental building block of all parity circuits. A chain of XOR gates can check the parity of any number of bits in a single logic level.'
});

// 2-var Even Parity (XNOR)
_reg(2, [0,3], {
    name: 'Even Parity / Equality Checker / XNOR Gate',
    subtitle: 'Output is 1 when inputs are equal',
    category: 'Parity / Comparator',
    description: 'This is a 2-input XNOR gate. Its output is 1 when both inputs are equal (both 0 or both 1). It detects even parity — when the number of 1s is even (0 or 2).',
    howItWorks: 'XNOR is the complement of XOR. It outputs 1 for matching inputs (00→1, 11→1) and 0 for different inputs (01→0, 10→0). This makes it an equality detector for single bits.',
    canonicalExpr: "A ⊙ B  (equivalently: (AB + A'B')",
    useCases: ['Bit-level equality comparison', 'Even parity checking', 'Detecting matching bits in error correction', '1-bit magnitude comparator (A = B output)'],
    funFact: 'XNOR is also called the "equivalence gate." Cascading N XNOR gates gives a circuit that outputs 1 only when all N inputs are equal — useful in N-bit comparators.'
});

// 3-var Odd Parity
_reg(3, [1,2,4,7], {
    name: 'Odd Parity Generator (3 inputs)',
    subtitle: 'Output is 1 when count of 1s is odd',
    category: 'Parity',
    description: 'This 3-input parity circuit outputs 1 when an odd number of its inputs are 1 (1 or 3 ones). It is implemented as a cascade of two XOR gates.',
    howItWorks: 'The XOR operation is associative: A⊕B⊕C. First compute A⊕B, then XOR the result with C. Since XOR counts 1s modulo 2, the output is 1 whenever the total number of 1-inputs is odd.',
    canonicalExpr: "A ⊕ B ⊕ C",
    useCases: ['3-bit parity generator for memory systems (ECC)', 'Full adder SUM output', 'Hamming code parity bit computation', 'Gray-to-binary LSB conversion'],
    funFact: 'The 3-variable odd parity function is the same as the Full Adder Sum output when the inputs are A, B, and Carry-in. This is why full adders use XOR at their core.'
});

// 3-var Even Parity
_reg(3, [0,3,5,6], {
    name: 'Even Parity Generator (3 inputs)',
    subtitle: 'Output is 1 when count of 1s is even',
    category: 'Parity',
    description: 'This 3-input parity circuit outputs 1 when an even number of inputs are 1 (0 or 2 ones). It is the complement of the odd parity function.',
    howItWorks: "Even parity = NOT(Odd parity). It can be built as (A⊕B⊕C)' or equivalently A⊙B⊙C — a cascade of XNOR gates checking for even count.",
    canonicalExpr: "A ⊙ B ⊙ C  (equivalently: (A ⊕ B ⊕ C)')",
    useCases: ['Even parity bit generation for data integrity', 'Error detection in memory with even-parity scheme', 'Fault detection in safety-critical systems'],
    funFact: 'Even parity was historically favored by IBM mainframes. USB uses a variant of parity called CRC, which is a polynomial extension of XOR parity checks.'
});

// 4-var Odd Parity
_reg(4, [1,2,4,7,8,11,13,14], {
    name: 'Odd Parity Generator (4 inputs)',
    subtitle: 'Output is 1 when count of 1s is odd',
    category: 'Parity',
    description: 'This 4-input parity circuit outputs 1 whenever the number of 1s among the four inputs is odd (1 or 3). It requires three cascaded XOR gates.',
    howItWorks: 'Computed as A⊕B⊕C⊕D. The result is 1 for odd Hamming weight inputs. The K-map for this function has a distinctive checkerboard pattern.',
    canonicalExpr: "A ⊕ B ⊕ C ⊕ D",
    useCases: ['4-bit parity bit generation (e.g., DRAM parity)', 'Hamming(7,4) code syndrome computation', 'Nibble-level error detection in data buses'],
    funFact: 'The K-map of any XOR function shows a perfect checkerboard pattern — no two adjacent cells ever have the same value. This is why XOR functions cannot be minimized beyond their canonical form.'
});

// 4-var Even Parity
_reg(4, [0,3,5,6,9,10,12,15], {
    name: 'Even Parity Generator (4 inputs)',
    subtitle: 'Output is 1 when count of 1s is even',
    category: 'Parity',
    description: 'This 4-input parity circuit outputs 1 when the number of 1s among the four inputs is even (0, 2, or 4). It is the complement of the 4-input odd parity.',
    howItWorks: "Built as (A⊕B⊕C⊕D)' or equivalently as a chain of XNOR gates. Even parity adds a check bit so the total number of 1s in the data word plus parity bit is always even.",
    canonicalExpr: "A ⊙ B ⊙ C ⊙ D",
    useCases: ['Even parity generation for 4-bit data nibbles', 'RAID-like XOR parity for storage arrays', 'Nibble error detection in communication protocols'],
    funFact: 'Even parity is the default in many serial protocols like RS-232. The parity bit is computed exactly with this circuit.'
});

// 5-var Odd Parity
_reg(5, [1,2,4,7,8,11,13,14,16,19,21,22,25,26,28,31], {
    name: 'Odd Parity Generator (5 inputs)',
    subtitle: 'Output is 1 when count of 1s is odd',
    category: 'Parity',
    description: 'A 5-input odd parity generator outputting 1 whenever the total number of 1s among five inputs is odd. Implemented with four cascaded XOR gates.',
    howItWorks: 'A⊕B⊕C⊕D⊕E. The XOR chain grows linearly — each additional input just needs one more gate. The 5-input version has 16 minterms out of 32, exactly half.',
    canonicalExpr: "A ⊕ B ⊕ C ⊕ D ⊕ E",
    useCases: ['5-bit Hamming code parity bit generation', 'CRC-5 error detection schemes', '32-bit word parity in early microprocessors'],
    funFact: 'For any N-input XOR function, exactly half of all possible input combinations produce a 1 output. This makes XOR a balanced Boolean function — a key property in cryptography.'
});

// 6-var Odd Parity
_reg(6, [1,2,4,7,8,11,13,14,16,19,21,22,25,26,28,31,32,35,37,38,41,42,44,47,49,50,52,55,56,59,61,62], {
    name: 'Odd Parity Generator (6 inputs)',
    subtitle: 'Output is 1 when count of 1s is odd',
    category: 'Parity',
    description: 'A 6-input odd parity generator. Output is 1 when the Hamming weight of the 6-bit input is odd. Uses five cascaded XOR gates.',
    howItWorks: 'A⊕B⊕C⊕D⊕E⊕F. As with all XOR parity circuits, exactly 32 of the 64 possible inputs produce a 1.',
    canonicalExpr: "A ⊕ B ⊕ C ⊕ D ⊕ E ⊕ F",
    useCases: ['Parity generation for 6-bit characters', 'ECC (Error-Correcting Code) partial parity', 'Checksums in data integrity verification'],
    funFact: '6-input parity trees are used inside modern CPUs for fast parity generation across data bus lines. In hardware, they are implemented as a balanced tree for minimum delay.'
});

// ── SECTION 2: ARITHMETIC ────────────────────────────────────────────────────

// Half adder Carry: AB
_reg(2, [3], {
    name: 'Half Adder — Carry Output',
    subtitle: 'Carry bit when adding two 1-bit numbers',
    category: 'Arithmetic',
    description: 'This is the Carry output of a Half Adder. It outputs 1 only when both input bits A and B are 1, producing a carry into the next bit position.',
    howItWorks: 'When adding two 1-bit numbers: 0+0=00, 0+1=01, 1+0=01, 1+1=10. The carry (the upper bit) is 1 only in the last case. This is simply an AND gate.',
    canonicalExpr: "Carry = AB",
    useCases: ['LSB carry generation in multi-bit adders', 'Overflow detection in 1-bit addition', 'Building block for ripple carry adders'],
    funFact: 'A Half Adder needs only 2 logic gates: an XOR (for Sum) and an AND (for Carry). It is the simplest arithmetic circuit and the foundation of all digital adders.'
});

// Full adder Sum (Cin=C): A⊕B⊕C = minterms {1,2,4,7}
_reg(3, [1,2,4,7], {
    name: 'Full Adder — Sum Output',
    subtitle: 'Sum bit when adding three 1-bit inputs',
    category: 'Arithmetic',
    description: 'This is the Sum output of a Full Adder (inputs: A, B, Carry-in). It outputs 1 when the total count of 1s among the three inputs is odd (1 or 3).',
    howItWorks: 'Full adder sum = A⊕B⊕Cin. Adding three bits: the sum bit is the LSB of the result (0+0+0=00, 0+0+1=01, 0+1+1=10, 1+1+1=11). The XOR chain computes this modulo-2 sum.',
    canonicalExpr: "Sum = A ⊕ B ⊕ Cᵢₙ",
    useCases: ['Ripple carry adder bit cells', 'Carry look-ahead adder sum stage', 'Binary accumulator stages', 'Multi-precision arithmetic'],
    funFact: 'Full adders are cascaded to build N-bit adders. A 32-bit ripple carry adder uses 32 full adders. Modern CPUs use carry look-ahead adders to avoid the ripple delay.'
});

// Full adder Carry-out: majority of 3 = {3,5,6,7}
_reg(3, [3,5,6,7], {
    name: 'Full Adder — Carry-Out / 3-Input Majority',
    subtitle: 'Carry when 2 or more of 3 inputs are 1',
    category: 'Arithmetic / Majority',
    description: 'This is both the Carry-out of a Full Adder and the 3-input Majority function. Output is 1 when at least 2 of the 3 inputs are 1.',
    howItWorks: 'Carry-out = AB + ACin + BCin. The carry is produced whenever any two or more of the inputs are 1. This is also the definition of the majority function: the output equals the value held by the majority of inputs.',
    canonicalExpr: "Cout = AB + AC + BC",
    useCases: ['Carry propagation in binary adders', '3-of-3 voting circuits (triple modular redundancy)', 'Fault-tolerant system design', 'Carry save adder trees'],
    funFact: 'The 3-input majority function is one of the most studied Boolean functions in circuit theory. It is self-dual, monotone, and appears as a primitive in some logic synthesis frameworks.'
});

// Half adder Sum: A⊕B — already covered by 2-var odd parity above

// ── SECTION 3: COMPARATORS ───────────────────────────────────────────────────

// A > B (2 vars): minterm {2} = AB' only
_reg(2, [2], {
    name: '1-bit Magnitude Comparator — A > B',
    subtitle: 'Output is 1 when A is greater than B',
    category: 'Comparator',
    description: 'This single-output comparator detects when the 1-bit input A is strictly greater than B. Since A and B are single bits, A > B only when A=1 and B=0.',
    howItWorks: 'For 1-bit numbers, A > B ⟺ A=1 and B=0 ⟺ AB\'. There is only one minterm because the condition is very restrictive on single bits.',
    canonicalExpr: "A > B  =  AB'",
    useCases: ['Priority encoder cell comparison', 'Building block for multi-bit magnitude comparators (74HC85)', 'Sorting network cells'],
    funFact: 'A full 2-bit magnitude comparator (comparing 2-bit numbers) requires three outputs: A>B, A=B, A<B. The equals output is XNOR, while greater/less-than are more complex.'
});

// A < B: minterm {1} = A'B
_reg(2, [1], {
    name: '1-bit Magnitude Comparator — A < B',
    subtitle: 'Output is 1 when A is less than B',
    category: 'Comparator',
    description: 'This comparator detects when A is strictly less than B for 1-bit inputs. It is 1 only when A=0 and B=1.',
    howItWorks: "A < B ⟺ A=0 and B=1 ⟺ A'B. The single minterm at position 01 (A=0,B=1) is the only case where the smaller value wins.",
    canonicalExpr: "A < B  =  A'B",
    useCases: ['Magnitude comparator sub-circuit', 'Priority logic', 'Min-finding circuits in hardware sorters'],
    funFact: 'Interestingly, A>B and A<B are complements of each other swapped: swap the inputs of one to get the other. This symmetry is exploited in efficient comparator IC designs.'
});

// A >= B: {0,2,3}
_reg(2, [0,2,3], {
    name: '1-bit Comparator — A ≥ B',
    subtitle: 'Output is 1 when A is greater than or equal to B',
    category: 'Comparator',
    description: 'Outputs 1 when the 1-bit value A is greater than or equal to B. This covers A>B and A=B cases.',
    howItWorks: "A ≥ B = A + B'. This is because A≥B fails only when A=0,B=1 (the minterm 01). So it's everything except A'B.",
    canonicalExpr: "A ≥ B  =  A + B'",
    useCases: ['Threshold comparators', 'Building blocks for multi-bit ≥ comparators', 'Priority circuits'],
    funFact: "A ≥ B is equivalent to the Boolean implication B→A (B implies A). Logic gates and logical implication share deep mathematical roots in Boolean algebra."
});

// A <= B: {0,1,3}
_reg(2, [0,1,3], {
    name: '1-bit Comparator — A ≤ B',
    subtitle: 'Output is 1 when A is less than or equal to B',
    category: 'Comparator',
    description: 'Outputs 1 when the 1-bit value A is less than or equal to B. Fails only when A=1,B=0.',
    howItWorks: "A ≤ B = A' + B. The only failing case is A=1,B=0 (minterm 10). Everything else — A=B or B>A — passes.",
    canonicalExpr: "A ≤ B  =  A' + B",
    useCases: ['Lower-bound checking', 'Comparator networks', 'Building multi-bit ≤ comparators'],
    funFact: "A ≤ B equals logical implication A→B (A implies B). Implication gates are fundamental in propositional logic and hardware description languages."
});

// ── SECTION 4: MAJORITY / MINORITY ──────────────────────────────────────────

// 3-var Minority (at most 1 one): {0,1,2,4}
_reg(3, [0,1,2,4], {
    name: '3-input Minority Function',
    subtitle: 'Output is 1 when fewer than 2 inputs are 1',
    category: 'Majority / Voting',
    description: 'The minority function outputs 1 when fewer than half the inputs are 1 — i.e., 0 or 1 inputs are high. It is the complement of the majority function.',
    howItWorks: "Minority = (Majority)'. For 3 inputs, majority requires 2+ ones, so minority requires 0 or 1 ones. It can be written as (AB+BC+AC)'.",
    canonicalExpr: "(AB + BC + AC)'",
    useCases: ['Fault detection — alarm when a minority of sensors trigger', 'Complement circuit of majority voter', 'Threshold logic'],
    funFact: 'Minority and Majority functions are dual to each other. This duality means you can implement one using the other with complemented inputs/output.'
});

// 5-var majority: output 1 when 3+ of 5 are 1
(function() {
    const m = [];
    for (let i = 0; i < 32; i++) {
        let cnt = 0;
        for (let b = 0; b < 5; b++) if ((i >> b) & 1) cnt++;
        if (cnt >= 3) m.push(i);
    }
    _reg(5, m, {
        name: '5-input Majority Function',
        subtitle: 'Output is 1 when 3 or more inputs are 1',
        category: 'Majority / Voting',
        description: 'The 5-input majority circuit outputs 1 when at least 3 of the 5 inputs are 1. It acts as a democratic vote: the majority rules.',
        howItWorks: 'The majority function is not minimizable to a simple canonical form for 5 inputs. It requires checking all combinations of 3 inputs being simultaneously high. Hardware implementations use a threshold element or a tree of 3-input majority gates.',
        canonicalExpr: "Maj(A,B,C,D,E) — 16 minterms",
        useCases: ['Triple Modular Redundancy (TMR) extended to 5 modules', 'Fault-tolerant computing (aerospace, nuclear systems)', 'Voting circuits in safety-critical PLCs'],
        funFact: 'The 5-input majority function is used inside some quantum error correction codes. Its self-dual and monotone properties make it theoretically important in complexity theory.'
    });
})();

// ── SECTION 5: MULTIPLEXERS ──────────────────────────────────────────────────

// 2:1 MUX: S,A,B variables → S'A + SB = minterms {2,3,5,7}
_reg(3, [2,3,5,7], {
    name: '2:1 Multiplexer (MUX)',
    subtitle: 'Selects between two data inputs',
    category: 'Data Routing',
    description: 'A 2-to-1 multiplexer routes one of two data inputs (A or B) to the output based on a select signal S. When S=0, output follows input A; when S=1, output follows input B.',
    howItWorks: "Output = S'A + SB. The select line S acts as a switch: complemented to gate A through, or direct to gate B through. Both AND terms are OR'd together.",
    canonicalExpr: "Y = S'A + SB",
    useCases: ['Data bus selection in CPUs', 'Clock source selection', 'Signal routing in FPGAs', 'Implementing any Boolean function with a MUX tree', 'Dynamic configuration in SoCs'],
    funFact: 'A single 2:1 MUX can implement any 2-input Boolean function by setting its data inputs to constants (0 or 1) and feeding the variable into the select line. MUX trees are universal logic elements.'
});

// ── SECTION 6: BASIC GATES (multi-input) ────────────────────────────────────

// 3-input AND: minterm {7}
_reg(3, [7], {
    name: '3-input AND Gate',
    subtitle: 'Output is 1 only when ALL inputs are 1',
    category: 'Basic Gate',
    description: 'A 3-input AND gate. Its output is 1 if and only if all three inputs A, B, and C are simultaneously 1. All other combinations give 0.',
    howItWorks: 'AND implements logical conjunction. Adding more inputs simply requires all of them to be 1. A 3-input AND can be built from two 2-input AND gates in cascade.',
    canonicalExpr: "Y = ABC",
    useCases: ['Enable/disable control with multiple conditions', 'All-1s detector for 3-bit buses', 'Coincidence circuits'],
    funFact: 'AND gates are one of the two universal primitives (along with NOT) from which all other logic functions can be built, by De Morgan\'s theorem.'
});

// 3-input OR: minterms {1,2,3,4,5,6,7}
_reg(3, [1,2,3,4,5,6,7], {
    name: '3-input OR Gate',
    subtitle: 'Output is 1 when at least one input is 1',
    category: 'Basic Gate',
    description: 'A 3-input OR gate. Its output is 1 whenever at least one of A, B, or C is 1. Only the all-zero input gives a 0 output.',
    howItWorks: 'OR implements logical disjunction. The output is 0 only when all inputs are 0. For 3 inputs: Y = A+B+C.',
    canonicalExpr: "Y = A + B + C",
    useCases: ['Fault/alarm detection — any sensor triggers alert', 'Bus contention logic', 'Interrupt prioritization'],
    funFact: 'The 3-input OR gate has the most minterms (7 of 8) of any single 3-input gate, making it a broad detector. NOR is its complement and forms a universal gate set with NOT.'
});

// 3-input NAND: complement of 3-input AND = {0,1,2,3,4,5,6}
_reg(3, [0,1,2,3,4,5,6], {
    name: '3-input NAND Gate',
    subtitle: 'Output is 0 only when ALL inputs are 1',
    category: 'Basic Gate',
    description: 'A 3-input NAND gate. Output is 0 only when all three inputs are simultaneously 1 — the complement of the AND gate.',
    howItWorks: "NAND = NOT(AND). The output is high for all input combinations except 111. Y = (ABC)'.",
    canonicalExpr: "Y = (ABC)'",
    useCases: ['Universal gate building blocks', 'Active-low enable circuits', 'Wired-AND bus implementation'],
    funFact: 'NAND is functionally complete — any Boolean function can be implemented using only NAND gates. This is why NAND-based cells are the most common in CMOS standard cell libraries.'
});

// 3-input NOR: complement of 3-input OR = {0}
_reg(3, [0], {
    name: '3-input NOR Gate',
    subtitle: 'Output is 1 only when ALL inputs are 0',
    category: 'Basic Gate',
    description: 'A 3-input NOR gate. Output is 1 only when all inputs are 0 — the complement of the OR gate. This makes it a zero/all-low detector.',
    howItWorks: "NOR = NOT(OR). The gate fires only when its output is 'low' on all lines — it detects the all-zero state. Y = (A+B+C)'.",
    canonicalExpr: "Y = (A+B+C)'",
    useCases: ['Zero-detect circuit', 'Universal gate implementation (NOR alone is complete)', 'Wired-OR bus logic', 'Static RAM bit cell logic'],
    funFact: 'Like NAND, NOR is also functionally complete. Historic early computers (e.g., Apollo Guidance Computer) used NOR gates exclusively — the entire AGC was built from a single NOR gate type.'
});

// ── SECTION 7: SPECIAL FUNCTIONS ─────────────────────────────────────────────

// 2-var: A only (buffer): {2,3}
_reg(2, [2,3], {
    name: 'Buffer / Identity (input A)',
    subtitle: 'Output follows input A, ignores B',
    category: 'Special',
    description: 'The output equals input A regardless of input B. This means B has no effect on the logic — A is the only relevant input.',
    howItWorks: "Y = A. The function is independent of B, meaning it can be simplified to just A. In a two-variable context, this indicates B is a redundant variable.",
    canonicalExpr: "Y = A",
    useCases: ['Sanity check — if you see this, B may be unconnected or irrelevant', 'Wire/buffer in a larger design'],
    funFact: 'If your simplifier produces a result that only depends on some variables and not others, those unused variables are called "irrelevant variables" or "don\'t affect" variables.'
});

// Exactly-one detector (1-of-3): {1,2,4}
_reg(3, [1,2,4], {
    name: 'Exactly-One Detector (1-of-3)',
    subtitle: 'Output is 1 when exactly one input is 1',
    category: 'Encoding / Special',
    description: 'This circuit outputs 1 when exactly one of three inputs is 1. It detects the condition where exactly one event or signal is active at a time.',
    howItWorks: "Y = A'B'C + A'BC' + AB'C'. Check each case where exactly one variable is 1 and the others are 0. This is also the minterm set for the all-unary (one-hot) encoding.",
    canonicalExpr: "Y = A'B'C + A'BC' + AB'C'",
    useCases: ['One-hot encoding validity check', 'Encoder output verification', 'Mutual exclusion detection', 'Priority arbiter output check'],
    funFact: 'One-hot encoding (exactly one bit high) is commonly used in finite state machines because it simplifies next-state logic and avoids glitches during state transitions.'
});

// At-least-one (= OR): already covered above

// All-ones detector (3-var AND): covered above

// None detector (3-var NOR): covered above

// ── SECTION 8: EVEN/ODD COUNT DETECTORS ──────────────────────────────────────

// Exactly-two of three: {3,5,6}
_reg(3, [3,5,6], {
    name: 'Exactly-Two Detector (2-of-3)',
    subtitle: 'Output is 1 when exactly two inputs are 1',
    category: 'Threshold',
    description: 'Detects the condition where exactly 2 of 3 inputs are 1. This is neither a majority (≥2) nor a minority (<2) function — it is the precise 2-of-3 case.',
    howItWorks: "Y = AB'C + ABC' + A'BC... wait: minterms 3(011), 5(101), 6(110) in ABC ordering. Y = ABC' + AB'C + A'BC. Each term captures one of the three possible 2-hot patterns.",
    canonicalExpr: "Y = ABC' + AB'C + A'BC",
    useCases: ['Quorum sensing circuits', '2-out-of-3 voting (safety systems)', 'Detecting double faults in TMR', 'Threshold logic gate emulation'],
    funFact: 'The 2-of-3 function is used in Triple Modular Redundancy (TMR) to detect when exactly 2 of 3 redundant modules agree — if only 2 agree, a fault exists in the third.'
});

// ── SECTION 9: DECODERS / SELECTOR ───────────────────────────────────────────

// 1-of-4 decoder output 0: S1'S0' = {0}: 2-var AND of complements
// minterm {0} for 2 vars
_reg(2, [0], {
    name: "2:4 Decoder — Output Y₀  (or NOR Gate / Zero Detector)",
    subtitle: 'Output is 1 only when both inputs are 0',
    category: 'Decoder / Basic Gate',
    description: "This is the Y₀ output of a 2-to-4 decoder (active when both select lines are 0). It is also a 2-input NOR gate and a zero-detector for a 2-bit input.",
    howItWorks: "Y = S₁'S₀'. Both inputs must be 0 to select output 0. Only minterm 0 (00) activates this line. Equivalent to NOT(A OR B).",
    canonicalExpr: "Y₀ = A'B'",
    useCases: ["Memory chip select (CS₀) in decoded address bus", "2-to-4 decoder first output", "2-bit zero detector"],
    funFact: "Decoders convert N-bit binary inputs to 2ᴺ one-hot outputs. A 2-to-4 decoder is the smallest practical decoder and is used extensively in memory address decoding."
});

// ── SECTION 10: SINGLE-VAR SPECIAL CASES ─────────────────────────────────────

// 1-var: identity
_reg(1, [1], {
    name: 'Buffer (Identity Gate)',
    subtitle: 'Output equals input — a wire',
    category: 'Basic Gate',
    description: 'The simplest possible circuit: output directly equals the single input. This is a buffer or wire.',
    howItWorks: 'Y = A. No logic transformation occurs. In practice, buffers are used to drive large capacitive loads or restore signal strength on long wires.',
    canonicalExpr: "Y = A",
    useCases: ['Signal buffering / fan-out driving', 'Clock distribution trees', 'Logic isolation between stages'],
    funFact: 'Buffers are among the most numerous cells in a chip. A typical microprocessor die may contain millions of buffers purely for driving clock and power-supply signals.'
});

// 1-var: NOT gate
_reg(1, [0], {
    name: 'NOT Gate (Inverter)',
    subtitle: 'Output is the complement of input',
    category: 'Basic Gate',
    description: 'The inverter is the most fundamental logic gate. It outputs the complement of its input: 0→1 and 1→0.',
    howItWorks: "Y = A'. This is the only 1-input gate (besides a buffer). In CMOS, a NOT gate is implemented as a single complementary pair (p-type and n-type transistor).",
    canonicalExpr: "Y = A'",
    useCases: ['Signal inversion throughout all digital circuits', 'Active-low signal conversion', 'Clock inversion for double-edge triggered designs', 'Ring oscillator timing circuits'],
    funFact: 'A CMOS NOT gate is the simplest CMOS circuit: one PMOS transistor in pull-up and one NMOS in pull-down. It is so efficient that a tiny smartphone chip contains billions of them.'
});

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tries to identify the given function.
 * @param {number} numVars - number of variables
 * @param {number[]} minterms - array of minterm indices (0-based)
 * @returns {object|null} - circuit info, or null if not recognized
 */
function recognizeCircuit(numVars, minterms) {
    if (!Array.isArray(minterms) || minterms.length === 0) return null;
    const key = `${numVars}:${_mintermKey(minterms)}`;
    return _circuitDB.get(key) || null;
}

if (typeof window !== 'undefined') {
    window.recognizeCircuit = recognizeCircuit;
} else if (typeof module !== 'undefined') {
    module.exports = { recognizeCircuit };
}
