// ==UserScript==
// @name         Reviewer Scope Checker
// @namespace    Reviewer-Scope-Checker
// @downloadURL  https://raw.githubusercontent.com/scarlett-personaluse/scopus-mdpi-helper/main/Reviewer-Scope-Checker.user.js
// @updateURL    https://raw.githubusercontent.com/scarlett-personaluse/scopus-mdpi-helper/main/Reviewer-Scope-Checker.user.js
// @homepageURL  https://github.com/scarlett-personaluse/scopus-mdpi-helper
// @version      1.0
// @author       Jiali Tang
// @description  Check whether an invited reviewer fits the scope of a manuscript using DeepSeek
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.deepseek.com
// ==/UserScript==

(function () {
    'use strict';

    const MODEL = "deepseek-chat";
    const API_URL = "https://api.deepseek.com/v1/chat/completions";

    const API_KEY_STORAGE = "reviewer_scope_deepseek_api_key";
    const API_KEY_TIME_STORAGE = "reviewer_scope_deepseek_api_key_time";
    const API_KEY_VALID_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    GM_registerMenuCommand("Set / Reset DeepSeek API Key", () => {
        const newKey = prompt("Please enter your DeepSeek API Key:");
        if (!newKey) return;

        GM_setValue(API_KEY_STORAGE, newKey.trim());
        GM_setValue(API_KEY_TIME_STORAGE, String(Date.now()));

        alert("DeepSeek API Key saved for 7 days in this browser.");
    });

    createUI();

    function getApiKey() {
        let apiKey = GM_getValue(API_KEY_STORAGE, "");
        let apiKeyTime = Number(GM_getValue(API_KEY_TIME_STORAGE, "0"));
        const now = Date.now();

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
        miniBtn.textContent = "Reviewer Scope";

        Object.assign(miniBtn.style, {
            position: "fixed",
            right: "18px",
            top: "68%",
            transform: "translateY(-50%)",
            zIndex: "999999",
            padding: "10px 14px",
            border: "none",
            borderRadius: "20px",
            background: "#722ed1",
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
            top: "68%",
            transform: "translateY(-50%)",
            width: "430px",
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
            <div id="reviewer-scope-drag-handle"
                 style="background:#722ed1;color:white;padding:10px 12px;font-weight:700;display:flex;justify-content:space-between;align-items:center;cursor:move;">
                <span>Reviewer Scope Checker</span>
                <button id="reviewer-scope-minimize"
                        style="border:none;background:white;color:#722ed1;border-radius:6px;cursor:pointer;font-weight:700;">−</button>
            </div>

            <div style="padding:12px;max-height:calc(88vh - 44px);overflow-y:auto;">
                <div class="scope-label">Reviewer information</div>
                <textarea id="reviewer-info"
                          placeholder="Paste the reviewer's recent publications, homepage information, research interests, or profile text here..."
                          class="scope-textarea"
                          style="height:145px;"></textarea>

                <div style="display:flex;gap:6px;margin:6px 0 10px 0;">
                    <button id="fill-reviewer-selected-btn" class="scope-small-btn">Use Selected Text as Reviewer Info</button>
                    <button id="clear-reviewer-btn" class="scope-small-btn">Clear</button>
                </div>

                <div class="scope-label">Manuscript title <span style="color:#d4380d;">*</span></div>
                <textarea id="article-title"
                          placeholder="Paste the manuscript title here. This field is required."
                          class="scope-textarea"
                          style="height:58px;"></textarea>

                <div class="scope-label">Manuscript abstract optional</div>
                <textarea id="article-abstract"
                          placeholder="Paste the abstract here if available. This field is optional."
                          class="scope-textarea"
                          style="height:115px;"></textarea>

                <div style="display:flex;gap:6px;margin:8px 0;">
                    <button id="check-scope-btn" class="scope-btn">Check Reviewer Scope</button>
                    <button id="copy-scope-result-btn" class="scope-btn">Copy Result</button>
                </div>

                <button id="reset-scope-api-key-btn" class="scope-btn">Set / Reset API Key</button>

                <div class="scope-label" style="margin-top:10px;">Result</div>
                <textarea id="scope-result"
                          placeholder="The English and Chinese scope judgment will appear here..."
                          class="scope-textarea"
                          style="height:150px;"></textarea>
            </div>
        `;

        document.body.appendChild(miniBtn);
        document.body.appendChild(panel);

        const style = document.createElement("style");
        style.textContent = `
            .scope-label {
                font-size: 13px;
                font-weight: 700;
                color: #333;
                margin: 8px 0 5px 0;
            }

            .scope-textarea {
                width: 100%;
                border: 1px solid #ccc;
                border-radius: 8px;
                padding: 8px;
                font-size: 12px;
                resize: vertical;
                box-sizing: border-box;
                font-family: Arial, sans-serif;
            }

            .scope-btn {
                flex: 1;
                width: 100%;
                margin: 4px 0;
                padding: 8px;
                border: none;
                border-radius: 8px;
                background: #f9f0ff;
                color: #531dab;
                cursor: pointer;
                font-size: 13px;
                text-align: center;
            }

            .scope-btn:hover {
                background: #efdbff;
            }

            .scope-small-btn {
                flex: 1;
                padding: 7px;
                border: none;
                border-radius: 8px;
                background: #f9f0ff;
                color: #531dab;
                cursor: pointer;
                font-size: 12px;
            }

            .scope-small-btn:hover {
                background: #efdbff;
            }
        `;
        document.head.appendChild(style);

        makeDraggable(miniBtn, miniBtn);
        makeDraggable(panel, document.getElementById("reviewer-scope-drag-handle"));

        miniBtn.onclick = () => {
            if (miniBtn.dataset.dragged === "true") {
                miniBtn.dataset.dragged = "false";
                return;
            }

            miniBtn.style.display = "none";
            panel.style.display = "block";
        };

        document.getElementById("reviewer-scope-minimize").onclick = () => {
            panel.style.display = "none";
            miniBtn.style.display = "block";
        };

        document.getElementById("fill-reviewer-selected-btn").onclick = () => {
            const selectedText = window.getSelection().toString().trim();

            if (!selectedText) {
                alert("Please select reviewer information on the webpage first.");
                return;
            }

            document.getElementById("reviewer-info").value = selectedText;
        };

        document.getElementById("clear-reviewer-btn").onclick = () => {
            document.getElementById("reviewer-info").value = "";
        };

        document.getElementById("check-scope-btn").onclick = checkReviewerScope;
        document.getElementById("copy-scope-result-btn").onclick = copyScopeResult;

        document.getElementById("reset-scope-api-key-btn").onclick = () => {
            const newKey = prompt("Please enter your DeepSeek API Key:");
            if (!newKey) return;

            GM_setValue(API_KEY_STORAGE, newKey.trim());
            GM_setValue(API_KEY_TIME_STORAGE, String(Date.now()));

            alert("DeepSeek API Key saved for 7 days in this browser.");
        };
    }

    function makeDraggable(box, handle) {
        let isDragging = false;
        let moved = false;
        let offsetX = 0;
        let offsetY = 0;
        let startX = 0;
        let startY = 0;

        if (!box || !handle) return;

        handle.addEventListener("mousedown", function (e) {
            if (e.target.tagName.toLowerCase() === "button" && handle !== box) return;

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
        });

        document.addEventListener("mousemove", function (e) {
            if (!isDragging) return;

            if (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3) {
                moved = true;
                box.dataset.dragged = "true";
            }

            let newLeft = e.clientX - offsetX;
            let newTop = e.clientY - offsetY;

            const boxRect = box.getBoundingClientRect();
            const maxLeft = window.innerWidth - boxRect.width;
            const maxTop = window.innerHeight - boxRect.height;

            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));

            box.style.left = newLeft + "px";
            box.style.top = newTop + "px";
        });

        document.addEventListener("mouseup", function () {
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
        });
    }

    function checkReviewerScope() {
        const reviewerInfo = document.getElementById("reviewer-info").value.trim();
        const articleTitle = document.getElementById("article-title").value.trim();
        const articleAbstract = document.getElementById("article-abstract").value.trim();
        const resultBox = document.getElementById("scope-result");

        if (!reviewerInfo) {
            alert("Please paste reviewer information first.");
            return;
        }

        if (!articleTitle) {
            alert("Manuscript title is required.");
            return;
        }

        const apiKey = getApiKey();
        if (!apiKey) return;

        resultBox.value = "Checking reviewer scope...";

        const systemPrompt = `
You are an experienced academic editorial assistant.

Your task is to judge whether an invited reviewer is out of scope for a manuscript.

You must compare:
1. The reviewer's research field based on recent publications, homepage information, research interests, or profile text.
2. The manuscript's field based on the title and optional abstract.

You must identify both:
- the broad academic discipline, such as biochemical/environmental/materials field, geology, geotechnical engineering, mining engineering, analytical chemistry, organic chemistry, chemical engineering, environmental engineering, mechanical engineering, computer science, medicine, agriculture, ecology, etc.
- the specific subfield or research direction within that broad discipline.

The final output must be very brief and suitable for editorial notes.

Rules:
1. If the reviewer is clearly out of scope, start the English sentence with "OOS,".
2. If the reviewer appears suitable or partly suitable, start with "In scope," or "Partly in scope,".
3. Do not invent specific research areas not supported by the input.
4. If the input is insufficient, say "Unclear,".
5. Output one concise English sentence and one concise Chinese sentence only.
6. Do not provide bullet points.
7. Do not provide detailed reasoning.
8. The English sentence should follow this style:
   "OOS, the reviewer works mainly in [broad discipline]—[specific subfield], whereas the manuscript focuses on [broad discipline]—[specific subfield], so the reviewer is not suitable."
9. The Chinese sentence should be a direct Chinese counterpart.
`;

        const userPrompt = `
Reviewer information:
${reviewerInfo}

Manuscript title:
${articleTitle}

Manuscript abstract optional:
${articleAbstract || "Not provided."}

Please judge whether the reviewer fits the manuscript scope.

Return strictly in this format:

English:
...

Chinese:
...
`;

        callDeepSeek(systemPrompt, userPrompt, resultBox, apiKey);
    }

    function callDeepSeek(systemPrompt, userPrompt, resultBox, apiKey) {
        GM_xmlhttpRequest({
            method: "POST",
            url: API_URL,
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
                temperature: 0.2,
                max_tokens: 500,
                stream: false
            }),
            onload: function (response) {
                try {
                    const data = JSON.parse(response.responseText);

                    if (data.error) {
                        resultBox.value = "API Error: " + data.error.message;
                        return;
                    }

                    const result = data.choices?.[0]?.message?.content?.trim();

                    if (!result) {
                        resultBox.value = "No valid response returned from API.";
                        return;
                    }

                    resultBox.value = result;
                    GM_setClipboard(result);
                } catch (error) {
                    resultBox.value = "Failed to parse API response. Please check console.";
                    console.error(response.responseText);
                }
            },
            onerror: function (error) {
                resultBox.value = "API request failed. Please check API key, balance, or network.";
                console.error(error);
            }
        });
    }

    function copyScopeResult() {
        const text = document.getElementById("scope-result").value.trim();

        if (!text) {
            alert("No result to copy.");
            return;
        }

        GM_setClipboard(text);
        alert("Result copied.");
    }

})();
