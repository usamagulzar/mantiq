function generateSVGForSimulation(root, panelId = 'p', panelType = 'simOrig') {
    if (!root) return '';
    
    const levelMap = new Map();
    function computeDepth(node) {
        if (!node.isGate) {
            levelMap.set(node, 0);
            return 0;
        }
        let maxChildDepth = -1;
        if (node.children) {
            for (const child of node.children) {
                maxChildDepth = Math.max(maxChildDepth, computeDepth(child));
            }
        }
        const d = maxChildDepth + 1;
        levelMap.set(node, d);
        return d;
    }
    computeDepth(root);
    
    const depthGroups = [];
    for (const [node, d] of levelMap.entries()) {
        while (depthGroups.length <= d) depthGroups.push([]);
        depthGroups[d].push(node);
    }
    
    const spacingY = 55;
    const posMap = new Map(); 
    
    if (depthGroups[0]) {
        for (let i = 0; i < depthGroups[0].length; i++) {
            posMap.set(depthGroups[0][i], { x: 0, y: i * spacingY });
        }
    }
    
    function getNodeWidth(n) {
        if (!n.isGate) return 24;
        const numInputs = n.children ? n.children.length : 2;
        let r = 25;
        if (numInputs === 3) r = 30;
        else if (numInputs === 4) r = 35;
        else if (numInputs > 4) r = 40;
        return r + 12;
    }

    const levelX = [0];
    for (let d = 1; d < depthGroups.length; d++) {
        let maxRight = 0;
        for (const prevNode of depthGroups[d-1]) {
            const prevPos = posMap.get(prevNode);
            if (prevPos) {
                const w = getNodeWidth(prevNode);
                if (prevPos.x + w > maxRight) {
                    maxRight = prevPos.x + w;
                }
            }
        }
        levelX[d] = maxRight + 65; // 65px clearance for trace + parent input pin

        for (const node of depthGroups[d]) {
            if (node.children) {
                const numC = node.children.length;
                let targetY = 0;
                if (numC === 2) {
                    targetY = (posMap.get(node.children[0]).y + posMap.get(node.children[1]).y) / 2;
                } else if (numC === 3) {
                    targetY = posMap.get(node.children[1]).y;
                } else if (numC === 4) {
                    targetY = (posMap.get(node.children[1]).y + posMap.get(node.children[2]).y) / 2;
                } else {
                    let sumY = 0;
                    for (const child of node.children) sumY += posMap.get(child).y;
                    targetY = sumY / numC;
                }
                posMap.set(node, { x: levelX[d], y: targetY });
            }
        }
    }
    for (let d = 1; d < depthGroups.length; d++) {
        depthGroups[d].sort((a, b) => posMap.get(a).y - posMap.get(b).y);
        for (let i = 1; i < depthGroups[d].length; i++) {
            const prev = posMap.get(depthGroups[d][i-1]);
            const curr = posMap.get(depthGroups[d][i]);
            if (curr.y < prev.y + spacingY) curr.y = prev.y + spacingY;
        }
    }
    
    let contentMinX = Infinity;
    let contentMaxX = -Infinity;
    let contentMinY = Infinity;
    let contentMaxY = -Infinity;
    
    for (const [node, pos] of posMap.entries()) {
        let left = pos.x;
        let right = pos.x;
        let top = pos.y;
        let bottom = pos.y;
        
        if (!node.isGate) {
            const isConst = node.value === '0' || node.value === '1';
            if (isConst) {
                left = pos.x - 18;
                right = pos.x + 18;
                top = pos.y - 18;
                bottom = pos.y + 32;
            } else {
                left = pos.x - 65; // label at x-35, end-aligned
                right = pos.x + 24;
                top = pos.y - 24;
                bottom = pos.y + 24;
            }
        } else {
            left = pos.x - 35;
            right = getGateOutputPinRange(node.type, pos.x, node.children ? node.children.length : 2).endX;
            top = pos.y - 28;
            bottom = pos.y + 25;
        }
        
        if (node === root) {
            const rootOutX = root.isGate ? getGateOutputPinRange(root.type, pos.x, root.children ? root.children.length : 2).endX : pos.x;
            const extraOutLen = root.isGate ? 0 : 80;
            const ledX = rootOutX + 40 + extraOutLen; 
            right = ledX + 25;
            bottom = Math.max(bottom, pos.y + 35);
        }
        
        contentMinX = Math.min(contentMinX, left);
        contentMaxX = Math.max(contentMaxX, right);
        contentMinY = Math.min(contentMinY, top);
        contentMaxY = Math.max(contentMaxY, bottom);
    }
    
    const pcbPadding = 50; 
    const width = (contentMaxX - contentMinX) + pcbPadding * 2;
    const height = (contentMaxY - contentMinY) + pcbPadding * 2;
    const dx = pcbPadding - contentMinX;
    const dy = pcbPadding - contentMinY;
    
    let svgContent = `
        <defs>
            <!-- Copper pad holes -->
            <pattern id="pcb-holes-${panelId}" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="10" r="1.5" fill="#051005" opacity="0.8"/>
            </pattern>

            <!-- Metallic pin/leg -->
            <linearGradient id="metal-pin-${panelId}" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#888" />
                <stop offset="30%" stop-color="#ddd" />
                <stop offset="70%" stop-color="#555" />
                <stop offset="100%" stop-color="#333" />
            </linearGradient>

            <!-- Golden Plated Copper Pad -->
            <linearGradient id="metal-pad-${panelId}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ffe680" />
                <stop offset="50%" stop-color="#d4af37" />
                <stop offset="100%" stop-color="#aa8011" />
            </linearGradient>

            <!-- 3D Bevel & Shadow for IC plastic bodies -->
            <filter id="plastic-3d-${panelId}" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/>
                <feSpecularLighting in="blur" surfaceScale="3" specularConstant="0.8" specularExponent="25" lighting-color="#ffffff" result="specOut">
                    <fePointLight x="-2000" y="-2000" z="1000"/>
                </feSpecularLighting>
                <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut"/>
                <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litPaint"/>
                <feDropShadow dx="3" dy="5" stdDeviation="4" flood-color="#000" flood-opacity="0.8"/>
            </filter>

            <!-- 3D Bevel for Button Caps (rounded, smooth) -->
            <filter id="btn-cap-3d-${panelId}" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/>
                <feSpecularLighting in="blur" surfaceScale="4" specularConstant="1.2" specularExponent="15" lighting-color="#ffffff" result="specOut">
                    <fePointLight x="-50" y="-50" z="50"/>
                </feSpecularLighting>
                <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut"/>
                <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litPaint"/>
                <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/>
            </filter>

            <!-- Active Trace 3D (Glowing Green PCB Wire) -->
            <!-- userSpaceOnUse, not bbox-relative: a straight horizontal trace
                 (e.g. the single input into a NOT gate) has a near-zero-height
                 geometric bounding box, so a percentage-based region clips the
                 blur/glow almost entirely. Padding is sized to the panel's own
                 canvas instead of a fixed 2500x2500, so it still shrinks for
                 small/medium circuits. -->
            <filter id="trace-3d-active-${panelId}" filterUnits="userSpaceOnUse" x="${-50}" y="${-50}" width="${width + 100}" height="${height + 100}">
                <feDropShadow dx="1" dy="1.5" stdDeviation="1" flood-color="#000" flood-opacity="0.6" result="shadow"/>
                <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="blur"/>
                <feSpecularLighting in="blur" surfaceScale="2" specularConstant="1.2" specularExponent="20" lighting-color="#a5d6a7" result="specOut">
                    <fePointLight x="-500" y="-500" z="300"/>
                </feSpecularLighting>
                <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut"/>
                <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litPaint"/>
                <!-- Green Glow halo -->
                <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="glow"/>
                <feMerge>
                    <feMergeNode in="shadow"/>
                    <feMergeNode in="glow"/>
                    <feMergeNode in="litPaint"/>
                </feMerge>
            </filter>

            <!-- Inactive Trace 3D (Light Green Trace under solder mask) -->
            <filter id="trace-3d-inactive-${panelId}" filterUnits="userSpaceOnUse" x="${-50}" y="${-50}" width="${width + 100}" height="${height + 100}">
                <feDropShadow dx="1" dy="1.5" stdDeviation="1" flood-color="#000" flood-opacity="0.5"/>
                <feGaussianBlur in="SourceAlpha" stdDeviation="1" result="blur"/>
                <feSpecularLighting in="blur" surfaceScale="1.5" specularConstant="0.8" specularExponent="15" lighting-color="#ffffff" result="specOut">
                    <fePointLight x="-500" y="-500" z="300"/>
                </feSpecularLighting>
                <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specOut"/>
                <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
            </filter>

            <!-- LED ON glow -->
            <filter id="led-glow-${panelId}" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="12" result="blur"/>
                <feComposite in="SourceGraphic" in2="blur" operator="over"/>
            </filter>
            <filter id="led-glow-small-${panelId}" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="2" result="blur"/>
                <feComposite in="SourceGraphic" in2="blur" operator="over"/>
            </filter>

            <radialGradient id="led-on-${panelId}" cx="35%" cy="30%" r="65%" fx="30%" fy="25%">
                <stop offset="0%" stop-color="#ffffff"/>
                <stop offset="15%" stop-color="#ffdd44"/>
                <stop offset="45%" stop-color="#ff4400"/>
                <stop offset="100%" stop-color="#991100"/>
            </radialGradient>

            <radialGradient id="led-off-${panelId}" cx="35%" cy="30%" r="65%" fx="30%" fy="25%">
                <stop offset="0%" stop-color="#662222"/>
                <stop offset="60%" stop-color="#220000"/>
                <stop offset="100%" stop-color="#050000"/>
            </radialGradient>
            
            <!-- Silkscreen Emboss: no shadow, just a clean label -->
            <filter id="silkscreen-${panelId}">
                <feComposite in="SourceGraphic" in2="SourceGraphic" operator="over"/>
            </filter>
        </defs>

        <!-- PCB shadow: plain dark rect offset behind the board (no filter, works on all GPUs) -->
        <rect x="${10}" y="${14}" width="${width}" height="${height}" fill="#030d05" rx="14" opacity="0.65"/>
        <!-- PCB Board -->
        <rect x="0" y="0" width="${width}" height="${height}" fill="#246b3e" rx="12" />
        <rect x="0" y="0" width="${width}" height="${height}" fill="url(#pcb-holes-${panelId})" rx="12" opacity="0.4"/>
        <!-- PCB mounting holes at corners (gold ring, dark hole) -->
        <circle cx="16" cy="16" r="7" fill="url(#metal-pad-${panelId})"/>
        <circle cx="16" cy="16" r="3.5" fill="#051005"/>
        <circle cx="${width-16}" cy="16" r="7" fill="url(#metal-pad-${panelId})"/>
        <circle cx="${width-16}" cy="16" r="3.5" fill="#051005"/>
        <circle cx="16" cy="${height-16}" r="7" fill="url(#metal-pad-${panelId})"/>
        <circle cx="16" cy="${height-16}" r="3.5" fill="#051005"/>
        <circle cx="${width-16}" cy="${height-16}" r="7" fill="url(#metal-pad-${panelId})"/>
        <circle cx="${width-16}" cy="${height-16}" r="3.5" fill="#051005"/>

        <!-- Engraved Silkscreen Mantiq Logo at Top Center -->
        <g transform="translate(${width / 2 - 14}, 7) scale(1.5)" opacity="0.65" filter="url(#silkscreen-${panelId})">
            <path fill="#ffffff" d="M3.788 12.6737c-0.0088,0.1224 -0.005,1.3732 0.0097,1.426l0.6156 -0.0033c0.0221,-0.0682 0.0145,-1.4753 -0.0037,-1.5186l0.0007 1.5089 -0.6097 0.0029c0.0019,-0.1632 0.0143,-1.3679 -0.0126,-1.4159zm-1.078 0.005c-0.0297,0.0658 -0.0126,1.2314 -0.0117,1.4088l-0.6079 0.0013c0.0002,-0.175 0.0175,-1.3933 -0.0128,-1.4494 -0.0121,0.2244 0.0024,0.5039 0.0024,0.7356 0,0.1218 -0.0149,0.6455 0.0067,0.7241l0.621 -0.0032 0.0022 -1.4174zm-0.6324 -0.0392c0.0303,0.056 0.013,1.2744 0.0128,1.4494l0.6079 -0.0013c-0.0009,-0.1774 -0.0181,-1.343 0.0117,-1.4088 -0.003,-0.1508 0.0765,-0.3382 0.1485,-0.4123 0.2518,-0.2586 0.647,-0.2113 0.7963,-0.0129 0.0761,0.1011 0.1434,0.2507 0.1331,0.4202 0.0269,0.048 0.0145,1.2528 0.0126,1.4159l0.6097 -0.0029 -0.0007 -1.5089c0.0186,-0.2137 -0.0848,-0.5011 -0.1804,-0.6443 -0.2462,-0.3685 -0.8109,-0.458 -1.2147,-0.3165 -0.3198,0.1121 -0.3622,0.2426 -0.484,0.3337 -0.2498,-0.4024 -0.8652,-0.4853 -1.2352,-0.3093 -0.0762,0.0362 -0.1174,0.0599 -0.1796,0.1073 -0.0908,0.0693 -0.1141,0.1079 -0.1547,0.1371l-0.0011 -0.2828c-0.0525,-0.0174 -0.5154,-0.0149 -0.5874,-0.0047l-0.0007 2.497 0.6224 0.0009c0.0002,-0.3066 -0.0001,-0.6132 0,-0.9198 0.0001,-0.2709 -0.0295,-0.5804 0.0912,-0.807 0.2418,-0.4538 1.0174,-0.3555 0.9922,0.2699zm13.2082 -0.5564c0.2179,-0.0354 0.434,0.0435 0.5503,0.1518 0.1442,0.1343 0.2177,0.276 0.2418,0.4891 0.0506,0.4473 -0.1762,0.8119 -0.5523,0.8753 -0.9605,0.1619 -1.0936,-1.3772 -0.2397,-1.5161zm0.8076 -0.1994c-0.0788,-0.0756 -0.1165,-0.1308 -0.2456,-0.2014 -0.3311,-0.1809 -0.7693,-0.1572 -1.089,0.0023 -0.687,0.3426 -0.8243,1.2862 -0.4846,1.8685 0.2446,0.4192 0.7016,0.6352 1.2046,0.573 0.1272,-0.0157 0.248,-0.0481 0.3504,-0.1029 0.1829,-0.0977 0.1768,-0.1457 0.2474,-0.1975l0.0039 1.177 0.6138 -0.0003 0.0007 -3.4076c-0.0983,-0.001 -0.5301,-0.0104 -0.592,0.0082l-0.0094 0.2806zm-9.5037 1.1316c0.021,0.2589 -0.0225,0.4628 -0.26,0.5917 -0.1863,0.101 -0.5313,0.1238 -0.6782,-0.0287 -0.1876,-0.195 -0.1291,-0.4517 0.1161,-0.5327 0.1186,-0.0393 0.6781,-0.0442 0.8221,-0.0302zm-1.3307 -0.7001c0.052,-0.0256 0.1033,-0.0751 0.1647,-0.1102 0.1946,-0.1111 0.4166,-0.1646 0.6523,-0.143 0.3152,0.029 0.5371,0.2105 0.5089,0.5426 -0.3285,0.0482 -0.7945,-0.0667 -1.2015,0.1009 -0.3496,0.144 -0.5043,0.4722 -0.4269,0.8278 0.1235,0.5678 0.8272,0.6948 1.2864,0.5493 0.2691,-0.0852 0.3437,-0.2285 0.3833,-0.2563l-0.001 0.2696 0.5828 0.0004c0.001,-0.4204 0.0017,-0.8415 -0.0002,-1.2619 -0.002,-0.4436 -0.024,-0.7366 -0.2755,-0.9887 -0.3269,-0.3278 -1.0245,-0.3602 -1.4964,-0.1913 -0.1263,0.0452 -0.3358,0.1417 -0.4117,0.2226l0.2348 0.4382zm3.2408 1.7759c0.003,-0.4255 -0.0133,-0.867 0.0018,-1.2899 0.0072,-0.2033 0.0461,-0.3735 0.1489,-0.5037 0.2052,-0.26 0.7154,-0.2861 0.9029,-0.0159 0.1086,0.1565 0.1199,0.3022 0.1209,0.5198 0.0021,0.4306 0.0002,0.8616 0.0002,1.294l0.6208 0.0008c-0.0022,-0.3944 -0.0003,-0.79 0.001,-1.1845 0.0013,-0.3946 -0.0024,-0.6914 -0.1956,-0.9787 -0.0233,-0.0346 -0.0433,-0.063 -0.0683,-0.0862 -0.088,-0.0822 -0.097,-0.1127 -0.2537,-0.1878 -0.3295,-0.1579 -0.8603,-0.1415 -1.1596,0.0995 -0.031,0.025 -0.0525,0.0423 -0.0761,0.0673 -0.0239,0.0254 -0.0366,0.0535 -0.0692,0.068l-0.0009 -0.2987 -0.5943 0.0056 -0.0001 2.4949 0.6213 -0.0045zm2.1636 -1.9891l0.4041 0.0012c0.0132,0.0807 0.0038,0.7644 0.0039,0.9077 0.0001,0.3043 -0.0216,0.5601 0.1301,0.7889 0.3258,0.4914 1.1487,0.3478 1.3047,0.1598l-0.1579 -0.4446c-0.1365,0.0698 -0.2574,0.1491 -0.4593,0.083 -0.1527,-0.05 -0.1963,-0.1815 -0.2029,-0.3703 -0.0047,-0.1322 -0.0124,-1.0567 0.0019,-1.1267l0.6687 0.0004 -0.0005 -0.4935 -0.6707 -0.002 -0.0043 -0.6002 -0.6107 0.0044 -0.0035 0.5987 -0.4014 -0.0004 -0.0021 0.4934zm2.2857 1.9939l0.6134 -0.0038 0 -2.4972c-0.1385,0.0039 -0.5113,-0.0185 -0.6182,0.0074l0.0048 2.4937zm0.6911 -3.1809c0.0393,-0.229 -0.1276,-0.3957 -0.3201,-0.4219 -0.235,-0.032 -0.4159,0.0998 -0.4524,0.2931 -0.0935,0.4943 0.6894,0.6141 0.7726,0.1287z"/>
            <path fill="#ffffff" d="M0.9913 7.4124c0.3991,-0.0867 0.5305,0.5289 0.1272,0.6142 -0.4096,0.0866 -0.5308,-0.5264 -0.1272,-0.6142zm5.0765 -0.46c-0.1034,0.012 -0.366,0.0049 -0.4665,-0.0133 -0.2672,-0.0483 -0.4497,-0.2401 -0.4424,-0.5246 0.0117,-0.4526 0.541,-0.6685 0.7738,-0.2924 0.1366,0.2207 0.137,0.5355 0.1352,0.8303zm1.5256 0.0017c0.0313,-0.1385 0.1956,-0.3769 0.2657,-0.463 0.0531,-0.0652 0.1159,-0.1365 0.1711,-0.193 0.166,-0.1695 0.4158,-0.3582 0.6515,-0.4294 0.2233,-0.0674 0.437,-0.0211 0.5546,0.1066 0.1165,0.1266 0.1752,0.3473 0.097,0.5557 -0.2037,0.5427 -1.1894,0.4255 -1.74,0.4231zm5.3633 -1.2284c0.5999,-0.1589 0.7535,1.0013 0.1007,0.9909 -0.2377,-0.0037 -0.5342,-0.2388 -0.5359,-0.4468 -0.0015,-0.1744 0.1946,-0.4804 0.4353,-0.5441zm-11.9695 -2.0937c0.1765,-0.0388 0.3303,0.1076 0.3576,0.247 0.0374,0.1911 -0.1,0.3353 -0.2467,0.3637 -0.3902,0.0755 -0.5267,-0.5193 -0.1108,-0.6107zm2.0813 0.0354l-1.4 0.0021c-0.2581,-0.6713 -1.3067,-0.5162 -1.3066,0.2736 0.0001,0.5796 0.6098,0.8515 1.0307,0.5969 0.069,-0.0417 0.1153,-0.0872 0.1599,-0.1385 0.0549,-0.0631 0.0726,-0.1136 0.1224,-0.1864l1.3883 -0.0017 0.0052 2.2588c0.0326,-0.0314 0.0889,-0.1271 0.1191,-0.1719 0.0769,-0.1141 0.3159,-0.3918 0.4222,-0.4588l-0.0013 -3.2247c0.3467,0.0009 0.6931,-0.0006 1.0393,-0.0007 0.3272,-0.0002 0.7005,-0.021 1.0115,0.0409 0.5117,0.1019 0.9815,0.4137 1.2625,0.8222 0.3615,0.5254 0.4065,0.9271 0.4049,1.6773 -0.0007,0.3493 -0.0006,0.6987 0.0004,1.048 0.0006,0.1975 -0.0183,0.126 -0.1441,0.3728 -0.0557,0.1092 -0.1208,0.2531 -0.1525,0.3764l-0.4144 -0.0001c-0.0093,-0.3091 0.008,-0.5281 -0.0818,-0.8142 -0.0648,-0.2065 -0.1773,-0.4273 -0.3477,-0.5574 -0.2937,-0.2243 -0.6691,-0.29 -1.0291,-0.0927 -0.2866,0.1571 -0.4927,0.4496 -0.5415,0.8047 -0.0694,0.5052 0.1613,0.951 0.6353,1.1389 0.2894,0.1147 0.5113,0.0602 0.8178,0.0844 -0.0075,0.5436 -0.2276,0.9629 -0.5205,1.1872 -0.9987,0.7648 -2.4102,-0.4287 -1.7489,-1.7152 0.1503,-0.2925 0.3311,-0.4253 0.3668,-0.498l-0.3244 -0.4004c-0.1536,0.0832 -0.3867,0.4104 -0.4822,0.5698 -0.0981,0.1638 -0.1771,0.3657 -0.2251,0.5571 -0.0543,0.217 -0.0013,0.2291 -0.1196,0.2284l-0.2657 -0.0008c-0.3193,0.0003 -0.768,0.0116 -1.0595,-0.0015 -0.0333,-0.0391 -0.0861,-0.2027 -0.2788,-0.3212 -0.4378,-0.2694 -1.0554,0.0385 -1.0414,0.6152 0.0174,0.7174 0.9308,0.9226 1.2695,0.3461 0.0191,-0.0326 0.0278,-0.0761 0.0617,-0.0908l1.4104 0.0002c0.1403,0.6682 0.564,1.1906 1.202,1.4138 0.2399,0.0839 0.4998,0.1138 0.7704,0.0787 0.4584,-0.0595 0.8332,-0.3086 1.0974,-0.6456 0.2724,-0.3474 0.4087,-0.7561 0.4354,-1.3204 0.1068,-0.0164 2.5435,-0.0039 2.8322,-0.004 0.1798,-0 0.3922,0.0101 0.5681,-0.0036 0.2926,-0.0228 0.5037,-0.1065 0.6909,-0.3034 0.0299,-0.0315 0.0393,-0.0494 0.0658,-0.0756 0.3372,0.6454 1.1678,0.3689 1.4581,-0.2562 0.0847,0.0388 0.1359,0.2039 0.4893,0.3485 0.2093,0.0857 0.5017,0.0764 0.709,-0.0088 0.405,-0.1665 0.5998,-0.5169 0.5995,-1.0779l1.5353 -0.0002c0.0679,0.1224 0.13,0.1969 0.2522,0.2644 0.3839,0.2123 0.8888,-0.0557 0.888,-0.5407 -0.0006,-0.3083 -0.2068,-0.5299 -0.4503,-0.5924 -0.2406,-0.0618 -0.4233,0.0202 -0.5753,0.1681 -0.0537,0.0524 -0.0648,0.0933 -0.1112,0.1531l-1.6937 0.003c-0.0319,-0.0368 -0.0504,-0.0731 -0.0778,-0.106 -0.2381,-0.2857 -0.6161,-0.4281 -0.9997,-0.3065 -0.4042,0.1282 -0.6032,0.4206 -0.7613,0.8178 -0.1031,0.2591 -0.2886,0.897 -0.6443,0.922 -0.2699,0.0189 -0.3048,-0.2472 -0.2962,-0.4856 0.0095,-0.263 0.0199,-0.5075 0.0196,-0.7743l-0.5457 -0.0035c0.0048,0.2813 0.0163,0.7342 -0.093,0.9668 -0.0544,0.1158 -0.1427,0.2174 -0.2576,0.2715 -0.1486,0.07 -0.3074,0.0555 -0.484,0.0561 0.0176,-0.0475 0.0679,-0.1169 0.0968,-0.1785 0.0305,-0.065 0.0539,-0.129 0.0727,-0.2031 0.1946,-0.7672 -0.4311,-1.5227 -1.3343,-1.2459 -0.3018,0.0925 -0.4959,0.2661 -0.6948,0.4113 -0.0166,-0.1302 0.0027,-0.8256 -0.0054,-1.0543 -0.0302,-0.8594 -0.4392,-1.6431 -1.0735,-2.1033 -0.4323,-0.3136 -0.9248,-0.5101 -1.6074,-0.51 -0.3531,0.0001 -0.7063,-0.0007 -1.0595,-0.0002 -0.3487,0.0004 -0.7114,-0.0103 -1.0582,0.0006l-0.0022 1.5981zm2.2977 6.1304c0.1779,0.0168 0.4108,0.0034 0.5948,0.0037l2.9688 -0.0002c0.3928,-0.0006 0.7111,-0.0166 1.0777,-0.1032 0.6147,-0.1453 1.2052,-0.4761 1.5713,-0.8013 0.0535,-0.0476 0.1071,-0.0937 0.1597,-0.1387 0.0557,-0.0477 0.093,-0.0999 0.1494,-0.1484 0.2013,-0.173 0.727,-1.0478 0.727,-1.0478 0,0 -0.4181,-0.2505 -0.4181,-0.2505 0,0 -0.2553,0.3681 -0.3552,0.5022 -0.517,0.7569 -1.4148,1.326 -2.3722,1.4233 -0.3594,0.0365 -0.7778,0.0189 -1.1467,0.0187l-1.7548 -0.0002c-0.3405,-0.0012 -0.2498,-0.0417 -0.4522,0.1373 -0.0952,0.0842 -0.221,0.163 -0.3503,0.2342 -0.1962,0.1079 -0.2643,0.1081 -0.3994,0.1707zm2.173 -7.1817l1.5562 0c0.4881,-0.0003 0.7868,0.0481 1.2014,0.2038 0.6311,0.237 1.1933,0.7122 1.5515,1.2613 0.162,0.2483 0.2479,0.428 0.3543,0.7048 0.0244,0.0637 0.0637,0.2162 0.0934,0.2598 0.1656,-0.0819 0.2026,-0.1563 0.4967,-0.2187 -0.0593,-0.2992 -0.3325,-0.8189 -0.5017,-1.0664 -0.66,-0.9654 -1.7356,-1.6917 -3.0631,-1.692 -0.8328,-0.0002 -1.763,-0.0111 -2.5944,-0.0002 0.0243,0.0262 0.1778,0.1085 0.2248,0.1394 0.1879,0.1237 0.2484,0.1823 0.4078,0.3203 0.1235,0.107 0.05,0.0878 0.2732,0.0878zm3.2388 1.9698c-0.4225,0.0794 -0.3477,0.7504 0.1235,0.688 0.1748,-0.0231 0.305,-0.1954 0.2751,-0.3999 -0.0262,-0.1789 -0.1911,-0.3271 -0.3987,-0.288zm-4.8611 -0.1948c-0.4188,0.1183 -0.2602,0.8035 0.1931,0.6719 0.1492,-0.0433 0.2754,-0.2209 0.2255,-0.4238 -0.0409,-0.1663 -0.2001,-0.3098 -0.4186,-0.2481zm-0.803 0.0018c-0.4101,0.1204 -0.2744,0.7875 0.1887,0.6685 0.3985,-0.1024 0.2643,-0.8016 -0.1887,-0.6685z"/>
        </g>
    `;
    
    // --- DRAW COPPER TRACES ---
    // Each node gets a stable index (its position in posMap's iteration order,
    // which is deterministic for a given tree) so toggleSimInput can look these
    // paths back up by id later without re-walking/re-stringifying the tree.
    {
        let traceIdx = 0;
        for (const [node, pos] of posMap.entries()) {
            const myIdx = traceIdx++;
            if (node.isGate && node.children) {
                const tx = pos.x + dx;
                const ty = pos.y + dy;
                const numInputs = node.children.length;
                const portSpacing = 18;
                const startPortY = ty - ((numInputs - 1) * portSpacing) / 2;

                for (let i = 0; i < numInputs; i++) {
                    const child = node.children[i];
                    const childPos = posMap.get(child);
                    const cX = childPos.x + dx;
                    const cY = childPos.y + dy;

                    let sourceX = child.isGate ? getGateOutputPinRange(child.type, cX, child.children ? child.children.length : 2).endX : cX;
                    const targetY = startPortY + i * portSpacing;
                    // Add a tiny 0.5px vertical offset to avoid 0-height SVG bounding box clipping by filters
                    const adjustedTargetY = (cY === targetY) ? targetY + 0.5 : targetY;
                    let midX = Math.max(sourceX + 12, tx - 42);
                    if (numInputs === 4 && (i === 1 || i === 2)) {
                        midX = Math.max(sourceX + 5, tx - 58);
                    }
                    const endX = tx - 35;

                    const childState = evaluateSimLogic(child);
                    const traceId = `trace-${panelId}-${myIdx}-${i}`;

                    if (childState) {
                        svgContent += `<path id="${traceId}" d="M ${sourceX} ${cY} L ${midX} ${cY} L ${midX} ${adjustedTargetY} L ${endX} ${adjustedTargetY}" fill="none" stroke="#4ade80" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#trace-3d-active-${panelId})"/>`;
                    } else {
                        svgContent += `<path id="${traceId}" d="M ${sourceX} ${cY} L ${midX} ${cY} L ${midX} ${adjustedTargetY} L ${endX} ${adjustedTargetY}" fill="none" stroke="#154c27" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#trace-3d-inactive-${panelId})"/>`;
                    }
                }
            }
        }
    }

        // --- OUTPUT TRACE ---
    const rootPos = posMap.get(root);
    const rootX = rootPos.x + dx;
    const rootY = rootPos.y + dy;
    const finalState = evaluateSimLogic(root);
    const rootOutX = root.isGate ? getGateOutputPinRange(root.type, rootX, root.children ? root.children.length : 2).endX : rootX;
    const extraOutLen = root.isGate ? 0 : 80;
    const ledX = rootOutX + 40 + extraOutLen; 
    const ledY = rootY;
    
    // OUTPUT TRACE: runs straight horizontally to the left edge of the LED dome
    const traceEndX = ledX - 18;
    const adjustedTraceEndY = (rootY === rootY) ? rootY + 0.5 : rootY; // prevent 0-height filter clip
    
    if (finalState) {
        svgContent += `<path id="output-trace-${panelId}" d="M ${rootOutX} ${rootY} L ${traceEndX} ${adjustedTraceEndY}" fill="none" stroke="#4ade80" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#trace-3d-active-${panelId})"/>`;
    } else {
        svgContent += `<path id="output-trace-${panelId}" d="M ${rootOutX} ${rootY} L ${traceEndX} ${adjustedTraceEndY}" fill="none" stroke="#154c27" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#trace-3d-inactive-${panelId})"/>`;
    }
    
    // --- DRAW SILKSCREEN OUTLINES & SOLDER PADS ---
    for (const [node, pos] of posMap.entries()) {
        const x = pos.x + dx;
        const y = pos.y + dy;
        
        if (!node.isGate) {
            const isConst = node.value === '0' || node.value === '1';
            if (isConst) {
                svgContent += `<circle cx="${x}" cy="${y}" r="18" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.6" filter="url(#silkscreen-${panelId})"/>`;
            } else {
                svgContent += `<rect x="${x-24}" y="${y-24}" width="48" height="48" rx="7" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.6" filter="url(#silkscreen-${panelId})"/>`;
            }
        } else {
            svgContent += getSimGateSilkscreen(node.type, x, y, panelId, node.children ? node.children.length : 2);
        }
    }

    // --- DRAW COMPONENTS (ICs & Buttons) ---
    // componentIdx walks posMap in the same order/index as the copper-traces
    // loop above, so a given node gets the same index in both — toggleSimInput
    // relies on that to find the right elements by id.
    let componentIdx = 0;
    for (const [node, pos] of posMap.entries()) {
        const myIdx = componentIdx++;
        const x = pos.x + dx;
        const y = pos.y + dy;
        const state = evaluateSimLogic(node);
        
        if (!node.isGate) {
            const isConst = node.value === '0' || node.value === '1';
            
            if (isConst) {
                // VCC / GND Terminal Posts
                const label = state ? 'VCC' : 'GND';
                const color = state ? '#20c060' : '#c02020';
                svgContent += `
                    <circle cx="${x}" cy="${y}" r="16" fill="url(#metal-pin-${panelId})" filter="url(#plastic-3d-${panelId})"/>
                    <circle cx="${x}" cy="${y}" r="10" fill="#111" filter="url(#plastic-3d-${panelId})"/>
                    <text x="${x}" y="${y+32}" font-family="JetBrains Mono,monospace" font-size="12" font-weight="bold" fill="${color}" text-anchor="middle" stroke="#1A4E2C" stroke-width="3" paint-order="stroke fill">${label}</text>
                `;
            } else {
                const varName = node.value;
                // Unpressed: cap floats above center. Pressed: cap sits at center.
                const capCY = state ? y : y - 4;
                const statusDot = `<circle id="toggle-dot-${panelId}-${myIdx}" cx="${x+13}" cy="${y-13}" r="3.5" fill="${state ? '#30d158' : '#ff453a'}" filter="url(#led-glow-small-${panelId})"/>`;
                svgContent += `
                    <g class="sim-toggle" data-var="${varName}" style="cursor:pointer;">
                        <!-- Solder legs -->
                        <rect x="${x-24}" y="${y-5}" width="5" height="10" rx="1.5" fill="url(#metal-pin-${panelId})" opacity="0.85"/>
                        <rect x="${x+19}" y="${y-5}" width="5" height="10" rx="1.5" fill="url(#metal-pin-${panelId})" opacity="0.85"/>
                        <!-- Housing (fixed) -->
                        <rect x="${x-22}" y="${y-22}" width="44" height="44" rx="6" fill="#151515" filter="url(#plastic-3d-${panelId})"/>
                        <!-- Cap circle -->
                        <circle id="toggle-cap-${panelId}-${myIdx}" cx="${x}" cy="${capCY}" r="13" fill="#333" filter="url(#btn-cap-3d-${panelId})"/>
                        <!-- Status dot -->
                        ${statusDot}
                        <!-- Label -->
                        <text x="${x-35}" y="${y}" font-family="Outfit,sans-serif" font-size="18" font-weight="900" fill="#fff" text-anchor="end" dominant-baseline="central" stroke="#1A4E2C" stroke-width="3" paint-order="stroke fill">${escapeHtml(varName)}</text>
                    </g>
                `;
            }
        } else {
            // Logic Gate IC
            const numInputs = node.children ? node.children.length : 0;
            const portSpacing = 18;
            const startPortY = y - ((numInputs - 1) * portSpacing) / 2;
            
            // Draw input pins
            for (let i = 0; i < numInputs; i++) {
                const py = startPortY + i * portSpacing;
                const pinStartX = x - 35;
                const pinEndX = x - 15;
                svgContent += `<rect x="${pinStartX}" y="${py - 2}" width="${pinEndX - pinStartX}" height="4" fill="url(#metal-pin-${panelId})" filter="url(#trace-3d-inactive-${panelId})"/>`;
            }
            // Draw output pin
            const pinRange = getGateOutputPinRange(node.type, x, numInputs);
            svgContent += `<rect x="${pinRange.startX}" y="${y - 2}" width="${pinRange.endX - pinRange.startX}" height="4" fill="url(#metal-pin-${panelId})" filter="url(#trace-3d-inactive-${panelId})"/>`;
            
            // Gate body
            svgContent += getSimGateShape(node.type, x, y, panelId, numInputs);
            
            // Silkscreen type label — positioned cleanly above gate top edge regardless of input count
            let gateR = 25;
            if (numInputs === 3) gateR = 30;
            else if (numInputs === 4) gateR = 35;
            else if (numInputs > 4) gateR = 40;
            const labelY = y - gateR - 8;

            svgContent += `<text x="${x}" y="${labelY}" font-family="JetBrains Mono,monospace" font-size="12" font-weight="bold" fill="#ddd" text-anchor="middle" stroke="#1A4E2C" stroke-width="3" paint-order="stroke fill">${node.type}</text>`;
            
            // Active status LED on the IC itself (Centered on the gate body)
            const dotX = x - 5;
            if (state) {
                svgContent += `<circle id="gate-dot-${panelId}-${myIdx}" cx="${dotX}" cy="${y}" r="2.5" fill="#60ff60" filter="url(#led-glow-small-${panelId})"/>`;
            } else {
                svgContent += `<circle id="gate-dot-${panelId}-${myIdx}" cx="${dotX}" cy="${y}" r="2.5" fill="#113311"/>`;
            }
        }
    }
    
    
    // --- 3D OUTPUT LED ---
    // Silkscreen outline for LED
    svgContent += `<circle cx="${ledX}" cy="${ledY}" r="21" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.6" filter="url(#silkscreen-${panelId})"/>`;

    // LED legs removed — LED is a through-hole component, no legs shown
    
    // LED Base ring (plastic collar)
    svgContent += `<ellipse id="led-base-${panelId}" cx="${ledX}" cy="${ledY}" rx="18" ry="18" fill="${finalState ? '#882200' : '#220000'}" filter="url(#plastic-3d-${panelId})"/>`;
    
    // LED Dome
    svgContent += `<circle id="led-dome-${panelId}" cx="${ledX}" cy="${ledY}" r="15" fill="${finalState ? 'url(#led-on-' + panelId + ')' : 'url(#led-off-' + panelId + ')'}" filter="url(#btn-cap-3d-${panelId})"/>`;
    
    // Ambient glow (yellow-orange, matches real LED colour). Always present
    // (opacity toggled) rather than conditionally appended, so a state flip
    // is a single attribute write instead of an add/remove.
    svgContent += `<circle id="led-glow-circle-${panelId}" cx="${ledX}" cy="${ledY}" r="45" fill="#ffe000" opacity="${finalState ? '0.35' : '0'}" filter="url(#led-glow-${panelId})" style="pointer-events: none;"/>`;
    
    // Silkscreen Label
    svgContent += `<text x="${ledX}" y="${ledY - 26}" font-family="Outfit,sans-serif" font-size="14" font-weight="900" fill="#ffffff" text-anchor="middle" stroke="#1A4E2C" stroke-width="3" paint-order="stroke fill">OUTPUT</text>`;
    
    // Cache the layout (node positions + offsets) this render computed, keyed
    // by panelId, so toggleSimInput can recolor the existing DOM in place on
    // the next click instead of recomputing depth/positions and re-stringifying
    // the whole SVG. Safe to key by insertion-order index because posMap is a
    // Map — iterating it again later yields nodes in this exact same order.
    _simLayoutCache[panelId] = { root, posMap, dx, dy };

    // Total SVG canvas must include the shadow overhang (10px right, 14px down)
    const svgW = width + 10;
    const svgH = height + 14;
    const fitStyle = _calcFitStyle(panelType, svgW, svgH);
    return `
        <div class="zoom-content-wrapper" style="${fitStyle} will-change: transform;">
            <svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="position: absolute; left: 0; top: 0;">
                ${svgContent}
            </svg>
        </div>
    `;
}

// -----------------------------------------------------------------------------
// Drag-to-Scroll Logic for Solutions Carousel
// -----------------------------------------------------------------------------
if (typeof elements !== 'undefined' && elements.solutionsCarousel) {
    let isDown = false;
    let startX;
    let scrollLeft;

    elements.solutionsCarousel.addEventListener('mousedown', (e) => {
        isDown = true;
        elements.solutionsCarousel.style.cursor = 'grabbing';
        startX = e.pageX - elements.solutionsCarousel.offsetLeft;
        scrollLeft = elements.solutionsCarousel.scrollLeft;
    });

    elements.solutionsCarousel.addEventListener('mouseleave', () => {
        isDown = false;
        elements.solutionsCarousel.style.cursor = 'grab';
    });

    elements.solutionsCarousel.addEventListener('mouseup', () => {
        isDown = false;
        elements.solutionsCarousel.style.cursor = 'grab';
    });

    elements.solutionsCarousel.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - elements.solutionsCarousel.offsetLeft;
        const walk = (x - startX) * 2; // Scroll-fast modifier
        elements.solutionsCarousel.scrollLeft = scrollLeft - walk;
    });

    elements.solutionsCarousel.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            elements.solutionsCarousel.scrollLeft += e.deltaY;
        }
    });
}

// Blur search input when interacting with canvas (K-map/Simulation) to allow syncLoop updates
if (elements.canvas) {
    ['mousedown', 'touchstart'].forEach(evt => {
        elements.canvas.addEventListener(evt, () => {
            if (document.activeElement === elements.input) {
                elements.input.blur();
            }
        }, true);
    });
}
// (lastKMapData declared globally in ui-core.js)

