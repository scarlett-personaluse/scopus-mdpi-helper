// ==UserScript==
// @name         MDPI GE Auto-Add
// @icon         https://pub.mdpi-res.com/img/design/mdpi-pub-logo-black-small1.svg?da3a8dcae975a41c?1779439589
// @namespace    MDPI-GE-Auto-Add-Assistant
// @version      2.0
// @description  Multi-SI GE auto-add assistant: only load Pending GE invitation SIs; switch SI only by official exceed-5 warning; pause for manual slider verification and continue after Proceed appears; faster no-Proceed skip.
// @author       Jiali Tang
// @match        https://susy.mdpi.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const PENDING_LIST_URL = "https://susy.mdpi.com/special_issue_pending/list?page_limit=100&sort_field=special_issue_pending.date_update&sort=DESC";

    const FULL_WARNING_TEXT = "The number of proposed GE cannot exceed 5 at most in each special issue.";

    const UNLOCK_DAYS = 90;

    // 25 × 200 ms = 5 s.
    // If neither Proceed nor slider verification appears within this period, skip this email.
    const NO_PROCEED_TIMEOUT_TICKS = 25;
    const NO_PROCEED_CHECK_INTERVAL_MS = 200;

    // 1800 × 200 ms = 360 s = 6 min.
    // Once slider verification is detected, wait much longer for the user to complete it.
    const DRAG_MANUAL_TIMEOUT_TICKS = 1800;

    const LS_GE_POOL = "mdpi_ge_pool_v40";
    const LS_SI_QUEUE = "mdpi_si_queue_v40";
    const LS_RESULTS = "mdpi_ge_results_v40";
    const LS_RUNNING = "mdpi_ge_running_v40";
    const LS_LOG = "mdpi_ge_log_v40";
    const LS_SI_INDEX = "mdpi_si_index_v40";
    const LS_GE_INDEX = "mdpi_ge_index_v40";
    const LS_SI_COUNTS = "mdpi_si_round_counts_v40";
    const LS_CURRENT = "mdpi_current_task_v40";
    const LS_USED_EMAILS = "mdpi_used_emails_this_round_v40";

    ready(() => {
        createPanel();
        setupEscStop();

        if (location.href.includes("/special_issue/process/")) {
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
                    默认自动 Proceed；只加载 Status = Pending GE invitation 的 SI；只有页面出现“GE cannot exceed 5”满员提示时才换下一个 SI；如果出现滑动验证，会弹窗提醒你手动拖动，完成后继续自动 Proceed。无 Proceed/无滑动验证约 5 秒后自动跳过。
                </div>

                <input type="file" id="gea-file" accept=".csv" style="margin-bottom:6px;width:100%;">

                <button class="gea-btn" id="gea-import-btn">Import CSV Text</button>
                <button class="gea-btn" id="gea-open-list-btn">Open Pending SI List</button>
                <button class="gea-btn" id="gea-load-si-btn">Load Pending GE Invitation SI Queue</button>
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
                hideManualDragNotice();
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
            `Current SI Proceed count this round: ${currentSICount} (info only; switch by page warning)`,
            `Used emails this round: ${usedEmails.length}`,
            `Proceed clicked: ${clicked}`,
            `SI full hits: ${full}`,
            `No Proceed skipped: ${noProceed}`,
            `Failed: ${failed}`,
            `Running: ${running ? "Yes" : "No"}`,
            `SI Status Filter: Pending GE invitation only`,
            `Auto Proceed: ON`,
            `Manual verification mode: popup + manual drag + wait for Proceed`,
            `No-Proceed fast skip: about 5 seconds`,
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

            const row = a.closest("tr") || a.closest("div") || a.parentElement;
            const rowText = row ? (row.innerText || "") : "";

            if (!isPendingGEInvitationStatus(rowText)) {
                log(`Skip SI ${id}: Status is not Pending GE invitation.`);
                return;
            }

            seen.add(id);

            const title = extractSITitle(row, a);

            queue.push({
                id,
                title,
                url: href.split("?")[0],
                status: "Pending GE invitation"
            });
        });

        if (!queue.length) {
            alert("No SI with Status = Pending GE invitation found on this page.");
            log("No Pending GE invitation SI found.");
            return;
        }

        localStorage.setItem(LS_SI_QUEUE, JSON.stringify(queue));
        localStorage.setItem(LS_SI_INDEX, "0");
        localStorage.setItem(LS_GE_INDEX, "0");

        log(`Loaded ${queue.length} Pending GE invitation SI into queue.`);
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

    function isPendingGEInvitationStatus(rowText) {
        const text = String(rowText || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();

        return text.includes("pending ge invitation");
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
            alert("Please open pending SI list and click Load Pending GE Invitation SI Queue first.");
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

        hideManualDragNotice();
        log(message);
        updateStatus(message);
    }

    function dispatchNext() {
        if (localStorage.getItem(LS_RUNNING) !== "1") return;

        const pool = getJSON(LS_GE_POOL, []);
        const siQueue = getJSON(LS_SI_QUEUE, []);
        const results = getJSON(LS_RESULTS, {});
        const usedEmails = getJSON(LS_USED_EMAILS, []);

        let siIndex = Number(localStorage.getItem(LS_SI_INDEX) || 0);
        let geIndex = Number(localStorage.getItem(LS_GE_INDEX) || 0);

        while (siIndex < siQueue.length) {
            const si = siQueue[siIndex];

            if (si.status && !isPendingGEInvitationStatus(si.status)) {
                log(`Skip cached SI ${si.id}: Status is not Pending GE invitation.`);
                siIndex++;
                localStorage.setItem(LS_SI_INDEX, String(siIndex));
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

        waitForElement(findEmailInput, input => {
            log(`Filling ${email}`);
            fillInput(input, email);

            waitForElement(() => findButtonByText("next"), nextBtn => {
                log("Click Next");
                clickElement(nextBtn);
                waitForProceedOrSkip(siId, email);
            }, 10000, () => {
                addUsedEmail(email, "FAILED_NO_NEXT");

                record(siId, email, {
                    status: "NO_PROCEED_SKIP_EMAIL",
                    eligible: false,
                    reason: "Next button not found; email used this round",
                    pageUrl: location.href
                });

                setTimeout(dispatchNext, 300);
            });
        }, 10000, () => {
            addUsedEmail(email, "FAILED_NO_EMAIL_INPUT");

            record(siId, email, {
                status: "NO_PROCEED_SKIP_EMAIL",
                eligible: false,
                reason: "E-Mail input not found; email used this round",
                pageUrl: location.href
            });

            setTimeout(dispatchNext, 300);
        });
    }

    function waitForProceedOrSkip(siId, email) {
        let count = 0;
        let dragDetected = false;
        let dragAlerted = false;

        const timer = setInterval(() => {
            count++;

            const lower = (document.body.innerText || "").toLowerCase();

            // 1. SI full: move to next SI.
            if (hasSIFullWarning(lower)) {
                clearInterval(timer);

                hideManualDragNotice();

                markSIFull(siId);
                moveToNextSI();

                record(siId, email, {
                    status: "SI_FULL",
                    eligible: false,
                    reason: "SI full, move to next SI",
                    pageUrl: location.href
                });

                setTimeout(dispatchNext, 300);
                return;
            }

            // 2. Slider verification detected: alert user and wait.
            if (hasDragVerification()) {
                dragDetected = true;

                if (!dragAlerted) {
                    dragAlerted = true;

                    log("Manual slider verification detected. Waiting for user to complete it.");
                    updateStatus("Detected manual slider verification. Please drag it manually. The script will continue after Proceed appears.");

                    showManualDragNotice();

                    setTimeout(() => {
                        alert("检测到滑动验证。请回到网页界面手动拖动。拖动完成后，脚本会自动点击 Proceed。");
                    }, 100);
                }

                // Once slider verification is detected, do not use the normal no-Proceed skip logic.
                if (count > DRAG_MANUAL_TIMEOUT_TICKS) {
                    clearInterval(timer);

                    hideManualDragNotice();

                    addUsedEmail(email, "Manual slider verification timeout");

                    record(siId, email, {
                        status: "NO_PROCEED_SKIP_EMAIL",
                        eligible: false,
                        reason: "Manual slider verification timeout; no Proceed appeared",
                        pageUrl: location.href
                    });

                    setTimeout(dispatchNext, 300);
                }

                return;
            }

            // 3. Proceed appears and is clickable: click it.
            const proceedBtn = findButtonByText("proceed");

            if (proceedBtn && !isDisabledLike(proceedBtn)) {
                clearInterval(timer);

                hideManualDragNotice();

                log(`Click Proceed: SI ${siId}, ${email}`);

                clickElement(proceedBtn);

                incrementSICount(siId);
                addUsedEmail(email, "Proceed clicked");

                record(siId, email, {
                    status: "PROCEED_CLICKED",
                    eligible: true,
                    reason: dragDetected
                        ? "Proceed clicked automatically after manual slider verification"
                        : "Proceed clicked automatically",
                    pageUrl: location.href
                });

                setTimeout(dispatchNext, 2500);
                return;
            }

            // 4. If slider verification was detected before, keep waiting for Proceed.
            if (dragDetected) {
                updateStatus("Manual slider verification was detected. Waiting for Proceed after your manual drag...");
                return;
            }

            // 5. Only skip when no slider verification and no Proceed appear after fast waiting.
            if (count > NO_PROCEED_TIMEOUT_TICKS) {
                clearInterval(timer);

                hideManualDragNotice();

                addUsedEmail(email, "No Proceed");

                record(siId, email, {
                    status: "NO_PROCEED_SKIP_EMAIL",
                    eligible: false,
                    reason: "No Proceed and no slider verification appeared after fast waiting",
                    pageUrl: location.href
                });

                setTimeout(dispatchNext, 300);
            }
        }, NO_PROCEED_CHECK_INTERVAL_MS);
    }

    function hasSIFullWarning(lowerText) {
        const lower = String(lowerText || "").toLowerCase();
        const warning = FULL_WARNING_TEXT.toLowerCase();

        return lower.includes(warning) ||
            lower.includes("number of proposed ge cannot exceed 5") ||
            lower.includes("cannot exceed 5 at most in each special issue") ||
            lower.includes("proposed ge cannot exceed 5");
    }

    function hasDragVerification() {
        const nodes = Array.from(document.querySelectorAll("body *")).filter(el => {
            if (!el || !el.offsetParent) return false;

            // Exclude this userscript's own panel, mini button, and notice.
            if (
                el.closest("#gea-panel") ||
                el.closest("#gea-mini") ||
                el.closest("#gea-manual-drag-notice")
            ) {
                return false;
            }

            return true;
        });

        return nodes.some(el => {
            const text = String(el.innerText || el.textContent || "").toLowerCase().trim();
            if (!text) return false;

            return (
                text.includes("please drag") ||
                text.includes("drag to verify") ||
                text.includes("slide to verify") ||
                text.includes("drag the slider") ||
                text.includes("拖动") ||
                text.includes("请拖动") ||
                text.includes("滑动验证")
            );
        });
    }

    function showManualDragNotice() {
        let box = document.getElementById("gea-manual-drag-notice");

        if (!box) {
            box = document.createElement("div");
            box.id = "gea-manual-drag-notice";

            Object.assign(box.style, {
                position: "fixed",
                right: "24px",
                top: "24px",
                zIndex: "10000000",
                background: "#fffbe6",
                color: "#5c3b00",
                border: "2px solid #faad14",
                borderRadius: "10px",
                padding: "14px 18px",
                fontSize: "15px",
                fontWeight: "700",
                boxShadow: "0 4px 18px rgba(0,0,0,0.28)",
                maxWidth: "380px",
                lineHeight: "1.5"
            });

            document.body.appendChild(box);
        }

        box.innerHTML = `
            ⚠️ 检测到滑动验证<br>
            请回到网页界面手动拖动。<br>
            拖动完成后，脚本会自动点击 Proceed。
        `;

        box.style.display = "block";
    }

    function hideManualDragNotice() {
        const box = document.getElementById("gea-manual-drag-notice");
        if (box) box.style.display = "none";
    }

    function isDisabledLike(el) {
        if (!el) return true;

        const disabledAttr = el.disabled ||
            el.getAttribute("disabled") !== null ||
            el.getAttribute("aria-disabled") === "true";

        const cls = String(el.className || "").toLowerCase();

        const disabledClass = cls.includes("disabled") ||
            cls.includes("disable") ||
            cls.includes("btn-disabled");

        const style = window.getComputedStyle(el);

        const disabledStyle = style.pointerEvents === "none" ||
            style.visibility === "hidden" ||
            style.display === "none" ||
            Number(style.opacity) < 0.3;

        return disabledAttr || disabledClass || disabledStyle;
    }

    function markSIFull(siId) {
        const counts = getJSON(LS_SI_COUNTS, {});
        counts[siId] = Math.max(counts[siId] || 0, 5);
        localStorage.setItem(LS_SI_COUNTS, JSON.stringify(counts));
    }

    function moveToNextSI() {
        const siIndex = Number(localStorage.getItem(LS_SI_INDEX) || 0);
        localStorage.setItem(LS_SI_INDEX, String(siIndex + 1));
        log(`Move to next SI index: ${siIndex + 2}; keep current GE index.`);
    }

    function incrementSICount(siId) {
        const counts = getJSON(LS_SI_COUNTS, {});
        counts[siId] = (counts[siId] || 0) + 1;
        localStorage.setItem(LS_SI_COUNTS, JSON.stringify(counts));
        log(`SI ${siId} Proceed count: ${counts[siId]} (info only; switch by page warning)`);
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
            const name = (input.name || "").toLowerCase();
            const id = (input.id || "").toLowerCase();
            const type = (input.type || "").toLowerCase();

            let score = 0;

            if (type === "email") score += 80;
            if (name.includes("email") || id.includes("email")) score += 70;

            if (score > bestScore) {
                bestScore = score;
                best = input;
            }
        });

        return best;
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

        hideManualDragNotice();
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
