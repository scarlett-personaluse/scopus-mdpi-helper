// ==UserScript==
// @name         SI AI Search Query & Keyword Generator
// @namespace    SI-Keyword-Generator
// @version      1.1
// @author       Jiali Tang
// @description  Generate Scilit Boolean search query and keyword list from selected Special Issue text
// @match        *://*/*
// @icon         https://pub.mdpi-res.com/img/journals/processes-logo-sq.png
// @downloadURL  https://raw.githubusercontent.com/scarlett-personaluse/scopus-mdpi-helper/main/SI-Keyword-Generator.user.js
// @updateURL    https://raw.githubusercontent.com/scarlett-personaluse/scopus-mdpi-helper/main/SI-Keyword-Generator.user.js
// @homepageURL  https://github.com/scarlett-personaluse/scopus-mdpi-helper
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.deepseek.com
// ==/UserScript==

(function () {
    'use strict';

    const API_URL = 'https://api.deepseek.com/chat/completions';
    const MODEL = 'deepseek-chat';

    GM_registerMenuCommand('Generate SI Search Query + Keywords', async () => {
        const selectedText = window.getSelection().toString().trim();

        if (!selectedText) {
            alert('Please select the Special Issue content first.');
            return;
        }

        let apiKey = GM_getValue('DEEPSEEK_API_KEY', '');

        if (!apiKey) {
            apiKey = prompt('Please enter your DeepSeek API key:');
            if (!apiKey) return;
            GM_setValue('DEEPSEEK_API_KEY', apiKey.trim());
        }

        showLoadingBox('Generating search query and keywords...');

        try {
            const result = await callDeepSeek(apiKey, selectedText);
            showResultBox(result);
        } catch (error) {
            removeExistingBox();
            alert('Error: ' + error.message);
            console.error(error);
        }
    });

    GM_registerMenuCommand('Reset DeepSeek API Key', () => {
        GM_setValue('DEEPSEEK_API_KEY', '');
        alert('API key has been reset.');
    });

    function buildPrompt(selectedText) {
        return `
You are an expert assistant for academic literature searching and Special Issue author discovery.

The following text is selected from a Special Issue webpage. It may include the Special Issue title, guest editor research interests, summary, aims and scope, and keywords.

Your task is to generate two outputs:

1. A Boolean search query for MDPI Scilit or similar academic databases.
   - The query should be broad enough to retrieve potentially relevant papers and authors.
   - Use important synonyms and related terms.
   - Use OR within concept groups.
   - Use AND between different concept groups.
   - Avoid overly narrow or too many mandatory terms.
   - Prefer title/abstract/keyword-friendly phrases.
   - Keep the query practical and not excessively long.
   - The query should be suitable for searching papers related to the Special Issue and identifying potential authors.
   - Do not include field tags unless necessary.
   - Do not include explanations.

2. A keyword list for rough screening of exported literature records in Excel.
   - Each keyword or phrase must be on a separate line.
   - Keywords should be directly relevant to the Special Issue.
   - Include synonyms, variant spellings, abbreviations, and closely related technical terms.
   - Avoid overly generic words such as "study", "method", "process", "system", "analysis", "model", or "performance" unless they are part of a meaningful phrase.
   - Do not number the keywords.
   - Do not use bullet points.
   - Prefer 20–50 keywords depending on the scope of the Special Issue.
   - The keywords should be suitable for matching against paper titles, author keywords, and abstracts.

Return the result strictly in the following format:

[SCILIT_SEARCH_QUERY]
...

[KEYWORD_LIST]
...

Selected Special Issue text:
${selectedText}
        `.trim();
    }

    function callDeepSeek(apiKey, selectedText) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: API_URL,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                data: JSON.stringify({
                    model: MODEL,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a professional academic search strategy assistant. Return only the requested formatted output.'
                        },
                        {
                            role: 'user',
                            content: buildPrompt(selectedText)
                        }
                    ],
                    temperature: 0.3
                }),
                onload: function (response) {
                    try {
                        const data = JSON.parse(response.responseText);

                        if (data.error) {
                            reject(new Error(data.error.message || 'API error'));
                            return;
                        }

                        const content = data.choices?.[0]?.message?.content;

                        if (!content) {
                            reject(new Error('No content returned by AI.'));
                            return;
                        }

                        resolve(content.trim());
                    } catch (e) {
                        reject(new Error('Failed to parse API response.'));
                    }
                },
                onerror: function () {
                    reject(new Error('Network request failed.'));
                },
                ontimeout: function () {
                    reject(new Error('Request timed out.'));
                }
            });
        });
    }

    function parseSections(text) {
        const queryMatch = text.match(/\[SCILIT_SEARCH_QUERY\]([\s\S]*?)\[KEYWORD_LIST\]/i);
        const keywordMatch = text.match(/\[KEYWORD_LIST\]([\s\S]*)/i);

        return {
            query: queryMatch ? queryMatch[1].trim() : '',
            keywords: keywordMatch ? keywordMatch[1].trim() : ''
        };
    }

    function showLoadingBox(message) {
        removeExistingBox();

        const box = document.createElement('div');
        box.id = 'si-ai-generator-box';
        box.style.cssText = `
            position: fixed;
            top: 50%;
            right: 30px;
            transform: translateY(-50%);
            width: 420px;
            z-index: 999999;
            background: #ffffff;
            color: #222;
            border: 1px solid #ccc;
            border-radius: 10px;
            padding: 16px;
            box-shadow: 0 4px 18px rgba(0,0,0,0.2);
            font-family: Arial, sans-serif;
            font-size: 14px;
        `;

        box.innerHTML = `
            <div id="si-ai-drag-handle-loading"
                 style="font-weight: bold; margin-bottom: 10px; cursor: move;">
                SI AI Generator
            </div>
            <div>${escapeHtml(message)}</div>
        `;

        document.body.appendChild(box);
        makeDraggable(box, document.getElementById('si-ai-drag-handle-loading'));
    }

    function showResultBox(resultText) {
        removeExistingBox();

        const sections = parseSections(resultText);
        const query = sections.query || resultText;
        const keywords = sections.keywords || '';

        const box = document.createElement('div');
        box.id = 'si-ai-generator-box';
        box.style.cssText = `
            position: fixed;
            top: 50%;
            right: 30px;
            transform: translateY(-50%);
            width: 560px;
            max-height: 82vh;
            overflow-y: auto;
            z-index: 999999;
            background: #ffffff;
            color: #222;
            border: 1px solid #ccc;
            border-radius: 10px;
            padding: 16px;
            box-shadow: 0 4px 18px rgba(0,0,0,0.25);
            font-family: Arial, sans-serif;
            font-size: 14px;
        `;

        box.innerHTML = `
            <div id="si-ai-drag-handle-result"
                 style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; cursor: move;">
                <div style="font-weight: bold; font-size: 16px;">
                    SI Search Query & Keywords
                </div>
                <button id="si-ai-close"
                        style="cursor: pointer; border: none; background: #eee; border-radius: 4px; padding: 2px 8px; font-size: 16px;">
                    ×
                </button>
            </div>

            <div style="margin-bottom: 10px;">
                <button id="copy-query" style="margin-right: 8px; cursor: pointer;">Copy Scilit Query</button>
                <button id="copy-keywords" style="margin-right: 8px; cursor: pointer;">Copy Keywords</button>
                <button id="copy-all" style="cursor: pointer;">Copy All</button>
            </div>

            <div style="font-weight: bold; margin-top: 12px;">
                Scilit Search Query
            </div>
            <textarea id="si-query-text"
                      style="width: 100%; height: 160px; margin-top: 6px; font-family: Consolas, monospace; font-size: 13px; box-sizing: border-box;">${escapeHtml(query)}</textarea>

            <div style="font-weight: bold; margin-top: 14px;">
                Keyword List
            </div>
            <textarea id="si-keyword-text"
                      style="width: 100%; height: 240px; margin-top: 6px; font-family: Consolas, monospace; font-size: 13px; box-sizing: border-box;">${escapeHtml(keywords)}</textarea>
        `;

        document.body.appendChild(box);

        makeDraggable(box, document.getElementById('si-ai-drag-handle-result'));

        document.getElementById('si-ai-close').onclick = removeExistingBox;

        document.getElementById('copy-query').onclick = () => {
            const text = document.getElementById('si-query-text').value;
            GM_setClipboard(text);
            alert('Scilit query copied.');
        };

        document.getElementById('copy-keywords').onclick = () => {
            const text = document.getElementById('si-keyword-text').value;
            GM_setClipboard(text);
            alert('Keyword list copied.');
        };

        document.getElementById('copy-all').onclick = () => {
            const queryText = document.getElementById('si-query-text').value;
            const keywordText = document.getElementById('si-keyword-text').value;

            const allText =
`[SCILIT_SEARCH_QUERY]
${queryText}

[KEYWORD_LIST]
${keywordText}`;

            GM_setClipboard(allText);
            alert('All content copied.');
        };
    }

    function makeDraggable(box, handle) {
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;

        if (!box || !handle) return;

        handle.addEventListener('mousedown', function (e) {
            if (e.target.tagName.toLowerCase() === 'button') return;

            isDragging = true;

            const rect = box.getBoundingClientRect();

            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;

            box.style.left = rect.left + 'px';
            box.style.top = rect.top + 'px';
            box.style.right = 'auto';
            box.style.transform = 'none';

            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', function (e) {
            if (!isDragging) return;

            let newLeft = e.clientX - offsetX;
            let newTop = e.clientY - offsetY;

            const boxRect = box.getBoundingClientRect();
            const maxLeft = window.innerWidth - boxRect.width;
            const maxTop = window.innerHeight - 40;

            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));

            box.style.left = newLeft + 'px';
            box.style.top = newTop + 'px';
        });

        document.addEventListener('mouseup', function () {
            if (!isDragging) return;

            isDragging = false;
            document.body.style.userSelect = '';
        });
    }

    function removeExistingBox() {
        const oldBox = document.getElementById('si-ai-generator-box');
        if (oldBox) oldBox.remove();
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

})();
