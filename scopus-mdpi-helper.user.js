// ==UserScript==
// @author       Jiali Tang
// @name         Scopus GE Quick Screening Buttons + Floating MDPI Email Jump
// @namespace    http://tampermonkey.net/
// @version      5.3
// @description  Scopus quick screening + floating MDPI button beside selected email
// @match        https://www.scopus.com/authid/detail.uri?*
// @match        https://www2.scopus.com/authid/detail.uri?*
// @match        https://susy.mdpi.com/special_issue/process/1877901*
// @match        https://pubpeer.org/*
// @match        https://retractiondatabase.org/RetractionSearch.aspx*
// @match        *://*/*
// @downloadURL  https://raw.githubusercontent.com/scarlett-personaluse/scopus-mdpi-helper/main/scopus-mdpi-helper.user.js
// @updateURL    https://raw.githubusercontent.com/scarlett-personaluse/scopus-mdpi-helper/main/scopus-mdpi-helper.user.js
// @grant        GM_setClipboard
// @connect      www.scopus.com
// ==/UserScript==

(function () {
    'use strict';

    const MDPI_INTERNAL_URL = "https://susy.mdpi.com/special_issue/process/1877901";
    const PUBPEER_SEARCH_URL = "https://pubpeer.org/search?q=";
    const RETRACTION_URL = "https://retractiondatabase.org/RetractionSearch.aspx";
    const url = window.location.href;

    if (url.includes("scopus.com/authid/detail.uri")) {
        runScopusPage();
    } else if (url.includes("susy.mdpi.com/special_issue/process/1877901")) {
        runMdpiPage();
    } else if (url.includes("pubpeer.org")) {
        runPubPeerPage();
    } else if (url.includes("retractiondatabase.org/RetractionSearch.aspx")) {
        runRetractionPage();
    }

    createSelectedEmailMdpiButton();

    function runScopusPage() {
        if (url.startsWith("https://www2.scopus.com/authid/detail.uri?authorId=")) {
            window.location.href = url.replace("www2.scopus.com", "www.scopus.com");
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const authorId = params.get("authorId");
        if (!authorId) return;

        const apiUrl = `https://www.scopus.com/api/authors/${authorId}`;

        window.addEventListener("load", () => {
            fetch(apiUrl)
                .then(res => res.json())
                .then(data => {
                    const rawName = data.preferredName?.full || "";
                    const name = formatName(rawName);
                    const email = data.emailAddress || "";
                    const institution = data.latestAffiliatedInstitution?.name || "";
                    createButtonBar(name, email, institution);
                })
                .catch(err => {
                    console.error(err);
                    createButtonBar("", "", "");
                });
        });
    }

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
        emailText.title = email ? "Click to copy email" : "No email found";

        Object.assign(emailText.style, {
            padding: "8px 12px",
            borderRadius: "8px",
            background: email ? "#f6ffed" : "#fff1f0",
            color: email ? "#237804" : "#a8071a",
            fontSize: "13px",
            fontWeight: "600",
            cursor: email ? "pointer" : "default",
            border: "1px solid " + (email ? "#b7eb8f" : "#ffa39e")
        });

        emailText.onclick = () => {
            if (email) GM_setClipboard(email);
        };

        bar.appendChild(emailText);

        const buttons = [
            {
                text: "MDPI",
                color: "#1677ff",
                onclick: () => {
                    if (!email) return;
                    GM_setClipboard(email);
                    window.open(`${MDPI_INTERNAL_URL}?geEmail=${encodeURIComponent(email)}`, "_blank");
                }
            },
            {
                text: "PubPeer",
                color: "#722ed1",
                onclick: () => {
                    if (!name) return;
                    window.open(`${PUBPEER_SEARCH_URL}${encodeURIComponent(name)}`, "_blank");
                }
            },
            {
                text: "Retraction",
                color: "#fa541c",
                onclick: () => {
                    if (!name) return;
                    window.open(`${RETRACTION_URL}?geName=${encodeURIComponent(name)}`, "_blank");
                }
            },
            {
                text: "Google",
                color: "#595959",
                onclick: () => {
                    window.open(`https://www.google.com/search?q=${encodeURIComponent(`${name} ${institution}`)}`, "_blank");
                }
            },
            {
                text: "Scholar",
                color: "#13c2c2",
                onclick: () => {
                    window.open(`https://scholar.google.com/scholar?q=${encodeURIComponent(`${name} ${institution}`)}`, "_blank");
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

        document.body.appendChild(bar);
    }

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
                    const selection = window.getSelection();
                    const selectedText = selection.toString().trim();

                    const emailMatch = selectedText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

                    if (!emailMatch || selection.rangeCount === 0) {
                        btn.style.display = "none";
                        currentEmail = "";
                        return;
                    }

                    currentEmail = emailMatch[0];

                    const rect = selection.getRangeAt(0).getBoundingClientRect();

                    btn.style.left = `${rect.right + window.scrollX + 8}px`;
                    btn.style.top = `${rect.top + window.scrollY - 4}px`;
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
                window.open(`${MDPI_INTERNAL_URL}?geEmail=${encodeURIComponent(currentEmail)}`, "_blank");
            };
        });
    }

    function runMdpiPage() {
        const params = new URLSearchParams(window.location.search);
        const email = params.get("geEmail");
        if (!email) return;

        window.addEventListener("load", () => {
            setTimeout(() => {
                closeMdpiPopup();

                const input = findEmailInput();

                if (!input) {
                    GM_setClipboard(email);
                    alert("Email copied, but the E-Mail input box was not found.");
                    return;
                }

                fillInput(input, email);

                setTimeout(() => {
                    const nextBtn = findCorrectNextButton(input);

                    if (nextBtn) {
                        nextBtn.click();
                        setTimeout(closeMdpiPopup, 800);
                        setTimeout(closeMdpiPopup, 1500);
                        setTimeout(closeMdpiPopup, 2500);
                    } else {
                        alert("Email filled, but the correct Next button was not found.");
                    }
                }, 600);

            }, 1200);
        });
    }

    function findCorrectNextButton(input) {
        const buttons = Array.from(
            document.querySelectorAll("button, input[type='button'], input[type='submit'], a")
        );

        const nextButtons = buttons.filter(el => {
            const text = (el.innerText || el.value || "").trim().toLowerCase();
            return text === "next";
        });

        if (!nextButtons.length) return null;

        const inputRect = input.getBoundingClientRect();

        nextButtons.sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();

            const da = Math.abs(ra.top - inputRect.bottom) + Math.abs(ra.left - inputRect.left);
            const db = Math.abs(rb.top - inputRect.bottom) + Math.abs(rb.left - inputRect.left);

            return da - db;
        });

        return nextButtons[0];
    }

    function closeMdpiPopup() {
        const candidates = Array.from(
            document.querySelectorAll("button, a, span, div")
        );

        const closeBtn = candidates.find(el => {
            const text = (el.innerText || el.textContent || "").trim();
            const aria = (el.getAttribute("aria-label") || "").toLowerCase();
            const cls = (el.className || "").toString().toLowerCase();

            return (
                text === "×" ||
                text === "x" ||
                aria.includes("close") ||
                cls.includes("close")
            );
        });

        if (closeBtn) closeBtn.click();
    }

    function runPubPeerPage() {
        const params = new URLSearchParams(window.location.search);
        const q = params.get("q");
        if (!q) return;

        const searchKey = "pubpeer_searched_" + q;
        if (sessionStorage.getItem(searchKey)) return;
        sessionStorage.setItem(searchKey, "1");

        window.addEventListener("load", () => {
            setTimeout(() => {
                const input = findSearchInput();

                if (input) fillInput(input, q);

                const btn =
                    findButtonByText(["Search"]) ||
                    document.querySelector("button[type='submit'], input[type='submit']");

                if (btn) btn.click();
            }, 800);
        });
    }

    function runRetractionPage() {
        const params = new URLSearchParams(window.location.search);
        const name = params.get("geName");
        if (!name) return;

        const searchKey = "retraction_searched_" + name;
        if (sessionStorage.getItem(searchKey)) return;
        sessionStorage.setItem(searchKey, "1");

        window.addEventListener("load", () => {
            setTimeout(() => {
                const input = findRetractionInput();
                if (!input) return;

                fillInput(input, name);

                const btn =
                    document.querySelector("input[type='submit']") ||
                    document.querySelector("button[type='submit']") ||
                    findButtonByText(["Search", "Submit", "Go"]);

                if (btn) {
                    btn.click();
                } else {
                    const form = input.closest("form");
                    if (form) form.submit();
                }
            }, 1500);
        });
    }

    function findEmailInput() {
        const selectors = [
            "input[type='email']",
            "input[name*='email' i]",
            "input[id*='email' i]",
            "input[placeholder*='email' i]"
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && !el.disabled && el.offsetParent !== null) return el;
        }

        const labels = Array.from(document.querySelectorAll("label, td, th, div, span"));

        const emailLabel = labels.find(el =>
            /email/i.test(el.textContent || "") &&
            (el.textContent || "").length < 80
        );

        if (emailLabel) {
            const parent = emailLabel.closest("tr, div, form") || document.body;
            const input = parent.querySelector("input[type='text'], input:not([type])");

            if (input && !input.disabled && input.offsetParent !== null) return input;
        }

        return null;
    }

    function findSearchInput() {
        const selectors = [
            "input[type='search']",
            "input[name*='search' i]",
            "input[id*='search' i]",
            "input[placeholder*='search' i]",
            "input[type='text']"
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && !el.disabled && el.offsetParent !== null) return el;
        }

        return null;
    }

    function findRetractionInput() {
        const selectors = [
            "input[id*='Author' i]",
            "input[name*='Author' i]",
            "input[id*='author' i]",
            "input[name*='author' i]",
            "input[id*='Search' i]",
            "input[name*='Search' i]",
            "input[id*='txt' i]",
            "input[name*='txt' i]",
            "input[type='text']"
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && !el.disabled && el.offsetParent !== null) return el;
        }

        return null;
    }

    function findButtonByText(words) {
        const candidates = Array.from(
            document.querySelectorAll("button, input[type='button'], input[type='submit'], a")
        );

        return candidates.find(el => {
            const text = (el.innerText || el.value || "").trim().toLowerCase();
            return words.some(word => text.includes(word.toLowerCase()));
        });
    }

    function fillInput(input, value) {
        input.focus();

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value"
        )?.set;

        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(input, value);
        } else {
            input.value = value;
        }

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
    }

    function formatName(scopusName) {
        if (!scopusName) return "";

        if (scopusName.includes(",")) {
            const parts = scopusName.split(",");
            const last = parts[0].trim();
            const first = parts.slice(1).join(",").trim();
            return `${first} ${last}`.trim();
        }

        return scopusName.trim();
    }

})();
