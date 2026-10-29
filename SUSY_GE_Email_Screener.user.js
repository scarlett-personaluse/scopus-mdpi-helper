 // ==UserScript==
 // @name         SUSY GE Email Screener
 // @namespace    MDPI-SUSY-Verification-Screener
 // @version      2.3
 // @description  根据 Proceed / Edit+Back 筛选可邀请 GE 的邮箱
 // @match        https://susy.mdpi.com/special_issue/process/*
 // @grant        GM_setClipboard
 // @run-at       document-idle
 // @author       Jiali Tang
 // @updateURL    https://raw.githubusercontent.com/scarlett-personaluse/scopus-mdpi-helper/main/SUSY_GE_Email_Screener.user.js
 // @downloadURL  https://raw.githubusercontent.com/scarlett-personaluse/scopus-mdpi-helper/main/SUSY_GE_Email_Screener.user.js
 // ==/UserScript==

 (function () {
   'use strict';

   // 保留原版存储键，便于沿用已导入的邮箱和筛选结果。
   const K = {
     emails: 'susy_fast_screen_emails_v2',
     index: 'susy_fast_screen_index_v2',
     hits: 'susy_fast_screen_hits_v2',
     results: 'susy_fast_screen_results_v2',
     logs: 'susy_fast_screen_logs_v2'
   };
   const S = {
     running: 'susy_fast_screen_running_v3_tab',
     url: 'susy_fast_screen_process_url_v3_tab'
   };
   const WAIT_RESULT = 5000;  // 等待明确的页面结果，最长 5 秒
   const WAIT_ELEMENT = 10000;
   const POLL = 80;
   const NEXT_DELAY = 120;
   let busy = false;

   const cleanURL = () => location.origin + location.pathname;
   const load = (key, fallback) => {
     try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
     catch { return fallback; }
   };
   const save = (key, data) => localStorage.setItem(key, JSON.stringify(data));
   const running = () => sessionStorage.getItem(S.running) === '1';
   const onPage = () => sessionStorage.getItem(S.url) === cleanURL();
   const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
   const norm = s => String(s || '').trim().toLowerCase();
   const outsidePanel = el => !el?.closest?.('#ge-screen-panel, #ge-screen-mini');

   function visible(el) {
     if (!el || !el.isConnected) return false;
     const css = getComputedStyle(el);
     const rect = el.getBoundingClientRect();
     return css.display !== 'none' && css.visibility !== 'hidden' &&
       Number(css.opacity) > 0 && rect.width > 0 && rect.height > 0;
   }

   function log(message) {
     const lines = load(K.logs, []);
     lines.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
     save(K.logs, lines.slice(0, 500));
     updatePanel();
   }

   function extractEmails(text) {
     const matched = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
     const seen = new Set();
     return matched.filter(email => {
       const key = email.toLowerCase();
       if (seen.has(key)) return false;
       seen.add(key);
       return true;
     });
   }

   function importText(text) {
     const emails = extractEmails(text);
     if (!emails.length) return alert('没有识别到有效邮箱。');
     save(K.emails, emails);
     localStorage.setItem(K.index, '0');
     log(`导入 ${emails.length} 个去重邮箱。`);
     updatePanel();
     alert(`已导入 ${emails.length} 个邮箱。`);
   }

   function createPanel() {
     if (document.querySelector('#ge-screen-panel')) return;
     const css = document.createElement('style');
     css.textContent = `
       #ge-screen-mini{position:fixed;right:18px;top:50%;transform:translateY(-50%);
         z-index:10000001;width:58px;height:58px;border:0;border-radius:50%;
         background:#72B89A;color:white;font:bold 12px Arial;cursor:pointer;
         box-shadow:0 4px 15px #0004}
       #ge-screen-panel{position:fixed;right:88px;top:50%;transform:translateY(-50%);
         z-index:10000000;display:none;box-sizing:border-box;width:430px;max-width:94vw;
         max-height:88vh;overflow:auto;background:white;color:#222;border:1px solid #B8DDCD;
         border-radius:12px;box-shadow:0 5px 20px #0004;font:13px Arial}
       #ge-screen-head{display:flex;align-items:center;justify-content:space-between;
         padding:11px;background:#72B89A;color:white;font-weight:bold;cursor:move}
       #ge-screen-body{padding:12px}
       #ge-screen-panel button.ge-btn{box-sizing:border-box;display:block;width:100%;
         margin-top:6px;padding:8px 10px;border:0;border-radius:8px;background:#f2f2f2;
         color:#333;font-weight:600;text-align:left;cursor:pointer}
       #ge-screen-panel button.ge-main{background:#72B89A;color:white}
       #ge-screen-panel button.ge-danger{background:#fff1f0;color:#a8071a}
       #ge-screen-panel textarea{box-sizing:border-box;width:100%;padding:8px;
         resize:vertical;border:1px solid #ccc;border-radius:8px;font:12px Arial}
       #ge-screen-panel .ge-info{margin:8px 0;padding:8px;background:#EAF6F0;
         border:1px solid #B8DDCD;border-radius:8px;white-space:pre-wrap;line-height:1.5}
     `;
     document.head.appendChild(css);

     const mini = document.createElement('button');
     mini.id = 'ge-screen-mini';
     mini.textContent = '邮箱筛选';
     document.body.appendChild(mini);

     const panel = document.createElement('div');
     panel.id = 'ge-screen-panel';
     panel.innerHTML = `
       <div id="ge-screen-head"><span>SUSY GE 邮箱筛选器 v2.2</span>
         <button id="ge-min" type="button">收起</button></div>
       <div id="ge-screen-body">
         <div class="ge-info">仅在当前标签页、当前特刊页面筛选。<br>
           看到 Proceed（即使灰色）就保留；只有 Edit + Back 就跳过。<br>
           不操作拖拉验证，也不点击 Proceed。</div>
         <input id="ge-file" type="file" accept=".csv,.txt" style="width:100%">
         <textarea id="ge-input" rows="5" placeholder="粘贴邮箱，或导入 CSV/TXT 文件"></textarea>
         <button class="ge-btn" id="ge-import">导入邮箱</button>
         <button class="ge-btn ge-main" id="ge-start">从头开始快速筛选</button>
         <button class="ge-btn" id="ge-resume">继续筛选</button>
         <button class="ge-btn ge-danger" id="ge-stop">停止当前标签页筛选</button>
         <button class="ge-btn" id="ge-copy">复制可邀请的邮箱</button>
         <button class="ge-btn" id="ge-review">复制待复查邮箱</button>
         <button class="ge-btn" id="ge-csv">复制完整筛选结果 CSV</button>
         <button class="ge-btn ge-danger" id="ge-clear">清空本地数据</button>
         <div id="ge-status" class="ge-info"></div>
         <b>可邀请 GE 的邮箱</b>
         <textarea id="ge-output" rows="8" readonly></textarea>
         <details><summary>运行日志</summary>
           <textarea id="ge-logs" rows="6" readonly></textarea></details>
       </div>`;
     document.body.appendChild(panel);

     const $ = id => document.getElementById(id);
     mini.onclick = () => { mini.style.display = 'none'; panel.style.display = 'block'; updatePanel(); };
     $('ge-min').onclick = () => { panel.style.display = 'none'; mini.style.display = 'block'; };
     $('ge-file').onchange = async event => {
       const file = event.target.files?.[0];
       if (!file) return;
       try {
         const content = await file.text();
         $('ge-input').value = content;
         importText(content);
       } catch { alert('文件读取失败。'); }
     };
     $('ge-import').onclick = () => importText($('ge-input').value);
     $('ge-start').onclick = startNew;
     $('ge-resume').onclick = resume;
     $('ge-stop').onclick = () => stop('用户手动停止筛选');
     $('ge-copy').onclick = () => copyEmails(load(K.hits, []).map(x => x.email), '可邀请');
     $('ge-review').onclick = () => copyEmails(load(K.results, [])
       .filter(x => ['REVIEW', 'ERROR'].includes(x.status)).map(x => x.email), '待复查');
     $('ge-csv').onclick = copyCSV;
     $('ge-clear').onclick = clearAll;
     document.addEventListener('keydown', e => {
       if (e.key === 'Escape' && running()) stop('按 Esc 停止');
     });
     enableDrag(panel, $('ge-screen-head'), $('ge-min'));
     updatePanel();
   }

   function enableDrag(panel, head, minimize) {
     let drag = false, dx = 0, dy = 0;
     head.addEventListener('mousedown', e => {
       if (e.target === minimize) return;
       const r = panel.getBoundingClientRect();
       dx = e.clientX - r.left; dy = e.clientY - r.top;
       panel.style.left = r.left + 'px'; panel.style.top = r.top + 'px';
       panel.style.right = 'auto'; panel.style.transform = 'none';
       drag = true; e.preventDefault();
     });
     document.addEventListener('mousemove', e => {
       if (!drag) return;
       panel.style.left = Math.max(0, Math.min(innerWidth - panel.offsetWidth, e.clientX - dx)) + 'px';
       panel.style.top = Math.max(0, Math.min(innerHeight - panel.offsetHeight, e.clientY - dy)) + 'px';
     });
     document.addEventListener('mouseup', () => { drag = false; });
   }

   function updatePanel() {
     const status = document.getElementById('ge-status');
     if (!status) return;
     const emails = load(K.emails, []), hits = load(K.hits, []);
     const results = load(K.results, []);
     const index = Number(localStorage.getItem(K.index) || 0);
     const skipped = results.filter(x => x.status === 'CANNOT_INVITE').length;
     const review = results.filter(x => x.status === 'REVIEW').length;
     const errors = results.filter(x => x.status === 'ERROR').length;
     status.textContent = `邮箱总数：${emails.length}\n已处理：${Math.min(index, emails.length)}/${emails.length}` +
       `\n可邀请：${hits.length}\n不可邀请：${skipped}\n待复查：${review}\n错误：${errors}` +
       `\n最长等待：${WAIT_RESULT} ms\n当前标签页：${running() ? '运行中' : '已停止'}` +
       `\n页面匹配：${onPage() ? '是' : '否'}`;
     document.getElementById('ge-output').value = hits.map(x => x.email).join('\n');
     document.getElementById('ge-logs').value = load(K.logs, []).join('\n');
     const mini = document.getElementById('ge-screen-mini');
     if (mini) mini.textContent = running() ? `${Math.min(index, emails.length)}/${emails.length}` : '邮箱筛选';
   }

   function startNew() {
     if (!load(K.emails, []).length) return alert('请先导入邮箱。');
     sessionStorage.setItem(S.url, cleanURL());
     localStorage.setItem(K.index, '0');
     save(K.hits, []); save(K.results, []); save(K.logs, []);
     sessionStorage.setItem(S.running, '1');
     busy = false;
     log('从头开始筛选');
     processOne();
   }

   function resume() {
     if (!load(K.emails, []).length) return alert('请先导入邮箱。');
     sessionStorage.setItem(S.url, cleanURL());
     sessionStorage.setItem(S.running, '1');
     busy = false;
     log('继续筛选');
     processOne();
   }

   function stop(reason) {
     sessionStorage.setItem(S.running, '0');
     log(reason);
   }

   function findEmailInput() {
     const inputs = [...document.querySelectorAll('input')].filter(el =>
       outsidePanel(el) && visible(el) && !el.disabled);
     let best = null, highest = 0;
     for (const el of inputs) {
       const type = norm(el.type), name = norm(el.name), id = norm(el.id);
       const placeholder = norm(el.placeholder);
       const score = (type === 'email' ? 100 : 0) + (name.includes('email') ? 80 : 0) +
         (id.includes('email') ? 80 : 0) + (/e-?mail/.test(placeholder) ? 60 : 0);
       if (score > highest) { best = el; highest = score; }
     }
     return best;
   }

   function findNext() {
     return [...document.querySelectorAll('button, input[type="button"], input[type="submit"], a')]
       .find(el => outsidePanel(el) && visible(el) &&
         norm(el.innerText || el.value || el.textContent) === 'next');
   }

   function fillInput(el, value) {
     el.focus();
     const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
     if (setter) setter.call(el, value); else el.value = value;
     el.dispatchEvent(new Event('input', { bubbles: true }));
     el.dispatchEvent(new Event('change', { bubbles: true }));
   }

   function waitElement(getter, timeout = WAIT_ELEMENT) {
     return new Promise((resolve, reject) => {
       const start = Date.now();
       const timer = setInterval(() => {
         const el = getter();
         if (el) { clearInterval(timer); resolve(el); }
         else if (Date.now() - start >= timeout) {
           clearInterval(timer); reject(new Error('等待邮箱输入框或 Next 按钮超时'));
         }
       }, POLL);
     });
   }

   // 依据 Firefox Inspector 中确认的真实 HTML 判断；disabled 的 Proceed 也算。
   function detectStatus() {
     const proceed = document.querySelector('input#process-special-issue-guest-editor[type="submit"]');
     if (proceed && outsidePanel(proceed) && visible(proceed) && norm(proceed.value) === 'proceed')
       return 'CAN_INVITE';

     // a.editGuestInfo 是不可邀请页面的 Edit；button.editGuestInfo 是 Update Information。
     const edit = [...document.querySelectorAll('a.editGuestInfo')].some(el =>
       outsidePanel(el) && visible(el) && norm(el.textContent) === 'edit');
     const back = document.querySelector('a#specialBackBtn');
     if (edit && back && visible(back)) return 'CANNOT_INVITE';
     return 'REVIEW';
   }

   function waitStatus(timeout = WAIT_RESULT) {
     return new Promise(resolve => {
       let finished = false;
       const start = Date.now();
       const interval = setInterval(() => {
         if (finished) return;
         const status = detectStatus();
         // Proceed 立即接受；Edit + Back 等满观察时间，以防 Proceed 晚出现。
         if (status === 'CAN_INVITE' || Date.now() - start >= timeout) {
           finished = true; clearInterval(interval); resolve(status);
         }
       }, POLL);
     });
   }

   function record(email, status, reason) {
     const results = load(K.results, []);
     results.push({
       email, status,
       eligible: status === 'CAN_INVITE' ? true : status === 'CANNOT_INVITE' ? false : null,
       reason, checkedAt: new Date().toISOString(), pageUrl: sessionStorage.getItem(S.url) || cleanURL()
     });
     save(K.results, results);
     if (status === 'CAN_INVITE') {
       const hits = load(K.hits, []);
       if (!hits.some(x => norm(x.email) === norm(email))) {
         hits.push({ email, checkedAt: new Date().toISOString() });
         save(K.hits, hits);
       }
     }
     log(`${status === 'CAN_INVITE' ? '✓ 保留' : status === 'CANNOT_INVITE' ? '跳过' : '待复查'}：${email}（${reason}）`);
   }

   async function processOne() {
     if (!running() || busy) return;
     if (!onPage()) return stop('当前页面不是锁定的 SI 页面，已停止');
     busy = true;
     const emails = load(K.emails, []);
     const index = Number(localStorage.getItem(K.index) || 0);
     if (index >= emails.length) { busy = false; finish(); return; }
     const email = emails[index];
     log(`正在检查 ${index + 1}/${emails.length}：${email}`);

     try {
       const input = await waitElement(findEmailInput);
       if (!running()) { busy = false; return; }
       fillInput(input, ''); await sleep(30);
       fillInput(input, email); await sleep(30);
       const next = await waitElement(findNext);
       if (!running()) { busy = false; return; }
       next.click();  // 只点击 Next；绝不点击 Proceed，也不操作验证滑块。
       const status = await waitStatus();
       if (!running()) { busy = false; return; }
       const reasons = {
         CAN_INVITE: '发现 Proceed 按钮（可处于 disabled 状态）',
         CANNOT_INVITE: '发现 Edit + Back，未发现 Proceed',
         REVIEW: '等待 5 秒后仍未确认页面状态'
       };
       record(email, status, reasons[status]);
     } catch (err) {
       if (!running()) { busy = false; return; }
       record(email, 'ERROR', err?.message || '未知错误');
     }
     busy = false;
     localStorage.setItem(K.index, String(index + 1));
     updatePanel();
     if (!running()) return;
     setTimeout(() => { if (running() && onPage()) location.replace(sessionStorage.getItem(S.url)); }, NEXT_DELAY);
   }

   function finish() {
     sessionStorage.setItem(S.running, '0');
     const hits = load(K.hits, []);
     const reviewCount = load(K.results, []).filter(x => ['REVIEW', 'ERROR'].includes(x.status)).length;
     log(`筛选完成：可邀请 ${hits.length} 个；待复查/错误 ${reviewCount} 个。`);
     const mini = document.getElementById('ge-screen-mini');
     const panel = document.getElementById('ge-screen-panel');
     mini.style.display = 'none'; panel.style.display = 'block';
     if (hits.length) GM_setClipboard(hits.map(x => x.email).join('\n'));
     alert(`筛选完成！可邀请：${hits.length} 个；待复查/错误：${reviewCount} 个。\n可邀请邮箱已复制到剪贴板（如有）。`);
   }

   function copyEmails(emails, label) {
     const unique = [...new Map(emails.map(x => [norm(x), x])).values()];
     if (!unique.length) return alert(`暂无${label}邮箱。`);
     GM_setClipboard(unique.join('\n'));
     alert(`已复制 ${unique.length} 个${label}邮箱。`);
   }

   function copyCSV() {
     const data = load(K.results, []);
     if (!data.length) return alert('暂无筛选结果。');
     const heads = ['email', 'status', 'eligible', 'reason', 'checkedAt', 'pageUrl'];
     const esc = x => {
       const s = String(x ?? '');
       return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
     };
     const csv = [heads.join(','), ...data.map(row => heads.map(k => esc(row[k])).join(','))].join('\n');
     GM_setClipboard(csv);
     alert('完整筛选结果 CSV 已复制到剪贴板。');
   }

   function clearAll() {
     if (!confirm('确定清空邮箱、进度和筛选结果吗？')) return;
     Object.values(K).forEach(key => localStorage.removeItem(key));
     Object.values(S).forEach(key => sessionStorage.removeItem(key));
     sessionStorage.setItem(S.url, cleanURL());
     busy = false;
     updatePanel();
   }

   function init() {
     createPanel();
     if (!sessionStorage.getItem(S.url)) sessionStorage.setItem(S.url, cleanURL());
     updatePanel();
     if (running() && onPage()) setTimeout(processOne, 300);
   }

   if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
   else init();
 })();
