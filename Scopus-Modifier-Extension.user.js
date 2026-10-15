
 // ==UserScript==
 // @name         Scopus Modifier Extension
 // @namespace    http://tampermonkey.net/
 // @version      6.2
 // @icon64       https://cdn.elsevier.io/verona/includes/favicons/favicon-96x96.png
 // @description  Scopus screening + MDPI / PubPeer / Retraction / Google tools
 // @author       Jiali Tang, modified from SKDAY
 // @contributor  liqi0601 (Original Author)
 // @match        https://www.scopus.com/authid/detail.uri*
 // @match        https://www2.scopus.com/authid/detail.uri*
 // @match        https://susy.mdpi.com/special_issue/process/*
 // @match        https://pubpeer.org/*
 // @match        https://retractiondatabase.org/RetractionSearch.aspx*
 // @match        *://*/*
 // @downloadURL  https://raw.githubusercontent.com/scarlett-personaluse/scopus-mdpi-helper/main/Scopus-Modifier-Extension.user.js
 // @updateURL    https://raw.githubusercontent.com/scarlett-personaluse/scopus-mdpi-helper/main/Scopus-Modifier-Extension.user.js
 // @grant        GM_setClipboard
 // @grant        GM_getValue
 // @grant        GM_setValue
 // @run-at       document-idle
 // ==/UserScript==

 (function () {
     'use strict';

     // =====================================================
     // 1. CONFIGURATION
     // =====================================================

     const VERSION = "6.2";

     const DEFAULT_MDPI_INTERNAL_URL =
         "https://susy.mdpi.com/special_issue/process/1877901";

     const MDPI_URL_STORAGE_KEY =
         "scopusHelperMdpiInternalUrl";

     const PUBPEER_URL =
         "https://pubpeer.org/search?q=";

     const RETRACTION_URL =
         "https://retractiondatabase.org/RetractionSearch.aspx";

     const BAR_ID =
         "scopus-ge-button-bar";

     const EMAIL_BUTTON_ID =
         "selected-email-mdpi-btn";

     const hostname =
         window.location.hostname.toLowerCase();

     // =====================================================
     // 2. PAGE DETECTION
     // =====================================================

     function isScopusPage() {
         return (
             ["www.scopus.com", "www2.scopus.com"].includes(hostname) &&
             window.location.pathname === "/authid/detail.uri"
         );
     }

     function isMdpiPage() {
         return (
             hostname === "susy.mdpi.com" &&
             window.location.pathname.startsWith(
                 "/special_issue/process/"
             )
         );
     }

     function isRetractionPage() {
         return (
             hostname === "retractiondatabase.org" &&
             window.location.pathname.toLowerCase() ===
             "/retractionsearch.aspx"
         );
     }

     // =====================================================
     // 3. COMMON HELPERS
     // =====================================================

     function normalizeSpace(value) {
         return String(value || "")
             .replace(/\s+/g, " ")
             .trim();
     }

     function cleanName(value) {
         return normalizeSpace(
             String(value || "")
                 .replace(/[\u200B-\u200D\uFEFF]/g, "")
                 .replace(/\u2026/g, "")
                 .replace(/\p{Extended_Pictographic}/gu, "")
                 .replace(/[\uFE0E\uFE0F]/g, "")
                 .replace(/[↗↘↖↙]/g, "")
         );
     }

     function formatName(rawName) {
         const name = cleanName(rawName);

         if (!name) return "";

         if (name.includes(",")) {
             const parts = name.split(",");
             const last = normalizeSpace(parts.shift());
             const first = normalizeSpace(parts.join(" "));

             return cleanName(`${first} ${last}`);
         }

         return name;
     }

     function isVisible(element) {
         if (!element || !element.isConnected) {
             return false;
         }

         const style = getComputedStyle(element);

         return (
             style.display !== "none" &&
             style.visibility !== "hidden" &&
             element.getClientRects().length > 0
         );
     }

     function waitForElement(
         getter,
         callback,
         timeout = 10000
     ) {
         const start = Date.now();

         const timer = setInterval(() => {
             let element = null;

             try {
                 element = getter();
             } catch (error) {
                 console.debug(error);
             }

             if (element) {
                 clearInterval(timer);
                 callback(element);
             } else if (Date.now() - start > timeout) {
                 clearInterval(timer);
             }
         }, 100);

         return () => clearInterval(timer);
     }

     function fillInput(input, value) {
         if (!input) return;

         input.focus();

         const prototype =
             input instanceof HTMLTextAreaElement
                 ? HTMLTextAreaElement.prototype
                 : HTMLInputElement.prototype;

         const setter = Object.getOwnPropertyDescriptor(
             prototype,
             "value"
         )?.set;

         if (setter) {
             setter.call(input, value);
         } else {
             input.value = value;
         }

         input.dispatchEvent(
             new Event("input", { bubbles: true })
         );

         input.dispatchEvent(
             new Event("change", { bubbles: true })
         );
     }

     function createButton(text, color, handler) {
         const btn = document.createElement("button");

         btn.textContent = text;

         Object.assign(btn.style, {
             padding: "8px 12px",
             border: "none",
             borderRadius: "8px",
             background: color,
             color: "#fff",
             cursor: "pointer",
             fontSize: "13px",
             fontWeight: "600",
             whiteSpace: "nowrap"
         });

         btn.addEventListener("click", handler);

         return btn;
     }

     // =====================================================
     // 4. SCOPUS AUTHOR STATE
     // =====================================================

     let currentAuthor = {
         id: "",
         name: "",
         email: "",
         institution: ""
     };

     let requestSerial = 0;

     function getAuthorId() {
         const params = new URLSearchParams(
             window.location.search
         );

         return (
             params.get("authorId") ||
             params.get("authorID") ||
             ""
         );
     }

     // =====================================================
     // 5. STRICT DOM FALLBACK
     // Only used when the Scopus API fails.
     // =====================================================

     function readNameFromPage() {
         const selectors = [
             '[data-testid="author-name"]',
             '[data-testid*="author-name"]',
             '[class*="AuthorName"]',
             '[class*="authorName"]',
             "h1"
         ];

         for (const selector of selectors) {
             for (const element of document.querySelectorAll(selector)) {
                 if (!isVisible(element)) continue;

                 const clone = element.cloneNode(true);

                 clone.querySelectorAll(
                     "svg, img, button, [role='img'], " +
                     "[aria-hidden='true']"
                 ).forEach(node => node.remove());

                 const text = cleanName(clone.textContent);

                 if (
                     text.includes(",") &&
                     text.length < 120 &&
                     !text.includes("@")
                 ) {
                     return formatName(text);
                 }
             }
         }

         return "";
     }

     // =====================================================
     // 6. FETCH SCOPUS AUTHOR DATA
     // =====================================================

     async function fetchAuthorData(authorId) {
         const apiUrl =
             `https://www.scopus.com/api/authors/${encodeURIComponent(authorId)}`;

         const response = await fetch(apiUrl, {
             credentials: "include",
             cache: "no-store"
         });

         if (!response.ok) {
             throw new Error(
                 `Scopus API returned ${response.status}`
             );
         }

         const data = await response.json();

         return {
             id: authorId,
             name: formatName(
                 data.preferredName?.full || ""
             ),
             email: data.emailAddress || "",
             institution:
                 data.latestAffiliatedInstitution?.name || ""
         };
     }

     // =====================================================
     // 7. UPDATE CURRENT SCOPUS AUTHOR
     // =====================================================

     async function updateAuthor(authorId) {
         const serial = ++requestSerial;

         // Immediately clear the previous author.
         currentAuthor = {
             id: authorId,
             name: "",
             email: "",
             institution: ""
         };

         removeButtonBar();

         try {
             const data = await fetchAuthorData(authorId);

             // Ignore outdated API responses.
             if (
                 serial !== requestSerial ||
                 getAuthorId() !== authorId
             ) {
                 return;
             }

             // API is the primary source.
             currentAuthor = {
                 ...data,
                 name: data.name || readNameFromPage()
             };

         } catch (error) {
             console.warn(
                 "[Scopus Helper] API unavailable:",
                 error
             );

             if (
                 serial !== requestSerial ||
                 getAuthorId() !== authorId
             ) {
                 return;
             }

             // Strict DOM fallback only.
             currentAuthor.name = readNameFromPage();
         }

         createButtonBar();
     }

     // =====================================================
     // 8. CURRENT AUTHOR ACCESS
     // =====================================================

     function getCurrentName() {
         // Never use data belonging to another Author ID.
         if (
             !getAuthorId() ||
             getAuthorId() !== currentAuthor.id
         ) {
             return "";
         }

         return cleanName(currentAuthor.name);
     }

     function getCurrentInstitution() {
         if (getAuthorId() !== currentAuthor.id) {
             return "";
         }

         return currentAuthor.institution || "";
     }

     function getCurrentEmail() {
         if (getAuthorId() !== currentAuthor.id) {
             return "";
         }

         return currentAuthor.email || "";
     }

     // =====================================================
     // 9. RETRACTION LINK
     // =====================================================

     function buildRetractionSearchUrl(name) {
         const clean = cleanName(name);

         const target = new URL(RETRACTION_URL);

         // Dedicated userscript parameter.
         target.searchParams.set(
             "scopusAuthor",
             clean
         );

         // Retraction author search fragment.
         // Use only the current clean name.
         const encoded = encodeURIComponent(clean)
             .replace(/%20/g, "+");

         target.hash = "?auth%3d" + encoded;

         return target.toString();
     }

     // =====================================================
     // 10. SCOPUS BUTTON BAR
     // =====================================================

     function removeButtonBar() {
         document.getElementById(BAR_ID)?.remove();
     }

     function createButtonBar() {
         removeButtonBar();

         if (!document.body) return;

         // Do not display previous-author data.
         if (getAuthorId() !== currentAuthor.id) {
             return;
         }

         const bar = document.createElement("div");

         bar.id = BAR_ID;

         Object.assign(bar.style, {
             position: "fixed",
             top: "30px",
             left: "50%",
             transform: "translateX(-50%)",
             zIndex: "999999",
             display: "flex",
             alignItems: "center",
             flexWrap: "wrap",
             justifyContent: "center",
             gap: "8px",
             background: "#fff",
             border: "1px solid #ccc",
             borderRadius: "10px",
             boxShadow:
                 "0 3px 12px rgba(0,0,0,0.18)",
             padding: "10px",
             maxWidth: "95vw",
             fontFamily: "Arial, sans-serif"
         });

         // Email label
         const emailText = document.createElement("span");
         const email = getCurrentEmail();

         emailText.textContent = email || "No email";

         emailText.title = email
             ? "Click to copy email"
             : "No email found";

         Object.assign(emailText.style, {
             padding: "8px 12px",
             borderRadius: "8px",
             background: email ? "#f6ffed" : "#fff1f0",
             color: email ? "#237804" : "#a8071a",
             border:
                 "1px solid " +
                 (email ? "#b7eb8f" : "#ffa39e"),
             fontSize: "13px",
             fontWeight: "600",
             cursor: email ? "pointer" : "default"
         });

         emailText.onclick = () => {
             const current = getCurrentEmail();

             if (current) {
                 GM_setClipboard(current);
             }
         };

         bar.appendChild(emailText);

         // MDPI
         bar.appendChild(
             createButton("MDPI", "#1677ff", () => {
                 const email = getCurrentEmail();

                 if (!email) return;

                 GM_setClipboard(email);
                 openMdpiForEmail(email);
             })
         );

         // PubPeer
         bar.appendChild(
             createButton("PubPeer", "#722ed1", () => {
                 const name = getCurrentName();

                 if (!name) return;

                 window.open(
                     PUBPEER_URL + encodeURIComponent(name),
                     "_blank"
                 );
             })
         );

         // Retraction
         // Uses exactly the same current name as Google.
         bar.appendChild(
             createButton("Retraction", "#fa541c", () => {
                 const name = getCurrentName();

                 if (!name) {
                     alert("Current author name not found.");
                     return;
                 }

                 window.open(
                     buildRetractionSearchUrl(name),
                     "_blank"
                 );
             })
         );

         // Google
         bar.appendChild(
             createButton("Google", "#595959", () => {
                 const name = getCurrentName();

                 if (!name) return;

                 const query =
                     `${name} ${getCurrentInstitution()}`;

                 window.open(
                     "https://www.google.com/search?q=" +
                     encodeURIComponent(query),
                     "_blank"
                 );
             })
         );

         // Google Scholar
         bar.appendChild(
             createButton("Scholar", "#13c2c2", () => {
                 const name = getCurrentName();

                 if (!name) return;

                 const query =
                     `${name} ${getCurrentInstitution()}`;

                 window.open(
                     "https://scholar.google.com/scholar?q=" +
                     encodeURIComponent(query),
                     "_blank"
                 );
             })
         );

         // MDPI settings
         bar.appendChild(
             createButton(
                 "⚙ MDPI网页",
                 "#1677ff",
                 showMdpiSettingsDialog
             )
         );

         document.body.appendChild(bar);
     }

     // =====================================================
     // 11. SCOPUS NAVIGATION MONITOR
     // =====================================================

     function runScopusPage() {
         if (hostname === "www2.scopus.com") {
             window.location.replace(
                 window.location.href.replace(
                     "www2.scopus.com",
                     "www.scopus.com"
                 )
             );
             return;
         }

         let observedAuthorId = "";

         function checkAuthor() {
             const authorId = getAuthorId();

             if (authorId === observedAuthorId) {
                 return;
             }

             observedAuthorId = authorId;

             if (!authorId) {
                 ++requestSerial;
                 currentAuthor = {
                     id: "",
                     name: "",
                     email: "",
                     institution: ""
                 };
                 removeButtonBar();
                 return;
             }

             updateAuthor(authorId);
         }

         checkAuthor();

         // Scopus may navigate without a full reload.
         setInterval(checkAuthor, 500);

         window.addEventListener("popstate", checkAuthor);
         window.addEventListener("pageshow", checkAuthor);

         document.addEventListener(
             "visibilitychange",
             () => {
                 if (!document.hidden) checkAuthor();
             }
         );
     }

     // =====================================================
     // 12. RETRACTION SEARCH PAGE
     // =====================================================

     function getRequestedRetractionName() {
         const params = new URLSearchParams(
             window.location.search
         );

         return cleanName(
             params.get("scopusAuthor") ||
             params.get("geName") ||
             ""
         );
     }

     function findRetractionAuthorInput() {
         const selectors = [
             'input[name="author"]',
             'input[name="Author"]',
             'input[name="auth"]',
             'input[id*="author" i]',
             'input[name*="author" i]',
             'input[placeholder*="author" i]',
             'input[aria-label*="author" i]',
             'input[id*="auth" i]',
             'input[name*="auth" i]'
         ];

         for (const selector of selectors) {
             for (const element of document.querySelectorAll(selector)) {
                 if (
                     isVisible(element) &&
                     !element.disabled &&
                     !element.readOnly
                 ) {
                     return element;
                 }
             }
         }

         // Fallback: find an input beside Author(s).
         const labels = document.querySelectorAll(
             "label, td, th, span"
         );

         for (const label of labels) {
             const text = normalizeSpace(label.textContent);

             if (
                 !/^author(?:\(s\))?(?:\s+name)?\s*:?\s*$/i.test(text)
             ) {
                 continue;
             }

             if (label.htmlFor) {
                 const linked = document.getElementById(
                     label.htmlFor
                 );

                 if (
                     linked &&
                     isVisible(linked) &&
                     !linked.disabled &&
                     !linked.readOnly
                 ) {
                     return linked;
                 }
             }

             const parent = label.closest("tr, div, form");
             if (!parent) continue;

             const input = parent.querySelector(
                 'input[type="text"], input:not([type])'
             );

             if (
                 input &&
                 isVisible(input) &&
                 !input.disabled &&
                 !input.readOnly
             ) {
                 return input;
             }
         }

         return null;
     }

     function runRetractionPage() {
         const requestedName = getRequestedRetractionName();

         if (!requestedName) return;

         let lastInput = null;
         let lastValue = "";

         const start = Date.now();

         function applyName() {
             const input = findRetractionAuthorInput();

             if (!input) return;

             if (
                 input === lastInput &&
                 input.value === requestedName &&
                 lastValue === requestedName
             ) {
                 return;
             }

             if (input.value !== requestedName) {
                 fillInput(input, requestedName);
             }

             lastInput = input;
             lastValue = requestedName;
         }

         applyName();

         const timer = setInterval(() => {
             applyName();

             if (Date.now() - start > 12000) {
                 clearInterval(timer);
             }
         }, 300);

         // The Retraction URL also carries the author.
         // Do not blindly click an unknown search button.
     }

     // =====================================================
     // 13. MDPI URL SETTINGS
     // =====================================================

     function getMdpiInternalUrl() {
         return GM_getValue(
             MDPI_URL_STORAGE_KEY,
             DEFAULT_MDPI_INTERNAL_URL
         );
     }

     function normalizeMdpiUrl(rawUrl) {
         const value = normalizeSpace(rawUrl);

         if (!value) {
             throw new Error(
                 "请输入 MDPI 内部网页地址。"
             );
         }

         let parsed;

         try {
             parsed = new URL(value);
         } catch (error) {
             throw new Error(
                 "请输入完整的 https:// 网页地址。"
             );
         }

         if (
             parsed.protocol !== "https:" ||
             parsed.hostname !== "susy.mdpi.com" ||
             !parsed.pathname.startsWith(
                 "/special_issue/process/"
             )
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

     // =====================================================
     // 14. MDPI SETTINGS DIALOG
     // =====================================================

     function showMdpiSettingsDialog() {
         document.getElementById(
             "mdpi-url-settings-overlay"
         )?.remove();

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
             background: "#fff",
             boxShadow: "0 8px 30px rgba(0,0,0,0.28)",
             fontFamily: "Arial, sans-serif"
         });

         const title = document.createElement("h3");
         title.textContent = "MDPI 邮箱验证网页";
         title.style.marginTop = "0";

         const description = document.createElement("p");
         description.textContent =
             "保存后会持续使用该网页，除非再次修改或恢复默认。";

         description.style.fontSize = "13px";
         description.style.color = "#595959";

         const input = document.createElement("input");
         input.type = "url";
         input.value = getMdpiInternalUrl();
         input.placeholder =
             "https://susy.mdpi.com/special_issue/process/...";

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
             fontSize: "12px",
             color: "#cf1322"
         });

         const actions = document.createElement("div");

         Object.assign(actions.style, {
             display: "flex",
             justifyContent: "flex-end",
             flexWrap: "wrap",
             gap: "8px",
             marginTop: "12px"
         });

         function addAction(text, color, handler) {
             actions.appendChild(
                 createButton(text, color, handler)
             );
         }

         if (isMdpiPage()) {
             addAction(
                 "使用当前页面",
                 "#722ed1",
                 () => {
                     input.value =
                         window.location.origin +
                         window.location.pathname;

                     status.textContent =
                         "已填入当前页面，请点击保存。";
                 }
             );
         }

         addAction("恢复默认", "#8c8c8c", () => {
             input.value = DEFAULT_MDPI_INTERNAL_URL;
             status.textContent =
                 "已恢复默认地址，请点击保存。";
         });

         addAction(
             "取消",
             "#8c8c8c",
             () => overlay.remove()
         );

         addAction("保存", "#1677ff", () => {
             try {
                 const normalized = normalizeMdpiUrl(
                     input.value
                 );

                 GM_setValue(
                     MDPI_URL_STORAGE_KEY,
                     normalized
                 );

                 status.textContent = "保存成功。";
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
             if (event.target === overlay) {
                 overlay.remove();
             }
         });
     }

     // =====================================================
     // 15. FIND MDPI EMAIL INPUT
     // =====================================================

     function findEmailInput() {
         const selectors = [
             'input[type="email"]',
             'input[name*="email" i]',
             'input[id*="email" i]',
             'input[placeholder*="email" i]'
         ];

         for (const selector of selectors) {
             const elements =
                 document.querySelectorAll(selector);

             for (const element of elements) {
                 if (
                     isVisible(element) &&
                     !element.disabled
                 ) {
                     return element;
                 }
             }
         }

         const labels = document.querySelectorAll(
             "label, td, th, div, span"
         );

         const emailLabel = Array.from(labels).find(el => {
             const text = el.textContent || "";

             return (
                 /email/i.test(text) &&
                 text.length < 80
             );
         });

         if (emailLabel) {
             const parent =
                 emailLabel.closest("tr, div, form") ||
                 document.body;

             const input = parent.querySelector(
                 'input[type="text"], input:not([type])'
             );

             if (
                 input &&
                 isVisible(input) &&
                 !input.disabled
             ) {
                 return input;
             }
         }

         return null;
     }

     // =====================================================
     // 16. FIND MDPI NEXT BUTTON
     // =====================================================

     function findCorrectNextButton(input) {
         const buttons = Array.from(
             document.querySelectorAll(
                 "button, input[type='button'], " +
                 "input[type='submit'], a"
             )
         );

         const nextButtons = buttons.filter(element => {
             const text = normalizeSpace(
                 element.innerText ||
                 element.value ||
                 ""
             ).toLowerCase();

             return text === "next" && isVisible(element);
         });

         if (!nextButtons.length) return null;

         const inputRect = input.getBoundingClientRect();

         nextButtons.sort((a, b) => {
             const ra = a.getBoundingClientRect();
             const rb = b.getBoundingClientRect();

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

     // =====================================================
     // 17. CLOSE MDPI POPUP
     // =====================================================

     function closeMdpiPopup() {
         const candidates = Array.from(
             document.querySelectorAll(
                 "button, a, span, div"
             )
         );

         const closeBtn = candidates.find(el => {
             const text = normalizeSpace(
                 el.innerText ||
                 el.textContent ||
                 ""
             );

             const aria = (
                 el.getAttribute("aria-label") || ""
             ).toLowerCase();

             const cls = String(
                 el.className || ""
             ).toLowerCase();

             return (
                 isVisible(el) &&
                 (
                     text === "×" ||
                     text === "x" ||
                     aria.includes("close") ||
                     cls.includes("close")
                 )
             );
         });

         if (closeBtn) closeBtn.click();
     }

     // =====================================================
     // 18. MDPI AUTO VERIFICATION
     // =====================================================

     function runMdpiPage() {
         const params = new URLSearchParams(
             window.location.search
         );

         const email = params.get("geEmail");

         createMdpiSettingsLauncher();

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
                     5000
                 );
             },
             10000
         );
     }

     // =====================================================
     // 19. MDPI SETTINGS LAUNCHER
     // =====================================================

     function createMdpiSettingsLauncher() {
         if (!isMdpiPage()) return;

         const id = "mdpi-url-settings-launcher";

         if (document.getElementById(id)) return;

         const btn = createButton(
             "⚙ 设置为邮箱验证页",
             "#1677ff",
             showMdpiSettingsDialog
         );

         btn.id = id;

         Object.assign(btn.style, {
             position: "fixed",
             right: "20px",
             bottom: "20px",
             zIndex: "999999",
             boxShadow:
                 "0 3px 12px rgba(0,0,0,0.25)"
         });

         document.body.appendChild(btn);
     }

     // =====================================================
     // 20. SELECTED EMAIL FLOATING BUTTON
     // =====================================================

     function createSelectedEmailMdpiButton() {
         if (isMdpiPage()) return;

         if (
             document.getElementById(EMAIL_BUTTON_ID)
         ) {
             return;
         }

         let currentEmail = "";

         const btn = createButton(
             "MDPI",
             "#1677ff",
             () => {
                 if (!currentEmail) return;

                 GM_setClipboard(currentEmail);
                 openMdpiForEmail(currentEmail);
             }
         );

         btn.id = EMAIL_BUTTON_ID;

         Object.assign(btn.style, {
             position: "absolute",
             zIndex: "999999",
             padding: "6px 12px",
             fontSize: "12px",
             display: "none",
             boxShadow:
                 "0 3px 10px rgba(0,0,0,0.25)"
         });

         document.body.appendChild(btn);

         document.addEventListener("mouseup", () => {
             setTimeout(() => {
                 const selection = window.getSelection();

                 if (
                     !selection ||
                     selection.rangeCount === 0
                 ) {
                     btn.style.display = "none";
                     return;
                 }

                 const text = selection.toString().trim();

                 const match = text.match(
                     /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
                 );

                 if (!match) {
                     currentEmail = "";
                     btn.style.display = "none";
                     return;
                 }

                 currentEmail = match[0];

                 const rect = selection
                     .getRangeAt(0)
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
     }

     // =====================================================
     // 21. INITIALIZATION
     // =====================================================

     function initialize() {
         console.log(
             `[Scopus Helper] v${VERSION} initialized`
         );

         if (isScopusPage()) {
             runScopusPage();

         } else if (isMdpiPage()) {
             runMdpiPage();

         } else if (isRetractionPage()) {
             runRetractionPage();
         }

         // Available on non-MDPI webpages.
         createSelectedEmailMdpiButton();
     }

     if (document.readyState === "loading") {
         document.addEventListener(
             "DOMContentLoaded",
             initialize,
             { once: true }
         );
     } else {
         initialize();
     }

 })();
