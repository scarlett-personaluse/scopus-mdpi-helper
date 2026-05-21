// ==UserScript==
// @name         MDPI GE Auto-Add Assistant - Semi Auto Add
// @namespace    MDPI-GE-Auto-Add-Assistant
// @version      2.1
// @description  Import local GE CSV, screen eligibility, optionally click Proceed, and record results locally.
// @author       Jiali Tang
// @match        https://susy.mdpi.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const TEST_SI_URL = "https://susy.mdpi.com/special_issue/process/1877901";
    const UNLOCK_DAYS = 90;

    const LS_GE_POOL = "mdpi_ge_pool_v21";
    const LS_RESULTS = "mdpi_ge_results_v21";
    const LS_QUEUE = "mdpi_ge_queue_v21";
    const LS_RUNNING = "mdpi_ge_running_v21";
    const LS_AUTO_PROCEED = "mdpi_ge_auto_proceed_v21";
    const LS_CURRENT = "mdpi_ge_current_v21";
    const LS_LOG = "mdpi_ge_log_v21";

    ready(() => {
        createPanel();

        if (location.href.includes("/special_issue/process/1877901")) {
            runOnSIPage();
        }
    });

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
        } else {
            fn();
        }
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
            width: "470px",
            maxHeight: "82vh",
            overflow: "auto",
            zIndex: "1000000",
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: "12px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
            fontFamily: "Arial, sans-serif",
            display: localStorage.getItem(LS_RUNNING) === "1" ? "block" : "none"
        });

        if (localStorage.getItem(LS_RUNNING) === "1") {
            mini.style.display = "none";
        }

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
                    Default: only records CAN_PROCEED. If checked, it will click Proceed when available.
                </div>

                <input type="file" id="gea-file" accept=".csv" style="margin-bottom:6px;width:100%;">

                <button class="gea-btn" id="gea-import-btn">Import CSV Text</button>
                <button class="gea-btn" id="gea-start-btn">Start Eligible Screening / Add</button>
                <button class="gea-btn" id="gea-force-btn">Force Screen All Imported GE</button>
                <button class="gea-btn" id="gea-stop-btn">Stop</button>
                <button class="gea-btn" id="gea-export-btn">Export Results</button>
                <button class="gea-btn danger" id="gea-clear-btn">Clear Local Data</button>

                <textarea id="gea-csv" placeholder="Paste CSV here if not using file upload." style="width:100%;height:110px;margin-top:8px;border:1px solid #ccc;border-radius:8px;padding:8px;font-size:12px;"></textarea>

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

        document.getElementById("gea-close").onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            panel.style.display = "none";
            mini.style.display = "block";
        };

        const autoBox = document.getElementById("gea-auto-proceed");
        autoBox.checked = localStorage.getItem(LS_AUTO_PROCEED) === "1";
        autoBox.onchange = () => {
            localStorage.setItem(LS_AUTO_PROCEED, autoBox.checked ? "1" : "0");
            log(autoBox.checked ? "Auto Proceed enabled." : "Auto Proceed disabled.");
            updateStatus();
        };

        document.getElementById("gea-file").onchange = importCSVFile;
        document.getElementById("gea-import-btn").onclick = importCSVText;
        document.getElementById("gea-start-btn").onclick = () => startRun(false);
        document.getElementById("gea-force-btn").onclick = () => startRun(true);
        document.getElementById("gea-stop-btn").onclick = stopRun;
        document.getElementById("gea-export-btn").onclick = exportResults;
        document.getElementById("gea-clear-btn").onclick = clearData;

        makeDraggable(panel, document.getElementById("gea-drag-header"));

        updateStatus();
    }

    function makeDraggable(panel, handle) {
        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        handle.addEventListener("mousedown", e => {
            if (e.target.id === "gea-close") return;

            dragging = true;

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
            if (!dragging) return;
            panel.style.left = `${e.clientX - offsetX}px`;
            panel.style.top = `${e.clientY - offsetY}px`;
        });

        document.addEventListener("mouseup", () => {
            dragging = false;
        });
    }

    function updateStatus(extra = "") {
        const pool = getJSON(LS_GE_POOL, []);
        const results = getJSON(LS_RESULTS, {});
        const queue = getJSON(LS_QUEUE, []);
        const running = localStorage.getItem(LS_RUNNING) === "1";
        const auto = localStorage.getItem(LS_AUTO_PROCEED) === "1";
        const current = localStorage.getItem(LS_CURRENT) || "-";

        const rows = Object.values(results);
        const canProceed = rows.filter(r => r.status === "CAN_PROCEED").length;
        const clicked = rows.filter(r => r.status === "PROCEED_CLICKED" || r.status === "ADDED_SUCCESS").length;
        const failed = rows.filter(r => String(r.status || "").startsWith("FAILED")).length;
        const notEligible = rows.filter(r => r.status === "NOT_ELIGIBLE").length;

        const text = [
            `GE pool: ${pool.length}`,
            `Checked: ${rows.length}`,
            `Can Proceed: ${canProceed}`,
            `Proceed clicked / Added: ${clicked}`,
            `Not eligible: ${notEligible}`,
            `Failed: ${failed}`,
            `Queue: ${queue.length}`,
            `Current: ${current}`,
            `Running: ${running ? "Yes" : "No"}`,
            `Auto Proceed: ${auto ? "ON" : "OFF"}`,
            extra
        ].filter(Boolean).join("\n");

        const status = document.getElementById("gea-status");
        if (status) status.textContent = text;

        const mini = document.getElementById("gea-mini");
        if (mini) mini.textContent = running ? `GE Running (${queue.length})` : "GE Assistant";

        const out = document.getElementById("gea-output");
        if (out) out.value = getLogText();
    }

    function log(msg) {
        const arr = getJSON(LS_LOG, []);
        arr.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
        localStorage.setItem(LS_LOG, JSON.stringify(arr.slice(0, 120)));
    }

    function getLogText() {
        return getJSON(LS_LOG, []).join("\n");
    }

    function importCSVFile(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result || "");
            const box = document.getElementById("gea-csv");
            if (box) box.value = text;
            importCSV(text);
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
        log(`Imported ${deduped.length} unique GE records.`);
        updateStatus();
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

    function startRun(forceAll) {
        const pool = getJSON(LS_GE_POOL, []);
        if (!pool.length) {
            alert("Please import CSV first.");
            log("Start failed: GE pool is empty.");
            updateStatus();
            return;
        }

        const results = getJSON(LS_RESULTS, {});
        const stats = { missingEmail: 0, checked: 0, skippedStatus: 0, locked: 0, queued: 0 };

        const candidates = pool.filter(ge => {
            if (!ge.email) {
                stats.missingEmail++;
                return false;
            }

            const key = ge.email.toLowerCase();

            if (!forceAll && results[key]?.checkedAt) {
                stats.checked++;
                return false;
            }

            if (!forceAll && shouldSkipStatus(ge.status)) {
                stats.skippedStatus++;
                return false;
            }

            const unlock = getUnlockTime(ge.invitedDate);
            if (!forceAll && unlock && Date.now() < unlock.getTime()) {
                stats.locked++;
                return false;
            }

            stats.queued++;
            return true;
        });

        if (!candidates.length) {
            const msg =
                `No candidates to screen.\n` +
                `Already checked: ${stats.checked}\n` +
                `Skipped by status: ${stats.skippedStatus}\n` +
                `Locked < ${UNLOCK_DAYS} days: ${stats.locked}\n` +
                `Missing email: ${stats.missingEmail}`;
            alert(msg);
            log(msg);
            updateStatus();
            return;
        }

        localStorage.setItem(LS_QUEUE, JSON.stringify(candidates.map(x => x.email)));
        localStorage.setItem(LS_RUNNING, "1");

        log(`${forceAll ? "Force run" : "Eligible run"} started. Queue=${candidates.length}`);
        updateStatus();
        goNext();
    }

    function stopRun() {
        localStorage.setItem(LS_RUNNING, "0");
        localStorage.removeItem(LS_CURRENT);
        log("Stopped by user.");
        updateStatus();
    }

    function goNext() {
        if (localStorage.getItem(LS_RUNNING) !== "1") {
            log("goNext stopped: Running is OFF.");
            updateStatus();
            return;
        }

        const queue = getJSON(LS_QUEUE, []);

        if (!queue.length) {
            localStorage.setItem(LS_RUNNING, "0");
            localStorage.removeItem(LS_CURRENT);
            log("Completed: queue is empty.");
            updateStatus();
            alert("GE screening/add completed.");
            return;
        }

        const email = queue.shift();
        localStorage.setItem(LS_QUEUE, JSON.stringify(queue));
        localStorage.setItem(LS_CURRENT, email);

        log(`Opening test SI for ${email}`);
        updateStatus();

        location.href = `${TEST_SI_URL}?geaRun=1&email=${encodeURIComponent(email)}`;
    }

    function runOnSIPage() {
        const params = new URLSearchParams(location.search);
        if (params.get("geaRun") !== "1") return;

        const email = params.get("email");
        if (!email) return;

        localStorage.setItem(LS_CURRENT, email);
        log(`SI page loaded for ${email}`);
        updateStatus();

        closePopup();

        waitForElement(findEmailInput, input => {
            log(`Email input found. Filling ${email}`);
            fillInput(input, email);

            waitForElement(() => findButtonByText("next"), nextBtn => {
                log("Next button found. Clicking Next.");
                clickElement(nextBtn);
                waitForProceedOrFailure(email);
            }, 10000, () => {
                record(email, {
                    status: "FAILED_NO_NEXT",
                    eligible: false,
                    reason: "Next button not found",
                    keywords: extractKeywords(),
                    pageUrl: location.href
                });
                setTimeout(goNext, 1000);
            });
        }, 10000, () => {
            record(email, {
                status: "FAILED_NO_EMAIL_INPUT",
                eligible: false,
                reason: "E-Mail input not found",
                keywords: [],
                pageUrl: location.href
            });
            setTimeout(goNext, 1000);
        });
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
                log(`Proceed button found for ${email}`);

                const auto = localStorage.getItem(LS_AUTO_PROCEED) === "1";

                if (!auto) {
                    record(email, {
                        status: "CAN_PROCEED",
                        eligible: true,
                        reason: "Proceed button found; Auto Proceed OFF",
                        keywords: extractKeywords(),
                        pageUrl: location.href
                    });
                    setTimeout(goNext, 1200);
                    return;
                }

                record(email, {
                    status: "PROCEED_CLICKED",
                    eligible: true,
                    reason: "Proceed clicked automatically",
                    keywords: extractKeywords(),
                    pageUrl: location.href
                });

                log(`Auto Proceed ON. Clicking Proceed for ${email}`);
                clickElement(proceedBtn);

                setTimeout(goNext, 2500);
                return;
            }

            const negative = detectNegative(lower);
            if (negative) {
                clearInterval(timer);
                log(`Negative signal for ${email}: ${negative}`);

                record(email, {
                    status: "NOT_ELIGIBLE",
                    eligible: false,
                    reason: negative,
                    keywords: extractKeywords(),
                    pageUrl: location.href
                });

                setTimeout(goNext, 1200);
                return;
            }

            if (count % 10 === 0) {
                log(`Waiting for result for ${email}... ${Math.round(count * 0.25)}s`);
                updateStatus();
            }

            if (count > 100) {
                clearInterval(timer);
                log(`Timeout for ${email}`);

                record(email, {
                    status: "FAILED_TIMEOUT",
                    eligible: false,
                    reason: "No Proceed or negative signal detected within timeout",
                    keywords: extractKeywords(),
                    pageUrl: location.href
                });

                setTimeout(goNext, 1200);
            }
        }, 250);
    }

    function detectNegative(lower) {
        const signals = [
            "already invited",
            "has been invited",
            "not allowed",
            "not allow",
            "cannot be invited",
            "can not be invited",
            "not eligible",
            "denylist",
            "blacklist",
            "duplicate",
            "not found",
            "no record",
            "past 90 days",
            "past 90"
        ];

        return signals.find(s => lower.includes(s)) || "";
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
        log(`Recorded ${email}: ${data.status}`);
        updateStatus();
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
        if (!confirm("Clear all local GE data, queue, results, and log?")) return;

        [LS_GE_POOL, LS_RESULTS, LS_QUEUE, LS_RUNNING, LS_CURRENT, LS_LOG].forEach(k => {
            localStorage.removeItem(k);
        });

        const out = document.getElementById("gea-output");
        if (out) out.value = "";

        updateStatus("Local data cleared.");
    }

    function shouldSkipStatus(status) {
        const s = String(status || "").toLowerCase();

        return [
            "deny",
            "blacklist",
            "skip",
            "do not",
            "declined",
            "rejected",
            "invalid",
            "section board",
            "board member"
        ].some(w => s.includes(w));
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
        const line = text.split("\n").find(l =>
            /research keywords?:/i.test(l) ||
            /^keywords?:/i.test(l)
        );

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
        const inputs = Array.from(document.querySelectorAll("input"))
            .filter(el => !el.disabled && el.offsetParent !== null);

        let best = null;
        let bestScore = -999;

        inputs.forEach(input => {
            const ph = (input.getAttribute("placeholder") || "").toLowerCase();
            const name = (input.getAttribute("name") || "").toLowerCase();
            const id = (input.getAttribute("id") || "").toLowerCase();
            const type = (input.getAttribute("type") || "").toLowerCase();
            const context = ((input.closest("tr, div, form") || {}).innerText || "").toLowerCase();
            const rect = input.getBoundingClientRect();

            let score = 0;

            if (type === "email") score += 80;
            if (name.includes("email") || id.includes("email")) score += 70;
            if (context.includes("* e-mail") || context.includes("e-mail")) score += 60;
            if (rect.width > 300) score += 20;

            if (ph.includes("user e-mail")) score -= 200;
            if (ph.includes("quick find")) score -= 200;
            if (context.includes("user overview")) score -= 120;

            if (score > bestScore) {
                bestScore = score;
                best = input;
            }
        });

        return bestScore > -50 ? best : null;
    }

    function findButtonByText(text) {
        const target = text.toLowerCase();

        const candidates = Array.from(
            document.querySelectorAll("button, input[type='button'], input[type='submit'], a")
        ).filter(el => el.offsetParent !== null);

        return candidates.find(el => {
            const t = (el.innerText || el.value || "").trim().toLowerCase();
            return t === target;
        });
    }

    function clickElement(el) {
        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        el.click();
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

    function waitForElement(getter, callback, timeout = 8000, onTimeout = null) {
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
                if (onTimeout) onTimeout();
            }
        }, 80);
    }

    function closePopup() {
        const candidates = Array.from(document.querySelectorAll("button, a, span, div"));

        const closeBtn = candidates.find(el => {
            const text = (el.innerText || el.textContent || "").trim();
            const aria = (el.getAttribute("aria-label") || "").toLowerCase();
            const cls = (el.className || "").toString().toLowerCase();

            return (
                text === "×" ||
                text === "x" ||
                aria.includes("close") ||
                cls.includes("close")
            );
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
