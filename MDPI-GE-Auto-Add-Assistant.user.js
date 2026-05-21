// ==UserScript==
// @name         MDPI GE Auto-Add Assistant Multi-SI Round
// @namespace    MDPI-GE-Auto-Add-Assistant
// @version      3.5
// @description  Multi-SI GE auto-add assistant: default auto Proceed, Esc to stop, one email once per round, up to 5 Proceed per SI.
// @author       Jiali Tang
// @match        https://susy.mdpi.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const PENDING_LIST_URL = "https://susy.mdpi.com/special_issue_pending/list?page_limit=100&sort_field=special_issue_pending.date_update&sort=DESC";
    const MAX_PROCEED_PER_SI_PER_ROUND = 5;
    const UNLOCK_DAYS = 90;
    const NO_PROCEED_TIMEOUT_TICKS = 40;

    const LS_GE_POOL = "mdpi_ge_pool_v35";
    const LS_SI_QUEUE = "mdpi_si_queue_v35";
    const LS_RESULTS = "mdpi_ge_results_v35";
    const LS_RUNNING = "mdpi_ge_running_v35";
    const LS_LOG = "mdpi_ge_log_v35";
    const LS_SI_INDEX = "mdpi_si_index_v35";
    const LS_GE_INDEX = "mdpi_ge_index_v35";
    const LS_SI_COUNTS = "mdpi_si_round_counts_v35";
    const LS_CURRENT = "mdpi_current_task_v35";
    const LS_USED_EMAILS = "mdpi_used_emails_this_round_v35";

    ready(() => {
        createPanel();
        setupEscStop();

        if (location.href.includes("/special_issue/process/")) {
            runOnSIPage();

            setTimeout(() => {
                const running = localStorage.getItem(LS_RUNNING) === "1";
                const hasRunParam = new URLSearchParams(location.search).get("geaRun") === "1";

                if (running && !hasRunParam) {
                    log("Page reloaded after Proceed. Continue to next GE.");
                    dispatchNext();
                }
            }, 1500);
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
            zIndex: "1000001",
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
            width: "500px",
            maxHeight: "84vh",
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
            <div id="gea-drag-header" style="background:#eb2f96;color:white;padding:10px 12px;font-weight:700;display:flex;justify-content:space-between;align-items:center;cursor:move;user-select:none;">
                <span>MDPI GE Multi-SI Assistant</span>
                <button id="gea-close" style="border:none;background:white;color:#eb2f96;border-radius:6px;cursor:pointer;font-weight:700;padding:3px 10px;">Minimize</button>
            </div>

            <div style="padding:12px;font-size:13px;">
                <div style="font-size:12px;color:#666;margin-bottom:8px;">
                    默认自动 Proceed；每轮每个邮箱只处理一次；每个 SI 最多 Proceed 5 次；按 Esc 可立即停止。
                </div>

                <input type="file" id="gea-file" accept=".csv" style="margin-bottom:6px;width:100%;">

                <button class="gea-btn" id="gea-import-btn">Import CSV Text</button>
                <button class="gea-btn" id="gea-open-list-btn">Open Pending SI List</button>
                <button class="gea-btn" id="gea-load-si-btn">Load SI Queue from Current Page</button>
                <button class="gea-btn" id="gea-new-round-btn">Start New Round</button>
                <button class="gea-btn" id="gea-resume-btn">Resume Current Round</button>
                <button class="gea-btn" id="gea-stop-btn">Stop</button>
                <button class="gea-btn" id="gea-export-btn">Export Results</button>
                <button class="gea-btn danger" id="gea-clear-btn">Clear Local Data</button>

                <textarea id="gea-csv" placeholder="Paste CSV here if not using file upload." style="width:100%;height:90px;margin-top:8px;border:1px solid #ccc;border-radius:8px;padding:8px;font-size:12px;"></textarea>

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
            mini.style.setProperty("display", "none", "important");
            panel.style.setProperty("display", "block", "important");
            panel.style.setProperty("visibility", "visible", "important");
            panel.style.setProperty("pointer-events", "auto", "important");
            updateStatus();
        };

        const closeBtn = document.getElementById("gea-close");

        closeBtn.addEventListener("mousedown", e => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        }, true);

        closeBtn.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            panel.style.setProperty("display", "none", "important");
            panel.style.setProperty("visibility", "hidden", "important");

            mini.style.setProperty("display", "block", "important");
            mini.style.setProperty("visibility", "visible", "important");
            mini.style.setProperty("opacity", "1", "important");
            mini.style.setProperty("pointer-events", "auto", "important");
            mini.style.setProperty("z-index", "1000001", "important");
        }, true);

        document.getElementById("gea-file").onchange = importCSVFile;
        document.getElementById("gea-import-btn").onclick = importCSVText;
        document.getElementById("gea-open-list-btn").onclick = () => location.href = PENDING_LIST_URL;
        document.getElementById("gea-load-si-btn").onclick = loadSIQueueFromCurrentPage;
        document.getElementById("gea-new-round-btn").onclick = startNewRound;
        document.getElementById("gea-resume-btn").onclick = resumeRound;
        document.getElementById("gea-stop-btn").onclick = () => stopRun("Stopped.");
        document.getElementById("gea-export-btn").onclick = exportResults;
        document.getElementById("gea-clear-btn").onclick = clearData;

        makeDraggable(panel, document.getElementById("gea-drag-header"));
        updateStatus();
    }

    function setupEscStop() {
        document.addEventListener("keydown", e => {
            if (e.key === "Escape") {
                stopRun("Stopped by Esc.");
                alert("GE Assistant stopped.");
            }
        });
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
        const siQueue = getJSON(LS_SI_QUEUE, []);
        const results = getJSON(LS_RESULTS, {});
        const counts = getJSON(LS_SI_COUNTS, {});
        const usedEmails = getJSON(LS_USED_EMAILS, []);

        const running = localStorage.getItem(LS_RUNNING) === "1";
        const siIndex = Number(localStorage.getItem(LS_SI_INDEX) || 0);
        const geIndex = Number(localStorage.getItem(LS_GE_INDEX) || 0);
        const current = getJSON(LS_CURRENT, null);

        const rows = Object.values(results);
        const clicked = rows.filter(r => r.status === "PROCEED_CLICKED").length;
        const full = rows.filter(r => r.status === "SI_FULL").length;
        const noProceed = rows.filter(r => r.status === "NO_PROCEED_SKIP_EMAIL").length;
        const failed = rows.filter(r => String(r.status || "").startsWith("FAILED")).length;

        const currentSI = siQueue[siIndex];
        const currentSICount = currentSI ? (counts[currentSI.id] || 0) : 0;

        const text = [
            `GE pool: ${pool.length}`,
            `SI queue: ${siQueue.length}`,
            `Current SI index: ${siIndex + 1}/${siQueue.length}`,
            `Current GE index: ${geIndex + 1}/${pool.length}`,
            `Current SI Proceed count this round: ${currentSICount}/${MAX_PROCEED_PER_SI_PER_ROUND}`,
            `Used emails this round: ${usedEmails.length}`,
            `Proceed clicked: ${clicked}`,
            `SI full hits: ${full}`,
            `No Proceed skipped: ${noProceed}`,
            `Failed: ${failed}`,
            `Running: ${running ? "Yes" : "No"}`,
            `Auto Proceed: ON`,
            current ? `Current: SI ${current.siId} | ${current.email}` : `Current: -`,
            extra
        ].join("\n");

        const status = document.getElementById("gea-status");
        if (status) status.textContent = text;

        const mini = document.getElementById("gea-mini");
        if (mini) mini.textContent = running ? `GE Running (${siIndex + 1}/${siQueue.length})` : "GE Assistant";

        const out = document.getElementById("gea-output");
        if (out) out.value = getLogText();
    }

    function log(msg) {
        const arr = getJSON(LS_LOG, []);
        arr.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
        localStorage.setItem(LS_LOG, JSON.stringify(arr.slice(0, 300)));
    }

    function getLogText() {
        return getJSON(LS_LOG, []).join("\n");
    }

    function loadSIQueueFromCurrentPage() {
        if (!location.href.includes("/special_issue_pending/list")) {
            alert("Please open the pending SI list page first.");
            log("Load SI queue failed: not on pending list page.");
            return;
        }

        const links = Array.from(document.querySelectorAll("a[href*='/special_issue/process/']"));
        const seen = new Set();
        const queue = [];

        links.forEach(a => {
            const href = a.href;
            const m = href.match(/\/special_issue\/process\/(\d+)/);

            if (!m) return;

            const id = m[1];

            if (seen.has(id)) return;

            seen.add(id);

            const row = a.closest("tr") || a.closest("div") || a.parentElement;
            const title = extractSITitle(row, a);

            queue.push({
                id,
                title,
                url: href.split("?")[0]
            });
        });

        if (!queue.length) {
            alert("No SI process links found on this page.");
            log("No SI links found.");
            return;
        }

        localStorage.setItem(LS_SI_QUEUE, JSON.stringify(queue));
        localStorage.setItem(LS_SI_INDEX, "0");
        localStorage.setItem(LS_GE_INDEX, "0");

        log(`Loaded ${queue.length} SI into queue.`);
        updateStatus();
    }

    function extractSITitle(row, a) {
        const text = row ? row.innerText || "" : "";
        const lines = text.split("\n").map(x => x.trim()).filter(Boolean);

        const likely = lines.find(l =>
            l.length > 20 &&
            !/^\d+$/.test(l) &&
            !/pending|website|date|owner|status|processes/i.test(l)
        );

        return likely || (a.innerText || "").trim() || "Untitled SI";
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
            alert("Please paste CSV.");
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

        log(`Imported ${deduped.length} GE.`);
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
            status: get("Status")
        };
    }

    function clean(s) {
        return String(s || "").toLowerCase().replace(/[\s_\-]/g, "");
    }

    function startNewRound() {
        const pool = getJSON(LS_GE_POOL, []);
        const siQueue = getJSON(LS_SI_QUEUE, []);

        if (!pool.length) {
            alert("Please import GE CSV first.");
            return;
        }

        if (!siQueue.length) {
            alert("Please open pending SI list and click Load SI Queue first.");
            return;
        }

        localStorage.setItem(LS_RESULTS, JSON.stringify({}));
        localStorage.setItem(LS_SI_COUNTS, JSON.stringify({}));
        localStorage.setItem(LS_USED_EMAILS, JSON.stringify([]));
        localStorage.setItem(LS_SI_INDEX, "0");
        localStorage.setItem(LS_GE_INDEX, "0");
        localStorage.setItem(LS_RUNNING, "1");
        localStorage.removeItem(LS_CURRENT);

        log("New round started. Counts/results/used emails reset.");
        updateStatus();
        dispatchNext();
    }

    function resumeRound() {
        const pool = getJSON(LS_GE_POOL, []);
        const siQueue = getJSON(LS_SI_QUEUE, []);

        if (!pool.length || !siQueue.length) {
            alert("Please import GE CSV and load SI queue first.");
            return;
        }

        localStorage.setItem(LS_RUNNING, "1");

        log("Resumed current round.");
        updateStatus();
        dispatchNext();
    }

    function stopRun(message = "Stopped.") {
        localStorage.setItem(LS_RUNNING, "0");
        localStorage.removeItem(LS_CURRENT);

        log(message);
        updateStatus(message);
    }

    function dispatchNext() {
        if (localStorage.getItem(LS_RUNNING) !== "1") return;

        const pool = getJSON(LS_GE_POOL, []);
        const siQueue = getJSON(LS_SI_QUEUE, []);
        const counts = getJSON(LS_SI_COUNTS, {});
        const results = getJSON(LS_RESULTS, {});
        const usedEmails = getJSON(LS_USED_EMAILS, []);

        let siIndex = Number(localStorage.getItem(LS_SI_INDEX) || 0);
        let geIndex = Number(localStorage.getItem(LS_GE_INDEX) || 0);

        while (siIndex < siQueue.length) {
            const si = siQueue[siIndex];
            const count = counts[si.id] || 0;

            if (count >= MAX_PROCEED_PER_SI_PER_ROUND) {
                log(`SI ${si.id} reached ${MAX_PROCEED_PER_SI_PER_ROUND}. Moving to next SI.`);
                siIndex++;
                geIndex = 0;
                continue;
            }

            while (geIndex < pool.length) {
                const ge = pool[geIndex];
                geIndex++;

                localStorage.setItem(LS_SI_INDEX, String(siIndex));
                localStorage.setItem(LS_GE_INDEX, String(geIndex));

                if (!shouldUseGE(ge, usedEmails)) continue;

                const key = makeResultKey(si.id, ge.email);

                if (results[key]?.checkedAt) continue;

                const current = {
                    siId: si.id,
                    siTitle: si.title,
                    siUrl: si.url,
                    email: ge.email
                };

                localStorage.setItem(LS_CURRENT, JSON.stringify(current));

                log(`Opening SI ${si.id} for ${ge.email}`);
                updateStatus();

                location.href = `${si.url}?geaRun=1&siId=${encodeURIComponent(si.id)}&email=${encodeURIComponent(ge.email)}`;

                return;
            }

            stopRun("All usable emails have been processed. Program stopped.");
            alert("All usable emails have been processed.");
            return;
        }

        stopRun("Round completed: no more SI/GE combinations.");
        alert("Round completed.");
    }

    function shouldUseGE(ge, usedEmails) {
        if (!ge || !ge.email) return false;

        const emailKey = String(ge.email || "").toLowerCase();

        if (usedEmails.includes(emailKey)) return false;

        if (shouldSkipStatus(ge.status)) {
            addUsedEmail(ge.email, "Skipped by CSV Status");
            return false;
        }

        const unlock = getUnlockTime(ge.invitedDate);

        if (unlock && Date.now() < unlock.getTime()) {
            addUsedEmail(ge.email, "Locked by Invited Date");
            return false;
        }

        return true;
    }

    function addUsedEmail(email, reason = "Used") {
        const key = String(email || "").toLowerCase();

        if (!key) return;

        const arr = getJSON(LS_USED_EMAILS, []);

        if (!arr.includes(key)) {
            arr.push(key);
            localStorage.setItem(LS_USED_EMAILS, JSON.stringify(arr));
            log(`Used email added: ${email}. Reason: ${reason}`);
        }
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

    function runOnSIPage() {
        const params = new URLSearchParams(location.search);

        if (params.get("geaRun") !== "1") return;

        const siId = params.get("siId");
        const email = params.get("email");

        if (!siId || !email) return;

        localStorage.setItem(LS_CURRENT, JSON.stringify({ siId, email }));

        log(`SI page loaded: SI ${siId}, ${email}`);
        updateStatus();

        closePopup();

        waitForElement(findEmailInput, input => {
            log(`Filling ${email}`);
            fillInput(input, email);

            waitForElement(() => findButtonByText("next"), nextBtn => {
                log("Click Next");
                clickElement(nextBtn);
                waitForProceedOrFailure(siId, email);
            }, 10000, () => {
                addUsedEmail(email, "FAILED_NO_NEXT");

                record(siId, email, {
                    status: "NO_PROCEED_SKIP_EMAIL",
                    eligible: false,
                    reason: "Next button not found; email used this round",
                    pageUrl: location.href
                });

                setTimeout(dispatchNext, 800);
            });
        }, 10000, () => {
            addUsedEmail(email, "FAILED_NO_EMAIL_INPUT");

            record(siId, email, {
                status: "NO_PROCEED_SKIP_EMAIL",
                eligible: false,
                reason: "E-Mail input not found; email used this round",
                pageUrl: location.href
            });

            setTimeout(dispatchNext, 800);
        });
    }

    function waitForProceedOrFailure(siId, email) {
        let count = 0;

        const timer = setInterval(() => {
            count++;

            closePopup();

            const proceedBtn = findButtonByText("proceed");
            const lower = (document.body.innerText || "").toLowerCase();

            const negative = detectNegative(lower);

            if (negative === "SI_FULL_5_GE") {
                clearInterval(timer);

                markSIFull(siId);
                moveToNextSI();

                record(siId, email, {
                    status: "SI_FULL",
                    eligible: false,
                    reason: "The number of proposed GE cannot exceed 5 in this SI",
                    pageUrl: location.href
                });

                log(`SI ${siId} is full. Moving to next SI. Email not marked used.`);

                setTimeout(dispatchNext, 800);
                return;
            }

            if (proceedBtn) {
                clearInterval(timer);

                log(`Click Proceed: SI ${siId}, ${email}`);

                incrementSICount(siId);
                addUsedEmail(email, "Proceed clicked");

                record(siId, email, {
                    status: "PROCEED_CLICKED",
                    eligible: true,
                    reason: "Proceed clicked; continue to next GE",
                    pageUrl: location.href
                });

                clickElement(proceedBtn);

                setTimeout(() => {
                    dispatchNext();
                }, 1500);

                return;
            }

            if (negative) {
                clearInterval(timer);

                addUsedEmail(email, negative);

                log(`No Proceed / Not eligible. Email used this round: ${email}. Reason: ${negative}`);

                record(siId, email, {
                    status: "NO_PROCEED_SKIP_EMAIL",
                    eligible: false,
                    reason: negative,
                    pageUrl: location.href
                });

                setTimeout(dispatchNext, 800);
                return;
            }

            if (count % 12 === 0) {
                log(`Waiting result: SI ${siId}, ${email}...`);
                updateStatus();
            }

            if (count > NO_PROCEED_TIMEOUT_TICKS) {
                clearInterval(timer);

                addUsedEmail(email, "No Proceed button appeared");

                log(`No Proceed. Email used this round: ${email}`);

                record(siId, email, {
                    status: "NO_PROCEED_SKIP_EMAIL",
                    eligible: false,
                    reason: "No Proceed button appeared; email used this round",
                    pageUrl: location.href
                });

                setTimeout(dispatchNext, 800);
            }
        }, 250);
    }

    function detectNegative(lower) {
        if (
            lower.includes("number of proposed ge cannot exceed 5") ||
            lower.includes("cannot exceed 5 at most in each special issue") ||
            lower.includes("proposed ge cannot exceed 5")
        ) {
            return "SI_FULL_5_GE";
        }

        const signals = [
            "already invited",
            "has been invited",
            "not allowed",
            "not allow",
            "cannot be invited",
            "can not be invited",
            "not eligible",
            "duplicate",
            "not found",
            "no record",
            "past 90 days",
            "past 90",
            "blocked",
            "block"
        ];

        return signals.find(s => lower.includes(s)) || "";
    }

    function markSIFull(siId) {
        const counts = getJSON(LS_SI_COUNTS, {});
        counts[siId] = MAX_PROCEED_PER_SI_PER_ROUND;
        localStorage.setItem(LS_SI_COUNTS, JSON.stringify(counts));
    }

function moveToNextSI() {
    const siIndex = Number(localStorage.getItem(LS_SI_INDEX) || 0);

    localStorage.setItem(LS_SI_INDEX, String(siIndex + 1));

    // 不重置 GE_INDEX，避免换 SI 后从头筛选同一批邮箱
    log(`Move to next SI index: ${siIndex + 2}; keep current GE index.`);
}

    function record(siId, email, data) {
        const results = getJSON(LS_RESULTS, {});
        const key = makeResultKey(siId, email);

        results[key] = {
            siId,
            email,
            ...data,
            checkedAt: new Date().toISOString()
        };

        localStorage.setItem(LS_RESULTS, JSON.stringify(results));
        updateStatus();
    }

    function makeResultKey(siId, email) {
        return `${siId}||${String(email || "").toLowerCase()}`;
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

            let score = 0;

            if (type === "email") score += 80;
            if (name.includes("email") || id.includes("email")) score += 70;
            if (context.includes("* e-mail") || context.includes("e-mail")) score += 60;

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
    if (!el) return;

    el.scrollIntoView({
        behavior: "instant",
        block: "center",
        inline: "center"
    });

    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(type => {
        el.dispatchEvent(new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window
        }));
    });

    if (typeof el.click === "function") {
        el.click();
    }
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

        const headers = splitCSVLine(lines[0]);

        return lines.slice(1).map(line => {
            const values = splitCSVLine(line);
            const obj = {};
            headers.forEach((h, i) => {
                obj[h] = values[i] || "";
            });
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

    function exportResults() {
        const results = Object.values(getJSON(LS_RESULTS, {}));

        if (!results.length) {
            alert("No results.");
            return;
        }

        const headers = ["siId", "email", "status", "eligible", "reason", "checkedAt", "pageUrl"];
        const csv = [
            headers.join(","),
            ...results.map(r => headers.map(h => csvEscape(r[h])).join(","))
        ].join("\n");

        GM_setClipboard(csv);

        const out = document.getElementById("gea-output");
        if (out) out.value = csv;

        alert("Results copied.");
    }

    function csvEscape(v) {
        const s = String(v ?? "");

        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;

        return s;
    }

    function clearData() {
        if (!confirm("Clear all local GE/SI data, results, counts, used emails, and log?")) return;

        [
            LS_GE_POOL,
            LS_SI_QUEUE,
            LS_RESULTS,
            LS_RUNNING,
            LS_LOG,
            LS_SI_INDEX,
            LS_GE_INDEX,
            LS_SI_COUNTS,
            LS_CURRENT,
            LS_USED_EMAILS
        ].forEach(k => localStorage.removeItem(k));

        updateStatus("Local data cleared.");
    }

    function getJSON(key, fallback) {
        try {
            return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
        } catch {
            return fallback;
        }
    }
})();
