// userscript.meta.js
// userscript.meta.js
export const meta = `
// ==UserScript==
// @name         AI雨课堂助手（JS版）
// @namespace    https://github.com/ZaytsevZY/yuketang-helper-auto
// @version      1.21.6
// @description  课堂习题提示，AI解答习题
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=yuketang.cn
// @match        https://www.yuketang.cn/
// @match        https://pro.yuketang.cn/
// @match        https://changjiang.yuketang.cn/
// @match        https://www.yuketang.cn/m/v2*
// @match        https://pro.yuketang.cn/m/v2*
// @match        https://changjiang.yuketang.cn/m/v2*
// @match        https://www.yuketang.cn/web
// @match        https://pro.yuketang.cn/web
// @match        https://changjiang.yuketang.cn/web
// @match        https://www.yuketang.cn/web/*
// @match        https://pro.yuketang.cn/web/*
// @match        https://changjiang.yuketang.cn/web/*
// @match        https://*.yuketang.cn/lesson/fullscreen/v3/*
// @match        https://*.yuketang.cn/v2/web/*
// @match        https://www.yuketang.cn/lesson/fullscreen/v3/*
// @match        https://www.yuketang.cn/v2/web/*
// @match        https://pro.yuketang.cn/lesson/fullscreen/v3/*
// @match        https://pro.yuketang.cn/v2/web/*
// @match        https://pro.yuketang.cn/v2/web/index
// @match        https://pro.yuketang.cn/v2/web/student-lesson-report/*
// @match        https://changjiang.yuketang.cn/lesson/fullscreen/v3/*
// @match        https://changjiang.yuketang.cn/v2/web/*
// @match        https://changjiang.yuketang.cn/v2/web/index
// @match        https://changjiang.yuketang.cn/v2/web/student-lesson-report/*
// @grant        GM_addStyle
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_getTab
// @grant        GM_getTabs
// @grant        GM_saveTab
// @grant        unsafeWindow
// @connect      api.moonshot.cn
// @connect      api.openai.com
// @connect      api.deepseek.com
// @connect      openrouter.ai
// @connect      generativelanguage.googleapis.com
// @connect      localhost
// @connect      127.0.0.1
// @connect      *
// @run-at       document-start
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js#sha256=6H5VB5QyLldKH9oMFUmjxw2uWpPZETQXpCkBaDjquMs=
// @require      https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js#sha256=mMzxeqEMILsTAXYmGPzJtqs6Tn8mtgcdZNC0EVTfOHU=
// @require      https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.min.js#sha256=5FOQtjyN31BBQmvTsCf1iypgSa37N8n+8Kyn81mgUxg=
// ==/UserScript==
`;
