// ==UserScript==
// @name         Processes SI Title Matcher
// @namespace    Processes-SI-Title-Matcher
// @version      4.2
// @author       Jiali Tang
// @icon         https://pub.mdpi-res.com/img/journals/processes-logo-sq.png?1e142e5ab0d148f8
// @description  Match selected scholar information with existing Processes SI titles, generate SI titles, Scilit queries, keyword lists, and clean pasted text
// @match        *://*/*
// @downloadURL  https://raw.githubusercontent.com/scarlett-personaluse/scopus-mdpi-helper/main/Processes-SI-Title-Matcher.user.js
// @updateURL    https://raw.githubusercontent.com/scarlett-personaluse/scopus-mdpi-helper/main/Processes-SI-Title-Matcher.user.js
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
    'use strict';

    const MODEL = "deepseek-chat";

    const API_KEY_STORAGE = "processes_deepseek_api_key";
    const API_KEY_TIME_STORAGE = "processes_deepseek_api_key_time";
    const API_KEY_VALID_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    const SI_LIST_URL =
        "https://gist.githubusercontent.com/scarlett-personaluse/53c0316fb23a0fd021e753f5192a4e5f/raw/SI%20list-scarlett";

    const STORAGE_KEY = "processes_existing_si_titles_cache";
    const CACHE_TIME_KEY = "processes_existing_si_titles_cache_time";
    const SI_HASH_KEY = "processes_existing_si_titles_hash";

    GM_registerMenuCommand("Set / Reset DeepSeek API Key", () => {
        const newKey = prompt("Please enter your DeepSeek API Key:");
        if (!newKey) return;

        GM_setValue(API_KEY_STORAGE, newKey.trim());
        GM_setValue(API_KEY_TIME_STORAGE, String(Date.now()));

        alert("DeepSeek API Key saved for 7 days in this browser.");
    });

    GM_registerMenuCommand("Refresh Processes SI List", () => {
        refreshSIList();
    });

    GM_registerMenuCommand("Check Processes SI List Updates", () => {
        checkSIListUpdates();
    });

    createUI();

    function getApiKey() {
        let apiKey = GM_getValue(API_KEY_STORAGE, "");
        let apiKeyTime = Number(GM_getValue(API_KEY_TIME_STORAGE, "0"));
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
            GM_setValue(API_KEY_STORAGE, "");
            GM_setValue(API_KEY_TIME_STORAGE, "0");
        }

        apiKey = prompt("Please enter your DeepSeek API Key:");

        if (!apiKey) {
            alert("DeepSeek API Key is required to use this function.");
            return null;
        }

        GM_setValue(API_KEY_STORAGE, apiKey.trim());
        GM_setValue(API_KEY_TIME_STORAGE, String(Date.now()));

        return apiKey.trim();
    }

    function createUI() {
        const miniBtn = document.createElement("button");
        miniBtn.textContent = "SI Title";

        Object.assign(miniBtn.style, {
            position: "fixed",
            right: "18px",
            bottom: "8px",
            zIndex: "999999",
            padding: "10px 14px",
            border: "none",
            borderRadius: "20px",
            background: "#1677ff",
            color: "white",
            cursor: "move",
            fontSize: "13px",
            fontWeight: "600",
            boxShadow: "0 3px 12px rgba(0,0,0,0.25)"
        });

        const panel = document.createElement("div");

        Object.assign(panel.style, {
            position: "fixed",
            right: "18px",
            bottom: "8px",
            width: "400px",
            maxHeight: "88vh",
            zIndex: "999999",
            background: "#ffffff",
            border: "1px solid #ccc",
            borderRadius: "12px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
            fontFamily: "Arial, sans-serif",
            overflow: "hidden",
            display: "none"
        });

        panel.innerHTML = `
            <div
                id="si-panel-drag-handle"
                style="
                    background:#1677ff;
                    color:white;
                    padding:10px 12px;
                    font-weight:700;
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    cursor:move;
                "
            >
                <span>Processes SI Matcher</span>

                <button
                    id="si-minimize"
                    style="
                        border:none;
                        background:white;
                        color:#1677ff;
                        border-radius:6px;
                        cursor:pointer;
                        font-weight:700;
                    "
                >
                    −
                </button>
            </div>

            <div
                style="
                    padding:12px;
                    max-height:calc(88vh - 44px);
                    overflow-y:auto;
                "
            >
                <button id="si-match-btn" class="si-btn">
                    Match / Generate SI
                </button>

                <button id="si-search-keyword-btn" class="si-btn">
                    Generate Scilit Query + Keywords
                </button>

                <button id="refresh-si-list-btn" class="si-btn">
                    Refresh SI List
                </button>

                <button id="check-si-update-btn" class="si-btn">
                    Check SI List Updates
                </button>

                <button id="copy-si-output-btn" class="si-btn">
                    Copy Result
                </button>

                <button id="reset-api-key-btn" class="si-btn">
                    Set / Reset API Key
                </button>

                <div
                    id="si-status"
                    style="
                        margin:8px 0;
                        font-size:12px;
                        color:#666;
                    "
                >
                    SI list: checking...
                </div>

                <textarea
                    id="si-output"
                    style="
                        width:100%;
                        height:300px;
                        border:1px solid #ccc;
                        border-radius:8px;
                        padding:8px;
                        font-size:12px;
                        resize:vertical;
                        box-sizing:border-box;
                    "
                ></textarea>

                <div
                    style="
                        margin-top:12px;
                        padding-top:10px;
                        border-top:1px solid #eee;
                    "
                >
                    <div
                        style="
                            font-size:13px;
                            font-weight:700;
                            color:#333;
                            margin-bottom:6px;
                        "
                    >
                        Text Cleaner: remove line breaks
                    </div>

                    <textarea
                        id="si-cleaner-input"
                        placeholder="Paste text here, then click Convert to One Paragraph..."
                        style="
                            width:100%;
                            height:95px;
                            border:1px solid #ccc;
                            border-radius:8px;
                            padding:8px;
                            font-size:12px;
                            resize:vertical;
                            box-sizing:border-box;
                        "
                    ></textarea>

                    <div
                        style="
                            display:flex;
                            gap:6px;
                            margin-top:6px;
                        "
                    >
                        <button
                            id="convert-cleaner-btn"
                            class="si-small-btn"
                        >
                            Convert + Copy
                        </button>

                        <button
                            id="clear-cleaner-btn"
                            class="si-small-btn"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(miniBtn);
        document.body.appendChild(panel);

        const style = document.createElement("style");

        style.textContent = `
            .si-btn {
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

            .si-btn:hover {
                background: #d6e4ff;
            }

            .si-small-btn {
                flex: 1;
                padding: 7px;
                border: none;
                border-radius: 8px;
                background: #f0f5ff;
                color: #003a8c;
                cursor: pointer;
                font-size: 12px;
            }

            .si-small-btn:hover {
                background: #d6e4ff;
            }
        `;

        document.head.appendChild(style);

        makeDraggable(miniBtn, miniBtn);
        makeDraggable(
            panel,
            document.getElementById("si-panel-drag-handle")
        );

        miniBtn.onclick = () => {
            if (miniBtn.dataset.dragged === "true") {
                miniBtn.dataset.dragged = "false";
                return;
            }

            miniBtn.style.display = "none";
            panel.style.display = "block";
            updateStatus();
        };

        document.getElementById("si-minimize").onclick = () => {
            panel.style.display = "none";
            miniBtn.style.display = "block";
        };

        document.getElementById(
            "refresh-si-list-btn"
        ).onclick = refreshSIList;

        document.getElementById(
            "check-si-update-btn"
        ).onclick = checkSIListUpdates;

        document.getElementById(
            "si-match-btn"
        ).onclick = matchSI;

        document.getElementById(
            "si-search-keyword-btn"
        ).onclick = generateSearchQueryAndKeywords;

        document.getElementById(
            "copy-si-output-btn"
        ).onclick = copyOutput;

        document.getElementById(
            "convert-cleaner-btn"
        ).onclick = convertCleanerText;

        document.getElementById(
            "clear-cleaner-btn"
        ).onclick = clearCleanerText;

        document.getElementById(
            "reset-api-key-btn"
        ).onclick = () => {
            const newKey = prompt(
                "Please enter your DeepSeek API Key:"
            );

            if (!newKey) return;

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
        };

        updateStatus();
    }

    function makeDraggable(box, handle) {
        let isDragging = false;
        let moved = false;
        let offsetX = 0;
        let offsetY = 0;
        let startX = 0;
        let startY = 0;

        if (!box || !handle) return;

        handle.addEventListener(
            "mousedown",
            function (e) {
                if (
                    e.target.tagName.toLowerCase() === "button" &&
                    handle !== box
                ) {
                    return;
                }

                isDragging = true;
                moved = false;
                startX = e.clientX;
                startY = e.clientY;

                const rect = box.getBoundingClientRect();

                offsetX = e.clientX - rect.left;
                offsetY = e.clientY - rect.top;

                box.style.left = rect.left + "px";
                box.style.top = rect.top + "px";
                box.style.right = "auto";
                box.style.bottom = "auto";
                box.style.transform = "none";

                document.body.style.userSelect = "none";
                e.preventDefault();
            }
        );

        document.addEventListener(
            "mousemove",
            function (e) {
                if (!isDragging) return;

                if (
                    Math.abs(e.clientX - startX) > 3 ||
                    Math.abs(e.clientY - startY) > 3
                ) {
                    moved = true;
                    box.dataset.dragged = "true";
                }

                let newLeft = e.clientX - offsetX;
                let newTop = e.clientY - offsetY;

                const boxRect = box.getBoundingClientRect();
                const maxLeft =
                    window.innerWidth - boxRect.width;
                const maxTop =
                    window.innerHeight - boxRect.height;

                newLeft = Math.max(
                    0,
                    Math.min(newLeft, maxLeft)
                );

                newTop = Math.max(
                    0,
                    Math.min(newTop, maxTop)
                );

                box.style.left = newLeft + "px";
                box.style.top = newTop + "px";
            }
        );

        document.addEventListener(
            "mouseup",
            function () {
                if (!isDragging) return;

                isDragging = false;
                document.body.style.userSelect = "";

                if (!moved) {
                    box.dataset.dragged = "false";
                } else {
                    setTimeout(() => {
                        box.dataset.dragged = "false";
                    }, 150);
                }
            }
        );
    }

    function updateStatus() {
        const cached = GM_getValue(STORAGE_KEY, "");
        const cacheTime = GM_getValue(
            CACHE_TIME_KEY,
            ""
        );

        const status =
            document.getElementById("si-status");

        if (!status) return;

        if (cached) {
            const count = cached
                .split(/\n+/)
                .filter(x => x.trim())
                .length;

            const time = cacheTime
                ? new Date(
                    Number(cacheTime)
                ).toLocaleString()
                : "unknown time";

            status.textContent =
                `SI list: ${count} titles cached, updated at ${time}`;
        } else {
            status.textContent =
                "SI list: not loaded. Click Refresh SI List once.";
        }
    }

    function refreshSIList() {
        const outputBox =
            document.getElementById("si-output");

        if (outputBox) {
            outputBox.value =
                "Fetching SI list from Gist...";
        }

        GM_xmlhttpRequest({
            method: "GET",
            url: SI_LIST_URL,

            onload: function (response) {
                const text =
                    response.responseText || "";

                const titles =
                    extractSITitles(text);

                if (
                    !titles ||
                    titles.length < 5
                ) {
                    if (outputBox) {
                        outputBox.value =
                            "Failed to extract SI titles from the Gist link.\n\n" +
                            "Please check whether the Gist raw link is accessible " +
                            "and contains one SI title per line.";
                    } else {
                        alert(
                            "Failed to extract SI titles from the Gist link."
                        );
                    }

                    return;
                }

                const cleanList = [
                    ...new Set(titles)
                ].join("\n");

                const hash =
                    simpleHash(cleanList);

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
                    hash
                );

                if (outputBox) {
                    outputBox.value =
                        `SI list updated successfully.\n\n` +
                        `Loaded ${titles.length} titles.`;
                } else {
                    alert(
                        `SI list updated successfully. ` +
                        `Loaded ${titles.length} titles.`
                    );
                }

                updateStatus();
            },

            onerror: function () {
                if (outputBox) {
                    outputBox.value =
                        "Failed to fetch SI list. " +
                        "Please check the Gist link or network.";
                } else {
                    alert(
                        "Failed to fetch SI list. " +
                        "Please check the Gist link or network."
                    );
                }
            }
        });
    }

    function checkSIListUpdates() {
        const outputBox =
            document.getElementById("si-output");

        if (outputBox) {
            outputBox.value =
                "Checking whether SI list has updates...";
        }

        GM_xmlhttpRequest({
            method: "GET",
            url: SI_LIST_URL,

            onload: function (response) {
                const text =
                    response.responseText || "";

                const titles =
                    extractSITitles(text);

                if (
                    !titles ||
                    titles.length < 5
                ) {
                    if (outputBox) {
                        outputBox.value =
                            "Failed to check SI list updates.\n\n" +
                            "Please check whether the Gist raw link is accessible " +
                            "and contains one SI title per line.";
                    } else {
                        alert(
                            "Failed to check SI list updates."
                        );
                    }

                    return;
                }

                const cleanList = [
                    ...new Set(titles)
                ].join("\n");

                const newHash =
                    simpleHash(cleanList);

                const oldHash =
                    GM_getValue(SI_HASH_KEY, "");

                const oldList =
                    GM_getValue(STORAGE_KEY, "");

                if (!oldList) {
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
                        newHash
                    );

                    if (outputBox) {
                        outputBox.value =
                            "No previous SI list cache found.\n\n" +
                            "SI list has been loaded successfully.\n" +
                            `Loaded ${titles.length} titles.`;
                    } else {
                        alert(
                            "No previous SI list cache found. " +
                            `Loaded ${titles.length} titles.`
                        );
                    }

                    updateStatus();
                    return;
                }

                if (newHash === oldHash) {
                    if (outputBox) {
                        outputBox.value =
                            "No update detected. " +
                            "The cached SI list is still up to date.";
                    } else {
                        alert(
                            "No update detected. " +
                            "The cached SI list is still up to date."
                        );
                    }

                    updateStatus();
                    return;
                }

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
                    newHash
                );

                if (outputBox) {
                    outputBox.value =
                        "SI list update detected and refreshed successfully.\n\n" +
                        `Loaded ${titles.length} titles.`;
                } else {
                    alert(
                        "SI list update detected and refreshed successfully. " +
                        `Loaded ${titles.length} titles.`
                    );
                }

                updateStatus();
            },

            onerror: function () {
                if (outputBox) {
                    outputBox.value =
                        "Failed to check SI list updates. " +
                        "Please check the Gist link or network.";
                } else {
                    alert(
                        "Failed to check SI list updates. " +
                        "Please check the Gist link or network."
                    );
                }
            }
        });
    }

    function extractSITitles(rawText) {
        return rawText
            .split(/\r?\n/)
            .map(x => x.trim())
            .filter(x => x.length > 5)
            .filter(x => !/^SI Title$/i.test(x));
    }

    function simpleHash(text) {
        let hash = 0;

        if (!text) {
            return String(hash);
        }

        for (
            let i = 0;
            i < text.length;
            i++
        ) {
            hash =
                ((hash << 5) - hash) +
                text.charCodeAt(i);

            hash |= 0;
        }

        return String(hash);
    }

    function matchSI() {
        const selectedText =
            window.getSelection()
                .toString()
                .trim();

        const outputBox =
            document.getElementById("si-output");

        if (!selectedText) {
            alert(
                "Please select scholar publications, research interests, " +
                "funding information, or homepage text first."
            );

            return;
        }

        const existingSI =
            GM_getValue(STORAGE_KEY, "");

        if (!existingSI) {
            alert(
                "Please click Refresh SI List once before first use."
            );

            return;
        }

        const apiKey = getApiKey();

        if (!apiKey) return;

        outputBox.value =
            "Analyzing scholar fields, grouping publications, " +
            "and matching Special Issues...";

        const systemPrompt = `
You are a senior Section Managing Editor of the MDPI journal Processes.

Your task is to evaluate a scholar from the selected information, identify the scholar's dominant first-level academic field, group the publications into major research themes, match suitable existing Special Issues, and generate new Special Issue titles only when necessary.

IMPORTANT MATCHING PRINCIPLE

Do NOT treat all selected publications as one combined topic connected by AND.

Do NOT require one Special Issue to cover every paper, method, material, model, and application simultaneously.

Use the following logic instead:

1. Identify the first-level academic field of each publication.
2. Determine which first-level field covers more than half of the publications.
3. If no single field covers more than half, select the one or two closest fields covering the largest number of publications.
4. Within the dominant field, divide the publications into 2–3 coherent research theme groups.
5. Match existing Special Issues separately to these theme groups.
6. A Special Issue may be highly suitable even if it covers only one major theme group rather than every publication.

Processes is process-, system-, and engineering-oriented.

Suitable areas include:

Chemical and process engineering; process systems engineering; industrial and manufacturing processes; fluid mechanics and transport phenomena; heat and mass transfer; separation and purification; energy processes and systems; environmental processes; food processing; biochemical and bioprocess engineering; pharmaceutical processes; materials processing; process modeling, simulation, optimization, control, safety, risk, reliability, supply chains, sustainable processes, CFD, multiphase flow, and AI-enabled engineering.

Materials, environmental, biological, energy, and AI topics are suitable only when they have clear process, engineering, modeling, system, optimization, control, manufacturing, or industrial application attributes.

Usually unsuitable:

Pure medicine, clinical research, pure agriculture, pure geology, pure ecology, pure theoretical physics, pure mathematics, or basic science without meaningful engineering or process attributes.

ANALYSIS PROCEDURE

STEP 1 — Scope judgment

Judge whether the scholar's overall research fits Processes.

Use one of these conclusions:

- 属于
- 部分属于
- 不属于

Explain the process or engineering connection.

Do not classify research as suitable merely because it uses numerical simulation, machine learning, or mathematical models.

STEP 2 — Publication-level field classification

For each publication, identify one primary first-level academic field.

Use broad fields such as:

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

Do not use a specific material, constitutive model, algorithm, or narrow application as a first-level field.

For example, Carreau fluid, ANN, DNN, MHD, roll coating, nanofluid, and RSM are not first-level fields.

STEP 3 — Dominant field by majority

Count how many publications belong to each first-level field.

The dominant field should normally be the field covering more than half of the publications.

If none exceeds half, select the field with the largest coverage, or combine two closely related fields.

Do not classify the scholar by a method appearing in only some papers.

For example, ANN or DNN should normally be treated as methods used within process or fluid engineering, not as evidence that the scholar's main field is general artificial intelligence.

STEP 4 — Research theme grouping

Within the dominant field, divide the publications into 2–3 coherent theme groups.

A theme group may be based on:

- engineering process or research problem;
- application scenario;
- transport, physical, chemical, or biological mechanism;
- research object;
- modeling, experimental, optimization, or control approach.

Prioritize grouping in this order:

1. Engineering process or research problem;
2. Application scenario or research object;
3. Core mechanism;
4. Methods and tools.

A valid theme group should normally be supported by at least two publications.

A single recent paper may form a secondary emerging theme only if the selected information clearly shows that it represents a new continuing direction.

Do not create method-only groups such as ANN, DNN, and RSM.

Instead, use a contextualized theme such as Data-Driven Modeling and Optimization of Fluid or Manufacturing Processes.

STEP 5 — Existing Special Issue matching

First filter by the dominant first-level field, then match the existing Special Issues to individual theme groups.

Use OR plus grouped-coverage logic, not all-publications-AND logic.

A Special Issue may receive a high score when it:

- belongs to the same dominant first-level field;
- directly covers one important theme group;
- reasonably covers at least half of the publications; OR
- strongly covers 2–3 representative publications forming a stable theme;
- has a scope broad enough to accommodate the scholar's likely future work.

Do not reduce the score merely because the Special Issue does not cover every publication.

Do not assign a high score based only on one shared word such as fluid, model, process, optimization, or sustainable when the application background is substantially different.

MATCHING SCORE

- 85%–100%:
  Same first-level field and direct coverage of one major theme group or at least half of the publications. The scholar could naturally contribute without changing research direction.

- 70%–84%:
  Same first-level field and meaningful coverage of a major theme, but the application object, process type, or technical emphasis differs.

- 50%–69%:
  Clear overlap in methods or mechanisms, but only some publications fit naturally.

- 30%–49%:
  Only broad keywords or general methods overlap.

- 0%–29%:
  Superficial or essentially irrelevant overlap.

Recommend no more than three existing Special Issues and rank them by fit.

Do not recommend weak options merely to reach three.

For each option, state which theme group and which publications it covers, the estimated number of covered publications, strengths, and uncovered directions.

STEP 6 — Decide whether to generate new Special Issues

If at least one existing Special Issue reaches 85% fit:

- recommend the existing Special Issue or Special Issues;
- do not generate new titles;
- clearly state that a new Special Issue is unnecessary.

If all existing Special Issues are below 85%:

- explain why no current title is sufficiently suitable;
- generate 2–3 new Special Issue titles;
- make each new title correspond to a major theme group.

Do not generate one title that mechanically combines every paper topic.

NEW SPECIAL ISSUE TITLE RULES

Each title must:

- fit the Processes scope;
- be based on the dominant first-level field;
- cover at least 2–3 representative publications when possible;
- be broad enough to attract researchers beyond this single scholar;
- be specific enough to communicate a coherent process or engineering topic;
- avoid keyword stacking;
- avoid copying publication titles;
- avoid using a single narrow constitutive model, algorithm, material, or local case;
- normally contain one core field plus one process, application, mechanism, or broad method direction.

Suitable title patterns include:

- Advances in [core field] for [engineering process/application]
- Modeling and Optimization of [process/system]
- Transport Phenomena in [engineering application]
- Intelligent Modeling and Control of [process/system]
- Recent Advances in [engineering process/mechanism]
- Data-Driven Modeling of [engineering process]

EVIDENCE AND METHOD CONTROL

Do not invent methods or directions not supported by the selected publications.

For example, do not add:

- Physics-Informed Neural Networks
- Digital Twins
- Reinforcement Learning
- Generative AI
- Large Language Models
- Machine Vision
- Edge Computing

unless the selected information provides direct evidence.

You may generalize supported methods conservatively.

For example:

ANN, DNN, Bayesian regularization, Levenberg–Marquardt, and RSM may be summarized as AI-based modeling, data-driven process modeling, or intelligent optimization.

OUTPUT LANGUAGE

Write the analysis in Chinese.

Keep existing and proposed Special Issue titles in English.

Provide Chinese translations only for newly generated Special Issue titles.

OUTPUT FORMAT

1. Scope判断

- 结论：属于 / 部分属于 / 不属于
- 主要一级学科领域：
- 次要或交叉领域：
- 判断原因：
- 与Processes最相关的栏目或方向：

2. 文献一级领域统计

- 文献1：主要一级领域；简要依据
- 文献2：主要一级领域；简要依据
- Continue for all identifiable publications.

领域统计：

- 领域A：X篇，对应文献：...
- 领域B：X篇，对应文献：...

多数判断：

- 超过一半文献的主要领域：
- 判断依据：

3. 核心研究主题分组

主题组1

- 主题名称：
- 所属一级领域：
- 包含文献：
- 文献数量：
- 共同研究内容：
- 代表性方法：
- 代表性关键词：

主题组2

- 主题名称：
- 所属一级领域：
- 包含文献：
- 文献数量：
- 共同研究内容：
- 代表性方法：
- 代表性关键词：

主题组3

Only include this group when it is genuinely supported by the selected publications.

Use the same fields as above.

4. 已有SI匹配

匹配题目1

- 英文题目：
- 对应主题组：
- 可覆盖文献：
- 预计覆盖数量：
- 匹配度：XX%
- 匹配原因：
- 未覆盖方向：
- 是否优先推荐：是 / 否

匹配题目2

Use the same fields when relevant.

匹配题目3

Use the same fields only when relevant.

5. 综合结论

- 是否存在85%以上匹配的已有SI：是 / 否
- 最优先推荐：
- 是否需要新建SI：是 / 否
- 简要原因：

6. 推荐特刊题目

Only output this section when no existing Special Issue reaches 85% fit.

特刊题目1

- 英文：
- 中文：
- 对应主题组：
- 可覆盖的代表性文献：
- 推荐原因：
- 关键词：
  - 中文 / English
  - 中文 / English
  - 中文 / English
  - 中文 / English
  - 中文 / English

特刊题目2

Use the same fields.

特刊题目3

Use the same fields only when genuinely useful.

FINAL RESTRICTIONS

- Never combine all publications mechanically with AND logic.
- Never require one Special Issue to cover all selected publications.
- Never judge the dominant field solely from a frequently repeated method.
- Never ignore a shared first-level engineering background merely because specific application objects differ.
- Never produce a title made of stacked keywords.
- Never invent unsupported methods.
- Never recommend an existing Special Issue that is absent from the provided list.
- Never fabricate publication details that are not present in the selected information.
`;

        const userPrompt = `
Existing Processes SI title list:

${existingSI}

Scholar information selected by the user:

${selectedText}
`;

        callDeepSeek(
            systemPrompt,
            userPrompt,
            outputBox,
            apiKey
        );
    }

    function generateSearchQueryAndKeywords() {
        const selectedText =
            window.getSelection()
                .toString()
                .trim();

        const outputBox =
            document.getElementById("si-output");

        if (!selectedText) {
            alert(
                "Please select the Special Issue title, summary, keywords, " +
                "GE interests, or scope text first."
            );

            return;
        }

        const apiKey = getApiKey();

        if (!apiKey) return;

        outputBox.value =
            "Generating Scilit search query and keyword list...";

        const systemPrompt = `
You are an expert assistant for academic literature searching, Special Issue topic analysis, and potential author discovery.

Your task is to help the user convert selected Special Issue information into:

1. A Boolean search query for MDPI Scilit or similar academic databases.
2. A keyword list for rough screening of exported literature records in Excel.
3. A semicolon-separated keyword list for Python input.

Return only the requested formatted output.

Do not add explanations.
`;

        const userPrompt = `
The following text is selected from a Special Issue webpage.

It may include the Special Issue title, guest editor research interests, summary, aims and scope, and keywords.

Your task is to generate three outputs:

1. A Boolean search query for MDPI Scilit or similar academic databases.

Requirements:

- The query should be broad enough to retrieve potentially relevant papers and authors.
- Use important synonyms and related terms.
- Use OR within concept groups.
- Use AND between different concept groups.
- Avoid overly narrow or too many mandatory terms.
- Prefer title-, abstract-, and keyword-friendly phrases.
- Keep the query practical and not excessively long.
- Do not include field tags unless necessary.
- Do not include explanations.
- The query should be suitable for identifying papers and potential authors related to this Special Issue.
- The query should not be so strict that it misses relevant papers.

2. A keyword list for rough screening of exported literature records in Excel.

Requirements:

- Each keyword or phrase must be on a separate line.
- Keywords should be directly relevant to the Special Issue.
- Include synonyms, variant spellings, abbreviations, and closely related technical terms.
- Include both broad topic phrases and specific technical phrases.
- Avoid overly generic words such as study, method, process, system, analysis, model, or performance unless they are part of a meaningful phrase.
- Do not number the keywords.
- Do not use bullet points.
- Prefer 20–50 keywords depending on the scope of the Special Issue.
- The keywords should be suitable for matching against paper titles, author keywords, and abstracts.

3. A semicolon-separated keyword list.

Requirements:

- Use the same keywords from [KEYWORD_LIST].
- Put all keywords in one line.
- Separate keywords using Chinese semicolon "；".
- Do not add line breaks inside this section.

Return the result strictly in the following format:

[SCILIT_SEARCH_QUERY]
...

[KEYWORD_LIST]
keyword 1
keyword 2
keyword 3

[KEYWORD_LIST_SEMICOLON]
keyword 1；keyword 2；keyword 3

Selected Special Issue text:

${selectedText}
`;

        callDeepSeek(
            systemPrompt,
            userPrompt,
            outputBox,
            apiKey
        );
    }

    function callDeepSeek(
        systemPrompt,
        userPrompt,
        outputBox,
        apiKey
    ) {
        GM_xmlhttpRequest({
            method: "POST",
            url: "https://api.deepseek.com/v1/chat/completions",

            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + apiKey
            },

            data: JSON.stringify({
                model: MODEL,

                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: userPrompt
                    }
                ],

                temperature: 0.25,
                max_tokens: 3600,
                stream: false
            }),

            onload: function (response) {
                try {
                    const data =
                        JSON.parse(
                            response.responseText
                        );

                    if (data.error) {
                        outputBox.value =
                            "API Error: " +
                            data.error.message;

                        return;
                    }

                    let result =
                        data.choices?.[0]
                            ?.message
                            ?.content
                            ?.trim();

                    if (!result) {
                        outputBox.value =
                            "No valid response returned from API.";

                        return;
                    }

                    result =
                        ensureSemicolonKeywordSection(
                            result
                        );

                    outputBox.value = result;
                    GM_setClipboard(result);
                } catch (error) {
                    outputBox.value =
                        "Failed to parse API response. " +
                        "Please check console.";

                    console.error(
                        response.responseText
                    );
                }
            },

            onerror: function (error) {
                outputBox.value =
                    "API request failed. " +
                    "Please check API key, balance, or network.";

                console.error(error);
            }
        });
    }

    function ensureSemicolonKeywordSection(text) {
        if (
            !text ||
            !/\[KEYWORD_LIST\]/i.test(text)
        ) {
            return text;
        }

        if (
            /\[KEYWORD_LIST_SEMICOLON\]/i.test(text)
        ) {
            const parts = text.split(
                /\[KEYWORD_LIST_SEMICOLON\]/i
            );

            const before =
                parts[0].trim();

            const after =
                parts
                    .slice(1)
                    .join(
                        "[KEYWORD_LIST_SEMICOLON]"
                    )
                    .trim();

            if (
                after &&
                !after.includes("\n")
            ) {
                return text;
            }

            const keywords =
                extractKeywordLines(before);

            if (!keywords.length) {
                return text;
            }

            return (
                before +
                "\n\n[KEYWORD_LIST_SEMICOLON]\n" +
                keywords.join("；")
            );
        }

        const keywords =
            extractKeywordLines(text);

        if (!keywords.length) {
            return text;
        }

        return (
            text.trim() +
            "\n\n[KEYWORD_LIST_SEMICOLON]\n" +
            keywords.join("；")
        );
    }

    function extractKeywordLines(text) {
        const match = text.match(
            /\[KEYWORD_LIST\]([\s\S]*?)(?:\n\s*\[[A-Z_]+\]|\s*$)/i
        );

        if (!match) {
            return [];
        }

        const raw = match[1] || "";

        const keywords = raw
            .split(/\r?\n/)
            .map(x => x.trim())
            .map(x =>
                x.replace(/^[-•*]\s*/, "")
            )
            .map(x =>
                x.replace(
                    /^\d+[\.\)]\s*/,
                    ""
                )
            )
            .map(x =>
                x.replace(/；/g, ";")
            )
            .flatMap(x =>
                x.split(";")
            )
            .map(x =>
                x.trim()
            )
            .filter(x =>
                x.length > 1
            )
            .filter(x =>
                !/^\[.*\]$/.test(x)
            );

        return [
            ...new Set(keywords)
        ];
    }

    function convertCleanerText() {
        const box =
            document.getElementById(
                "si-cleaner-input"
            );

        if (!box) return;

        const raw = box.value || "";

        if (!raw.trim()) {
            alert(
                "Please paste text into the cleaner box first."
            );

            return;
        }

        const cleaned = raw
            .replace(/\r?\n+/g, " ")
            .replace(/\t+/g, " ")
            .replace(/\s{2,}/g, " ")
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
                "si-cleaner-input"
            );

        if (box) {
            box.value = "";
        }
    }

    function copyOutput() {
        const outputBox =
            document.getElementById(
                "si-output"
            );

        if (!outputBox) return;

        const text =
            outputBox.value.trim();

        if (text) {
            GM_setClipboard(text);
            alert("Result copied.");
        }
    }

})();
