// ==UserScript==
// @name         SUSY GE Email Screener
// @namespace    MDPI-SUSY-Verification-Screener
// @icon         https://pub.mdpi-res.com/img/design/mdpi-pub-logo-black-small1.svg
// @version      2.1
// @description  仅在启动筛选的当前标签页中使用同一个 SUSY SI 页面筛选邮箱，不影响其他特刊标签页。
// @match        https://susy.mdpi.com/special_issue/process/*
// @grant        GM_setClipboard
// @run-at       document-idle
// @author       Jiali Tang
// ==/UserScript==

(function () {
    "use strict";

    /*
     * 工作逻辑：
     *
     * 1. 在当前 Special Issue 页面填写邮箱。
     * 2. 点击 Next。
     * 3. 短暂等待拖拉验证出现。
     * 4. 出现拖拉验证：记录邮箱。
     * 5. 未出现拖拉验证：直接跳过。
     * 6. 刷新同一个 Special Issue 页面，继续下一个邮箱。
     *
     * 重要：
     * - 不处理或绕过拖拉验证；
     * - 不点击 Proceed；
     * - 不切换 Special Issue；
     * - 筛选只在当前标签页中运行；
     * - 其他特刊标签页不会自动开始筛选。
     */

    /*
     * 邮箱、进度和结果继续使用 localStorage。
     *
     * 这样即使关闭页面，筛选结果也不会立刻消失。
     */
    const STORAGE = {
        emails: "susy_fast_screen_emails_v2",
        index: "susy_fast_screen_index_v2",
        hits: "susy_fast_screen_hits_v2",
        results: "susy_fast_screen_results_v2",
        logs: "susy_fast_screen_logs_v2"
    };

    /*
     * 运行状态和固定页面使用 sessionStorage。
     *
     * sessionStorage 的特点：
     * - 当前标签页刷新后仍然保留；
     * - 不会与其他标签页共享；
     * - 因此其他特刊标签页不会自动运行筛选程序。
     */
    const SESSION_STORAGE = {
        running: "susy_fast_screen_running_v3_tab",
        processUrl: "susy_fast_screen_process_url_v3_tab"
    };

    /*
     * 点击 Next 后等待验证框出现的时间。
     *
     * 如果偶尔漏掉验证，可以改成 1500 或 2000。
     */
    const VERIFICATION_WAIT_MS = 1200;

    /*
     * 等待邮箱输入框和 Next 按钮的最长时间。
     */
    const ELEMENT_TIMEOUT_MS = 10000;

    /*
     * 验证框检测频率。
     */
    const CHECK_INTERVAL_MS = 80;

    /*
     * 每个邮箱处理完后，多久刷新当前筛选页面。
     */
    const NEXT_EMAIL_DELAY_MS = 120;

    /*
     * 面板颜色。
     */
    const THEME_COLOR = "#72B89A";
    const THEME_DARK = "#55997D";
    const THEME_LIGHT = "#EAF6F0";
    const THEME_BORDER = "#B8DDCD";

    let processingLocked = false;

    ready(() => {
        createPanel();
        setupEscStop();

        /*
         * 当前标签页第一次打开时，
         * 暂时把当前页面记录为本标签页的页面。
         *
         * 真正点击“开始筛选”时会再次锁定。
         */
        if (!sessionStorage.getItem(SESSION_STORAGE.processUrl)) {
            sessionStorage.setItem(
                SESSION_STORAGE.processUrl,
                getCurrentCleanUrl()
            );
        }

        /*
         * 只有同时满足以下条件才自动继续：
         *
         * 1. 当前标签页的运行状态为运行中；
         * 2. 当前页面就是这个标签页锁定的筛选页面。
         *
         * 其他新打开的特刊标签页没有运行状态，
         * 所以不会自动开始处理邮箱。
         */
        if (
            isRunning() &&
            isCurrentProcessPage()
        ) {
            setTimeout(
                processCurrentEmail,
                300
            );
        }
    });

    function ready(callback) {
        if (document.readyState === "loading") {
            document.addEventListener(
                "DOMContentLoaded",
                callback,
                {
                    once: true
                }
            );
        } else {
            callback();
        }
    }

    function createPanel() {
        if (
            document.getElementById("svs-panel") ||
            document.getElementById("svs-mini")
        ) {
            return;
        }

        const style = document.createElement("style");

        style.textContent = `
            #svs-mini {
                position: fixed;
                right: 18px;
                top: 50%;
                transform: translateY(-50%);
                width: 58px;
                height: 58px;
                padding: 0;
                border: none;
                border-radius: 50%;
                background: ${THEME_COLOR};
                color: white;
                cursor: pointer;
                z-index: 10000001;
                box-shadow: 0 4px 15px rgba(0,0,0,.25);
                font-family: Arial, sans-serif;
                font-size: 12px;
                font-weight: bold;
                line-height: 1.15;
                transition:
                    transform .15s ease,
                    background .15s ease,
                    box-shadow .15s ease;
            }

            #svs-mini:hover {
                background: ${THEME_DARK};
                transform: translateY(-50%) scale(1.07);
                box-shadow: 0 6px 18px rgba(0,0,0,.30);
            }

            #svs-mini.svs-running {
                box-shadow:
                    0 0 0 4px rgba(114,184,154,.22),
                    0 4px 15px rgba(0,0,0,.25);
            }

            #svs-panel {
                position: fixed;
                right: 88px;
                top: 50%;
                transform: translateY(-50%);
                width: 430px;
                max-height: 88vh;
                overflow: auto;
                z-index: 10000000;
                display: none;
                background: white;
                border: 1px solid ${THEME_BORDER};
                border-radius: 12px;
                box-shadow: 0 5px 20px rgba(0,0,0,.25);
                font-family: Arial, sans-serif;
                color: #222;
            }

            #svs-header {
                padding: 10px 12px;
                background: ${THEME_COLOR};
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
                background: ${THEME_COLOR};
                color: white;
            }

            .svs-primary:hover {
                background: ${THEME_DARK};
            }

            .svs-danger {
                background: #fff1f0;
                color: #a8071a;
            }

            .svs-danger:hover {
                background: #ffd8d4;
            }

            .svs-textarea {
                box-sizing: border-box;
                width: 100%;
                border: 1px solid #ccc;
                border-radius: 8px;
                padding: 8px;
                resize: vertical;
                font-size: 12px;
                font-family: Arial, sans-serif;
            }

            .svs-textarea:focus {
                outline: none;
                border-color: ${THEME_COLOR};
                box-shadow: 0 0 0 2px rgba(114,184,154,.16);
            }
        `;

        document.head.appendChild(style);

        const miniButton =
            document.createElement("button");

        miniButton.id = "svs-mini";
        miniButton.type = "button";
        miniButton.innerHTML = "邮箱<br>筛选";
        miniButton.title = "打开邮箱验证筛选器";

        const panel =
            document.createElement("div");

        panel.id = "svs-panel";

        panel.innerHTML = `
            <div id="svs-header">
                <span>SUSY 邮箱验证筛选器</span>

                <button
                    id="svs-minimize"
                    type="button"
                    style="
                        border:none;
                        background:white;
                        color:${THEME_DARK};
                        border-radius:6px;
                        padding:4px 10px;
                        cursor:pointer;
                        font-weight:bold;
                    "
                >
                    收起
                </button>
            </div>

            <div id="svs-body">
                <div
                    style="
                        padding:8px;
                        margin-bottom:8px;
                        background:${THEME_LIGHT};
                        border:1px solid ${THEME_BORDER};
                        border-radius:8px;
                        line-height:1.5;
                    "
                >
                    仅在当前标签页使用固定 SI 页面筛选。<br>
                    其他特刊标签页可以正常操作。<br>
                    不点击 Proceed，也不会切换 SI。
                </div>

                <input
                    id="svs-file"
                    type="file"
                    accept=".csv,.txt"
                    style="
                        width:100%;
                        margin-bottom:7px;
                    "
                >

                <textarea
                    id="svs-input"
                    class="svs-textarea"
                    style="height:105px;"
                    placeholder="粘贴 CSV、TXT，或者每行一个邮箱"
                ></textarea>

                <button
                    id="svs-import"
                    class="svs-btn"
                >
                    导入邮箱
                </button>

                <button
                    id="svs-start"
                    class="svs-btn svs-primary"
                >
                    从头开始快速筛选
                </button>

                <button
                    id="svs-resume"
                    class="svs-btn"
                >
                    继续筛选
                </button>

                <button
                    id="svs-stop"
                    class="svs-btn svs-danger"
                >
                    停止当前标签页筛选
                </button>

                <button
                    id="svs-copy"
                    class="svs-btn"
                >
                    复制可进入验证的邮箱
                </button>

                <button
                    id="svs-export"
                    class="svs-btn"
                >
                    复制完整筛选结果 CSV
                </button>

                <button
                    id="svs-clear"
                    class="svs-btn svs-danger"
                >
                    清空本地数据
                </button>

                <div
                    id="svs-status"
                    style="
                        margin-top:9px;
                        padding:8px;
                        background:${THEME_LIGHT};
                        border:1px solid ${THEME_BORDER};
                        border-radius:8px;
                        white-space:pre-wrap;
                        line-height:1.5;
                    "
                ></div>

                <div
                    style="
                        margin-top:10px;
                        font-weight:bold;
                        color:${THEME_DARK};
                    "
                >
                    出现拖拉验证的邮箱
                </div>

                <textarea
                    id="svs-output"
                    class="svs-textarea"
                    readonly
                    style="
                        height:180px;
                        margin-top:5px;
                    "
                ></textarea>

                <details style="margin-top:8px;">
                    <summary
                        style="
                            cursor:pointer;
                            font-weight:bold;
                            color:${THEME_DARK};
                        "
                    >
                        运行日志
                    </summary>

                    <textarea
                        id="svs-log"
                        class="svs-textarea"
                        readonly
                        style="
                            height:140px;
                            margin-top:5px;
                            font-size:11px;
                        "
                    ></textarea>
                </details>
            </div>
        `;

        document.body.appendChild(miniButton);
        document.body.appendChild(panel);

        miniButton.addEventListener(
            "click",
            () => {
                miniButton.style.display = "none";
                panel.style.display = "block";
                updatePanel();
            }
        );

        document
            .getElementById("svs-minimize")
            .addEventListener(
                "click",
                event => {
                    event.preventDefault();
                    event.stopPropagation();

                    panel.style.display = "none";
                    miniButton.style.display = "block";
                }
            );

        makeDraggable(
            panel,
            document.getElementById("svs-header")
        );

        document.getElementById(
            "svs-file"
        ).onchange = importFile;

        document.getElementById(
            "svs-import"
        ).onclick = importTextarea;

        document.getElementById(
            "svs-start"
        ).onclick = startNewRun;

        document.getElementById(
            "svs-resume"
        ).onclick = resumeRun;

        document.getElementById(
            "svs-stop"
        ).onclick = () => {
            stopRun("用户手动停止当前标签页筛选");
        };

        document.getElementById(
            "svs-copy"
        ).onclick = copyHitEmails;

        document.getElementById(
            "svs-export"
        ).onclick = copyFullResults;

        document.getElementById(
            "svs-clear"
        ).onclick = clearData;

        updatePanel();
    }

    function setupEscStop() {
        document.addEventListener(
            "keydown",
            event => {
                if (event.key === "Escape") {
                    stopRun("按下 Esc 停止当前标签页筛选");
                }
            }
        );
    }

    function makeDraggable(panel, header) {
        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        header.addEventListener(
            "mousedown",
            event => {
                if (
                    event.target.id ===
                    "svs-minimize"
                ) {
                    return;
                }

                const rect =
                    panel.getBoundingClientRect();

                dragging = true;

                offsetX =
                    event.clientX - rect.left;

                offsetY =
                    event.clientY - rect.top;

                panel.style.left =
                    rect.left + "px";

                panel.style.top =
                    rect.top + "px";

                panel.style.right = "auto";
                panel.style.bottom = "auto";
                panel.style.transform = "none";

                event.preventDefault();
            }
        );

        document.addEventListener(
            "mousemove",
            event => {
                if (!dragging) {
                    return;
                }

                const maxLeft =
                    window.innerWidth -
                    panel.offsetWidth;

                const maxTop =
                    window.innerHeight -
                    panel.offsetHeight;

                panel.style.left =
                    Math.min(
                        Math.max(
                            0,
                            event.clientX - offsetX
                        ),
                        Math.max(
                            0,
                            maxLeft
                        )
                    ) + "px";

                panel.style.top =
                    Math.min(
                        Math.max(
                            0,
                            event.clientY - offsetY
                        ),
                        Math.max(
                            0,
                            maxTop
                        )
                    ) + "px";
            }
        );

        document.addEventListener(
            "mouseup",
            () => {
                dragging = false;
            }
        );
    }

    function importFile(event) {
        const file =
            event.target.files?.[0];

        if (!file) {
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            const text =
                String(reader.result || "");

            const input =
                document.getElementById(
                    "svs-input"
                );

            if (input) {
                input.value = text;
            }

            saveImportedEmails(text);
        };

        reader.onerror = () => {
            alert("文件读取失败。");
        };

        reader.readAsText(
            file,
            "UTF-8"
        );
    }

    function importTextarea() {
        const input =
            document.getElementById(
                "svs-input"
            );

        const text =
            input
                ? input.value
                : "";

        if (!text.trim()) {
            alert(
                "请先粘贴邮箱或导入文件。"
            );

            return;
        }

        saveImportedEmails(text);
    }

    function saveImportedEmails(text) {
        const emails =
            extractEmails(text);

        if (!emails.length) {
            alert(
                "没有识别到有效邮箱。"
            );

            return;
        }

        localStorage.setItem(
            STORAGE.emails,
            JSON.stringify(emails)
        );

        localStorage.setItem(
            STORAGE.index,
            "0"
        );

        log(
            `成功导入 ${emails.length} 个去重邮箱。`
        );

        updatePanel();

        alert(
            `已导入 ${emails.length} 个邮箱。`
        );
    }

    function extractEmails(text) {
        const matches =
            String(text || "").match(
                /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
            ) || [];

        const seen = new Set();
        const emails = [];

        matches.forEach(rawEmail => {
            const email =
                rawEmail
                    .trim()
                    .replace(
                        /[;,]+$/,
                        ""
                    );

            const key =
                email.toLowerCase();

            if (!seen.has(key)) {
                seen.add(key);
                emails.push(email);
            }
        });

        return emails;
    }

    function startNewRun() {
        const emails = getJSON(
            STORAGE.emails,
            []
        );

        if (!emails.length) {
            alert(
                "请先导入邮箱。"
            );

            return;
        }

        /*
         * 锁定当前标签页当前打开的特刊页面。
         */
        sessionStorage.setItem(
            SESSION_STORAGE.processUrl,
            getCurrentCleanUrl()
        );

        localStorage.setItem(
            STORAGE.index,
            "0"
        );

        localStorage.setItem(
            STORAGE.hits,
            "[]"
        );

        localStorage.setItem(
            STORAGE.results,
            "[]"
        );

        localStorage.setItem(
            STORAGE.logs,
            "[]"
        );

        /*
         * 运行状态仅属于当前标签页。
         */
        sessionStorage.setItem(
            SESSION_STORAGE.running,
            "1"
        );

        processingLocked = false;

        log(
            "开始新的快速筛选任务。"
        );

        updatePanel();

        processCurrentEmail();
    }

    function resumeRun() {
        const emails = getJSON(
            STORAGE.emails,
            []
        );

        if (!emails.length) {
            alert(
                "请先导入邮箱。"
            );

            return;
        }

        /*
         * “继续筛选”时，把当前页面设为本标签页的筛选页面。
         */
        sessionStorage.setItem(
            SESSION_STORAGE.processUrl,
            getCurrentCleanUrl()
        );

        sessionStorage.setItem(
            SESSION_STORAGE.running,
            "1"
        );

        processingLocked = false;

        log(
            "继续快速筛选。"
        );

        updatePanel();

        processCurrentEmail();
    }

    function stopRun(reason) {
        /*
         * 只停止当前标签页。
         */
        sessionStorage.setItem(
            SESSION_STORAGE.running,
            "0"
        );

        processingLocked = false;

        log(reason);

        updatePanel(reason);
    }

    function isRunning() {
        return (
            sessionStorage.getItem(
                SESSION_STORAGE.running
            ) === "1"
        );
    }

    /*
     * 检查当前页面是否是本标签页锁定的筛选页面。
     */
    function isCurrentProcessPage() {
        const processUrl =
            sessionStorage.getItem(
                SESSION_STORAGE.processUrl
            );

        return Boolean(
            processUrl &&
            processUrl === getCurrentCleanUrl()
        );
    }

    async function processCurrentEmail() {
        if (!isRunning()) {
            return;
        }

        /*
         * 即使当前标签页因为某种原因跳到了其他特刊，
         * 也不会在其他页面自动填写和点击。
         */
        if (!isCurrentProcessPage()) {
            stopRun(
                "当前页面不是已锁定的筛选页面，已停止自动处理。"
            );

            return;
        }

        if (processingLocked) {
            return;
        }

        processingLocked = true;

        const emails = getJSON(
            STORAGE.emails,
            []
        );

        const index = Number(
            localStorage.getItem(
                STORAGE.index
            ) || 0
        );

        if (index >= emails.length) {
            processingLocked = false;
            finishRun();
            return;
        }

        const email =
            emails[index];

        log(
            `正在检查 ${index + 1}/${emails.length}：${email}`
        );

        updatePanel(
            `当前邮箱：${email}`
        );

        try {
            const emailInput =
                await waitForElement(
                    findEmailInput,
                    ELEMENT_TIMEOUT_MS
                );

            /*
             * 清空旧邮箱。
             */
            fillInput(
                emailInput,
                ""
            );

            await sleep(30);

            /*
             * 填写当前邮箱。
             */
            fillInput(
                emailInput,
                email
            );

            await sleep(30);

            const nextButton =
                await waitForElement(
                    () =>
                        findButtonByText(
                            "next"
                        ),
                    ELEMENT_TIMEOUT_MS
                );

            clickElement(nextButton);

            /*
             * 只检测拖拉验证是否出现。
             * 不点击或处理验证组件。
             */
            const hasVerification =
                await waitForDragVerification(
                    VERIFICATION_WAIT_MS
                );

            if (hasVerification) {
                saveResult(
                    email,
                    {
                        status:
                            "NEEDS_VERIFICATION",
                        eligible: true,
                        reason:
                            "检测到拖拉验证"
                    }
                );
            } else {
                saveResult(
                    email,
                    {
                        status:
                            "NO_VERIFICATION",
                        eligible: false,
                        reason:
                            `点击 Next 后 ${VERIFICATION_WAIT_MS} 毫秒内未检测到拖拉验证`
                    }
                );
            }
        } catch (error) {
            saveResult(
                email,
                {
                    status: "ERROR",
                    eligible: false,
                    reason:
                        error?.message ||
                        "没有找到邮箱输入框或 Next 按钮"
                }
            );
        }

        processingLocked = false;

        moveToNextEmail();
    }

    function waitForDragVerification(
        timeoutMs
    ) {
        return new Promise(resolve => {
            const start = Date.now();

            /*
             * 页面上可能已经存在验证框，
             * 因此先检查一次。
             */
            if (hasDragVerification()) {
                resolve(true);
                return;
            }

            let completed = false;

            const finish = result => {
                if (completed) {
                    return;
                }

                completed = true;

                observer.disconnect();
                clearInterval(interval);
                clearTimeout(timeout);

                resolve(result);
            };

            /*
             * 监听页面元素变化。
             */
            const observer =
                new MutationObserver(() => {
                    if (
                        hasDragVerification()
                    ) {
                        finish(true);
                    }
                });

            observer.observe(
                document.body,
                {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: [
                        "class",
                        "style",
                        "hidden",
                        "aria-hidden"
                    ]
                }
            );

            /*
             * 同时轮询，避免组件只改变文本或显示状态。
             */
            const interval =
                setInterval(() => {
                    if (
                        hasDragVerification()
                    ) {
                        finish(true);
                        return;
                    }

                    if (
                        Date.now() - start >=
                        timeoutMs
                    ) {
                        finish(false);
                    }
                }, CHECK_INTERVAL_MS);

            const timeout =
                setTimeout(() => {
                    finish(
                        hasDragVerification()
                    );
                }, timeoutMs);
        });
    }

    function hasDragVerification() {
        /*
         * 常见拖动验证组件的选择器。
         */
        const selectors = [
            "[class*='slider' i]",
            "[id*='slider' i]",
            "[class*='captcha' i]",
            "[id*='captcha' i]",
            "[class*='verify' i]",
            "[id*='verify' i]",
            "[class*='drag' i]",
            "[id*='drag' i]",
            "iframe[src*='captcha' i]",
            "iframe[src*='verify' i]"
        ];

        for (const selector of selectors) {
            let elements = [];

            try {
                elements = Array.from(
                    document.querySelectorAll(
                        selector
                    )
                );
            } catch {
                continue;
            }

            for (const element of elements) {
                if (
                    !isVisible(element) ||
                    isOwnScriptElement(element)
                ) {
                    continue;
                }

                const text =
                    normalizeText(element);

                const classAndId = (
                    String(
                        element.className || ""
                    ) +
                    " " +
                    String(
                        element.id || ""
                    )
                ).toLowerCase();

                if (
                    text.includes("drag") ||
                    text.includes("slide") ||
                    text.includes("verify") ||
                    text.includes("captcha") ||
                    text.includes("拖动") ||
                    text.includes("滑动") ||
                    text.includes("验证") ||
                    classAndId.includes("slider") ||
                    classAndId.includes("captcha") ||
                    classAndId.includes("verify")
                ) {
                    return true;
                }
            }
        }

        /*
         * 页面提示文字。
         */
        const phrases = [
            "please drag",
            "drag to verify",
            "slide to verify",
            "drag the slider",
            "complete the verification",
            "please complete verification",
            "security verification",
            "请拖动",
            "拖动滑块",
            "请按住滑块",
            "滑动验证",
            "安全验证"
        ];

        const elements = Array.from(
            document.querySelectorAll(
                "body *"
            )
        );

        return elements.some(element => {
            if (
                !isVisible(element) ||
                isOwnScriptElement(element)
            ) {
                return false;
            }

            const text =
                normalizeText(element);

            /*
             * 避免读取整页超长文本导致误判。
             */
            if (
                !text ||
                text.length > 350
            ) {
                return false;
            }

            return phrases.some(
                phrase =>
                    text.includes(phrase)
            );
        });
    }

    function saveResult(email, result) {
        const results = getJSON(
            STORAGE.results,
            []
        );

        results.push({
            email,
            status: result.status,
            eligible: result.eligible,
            reason: result.reason,
            checkedAt:
                new Date().toISOString(),
            pageUrl:
                sessionStorage.getItem(
                    SESSION_STORAGE.processUrl
                ) ||
                getCurrentCleanUrl()
        });

        localStorage.setItem(
            STORAGE.results,
            JSON.stringify(results)
        );

        if (
            result.status ===
            "NEEDS_VERIFICATION"
        ) {
            const hits = getJSON(
                STORAGE.hits,
                []
            );

            const alreadyExists =
                hits.some(item =>
                    String(
                        item.email
                    ).toLowerCase() ===
                    email.toLowerCase()
                );

            if (!alreadyExists) {
                hits.push({
                    email,
                    checkedAt:
                        new Date().toISOString()
                });

                localStorage.setItem(
                    STORAGE.hits,
                    JSON.stringify(hits)
                );
            }

            log(
                `✓ 记录：${email}`
            );
        } else if (
            result.status ===
            "NO_VERIFICATION"
        ) {
            log(
                `跳过：${email}`
            );
        } else {
            log(
                `错误：${email}；${result.reason}`
            );
        }

        updatePanel();
    }

    function moveToNextEmail() {
        const currentIndex = Number(
            localStorage.getItem(
                STORAGE.index
            ) || 0
        );

        localStorage.setItem(
            STORAGE.index,
            String(currentIndex + 1)
        );

        updatePanel();

        if (!isRunning()) {
            return;
        }

        setTimeout(() => {
            /*
             * 再次确认运行状态，
             * 防止用户在延迟期间点击停止。
             */
            if (!isRunning()) {
                return;
            }

            const processUrl =
                sessionStorage.getItem(
                    SESSION_STORAGE.processUrl
                );

            if (!processUrl) {
                stopRun(
                    "没有找到当前标签页的固定筛选页面。"
                );

                return;
            }

            /*
             * 当前筛选标签页始终返回同一个特刊页面。
             *
             * 其他标签页完全不受影响。
             */
            location.replace(processUrl);
        }, NEXT_EMAIL_DELAY_MS);
    }

    function finishRun() {
        sessionStorage.setItem(
            SESSION_STORAGE.running,
            "0"
        );

        processingLocked = false;

        const hits = getJSON(
            STORAGE.hits,
            []
        );

        const emailList =
            hits
                .map(item => item.email)
                .join("\n");

        log(
            `筛选完成，共记录 ${hits.length} 个出现拖拉验证的邮箱。`
        );

        updatePanel(
            "筛选完成。"
        );

        if (emailList) {
            GM_setClipboard(emailList);
        }

        /*
         * 完成后展开面板。
         */
        const panel =
            document.getElementById(
                "svs-panel"
            );

        const mini =
            document.getElementById(
                "svs-mini"
            );

        if (panel && mini) {
            mini.style.display = "none";
            panel.style.display = "block";
        }

        alert(
            `筛选完成。\n` +
            `出现拖拉验证的邮箱：${hits.length} 个` +
            (
                emailList
                    ? "\n邮箱名单已复制到剪贴板。"
                    : ""
            )
        );
    }

    function copyHitEmails() {
        const hits = getJSON(
            STORAGE.hits,
            []
        );

        const text =
            hits
                .map(item => item.email)
                .join("\n");

        if (!text) {
            alert(
                "目前没有记录到出现拖拉验证的邮箱。"
            );

            return;
        }

        GM_setClipboard(text);

        alert(
            `已复制 ${hits.length} 个邮箱。`
        );
    }

    function copyFullResults() {
        const results = getJSON(
            STORAGE.results,
            []
        );

        if (!results.length) {
            alert(
                "目前没有筛选结果。"
            );

            return;
        }

        const headers = [
            "email",
            "status",
            "eligible",
            "reason",
            "checkedAt",
            "pageUrl"
        ];

        const csv = [
            headers.join(","),
            ...results.map(row =>
                headers
                    .map(header =>
                        csvEscape(
                            row[header]
                        )
                    )
                    .join(",")
            )
        ].join("\n");

        GM_setClipboard(csv);

        alert(
            "完整筛选结果 CSV 已复制到剪贴板。"
        );
    }

    function clearData() {
        const confirmed = confirm(
            "确定清空邮箱、筛选进度和结果吗？"
        );

        if (!confirmed) {
            return;
        }

        /*
         * 清空共享的邮箱和结果数据。
         */
        Object.values(
            STORAGE
        ).forEach(key => {
            localStorage.removeItem(key);
        });

        /*
         * 清空当前标签页的运行状态。
         */
        Object.values(
            SESSION_STORAGE
        ).forEach(key => {
            sessionStorage.removeItem(key);
        });

        processingLocked = false;

        /*
         * 清空后把当前页面作为默认页面，
         * 但不会自动运行。
         */
        sessionStorage.setItem(
            SESSION_STORAGE.processUrl,
            getCurrentCleanUrl()
        );

        updatePanel(
            "本地数据已清空。"
        );
    }

    function updatePanel(
        extraMessage = ""
    ) {
        const emails = getJSON(
            STORAGE.emails,
            []
        );

        const hits = getJSON(
            STORAGE.hits,
            []
        );

        const results = getJSON(
            STORAGE.results,
            []
        );

        const skipped =
            results.filter(
                item =>
                    item.status ===
                    "NO_VERIFICATION"
            ).length;

        const errors =
            results.filter(
                item =>
                    item.status ===
                    "ERROR"
            ).length;

        const index = Number(
            localStorage.getItem(
                STORAGE.index
            ) || 0
        );

        const running =
            isRunning();

        const fixedPage =
            sessionStorage.getItem(
                SESSION_STORAGE.processUrl
            ) ||
            getCurrentCleanUrl();

        const currentPageMatches =
            fixedPage ===
            getCurrentCleanUrl();

        const statusText = [
            `邮箱总数：${emails.length}`,

            `已处理：${Math.min(
                index,
                emails.length
            )}/${emails.length}`,

            `出现拖拉验证：${hits.length}`,

            `未出现验证并跳过：${skipped}`,

            `错误：${errors}`,

            `验证等待时间：${VERIFICATION_WAIT_MS} ms`,

            `当前标签页状态：${
                running
                    ? "运行中"
                    : "已停止"
            }`,

            `当前页面是否为筛选页面：${
                currentPageMatches
                    ? "是"
                    : "否"
            }`,

            `固定页面：${fixedPage}`,

            extraMessage
        ]
            .filter(Boolean)
            .join("\n");

        const statusElement =
            document.getElementById(
                "svs-status"
            );

        const outputElement =
            document.getElementById(
                "svs-output"
            );

        const logElement =
            document.getElementById(
                "svs-log"
            );

        const mini =
            document.getElementById(
                "svs-mini"
            );

        if (statusElement) {
            statusElement.textContent =
                statusText;
        }

        if (outputElement) {
            outputElement.value =
                hits
                    .map(
                        item => item.email
                    )
                    .join("\n");
        }

        if (logElement) {
            logElement.value =
                getJSON(
                    STORAGE.logs,
                    []
                ).join("\n");
        }

        if (mini) {
            mini.innerHTML =
                running
                    ? `${Math.min(
                        index,
                        emails.length
                    )}/${emails.length}<br>筛选`
                    : "邮箱<br>筛选";

            mini.classList.toggle(
                "svs-running",
                running
            );

            mini.title =
                running
                    ? `当前标签页正在筛选 ${Math.min(
                        index,
                        emails.length
                    )}/${emails.length}`
                    : "打开邮箱验证筛选器";
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
            JSON.stringify(
                logs.slice(0, 500)
            )
        );
    }

    function findEmailInput() {
        const inputs =
            Array.from(
                document.querySelectorAll(
                    "input"
                )
            ).filter(input =>
                !input.disabled &&
                isVisible(input) &&
                !isOwnScriptElement(input)
            );

        let bestInput = null;
        let bestScore = -1;

        inputs.forEach(input => {
            const type =
                String(
                    input.type || ""
                ).toLowerCase();

            const name =
                String(
                    input.name || ""
                ).toLowerCase();

            const id =
                String(
                    input.id || ""
                ).toLowerCase();

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

        return (
            bestScore > 0
                ? bestInput
                : null
        );
    }

    function findButtonByText(text) {
        const target =
            String(text)
                .trim()
                .toLowerCase();

        const elements =
            Array.from(
                document.querySelectorAll(
                    "button, input[type='button'], input[type='submit'], a"
                )
            ).filter(element =>
                isVisible(element) &&
                !isOwnScriptElement(element)
            );

        return (
            elements.find(element => {
                const elementText =
                    String(
                        element.innerText ||
                        element.value ||
                        element.textContent ||
                        ""
                    )
                        .trim()
                        .toLowerCase();

                return (
                    elementText === target
                );
            }) ||
            null
        );
    }

    function fillInput(input, value) {
        input.focus();

        /*
         * 使用原生 value setter，
         * 兼容 React、Vue 等前端框架监听输入值。
         */
        const setter =
            Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                "value"
            )?.set;

        if (setter) {
            setter.call(
                input,
                value
            );
        } else {
            input.value = value;
        }

        input.dispatchEvent(
            new Event(
                "input",
                {
                    bubbles: true
                }
            )
        );

        input.dispatchEvent(
            new Event(
                "change",
                {
                    bubbles: true
                }
            )
        );
    }

    function clickElement(element) {
        element.dispatchEvent(
            new MouseEvent(
                "mousedown",
                {
                    bubbles: true
                }
            )
        );

        element.dispatchEvent(
            new MouseEvent(
                "mouseup",
                {
                    bubbles: true
                }
            )
        );

        element.click();
    }

    function isVisible(element) {
        if (
            !element ||
            !element.isConnected
        ) {
            return false;
        }

        const style =
            window.getComputedStyle(
                element
            );

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

    function isOwnScriptElement(element) {
        return Boolean(
            element?.closest?.(
                "#svs-panel"
            ) ||
            element?.closest?.(
                "#svs-mini"
            )
        );
    }

    function normalizeText(element) {
        return String(
            element?.innerText ||
            element?.textContent ||
            ""
        )
            .replace(
                /\s+/g,
                " "
            )
            .trim()
            .toLowerCase();
    }

    function waitForElement(
        getter,
        timeout
    ) {
        return new Promise(
            (resolve, reject) => {
                const start =
                    Date.now();

                const timer =
                    setInterval(() => {
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

                        if (
                            Date.now() - start >=
                            timeout
                        ) {
                            clearInterval(timer);

                            reject(
                                new Error(
                                    "等待页面元素超时"
                                )
                            );
                        }
                    }, 80);
            }
        );
    }

    function sleep(milliseconds) {
        return new Promise(resolve => {
            setTimeout(
                resolve,
                milliseconds
            );
        });
    }

    function getCurrentCleanUrl() {
        /*
         * 不保留查询参数和 hash，
         * 只保留域名与页面路径。
         */
        return (
            location.origin +
            location.pathname
        );
    }

    function csvEscape(value) {
        const text =
            String(value ?? "");

        if (
            /[",\n]/.test(text)
        ) {
            return (
                '"' +
                text.replace(
                    /"/g,
                    '""'
                ) +
                '"'
            );
        }

        return text;
    }

    function getJSON(
        key,
        fallback
    ) {
        try {
            return JSON.parse(
                localStorage.getItem(
                    key
                ) ||
                JSON.stringify(
                    fallback
                )
            );
        } catch {
            return fallback;
        }
    }
})();
