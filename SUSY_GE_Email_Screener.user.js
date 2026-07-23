// ==UserScript==
// @name         SUSY GE Email Screener
// @namespace    MDPI-SUSY-Verification-Screener
// @version      1.0.0
// @description  逐个测试学者邮箱，记录触发滑动验证的邮箱，不点击 Proceed。
// @match        https://susy.mdpi.com/special_issue/process/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
    "use strict";

    const STORAGE = {
        emails: "susy_verify_emails_v1",
        index: "susy_verify_index_v1",
        hits: "susy_verify_hits_v1",
        results: "susy_verify_results_v1",
        running: "susy_verify_running_v1",
        processUrl: "susy_verify_process_url_v1",
        logs: "susy_verify_logs_v1"
    };

    const ELEMENT_TIMEOUT = 12000;
    const RESULT_TIMEOUT = 8000;
    const CHECK_INTERVAL = 200;

    ready(() => {
        createPanel();
        setupEscStop();

        if (!localStorage.getItem(STORAGE.processUrl)) {
            localStorage.setItem(STORAGE.processUrl, cleanPageUrl());
        }

        if (isRunning()) {
            setTimeout(processCurrentEmail, 600);
        }
    });

    function ready(callback) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, {
                once: true
            });
        } else {
            callback();
        }
    }

    function createPanel() {
        if (document.getElementById("svs-panel")) return;

        const style = document.createElement("style");

        style.textContent = `
            #svs-panel {
                position: fixed;
                right: 18px;
                bottom: 24px;
                width: 430px;
                max-height: 88vh;
                overflow: auto;
                z-index: 10000000;
                background: white;
                border: 1px solid #ccc;
                border-radius: 12px;
                box-shadow: 0 5px 20px rgba(0,0,0,.25);
                font-family: Arial, sans-serif;
                color: #222;
            }

            #svs-header {
                padding: 10px 12px;
                background: #eb2f96;
                color: white;
                border-radius: 12px 12px 0 0;
                font-weight: bold;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
                user-select: none;
            }

            #svs-body {
                padding: 12px;
                font-size: 13px;
            }

            .svs-btn {
                box-sizing: border-box;
                width: 100%;
                margin-top: 6px;
                padding: 8px 10px;
                border: none;
                border-radius: 8px;
                background: #f2f2f2;
                color: #333;
                cursor: pointer;
                text-align: left;
                font-weight: 600;
            }

            .svs-btn:hover {
                background: #e5e5e5;
            }

            .svs-primary {
                background: #eb2f96;
                color: white;
            }

            .svs-primary:hover {
                background: #c41d7f;
            }

            .svs-danger {
                background: #fff1f0;
                color: #a8071a;
            }

            .svs-textarea {
                box-sizing: border-box;
                width: 100%;
                border: 1px solid #ccc;
                border-radius: 8px;
                padding: 8px;
                resize: vertical;
                font-size: 12px;
            }
        `;

        document.head.appendChild(style);

        const panel = document.createElement("div");
        panel.id = "svs-panel";

        panel.innerHTML = `
            <div id="svs-header">
                <span>SUSY Verification Screener</span>
                <button id="svs-minimize"
                    style="border:none;background:white;color:#c41d7f;
                    border-radius:6px;padding:3px 10px;cursor:pointer;
                    font-weight:bold;">
                    −
                </button>
            </div>

            <div id="svs-body">
                <div style="
                    padding:8px;
                    margin-bottom:8px;
                    background:#fff0f6;
                    border:1px solid #ffd6e7;
                    border-radius:8px;
                    line-height:1.5;
                ">
                    逐个搜索邮箱，只记录触发滑动验证的邮箱。<br>
                    不处理验证，也不会点击 Proceed。
                </div>

                <input
                    id="svs-file"
                    type="file"
                    accept=".csv,.txt"
                    style="width:100%;margin-bottom:7px;"
                >

                <textarea
                    id="svs-input"
                    class="svs-textarea"
                    style="height:110px;"
                    placeholder="可粘贴 CSV、TXT，或者每行一个邮箱"
                ></textarea>

                <button id="svs-import" class="svs-btn">
                    导入邮箱
                </button>

                <button id="svs-start" class="svs-btn svs-primary">
                    从头开始筛选
                </button>

                <button id="svs-resume" class="svs-btn">
                    继续筛选
                </button>

                <button id="svs-stop" class="svs-btn svs-danger">
                    停止
                </button>

                <button id="svs-copy" class="svs-btn">
                    复制需要验证的邮箱
                </button>

                <button id="svs-export" class="svs-btn">
                    复制完整结果 CSV
                </button>

                <button id="svs-clear" class="svs-btn svs-danger">
                    清空本地数据
                </button>

                <div
                    id="svs-status"
                    style="
                        margin-top:9px;
                        padding:8px;
                        background:#fafafa;
                        border:1px solid #ddd;
                        border-radius:8px;
                        white-space:pre-wrap;
                        line-height:1.5;
                    "
                ></div>

                <div style="margin-top:10px;font-weight:bold;">
                    需要滑动验证的邮箱
                </div>

                <textarea
                    id="svs-output"
                    class="svs-textarea"
                    readonly
                    style="height:180px;margin-top:5px;"
                ></textarea>

                <details style="margin-top:8px;">
                    <summary style="cursor:pointer;font-weight:bold;">
                        运行日志
                    </summary>

                    <textarea
                        id="svs-log"
                        class="svs-textarea"
                        readonly
                        style="height:140px;margin-top:5px;font-size:11px;"
                    ></textarea>
                </details>
            </div>
        `;

        document.body.appendChild(panel);

        makeDraggable(
            panel,
            document.getElementById("svs-header")
        );

        document.getElementById("svs-minimize").onclick = () => {
            const body = document.getElementById("svs-body");

            body.style.display =
                body.style.display === "none"
                    ? "block"
                    : "none";
        };

        document.getElementById("svs-file").onchange =
            importFile;

        document.getElementById("svs-import").onclick =
            importTextarea;

        document.getElementById("svs-start").onclick =
            startNewRun;

        document.getElementById("svs-resume").onclick =
            resumeRun;

        document.getElementById("svs-stop").onclick = () =>
            stopRun("用户手动停止");

        document.getElementById("svs-copy").onclick =
            copyVerificationEmails;

        document.getElementById("svs-export").onclick =
            copyFullResults;

        document.getElementById("svs-clear").onclick =
            clearData;

        updatePanel();
    }

    function setupEscStop() {
        document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                stopRun("按下 Esc 停止");
            }
        });
    }

    function makeDraggable(panel, header) {
        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        header.addEventListener("mousedown", event => {
            if (event.target.id === "svs-minimize") return;

            const rect = panel.getBoundingClientRect();

            dragging = true;
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;

            panel.style.left = rect.left + "px";
            panel.style.top = rect.top + "px";
            panel.style.right = "auto";
            panel.style.bottom = "auto";

            event.preventDefault();
        });

        document.addEventListener("mousemove", event => {
            if (!dragging) return;

            panel.style.left =
                Math.max(0, event.clientX - offsetX) + "px";

            panel.style.top =
                Math.max(0, event.clientY - offsetY) + "px";
        });

        document.addEventListener("mouseup", () => {
            dragging = false;
        });
    }

    function importFile(event) {
        const file = event.target.files?.[0];

        if (!file) return;

        const reader = new FileReader();

        reader.onload = () => {
            const text = String(reader.result || "");

            document.getElementById("svs-input").value = text;

            saveImportedEmails(text);
        };

        reader.onerror = () => {
            alert("文件读取失败。");
        };

        reader.readAsText(file, "UTF-8");
    }

    function importTextarea() {
        const text =
            document.getElementById("svs-input").value;

        if (!text.trim()) {
            alert("请先粘贴邮箱或导入文件。");
            return;
        }

        saveImportedEmails(text);
    }

    function saveImportedEmails(text) {
        const emails = extractEmails(text);

        if (!emails.length) {
            alert("没有识别到有效邮箱。");
            return;
        }

        localStorage.setItem(
            STORAGE.emails,
            JSON.stringify(emails)
        );

        localStorage.setItem(STORAGE.index, "0");

        log(`成功导入 ${emails.length} 个去重邮箱。`);

        updatePanel();

        alert(`已导入 ${emails.length} 个邮箱。`);
    }

    function extractEmails(text) {
        const matches =
            String(text || "").match(
                /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
            ) || [];

        const seen = new Set();
        const emails = [];

        matches.forEach(rawEmail => {
            const email = rawEmail
                .trim()
                .replace(/[;,]+$/, "");

            const key = email.toLowerCase();

            if (!seen.has(key)) {
                seen.add(key);
                emails.push(email);
            }
        });

        return emails;
    }

    function startNewRun() {
        const emails = getJSON(STORAGE.emails, []);

        if (!emails.length) {
            alert("请先导入邮箱。");
            return;
        }

        localStorage.setItem(STORAGE.index, "0");
        localStorage.setItem(STORAGE.hits, "[]");
        localStorage.setItem(STORAGE.results, "[]");
        localStorage.setItem(STORAGE.logs, "[]");
        localStorage.setItem(
            STORAGE.processUrl,
            cleanPageUrl()
        );
        localStorage.setItem(STORAGE.running, "1");

        log("开始新的筛选任务。");

        updatePanel();

        processCurrentEmail();
    }

    function resumeRun() {
        const emails = getJSON(STORAGE.emails, []);

        if (!emails.length) {
            alert("请先导入邮箱。");
            return;
        }

        localStorage.setItem(
            STORAGE.processUrl,
            cleanPageUrl()
        );

        localStorage.setItem(STORAGE.running, "1");

        log("继续筛选任务。");

        updatePanel();

        processCurrentEmail();
    }

    function stopRun(reason) {
        localStorage.setItem(STORAGE.running, "0");

        log(reason);

        updatePanel();
    }

    function isRunning() {
        return (
            localStorage.getItem(STORAGE.running) === "1"
        );
    }

    async function processCurrentEmail() {
        if (!isRunning()) return;

        const emails = getJSON(STORAGE.emails, []);

        const index = Number(
            localStorage.getItem(STORAGE.index) || 0
        );

        if (index >= emails.length) {
            finishRun();
            return;
        }

        const email = emails[index];

        log(
            `正在检查 ${index + 1}/${emails.length}：${email}`
        );

        updatePanel(`当前邮箱：${email}`);

        try {
            const emailInput = await waitForElement(
                findEmailInput,
                ELEMENT_TIMEOUT
            );

            fillInput(emailInput, email);

            const nextButton = await waitForElement(
                () => findButtonByText("next"),
                ELEMENT_TIMEOUT
            );

            clickElement(nextButton);

            const result = await detectResult(
                RESULT_TIMEOUT
            );

            saveResult(email, result);
        } catch (error) {
            saveResult(email, {
                status: "ERROR",
                reason:
                    error?.message ||
                    "没有找到邮箱输入框或 Next 按钮"
            });
        }

        moveToNextEmail();
    }

    function detectResult(timeout) {
        return new Promise(resolve => {
            const start = Date.now();

            const timer = setInterval(() => {
                /*
                 * 检测到滑动验证：
                 * 只记录，不等待，也不尝试处理验证。
                 */
                if (hasDragVerification()) {
                    clearInterval(timer);

                    resolve({
                        status: "NEEDS_VERIFICATION",
                        reason: "检测到滑动验证"
                    });

                    return;
                }

                /*
                 * 检测到 Proceed：
                 * 表示该邮箱没有触发验证。
                 * 不点击 Proceed。
                 */
                const proceedButton =
                    findButtonByText("proceed");

                if (
                    proceedButton &&
                    !isDisabledLike(proceedButton)
                ) {
                    clearInterval(timer);

                    resolve({
                        status: "NO_VERIFICATION",
                        reason:
                            "检测到 Proceed，但未点击"
                    });

                    return;
                }

                const pageMessage = detectPageMessage();

                if (pageMessage) {
                    clearInterval(timer);

                    resolve({
                        status: "OTHER_RESULT",
                        reason: pageMessage
                    });

                    return;
                }

                if (Date.now() - start >= timeout) {
                    clearInterval(timer);

                    resolve({
                        status: "TIMEOUT",
                        reason:
                            `等待 ${Math.round(
                                timeout / 1000
                            )} 秒后未检测到验证或 Proceed`
                    });
                }
            }, CHECK_INTERVAL);
        });
    }

    function hasDragVerification() {
        /*
         * 第一种方式：
         * 根据验证组件常见的 class 和 id 检测。
         */
        const selectors = [
            "[class*='slider' i]",
            "[id*='slider' i]",
            "[class*='captcha' i]",
            "[id*='captcha' i]",
            "[class*='verify' i]",
            "[id*='verify' i]"
        ];

        for (const selector of selectors) {
            const elements =
                document.querySelectorAll(selector);

            for (const element of elements) {
                if (
                    !isVisible(element) ||
                    isOwnPanelElement(element)
                ) {
                    continue;
                }

                const text = normalizeText(element);

                if (
                    text.includes("drag") ||
                    text.includes("slide") ||
                    text.includes("verify") ||
                    text.includes("拖动") ||
                    text.includes("滑动") ||
                    text.includes("验证")
                ) {
                    return true;
                }
            }
        }

        /*
         * 第二种方式：
         * 根据页面显示文字检测。
         */
        const phrases = [
            "please drag",
            "drag to verify",
            "slide to verify",
            "drag the slider",
            "complete the verification",
            "please complete verification",
            "请拖动",
            "拖动滑块",
            "滑动验证"
        ];

        const elements = Array.from(
            document.querySelectorAll("body *")
        );

        return elements.some(element => {
            if (
                !isVisible(element) ||
                isOwnPanelElement(element)
            ) {
                return false;
            }

            const text = normalizeText(element);

            /*
             * 避免直接匹配整个 body 的超长文本，
             * 减少误判。
             */
            if (!text || text.length > 300) {
                return false;
            }

            return phrases.some(phrase =>
                text.includes(phrase)
            );
        });
    }

    function detectPageMessage() {
        const pageText = normalizeText(document.body);

        const knownMessages = [
            "the number of proposed ge cannot exceed 5",
            "cannot exceed 5 at most in each special issue",
            "email address is invalid",
            "e-mail address is invalid",
            "already been invited",
            "already invited",
            "cannot be invited",
            "not found"
        ];

        const matched = knownMessages.find(message =>
            pageText.includes(message)
        );

        return matched || "";
    }

    function saveResult(email, result) {
        const results = getJSON(
            STORAGE.results,
            []
        );

        results.push({
            email,
            status: result.status,
            reason: result.reason,
            checkedAt: new Date().toISOString(),
            pageUrl: location.href
        });

        localStorage.setItem(
            STORAGE.results,
            JSON.stringify(results)
        );

        if (result.status === "NEEDS_VERIFICATION") {
            const hits = getJSON(STORAGE.hits, []);

            const alreadyExists = hits.some(
                item =>
                    String(item.email).toLowerCase() ===
                    email.toLowerCase()
            );

            if (!alreadyExists) {
                hits.push({
                    email,
                    checkedAt: new Date().toISOString()
                });

                localStorage.setItem(
                    STORAGE.hits,
                    JSON.stringify(hits)
                );
            }

            log(`需要验证：${email}`);
        } else {
            log(
                `${result.status}：${email}；${result.reason}`
            );
        }

        updatePanel();
    }

    function moveToNextEmail() {
        const currentIndex = Number(
            localStorage.getItem(STORAGE.index) || 0
        );

        localStorage.setItem(
            STORAGE.index,
            String(currentIndex + 1)
        );

        updatePanel();

        if (!isRunning()) return;

        /*
         * 每检查完一个邮箱后重新打开当前
         * Special Issue Process 页面，
         * 清除上一个邮箱留下的验证框或结果。
         */
        setTimeout(() => {
            const processUrl =
                localStorage.getItem(
                    STORAGE.processUrl
                ) || cleanPageUrl();

            location.href = processUrl;
        }, 400);
    }

    function finishRun() {
        localStorage.setItem(STORAGE.running, "0");

        const hits = getJSON(STORAGE.hits, []);

        const emailList = hits
            .map(item => item.email)
            .join("\n");

        log(
            `筛选完成，共发现 ${hits.length} 个需要验证的邮箱。`
        );

        updatePanel("筛选完成。");

        if (emailList) {
            GM_setClipboard(emailList);
        }

        alert(
            `筛选完成。\n需要验证的邮箱：${hits.length} 个` +
            (
                emailList
                    ? "\n邮箱名单已经复制到剪贴板。"
                    : ""
            )
        );
    }

    function copyVerificationEmails() {
        const hits = getJSON(STORAGE.hits, []);

        const text = hits
            .map(item => item.email)
            .join("\n");

        if (!text) {
            alert("目前没有需要验证的邮箱。");
            return;
        }

        GM_setClipboard(text);

        alert(`已复制 ${hits.length} 个邮箱。`);
    }

    function copyFullResults() {
        const results = getJSON(
            STORAGE.results,
            []
        );

        if (!results.length) {
            alert("目前没有检查结果。");
            return;
        }

        const headers = [
            "email",
            "status",
            "reason",
            "checkedAt",
            "pageUrl"
        ];

        const csv = [
            headers.join(","),
            ...results.map(row =>
                headers
                    .map(header =>
                        csvEscape(row[header])
                    )
                    .join(",")
            )
        ].join("\n");

        GM_setClipboard(csv);

        alert("完整结果 CSV 已复制到剪贴板。");
    }

    function clearData() {
        const confirmed = confirm(
            "确定清空脚本保存的邮箱、进度和结果吗？"
        );

        if (!confirmed) return;

        Object.values(STORAGE).forEach(key => {
            localStorage.removeItem(key);
        });

        localStorage.setItem(
            STORAGE.processUrl,
            cleanPageUrl()
        );

        updatePanel("本地数据已清空。");
    }

    function updatePanel(extraMessage = "") {
        const emails = getJSON(
            STORAGE.emails,
            []
        );

        const hits = getJSON(
            STORAGE.hits,
            []
        );

        const index = Number(
            localStorage.getItem(STORAGE.index) || 0
        );

        const running = isRunning();

        const statusText = [
            `邮箱总数：${emails.length}`,
            `已处理：${Math.min(
                index,
                emails.length
            )}/${emails.length}`,
            `需要验证：${hits.length}`,
            `运行状态：${running ? "运行中" : "已停止"}`,
            extraMessage
        ]
            .filter(Boolean)
            .join("\n");

        const statusElement =
            document.getElementById("svs-status");

        const outputElement =
            document.getElementById("svs-output");

        const logElement =
            document.getElementById("svs-log");

        if (statusElement) {
            statusElement.textContent = statusText;
        }

        if (outputElement) {
            outputElement.value = hits
                .map(item => item.email)
                .join("\n");
        }

        if (logElement) {
            logElement.value = getJSON(
                STORAGE.logs,
                []
            ).join("\n");
        }
    }

    function log(message) {
        const logs = getJSON(
            STORAGE.logs,
            []
        );

        logs.unshift(
            `[${new Date().toLocaleTimeString()}] ${message}`
        );

        localStorage.setItem(
            STORAGE.logs,
            JSON.stringify(logs.slice(0, 500))
        );
    }

    function findEmailInput() {
        const inputs = Array.from(
            document.querySelectorAll("input")
        ).filter(input =>
            !input.disabled &&
            isVisible(input) &&
            !isOwnPanelElement(input)
        );

        let bestInput = null;
        let bestScore = -1;

        inputs.forEach(input => {
            const type =
                String(input.type || "").toLowerCase();

            const name =
                String(input.name || "").toLowerCase();

            const id =
                String(input.id || "").toLowerCase();

            const placeholder =
                String(
                    input.placeholder || ""
                ).toLowerCase();

            let score = 0;

            if (type === "email") {
                score += 100;
            }

            if (name.includes("email")) {
                score += 80;
            }

            if (id.includes("email")) {
                score += 80;
            }

            if (
                placeholder.includes("email") ||
                placeholder.includes("e-mail")
            ) {
                score += 60;
            }

            if (score > bestScore) {
                bestScore = score;
                bestInput = input;
            }
        });

        return bestScore > 0
            ? bestInput
            : null;
    }

    function findButtonByText(text) {
        const target =
            String(text).trim().toLowerCase();

        const elements = Array.from(
            document.querySelectorAll(
                "button, input[type='button'], input[type='submit'], a"
            )
        ).filter(element =>
            isVisible(element) &&
            !isOwnPanelElement(element)
        );

        return (
            elements.find(element => {
                const elementText = String(
                    element.innerText ||
                    element.value ||
                    element.textContent ||
                    ""
                )
                    .trim()
                    .toLowerCase();

                return elementText === target;
            }) || null
        );
    }

    function fillInput(input, value) {
        input.focus();

        const setter =
            Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                "value"
            )?.set;

        if (setter) {
            setter.call(input, value);
        } else {
            input.value = value;
        }

        input.dispatchEvent(
            new Event("input", {
                bubbles: true
            })
        );

        input.dispatchEvent(
            new Event("change", {
                bubbles: true
            })
        );

        input.dispatchEvent(
            new Event("blur", {
                bubbles: true
            })
        );
    }

    function clickElement(element) {
        element.dispatchEvent(
            new MouseEvent("mousedown", {
                bubbles: true
            })
        );

        element.dispatchEvent(
            new MouseEvent("mouseup", {
                bubbles: true
            })
        );

        element.click();
    }

    function isDisabledLike(element) {
        if (!element) return true;

        const style =
            window.getComputedStyle(element);

        const className =
            String(
                element.className || ""
            ).toLowerCase();

        return Boolean(
            element.disabled ||
            element.getAttribute("disabled") !== null ||
            element.getAttribute("aria-disabled") ===
                "true" ||
            className.includes("disabled") ||
            style.pointerEvents === "none" ||
            style.display === "none" ||
            style.visibility === "hidden" ||
            Number(style.opacity) < 0.3
        );
    }

    function isVisible(element) {
        if (!element || !element.isConnected) {
            return false;
        }

        const style =
            window.getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity) > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    function isOwnPanelElement(element) {
        return Boolean(
            element?.closest?.("#svs-panel")
        );
    }

    function normalizeText(element) {
        return String(
            element?.innerText ||
            element?.textContent ||
            ""
        )
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function waitForElement(getter, timeout) {
        return new Promise((resolve, reject) => {
            const start = Date.now();

            const timer = setInterval(() => {
                let element = null;

                try {
                    element = getter();
                } catch (error) {
                    clearInterval(timer);
                    reject(error);
                    return;
                }

                if (element) {
                    clearInterval(timer);
                    resolve(element);
                    return;
                }

                if (Date.now() - start >= timeout) {
                    clearInterval(timer);

                    reject(
                        new Error(
                            "等待页面元素超时"
                        )
                    );
                }
            }, 100);
        });
    }

    function cleanPageUrl() {
        return (
            location.origin +
            location.pathname
        );
    }

    function csvEscape(value) {
        const text = String(value ?? "");

        if (/[",\n]/.test(text)) {
            return (
                '"' +
                text.replace(/"/g, '""') +
                '"'
            );
        }

        return text;
    }

    function getJSON(key, fallback) {
        try {
            return JSON.parse(
                localStorage.getItem(key) ||
                JSON.stringify(fallback)
            );
        } catch {
            return fallback;
        }
    }
})();
