// ==UserScript==
// @name         Processes SI Title Matcher
// @namespace    Processes-SI-Title-Matcher
// @version      4.6.3
// @author       Jiali Tang
// @icon         https://pub-mdpi-res.com/img/journals/processes-logo-sq.png
// @description  Match scholars with Processes Special Issues and generate literature search queries
// @match        *://*/*
// @homepageURL  https://github.com/scarlett-personaluse/scopus-mdpi-helper
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.deepseek.com
// @connect      gist.githubusercontent.com
// ==/UserScript==

(function () {
    "use strict";

    // =========================================================
    // Basic settings
    // =========================================================

    const MODEL = "deepseek-chat";

    const API_KEY_STORAGE = "processes_deepseek_api_key";
    const API_KEY_TIME_STORAGE = "processes_deepseek_api_key_time";
    const API_KEY_VALID_MS = 7 * 24 * 60 * 60 * 1000;

    const SI_LIST_URL =
        "https://gist.githubusercontent.com/scarlett-personaluse/53c0316fb23a0fd021e753f5192a4e5f/raw/SI%20list-scarlett";

    const STORAGE_KEY = "processes_existing_si_titles_cache";
    const CACHE_TIME_KEY = "processes_existing_si_titles_cache_time";
    const SI_HASH_KEY = "processes_existing_si_titles_hash";

    const UI_IDS = {
        MINI_BUTTON: "processes-si-mini-button",
        PANEL: "processes-si-panel",
        DRAG_HANDLE: "processes-si-drag-handle",
        MINIMIZE: "processes-si-minimize",
        OUTPUT: "processes-si-output",
        STATUS: "processes-si-status",
        CLEANER_INPUT: "processes-si-cleaner-input"
    };

    // =========================================================
    // Startup
    // =========================================================

    registerMenuCommands();
    initializeUI();

    function registerMenuCommands() {
        GM_registerMenuCommand(
            "Set / Reset DeepSeek API Key",
            setApiKey
        );

        GM_registerMenuCommand(
            "Refresh Processes SI List",
            refreshSIList
        );

        GM_registerMenuCommand(
            "Check Processes SI List Updates",
            checkSIListUpdates
        );
    }

    function initializeUI() {
        if (document.readyState === "loading") {
            document.addEventListener(
                "DOMContentLoaded",
                createUI,
                { once: true }
            );
        } else {
            createUI();
        }
    }

    // =========================================================
    // API key
    // =========================================================

    function setApiKey() {
        const newKey = prompt(
            "Please enter your DeepSeek API Key:"
        );

        if (!newKey || !newKey.trim()) {
            return;
        }

        GM_setValue(
            API_KEY_STORAGE,
            newKey.trim()
        );

        GM_setValue(
            API_KEY_TIME_STORAGE,
            String(Date.now())
        );

        alert(
            "DeepSeek API Key saved for 7 days in this browser."
        );
    }

    function getApiKey() {
        let apiKey =
            GM_getValue(API_KEY_STORAGE, "");

        const apiKeyTime =
            Number(
                GM_getValue(
                    API_KEY_TIME_STORAGE,
                    "0"
                )
            );

        const now = Date.now();

        if (
            apiKey &&
            apiKeyTime &&
            now - apiKeyTime < API_KEY_VALID_MS
        ) {
            return apiKey.trim();
        }

        if (
            apiKey &&
            apiKeyTime &&
            now - apiKeyTime >= API_KEY_VALID_MS
        ) {
            GM_setValue(
                API_KEY_STORAGE,
                ""
            );

            GM_setValue(
                API_KEY_TIME_STORAGE,
                "0"
            );
        }

        apiKey = prompt(
            "Please enter your DeepSeek API Key:"
        );

        if (!apiKey || !apiKey.trim()) {
            alert(
                "DeepSeek API Key is required to use this function."
            );

            return null;
        }

        GM_setValue(
            API_KEY_STORAGE,
            apiKey.trim()
        );

        GM_setValue(
            API_KEY_TIME_STORAGE,
            String(Date.now())
        );

        return apiKey.trim();
    }

    // =========================================================
    // User interface
    // =========================================================

    function createUI() {
        if (
            document.getElementById(
                UI_IDS.MINI_BUTTON
            ) ||
            document.getElementById(
                UI_IDS.PANEL
            )
        ) {
            return;
        }

        if (!document.body) {
            setTimeout(createUI, 300);
            return;
        }

        injectStyles();

        const miniButton =
            document.createElement("button");

        miniButton.id = UI_IDS.MINI_BUTTON;
        miniButton.textContent = "SI Title";
        miniButton.type = "button";

        Object.assign(
            miniButton.style,
            {
                position: "fixed",
                right: "18px",
                bottom: "8px",
                zIndex: "2147483647",
                padding: "10px 14px",
                border: "none",
                borderRadius: "20px",
                background: "#1677ff",
                color: "#ffffff",
                cursor: "move",
                fontSize: "13px",
                fontWeight: "600",
                fontFamily:
                    "Arial, sans-serif",
                boxShadow:
                    "0 3px 12px rgba(0,0,0,0.25)"
            }
        );

        const panel =
            document.createElement("div");

        panel.id = UI_IDS.PANEL;

        Object.assign(
            panel.style,
            {
                position: "fixed",
                right: "18px",
                bottom: "8px",
                width: "400px",
                maxHeight: "88vh",
                zIndex: "2147483647",
                background: "#ffffff",
                border: "1px solid #cccccc",
                borderRadius: "12px",
                boxShadow:
                    "0 4px 16px rgba(0,0,0,0.18)",
                fontFamily:
                    "Arial, sans-serif",
                overflow: "hidden",
                display: "none"
            }
        );

        panel.innerHTML = `
            <div id="${UI_IDS.DRAG_HANDLE}" class="processes-si-header">
                <span>Processes SI Matcher</span>

                <button
                    id="${UI_IDS.MINIMIZE}"
                    type="button"
                    class="processes-si-minimize"
                >
                    −
                </button>
            </div>

            <div class="processes-si-body">
                <button
                    id="processes-si-match-button"
                    type="button"
                    class="processes-si-button"
                >
                    Match / Generate SI
                </button>

                <button
                    id="processes-si-query-button"
                    type="button"
                    class="processes-si-button"
                >
                    Generate Scilit Query + Keywords
                </button>

                <button
                    id="processes-si-refresh-button"
                    type="button"
                    class="processes-si-button"
                >
                    Refresh SI List
                </button>

                <button
                    id="processes-si-check-button"
                    type="button"
                    class="processes-si-button"
                >
                    Check SI List Updates
                </button>

                <button
                    id="processes-si-copy-button"
                    type="button"
                    class="processes-si-button"
                >
                    Copy Result
                </button>

                <button
                    id="processes-si-api-button"
                    type="button"
                    class="processes-si-button"
                >
                    Set / Reset API Key
                </button>

                <div id="${UI_IDS.STATUS}" class="processes-si-status">
                    SI list: checking...
                </div>

                <textarea
                    id="${UI_IDS.OUTPUT}"
                    class="processes-si-output"
                    placeholder="The generated result will appear here..."
                ></textarea>

                <div class="processes-si-cleaner-section">
                    <div class="processes-si-cleaner-title">
                        Text Cleaner: remove line breaks
                    </div>

                    <textarea
                        id="${UI_IDS.CLEANER_INPUT}"
                        class="processes-si-cleaner-input"
                        placeholder="Paste text here, then click Convert + Copy..."
                    ></textarea>

                    <div class="processes-si-cleaner-buttons">
                        <button
                            id="processes-si-convert-button"
                            type="button"
                            class="processes-si-small-button"
                        >
                            Convert + Copy
                        </button>

                        <button
                            id="processes-si-clear-button"
                            type="button"
                            class="processes-si-small-button"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(miniButton);
        document.body.appendChild(panel);

        bindUIEvents(
            miniButton,
            panel
        );

        makeDraggable(
            miniButton,
            miniButton
        );

        makeDraggable(
            panel,
            document.getElementById(
                UI_IDS.DRAG_HANDLE
            )
        );

        updateStatus();
    }

    function injectStyles() {
        if (
            document.getElementById(
                "processes-si-style"
            )
        ) {
            return;
        }

        const style =
            document.createElement("style");

        style.id = "processes-si-style";

        style.textContent = `
            .processes-si-header {
                background: #1677ff;
                color: #ffffff;
                padding: 10px 12px;
                font-weight: 700;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
            }

            .processes-si-minimize {
                border: none;
                background: #ffffff;
                color: #1677ff;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 700;
                min-width: 28px;
                height: 24px;
            }

            .processes-si-body {
                padding: 12px;
                max-height: calc(88vh - 44px);
                overflow-y: auto;
            }

            .processes-si-button {
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

            .processes-si-button:hover {
                background: #d6e4ff;
            }

            .processes-si-button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }

            .processes-si-status {
                margin: 8px 0;
                font-size: 12px;
                color: #666666;
                overflow-wrap: anywhere;
            }

            .processes-si-output {
                width: 100%;
                height: 300px;
                border: 1px solid #cccccc;
                border-radius: 8px;
                padding: 8px;
                font-size: 12px;
                resize: vertical;
                box-sizing: border-box;
            }

            .processes-si-cleaner-section {
                margin-top: 12px;
                padding-top: 10px;
                border-top: 1px solid #eeeeee;
            }

            .processes-si-cleaner-title {
                font-size: 13px;
                font-weight: 700;
                color: #333333;
                margin-bottom: 6px;
            }

            .processes-si-cleaner-input {
                width: 100%;
                height: 95px;
                border: 1px solid #cccccc;
                border-radius: 8px;
                padding: 8px;
                font-size: 12px;
                resize: vertical;
                box-sizing: border-box;
            }

            .processes-si-cleaner-buttons {
                display: flex;
                gap: 6px;
                margin-top: 6px;
            }

            .processes-si-small-button {
                flex: 1;
                padding: 7px;
                border: none;
                border-radius: 8px;
                background: #f0f5ff;
                color: #003a8c;
                cursor: pointer;
                font-size: 12px;
            }

            .processes-si-small-button:hover {
                background: #d6e4ff;
            }
        `;

        (
            document.head ||
            document.documentElement
        ).appendChild(style);
    }

    function bindUIEvents(
        miniButton,
        panel
    ) {
        miniButton.addEventListener(
            "click",
            function () {
                if (
                    miniButton.dataset.dragged ===
                    "true"
                ) {
                    miniButton.dataset.dragged =
                        "false";

                    return;
                }

                miniButton.style.display =
                    "none";

                panel.style.display =
                    "block";

                keepElementInViewport(
                    panel
                );

                updateStatus();
            }
        );

        document
            .getElementById(
                UI_IDS.MINIMIZE
            )
            .addEventListener(
                "click",
                function () {
                    panel.style.display =
                        "none";

                    miniButton.style.display =
                        "block";

                    keepElementInViewport(
                        miniButton
                    );
                }
            );

        document
            .getElementById(
                "processes-si-match-button"
            )
            .addEventListener(
                "click",
                matchSI
            );

        document
            .getElementById(
                "processes-si-query-button"
            )
            .addEventListener(
                "click",
                generateSearchQueryAndKeywords
            );

        document
            .getElementById(
                "processes-si-refresh-button"
            )
            .addEventListener(
                "click",
                refreshSIList
            );

        document
            .getElementById(
                "processes-si-check-button"
            )
            .addEventListener(
                "click",
                checkSIListUpdates
            );

        document
            .getElementById(
                "processes-si-copy-button"
            )
            .addEventListener(
                "click",
                copyOutput
            );

        document
            .getElementById(
                "processes-si-api-button"
            )
            .addEventListener(
                "click",
                setApiKey
            );

        document
            .getElementById(
                "processes-si-convert-button"
            )
            .addEventListener(
                "click",
                convertCleanerText
            );

        document
            .getElementById(
                "processes-si-clear-button"
            )
            .addEventListener(
                "click",
                clearCleanerText
            );

        window.addEventListener(
            "resize",
            function () {
                keepElementInViewport(
                    miniButton
                );

                keepElementInViewport(
                    panel
                );
            }
        );
    }

    function makeDraggable(
        box,
        handle
    ) {
        if (!box || !handle) {
            return;
        }

        let isDragging = false;
        let moved = false;
        let offsetX = 0;
        let offsetY = 0;
        let startX = 0;
        let startY = 0;

        handle.addEventListener(
            "mousedown",
            function (event) {
                if (
                    handle !== box &&
                    event.target.closest("button")
                ) {
                    return;
                }

                isDragging = true;
                moved = false;

                startX = event.clientX;
                startY = event.clientY;

                const rect =
                    box.getBoundingClientRect();

                offsetX =
                    event.clientX - rect.left;

                offsetY =
                    event.clientY - rect.top;

                box.style.left =
                    rect.left + "px";

                box.style.top =
                    rect.top + "px";

                box.style.right = "auto";
                box.style.bottom = "auto";
                box.style.transform = "none";

                document.body.style.userSelect =
                    "none";

                event.preventDefault();
            }
        );

        document.addEventListener(
            "mousemove",
            function (event) {
                if (!isDragging) {
                    return;
                }

                if (
                    Math.abs(
                        event.clientX - startX
                    ) > 3 ||
                    Math.abs(
                        event.clientY - startY
                    ) > 3
                ) {
                    moved = true;
                    box.dataset.dragged =
                        "true";
                }

                const rect =
                    box.getBoundingClientRect();

                const maxLeft =
                    Math.max(
                        0,
                        window.innerWidth -
                        rect.width
                    );

                const maxTop =
                    Math.max(
                        0,
                        window.innerHeight -
                        rect.height
                    );

                let newLeft =
                    event.clientX -
                    offsetX;

                let newTop =
                    event.clientY -
                    offsetY;

                newLeft =
                    Math.max(
                        0,
                        Math.min(
                            newLeft,
                            maxLeft
                        )
                    );

                newTop =
                    Math.max(
                        0,
                        Math.min(
                            newTop,
                            maxTop
                        )
                    );

                box.style.left =
                    newLeft + "px";

                box.style.top =
                    newTop + "px";
            }
        );

        document.addEventListener(
            "mouseup",
            function () {
                if (!isDragging) {
                    return;
                }

                isDragging = false;
                document.body.style.userSelect =
                    "";

                if (!moved) {
                    box.dataset.dragged =
                        "false";
                } else {
                    setTimeout(
                        function () {
                            box.dataset.dragged =
                                "false";
                        },
                        180
                    );
                }
            }
        );
    }

    function keepElementInViewport(
        element
    ) {
        if (
            !element ||
            element.style.display === "none"
        ) {
            return;
        }

        const rect =
            element.getBoundingClientRect();

        let left = rect.left;
        let top = rect.top;

        if (rect.right > window.innerWidth) {
            left =
                Math.max(
                    0,
                    window.innerWidth -
                    rect.width
                );
        }

        if (
            rect.bottom >
            window.innerHeight
        ) {
            top =
                Math.max(
                    0,
                    window.innerHeight -
                    rect.height
                );
        }

        if (rect.left < 0) {
            left = 0;
        }

        if (rect.top < 0) {
            top = 0;
        }

        if (
            left !== rect.left ||
            top !== rect.top
        ) {
            element.style.left =
                left + "px";

            element.style.top =
                top + "px";

            element.style.right =
                "auto";

            element.style.bottom =
                "auto";
        }
    }

    // =========================================================
    // Status and output helpers
    // =========================================================

    function getOutputBox() {
        return document.getElementById(
            UI_IDS.OUTPUT
        );
    }

    function setOutput(text) {
        const outputBox =
            getOutputBox();

        if (outputBox) {
            outputBox.value =
                text || "";
        }
    }

    function updateStatus() {
        const status =
            document.getElementById(
                UI_IDS.STATUS
            );

        if (!status) {
            return;
        }

        const cached =
            GM_getValue(
                STORAGE_KEY,
                ""
            );

        const cacheTime =
            GM_getValue(
                CACHE_TIME_KEY,
                ""
            );

        if (!cached) {
            status.textContent =
                "SI list: not loaded. Click Refresh SI List once.";

            return;
        }

        const count =
            cached
                .split(/\r?\n+/)
                .map(
                    item => item.trim()
                )
                .filter(Boolean)
                .length;

        const time =
            cacheTime
                ? new Date(
                    Number(cacheTime)
                ).toLocaleString()
                : "unknown time";

        status.textContent =
            `SI list: ${count} titles cached, updated at ${time}`;
    }

    // =========================================================
    // SI list
    // =========================================================

    function refreshSIList() {
        setOutput(
            "Fetching SI list from Gist..."
        );

        fetchSIList(
            function (titles) {
                saveSIList(titles);

                setOutput(
                    "SI list updated successfully.\n\n" +
                    `Loaded ${titles.length} titles.`
                );

                updateStatus();
            },
            function (message) {
                setOutput(message);
            }
        );
    }

    function checkSIListUpdates() {
        setOutput(
            "Checking whether SI list has updates..."
        );

        fetchSIList(
            function (titles) {
                const cleanList =
                    [...new Set(titles)]
                        .join("\n");

                const newHash =
                    simpleHash(cleanList);

                const oldHash =
                    GM_getValue(
                        SI_HASH_KEY,
                        ""
                    );

                const oldList =
                    GM_getValue(
                        STORAGE_KEY,
                        ""
                    );

                if (!oldList) {
                    saveSIList(titles);

                    setOutput(
                        "No previous SI list cache found.\n\n" +
                        "SI list has now been loaded.\n" +
                        `Loaded ${titles.length} titles.`
                    );

                    updateStatus();

                    return;
                }

                if (newHash === oldHash) {
                    setOutput(
                        "No update detected. The cached SI list is still up to date."
                    );

                    updateStatus();

                    return;
                }

                saveSIList(titles);

                setOutput(
                    "SI list update detected and refreshed successfully.\n\n" +
                    `Loaded ${titles.length} titles.`
                );

                updateStatus();
            },
            function (message) {
                setOutput(message);
            }
        );
    }

    function fetchSIList(
        onSuccess,
        onFailure
    ) {
        GM_xmlhttpRequest({
            method: "GET",
            url: SI_LIST_URL,

            onload: function (response) {
                const text =
                    response.responseText ||
                    "";

                const titles =
                    extractSITitles(text);

                if (
                    !titles ||
                    titles.length < 5
                ) {
                    onFailure(
                        "Failed to extract SI titles from the Gist link.\n\n" +
                        "Please confirm that the raw Gist link is accessible and contains one SI title per line."
                    );

                    return;
                }

                onSuccess(titles);
            },

            onerror: function () {
                onFailure(
                    "Failed to fetch the SI list. Please check the network or Gist link."
                );
            },

            ontimeout: function () {
                onFailure(
                    "The SI list request timed out. Please try again."
                );
            }
        });
    }

    function saveSIList(titles) {
        const cleanList =
            [...new Set(titles)]
                .join("\n");

        GM_setValue(
            STORAGE_KEY,
            cleanList
        );

        GM_setValue(
            CACHE_TIME_KEY,
            String(Date.now())
        );

        GM_setValue(
            SI_HASH_KEY,
            simpleHash(cleanList)
        );
    }

    function extractSITitles(
        rawText
    ) {
        return String(rawText || "")
            .split(/\r?\n/)
            .map(
                item => item.trim()
            )
            .filter(
                item => item.length > 5
            )
            .filter(
                item =>
                    !/^SI Title$/i.test(
                        item
                    )
            );
    }

    function simpleHash(text) {
        let hash = 0;

        const value =
            String(text || "");

        for (
            let index = 0;
            index < value.length;
            index++
        ) {
            hash =
                (
                    (hash << 5) -
                    hash
                ) +
                value.charCodeAt(index);

            hash |= 0;
        }

        return String(hash);
    }

    // =========================================================
    // Scholar and SI matching
    // =========================================================

    function matchSI() {
        const selectedText =
            getSelectedText();

        if (!selectedText) {
            alert(
                "Please select scholar publications, research interests, funding information, or homepage text first."
            );

            return;
        }

        const existingSI =
            GM_getValue(
                STORAGE_KEY,
                ""
            );

        if (!existingSI) {
            alert(
                "Please click Refresh SI List once before first use."
            );

            return;
        }

        const apiKey =
            getApiKey();

        if (!apiKey) {
            return;
        }

        setOutput(
            "Analyzing scholar fields and matching Special Issues..."
        );

        const systemPrompt = `
You are a senior Section Managing Editor of the MDPI journal Processes.

Your task is to evaluate a scholar's representative publications or research information, determine the scholar's broad first-level academic field, judge whether the scholar fits Processes, and recommend the most relevant existing Special Issues.

Keep the analysis concise and practical.

CORE RULES

1. Do not combine all publications using strict AND logic.
2. Do not require one Special Issue to cover every publication, method, material, and application.
3. Determine one broad first-level academic field.
4. Identify the research direction shared by at least half of the selected publications.
5. Use this majority direction as the main basis for matching.
6. Treat specific materials, methods, algorithms, and applications as supporting information.
7. Recommend only Special Issues that reasonably cover the scholar's main and stable research direction.

PROCESSES SCOPE

Processes is an engineering- and process-oriented journal.

Relevant areas include:

- Chemical and Process Engineering
- Process Systems Engineering
- Fluid Mechanics and Transport Phenomena
- Heat and Mass Transfer
- Energy Processes and Systems
- Environmental Processes
- Industrial and Manufacturing Processes
- Materials Processing
- Separation and Purification Processes
- Food Process Engineering
- Biochemical and Bioprocess Engineering
- Pharmaceutical Processes
- Process Modeling and Simulation
- Process Optimization and Control
- Automation and Intelligent Manufacturing
- AI Applications in Engineering Processes
- Safety, Risk and Reliability
- Sustainable Industrial Processes
- Supply Chain and Logistics Processes
- CFD and Multiphase Flow

Materials, biological, environmental, energy, and AI studies need a clear process, engineering, modeling, optimization, control, manufacturing, or industrial application connection.

Usually unsuitable areas include:

- Pure clinical or medical research
- Pure agriculture
- Pure ecology
- Pure geology
- Pure theoretical physics
- Pure mathematics
- Basic materials characterization without process or engineering relevance
- General AI algorithm development without engineering process context

FIRST-LEVEL FIELD

Use a broad academic field, for example:

- Fluid Mechanics and Transport Phenomena
- Chemical and Process Engineering
- Process Systems Engineering
- Mechanical and Manufacturing Engineering
- Materials Processing and Manufacturing
- Thermal Engineering
- Energy Engineering
- Environmental Engineering
- Food Process Engineering
- Biochemical Engineering
- Separation Engineering
- Industrial Engineering
- Safety and Risk Engineering
- Supply Chain and Logistics Engineering

Do not use an individual method, material, algorithm, or research object as the first-level field.

MAJORITY DIRECTION

Identify the research direction shared by at least half of the selected publications.

Closely related topics may be summarized at a higher conceptual level.

CFD, ANN, DNN, RSM, optimization, numerical simulation, and similar tools should normally support the main direction rather than replace it.

EXISTING SPECIAL ISSUE MATCHING

Recommend 3–4 existing Special Issues with the highest meaningful relevance.

Do not recommend irrelevant titles merely to reach four.

Match primarily according to:

1. First-level academic field;
2. Majority research direction;
3. Core process or engineering problem;
4. Application scenario;
5. Modeling, simulation, optimization, control, or experimental methods.

Do not rely only on literal keyword overlap.

MATCHING SCORES

85%–100%:
The first-level field is highly consistent and the Special Issue directly covers the majority direction.

80%–84%:
The first-level field is consistent and the majority direction is substantially covered, with only minor differences.

65%–79%:
The field is related, but there are noticeable differences in research object, application, or process type.

50%–64%:
Only some methods, mechanisms, or publications are relevant.

Below 50%:
Only superficial words or broad concepts overlap.

NEW SPECIAL ISSUE GENERATION

If at least one existing Special Issue reaches 80%, recommend existing Special Issues and do not generate a new title.

Only when no existing Special Issue reaches 80%:

- generate 1–2 new Special Issue titles;
- make them broader than the scholar's individual publications;
- base them on the first-level field and majority direction;
- avoid combining every method, material, and application into one title.

Do not invent unsupported fashionable methods such as digital twins, generative AI, large language models, or reinforcement learning unless clearly supported by the selected information.

OUTPUT LANGUAGE

Write in Chinese.

Keep existing Special Issue titles in English.

For newly generated titles, provide English and Chinese.

Keep the result concise.

OUTPUT FORMAT

1. 一级学科与Scope判断

- 一级学科：
- 半数及以上文献的主要方向：
- 是否适合Processes：属于 / 部分属于 / 不属于
- 简要原因：

2. 已有SI推荐

推荐1

- 特刊题目：
- 匹配度：XX%
- 匹配原因：

推荐2

- 特刊题目：
- 匹配度：XX%
- 匹配原因：

推荐3

- 特刊题目：
- 匹配度：XX%
- 匹配原因：

推荐4

Only include this item when it has meaningful relevance.

3. 结论

- 是否存在80%以上匹配的已有SI：是 / 否
- 最优先推荐：
- 是否需要新建SI：是 / 否

4. 新特刊题目

Only output this section when no existing Special Issue reaches 80%.

新题目1

- 英文：
- 中文：
- 推荐原因：
- 关键词：
  - 中文 / English
  - 中文 / English
  - 中文 / English
  - 中文 / English
  - 中文 / English

新题目2

Only include this item when a genuinely distinct second option exists.

FINAL RULES

- Do not require one Special Issue to cover all publications.
- Use the direction shared by at least half of the publications.
- Recommend only existing Special Issues from the provided list.
- Do not fabricate research content.
- Do not generate a new title when any existing Special Issue reaches 80%.
`;

        const userPrompt = `
Existing Processes Special Issue title list:

${existingSI}

Scholar information selected by the user:

${selectedText}
`;

        callDeepSeek(
            systemPrompt,
            userPrompt,
            apiKey
        );
    }

    // =========================================================
    // Search query and keywords
    // =========================================================

    function generateSearchQueryAndKeywords() {
        const selectedText =
            getSelectedText();

        if (!selectedText) {
            alert(
                "Please select the Special Issue title, summary, keywords, Guest Editor interests, or scope text first."
            );

            return;
        }

        const apiKey =
            getApiKey();

        if (!apiKey) {
            return;
        }

        setOutput(
            "Generating Scilit search query and keyword list..."
        );

        const systemPrompt = `
You are an expert in academic field classification, bibliographic database searching, Boolean query construction, Special Issue topic analysis, and potential-author discovery.

Your task is to convert selected Special Issue webpage information into a practical literature search strategy.

Do not merely copy keywords from the webpage.

Do not generate a completely generic query based only on a broad first-level discipline.

Instead:

1. Identify the central research field of the Special Issue.
2. Expand that field using established synonyms, spelling variants, major technical categories, and representative technologies.
3. Use the Special Issue title, summary, topics, keywords, and Guest Editor interests to determine which branches and technologies are genuinely relevant.
4. Exclude terms that belong to the broader field but clearly fall outside the actual Special Issue emphasis.

The title normally provides the strongest signal.

The summary, topics, keywords, and Guest Editor interests must also be considered as supporting evidence.

Return only the requested formatted output.
`;

        const userPrompt = `
The following text is selected from a Special Issue webpage.

It may include:

- Special Issue title;
- Guest Editor affiliations;
- Guest Editor research interests;
- Special Issue introduction or summary;
- aims and scope;
- suggested topics;
- webpage keywords;
- submission information.

Generate:

1. A Boolean literature search query;
2. A line-by-line keyword list for screening exported literature records;
3. The same keyword list separated by Chinese semicolons.

==================================================
CORE FIELD IDENTIFICATION
==================================================

First identify:

1. The central research field of the Special Issue;
2. Its broader first-level academic field;
3. The technical branches and emphases actually covered by the Special Issue.

Use the following priority:

1. Special Issue title;
2. Special Issue summary and aims;
3. Listed topics;
4. Webpage keywords;
5. Guest Editor research interests.

Guest Editor interests must be considered, but only include them when they are relevant to the Special Issue.

Ignore administrative information such as:

- submission instructions;
- publication fees;
- peer-review procedures;
- journal frequency;
- formatting requirements;
- English-editing statements.

==================================================
FIELD-BASED EXPANSION
==================================================

After identifying the core field, expand it using professional academic knowledge.

Consider:

A. Standard field names

B. Widely used synonyms and spelling variants

C. Major recognized technical categories

D. Representative or field-identifying technologies

E. Technical branches clearly supported by the Special Issue webpage

F. Important materials, processes, characterization methods, properties, or applications that represent a meaningful Special Issue direction

Do not simply copy every noun phrase from the webpage.

Do not include a term merely because it appears once.

Give priority to terms that are:

- central to the title;
- repeatedly emphasized in the summary or topics;
- supported by Guest Editor interests;
- established terminology in the field;
- useful for finding relevant papers and authors.

==================================================
BALANCE COVERAGE AND RELEVANCE
==================================================

The query must balance:

1. Retrieving the broader community working in the core field;
2. Maintaining relevance to the actual Special Issue scope.

Do not retrieve an entire broad first-level discipline.

Do not require every paper to mention several narrow Special Issue details simultaneously.

Use the core field as the main retrieval framework.

Use webpage information to select relevant branches and representative technologies.

Exclude branches that belong to the general field but fall outside the Special Issue emphasis.

For a Special Issue titled:

“Advanced Materials and Performance Characterization in Additive Manufacturing”

the central field is additive manufacturing.

The query should include:

- additive manufacturing;
- 3D printing variants;
- major additive manufacturing categories;
- major representative additive manufacturing technologies.

The webpage's focus on materials, microstructure, defects, residual stress, monitoring, post-processing, performance, qualification, and reliability should influence the selected vocabulary and keyword list.

However, these secondary concepts should not automatically become mandatory AND conditions.

==================================================
BOOLEAN QUERY FORMAT
==================================================

Use:

TITLE-ABS-KEY(...)

The complete Boolean query must be written on one single line.

Do not insert line breaks inside TITLE-ABS-KEY(...).

Correct:

TITLE-ABS-KEY(("additive manufacturing" OR "3d printing" OR "powder bed fusion" OR "directed energy deposition"))

Incorrect:

TITLE-ABS-KEY(
  (
    "additive manufacturing"
    OR "3d printing"
  )
)

Use quotation marks for multi-word phrases.

Use OR between:

- synonyms;
- spelling variants;
- parallel technologies;
- technical categories;
- field-identifying terminology.

Use AND only when the Special Issue genuinely depends on the intersection of two independent and indispensable concepts.

Do not use AND simply because several concepts appear in the title or summary.

For a Special Issue centered on one established field, normally use one broad OR group.

==================================================
QUERY TERM RULES
==================================================

The final search query should normally contain about 10–30 carefully selected expressions.

Use more only when necessary to cover recognized technical categories.

Every expression should:

- name the core field;
- be a standard synonym or spelling variant;
- be a major technical category;
- be a representative field-identifying technology;
- or be an important Special-Issue-specific branch.

Avoid generic standalone terms such as:

- material;
- manufacturing;
- process;
- system;
- technology;
- performance;
- characterization;
- analysis;
- property;
- model;
- optimization;
- simulation;
- engineering.

These may appear only as part of meaningful technical phrases.

Do not use ambiguous abbreviations alone.

For example, do not use AM alone for additive manufacturing.

Do not add unsupported fashionable terms such as:

- digital twin;
- generative AI;
- large language model;
- metaverse;
- blockchain;
- Industry 5.0.

==================================================
KEYWORD LIST
==================================================

The keyword list is for screening:

- article titles;
- abstracts;
- author keywords.

It should reflect both:

1. The broader terminology of the core field;
2. The actual technical scope of the Special Issue webpage.

Include:

- core field names;
- synonyms and spelling variants;
- major technical categories;
- representative technologies;
- important Special-Issue-specific materials;
- relevant characterization or monitoring methods;
- relevant process–structure–property terminology;
- relevant performance, defects, reliability, qualification, or post-processing topics.

Secondary terms may appear in the keyword list even when they are not mandatory Boolean concepts.

Each keyword or phrase must appear on a separate line.

Do not number the keywords.

Do not use bullet points.

Prefer about 20–50 keywords.

Do not include Boolean operators in the keyword list.

==================================================
CONSISTENCY
==================================================

The Boolean query and keyword list must be related but do not need to be identical.

The query should prioritize retrieval efficiency and usually be shorter.

The keyword list may be broader and more detailed for secondary screening.

The semicolon-separated list must contain exactly the same terms and the same order as [KEYWORD_LIST].

==================================================
OUTPUT FORMAT
==================================================

Return strictly:

[CORE_FIELD]
Core research field in English

[FIRST_LEVEL_FIELD]
Broader first-level academic field in English

[SCILIT_SEARCH_QUERY]
TITLE-ABS-KEY(("term 1" OR "term 2" OR "term 3"))

[KEYWORD_LIST]
keyword 1
keyword 2
keyword 3

[KEYWORD_LIST_SEMICOLON]
keyword 1；keyword 2；keyword 3

The content after [SCILIT_SEARCH_QUERY] must be one single line.

Do not add explanations.

Selected Special Issue text:

${selectedText}
`;

        callDeepSeek(
            systemPrompt,
            userPrompt,
            apiKey
        );
    }

    function getSelectedText() {
        const selection =
            window.getSelection();

        return selection
            ? selection
                .toString()
                .trim()
            : "";
    }

    // =========================================================
    // DeepSeek request
    // =========================================================

    function callDeepSeek(
        systemPrompt,
        userPrompt,
        apiKey
    ) {
        GM_xmlhttpRequest({
            method: "POST",
            url:
                "https://api.deepseek.com/v1/chat/completions",

            headers: {
                "Content-Type":
                    "application/json",
                "Authorization":
                    "Bearer " + apiKey
            },

            data: JSON.stringify({
                model: MODEL,

                messages: [
                    {
                        role: "system",
                        content:
                            systemPrompt
                    },
                    {
                        role: "user",
                        content:
                            userPrompt
                    }
                ],

                temperature: 0.25,
                max_tokens: 3600,
                stream: false
            }),

            timeout: 120000,

            onload: function (response) {
                try {
                    if (
                        response.status < 200 ||
                        response.status >= 300
                    ) {
                        setOutput(
                            "API request failed.\n\n" +
                            `HTTP status: ${response.status}\n` +
                            (
                                response.responseText ||
                                "No response body."
                            )
                        );

                        return;
                    }

                    const data =
                        JSON.parse(
                            response.responseText
                        );

                    if (data.error) {
                        setOutput(
                            "API Error: " +
                            (
                                data.error.message ||
                                JSON.stringify(
                                    data.error
                                )
                            )
                        );

                        return;
                    }

                    let result =
                        data.choices?.[0]
                            ?.message
                            ?.content
                            ?.trim();

                    if (!result) {
                        setOutput(
                            "No valid response returned from the API."
                        );

                        return;
                    }

                    result =
                        normalizeApiResult(
                            result
                        );

                    setOutput(result);
                    GM_setClipboard(result);
                } catch (error) {
                    setOutput(
                        "Failed to parse the API response.\n\n" +
                        String(
                            error?.message ||
                            error
                        )
                    );

                    console.error(
                        "Processes SI Matcher parse error:",
                        error,
                        response.responseText
                    );
                }
            },

            onerror: function (error) {
                setOutput(
                    "API request failed. Please check the API key, account balance, or network."
                );

                console.error(
                    "Processes SI Matcher request error:",
                    error
                );
            },

            ontimeout: function () {
                setOutput(
                    "The API request timed out. Please try again."
                );
            }
        });
    }

    function normalizeApiResult(text) {
        let result =
            String(text || "")
                .trim();

        result =
            removeMarkdownCodeFence(
                result
            );

        result =
            ensureSemicolonKeywordSection(
                result
            );

        result =
            forceSingleLineSearchQuery(
                result
            );

        return result.trim();
    }

    function removeMarkdownCodeFence(text) {
        const value =
            String(text || "")
                .trim();

        if (
            /^```[\w-]*\s*/.test(value) &&
            /```\s*$/.test(value)
        ) {
            return value
                .replace(
                    /^```[\w-]*\s*/,
                    ""
                )
                .replace(
                    /```\s*$/,
                    ""
                )
                .trim();
        }

        return value;
    }

    // =========================================================
    // Search-query formatting
    // =========================================================

    function forceSingleLineSearchQuery(
        text
    ) {
        if (
            !text ||
            !/\[SCILIT_SEARCH_QUERY\]/i.test(
                text
            )
        ) {
            return text;
        }

        const querySectionPattern =
            /(\[SCILIT_SEARCH_QUERY\]\s*)([\s\S]*?)(?=\n\s*\[KEYWORD_LIST\])/i;

        return text.replace(
            querySectionPattern,
            function (
                fullMatch,
                header,
                querySection
            ) {
                const singleLineQuery =
                    String(
                        querySection ||
                        ""
                    )
                        .replace(
                            /\r?\n+/g,
                            " "
                        )
                        .replace(
                            /\s{2,}/g,
                            " "
                        )
                        .replace(
                            /\(\s+/g,
                            "("
                        )
                        .replace(
                            /\s+\)/g,
                            ")"
                        )
                        .trim();

                return (
                    header.trim() +
                    "\n" +
                    singleLineQuery +
                    "\n\n"
                );
            }
        );
    }

    // =========================================================
    // Keyword formatting
    // =========================================================

    function ensureSemicolonKeywordSection(
        text
    ) {
        if (
            !text ||
            !/\[KEYWORD_LIST\]/i.test(
                text
            )
        ) {
            return text;
        }

        const keywords =
            extractKeywordLines(text);

        if (!keywords.length) {
            return text;
        }

        const semicolonLine =
            keywords.join("；");

        if (
            /\[KEYWORD_LIST_SEMICOLON\]/i.test(
                text
            )
        ) {
            return text.replace(
                /\[KEYWORD_LIST_SEMICOLON\][\s\S]*$/i,
                "[KEYWORD_LIST_SEMICOLON]\n" +
                semicolonLine
            );
        }

        return (
            text.trim() +
            "\n\n" +
            "[KEYWORD_LIST_SEMICOLON]\n" +
            semicolonLine
        );
    }

    function extractKeywordLines(text) {
        const match =
            String(text || "")
                .match(
                    /\[KEYWORD_LIST\]([\s\S]*?)(?=\n\s*\[KEYWORD_LIST_SEMICOLON\]|\s*$)/i
                );

        if (!match) {
            return [];
        }

        const raw =
            match[1] || "";

        const keywords =
            raw
                .split(/\r?\n/)
                .map(
                    item =>
                        item.trim()
                )
                .map(
                    item =>
                        item.replace(
                            /^[-•*]\s*/,
                            ""
                        )
                )
                .map(
                    item =>
                        item.replace(
                            /^\d+[\.\)]\s*/,
                            ""
                        )
                )
                .map(
                    item =>
                        item.replace(
                            /；/g,
                            ";"
                        )
                )
                .flatMap(
                    item =>
                        item.split(";")
                )
                .map(
                    item =>
                        item.trim()
                )
                .filter(
                    item =>
                        item.length > 1
                )
                .filter(
                    item =>
                        !/^\[.*\]$/.test(
                            item
                        )
                );

        return [
            ...new Set(keywords)
        ];
    }

    // =========================================================
    // Text cleaner
    // =========================================================

    function convertCleanerText() {
        const box =
            document.getElementById(
                UI_IDS.CLEANER_INPUT
            );

        if (!box) {
            return;
        }

        const raw =
            box.value || "";

        if (!raw.trim()) {
            alert(
                "Please paste text into the cleaner box first."
            );

            return;
        }

        const cleaned =
            raw
                .replace(
                    /\r?\n+/g,
                    " "
                )
                .replace(
                    /\t+/g,
                    " "
                )
                .replace(
                    /\s{2,}/g,
                    " "
                )
                .trim();

        box.value = cleaned;
        GM_setClipboard(cleaned);

        alert(
            "Converted to one paragraph and copied."
        );
    }

    function clearCleanerText() {
        const box =
            document.getElementById(
                UI_IDS.CLEANER_INPUT
            );

        if (box) {
            box.value = "";
        }
    }

    // =========================================================
    // Copy output
    // =========================================================

    function copyOutput() {
        const outputBox =
            getOutputBox();

        if (!outputBox) {
            return;
        }

        const text =
            outputBox.value.trim();

        if (!text) {
            alert(
                "There is no result to copy."
            );

            return;
        }

        GM_setClipboard(text);

        alert(
            "Result copied."
        );
    }
})();
