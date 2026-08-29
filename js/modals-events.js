// Modals Logic: Examples & Learn Formats
const seeExamplesBtn = document.getElementById('see-examples-btn');
const examplesPopup = document.getElementById('examples-popup');
const examplesClose = document.getElementById('examples-close');

if (seeExamplesBtn && examplesPopup) {
    seeExamplesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        examplesPopup.style.display = 'flex';
    });
}

if (examplesClose && examplesPopup) {
    examplesClose.addEventListener('click', () => {
        examplesPopup.style.display = 'none';
    });
}

if (examplesPopup) {
    examplesPopup.addEventListener('click', (e) => {
        const exampleBtn = e.target.closest('.example-link-item');
        if (exampleBtn) {
            const expr = exampleBtn.getAttribute('data-expr');
            if (expr && elements.input) {
                elements.input.value = expr;
                // Dispatch input event to trigger expression processing natively
                elements.input.dispatchEvent(new Event('input', { bubbles: true }));
                examplesPopup.style.display = 'none';
            }
        } else if (e.target === examplesPopup) {
            examplesPopup.style.display = 'none';
        }
    });
}

const aboutPopup = document.getElementById('about-popup');
const aboutClose = document.getElementById('about-close');

if (aboutClose && aboutPopup) {
    aboutClose.addEventListener('click', () => {
        aboutPopup.style.display = 'none';
    });
}

if (aboutPopup) {
    aboutPopup.addEventListener('click', (e) => {
        const formatShortcut = e.target.closest('[data-action="about-formats"]');
        if (formatShortcut) {
            aboutPopup.style.display = 'none';
            const formatGuideEl = document.getElementById('format-guide-popup');
            if (formatGuideEl) formatGuideEl.style.display = 'flex';
        } else if (e.target === aboutPopup) {
            aboutPopup.style.display = 'none';
        }
    });
}

const learnFormatsBtn = document.getElementById('learn-formats-btn');
const formatGuidePopup = document.getElementById('format-guide-popup');
const formatGuideClose = document.getElementById('format-guide-close');

if (learnFormatsBtn && formatGuidePopup) {
    learnFormatsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        formatGuidePopup.style.display = 'flex';
    });
}

if (formatGuideClose && formatGuidePopup) {
    formatGuideClose.addEventListener('click', () => {
        formatGuidePopup.style.display = 'none';
    });
}

// Verilog Testbench Pill Toggles (Gate & Dataflow separate)
const verilogTbpills = document.querySelectorAll('.verilog-tb-toggle');
verilogTbpills.forEach(pill => {
    pill.addEventListener('click', (e) => {
        const clickedOption = e.target.closest('.pill-option');
        const currentState = pill.getAttribute('data-state');
        let newState = currentState === 'tb' ? 'no-tb' : 'tb';
        if (clickedOption) {
            newState = clickedOption.getAttribute('data-val');
        }
        
        if (newState === currentState) return; // No change
        
        // Update only THIS pill
        pill.setAttribute('data-state', newState);
        pill.querySelectorAll('.pill-option').forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('data-val') === newState);
        });
        
        const isGate = pill.id === 'gate-tb-pill';
        if (isGate) {
            _state.addTestbenchGate = (newState === 'tb');
        } else {
            _state.addTestbenchDataflow = (newState === 'tb');
        }
        
        if (wasmReady && _state.expression.trim() !== '') {
            _workerWriteCall('_refreshViewFields');
            updateFrontend();
        }
    });
});

// SOP / POS Pill Toggle



// Popups closing
elements.altClose.addEventListener('click', () => elements.altPopup.style.display = 'none');

// Expression status button — opens the share popup when the expression is valid;
// when it's an error, the native title attribute handles the tooltip automatically.
// Expression status button — handles both share popup and error feedback click
document.getElementById('expr-status-btn').addEventListener('click', function() {
    if (this.classList.contains('state-share')) {
        const origin = (window.location.origin.includes('localhost') || window.location.origin.includes('capacitor://') || window.location.origin === 'null' || window.location.origin.startsWith('file:')) 
            ? 'https://' + (window.url || 'mantiq.usamagulzar.com') 
            : window.location.origin;
        const shareUrl = origin + window.location.pathname.replace(/\/$/, '') + '/#expr=' + encodeURIComponent(elements.input.value.trim());
        const linkInput = document.getElementById('share-link-input');
        const copyBtn = document.getElementById('share-copy-btn');

        linkInput.value = shareUrl;

        // Reset copy button state
        copyBtn.classList.remove('copied');
        copyBtn.innerHTML = Icons.copy(16) + '<span>Copy</span>';

        document.getElementById('share-popup').style.display = 'flex';
    } 
    else if (this.classList.contains('state-error')) {
        const errorMsg = this.getAttribute('title');
        if (errorMsg) {
            // Trigger a clean toast notification instead of modifying panel elements
            showToast(errorMsg, 'error');
        }
    }
});

// Share popup: copy link
document.getElementById('share-copy-btn').addEventListener('click', function() {
    const linkInput = document.getElementById('share-link-input');
    navigator.clipboard.writeText(linkInput.value).then(() => {
        this.classList.add('copied');
        this.innerHTML = '<span>Copied!</span>';
        showToast('Link copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Failed to copy', 'error');
    });
});

// Share popup: close
document.getElementById('share-close').addEventListener('click', () => {
    document.getElementById('share-popup').style.display = 'none';
});

// Keyboard escape handlers
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (typeof elements !== 'undefined' && elements.altPopup) elements.altPopup.style.display = 'none';
        const sharePopup = document.getElementById('share-popup');
        if (sharePopup) sharePopup.style.display = 'none';
        const pwaPopup = document.getElementById('pwa-popup');
        if (pwaPopup) pwaPopup.style.display = 'none';
        document.querySelectorAll('.modal-overlay').forEach(el => {
            if (el.id !== 'integrity-popup') el.style.display = 'none';
        });
    }
});

// PWA Install Handlers
let deferredPrompt;
const pwaPopup = document.getElementById('pwa-popup');
const installBtn = document.getElementById('pwa-install-btn');
const iosInstructions = document.getElementById('pwa-ios-instructions');
const closeBtn = document.getElementById('pwa-close-btn');

const isIos = () => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent);
};

const isRunningStandalone = () => {
    return (window.matchMedia('(display-mode: standalone)').matches) || (window.navigator.standalone === true);
};

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!isRunningStandalone()) {
        const topInstallBtn = document.getElementById('landing-install-app-btn');
        if (topInstallBtn) topInstallBtn.style.display = 'inline-flex';
    }
});

installBtn.addEventListener('click', async () => {
    pwaPopup.style.display = 'none';
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
    }
});

window.addEventListener('load', () => {
    if (isIos() && !isRunningStandalone()) {
        const topInstallBtn = document.getElementById('landing-install-app-btn');
        if (topInstallBtn) topInstallBtn.style.display = 'inline-flex';
    }
});

closeBtn.addEventListener('click', () => {
    pwaPopup.style.display = 'none';
});

// Top-Left Landing Install App Button Handler
const landingInstallBtn = document.getElementById('landing-install-app-btn');
if (landingInstallBtn) {
    landingInstallBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                landingInstallBtn.style.display = 'none';
            }
            deferredPrompt = null;
        } else {
            if (pwaPopup) {
                pwaPopup.style.display = 'block';
                if (installBtn && !deferredPrompt) {
                    installBtn.style.display = 'none';
                }
                if (isIos() && iosInstructions) {
                    iosInstructions.style.display = 'block';
                }
            }
        }
    });
}

// Quick K-Map Presets Handler (KMAP(3), KMAP(4), KMAP(5))
document.addEventListener('click', (e) => {
    const quickBtn = e.target.closest('.quick-preset-btn');
    if (quickBtn) {
        const expr = quickBtn.getAttribute('data-expr');
        if (expr && typeof elements !== 'undefined' && elements.input) {
            elements.input.value = expr;
            elements.input.dispatchEvent(new Event('input', { bubbles: true }));

            // Switch to K-Map view automatically
            const kmapBtn = document.getElementById('btn-view-kmap');
            if (kmapBtn) {
                kmapBtn.click();
            }
        }
    }
});

// Sidebar button tooltips: show on click/touch, auto-disappear after 1.5s (1500ms)
const navTooltipTimers = new Map();

document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (btn) {
        // Destroy any existing tooltips first
        navTooltipTimers.forEach((timer, otherBtn) => {
            if (otherBtn !== btn) {
                clearTimeout(timer);
                otherBtn.classList.remove('show-tooltip');
                navTooltipTimers.delete(otherBtn);
            }
        });

        btn.classList.add('show-tooltip');
        
        if (navTooltipTimers.has(btn)) {
            clearTimeout(navTooltipTimers.get(btn));
        }

        const timer = setTimeout(() => {
            btn.classList.remove('show-tooltip');
            if (typeof btn.blur === 'function') btn.blur();
            navTooltipTimers.delete(btn);
        }, 1500);

        navTooltipTimers.set(btn, timer);
    }
});

// Footer nav modal buttons
document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const footerActions = {
        'whats-mantiq': 'about-popup',
        'why-mantiq': 'why-mantiq-popup',
        'privacy-policy': 'privacy-popup',
        'terms-of-use': 'terms-popup',
        'contact': 'contact-popup'
    };
    if (!footerActions[action]) return;
    const el = document.getElementById(footerActions[action]);
    if (el) el.style.display = 'flex';
});

// Pro Tips landing button
const proTipsBtn = document.getElementById('pro-tips-btn');
if (proTipsBtn) {
    proTipsBtn.addEventListener('click', () => {
        if (typeof openTipsModal === 'function') openTipsModal();
    });
}

// Take a Tour landing button
const landingTourBtn = document.getElementById('landing-tour-btn');
if (landingTourBtn) {
    landingTourBtn.addEventListener('click', () => {
        if (typeof TourEngine !== 'undefined' && typeof TOUR_STEPS !== 'undefined') {
            TourEngine.start(TOUR_STEPS);
        }
    });
}

// Close new modals via their X buttons
['why-mantiq-close', 'privacy-close', 'terms-close', 'contact-close'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const overlay = btn.closest('.modal-overlay');
    btn.addEventListener('click', () => { if (overlay) overlay.style.display = 'none'; });
});

// Universal backdrop click handler: clicking outside any modal box on its backdrop closes it
document.addEventListener('click', (e) => {
    if (!e.target) return;
    if (e.target.classList && e.target.classList.contains('modal-overlay') && e.target.id !== 'integrity-popup') {
        e.target.style.display = 'none';
    } else if (e.target.id === 'pwa-popup' || e.target.id === 'share-popup') {
        e.target.style.display = 'none';
    }
});

// ── Circuit Explain Modal ─────────────────────────────────────────────────────

function _openCircuitExplainModal(matches) {
    const popup = document.getElementById('circuit-explain-popup');
    if (!popup || !matches || !matches.length) return;

    const categoryColors = {
        'Parity': 'var(--accent)',
        'Arithmetic': '#f59e0b',
        'Comparator': '#10b981',
        'Majority / Voting': '#8b5cf6',
        'Data Routing': '#3b82f6',
        'Basic Gate': '#6b7280',
        'Decoder / Basic Gate': '#6b7280',
        'Encoding / Special': '#ec4899',
        'Threshold': '#f97316',
        'Special': '#64748b',
        'Parity / Comparator': 'var(--accent)',
        'Arithmetic / Majority': '#f59e0b',
    };

    // Renders one match's full detail section. When there's more than one
    // match, each block gets its own name/subtitle header inline (the fixed
    // header elements above the modal body get a generic "N circuits
    // recognized" label instead, set below).
    const renderMatch = (info, showOwnHeader) => {
        const catColor = categoryColors[info.category] || 'var(--accent)';
        const useCasesHtml = (info.useCases || []).map(u =>
            `<span class="circuit-explain-tag">${u}</span>`
        ).join('');

        return `
            ${showOwnHeader ? `
            <div class="circuit-explain-match-header">
                <div class="circuit-explain-match-name">${info.name}</div>
                ${info.subtitle ? `<div class="circuit-explain-match-subtitle">${info.subtitle}</div>` : ''}
            </div>` : ''}

            <div class="circuit-explain-category" style="color:${catColor}">
                ${info.category || ''}
            </div>

            <div class="circuit-explain-section">
                <div class="circuit-explain-label">What it does</div>
                <p class="circuit-explain-text">${info.description}</p>
            </div>

            <div class="circuit-explain-section">
                <div class="circuit-explain-label">How it works</div>
                <p class="circuit-explain-text">${info.howItWorks}</p>
            </div>

            <div class="circuit-explain-section">
                <div class="circuit-explain-label">Canonical Expression</div>
                <div class="circuit-explain-expr">${info.canonicalExpr}</div>
            </div>

            ${info.useCases && info.useCases.length ? `
            <div class="circuit-explain-section">
                <div class="circuit-explain-label">Common Use Cases</div>
                <div class="circuit-explain-tags">${useCasesHtml}</div>
            </div>` : ''}

            ${info.funFact ? `
            <div class="circuit-explain-funfact">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                <span><strong>Fun Fact:</strong> ${info.funFact}</span>
            </div>` : ''}
        `;
    };

    if (matches.length === 1) {
        const info = matches[0];
        document.getElementById('circuit-explain-name').textContent = info.name;
        document.getElementById('circuit-explain-subtitle').textContent = info.subtitle || '';
        document.getElementById('circuit-explain-body').innerHTML = renderMatch(info, false);
    } else {
        // Same truth table, multiple real circuits - e.g. a 2-var XOR gate
        // IS a Half Adder's Sum output. Show every match instead of
        // arbitrarily picking one.
        document.getElementById('circuit-explain-name').textContent = `${matches.length} Circuits Recognized`;
        document.getElementById('circuit-explain-subtitle').textContent =
            'This truth table matches multiple known circuits — same logic, different roles.';
        document.getElementById('circuit-explain-body').innerHTML = matches
            .map((info, i) => renderMatch(info, true) + (i < matches.length - 1 ? '<div class="circuit-explain-divider"></div>' : ''))
            .join('');
    }

    popup.style.display = 'flex';
}

const circuitExplainBtn = document.getElementById('circuit-explain-btn');
const circuitExplainPopup = document.getElementById('circuit-explain-popup');
const circuitExplainClose = document.getElementById('circuit-explain-close');

if (circuitExplainBtn) {
    circuitExplainBtn.addEventListener('click', () => {
        _openCircuitExplainModal(window._lastRecognizedCircuits || null);
    });
}

if (circuitExplainClose && circuitExplainPopup) {
    circuitExplainClose.addEventListener('click', () => {
        circuitExplainPopup.style.display = 'none';
    });
}
// URL Hash Sync for Modals
const HASH_MODALS = {
    '#about': 'about-popup',
    '#why': 'why-mantiq-popup',
    '#privacy': 'privacy-popup',
    '#terms': 'terms-popup',
    '#contact': 'contact-popup',
    '#guide': 'format-guide-popup'
};

const MODALS_HASH = Object.fromEntries(Object.entries(HASH_MODALS).map(([k, v]) => [v, k]));

if (HASH_MODALS[window.location.hash]) {
    const modal = document.getElementById(HASH_MODALS[window.location.hash]);
    if (modal) modal.style.display = 'flex';
}

Object.values(HASH_MODALS).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'style') {
                const isVisible = el.style.display === 'flex';
                const targetHash = MODALS_HASH[id];
                
                if (isVisible) {
                    if (window.location.hash !== targetHash) {
                        window.history.pushState(null, null, window.location.pathname + window.location.search + targetHash);
                    }
                } else {
                    if (window.location.hash === targetHash) {
                        window.history.pushState(null, null, window.location.pathname + window.location.search);
                    }
                }
            }
        });
    });
    observer.observe(el, { attributes: true, attributeFilter: ['style'] });
});

window.addEventListener('hashchange', () => {
    const hash = window.location.hash;

    if (hash.startsWith('#expr=')) {
        const expr = decodeURIComponent(hash.substring(6));
        if (typeof elements !== 'undefined' && elements.input && elements.input.value !== expr) {
            elements.input.value = expr;
            elements.input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
    
    Object.values(HASH_MODALS).forEach(id => {
        const el = document.getElementById(id);
        if (el && el.style.display === 'flex' && MODALS_HASH[id] !== hash) {
            el.style.display = 'none';
        }
    });

    if (HASH_MODALS[hash]) {
        const el = document.getElementById(HASH_MODALS[hash]);
        if (el && el.style.display !== 'flex') {
            el.style.display = 'flex';
        }
    }
});
