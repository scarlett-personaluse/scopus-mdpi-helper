// ==UserScript==
// @name         MDPI GE Auto-Add Assistant - Eligibility Screener
// @namespace    MDPI-GE-Auto-Add-Assistant
// @version      1.0
// @description  Screen GE eligibility via a fixed MDPI SI page, record eligible GE pool, and match candidates to pending SI list locally.
// @author       Jiali Tang
// @match        https://susy.mdpi.com/*
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
    'use strict';

    /***********************
     * Basic Settings
     ***********************/
    const TEST_SI_URL = "https://susy.mdpi.com/special_issue/process/1877901";
    const UNLOCK_DAYS = 90;
    const MAX_GE_PER_SI = 5;

    const LS_GE_POOL = "mdpi_ge_pool_v1";
    const LS_SCREEN_RESULTS = "mdpi_ge_screen_results_v1";
    const LS_QUEUE = "mdpi_ge_screen_queue_v1";
    const LS_RUNNING = "mdpi_ge_screen_running_v1";
    const LS_CURRENT = "mdpi_ge_screen_current_v1";

    const url = window.location.href;

    createAssistantPanel();

    if (url.includes("/special_issue/process/1877901")) {
        runScreeningOnTestSI();
    }

    if (url.includes("/special_issue_pending/list")) {
        setTimeout(renderPendingSIRecommendations, 1000);
    }

    /***********************
     * UI Panel
     ***********************/
    function createAssistantPanel() {
        if (document.getElementById("mdpi-ge-assistant-panel")) return;

        const mini = document.createElement("button");
        mini.textContent = "GE Assistant";
        mini.id = "mdpi-ge-assistant-mini";

        Object.assign(mini.style, {
            position: "fixed",
            right: "18px",
            bottom: "18px",
            zIndex: "999999",
            padding: "10px 14px",
            border: "none",
            borderRadius: "20px",
            background: "#1677ff",
            color: "white",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: "700",
            boxShadow: "0 3px 12px rgba(0,0,0,0.25)"
        });

        const panel = document.createElement("div");
        panel.id = "mdpi-ge-assistant-panel";

        Object.assign(panel.style, {
            position: "fixed",
            right: "18px",
            bottom: "18px",
            width: "430px",
            maxHeight: "82vh",
            overflow: "auto",
            zIndex: "999999",
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: "12px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
            fontFamily: "Arial, sans-serif",
            display: "none"
        });

        panel.innerHTML = `
            <div style="background:#1677ff;color:white;padding:10px 12px;font-weight:700;display:flex;justify-content:space-between;align-items:center;">
                <span>MDPI GE Auto-Add Assistant</span>
                <button id="gea-close" style="border:none;background:white;color:#1677ff;border-radius:6px;cursor:pointer;font-weight:700;">−</button>
            </div>

            <div style="padding:12px;">
                <div style="font-size:12px;color:#666;margin-bottom:8px;">
                    This tool screens GE eligibility only. It will not click Proceed or add GE automatically.
                </div>

                <button class="gea-btn" id="gea-import-btn">Import GE CSV</button>
                <button class="gea-btn" id="gea-start-btn">Start Eligibility Screening</button>
                <button class="gea-btn" id="gea-stop-btn">Stop Screening</button>
                <button class="gea-btn" id="gea-export-btn">Export Results</button>
                <button class="gea-btn" id="gea-match-btn">Match Eligible GE to Current Pending SI List</button>
                <button class="gea-btn danger" id="gea-clear-btn">Clear Local Data</button>

                <textarea id="gea-csv-box" placeholder="Paste CSV here. Required columns: Email, Name, Invited Date, Status. Optional: Affiliation, H-index, Invited Numbers." style="width:100%;height:130px;margin-top:8px;border:1px solid #ccc;border-radius:8px;padding:8px;font-size:12px;"></textarea>

                <div id="gea-status" style="margin-top:8px;font-size:12px;color:#333;white-space:pre-wrap;"></div>

                <textarea id="gea-output" style="width:100%;height:220px;margin-top:8px;border:1px solid #ccc;border-radius:8px;padding:8px;font-size:12px;"></textarea>
            </div>
        `;

        const style = document.createElement("style");
        style.textContent = `
            .gea-btn {
                width: 100%;
                margin: 4px 0;
                padding: 8px;
                border: none;
                border-radius: 8px;
                background: #f0f5ff;
                color: #003a8c;
                cursor: pointer;
                font-size: 13px;
                text-align: left;
            }
            .gea-btn:hover { background:#d6e4ff; }
            .gea-btn.danger { background:#fff1f0; color:#a8071a; }
            .gea-badge {
                display:inline-block;
                padding:2px 6px;
                border-radius:6px;
                font-size:11px;
                margin-left:6px;
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(mini);
        document.body.appendChild(panel);

        mini.onclick = () => {
            mini.style.display = "none";
            panel.style.display = "block";
            updateStatus();
        };

        document.getElementById("gea-close").onclick = () => {
            panel.style.display = "none";
            mini.style.display = "block";
        };

        document.getElementById("gea-import-btn").onclick = importCSV;
        document.getElementById("gea-start-btn").onclick = startScreening;
        document.getElementById("gea-stop-btn").onclick = stopScreening;
        document.getElementById("gea-export-btn").onclick = exportResults;
        document.getElementById("gea-match-btn").onclick = renderPendingSIRecommendations;
        document.getElementById("gea-clear-btn").onclick = clearLocalData;

        updateStatus();
    }

    function updateStatus(extra = "") {
        const pool = getJSON(LS_GE_POOL, []);
        const results = getJSON(LS_SCREEN_RESULTS, {});
        const queue = getJSON(LS_QUEUE, []);
        const running = localStorage.getItem(LS_RUNNING) === "1";

        const eligibleCount = Object.values(results).filter(r => r.eligible === true).length;
        const checkedCount = Object.keys(results).length;

        const status = [
            `GE pool: ${pool.length}`,
            `Checked: ${checkedCount}`,
            `Eligible: ${eligibleCount}`,
            `Queue: ${queue.length}`,
            `Running: ${running ? "Yes" : "No"}`,
            extra
        ].filter(Boolean).join("\n");

        const el = document.getElementById("gea-status");
        if (el) el.textContent = status;
    }

    /***********************
     * CSV Import
     ***********************/
    function importCSV() {
        const box = document.getElementById("gea-csv-box");
        const output = document.getElementById("gea-output");
        const csv = box.value.trim();

        if (!csv) {
            alert("Please paste CSV content first.");
            return;
        }

        const rows = parseCSV(csv);
        if (!rows.length) {
            alert("CSV parsing failed.");
            return;
        }

        const normalized = rows
            .map(normalizeGERow)
            .filter(r => r.email);

        const deduped = [];
        const seen = new Set();

        normalized.forEach(r => {
            const key = r.email.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            deduped.push(r);
        });

        localStorage.setItem(LS_GE_POOL, JSON.stringify(deduped));
        output.value = `Imported ${deduped.length} unique GE records.`;
        updateStatus("Import completed.");
    }

    function normalizeGERow(row) {
        const get = (...names) => {
            for (const n of names) {
                const key = Object.keys(row).find(k => cleanHeader(k) === cleanHeader(n));
                if (key && row[key] !== undefined) return String(row[key]).trim();
            }
            return "";
        };

        const email = get("Email", "Linked Email", "E-mail", "Email Address");
        const name = get("Name", "Full Name");
        const invitedDate = get("Invited Date", "Last Invited", "Last Invitation Date");
        const status = get("Status");
        const invitedNumbers = get("Invited Numbers", "Invited Number", "Invitation Numbers");
        const affiliation = get("Affiliation");
        const homepage = get("Homepage");
        const hindex = get("H-index", "H index");

        return {
            email,
            name,
            invitedDate,
            status,
            invitedNumbers,
            affiliation,
            homepage,
            hindex,
            importedAt: new Date().toISOString()
        };
    }

    function cleanHeader(s) {
        return String(s || "").toLowerCase().replace(/[\s_\-]/g, "");
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

    /***********************
     * Screening Logic
     ***********************/
    function startScreening() {
        const pool = getJSON(LS_GE_POOL, []);
        if (!pool.length) {
            alert("Please import GE CSV first.");
            return;
        }

        const results = getJSON(LS_SCREEN_RESULTS, {});
        const candidates = pool.filter(ge => shouldScreenGE(ge, results));

        if (!candidates.length) {
            alert("No eligible-to-screen GE found. They may be locked, skipped, or already checked.");
            updateStatus("No queue created.");
            return;
        }

        const queue = candidates.map(ge => ge.email);

        localStorage.setItem(LS_QUEUE, JSON.stringify(queue));
        localStorage.setItem(LS_RUNNING, "1");

        updateStatus(`Screening started. ${queue.length} emails in queue.`);
        goNextInQueue();
    }

    function shouldScreenGE(ge, results) {
        if (!ge.email) return false;

        const emailKey = ge.email.toLowerCase();

        if (results[emailKey]?.checkedAt) return false;

        if (shouldSkipByStatus(ge.status)) return false;

        const unlock = getUnlockTime(ge.invitedDate);
        if (unlock && Date.now() < unlock.getTime()) return false;

        return true;
    }

    function shouldSkipByStatus(status) {
        const s = String(status || "").toLowerCase();

        const skipWords = [
            "deny",
            "blacklist",
            "do not",
            "skip",
            "unsub",
            "declined",
            "rejected",
            "invalid",
            "board member",
            "section board"
        ];

        return skipWords.some(w => s.includes(w));
    }

    function getUnlockTime(invitedDateText) {
        if (!invitedDateText) return null;

        const d = parseDate(invitedDateText);
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

    function stopScreening() {
        localStorage.setItem(LS_RUNNING, "0");
        localStorage.removeItem(LS_CURRENT);
        updateStatus("Screening stopped.");
    }

    function goNextInQueue() {
        const running = localStorage.getItem(LS_RUNNING) === "1";
        if (!running) return;

        const queue = getJSON(LS_QUEUE, []);
        if (!queue.length) {
            localStorage.setItem(LS_RUNNING, "0");
            localStorage.removeItem(LS_CURRENT);
            updateStatus("Screening completed.");
            alert("GE screening completed.");
            return;
        }

        const email = queue.shift();
        localStorage.setItem(LS_QUEUE, JSON.stringify(queue));
        localStorage.setItem(LS_CURRENT, email);

        const target = `${TEST_SI_URL}?geaScreen=1&email=${encodeURIComponent(email)}`;
        window.location.href = target;
    }

    function runScreeningOnTestSI() {
        const params = new URLSearchParams(window.location.search);
        const mode = params.get("geaScreen");
        const email = params.get("email");

        if (mode !== "1" || !email) return;

        waitForElement(findEmailInput, input => {
            fillInput(input, email);

            waitForElement(() => findButtonByExactText("next"), nextBtn => {
                nextBtn.click();

                waitForScreeningResult(email);
            }, 5000);
        }, 5000);
    }

    function waitForScreeningResult(email) {
        let attempts = 0;
        const timer = setInterval(() => {
            attempts++;

            const result = detectResult(email);

            if (result.ready || attempts > 80) {
                clearInterval(timer);
                recordScreeningResult(email, result);
                setTimeout(goNextInQueue, 900);
            }
        }, 250);
    }

    function detectResult(email) {
        const text = document.body.innerText || "";
        const lower = text.toLowerCase();

        const proceedBtn = findButtonByExactText("proceed");

        const keywords = extractKeywordsFromPage();
        const name = extractNameFromPage();
        const reason = extractReason(lower);

        if (proceedBtn) {
            return {
                ready: true,
                eligible: true,
                status: "CAN_PROCEED",
                reason: "Proceed button found",
                name,
                email,
                keywords,
                pageUrl: window.location.href
            };
        }

        const negativeSignals = [
            "cannot be invited",
            "can not be invited",
            "already invited",
            "has been invited",
            "not allowed",
            "not eligible",
            "denylist",
            "blacklist",
            "duplicate",
            "exists",
            "already exists",
            "no record",
            "not found"
        ];

        if (negativeSignals.some(s => lower.includes(s))) {
            return {
                ready: true,
                eligible: false,
                status: "NOT_ELIGIBLE",
                reason,
                name,
                email,
                keywords,
                pageUrl: window.location.href
            };
        }

        if (keywords.length || name) {
            return {
                ready: true,
                eligible: false,
                status: "NO_PROCEED_FOUND",
                reason: "Scholar information found, but Proceed button not found",
                name,
                email,
                keywords,
                pageUrl: window.location.href
            };
        }

        return {
            ready: false,
            eligible: false,
            status: "WAITING",
            reason: "",
            name: "",
            email,
            keywords: [],
            pageUrl: window.location.href
        };
    }

    function extractReason(lowerText) {
        const patterns = [
            "already invited",
            "has been invited",
            "cannot be invited",
            "can not be invited",
            "not eligible",
            "duplicate",
            "denylist",
            "blacklist",
            "not found"
        ];

        const found = patterns.find(p => lowerText.includes(p));
        return found || "No Proceed button";
    }

    function extractKeywordsFromPage() {
        const text = document.body.innerText || "";
        const lines = text.split("\n").map(x => x.trim()).filter(Boolean);

        const idx = lines.findIndex(l => /^keywords?:?$/i.test(l) || /^research keywords?:?$/i.test(l));
        if (idx >= 0) {
            const chunk = lines.slice(idx + 1, idx + 6).join("; ");
            return splitKeywords(chunk);
        }

        const keywordLine = lines.find(l => /keywords?:/i.test(l));
        if (keywordLine) {
            return splitKeywords(keywordLine.replace(/keywords?:/i, ""));
        }

        return [];
    }

    function extractNameFromPage() {
        const text = document.body.innerText || "";
        const lines = text.split("\n").map(x => x.trim()).filter(Boolean);

        const nameLine = lines.find(l => /^name\s*:/i.test(l));
        if (nameLine) return nameLine.replace(/^name\s*:/i, "").trim();

        return "";
    }

    function splitKeywords(s) {
        return String(s || "")
            .split(/[;,|]/)
            .map(x => x.trim())
            .filter(x => x.length >= 2)
            .slice(0, 30);
    }

    function recordScreeningResult(email, result) {
        const results = getJSON(LS_SCREEN_RESULTS, {});
        const emailKey = email.toLowerCase();

        results[emailKey] = {
            ...result,
            checkedAt: new Date().toISOString()
        };

        localStorage.setItem(LS_SCREEN_RESULTS, JSON.stringify(results));
        localStorage.removeItem(LS_CURRENT);

        updateStatus(`Checked ${email}: ${result.status}`);
    }

    /***********************
     * Pending SI Matching
     ***********************/
    function renderPendingSIRecommendations() {
        const output = document.getElementById("gea-output");
        const results = getJSON(LS_SCREEN_RESULTS, {});
        const eligible = Object.values(results).filter(r => r.eligible === true);

        if (!eligible.length) {
            if (output) output.value = "No eligible GE records found. Please run eligibility screening first.";
            return;
        }

        const sis = extractPendingSIList();

        if (!sis.length) {
            if (output) output.value = "No SI links/titles found on this page. Please open the pending SI list page first.";
            return;
        }

        const report = [];

        sis.forEach(si => {
            const matches = eligible
                .map(ge => ({
                    ge,
                    score: scoreMatch(si.title, ge.keywords || [])
                }))
                .filter(x => x.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, MAX_GE_PER_SI);

            report.push(`\n=== ${si.title} ===`);
            report.push(si.url);

            if (!matches.length) {
                report.push("No matched eligible GE found.");
            } else {
                matches.forEach((m, i) => {
                    report.push(
                        `${i + 1}. ${m.ge.name || ""} <${m.ge.email}> | score=${m.score} | keywords=${(m.ge.keywords || []).join("; ")}`
                    );
                });
            }
        });

        const text = report.join("\n");
        if (output) output.value = text;
        GM_setClipboard(text);
    }

    function extractPendingSIList() {
        const links = Array.from(document.querySelectorAll("a[href*='/special_issue/process/']"));

        const seen = new Set();
        const sis = [];

        links.forEach(a => {
            const href = a.href;
            const m = href.match(/\/special_issue\/process\/(\d+)/);
            if (!m) return;

            const id = m[1];
            if (seen.has(id)) return;
            seen.add(id);

            const row = a.closest("tr") || a.closest("div") || a.parentElement;
            const title = extractSITitleFromRow(row, a);

            sis.push({
                id,
                title,
                url: href
            });
        });

        return sis;
    }

    function extractSITitleFromRow(row, a) {
        if (!row) return (a.innerText || "").trim();

        const text = row.innerText || "";
        const lines = text.split("\n").map(x => x.trim()).filter(Boolean);

        const likely = lines.find(l =>
            l.length > 15 &&
            !/^\d+$/.test(l) &&
            !/pending|website|date|owner|status/i.test(l)
        );

        return likely || (a.innerText || "").trim() || "Untitled SI";
    }

    function scoreMatch(siTitle, keywords) {
        const siTokens = tokenize(siTitle);
        const kwTokens = tokenize((keywords || []).join(" "));

        let score = 0;

        kwTokens.forEach(t => {
            if (siTokens.includes(t)) score += 3;
            else if (siTitle.toLowerCase().includes(t)) score += 1;
        });

        return score;
    }

    function tokenize(s) {
        const stop = new Set([
            "and", "or", "of", "in", "on", "for", "to", "the", "a", "an",
            "with", "by", "from", "advanced", "new", "novel", "recent",
            "process", "processes", "study", "system", "systems", "application",
            "applications", "research", "technology", "technologies"
        ]);

        return String(s || "")
            .toLowerCase()
            .replace(/[^a-z0-9\s\-]/g, " ")
            .split(/\s+/)
            .map(x => x.trim())
            .filter(x => x.length >= 3)
            .filter(x => !stop.has(x));
    }

    /***********************
     * Export / Clear
     ***********************/
    function exportResults() {
        const results = getJSON(LS_SCREEN_RESULTS, {});
        const rows = Object.values(results);

        if (!rows.length) {
            alert("No results to export.");
            return;
        }

        const headers = [
            "email",
            "name",
            "eligible",
            "status",
            "reason",
            "keywords",
            "checkedAt",
            "pageUrl"
        ];

        const csv = [
            headers.join(","),
            ...rows.map(r => headers.map(h => csvEscape(
                h === "keywords" ? (r[h] || []).join("; ") : r[h]
            )).join(","))
        ].join("\n");

        const output = document.getElementById("gea-output");
        if (output) output.value = csv;

        GM_setClipboard(csv);
        alert("Results copied as CSV.");
    }

    function csvEscape(v) {
        const s = String(v ?? "");
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
    }

    function clearLocalData() {
        if (!confirm("Clear local GE pool, queue, and screening results?")) return;

        localStorage.removeItem(LS_GE_POOL);
        localStorage.removeItem(LS_SCREEN_RESULTS);
        localStorage.removeItem(LS_QUEUE);
        localStorage.removeItem(LS_RUNNING);
        localStorage.removeItem(LS_CURRENT);

        updateStatus("Local data cleared.");
        const output = document.getElementById("gea-output");
        if (output) output.value = "";
    }

    /***********************
     * Helpers
     ***********************/
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

    function findButtonByExactText(text) {
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

    function waitForElement(getter, callback, timeout = 5000) {
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

    function getJSON(key, fallback) {
        try {
            return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
        } catch {
            return fallback;
        }
    }

})();
