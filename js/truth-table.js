// Truth Table & Waveform Pure HTML/JS implementation
// ==========================================================================

function renderTruthTableAndWaveform() {
    if (!wasmReady) return;
    
    const jsonStr = queryWasmString('mantiq_getTruthTableJSON');
    const table = document.getElementById('html-truth-table');
    const waveCanvas = document.getElementById('waveform-canvas');
    
    if (!jsonStr) {
        lastTruthTableData = null;
        if (table) table.innerHTML = '<thead><tr><th>No expression processed yet</th></tr></thead>';
        if (waveCanvas) {
            const ctx = waveCanvas.getContext('2d');
            ctx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
        }
        return;
    }
    
    try {
        lastTruthTableData = JSON.parse(jsonStr);
    } catch (e) {
        console.error("Failed to parse Truth Table JSON:", e);
        return;
    }
    
    renderHTMLTruthTable(lastTruthTableData);
    renderHTMLWaveform(lastTruthTableData);
}

// (lastTruthTableData declared globally in ui-core.js)

function renderHTMLTruthTable(data) {
    const table = document.getElementById('html-truth-table');
    if (!table) return;
    
    let html = '<thead><tr>';
    // Headers
    data.variables.forEach(v => {
        html += `<th>${escapeHtml(v)}</th>`;
    });
    html += '<th class="tt-out-col">Out</th>';
    html += '<th>Minterm</th>';
    html += '</tr></thead><tbody>';
    
    // Rows
    data.rows.forEach(row => {
        html += `<tr data-row="${row.row}">`;
        row.inputs.forEach(bit => {
            html += `<td>${bit ? '1' : '0'}</td>`;
        });
        
        let outVal = row.output;
        let cellClass = 'output-cell';
        if (outVal === '1') cellClass += ' out-one';
        else if (outVal === '0') cellClass += ' out-zero';
        else cellClass += ' out-dontcare';
        
        html += `<td class="${cellClass}" data-row-idx="${row.row}">${outVal}</td>`;
        html += `<td style="color: var(--text-muted)">m${row.row}</td>`;
        html += '</tr>';
    });
    
    html += '</tbody>';
    table.innerHTML = html;
}

function renderHTMLWaveform(data) {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const wrapper = canvas.parentElement;
    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    const pad = 20;
    const labelWidth = 60;
    
    const numVars = data.variables.length;
    const numSignals = numVars + 1;
    
    // Calculate required height to prevent vertical squishing (min 40px per signal)
    const minSlotH = 40; 
    const requiredAreaH = numSignals * minSlotH;
    const baseAreaH = rect.height - pad * 2;
    // Desktop always fits exactly inside the panel it's given - growing
    // past it just meant a scrollbar. Mobile keeps the old floor since its
    // screens are tight enough that sub-40px signal rows get unreadable.
    const isMobileWave = window.innerWidth <= 900;
    const availableH = isMobileWave ? Math.max(baseAreaH, requiredAreaH) : baseAreaH;
    const totalHeight = availableH + pad * 2;
    
    // Fit canvas horizontally to wrapper, but allow vertical expansion
    canvas.width = rect.width * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = totalHeight + 'px';
    
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, totalHeight);
    
    // Calculate heights dynamically based on the safe available height
    const slotH = availableH / numSignals;
    const signalH = slotH * 0.65; // Waveform line takes up 65% of slot height
    const signalGap = slotH * 0.35;
    
    // Reverted horizontal logic: perfectly fit to the screen width
    const areaW = rect.width - pad * 2 - labelWidth;
    const stepWidth = areaW / data.rows.length;
    const areaX = pad + labelWidth;
    const areaY = pad;
    
    // Draw background grid lines
    const isDark = document.body.classList.contains('dark-mode') || !document.body.classList.contains('light-mode');
    const borderClr = getComputedStyle(document.body).getPropertyValue('--border').trim() || (isDark ? '#334155' : '#e2e8f0');
    ctx.strokeStyle = borderClr + '44'; // Subtle grid opacity
    ctx.lineWidth = 1;
    for (let i = 0; i <= data.rows.length; i++) {
        const gridX = areaX + i * stepWidth;
        ctx.beginPath();
        ctx.moveTo(gridX, areaY);
        ctx.lineTo(gridX, areaY + numSignals * slotH - signalGap);
        ctx.stroke();
    }
    
    // Draw variables waveforms
    ctx.font = '600 14px Outfit, sans-serif';
    ctx.textBaseline = 'middle';
    
    const textPrimary = isDark ? '#ffffff' : (getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#0f172a');
    
    for (let v = 0; v < numVars; v++) {
        const y = areaY + v * slotH;
        const varName = data.variables[v];
        
        ctx.font = '600 14px Outfit, sans-serif';
        ctx.fillStyle = textPrimary;
        ctx.textAlign = 'left';
        ctx.fillText(varName, pad, y + signalH / 2);
        
        drawSignalLine(ctx, areaX, y, stepWidth, signalH, data.rows.length, numVars, v, true, data, isDark, textPrimary);
    }
    
    // Draw output waveform
    const outY = areaY + numVars * slotH;
    const successClr = getComputedStyle(document.body).getPropertyValue('--success').trim() || (isDark ? '#10b981' : '#059669');
    ctx.font = '600 14px Outfit, sans-serif';
    ctx.fillStyle = successClr;
    ctx.textAlign = 'left';
    ctx.fillText('Out', pad, outY + signalH / 2);
    drawSignalLine(ctx, areaX, outY, stepWidth, signalH, data.rows.length, numVars, -1, false, data, isDark, textPrimary);
}

function drawSignalLine(ctx, x, y, stepWidth, height, numRows, numVars, varIndex, isInput, data, isDark, textPrimary) {
    const lowY = y + height - 5;
    const highY = y + 5;
    const midY = y + height / 2;
    const thickness = 2;
    
    const themeAccent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#2563eb';
    const themeSuccess = getComputedStyle(document.body).getPropertyValue('--success').trim() || '#10b981';
    
    ctx.strokeStyle = isInput ? themeAccent : themeSuccess;
    ctx.lineWidth = thickness;
    
    let prevValue = -1;
    ctx.beginPath();
    
    for (let i = 0; i < numRows; i++) {
        let value;
        if (isInput) {
            value = (i >> (numVars - 1 - varIndex)) & 1;
        } else {
            const outStr = data.rows[i].simplified_output || data.rows[i].output;
            value = (outStr === '1') ? 1 : 0;
        }
        
        const stepX = x + i * stepWidth;
        const currentY = (value === 1) ? highY : (value === 0.5 ? midY : lowY);
        
        if (prevValue !== -1 && prevValue !== value) {
            ctx.lineTo(stepX, currentY);
        } else if (prevValue === -1) {
            ctx.moveTo(stepX, currentY);
        }
        
        ctx.lineTo(stepX + stepWidth, currentY);
        prevValue = value;
    }
    ctx.stroke();
}

function initExportButtons() {
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const exportWaveBtn = document.getElementById('export-wave-btn');
    const table = document.getElementById('html-truth-table');
    
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            const jsonStr = queryWasmString('mantiq_getTruthTableJSON');
            if (jsonStr) {
                try {
                    const data = JSON.parse(jsonStr);
                    let csvContent = "data:text/csv;charset=utf-8,";
                    const headers = [...data.variables, "Output"].join(",");
                    csvContent += headers + "\r\n";
                    data.rows.forEach(row => {
                        const inputs = row.inputs.map(b => b ? "1" : "0");
                        csvContent += [...inputs, row.output].join(",") + "\r\n";
                    });
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", `mantiq_truthtable_${new Date().toISOString().slice(0,19).replace(/[-T:]/g,"_")}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    showToast('CSV exported successfully!');
                } catch (e) {
                    showToast('Failed to export CSV', 'error');
                }
            }
        });
    }
    
    if (exportWaveBtn) {
        exportWaveBtn.addEventListener('click', () => {
            const canvas = document.getElementById('waveform-canvas');
            if (canvas) {
                try {
                    // Create a temporary canvas to apply a solid background
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = canvas.width;
                    tempCanvas.height = canvas.height;
                    const ctx = tempCanvas.getContext('2d');
                    
                    // Fetch the current theme's panel background color
                    const rootStyle = getComputedStyle(document.documentElement);
                    const bgColor = rootStyle.getPropertyValue('--bg-secondary').trim() || '#ffffff';
                    
                    // Fill background and draw original waveform on top
                    ctx.fillStyle = bgColor;
                    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                    ctx.drawImage(canvas, 0, 0);
                    
                    const link = document.createElement("a");
                    link.setAttribute("href", tempCanvas.toDataURL('image/png'));
                    link.setAttribute("download", `mantiq_waveform_${new Date().toISOString().slice(0,19).replace(/[-T:]/g,"_")}.png`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    showToast('Waveform exported as PNG!');
                } catch (e) {
                    showToast('Failed to export PNG', 'error');
                }
            }
        });
    }

    if (table) {
        table.addEventListener('click', (e) => {
            if (e.target.classList.contains('output-cell')) {
                const rowIdx = parseInt(e.target.getAttribute('data-row-idx'));
                toggleTruthTableOutput(rowIdx);
            }
        });
    }

    // Hook up Verilog Buttons
    const copyGateBtn = document.getElementById('copy-gate-btn');
    const saveGateBtn = document.getElementById('save-gate-btn');
    const copyDataflowBtn = document.getElementById('copy-dataflow-btn');
    const saveDataflowBtn = document.getElementById('save-dataflow-btn');

    if (copyGateBtn) {
        copyGateBtn.addEventListener('click', () => {
            const code = queryWasmString('mantiq_getVerilogCode', [1], ['number']);
            if (code) {
                navigator.clipboard.writeText(code).then(() => {
                    showToast('Gate Level Verilog copied!');
                }).catch(() => {
                    showToast('Failed to copy code', 'error');
                });
            }
        });
    }

    if (saveGateBtn) {
        saveGateBtn.addEventListener('click', () => {
            const code = queryWasmString('mantiq_getVerilogCode', [1], ['number']);
            if (code) {
                saveCodeToFile(code, 'gate_level');
            }
        });
    }

    if (copyDataflowBtn) {
        copyDataflowBtn.addEventListener('click', () => {
            const code = queryWasmString('mantiq_getVerilogCode', [0], ['number']);
            if (code) {
                navigator.clipboard.writeText(code).then(() => {
                    showToast('Dataflow Verilog copied!');
                }).catch(() => {
                    showToast('Failed to copy code', 'error');
                });
            }
        });
    }

    if (saveDataflowBtn) {
        saveDataflowBtn.addEventListener('click', () => {
            const code = queryWasmString('mantiq_getVerilogCode', [0], ['number']);
            if (code) {
                saveCodeToFile(code, 'dataflow');
            }
        });
    }

    // Hook up Zoom Buttons
    const zoomInOrig = document.getElementById('zoom-in-orig');
    const zoomOutOrig = document.getElementById('zoom-out-orig');
    const zoomFsOrig  = document.getElementById('zoom-fullscreen-orig');
    const zoomInSimp = document.getElementById('zoom-in-simp');
    const zoomOutSimp = document.getElementById('zoom-out-simp');
    const zoomFsSimp  = document.getElementById('zoom-fullscreen-simp');

    if (zoomInOrig) zoomInOrig.addEventListener('click', () => {
        const container = document.getElementById('original-circuit-scroll');
        if (container) {
            const rect = container.getBoundingClientRect();
            zoomAtPoint('orig', 1.15, rect.width / 2, rect.height / 2, true);
        }
    });
    if (zoomOutOrig) zoomOutOrig.addEventListener('click', () => {
        const container = document.getElementById('original-circuit-scroll');
        if (container) {
            const rect = container.getBoundingClientRect();
            zoomAtPoint('orig', 0.85, rect.width / 2, rect.height / 2, true);
        }
    });
    if (zoomFsOrig) zoomFsOrig.addEventListener('click', () => {
        openPanelFullscreen('orig');
    });

    if (zoomInSimp) zoomInSimp.addEventListener('click', () => {
        const container = document.getElementById('simplified-circuit-scroll');
        if (container) {
            const rect = container.getBoundingClientRect();
            zoomAtPoint('simp', 1.15, rect.width / 2, rect.height / 2, true);
        }
    });
    if (zoomOutSimp) zoomOutSimp.addEventListener('click', () => {
        const container = document.getElementById('simplified-circuit-scroll');
        if (container) {
            const rect = container.getBoundingClientRect();
            zoomAtPoint('simp', 0.85, rect.width / 2, rect.height / 2, true);
        }
    });
    if (zoomFsSimp) zoomFsSimp.addEventListener('click', () => {
        openPanelFullscreen('simp');
    });
}

function saveCodeToFile(code, prefix) {
    const filename = `mantiq_${prefix}_${new Date().toISOString().slice(0,19).replace(/[-T:]/g,"_")}.v`;
    const blob = new Blob([code], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Saved ${filename}`);
}

function toggleTruthTableOutput(rowIdx) {
    if (!lastTruthTableData) return;
    
    const row = lastTruthTableData.rows[rowIdx];
    if (!row) return;
    
    // Cycle: 0 -> 1 -> X -> 0
    if (row.output === '0') {
        row.output = '1';
    } else if (row.output === '1') {
        row.output = 'X';
    } else {
        row.output = '0';
    }
    
    const vars = lastTruthTableData.variables;
const minterms = [];
    const dontCares = [];
    
    lastTruthTableData.rows.forEach(r => {
        if (r.output === '1') minterms.push(r.row);
        else if (r.output === 'X') dontCares.push(r.row);
    });

    // Sort numerically
    minterms.sort((a, b) => a - b);
    dontCares.sort((a, b) => a - b);
    
    let newExpr = "";
    if (vars && vars.length > 0) {
        newExpr += vars.join(",") + ": ";
    }
    if (minterms.length > 0) {
        newExpr += "m(" + minterms.join(",") + ")";
    }
    if (dontCares.length > 0) {
        if (minterms.length > 0) newExpr += " ";
        newExpr += "d(" + dontCares.join(",") + ")";
    }
    if (minterms.length === 0 && dontCares.length === 0) {
        newExpr += "m()";
    }

    elements.input.value = newExpr;
    elements.input.dispatchEvent(new Event('input', { bubbles: true }));
}

initExportButtons();

function formatVerilogHTML(code) {
    if (!code) {
        return '<div class="code-line"><span class="line-num">1</span><span class="line-text">// No code generated</span></div>';
    }
    const lines = code.split('\n');
    return lines.map((line, idx) => {
        return `<div class="code-line"><span class="line-num">${idx + 1}</span><span class="line-text">${escapeHtml(line)}</span></div>`;
    }).join('');
}

function renderVerilogHTML() {
    if (!wasmReady) return;
    
    const gateCode = queryWasmString('mantiq_getVerilogCode', [1], ['number']);
    const dataflowCode = queryWasmString('mantiq_getVerilogCode', [0], ['number']);
    
    const gateElem = document.getElementById('gate-level-code');
    const dataflowElem = document.getElementById('dataflow-code');
    
    if (gateElem) gateElem.innerHTML = formatVerilogHTML(gateCode);
    if (dataflowElem) dataflowElem.innerHTML = formatVerilogHTML(dataflowCode);
}

// ==========================================================================
