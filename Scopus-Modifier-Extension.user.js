 // ==UserScript==
 // @name         Scopus Modifier Extension
 // @namespace    http://tampermonkey.net/
 // @version      6.0
 // @description  Scopus quick screening + MDPI / PubPeer / Retraction tools
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

     const VERSION = "6.0";

     const DEFAULT_MDPI_INTERNAL_URL =
         "https://susy.mdpi.com/special_issue/process/1877901";

     const MDPI_URL_STORAGE_KEY =
         "scopusHelperMdpiInternalUrl";

     const PUBPEER_SEARCH_URL =
         "https://pubpeer.org/search?q=";

     const RETRACTION_BASE_URL =
         "https://retractiondatabase.org/RetractionSearch.aspx";

     const SCOPUS_BAR_ID = "scopus-ge-button-bar";

     const SELECTED_EMAIL_BUTTON_ID =
         "selected-email-mdpi-btn";

     const MDPI_SETTINGS_ID =
         "mdpi-url-settings-overlay";

     const hostname = window.location.hostname;

     // =====================================================
     // 2. PAGE IDENTIFICATION
     // =====================================================

     function isScopusPage() {
         return (
             /(^|\.)scopus\.com$/i.test(hostname) &&
             window.location.pathname.includes("/authid/detail.uri")
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

     function isPubPeerPage() {
         return hostname === "pubpeer.org";
     }

     function isRetractionPage() {
         return (
             hostname === "retractiondatabase.org" &&
             window.location.pathname.toLowerCase()
                 .includes("retractionsearch.aspx")
         );
     }

     // =====================================================
     // 3. GENERAL HELPERS
     // =====================================================

     function normalizeSpace(value) {
         return String(value || "")
             .replace(/\s+/g, " ")
             .trim();
     }

     function formatName(scopusName) {

         const raw = normalizeSpace(scopusName);

         if (!raw) return "";

         // Example:
         // Kumar, Rakshak -> Rakshak Kumar

         if (raw.includes(",")) {

             const parts = raw.split(",");

             const lastName =
                 normalizeSpace(parts.shift());

             const firstName =
                 normalizeSpace(parts.join(" "));

             return normalizeSpace(
                 firstName + " " + lastName
             );
         }

         return raw;
     }

     function isVisible(element) {

         if (!element || !element.isConnected) {
             return false;
         }

         const style = window.getComputedStyle(element);

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

                 return;
             }

             if (Date.now() - start > timeout) {

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

         const nativeSetter =
             Object.getOwnPropertyDescriptor(
                 prototype,
                 "value"
             )?.set;

         if (nativeSetter) {

             nativeSetter.call(input, value);

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
                 bubbles: true,
                 key: "Enter"
             })
         );
     }

     function createButton(
         text,
         color,
         onclick
     ) {

         const button =
             document.createElement("button");

         button.textContent = text;

         Object.assign(button.style, {

             padding: "8px 12px",
             border: "none",
             borderRadius: "8px",
             background: color,
             color: "#ffffff",
             cursor: "pointer",
             fontSize: "13px",
             fontWeight: "600",
             whiteSpace: "nowrap"

         });

         button.addEventListener(
             "click",
             onclick
         );

         return button;
     }

     // =====================================================
     // 4. SCOPUS AUTHOR DETECTION
     // =====================================================

     let currentAuthorId = "";

     let currentAuthorData = {
         id: "",
         name: "",
         email: "",
         institution: ""
     };

     let authorRequestNumber = 0;

     function getScopusAuthorId() {

         const params =
             new URLSearchParams(
                 window.location.search
             );

         return (
             params.get("authorId") ||
             params.get("authorID") ||
             ""
         );
     }

     // =====================================================
     // 5. READ NAME DIRECTLY FROM SCOPUS PAGE
     // =====================================================

     function getScopusDisplayedName() {

         const selectors = [

             '[data-testid="author-name"]',

             '[data-testid*="author-name"]',

             'h1',

             '[class*="AuthorName"]',

             '[class*="authorName"]'

         ];

         for (const selector of selectors) {

             const elements =
                 document.querySelectorAll(selector);

             for (const element of elements) {

                 if (!isVisible(element)) {
                     continue;
                 }

                 const raw =
                     normalizeSpace(
                         element.textContent
                     );

                 if (!raw) continue;

                 // Prefer Scopus name:
                 // Last name, First name

                 if (
                     raw.includes(",") &&
                     raw.length < 150 &&
                     !raw.includes("@")
                 ) {

                     return formatName(raw);

                 }
             }
         }

         return "";
     }

     // =====================================================
     // 6. SCOPUS API
     // =====================================================

     async function fetchScopusAuthor(authorId) {

         const apiUrl =
             "https://www.scopus.com/api/authors/" +
             encodeURIComponent(authorId);

         const response = await fetch(
             apiUrl,
             {
                 credentials: "include",
                 cache: "no-store"
             }
         );

         if (!response.ok) {

             throw new Error(
                 "Scopus API HTTP " +
                 response.status
             );

         }

         const data = await response.json();

         return {

             id: authorId,

             name: formatName(
                 data.preferredName?.full || ""
             ),

             email:
                 data.emailAddress || "",

             institution:
                 data.latestAffiliatedInstitution?.name || ""

         };
     }

     // =====================================================
     // 7. UPDATE AUTHOR DATA
     // =====================================================

     async function updateCurrentAuthor(
         authorId,
         force = false
     ) {

         if (!authorId) return;

         if (
             !force &&
             authorId === currentAuthorId
         ) {

             return;
         }

         currentAuthorId = authorId;

         const requestNumber =
             ++authorRequestNumber;

         // Immediately invalidate old author information

         currentAuthorData = {

             id: authorId,
             name: getScopusDisplayedName(),
             email: "",
             institution: ""

         };

         // Remove old button bar

         removeScopusButtonBar();

         // Create a new bar for the current author

         createScopusButtonBar();

         try {

             const result =
                 await fetchScopusAuthor(authorId);

             // Prevent old asynchronous responses
             // from overwriting the new author's data

             if (
                 requestNumber !== authorRequestNumber ||
                 authorId !== getScopusAuthorId()
             ) {

                 return;

             }

             currentAuthorData = {

                 ...result,

                 name:
                     getScopusDisplayedName() ||
                     result.name

             };

             createScopusButtonBar(true);

         } catch (error) {

             console.warn(
                 "[Scopus Helper] API error:",
                 error
             );

             if (
                 requestNumber !== authorRequestNumber
             ) {

                 return;

             }

             currentAuthorData.name =
                 getScopusDisplayedName() ||
                 currentAuthorData.name;

             createScopusButtonBar(true);

         }
     }

     // =====================================================
     // 8. LIVE AUTHOR NAME
     // =====================================================

     function getCurrentAuthorName() {

         const actualAuthorId =
             getScopusAuthorId();

         if (
             !actualAuthorId ||
             actualAuthorId !== currentAuthorData.id
         ) {

             return "";

         }

         const displayedName =
             getScopusDisplayedName();

         if (displayedName) {

             currentAuthorData.name =
                 displayedName;

             return displayedName;

         }

         return currentAuthorData.name || "";
     }

     // =====================================================
     // 9. SCOPUS BUTTON BAR
     // =====================================================

     function removeScopusButtonBar() {

         document.getElementById(
             SCOPUS_BAR_ID
         )?.remove();
     }

     function createScopusButtonBar(
         replace = false
     ) {

         if (replace) {

             removeScopusButtonBar();

         }

         if (
             document.getElementById(
                 SCOPUS_BAR_ID
             )
         ) {

             return;

         }

         if (!document.body) return;

         const bar =
             document.createElement("div");

         bar.id = SCOPUS_BAR_ID;

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
             background: "#ffffff",
             border: "1px solid #ccc",
             borderRadius: "10px",
             boxShadow:
                 "0 3px 12px rgba(0,0,0,0.18)",
             padding: "10px",
             maxWidth: "95vw",
             fontFamily: "Arial, sans-serif"

         });

         // Current author email

         const emailText =
             document.createElement("span");

         const email =
             currentAuthorData.email;

         emailText.textContent =
             email || "No email";

         emailText.title =
             email
                 ? "Click to copy email"
                 : "No email found";

         Object.assign(emailText.style, {

             padding: "8px 12px",
             borderRadius: "8px",
             background:
                 email ? "#f6ffed" : "#fff1f0",
             color:
                 email ? "#237804" : "#a8071a",
             fontSize: "13px",
             fontWeight: "600",
             cursor:
                 email ? "pointer" : "default",
             border:
                 "1px solid " +
                 (email ? "#b7eb8f" : "#ffa39e")

         });

         emailText.onclick = () => {

             const currentEmail =
                 currentAuthorData.email;

             if (currentEmail) {

                 GM_setClipboard(currentEmail);

             }
         };

         bar.appendChild(emailText);

         // MDPI button

         bar.appendChild(
             createButton(
                 "MDPI",
                 "#1677ff",
                 () => {

                     const email =
                         currentAuthorData.email;

                     if (!email) {

                         alert(
                             "No email found for this author."
                         );

                         return;
                     }

                     GM_setClipboard(email);

                     openMdpiForEmail(email);
                 }
             )
         );

         // PubPeer button

         bar.appendChild(
             createButton(
                 "PubPeer",
                 "#722ed1",
                 () => {

                     const name =
                         getCurrentAuthorName();

                     if (!name) {

                         alert(
                             "Current author name not found."
                         );

                         return;
                     }

                     window.open(
                         PUBPEER_SEARCH_URL +
                         encodeURIComponent(name),
                         "_blank"
                     );
                 }
             )
         );

         // Retraction button

         bar.appendChild(
             createButton(
                 "Retraction",
                 "#fa541c",
                 () => {

                     const name =
                         getCurrentAuthorName();

                     if (!name) {

                         alert(
                             "Current author name not found."
                         );

                         return;
                     }

                     const targetUrl =
                         buildRetractionSearchUrl(name);

                     console.log(
                         "[Scopus Helper] Retraction author:",
                         name
                     );

                     window.open(
                         targetUrl,
                         "_blank"
                     );
                 }
             )
         );

         // Google button

         bar.appendChild(
             createButton(
                 "Google",
                 "#595959",
                 () => {

                     const name =
                         getCurrentAuthorName();

                     const institution =
                         currentAuthorData.institution;

                     if (!name) return;

                     const query =
                         name + " " + institution;

                     window.open(
                         "https://www.google.com/search?q=" +
                         encodeURIComponent(query),
                         "_blank"
                     );
                 }
             )
         );

         // Scholar button

         bar.appendChild(
             createButton(
                 "Scholar",
                 "#13c2c2",
                 () => {

                     const name =
                         getCurrentAuthorName();

                     const institution =
                         currentAuthorData.institution;

                     if (!name) return;

                     const query =
                         name + " " + institution;

                     window.open(
                         "https://scholar.google.com/scholar?q=" +
                         encodeURIComponent(query),
                         "_blank"
                     );
                 }
             )
         );

         // MDPI settings button

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
     // 10. SCOPUS AUTHOR CHANGE MONITOR
     // =====================================================

     function startScopusMonitor() {

         if (
             hostname === "www2.scopus.com"
         ) {

             const newUrl =
                 window.location.href.replace(
                     "www2.scopus.com",
                     "www.scopus.com"
                 );

             window.location.replace(newUrl);

             return;
         }

         function checkAuthor() {

             const authorId =
                 getScopusAuthorId();

             if (!authorId) return;

             if (
                 authorId !== currentAuthorId
             ) {

                 updateCurrentAuthor(authorId);

                 return;
             }

             const displayedName =
                 getScopusDisplayedName();

             if (
                 displayedName &&
                 displayedName !== currentAuthorData.name
             ) {

                 currentAuthorData.name =
                     displayedName;

             }
         }

         // Initial detection

         checkAuthor();

         // Scopus sometimes changes its content
         // without a complete page reload.

         setInterval(
             checkAuthor,
             700
         );

         window.addEventListener(
             "popstate",
             checkAuthor
         );

         window.addEventListener(
             "pageshow",
             checkAuthor
         );

         // Also check after tab becomes active

         document.addEventListener(
             "visibilitychange",
             () => {

                 if (!document.hidden) {

                     checkAuthor();

                 }
             }
         );
     }

     // =====================================================
     // 11. RETRACTION URL
     // =====================================================

     function buildRetractionSearchUrl(name) {

         const authorName =
             normalizeSpace(name);

         const encodedName =
             encodeURIComponent(authorName)
                 .replace(/%20/g, "+");

         // Use an explicit parameter so the
         // destination userscript always knows
         // which Scopus author was requested.

         const url = new URL(
             RETRACTION_BASE_URL
         );

         url.searchParams.set(
             "scopusAuthor",
             authorName
         );

         // Retraction author search fragment.
         // This is also passed to the website.

         url.hash =
             "?auth%3d" + encodedName;

         return url.toString();
     }

     // =====================================================
     // 12. RETRACTION CURRENT AUTHOR
     // =====================================================

     function getRequestedRetractionName() {

         const params =
             new URLSearchParams(
                 window.location.search
             );

         const name =
             params.get("scopusAuthor");

         if (name) {

             return normalizeSpace(name);

         }

         // Backward compatibility with v5.9

         const oldName =
             params.get("geName");

         if (oldName) {

             return normalizeSpace(oldName);

         }

         return "";
     }

     // =====================================================
     // 13. FIND RETRACTION AUTHOR INPUT
     // =====================================================

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

             const elements =
                 document.querySelectorAll(selector);

             for (const element of elements) {

                 if (
                     isVisible(element) &&
                     !element.disabled &&
                     !element.readOnly
                 ) {

                     return element;

                 }
             }
         }

         // Fallback: look for a field near an
         // "Author" label.

         const labels =
             document.querySelectorAll(
                 "label, th, td, span"
             );

         for (const label of labels) {

             const text =
                 normalizeSpace(
                     label.textContent
                 );

             if (
                 !/^author(?:\s+name)?\s*:?\s*$/i.test(text)
             ) {

                 continue;
             }

             if (
                 label.htmlFor
             ) {

                 const linkedInput =
                     document.getElementById(
                         label.htmlFor
                     );

                 if (
                     linkedInput &&
                     isVisible(linkedInput)
                 ) {

                     return linkedInput;

                 }
             }

             const parent =
                 label.closest(
                     "tr, div, form"
                 );

             if (!parent) continue;

             const input =
                 parent.querySelector(
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
     // 14. RETRACTION SEARCH PAGE
     // =====================================================

     function runRetractionPage() {

         const requestedName =
             getRequestedRetractionName();

         if (!requestedName) return;

         console.log(
             "[Scopus Helper] Requested Retraction author:",
             requestedName
         );

         let lastInput = null;

         let lastAppliedValue = "";

         function applyAuthorName() {

             const input =
                 findRetractionAuthorInput();

             if (!input) {

                 return;
             }

             const currentValue =
                 normalizeSpace(
                     input.value
                 );

             // Avoid repeatedly dispatching events
             // when the value is already correct.

             if (
                 input === lastInput &&
                 currentValue === requestedName &&
                 lastAppliedValue === requestedName
             ) {

                 return;
             }

             if (
                 currentValue !== requestedName
             ) {

                 fillInput(
                     input,
                     requestedName
                 );

             }

             lastInput = input;

             lastAppliedValue =
                 requestedName;
         }

         // The website may render search inputs
         // asynchronously, so retry briefly.

         const start = Date.now();

         const timer =
             setInterval(() => {

                 applyAuthorName();

                 if (
                     Date.now() - start > 12000
                 ) {

                     clearInterval(timer);

                 }

             }, 300);

         applyAuthorName();

         // Deliberately do not click an unknown
         // search button. The URL already carries
         // the author search fragment.
     }

     // =====================================================
     // 15. MDPI URL SETTINGS
     // =====================================================

     function getMdpiInternalUrl() {

         return GM_getValue(
             MDPI_URL_STORAGE_KEY,
             DEFAULT_MDPI_INTERNAL_URL
         );
     }

     function normalizeMdpiUrl(rawUrl) {

         const value =
             normalizeSpace(rawUrl);

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
                 "网页地址格式不正确。"
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
                 "请输入有效的 MDPI Special Issue Process 网页地址。"
             );

         }

         parsed.search = "";
         parsed.hash = "";

         return parsed.toString()
             .replace(/\/$/, "");
     }

     function buildMdpiUrl(email) {

         const target = new URL(
             getMdpiInternalUrl()
         );

         target.searchParams.set(
             "geEmail",
             email
         );

         return target.toString();
     }

     function openMdpiForEmail(email) {

         window.open(
             buildMdpiUrl(email),
             "_blank"
         );
     }

     // =====================================================
     // 16. MDPI SETTINGS DIALOG
     // =====================================================

     function showMdpiSettingsDialog() {

         document.getElementById(
             MDPI_SETTINGS_ID
         )?.remove();

         const overlay =
             document.createElement("div");

         overlay.id =
             MDPI_SETTINGS_ID;

         Object.assign(
             overlay.style,
             {
                 position: "fixed",
                 inset: "0",
                 zIndex: "1000000",
                 display: "flex",
                 alignItems: "center",
                 justifyContent: "center",
                 background:
                     "rgba(0,0,0,0.38)"
             }
         );

         const panel =
             document.createElement("div");

         Object.assign(
             panel.style,
             {
                 width:
                     "min(620px, calc(100vw - 40px))",
                 padding: "22px",
                 boxSizing: "border-box",
                 borderRadius: "12px",
                 background: "#ffffff",
                 boxShadow:
                     "0 8px 30px rgba(0,0,0,0.28)",
                 fontFamily:
                     "Arial, sans-serif"
             }
         );

         const title =
             document.createElement("h3");

         title.textContent =
             "MDPI 邮箱验证网页设置";

         title.style.color = "#222";

         title.style.marginTop = "0";

         const description =
             document.createElement("p");

         description.textContent =
             "保存后将持续使用该地址，除非再次修改或恢复默认。";

         description.style.color =
             "#595959";

         description.style.fontSize =
             "13px";

         const input =
             document.createElement("input");

         input.type = "url";

         input.value =
             getMdpiInternalUrl();

         input.placeholder =
             "https://susy.mdpi.com/special_issue/process/...";

         Object.assign(
             input.style,
             {
                 width: "100%",
                 padding: "10px",
                 boxSizing: "border-box",
                 border: "1px solid #ccc",
                 borderRadius: "6px",
                 fontSize: "14px"
             }
         );

         const status =
             document.createElement("div");

         status.style.minHeight = "20px";

         status.style.marginTop = "10px";

         status.style.fontSize = "12px";

         const actions =
             document.createElement("div");

         Object.assign(
             actions.style,
             {
                 display: "flex",
                 justifyContent: "flex-end",
                 flexWrap: "wrap",
                 gap: "8px",
                 marginTop: "12px"
             }
         );

         function addAction(
             text,
             color,
             handler
         ) {

             const button =
                 createButton(
                     text,
                     color,
                     handler
                 );

             actions.appendChild(button);
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
                         "已填入当前网页地址。";

                 }
             );
         }

         addAction(
             "恢复默认",
             "#8c8c8c",
             () => {

                 input.value =
                     DEFAULT_MDPI_INTERNAL_URL;

                 status.textContent =
                     "已恢复默认地址，点击保存生效。";

             }
         );

         addAction(
             "取消",
             "#8c8c8c",
             () => overlay.remove()
         );

         addAction(
             "保存",
             "#1677ff",
             () => {

                 try {

                     const normalized =
                         normalizeMdpiUrl(
                             input.value
                         );

                     GM_setValue(
                         MDPI_URL_STORAGE_KEY,
                         normalized
                     );

                     status.textContent =
                         "保存成功。";

                     status.style.color =
                         "#389e0d";

                     setTimeout(
                         () => overlay.remove(),
                         700
                     );

                 } catch (error) {

                     status.textContent =
                         error.message;

                     status.style.color =
                         "#cf1322";

                 }
             }
         );

         panel.appendChild(title);

         panel.appendChild(
             description
         );

         panel.appendChild(input);

         panel.appendChild(status);

         panel.appendChild(actions);

         overlay.appendChild(panel);

         document.body.appendChild(
             overlay
         );

         overlay.addEventListener(
             "mousedown",
             event => {

                 if (
                     event.target === overlay
                 ) {

                     overlay.remove();

                 }
             }
         );
     }

     // =====================================================
     // 17. MDPI EMAIL INPUT
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

         const labels =
             document.querySelectorAll(
                 "label, td, th, span"
             );

         for (const label of labels) {

             const text =
                 normalizeSpace(
                     label.textContent
                 );

             if (
                 !/email/i.test(text) ||
                 text.length > 80
             ) {

                 continue;
             }

             const parent =
                 label.closest(
                     "tr, div, form"
                 );

             if (!parent) continue;

             const input =
                 parent.querySelector(
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
     // 18. MDPI NEXT BUTTON
     // =====================================================

     function findCorrectNextButton(input) {

         const buttons = Array.from(
             document.querySelectorAll(
                 "button, input[type='button'], input[type='submit'], a"
             )
         );

         const nextButtons =
             buttons.filter(element => {

                 const text =
                     normalizeSpace(
                         element.innerText ||
                         element.value
                     ).toLowerCase();

                 return (
                     text === "next" &&
                     isVisible(element)
                 );
             });

         if (!nextButtons.length) {
             return null;
         }

         const inputRect =
             input.getBoundingClientRect();

         nextButtons.sort(
             (a, b) => {

                 const rectA =
                     a.getBoundingClientRect();

                 const rectB =
                     b.getBoundingClientRect();

                 const distanceA =
                     Math.abs(
                         rectA.top -
                         inputRect.bottom
                     ) +
                     Math.abs(
                         rectA.left -
                         inputRect.left
                     );

                 const distanceB =
                     Math.abs(
                         rectB.top -
                         inputRect.bottom
                     ) +
                     Math.abs(
                         rectB.left -
                         inputRect.left
                     );

                 return (
                     distanceA - distanceB
                 );
             }
         );

         return nextButtons[0];
     }

     // =====================================================
     // 19. CLOSE MDPI POPUP
     // =====================================================

     function closeMdpiPopup() {

         const candidates = Array.from(
             document.querySelectorAll(
                 "button, a, span, div"
             )
         );

         const closeButton =
             candidates.find(element => {

                 const text =
                     normalizeSpace(
                         element.innerText ||
                         element.textContent
                     );

                 const aria =
                     (
                         element.getAttribute(
                             "aria-label"
                         ) || ""
                     ).toLowerCase();

                 const className =
                     String(
                         element.className || ""
                     ).toLowerCase();

                 return (
                     (text === "×" ||
                      text === "x" ||
                      aria.includes("close") ||
                      className.includes("close")) &&
                     isVisible(element)
                 );
             });

         if (closeButton) {

             closeButton.click();

         }
     }

     // =====================================================
     // 20. MDPI AUTO VERIFICATION
     // =====================================================

     function runMdpiPage() {

         const params =
             new URLSearchParams(
                 window.location.search
             );

         const email =
             params.get("geEmail");

         createMdpiSettingsLauncher();

         if (!email) return;

         closeMdpiPopup();

         waitForElement(
             findEmailInput,
             input => {

                 fillInput(
                     input,
                     email
                 );

                 waitForElement(
                     () =>
                         findCorrectNextButton(
                             input
                         ),
                     nextButton => {

                         nextButton.click();

                         setTimeout(
                             closeMdpiPopup,
                             300
                         );

                         setTimeout(
                             closeMdpiPopup,
                             800
                         );

                         setTimeout(
                             closeMdpiPopup,
                             1500
                         );

                     },
                     5000
                 );
             },
             10000
         );
     }

     // =====================================================
     // 21. MDPI SETTINGS LAUNCHER
     // =====================================================

     function createMdpiSettingsLauncher() {

         const buttonId =
             "mdpi-url-settings-launcher";

         if (
             document.getElementById(
                 buttonId
             )
         ) {

             return;

         }

         const button =
             createButton(
                 "⚙ 设置为邮箱验证页",
                 "#1677ff",
                 showMdpiSettingsDialog
             );

         button.id = buttonId;

         Object.assign(
             button.style,
             {
                 position: "fixed",
                 right: "20px",
                 bottom: "20px",
                 zIndex: "999999",
                 boxShadow:
                     "0 3px 12px rgba(0,0,0,0.25)"
             }
         );

         document.body.appendChild(
             button
         );
     }

     // =====================================================
     // 22. SELECTED EMAIL FLOATING BUTTON
     // =====================================================

     function createSelectedEmailMdpiButton() {

         if (isMdpiPage()) return;

         if (
             document.getElementById(
                 SELECTED_EMAIL_BUTTON_ID
             )
         ) {

             return;

         }

         const button =
             createButton(
                 "MDPI",
                 "#1677ff",
                 () => {

                     if (!currentSelectedEmail) {
                         return;
                     }

                     GM_setClipboard(
                         currentSelectedEmail
                     );

                     openMdpiForEmail(
                         currentSelectedEmail
                     );
                 }
             );

         button.id =
             SELECTED_EMAIL_BUTTON_ID;

         Object.assign(
             button.style,
             {
                 position: "absolute",
                 zIndex: "999999",
                 padding: "6px 12px",
                 fontSize: "12px",
                 display: "none",
                 boxShadow:
                     "0 3px 10px rgba(0,0,0,0.25)"
             }
         );

         document.body.appendChild(
             button
         );

         let currentSelectedEmail = "";

         document.addEventListener(
             "mouseup",
             () => {

                 setTimeout(
                     () => {

                         const selection =
                             window.getSelection();

                         if (
                             !selection ||
                             selection.rangeCount === 0
                         ) {

                             button.style.display =
                                 "none";

                             return;
                         }

                         const text =
                             normalizeSpace(
                                 selection.toString()
                             );

                         const match =
                             text.match(
                                 /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
                             );

                         if (!match) {

                             currentSelectedEmail =
                                 "";

                             button.style.display =
                                 "none";

                             return;
                         }

                         currentSelectedEmail =
                             match[0];

                         const rect =
                             selection.getRangeAt(0)
                                 .getBoundingClientRect();

                         button.style.left =
                             (
                                 rect.right +
                                 window.scrollX +
                                 8
                             ) + "px";

                         button.style.top =
                             (
                                 rect.top +
                                 window.scrollY -
                                 4
                             ) + "px";

                         button.style.display =
                             "block";

                     },
                     80
                 );
             }
         );

         document.addEventListener(
             "mousedown",
             event => {

                 if (
                     event.target === button
                 ) {

                     return;
                 }

                 button.style.display =
                     "none";
             }
         );
     }

     // =====================================================
     // 23. PUBPEER
     // =====================================================

     function runPubPeerPage() {

         // PubPeer URL already contains q=.
         // No extra search click required.

         return;
     }

     // =====================================================
     // 24. INITIALIZATION
     // =====================================================

     function initialize() {

         console.log(
             "[Scopus Helper] v" +
             VERSION +
             " initialized."
         );

         if (isScopusPage()) {

             startScopusMonitor();

         } else if (isMdpiPage()) {

             runMdpiPage();

         } else if (isPubPeerPage()) {

             runPubPeerPage();

         } else if (isRetractionPage()) {

             runRetractionPage();

         }

         // General selected-email feature

         createSelectedEmailMdpiButton();
     }

     if (
         document.readyState === "loading"
     ) {

         document.addEventListener(
             "DOMContentLoaded",
             initialize,
             {
                 once: true
             }
         );

     } else {

         initialize();

     }

 })();
