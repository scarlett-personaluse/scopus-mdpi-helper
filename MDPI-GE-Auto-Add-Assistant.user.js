// ==UserScript==
// @name         MDPI GE Auto-Add Assistant - Semi Auto Add
// @namespace    MDPI-GE-Auto-Add-Assistant
// @version      2.0
// @description  Import local GE CSV, screen eligibility, optionally click Proceed, and record results locally.
// @author       Jiali Tang
// @match        https://susy.mdpi.com/*
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
    'use strict';

    const TEST_SI_URL = "https://susy.mdpi.com/special_issue/process/1877901";
    const UNLOCK_DAYS = 90;

    const LS_GE_POOL = "mdpi_ge_pool_v2";
    const LS_RESULTS = "mdpi_ge_results_v2";
    const LS_QUEUE = "mdpi_ge_queue_v2";
    const LS_RUNNING = "mdpi_ge_running_v2";
    const LS_AUTO_PROCEED = "mdpi_ge_auto_proceed_v2";

    createPanel();

    if (location.href.includes("/special_issue/process/1877901")) {
        runOnSIPage();
    }

function createPanel() {
    if (document.getElementById("gea-panel")) return;

    const mini = document.createElement("button");
    mini.id = "gea-mini";
    mini.textContent = "GE Assistant";

    Object.assign(mini.style, {
        position: "fixed",
        right: "18px",
        bottom: "88px",
        zIndex: "999999",
        padding: "10px 14px",
        border: "none",
        borderRadius: "20px",
        background: "#eb2f96",
        color: "white",
        cursor: "pointer",
        fontWeight: "700",
        boxShadow: "0 3px 12px rgba(0,0,0,0.25)"
    });

    const panel = document.createElement("div");
    panel.id = "gea-panel";

    Object.assign(panel.style, {
        position: "fixed",
        right: "18px",
        bottom: "88px",
        width: "460px",
        maxHeight: "82vh",
        overflow: "auto",
        zIndex: "1000000",
        background: "#fff",
        border: "1px solid #ccc",
        borderRadius: "12px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
        fontFamily: "Arial, sans-serif",
        display: "none"
    });

    panel.innerHTML = `
        <div id="gea-drag-header" style="background:#eb2f96;color:white;padding:10px 12px;font-weight:700;display:flex;justify-content:space-between;align-items:center;cursor:move;">
            <span>MDPI GE Semi Auto Add</span>
            <button id="gea-close" style="border:none;background:white;color:#eb2f96;border-radius:6px;cursor:pointer;font-weight:700;padding:2px 8px;">−</button>
        </div>

        <div style="padding:12px;font-size:13px;">
            <label style="display:block;margin-bottom:8px;color:#a8071a;font-weight:700;">
                <input type="checkbox" id="gea-auto-proceed">
                Auto Proceed Mode
            </label>

            <div style="font-size:12px;color:#666;margin-bottom:8px;">
                If Auto Proceed is checked, the script will click Proceed when available.
                If unchecked, it only records CAN_PROCEED.
            </div>

            <input type="file" id="gea-file" accept=".csv" style="margin-bottom:6px;width:100%;">

            <button class="gea-btn" id="gea-import-btn">Import CSV Text</button>
            <button class="gea-btn" id="gea-start-btn">Start Screening / Add</button>
            <button class="gea-btn" id="gea-stop-btn">Stop</button>
            <button class="gea-btn" id="gea-export-btn">Export Results</button>
            <button class="gea-btn danger" id="gea-clear-btn">Clear Local Data</button>

            <textarea id="gea-csv" placeholder="Paste CSV here if not using file upload." style="width:100%;height:120px;margin-top:8px;border:1px solid #ccc;border-radius:8px;padding:8px;font-size:12px;"></textarea>

            <div id="gea-status" style="margin-top:8px;padding:8px;background:#fff0f6;border:1px solid #ffd6e7;border-radius:8px;font-size:12px;white-space:pre-wrap;color:#333;"></div>

            <textarea id="gea-output" style="width:100%;height:230px;margin-top:8px;border:1px solid #ccc;border-radius:8px;padding:8px;font-size:12px;"></textarea>
        </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
        .gea-btn {
            width:100%;
            margin:4px 0;
            padding:8px;
            border:none;
            border-radius:8px;
            background:#fff0f6;
            color:#c41d7f;
            cursor:pointer;
            text-align:left;
        }
        .gea-btn:hover { background:#ffd6e7; }
        .gea-btn.danger { background:#fff1f0;color:#a8071a; }
    `;

    document.head.appendChild(style);
    document.body.appendChild(mini);
    document.body.appendChild(panel);

    mini.onclick = () => {
        mini.style.display = "none";
        panel.style.display = "block";
        updateStatus();
    };

    document.getElementById("gea-close").onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        panel.style.display = "none";
        mini.style.display = "block";
    };

    const autoBox = document.getElementById("gea-auto-proceed");
    autoBox.checked = localStorage.getItem(LS_AUTO_PROCEED) === "1";
    autoBox.onchange = () => {
        localStorage.setItem(LS_AUTO_PROCEED, autoBox.checked ? "1" : "0");
        updateStatus(autoBox.checked ? "Auto Proceed enabled." : "Auto Proceed disabled.");
    };

    document.getElementById("gea-file").onchange = importCSVFile;
    document.getElementById("gea-import-btn").onclick = importCSVText;
    document.getElementById("gea-start-btn").onclick = startRun;
    document.getElementById("gea-stop-btn").onclick = stopRun;
    document.getElementById("gea-export-btn").onclick = exportResults;
    document.getElementById("gea-clear-btn").onclick = clearData;

    makeDraggable(panel, document.getElementById("gea-drag-header"));

    updateStatus();
}
    function makeDraggable(panel, handle) {
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener("mousedown", e => {
        if (e.target.id === "gea-close") return;

        isDragging = true;

        const rect = panel.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

        panel.style.left = rect.left + "px";
        panel.style.top = rect.top + "px";
        panel.style.right = "auto";
        panel.style.bottom = "auto";

        e.preventDefault();
    });

    document.addEventListener("mousemove", e => {
        if (!isDragging) return;

        panel.style.left = `${e.clientX - offsetX}px`;
        panel.style.top = `${e.clientY - offsetY}px`;
    });

    document.addEventListener("mouseup", () => {
        isDragging = false;
    });
}
    function updateStatus(extra = "") {
        const pool = getJSON(LS_GE_POOL, []);
        const results = getJSON(LS_RESULTS, {});
        const queue = getJSON(LS_QUEUE, []);
        const running = localStorage.getItem(LS_RUNNING) === "1";
        const auto = localStorage.getItem(LS_AUTO_PROCEED) === "1";

        const rows = Object.values(results);
        const canProceed = rows.filter(r => r.status === "CAN_PROCEED").length;
        const added = rows.filter(r => r.status === "ADDED_SUCCESS" || r.status === "PROCEED_CLICKED").length;
        const failed = rows.filter(r => String(r.status || "").startsWith("FAILED")).length;

        const text = [
            `GE pool: ${pool.length}`,
            `Checked: ${rows.length}`,
            `Can Proceed: ${canProceed}`,
            `Added / Proceed clicked: ${added}`,
            `Failed: ${failed}`,
            `Queue: ${queue.length}`,
            `Running: ${running ? "Yes" : "No"}`,
            `Auto Proceed: ${auto ? "ON" : "OFF"}`,
            extra
        ].filter(Boolean).join("\n");

        const el = document.getElementById("gea-status");
        if (el) el.textContent = text;
    }

    function importCSVFile(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            document.getElementById("gea-csv").value = reader.result;
            importCSV(reader.result);
        };
        reader.readAsText(file, "UTF-8");
    }

    function importCSVText() {
        const csv = document.getElementById("gea-csv").value.trim();
        if (!csv) {
            alert("Please paste CSV or choose a CSV file.");
            return;
        }
        importCSV(csv);
    }

    function importCSV(csv) {
        const rows = parseCSV(csv);
        const normalized = rows.map(normalizeRow).filter(r => r.email);

        const seen = new Set();
        const deduped = [];

        normalized.forEach(r => {
            const key = r.email.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            deduped.push(r);
        });

        localStorage.setItem(LS_GE_POOL, JSON.stringify(deduped));

        const out = document.getElementById("gea-output");
        if (out) out.value = `Imported ${deduped.length} unique GE records.`;

        updateStatus("Import completed.");
    }

    function normalizeRow(row) {
        const get = (...names) => {
            for (const n of names) {
                const key = Object.keys(row).find(k => clean(k) === clean(n));
                if (key) return String(row[key] || "").trim();
            }
            return "";
        };

        return {
            email: get("Email", "Linked Email", "E-mail", "Email Address"),
            name: get("Name", "Full Name"),
            invitedDate: get("Invited Date", "Last Invited", "Last Invitation Date"),
            status: get("Status"),
            affiliation: get("Affiliation"),
            homepage: get("Homepage"),
            hindex: get("H-index", "H index"),
            invitedNumbers: get("Invited Numbers", "Invited Number")
        };
    }

    function clean(s) {
        return String(s || "").toLowerCase().replace(/[\s_\-]/g, "");
    }

    function startRun() {
        const pool = getJSON(LS_GE_POOL, []);
        if (!pool.length) {
            alert("Please import CSV first.");
            return;
        }

        const results = getJSON(LS_RESULTS, {});

        const candidates = pool.filter(ge => {
            if (!ge.email) return false;

            const key = ge.email.toLowerCase();
            if (results[key]?.checkedAt) return false;

            if (shouldSkipStatus(ge.status)) return false;

            const unlock = getUnlockTime(ge.invitedDate);
            if (unlock && Date.now() < unlock.getTime()) return false;

            return true;
        });

        if (!candidates.length) {
            alert("No candidates to screen/add.");
            return;
        }

        localStorage.setItem(LS_QUEUE, JSON.stringify(candidates.map(x => x.email)));
        localStorage.setItem(LS_RUNNING, "1");

        updateStatus(`Started. ${candidates.length} candidates in queue.`);
        goNext();
    }

    function stopRun() {
        localStorage.setItem(LS_RUNNING, "0");
        updateStatus("Stopped.");
    }

    function goNext() {
        if (localStorage.getItem(LS_RUNNING) !== "1") return;

        const queue = getJSON(LS_QUEUE, []);
        if (!queue.length) {
            localStorage.setItem(LS_RUNNING, "0");
            updateStatus("Completed.");
            alert("GE screening/add completed.");
            return;
        }

        const email = queue.shift();
        localStorage.setItem(LS_QUEUE, JSON.stringify(queue));

        location.href = `${TEST_SI_URL}?geaRun=1&email=${encodeURIComponent(email)}`;
    }

    function runOnSIPage() {
        const params = new URLSearchParams(location.search);
        if (params.get("geaRun") !== "1") return;

        const email = params.get("email");
        if (!email) return;

        closePopup();

        waitForElement(findEmailInput, input => {
            fillInput(input, email);

            waitForElement(() => findButtonByText("next"), nextBtn => {
                nextBtn.click();
                waitForProceedOrFailure(email);
            }, 8000);
        }, 8000);
    }

    function waitForProceedOrFailure(email) {
        let count = 0;
        const timer = setInterval(() => {
            count++;

            closePopup();

            const proceedBtn = findButtonByText("proceed");
            const text = document.body.innerText || "";
            const lower = text.toLowerCase();

            if (proceedBtn) {
                clearInterval(timer);

                const auto = localStorage.getItem(LS_AUTO_PROCEED) === "1";

                if (!auto) {
                    record(email, {
                        status: "CAN_PROCEED",
                        eligible: true,
                        reason: "Proceed button found; Auto Proceed OFF",
                        keywords: extractKeywords(),
                        pageUrl: location.href
                    });
                    setTimeout(goNext, 800);
                    return;
                }

                proceedBtn.click();

                setTimeout(() => {
                    record(email, {
                        status: detectAddedSuccess(email) ? "ADDED_SUCCESS" : "PROCEED_CLICKED",
                        eligible: true,
                        reason: "Proceed clicked automatically",
                        keywords: extractKeywords(),
                        pageUrl: location.href
                    });

                    setTimeout(goNext, 1500);
                }, 2500);

                return;
            }

            const negative = detectNegative(lower);
            if (negative) {
                clearInterval(timer);

                record(email, {
                    status: "NOT_ELIGIBLE",
                    eligible: false,
                    reason: negative,
                    keywords: extractKeywords(),
                    pageUrl: location.href
                });

                setTimeout(goNext, 800);
                return;
            }

            if (count > 80) {
                clearInterval(timer);

                record(email, {
                    status: "FAILED_TIMEOUT",
                    eligible: false,
                    reason: "No Proceed or negative signal detected within timeout",
                    keywords: extractKeywords(),
                    pageUrl: location.href
                });

                setTimeout(goNext, 800);
            }

        }, 250);
    }

    function detectNegative(lower) {
        const signals = [
            "already invited",
            "has been invited",
            "not allowed",
            "cannot be invited",
            "can not be invited",
            "not eligible",
            "denylist",
            "blacklist",
            "duplicate",
            "not found",
            "no record"
        ];
        return signals.find(s => lower.includes(s)) || "";
    }

    function detectAddedSuccess(email) {
        const lower = (document.body.innerText || "").toLowerCase();
        return (
            lower.includes(email.toLowerCase()) ||
            lower.includes("guest editor") ||
            lower.includes("added") ||
            lower.includes("success")
        );
    }

    function record(email, data) {
        const results = getJSON(LS_RESULTS, {});
        const key = email.toLowerCase();

        results[key] = {
            email,
            ...data,
            checkedAt: new Date().toISOString()
        };

        localStorage.setItem(LS_RESULTS, JSON.stringify(results));
        updateStatus(`Checked ${email}: ${data.status}`);
    }

    function exportResults() {
        const results = Object.values(getJSON(LS_RESULTS, {}));
        if (!results.length) {
            alert("No results.");
            return;
        }

        const headers = ["email", "status", "eligible", "reason", "keywords", "checkedAt", "pageUrl"];
        const csv = [
            headers.join(","),
            ...results.map(r => headers.map(h => csvEscape(
                h === "keywords" ? (r[h] || []).join("; ") : r[h]
            )).join(","))
        ].join("\n");

        const out = document.getElementById("gea-output");
        if (out) out.value = csv;

        GM_setClipboard(csv);
        alert("Results copied.");
    }

    function clearData() {
        if (!confirm("Clear all local GE data and results?")) return;

        [LS_GE_POOL, LS_RESULTS, LS_QUEUE, LS_RUNNING].forEach(k => localStorage.removeItem(k));

        const out = document.getElementById("gea-output");
        if (out) out.value = "";

        updateStatus("Local data cleared.");
    }

    function shouldSkipStatus(status) {
        const s = String(status || "").toLowerCase();
        return ["deny", "blacklist", "skip", "do not", "declined", "rejected", "invalid", "section board", "board member"]
            .some(w => s.includes(w));
    }

    function getUnlockTime(text) {
        if (!text) return null;
        const d = parseDate(text);
        if (!d) return null;
        return new Date(d.getTime() + UNLOCK_DAYS * 24 * 60 * 60 * 1000);
    }

    function parseDate(text) {
        const s = String(text || "").trim();
        if (!s) return null;

        let d = new Date(s);
        if (!isNaN(d.getTime())) return d;

        const m = s.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
        if (m) {
            d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
            if (!isNaN(d.getTime())) return d;
        }

        return null;
    }

    function extractKeywords() {
        const text = document.body.innerText || "";
        const line = text.split("\n").find(l => /research keywords?:/i.test(l) || /^keywords?:/i.test(l));
        if (!line) return [];

        return line
            .replace(/research keywords?:/i, "")
            .replace(/keywords?:/i, "")
            .split(/[;,|]/)
            .map(x => x.trim())
            .filter(Boolean)
            .slice(0, 30);
    }

    function findEmailInput() {
        const selectors = [
            "input[type='email']",
            "input[name*='email' i]",
            "input[id*='email' i]",
            "input[placeholder*='email' i]",
            "input[type='text']"
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && !el.disabled && el.offsetParent !== null) return el;
        }
        return null;
    }

    function findButtonByText(text) {
        const target = text.toLowerCase();

        const candidates = Array.from(
            document.querySelectorAll("button, input[type='button'], input[type='submit'], a")
        );

        return candidates.find(el => {
            const t = (el.innerText || el.value || "").trim().toLowerCase();
            return t === target;
        });
    }

    function fillInput(input, value) {
        input.focus();

        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value"
        )?.set;

        if (setter) setter.call(input, value);
        else input.value = value;

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
    }

    function waitForElement(getter, callback, timeout = 8000) {
        const start = Date.now();

        const timer = setInterval(() => {
            const el = getter();

            if (el) {
                clearInterval(timer);
                callback(el);
                return;
            }

            if (Date.now() - start > timeout) {
                clearInterval(timer);
            }
        }, 80);
    }

    function closePopup() {
        const candidates = Array.from(document.querySelectorAll("button, a, span, div"));
        const closeBtn = candidates.find(el => {
            const text = (el.innerText || el.textContent || "").trim();
            const aria = (el.getAttribute("aria-label") || "").toLowerCase();
            const cls = (el.className || "").toString().toLowerCase();

            return text === "×" || text === "x" || aria.includes("close") || cls.includes("close");
        });

        if (closeBtn) closeBtn.click();
    }

    function parseCSV(text) {
        const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim());
        if (lines.length < 2) return [];

        const headers = splitCSVLine(lines[0]).map(h => h.trim());

        return lines.slice(1).map(line => {
            const values = splitCSVLine(line);
            const obj = {};
            headers.forEach((h, i) => obj[h] = values[i] || "");
            return obj;
        });
    }

    function splitCSVLine(line) {
        const result = [];
        let cur = "";
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const c = line[i];

            if (c === '"' && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else if (c === '"') {
                inQuotes = !inQuotes;
            } else if (c === "," && !inQuotes) {
                result.push(cur);
                cur = "";
            } else {
                cur += c;
            }
        }

        result.push(cur);
        return result.map(x => x.trim());
    }

    function csvEscape(v) {
        const s = String(v ?? "");
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
    }

    function getJSON(key, fallback) {
        try {
            return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
        } catch {
            return fallback;
        }
    }

})();
