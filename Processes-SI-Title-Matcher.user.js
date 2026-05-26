// ==UserScript==
// @name         Processes SI Title Matcher
// @namespace    Processes-SI-Title-Matcher
// @version      3.8
// @author       Jiali Tang
// @icon         https://pub.mdpi-res.com/img/journals/processes-logo-sq.png?1e142e5ab0d148f8
// @description  Match selected scholar information with existing Processes SI titles or generate new SI titles
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
        let now = Date.now();

        if (apiKey && apiKeyTime && now - apiKeyTime < API_KEY_VALID_MS) {
            return apiKey.trim();
        }

        if (apiKey && apiKeyTime && now - apiKeyTime >= API_KEY_VALID_MS) {
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
            bottom: "18px",
            zIndex: "999999",
            padding: "10px 14px",
            border: "none",
            borderRadius: "20px",
            background: "#1677ff",
            color: "white",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: "600",
            boxShadow: "0 3px 12px rgba(0,0,0,0.25)"
        });

        const panel = document.createElement("div");

        Object.assign(panel.style, {
            position: "fixed",
            right: "18px",
            bottom: "18px",
            width: "360px",
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
            <div style="background:#1677ff;color:white;padding:10px 12px;font-weight:700;display:flex;justify-content:space-between;align-items:center;">
                <span>Processes SI Matcher</span>
                <button id="si-minimize" style="border:none;background:white;color:#1677ff;border-radius:6px;cursor:pointer;font-weight:700;">−</button>
            </div>

            <div style="padding:12px;">
                <button id="si-match-btn" class="si-btn">Match / Generate SI</button>
                <button id="refresh-si-list-btn" class="si-btn">Refresh SI List</button>
                <button id="check-si-update-btn" class="si-btn">Check SI List Updates</button>
                <button id="copy-si-output-btn" class="si-btn">Copy Result</button>
                <button id="reset-api-key-btn" class="si-btn">Set / Reset API Key</button>

                <div id="si-status" style="margin:8px 0;font-size:12px;color:#666;">
                    SI list: checking...
                </div>

                <textarea id="si-output" style="width:100%;height:260px;border:1px solid #ccc;border-radius:8px;padding:8px;font-size:12px;resize:vertical;"></textarea>
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
        `;
        document.head.appendChild(style);

        miniBtn.onclick = () => {
            miniBtn.style.display = "none";
            panel.style.display = "block";
            updateStatus();
        };

        document.getElementById("si-minimize").onclick = () => {
            panel.style.display = "none";
            miniBtn.style.display = "block";
        };

        document.getElementById("refresh-si-list-btn").onclick = refreshSIList;
        document.getElementById("check-si-update-btn").onclick = checkSIListUpdates;
        document.getElementById("si-match-btn").onclick = matchSI;
        document.getElementById("copy-si-output-btn").onclick = copyOutput;

        document.getElementById("reset-api-key-btn").onclick = () => {
            const newKey = prompt("Please enter your DeepSeek API Key:");
            if (!newKey) return;

            GM_setValue(API_KEY_STORAGE, newKey.trim());
            GM_setValue(API_KEY_TIME_STORAGE, String(Date.now()));

            alert("DeepSeek API Key saved for 7 days in this browser.");
        };

        updateStatus();
    }

    function updateStatus() {
        const cached = GM_getValue(STORAGE_KEY, "");
        const cacheTime = GM_getValue(CACHE_TIME_KEY, "");
        const status = document.getElementById("si-status");

        if (!status) return;

        if (cached) {
            const count = cached.split(/\n+/).filter(x => x.trim()).length;
            const time = cacheTime
                ? new Date(Number(cacheTime)).toLocaleString()
                : "unknown time";

            status.textContent = `SI list: ${count} titles cached, updated at ${time}`;
        } else {
            status.textContent = "SI list: not loaded. Click Refresh SI List once.";
        }
    }

    function refreshSIList() {
        const outputBox = document.getElementById("si-output");
        if (outputBox) {
            outputBox.value = "Fetching SI list from Gist...";
        }

        GM_xmlhttpRequest({
            method: "GET",
            url: SI_LIST_URL,
            onload: function (response) {
                const text = response.responseText || "";
                const titles = extractSITitles(text);

                if (!titles || titles.length < 5) {
                    if (outputBox) {
                        outputBox.value =
                            "Failed to extract SI titles from the Gist link.\n\nPlease check whether the Gist raw link is accessible and contains one SI title per line.";
                    } else {
                        alert("Failed to extract SI titles from the Gist link.");
                    }
                    return;
                }

                const cleanList = [...new Set(titles)].join("\n");
                const hash = simpleHash(cleanList);

                GM_setValue(STORAGE_KEY, cleanList);
                GM_setValue(CACHE_TIME_KEY, String(Date.now()));
                GM_setValue(SI_HASH_KEY, hash);

                if (outputBox) {
                    outputBox.value = `SI list updated successfully.\n\nLoaded ${titles.length} titles.`;
                } else {
                    alert(`SI list updated successfully. Loaded ${titles.length} titles.`);
                }

                updateStatus();
            },
            onerror: function () {
                if (outputBox) {
                    outputBox.value = "Failed to fetch SI list. Please check the Gist link or network.";
                } else {
                    alert("Failed to fetch SI list. Please check the Gist link or network.");
                }
            }
        });
    }

    function checkSIListUpdates() {
        const outputBox = document.getElementById("si-output");
        if (outputBox) {
            outputBox.value = "Checking whether SI list has updates...";
        }

        GM_xmlhttpRequest({
            method: "GET",
            url: SI_LIST_URL,
            onload: function (response) {
                const text = response.responseText || "";
                const titles = extractSITitles(text);

                if (!titles || titles.length < 5) {
                    if (outputBox) {
                        outputBox.value =
                            "Failed to check SI list updates.\n\nPlease check whether the Gist raw link is accessible and contains one SI title per line.";
                    } else {
                        alert("Failed to check SI list updates.");
                    }
                    return;
                }

                const cleanList = [...new Set(titles)].join("\n");
                const newHash = simpleHash(cleanList);
                const oldHash = GM_getValue(SI_HASH_KEY, "");
                const oldList = GM_getValue(STORAGE_KEY, "");

                if (!oldList) {
                    GM_setValue(STORAGE_KEY, cleanList);
                    GM_setValue(CACHE_TIME_KEY, String(Date.now()));
                    GM_setValue(SI_HASH_KEY, newHash);

                    if (outputBox) {
                        outputBox.value = `No previous SI list cache found.\n\nSI list has been loaded successfully.\nLoaded ${titles.length} titles.`;
                    } else {
                        alert(`No previous SI list cache found. Loaded ${titles.length} titles.`);
                    }

                    updateStatus();
                    return;
                }

                if (newHash === oldHash) {
                    if (outputBox) {
                        outputBox.value = "No update detected. The cached SI list is still up to date.";
                    } else {
                        alert("No update detected. The cached SI list is still up to date.");
                    }

                    updateStatus();
                    return;
                }

                GM_setValue(STORAGE_KEY, cleanList);
                GM_setValue(CACHE_TIME_KEY, String(Date.now()));
                GM_setValue(SI_HASH_KEY, newHash);

                if (outputBox) {
                    outputBox.value = `SI list update detected and refreshed successfully.\n\nLoaded ${titles.length} titles.`;
                } else {
                    alert(`SI list update detected and refreshed successfully. Loaded ${titles.length} titles.`);
                }

                updateStatus();
            },
            onerror: function () {
                if (outputBox) {
                    outputBox.value = "Failed to check SI list updates. Please check the Gist link or network.";
                } else {
                    alert("Failed to check SI list updates. Please check the Gist link or network.");
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

        if (!text) return String(hash);

        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }

        return String(hash);
    }

    function matchSI() {
        const selectedText = window.getSelection().toString().trim();
        const outputBox = document.getElementById("si-output");

        if (!selectedText) {
            alert("Please select scholar publications, research interests, funding information, or homepage text first.");
            return;
        }

        const existingSI = GM_getValue(STORAGE_KEY, "");

        if (!existingSI) {
            alert("Please click Refresh SI List once before first use.");
            return;
        }

        const apiKey = getApiKey();

        if (!apiKey) return;

        outputBox.value = "Analyzing...";

        const systemPrompt = `
You are a senior Section Managing Editor of the MDPI journal Processes.

Your task:
- Judge whether the scholar's research direction fits Processes.
- Prioritize matching existing Special Issues.
- Generate new SI titles only if no existing SI reaches 80% fit.

Processes is process/system/engineering-oriented.

Suitable areas:
Chemical engineering, process engineering, energy systems, petroleum engineering, catalysis, separation processes, environmental processes, process modeling and simulation, AI-enabled engineering, intelligent manufacturing, automation and control, sustainable processes, functional materials in engineering processes, industrial applications, CFD, multiphase flow, and optimization.

Materials, environmental, biological, and energy topics are acceptable only if they have process, engineering, modeling, system, optimization, or industrial application attributes.

Usually unsuitable:
Pure medicine, clinical research, pure agriculture, pure geology, pure ecology, pure theoretical physics, and basic research without engineering/process attributes.

Rules:
1. First judge scope.
2. Then compare with the existing SI list.
3. If an existing SI has 80% or higher fit, recommend it and do not generate a new SI.
4. Matching should consider core process, technical route, application scenario, engineering goal, and modeling/system methods.
5. Do not create a new SI only because material, pollutant, or local application differs.
6. If no existing SI reaches 80% fit, generate up to three new SI titles.
7. Do not simply copy paper titles.
8. SI titles should be neither too broad nor too narrow.
9. Do not combine unrelated research directions into one title.
10. Provide Chinese and English titles and 3–5 bilingual keywords.

Output format:

1. Scope判断
属于 / 不属于（原因）

2. 核心研究方向
1.
2.
3.

3. 已有SI匹配（如有）
匹配题目：
匹配度：
匹配原因：

If match ≥80%, stop here.

4. 推荐特刊题目（最多3个）

特刊题目1
英文：
中文：
关键词：
- 中文 / English
- 中文 / English
`;

        const userPrompt = `
Existing Processes SI title list:
${existingSI}

Scholar information selected by the user:
${selectedText}
`;

        callDeepSeek(systemPrompt, userPrompt, outputBox, apiKey);
    }

    function callDeepSeek(systemPrompt, userPrompt, outputBox, apiKey) {
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
                max_tokens: 1200,
                stream: false
            }),
            onload: function (response) {
                try {
                    const data = JSON.parse(response.responseText);

                    if (data.error) {
                        outputBox.value = "API Error: " + data.error.message;
                        return;
                    }

                    const result = data.choices?.[0]?.message?.content?.trim();

                    if (!result) {
                        outputBox.value = "No valid response returned from API.";
                        return;
                    }

                    outputBox.value = result;
                    GM_setClipboard(result);
                } catch (error) {
                    outputBox.value = "Failed to parse API response. Please check console.";
                    console.error(response.responseText);
                }
            },
            onerror: function (error) {
                outputBox.value = "API request failed. Please check API key, balance, or network.";
                console.error(error);
            }
        });
    }

    function copyOutput() {
        const text = document.getElementById("si-output").value.trim();

        if (text) {
            GM_setClipboard(text);
            alert("Result copied.");
        }
    }

})();
