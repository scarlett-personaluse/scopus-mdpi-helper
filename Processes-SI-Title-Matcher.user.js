```javascript
// ==UserScript==
// @name         Processes SI Title Matcher
// @namespace    Processes-SI-Title-Matcher
// @version      4.6.2
// @author       Jiali Tang
// @icon         https://pub.mdpi-res.com/img/journals/processes-logo-sq.png?1e142e5ab0d148f8
// @description  Match selected scholar information with existing Processes SI titles, generate SI titles, Scilit queries, keyword lists, and clean pasted text
// @match        *://*/*
*// @downloadURL  https://raw.githubusercontent.com/scarlett-personaluse/scopus-mdpi-helper/main/Processes-SI-Title-Matcher.user.js
*// @updateURL    https://raw.githubusercontent.com/scarlett-personaluse/scopus-mdpi-helper/main/Processes-SI-Title-Matcher.user.js
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
    const API_KEY_VALID_MS = 7 * 24 * 60 * 60 * 1000;

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

Your task is to quickly evaluate a scholar's representative publications, determine the scholar's main academic field, judge whether the scholar fits Processes, and recommend the most relevant existing Special Issues.

Keep the analysis concise and practical.

The selected information may contain approximately 5–8 representative publications, research interests, keywords, abstracts, funding information, or homepage text.

==================================================
CORE ANALYSIS PRINCIPLE
==================================================

Do not combine all publications using strict AND logic.

Do not require one Special Issue to cover every selected publication, method, material, and application.

Instead:

1. Determine the scholar's broad first-level academic field.
2. Identify the research direction shared by at least half of the selected publications.
3. Use this majority direction as the main basis for matching existing Special Issues.
4. Treat specific materials, methods, algorithms, and applications as supporting information.
5. Recommend existing Special Issues that cover the main field or majority research direction.

A suitable Special Issue does not need to cover all publications.

It may receive a high matching score if it reasonably covers the scholar's main and stable research direction.

==================================================
PROCESSES SCOPE
==================================================

Processes is an engineering- and process-oriented journal.

Relevant areas include, but are not limited to:

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

Materials, biological, environmental, energy, and AI research should have a clear process, engineering, modeling, optimization, control, manufacturing, or industrial application connection.

Usually unsuitable areas include:

- Pure clinical or medical research
- Pure agriculture
- Pure ecology
- Pure geology
- Pure theoretical physics
- Pure mathematics
- Basic materials characterization without process or engineering relevance
- General AI algorithm development without an engineering process context

==================================================
FIRST-LEVEL FIELD CLASSIFICATION
==================================================

Determine one broad first-level academic field that best describes the scholar.

Examples include:

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

Do not use specific methods or research objects as the first-level field.

For example, the following are not first-level fields:

- Artificial Neural Networks
- Deep Neural Networks
- Response Surface Methodology
- Magnetohydrodynamics
- Nanofluids
- Carreau Fluid
- Roll Coating
- Calendering

These should be treated as specific methods, mechanisms, materials, or applications within a broader academic field.

==================================================
MAJORITY DIRECTION
==================================================

Identify the research direction shared by at least half of the selected publications.

For example, if 5 out of 8 publications study non-Newtonian flow, transport phenomena, heat transfer, coating processes, or related numerical modeling, the majority direction may be summarized as:

Fluid Flow and Heat Transfer in Industrial Processes

or:

Complex Fluid Dynamics and Transport Phenomena

Do not require all publications to belong to exactly the same narrow topic.

Closely related research topics may be summarized at a higher conceptual level.

Methods such as ANN, DNN, RSM, CFD, numerical simulation, or optimization should normally support the majority direction rather than replace it.

==================================================
EXISTING SPECIAL ISSUE MATCHING
==================================================

Recommend 3–4 existing Special Issues with the highest matching scores.

Do not recommend more than four.

Do not recommend irrelevant titles merely to reach four. If only two or three titles have meaningful relevance, output only those titles.

Match primarily according to:

1. First-level academic field;
2. Research direction shared by at least half of the publications;
3. Core process or engineering problem;
4. Application scenario;
5. Modeling, simulation, optimization, control, or experimental methods.

Do not rely only on literal keyword overlap.

For example, a Special Issue containing the term "fluid dynamics" should not receive a high score if it focuses on an unrelated application area.

A Special Issue may receive more than 80% matching even if it does not cover every selected publication.

==================================================
MATCHING SCORE
==================================================

Use the following scoring principles:

85%–100%:
The first-level academic field is highly consistent, and the Special Issue directly covers the majority research direction or a major stable direction of the scholar.

80%–84%:
The first-level field is consistent and the majority direction is substantially covered, although the specific application or technical emphasis is slightly different.

65%–79%:
The first-level field is related, but there are noticeable differences in research object, application scenario, or process type.

50%–64%:
Only some methods, mechanisms, or publications are relevant.

Below 50%:
Only broad words or superficial connections overlap.

Do not artificially reduce the matching score because a Special Issue cannot cover all selected publications.

==================================================
NEW SPECIAL ISSUE GENERATION
==================================================

First examine all relevant existing Special Issues.

If at least one existing Special Issue reaches 80% matching:

- recommend the existing Special Issues;
- do not generate any new Special Issue title.

Only if no existing Special Issue reaches 80%:

- generate 1–2 new Special Issue titles;
- keep the titles broader than the scholar's individual publications;
- base the titles on the first-level field and majority research direction;
- avoid combining every method, material, and application in one title.

The new Special Issue title should be suitable for broader invitations and should attract researchers beyond this individual scholar.

Prefer broad but meaningful title concepts such as:

- Fluid Flow and Heat Transfer in Industrial Processes
- Transport Phenomena in Complex Fluid Systems
- Modeling and Optimization of Thermal and Fluid Processes
- Advanced Computational Process Engineering
- Intelligent Modeling and Optimization of Industrial Processes
- Advanced Transport Processes in Manufacturing
- Sustainable Thermal and Fluid Engineering Processes

Normally do not place the following narrow details in the title:

- individual constitutive models;
- individual algorithms;
- individual nanoparticles or materials;
- a single equipment type;
- microorganisms;
- a single local case;
- narrow combinations such as MHD + nanofluid + coating + ANN.

These details may appear in the keywords instead.

Do not invent unsupported methods such as:

- Physics-Informed Neural Networks
- Digital Twins
- Reinforcement Learning
- Generative AI
- Large Language Models
- Machine Vision

unless directly supported by the selected information.

==================================================
OUTPUT LANGUAGE AND STYLE
==================================================

Write the answer in Chinese.

Keep existing Special Issue titles in their original English.

Provide both English and Chinese titles only for newly generated Special Issues.

Keep the response concise.

Do not provide:

- publication-by-publication analysis;
- detailed publication grouping;
- long tables;
- lengthy methodological discussion;
- unnecessary explanations;
- repeated conclusions.

==================================================
OUTPUT FORMAT
==================================================

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

Only include this item if it has meaningful relevance.

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

Only include this item when another genuinely distinct and useful option exists.

==================================================
FINAL RULES
==================================================

- Do not treat all publications as one narrow combined topic.
- Do not require one Special Issue to cover every publication.
- Use the direction shared by at least half of the publications as the main matching basis.
- Recommend 3–4 highest-matching existing Special Issues.
- Do not generate new titles if any existing Special Issue reaches 80%.
- Generate only 1–2 new titles when all existing Special Issues are below 80%.
- New titles should be broader than individual publication topics.
- Do not invent Special Issues that are absent from the provided existing list.
- Do not fabricate research content not present in the selected information.
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

        const userPrompt = `
The following text is selected from a Special Issue webpage.

It may include:

- Special Issue title;
- Guest Editor affiliations;
- Guest Editor research interests;
- Special Issue introduction or summary;
- aims and scope;
- suggested topics;
- keywords;
- submission information.

Your task is to generate:

1. A Boolean search query for Scilit, Scopus, or similar academic databases;
2. A keyword list for screening exported literature records;
3. The same keyword list separated by Chinese semicolons.

==================================================
STEP 1: IDENTIFY THE CORE FIELD
==================================================

First identify:

1. The central research field of the Special Issue;
2. Its broader first-level academic field;
3. The specific branches and technical emphases actually covered by the Special Issue.

The Special Issue title should normally receive the highest priority.

However, you must also carefully consider:

- Guest Editor research interests;
- Special Issue summary;
- listed topics;
- webpage keywords.

These elements help determine the actual boundaries and emphasis of the Special Issue.

Do not treat Guest Editor interests as irrelevant.

Guest Editor interests may reveal important technical directions that are not fully expressed in the title.

However, do not include a Guest Editor research topic when it is clearly unrelated to the Special Issue.

Ignore administrative information such as:

- manuscript submission instructions;
- publication fees;
- peer-review procedures;
- journal publication frequency;
- formatting and language requirements.

==================================================
STEP 2: BUILD A FIELD-BASED TERM POOL
==================================================

After identifying the core field, expand it using professional academic knowledge.

Consider the following categories:

A. Core field names

Include the standard name of the research field.

B. Synonyms and spelling variants

Include widely used alternative expressions and spelling variants.

C. Major technical categories

Include recognized technical categories belonging to the core field.

D. Representative technologies

Include technologies or methods that strongly indicate that a paper belongs to this field.

E. Special-Issue-specific branches

Use the webpage title, summary, topics, keywords, and Guest Editor interests to identify technical branches that are especially relevant to this Special Issue.

F. Relevant materials, processes, characterization methods, properties, or applications

Include these only when they represent a meaningful and sufficiently broad direction of the Special Issue.

Do not simply copy every noun phrase from the webpage.

Do not include terms merely because they appear once.

Give priority to concepts that are:

- central to the title;
- repeatedly emphasized in the summary or topic list;
- supported by Guest Editor interests;
- established technical terms in the field;
- useful for identifying relevant papers and authors.

==================================================
STEP 3: BALANCE FIELD COVERAGE AND SI RELEVANCE
==================================================

The query must balance two objectives:

1. Retrieve the broader research community working in the core field;
2. Maintain clear relevance to the actual Special Issue scope.

Do not generate an excessively generic query that retrieves the entire first-level academic discipline.

Do not generate an excessively narrow query that requires every paper to mention several detailed Special Issue topics simultaneously.

The correct strategy is:

- Use the core field as the main retrieval framework;
- Expand it with major synonyms and representative technologies;
- Use the Special Issue webpage information to select the most relevant branches;
- Exclude branches that belong to the broader field but are outside the Special Issue emphasis.

For example, for a Special Issue titled:

“Advanced Materials and Performance Characterization in Additive Manufacturing”

the central field is additive manufacturing.

The query should include major additive manufacturing terminology and technologies.

However, because the webpage emphasizes:

- metallic, ceramic, and composite feedstocks;
- microstructural evolution;
- mechanical, thermal, tribological, electrical, and corrosion performance;
- residual stress and defects;
- in situ monitoring;
- post-processing;
- qualification and reliability;
- process–structure–property relationships;

these webpage elements should influence the selected vocabulary and keyword list.

The query should still retrieve additive manufacturing papers broadly, but its technical vocabulary should favor technologies and branches relevant to materials development, characterization, and component performance.

==================================================
BOOLEAN QUERY STRUCTURE
==================================================

Use the database field format:

TITLE-ABS-KEY(...)

Important formatting rule:

The complete Boolean expression must be written on one single line.

Do not insert line breaks inside TITLE-ABS-KEY(...).

Correct format:

TITLE-ABS-KEY(("additive manufacturing" OR "3d printing" OR "powder bed fusion" OR "directed energy deposition"))

Incorrect format:

TITLE-ABS-KEY(
  (
    "additive manufacturing"
    OR "3d printing"
  )
)

Use:

- quotation marks for multi-word phrases;
- OR between synonyms, parallel technologies, and related field-identifying expressions;
- AND only between genuinely indispensable independent concepts;
- parentheses to organize concept groups where needed.

==================================================
WHEN TO USE OR
==================================================

Use OR to connect:

- field synonyms;
- spelling variants;
- major technical categories;
- representative technologies;
- alternative terminology describing the same or parallel research directions.

For a Special Issue centered on one established field, the main search query should usually consist of one broad OR structure.

Example:

TITLE-ABS-KEY(("additive manufacturing" OR "3d printing" OR "powder bed fusion" OR "selective laser melting" OR "directed energy deposition"))

==================================================
WHEN TO USE AND
==================================================

Do not use AND simply because several concepts appear in the Special Issue title or summary.

Use AND only when the identity of the Special Issue genuinely depends on the intersection of two independent research concepts.

Examples:

TITLE-ABS-KEY((membrane OR "membrane separation") AND (wastewater OR "water treatment"))

TITLE-ABS-KEY(("machine learning" OR "artificial intelligence") AND ("process control" OR "chemical process"))

For a Special Issue that belongs primarily to one established field, do not force secondary topics such as characterization, performance, modeling, defects, sustainability, or optimization into mandatory AND groups.

==================================================
QUERY TERM SELECTION
==================================================

The final query should normally contain approximately 10–30 carefully selected expressions.

Use more terms only when necessary to cover recognized technical categories.

Every expression should satisfy at least one of the following:

- directly names the core field;
- is a standard synonym or spelling variant;
- is a major technical category of the field;
- is a representative technology strongly associated with the field;
- is an important branch clearly supported by the Special Issue webpage;
- is a sufficiently specific phrase useful for finding relevant papers.

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

These may be used only as part of meaningful technical phrases.

Avoid ambiguous abbreviations used alone.

For example, do not use AM alone for additive manufacturing because AM has many unrelated meanings.

Use full phrases such as:

- additive manufacturing;
- wire arc additive manufacturing.

Do not add fashionable concepts unsupported by the webpage, such as:

- digital twin;
- generative AI;
- large language model;
- blockchain;
- metaverse;
- Industry 5.0.

==================================================
KEYWORD LIST
==================================================

Generate a keyword list suitable for screening:

- titles;
- abstracts;
- author keywords.

The keyword list must reflect both:

1. The broader terminology of the core research field;
2. The actual technical scope of the Special Issue webpage.

Include:

- core field names;
- synonyms and spelling variants;
- major technical categories;
- representative technologies;
- important Special-Issue-specific materials;
- important characterization or monitoring methods;
- relevant process–structure–property terminology;
- relevant performance and reliability topics.

Secondary terms may be included in the keyword list even when they are not included as mandatory concepts in the Boolean query.

For example, terms such as:

- residual stress;
- microstructural evolution;
- defect characterization;
- fatigue behavior;
- corrosion resistance;
- in situ monitoring;
- post-processing;
- materials qualification;

may be valuable screening keywords for an additive manufacturing Special Issue, even though they should not necessarily form mandatory AND groups in the main search query.

Each keyword or phrase must appear on a separate line.

Do not number the keywords.

Do not use bullet points.

Prefer 20–50 keywords depending on the breadth of the Special Issue.

Do not include Boolean operators in the keyword list.

==================================================
CONSISTENCY
==================================================

The Boolean query and keyword list must be related but do not need to be identical.

The Boolean query should prioritize effective retrieval and should normally be shorter.

The keyword list may be broader and more detailed because it will be used for secondary screening of exported records.

The semicolon-separated keyword list must contain exactly the same terms, in exactly the same order, as [KEYWORD_LIST].

==================================================
OUTPUT FORMAT
==================================================

Return the result strictly in the following format:

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

The entire content following [SCILIT_SEARCH_QUERY] must be on one line.

Do not add any other sections.

Do not explain the reasoning.

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

                    result =
                        forceSingleLineSearchQuery(
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

    function forceSingleLineSearchQuery(text) {
        if (
            !text ||
            !/\[SCILIT_SEARCH_QUERY\]/i.test(text)
        ) {
            return text;
        }

        return text.replace(
            /(\[SCILIT_SEARCH_QUERY\]\s*)(TITLE-ABS-KEY\([\s\S]*?\))(?=\s*\n\s*\[KEYWORD_LIST\])/i,
            function (_, header, query) {
                const singleLineQuery = query
                    .replace(/\r?\n+/g, " ")
                    .replace(/\s{2,}/g, " ")
                    .replace(/\(\s+/g, "(")
                    .replace(/\s+\)/g, ")")
                    .trim();

                return (
                    header.trim() +
                    "\n" +
                    singleLineQuery +
                    "\n"
                );
            }
        );
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
```
