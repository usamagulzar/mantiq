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
        const shareUrl = window.location.origin + window.location.pathname + '#expr=' + encodeURIComponent(elements.input.value.trim());
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
        elements.altPopup.style.display = 'none';
        document.getElementById('share-popup').style.display = 'none';
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
        pwaPopup.style.display = 'block';
        installBtn.style.display = 'block';
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
        pwaPopup.style.display = 'block';
        iosInstructions.style.display = 'block';
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
