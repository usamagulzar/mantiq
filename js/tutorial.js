const TUTORIAL_STORAGE_KEY = 'mantiq_tutorial_state_v1';

// Persistence schema
function getTutorialState() {
  try {
    const raw = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Could not read tutorial state from localStorage", e);
  }
  return {
    tourCompleted: false,
    tourSkippedAt: null,
    viewsIntroduced: {
      sim: false, circuit: false, verilog: false,
      kmap: false, table: false, solution: false
    },
    kmapModesIntroduced: { normal: false, wrap: false, threeD: false },
    tipsSeenCount: 0
  };
}

function saveTutorialState(updater) {
  try {
    const state = getTutorialState();
    updater(state);
    localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Could not save tutorial state to localStorage", e);
  }
}

// Development helper
function resetTutorialState() {
  try {
    localStorage.removeItem(TUTORIAL_STORAGE_KEY);
  } catch(e) {}
}

const TOUR_STEPS = [
  {
    selector: '#expression-input',
    title: 'Let\'s watch it work',
    body: `We'll type <code>ABC + ABC'</code> for you, so you can see how mantiq reacts as soon as you enter an expression.`,
    onEnter: () => { 
        const input = document.getElementById('expression-input');
        if (input) {
            input.value = "ABC + ABC'";
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
  },
  {
    selector: '#sop-pos-pill',
    title: 'SOP and POS: two ways to write the same logic',
    body: `Every Boolean function can be written as a <b>Sum of Products</b> (an OR of AND terms) or a <b>Product of Sums</b> (an AND of OR terms). Flip this toggle and every other view updates to match.`
  },
  {
    selector: '#expr-status-btn',
    title: 'Share your work',
    body: `Once your expression is valid, this button turns into a share icon. Click it to get a link that reopens mantiq with your exact expression and solution already loaded.`,
    onLeave: () => {
        const sharePopup = document.getElementById('share-popup');
        if (sharePopup) sharePopup.style.display = 'none';
    }
  },
  {
    selector: '#btn-view-sim, #simulation-container',
    title: 'Simulation view: see logic in action',
    body: `This is a live circuit you can play with. Click any input pin to flip it between 0 and 1, and watch the signal move through the gates in real time.`,
    onEnter: () => {
        const btn = document.getElementById('btn-view-sim');
        if (btn) btn.dispatchEvent(new Event('click', { bubbles: true }));
    }
  },
  {
    selector: '#btn-view-circuit, #svg-circuit-container',
    title: 'Circuit Diagram view',
    body: `A clean schematic drawn with standard gate symbols. The original and simplified circuits sit side by side so you can compare them directly. Every panel has zoom controls and a fullscreen button.`,
    onEnter: () => {
        const btn = document.getElementById('btn-view-circuit');
        if (btn) btn.dispatchEvent(new Event('click', { bubbles: true }));
    }
  },
  {
    selector: '#btn-view-verilog, #verilog-container',
    title: 'Verilog Generator',
    body: `mantiq turns your logic function into Verilog code, in both gate level and dataflow styles.`,
    onEnter: () => {
        const btn = document.getElementById('btn-view-verilog');
        if (btn) btn.dispatchEvent(new Event('click', { bubbles: true }));
    }
  },
  {
    selector: '#btn-view-table, #truthtable-container',
    title: 'Truth Table and Waveform',
    body: `Every possible input combination, and the output it produces. You can export the truth table as a CSV file or the waveform as a PNG image.`,
    onEnter: () => {
        const btn = document.getElementById('btn-view-table');
        if (btn) btn.dispatchEvent(new Event('click', { bubbles: true }));
    }
  },
  {
    selector: '#btn-view-solution, #solution-container',
    title: 'Proof view: show your work',
    body: `A full step by step simplification using Boolean algebra laws, shown next to the tabular Quine-McCluskey method.`,
    onEnter: () => {
        const btn = document.getElementById('btn-view-solution');
        if (btn) btn.dispatchEvent(new Event('click', { bubbles: true }));
    }
  },
  {
    selector: '#btn-view-kmap, #kmap-container',
    title: 'K-Map Analysis',
    body: `A Karnaugh Map is your truth table rearranged into a grid, so cells that are next to each other only ever differ by one variable. We've changed the expression so you can see a wrap-around group too.`,
    onEnter: () => {
        const input = document.getElementById('expression-input');
        if (input) {
            input.value = "A,B,C: m(0,1,2,5,6,7)";
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const btn = document.getElementById('btn-view-kmap');
        if (btn) btn.dispatchEvent(new Event('click', { bubbles: true }));

        // Auto-select the 2nd solution once WASM worker results populate
        let attempts = 0;
        const checkInterval = setInterval(() => {
            attempts++;
            const cards = document.querySelectorAll('#solutions-carousel .solution-card');
            if (cards.length >= 2) {
                clearInterval(checkInterval);
                const secondCardText = cards[1].querySelector('.expr-text');
                if (secondCardText) secondCardText.click();
                else cards[1].click();
            } else if (attempts > 30) {
                clearInterval(checkInterval);
            }
        }, 100);
    }
  },
  {
    selector: '#btn-view-kmap, #kmap-container',
    title: 'Three view modes: Normal, Wrap, and 3D',
    body: `Let's switch to Wrap mode. Watch how the map wraps around its own edges.`,
    onEnter: () => {
        const toggleBtn = document.getElementById('kmap-view-toggle-btn');
        const wrap = document.getElementById('kmap-wrap-container');
        if (toggleBtn && wrap && wrap.style.display === 'none') {
            toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
        }
    }
  },
  {
    selector: '#kmap-wrap-container',
    title: 'Wrap view: the K-map has no real edges',
    body: `The left and right edges are actually next to each other, and so are the top and bottom. Wrap view lets you drag the map around so you can see these connections directly instead of imagining them.`
  },
  {
    selector: '#solutions-carousel',
    title: 'More than one minimal answer?',
    body: `The expression we just typed has more than one equally valid simplified form. Every valid minimal solution shows up here. Click a card to make it the active one.`,
    onEnter: () => {
        const cards = document.querySelectorAll('#solutions-carousel .solution-card');
        if (cards.length >= 2) {
            const secondCardText = cards[1].querySelector('.expr-text');
            if (secondCardText) secondCardText.click();
            else cards[1].click();
        }
    }
  },
  {
    selector: '#expression-input',
    title: 'Let\'s try a 5-variable map',
    body: `Past 4 variables, a flat K-map gets hard to read. Let's generate a 5-variable map by typing <code>A,B,C,D,E: m(5,7,13,15,21,23,29,31)</code>.`,
    onEnter: () => {
        const toggleBtn = document.getElementById('kmap-view-toggle-btn');
        const wrap = document.getElementById('kmap-wrap-container');
        if (toggleBtn && wrap && wrap.style.display !== 'none') {
             toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
        }
        const input = document.getElementById('expression-input');
        if (input) {
            input.value = "A,B,C,D,E: m(5,7,13,15,21,23,29,31)";
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
  },
  {
    selector: '#kmap-3d-container',
    title: 'Switching to 3D mode',
    body: `Now let's look at the same map in 3D.`,
    onEnter: () => {
        const toggleBtn = document.getElementById('kmap-view-toggle-btn');
        const threeD = document.getElementById('kmap-3d-container');
        if (toggleBtn && threeD && threeD.style.display === 'none') {
            toggleBtn.dispatchEvent(new Event('click', { bubbles: true }));
        }
    }
  },
  {
    selector: '#kmap-3d-container',
    title: '3D view: built for 5 or more variables',
    body: `Every cell is now a cube placed in 3D space. A group that spans rows, columns, and layers appears as one connected shape you can rotate and look at from any angle.`
  },
  {
    selector: '#theme-pill',
    title: 'You are all set up',
    body: `Switch between light and dark mode anytime. You can replay this tour, open the Concept guide, or browse Pro Tips from the Help button in the corner.`
  }
];

const CONCEPT_NOTES = {
  sop_pos: {
    title: 'Sum of Products and Product of Sums',
    body: `SOP looks at every row where the output is 1 and OR's together one AND term per row. POS looks at every row where the output is 0 and AND's together one OR term per row, with each variable flipped. Both describe the exact same function. Which one turns out shorter just depends on whether there are more 1s or more 0s in the truth table.`,
    tip: `If a function has mostly 1s, POS is usually the shorter form. If it has mostly 0s, SOP is usually shorter. Try switching the toggle both ways and compare.`
  },
  simulation: {
    title: 'What am I looking at?',
    body: `This is a working circuit. Click any input pin to set it to 0 or 1, and the signal moves through every gate in real time, lighting up the wires it travels along until the output settles. It behaves the same way a real circuit on a breadboard would, just without any actual wiring.`,
    tip: `Try setting the same inputs on the Original and Simplified panels at the same time. If the simplification is correct, both outputs always match.`
  },
  circuit_diagram: {
    title: 'Reading the schematic',
    body: `These are the same gate symbols you will see in your textbook and on exam paper. The original circuit and the simplified circuit are shown side by side so you can directly compare how many gates each one uses.`,
    tip: `Fewer gates, and fewer wires going into each gate, usually means a faster and cheaper circuit. That is the whole point of simplifying.`
  },
  verilog_gate: {
    title: 'Gate level Verilog',
    body: `This style lists out every gate one by one, using <code>and</code>, <code>or</code>, and <code>not</code>, and wires them together with named signals. It is basically the circuit diagram typed out as code, gate by gate.`,
    tip: `This style is longer to write, but it makes the exact hardware being built completely clear. Useful when a lab asks you to match a specific gate count.`
  },
  verilog_dataflow: {
    title: 'Dataflow Verilog',
    body: `This style uses one <code>assign</code> line with normal Boolean operators, applied straight to the inputs. It describes the exact same circuit as the gate level version, just written at a higher level, which is closer to how real code is usually written.`,
    tip: `Both styles simulate identically. Dataflow style is just quicker to write and easier to read for everyday logic.`
  },
  kmap: {
    title: 'What is a Karnaugh Map?',
    body: `A Karnaugh Map takes your truth table and rearranges it into a grid, ordered so that any two cells sitting next to each other, including cells on opposite edges, differ by only one variable. Once the grid is laid out this way, you can circle groups of neighboring 1s and read off a simplified term directly, without doing any algebra by hand.`,
    tip: `Always draw the biggest group you legally can. A bigger group means fewer variables left in that term.`
  },
  kmap_wrap: {
    title: 'Why the map wraps around',
    body: `The left and right edges of a K-map are actually next to each other, and so are the top and bottom edges. A group that is split across two opposite edges still counts as one single group, not two separate ones. Wrap view lets you drag the grid around so you can see those connections directly instead of picturing them in your head.`,
    tip: `On paper, remember that the four corner cells of a 4-variable map are all next to each other too. It is a common group that shows up on exams.`
  },
  kmap_3d: {
    title: 'Why there is a 3D K-Map',
    body: `Once you go past 4 variables, a flat grid is no longer enough on its own, and the usual workaround is drawing several smaller maps side by side and mentally connecting them. This 3D view instead gives every cell its own cube in space, so a group that spans rows, columns, and even separate maps shows up as one real, connected shape you can look at directly.`,
    tip: `Rotate and zoom around freely. There is no single correct angle, just use whichever view makes a group easiest to see.`
  },
  truth_table: {
    title: 'The ground truth',
    body: `This table lists every possible combination of inputs, and the output your expression produces for each one. No matter how a circuit gets built or simplified, its truth table has to match this one exactly. That is what it means for a circuit to be correct.`,
    tip: `Export the table to CSV and check it against a truth table you worked out by hand before you submit a lab.`
  },
  waveform: {
    title: 'Reading a timing diagram',
    body: `This shows the same information as the truth table, just drawn as signal levels over time instead of rows in a table. It is the same kind of view you would see on an oscilloscope or in a real simulator.`,
    tip: `Practice reading the waveform and the truth table side by side until they feel like the same information to you. That skill comes up constantly in digital logic courses.`
  },
  algebraic_proof: {
    title: 'Algebraic simplification, step by step',
    body: `This is a full derivation using real Boolean algebra laws, such as idempotence, absorption, distribution, consensus, and De Morgan's law, applied one at a time until nothing more can be simplified. It matches exactly what you would be asked to show by hand on an exam.`,
    tip: `If you get stuck simplifying by hand, work through this proof one line at a time and try to name which law justifies each step. That is the actual skill exams are testing.`
  },
  quine_mccluskey: {
    title: 'The Quine-McCluskey method',
    body: `This is a table based method rather than a visual one. Minterms that differ by exactly one bit are combined together, repeatedly, until no more combining is possible. What remains are called prime implicants, and a coverage chart then picks the smallest set of them needed to cover every required minterm.`,
    tip: `K-maps get hard to use past 4 or 5 variables. Quine-McCluskey does not have that limit, which is why it is the method most simplification software actually runs.`
  }
};

const PRO_TIPS = [
  {
    category: "Type faster",
    tips: [
      "Type <code>KMAP(3)</code>, <code>KMAP(4)</code>, or <code>KMAP(w,x,y,z)</code> to get a blank K-map ready to fill in.",
      "Type <code>d()</code> or <code>D()</code> to mark don't care values.",
      "Give your own variable names, like <code>a,b,c: m(1,2)</code>, instead of the default A, B, C."
    ]
  },
  {
    category: "Which view to use",
    tips: [
      "Open <b>Simulation</b> when you want to click inputs and watch the signal move.",
      "Open <b>Circuit Diagram</b> when you need a clean diagram for a report.",
      "Open <b>Proof</b> when you need to show your simplification work step by step."
    ]
  },
  {
    category: "K-Map modes",
    tips: [
      "Normal mode works well for small, simple maps.",
      "Switch to <b>Wrap</b> mode to see edge-to-edge groups directly, instead of imagining them.",
      "Switch to <b>3D</b> mode once you have 5 or more variables, so you are not juggling several 2D maps at once."
    ]
  },
  {
    category: "More than one right answer",
    tips: [
      "If the solutions carousel shows more than one card, that means more than one minimal form is equally correct.",
      "Click a different solution card and every other view updates to match it right away."
    ]
  },
  {
    category: "Sharing and exporting",
    tips: [
      "Click the share icon in the top bar to get a link that reopens your exact expression.",
      "Use the Export CSV button on the Truth Table view to save your table.",
      "Use the Export PNG button on the Waveform or Circuit views to save an image.",
      "Copy or save the Verilog code straight from the Verilog view for your own projects."
    ]
  }
];

// -----------------------------------------
// Learn Mode: in-depth teaching pages
// -----------------------------------------
const LEARN_CONTENT = {
  sop_pos: {
    title: 'Sum of Products and Product of Sums',
    tagline: 'Two different but equally correct ways to write any Boolean function.',
    sections: [
      {
        heading: 'What SOP and POS actually are',
        body: `Any Boolean function can be written in two standard shapes. <b>Sum of Products (SOP)</b> is an OR of AND terms, like <code>AB + A'C + BC'</code>. <b>Product of Sums (POS)</b> is an AND of OR terms, like <code>(A+B)(A'+C)(B+C')</code>. Both shapes can describe the exact same function. Neither one is more "correct" than the other, they are just two different ways to write the same truth table.`
      },
      {
        heading: 'How to build SOP from a truth table',
        list: [
          'Look at every row where the output is 1.',
          'For each of those rows, write an AND term using every variable. Use the variable as is if it is 1 in that row, and its complement if it is 0.',
          'OR all of those AND terms together.'
        ]
      },
      {
        heading: 'How to build POS from a truth table',
        list: [
          'Look at every row where the output is 0.',
          'For each of those rows, write an OR term using every variable. Use the complement if the variable is 1 in that row, and the plain variable if it is 0.',
          'AND all of those OR terms together.'
        ]
      },
      {
        heading: 'Worked example',
        body: `Take the function with output 1 for A,B,C = 001, 010, 111 and output 0 everywhere else. SOP reads the three 1-rows and gives <code>A'B'C + A'BC' + ABC</code>. POS reads the five 0-rows instead. Since there are more 0-rows than 1-rows here, POS ends up longer, so SOP is the better choice for this particular function.`
      },
      {
        heading: 'How to choose between them',
        list: [
          'Count the 1s and the 0s in the truth table.',
          'If there are fewer 1s, SOP will usually be shorter.',
          'If there are fewer 0s, POS will usually be shorter.',
          'Some circuits are naturally easier to build with OR gates feeding an AND gate (POS), or AND gates feeding an OR gate (SOP), depending on the components you have available.'
        ]
      },
      {
        heading: 'Common mistakes',
        list: [
          'Forgetting to complement the variable when building the OR term for POS.',
          'Mixing up which rows to read from, 1-rows for SOP, 0-rows for POS.',
          'Assuming one form is always simpler. It depends entirely on the specific function.'
        ]
      },
      {
        heading: 'Things to remember',
        list: [
          'SOP and POS describe the same function, they are never actually different functions.',
          'Every simplification law that works on SOP has a dual version that works on POS.',
          'De Morgan\'s law is what lets you convert between SOP and POS.'
        ]
      }
    ]
  },

  simulation: {
    title: 'Reading a Logic Simulation',
    tagline: 'Watching a circuit actually behave, one signal at a time.',
    sections: [
      {
        heading: 'What a simulation view shows you',
        body: `A simulation is a working model of the circuit. Every input has a pin you can click to set it to 0 or 1. As soon as you change an input, the new value travels through every gate connected to it, and you can watch it arrive at the output.`
      },
      {
        heading: 'How to use it well',
        list: [
          'Change one input at a time so you can see exactly what that single change affects.',
          'Watch which wires light up. A lit wire means that wire currently carries a 1.',
          'Compare the Original and Simplified circuits with the same inputs set. Their outputs should always match.'
        ]
      },
      {
        heading: 'Why this matters',
        body: `Simplifying a circuit changes how many gates it uses, but it should never change its behavior. Testing a few input combinations by hand on both circuits is a fast way to sanity check any simplification, before you trust it on paper.`
      },
      {
        heading: 'Common mistakes',
        list: [
          'Assuming a circuit is correct just because it looks simpler. Always check the output values match.',
          'Only testing one input combination. Try a few different ones, especially edge cases like all 0s or all 1s.'
        ]
      },
      {
        heading: 'Things to remember',
        list: [
          'A simulation is a sanity check, not a substitute for a full truth table comparison.',
          'If even one input combination gives different outputs between the original and simplified circuit, the simplification is wrong.'
        ]
      }
    ]
  },

  circuit_diagram: {
    title: 'Reading Circuit Diagrams',
    tagline: 'How to read the gate symbols you will see on paper and in software.',
    sections: [
      {
        heading: 'The basic gate symbols',
        list: [
          'AND gate: a flat back with a rounded front, output is 1 only when every input is 1.',
          'OR gate: a curved back with a pointed front, output is 1 when at least one input is 1.',
          'NOT gate: a triangle with a small circle (called a bubble) on the output, flips the input.',
          'NAND and NOR: an AND or OR gate with a bubble added on the output, meaning the result is inverted.',
          'XOR and XNOR: like OR and NOR but with a second curved line at the input, output is 1 only when the inputs differ (XOR) or match (XNOR).'
        ]
      },
      {
        heading: 'Why bubbles matter',
        body: `A small circle on a gate always means "invert this". A bubble on an input means that input is complemented before entering the gate, and a bubble on an output means the whole gate's result is complemented. Missing a bubble while reading a diagram is one of the most common ways students misread a circuit.`
      },
      {
        heading: 'Comparing original and simplified',
        body: `The original circuit is built directly from the unsimplified expression, so it usually has more gates and more wiring. The simplified circuit does the exact same job with fewer gates. Counting gates and counting how many inputs feed into each gate is the simplest way to measure how much you saved.`
      },
      {
        heading: 'Common mistakes',
        list: [
          'Confusing AND and OR symbols. AND has a flat back, OR has a curved back.',
          'Missing a bubble and reading NAND as AND, or NOR as OR.',
          'Losing track of which wire connects to which gate in a busy diagram. Trace one wire at a time.'
        ]
      },
      {
        heading: 'Things to remember',
        list: [
          'Fewer gates and fewer inputs per gate generally means a faster and cheaper circuit.',
          'Any circuit can be built using only NAND gates, or only NOR gates. This is why those two are called universal gates.'
        ]
      }
    ]
  },

  verilog_gate: {
    title: 'Gate Level Verilog',
    tagline: 'Describing hardware exactly as a set of connected gates.',
    sections: [
      {
        heading: 'What gate level Verilog looks like',
        body: `Gate level Verilog lists individual gate instances, such as <code>and</code>, <code>or</code>, and <code>not</code>, and connects them using named wires. It reads almost like a text version of the circuit diagram, gate by gate.`
      },
      {
        heading: 'A simple example',
        body: `For the function <code>Y = AB + C</code>, gate level Verilog would declare a wire for the AND result, instantiate an AND gate feeding that wire from A and B, then instantiate an OR gate feeding the final output from that wire and C.`
      },
      {
        heading: 'When to use this style',
        list: [
          'When an assignment specifically asks for a structural description.',
          'When you need to match an exact gate count, for example in a lab that grades on gate usage.',
          'When you want the mapping from expression to hardware to be completely explicit.'
        ]
      },
      {
        heading: 'Common mistakes',
        list: [
          'Forgetting to declare an intermediate wire before using it.',
          'Connecting a gate\'s output to more than one net without meaning to.',
          'Mixing up the order of ports when instantiating a gate.'
        ]
      },
      {
        heading: 'Things to remember',
        list: [
          'Gate level style is verbose, but it maps one to one with the circuit diagram.',
          'It behaves identically to dataflow style in simulation, only the way it is written is different.'
        ]
      }
    ]
  },

  verilog_dataflow: {
    title: 'Dataflow Verilog',
    tagline: 'Writing logic the way it is usually written in real hardware code.',
    sections: [
      {
        heading: 'What dataflow Verilog looks like',
        body: `Dataflow style uses a single <code>assign</code> statement with normal Boolean operators applied directly to the input signals, instead of listing out individual gates. For example, <code>assign Y = (A & B) | C;</code> describes the same circuit as the gate level example above, in one line.`
      },
      {
        heading: 'Why it is used so often',
        list: [
          'It is much shorter to write and easier to read at a glance.',
          'It matches how digital designers usually think about combinational logic.',
          'It simulates identically to the gate level version.'
        ]
      },
      {
        heading: 'Common mistakes',
        list: [
          'Using assignment operators meant for other contexts instead of a plain <code>assign</code> statement.',
          'Forgetting parentheses, which can change how operators are grouped.',
          'Mixing up bitwise operators like <code>&amp;</code> and logical operators like <code>&amp;&amp;</code>.'
        ]
      },
      {
        heading: 'Things to remember',
        list: [
          'Dataflow style describes the same hardware as gate level style, just at a higher level of abstraction.',
          'Both styles are fine for combinational logic. Dataflow is usually preferred just because it is faster to write and review.'
        ]
      }
    ]
  },

  kmap: {
    title: 'Karnaugh Maps',
    tagline: 'A grid based method for simplifying logic without doing algebra by hand.',
    sections: [
      {
        heading: 'What a K-map actually is',
        body: `A Karnaugh Map takes every row of a truth table and places it into a grid, arranged so that any two cells sitting right next to each other differ by exactly one variable. This special ordering is called Gray code. Once the grid is arranged this way, cells that are next to each other can always be combined, because changing just one variable is exactly what Boolean simplification rules like Adjacency are built to do.`
      },
      {
        heading: 'How to build one',
        list: [
          'Decide how many variables your function has. 2 variables gives a 2x2 grid, 3 gives a 2x4 grid, 4 gives a 4x4 grid.',
          'Label the rows and columns using Gray code order, meaning only one bit changes between adjacent labels. For 2 bits that order is 00, 01, 11, 10.',
          'Fill in a 1 in every cell where the function\'s output is 1, a 0 where it is 0, and an X where the output does not matter.'
        ]
      },
      {
        heading: 'How to group cells',
        list: [
          'Circle groups of adjacent 1s (and X\'s if they help) in sizes that are powers of two: 1, 2, 4, 8, and so on.',
          'A group must be a rectangle or a square, it cannot be an irregular shape.',
          'Always make each group as large as legally possible. A bigger group removes more variables from the resulting term.',
          'Keep grouping until every 1 in the map is covered by at least one group.',
          'Cells on opposite edges of the map are still adjacent to each other, so groups are allowed to wrap around an edge.'
        ]
      },
      {
        heading: 'Turning a group into a term',
        body: `For each group, look at which variables stay the same across every cell in that group, and which ones change. Drop every variable that changes. What is left, written as an AND of the variables that stayed constant (using the complement where the variable was 0), is the simplified term for that group. OR all of the group terms together to get the final simplified expression.`
      },
      {
        heading: 'Worked example',
        body: `Take a 3-variable map for A,B,C with minterms 0, 1, 2, 5, 6, 7. Grouping minterms 0, 1, 2, and using the wrap around edge with more 1s nearby, along with 5, 6, 7, produces two groups. One group covers cells where A is 0, giving the term A'. The other covers where B and C are equal, giving the term BC + B'C' after further grouping, or more directly the groups combine to a compact expression such as A'B' + BC + AB C depending on exactly how the 1s are grouped. The key habit is always the same: find the biggest legal rectangles first, then read off which variables stayed constant in each one.`
      },
      {
        heading: 'Handling don\'t cares'
        , body: `A don't care cell means the function's output for that input combination is never actually used, so you are free to treat it as either a 0 or a 1, whichever helps you make a bigger group. You are never required to include a don't care in a group, only use it when it helps.`
      },
      {
        heading: 'Why the wrap around edges exist',
        body: `A K-map is really shaped like a donut rather than a flat sheet, since the left and right edges are adjacent, and so are the top and bottom edges. This is why the app's Wrap view exists, it lets you drag the grid around so those edge connections become visible instead of something you have to picture in your head. Corner cells of a 4-variable map are a classic example, all four corners are adjacent to each other even though they look far apart on a flat grid.`
      },
      {
        heading: 'Going past 4 variables',
        body: `A flat 2D grid stops being practical once you go past 4 variables, since you would need to draw several 4-variable maps side by side and mentally connect them. The 3D view in this app solves that by giving every cell its own cube in 3D space, so a group that spans rows, columns, and separate layers appears as a single connected shape you can rotate and inspect directly.`
      },
      {
        heading: 'Common mistakes',
        list: [
          'Grouping cells that are diagonal to each other. Diagonal cells are never adjacent on a K-map.',
          'Making a group that is not shaped like a rectangle or a square.',
          'Forgetting that opposite edges of the map are adjacent, and missing a valid wrap-around group.',
          'Making a group smaller than it needs to be, which leaves extra variables in the term that could have been removed.',
          'Leaving a 1 uncovered because it was assumed to already be part of another group.'
        ]
      },
      {
        heading: 'Things to remember',
        list: [
          'Every group size must be a power of two: 1, 2, 4, 8, 16, and so on.',
          'Bigger groups always produce shorter terms, so always look for the largest legal group first.',
          'A cell can belong to more than one group at the same time if that helps cover the map with fewer, bigger groups.',
          'K-maps become hard to use past 5 or 6 variables. Quine-McCluskey is the method to use beyond that.'
        ]
      }
    ]
  },

  truth_table: {
    title: 'Truth Tables',
    tagline: 'The complete, unambiguous definition of what a function does.',
    sections: [
      {
        heading: 'What a truth table is',
        body: `A truth table lists every single possible combination of input values, and the output the function produces for each one. For n variables, there are always exactly 2 to the power of n rows, since each variable can independently be 0 or 1.`
      },
      {
        heading: 'How to build one by hand',
        list: [
          'List every input combination in order, usually counting up in binary from all 0s to all 1s.',
          'For each row, substitute those values into the expression and work out the result.',
          'Write that result in the output column for that row.'
        ]
      },
      {
        heading: 'Why it is the ground truth',
        body: `No matter how a circuit is built, or how much it gets simplified, its truth table must always match exactly. If even a single row differs, the simplification is wrong. This is why the truth table is the most reliable way to check your own work.`
      },
      {
        heading: 'Common mistakes',
        list: [
          'Missing a row, especially in tables with 4 or more variables.',
          'Making an arithmetic slip when evaluating a single row, which then throws off later comparisons.',
          'Listing input combinations out of order, which makes the table harder to read and compare against a K-map.'
        ]
      },
      {
        heading: 'Things to remember',
        list: [
          'A truth table with n variables always has exactly 2 to the power of n rows.',
          'Every K-map, circuit, and simplified expression for a given function must all agree with the same truth table.'
        ]
      }
    ]
  },

  waveform: {
    title: 'Waveform (Timing) Diagrams',
    tagline: 'The same truth table, drawn as signals changing over time.',
    sections: [
      {
        heading: 'What a waveform diagram shows',
        body: `Instead of listing input combinations as rows in a table, a waveform diagram draws each signal as a horizontal line that steps up to a high level for 1 and down to a low level for 0, moving left to right as time passes. It is the same view you would see on an oscilloscope or in real simulation software.`
      },
      {
        heading: 'How to read one',
        list: [
          'Pick a single point in time, a vertical slice through the diagram.',
          'Read the level of every signal at that exact point, high or low.',
          'That combination of levels is exactly one row of the truth table.'
        ]
      },
      {
        heading: 'Why this skill matters',
        body: `Real hardware debugging almost always happens by looking at waveforms in a simulator, not a truth table. Getting comfortable translating between the two views is one of the most useful habits you can build early on.`
      },
      {
        heading: 'Common mistakes',
        list: [
          'Reading the wrong vertical slice and mixing up two different time points.',
          'Forgetting that a signal changing partway across the diagram usually lines up with an input actually changing at that moment.'
        ]
      },
      {
        heading: 'Things to remember',
        list: [
          'A waveform diagram and a truth table always contain exactly the same information, just presented differently.',
          'Practicing this translation both ways is a core digital logic design skill.'
        ]
      }
    ]
  },

  algebraic_proof: {
    title: 'Algebraic Simplification',
    tagline: 'Simplifying an expression by hand, one law at a time.',
    sections: [
      {
        heading: 'What this process is',
        body: `Algebraic simplification means starting from an expression and applying Boolean algebra laws one at a time, replacing part of the expression with an equivalent but shorter form, until no law can be applied anymore. Each step must use a real, named law, not just a guess.`
      },
      {
        heading: 'The core laws to know',
        list: [
          '<b>Identity:</b> A + 0 = A and A · 1 = A.',
          '<b>Annihilation:</b> A + 1 = 1 and A · 0 = 0.',
          '<b>Idempotence:</b> A + A = A and A · A = A.',
          '<b>Complementarity:</b> A + A\' = 1 and A · A\' = 0.',
          '<b>Distributive:</b> A(B + C) = AB + AC.',
          '<b>Absorption:</b> A + AB = A.',
          '<b>Adjacency (combining):</b> AB + AB\' = A.',
          '<b>De Morgan\'s:</b> (A + B)\' = A\'B\' and (AB)\' = A\' + B\'.',
          '<b>Consensus:</b> AB + A\'C + BC = AB + A\'C, since BC is redundant once AB and A\'C are both present.'
        ]
      },
      {
        heading: 'A general approach',
        list: [
          'Look first for any term that can be removed outright using Identity, Annihilation, or Idempotence.',
          'Look for pairs of terms that differ by only one variable, these can usually be combined with Adjacency.',
          'Look for a longer term that is already fully covered by a shorter one, that is Absorption.',
          'If you get stuck, try adding a redundant consensus term. It sounds like it makes things longer, but it can unlock a further simplification.',
          'Use De Morgan\'s law whenever you need to push a negation through parentheses.'
        ]
      },
      {
        heading: 'Worked example',
        body: `Simplify <code>AB + AB' + A'C</code>. The first two terms differ only in B, so Adjacency combines them into A, giving <code>A + A'C</code>. Now Absorption applies in its extended form: A + A'C is the same as A + C, because whenever A is false, A'C reduces to just C, and whenever A is true, the whole thing is already true. So the final simplified answer is <code>A + C</code>.`
      },
      {
        heading: 'Common mistakes',
        list: [
          'Applying a law incorrectly, such as trying to factor terms that do not actually share a common variable.',
          'Stopping too early, before checking whether Absorption or Adjacency could combine anything further.',
          'Forgetting to flip the AND/OR operator when applying De Morgan\'s law.',
          'Not writing down which law justified each step, which makes it hard to check your own work, and is usually required on exams anyway.'
        ]
      },
      {
        heading: 'Things to remember',
        list: [
          'Every step must be justified by a real law. If you cannot name the law, double check the step.',
          'There is often more than one valid path to the same minimal answer.',
          'If you get stuck, working backward from a known minimal form, one law at a time, can help you find the forward path.'
        ]
      }
    ]
  },

  quine_mccluskey: {
    title: 'The Quine-McCluskey Method',
    tagline: 'A table based simplification method that works no matter how many variables you have.',
    sections: [
      {
        heading: 'Why this method exists',
        body: `K-maps are great for small functions, but they become hard to draw and read once you go past 4 or 5 variables. Quine-McCluskey solves the same simplification problem using tables and bit comparisons instead of a grid, so it works at any size, which is also why it is the method most simplification software actually implements.`
      },
      {
        heading: 'Step 1: Group minterms by number of 1s',
        body: `Write out every minterm (every row where the output is 1, plus any don't cares) in binary. Group these binary values by how many 1 bits they contain. This grouping matters because two minterms can only ever be combined if they differ by exactly one bit, and minterms that differ by one bit always have popcounts (1-bit counts) that differ by exactly one.`
      },
      {
        heading: 'Step 2: Combine adjacent groups',
        list: [
          'Compare every minterm in one group to every minterm in the next group up.',
          'If two minterms differ in exactly one bit position, combine them into a new term, replacing that differing bit with a dash to mean "either value".',
          'Mark both original minterms as combined, since they are no longer needed on their own.',
          'Repeat this process on the new, combined terms, forming the next table, until no more combinations are possible.'
        ]
      },
      {
        heading: 'Step 3: Identify prime implicants',
        body: `Any term that was never combined with anything else, in any round, is called a prime implicant. These are the largest valid groupings available, the same idea as the biggest legal rectangle on a K-map.`
      },
      {
        heading: 'Step 4: Build a prime implicant chart',
        body: `Make a chart with the prime implicants as rows and the original minterms as columns. Mark a cell whenever a prime implicant covers that minterm. A minterm covered by only one prime implicant means that prime implicant is essential, it must be included in the final answer.`
      },
      {
        heading: 'Step 5: Select the minimal cover',
        body: `Include every essential prime implicant first. Then check which minterms are still not covered, and pick the smallest additional set of prime implicants needed to cover them. OR all of the selected prime implicants together for the final simplified expression.`
      },
      {
        heading: 'Worked example',
        body: `For minterms 0, 1, 2, 5, 6, 7 over A, B, C: minterm 0 (000) and 1 (001) differ by one bit and combine into 00-. Minterm 0 and 2 (010) combine into 0-0. Minterm 1 and 5 (101) combine into -01. Minterm 5 and 7 (111) combine into 1-1. Minterm 6 and 7 combine into 11-. This process continues until no more pairs can combine, at which point the surviving terms are checked against the prime implicant chart to find the minimal covering set.`
      },
      {
        heading: 'Common mistakes',
        list: [
          'Trying to combine two minterms that differ by more than one bit. Only exactly one bit difference is allowed.',
          'Forgetting to carry a term forward as a prime implicant when it fails to combine with anything.',
          'Missing an essential prime implicant in the coverage chart, which leaves a minterm uncovered in the final answer.',
          'Picking more prime implicants than necessary once the essential ones already cover everything.'
        ]
      },
      {
        heading: 'Things to remember',
        list: [
          'Quine-McCluskey always finds a truly minimal answer, it does not depend on guesswork the way grouping by eye sometimes can.',
          'It works identically whether you have 3 variables or 12, which is why it is the method used inside real simplification software.',
          'A dash in a combined term means that variable has been eliminated, exactly like dropping a variable in a K-map group.'
        ]
      }
    ]
  }
};

// -----------------------------------------
// Tour Engine
// -----------------------------------------
const TourEngine = {
  steps: [],
  index: 0,
  active: false,
  overlayEl: null,
  tooltipEl: null,
  conditionInterval: null,
  conditionMet: true,

  start(steps) {
    this.steps = steps;
    this.index = 0;
    this.active = true;
    document.body.classList.add('tour-active');
    this._buildOverlay();
    this._show(0);
  },

  next() { 
      if (!this.conditionMet) return;
      const currentStep = this.steps[this.index];
      if (currentStep && currentStep.onLeave) currentStep.onLeave();

      if (this.index < this.steps.length - 1) {
          this._show(++this.index);
      } else {
          this.end(true); 
      }
  },
  back() { 
      const currentStep = this.steps[this.index];
      if (currentStep && currentStep.onLeave) currentStep.onLeave();

      if (this.index > 0) this._show(--this.index); 
  },
  skip() { this.end(false); },

  end(completed) {
    this.active = false;
    document.body.classList.remove('tour-active');
    this._destroyOverlay();
    if (this.conditionInterval) {
        clearInterval(this.conditionInterval);
        this.conditionInterval = null;
    }
    const currentStep = this.steps[this.index];
    if (currentStep && currentStep.onLeave) currentStep.onLeave();

    const currentTargets = document.querySelectorAll(currentStep?.selector || '.tour-target');
    currentTargets.forEach(t => t.classList.remove('tour-target'));

    saveTutorialState(s => {
      s.tourCompleted = completed || s.tourCompleted;
      if (!completed) s.tourSkippedAt = Date.now();
    });
  },

  _show(i) {
    this.userDragged = false;
    const allTourTargets = document.querySelectorAll('.tour-target');
    allTourTargets.forEach(t => t.classList.remove('tour-target'));
    
    if (this.conditionInterval) {
        clearInterval(this.conditionInterval);
        this.conditionInterval = null;
    }
    if (this.visibilityInterval) {
        clearInterval(this.visibilityInterval);
        this.visibilityInterval = null;
    }

    const step = this.steps[i];
    if (step.onEnter) step.onEnter();
    
    const targets = document.querySelectorAll(step.selector);
    if (!targets.length) {
        // graceful skip if a view is hidden on this device
        if (i < this.steps.length - 1) {
            this.index++;
            this._show(this.index);
        } else {
            this.end(true);
        }
        return; 
    }
    
    const SECTION_TO_NAV = {
        '#simulation-container': '#btn-view-sim',
        '#svg-circuit-container': '#btn-view-circuit',
        '#circuit-container': '#btn-view-circuit',
        '#verilog-container': '#btn-view-verilog',
        '#truthtable-container': '#btn-view-table',
        '#solution-container': '#btn-view-solution',
        '#kmap-container': '#btn-view-kmap',
        '#kmap-wrap-container': '#btn-view-kmap',
        '#kmap-3d-container': '#btn-view-kmap'
    };

    targets.forEach(t => {
        t.classList.add('tour-target');
        for (const [secSel, navSel] of Object.entries(SECTION_TO_NAV)) {
            if (t.matches(secSel) || (t.querySelector && t.querySelector(secSel))) {
                const navBtn = document.querySelector(navSel);
                if (navBtn) navBtn.classList.add('tour-target');
            }
        }
    });
    const target = targets[targets.length - 1];

    // Function to render once target is visible
    const renderWhenReady = () => {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        
        this.conditionMet = !step.condition;
        if (step.condition && !step.condition()) {
            this.conditionInterval = setInterval(() => {
                if (!this.active) return;
                if (step.condition()) {
                    this.conditionMet = true;
                    clearInterval(this.conditionInterval);
                    this.conditionInterval = null;
                    const rect = target.getBoundingClientRect();
                    this._positionSpotlight(rect);
                    this._renderTooltip(step, rect);
                }
            }, 200);
        }

        setTimeout(() => {
          if (!this.active) return;
          const rect = target.getBoundingClientRect();
          this._positionSpotlight(rect);
          this._renderTooltip(step, rect);
        }, 300);
    };

    // Wait for the target to actually become visible (e.g. async worker results)
    if (target.getBoundingClientRect().height === 0) {
        this.visibilityInterval = setInterval(() => {
            if (!this.active) return;
            if (target.getBoundingClientRect().height !== 0) {
                clearInterval(this.visibilityInterval);
                this.visibilityInterval = null;
                renderWhenReady();
            }
        }, 100);
    } else {
        renderWhenReady();
    }
  },

  _buildOverlay() {
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'tour-overlay';
    document.body.appendChild(this.overlayEl);
    
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'tour-tooltip';
    this.tooltipEl.setAttribute('role', 'dialog');
    this.tooltipEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.tooltipEl);
    
    this.navEl = document.createElement('div');
    this.navEl.className = 'tour-bottom-nav';
    document.body.appendChild(this.navEl);
    
    this._boundUpdate = () => {
        if (!this.active) return;
        const targets = document.querySelectorAll(this.steps[this.index]?.selector);
        if (targets.length) {
            const target = targets[targets.length - 1];
            const rect = target.getBoundingClientRect();
            this._positionSpotlight(rect);
            this._renderTooltip(this.steps[this.index], rect);
        }
    };
    window.addEventListener('resize', this._boundUpdate);
    window.addEventListener('scroll', this._boundUpdate, true);

    // Draggable Tooltip Logic
    let isDragging = false, startX, startY, initialLeft, initialTop;
    this._onDragStart = (e) => {
        if (e.target.closest('#tour-drag-handle')) {
            if (e.type === 'touchstart' && e.cancelable) e.preventDefault();
            isDragging = true;
            this.userDragged = true;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            startX = clientX;
            startY = clientY;
            initialLeft = parseInt(this.tooltipEl.style.left || 0, 10);
            initialTop = parseInt(this.tooltipEl.style.top || 0, 10);
            document.body.style.userSelect = 'none';
        }
    };
    this._onDragMove = (e) => {
        if (!isDragging) return;
        if (e.cancelable) e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const dx = clientX - startX;
        const dy = clientY - startY;
        this.tooltipEl.style.left = `${initialLeft + dx}px`;
        this.tooltipEl.style.top = `${initialTop + dy}px`;
    };
    this._onDragEnd = () => {
        isDragging = false;
        document.body.style.userSelect = '';
    };
    window.addEventListener('mousedown', this._onDragStart);
    window.addEventListener('mousemove', this._onDragMove, { passive: false });
    window.addEventListener('mouseup', this._onDragEnd);
    window.addEventListener('touchstart', this._onDragStart, { passive: false });
    window.addEventListener('touchmove', this._onDragMove, { passive: false });
    window.addEventListener('touchend', this._onDragEnd);
  },

  _destroyOverlay() {
    if (this.overlayEl) this.overlayEl.remove();
    if (this.tooltipEl) this.tooltipEl.remove();
    if (this.navEl) this.navEl.remove();
    window.removeEventListener('resize', this._boundUpdate);
    window.removeEventListener('scroll', this._boundUpdate, true);
    window.removeEventListener('mousedown', this._onDragStart);
    window.removeEventListener('mousemove', this._onDragMove);
    window.removeEventListener('mouseup', this._onDragEnd);
    window.removeEventListener('touchstart', this._onDragStart);
    window.removeEventListener('touchmove', this._onDragMove);
    window.removeEventListener('touchend', this._onDragEnd);
  },

  _positionSpotlight(rect) {
    const p = 6; 
    this.overlayEl.style.boxShadow = '0 0 0 9999px rgba(0,0,0,.6)';
    this.overlayEl.style.width = `${rect.width + p*2}px`;
    this.overlayEl.style.height = `${rect.height + p*2}px`;
    this.overlayEl.style.top = `${rect.top - p}px`;
    this.overlayEl.style.left = `${rect.left - p}px`;
    this.overlayEl.style.borderRadius = '8px';
  },

  _renderTooltip(step, rect) {
    let dots = '';
    for(let i=0; i<this.steps.length; i++) {
        dots += `<span class="${i === this.index ? 'active' : ''}"></span>`;
    }
    
    const isLast = this.index === this.steps.length - 1;
    const btnStyle = this.conditionMet ? 'background: var(--accent); color: #fff; padding: 6px 16px; cursor: pointer; border: none; border-radius: 4px; font-weight: 500;' : 'background: var(--bg-secondary); color: var(--text-muted); padding: 6px 16px; cursor: not-allowed; border: 1px solid var(--border); border-radius: 4px; font-weight: 500;';
    const linkStyle = 'background: transparent; color: var(--text-secondary); border: none; cursor: pointer; padding: 6px 12px; font-weight: 500;';
    
    this.tooltipEl.innerHTML = `
      <div style="cursor: grab; padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid var(--border);" id="tour-drag-handle">
          <h3 style="margin: 0; font-size: 16px; user-select: none;">${step.title}</h3>
      </div>
      <p style="margin: 0; font-size: 14px; line-height: 1.4; color: var(--text-secondary);">${step.body}</p>
    `;

    this.navEl.innerHTML = `
        <div class="tour-progress-dots" style="flex-shrink: 0; margin-right: 16px;">${dots}</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="tour-btn-skip" style="${linkStyle}">Skip</button>
            ${this.index > 0 ? `<button class="tour-btn-back" style="${linkStyle}">Back</button>` : ''}
            <button class="tour-btn-next" style="${btnStyle}" ${!this.conditionMet ? 'disabled' : ''}>${isLast ? 'Finish' : 'Next'}</button>
        </div>
    `;

    const btnSkip = this.navEl.querySelector('.tour-btn-skip');
    if (btnSkip) btnSkip.onclick = () => TourEngine.skip();

    const btnBack = this.navEl.querySelector('.tour-btn-back');
    if (btnBack) btnBack.onclick = () => TourEngine.back();

    const btnNext = this.navEl.querySelector('.tour-btn-next');
    if (btnNext) btnNext.onclick = () => {
        if (this.conditionMet) TourEngine.next();
    };

    if (this.userDragged) return;

    const ttRect = this.tooltipEl.getBoundingClientRect();
    let top = rect.bottom + 16;
    let left = rect.left;
    
    if (top + ttRect.height > window.innerHeight - 60) {
        top = rect.top - ttRect.height - 16;
    }
    if (top < 16) {
        top = 16;
    }
    if (left + ttRect.width > window.innerWidth) {
        left = window.innerWidth - ttRect.width - 16;
    }
    if (left < 16) {
        left = 16;
    }
    
    this.tooltipEl.style.top = `${top}px`;
    this.tooltipEl.style.left = `${left}px`;
  }
};

// -----------------------------------------
// Concept Popovers
// -----------------------------------------
let currentPopover = null;

function showConceptPopover(btnEl, conceptKey) {
  closeConceptPopover();
  
  let note = CONCEPT_NOTES[conceptKey];
  
  if (conceptKey === 'kmap' && window.kmapViewMode) {
      if (window.kmapViewMode === 'wrap') {
          note = {
              title: note.title + ' + ' + CONCEPT_NOTES.kmap_wrap.title,
              body: note.body + '<br><br><b>Wrap Mode:</b> ' + CONCEPT_NOTES.kmap_wrap.body,
              tip: CONCEPT_NOTES.kmap_wrap.tip
          };
      } else if (window.kmapViewMode === 'threeD') {
          note = {
              title: note.title + ' + ' + CONCEPT_NOTES.kmap_3d.title,
              body: note.body + '<br><br><b>3D Mode:</b> ' + CONCEPT_NOTES.kmap_3d.body,
              tip: CONCEPT_NOTES.kmap_3d.tip
          };
      }
  }
  
  if (!note) return;

  const learnKey = LEARN_CONTENT[conceptKey] ? conceptKey : null;

  const popover = document.createElement('div');
  popover.className = 'concept-popover';
  popover.setAttribute('role', 'dialog');
  popover.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
        <h4 style="margin: 0; font-size: 15px; color: var(--text-primary);">${note.title}</h4>
        <button class="popover-close-btn" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; font-size: 18px; line-height: 1;">&times;</button>
    </div>
    <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 1.5; color: var(--text-secondary);">${note.body}</p>
    <div style="background: var(--accent-light); padding: 8px; border-radius: 4px; font-size: 12px; border-left: 2px solid var(--accent); color: var(--text-primary);">
        <b>Pro Tip:</b> ${note.tip}
    </div>
    ${learnKey ? `<button class="concept-popover-learn-btn" data-learn-key="${learnKey}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        <span>Learn more about this</span>
    </button>` : ''}
  `;

  document.body.appendChild(popover);
  currentPopover = popover;

  const popoverClose = popover.querySelector('.popover-close-btn');
  if (popoverClose) popoverClose.onclick = closeConceptPopover;

  const learnBtn = popover.querySelector('.concept-popover-learn-btn');
  if (learnBtn) {
      learnBtn.addEventListener('click', () => {
          closeConceptPopover();
          openLearnPage(learnBtn.getAttribute('data-learn-key'));
      });
  }

  const rect = btnEl.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  
  let top = rect.bottom + 8;
  let left = rect.left;
  
  if (top + popRect.height > window.innerHeight) top = rect.top - popRect.height - 8;
  if (left + popRect.width > window.innerWidth) left = window.innerWidth - popRect.width - 16;
  
  popover.style.top = `${top}px`;
  popover.style.left = `${Math.max(16, left)}px`;

  setTimeout(() => {
    document.addEventListener('click', closePopoverOutside);
  }, 10);
}

function closeConceptPopover() {
  if (currentPopover) {
      currentPopover.remove();
      currentPopover = null;
  }
  document.removeEventListener('click', closePopoverOutside);
}

function closePopoverOutside(e) {
    if (currentPopover && !currentPopover.contains(e.target)) {
        closeConceptPopover();
    }
}

// -----------------------------------------
// Learn Page: full, in-depth concept teaching
// -----------------------------------------
function renderLearnSection(sec) {
    let inner = '';
    if (sec.body) inner += `<p>${sec.body}</p>`;
    if (sec.list) {
        inner += `<ul>${sec.list.map(item => `<li>${item}</li>`).join('')}</ul>`;
    }
    return `
        <div class="learn-section">
            <h4>${sec.heading}</h4>
            ${inner}
        </div>
    `;
}

function openLearnPage(conceptKey) {
    const content = LEARN_CONTENT[conceptKey];
    if (!content) return;

    const existing = document.getElementById('learn-page-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'learn-page-modal';
    overlay.className = 'modal-overlay learn-page-overlay';
    overlay.style.display = 'flex';

    const sectionsHtml = content.sections.map(renderLearnSection).join('');

    overlay.innerHTML = `
        <div class="modal format-modal learn-page-modal">
            <div class="modal-header">
                <div class="modal-header-info">
                    <div class="modal-header-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                    </div>
                    <div class="modal-header-text">
                        <h2>${content.title}</h2>
                        <div class="modal-subtitle">${content.tagline}</div>
                    </div>
                </div>
                <button class="modal-close" id="learn-page-close">&times;</button>
            </div>
            <div class="modal-body format-guide-body learn-page-body">
                ${sectionsHtml}
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    const closeBtn = overlay.querySelector('#learn-page-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
    const keyHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', keyHandler);
        }
    };
    document.addEventListener('keydown', keyHandler);
}

// -----------------------------------------
// Setup & Wiring
// -----------------------------------------
function initTutorialSystem() {
    // 1. Wire Help FAB
    const fabBtn = document.getElementById('help-fab-btn');
    const fabMenu = document.getElementById('help-fab-menu');
    if (fabBtn && fabMenu) {
        fabBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fabMenu.style.display = fabMenu.style.display === 'none' ? 'flex' : 'none';
        });
        document.addEventListener('click', (e) => {
            if (!fabMenu.contains(e.target)) fabMenu.style.display = 'none';
        });
        
        fabMenu.addEventListener('click', (e) => {
            const action = e.target.getAttribute('data-action');
            if (!action) return;
            fabMenu.style.display = 'none';
            
            if (action === 'tour') TourEngine.start(TOUR_STEPS);
            if (action === 'tips') openTipsModal();
            if (action === 'formats') {
                const el = document.getElementById('format-guide-popup');
                if (el) el.style.display = 'flex';
            }
            if (action === 'examples') {
                const el = document.getElementById('examples-popup');
                if (el) el.style.display = 'flex';
            }
            if (action === 'about') {
                const el = document.getElementById('about-popup');
                if (el) el.style.display = 'flex';
            }
        });
    }

    // 2. Build Tips Modal
    buildTipsModal();

    // 3. Delegate Concept Popover clicks
    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('.concept-info-btn');
        if (btn) {
            const concept = btn.getAttribute('data-concept');
            if (concept) showConceptPopover(btn, concept);
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeConceptPopover();
    });

    // 4. Try Auto-Start Tour
    const checkAutoStart = setInterval(() => {
        if (window.wasmReady && document.getElementById('app-root') && document.getElementById('app-root').classList.contains('landing')) {
            const state = getTutorialState();
            if (!state.tourCompleted && !state.tourSkippedAt) {
                setTimeout(() => TourEngine.start(TOUR_STEPS), 800);
            }
            clearInterval(checkAutoStart);
        } else if (window.wasmReady) {
            clearInterval(checkAutoStart);
        }
    }, 500);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTutorialSystem);
} else {
    initTutorialSystem();
}

// Tips Modal builder
function buildTipsModal() {
    const existingModal = document.getElementById('tips-popup');
    if (existingModal) return;

    const overlay = document.createElement('div');
    overlay.id = 'tips-popup';
    overlay.className = 'modal-overlay';
    overlay.style.display = 'none';

    let listHtml = '';
    PRO_TIPS.forEach(cat => {
        listHtml += `
            <div class="tips-category">
                <h4>${cat.category}</h4>
                ${cat.tips.map(tip => `<div class="tips-modal-item" style="font-size: 13px; color: var(--text-primary);">${tip}</div>`).join('')}
            </div>
        `;
    });

    overlay.innerHTML = `
        <div class="modal format-modal">
            <div class="modal-header">
                <div class="modal-header-info">
                    <div class="modal-header-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M15 14c.2-.8.5-1.4 1.2-2A6 6 0 1 0 7.8 12c.7.6 1 1.2 1.2 2"/><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="21" x2="14" y2="21"/></svg>
                    </div>
                    <div class="modal-header-text">
                        <h2>Pro Tips</h2>
                        <div class="modal-subtitle">Work faster and smarter</div>
                    </div>
                </div>
                <button class="modal-close tips-close-btn">&times;</button>
            </div>
            <div class="modal-body format-guide-body tips-modal-list">
                ${listHtml}
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    const tipsClose = overlay.querySelector('.tips-close-btn');
    if (tipsClose) tipsClose.onclick = () => { overlay.style.display = 'none'; };
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.style.display = 'none';
    });
}

function openTipsModal() {
    const modal = document.getElementById('tips-popup');
    if (modal) modal.style.display = 'flex';
}
