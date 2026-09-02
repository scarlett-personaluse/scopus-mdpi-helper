// ==UserScript==
// @name         Scopus Modifier Extension
// @namespace    http://tampermonkey.net/
// @version      5.9
// @icon64       https://cdn.elsevier.io/verona/includes/favicons/favicon-96x96.png
// @description  Scopus quick screening + instant MDPI / PubPeer / Retraction tools
// @author       Jiali Tang, modified from SKDAY
// @contributor  liqi0601 (Original Author)
// @match        https://www.scopus.com/authid/detail.uri?*
// @match        https://www2.scopus.com/authid/detail.uri?*
// @match        https://susy.mdpi.com/special_issue/process/*
// @match        https://pubpeer.org/*
// @match        https://retractiondatabase.org/RetractionSearch.aspx*
// @match        *://*/*
// @downloadURL  https://raw.githubusercontent.com/scarlett-personaluse/scopus-mdpi-helper/main/Scopus-Modifier-Extension.user.js
// @updateURL    https://raw.githubusercontent.com/scarlett-personaluse/scopus-mdpi-helper/main/Scopus-Modifier-Extension.user.js
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      www.scopus.com
// ==/UserScript==

(function () {
    'use strict';

    const DEFAULT_MDPI_INTERNAL_URL =
        "https://susy.mdpi.com/special_issue/process/1877901";

    const MDPI_URL_STORAGE_KEY =
        "scopusHelperMdpiInternalUrl";

    const PUBPEER_SEARCH_URL =
        "https://pubpeer.org/search?q=";

    const url = window.location.href;

    if (url.includes("scopus.com/authid/detail.uri")) {
        runScopusPage();
    }
    else if (isMdpiProcessPage()) {
        runMdpiPage();
    }
    else if (url.includes("pubpeer.org")) {
        runPubPeerPage();
    }
    else if (url.includes("retractiondatabase.org/RetractionSearch.aspx")) {
        runRetractionPage();
    }

    createSelectedEmailMdpiButton();
    createMdpiSettingsLauncher();

    // =====================================================
    // Scopus
    // =====================================================

    function runScopusPage() {

        if (url.startsWith("https://www2.scopus.com/authid/detail.uri?authorId=")) {
            window.location.href =
                url.replace("www2.scopus.com", "www.scopus.com");
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const authorId = params.get("authorId");

        if (!authorId) return;

        const apiUrl =
            `https://www.scopus.com/api/authors/${authorId}`;

        window.addEventListener("load", () => {

            fetch(apiUrl)
                .then(res => res.json())
                .then(data => {

                    const rawName =
                        data.preferredName?.full || "";

                    const name =
                        formatName(rawName);

                    const email =
                        data.emailAddress || "";

                    const institution =
                        data.latestAffiliatedInstitution?.name || "";

                    createButtonBar(
                        name,
                        email,
                        institution
                    );

                })
                .catch(err => {

                    console.error(err);

                    createButtonBar("", "", "");

                });
        });
    }

    // =====================================================
    // Button Bar
    // =====================================================

    function createButtonBar(name, email, institution) {

        if (document.getElementById("scopus-ge-button-bar")) return;

        const bar = document.createElement("div");

        bar.id = "scopus-ge-button-bar";

        Object.assign(bar.style, {
            position: "fixed",
            top: "30px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: "999999",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "#ffffff",
            border: "1px solid #ccc",
            borderRadius: "10px",
            boxShadow: "0 3px 12px rgba(0,0,0,0.18)",
            padding: "10px"
        });

        const emailText = document.createElement("span");

        emailText.textContent = email || "No email";

        emailText.title =
            email
                ? "Click to copy email"
                : "No email found";

        Object.assign(emailText.style, {
            padding: "8px 12px",
            borderRadius: "8px",
            background: email ? "#f6ffed" : "#fff1f0",
            color: email ? "#237804" : "#a8071a",
            fontSize: "13px",
            fontWeight: "600",
            cursor: email ? "pointer" : "default",
            border:
                "1px solid " +
                (email ? "#b7eb8f" : "#ffa39e")
        });

        emailText.onclick = () => {

            if (!email) return;

            GM_setClipboard(email);

        };

        bar.appendChild(emailText);

        const buttons = [

            {
                text: "MDPI",
                color: "#1677ff",
                onclick: () => {

                    if (!email) return;

                    GM_setClipboard(email);

                    openMdpiForEmail(email);
                }
            },

            {
                text: "PubPeer",
                color: "#722ed1",
                onclick: () => {

                    if (!name) return;

                    window.open(
                        `${PUBPEER_SEARCH_URL}${encodeURIComponent(name)}`,
                        "_blank"
                    );
                }
            },

            {
                text: "Retraction",
                color: "#fa541c",
                onclick: () => {

                    if (!name) return;

                    window.open(
                        buildRetractionSearchUrl(name),
                        "_blank"
                    );
                }
            },

            {
                text: "Google",
                color: "#595959",
                onclick: () => {

                    const query =
                        `${name} ${institution}`;

                    window.open(
                        `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                        "_blank"
                    );
                }
            },

            {
                text: "Scholar",
                color: "#13c2c2",
                onclick: () => {

                    const query =
                        `${name} ${institution}`;

                    window.open(
                        `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`,
                        "_blank"
                    );
                }
            }

        ];

        buttons.forEach(config => {

            const btn = document.createElement("button");

            btn.textContent = config.text;

            Object.assign(btn.style, {
                padding: "8px 12px",
                border: "none",
                borderRadius: "8px",
                background: config.color,
                color: "white",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "600"
            });

            btn.onclick = config.onclick;

            bar.appendChild(btn);

        });

        const settingsBtn = document.createElement("button");

        settingsBtn.textContent = "⚙ MDPI网页";

        Object.assign(settingsBtn.style, {
            padding: "8px 12px",
            border: "1px solid #1677ff",
            borderRadius: "8px",
            background: "#ffffff",
            color: "#1677ff",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: "600"
        });

        settingsBtn.onclick = showMdpiSettingsDialog;

        bar.appendChild(settingsBtn);

        document.body.appendChild(bar);
    }

    // =====================================================
    // Selected Email Floating Button
    // =====================================================

    function createSelectedEmailMdpiButton() {

        if (url.includes("susy.mdpi.com")) return;

        window.addEventListener("load", () => {

            if (document.getElementById("selected-email-mdpi-btn")) return;

            const btn = document.createElement("button");

            btn.id = "selected-email-mdpi-btn";
            btn.textContent = "MDPI";

            Object.assign(btn.style, {
                position: "absolute",
                zIndex: "999999",
                padding: "6px 12px",
                border: "none",
                borderRadius: "6px",
                background: "#1677ff",
                color: "white",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "700",
                boxShadow: "0 3px 10px rgba(0,0,0,0.25)",
                display: "none"
            });

            document.body.appendChild(btn);

            let currentEmail = "";

            document.addEventListener("mouseup", () => {

                setTimeout(() => {

                    const selection =
                        window.getSelection();

                    const selectedText =
                        selection.toString().trim();

                    const emailMatch =
                        selectedText.match(
                            /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
                        );

                    if (!emailMatch || selection.rangeCount === 0) {

                        btn.style.display = "none";
                        currentEmail = "";

                        return;
                    }

                    currentEmail = emailMatch[0];

                    const rect =
                        selection.getRangeAt(0)
                            .getBoundingClientRect();

                    btn.style.left =
                        `${rect.right + window.scrollX + 8}px`;

                    btn.style.top =
                        `${rect.top + window.scrollY - 4}px`;

                    btn.style.display = "block";

                }, 80);
            });

            document.addEventListener("mousedown", event => {

                if (event.target === btn) return;

                btn.style.display = "none";

            });

            btn.onclick = event => {

                event.preventDefault();
                event.stopPropagation();

                if (!currentEmail) return;

                GM_setClipboard(currentEmail);

                openMdpiForEmail(currentEmail);
            };
        });
    }

    // =====================================================
    // MDPI URL Settings
    // =====================================================

    function getMdpiInternalUrl() {

        return GM_getValue(
            MDPI_URL_STORAGE_KEY,
            DEFAULT_MDPI_INTERNAL_URL
        );
    }

    function normalizeMdpiUrl(rawUrl) {

        const value = (rawUrl || "").trim();

        if (!value) {
            throw new Error("请输入 MDPI 内部网页地址。");
        }

        let parsed;

        try {
            parsed = new URL(value);
        } catch (error) {
            throw new Error("网页地址格式不正确，请输入完整的 https:// 地址。");
        }

        if (
            parsed.protocol !== "https:" ||
            parsed.hostname !== "susy.mdpi.com" ||
            !parsed.pathname.startsWith("/special_issue/process/")
        ) {
            throw new Error(
                "请输入 https://susy.mdpi.com/special_issue/process/... 格式的网页。"
            );
        }

        parsed.search = "";
        parsed.hash = "";

        return parsed.toString().replace(/\/$/, "");
    }

    function buildMdpiUrl(email) {

        const target = new URL(getMdpiInternalUrl());

        target.searchParams.set("geEmail", email);

        return target.toString();
    }

    function openMdpiForEmail(email) {

        window.open(buildMdpiUrl(email), "_blank");
    }

    function isMdpiProcessPage() {

        return (
            window.location.hostname === "susy.mdpi.com" &&
            window.location.pathname.startsWith("/special_issue/process/")
        );
    }

    function currentMdpiPageUrl() {

        if (!isMdpiProcessPage()) return "";

        return `${window.location.origin}${window.location.pathname}`
            .replace(/\/$/, "");
    }

    function createMdpiSettingsLauncher() {

        if (!isMdpiProcessPage()) return;

        window.addEventListener("load", () => {

            if (document.getElementById("mdpi-url-settings-launcher")) return;

            const btn = document.createElement("button");

            btn.id = "mdpi-url-settings-launcher";
            btn.textContent = "⚙ 设置为邮箱验证页";

            Object.assign(btn.style, {
                position: "fixed",
                right: "20px",
                bottom: "20px",
                zIndex: "999999",
                padding: "9px 14px",
                border: "none",
                borderRadius: "8px",
                background: "#1677ff",
                color: "white",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "700",
                boxShadow: "0 3px 12px rgba(0,0,0,0.25)"
            });

            btn.onclick = showMdpiSettingsDialog;

            document.body.appendChild(btn);
        });
    }

    function showMdpiSettingsDialog() {

        const existing = document.getElementById("mdpi-url-settings-overlay");

        if (existing) existing.remove();

        const overlay = document.createElement("div");
        overlay.id = "mdpi-url-settings-overlay";

        Object.assign(overlay.style, {
            position: "fixed",
            inset: "0",
            zIndex: "1000000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.38)"
        });

        const panel = document.createElement("div");

        Object.assign(panel.style, {
            width: "min(620px, calc(100vw - 40px))",
            boxSizing: "border-box",
            padding: "22px",
            borderRadius: "12px",
            background: "#ffffff",
            boxShadow: "0 8px 30px rgba(0,0,0,0.28)",
            fontFamily: "Arial, sans-serif"
        });

        const title = document.createElement("div");
        title.textContent = "MDPI 邮箱验证网页";
        Object.assign(title.style, {
            marginBottom: "8px",
            color: "#1f1f1f",
            fontSize: "18px",
            fontWeight: "700"
        });

        const description = document.createElement("div");
        description.textContent =
            "保存后会一直使用这个网页，除非你再次修改或恢复默认。";
        Object.assign(description.style, {
            marginBottom: "14px",
            color: "#595959",
            fontSize: "13px",
            lineHeight: "1.5"
        });

        const input = document.createElement("input");
        input.type = "url";
        input.value = getMdpiInternalUrl();
        input.placeholder =
            "https://susy.mdpi.com/special_issue/process/......";
        Object.assign(input.style, {
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            border: "1px solid #d9d9d9",
            borderRadius: "7px",
            fontSize: "14px"
        });

        const status = document.createElement("div");
        Object.assign(status.style, {
            minHeight: "20px",
            marginTop: "8px",
            color: "#cf1322",
            fontSize: "12px"
        });

        const actions = document.createElement("div");
        Object.assign(actions.style, {
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            gap: "8px",
            marginTop: "10px"
        });

        function addAction(text, color, handler, outlined = false) {

            const btn = document.createElement("button");
            btn.textContent = text;
            Object.assign(btn.style, {
                padding: "8px 12px",
                border: outlined ? `1px solid ${color}` : "none",
                borderRadius: "7px",
                background: outlined ? "#ffffff" : color,
                color: outlined ? color : "#ffffff",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "600"
            });
            btn.onclick = handler;
            actions.appendChild(btn);
        }

        const currentPage = currentMdpiPageUrl();

        if (currentPage) {
            addAction("使用当前页面", "#722ed1", () => {
                input.value = currentPage;
                status.textContent = "已填入当前页面，请点击“保存”。";
                status.style.color = "#531dab";
            }, true);
        }

        addAction("恢复默认", "#8c8c8c", () => {
            input.value = DEFAULT_MDPI_INTERNAL_URL;
            status.textContent = "已填入默认网页，请点击“保存”。";
            status.style.color = "#595959";
        }, true);

        addAction("取消", "#8c8c8c", () => overlay.remove(), true);

        addAction("保存", "#1677ff", () => {

            try {
                const normalized = normalizeMdpiUrl(input.value);
                GM_setValue(MDPI_URL_STORAGE_KEY, normalized);
                input.value = normalized;
                status.textContent = "已保存。以后会继续使用这个网页。";
                status.style.color = "#389e0d";
                setTimeout(() => overlay.remove(), 700);
            } catch (error) {
                status.textContent = error.message;
                status.style.color = "#cf1322";
            }
        });

        panel.appendChild(title);
        panel.appendChild(description);
        panel.appendChild(input);
        panel.appendChild(status);
        panel.appendChild(actions);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        overlay.addEventListener("mousedown", event => {
            if (event.target === overlay) overlay.remove();
        });

        input.focus();
        input.select();
    }

    // =====================================================
    // MDPI
    // =====================================================

    function runMdpiPage() {

        const params =
            new URLSearchParams(window.location.search);

        const email =
            params.get("geEmail");

        if (!email) return;

        closeMdpiPopup();

        waitForElement(
            findEmailInput,
            input => {

                fillInput(input, email);

                waitForElement(
                    () => findCorrectNextButton(input),
                    nextBtn => {

                        nextBtn.click();

                        setTimeout(closeMdpiPopup, 300);
                        setTimeout(closeMdpiPopup, 800);
                        setTimeout(closeMdpiPopup, 1500);

                    },
                    3000
                );
            },
            3000
        );
    }

    // =====================================================
    // PubPeer
    // =====================================================

    function runPubPeerPage() {

        // URL 本身已经包含 search?q=
        // 不再自动点击 search
        return;
    }

    // =====================================================
    // Retraction
    // =====================================================

    function runRetractionPage() {

        // 已经直接进入最终结果页
        // 不再做任何自动搜索动作
        return;
    }

    // =====================================================
    // Helper
    // =====================================================

    function buildRetractionSearchUrl(name) {

        const encodedName =
            encodeURIComponent(name)
                .replace(/%20/g, "+");

        return `https://retractiondatabase.org/RetractionSearch.aspx?geName=${encodedName}#?geName%3d${encodedName}%26auth%3d${encodedName}`;
    }

    function waitForElement(getter, callback, timeout = 3000) {

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

            }

        }, 50);
    }

    function findCorrectNextButton(input) {

        const buttons = Array.from(
            document.querySelectorAll(
                "button, input[type='button'], input[type='submit'], a"
            )
        );

        const nextButtons =
            buttons.filter(el => {

                const text =
                    (el.innerText || el.value || "")
                        .trim()
                        .toLowerCase();

                return text === "next";
            });

        if (!nextButtons.length) return null;

        const inputRect =
            input.getBoundingClientRect();

        nextButtons.sort((a, b) => {

            const ra =
                a.getBoundingClientRect();

            const rb =
                b.getBoundingClientRect();

            const da =
                Math.abs(ra.top - inputRect.bottom) +
                Math.abs(ra.left - inputRect.left);

            const db =
                Math.abs(rb.top - inputRect.bottom) +
                Math.abs(rb.left - inputRect.left);

            return da - db;
        });

        return nextButtons[0];
    }

    function closeMdpiPopup() {

        const candidates = Array.from(
            document.querySelectorAll(
                "button, a, span, div"
            )
        );

        const closeBtn =
            candidates.find(el => {

                const text =
                    (el.innerText || el.textContent || "")
                        .trim();

                const aria =
                    (el.getAttribute("aria-label") || "")
                        .toLowerCase();

                const cls =
                    (el.className || "")
                        .toString()
                        .toLowerCase();

                return (
                    text === "×" ||
                    text === "x" ||
                    aria.includes("close") ||
                    cls.includes("close")
                );
            });

        if (closeBtn) closeBtn.click();
    }

    function findEmailInput() {

        const selectors = [

            "input[type='email']",
            "input[name*='email' i]",
            "input[id*='email' i]",
            "input[placeholder*='email' i]"

        ];

        for (const selector of selectors) {

            const el =
                document.querySelector(selector);

            if (
                el &&
                !el.disabled &&
                el.offsetParent !== null
            ) {
                return el;
            }
        }

        const labels = Array.from(
            document.querySelectorAll(
                "label, td, th, div, span"
            )
        );

        const emailLabel =
            labels.find(el =>

                /email/i.test(el.textContent || "") &&
                (el.textContent || "").length < 80

            );

        if (emailLabel) {

            const parent =
                emailLabel.closest("tr, div, form")
                || document.body;

            const input =
                parent.querySelector(
                    "input[type='text'], input:not([type])"
                );

            if (
                input &&
                !input.disabled &&
                input.offsetParent !== null
            ) {
                return input;
            }
        }

        return null;
    }

    function fillInput(input, value) {

        input.focus();

        const nativeInputValueSetter =
            Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                "value"
            )?.set;

        if (nativeInputValueSetter) {

            nativeInputValueSetter.call(
                input,
                value
            );

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
            new KeyboardEvent("keyup", {
                bubbles: true
            })
        );

        input.dispatchEvent(
            new KeyboardEvent("keydown", {
                bubbles: true
            })
        );
    }

    function formatName(scopusName) {

        if (!scopusName) return "";

        if (scopusName.includes(",")) {

            const parts =
                scopusName.split(",");

            const last =
                parts[0].trim();

            const first =
                parts.slice(1)
                    .join(",")
                    .trim();

            return `${first} ${last}`.trim();
        }

        return scopusName.trim();
    }

})();
