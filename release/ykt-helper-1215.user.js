// ==UserScript==
// @name         AIé›¨è¯¾å ‚åŠ©æ‰‹ï¼ˆJSç‰ˆï¼‰
// @namespace    https://github.com/ZaytsevZY/yuketang-helper-auto
// @version      1.21.5
// @description  è¯¾å ‚ä¹ é¢˜æç¤ºï¼ŒAIè§£ç­”ä¹ é¢˜
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
// @grant        GM_openInTab
// @grant        GM_getTab
// @grant        GM_getTabs
// @grant        GM_saveTab
// @grant        unsafeWindow
// @run-at       document-start
// @require      https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js
// @require      https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.min.js
// ==/UserScript==
(function() {
  "use strict";
  // src/core/env.js
    const gm = {
    notify(opt) {
      if (typeof window.GM_notification === "function") {
        window.GM_notification(opt);
        return;
      }
      // On mobile userscript hosts that do not expose GM_notification, use an
      // already-granted browser notification permission.  Never request it
      // automatically: the user controls that permission in the browser.
            try {
        if (window.Notification?.permission !== "granted") return;
        const notice = new window.Notification(opt?.title || "é›¨è¯¾å ‚æé†’", {
          body: opt?.text || "",
          icon: opt?.image || void 0
        });
        if (opt?.timeout > 0) setTimeout(() => notice.close?.(), opt.timeout);
      } catch {}
    },
    addStyle(css) {
      if (typeof window.GM_addStyle === "function") window.GM_addStyle(css); else {
        const s = document.createElement("style");
        s.textContent = css;
        document.head.appendChild(s);
      }
    },
    xhr(opt) {
      if (typeof window.GM_xmlhttpRequest === "function") return window.GM_xmlhttpRequest(opt);
      throw new Error("GM_xmlhttpRequest is not available");
    },
    uw: window.unsafeWindow || window
  };
  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if ([ ...document.scripts ].some(s => s.src === src)) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load: ${src}`));
      document.head.appendChild(s);
    });
  }
  async function ensureHtml2Canvas() {
    const w = gm.uw || window;
    if (typeof w.html2canvas === "function") return w.html2canvas;
    await loadScriptOnce("https://html2canvas.hertzen.com/dist/html2canvas.min.js");
    const h2c = w.html2canvas?.default || w.html2canvas;
    if (typeof h2c === "function") return h2c;
    throw new Error("html2canvas æœªæ­£ç¡®åŠ è½½");
  }
  async function ensureJsPDF() {
    if (window.jspdf?.jsPDF) return window.jspdf;
    await loadScriptOnce("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
    if (!window.jspdf?.jsPDF) throw new Error("jsPDF æœªåŠ è½½æˆåŠŸ");
    return window.jspdf;
  }
  function randInt(l, r) {
    return l + Math.floor(Math.random() * (r - l + 1));
  }
  // src/core/reminder-preferences.js
    const EVENT_PREFERENCE_KEYS = {
    "problem-start": "notifyProblemStarts",
    "danmu-round-start": "notifyDanmuRoundStarts",
    "danmu-follow-trigger": "notifyDanmuFollowTriggers",
    "assessment-publish": "notifyAssessmentPublishes",
    "courseware-publish": "notifyCoursewarePublishes",
    "other-publish": "notifyOtherPublishes",
    "lesson-finished": "notifyLessonFinished",
    "auto-answer-scheduled": "notifyAutoAnswerScheduled",
    "auto-answer-started": "notifyAutoAnswerStarted",
    "auto-answer-succeeded": "notifyAutoAnswerSucceeded",
    "auto-answer-failed": "notifyAutoAnswerFailed"
  };
  const REMINDER_DEFAULTS = {
    // å…¼å®¹æ—§ç‰ˆå·¥å…·æ é“ƒé“›ï¼šå…³é—­åé™éŸ³æ‰€æœ‰è¯¾å ‚æé†’ã€‚
    notifyProblems: true,
    // äº‹ä»¶å¼€å…³
    notifyProblemStarts: true,
    notifyDanmuRoundStarts: true,
    notifyDanmuFollowTriggers: true,
    notifyAssessmentPublishes: true,
    notifyCoursewarePublishes: true,
    notifyOtherPublishes: true,
    notifyLessonFinished: true,
    notifyAutoAnswerScheduled: true,
    notifyAutoAnswerStarted: true,
    notifyAutoAnswerSucceeded: true,
    notifyAutoAnswerFailed: true,
    // æé†’æ–¹å¼å¼€å…³
    notifyNative: true,
    notifyPopup: true,
    notifySound: true
  };
  const REMINDER_EVENT_OPTIONS = [ {
    kind: "problem-start",
    key: "notifyProblemStarts",
    label: "æ–°é¢˜ / ç­”é¢˜å¼€å§‹",
    detail: "è€å¸ˆå¼€å¯ä¸€é“å¯ä½œç­”çš„ä¹ é¢˜æ—¶æé†’ã€‚"
  }, {
    kind: "danmu-round-start",
    key: "notifyDanmuRoundStarts",
    label: "æ–°ä¸€è½®å¼¹å¹•å¼€å§‹",
    detail: "ä¸ä¸Šä¸€æ¡å¼¹å¹•é—´éš”è¾¾åˆ° 60 ç§’åï¼Œæ”¶åˆ°æ–°ä¸€è½®ç¬¬ä¸€æ¡å¼¹å¹•æ—¶æé†’ã€‚"
  }, {
    kind: "danmu-follow-trigger",
    key: "notifyDanmuFollowTriggers",
    label: "7 æ¡å¼¹å¹•è¾¾åˆ°è·Ÿå‘æ¡ä»¶",
    detail: "è¿ç»­ 7 æ¡å¼¹å¹•åœ¨ 30 ç§’å†…è¾¾åˆ°æ¡ä»¶æ—¶æé†’ï¼›å‘é€æ•°é‡æœ€å¤šçš„æ–‡æœ¬èƒœå‡ºï¼Œå¹¶åˆ—æ—¶å–æœ€æ–°ä¸€æ¡ã€‚"
  }, {
    kind: "assessment-publish",
    key: "notifyAssessmentPublishes",
    label: "è€ƒè¯• / æµ‹è¯•é¢˜ç»„å‘å¸ƒ",
    detail: "è€å¸ˆå‘å¸ƒæµ‹è¯•ã€è€ƒè¯•æˆ–é¢˜ç»„æ—¶æé†’ã€‚"
  }, {
    kind: "courseware-publish",
    key: "notifyCoursewarePublishes",
    label: "æ–°è¯¾ä»¶å‘å¸ƒ",
    detail: "åªåœ¨è€å¸ˆå‘å¸ƒæ–°è¯¾ä»¶æ—¶æé†’ï¼›ç¿»é˜…æ—§è¯¾ä»¶å’Œç¿»é¡µä¸ä¼šæé†’ã€‚"
  }, {
    kind: "other-publish",
    key: "notifyOtherPublishes",
    label: "å…¶ä»–è¯¾å ‚å‘å¸ƒ",
    detail: "æœåŠ¡å™¨å‘é€æ— æ³•ç»†åˆ†çš„å‘å¸ƒäº‹ä»¶æ—¶æé†’ã€‚"
  }, {
    kind: "lesson-finished",
    key: "notifyLessonFinished",
    label: "è¯¾ç¨‹ç»“æŸ",
    detail: "è€å¸ˆç»“æŸå½“å‰è¯¾ç¨‹æ—¶æé†’ã€‚"
  }, {
    kind: "auto-answer-scheduled",
    key: "notifyAutoAnswerScheduled",
    label: "è‡ªåŠ¨ä½œç­”å·²æ’é˜Ÿ",
    detail: "è„šæœ¬å·²ç»ä¸ºæ–°é¢˜å®‰æ’å»¶è¿Ÿä½œç­”æ—¶æé†’ã€‚"
  }, {
    kind: "auto-answer-started",
    key: "notifyAutoAnswerStarted",
    label: "è‡ªåŠ¨ä½œç­”å¼€å§‹",
    detail: "è„šæœ¬å¼€å§‹è°ƒç”¨æœ¬åœ°æˆ– AI ä½œç­”æµç¨‹æ—¶æé†’ã€‚"
  }, {
    kind: "auto-answer-succeeded",
    key: "notifyAutoAnswerSucceeded",
    label: "è‡ªåŠ¨ä½œç­”æˆåŠŸ",
    detail: "ç­”æ¡ˆæäº¤æˆåŠŸæ—¶æé†’ã€‚"
  }, {
    kind: "auto-answer-failed",
    key: "notifyAutoAnswerFailed",
    label: "è‡ªåŠ¨ä½œç­”å¤±è´¥",
    detail: "æˆªå›¾ã€AI åˆ†ææˆ–æäº¤å¤±è´¥æ—¶æé†’ã€‚"
  } ];
  const REMINDER_CHANNEL_OPTIONS = [ {
    key: "notifyNative",
    label: "ç³»ç»Ÿé€šçŸ¥",
    detail: "è°ƒç”¨æµè§ˆå™¨ / ç¯¡æ”¹çŒ´çš„åŸç”Ÿé€šçŸ¥ã€‚"
  }, {
    key: "notifyPopup",
    label: "é¡µé¢å¼¹çª—",
    detail: "åœ¨å½“å‰é¡µé¢å³ä¸‹è§’æ˜¾ç¤ºæé†’å¡ç‰‡ã€‚"
  }, {
    key: "notifySound",
    label: "æç¤ºå£°éŸ³",
    detail: "æ’­æ”¾å†…ç½®æˆ–è‡ªå®šä¹‰çš„æç¤ºéŸ³ã€‚"
  } ];
  const REMINDER_SETTING_KEYS = [ "notifyProblems", ...REMINDER_EVENT_OPTIONS.map(item => item.key), ...REMINDER_CHANNEL_OPTIONS.map(item => item.key) ];
  function isReminderEnabled(kind, config = {}) {
    const key = EVENT_PREFERENCE_KEYS[kind];
    if (!key || config.notifyProblems === false) return false;
    return config[key] !== false;
  }
  function getReminderChannels(config = {}) {
    return {
      native: config.notifyNative !== false,
      popup: config.notifyPopup !== false,
      sound: config.notifySound !== false
    };
  }
  /** Keep an explicit 0-volume choice instead of falling back to the default. */  function getReminderVolume(config = {}) {
    const rawValue = config.notifyVolume;
    if (rawValue === "" || rawValue === void 0 || rawValue === null) return .6;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return .6;
    return Math.max(0, Math.min(1, value));
  }
  // src/core/types.js
    const PROBLEM_TYPE_MAP = {
    1: "å•é€‰é¢˜",
    2: "å¤šé€‰é¢˜",
    3: "æŠ•ç¥¨é¢˜",
    4: "å¡«ç©ºé¢˜",
    5: "ä¸»è§‚é¢˜"
  };
  const DEFAULT_CONFIG = {
    ...REMINDER_DEFAULTS,
    autoAnswer: false,
    autoAnswerDelay: 3e3,
    autoAnswerRandomDelay: 2e3,
    // åˆ·æ–°åæ¢å¤åªé’ˆå¯¹åˆ·æ–°å‰å·²ç»å‡ºç°å¹¶è®°å½•çš„é¢˜ç›®ï¼Œé»˜è®¤å…³é—­ä»¥é¿å…æ—§é¢˜è¯¯æäº¤ã€‚
    autoRecoverUnanswered: false,
    // è¿‡æœŸæ¢å¤ä¼šè°ƒç”¨ /retryï¼Œé£é™©æ›´é«˜ï¼Œå¿…é¡»ç”±ç”¨æˆ·å•ç‹¬å¼€å¯ã€‚
    autoRecoverExpired: false,
    // æ‰«ææ‰€æœ‰å·²ç¼“å­˜ä½†ä»æœªè§£é”çš„æœªç­”é¢˜ï¼Œé»˜è®¤å…³é—­ã€‚
    autoScanUnanswered: false,
    autoFollowDanmu: false,
    keepScreenAwake: false,
    iftex: true,
    ai: {
      provider: "kimi",
      kimiApiKey: "",
      apiKey: "",
      endpoint: "https://api.moonshot.cn/v1/chat/completions",
      model: "moonshot-v1-8k",
      visionModel: "moonshot-v1-8k-vision-preview",
      ocrApi: "",
      ocrApiKey: "",
      translateApi: "",
      translateApiKey: "",
      translateModel: "",
      maxTokens: 1e3
    },
    profiles: [ {
      id: "default",
      name: "Kimi",
      baseUrl: "https://api.moonshot.cn/v1/chat/completions",
      apiKey: "",
      model: "moonshot-v1-8k",
      visionModel: "moonshot-v1-8k-vision-preview",
      temperature: ""
    } ],
    activeProfileId: "default",
    showAllSlides: false,
    maxPresentations: 5
  };
  // src/core/storage.js
    class StorageManager {
    constructor(prefix) {
      this.prefix = prefix;
    }
    get(key, dv = null) {
      try {
        const v = localStorage.getItem(this.prefix + key);
        return v ? JSON.parse(v) : dv;
      } catch {
        return dv;
      }
    }
    set(key, value) {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    }
    remove(key) {
      localStorage.removeItem(this.prefix + key);
    }
    getMap(key) {
      const arr = this.get(key, []);
      try {
        return new Map(arr);
      } catch {
        return new Map;
      }
    }
    setMap(key, map) {
      this.set(key, [ ...map ]);
    }
    alterMap(key, fn) {
      const m = this.getMap(key);
      fn(m);
      this.setMap(key, m);
    }
  }
  const storage = new StorageManager("ykt-helper:");
  // src/state/repo.js
    const repo = {
    presentations: new Map,
    // id -> presentation
    slides: new Map,
    // slideId -> slide
    problems: new Map,
    // problemId -> problem
    problemStatus: new Map,
    // problemId -> {presentationId, slideId, startTime, endTime, phase, done, autoAnswerTime, answering, attempts, lastError}
    encounteredProblems: [],
    // [{problemId, ...ref}]
    currentPresentationId: null,
    currentSlideId: null,
    currentLessonId: null,
    currentSelectedUrl: null,
    // æŒ‰è¯¾ç¨‹åˆ†ç»„å­˜å‚¨è¯¾ä»¶
    setPresentation(id, data) {
      this.presentations.set(id, {
        id: id,
        ...data
      });
      const key = this.currentLessonId ? `presentations-${this.currentLessonId}` : "presentations";
      storage.alterMap(key, m => {
        m.set(id, data);
        // ä»ç„¶åšå®¹é‡è£å‰ª
                const max = storage.get("config", {})?.maxPresentations ?? 5;
        const excess = m.size - max;
        if (excess > 0) [ ...m.keys() ].slice(0, excess).forEach(k => m.delete(k));
      });
    },
    upsertSlide(slide) {
      this.slides.set(slide.id, slide);
    },
    upsertProblem(prob) {
      this.problems.set(prob.problemId, prob);
    },
    pushEncounteredProblem(prob, slide, presentationId) {
      if (!this.encounteredProblems.some(p => p.problemId === prob.problemId)) this.encounteredProblems.push({
        problemId: prob.problemId,
        problemType: prob.problemType,
        body: prob.body || `é¢˜ç›®ID: ${prob.problemId}`,
        options: prob.options || [],
        blanks: prob.blanks || [],
        answers: prob.answers || [],
        slide: slide,
        presentationId: presentationId
      });
    },
    // === è‡ªåŠ¨è¿›å…¥è¯¾å ‚æ‰€éœ€çš„å¤šâ€œçº¿ç¨‹â€ï¼ˆå¤šè¯¾å ‚ï¼‰çŠ¶æ€ ===
    listeningLessons: new Set,
    // lessonId çš„é›†åˆï¼Œè¡¨ç¤ºå·²ç»å»ºç«‹WSç›‘å¬
    lessonTokens: new Map,
    // lessonId -> lessonTokenï¼ˆ/lesson/checkin è¿”å›ï¼‰
    lessonSockets: new Map,
    // lessonId -> WebSocket å®ä¾‹
    autoJoinRunning: false,
    // è½®è¯¢å¼€å…³
    autoJoinedLessons: new Set,
    // è¢«â€œè‡ªåŠ¨è¿›å…¥â€çš„è¯¾å ‚é›†åˆï¼ˆä»…æ ‡è®°è‡ªåŠ¨è¿›å…¥å»ºç«‹çš„è¿æ¥ï¼‰
    forceAutoAnswerLessons: new Set,
    // è‹¥éœ€è¦ï¼Œå¯ä»¥å¯¹æŸäº›è¯¾å¼ºåˆ¶è§†ä¸ºâ€œè‡ªåŠ¨ç­”é¢˜å¼€å¯â€
    // è½½å…¥æœ¬è¯¾ï¼ˆæŒ‰è¯¾ç¨‹åˆ†ç»„ï¼‰åœ¨æœ¬åœ°å­˜å‚¨è¿‡çš„è¯¾ä»¶
    loadStoredPresentations() {
      if (!this.currentLessonId) return;
      const key = `presentations-${this.currentLessonId}`;
      const stored = storage.getMap(key);
      for (const [id, data] of stored.entries()) {
        this.setPresentation(id, data);
        const presentation = this.presentations.get(id);
        for (const slide of presentation?.slides || []) {
          this.upsertSlide(slide);
          if (slide?.problem) {
            this.upsertProblem(slide.problem);
            this.pushEncounteredProblem(slide.problem, slide, id);
          }
        }
      }
    },
    markLessonConnected(lessonId, ws, token) {
      if (token) this.lessonTokens.set(lessonId, token);
      if (ws) this.lessonSockets.set(lessonId, ws);
      this.listeningLessons.add(lessonId);
    },
    isLessonConnected(lessonId) {
      return this.listeningLessons.has(lessonId) && this.lessonSockets.get(lessonId);
    },
    markLessonAutoJoined(lessonId, enabled = true) {
      if (!lessonId) return;
      if (enabled) this.autoJoinedLessons.add(lessonId); else this.autoJoinedLessons.delete(lessonId);
    }
  };
  // src/ui/toast.js
    function toast(message, duration = 2e3) {
    const el = document.createElement("div");
    el.textContent = message;
    el.style.cssText = `\n    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);\n    background: rgba(0,0,0,.7); color: #fff; padding: 10px 20px;\n    border-radius: 4px; z-index: 10000000; max-width: 80%;\n  `;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity .5s";
      setTimeout(() => el.remove(), 500);
    }, duration);
  }
  var tpl$5 = '<div id="ykt-settings-panel" class="ykt-panel">\n  <div class="panel-header">\n    <h3>AIé›¨è¯¾å ‚åŠ©æ‰‹è®¾ç½®</h3>\n    <div class="setting-actions">\n        <button id="ykt-btn-settings-save">ä¿å­˜è®¾ç½®</button>\n        <button id="ykt-btn-settings-reset" color="red">é‡ç½®ä¸ºé»˜è®¤</button>\n    </div>\n    <span class="close-btn" id="ykt-settings-close"><i class="fas fa-times"></i></span>\n  </div>\n\n  <div class="panel-body">\n    <div class="settings-content">\n      <div class="setting-group">\n      <h4>AIé…ç½®</h4>\n\n        \x3c!-- å½“å‰ profile é€‰æ‹© --\x3e\n        <div class="setting-item">\n          <label for="ykt-ai-profile-select">å½“å‰é…ç½®ï¼š</label>\n          <select id="ykt-ai-profile-select"></select>\n          <button id="ykt-ai-profile-add">æ–°å¢é…ç½®</button>\n          <button id="ykt-ai-profile-del" color="red">åˆ é™¤å½“å‰</button>\n        </div>\n\n        \x3c!-- å…·ä½“é…ç½®å­—æ®µï¼šé’ˆå¯¹å½“å‰ profile --\x3e\n        <div class="setting-item">\n          <label for="ykt-ai-profile-name">åç§°:</label>\n          <input type="text" id="ykt-ai-profile-name" placeholder="ä¾‹å¦‚ï¼šKimi 8k / OpenAI GPT-4o">\n        </div>\n\n        <div class="setting-item">\n          <label for="ykt-ai-base-url">URL:</label>\n          <input type="text" id="ykt-ai-base-url" placeholder="https://api.moonshot.cn/...">\n          <small>å…¼å®¹ OpenAI åè®®çš„æœåŠ¡ç«¯ï¼Œä¾‹å¦‚ api.openai.com / api.moonshot.cn / è‡ªå»ºä»£ç†ã€‚</small>\n        </div>\n\n        <div class="setting-item">\n          <label for="kimi-api-key">API Key:</label>\n          <input type="password" id="kimi-api-key" placeholder="è¾“å…¥å½“å‰é…ç½®çš„ API Key">\n        </div>\n\n        <div class="setting-item">\n          <label for="ykt-ai-model">æ–‡æœ¬æ¨¡å‹ ID:</label>\n          <input type="text" id="ykt-ai-model" placeholder="ä¾‹å¦‚ï¼šmoonshot-v1-8k / gpt-4o-mini">\n        </div>\n\n        <div class="setting-item">\n          <label for="ykt-ai-vision-model">å›¾åƒæ¨¡å‹ ID:</label>\n          <input type="text" id="ykt-ai-vision-model" placeholder="é»˜è®¤ä¸å¡«åˆ™ä¸æ–‡æœ¬æ¨¡å‹ç›¸åŒ">\n        </div>\n        <div class="setting-item">\n          <label for="ykt-ai-temperature">Temperature:</label>\n          <input type="number" id="ykt-ai-temperature" min="0" max="2" step="0.01" placeholder="ç•™ç©ºåˆ™ä¸ä¼ ">\n          <small>å½“å‰ Profile ä¸“ç”¨ã€‚ç•™ç©ºæ—¶ä¸å‘é€è¯¥å‚æ•°ï¼Œç”±æ¨¡å‹å†³å®šé»˜è®¤å€¼ï¼›éƒ¨åˆ† Kimi æ¨¡å‹è¦æ±‚ç•™ç©ºã€‚</small>\n        </div>\n        <div class="setting-item">\n          <label for="ykt-ai-ocr-api">OCRæ¨¡å‹API:</label>\n          <input type="text" id="ykt-ai-ocr-api" placeholder="ç•™ç©ºåˆ™å¤ç”¨å½“å‰ AI Profile çš„ URL">\n          <small>ä»…ç”¨äºè¯¾ä»¶â€œæ–‡å­—è¯†åˆ«â€åŠŸèƒ½ï¼›ç•™ç©ºæ—¶èµ°å½“å‰ AI Profileã€‚</small>\n        </div>\n        <div class="setting-item">\n          <label for="ykt-ai-ocr-api-key">OCR API Key:</label>\n          <input type="password" id="ykt-ai-ocr-api-key" placeholder="ç•™ç©ºåˆ™å¤ç”¨å½“å‰ AI Profile çš„ API Key">\n          <small>ä»…ç”¨äºè¯¾ä»¶ OCRï¼›ä¸å¡«æ—¶è‡ªåŠ¨å›é€€åˆ°å½“å‰ AI Profile çš„ API Keyã€‚</small>\n        </div>\n        <div class="setting-item">\n          <label for="ykt-ai-translate-api">ç¿»è¯‘æ¨¡å‹API:</label>\n          <input type="text" id="ykt-ai-translate-api" placeholder="ç•™ç©ºåˆ™å¤ç”¨å½“å‰ AI Profile çš„ URL">\n          <small>ä»…ç”¨äº OCR ç»“æœç¿»è¯‘ï¼›ç•™ç©ºæ—¶å¤ç”¨å½“å‰ AI Profile çš„ URLã€‚</small>\n        </div>\n        <div class="setting-item">\n          <label for="ykt-ai-translate-api-key">ç¿»è¯‘ API Key:</label>\n          <input type="password" id="ykt-ai-translate-api-key" placeholder="ç•™ç©ºåˆ™å¤ç”¨å½“å‰ AI Profile çš„ API Key">\n          <small>ä»…ç”¨äº OCR ç»“æœç¿»è¯‘ï¼›ç•™ç©ºæ—¶å¤ç”¨å½“å‰ AI Profile çš„ API Keyã€‚</small>\n        </div>\n        <div class="setting-item">\n          <label for="ykt-ai-translate-model">ç¿»è¯‘æ¨¡å‹ ID:</label>\n          <input type="text" id="ykt-ai-translate-model" placeholder="ç•™ç©ºåˆ™å¤ç”¨å½“å‰ AI Profile çš„æ–‡æœ¬æ¨¡å‹">\n          <small>å»ºè®®å¡«å†™çº¯æ–‡æœ¬æ¨¡å‹ï¼›ç•™ç©ºæ—¶å¤ç”¨å½“å‰ AI Profile çš„æ–‡æœ¬æ¨¡å‹ã€‚</small>\n        </div>\n      </div>\n\n      <div class="setting-group">\n        <h4>UIè®¾ç½®</h4>\n          <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-ui-tex">\n            <span class="checkmark"></span>\n            æ¸²æŸ“LaTeXæ ¼å¼çš„å…¬å¼\n          </label>\n        </div>\n      </div>\n\n      <div class="setting-group">\n        <h4>è‡ªåŠ¨ä½œç­”è®¾ç½®</h4>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-auto-join">\n            <span class="checkmark"></span>\n            è‡ªåŠ¨è¿›å…¥è¯¾å ‚\n          </label>\n          <small>é»˜è®¤è‡ªåŠ¨è¿›å…¥â€œæ­£åœ¨ä¸Šè¯¾â€çš„è¯¾å ‚ã€‚</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-auto-join-auto-answer">\n            <span class="checkmark"></span>\n            å¯¹äºè‡ªåŠ¨è¿›å…¥çš„è¯¾å ‚ï¼Œé»˜è®¤ä½¿ç”¨è‡ªåŠ¨ç­”é¢˜\n          </label>\n          <small>ä»…å¯¹â€œè‡ªåŠ¨è¿›å…¥â€çš„è¯¾å ‚ç”Ÿæ•ˆï¼Œä¸ä¼šå½±å“æ‰‹åŠ¨è¿›å…¥è¯¾å ‚çš„è¡Œä¸ºã€‚</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-auto-answer">\n            <span class="checkmark"></span>\n            å¯ç”¨è‡ªåŠ¨ä½œç­”\n          </label>\n          <small>é¢˜ç›®é¦–æ¬¡å‡ºç°æ—¶æŒ‰å»¶è¿Ÿè®¾ç½®è‡ªåŠ¨åˆ†æå¹¶æäº¤ã€‚</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-auto-recover-unanswered">\n            <span class="checkmark"></span>\n            åˆ·æ–°åæ¢å¤å·²æ’é˜Ÿ/è¢«ä¸­æ–­çš„ AI ä½œç­”\n          </label>\n          <small>åªæ¢å¤åˆ·æ–°å‰å·²ç»è®°å½•ä¸ºâ€œå¾…ä½œç­”â€æˆ–â€œä½œç­”ä¸­â€çš„é¢˜ç›®ï¼›ä¸ä¼šé»˜è®¤æ‰«æå†å²è¯¾ä»¶ã€‚</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-auto-recover-expired">\n            <span class="checkmark"></span>\n            åˆ·æ–°åè‡ªåŠ¨å¼ºåˆ¶è¡¥äº¤å·²è¿‡æœŸé¢˜ç›®\n          </label>\n          <small>éœ€è¦åŒæ—¶å¼€å¯ä¸Šé¡¹ï¼›å·²è¿‡æˆªæ­¢æ—¶é—´æ—¶ä¼šè°ƒç”¨è¡¥äº¤æ¥å£ï¼Œé£é™©è¾ƒé«˜ï¼Œé»˜è®¤å…³é—­ã€‚</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-auto-scan-unanswered">\n            <span class="checkmark"></span>\n            è‡ªåŠ¨æ‰«æå½“å‰è¯¾ç¨‹ä¸­æœªä½œç­”é¢˜ç›®\n          </label>\n          <small>ä»…å½“å‰è¯¾ç¨‹å·²ç¼“å­˜é¢˜ç›®ï¼›ä¼šä¸»åŠ¨è®© AI å°è¯•æœªä½œç­”é¢˜ï¼Œå¯èƒ½åŒ…å«æ—§é¢˜ï¼Œé»˜è®¤å…³é—­ã€‚</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-ai-auto-analyze">\n            <span class="checkmark"></span>\n            æ‰“å¼€ AI é¡µé¢æ—¶è‡ªåŠ¨åˆ†æ\n          </label>\n          <small>å¼€å¯åï¼Œè¿›å…¥â€œAI è§£ç­”â€é¢æ¿å³è‡ªåŠ¨å‘ AI è¯¢é—®å½“å‰é¢˜ç›®</small>\n        </div>\n        <div class="setting-item">\n          <label for="ykt-input-answer-delay">ä½œç­”å»¶è¿Ÿæ—¶é—´ (ç§’):</label>\n          <input type="number" id="ykt-input-answer-delay" min="1" max="60">\n          <small>é¢˜ç›®å‡ºç°åç­‰å¾…å¤šé•¿æ—¶é—´å¼€å§‹ä½œç­”</small>\n        </div>\n        <div class="setting-item">\n          <label for="ykt-input-random-delay">éšæœºå»¶è¿ŸèŒƒå›´ (ç§’):</label>\n          <input type="number" id="ykt-input-random-delay" min="0" max="30">\n          <small>åœ¨åŸºç¡€å»¶è¿ŸåŸºç¡€ä¸Šéšæœºå¢åŠ çš„æ—¶é—´èŒƒå›´</small>\n        </div><div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-ai-pick-main-first">\n            <span class="checkmark"></span>\n            ä¸»ç•Œé¢ä¼˜å…ˆï¼ˆæœªå‹¾é€‰åˆ™è¯¾ä»¶æµè§ˆä¼˜å…ˆï¼‰\n          </label>\n          <small>ä»…åœ¨æ™®é€šæ‰“å¼€ AI é¢æ¿ï¼ˆykt:open-aiï¼‰æ—¶ç”Ÿæ•ˆï¼›ä»â€œæé—®å½“å‰PPTâ€è·³è½¬ä¿æŒæœ€é«˜ä¼˜å…ˆã€‚</small>\n        </div>\n      </div>\n\n      <div class="setting-group">\n        <h4>è¯¾å ‚æé†’</h4>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-all" />\n            <span class="checkmark"></span>\n            æ€»æé†’å¼€å…³\n          </label>\n          <small>å…³é—­åï¼Œä¸‹é¢æ¯ä¸€ç§è¯¾å ‚äº‹ä»¶éƒ½ä¼šé™éŸ³ï¼›å·¥å…·æ é“ƒé“›ä¸æ­¤å¼€å…³åŒæ­¥ã€‚</small>\n        </div>\n        <h5>æé†’äº‹ä»¶</h5>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-problem-start" />\n            <span class="checkmark"></span>\n            æ–°é¢˜ / ç­”é¢˜å¼€å§‹\n          </label>\n          <small>è€å¸ˆå¼€å¯ä¸€é“å¯ä½œç­”ä¹ é¢˜æ—¶æé†’ã€‚</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-danmu-round-start" />\n            <span class="checkmark"></span>\n            æ–°ä¸€è½®å¼¹å¹•å¼€å§‹\n          </label>\n          <small>ä¸ä¸Šä¸€æ¡å¼¹å¹•é—´éš”è¾¾åˆ° 60 ç§’åï¼Œæ”¶åˆ°æ–°ä¸€è½®ç¬¬ä¸€æ¡å¼¹å¹•æ—¶æé†’ã€‚</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-danmu-follow-trigger" />\n            <span class="checkmark"></span>\n            7 æ¡å¼¹å¹•è¾¾åˆ°è·Ÿå‘æ¡ä»¶\n          </label>\n          <small>è¿ç»­ 7 æ¡å¼¹å¹•åœ¨ 30 ç§’å†…è¾¾åˆ°æ¡ä»¶æ—¶æé†’ï¼›å‡ºç°æ¬¡æ•°æœ€å¤šçš„æ–‡æœ¬èƒœå‡ºï¼Œå¹¶åˆ—æ—¶å–æœ€æ–°ä¸€æ¡ã€‚</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-assessment-publish" />\n            <span class="checkmark"></span>\n            è€ƒè¯•/æµ‹è¯•é¢˜ç»„å‘å¸ƒæé†’\n          </label>\n          <small>è€å¸ˆå‘å¸ƒæµ‹è¯•ã€è€ƒè¯•æˆ–é¢˜ç»„æ—¶æé†’ã€‚</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-courseware-publish" />\n            <span class="checkmark"></span>\n            è¯¾ä»¶å‘å¸ƒæé†’\n          </label>\n          <small>åªåœ¨å‘å¸ƒæ–°è¯¾ä»¶æ—¶æé†’ï¼›ç¿»é˜…æ—§è¯¾ä»¶å’Œç¿»é¡µä¸ä¼šæé†’ã€‚</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-other-publish" />\n            <span class="checkmark"></span>\n            å…¶ä»–æ— æ³•åˆ†ç±»çš„å‘å¸ƒæé†’\n          </label>\n          <small>ç”¨äºä¸åŒå­¦æ ¡æœåŠ¡å™¨çš„æœªçŸ¥å‘å¸ƒäº‹ä»¶ï¼›è‹¥æé†’è¿‡å¤šå¯å•ç‹¬å…³é—­ã€‚</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-lesson-finished" />\n            <span class="checkmark"></span>\n            è¯¾ç¨‹ç»“æŸæé†’\n          </label>\n          <small>è€å¸ˆç»“æŸå½“å‰è¯¾ç¨‹æ—¶æé†’ã€‚</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" m«ëŒ+Š×®º+º$zzb¥æ–CÒ'–·BÖ–çWBÖæ÷F–g’ÖWFòÖç7vW"×66†VGVÆVB"óåÆâÇ7â6Æ73Ò&6†V6¶Ö&²#ãÂ÷7ãåÆâˆz®XªKÙÎzÙN[{.hé.™‰õÆâÂöÆ&VÃåÆâÇ6ÖÆÃîˆI®iÊÎK‹®ikš)Zèhé.[»n‹ùşKÙÎzÙNi{nhù˜i.8#Â÷6ÖÆÃåÆâÂöF—cåÆâÆF—b6Æ73Ò'6WGF–ærÖ—FVÒ#åÆâÆÆ&VÂ6Æ73Ò&6†V6¶&÷‚ÖÆ&VÂ#åÆâÆ–çWBG—SÒ&6†V6¶&÷‚"–CÒ'–·BÖ–çWBÖæ÷F–g’ÖWFòÖç7vW"×7F'FVB"óåÆâÇ7â6Æ73Ò&6†V6¶Ö&²#ãÂ÷7ãåÆâˆz®XªKÙÎzÙN[ÈZxµÆâÂöÆ&VÃåÆâÇ6ÖÆÃîˆI®iÊÎ[ÈZx¾hš~ŠÎiÊÎYËh‰b’KÙÎzÙNkXzˆ¾i{nhù˜i.8#Â÷6ÖÆÃåÆâÂöF—cåÆâÆF—b6Æ73Ò'6WGF–ærÖ—FVÒ#åÆâÆÆ&VÂ6Æ73Ò&6†V6¶&÷‚ÖÆ&VÂ#åÆâÆ–çWBG—SÒ&6†V6¶&÷‚"–CÒ'–·BÖ–çWBÖæ÷F–g’ÖWFòÖç7vW"×7V66VVFVB"óåÆâÇ7â6Æ73Ò&6†V6¶Ö&²#ãÂ÷7ãåÆâˆz®XªKÙÎzÙNh‰X©õÆâÂöÆ&VÃåÆâÇ6ÖÆÃîzÙNjhùKªNh‰X©şi{nhù˜i.8#Â÷6ÖÆÃåÆâÂöF—cåÆâÆF—b6Æ73Ò'6WGF–ærÖ—FVÒ#åÆâÆÆ&VÂ6Æ73Ò&6†V6¶&÷‚ÖÆ&VÂ#åÆâÆ–çWBG—SÒ&6†V6¶&÷‚"–CÒ'–·BÖ–çWBÖæ÷F–g’ÖWFòÖç7vW"Öf–ÆVB"óåÆâÇ7â6Æ73Ò&6†V6¶Ö&²#ãÂ÷7ãåÆâˆz®XªKÙÎzÙNZK‹JUÆâÂöÆ&VÃåÆâÇ6ÖÆÃîhŠ®Y»î8’Xˆniéh‰nzÙNjhùKªNZK‹J^i{nhù˜i.8#Â÷6ÖÆÃåÆâÂöF—cåÆâÆƒSîhù˜i.ik[ÈóÂöƒSåÆâÆF—b6Æ73Ò'6WGF–ærÖ—FVÒ#åÆâÆÆ&VÂ6Æ73Ò&6†V6¶&÷‚ÖÆ&VÂ#åÆâÆ–çWBG—SÒ&6†V6¶&÷‚"–CÒ'–·BÖ–çWBÖæ÷F–g’ÖæF—fR"óåÆâÇ7â6Æ73Ò&6†V6¶Ö&²#ãÂ÷7ãåÆâ{;¾{¹ş˜	®yúUÆâÂöÆ&VÃåÆâÇ6ÖÆÃî‹>yJkXşŠxYšh‰nzúiKxËNy¨NXéşyIş˜	®yú^8#Â÷6ÖÆÃåÆâÂöF—cåÆâÆF—b6Æ73Ò'6WGF–ærÖ—FVÒ#åÆâÆÆ&VÂ6Æ73Ò&6†V6¶&÷‚ÖÆ&VÂ#åÆâÆ–çWBG—SÒ&6†V6¶&÷‚"–CÒ'–·BÖ–çWBÖæ÷F–g’×÷W"óåÆâÇ7â6Æ73Ò&6†V6¶Ö&²#ãÂ÷7ãåÆâš^™Ú.[Ëz©uÆâÂöÆ&VÃåÆâÇ6ÖÆÃîYÊ[Ù>X˜Şš^™Ú.Xû>Kˆ¾Šy.i‹îzK®hù˜i.XÚx˜~8#Â÷6ÖÆÃåÆâÂöF—cåÆâÆF—b6Æ73Ò'6WGF–ærÖ—FVÒ#åÆâÆÆ&VÂ6Æ73Ò&6†V6¶&÷‚ÖÆ&VÂ#åÆâÆ–çWBG—SÒ&6†V6¶&÷‚"–CÒ'–·BÖ–çWBÖæ÷F–g’×6÷VæB"óåÆâÇ7â6Æ73Ò&6†V6¶Ö&²#ãÂ÷7ãåÆâhùzK®Z;™û5ÆâÂöÆ&VÃåÆâÇ6ÖÆÃîi*ŞiKîXh^{Úîh‰nˆz®Zé®K˜hùzK®™û>8#Â÷6ÖÆÃåÆâÂöF—cåÆâÆF—b6Æ73Ò'6WGF–ærÖ—FVÒ#åÆâÆÆ&VÂf÷#Ò'–·BÖ–çWBÖæ÷F–g’ÖGW&F–öâ#î[Ëz©~hÈ{ºŞi{n™{Bzy"“£ÂöÆ&VÃåÆâÆ–çWBG—SÒ&çVÖ&W""–CÒ'–·BÖ–çWBÖæ÷F–g’ÖGW&F–öâ"Ö–ãÒ#""ÖƒÒ#c"óåÆâÇ6ÖÆÃîKšš)X{®xëi{nûÈÎ[Ëz©~YÊ[ş[™^Kˆ®y¨NXÎyYi{n™[óÂ÷6ÖÆÃåÆâÂöF—cåÆâÆF—b6Æ73Ò'6WGF–ærÖ—FVÒ#åÆâÆÆ&VÂf÷#Ò'–·BÖ–çWBÖæ÷F–g’×föÇVÖR#îhù˜i.™û>˜xòƒÓ“£ÂöÆ&VÃåÆâÆ–çWBG—SÒ&çVÖ&W""–CÒ'–·BÖ–çWBÖæ÷F–g’×föÇVÖR"Ö–ãÒ#"ÖƒÒ#"óåÆâÇ6ÖÆÃîyJK¨îhùzK®™û>y¨N™û>˜xşZJ~[şûÉ¾[»®Šêâ3ãƒÂ÷6ÖÆÃåÆâÂöF—cåÆâÆF—b6Æ73Ò'6WGF–ærÖ—FVÒ#åÆâÆ'WGFöâ–CÒ'–·BÖ'Fâ×FW7BÖæ÷F–g’#îkX¾Šù^Kšš)hù˜i#Âö'WGFöãåÆâÂöF—cåÆâÆF—b6Æ73Ò'6WGF–ærÖ—FVÒ#åÆâÆÆ&VÃîˆz®Zé®K˜hùzK®™û>ûÈX[nKˆXÛ>XúşûÈ“ÂöÆ&VÃåÆâÆF—b7G–ÆSÒ&F—7Æ“¦fÆWƒ¶v£‡ƒ¶fÆW‚×w&§w&¶Æ–vâÖ—FV×3¦6VçFW"#åÆâÆ–çWBG—SÒ&f–ÆR"–CÒ'–·BÖ–çWBÖæ÷F–g’ÖVF–òÖf–ÆR"66WCÒ&VF–òò¢"óåÆâÆ–çWBG—SÒ'FW‡B"–CÒ'–·BÖ–çWBÖæ÷F–g’ÖVF–ò×W&Â"Æ6V†öÆFW#Ò.h‰n{)‹KNYÊ{«ş™û>š)U$ÎûÈ†‡GGö‡GG2öFF®ûÈ’"7G–ÆSÒ&Ö–â×v–GFƒ£#c‚"óåÆâÆ'WGFöâ–CÒ'–·BÖ'FâÖÇ’ÖVF–ò×W&Â#î[©NyJ…U$ÃÂö'WGFöãåÆâÆ'WGFöâ–CÒ'–·BÖ'Fâ×&Wf–WrÖVF–ò#îš(NŠxƒÂö'WGFöãåÆâÆ'WGFöâ–CÒ'–·BÖ'FâÖ6ÆV"ÖVF–ò#îkˆ^™šNˆz®Zé®K˜™û>š)Âö'WGFöãåÆâÂöF—cåÆâÇ6ÖÆÂ–CÒ'–·B×F—ÖVF–òÖæÖR"7G–ÆSÒ&F—7Æ“¦&Æö6³¶÷6—G“¢ãƒ¶Ö&v–â×F÷£g‚#ãÂ÷6ÖÆÃåÆâÇ6ÖÆÃîŠûNiˆîûÉ®ih~K»n[niÊÎYËZÙX*K‹¢FFU$ÎûÈ›¹ŠêNKˆ®™™$Ô.ûÈ8%U$Â™ÈiJşhÈ‹zYùşŠëş™zîûÉ¾ˆº^Š*¾kXşŠxYšhºnhŠ®ˆz®Xªi*ŞiKîûÈÎŠû~XXx+X{¾(	Îš(NŠx(	ŞKº^hèiØ>™û>š)i*ŞiKî8#Â÷6ÖÆÃåÆâÂöF—cåÆâÂöF—cåÆåÆâÆF—b6Æ73Ò'6WGF–ærÖw&÷W#åÆâÆƒCîŠûîZ.‹ùŠÃÂöƒCåÆâÆF—b6Æ73Ò'6WGF–ærÖ—FVÒ#åÆâÆÆ&VÂ6Æ73Ò&6†V6¶&÷‚ÖÆ&VÂ#åÆâÆ–çWBG—SÒ&6†V6¶&÷‚"–CÒ'–·BÖ–çWBÖWFòÖföÆÆ÷rÖFæ×R"óåÆâÇ7â6Æ73Ò&6†V6¶Ö&²#ãÂ÷7ãåÆâ˜xŞZHŞ[Ë[™^ˆz®Xª‹yşXùÆâÂöÆ&VÃåÆâÇ6ÖÆÃî[ÈY
şYîûÈÎ[Ù>X˜ŞxúŞ{ª~‹ùî{ºÒriÚ[Ë[™^YÊ‚3zy.Xh^KÉ®ˆz®Xª‹yşXùX{®xëjÊi[iÈZI®y¨Nih~iÊÎûÉ¾[›nX‰~i{n‹yşXùiÈikKˆiÚ8.y»˜+¾[Ë[™^™{N™©N‹ëîX‹czy.ŠxnK‹®ikKˆ‹ÚîûÈÎjøş‹ÚîiÈZI®‹yşXù"iÚûÈÎYÎKˆih~iÊÎjøş‹ÚîXú®‹yşXùKˆjÊ8.™ÈŠhŠûîZ.[Ë[™^‹é>XZ^jnXúşyJ8#Â÷6ÖÆÃåÆâÂöF—cåÆâÆF—b6Æ73Ò'6WGF–ærÖ—FVÒ#åÆâÆÆ&VÂ6Æ73Ò&6†V6¶&÷‚ÖÆ&VÂ#åÆâÆ–çWBG—SÒ&6†V6¶&÷‚"–CÒ'–·BÖ–çWBÖ¶VW×67&VVâÖv¶R"óåÆâÇ7â6Æ73Ò&6†V6¶Ö&²#ãÂ÷7ãåÆâŠûîZ.KùŞhÈKªî[şûÈK¸^™‹.ˆz®XªxhN[şûÈ•ÆâÂöÆ&VÃåÆâÇ6ÖÆÃîK¸^YÊŠûîZ.š^K‰Nš^™Ú.XúşŠxi{nyIşiX8.izk9^™‹¾jÚ.h˜¾Xª™H[ş8Xˆ~hÚ.X‹YîXûYîy¨NkXşŠxYšXk¾{¹>ûÉ¾yÈyK^jŠ[ÈşK™şXúşˆ;Şh¹.{¹ŞŠú^X©şˆ;Ş8#Â÷6ÖÆÃåÆâÂöF—cåÆâÂöF—cåÆâÂöF—cåÆâÂöF—cåÆãÂöF—cåÆâs°¢gVæ7F–öâFVfVÇDæf–vF÷"‚’°¢–b‡G—Vöbv–æF÷rÓÒ'VæFVf–æVB"’&WGW&âv–æF÷rææf–vF÷#°¢&WGW&âG—VöbvÆö&ÅF†—2ÓÒ'VæFVf–æVB"òvÆö&ÅF†—2ææf–vF÷"¢çVÆÃ°¢Ğ¢gVæ7F–öâFVfVÇDFö7VÖVçB‚’°¢&WGW&âG—VöbFö7VÖVçBÓÒ'VæFVf–æVB"òFö7VÖVçB¢çVÆÃ°¢Ğ¢gVæ7F–öâFVfVÇDÆö6F–öâ‚’°¢&WGW&âG—Vöbv–æF÷rÓÒ'VæFVf–æVB"òv–æF÷ræÆö6F–öâ¢çVÆÃ°¢Ğ¢gVæ7F–öâ—46Æ77&ööÕF‚‡F†æÖRÒ""’°¢&WGW&âõÂöÆW76öåÂögVÆÇ67&VVåÂ÷c2ƒó¥Â÷ÂB—ÅÂ÷c%Â÷vV%ÂöÆW76öâƒó¥Â÷ÂB—ÅÂöÕÂ÷c"ƒó¥Â÷ÂB’òçFW7B‡F†æÖR“°¢Ğ¢gVæ7F–öâ7&VFU67&VVåv¶TÆö6²‡¶vWDæf–vF÷#¢vWDæf–vF÷"ÒFVfVÇDæf–vF÷"ÂvWDFö7VÖVçC¢vWDFö7VÖVçBÒFVfVÇDFö7VÖVçBÂvWDÆö6F–öã¢vWDÆö6F–öâÒFVfVÇDÆö6F–öâÂöå7FGW3¢öå7FGW2Ò‚’Óâ·×ÒÒ·Ò’°¢ÆWBVæ&ÆVBÒfÇ6S°¢ÆWB6VçF–æVÂÒçVÆÃ°¢ÆWBVæF–æu&WVW7BÒçVÆÃ°¢ÆWBö'6W'fVDFö7VÖVçBÒçVÆÃ°¢6öç7B&W÷'BÒ†7F—fRÂ&V6öâÂW'&÷"’Óâ°¢6öç7B7FGW2Ò°¢7F—fS¢7F—fRÀ¢&V6öã¢&V6öà¢Ó°¢–b†W'&÷"’7FGW2æW'&÷"ÒW'&÷#°¢G'’°¢öå7FGW2‡7FGW2“°¢Ò6F6‚·Ğ¢&WGW&â7FGW3°¢Ó°¢6öç7BvWEF†æÖRÒ‚’ÓâvWDÆö6F–öâ‚“òçF†æÖRÇÂ"#°¢6öç7B—5f—6–&ÆRÒ‚’Óâ°¢6öç7BFö2ÒvWDFö7VÖVçB‚“°¢&WGW&âFö2bbFö2æ†–FFVâÓÒG'VRbbFö2çf—6–&–Æ—G•7FFRÓÒ&†–FFVâ#°¢Ó°¢6öç7B–æ7F—fU&V6öâÒ‚’Óâ°¢–b‚Væ&ÆVB’&WGW&â&F—6&ÆVB#°¢–b‚—46Æ77&ööÕF‚†vWEF†æÖR‚’’’&WGW&â&æ÷BÖ6Æ77&ööÒ#°¢–b‚—5f—6–&ÆR‚’’&WGW&â&†–FFVâ#°¢6öç7Bv¶TÆö6²ÒvWDæf–vF÷"‚“òçv¶TÆö6³°¢–b‚v¶TÆö6²ÇÂG—Vöbv¶TÆö6²ç&WVW7BÓÒ&gVæ7F–öâ"’&WGW&â'Vç7W÷'FVB#°¢&WGW&â'&VÆV6VB#°¢Ó°¢6öç7B&VÆV6U6VçF–æVÂÒ7–æ2‚’Óâ°¢6öç7B7W'&VçBÒ6VçF–æVÃ°¢6VçF–æVÂÒçVÆÃ°¢–b‚7W'&VçBÇÂG—Vöb7W'&VçBç&VÆV6RÓÒ&gVæ7F–öâ"’&WGW&ã°¢G'’°¢v—B7W'&VçBç&VÆV6R‚“°¢Ò6F6‚·Ğ¢Ó°¢6öç7Böåf—6–&–Æ—G”6†ævRÒ‚’Óâ°¢fö–B7–æ2‚“°¢Ó°¢6öç7Bö'6W'fUf—6–&–Æ—G’Ò‚’Óâ°¢6öç7BFö2ÒvWDFö7VÖVçB‚“°¢–b‚Fö2ÇÂFö2ÓÓÒö'6W'fVDFö7VÖVçBÇÂG—VöbFö2æFDWfVçDÆ—7FVæW"ÓÒ&gVæ7F–öâ"’&WGW&ã°¢–b†ö'6W'fVDFö7VÖVçBbbG—Vöbö'6W'fVDFö7VÖVçBç&VÖ÷fTWfVçDÆ—7FVæW"ÓÓÒ&gVæ7F–öâ"’ö'6W'fVDFö7VÖVçBç&VÖ÷fTWfVçDÆ—7FVæW"‚'f—6–&–Æ—G–6†ævR"Âöåf—6–&–Æ—G”6†ævR“°¢ö'6W'fVDFö7VÖVçBÒFö3°¢Fö2æFDWfVçDÆ—7FVæW"‚'f—6–&–Æ—G–6†ævR"Âöåf—6–&–Æ—G”6†ævR“°¢Ó°¢6öç7BGF6…6VçF–æVÂÒ7W'&VçBÓâ°¢–b‚7W'&VçBÇÂG—Vöb7W'&VçBæFDWfVçDÆ—7FVæW"ÓÒ&gVæ7F–öâ"’&WGW&ã°¢7W'&VçBæFDWfVçDÆ—7FVæW"‚'&VÆV6R"Â‚’Óâ°¢–b‡6VçF–æVÂÓÓÒ7W'&VçB’°¢6VçF–æVÂÒçVÆÃ°¢&W÷'B†fÇ6RÂ'&VÆV6VB"“°¢Ğ¢Ò“°¢Ó°¢7–æ2gVæ7F–öâ7–æ2‚’°¢ö'6W'fUf—6–&–Æ—G’‚“°¢6öç7B&V6öâÒ–æ7F—fU&V6öâ‚“°¢–b‡&V6öâÓÒ'&VÆV6VB"’°¢v—B&VÆV6U6VçF–æVÂ‚“°¢&WGW&â&W÷'B†fÇ6RÂ&V6öâ“°¢Ğ¢–b‡6VçF–æVÂbb6VçF–æVÂç&VÆV6VBÓÒG'VR’&WGW&â&W÷'B‡G'VRÂ&7F—fR"“°¢6VçF–æVÂÒçVÆÃ°¢–b‡VæF–æu&WVW7B’&WGW&âVæF–æu&WVW7C°¢6öç7B&WVW7E&öÖ—6RÒ&öÖ—6Rç&W6öÇfR‚’çF†Vâ†7–æ2‚’Óâ°¢G'’°¢ÆWB&WVW7FVC°¢G'’°¢&WVW7FVBÒv—BvWDæf–vF÷"‚’çv¶TÆö6²ç&WVW7B‚'67&VVâ"“°¢Ò6F6‚†W'&÷"’°¢&WGW&â&W÷'B†fÇ6RÂ'&WVW7BÖf–ÆVB"ÂW'&÷"“°¢Ğ¢òò6WGF–æw2Â&÷WFRÂ÷"f—6–&–Æ—G’Ö’6†ævRv†–ÆRF†R'&÷w6W"6†÷w2—G0¢òòW&Ö—76–öâ&ö×BâæWfW"&WF–â6VçF–æVÂF†B—2æòÆöævW"VÆ–v–&ÆRà¢6öç7BgFW%&WVW7E&V6öâÒ–æ7F—fU&V6öâ‚“°¢–b†gFW%&WVW7E&V6öâÓÒ'&VÆV6VB"’°¢G'’°¢v—B‡&WVW7FVCòç&VÆV6Sòâ‚’“°¢Ò6F6‚·Ğ¢&WGW&â&W÷'B†fÇ6RÂgFW%&WVW7E&V6öâ“°¢Ğ¢6VçF–æVÂÒ&WVW7FVC°¢GF6…6VçF–æVÂ‡&WVW7FVB“°¢&WGW&â&W÷'B‡G'VRÂ&7F—fR"“°¢Òf–æÆÇ’°¢òò6ÆV"&Vf÷&R6ÆÆW'2ö'6W'fR6ö×ÆWF–öâÂ6òâ–ÖÖVF–FVÇ’&VÆV6V@¢òò6VçF–æVÂ6âÇv—2&R&V7V—&VB'’F†RæW‡B7–æ2‚’à¢–b‡VæF–æu&WVW7BÓÓÒ&WVW7E&öÖ—6R’VæF–æu&WVW7BÒçVÆÃ°¢Ğ¢Ò“°¢VæF–æu&WVW7BÒ&WVW7E&öÖ—6S°¢&WGW&â&WVW7E&öÖ—6S°¢Ğ¢7–æ2gVæ7F–öâ6WDVæ&ÆVB†æW‡DVæ&ÆVB’°¢Væ&ÆVBÒæW‡DVæ&ÆVC°¢&WGW&â7–æ2‚“°¢Ğ¢7–æ2gVæ7F–öâF—7÷6R‚’°¢Væ&ÆVBÒfÇ6S°¢–b†ö'6W'fVDFö7VÖVçBbbG—Vöbö'6W'fVDFö7VÖVçBç&VÖ÷fTWfVçDÆ—7FVæW"ÓÓÒ&gVæ7F–öâ"’ö'6W'fVDFö7VÖVçBç&VÖ÷fTWfVçDÆ—7FVæW"‚'f—6–&–Æ—G–6†ævR"Âöåf—6–&–Æ—G”6†ævR“°¢ö'6W'fVDFö7VÖVçBÒçVÆÃ°¢v—B&VÆV6U6VçF–æVÂ‚“°¢Ğ¢&WGW&â°¢6WDVæ&ÆVC¢6WDVæ&ÆVBÀ¢7–æ3¢7–æ2À¢F—7÷6S¢F—7÷6RÀ¢vWE7FFR‚’°¢&WGW&â°¢Væ&ÆVC¢Væ&ÆVBÀ¢7F—fS¢6VçF–æVÂbb6VçF–æVÂç&VÆV6VBÓÒG'VP¢Ó°¢Ğ¢Ó°¢Ğ¢6öç7B67&VVåv¶TÆö6²Ò7&VFU67&VVåv¶TÆö6²‚“°¢òò7&2ö6÷&R÷6WGF–æw2Öf÷&Òæ§0¢gVæ7F–öâFW‡B‡fÇVR’°¢&WGW&â7G&–ær‡fÇVRóò""’çG&–Ò‚“°¢Ğ¢ò¢ ¢¢fÆ–FFRWfW'’fÇVR&Vf÷&R6†æv–ærF†R&öf–ÆRâF†—2¶VW2â–çfÆ–@¢¢FV×W&GW&Rg&öÒ'F–ÆÇ’6f–æræWr’U$ÂÂ¶W’Â÷"ÖöFVÂæÖRà¢¢ògVæ7F–öâÇ•&öf–ÆTf÷&Ò‡&öf–ÆRÂf–VÆG2Ò·Ò’°¢–b‚&öf–ÆRÇÂG—Vöb&öf–ÆRÓÒ&ö&¦V7B"’&WGW&â°¢ö³¢fÇ6RÀ¢f–VÆC¢'&öf–ÆR ¢Ó°¢6öç7B&uFV×W&GW&RÒFW‡B†f–VÆG2çFV×W&GW&R“°¢ÆWBFV×W&GW&RÒ"#°¢–b‡&uFV×W&GW&RÓÒ""’°¢FV×W&GW&RÒçVÖ&W"‡&uFV×W&GW&R“°¢–b‚çVÖ&W"æ—4f–æ—FR‡FV×W&GW&R’ÇÂFV×W&GW&RÂÇÂFV×W&GW&Râ"’&WGW&â°¢ö³¢fÇ6RÀ¢f–VÆC¢'FV×W&GW&R ¢Ó°¢Ğ¢6öç7BæW‡BÒ°¢æÖS¢FW‡B†f–VÆG2ææÖR’ÇÂ&öf–ÆRææÖRÀ¢&6UW&Ã¢FW‡B†f–VÆG2æ&6UW&Â’ÇÂ&öf–ÆRæ&6UW&ÂÀ¢”¶W“¢FW‡B†f–VÆG2æ”¶W’’À¢ÖöFVÃ¢FW‡B†f–VÆG2æÖöFVÂ’ÇÂ&öf–ÆRæÖöFVÂÀ¢f—6–öäÖöFVÃ¢FW‡B†f–VÆG2çf—6–öäÖöFVÂ’ÇÂ&öf–ÆRçf—6–öäÖöFVÂÀ¢FV×W&GW&S¢FV×W&GW&P¢Ó°¢ö&¦V7Bæ76–vâ‡&öf–ÆRÂæW‡B“°¢&WGW&â°¢ö³¢G'VRÀ¢&öf–ÆS¢&öf–ÆP¢Ó°¢Ğ¢ò¢¢&Vg&W6‚WfW'’&VÖ–æFW"–çWBv†VæWfW"6WGF–æw27W&f6R&V6öÖW2f—6–&ÆRâ¢ògVæ7F–öâ7–æ5&VÖ–æFW$f÷&Ò†f–VÆG2Ò·ÒÂ6öæf–rÒ·Ò’°¢f÷"†6öç7B¶W’öb$TÔ”äDU%õ4UED”äuô´U•2’°¢6öç7Bf–VÆBÒf–VÆG5¶¶W•Ó°¢–b†f–VÆB’f–VÆBæ6†V6¶VBÒ6öæf–u¶¶W•ÒÓÒfÇ6S°¢Ğ¢Ğ¢gVæ7F–öâ&VE&VÖ–æFW$f÷&Ò†f–VÆG2Ò·Ò’°¢&WGW&âö&¦V7Bæg&öÔVçG&–W2…$TÔ”äDU%õ4UED”äuô´U•2æÖ†¶W’Óâ²¶W’Âf–VÆG5¶¶W•Óòæ6†V6¶VBÒ’“°¢Ğ¢òò6WGF–æw2æ§2†æWrfW'6–öâ¢ÆWBÖ÷VçFVBCRÒfÇ6S°¢ÆWB&ö÷BCC°¢ÆWB7–æ4Ö÷VçFVDf÷&ÒÒ‚’Óâ·Ó°¢òòÒÒÒÒ’&öf–ÆR†VÇW'2ÒÒÒĞ¢gVæ7F–öâVç7W&T•&öf–ÆW2†6öæf–t’’°¢–b‚6öæf–t’’&WGW&ã°¢òòXú®iÈ’¶–Ö””¶W’i{nX‰¾[»®zÊÎKˆKŠ¢&öf–ÆP¢–b‚'&’æ—4'&’†6öæf–t’ç&öf–ÆW2’ÇÂ6öæf–t’ç&öf–ÆW2æÆVæwF‚ÓÓÒ’°¢6öç7BÆVv7”¶W’Ò6öæf–t’æ¶–Ö””¶W’ÇÂ6öæf–t’æ”¶W’ÇÂ7F÷&vRævWB‚&¶–Ö””¶W’"’ÇÂ"#°¢6öæf–t’ç&öf–ÆW2Ò²°¢–C¢&FVfVÇB"À¢æÖS¢$¶–Ö’"À¢&6UW&Ã¢&‡GG3¢òö’æÖööç6†÷Bæ6â÷cö6†Bö6ö×ÆWF–öç2"À¢”¶W“¢ÆVv7”¶W’À¢ÖöFVÃ¢&Öööç6†÷B×cÓ†²"À¢f—6–öäÖöFVÃ¢&Öööç6†÷B×cÓ†²×f—6–öâ×&Wf–Wr"À¢FV×W&GW&S¢" ¢ÒÓ°¢6öæf–t’æ7F—fU&öf–ÆT–BÒ&FVfVÇB#°¢Ğ¢–b‚6öæf–t’æ7F—fU&öf–ÆT–B’6öæf–t’æ7F—fU&öf–ÆT–BÒ6öæf–t’ç&öf–ÆW5³Òæ–C°¢Ğ¢òòÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒĞ¢gVæ7F–öâÖ÷VçE6WGF–æw5æVÂ‚’°¢–b†Ö÷VçFVBCR’&WGW&â&ö÷BCC°¢òòk:XZR…DÔÀ¢&ö÷BCBÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢&ö÷BCBæ–ææW$…DÔÂÒGÂCS°¢Fö7VÖVçBæ&öG’æVæD6†–ÆB‡&ö÷BCBæf—'7DVÆVÖVçD6†–ÆB“°¢&ö÷BCBÒFö7VÖVçBævWDVÆVÖVçD'”–B‚'–·B×6WGF–æw2×æVÂ"“°¢6öç7B”6frÒV’æ6öæf–ræ’ÇÂ‡V’æ6öæf–ræ’Ò·Ò“°¢Vç7W&T•&öf–ÆW2†”6fr“°¢òòÓÓÒˆë~Xùnh˜iÈ’’&öf–ÆRy»X[>y¨BDôÒÓÓĞ¢6öç7BG&öf–ÆU6VÆV7BÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ’×&öf–ÆR×6VÆV7B"“°¢6öç7BG&öf–ÆTFBÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ’×&öf–ÆRÖFB"“°¢6öç7BG&öf–ÆTFVÂÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ’×&öf–ÆRÖFVÂ"“°¢6öç7BG&öf–ÆTæÖRÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ’×&öf–ÆRÖæÖR"“°¢6öç7BF&6UW&ÂÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ’Ö&6R×W&Â"“°¢6öç7BF’Ò&ö÷BCBçVW'•6VÆV7F÷"‚"6¶–Ö’Ö’Ö¶W’"“°¢6öç7BFÖöFVÂÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ’ÖÖöFVÂ"“°¢6öç7BGf—6–öäÖöFVÂÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ’×f—6–öâÖÖöFVÂ"“°¢6öç7BGFV×W&GW&RÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ’×FV×W&GW&R"“°¢6öç7BFö7$’Ò&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ’Öö7"Ö’"“°¢6öç7BFö7$”¶W’Ò&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ’Öö7"Ö’Ö¶W’"“°¢6öç7BGG&ç6ÆFT’Ò&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ’×G&ç6ÆFRÖ’"“°¢6öç7BGG&ç6ÆFT”¶W’Ò&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ’×G&ç6ÆFRÖ’Ö¶W’"“°¢6öç7BGG&ç6ÆFTÖöFVÂÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ’×G&ç6ÆFRÖÖöFVÂ"“°¢òòÓÓÒX[nK¹bT’XéşiÈZÙ~jëRÓÓĞ¢6öç7BFWFòÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖWFòÖç7vW""“°¢6öç7BFWFô¦ö–âÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖWFòÖ¦ö–â"“°¢6öç7BFWFô¦ö–äWFôç7vW"Ò&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖWFòÖ¦ö–âÖWFòÖç7vW""“°¢6öç7BFWFôæÇ—¦RÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖ’ÖWFòÖæÇ—¦R"“°¢6öç7BFWFõ&V6÷fW%Væç7vW&VBÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖWFò×&V6÷fW"×Væç7vW&VB"“°¢6öç7BFWFõ&V6÷fW$W‡—&VBÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖWFò×&V6÷fW"ÖW‡—&VB"“°¢6öç7BFWFõ66åVæç7vW&VBÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖWFò×66â×Væç7vW&VB"“°¢6öç7BFFVÆ’Ò&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖç7vW"ÖFVÆ’"“°¢6öç7BG&æBÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWB×&æFöÒÖFVÆ’"“°¢6öç7BG&–÷&—G’Ò&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ’×–6²ÖÖ–âÖf—'7B"“°¢6öç7BFæ÷F–g”GW"Ò&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’ÖGW&F–öâ"“°¢6öç7BFæ÷F–g•föÂÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’×föÇVÖR"“°¢6öç7BFæ÷F–g”ÆÂÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’ÖÆÂ"“°¢6öç7BFæ÷F–g•&ö&ÆVÕ7F'BÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’×&ö&ÆVÒ×7F'B"“°¢6öç7BFæ÷F–g”Fæ×U&÷VæE7F'BÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’ÖFæ×R×&÷VæB×7F'B"“°¢6öç7BFæ÷F–g”Fæ×TföÆÆ÷uG&–vvW"Ò&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’ÖFæ×RÖföÆÆ÷r×G&–vvW""“°¢6öç7BFæ÷F–g”76W76ÖVçBÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’Ö76W76ÖVçB×V&Æ—6‚"“°¢6öç7BFæ÷F–g”6÷W'6Wv&RÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’Ö6÷W'6Wv&R×V&Æ—6‚"“°¢6öç7BFæ÷F–g”÷F†W"Ò&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’Ö÷F†W"×V&Æ—6‚"“°¢6öç7BFæ÷F–g”ÆW76öäf–æ—6†VBÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’ÖÆW76öâÖf–æ—6†VB"“°¢6öç7BFæ÷F–g”WFôç7vW%66†VGVÆVBÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’ÖWFòÖç7vW"×66†VGVÆVB"“°¢6öç7BFæ÷F–g”WFôç7vW%7F'FVBÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’ÖWFòÖç7vW"×7F'FVB"“°¢6öç7BFæ÷F–g”WFôç7vW%7V66VVFVBÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’ÖWFòÖç7vW"×7V66VVFVB"“°¢6öç7BFæ÷F–g”WFôç7vW$f–ÆVBÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’ÖWFòÖç7vW"Öf–ÆVB"“°¢6öç7BFæ÷F–g”æF—fRÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’ÖæF—fR"“°¢6öç7BFæ÷F–g•÷WÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’×÷W"“°¢6öç7BFæ÷F–g•6÷VæBÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’×6÷VæB"“°¢6öç7BFWFôföÆÆ÷tFæ×RÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖWFòÖföÆÆ÷rÖFæ×R"“°¢6öç7BF¶VW67&VVäv¶RÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖ¶VW×67&VVâÖv¶R"“°¢6öç7BF–gFW‚Ò&ö÷BCBçVW'•6VÆV7F÷"‚"7–·B×V’×FW‚"“°¢6öç7BFVF–ôf–ÆRÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’ÖVF–òÖf–ÆR"“°¢6öç7BFVF–õW&ÂÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ–çWBÖæ÷F–g’ÖVF–ò×W&Â"“°¢6öç7BFÇ•W&ÂÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ'FâÖÇ’ÖVF–ò×W&Â"“°¢6öç7BG&Wf–WrÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ'Fâ×&Wf–WrÖVF–ò"“°¢6öç7BF6ÆV"Ò&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ'FâÖ6ÆV"ÖVF–ò"“°¢6öç7BFVF–ôæÖRÒ&ö÷BCBçVW'•6VÆV7F÷"‚"7–·B×F—ÖVF–òÖæÖR"“°¢6öç7B&VÖ–æFW$f–VÆG2Ò°¢æ÷F–g•&ö&ÆV×3¢Fæ÷F–g”ÆÂÀ¢æ÷F–g•&ö&ÆVÕ7F'G3¢Fæ÷F–g•&ö&ÆVÕ7F'BÀ¢æ÷F–g”Fæ×U&÷VæE7F'G3¢Fæ÷F–g”Fæ×U&÷VæE7F'BÀ¢æ÷F–g”Fæ×TföÆÆ÷uG&–vvW'3¢Fæ÷F–g”Fæ×TföÆÆ÷uG&–vvW"À¢æ÷F–g”76W76ÖVçEV&Æ—6†W3¢Fæ÷F–g”76W76ÖVçBÀ¢æ÷F–g”6÷W'6Wv&UV&Æ—6†W3¢Fæ÷F–g”6÷W'6Wv&RÀ¢æ÷F–g”÷F†W%V&Æ—6†W3¢Fæ÷F–g”÷F†W"À¢æ÷F–g”ÆW76öäf–æ—6†VC¢Fæ÷F–g”ÆW76öäf–æ—6†VBÀ¢æ÷F–g”WFôç7vW%66†VGVÆVC¢Fæ÷F–g”WFôç7vW%66†VGVÆVBÀ¢æ÷F–g”WFôç7vW%7F'FVC¢Fæ÷F–g”WFôç7vW%7F'FVBÀ¢æ÷F–g”WFôç7vW%7V66VVFVC¢Fæ÷F–g”WFôç7vW%7V66VVFVBÀ¢æ÷F–g”WFôç7vW$f–ÆVC¢Fæ÷F–g”WFôç7vW$f–ÆVBÀ¢æ÷F–g”æF—fS¢Fæ÷F–g”æF—fRÀ¢æ÷F–g•÷W¢Fæ÷F–g•÷WÀ¢æ÷F–g•6÷VæC¢Fæ÷F–g•6÷Væ@¢Ó°¢òò&öf–ÆRT¢gVæ7F–öâ&Vg&W6…&öf–ÆU6VÆV7B‚’°¢6öç7B’ÒV’æ6öæf–ræ“°¢G&öf–ÆU6VÆV7Bæ–ææW$…DÔÂÒ"#°¢’ç&öf–ÆW2æf÷$V6‚‡Óâ°¢6öç7B÷BÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&÷F–öâ"“°¢÷BçfÇVRÒæ–C°¢÷BçFW‡D6öçFVçBÒææÖRÇÂæ–C°¢–b‡æ–BÓÓÒ’æ7F—fU&öf–ÆT–B’÷Bç6VÆV7FVBÒG'VS°¢G&öf–ÆU6VÆV7BæVæD6†–ÆB†÷B“°¢Ò“°¢Ğ¢gVæ7F–öâÆöE&öf–ÆUFôf÷&Ò‡&öf–ÆT–B’°¢6öç7BÒV’æ6öæf–ræ’ç&öf–ÆW2æf–æB‡‚Óâ‚æ–BÓÓÒ&öf–ÆT–B“°¢–b‚’&WGW&ã°¢V’æ6öæf–ræ’æ7F—fU&öf–ÆT–BÒæ–C°¢G&öf–ÆTæÖRçfÇVRÒææÖRÇÂ"#°¢F&6UW&ÂçfÇVRÒæ&6UW&ÂÇÂ"#°¢F’çfÇVRÒæ”¶W’ÇÂ"#°¢FÖöFVÂçfÇVRÒæÖöFVÂÇÂ"#°¢Gf—6–öäÖöFVÂçfÇVRÒçf—6–öäÖöFVÂÇÂ"#°¢GFV×W&GW&RçfÇVRÒçFV×W&GW&Róò"#°¢Fö7$’çfÇVRÒV’æ6öæf–ræ’æö7$’ÇÂ"#°¢Fö7$”¶W’çfÇVRÒV’æ6öæf–ræ’æö7$”¶W’ÇÂ"#°¢GG&ç6ÆFT’çfÇVRÒV’æ6öæf–ræ’çG&ç6ÆFT’ÇÂ"#°¢GG&ç6ÆFT”¶W’çfÇVRÒV’æ6öæf–ræ’çG&ç6ÆFT”¶W’ÇÂ"#°¢GG&ç6ÆFTÖöFVÂçfÇVRÒV’æ6öæf–ræ’çG&ç6ÆFTÖöFVÂÇÂ"#°¢Ğ¢òòX‰ŞZx¾XÉb&öf–ÆRKˆ¾h¸j`¢&Vg&W6…&öf–ÆU6VÆV7B‚“°¢ÆöE&öf–ÆUFôf÷&Ò‡V’æ6öæf–ræ’æ7F—fU&öf–ÆT–B“°¢òòXˆ~hÚ"&öf–ÆP¢G&öf–ÆU6VÆV7BæFDWfVçDÆ—7FVæW"‚&6†ævR"Â‚’Óâ°¢ÆöE&öf–ÆUFôf÷&Ò‚G&öf–ÆU6VÆV7BçfÇVR“°¢Ò“°¢òòk{¾Xª&öf–ÆP¢G&öf–ÆTFBæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ°¢6öç7B–BÒòG´FFRææ÷r‚’çFõ7G&–ærƒ3b—Ö°¢6öç7BæWuÒ°¢–C¢–BÀ¢æÖS¢&æWr’¶W’"À¢&6UW&Ã¢&‡GG3¢òö’æ÷Væ’æ6öÒòâââ"À¢”¶W“¢""À¢ÖöFVÃ¢&wBÓFòÖÖ–æ’"À¢f—6–öäÖöFVÃ¢""À¢FV×W&GW&S¢" ¢Ó°¢V’æ6öæf–ræ’ç&öf–ÆW2çW6‚†æWu“°¢V’æ6öæf–ræ’æ7F—fU&öf–ÆT–BÒ–C°¢&Vg&W6…&öf–ÆU6VÆV7B‚“°¢ÆöE&öf–ÆUFôf÷&Ò†–B“°¢Ò“°¢òòXŠ™šB&öf–ÆP¢G&öf–ÆTFVÂæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ°¢6öç7B’ÒV’æ6öæf–ræ“°¢–b†’ç&öf–ÆW2æÆVæwF‚ÃÒ’°¢V’çFö7B‚.ˆ{>[	KùŞyYKˆKŠ®˜XŞ{Úâ"Â#S“°¢&WGW&ã°¢Ğ¢6öç7B–BÒ’æ7F—fU&öf–ÆT–C°¢’ç&öf–ÆW2Ò’ç&öf–ÆW2æf–ÇFW"‡Óâæ–BÓÒ–B“°¢’æ7F—fU&öf–ÆT–BÒ’ç&öf–ÆW5³Òæ–C°¢&Vg&W6…&öf–ÆU6VÆV7B‚“°¢ÆöE&öf–ÆUFôf÷&Ò†’æ7F—fU&öf–ÆT–B“°¢Ò“°¢gVæ7F–öâ7–æ4f÷&Ôg&öÔ6öæf–r‚’°¢Vç7W&T•&öf–ÆW2‡V’æ6öæf–ræ’ÇÂ‡V’æ6öæf–ræ’Ò·Ò’“°¢&Vg&W6…&öf–ÆU6VÆV7B‚“°¢ÆöE&öf–ÆUFôf÷&Ò‡V’æ6öæf–ræ’æ7F—fU&öf–ÆT–B“°¢FWFô¦ö–âæ6†V6¶VBÒV’æ6öæf–ræWFô¦ö–äVæ&ÆVC°¢FWFô¦ö–äWFôç7vW"æ6†V6¶VBÒV’æ6öæf–ræWFôç7vW$öäWFô¦ö–ã°¢FWFòæ6†V6¶VBÒV’æ6öæf–ræWFôç7vW#°¢FWFôæÇ—¦Ræ6†V6¶VBÒV’æ6öæf–ræ”WFôæÇ—¦S°¢FWFõ&V6÷fW%Væç7vW&VBæ6†V6¶VBÒV’æ6öæf–ræWFõ&V6÷fW%Væç7vW&VC°¢FWFõ&V6÷fW$W‡—&VBæ6†V6¶VBÒV’æ6öæf–ræWFõ&V6÷fW$W‡—&VC°¢FWFõ66åVæç7vW&VBæ6†V6¶VBÒV’æ6öæf–ræWFõ66åVæç7vW&VC°¢F–gFW‚æ6†V6¶VBÒV’æ6öæf–ræ–gFWƒ°¢FFVÆ’çfÇVRÒÖF‚æfÆö÷"‚‡V’æ6öæf–ræWFôç7vW$FVÆ’ÇÂ6S2’òS2“°¢G&æBçfÇVRÒÖF‚æfÆö÷"‚‡V’æ6öæf–ræWFôç7vW%&æFöÔFVÆ’ÇÂS’òS2“°¢G&–÷&—G’æ6†V6¶VBÒV’æ6öæf–ræ•6Æ–FU–6µ&–÷&—G’ÓÒfÇ6S°¢Fæ÷F–g”GW"çfÇVRÒÖF‚æfÆö÷"‚‡V’æ6öæf–rææ÷F–g•÷WGW&F–öâÇÂVS2’òS2“°¢Fæ÷F–g•föÂçfÇVRÒÖF‚ç&÷VæBƒ¢‡V’æ6öæf–rææ÷F–g•föÇVÖRóòãb’“°¢7–æ5&VÖ–æFW$f÷&Ò‡&VÖ–æFW$f–VÆG2ÂV’æ6öæf–r“°¢FWFôföÆÆ÷tFæ×Ræ6†V6¶VBÒV’æ6öæf–ræWFôföÆÆ÷tFæ×S°¢F¶VW67&VVäv¶Ræ6†V6¶VBÒV’æ6öæf–ræ¶VW67&VVäv¶S°¢FVF–ôæÖRçFW‡D6öçFVçBÒV’æ6öæf–ræ7W7FöÔæ÷F–g”VF–ôæÖRò[Ù>X˜ŞûÉ¢G·V’æ6öæf–ræ7W7FöÔæ÷F–g”VF–ôæÖWÖ¢.[Ù>X˜ŞûÉ®KÛşyJXh^{Úî(	ÎXúâŞY)®(	ŞhùzK®™û2#°¢Ğ¢7–æ4Ö÷VçFVDf÷&ÒÒ7–æ4f÷&Ôg&öÔ6öæf–s°¢7–æ4f÷&Ôg&öÔ6öæf–r‚“°¢òòKùŞZÙŠëî{Úà¢&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ'Fâ×6WGF–æw2×6fR"’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â7–æ2‚’Óâ°¢òòÒÒÒKùŞZÙ[Ù>X˜Ò&öf–ÆRÒÒĞ¢6öç7B’ÒV’æ6öæf–ræ“°¢6öç7B–BÒ’æ7F—fU&öf–ÆT–C°¢6öç7BÒ’ç&öf–ÆW2æf–æB‡‚Óâ‚æ–BÓÓÒ–B“°¢–b‚’°¢V’çFö7B‚.[Ù>X˜Ò’˜XŞ{ÚîKˆŞZÙYÊûÈÎŠû~˜xŞik˜hºYîKùŞZÙ‚"Â6S2“°¢&WGW&ã°¢Ğ¢6öç7B&öf–ÆU&W7VÇBÒÇ•&öf–ÆTf÷&Ò‡Â°¢æÖS¢G&öf–ÆTæÖRçfÇVRÀ¢&6UW&Ã¢F&6UW&ÂçfÇVRÀ¢”¶W“¢F’çfÇVRÀ¢ÖöFVÃ¢FÖöFVÂçfÇVRÀ¢f—6–öäÖöFVÃ¢Gf—6–öäÖöFVÂçfÇVRÀ¢FV×W&GW&S¢GFV×W&GW&RçfÇVP¢Ò“°¢–b‚&öf–ÆU&W7VÇBæö²’°¢V’çFö7B‚%FV×W&GW&R[ø^š¾iŠòX‹"K˜¾™{Ny¨Ni[ZÙ~ûÈÎh‰nyYz›¢"Â6S2“°¢&WGW&ã°¢Ğ¢’æö7$’ÒFö7$’çfÇVRçG&–Ò‚“°¢’æö7$”¶W’ÒFö7$”¶W’çfÇVRçG&–Ò‚“°¢’çG&ç6ÆFT’ÒGG&ç6ÆFT’çfÇVRçG&–Ò‚“°¢’çG&ç6ÆFT”¶W’ÒGG&ç6ÆFT”¶W’çfÇVRçG&–Ò‚“°¢’çG&ç6ÆFTÖöFVÂÒGG&ç6ÆFTÖöFVÂçfÇVRçG&–Ò‚“°¢6öç7B7W$÷BÒG&öf–ÆU6VÆV7BçVW'•6VÆV7F÷"†÷F–öå·fÇVSÒ"G·æ–GÒ%Ö“°¢–b†7W$÷B’7W$÷BçFW‡D6öçFVçBÒææÖRÇÂæ–C°¢’æ¶–Ö””¶W’Òæ”¶W“°¢7F÷&vRç6WB‚&¶–Ö””¶W’"Âæ”¶W’“°¢V’æ6öæf–ræWFô¦ö–äVæ&ÆVBÒFWFô¦ö–âæ6†V6¶VC°¢V’æ6öæf–ræWFôç7vW$öäWFô¦ö–âÒFWFô¦ö–äWFôç7vW"æ6†V6¶VC°¢V’æ6öæf–ræWFôç7vW"ÒFWFòæ6†V6¶VC°¢V’æ6öæf–ræ”WFôæÇ—¦RÒFWFôæÇ—¦Ræ6†V6¶VC°¢V’æ6öæf–ræWFõ&V6÷fW%Væç7vW&VBÒFWFõ&V6÷fW%Væç7vW&VBæ6†V6¶VC°¢V’æ6öæf–ræWFõ&V6÷fW$W‡—&VBÒFWFõ&V6÷fW$W‡—&VBæ6†V6¶VC°¢V’æ6öæf–ræWFõ66åVæç7vW&VBÒFWFõ66åVæç7vW&VBæ6†V6¶VC°¢V’æ6öæf–ræWFôç7vW$FVÆ’ÒÖF‚æÖ‚ƒS2Â‚²FFVÆ’çfÇVRÇÂ’¢S2“°¢V’æ6öæf–ræWFôç7vW%&æFöÔFVÆ’ÒÖF‚æÖ‚ƒÂ‚²G&æBçfÇVRÇÂ’¢S2“°¢V’æ6öæf–ræ–gFW‚ÒF–gFW‚æ6†V6¶VC°¢V’æ6öæf–ræ•6Æ–FU–6µ&–÷&—G’ÒG&–÷&—G’æ6†V6¶VC°¢V’æ6öæf–rææ÷F–g•÷WGW&F–öâÒÖF‚æÖ‚ƒ&S2Â‚²Fæ÷F–g”GW"çfÇVRÇÂ’¢S2“°¢V’æ6öæf–rææ÷F–g•föÇVÖRÒÖF‚æÖ‚ƒÂÖF‚æÖ–âƒÂ‚²Fæ÷F–g•föÂçfÇVRÇÂc’ò’“°¢ö&¦V7Bæ76–vâ‡V’æ6öæf–rÂ&VE&VÖ–æFW$f÷&Ò‡&VÖ–æFW$f–VÆG2’“°¢V’æ6öæf–ræWFôföÆÆ÷tFæ×RÒFWFôföÆÆ÷tFæ×Ræ6†V6¶VC°¢V’æ6öæf–ræ¶VW67&VVäv¶RÒF¶VW67&VVäv¶Ræ6†V6¶VC°¢V’ç6fT6öæf–r‚“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚'–·BÖ'FâÖ&VÆÂ"“òæ6Æ74Æ—7BçFövvÆR‚&7F—fR"ÂV’æ6öæf–rææ÷F–g•&ö&ÆV×2“°¢V’çWFFTWFôç7vW$'Fâ‚“°¢6öç7Bv¶TÆö6µ7FGW2Òv—B67&VVåv¶TÆö6²ç6WDVæ&ÆVB‡V’æ6öæf–ræ¶VW67&VVäv¶R“°¢–b‡V’æ6öæf–ræ¶VW67&VVäv¶Rbbv¶TÆö6µ7FGW2ç&V6öâÓÓÒ&æ÷BÖ6Æ77&ööÒ"’V’çFö7B‚.Šëî{Úî[{.KùŞZÙûÉ¾‹ù¾XZ^ŠûîZ.š^Yî[n[	ŞŠù^KùŞhÈKªî[ò"Â6S2“²VÇ6R–b‡V’æ6öæf–ræ¶VW67&VVäv¶Rbbv¶TÆö6µ7FGW2ç&V6öâÓÓÒ'Vç7W÷'FVB"’V’çFö7B‚.Šëî{Úî[{.KùŞZÙûÉ¾[Ù>X˜ŞkXşŠxYšKˆŞiJşhÈŠûîZ.KùŞhÈKªî[ò"Â3S“²VÇ6R–b‡V’æ6öæf–ræ¶VW67&VVäv¶Rbbv¶TÆö6µ7FGW2ç&V6öâÓÓÒ'&WVW7BÖf–ÆVB"’V’çFö7B‚.Šëî{Úî[{.KùŞZÙûÉ¾{;¾{¹şiÊ®XXŠëKùŞhÈKªî[şûÈÎŠû~j8iú^yÈyK^jŠ[Èşh‰nkXşŠxYšiØ>™™"ÂFS2“²VÇ6RV’çFö7B‚.Šëî{Úî[{.KùŞZÙ‚"“°¢Ò“°¢òòÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒĞ¢òò˜xŞ{ÚîK‹®›¹Šê@¢òòÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒÒĞ¢&ö÷BCBçVW'•6VÆV7F÷"‚"7–·BÖ'Fâ×6WGF–æw2×&W6WB"’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â7–æ2‚’Óâ°¢–b‚6öæf—&Ò‚.zîZé®Šh˜xŞ{ÚîK‹®›¹ŠêNŠëî{ÚîY	~ûÉò"’’&WGW&ã°¢ö&¦V7Bæ76–vâ‡V’æ6öæf–rÂ¥4ôâç'6R„¥4ôâç7G&–æv–g’„DTdTÅEô4ôäd”r’’“°¢Vç7W&T•&öf–ÆW2‡V’æ6öæf–ræ’“°¢V’æ6öæf–ræWFô¦ö–äVæ&ÆVBÒfÇ6S°¢V’æ6öæf–ræWFôç7vW$öäWFô¦ö–âÒG'VS°¢V’æ6öæf–ræWFõ&V6÷fW%Væç7vW&VBÒfÇ6S°¢V’æ6öæf–ræWFõ&V6÷fW$W‡—&VBÒfÇ6S°¢V’æ6öæf–ræWFõ66åVæç7vW&VBÒfÇ6S°¢7–æ4f÷&Ôg&öÔ6öæf–r‚“°¢7F÷&vRç6WB‚&¶–Ö””¶W’"Â""“°¢V’ç6fT6öæf–r‚“°¢Fö7VÖVçBævWDVÆVÖVçD'”–B‚'–·BÖ'FâÖ&VÆÂ"“òæ6Æ74Æ—7BçFövvÆR‚&7F—fR"ÂV’æ6öæf–rææ÷F–g•&ö&ÆV×2“°¢V’çWFFTWFôç7vW$'Fâ‚“°¢v—B67&VVåv¶TÆö6²ç6WDVæ&ÆVB†fÇ6R“°¢V’çFö7B‚.Šëî{Úî[{.˜xŞ{Úâ"“°¢Ò“°¢òò™û>š)Šëî{Úà¢6öç7BÔ…õ4•¤RÒ"¢#B¢#C°¢–b‚FVF–ôf–ÆR’FVF–ôf–ÆRæFDWfVçDÆ—7FVæW"‚&6†ævR"ÂRÓâ°¢6öç7BbÒRçF&vWBæf–ÆW3òå³Ó°¢–b‚b’&WGW&ã°¢–b†bç6—¦RâÔ…õ4•¤R’°¢V’çFö7B‚.™û>š)ih~K»n‹ø~ZJ~ûÈƒã$Ô.ûÈ’"Â6S2“°¢&WGW&ã°¢Ğ¢6öç7B&VFW"ÒæWrf–ÆU&VFW#°¢&VFW"æöæÆöBÒ‚’Óâ°¢6öç7B7&2Ò&VFW"ç&W7VÇC°¢V’ç6WD7W7FöÔæ÷F–g”VF–ò‡°¢7&3¢7&2À¢æÖS¢bææÖP¢Ò“°¢FVF–ôæÖRçFW‡D6öçFVçBÒ[Ù>X˜ŞûÉ¢G¶bææÖWÖ°¢V’å÷Æ”æ÷F–g•6÷VæB‡V’æ6öæf–rææ÷F–g•föÇVÖR“°¢V’çFö7B‚.[{.[©NyJˆz®Zé®K˜hùzK®™û2"“°¢Ó°¢&VFW"ç&VD4FFU$Â†b“°¢Ò“°¢–b‚FÇ•W&Â’FÇ•W&ÂæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ°¢6öç7BW&ÂÒ‚FVF–õW&ÂçfÇVRÇÂ""’çG&–Ò‚“°¢–b‚W&Â’&WGW&âV’çFö7B‚.Šû~‹é>XZ^™û>š)U$Â"“°¢–b‚õæ‡GG3ó¥ÂõÂ÷ÅæFF¦VF–õÂòö’çFW7B‡W&Â’’°¢V’çFö7B‚%U$Â[ø^š¾KºR‡GGö‡GG2h‰bFF¦VF–òò[ÈZKB"“°¢&WGW&ã°¢Ğ¢V’ç6WD7W7FöÔæ÷F–g”VF–ò‡°¢7&3¢W&ÂÀ¢æÖS¢" ¢Ò“°¢FVF–ôæÖRçFW‡D6öçFVçBÒ.[Ù>X˜ŞûÉ®ûÈˆz®Zé®K˜•U$ÎûÈ’#°¢V’å÷Æ”æ÷F–g•6÷VæB‡V’æ6öæf–rææ÷F–g•föÇVÖR“°¢V’çFö7B‚.[{.[©NyJˆz®Zé®K˜™û>š)U$Â"“°¢Ò“°¢–b‚G&Wf–Wr’G&Wf–WræFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ°¢V’å÷Æ”æ÷F–g•6÷VæB‡V’æ6öæf–rææ÷F–g•föÇVÖR“°¢Ò“°¢–b‚F6ÆV"’F6ÆV"æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ°¢V’ç6WD7W7FöÔæ÷F–g”VF–ò‡°¢7&3¢""À¢æÖS¢" ¢Ò“°¢FVF–ôæÖRçFW‡D6öçFVçBÒ.[Ù>X˜ŞûÉ®KÛşyJXh^{Úî(	ÎXúâŞY)®(	ŞhùzK®™û2#°¢Ú±î¸Â¸­yêë¢°k¢G§¦*^ui.toast("å·²æ¸…é™¤è‡ªå®šä¹‰éŸ³é¢‘");
    });
    // æµ‹è¯•æé†’
        const $btnTest = root$4.querySelector("#ykt-btn-test-notify");
    if ($btnTest) $btnTest.addEventListener("click", () => {
      const mockProblem = {
        problemId: "TEST-001",
        body: "ã€æµ‹è¯•é¢˜ã€‘è¿™æ˜¯ä¸€ä¸ªæµ‹è¯•æé†’",
        options: []
      };
      ui.notifyProblem(mockProblem, {
        thumbnail: null
      });
    });
    // å…³é—­æŒ‰é’®
        root$4.querySelector("#ykt-settings-close").addEventListener("click", () => showSettingsPanel(false));
    mounted$5 = true;
    return root$4;
  }
  function showSettingsPanel(visible = true) {
    mountSettingsPanel();
    const panel = document.getElementById("ykt-settings-panel");
    if (!panel) return;
    if (visible) syncMountedForm();
    panel.classList.toggle("visible", !!visible);
  }
  function toggleSettingsPanel() {
    mountSettingsPanel();
    const panel = document.getElementById("ykt-settings-panel");
    showSettingsPanel(!panel.classList.contains("visible"));
  }
  var tpl$4 = '<div id="ykt-ai-answer-panel" class="ykt-panel">\n  <div class="panel-header">\n    <h3><i class="fas fa-robot"></i> AI èåˆåˆ†æ</h3>\n    <span id="ykt-ai-close" class="close-btn" title="å…³é—­">\n      <i class="fas fa-times"></i>\n    </span>\n  </div>\n  <div class="panel-body">\n    <div style="margin-bottom: 10px;">\n      <strong>å½“å‰é¢˜ç›®ï¼š</strong>\n      <div style="font-size: 12px; color: #666; margin: 4px 0;">\n        ç³»ç»Ÿå°†è‡ªåŠ¨è¯†åˆ«å½“å‰é¡µé¢çš„é¢˜ç›®\n      </div>\n      <div id="ykt-ai-text-status" class="text-status warning">\n        æ­£åœ¨æ£€æµ‹é¢˜ç›®ä¿¡æ¯...\n      </div>\n      <div id="ykt-ai-question-display" class="ykt-question-display">\n        æç¤ºï¼šç³»ç»Ÿä½¿ç”¨èåˆæ¨¡å¼ï¼ŒåŒæ—¶åˆ†æé¢˜ç›®æ–‡æœ¬ä¿¡æ¯å’Œé¡µé¢å›¾åƒï¼Œæä¾›æœ€å‡†ç¡®çš„ç­”æ¡ˆã€‚\n      </div>\n    </div>\n    \x3c!-- å½“å‰è¦æé—®çš„PPTé¢„è§ˆ --\x3e\n    <div id="ykt-ai-selected" style="display:none; margin: 10px 0;">\n      <strong>å·²é€‰PPTé¢„è§ˆï¼š</strong>\n      <div style="font-size: 12px; color: #666; margin: 4px 0;">\n        ä¸‹æ–¹å°å›¾ä¸ºå³å°†ç”¨äºåˆ†æçš„PPTé¡µé¢æˆªå›¾\n      </div>\n      <div style="border: 1px solid var(--ykt-border-strong); padding: 6px; border-radius: 6px; display: inline-block;">\n        \x3c!-- å…¼å®¹æ—§å•é¡µï¼šä»ä¿ç•™è¯¥ img --\x3e\n        <img id="ykt-ai-selected-thumb"\n             alt="å·²é€‰PPTé¢„è§ˆ"\n             style="max-width: 180px; max-height: 120px; display:none;" />\n\n        \x3c!-- å¤šé¡µé¢„è§ˆå®¹å™¨ï¼šç”± ai.js åŠ¨æ€å¡«å…… --\x3e\n        <div id="ykt-ai-selected-thumbs"\n             style="display:flex; flex-wrap:wrap; gap:6px; max-width: 420px;">\n        </div>\n      </div>\n    </div>\n    <div style="margin-bottom: 10px;">\n      <strong>è‡ªå®šä¹‰æç¤ºï¼ˆå¯é€‰ï¼‰ï¼š</strong>\n      <div style="font-size: 12px; color: #666; margin: 4px 0;">\n        æç¤ºï¼šæ­¤å†…å®¹å°†è¿½åŠ åˆ°ç³»ç»Ÿç”Ÿæˆçš„promptåé¢ï¼Œå¯ç”¨äºè¡¥å……ç‰¹æ®Šè¦æ±‚æˆ–èƒŒæ™¯ä¿¡æ¯ã€‚\n      </div>\n      <textarea \n        id="ykt-ai-custom-prompt" \n        class="ykt-custom-prompt"\n        placeholder="ä¾‹å¦‚ï¼šè¯·ç”¨ä¸­æ–‡å›ç­”ã€æ³¨é‡è§£é¢˜æ€è·¯ã€è€ƒè™‘XXXçŸ¥è¯†ç‚¹ç­‰"\n      ></textarea>\n    </div>\n\n    <button id="ykt-ai-ask" style="width: 100%; height: 32px; border-radius: 6px; border: 1px solid var(--ykt-border-strong); background: #f7f8fa; cursor: pointer; margin-bottom: 10px;">\n      <i class="fas fa-brain"></i> èåˆæ¨¡å¼åˆ†æï¼ˆæ–‡æœ¬+å›¾åƒï¼‰\n    </button>\n    <button id="ykt-ai-force-answer" style="width: 100%; height: 32px; border-radius: 6px; border: 1px solid #d97706; background: #fff7ed; cursor: pointer; margin-bottom: 10px;">\n      <i class="fas fa-paper-plane"></i> é‡æ–°æ€è€ƒå¹¶æäº¤ç­”æ¡ˆ\n    </button>\n\n    <div id="ykt-ai-loading" class="ai-loading" style="display: none;">\n      <i class="fas fa-spinner fa-spin"></i> AIæ­£åœ¨ä½¿ç”¨èåˆæ¨¡å¼åˆ†æ...\n    </div>\n    <div id="ykt-ai-error" class="ai-error" style="display: none;"></div>\n    <div>\n      <strong>AI åˆ†æç»“æœï¼š</strong>\n      <div id="ykt-ai-answer" class="ai-answer"></div>\n    </div>\n    \x3c!-- å¯ç¼–è¾‘ç­”æ¡ˆåŒº --\x3e\n    <div id="ykt-ai-edit-section" style="display:none; margin-top:12px;">\n      <strong>æäº¤å‰å¯ç¼–è¾‘ç­”æ¡ˆï¼š</strong>\n      <div style="font-size: 12px; color: #666; margin: 4px 0;">\n        æç¤ºï¼šè¿™é‡Œæ˜¯å°†è¦æäº¤çš„â€œç»“æ„åŒ–ç­”æ¡ˆâ€ã€‚å¯ç›´æ¥ç¼–è¾‘ã€‚æ”¯æŒï¼š\n        <br>â€¢ é€‰æ‹©é¢˜/æŠ•ç¥¨ï¼šå¡«å†™ <code>["A"]</code> æˆ– <code>A,B</code>\n        <br>â€¢ å¡«ç©ºé¢˜ï¼šå¡«å†™ <code>[" 1"]</code> æˆ– ç›´æ¥å†™ <code> 1</code>ï¼ˆè‡ªåŠ¨åŒ…æˆæ•°ç»„ï¼‰\n        <br>â€¢ ä¸»è§‚é¢˜ï¼šå¯å¡« JSONï¼ˆå¦‚ <code>{"content":"ç•¥","pics":[]}</code>ï¼‰æˆ–ç›´æ¥è¾“å…¥æ–‡æœ¬\n      </div>\n      <textarea id="ykt-ai-answer-edit"\n        style="width:100%; min-height:88px; border:1px solid var(--ykt-border-strong); border-radius:6px; padding:6px; font-family:monospace;"></textarea>\n      <div id="ykt-ai-validate" style="font-size:12px; color:#666; margin-top:6px;"></div>\n      <div style="margin-top:8px; display:flex; gap:8px;">\n        <button id="ykt-ai-submit" class="ykt-btn ykt-btn-primary" style="flex:0 0 auto;">\n          æäº¤ç¼–è¾‘åçš„ç­”æ¡ˆ\n        </button>\n        <button id="ykt-ai-reset-edit" class="ykt-btn" style="flex:0 0 auto;">é‡ç½®ä¸º AI å»ºè®®</button>\n      </div>\n    </div>\n  </div>\n</div>\n';
  // src/ai/kimi.js
  // å°†åç«¯ problemType æ•°å­—æ˜ å°„ä¸º Step1/Step2 ä½¿ç”¨çš„ question_type å­—ç¬¦ä¸²
  // çº¦å®šï¼š
  // 1 -> single_choice   ï¼ˆå•é€‰ï¼‰
  // 2 -> multiple_choice ï¼ˆå¤šé€‰ï¼‰
  // 3 -> single_choice   ï¼ˆæŠ•ç¥¨é¢˜æŒ‰å•é€‰å¤„ç†ï¼‰
  // 4 -> fill_in         ï¼ˆå¡«ç©ºé¢˜ï¼‰
  // 5 -> subjective      ï¼ˆä¸»è§‚é¢˜ / ç®€ç­”é¢˜ï¼‰
    function mapProblemTypeToQuestionType(problemType) {
    if (problemType == null) return null;
    const n = Number(problemType);
    switch (n) {
     case 1:
      return "single_choice";

     case 2:
      return "multiple_choice";

     case 3:
      return "single_choice";

     case 4:
      return "fill_in";

     case 5:
      return "subjective";

     default:
      return null;
    }
  }
  function getActiveProfile(aiCfg) {
    const cfg = aiCfg || {};
    const profiles = Array.isArray(cfg.profiles) ? cfg.profiles : [];
    if (!profiles.length) {
      const legacyKey = cfg.kimiApiKey;
      if (!legacyKey) return null;
      return {
        id: "legacy",
        name: "Kimi Legacy",
        baseUrl: "https://api.moonshot.cn/v1/chat/completions",
        apiKey: legacyKey,
        model: "moonshot-v1-8k",
        visionModel: "moonshot-v1-8k-vision-preview"
      };
    }
    const activeId = cfg.activeProfileId;
    let p = profiles.find(p => p.id === activeId);
    if (!p) p = profiles[0];
    if (!p.baseUrl) p.baseUrl = "https://api.moonshot.cn/v1/chat/completions";
    return p;
  }
  function makeChatUrl(profile) {
    //   const base = (profile.baseUrl || 'https://api.moonshot.cn').replace(/\/+$/,'');
    //   return `${base}/v1/chat/completions`;   
    return profile.baseUrl;
  }
  function withProfileTemperature(profile, payload) {
    const {temperature: _legacyTemperature, ...requestPayload} = payload;
    const rawTemperature = profile?.temperature;
    if (rawTemperature === "" || rawTemperature === void 0 || rawTemperature === null) return requestPayload;
    const temperature = Number(rawTemperature);
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new Error("Temperature å¿…é¡»æ˜¯ 0 åˆ° 2 ä¹‹é—´çš„æ•°å­—ï¼Œæˆ–ç•™ç©ºä½¿ç”¨æ¨¡å‹é»˜è®¤å€¼");
    return {
      ...requestPayload,
      temperature: temperature
    };
  }
  // -----------------------------------------------
  // Unified Prompt blocks for Text & Vision
  // -----------------------------------------------
    const BASE_SYSTEM_PROMPT = [ "1) ä»»ä½•æ—¶å€™ä¼˜å…ˆéµå¾ªã€ç”¨æˆ·è¾“å…¥ï¼ˆä¼˜å…ˆçº§æœ€é«˜ï¼‰ã€‘ä¸­çš„æ˜ç¡®è¦æ±‚ï¼›", "2) å½“è¾“å…¥æ˜¯è¯¾ä»¶é¡µé¢ï¼ˆPPTï¼‰å›¾åƒæˆ–é¢˜å¹²æ–‡æœ¬æ—¶ï¼Œå…ˆåˆ¤æ–­æ˜¯å¦å­˜åœ¨â€œæ˜ç¡®é¢˜ç›®â€ï¼›", "3) è‹¥å­˜åœ¨æ˜ç¡®é¢˜ç›®ï¼Œåˆ™è¾“å‡ºä»¥ä¸‹æ ¼å¼çš„å†…å®¹ï¼š", "   å•é€‰ï¼šæ ¼å¼è¦æ±‚ï¼š\nç­”æ¡ˆ: [å•ä¸ªå­—æ¯]\nè§£é‡Š: [é€‰æ‹©ç†ç”±]\n\næ³¨æ„ï¼šåªé€‰ä¸€ä¸ªï¼Œå¦‚A", "   å¤šé€‰ï¼šæ ¼å¼è¦æ±‚ï¼š\nç­”æ¡ˆ: [å¤šä¸ªå­—æ¯ç”¨é¡¿å·åˆ†å¼€]\nè§£é‡Š: [é€‰æ‹©ç†ç”±]\n\næ³¨æ„ï¼šæ ¼å¼å¦‚Aã€Bã€C", "   æŠ•ç¥¨ï¼šæ ¼å¼è¦æ±‚ï¼š\nç­”æ¡ˆ: [å•ä¸ªå­—æ¯]\nè§£é‡Š: [é€‰æ‹©ç†ç”±]\n\næ³¨æ„ï¼šåªé€‰ä¸€ä¸ªé€‰é¡¹ï¼Œå¦‚A", "   å¡«ç©º/ä¸»è§‚é¢˜: æ ¼å¼è¦æ±‚ï¼šç­”æ¡ˆ: [ç›´æ¥ç»™å‡ºç­”æ¡ˆå†…å®¹]ï¼Œè§£é‡Š: [è¡¥å……è¯´æ˜]", "4) è‹¥è¯†åˆ«ä¸åˆ°æ˜ç¡®é¢˜ç›®ï¼Œç›´æ¥ä½¿ç”¨å›ç­”ç”¨æˆ·è¾“å…¥çš„é—®é¢˜", "3) å¦‚æœPROMPTæ ¼å¼ä¸æ­£ç¡®ï¼Œæˆ–è€…ä½ åªæ¥æ”¶äº†å›¾ç‰‡ï¼Œè¾“å‡ºï¼š", "   STATE: NO_PROMPT", "   SUMMARY: <ä»‹ç»é¡µé¢/ä¸Šä¸‹æ–‡çš„ä¸»è¦å†…å®¹>" ].join("\n");
  // Vision è¡¥å……ï¼šè¯†åˆ«é¢˜å‹ä¸ç‰ˆé¢å…ƒç´ çš„æ­¥éª¤è¯´æ˜
    const VISION_GUIDE = [ "ã€è§†è§‰è¯†åˆ«è¦æ±‚ã€‘", "A. å…ˆåˆ¤æ–­æ˜¯å¦ä¸ºé¢˜ç›®é¡µé¢ï¼ˆæ˜¯å¦æœ‰é¢˜å¹²/é€‰é¡¹/ç©ºæ ¼/é—®å¥ç­‰ï¼‰", "B. è‹¥æ˜¯é¢˜ç›®ï¼Œå°è¯•æå–é¢˜å¹²ã€é€‰é¡¹ä¸å…³é”®ä¿¡æ¯ï¼›", "C. å¦åˆ™å‚è€ƒç”¨æˆ·è¾“å…¥å›ç­”" ].join("\n");
  // é€šç”¨ OpenAI åè®®èŠå¤©è¯·æ±‚å°è£…ï¼ˆç”¨äº Vision ä¸¤æ­¥è°ƒç”¨ï¼‰
    function chatCompletion(profile, payload, debugLabel = "[AI OpenAI]", timeoutMs = 6e4) {
    const url = makeChatUrl(profile);
    return new Promise((resolve, reject) => {
      gm.xhr({
        method: "POST",
        url: url,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${profile.apiKey}`
        },
        data: JSON.stringify(withProfileTemperature(profile, payload)),
        timeout: timeoutMs,
        onload: res => {
          try {
            console.log(`[é›¨è¯¾å ‚åŠ©æ‰‹]${debugLabel} Status:`, res.status);
            console.log(`[é›¨è¯¾å ‚åŠ©æ‰‹]${debugLabel} Response:`, res.responseText);
            if (res.status !== 200) {
              let errorMessage = `AI è¯·æ±‚å¤±è´¥: ${res.status}`;
              try {
                const errorData = JSON.parse(res.responseText);
                if (errorData.error?.message) errorMessage += ` - ${errorData.error.message}`;
                if (errorData.error?.code) errorMessage += ` (${errorData.error.code})`;
              } catch {
                errorMessage += ` - ${res.responseText}`;
              }
              reject(new Error(errorMessage));
              return;
            }
            const data = JSON.parse(res.responseText);
            resolve(data);
          } catch (e) {
            console.error(`[é›¨è¯¾å ‚åŠ©æ‰‹]${debugLabel} è§£æå“åº”å¤±è´¥:`, e);
            reject(new Error(`è§£æAPIå“åº”å¤±è´¥: ${e.message}`));
          }
        },
        onerror: err => {
          console.error(`[é›¨è¯¾å ‚åŠ©æ‰‹]${debugLabel} ç½‘ç»œè¯·æ±‚å¤±è´¥:`, err);
          reject(new Error("ç½‘ç»œè¯·æ±‚å¤±è´¥"));
        }
      });
    });
  }
  async function singleStepVisionCall(profile, cleanBase64List, textPrompt, options = {}) {
    const visionModel = profile.visionModel || profile.model;
    const timeoutMs = options.timeout || 6e4;
    const visionTextHeader = [ "ã€èåˆæ¨¡å¼è¯´æ˜ã€‘ä½ å°†çœ‹åˆ°ä¸€å¼ è¯¾ä»¶/PPTæˆªå›¾ä¸å¯é€‰çš„é™„åŠ æ–‡æœ¬ã€‚", VISION_GUIDE ].join("\n");
    const imageBlocks = [];
    for (const b64 of cleanBase64List) imageBlocks.push({
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${b64}`
      }
    });
    const messages = [ {
      role: "system",
      content: BASE_SYSTEM_PROMPT
    }, {
      role: "user",
      content: [ ...imageBlocks, {
        type: "text",
        text: [ visionTextHeader, "ã€ç”¨æˆ·è¾“å…¥ï¼ˆä¼˜å…ˆçº§æœ€é«˜ï¼‰ã€‘", textPrompt || "ï¼ˆæ— ï¼‰" ].join("\n")
      } ]
    } ];
    const data = await chatCompletion(profile, {
      model: visionModel,
      messages: messages
    }, "[AI OpenAI Vision å•æ­¥]", timeoutMs);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("AIè¿”å›å†…å®¹ä¸ºç©º");
    console.log("[AI OpenAI Vision] æˆåŠŸè·å–å›ç­”(å•æ­¥)");
    return content;
  }
  /**
   * é€šç”¨ OpenAI åè®® Vision æ¨¡å‹ï¼ˆå›¾åƒ+æ–‡æœ¬ï¼‰
   */  async function queryAIVision(imageBase64, textPrompt, aiCfg, options = {}) {
    const profile = getActiveProfile(aiCfg);
    if (!profile || !profile.apiKey) throw new Error("è¯·å…ˆåœ¨è®¾ç½®ä¸­é…ç½® AI API Key");
    // ===== å…¼å®¹å•å›¾ / å¤šå›¾ =====
        const inputList = Array.isArray(imageBase64) ? imageBase64 : [ imageBase64 ];
    const cleanBase64List = inputList.filter(Boolean).map(x => String(x).replace(/^data:image\/[^;]+;base64,/, "")).filter(x => !!x);
    if (cleanBase64List.length === 0) throw new Error("å›¾åƒæ•°æ®æ ¼å¼é”™è¯¯");
    const visionModel = profile.visionModel || profile.model;
    const textModel = profile.model;
    const hasSeparateTextModel = !!textModel && textModel !== visionModel;
    const {disableTwoStep: disableTwoStep = false, twoStepDebug: twoStepDebug = false, timeout: timeoutMs = 6e4, problemType: problemType = null} = options || {};
    // -------- 0. å¦‚æœåªæœ‰ VLMï¼ˆæˆ–è€…æ˜¾å¼å…³é—­ä¸¤æ­¥ï¼‰ï¼Œå›é€€åˆ°å•æ­¥é€»è¾‘ --------
        if (!hasSeparateTextModel || disableTwoStep) {
      if (twoStepDebug) console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][INFO][vision] use single-step vision", {
        hasSeparateTextModel: hasSeparateTextModel,
        disableTwoStep: disableTwoStep
      });
      return singleStepVisionCall(profile, cleanBase64List, textPrompt, {
        timeout: timeoutMs
      });
    }
    if (twoStepDebug) console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][INFO][vision] use TWO-STEP pipeline", {
      visionModel: visionModel,
      textModel: textModel
    });
    // ===================== Step 1: Vision æŠ½ç»“æ„åŒ–é¢˜ç›® =====================
        const STEP1_SYSTEM_PROMPT = `\nä½ æ˜¯ä¸€ä¸ªâ€œé¢˜ç›®ç»“æ„åŒ–åŠ©æ‰‹â€ã€‚ä½ å°†çœ‹åˆ°è¯¾ä»¶æˆªå›¾å’Œå¯é€‰çš„é™„åŠ æ–‡æœ¬ï¼Œè¯·ä»ä¸­æå–å‡ºæ¸…æ™°çš„é¢˜ç›®ç»“æ„ï¼Œå¹¶ä»¥ JSON æ ¼å¼è¾“å‡ºã€‚\n\nä½ ä¸ä»…è¦è¯†åˆ«æ–‡å­—ï¼ˆç±»ä¼¼ OCRï¼‰ï¼Œè¿˜è¦ç†è§£å›¾ç‰‡é‡Œçš„å†…å®¹ï¼ˆä¾‹å¦‚ç‰©ä½“ã€é¢œè‰²ã€å½¢çŠ¶ã€æ•°é‡ã€ç›¸å¯¹ä½ç½®ç­‰ï¼‰ï¼Œå¹¶æŠŠè¿™äº›ä¸é¢˜ç›®æœ‰å…³çš„ä¿¡æ¯è½¬åŒ–ä¸ºé¢˜å¹²æˆ–è¡¥å……è¯´æ˜çš„ä¸€éƒ¨åˆ†ã€‚\n\nã€é¢˜å‹è¯†åˆ«ä¼˜å…ˆçº§ã€‘\n1. å¦‚æœé¡µé¢ä¸Šå‡ºç°äº†æ˜ç¡®çš„é¢˜å‹æ ‡ç­¾æ–‡å­—ï¼Œå¦‚ï¼š\n   - "å•é€‰é¢˜"ã€"å¤šé€‰é¢˜"ã€"æŠ•ç¥¨é¢˜"ã€"å¡«ç©ºé¢˜"ã€"ä¸»è§‚é¢˜" ç­‰ï¼Œ\n   è¯·ä¼˜å…ˆæ ¹æ®è¿™äº›æ ‡ç­¾è®¾ç½® question_typeï¼š\n   - å•é€‰é¢˜ / æŠ•ç¥¨é¢˜ -> "single_choice"\n   - å¤šé€‰é¢˜         -> "multiple_choice"\n   - å¡«ç©ºé¢˜         -> "fill_in"\n   - ä¸»è§‚é¢˜ / ç®€ç­”é¢˜ / è®ºè¿°é¢˜ -> "subjective"\n2. å½“æ²¡æœ‰æ˜æ˜¾é¢˜å‹æ ‡ç­¾æ—¶ï¼Œå†æ ¹æ®é¢˜å¹²è¯­ä¹‰å’Œç‰ˆé¢ç»“æ„æ¨æ–­é¢˜å‹ã€‚\n\nã€é€‰é¡¹å­—æ¯è§„åˆ™ã€‘\n- åªæœ‰åœ¨é¡µé¢ä¸Šå‡ºç°äº†æ¸…æ™°çš„é€‰é¡¹å­—æ¯ï¼ˆé€šå¸¸ä¸º "A."ã€"B."ã€"C."ã€"D." ç­‰ï¼‰å¹¶è·Ÿéšé€‰é¡¹å†…å®¹æ—¶ï¼Œæ‰èƒ½å°† question_type è®¾ä¸º "single_choice" æˆ– "multiple_choice"ï¼ˆæˆ–æŠ•ç¥¨é¢˜å¯¹åº”çš„ "single_choice"ï¼‰ã€‚\n- å¦‚æœæ²¡æœ‰ä»»ä½• A/B/C/D è¿™ç§é€‰é¡¹å­—æ¯ï¼Œè€Œé—®é¢˜åˆéœ€è¦å¼€æ”¾æ€§è‡ªç”±å›ç­”ï¼Œè¯·ä¼˜å…ˆå°† question_type è®¾ä¸º "subjective"ã€‚\n\nè¯·å°½é‡è¯†åˆ«ï¼š\n- question_type: "single_choice" | "multiple_choice" | "fill_in" | "subjective" | "visual_only" | "unknown"\n- stem: é¢˜å¹²æ–‡æœ¬ï¼ˆå¦‚æœé¢˜å¹²ä¸»è¦ä¾èµ–å›¾ç‰‡ï¼Œè¯·ç”¨è‡ªç„¶è¯­è¨€æè¿°å›¾ç‰‡ä¸­ä¸é¢˜ç›®ç›¸å…³çš„å†…å®¹ï¼Œå¯ä¿ç•™æ•°å­¦å…¬å¼ä¿¡æ¯ï¼‰\n- options: ä¸€ä¸ªå¯¹è±¡ï¼Œé”®ä¸º "A"ã€"B"ã€"C"ã€"D" ç­‰ï¼Œå€¼ä¸ºé€‰é¡¹å†…å®¹æ–‡å­—ï¼ˆè‹¥ä¸æ˜¯é€‰æ‹©é¢˜å¯ä¸ºç©ºå¯¹è±¡ï¼‰\n- image_facts: ï¼ˆå¯é€‰ï¼‰ä¸€ä¸ªå­—ç¬¦ä¸²æ•°ç»„ï¼Œåˆ—å‡ºä¸è§£é¢˜æœ‰å…³çš„å…³é”®å›¾åƒäº‹å®ï¼Œä¾‹å¦‚ ["å›¾ä¸­æ˜¯ä¸€æ ¹é»„è‰²çš„é¦™è•‰", "èƒŒæ™¯æ˜¯ç™½è‰²"]ã€‚\n- requires_image_for_solution: å¸ƒå°”å€¼ã€‚å¦‚æœå³ä½¿ä½ å°½åŠ›ç”¨æ–‡å­—æè¿°å›¾ç‰‡ï¼Œä»ç„¶å¾ˆéš¾ä»…å‡­æ–‡å­—ä¿è¯ç­”å¯¹ï¼ˆä¾‹å¦‚å¤æ‚å‡ ä½•å›¾å½¢æˆ–é«˜åº¦ä¾èµ–ç²¾ç¡®ä½ç½®å…³ç³»çš„é¢˜ç›®ï¼‰ï¼Œè¯·è®¾ä¸º trueï¼›å¦‚æœä½ çš„æ–‡å­—æè¿°å·²ç»è¶³å¤Ÿè®©äººç±»æˆ–æ–‡å­—æ¨¡å‹è§£é¢˜ï¼Œè¯·è®¾ä¸º falseã€‚\n\nè¾“å‡ºç¤ºä¾‹ï¼ˆä»…ç¤ºä¾‹ï¼Œä¸æ˜¯å›ºå®šæ¨¡æ¿ï¼‰ï¼š\n{\n  "question_type": "single_choice",\n  "stem": "æ ¹æ®å›¾ç‰‡ä¸­çš„æ°´æœï¼Œé€‰æ‹©å®ƒçš„é¢œè‰²ã€‚",\n  "options": {\n    "A": "çº¢è‰²",\n    "B": "é»„è‰²",\n    "C": "è“è‰²",\n    "D": "ç»¿è‰²"\n  },\n  "image_facts": [\n    "å›¾ç‰‡ä¸­æ˜¯ä¸€æ ¹é»„è‰²çš„é¦™è•‰ï¼ŒèƒŒæ™¯ä¸ºç™½è‰²"\n  ],\n  "requires_image_for_solution": false\n}\n\nå¦‚æœæ— æ³•è¯†åˆ«é¢˜ç›®æˆ–æˆªå›¾å¹¶éé¢˜ç›®ï¼Œè¯·å°½é‡ç»™å‡ºä½ èƒ½çœ‹åˆ°çš„å†…å®¹ï¼Œä½†ä»ç„¶ä¿æŒä¸Šè¿° JSON ç»“æ„ï¼ˆå­—æ®µç¼ºçœæ—¶å¯ä»¥ç”¨ nullã€ç©ºå¯¹è±¡æˆ–ç©ºæ•°ç»„ï¼‰ã€‚\nä»…è¾“å‡º JSONï¼Œä¸è¦ä»»ä½•é¢å¤–æ–‡å­—ã€‚\n`.trim();
    const step1Messages = [ {
      role: "system",
      content: STEP1_SYSTEM_PROMPT
    }, {
      role: "user",
      content: [ ...cleanBase64List.map(b64 => ({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${b64}`
        }
      })), textPrompt ? {
        type: "text",
        text: `ã€è¾…åŠ©æ–‡æœ¬ã€‘\n${textPrompt}`
      } : {
        type: "text",
        text: "ã€è¾…åŠ©æ–‡æœ¬ã€‘ï¼ˆæ— é¢å¤–æ–‡æœ¬ï¼Œä»…æ ¹æ®æˆªå›¾è¯†åˆ«é¢˜ç›®ï¼‰"
      } ]
    } ];
    let structuredQuestion;
    try {
      const data1 = await chatCompletion(profile, {
        model: visionModel,
        messages: step1Messages
      }, "[AI OpenAI Vision Step1]", timeoutMs);
      const content1 = data1.choices?.[0]?.message?.content || "";
      if (twoStepDebug) console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DEBUG][vision-step1] raw content:", content1);
      const jsonMatch = content1.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("no JSON found in step1 result");
      structuredQuestion = JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.warn("[é›¨è¯¾å ‚åŠ©æ‰‹][WARN][vision-step1] failed, fallback to single-step", err);
      return singleStepVisionCall(profile, cleanBase64List, textPrompt, {
        timeout: timeoutMs
      });
    }
    if (!structuredQuestion || !structuredQuestion.stem) {
      console.warn("[é›¨è¯¾å ‚åŠ©æ‰‹][WARN][vision-step1] invalid structuredQuestion, fallback");
      return singleStepVisionCall(profile, cleanBase64List, textPrompt, {
        timeout: timeoutMs
      });
    }
    if (twoStepDebug) console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][INFO][vision-step1] structuredQuestion:", structuredQuestion);
    // ========= é¢˜å‹åˆå¹¶é€»è¾‘ï¼šåç«¯ problemType ä¼˜å…ˆï¼Œå…¶æ¬¡ VLM æ¨æ–­ï¼Œå…¨éƒ¨ç¼ºå¤±åˆ™å›é€€ subjective =========
        const backendQuestionType = mapProblemTypeToQuestionType(problemType);
    const vlmQuestionType = structuredQuestion.question_type || null;
    let finalQuestionType = backendQuestionType || vlmQuestionType || null;
    // å¦‚æœ VLM è¿”å›çš„æ˜¯ unknown / visual_only è¿™ç±»ä¸å¤ªå¯ç”¨çš„ç±»å‹ï¼Œä¹Ÿå½“æˆâ€œç¼ºå¤±â€
        if (finalQuestionType === "unknown" || finalQuestionType === "visual_only") finalQuestionType = null;
    // å½“åç«¯å’Œ VLM éƒ½æ²¡æœ‰ç»™å‡ºå¯ç”¨é¢˜å‹æ—¶ï¼Œç»Ÿä¸€å›é€€ä¸ºä¸»è§‚é¢˜
        if (!finalQuestionType) finalQuestionType = "subjective";
    if (twoStepDebug) console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][INFO][vision-step1] questionType merged:", {
      problemType: problemType,
      backendQuestionType: backendQuestionType,
      vlmQuestionType: vlmQuestionType,
      finalQuestionType: finalQuestionType
    });
    // å¦‚æœæ¨¡å‹æ˜ç¡®è¡¨ç¤ºâ€œå¿…é¡»ä¾èµ–åŸå§‹å›¾åƒæ‰èƒ½è§£é¢˜â€ï¼Œåˆ™å›é€€åˆ°å•æ­¥ Visionï¼Œé¿å…çº¯æ–‡æœ¬æ¨ç†ä¸¢å¤±å…³é”®ä¿¡æ¯
        if (structuredQuestion.requires_image_for_solution === true) {
      console.warn("[é›¨è¯¾å ‚åŠ©æ‰‹][INFO][vision] step1 says image is essential, fallback to single-step");
      return singleStepVisionCall(profile, cleanBase64List, textPrompt, {
        timeout: timeoutMs
      });
    }
    // ===================== Step 2: Text æ¨¡å‹çº¯æ–‡æœ¬æ¨ç†è§£é¢˜ =====================
        const {question_type: question_type, stem: stem, options: sqOptions = {}, image_facts: image_facts = []} = structuredQuestion;
    let solvePrompt = "ä½ æ˜¯ä¸€ä¸ªä¸¥è°¨çš„è§£é¢˜åŠ©æ‰‹ï¼Œè¯·æ ¹æ®ä¸‹é¢çš„é¢˜ç›®è¿›è¡Œæ¨ç†è§£ç­”ï¼š\n\n";
    solvePrompt += `ã€é¢˜å¹²ã€‘\n${stem}\n\n`;
    const optionKeys = Object.keys(sqOptions);
    if (optionKeys.length > 0) {
      solvePrompt += "ã€é€‰é¡¹ã€‘\n";
      for (const key of optionKeys) solvePrompt += `${key}. ${sqOptions[key]}\n`;
      solvePrompt += "\n";
    }
    solvePrompt += "è¯·é€æ­¥æ¨ç†ï¼Œæ¨ç†ç»“æœæŒ‰ä»¥ä¸‹æ ¼å¼è¾“å‡ºï¼š\n";
    if (finalQuestionType === "single_choice") solvePrompt += "ç­”æ¡ˆ: [å•ä¸ªå¤§å†™å­—æ¯]\nè§£é‡Š: [ç®€è¦è¯´æ˜ä½ çš„æ¨ç†è¿‡ç¨‹]\n"; else if (finalQuestionType === "multiple_choice") solvePrompt += "ç­”æ¡ˆ: [å¤šä¸ªå¤§å†™å­—æ¯ï¼Œç”¨é¡¿å·åˆ†éš”ï¼Œå¦‚ Aã€Cã€D]\nè§£é‡Š: [ç®€è¦è¯´æ˜ä½ çš„æ¨ç†è¿‡ç¨‹]\n"; else if (finalQuestionType === "fill_in") solvePrompt += "ç­”æ¡ˆ: [ç›´æ¥ç»™å‡ºéœ€è¦å¡«å…¥çš„å†…å®¹ï¼Œå¤šä¸ªç©ºç”¨é€—å·åˆ†éš”]\nè§£é‡Š: [ç®€è¦è¯´æ˜ä½ çš„æ¨ç†è¿‡ç¨‹]\n"; else if (finalQuestionType === "subjective") solvePrompt += "ç­”æ¡ˆ: [å®Œæ•´å›ç­”]\nè§£é‡Š: [å¯é€‰çš„è¡¥å……è¯´æ˜]\n";
    // å°†å›¾åƒå…³é”®ä¿¡æ¯ä¸€å¹¶æä¾›ç»™æ–‡æœ¬æ¨¡å‹ï¼Œç”¨äºå¼¥è¡¥å®Œå…¨æ— å›¾åƒè¾“å…¥çš„åŠ£åŠ¿
        if (Array.isArray(image_facts) && image_facts.length > 0) {
      solvePrompt += "ã€å›¾åƒå…³é”®ä¿¡æ¯ã€‘\n";
      for (const fact of image_facts) if (typeof fact === "string" && fact.trim()) solvePrompt += `- ${fact.trim()}\n`;
      solvePrompt += "\n";
    }
    const step2Messages = [ {
      role: "system",
      content: "ä½ æ˜¯ä¸€ä¸ªè§£é¢˜åŠ©æ‰‹ï¼Œè¯·ä¸¥æ ¼æŒ‰ç…§ç”¨æˆ·æŒ‡å®šçš„è¾“å‡ºæ ¼å¼ä½œç­”ï¼Œå°½é‡ä¿è¯ç­”æ¡ˆæ­£ç¡®ã€‚"
    }, {
      role: "user",
      content: [ {
        type: "text",
        text: solvePrompt
      } ]
    } ];
    try {
      const data2 = await chatCompletion(profile, {
        model: textModel,
        messages: step2Messages
      }, "[AI OpenAI Vision Step2]", timeoutMs);
      const content2 = data2.choices?.[0]?.message?.content || "";
      if (!content2) throw new Error("AIè¿”å›å†…å®¹ä¸ºç©º");
      if (twoStepDebug) console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][INFO][vision-step2] final content:", content2);
      return content2;
    } catch (err) {
      console.warn("[é›¨è¯¾å ‚åŠ©æ‰‹][WARN][vision-step2] failed, fallback to single-step", err);
      return singleStepVisionCall(profile, cleanBase64List, textPrompt, {
        timeout: timeoutMs
      });
    }
  }
  async function queryOCRVision(imageBase64, aiCfg) {
    const cfg = aiCfg || {};
    const baseProfile = getActiveProfile(cfg);
    const resolvedApiKey = (cfg.ocrApiKey || "").trim() || baseProfile?.apiKey || "";
    if (!baseProfile || !resolvedApiKey) throw new Error("è¯·å…ˆåœ¨è®¾ç½®ä¸­å¡«å†™å¯ç”¨çš„ OCR API Key æˆ– AI API Key");
    const profile = {
      ...baseProfile,
      baseUrl: (cfg.ocrApi || "").trim() || baseProfile.baseUrl,
      apiKey: resolvedApiKey
    };
    const cleanBase64 = String(imageBase64 || "").replace(/^data:image\/[^;]+;base64,/, "").trim();
    if (!cleanBase64) throw new Error("OCR å›¾ç‰‡å†…å®¹ä¸ºç©º");
    const data = await chatCompletion(profile, {
      model: profile.visionModel || profile.model,
      messages: [ {
        role: "system",
        content: [ "ä½ æ˜¯ä¸€ä¸ª OCR åŠ©æ‰‹ã€‚", "åªæå–å›¾ç‰‡ä¸­å¯è§çš„æ–‡å­—å†…å®¹ï¼Œä¸è¦è§£é¢˜ï¼Œä¸è¦æ€»ç»“ï¼Œä¸è¦è¡¥å……è¯´æ˜ã€‚", "å°½é‡ä¿ç•™åŸæœ‰æ®µè½ã€æ ‡é¢˜ã€åˆ—è¡¨å’Œæ¢è¡Œã€‚", "å¦‚æœå›¾ç‰‡é‡Œæ²¡æœ‰å¯è¯†åˆ«æ–‡å­—ï¼Œåªè¿”å›â€œæœªè¯†åˆ«åˆ°æ–‡å­—â€ã€‚" ].join("\n")
      }, {
        role: "user",
        content: [ {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${cleanBase64}`
          }
        }, {
          type: "text",
          text: "è¯·ç›´æ¥è¾“å‡ºå›¾ç‰‡ä¸­çš„å…¨éƒ¨æ–‡å­—ï¼Œä¿æŒç»“æœå¯å¤åˆ¶ã€‚"
        } ]
      } ]
    }, "[AI OCR Vision]", 6e4);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OCR æ¥å£æœªè¿”å›æ–‡æœ¬å†…å®¹");
    return String(content).trim();
  }
  async function queryTranslationText(text, targetLanguage, aiCfg) {
    const cfg = aiCfg || {};
    const baseProfile = getActiveProfile(cfg);
    const resolvedApiKey = (cfg.translateApiKey || "").trim() || baseProfile?.apiKey || "";
    if (!baseProfile || !resolvedApiKey) throw new Error("è¯·å…ˆåœ¨è®¾ç½®ä¸­å¡«å†™å¯ç”¨çš„ç¿»è¯‘ API Key æˆ– AI API Key");
    const resolvedTargetLanguage = String(targetLanguage).trim();
    if (!resolvedTargetLanguage) throw new Error("ç¿»è¯‘ç›®æ ‡è¯­è¨€ä¸èƒ½ä¸ºç©º");
    const sourceText = String(text || "").trim();
    if (!sourceText) throw new Error("æ²¡æœ‰å¯ç¿»è¯‘çš„æ–‡å­—å†…å®¹");
    const profile = {
      ...baseProfile,
      baseUrl: (cfg.translateApi || "").trim() || baseProfile.baseUrl,
      apiKey: resolvedApiKey,
      model: (cfg.translateModel || "").trim() || baseProfile.model
    };
    const data = await chatCompletion(profile, {
      model: profile.model,
      messages: [ {
        role: "system",
        content: [ "ä½ æ˜¯ä¸€ä¸ªä¸“ä¸šç¿»è¯‘åŠ©æ‰‹ã€‚", "åªæ‰§è¡Œç¿»è¯‘ï¼Œä¸è¦è§£é‡Šï¼Œä¸è¦æ€»ç»“ï¼Œä¸è¦è¡¥å……ã€‚", "å°½é‡ä¿ç•™åŸæ–‡æ®µè½ã€åˆ—è¡¨ã€ç¼–å·ã€å…¬å¼å’Œä¸“æœ‰åè¯æ ¼å¼ã€‚", `å°†ç”¨æˆ·æä¾›çš„æ–‡æœ¬ç¿»è¯‘ä¸ºï¼š${resolvedTargetLanguage}ã€‚` ].join("\n")
      }, {
        role: "user",
        content: [ {
          type: "text",
          text: sourceText
        } ]
      } ]
    }, "[AI Translate]", 6e4);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("ç¿»è¯‘æ¥å£æœªè¿”å›æ–‡æœ¬å†…å®¹");
    return String(content).trim();
  }
  // src/capture/screenshot.js
    async function captureProblemScreenshot() {
    try {
      const html2canvas = await ensureHtml2Canvas();
      const el = document.querySelector(".ques-title") || document.querySelector(".problem-body") || document.querySelector(".ppt-inner") || document.querySelector(".ppt-courseware-inner") || document.body;
      return await html2canvas(el, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        scale: 1,
        width: Math.min(el.scrollWidth, 1200),
        height: Math.min(el.scrollHeight, 800)
      });
    } catch (e) {
      console.error("[captureProblemScreenshot] failed", e);
      return null;
    }
  }
  /**
   * è·å–æŒ‡å®šå¹»ç¯ç‰‡çš„æˆªå›¾
   * @param {string} slideId - å¹»ç¯ç‰‡ID
   * @returns {Promise<string|null>} base64å›¾ç‰‡æ•°æ®
   */  async function captureSlideImage(slideId) {
    try {
      console.log("[captureSlideImage] è·å–å¹»ç¯ç‰‡å›¾ç‰‡:", slideId);
      const slide = repo.slides.get(slideId);
      if (!slide) {
        console.error("[captureSlideImage] æ‰¾ä¸åˆ°å¹»ç¯ç‰‡:", slideId);
        return null;
      }
      // ä½¿ç”¨ cover æˆ– coverAlt å›¾ç‰‡URL
            const imageUrl = slide.coverAlt || slide.cover || slide.image || slide.thumbnail;
      if (!imageUrl) {
        console.error("[captureSlideImage] å¹»ç¯ç‰‡æ²¡æœ‰å›¾çm«ëŒ+Š×®º+º$zzb¥è˜uU$Â"“°¢&WGW&âçVÆÃ°¢Ğ¢6öç6öÆRæÆör‚%¶6GW&U6Æ–FT–ÖvUÒY»îx˜uU$Ã¢"Â–ÖvUW&Â“°¢òòKˆ¾‹ÛŞY»îx˜~[›n‹ÚÎhÚ.K‹¦&6Sc@¢6öç7B&6ScBÒv—BF÷væÆöD–ÖvT4&6ScB†–ÖvUW&Â“°¢–b‚&6ScB’°¢6öç6öÆRæW'&÷"‚%¶6GW&U6Æ–FT–ÖvUÒKˆ¾‹ÛŞY»îx˜~ZK‹JR"“°¢&WGW&âçVÆÃ°¢Ğ¢6öç6öÆRæÆör‚%¶6GW&U6Æ–FT–ÖvUÒ)ÈRh‰X©şˆë~XùnY»îx˜rÂZJ~[ó¢"ÂÖF‚ç&÷VæB†&6ScBæÆVæwF‚ò#B’Â$´""“°¢&WGW&â&6ScC°¢Ò6F6‚†R’°¢6öç6öÆRæW'&÷"‚%¶6GW&U6Æ–FT–ÖvUÒZK‹JS¢"ÂR“°¢&WGW&âçVÆÃ°¢Ğ¢Ğ¢ò¢ ¢¢Kˆ¾‹ÛŞY»îx˜~[›n‹ÚÎhÚ.K‹¦&6Sc@¢¢&Ò·7G&–æwÒW&ÂÒY»îx˜uU$À¢¢&WGW&ç2µ&öÖ—6SÇ7G&–æwÆçVÆÃçĞ¢¢ò7–æ2gVæ7F–öâF÷væÆöD–ÖvT4&6ScB‡W&Â’°¢&WGW&âæWr&öÖ—6R‡&W6öÇfRÓâ°¢G'’°¢6öç7B–ÖrÒæWr–ÖvS°¢–Öræ7&÷74÷&–v–âÒ&æöç–Ö÷W2#°¢–ÖræöæÆöBÒ‚’Óâ°¢G'’°¢6öç7B6çf2ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&6çf2"“°¢6çf2çv–GF‚Ò–Örçv–GFƒ°¢6çf2æ†V–v‡BÒ–Öræ†V–v‡C°¢6öç7B7G‚Ò6çf2ævWD6öçFW‡B‚#&B"“°¢7G‚æG&t–ÖvR†–ÖrÂÂ“°¢6öç7B&6ScBÒ6çf2çFôFFU$Â‚&–ÖvRö§Vr"Âã‚’ç7Æ—B‚"Â"•³Ó°¢–b†&6ScBæÆVæwF‚âSb’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ¶F÷væÆöD–ÖvT4&6ScEÒY»îx˜~‹ø~ZJ~ûÈÎ‹ù¾ŠÎXè¾{Ê’âââ"“°¢6öç7B6ö×&W76VBÒ6çf2çFôFFU$Â‚&–ÖvRö§Vr"ÂãR’ç7Æ—B‚"Â"•³Ó°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ¶F÷væÆöD–ÖvT4&6ScEÒXè¾{ÊYîZJ~[ó¢"ÂÖF‚ç&÷VæB†6ö×&W76VBæÆVæwF‚ò#B’Â$´""“°¢&W6öÇfR†6ö×&W76VB“°¢ÒVÇ6R&W6öÇfR†&6ScB“°¢Ò6F6‚†R’°¢6öç6öÆRæW'&÷"‚%¾™ºŠûîZ.Xªh˜µÕ´U%%Õ¶F÷væÆöD–ÖvT4&6ScEÒ6çf>ZHNynZK‹JS¢"ÂR“°¢&W6öÇfR†çVÆÂ“°¢Ğ¢Ó°¢–ÖræöæW'&÷"ÒRÓâ°¢6öç6öÆRæW'&÷"‚%¾™ºŠûîZ.Xªh˜µÕ´U%%Õ¶F÷væÆöD–ÖvT4&6ScEÒY»îx˜~Xª‹ÛŞZK‹JS¢"ÂR“°¢&W6öÇfR†çVÆÂ“°¢Ó°¢–Örç7&2ÒW&Ã°¢Ò6F6‚†R’°¢6öç6öÆRæW'&÷"‚%¾™ºŠûîZ.Xªh˜µÕ´U%%Õ¶F÷væÆöD–ÖvT4&6ScEÒZK‹JS¢"ÂR“°¢&W6öÇfR†çVÆÂ“°¢Ğ¢Ò“°¢Ğ¢òòXéşiÈy¨B6GW&U&ö&ÆVÔf÷%f—6–öà¢7–æ2gVæ7F–öâ6GW&U&ö&ÆVÔf÷%f—6–öâ‚’°¢G'’°¢6öç6öÆRæÆör‚%¶6GW&U&ö&ÆVÔf÷%f—6–öåÒ[ÈZx¾hŠ®Y»ââââ"“°¢6öç7B6çf2Òv—B6GW&U&ö&ÆVÕ67&VVç6†÷B‚“°¢–b‚6çf2’°¢6öç6öÆRæW'&÷"‚%¶6GW&U&ö&ÆVÔf÷%f—6–öåÒhŠ®Y»îZK‹JR"“°¢&WGW&âçVÆÃ°¢Ğ¢6öç6öÆRæÆör‚%¶6GW&U&ö&ÆVÔf÷%f—6–öåÒhŠ®Y»îh‰X©şûÈÎ‹ÚÎhÚ.K‹¦&6ScBâââ"“°¢6öç7B&6ScBÒ6çf2çFôFFU$Â‚&–ÖvRö§Vr"Âã‚’ç7Æ—B‚"Â"•³Ó°¢6öç6öÆRæÆör‚%¶6GW&U&ö&ÆVÔf÷%f—6–öåÒ&6ScB™[ş[ªc¢"Â&6ScBæÆVæwF‚“°¢–b†&6ScBæÆVæwF‚âSb’°¢6öç6öÆRæÆör‚%¶6GW&U&ö&ÆVÔf÷%f—6–öåÒY»îx˜~‹ø~ZJ~ûÈÎ‹ù¾ŠÎXè¾{Ê’âââ"“°¢6öç7B6ÖÆÆW$&6ScBÒ6çf2çFôFFU$Â‚&–ÖvRö§Vr"ÂãR’ç7Æ—B‚"Â"•³Ó°¢6öç6öÆRæÆör‚%¶6GW&U&ö&ÆVÔf÷%f—6–öåÒXè¾{ÊYî™[ş[ªc¢"Â6ÖÆÆW$&6ScBæÆVæwF‚“°¢&WGW&â6ÖÆÆW$&6ScC°¢Ğ¢&WGW&â&6ScC°¢Ò6F6‚†R’°¢6öç6öÆRæW'&÷"‚%¶6GW&U&ö&ÆVÔf÷%f—6–öåÒf–ÆVB"ÂR“°¢&WGW&âçVÆÃ°¢Ğ¢Ğ¢gVæ7F–öâ6ÆVå&ö&ÆVÔ&öG’†&öG’Â&ö&ÆVÕG—RÂE•UôÔ’°¢–b‚&öG’’&WGW&â"#°¢6öç7BG—TÆ&VÂÒE•UôÔ·&ö&ÆVÕG—UÓ°¢–b‚G—TÆ&VÂ’&WGW&â&öG“°¢òòXë¾™šNš)yºî[ÈZKNy¨N{¾Yè¾j~ŠønûÈÎZh".Z¾z›®š)ûÉ¢".XÙ^˜š)ûÉ¢"zØ¢6öç7BGFW&âÒæWr&VtW‡†âG·G—TÆ&VÇÕ¾ûÉ£¥ÅÇ5Ò¶Â&’"“°¢&WGW&â&öG’ç&WÆ6R‡GFW&âÂ""’çG&–Ò‚“°¢Ğ¢òòiK‹ù¾y¨N‰èŞYjŠ[Èò&ö×BjÎ[ÈşXÉnX{Şi[ ¢gVæ7F–öâf÷&ÖE&ö&ÆVÔf÷%f—6–öâ‡&ö&ÆVÒÂE•UôÔÂ†5FW‡D–æfòÒfÇ6R’°¢6öç7B&ö&ÆVÕG—RÒE•UôÔ·&ö&ÆVÒç&ö&ÆVÕG—UÒÇÂ.š)yºâ#°¢ÆWB&6U&ö×BÒ†5FW‡D–æfòò{¹>Yih~iÊÎKúhşY(ÎY»îx˜~Xh^ZëXˆniéG·&ö&ÆVÕG—WŞûÈÎhÈjÎ[ÈşY¹îzÙNûÉ¦¢Šx.ZùşY»îx˜~Xh^ZëûÈÎŠønXŠ²G·&ö&ÆVÕG—WŞ[›nhÈjÎ[ÈşY¹îzÙNûÉ¦°¢–b††5FW‡D–æfòbb&ö&ÆVÒæ&öG’’°¢òò)ÈRkˆ^ynš)yºîXh^Zë¢6öç7B6ÆVä&öG’Ò6ÆVå&ö&ÆVÔ&öG’‡&ö&ÆVÒæ&öG’Â&ö&ÆVÒç&ö&ÆVÕG—RÂE•UôÔ“°¢&6U&ö×B³ÒÆåÆî8	ih~iÊÎKúhş8	Æîš)yºîûÉ¢G¶6ÆVä&öG—Ö°¢–b‡&ö&ÆVÒæ÷F–öç3òæÆVæwF‚’°¢&6U&ö×B³Ò%Æî˜šûÉ¢#°¢f÷"†6öç7Bòöb&ö&ÆVÒæ÷F–öç2’&6U&ö×B³ÒÆâG¶òæ¶W—ÒâG¶òçfÇVWÖ°¢Ğ¢&6U&ö×B³Ò%ÆåÆîˆº^Y»îx˜~Xh^ZëKˆîih~iÊÎXk.z¨ûÈÎKº^Y»îx˜~K‹®Xxn8"#°¢Ğ¢òòjhÚîš)yºî{¾Yè¾k{¾XªX[~KÙ>jÎ[ÈşŠhk ¢7v—F6‚‡&ö&ÆVÒç&ö&ÆVÕG—R’°¢66R ¢òòXÙ^˜š)€¢&6U&ö×B³ÒÆåÆîjÎ[ÈşŠhk.ûÉ¥ÆîzÙNjƒ¢¾XÙ^KŠ®ZÙ~jøÕÕÆîŠz>˜x£¢¾˜hºynyKÕÆåÆîk:hHşûÉ®Xú®˜KˆKŠ®ûÈÎZh$°¢'&V³° ¢66R# ¢òòZI®˜š)€¢&6U&ö×B³ÒÆåÆîjÎ[ÈşŠhk.ûÉ¥ÆîzÙNjƒ¢¾ZI®KŠ®ZÙ~jøŞyJšşXû~Xˆn[ÈÕÆîŠz>˜x£¢¾˜hºynyKÕÆåÆîk:hHşûÉ®jÎ[ÈşZh$8.86°¢'&V³° ¢66R3 ¢òòh©^zZš)€¢&6U&ö×B³ÒÆåÆîjÎ[ÈşŠhk.ûÉ¥ÆîzÙNjƒ¢¾XÙ^KŠ®ZÙ~jøÕÕÆîŠz>˜x£¢¾˜hºynyKÕÆåÆîk:hHşûÉ®Xú®˜KˆKŠ®˜š–°¢'&V³° ¢66RC ¢òòZ¾z›®š)€¢&6U&ö×B³ÒÆåÆî‹ùiŠşKˆ˜>Z¾z›®š)8%ÆåÆî˜xŞŠhŠûNiˆîûÉ¥ÆâÒš)yºîXh^Zë[{.{¸şZHNynûÈÎKˆŞY
².Z¾z›®š)‚.zØZÙ~juÆâÒŠx.ZùşY»îx˜~Y(Îih~iÊÎûÈÎh›îX{®™ÈŠhZ¾XZ^y¨NXh^Zë•ÆâÒzÙNjKŠŞKˆŞŠhX{®xëK»¾KÙ^š)yºî{¾Yè¾j~ŠøeÆåÆîjÎ[ÈşŠhk.ûÉ¥ÆîzÙNjƒ¢¾y»Nhê^{¹X{®Z¾z›®Xh^Zë•ÕÆîŠz>˜x£¢¾zèŠhŠûNiˆåÕÆåÆîzK®Kè¾ûÉ¥ÆîzÙNjƒ¢k
~k	BÎ‰‰N{9eÆîŠz>˜x£¢XXYKÙÎyJy¨NKª~xš•ÆåÆîZI®KŠ®Z¾z›®yJ˜	~Xû~Xˆn[È°¢'&V³° ¢66RS ¢òòK‹¾Šx.š)€¢&6U&ö×B³ÒÆåÆîjÎ[ÈşŠhk.ûÉ¥ÆîzÙNjƒ¢¾ZèÎi[NY¹îzÙEÕÆîŠz>˜x£¢¾Š^XX^ŠûNiˆåÕÆåÆîk:hHşûÉ®y»Nhê^Y¹îzÙNûÈÎKˆŞŠh˜xŞZHŞš)yºæ°¢'&V³° ¢FVfVÇC ¢&6U&ö×B³ÒÆåÆîjÎ[ÈşŠhk.ûÉ¥ÆîzÙNjƒ¢¾KÚy¨NzÙNj…ÕÆîŠz>˜x£¢¾Šún{¸nŠz>˜x¥Ö°¢Ğ¢&WGW&â&6U&ö×C°¢Ğ¢òòiK‹ù¾y¨NzÙNjŠz>iéX{Şi[ ¢gVæ7F–öâ'6T”ç7vW"‡&ö&ÆVÒÂ”ç7vW"’°¢G'’°¢6öç7BÆ–æW2Ò7G&–ær†”ç7vW"ÇÂ""’ç7Æ—B‚%Æâ"“°¢ÆWBç7vW$Æ–æRÒ"#°¢ÆWBç7vW$–G‚ÒÓ°¢òòXXZé®KØŞ(	ÎzÙNjƒ®(	Şh˜YÊŠÀ¢f÷"†ÆWB’Ò²’ÂÆ–æW2æÆVæwFƒ²’²²’°¢6öç7BÆ–æRÒÆ–æW5¶•Ó°¢–b†Æ–æRæ–æ6ÇVFW2‚.zÙNjƒ¢"’ÇÂÆ–æRæ–æ6ÇVFW2‚.zÙNjûÉ¢"’’°¢ç7vW$Æ–æRÒÆ–æRç&WÆ6R‚şzÙNj…³®ûÉ¥ÕÇ2¢òÂ""’çG&–Ò‚“°¢ç7vW$–G‚Ò“°¢'&V³°¢Ğ¢Ğ¢òòÓÓÒZûZ¾z›®š)Y(ÎK‹¾Šx.š)ûÈÎXXŠëZI®ŠÎzÙNj‚ÓÓĞ¢–b‚‡&ö&ÆVÒç&ö&ÆVÕG—RÓÓÒBÇÂ&ö&ÆVÒç&ö&ÆVÕG—RÓÓÒR’bbç7vW$–G‚ãÒ’°¢6öç7B&Æö6²ÒµÓ°¢òò[Ù>X˜ŞŠÎZh.iéÎiÈXh^ZëûÈÎXXiKn‹ù¾Xë°¢–b†ç7vW$Æ–æR’&Æö6²çW6‚†ç7vW$Æ–æR“°¢òò{º~{ºŞY	Kˆ¾iKn™¸nûÈÎy»NX‹˜~X‹(	ÎŠz>˜x£®(	Şh‰nih~iÊÎ{¹>iÙğ¢f÷"†ÆWB’Òç7vW$–G‚²²’ÂÆ–æW2æÆVæwFƒ²’²²’°¢6öç7BÂÒÆ–æW5¶•Ó°¢–b‚õåÇ2®Šz>˜x¥³®ûÉ¥ÒòçFW7B†Â’’'&V³°¢&Æö6²çW6‚‚†ÂÇÂ""’çG&–ÔVæB‚’“°¢Ğ¢6öç7BÖW&vVBÒ&Æö6²æ¦ö–â‚%Æâ"’çG&–Ò‚“°¢–b†ÖW&vVB’ç7vW$Æ–æRÒÖW&vVC°¢Ğ¢òòZh.iéÎK¸ŞxKnk*iÈK»¾KÙ^zÙNjXh^ZëûÈÎ˜Y¹îX‹zÊÎKˆŠÎXYÎ[©P¢–b‚ç7vW$Æ–æR’ç7vW$Æ–æRÒ†Æ–æW5³ÒÇÂ""’çG&–Ò‚“°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ·'6T”ç7vW%Òš)yºî{¾Yè³¢"Â&ö&ÆVÒç&ö&ÆVÕG—RÂ.XéşZx¾zÙNjŠÃ¢"Âç7vW$Æ–æR“°¢7v—F6‚‡&ö&ÆVÒç&ö&ÆVÕG—R’°¢66R ¢òòXÙ^˜š)€¢66R3 ¢°¢òòh©^zZš)€¢ÆWBÒÒç7vW$Æ–æRæÖF6‚‚õ´$4DTdt„”¤´ÄÔäõ%5EUeu…•¥Òò“°¢–b†Ò’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ·'6T”ç7vW%ÒXÙ^˜’şh©^zZŠz>ié{¹>iéÃ¢"Â²Õ³ÒÒ“°¢&WGW&â²Õ³ÒÓ°¢Ğ¢6öç7B6†–æW6TÖF6‚Òç7vW$Æ–æRæÖF6‚‚ş˜hº“ò…´$4DTdt„”¤´ÄÔäõ%5EUeu…•¥Ò’ò“°¢–b†6†–æW6TÖF6‚’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ·'6T”ç7vW%ÒXÙ^˜’şh©^zZKŠŞih~Šz>ié{¹>iéÃ¢"Â²6†–æW6TÖF6…³ÒÒ“°¢&WGW&â²6†–æW6TÖF6…³ÒÓ°¢Ğ¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ·'6T”ç7vW%ÒXÙ^˜’şh©^zZŠz>iéZK‹JR"“°¢&WGW&âçVÆÃ°¢Ğ ¢66R# ¢°¢òòZI®˜š)€¢–b†ç7vW$Æ–æRæ–æ6ÇVFW2‚.8"’’°¢6öç7B÷F–öç2Òç7vW$Æ–æRç7Æ—B‚.8"’æÖ‡2Óâ2çG&–Ò‚’æÖF6‚‚õ´$4DTdt„”¤´ÄÔäõ%5EUeu…•¥Òò’’æf–ÇFW"†ÒÓâÒ’æÖ†ÒÓâÕ³Ò“°¢–b†÷F–öç2æÆVæwF‚â’°¢6öç7B&W7VÇBÒ²ââææWr6WB†÷F–öç2’Òç6÷'B‚“°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ·'6T”ç7vW%ÒZI®˜šşXû~Šz>ié{¹>iéÃ¢"Â&W7VÇB“°¢&WGW&â&W7VÇC°¢Ğ¢Ğ¢–b†ç7vW$Æ–æRæ–æ6ÇVFW2‚"Â"’ÇÂç7vW$Æ–æRæ–æ6ÇVFW2‚.ûÈÂ"’’°¢6öç7B÷F–öç2Òç7vW$Æ–æRç7Æ—B‚õ²ÎûÈÅÒò’æÖ‡2Óâ2çG&–Ò‚’æÖF6‚‚õ´$4DTdt„”¤´ÄÔäõ%5EUeu…•¥Òò’’æf–ÇFW"†ÒÓâÒ’æÖ†ÒÓâÕ³Ò“°¢–b†÷F–öç2æÆVæwF‚â’°¢6öç7B&W7VÇBÒ²ââææWr6WB†÷F–öç2’Òç6÷'B‚“°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ·'6T”ç7vW%ÒZI®˜˜	~Xû~Šz>ié{¹>iéÃ¢"Â&W7VÇB“°¢&WGW&â&W7VÇC°¢Ğ¢Ğ¢6öç7BÆWGFW'2Òç7vW$Æ–æRæÖF6‚‚õ´$4DTdt„”¤´ÄÔäõ%5EUeu…•¥Òör“°¢–b†ÆWGFW'2bbÆWGFW'2æÆVæwF‚â’°¢6öç7B&W7VÇBÒ²ââææWr6WB†ÆWGFW'2’Òç6÷'B‚“°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ·'6T”ç7vW%ÒZI®˜‹ùî{ºŞŠz>ié{¹>iéÃ¢"Â&W7VÇB“°¢&WGW&â&W7VÇC°¢Ğ¢–b†ÆWGFW'2bbÆWGFW'2æÆVæwF‚ÓÓÒ’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ·'6T”ç7vW%ÒZI®˜XÙ^KŠ®Šz>ié{¹>iéÃ¢"ÂÆWGFW'2“°¢&WGW&âÆWGFW'3°¢Ğ¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ·'6T”ç7vW%ÒZI®˜Šz>iéZK‹JR"“°¢&WGW&âçVÆÃ°¢Ğ ¢66RC ¢°¢òòZ¾z›®š)€¢òòi»Nkø‹ù¾y¨Nkˆ^ynzÙnyZP¢ÆWB6ÆVäç7vW"Òç7vW$Æ–æRç&WÆ6R‚õâZ¾z›®š)‡ÎzèzÙNš)‡Î™zîzÙNš)‡Îš)yºçÎzÙNjiŠóò•³®ûÉ¥Ç5Ò¢öv’Â""’çG&–Ò‚“°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ·'6T”ç7vW%Òkˆ^ynYîzÙNjƒ¢"Â6ÆVäç7vW"“°¢òòZh.iéÎkˆ^ynYî‹ùXÈ^Y
¾‹ùK©¾ŠøŞûÈÎ{º~{ºŞkˆ^y`¢–b‚şZ¾z›®š)‡ÎzèzÙNš)‡Î™zîzÙNš)‡Îš)yºâö’çFW7B†6ÆVäç7vW"’’°¢6ÆVäç7vW"Ò6ÆVäç7vW"ç&WÆ6R‚şZ¾z›®š)‡ÎzèzÙNš)‡Î™zîzÙNš)‡Îš)yºâöv’Â""’çG&–Ò‚“°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ·'6T”ç7vW%ÒK¨ÎjÊkˆ^ynYã¢"Â6ÆVäç7vW"“°¢Ğ¢6öç7Bç7vW$ÆVæwF‚Ò6ÆVäç7vW"æÆVæwFƒ°¢–b†ç7vW$ÆVæwF‚ÃÒS’°¢6ÆVäç7vW"Ò6ÆVäç7vW"ç&WÆ6R‚õåµåÇuÇSFSÕÇS–fUÒ²òÂ""’ç&WÆ6R‚õµåÇuÇSFSÕÇS–fUÒ²BòÂ""“°¢6öç7B&Ææ·2Ò6ÆVäç7vW"ç7Æ—B‚õ²ÎûÈÃ¾ûÉµÇ5Ò²ò’æf–ÇFW"„&ööÆVâ“°¢–b†&Ææ·2æÆVæwF‚â’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ·'6T”ç7vW%ÒZ¾z›®Šz>ié{¹>iéÃ¢"Â&Ææ·2“°¢&WGW&â&Ææ·3°¢Ğ¢Ğ¢–b†6ÆVäç7vW"’°¢6öç7B&W7VÇBÒ°¢6öçFVçC¢6ÆVäç7vW"À¢–73¢µĞ¢Ó°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ·'6T”ç7vW%ÒzèzÙNš)Šz>ié{¹>iéÃ¢"Â&W7VÇB“°¢&WGW&â&W7VÇC°¢Ğ¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ·'6T”ç7vW%ÒZ¾z›¢şzèzÙNŠz>iéZK‹JR"“°¢&WGW&âçVÆÃ°¢Ğ ¢66RS ¢°¢òòK‹¾Šx.š)€¢6öç7B6öçFVçBÒç7vW$Æ–æRç&WÆ6R‚õâK‹¾Šx.š)‡ÎŠë®‹ûš)‚•³®ûÉ¥Ç5Ò¢ö’Â""’çG&–Ò‚“°¢–b†6öçFVçB’°¢6öç7B&W7VÇBÒ°¢6öçFVçC¢6öçFVçBÀ¢–73¢µĞ¢Ó°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ·'6T”ç7vW%ÒK‹¾Šx.š)Šz>ié{¹>iéÃ¢"Â&W7VÇB“°¢&WGW&â&W7VÇC°¢Ğ¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ·'6T”ç7vW%ÒK‹¾Šx.š)Šz>iéZK‹JR"“°¢&WGW&âçVÆÃ°¢Ğ ¢FVfVÇC ¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ·'6T”ç7vW%ÒiÊ®yú^š)yºî{¾Yè³¢"Â&ö&ÆVÒç&ö&ÆVÕG—R“°¢&WGW&âçVÆÃ°¢Ğ¢Ò6F6‚†R’°¢6öç6öÆRæW'&÷"‚%¾™ºŠûîZ.Xªh˜µÕ´U%%Õ·'6T”ç7vW%ÒŠz>iéZK‹JR"ÂR“°¢&WGW&âçVÆÃ°¢Ğ¢Ğ¢ò¢ ¢¢6öçfW'BF†RVF—F&ÆRç7vW"&÷‚–çFòF†R7G'V7GW&RW‡V7FVB'’F†Rç7vW ¢¢’â¥4ôâ—2&VfW'&VBÂv†–ÆR6†÷'BÆ–â×FW‡Bf÷&×2&VÖ–â6öçfVæ–VçBöà¢¢†öæR¶W–&ö&Bà¢¢ògVæ7F–öâ6ÆVåFW‡B‡fÇVR’°¢&WGW&â7G&–ær‡fÇVRóò""’çG&–Ò‚“°¢Ğ¢gVæ7F–öâVæ—VU6÷'FVDÆWGFW'2‡fÇVR’°¢6öç7BÆWGFW'2Ò7G&–ær‡fÇVR’çFõWW$66R‚’æÖF6‚‚õ´Õ¥Òör’ÇÂµÓ°¢&WGW&â²ââææWr6WB†ÆWGFW'2’Òç6÷'B‚“°¢Ğ¢gVæ7F–öâ'6TVF—F&ÆTç7vW"‡&ö&ÆVÕG—RÂ&ufÇVR’°¢6öç7B&rÒ7G&–ær‡&ufÇVRóò""“°¢6öç7BFW‡BÒ6ÆVåFW‡B‡&r“°¢–b‚FW‡B’&WGW&âçVÆÃ°¢G'’°¢6öç7B'6VBÒ¥4ôâç'6R‡FW‡B“°¢–b‡'6VBÓÒçVÆÂbbG—Vöb'6VBÓÓÒ&ö&¦V7B"’°¢–b…²Â"Â2Òæ–æ6ÇVFW2‡&ö&ÆVÕG—R’bb'&’æ—4'&’‡'6VB’’&WGW&â'6VBæÆVæwF‚ò'6VB¢çVÆÃ°¢–b‡&ö&ÆVÕG—RÓÓÒBbb'&’æ—4'&’‡'6VB’’&WGW&â'6VBæÆVæwF‚ò'6VB¢çVÆÃ°¢–b‡&ö&ÆVÕG—RÓÓÒRbbG—Vöb'6VBæ6öçFVçBÓÓÒ'7G&–ær"bb'6VBæ6öçFVçBçG&–Ò‚’’&WGW&â°¢6öçFVçC¢'6VBæ6öçFVçBÀ¢–73¢'&’æ—4'&’‡'6VBç–72’ò'6VBç–72¢µĞ¢Ó°¢Ğ¢Ò6F6‚°¢òò6öçF–çVRv—F‚F†RÆ–â×FW‡Bf÷&ÖG2&VÆ÷rà¢Ğ¢7v—F6‚‡&ö&ÆVÕG—R’°¢66R ¢66R# ¢66R3 ¢°¢6öç7BÆWGFW'2ÒVæ—VU6÷'FVDÆWGFW'2‡FW‡B“°¢&WGW&âÆWGFW'2æÆVæwF‚òÆWGFW'2¢çVÆÃ°¢Ğ ¢66RC ¢°¢6öç7B&Ææ·2Ò&rç7Æ—B‚õ²ÎûÈÃ¾ûÉµÆåÒ²ò’æÖ†—FVÒÓâ—FVÒçG&–Ò‚’’æf–ÇFW"„&ööÆVâ“°¢&WGW&â&Ææ·2æÆVæwF‚ò&Ææ·2¢çVÆÃ°¢Ğ ¢66RS ¢&WGW&â°¢6öçFVçC¢FW‡BÀ¢–73¢µĞ¢Ó° ¢FVfVÇC ¢&WGW&âFW‡C°¢Ğ¢Ğ¢gVæ7F–öâf÷&ÖDVF—F&ÆTç7vW"‡fÇVR’°¢G'’°¢&WGW&â¥4ôâç7G&–æv–g’‡fÇVRÂçVÆÂÂ"“°¢Ò6F6‚°¢&WGW&â7G&–ær‡fÇVRóò""“°¢Ğ¢Ğ¢gVæ7F–öâ'V–ÆDç7vW%7V&Ö—D÷F–öç2‡7FGW2Ò·ÒÂ¶ÆW76öä–C¢ÆW76öä–BÒçVÆÂÂf÷&6U&WG'“¢f÷&6U&WG'’ÒfÇ6WÒÒ·Ò’°¢&WGW&â°¢7F'EF–ÖS¢7FGW2ç7F'EF–ÖRóòçVÆÂÀ¢VæEF–ÖS¢7FGW2æVæEF–ÖRóòçVÆÂÀ¢f÷&6U&WG'“¢f÷&6U&WG'’ÓÓÒG'VRÀ¢ÆW76öä–C¢ÆW76öä–BÀ¢WFôvFS¢fÇ6RÀ¢v—D×3¢ ¢Ó°¢Ğ¢6öç7BÂC2Ò‚ââæ’Óâ6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´D$uÕ·gVW‚Ö†VÇW%Ò"Âââæ“°¢6öç7BrC2Ò‚ââæ’Óâ6öç6öÆRçv&â‚%¾™ºŠûîZ.Xªh˜µÕµt$åÕ·gVW‚Ö†VÇW%Ò"Âââæ“°¢6öç7BRÒ‚ââæ’Óâ6öç6öÆRæW'&÷"‚%¾™ºŠûîZ.Xªh˜µÕ´U%%Õ·gVW‚Ö†VÇW%Ò"Âââæ“°¢gVæ7F–öâvWEgVT‚’°¢G'’°¢6öç7BÒFö7VÖVçBçVW'•6VÆV7F÷"‚"6"“òåõ÷gVUõó°¢–b‚’rC2‚&vWEgVT¢h›îKˆŞX‹6åõ÷gVUõò"“°¢&WGW&âÇÂçVÆÃ°¢Ò6F6‚†R’°¢R‚&vWEgVT™IŠúó¢"ÂR“°¢&WGW&âçVÆÃ°¢Ğ¢Ğ¢òò{¹şKˆ‹ùNY¹î8ÎZÙ~zÊnK‹.8ŞûÈÎ[›nh™>XÛXéşZx¾{¾Yè°¢gVæ7F–öâvWD7W'&VçDÖ–åvU6Æ–FT–B‚’°¢G'’°¢6öç7BÒvWEgVT‚“°¢–b‚ÇÂâG7F÷&R’°¢rC2‚&vWD7W'&VçDÖ–åvU6Æ–FT–C¢izh‰b7F÷&R"“°¢&WGW&âçVÆÃ°¢Ğ¢6öç7B7W'%6Æ–FRÒâG7F÷&Rç7FFSòæ7W'%6Æ–FS°¢–b‚7W'%6Æ–FR’°¢ÂC2‚&vWD7W'&VçDÖ–åvU6Æ–FT–C¢7W'%6Æ–FRK‹¢çVÆÂ÷VæFVf–æVB"“°¢&WGW&âçVÆÃ°¢Ğ¢6öç7B&u6–BÒ7W'%6Æ–FRç6–C°¢6öç7B6–E7G"Ò&u6–BÓÒçVÆÂòçVÆÂ¢7G&–ær‡&u6–B“°¢6öç6öÆRæÆör‚%¶vWD7W'&VçDÖ–åvU6Æ–FT–EÒˆë~XùnX‹6Æ–FT–C¢"Â6–E7G"Â'·G—S¢"Â7W'%6Æ–FRçG—RÂ"Â&ö&ÆVÔ”C¢"Â7W'%6Æ–FRç&ö&ÆVÔ”BÂ"Â–æFWƒ¢"Â7W'%6Æ–FRæ–æFW‚Â'Ò"Â"‡&rG—S¢"ÂG—Vöb&u6–BÂ"Â&rfÇVS¢"Â&u6–BÂ"’"“°¢&WGW&â6–E7G#°¢Ò6F6‚†R’°¢R‚&vWD7W'&VçDÖ–åvU6Æ–FT–B™IŠúó¢"ÂR“°¢&WGW&âçVÆÃ°¢Ğ¢Ğ¢gVæ7F–öâvF6„Ö–åvT6†ævR†6ÆÆ&6²’°¢6öç7BÒvWEgVT‚“°¢–b‚ÇÂâG7F÷&R’°¢R‚'vF6„Ö–åvT6†ævS¢izk9^ˆë~XùbgVRZéîKè¾h‰b7F÷&R"“°¢&WGW&â‚’Óâ·Ó°¢Ğ¢6öç7BVçvF6‚ÒâG7F÷&RçvF6‚‡7FFRÓâ7FFRæ7W'%6Æ–FRÂ†ç2Â÷2’Óâ°¢6öç7BæWu6–BÒç3òç6–BÓÒçVÆÂòçVÆÂ¢7G&–ær†ç2ç6–B“°¢6öç7BöÆE6–BÒ÷3òç6–BÓÒçVÆÂòçVÆÂ¢7G&–ær†÷2ç6–B“°¢ÂC2‚.K‹¾yXÎ™Ú.š^™Ú.Xˆ~hÚ""Â°¢öÆE6–C¢öÆE6–BÀ¢æWu6–C¢æWu6–BÀ¢æWuG—S¢ç3òçG—RÀ¢æWu&ö&ÆVÔ”C¢ç3òç&ö&ÆVÔ”BÀ¢æWt–æFWƒ¢ç3òæ–æFW‚À¢&tæWu6–EG—S¢G—Vöbç3òç6–@¢Ò“°¢–b†æWu6–B’6ÆÆ&6²†æWu6–BÂç2“°¢ÒÂ°¢FVW¢fÇ6P¢Ò“°¢ÂC2‚.[{.Y
şXªK‹¾yXÎ™Ú.š^™Ú.Xˆ~hÚ.y¹Y
Â"“°¢&WGW&âVçvF6ƒ°¢Ğ¢gVæ7F–öâv—Df÷%gVU&VG’‚’°¢&WGW&âæWr&öÖ—6R‡&W6öÇfRÓâ°¢6öç7BCÒFFRææ÷r‚“°¢6öç7B6†V6²Ò‚’Óâ°¢6öç7BÒvWEgVT‚“°¢–b†bbâG7F÷&R’°¢ÂC2‚'v—Df÷%gVU&VG“¢ö²ÂVÆ6VB†×2“Ò"ÂFFRææ÷r‚’ÒC“°¢&W6öÇfR†“°¢ÒVÇ6R6WEF–ÖV÷WB†6†V6²Â“°¢Ó°¢6†V6²‚“°¢Ò“°¢Ğ¢6öç7BÂC"Ò‚ââæ’Óâ6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´D$uÕ¶•Ò"Âââæ“°¢6öç7BrC"Ò‚ââæ’Óâ6öç6öÆRçv&â‚%¾™ºŠûîZ.Xªh˜µÕµt$åÕ¶•Ò"Âââæ“°¢ÆWBÖ÷VçFVBCBÒfÇ6S°¢ÆWB&ö÷BC3°¢ÆWB&VfW'&VE6Æ–FTg&öÕ&W6VçFF–öâÒçVÆÃ°¢òòY
şyJiÚ^ˆz§&W6VçFF–öîy¨Nš^™Ú ¢ÆWB&VfW'&VE6Æ–FW4g&öÕ&W6VçFF–öâÒµÓ°¢òòh˜¾XªZI®š^ûÈK¸^yJK¨î(	Îhù™zî[Ù>X˜ÕN(	Şy¨NZI®˜ûÈ¢ÆWBÖçVÄ×VÇF•6Æ–FW4&ÖVBÒfÇ6S°¢òòXú®iÈh˜¾XªŠznXùi{nh˜ŞXXŠëZI®Y»à¢ÆWBÆ7Dç7vW$6öçFW‡BÒçVÆÃ°¢gVæ7F–öâ&VæFW%6VÆV7FVEE&Wf–Wr‚’°¢6öç7B&÷‚ÒFö7VÖVçBævWDVÆVÖVçD'”–B‚'–·BÖ’×6VÆV7FVB"“°¢6öç7B6–ævÆT–ÖrÒFö7VÖVçBævWDVÆVÖVçD'”–B‚'–·BÖ’×6VÆV7FVB×F‡VÖ""“°¢6öç7BF‡VÖ'2ÒFö7VÖVçBævWDVÆVÖVçD'”–B‚'–·BÖ’×6VÆV7FVB×F‡VÖ'2"“°¢–b‚&÷‚ÇÂ6–ævÆT–ÖrÇÂF‡VÖ'2’&WGW&ã°¢òòkˆ^z›®ZI®Y»îZëYš€¢F‡VÖ'2æ–ææW$…DÔÂÒ"#°¢òòZI®š^KÉXXi‹îzK®ûÈiÚ^ˆz®h˜¾XªZI®˜ûÈ¢–b„'&’æ—4'&’‡&VfW'&VE6Æ–FW4g&öÕ&W6VçFF–öâ’bb&VfW'&VE6Æ–FW4g&öÕ&W6VçFF–öâæÆVæwF‚â’°¢6öç7B—FV×2Ò&VfW'&VE6Æ–FW4g&öÕ&W6VçFF–öâæÖ‡2Óâ‡°¢6Æ–FT–C¢4–E7G"‡2ç6Æ–FT–B’À¢–ÖvUW&Ã¢2æ–ÖvUW&ÂÇÂ" ¢Ò’’æf–ÇFW"‡‚Óâ‚æ–ÖvUW&Â“°¢–b†—FV×2æÆVæwF‚â’°¢6–ævÆT–Örç7G–ÆRæF—7Æ’Ò&æöæR#°¢f÷"†6öç7B—Böb—FV×2’°¢6öç7B–ÖrÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&–Ör"“°¢–Örç7&2Ò—Bæ–ÖvUW&Ã°¢–ÖræÇBÒBG¶—Bç6Æ–FT–BÇÂ"'Ö°¢–Örç7G–ÆRæ775FW‡BÒ&Ö‚×v–GFƒ£#ƒ²Ö‚Ö†V–v‡C£ƒƒ²F—7Æ“¦&Æö6³²&÷&FW"×&F—W3£Gƒ²#°¢F‡VÖ'2æVæD6†–ÆB†–Ör“°¢Ğ¢&÷‚ç7G–ÆRæF—7Æ’Ò"#°¢&WGW&ã°¢Ğ¢Ğ¢òòXÙ^š^Y¹î˜ ¢6öç7BW&ÂÒ&VfW'&VE6Æ–FTg&öÕ&W6VçFF–öãòæ–ÖvUW&ÂÇÂ"#°¢–b‡W&Â’°¢6–ævÆT–Örç7&2ÒW&Ã°¢6–ævÆT–Örç7G–ÆRæF—7Æ’Ò"#°¢&÷‚ç7G–ÆRæF—7Æ’Ò"#°¢ÒVÇ6R°¢6–ævÆT–Örç7G–ÆRæF—7Æ’Ò&æöæR#°¢&÷‚ç7G–ÆRæF—7Æ’Ò&æöæR#°¢Ğ¢Ğ¢gVæ7F–öâVç7W&TÖF„¦‚‚’°¢6öç7BÖ¢Òv–æF÷räÖF„¦ƒ°¢6öç7Bö²Ò†Ö¢bbÖ¢çG—W6WE&öÖ—6R“°¢–b‚ö²’6öç6öÆRçv&â‚%¾™ºŠûîZ.Xªh˜µÕµt$åÕ¶•ÒÖF„¦‚iÊ®[{º®ûÈiÊ®˜	®‹ør&WV—&Rš(N{ÚîûÉşûÈ’"“°¢&WGW&â&öÖ—6Rç&W6öÇfR†ö²“°¢Ğ¢gVæ7F–öâG—W6WEFW„–â†VÂ’°¢6öç7BÖ¢Òv–æF÷räÖF„¦ƒ°¢–b‚VÂÇÂÖ¢ÇÂG—VöbÖ¢çG—W6WE&öÖ—6RÓÒ&gVæ7F–öâ"’&WGW&â&öÖ—6Rç&W6öÇfR†fÇ6R“°¢òòzØ[èRÖF„¦‚ˆz®[{y¨NY
şXª[{º ¢6öç7B&VG’ÒÖ¢ç7F'GWbbÖ¢ç7F'GWç&öÖ—6RòÖ¢ç7F'GWç&öÖ—6R¢&öÖ—6Rç&W6öÇfR‚“°¢&WGW&â&VG’çF†Vâ‚‚’ÓâÖ¢çG—W6WE&öÖ—6R…²VÂÒ’çF†Vâ‚‚’ÓâG'VR’æ6F6‚‚‚’ÓâfÇ6R’“°¢Ğ¢gVæ7F–öâW66T‡FÖÂ‡2Ò""’°¢&WGW&â7G&–ær‡2’ç&WÆ6R‚òbörÂ"f×²"’ç&WÆ6R‚óÂörÂ"fÇC²"’ç&WÆ6R‚óâörÂ"fwC²"’ç&WÆ6R‚ò"örÂ"gV÷C²"’ç&WÆ6R‚òrörÂ"b33“²"“°¢Ğ¢gVæ7F–öâ6fTÆ–æ²‡W&ÂÒ""’°¢G'’°¢6öç7BRÒæWrU$Â‡W&ÂÂÆö6F–öâæ÷&–v–â“°¢–b‡Rç&÷Fö6öÂÓÓÒ&‡GG¢"ÇÂRç&÷Fö6öÂÓÓÒ&‡GG3¢"’&WGW&âRæ‡&Vc°¢Ò6F6‚…ò’·Ğ¢&WGW&âçVÆÃ°¢òò™Ùâ‡GGö‡GG2y»Nhê^KŠ.[È>ûÈÎ˜şXXÒ¦f67&—C¢zØXØşŠêà¢Ğ¢gVæ7F–öâÖEFô‡FÖÂ†ÖE&rÒ""’°¢òòXXi[NKÙ>‹ÚÎK˜ûÈÎzîKùŞ›¹ŠêNiz…DÔÂk:XZP¢ÆWBÖBÒW66T‡FÖÂ†ÖE&r’ç&WÆ6R‚õÇ%ÆãòörÂ%Æâ"“°¢òòKº>zYÙ~ûÈ†fVæ6VNûÈ¢òòÆæuÆæ6öFUÆæ ¢ÖBÒÖBç&WÆ6R‚ö…¶×¤Õ£Ó•òÕÒ²“õÆâ…µÇ5Å5Ò£ò–örÂ…òÂÆærÂ6öFR’Óâ°¢6öç7BÂÒÆæròFFÖÆæsÒ"G¶ÆæwÒ&¢"#°¢&WGW&âÇ&R6Æ73Ò'–·BÖÖBÖ6öFR#ãÆ6öFRG¶ÇÓâG¶6öFWÓÂö6öFSãÂ÷&Sæ°¢Ò“°¢òòŠÎXh^Kº>z ¢ÖBÒÖBç&WÆ6R‚ö…µæÒ³ò–örÂ…òÂ6öFR’ÓâÆ6öFR6Æ73Ò'–·BÖÖBÖ–æÆ–æR#âG¶6öFWÓÂö6öFSæ“°¢òòj~š)‚2Â22Â222Â2222Â22222Â222220¢ÖBÒÖBç&WÆ6R‚õâ222225Ç2²‚â¢’BövÒÂ#ÆƒcâCÂöƒcâ"’ç&WÆ6R‚õâ22225Ç2²‚â¢’BövÒÂ#ÆƒSâCÂöƒSâ"’ç&WÆ6R‚õâ2225Ç2²‚â¢’BövÒÂ#ÆƒCâCÂöƒCâ"’ç&WÆ6R‚õâ225Ç2²‚â¢’BövÒÂ#Æƒ3âCÂöƒ3â"’ç&WÆ6R‚õâ25Ç2²‚â¢’BövÒÂ#Æƒ#âCÂöƒ#â"’ç&WÆ6R‚õâ5Ç2²‚â¢’BövÒÂ#ÆƒâCÂöƒâ"“°¢òò[É^yJYÙrà¢ÖBÒÖBç&WÆ6R‚õâƒó¢fwCµÇ3òâ²…ÆâƒòÆâ’â²’¢’övÒÂ&Æö6²Óâ°¢6öç7B–ææW"Ò&Æö6²ç&WÆ6R‚õâfwCµÇ3òövÒÂ""“°¢&WGW&âÆ&Æö6·V÷FSâG¶–ææW'ÓÂö&Æö6·V÷FSæ°¢Ò“°¢òòiz[¨şX‰~Š‚ ¢ÖBÒÖBç&WÆ6R‚ò…â‚×ÅÂ§ÅÂ²•Ç2²â²…ÆâƒòÆâ’â²’¢’övÒÂ&Æö6²Óâ°¢6öç7B—FV×2Ò&Æö6²ç7Æ—B‚%Æâ"’æÖ†ÂÓâÂçG&–Ò‚’’æf–ÇFW"†ÂÓâõâ‚×ÅÂ§ÅÂ²•Ç2²òçFW7B†Â’’æÖ†ÂÓâÆÆ“âG¶Âç&WÆ6R‚õâ‚×ÅÂ§ÅÂ²•Ç2²òÂ""—ÓÂöÆ“æ’æ¦ö–â‚""“°¢&WGW&âÇVÃâG¶—FV×7ÓÂ÷VÃæ°¢Ò“°¢òòiÈ[¨şX‰~Š€¢ÖBÒÖBç&WÆ6R‚ò…åÆBµÂåÇ2²â²…ÆâƒòÆâ’â²’¢’övÒÂ&Æö6²Óâ°¢6öç7B—FV×2Ò&Æö6²ç7Æ—B‚%Æâ"’æÖ†ÂÓâÂçG&–Ò‚’’æf–ÇFW"†ÂÓâõåÆBµÂåÇ2²òçFW7B†Â’’æÖ†ÂÓâÆÆ“âG¶Âç&WÆ6R‚õåÆBµÂåÇ2²òÂ""—ÓÂöÆ“æ’æ¦ö–â‚""“°¢&WGW&âÆöÃâG¶—FV×7ÓÂööÃæ°¢Ò“°¢òò{)~KÙ2şiiÎKÙ0¢ÖBÒÖBç&WÆ6R‚õÂ¥Â¢…µâ¥Ò³ò•Â¥Â¢örÂ#Ç7G&öæsâCÂ÷7G&öæsâ"“°¢ÖBÒÖBç&WÆ6R‚õÂ¢…µâ¥Ò³ò•Â¢örÂ#ÆVÓâCÂöVÓâ"“°¢ÖBÒÖBç&WÆ6R‚õõò…µåõÒ³ò•õòörÂ#Ç7G&öæsâCÂ÷7G&öæsâ"“°¢ÖBÒÖBç&WÆ6R‚õò…µåõÒ³ò•òörÂ#ÆVÓâCÂöVÓâ"“°¢òòkN[›>{«ğ¢ÖBÒÖBç&WÆ6R‚õåÇ2¢…²Ò¥õÒ—³2ÇÕÇ2¢BövÒÂ#Æ‡"óâ"“°¢òò™;îhêR·FW‡EÒ‡W&Â¢ÖBÒÖBç&WÆ6R‚õÅ²…µåÅÕÒ³ò•ÅÕÂ‚…µâ•Ò³ò•Â’örÂ…òÂFW‡BÂW&Â’Óâ°¢6öç7B6fRÒ6fTÆ–æ²‡W&Â“°¢–b‚6fR’&WGW&âFW‡C°¢òòKˆŞZèXZX‰™˜Ş{ª~K‹®{ªşih~iÊÀ¢&WGW&âÆ‡&VcÒ"G·6fWÒ"F&vWCÒ%ö&Ææ²"&VÃÒ&æö÷VæW"æ÷&VfW'&W"#âG·FW‡GÓÂöæ°¢Ò“°¢òòjë^‰ŞûÉ®h¨®™ÙîYÙ~{ª~j~zÛîK˜¾ZIny¨N‹ùî{ºŞih~ZÙ~YÙ~XÈ^h‰Çà¢6öç7BÆ–æW2ÒÖBç7Æ—B‚%Æâ"“°¢6öç7B÷WBÒµÓ°¢ÆWB'VbÒµÓ°¢6öç7BfÇW6‚Ò‚’Óâ°¢–b‚'VbæÆVæwF‚’&WGW&ã°¢÷WBçW6‚†ÇâG¶'Vbæ¦ö–â‚#Æ'"óâ"—ÓÂ÷æ“°¢'VbÒµÓ°¢Ó°¢6öç7B—4&Æö6²Ò2ÓâõâƒÆ…³Óe×ÃÇVÃçÃÆöÃçÃÇ&RÃÆ&Æö6·V÷FSçÃÆ‡%ÂóçÃÇçÃÇF&ÆWÃÆF—b’òçFW7B‡2“°¢f÷"†6öç7BÆâöbÆ–æW2’°¢–b‚ÆâçG&–Ò‚’’°¢fÇW6‚‚“°¢6öçF–çVS°¢Ğ¢–b†—4&Æö6²†Æâ’’°¢fÇW6‚‚“°¢÷WBçW6‚†Æâ“°¢ÒVÇ6R'VbçW6‚†Æâ“°¢Ğ¢fÇW6‚‚“°¢&WGW&â÷WBæ¦ö–â‚%Æâ"“°¢Ğ¢gVæ7F–öâf–æE6Æ–FT7&÷75&W6VçFF–öç2C†–E7G"’°¢f÷"†6öç7B²Â&W5Òöb&Wòç&W6VçFF–öç2’°¢6öç7B'"Ò&W3òç6Æ–FW2ÇÂµÓ°¢6öç7B†—BÒ'"æf–æB‡2Óâ7G&–ær‡2æ–B’ÓÓÒ–E7G"“°¢–b††—B’&WGW&â†—C°¢Ğ¢&WGW&âçVÆÃ°¢Ğ¢òò(	N(	B‹ùŠÎi{nˆz®hHûÉ®h¨¢&Wòç6Æ–FW2y¨Ni[ZÙ~™Jî‹øz{¾K‹®ZÙ~zÊnK‹.™Jà¢gVæ7F–öâæ÷&ÖÆ—¦U&Wõ6Æ–FW4¶W—2C‡FrÒ&’æÖ÷VçB"’°¢G'’°¢–b‚&WòÇÂ&Wòç6Æ–FW2ÇÂ‡&Wòç6Æ–FW2–ç7Fæ6VöbÖ’’°¢rC"‚&æ÷&ÖÆ—¦U&Wõ6Æ–FW4¶W—3¢&Wòç6Æ–FW2KˆŞiŠòÖ"“°¢&WGW&ã°¢Ğ¢6öç7B&Vf÷&T¶W—2Ò'&’æg&öÒ‡&Wòç6Æ–FW2æ¶W—2‚’“°¢6öç7BçV×2Ò&Vf÷&T¶W—2æf–ÇFW"†²ÓâG—Vöb²ÓÓÒ&çVÖ&W""“°¢ÆWBÖ÷fVBÒ°¢f÷"†6öç7B²öbçV×2’°¢6öç7BbÒ&Wòç6Æ–FW2ævWB†²“°¢6öç7B·2Ò7G&–ær†²“°¢–b‚&Wòç6Æ–FW2æ†2†·2’’°¢&Wòç6Æ–FW2ç6WB†·2Âb“°¢Ö÷fVB²³°¢Ğ¢Ğ¢6öç7BgFW%6×ÆRÒ'&’æg&öÒ‡&Wòç6Æ–FW2æ¶W—2‚’’ç6Æ–6RƒÂ‚“°¢ÂC"†¶æ÷&ÖÆ—¦U&Wõ6Æ–FW4¶W—4G·FwÕÒh¾™JãÒG¶&Vf÷&T¶W—2æÆVæwF‡ŞûÈÎi[ZÙ~™JãÒG¶çV×2æÆVæwF‡ŞûÈÎ‹øz{¾K‹®ZÙ~zÊnK‹#ÒG¶Ö÷fVGŞûÈÇ6×ÆSÖÂgFW%6×ÆR“°¢Ò6F6‚†R’°¢rC"‚&æ÷&ÖÆ—¦U&Wõ6Æ–FW4¶W—2W'&÷#¢"ÂR“°¢Ğ¢Ğ¢gVæ7F–öâ4–E7G"‡b’°¢&WGW&âbÓÒçVÆÂòçVÆÂ¢7G&–ær‡b“°¢Ğ¢gVæ7F–öâ—4Ö–å&–÷&—G’‚’°¢6öç7BbÒV“òæ6öæf–sòæ•6Æ–FU–6µ&–÷&—G“°¢6öç7B&WBÒ‡bÓÓÒ'&W6VçFF–öâ"“°¢ÂC"‚&—4Ö–å&–÷&—G“ò"Â°¢6fs¢bÀ¢&W7VÇC¢&W@¢Ò“°¢&WGW&â&WC°¢Ğ¢gVæ7F–öâfÆÆ&6µ6Æ–FT–Dg&öÕ&V6VçB‚’°¢G'’°¢–b‡&WòæVæ6÷VçFW&VE&ö&ÆV×3òæÆVæwF‚â’°¢6öç7BÆFW7BÒ&WòæVæ6÷VçFW&VE&ö&ÆV×2æB‚Ó“°¢6öç7B7BÒ&Wòç&ö&ÆVÕ7FGW2ævWB†ÆFW7Bç&ö&ÆVÔ–B“°¢6öç7B6–BÒ7Còç6Æ–FT–Bò7G&–ær‡7Bç6Æ–FT–B’¢çVÆÃ°¢ÂC"‚&fÆÆ&6µ6Æ–FT–Dg&öÕ&V6VçB"Â°¢ÆFW7E&ö&ÆVÔ–C¢ÆFW7Bç&ö&ÆVÔ–BÀ¢6–C¢6–@¢Ò“°¢&WGW&â6–C°¢Ğ¢Ò6F6‚†R’°¢rC"‚&fÆÆ&6µ6Æ–FT–Dg&öÕ&V6VçBW'&÷#¢"ÂR“°¢Ğ¢&WGW&âçVÆÃ°¢Ğ¢gVæ7F–öâBCB‡6VÂ’°¢&WGW&âFö7VÖVçBçVW'•6VÆV7F÷"‡6VÂ“°¢Ğ¢gVæ7F–öâvWE6Æ–FT'”ç’C†–B’°¢6öç7B6–BÒ–BÓÒçVÆÂòçVÆÂ¢7G&–ær†–B“°¢–b‚6–B’&WGW&â°¢6Æ–FS¢çVÆÂÀ¢†—C¢&æöæR ¢Ó°¢–b‡&Wòç6Æ–FW2æ†2‡6–B’’&WGW&â°¢6Æ–FS¢&Wòç6Æ–FW2ævWB‡6–B’À¢†—C¢'7G&–ær ¢Ó°¢6öç7B7&÷72Òf–æE6Æ–FT7&÷75&W6VçFF–öç2C‡6–B“°¢–b†7&÷72’°¢&Wòç6Æ–FW2ç6WB‡6–BÂ7&÷72“°¢&WGW&â°¢6Æ–FS¢7&÷72À¢†—C¢&7&÷72Öf–ÆÂ ¢Ó°¢Ğ¢6öç7B4çVÒÒçVÖ&W"æ—4æâ„çVÖ&W"‡6–B’’òçVÆÂ¢çVÖ&W"‡6–B“°¢–b†4çVÒÒçVÆÂbb&Wòç6Æ–FW2æ†2†4çVÒ’’°¢6öç7BbÒ&Wòç6Æ–FW2ævWB†4çVÒ“°¢&Wòç6Æ–FW2ç6WB‡6–BÂb“°¢&WGW&â°¢6Æ–FS¢bÀ¢†—C¢&çVÖ&W.(i'7G&–ærÖÖ–w&FR ¢Ó°¢Ğ¢&WGW&â°¢6Æ–FS¢çVÆÂÀ¢†—C¢&Ö—72 ¢Ó°¢Ğ¢gVæ7F–öâÖ÷VçD•æVÂ‚’°¢–b†Ö÷VçFVBCB’&WGW&â&ö÷BC3°¢æ÷&ÖÆ—¦U&Wõ6Æ–FW4¶W—2C‚&’æÖ÷VçB"“°¢6öç7B†÷7BÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢†÷7Bæ–ææW$…DÔÂÒGÂCC°¢Fö7VÖVçBæ&öG’æVæD6†–ÆB††÷7Bæf—'7DVÆVÖVçD6†–ÆB“°¢&ö÷BC2ÒFö7VÖVçBævWDVÆVÖVçD'”–B‚'–·BÖ’Öç7vW"×æVÂ"“°¢BCB‚"7–·BÖ’Ö6Æ÷6R"“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ6†÷t•æVÂ†fÇ6R’“°¢BCB‚"7–·BÖ’Ö6²"“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â6´”gW6–öäÖöFR“°¢BCB‚"7–·BÖ’Öf÷&6RÖç7vW""“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Âf÷&6T”ç7vW$f÷$7W'&VçB“°¢BCB‚"7–·BÖ’×7V&Ö—B"“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â7V&Ö—DVF—FVDç7vW"“°¢BCB‚"7–·BÖ’×&W6WBÖVF—B"“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ°¢–b†Æ7Dç7vW$6öçFW‡Còç'6VBÓÒfö–B’6WDVF—F&ÆTç7vW"†Æ7Dç7vW$6öçFW‡Bç'6VB“°¢Ò“°¢v—Df÷%gVU&VG’‚’çF†Vâ‚‚’Óâ°¢vF6„Ö–åvT6†ævR‚‡6Æ–FT–BÂ6Æ–FT–æfò’Óâ°¢ÂC"‚.K‹¾yXÎ™Ú.š^™Ú.Xˆ~hÚ.K¨¾K»b"Â°¢6Æ–FT–C¢6Æ–FT–BÀ¢6Æ–FT–æfõG—S¢6Æ–FT–æfóòçG—RÀ¢&ö&ÆVÔ”C¢6Æ–FT–æfóòç&ö&ÆVÔ”BÀ¢–æFWƒ¢6Æ–FT–æfóòæ–æFW€¢Ò“°¢&VfW'&VE6Æ–FTg&öÕ&W6VçFF–öâÒçVÆÃ°¢&VæFW%VW7F–öâ‚“°¢Ò“°¢Ò’æ6F6‚†RÓâ°¢rC"‚%gVRZéîKè¾X‰ŞZx¾XÉnZK‹J^ûÈÎ[nKÛşyJZH~yJikjƒ¢"ÂR“°¢Ò“°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚'–·C§&W6VçFF–öã§6Æ–FR×6VÆV7FVB"ÂWbÓâ°¢ÂC"‚.iKnX‹[şz©~˜š^K¨¾K»b"ÂWcòæFWF–Â“°¢6öç7B6–BÒ4–E7G"†WcòæFWF–Ãòç6Æ–FT–B“°¢6öç7B–ÖvUW&ÂÒWcòæFWF–Ãòæ–ÖvUW&ÂÇÂçVÆÃ°¢–b‡6–B’&VfW'&VE6Æ–FTg&öÕ&W6VçFF–öâÒ°¢6Æ–FT–C¢6–BÀ¢–ÖvUW&Ã¢–ÖvUW&À¢Ó°¢òòišî˜	®˜š^KˆŞ[©NŠú^KùŞyYh˜¾XªZI®˜¢&VfW'&VE6Æ–FW4g&öÕ&W6VçFF–öâÒµÓ°¢ÖçVÄ×VÇF•6Æ–FW4&ÖVBÒfÇ6S°¢&VæFW%VW7F–öâ‚“°¢Ò“°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚'–Ú±î¸Â¸­yêë¢°k¢G§¦*^kt:open-ai", () => {
      L$2("æ”¶åˆ°æ‰“å¼€ AI é¢æ¿äº‹ä»¶");
      showAIPanel(true);
    });
    window.addEventListener("ykt:ask-ai-for-slide", ev => {
      const detail = ev?.detail || {};
      const slideId = asIdStr(detail.slideId);
      const imageUrl = detail.imageUrl || "";
      L$2("æ”¶åˆ°â€œæé—®å½“å‰PPTâ€äº‹ä»¶", {
        slideId: slideId,
        imageLen: imageUrl?.length || 0
      });
      if (slideId) {
        preferredSlideFromPresentation = {
          slideId: slideId,
          imageUrl: imageUrl
        };
        // å•é¡µæé—®ä¸åº”è¯¥è§¦å‘å¤šé€‰é€»è¾‘
                preferredSlidesFromPresentation = [];
        manualMultiSlidesArmed = false;
        const look = getSlideByAny$1(slideId);
        if (look.slide && imageUrl) look.slide.image = imageUrl;
        L$2("æé—®å½“å‰PPT: lookupHit=", look.hit, "hasSlide=", !!look.slide);
      }
      showAIPanel(true);
      renderQuestion();
      renderSelectedPPTPreview();
    });
    // ===== æ‰‹åŠ¨å¤šé¡µæé—®ï¼ˆæ¥è‡ªè¯¾ä»¶é¢æ¿å¤šé€‰ï¼‰=====
        window.addEventListener("ykt:ask-ai-for-slides", ev => {
      const detail = ev?.detail || {};
      const slides = Array.isArray(detail.slides) ? detail.slides : [];
      if (!slides.length) return;
      if (detail.source !== "manual") return;
 // åªå…è®¸æ‰‹åŠ¨è·¯å¾„è¿›å…¥
            preferredSlidesFromPresentation = slides.map(s => ({
        slideId: asIdStr(s.slideId),
        imageUrl: s.imageUrl || ""
      })).filter(s => !!s.slideId);
      manualMultiSlidesArmed = preferredSlidesFromPresentation.length > 0;
      // é¢„è§ˆä»ä¿æŒå•é¡µé€»è¾‘ï¼šç”¨ç¬¬ä¸€å¼ ä½œä¸ºâ€œå·²é€‰æ‹©é¡µé¢â€çš„å±•ç¤ºï¼ˆä¸å¼ºåˆ¶è¦æ±‚æ”¹ UIï¼‰
            const first = preferredSlidesFromPresentation[0];
      if (first?.slideId) {
        preferredSlideFromPresentation = {
          slideId: first.slideId,
          imageUrl: first.imageUrl || ""
        };
        const look = getSlideByAny$1(first.slideId);
        if (look.slide && first.imageUrl) look.slide.image = first.imageUrl;
      }
      L$2("æ”¶åˆ°æ‰‹åŠ¨å¤šé¡µæé—®äº‹ä»¶", {
        count: preferredSlidesFromPresentation.length,
        armed: manualMultiSlidesArmed
      });
      showAIPanel(true);
      renderQuestion();
      renderSelectedPPTPreview();
    });
    mounted$4 = true;
    L$2("mountAIPanel å®Œæˆ, cfg.aiSlidePickPriority=", ui?.config?.aiSlidePickPriority);
    return root$3;
  }
  function showAIPanel(v = true) {
    mountAIPanel();
    root$3.classList.toggle("visible", !!v);
    if (v) {
      renderQuestion();
      if (ui.config.aiAutoAnalyze) queueMicrotask(() => {
        askAIFusionMode();
      });
    }
    const aiBtn = document.getElementById("ykt-btn-ai");
    if (aiBtn) aiBtn.classList.toggle("active", !!v);
    L$2("showAIPanel", {
      visible: v
    });
  }
  function setAILoading(v) {
    $$4("#ykt-ai-loading").style.display = v ? "" : "none";
  }
  function setAIError(msg = "") {
    const el = $$4("#ykt-ai-error");
    el.style.display = msg ? "" : "none";
    el.textContent = msg || "";
  }
  function setAIAnswer(content = "") {
    const el = $$4("#ykt-ai-answer");
    if (!el) return;
    if (window.MathJax && window.MathJax.config == null) window.MathJax.config = {};
    window.MathJax = Object.assign(window.MathJax || {}, {
      tex: {
        inlineMath: [ [ "$", "$" ], [ "\\(", "\\)" ] ]
      }
    });
    el.innerHTML = content ? mdToHtml(content) : "";
    try {
      if (ui?.config?.iftex) ensureMathJax().then(ok => {
        if (!ok) {
          console.warn("[é›¨è¯¾å ‚åŠ©æ‰‹][WARN][ai] MathJax æœªå°±ç»ªï¼Œè·³è¿‡ typeset");
          return;
        }
        el.classList.add("tex-enabled");
        typesetTexIn(el).then(() => console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][ai] MathJax typeset å®Œæˆ"));
      }); else el.classList.remove("tex-enabled");
    } catch (e) {/* é™é»˜é™çº§ */}
  }
  function getCustomPrompt() {
    const el = $$4("#ykt-ai-custom-prompt");
    return el ? el.value.trim() || "" : "";
  }
  function currentProblemStatus(problem) {
    if (!problem?.problemId) return null;
    const key = String(problem.problemId);
    return repo.problemStatus.get(problem.problemId) || repo.problemStatus.get(key) || (Number.isNaN(Number(key)) ? null : repo.problemStatus.get(Number(key))) || null;
  }
  function setEditableAnswer(value) {
    const section = $$4("#ykt-ai-edit-section");
    const textarea = $$4("#ykt-ai-answer-edit");
    const validate = $$4("#ykt-ai-validate");
    if (!section || !textarea) return;
    section.style.display = "";
    textarea.value = formatEditableAnswer(value);
    if (validate) {
      validate.textContent = "ç­”æ¡ˆå·²è§£æï¼Œå¯æäº¤å‰æ‰‹åŠ¨ä¿®æ”¹ã€‚";
      validate.style.color = "#2e7d32";
    }
  }
  function setEditableError(message) {
    const validate = $$4("#ykt-ai-validate");
    if (!validate) return;
    validate.textContent = message;
    validate.style.color = "#c62828";
  }
  function hideEditableAnswer() {
    const section = $$4("#ykt-ai-edit-section");
    if (section) section.style.display = "none";
  }
  async function submitEditedAnswer() {
    const problem = lastAnswerContext?.problem;
    const textarea = $$4("#ykt-ai-answer-edit");
    if (!problem || !textarea) {
      setAIError("å½“å‰é¡µé¢æ²¡æœ‰å¯æäº¤çš„é¢˜ç›®ï¼›è¯·å…ˆé€‰æ‹©é¢˜ç›®é¡µå¹¶è¿›è¡Œ AI åˆ†æã€‚");
      return;
    }
    const parsed = parseEditableAnswer(problem.problemType, textarea.value);
    if (parsed === null) {
      setEditableError("ç­”æ¡ˆæ ¼å¼æ— æ³•è¯†åˆ«æˆ–ä¸ºç©ºï¼Œè¯·å¡«å†™ JSON æˆ–é¢˜å‹å¯¹åº”çš„ç®€å†™ã€‚");
      return;
    }
    const status = currentProblemStatus(problem);
    const endTime = Number(status?.endTime ?? problem.endTime);
    const expired = Number.isFinite(endTime) && Date.now() >= endTime;
    if (expired && !window.confirm("è¿™é“é¢˜å·²è¿‡æˆªæ­¢æ—¶é—´ï¼Œå°†ä½¿ç”¨å¼ºåˆ¶è¡¥äº¤æ¥å£ã€‚ç»§ç»­å—ï¼Ÿ")) return;
    const button = $$4("#ykt-ai-submit");
    if (button) button.disabled = true;
    try {
      const result = await actions.submitParsedAnswer(problem, parsed, {
        forceRetry: expired
      });
      if (!result?.ok) throw new Error(result?.reason || "æäº¤å¤±è´¥");
      lastAnswerContext.parsed = parsed;
      setAIError("");
      setEditableAnswer(parsed);
      ui.toast(expired ? "ç¼–è¾‘ç­”æ¡ˆå·²è¡¥äº¤" : "ç¼–è¾‘ç­”æ¡ˆå·²æäº¤", 3e3);
    } catch (error) {
      setAIError(`ç¼–è¾‘ç­”æ¡ˆæäº¤å¤±è´¥ï¼š${error?.message || error}`);
    } finally {
      if (button) button.disabled = false;
    }
  }
  async function forceAIAnswerForCurrent() {
    let problem = lastAnswerContext?.problem;
    if (!problem) {
      let sid = preferredSlideFromPresentation?.slideId || repo.currentSlideId;
      // ä¸»ç•Œé¢å¯èƒ½æ²¡æœ‰æ›´æ–° repo.currentSlideIdï¼›æ­¤æ—¶ä» Vuex è¯»å–å®é™…æ˜¾ç¤ºé¡µã€‚
            if (!sid) try {
        sid = getCurrentMainPageSlideId();
      } catch (_) {}
      const look = getSlideByAny$1(sid);
      problem = look.slide?.problem || null;
    }
    if (!problem?.problemId) {
      setAIError("å½“å‰é¡µé¢æ²¡æœ‰è¯†åˆ«åˆ°é¢˜ç›®ï¼Œæ— æ³•æ‰§è¡Œå¼ºåˆ¶ AI ä½œç­”ã€‚");
      return;
    }
    const status = currentProblemStatus(problem);
    const endTime = Number(status?.endTime ?? problem.endTime);
    const expired = Number.isFinite(endTime) && Date.now() >= endTime;
    if (expired && !window.confirm("è¿™é“é¢˜å·²è¿‡æˆªæ­¢æ—¶é—´ï¼ŒAI å°†ä½¿ç”¨å¼ºåˆ¶è¡¥äº¤æ¥å£ã€‚ç»§ç»­å—ï¼Ÿ")) return;
    const button = $$4("#ykt-ai-force-answer");
    if (button) button.disabled = true;
    try {
      const result = await actions.forceAIAnswer(problem.problemId, {
        forceRetry: expired
      });
      if (!result?.ok) throw new Error(result?.reason || result?.error?.message || "ä½œç­”å¤±è´¥");
      lastAnswerContext = lastAnswerContext || {
        problem: problem
      };
      lastAnswerContext.parsed = result.answer;
      setEditableAnswer(result.answer);
      ui.toast(expired ? "AI ä½œç­”å®Œæˆå¹¶å·²è¡¥äº¤" : "AI ä½œç­”å®Œæˆ", 3e3);
    } catch (error) {
      setAIError(`å¼ºåˆ¶ AI ä½œç­”å¤±è´¥ï¼š${error?.message || error}`);
    } finally {
      if (button) button.disabled = false;
    }
  }
  function _logMapLookup(where, id) {
    const sid = id == null ? null : String(id);
    const hasS = sid ? repo.slides.has(sid) : false;
    const nid = sid != null && !Number.isNaN(Number(sid)) ? Number(sid) : null;
    const hasN = nid != null ? repo.slides.has(nid) : false;
    const sample = (() => {
      try {
        return Array.from(repo.slides.keys()).slice(0, 8);
      } catch {
        return [];
      }
    })();
    L$2(`${where} -> lookup`, {
      id: sid,
      hasString: hasS,
      hasNumber: hasN,
      sampleKeys: sample
    });
  }
  function renderQuestion() {
    let displayText = "";
    let hasPageSelected = false;
    let selectionSource = "";
    let slide = null;
    if (preferredSlideFromPresentation?.slideId) {
      const sid = asIdStr(preferredSlideFromPresentation.slideId);
      _logMapLookup("renderQuestion(preferred from presentation)", sid);
      const look = getSlideByAny$1(sid);
      slide = look.slide;
      if (slide) {
        displayText = `æ¥è‡ªè¯¾ä»¶é¢æ¿ï¼š${slide.title || `ç¬¬ ${slide.page || slide.index || ""} é¡µ`}`;
        selectionSource = `è¯¾ä»¶æµè§ˆï¼ˆä¼ å…¥/${look.hit}é”®å‘½ä¸­ï¼‰`;
        hasPageSelected = true;
      }
    }
    if (!slide) {
      const prio = isMainPriority();
      if (prio) {
        const mainSid = asIdStr(getCurrentMainPageSlideId());
        _logMapLookup("renderQuestion(main priority)", mainSid);
        const look = getSlideByAny$1(mainSid);
        slide = look.slide;
        if (slide) {
          displayText = `ä¸»ç•Œé¢å½“å‰é¡µ: ${slide.title || `ç¬¬ ${slide.page || slide.index || ""} é¡µ`}`;
          selectionSource = `ä¸»ç•Œé¢æ£€æµ‹ï¼ˆ${look.hit}é”®å‘½ä¸­ï¼‰`;
          displayText += slide.problem ? "\nğŸ“ æ­¤é¡µé¢åŒ…å«é¢˜ç›®" : "\nğŸ“„ æ­¤é¡µé¢ä¸ºæ™®é€šå†…å®¹é¡µ";
          hasPageSelected = true;
        }
      } else {
        const presentationPanel = document.getElementById("ykt-presentation-panel");
        const isOpen = presentationPanel && presentationPanel.classList.contains("visible");
        const curSid = asIdStr(repo.currentSlideId);
        L$2("renderQuestion(presentation priority)", {
          isOpen: isOpen,
          curSid: curSid
        });
        if (isOpen && curSid) {
          _logMapLookup("renderQuestion(pres open, curSid)", curSid);
          const look = getSlideByAny$1(curSid);
          slide = look.slide;
          if (slide) {
            displayText = `è¯¾ä»¶é¢æ¿é€‰ä¸­: ${slide.title || `ç¬¬ ${slide.page || slide.index || ""} é¡µ`}`;
            selectionSource = `è¯¾ä»¶æµè§ˆé¢æ¿ï¼ˆ${look.hit}é”®å‘½ä¸­ï¼‰`;
            displayText += slide.problem ? "\nğŸ“ æ­¤é¡µé¢åŒ…å«é¢˜ç›®" : "\nğŸ“„ æ­¤é¡µé¢ä¸ºæ™®é€šå†…å®¹é¡µ";
            hasPageSelected = true;
          }
        } else {
          if (!slide && curSid) {
            _logMapLookup("renderQuestion(pres fallback curSid)", curSid);
            const look = getSlideByAny$1(curSid);
            slide = look.slide;
            if (slide) {
              displayText = `è¯¾ä»¶é¢æ¿æœ€è¿‘é€‰ä¸­: ${slide.title || `ç¬¬ ${slide.page || slide.index || ""} é¡µ`}`;
              selectionSource = `è¯¾ä»¶æµè§ˆï¼ˆå…œåº•/${look.hit}é”®å‘½ä¸­ï¼‰`;
              hasPageSelected = true;
            }
          }
          if (!slide) {
            const fb = fallbackSlideIdFromRecent();
            if (fb) {
              _logMapLookup("renderQuestion(fallback recent)", fb);
              const look = getSlideByAny$1(fb);
              slide = look.slide;
              if (slide) {
                displayText = `æœ€è¿‘é¢˜ç›®å…³è”é¡µ: ${slide.title || `ç¬¬ ${slide.page || slide.index || ""} é¡µ`}`;
                selectionSource = `æœ€è¿‘é¢˜ç›®ï¼ˆå…œåº•/${look.hit}é”®å‘½ä¸­ï¼‰`;
                hasPageSelected = true;
              }
            }
          }
          if (!slide) {
            displayText = "æœªæ£€æµ‹åˆ°å½“å‰é¡µé¢\nğŸ’¡ è¯·åœ¨ä¸»ç•Œé¢æˆ–è¯¾ä»¶é¢æ¿ä¸­é€‰æ‹©é¡µé¢ã€‚";
            selectionSource = "æ— ";
          }
        }
      }
    }
    const el = document.querySelector("#ykt-ai-question-display");
    if (el) el.textContent = displayText;
    const img = document.getElementById("ykt-ai-selected-thumb");
    const box = document.getElementById("ykt-ai-selected");
    if (img && box) renderSelectedPPTPreview();
    const statusEl = document.querySelector("#ykt-ai-text-status");
    if (statusEl) {
      statusEl.textContent = hasPageSelected ? `âœ“ å·²é€‰æ‹©é¡µé¢ï¼ˆæ¥æºï¼š${selectionSource}ï¼‰ï¼Œå¯è¿›è¡Œå›¾åƒåˆ†æ` : "âš  è¯·é€‰æ‹©è¦åˆ†æçš„é¡µé¢";
      statusEl.className = hasPageSelected ? "text-status success" : "text-status warning";
    }
  }
  async function askAIFusionMode() {
    setAIError("");
    setAILoading(true);
    setAIAnswer("");
    lastAnswerContext = null;
    hideEditableAnswer();
    try {
      if (!hasActiveAIProfile(ui.config.ai)) throw new Error("è¯·å…ˆåœ¨è®¾ç½®ä¸­é…ç½® API Key");
      let currentSlideId = null;
      let slide = null;
      let selectionSource = "";
      let forcedImageUrl = null;
      if (preferredSlideFromPresentation?.slideId) {
        currentSlideId = asIdStr(preferredSlideFromPresentation.slideId);
        const look = getSlideByAny$1(currentSlideId);
        slide = look.slide;
        forcedImageUrl = preferredSlideFromPresentation.imageUrl || null;
        selectionSource = `è¯¾ä»¶æµè§ˆï¼ˆä¼ å…¥/${look.hit}é”®å‘½ä¸­ï¼‰`;
        L$2("[ask] ä½¿ç”¨presentationä¼ å…¥çš„é¡µé¢:", {
          currentSlideId: currentSlideId,
          lookupHit: look.hit,
          hasSlide: !!slide
        });
      }
      if (!slide) {
        const prio = isMainPriority();
        if (prio) {
          const mainSlideId = asIdStr(getCurrentMainPageSlideId());
          if (mainSlideId) {
            currentSlideId = mainSlideId;
            const look = getSlideByAny$1(currentSlideId);
            slide = look.slide;
            selectionSource = `ä¸»ç•Œé¢å½“å‰é¡µé¢ï¼ˆ${look.hit}é”®å‘½ä¸­ï¼‰`;
            L$2("[ask] ä½¿ç”¨ä¸»ç•Œé¢å½“å‰é¡µé¢:", {
              currentSlideId: currentSlideId,
              lookupHit: look.hit,
              hasSlide: !!slide
            });
          }
        } else {
          const presentationPanel = document.getElementById("ykt-presentation-panel");
          const isOpen = presentationPanel && presentationPanel.classList.contains("visible");
          if (isOpen && repo.currentSlideId != null) {
            currentSlideId = asIdStr(repo.currentSlideId);
            const look = getSlideByAny$1(currentSlideId);
            slide = look.slide;
            selectionSource = `è¯¾ä»¶æµè§ˆé¢æ¿ï¼ˆ${look.hit}é”®å‘½ä¸­ï¼‰`;
            L$2("[ask] ä½¿ç”¨è¯¾ä»¶é¢æ¿é€‰ä¸­çš„é¡µé¢:", {
              currentSlideId: currentSlideId,
              lookupHit: look.hit,
              hasSlide: !!slide
            });
          }
        }
      }
      if (!slide && repo.currentSlideId != null) {
        currentSlideId = asIdStr(repo.currentSlideId);
        const look = getSlideByAny$1(currentSlideId);
        slide = look.slide;
        selectionSource = selectionSource || `è¯¾ä»¶æµè§ˆï¼ˆå…œåº•/${look.hit}é”®å‘½ä¸­ï¼‰`;
        L$2("[ask] Fallback ä½¿ç”¨ repo.currentSlideId:", {
          currentSlideId: currentSlideId,
          lookupHit: look.hit,
          hasSlide: !!slide
        });
      }
      if (!slide) {
        const fb = fallbackSlideIdFromRecent();
        if (fb) {
          currentSlideId = asIdStr(fb);
          const look = getSlideByAny$1(currentSlideId);
          slide = look.slide;
          selectionSource = selectionSource || `æœ€è¿‘é¢˜ç›®ï¼ˆå…œåº•/${look.hit}é”®å‘½ä¸­ï¼‰`;
          L$2("[ask] Fallback ä½¿ç”¨ æœ€è¿‘é¢˜ç›® slideId:", {
            currentSlideId: currentSlideId,
            lookupHit: look.hit,
            hasSlide: !!slide
          });
        }
      }
      if (!currentSlideId || !slide) throw new Error("æ— æ³•ç¡®å®šè¦åˆ†æçš„é¡µé¢ã€‚è¯·åœ¨ä¸»ç•Œé¢æ‰“å¼€ä¸€ä¸ªé¡µé¢ï¼Œæˆ–åœ¨è¯¾ä»¶æµè§ˆä¸­é€‰æ‹©é¡µé¢ã€‚");
      L$2("[ask] é¡µé¢é€‰æ‹©æ¥æº:", selectionSource, "é¡µé¢ID:", currentSlideId, "é¡µé¢ä¿¡æ¯:", slide);
      if (forcedImageUrl) {
        slide.image = forcedImageUrl;
 // å¼ºåˆ¶æŒ‡å®š
                L$2("[ask] ä½¿ç”¨ä¼ å…¥ imageUrl");
      }
      // ===== è·å–å›¾ç‰‡ï¼šä»…æ‰‹åŠ¨å¤šé€‰æ—¶èµ°å¤šå›¾ï¼›å¦åˆ™ä¿æŒå•å›¾ =====
            let imageBase64OrList = null;
      if (manualMultiSlidesArmed && Array.isArray(preferredSlidesFromPresentation) && preferredSlidesFromPresentation.length > 0) {
        const ids = preferredSlidesFromPresentation.map(s => asIdStr(s.slideId)).filter(Boolean);
        ui.toast(`æ­£åœ¨è·å–è¯¾ä»¶å¤šé¡µå›¾ç‰‡ï¼ˆå…± ${ids.length} é¡µï¼‰...`, 2500);
        L$2("[ask] æ‰‹åŠ¨å¤šé¡µæˆªå›¾å¼€å§‹", {
          ids: ids
        });
        const images = [];
        for (const sid of ids) {
          const b64 = await captureSlideImage(sid);
          if (b64) images.push(b64);
        }
        if (images.length === 0) throw new Error("æ— æ³•è·å–æ‰€é€‰é¡µé¢å›¾ç‰‡ï¼Œè¯·ç¡®ä¿é¡µé¢å·²åŠ è½½å®Œæˆ");
        imageBase64OrList = images;
        // æ¶ˆè´¹ä¸€æ¬¡ï¼šé¿å… aiAutoAnalyze æˆ–åç»­è°ƒç”¨è¯¯ç”¨å¤šå›¾
                manualMultiSlidesArmed = false;
        preferredSlidesFromPresentation = [];
        L$2("[ask] âœ… æ‰‹åŠ¨å¤šé¡µæˆªå›¾å®Œæˆ", {
          got: images.length
        });
      } else {
        L$2("[ask] è·å–é¡µé¢å›¾ç‰‡...");
        ui.toast(`æ­£åœ¨è·å–${selectionSource}å›¾ç‰‡...`, 2e3);
        const imageBase64 = await captureSlideImage(currentSlideId);
        if (!imageBase64) throw new Error("æ— æ³•è·å–é¡µé¢å›¾ç‰‡ï¼Œè¯·ç¡®ä¿é¡µé¢å·²åŠ è½½å®Œæˆ");
        imageBase64OrList = imageBase64;
        L$2("[ask] âœ… é¡µé¢å›¾ç‰‡è·å–æˆåŠŸï¼Œå¤§å°(KB)=", Math.round(imageBase64.length / 1024));
      }
      let textPrompt = `ã€é¡µé¢è¯´æ˜ã€‘å½“å‰é¡µé¢å¯èƒ½ä¸æ˜¯é¢˜ç›®é¡µï¼›è¯·ç»“åˆç”¨æˆ·æç¤ºä½œç­”ã€‚`;
      const customPrompt = getCustomPrompt();
      if (customPrompt) {
        textPrompt += `\n\nã€ç”¨æˆ·è‡ªå®šä¹‰è¦æ±‚ã€‘\n${customPrompt}`;
        L$2("[ask] ç”¨æˆ·è‡ªå®šä¹‰prompt:", customPrompt);
      }
      // ===== é¢˜å‹ hintï¼šä»…å½“å½“å‰é¡µé¢æ˜¯é¢˜ç›®æ—¶æä¾› =====
            let problemType = null;
      const problem = slide?.problem;
      if (problem && typeof problem.problemType !== "undefined") problemType = problem.problemType;
      L$2("[ask] problemType hint:", problemType);
      ui.toast(`æ­£åœ¨åˆ†æ${selectionSource}å†…å®¹...`, 3e3);
      L$2("[ask] è°ƒç”¨ Vision API...");
      const aiContent = await queryAIVision(imageBase64OrList, textPrompt, ui.config.ai, {
        problemType: problemType
      });
      setAILoading(false);
      L$2("[ask] Vision APIè°ƒç”¨æˆåŠŸ, å†…å®¹é•¿åº¦=", aiContent?.length);
      // è‹¥å½“å‰é¡µæœ‰é¢˜ç›®ï¼Œå°è¯•è§£æ
            let parsed = null;
      if (problem) {
        parsed = parseAIAnswer(problem, aiContent);
        L$2("[ask] è§£æç»“æœ:", parsed);
      }
      let displayContent = `${selectionSource}å›¾åƒåˆ†æç»“æœï¼š\n${aiContent}`;
      if (customPrompt) displayContent = `${selectionSource}å›¾åƒåˆ†æç»“æœï¼ˆåŒ…å«è‡ªå®šä¹‰è¦æ±‚ï¼‰ï¼š\n${aiContent}`;
      if (parsed && problem) {
        lastAnswerContext = {
          problem: problem,
          slideId: currentSlideId,
          parsed: parsed,
          aiContent: aiContent
        };
        setAIAnswer(`${displayContent}\n\nAI å»ºè®®ç­”æ¡ˆï¼š${JSON.stringify(parsed)}`);
        setEditableAnswer(parsed);
      } else {
        if (!problem) displayContent += "\n\nğŸ’¡ å½“å‰é¡µé¢ä¸æ˜¯é¢˜ç›®é¡µé¢ï¼ˆæˆ–æœªè¯†åˆ«åˆ°é¢˜ç›®ï¼‰ã€‚";
        setAIAnswer(displayContent);
        hideEditableAnswer();
      }
    } catch (e) {
      setAILoading(false);
      W$2("[ask] é¡µé¢åˆ†æå¤±è´¥:", e);
      setAIError(`é¡µé¢åˆ†æå¤±è´¥: ${e.message}`);
    }
  }
  async function askAIForCurrent() {
    return askAIFusionMode();
  }
  var tpl$3 = '<div id="ykt-presentation-panel" class="ykt-panel">\n  <style>\n    #ykt-presentation-panel .slide-thumb.selected {\n      outline: 2px solid #3b82f6;\n      outline-offset: 2px;\n    }\n  </style>\n  <div class="panel-header">\n    <h3>è¯¾ä»¶æŸ¥çœ‹</h3>\n    <div class="panel-controls">\n      <label>\n        <input type="checkbox" id="ykt-show-all-slides"> åˆ‡æ¢å…¨éƒ¨é¡µé¢/é—®é¢˜é¡µé¢\n      </label>\n      <button id="ykt-ask-current">æé—®å½“å‰PPT</button>\n      <button id="ykt-ocr-current">æ–‡å­—è¯†åˆ«</button>\n      <button id="ykt-open-problem-list">é¢˜ç›®åˆ—è¡¨</button>\n      <button id="ykt-download-current">æˆªå›¾ä¸‹è½½</button>\n      <button id="ykt-download-pdf">æ•´å†Œä¸‹è½½(PDF)</button>\n      <span class="close-btn" id="ykt-presentation-close"><i class="fas fa-times"></i></span>\n    </div>\n  </div>\n\n  <div class="panel-body">\n    <div class="panel-left">\n      <div id="ykt-presentation-list" class="presentation-list"></div>\n    </div>\n    <div class="panel-right">\n      <div id="ykt-slide-view" class="slide-view">\n        <div class="slide-cover">\n          <div class="empty-message">é€‰æ‹©å·¦ä¾§çš„å¹»ç¯ç‰‡æŸ¥çœ‹è¯¦æƒ…</div>\n        </div>\n        <div id="ykt-problem-view" class="problem-view"></div>\n      </div>\n      <div id="ykt-ocr-panel" class="ocr-panel">\n        <div class="ocr-head">\n          <span>æ–‡å­—ç»“æœ</span>\n          <span id="ykt-ocr-status" class="ocr-status">æœªå¼€å§‹</span>\n        </div>\n        <div id="ykt-ocr-tip" class="ocr-tip">é€‰æ‹©è¯¾ä»¶é¡µåç‚¹å‡»â€œæ–‡å­—è¯†åˆ«â€ã€‚</div>\n        <textarea id="ykt-ocr-result" class="ocr-result" readonly placeholder="è¯†åˆ«ç»“æœä¼šæ˜¾ç¤ºåœ¨è¿™é‡Œï¼Œæ”¯æŒç›´æ¥å¤åˆ¶ã€‚"></textarea>\n        <div class="ocr-translate-bar">\n          <label for="ykt-translate-target">ç›®æ ‡è¯­è¨€</label>\n          <input type="text" id="ykt-translate-target" class="ocr-target-input" placeholder="é»˜è®¤ä½¿ç”¨æµè§ˆå™¨è¯­è¨€">\n          <button id="ykt-translate-toggle">ç¿»è¯‘</button>\n          <span id="ykt-translate-status" class="ocr-status">æœªç¿»è¯‘</span>\n        </div>\n        <div id="ykt-translate-tip" class="ocr-tip">é»˜è®¤ç¿»è¯‘åˆ°æµè§ˆå™¨è¯­è¨€ï¼Œä¹Ÿå¯æ‰‹åŠ¨ä¿®æ”¹ç›®æ ‡è¯­è¨€ã€‚</div>\n      </div>\n    </div>\n  </div>\n</div>\n';
  let mounted$3 = false;
  let host;
  let staticReportReady = false;
 //å·²ç»“æŸè¯¾ç¨‹
    const selectedSlideIds = new Set;
  const ocrResults = new Map;
  const translationResults = new Map;
  let currentResultMode = "original";
  function findSlideAcrossPresentations(idStr) {
    for (const [, pres] of repo.presentations) {
      const arr = pres?.slides || [];
      const hit = arr.find(s => String(s.id) === idStr);
      if (hit) return hit;
    }
    return null;
  }
  const L$1 = (...a) => console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][presentation]", ...a);
  const W$1 = (...a) => console.warn("[é›¨è¯¾å ‚åŠ©æ‰‹][WARN][presentation]", ...a);
  function $$3(sel) {
    return document.querySelector(sel);
  }
  /** â€”â€” è¿è¡Œæ—¶è‡ªæ„ˆï¼šæŠŠ repo.slides çš„æ•°å­—é”®è¿ç§»ä¸ºå­—ç¬¦ä¸²é”® â€”â€” */  function normalizeRepoSlidesKeys(tag = "presentation.mount") {
    try {
      if (!repo || !repo.slides || !(repo.slides instanceof Map)) {
        W$1("normalizeRepoSlidesKeys: repo.slides ä¸æ˜¯ Map");
        return;
      }
      const beforeKeys = Array.from(repo.slides.keys());
      const nums = beforeKeys.filter(k => typeof k === "number");
      let moved = 0;
      for (const k of nums) {
        const v = repo.slides.get(k);
        const ks = String(k);
        if (!repo.slides.has(ks)) {
          repo.slides.set(ks, v);
          moved++;
        }
        // ä¿ç•™æ—§é”®ä»¥é˜²å…¶ä»–æ¨¡å—è¿˜åœ¨ç”¨æ•°å­—é”®ï¼›ä»…æ‰“å°æç¤º
            }
      const afterSample = Array.from(repo.slides.keys()).slice(0, 8);
      L$1(`[normalizeRepoSlidesKeys@${tag}] æ€»é”®=${beforeKeys.length}ï¼Œæ•°å­—é”®=${nums.length}ï¼Œè¿ç§»ä¸ºå­—ç¬¦ä¸²=${moved}ï¼Œsample=`, afterSample);
    } catch (e) {
      W$1("normalizeRepoSlidesKeys error:", e);
    }
  }
  // Map æŸ¥æ‰¾
    function getSlideByAny(id) {
    const sid = id == null ? null : String(id);
    if (!sid) return {
      slide: null,
      hit: "none"
    };
    if (repo.slides.has(sid)) return {
      slide: repo.slides.get(sid),
      hit: "string"
    };
    const cross = findSlideAcrossPresentations(sid);
    if (cross) {
      repo.slides.set(sid, cross);
      return {
        slide: cross,
        hit: "cross-fill"
      };
    }
    return {
      slide: null,
      hit: "miss"
    };
  }
  function getSlideImageUrl(slide) {
    if (!slide) return "";
    // Prefer original image fields, then fallback-compatible fields.
        return slide.coverAlt || slide.cover || slide.image || slide.thumbnail || "";
  }
  function getCurrentSlideId() {
    return repo.currentSlideId != null ? String(repo.currentSlideId) : null;
  }
  function detectBrowserLanguage() {
    const lang = navigator.languages?.[0] || navigator.language || "en";
    return String(lang).trim() || "en";
  }
  function getTranslateTargetInput() {
    return $$3("#ykt-translate-target");
  }
  function getCurrentTargetLanguage() {
    const input = getTranslateTargetInput();
    const value = String(input?.value || "").trim();
    return value || detectBrowserLanguage();
  }
  // fetché™æ€PPT
    function getActiveOCRState() {
    const currentSlideId = getCurrentSlideId();
    return currentSlideId ? ocrResults.get(currentSlideId) || null : null;
  }
  function getActiveTranslationState() {
    const currentSlideId = getCurrentSlideId();
    return currentSlideId ? translationResults.get(currentSlideId) || null : null;
  }
  function renderSharedResult() {
    const resultEl = $$3("#ykt-ocr-result");
    if (!resultEl) return;
    const ocrState = getActiveOCRState();
    const translationState = getActiveTranslationState();
    const currentTargetLanguage = getCurrentTargetLanguage();
    const canShowTranslation = !!(translationState && !translationState.loading && !translationState.error && translationState.targetLanguage === currentTargetLanguage && translationState.text);
    resultEl.value = currentResultMode === "translated" && canShowTranslation ? translationState.text || "" : ocrState?.text || "";
  }
  function renderOCRState() {
    const currentSlideId = getCurrentSlideId();
    const statusEl = $$3("#ykt-ocr-status");
    const tipEl = $$3("#ykt-ocr-tip");
    if (!statusEl || !tipEl) return;
    if (!currentSlideId) {
      currentResultMode = "original";
      statusEl.textContent = "æœªé€‰æ‹©";
      statusEl.className = "ocr-status";
      tipEl.textContent = "é€‰æ‹©è¯¾ä»¶é¡µåç‚¹å‡»â€œæ–‡å­—è¯†åˆ«â€ã€‚";
      renderSharedResult();
      return;
    }
    const state = ocrResults.get(currentSlideId);
    if (!state) {
      statusEl.textContent = "æœm«ëŒ+Š×®º+º$zzb¥æÚ±î¸Â¸­yêë¢°k¢G§¦*^ªå¼€å§‹";
      statusEl.className = "ocr-status";
      tipEl.textContent = "å½“å‰é¡µè¿˜æ²¡æœ‰è¯†åˆ«ç»“æœã€‚";
      renderSharedResult();
      return;
    }
    if (state.loading) {
      statusEl.textContent = "è¯†åˆ«ä¸­";
      statusEl.className = "ocr-status is-loading";
      tipEl.textContent = "æ­£åœ¨è°ƒç”¨ OCR æ¨¡å‹è¯†åˆ«å½“å‰è¯¾ä»¶é¡µã€‚";
      renderSharedResult();
      return;
    }
    if (state.error) {
      currentResultMode = "original";
      statusEl.textContent = "å¤±è´¥";
      statusEl.className = "ocr-status is-error";
      tipEl.textContent = state.error;
      renderSharedResult();
      return;
    }
    statusEl.textContent = "å·²å®Œæˆ";
    statusEl.className = "ocr-status is-success";
    tipEl.textContent = currentResultMode === "translated" ? "å½“å‰æ­£åœ¨æ˜¾ç¤ºç¿»è¯‘ç»“æœã€‚" : "å½“å‰æ­£åœ¨æ˜¾ç¤ºåŸæ–‡è¯†åˆ«ç»“æœã€‚";
    renderSharedResult();
  }
  function renderTranslationState() {
    const currentSlideId = getCurrentSlideId();
    const statusEl = $$3("#ykt-translate-status");
    const tipEl = $$3("#ykt-translate-tip");
    const btnEl = $$3("#ykt-translate-toggle");
    if (!statusEl || !tipEl || !btnEl) return;
    if (!currentSlideId) {
      statusEl.textContent = "æœªç¿»è¯‘";
      statusEl.className = "ocr-status";
      tipEl.textContent = "é€‰æ‹©è¯¾ä»¶é¡µåå¯ç¿»è¯‘ OCR ç»“æœã€‚";
      btnEl.textContent = "ç¿»è¯‘";
      renderSharedResult();
      return;
    }
    const currentTargetLanguage = getCurrentTargetLanguage();
    const state = translationResults.get(currentSlideId);
    const hasCurrentTranslation = !!(state && state.targetLanguage === currentTargetLanguage);
    if (!hasCurrentTranslation) {
      if (currentResultMode === "translated") currentResultMode = "original";
      statusEl.textContent = "æœªç¿»è¯‘";
      statusEl.className = "ocr-status";
      tipEl.textContent = `å½“å‰ç›®æ ‡è¯­è¨€ï¼š${currentTargetLanguage}`;
      btnEl.textContent = "ç¿»è¯‘";
      renderSharedResult();
      return;
    }
    if (state.loading) {
      statusEl.textContent = "ç¿»è¯‘ä¸­";
      statusEl.className = "ocr-status is-loading";
      tipEl.textContent = `æ­£åœ¨ç¿»è¯‘ä¸º ${state.targetLanguage}`;
      btnEl.textContent = "ç¿»è¯‘ä¸­...";
      renderSharedResult();
      return;
    }
    if (state.error) {
      if (currentResultMode === "translated") currentResultMode = "original";
      statusEl.textContent = "å¤±è´¥";
      statusEl.className = "ocr-status is-error";
      tipEl.textContent = state.error;
      btnEl.textContent = "ç¿»è¯‘";
      renderSharedResult();
      return;
    }
    statusEl.textContent = "å·²ç¿»è¯‘";
    statusEl.className = "ocr-status is-success";
    tipEl.textContent = currentResultMode === "translated" ? `å½“å‰æ˜¾ç¤º ${state.targetLanguage} ç¿»è¯‘ç»“æœã€‚` : `å·²ç”Ÿæˆ ${state.targetLanguage} ç¿»è¯‘ç»“æœã€‚`;
    btnEl.textContent = currentResultMode === "translated" ? "æ˜¾ç¤ºåŸæ–‡" : "ç¿»è¯‘";
    renderSharedResult();
  }
  async function recognizeCurrentSlideText(options = {}) {
    const {silent: silent = false} = options;
    const slideId = getCurrentSlideId();
    if (!slideId) {
      if (!silent) ui.toast("è¯·å…ˆé€‰æ‹©è¦è¯†åˆ«çš„è¯¾ä»¶é¡µ", 2500);
      renderOCRState();
      return "";
    }
    currentResultMode = "original";
    ocrResults.set(slideId, {
      loading: true,
      text: "",
      error: ""
    });
    renderOCRState();
    renderTranslationState();
    try {
      const imageBase64 = await captureSlideImage(slideId);
      if (!imageBase64) throw new Error("å½“å‰è¯¾ä»¶é¡µå›¾ç‰‡è¯»å–å¤±è´¥");
      const text = await queryOCRVision(imageBase64, ui.config.ai);
      ocrResults.set(slideId, {
        loading: false,
        text: text || "æœªè¯†åˆ«åˆ°æ–‡å­—",
        error: ""
      });
      renderOCRState();
      renderTranslationState();
      if (!silent) ui.toast("æ–‡å­—è¯†åˆ«å®Œæˆ", 2e3);
      return text || "æœªè¯†åˆ«åˆ°æ–‡å­—";
    } catch (e) {
      ocrResults.set(slideId, {
        loading: false,
        text: "",
        error: `æ–‡å­—è¯†åˆ«å¤±è´¥: ${e.message || e}`
      });
      renderOCRState();
      renderTranslationState();
      if (!silent) ui.toast(`æ–‡å­—è¯†åˆ«å¤±è´¥: ${e.message || e}`, 3500);
      return "";
    }
  }
  async function translateCurrentOCRText() {
    const slideId = getCurrentSlideId();
    if (!slideId) {
      ui.toast("è¯·å…ˆé€‰æ‹©è¯¾ä»¶é¡µ", 2500);
      renderTranslationState();
      return;
    }
    const targetLanguage = getCurrentTargetLanguage();
    const existingState = translationResults.get(slideId);
    if (currentResultMode === "translated" && existingState && !existingState.loading && !existingState.error && existingState.targetLanguage === targetLanguage) {
      currentResultMode = "original";
      renderOCRState();
      renderTranslationState();
      return;
    }
    const ocrState = ocrResults.get(slideId);
    if (ocrState?.loading) {
      ui.toast("æ–‡å­—è¯†åˆ«è¿›è¡Œä¸­ï¼Œè¯·ç¨åå†è¯•", 2500);
      return;
    }
    let sourceText = ocrState?.text || "";
    if (!sourceText) sourceText = await recognizeCurrentSlideText({
      silent: true
    });
    if (!sourceText) {
      ui.toast("æ²¡æœ‰å¯ç¿»è¯‘çš„ OCR æ–‡æœ¬", 2500);
      renderTranslationState();
      return;
    }
    currentResultMode = "original";
    translationResults.set(slideId, {
      loading: true,
      text: "",
      error: "",
      targetLanguage: targetLanguage
    });
    renderTranslationState();
    try {
      const translated = await queryTranslationText(sourceText, targetLanguage, ui.config.ai);
      translationResults.set(slideId, {
        loading: false,
        text: translated || "",
        error: "",
        targetLanguage: targetLanguage
      });
      currentResultMode = "translated";
      renderOCRState();
      renderTranslationState();
      ui.toast(`ç¿»è¯‘å®Œæˆï¼š${targetLanguage}`, 2e3);
    } catch (e) {
      translationResults.set(slideId, {
        loading: false,
        text: "",
        error: `ç¿»è¯‘å¤±è´¥: ${e.message || e}`,
        targetLanguage: targetLanguage
      });
      currentResultMode = "original";
      renderOCRState();
      renderTranslationState();
      ui.toast(`ç¿»è¯‘å¤±è´¥: ${e.message || e}`, 3500);
    }
  }
  function isStudentLessonReportPage() {
    return /\/v2\/web\/student-lesson-report\//.test(window.location.pathname);
  }
  function extractCoverIndex(url) {
    try {
      const m = decodeURIComponent(url).match(/cover(\d+)[_.]/i);
      if (m) return parseInt(m[1], 10);
    } catch {}
    return null;
  }
  function getSlidesDocument() {
    if (document.querySelector("#content-page-wrap")) return document;
    for (let i = 0; i < window.frames.length; i++) try {
      const d = window.frames[i].document;
      if (d && d.querySelector("#content-page-wrap")) {
        console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][presentation][static-report] åœ¨å­ frame ä¸­æ‰¾åˆ°äº† content-page-wrap");
        return d;
      }
    } catch (e) {}
    console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][presentation][static-report] æ‰€æœ‰ frame ä¸­éƒ½æ²¡æœ‰ content-page-wrapï¼Œé€€å›é¡¶å±‚ document");
    return document;
  }
  function debugCheckSingleSlideImg() {
    const selector = "#content-page-wrap > div > aside > div.left-panel-scroll > div.left-panel-tab-content > div > section.slides-list > div.slide-item.f13.active-slide-item > div > img";
    const doc = getSlidesDocument();
    const img = doc.querySelector(selector);
    console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][presentation][static-report][debugCheck]", {
      href: window.location.href,
      hasContentPageWrap: !!document.querySelector("#content-page-wrap"),
      imgFound: !!img,
      selector: selector
    });
    if (img) {
      console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][presentation][static-report][debugCheck] img.outerHTML =", img.outerHTML);
      console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][presentation][static-report][debugCheck] img.src =", img.currentSrc || img.src || img.getAttribute("src"));
    }
    return img;
  }
  function collectStaticSlideURLsFromDom() {
    const urls = new Set;
    // å…ˆè·‘ä¸€éæœ€ç²¾ç¡®çš„ path æ¥çœ‹çœ‹å½“å‰ frame åˆ°åº•æœ‰æ²¡æœ‰è¿™å¼ å›¾
        const debugImg = debugCheckSingleSlideImg();
    if (debugImg) {
      const src = debugImg.currentSrc || debugImg.src || debugImg.getAttribute("src") || "";
      if (src && /thu-private-qn\.yuketang\.cn\/slide\/\d+\//.test(src) && /\.(png|jpg|jpeg|webp)(\?|#|$)/i.test(src)) urls.add(src);
    }
    const doc = getSlidesDocument();
    const candidates = doc.querySelectorAll("section.slides-list img, .slides-list img," + "div.slide-item img," + 'img[alt="cover"]');
    console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][presentation][static-report] DOM å€™é€‰ img æ•°é‡ =", candidates.length);
    candidates.forEach((img, idx) => {
      const src = img.currentSrc || img.src || img.getAttribute("src") || "";
      console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][presentation][static-report] æ£€æŸ¥ img#" + idx, {
        className: img.className,
        outerHTML: img.outerHTML.slice(0, 200) + (img.outerHTML.length > 200 ? "â€¦" : ""),
        src: src
      });
      if (!src) return;
      if (/thu-private-qn\.yuketang\.cn\/slide\/\d+\//.test(src) && /\.(png|jpg|jpeg|webp)(\?|#|$)/i.test(src)) urls.add(src);
    });
    const arr = [ ...urls ];
    console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][presentation][static-report] DOM æ”¶é›†åˆ° slide URLï¼š", arr);
    return arr;
  }
  function ensureStaticReportPresentation() {
    if (!isStudentLessonReportPage()) return false;
    const pid = `static:${window.location.pathname}`;
    // å¦‚æœå·²ç»æ³¨å…¥è¿‡ï¼Œå°±ä¸å†é‡å¤æ‰«æ & æ‰“å°æ—¥å¿—ï¼Œç›´æ¥è¿”å› false
        if (staticReportReady && repo.presentations.has(pid)) return false;
    const urlsFromDom = collectStaticSlideURLsFromDom();
    const urls = Array.from(new Set([ ...urlsFromDom ]));
    if (!urls.length) {
      console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][presentation][static-report] ä¾ç„¶æ²¡æœ‰å‘ç°ä»»ä½• slide URL");
      return false;
    }
    const withIndex = urls.map((u, i) => ({
      u: u,
      idx: extractCoverIndex(u) ?? i + 1
    }));
    withIndex.sort((a, b) => a.idx - b.idx);
    const slides = withIndex.map(({u: u, idx: idx}) => {
      const id = `static-${idx}`;
      return {
        id: id,
        index: idx,
        title: `ç¬¬ ${idx} é¡µ`,
        thumbnail: u,
        image: u,
        problem: null
      };
    });
    const titleFromPage = document.querySelector(".lesson-title, .title, h1, .header-title")?.textContent?.trim() || "é™æ€è¯¾ä»¶ï¼ˆæŠ¥å‘Šé¡µï¼‰";
    const presentation = {
      id: pid,
      title: titleFromPage,
      slides: slides
    };
    const existed = repo.presentations.has(pid);
    repo.presentations.set(pid, presentation);
    let filled = 0;
    for (const s of slides) {
      const sid = String(s.id);
      if (!repo.slides.has(sid)) {
        repo.slides.set(sid, s);
        filled++;
      }
    }
    if (!repo.currentPresentationId) repo.currentPresentationId = pid;
    staticReportReady = true;
 // â˜… æ ‡è®°ä¸ºå·²å®Œæˆ
        console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][presentation][static-report] å·²æ³¨å…¥/æ›´æ–° presentation", {
      pid: pid,
      title: presentation.title,
      slideCount: slides.length,
      newSlidesFilled: filled,
      existed: existed,
      sample: slides.slice(0, 3).map(s => s.image)
    });
    return true;
  }
  function mountPresentationPanel() {
    if (mounted$3) return host;
    normalizeRepoSlidesKeys("presentation.mount");
    const wrapper = document.createElement("div");
    wrapper.innerHTML = tpl$3;
    document.body.appendChild(wrapper.firstElementChild);
    host = document.getElementById("ykt-presentation-panel");
    $$3("#ykt-presentation-close")?.addEventListener("click", () => showPresentationPanel(false));
    $$3("#ykt-open-problem-list")?.addEventListener("click", () => {
      showPresentationPanel(false);
      window.dispatchEvent(new CustomEvent("ykt:open-problem-list"));
    });
    $$3("#ykt-ask-current")?.addEventListener("click", () => {
      if (selectedSlideIds.size > 0) {
        const slides = [];
        for (const sid of selectedSlideIds) {
          const lookup = getSlideByAny(sid);
          const imageUrl = getSlideImageUrl(lookup.slide);
          if (imageUrl) slides.push({
            slideId: sid,
            imageUrl: imageUrl
          });
        }
        L$1("ç‚¹å‡»â€œæé—®å½“å‰PPTâ€(å¤šé€‰)", {
          selectedCount: selectedSlideIds.size,
          slidesCount: slides.length
        });
        if (slides.length === 0) return ui.toast("æ‰€é€‰é¡µé¢æ— å¯ç”¨å›¾ç‰‡", 2500);
        window.dispatchEvent(new CustomEvent("ykt:ask-ai-for-slides", {
          detail: {
            slides: slides,
            source: "manual"
          }
        }));
        window.dispatchEvent(new CustomEvent("ykt:open-ai"));
        return;
      }
      // ===== å¦åˆ™èµ°æ—§é€»è¾‘ï¼šå•é¡µ =====
            const sid = repo.currentSlideId != null ? String(repo.currentSlideId) : null;
      const lookup = getSlideByAny(sid);
      L$1("ç‚¹å‡»â€œæé—®å½“å‰PPTâ€", {
        currentSlideId: sid,
        lookupHit: lookup.hit,
        hasSlide: !!lookup.slide
      });
      if (!sid) return ui.toast("è¯·å…ˆåœ¨å·¦ä¾§é€‰æ‹©ä¸€é¡µPPT", 2500);
      const imageUrl = getSlideImageUrl(lookup.slide);
      window.dispatchEvent(new CustomEvent("ykt:ask-ai-for-slide", {
        detail: {
          slideId: sid,
          imageUrl: imageUrl
        }
      }));
      window.dispatchEvent(new CustomEvent("ykt:open-ai"));
    });
    $$3("#ykt-download-current")?.addEventListener("click", downloadCurrentSlide);
    $$3("#ykt-ocr-current")?.addEventListener("click", recognizeCurrentSlideText);
    $$3("#ykt-translate-toggle")?.addEventListener("click", translateCurrentOCRText);
    $$3("#ykt-download-pdf")?.addEventListener("click", downloadPresentationPDF);
    const translateTargetInput = getTranslateTargetInput();
    if (translateTargetInput && !translateTargetInput.value.trim()) translateTargetInput.value = detectBrowserLanguage();
    translateTargetInput?.addEventListener("change", () => {
      if (currentResultMode === "translated") currentResultMode = "original";
      renderOCRState();
      renderTranslationState();
    });
    const cb = $$3("#ykt-show-all-slides");
    cb.checked = !!ui.config.showAllSlides;
    cb.addEventListener("change", () => {
      ui.config.showAllSlides = !!cb.checked;
      ui.saveConfig();
      L$1("åˆ‡æ¢ showAllSlides =", ui.config.showAllSlides);
      updatePresentationList();
    });
    mounted$3 = true;
    renderOCRState();
    renderTranslationState();
    L$1("mountPresentationPanel å®Œæˆ");
    return host;
  }
  function showPresentationPanel(visible = true) {
    mountPresentationPanel();
    host.classList.toggle("visible", !!visible);
    if (visible) updatePresentationList();
    const presBtn = document.getElementById("ykt-btn-pres");
    if (presBtn) presBtn.classList.toggle("active", !!visible);
    L$1("showPresentationPanel", {
      visible: visible
    });
  }
  function updatePresentationList() {
    mountPresentationPanel();
    try {
      if (isStudentLessonReportPage()) ensureStaticReportPresentation();
    } catch (e) {
      W$1("[static-report] æ£€æµ‹/æ³¨å…¥å¤±è´¥ï¼š", e);
    }
    if (!window.__ykt_static_dom_mo) {
      window.__ykt_static_dom_mo = true;
      let times = 0;
      const mo = new MutationObserver(() => {
        if (!isStudentLessonReportPage()) return;
        if (++times > 20) return;
        console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][presentation][static-report] DOM å˜æ›´ï¼Œå°è¯•é‡æ–°æ”¶é›† slide URL (times =", times, ")");
        const injected = ensureStaticReportPresentation();
        if (injected) {
          console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][presentation][static-report] DOM ä¸­å·²æ‰¾åˆ° slideï¼Œåœæ­¢ç›‘å¬å¹¶åˆ·æ–°é¢æ¿");
          try {
            mo.disconnect();
          } catch (e) {}
          updatePresentationList();
        }
      });
      const rootSelector = "#content-page-wrap > div > aside > div.left-panel-scroll > div.left-panel-tab-content > div > section.slides-list";
      let target = document.querySelector(rootSelector) || document.querySelector("section.slides-list") || document.body;
      console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][presentation][static-report] MutationObserver ç›‘å¬ç›®æ ‡ï¼š", {
        useBody: target === document.body,
        hasSlidesList: target !== document.body
      });
      mo.observe(target, {
        childList: true,
        subtree: true
      });
    }
    const listEl = document.getElementById("ykt-presentation-list");
    if (!listEl) {
      W$1("updatePresentationList: ç¼ºå°‘å®¹å™¨");
      return;
    }
    listEl.innerHTML = "";
    if (repo.presentations.size === 0) {
      listEl.innerHTML = '<p class="no-presentations">æš‚æ— è¯¾ä»¶è®°å½•</p>';
      W$1("æ—  presentations");
      return;
    }
    const currentPath = window.location.pathname;
    const m = currentPath.match(/\/lesson\/fullscreen\/v3\/([^/]+)/);
    const currentLessonFromURL = m ? m[1] : null;
    L$1("è¿‡æ»¤è¯¾ä»¶", {
      currentLessonFromURL: currentLessonFromURL,
      repoCurrentLessonId: repo.currentLessonId
    });
    const filtered = new Map;
    for (const [id, p] of repo.presentations) if (currentLessonFromURL && repo.currentLessonId && currentLessonFromURL === repo.currentLessonId) filtered.set(id, p); else if (!currentLessonFromURL) filtered.set(id, p); else if (currentLessonFromURL === repo.currentLessonId) filtered.set(id, p);
    const presentationsToShow = filtered.size > 0 ? filtered : repo.presentations;
    L$1("å±•ç¤ºè¯¾ä»¶æ•°é‡=", presentationsToShow.size);
    try {
      let filled = 0, total = 0;
      for (const [, pres] of presentationsToShow) {
        const arr = pres?.slides || [];
        total += arr.length;
        for (const s of arr) {
          const sid = String(s.id);
          if (!repo.slides.has(sid)) {
            repo.slides.set(sid, s);
            filled++;
          }
        }
      }
      const sample = Array.from(repo.slides.keys()).slice(0, 8);
      L$1("[hydrate slides â†’ repo.slides]", {
        filled: filled,
        totalVisibleSlides: total,
        sampleKeys: sample
      });
    } catch (e) {
      W$1("hydrate repo.slides å¤±è´¥ï¼š", e);
    }
    for (const [id, presentation] of presentationsToShow) {
      const cont = document.createElement("div");
      cont.className = "presentation-container";
      const titleEl = document.createElement("div");
      titleEl.className = "presentation-title";
      titleEl.innerHTML = `\n      <span>${presentation.title || `è¯¾ä»¶ ${id}`}</span>\n      <i class="fas fa-download download-btn" title="ä¸‹è½½è¯¾ä»¶"></i>\n    `;
      cont.appendChild(titleEl);
      titleEl.querySelector(".download-btn")?.addEventListener("click", e => {
        e.stopPropagation();
        L$1("ç‚¹å‡»ä¸‹è½½è¯¾ä»¶", {
          presId: String(presentation.id)
        });
        downloadPresentation(presentation);
      });
      const slidesWrap = document.createElement("div");
      slidesWrap.className = "slide-thumb-list";
      const showAll = !!ui.config.showAllSlides;
      const slides = presentation.slides || [];
      const slidesToShow = showAll ? slides : slides.filter(s => s.problem);
      const currentIdStr = repo.currentSlideId != null ? String(repo.currentSlideId) : null;
      L$1("æ¸²æŸ“è¯¾ä»¶ç¼©ç•¥å›¾", {
        presId: String(presentation.id),
        slidesTotal: slides.length,
        slidesShown: slidesToShow.length,
        currentSlideId: currentIdStr
      });
      for (const s of slidesToShow) {
        const presIdStr = String(presentation.id);
        const slideIdStr = String(s.id);
        const thumb = document.createElement("div");
        thumb.className = "slide-thumb";
        thumb.dataset.slideId = slideIdStr;
        if (currentIdStr && slideIdStr === currentIdStr) thumb.classList.add("active");
        if (s.problem) {
          const pid = s.problem.problemId;
          const status = repo.problemStatus.get(pid);
          if (status) thumb.classList.add("unlocked");
          if (s.problem.result) thumb.classList.add("answered");
        }
        thumb.addEventListener("click", ev => {
          // ===== Ctrl/Cmd å¤šé€‰ï¼šä¸æ”¹å˜ currentSlideIdï¼Œä¸è§¦å‘å¯¼èˆªï¼Œä»…åˆ‡æ¢ selected =====
          if (ev && (ev.ctrlKey || ev.metaKey)) {
            ev.preventDefault();
            if (selectedSlideIds.has(slideIdStr)) {
              selectedSlideIds.delete(slideIdStr);
              thumb.classList.remove("selected");
            } else {
              selectedSlideIds.add(slideIdStr);
              thumb.classList.add("selected");
            }
            L$1("ç¼©ç•¥å›¾å¤šé€‰åˆ‡æ¢", {
              slideIdStr: slideIdStr,
              selectedCount: selectedSlideIds.size
            });
            return;
          }
          // ===== æ™®é€šç‚¹å‡»ï¼šæ²¿ç”¨åŸé€»è¾‘ï¼Œå¹¶æ¸…ç©ºå¤šé€‰ =====
                    selectedSlideIds.clear();
          slidesWrap.querySelectorAll(".slide-thumb.selected").forEach(el => el.classList.remove("selected"));
          repo.currentPresentationId = presIdStr;
          repo.currentSlideId = slideIdStr;
          slidesWrap.querySelectorAll(".slide-thumb.active").forEach(el => el.classList.remove("active"));
          thumb.classList.add("active");
          const actives = slidesWrap.querySelectorAll(".slide-thumb.active");
          const allIds = Array.from(slidesWrap.querySelectorAll(".slide-thumb")).map(x => x.dataset.slideId);
          L$1("é«˜äº®çŠ¶æ€", {
            activeCount: actives.length,
            activeId: thumb.dataset.slideId,
            allIdsSample: allIds.slice(0, 10)
          });
          updateSlideView();
          if (!repo.slides.has(slideIdStr)) {
            const cross = findSlideAcrossPresentations(slideIdStr);
            if (cross) {
              repo.slides.set(slideIdStr, cross);
              L$1("click-fill repo.slides <- cross", {
                slideIdStr: slideIdStr
              });
            }
          }
          try {
            const keysSample = Array.from(repo.slides.keys()).slice(0, 8);
            const typeDist = keysSample.reduce((m, k) => (m[typeof k] = (m[typeof k] || 0) + 1, 
            m), {});
            L$1("repo.slides keys sample:", keysSample, "typeDist:", typeDist);
          } catch {}
          const detail = {
            slideId: slideIdStr,
            presentationId: presIdStr
          };
          L$1("æ´¾å‘äº‹ä»¶ ykt:presentation:slide-selected", detail);
          window.dispatchEvent(new CustomEvent("ykt:presentation:slide-selected", {
            detail: detail
          }));
          L$1("è°ƒç”¨ actions.navigateTo ->", {
            presIdStr: presIdStr,
            slideIdStr: slideIdStr
          });
          actions.navigateTo(presIdStr, slideIdStr);
        });
        const img = document.createElement("img");
        if (presentation.width && presentation.height) img.style.aspectRatio = `${presentation.width}/${presentation.height}`;
        img.src = s.thumbnail || "";
        img.alt = s.title || `ç¬¬ ${s.page ?? ""} é¡µ`;
        img.onerror = function() {
          W$1("ç¼©ç•¥å›¾åŠ è½½å¤±è´¥ï¼Œç§»é™¤è¯¥é¡¹", {
            slideIdStr: slideIdStr,
            src: img.src
          });
          if (thumb.parentNode) thumb.parentNode.removeChild(thumb);
        };
        const idx = document.createElement("span");
        idx.className = "slide-index";
        idx.textContent = s.index ?? "";
        thumb.appendChild(img);
        thumb.appendChild(idx);
        slidesWrap.appendChild(thumb);
      }
      cont.appendChild(slidesWrap);
      listEl.appendChild(cont);
    }
  }
  function downloadPresentation(presentation) {
    repo.currentPresentationId = String(presentation.id);
    L$1("downloadPresentation -> è®¾ç½® currentPresentationId", repo.currentPresentationId);
    downloadPresentationPDF();
  }
  function updateSlideView() {
    mountPresentationPanel();
    const slideView = $$3("#ykt-slide-view");
    const problemView = $$3("#ykt-problem-view");
    slideView.querySelector(".slide-cover")?.classList.add("hidden");
    problemView.innerHTML = "";
    renderOCRState();
    renderTranslationState();
    const curId = getCurrentSlideId();
    const lookup = getSlideByAny(curId);
    L$1("updateSlideView", {
      curId: curId,
      lookupHit: lookup.hit,
      hasInMap: !!lookup.slide
    });
    if (!curId) {
      slideView.querySelector(".slide-cover")?.classList.remove("hidden");
      renderOCRState();
      renderTranslationState();
      return;
    }
    const slide = lookup.slide;
    if (!slide) {
      W$1("updateSlideView: æ ¹æ® curId æœªå–åˆ° slide", {
        curId: curId
      });
      renderTranslationState();
      return;
    }
    const cover = document.createElement("div");
    cover.className = "slide-cover";
    const img = document.createElement("img");
    img.crossOrigin = "anonymous";
    img.src = getSlideImageUrl(slide);
    img.alt = slide.title || "";
    cover.appendChild(img);
    if (slide.problem) {
      const prob = slide.problem;
      const box = document.createElement("div");
      box.className = "problem-box";
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "problem-box-close";
      closeBtn.title = "å…³é—­é¢˜å¹²æµ®æ¡†";
      closeBtn.setAttribute("aria-label", "å…³é—­é¢˜å¹²æµ®æ¡†");
      closeBtn.textContent = "Ã—";
      closeBtn.addEventListener("click", ev => {
        ev.stopPropagation();
        box.remove();
      });
      box.appendChild(closeBtn);
      const head = document.createElement("div");
      head.className = "problem-head";
      head.textContent = prob.body || `é¢˜ç›® ${prob.problemId}`;
      box.appendChild(head);
      if (Array.isArray(prob.options) && prob.options.length) {
        const opts = document.createElement("div");
        opts.className = "problem-options";
        prob.options.forEach(o => {
          const li = document.createElement("div");
          li.className = "problem-option";
          li.textContent = `${o.key}. ${o.value}`;
          opts.appendChild(li);
        });
        box.appendChild(opts);
      }
      const problemActions = document.createElement("div");
      problemActions.className = "problem-actions";
      const forceAI = document.createElement("button");
      forceAI.type = "button";
      forceAI.textContent = "AI å¼ºåˆ¶ä½œç­”";
      forceAI.addEventListener("click", async ev => {
        ev.stopPropagation();
        const status = repo.problemStatus.get(String(prob.problemId)) || repo.problemStatus.get(prob.problemId);
        const endTime = Number(status?.endTime ?? prob.endTime);
        const expired = Number.isFinite(endTime) && Date.now() >= endTim«ëŒ+Š×®º+º$zzb¥æÖS°¢–b†W‡—&VBbbv–æF÷ræ6öæf—&Ò‚.‹ù˜>š)[{.‹ø~hŠ®jÚ.i{n™{NûÈÄ’[nKÛşyJ[Ë®X‹nŠ^KªNhê^Xú>8.{º~{ºŞY	~ûÉò"’’&WGW&ã°¢f÷&6T’æF—6&ÆVBÒG'VS°¢G'’°¢6öç7B&W7VÇBÒv—B7F–öç2æf÷&6T”ç7vW"‡&ö"ç&ö&ÆVÔ–BÂ°¢f÷&6U&WG'“¢W‡—&V@¢Ò“°¢–b‚&W7VÇCòæö²’V’çFö7B†’[Ë®X‹nKÙÎzÙNiÊ®ZèÎh‰ûÉ¢G·&W7VÇCòæW'&÷#òæÖW76vRÇÂ&W7VÇCòç&V6öâÇÂ.iÊ®yú^XéşYº'ÖÂFS2“°¢Òf–æÆÇ’°¢f÷&6T’æF—6&ÆVBÒfÇ6S°¢WFFU6Æ–FUf–Wr‚“°¢Ğ¢Ò“°¢&ö&ÆVÔ7F–öç2æVæD6†–ÆB†f÷&6T’“°¢6öç7BVF—Dç7vW"ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&'WGFöâ"“°¢VF—Dç7vW"çG—RÒ&'WGFöâ#°¢VF—Dç7vW"çFW‡D6öçFVçBÒ.{Én‹éşŠ^KªB#°¢VF—Dç7vW"æFDWfVçDÆ—7FVæW"‚&6Æ–6²"ÂWbÓâ°¢Wbç7F÷&÷vF–öâ‚“°¢v–æF÷ræF—7F6„WfVçB†æWr7W7FöÔWfVçB‚'–·C¦÷Vâ×&ö&ÆVÒÖÆ—7B"Â°¢FWF–Ã¢°¢&ö&ÆVÔ–C¢&ö"ç&ö&ÆVÔ–@¢Ğ¢Ò’“°¢Ò“°¢&ö&ÆVÔ7F–öç2æVæD6†–ÆB†VF—Dç7vW"“°¢&÷‚æVæD6†–ÆB‡&ö&ÆVÔ7F–öç2“°¢&ö&ÆVÕf–WræVæD6†–ÆB†&÷‚“°¢Ğ¢6Æ–FUf–Wræ–ææW$…DÔÂÒ"#°¢6Æ–FUf–WræVæD6†–ÆB†6÷fW"“°¢6Æ–FUf–WræVæD6†–ÆB‡&ö&ÆVÕf–Wr“°¢&VæFW$ô5%7FFR‚“°¢&VæFW%G&ç6ÆF–öå7FFR‚“°¢Ğ¢7–æ2gVæ7F–öâF÷væÆöD7W'&VçE6Æ–FR‚’°¢6öç7B6–BÒ&Wòæ7W'&VçE6Æ–FT–BÒçVÆÂò7G&–ær‡&Wòæ7W'&VçE6Æ–FT–B’¢çVÆÃ°¢6öç7BÆöö·WÒvWE6Æ–FT'”ç’‡6–B“°¢ÂC‚&F÷væÆöD7W'&VçE6Æ–FR"Â°¢6–C¢6–BÀ¢Æöö·W†—C¢Æöö·Wæ†—BÀ¢†3¢Æöö·Wç6Æ–FP¢Ò“°¢–b‚6–B’&WGW&âV’çFö7B‚.Šû~XX˜hºKˆš^ŠûîK»bşš)yºâ"“°¢6öç7B6Æ–FRÒÆöö·Wç6Æ–FS°¢–b‚6Æ–FR’&WGW&ã°¢G'’°¢6öç7B‡FÖÃ&6çf2Òv—BVç7W&T‡FÖÃ$6çf2‚“°¢6öç7BVÂÒFö7VÖVçBævWDVÆVÖVçD'”–B‚'–·B×6Æ–FR×f–Wr"“°¢6öç7B6çf2Òv—B‡FÖÃ&6çf2†VÂÂ°¢W6T4õ%3¢G'VRÀ¢ÆÆ÷uF–çC¢fÇ6P¢Ò“°¢6öç7BÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&"“°¢æF÷væÆöBÒ6Æ–FRÒG·6–GÒçæv°¢æ‡&VbÒ6çf2çFôFFU$Â‚&–ÖvR÷ær"“°¢æ6Æ–6²‚“°¢Ò6F6‚†R’°¢V’çFö7B†hŠ®Y»îZK‹JS¢G¶RæÖW76vWÖ“°¢Ğ¢Ğ¢7–æ2gVæ7F–öâF÷væÆöE&W6VçFF–öåDb‚’°¢6öç7B–BÒ&Wòæ7W'&VçE&W6VçFF–öä–BÒçVÆÂò7G&–ær‡&Wòæ7W'&VçE&W6VçFF–öä–B’¢çVÆÃ°¢ÂC‚&F÷væÆöE&W6VçFF–öåDb"Â°¢–C¢–BÀ¢†5&W3¢–Bò&Wòç&W6VçFF–öç2æ†2‡–B’¢fÇ6P¢Ò“°¢–b‚–B’&WGW&âV’çFö7B‚.Šû~XXYÊ[znKê~˜hºKˆK»ŞŠûîK»b"“°¢6öç7B&W2Ò&Wòç&W6VçFF–öç2ævWB‡–B“°¢–b‚&W2ÇÂ'&’æ—4'&’‡&W2ç6Æ–FW2’ÇÂ&W2ç6Æ–FW2æÆVæwF‚ÓÓÒ’&WGW&âV’çFö7B‚.iÊ®h›îX‹Šú^ŠûîK»ny¨Nš^™Ú""“°¢6öç7B6†÷tÆÂÒV’æ6öæf–rç6†÷tÆÅ6Æ–FW3°¢6öç7B6Æ–FW2Ò&W2ç6Æ–FW2æf–ÇFW"‡2Óâ6†÷tÆÂÇÂ2ç&ö&ÆVÒ“°¢–b‡6Æ–FW2æÆVæwF‚ÓÓÒ’&WGW&âV’çFö7B‚.[Ù>X˜ŞzÙ¾˜Kˆ¾k*iÈXúşZûÎX{®y¨Nš^™Ú""“°¢G'’°¢v—BVç7W&T§5Db‚“°¢6öç7B¶§5Dc¢§5DgÒÒv–æF÷ræ§7FbÇÂ·Ó°¢–b‚§5Db’F‡&÷ræWrW'&÷"‚&§5DbiÊ®Xª‹ÛŞh‰X©ò"“°¢6öç7BFö2ÒæWr§5Db‡°¢Væ—C¢'B"À¢f÷&ÖC¢&B"À¢÷&–VçFF–öã¢'÷'G&—B ¢Ò“°¢6öç7BvUrÒS“RÂvT‚ÒƒC#°¢6öç7BÖ&v–âÒ#C°¢6öç7BÖ…rÒvUrÒÖ&v–â¢#°¢6öç7BÖ„‚ÒvT‚ÒÖ&v–â¢#°¢6öç7BÆöD–ÖvRÒ7&2ÓâæWr&öÖ—6R‚‡&W6öÇfRÂ&V¦V7B’Óâ°¢6öç7B–ÖrÒæWr–ÖvS°¢–Öræ7&÷74÷&–v–âÒ&æöç–Ö÷W2#°¢–ÖræöæÆöBÒ‚’Óâ&W6öÇfR†–Ör“°¢–ÖræöæW'&÷"Ò&V¦V7C°¢–Örç7&2Ò7&3°¢Ò“°¢f÷"†ÆWB’Ò²’Â6Æ–FW2æÆVæwFƒ²’²²’°¢6öç7B2Ò6Æ–FW5¶•Ó°¢6öç7BW&ÂÒvWE6Æ–FT–ÖvUW&Â‡2“°¢–b‚W&Â’°¢–b†’â’Fö2æFEvR‚“°¢6öçF–çVS°¢Ğ¢6öç7B–ÖrÒv—BÆöD–ÖvR‡W&Â“°¢6öç7B—rÒ–ÖrææGW&Åv–GF‚ÇÂ–Örçv–GFƒ°¢6öç7B–‚Ò–ÖrææGW&Ä†V–v‡BÇÂ–Öræ†V–v‡C°¢6öç7B"ÒÖF‚æÖ–â†Ö…rò—rÂÖ„‚ò–‚“°¢6öç7BrÒÖF‚æfÆö÷"†—r¢"“°¢6öç7B‚ÒÖF‚æfÆö÷"†–‚¢"“°¢6öç7B‚ÒÖF‚æfÆö÷"‚‡vUrÒr’ò"“°¢6öç7B’ÒÖF‚æfÆö÷"‚‡vT‚Ò‚’ò"“°¢–b†’â’Fö2æFEvR‚“°¢Fö2æFD–ÖvR†–ÖrÂ%är"Â‚Â’ÂrÂ‚“°¢Ğ¢6öç7BæÖRÒ‡&W2çF—FÆRÇÂŠûîK»bÒG·–GÖ’ç&WÆ6R‚õµÅÂó¢£ò#ÃçÅÒörÂ%ò"“°¢Fö2ç6fR†G¶æÖWÒçFf“°¢Ò6F6‚†R’°¢V’çFö7B†ZûÎX{¢DbZK‹J^ûÉ¢G¶RæÖW76vRÇÂWÖ“°¢Ğ¢Ğ¢f"GÂC"ÒsÆF—b–CÒ'–·B×&ö&ÆVÒÖÆ—7B×æVÂ"6Æ73Ò'–·B×æVÂ#åÆâÆF—b6Æ73Ò'æVÂÖ†VFW"#åÆâÆƒ3îŠûîZ.Kšš)X‰~ŠƒÂöƒ3åÆâÇ7â6Æ73Ò&6Æ÷6RÖ'Fâ"–CÒ'–·B×&ö&ÆVÒÖÆ—7BÖ6Æ÷6R#ãÆ’6Æ73Ò&f2f×F–ÖW2#ãÂö“ãÂ÷7ãåÆâÂöF—cåÆåÆâÆF—b6Æ73Ò'æVÂÖ&öG’#åÆâÆF—b–CÒ'–·B×&ö&ÆVÒÖÆ—7B"6Æ73Ò'&ö&ÆVÒÖÆ—7B#åÆâÇƒ62ÒÒyK&ö&ÆVÒÖÆ—7Bæ§2XªhZ¾XX^ûÉ¥Æâç&ö&ÆVÒ×&÷uÆâç&ö&ÆVÒ×F—FÆUÆâç&ö&ÆVÒÖÖWFÆâç&ö&ÆVÒÖ7F–öç2iú^yÈ²òŠz>zÙBò[{.KÙÎzÙB’ÒÕÇƒ6UÆâÂöF—cåÆâÂöF—cåÆãÂöF—cåÆâs°¢gVæ7F–öâ6ÆVW†×2’°¢&WGW&âæWr&öÖ—6R‡"Óâ6WEF–ÖV÷WB‡"ÂÖF‚æÖ‚ƒÂ×2Â’’“°¢Ğ¢gVæ7F–öâ6Æ4WFõv—D×2‚’°¢6öç7B&6RÒÖF‚æÖ‚ƒÂV“òæ6öæf–sòæWFôç7vW$FVÆ’óò“°¢6öç7B&æBÒÖF‚æÖ‚ƒÂV“òæ6öæf–sòæWFôç7vW%&æFöÔFVÆ’óò“°¢&WGW&â&6R²‡&æBòÖF‚æfÆö÷"„ÖF‚ç&æFöÒ‚’¢&æB’¢“°¢Ğ¢gVæ7F–öâ6†÷VÆDWFôç7vW$f÷$ÆW76öåò†ÆW76öä–B’°¢–b‡V“òæ6öæf–sòæWFôç7vW"’&WGW&âG'VS°¢–b‚ÆW76öä–B’&WGW&âfÇ6S°¢–b‡&WóòæWFô¦ö–æVDÆW76öç3òæ†2†ÆW76öä–B’bbV“òæ6öæf–sòæWFôç7vW$öäWFô¦ö–â’&WGW&âG'VS°¢–b‡&Wóòæf÷&6TWFôç7vW$ÆW76öç3òæ†2†ÆW76öä–B’’&WGW&âG'VS°¢&WGW&âfÇ6S°¢Ğ¢6öç7BDTdTÅEô„TDU%2Ò‚’Óâ‡°¢$6öçFVçBÕG—R#¢&Æ–6F–öâö§6öâ"À¢‡F'£¢'–·B"À¢%‚Ô6Æ–VçB#¢&ƒR"À¢WF†÷&—¦F–öã¢$&V&W""²‡G—VöbÆö6Å7F÷&vRÓÒ'VæFVf–æVB"òÆö6Å7F÷&vRævWD—FVÒ‚$WF†÷&—¦F–öâ"’¢""¢Ò“°¢ò¢ ¢¢Æ÷rÖÆWfVÂõ5B†VÇW"W6–ær„ÔÄ‡GG&WVW7BFòÆ–vâv—F‚6—FR&WV—&VÖVçG2à¢¢&Ò·7G&–æwÒW&À¢¢&Ò¶ö&¦V7GÒFF¢¢&Òµ&V6÷&CÇ7G&–ærÇ7G&–æsçÒ†VFW'0¢¢&WGW&ç2µ&öÖ—6SÆç“çĞ¢¢ògVæ7F–öâ†‡%÷7B‡W&ÂÂFFÂ†VFW'2’°¢&WGW&âæWr&öÖ—6R‚‡&W6öÇfRÂ&V¦V7B’Óâ°¢G'’°¢6öç7B†‡"ÒæWr„ÔÄ‡GG&WVW7C°¢†‡"æ÷Vâ‚%õ5B"ÂW&Â“°¢f÷"†6öç7B¶²ÂeÒöbö&¦V7BæVçG&–W2††VFW'2ÇÂ·Ò’’†‡"ç6WE&WVW7D†VFW"†²Âb“°¢†‡"æöæÆöBÒ‚’Óâ°¢G'’°¢6öç7B&W7Ò¥4ôâç'6R‡†‡"ç&W7öç6UFW‡B“°¢–b‡&W7bbG—Vöb&W7ÓÓÒ&ö&¦V7B"’&W6öÇfR‡&W7“²VÇ6R&V¦V7B†æWrW'&÷"‚.Šz>iéY8Ş[©NZK‹JR"’“°¢Ò6F6‚°¢&V¦V7B†æWrW'&÷"‚.Šz>iéY8Ş[©NZK‹JR"’“°¢Ğ¢Ó°¢†‡"æöæW'&÷"Ò‚’Óâ&V¦V7B†æWrW'&÷"‚.{Ù{¹ÎŠû~k.ZK‹JR"’“°¢†‡"ç6VæB„¥4ôâç7G&–æv–g’†FF’“°¢Ò6F6‚†R’°¢&V¦V7B†R“°¢Ğ¢Ò“°¢Ğ¢ò¢ ¢¢õ5Bö’÷c2öÆW76öâ÷&ö&ÆVÒöç7vW ¢¢Ö—'&÷'2F†RãbãÆöv–2†æòT’’â&WGW&ç2¶6öFRÂFFÂ×6rÂââçÒöâ7V66W726öFSÓÓÓà¢¢&Ò··&ö&ÆVÔ–C¦çVÖ&W"Â&ö&ÆVÕG—S¦çVÖ&W'×Ò&ö&ÆVĞ¢¢&Ò¶ç—Ò&W7VÇ@¢¢&Ò·¶†VFW'3ó¥&V6÷&CÇ7G&–ærÇ7G&–æsâÂGCó¦çVÖ&W'×Ò¶÷F–öç5Ğ¢¢ò7–æ2gVæ7F–öâç7vW%&ö&ÆVÒ‡&ö&ÆVÒÂ&W7VÇBÂ÷F–öç2Ò·Ò’°¢6öç7BW&ÂÒ"ö’÷c2öÆW76öâ÷&ö&ÆVÒöç7vW"#°¢6öç7B†VFW'2Ò°¢ââäDTdTÅEô„TDU%2‚’À¢ââæ÷F–öç2æ†VFW'2ÇÂ·Ğ¢Ó°¢6öç7B–ÆöBÒ°¢&ö&ÆVÔ–C¢&ö&ÆVÒç&ö&ÆVÔ–BÀ¢&ö&ÆVÕG—S¢&ö&ÆVÒç&ö&ÆVÕG—RÀ¢GC¢÷F–öç2æGBóòFFRææ÷r‚’À¢&W7VÇC¢&W7VÇ@¢Ó°¢6öç7B&W7Òv—B†‡%÷7B‡W&ÂÂ–ÆöBÂ†VFW'2“°¢–b‡&W7æ6öFRÓÓÒ’&WGW&â&W7°¢F‡&÷ræWrW'&÷"†G·&W7æ×6wÒ‚G·&W7æ6öFWÒ–“°¢Ğ¢ò¢ ¢¢õ5Bö’÷c2öÆW76öâ÷&ö&ÆVÒ÷&WG'¢¢W‡V7G26W'fW"FòV6†ò7V66W72–G2–âFFç7V66W72†2–âcãbã’à¢¢&Ò··&ö&ÆVÔ–C¦çVÖ&W"Â&ö&ÆVÕG—S¦çVÖ&W'×Ò&ö&ÆVĞ¢¢&Ò¶ç—Ò&W7VÇ@¢¢&Ò¶çVÖ&W'ÒGBÒ6–×VÆFVBç7vW"F–ÖR†Wö6‚×2¢¢&Ò·¶†VFW'3ó¥&V6÷&CÇ7G&–ærÇ7G&–æsç×Ò¶÷F–öç5Ğ¢¢ò7–æ2gVæ7F–öâ&WG'”ç7vW"‡&ö&ÆVÒÂ&W7VÇBÂGBÂ÷F–öç2Ò·Ò’°¢6öç7BW&ÂÒ"ö’÷c2öÆW76öâ÷&ö&ÆVÒ÷&WG'’#°¢6öç7B†VFW'2Ò°¢ââäDTdTÅEô„TDU%2‚’À¢ââæ÷F–öç2æ†VFW'2ÇÂ·Ğ¢Ó°¢6öç7B–ÆöBÒ°¢&ö&ÆV×3¢²°¢&ö&ÆVÔ–C¢&ö&ÆVÒç&ö&ÆVÔ–BÀ¢&ö&ÆVÕG—S¢&ö&ÆVÒç&ö&ÆVÕG—RÀ¢GC¢GBÀ¢&W7VÇC¢&W7VÇ@¢ÒĞ¢Ó°¢6öç7B&W7Òv—B†‡%÷7B‡W&ÂÂ–ÆöBÂ†VFW'2“°¢–b‡&W7æ6öFRÓÒ’F‡&÷ræWrW'&÷"†G·&W7æ×6wÒ‚G·&W7æ6öFWÒ–“°¢6öç7Bö´Æ—7BÒ&W7òæFFòç7V66W72ÇÂµÓ°¢–b‚'&’æ—4'&’†ö´Æ—7B’ÇÂö´Æ—7Bæ–æ6ÇVFW2‡&ö&ÆVÒç&ö&ÆVÔ–B’’F‡&÷ræWrW'&÷"‚.iÈŞXªYšiÊ®‹ùNY¹îh‰X©şKúhò"“°¢&WGW&â&W7°¢Ğ¢ò¢ ¢¢†–v‚ÖÆWfVÂ÷&6†W7G&F÷#¢ç7vW"f—'7C²–bFVFÆ–æR†276VBÂ÷F–öæÆÇ’&WG'’à¢¢F†—2—2F†RÖöGVÆRFFF–öâöbF†RãbãW6W'67&—B7V&Ö—BfÆ÷rà¢ ¢¢&Ò··&ö&ÆVÔ–C¦çVÖ&W"Â&ö&ÆVÕG—S¦çVÖ&W'×Ò&ö&ÆVĞ¢¢&Ò¶ç—Ò&W7VÇ@¢¢&Ò´ö&¦V7GÒ7V&Ö—D÷F–öç0¢¢&Ò¶çVÖ&W'Ò·7V&Ö—D÷F–öç2ç7F'EF–ÖUÒÒVæÆö6²F–ÖR†Wö6‚×2’â&WV—&VBf÷"&WG'’F‚à¢¢&Ò¶çVÖ&W'Ò·7V&Ö—D÷F–öç2æVæEF–ÖUÒÒFVFÆ–æR†Wö6‚×2’â–bæ÷rãÒVæEF–ÖRÓâ&WG'’F‚à¢¢&Ò¶&ööÆVçÒ·7V&Ö—D÷F–öç2æf÷&6U&WG'“ÖfÇ6UÒÒv†Vâ7BFVFÆ–æRÂF—&V7FÇ’W6R&WG'’v—F†÷WB&ö×F–ærà¢¢&Ò¶çVÖ&W'Ò·7V&Ö—D÷F–öç2ç&WG'”GDöfg6WD×3Ó#ÒÒGBÒ7F'EF–ÖR²öfg6WBv†Vâ&WG'––ærà¢¢&Òµ&V6÷&CÇ7G&–ærÇ7G&–æsçÒ·7V&Ö—D÷F–öç2æ†VFW'5ÒÒW‡G&ö÷fW'&–FR†VFW'2à¢¢&WGW&ç2µ&öÖ—6SÇ²w&÷WFRs¢vç7vW"wÂw&WG'’rÂ&W7¦ç—ÓçĞ¢¢&Ò¶çVÖ&W'Ç7G&–æwÒ·7V&Ö—D÷F–öç2æÆW76öä–EÒÒh˜[îŠûîZ.ûÉ¾{Ë®yÈi{n[nKÛşyJ‚&Wòæ7W'&VçDÆW76öä–@¢¢&Ò¶&ööÆVçÒ·7V&Ö—D÷F–öç2æWFôvFS×G'VUÒÒiŠşY
nY
şyJ(	Îˆz®Xª‹ù¾XZ^ŠûîZ"ş›¹ŠêNˆz®XªzÙNš)(	Şy¨NXŠNZé®ûÈY	YîX[ÎZëûÈÎ›¹ŠêN[ÈY
şûÈ¢¢&Ò¶çVÖ&W'Ò·7V&Ö—D÷F–öç2çv—D×5ÒÒŠhny¹nˆz®XªzØ[è^i{n™{NûÉ¾iÊ®hùKé¾i{nhÈŠëî{ÚîŠêzép¢¢ò7–æ2gVæ7F–öâ7V&Ö—Dç7vW"‡&ö&ÆVÒÂ&W7VÇBÂ7V&Ö—D÷F–öç2Ò·Ò’°¢6öç7B7F'EF–ÖRÒ7V&Ö—D÷F–öç3òç7F'EF–ÖS°¢6öç7BVæEF–ÖRÒ7V&Ö—D÷F–öç3òæVæEF–ÖS°¢6öç7Bf÷&6U&WG'’Ò7V&Ö—D÷F–öç3òæf÷&6U&WG'’óòfÇ6S°¢6öç7B&WG'”GDöfg6WD×2Ò7V&Ö—D÷F–öç3òç&WG'”GDöfg6WD×2óò&S3°¢6öç7B†VFW'2Ò7V&Ö—D÷F–öç3òæ†VFW'3°¢6öç7BWFôvFRÒ7V&Ö—D÷F–öç3òæWFôvFRóòG'VS°¢6öç7Bv—D×2Ò7V&Ö—D÷F–öç3òçv—D×3°¢6öç7BÆW76öä–Dg&öÔ÷G2Ò7V&Ö—D÷F–öç2bb&ÆW76öä–B"–â7V&Ö—D÷F–öç2ò7V&Ö—D÷F–öç2æÆW76öä–B¢fö–B°¢òò{¹şKˆh»òÆW76öä–@¢6öç7BÆW76öä–BÒÆW76öä–Dg&öÔ÷G2óò&Wóòæ7W'&VçDÆW76öä–BóòçVÆÃ°¢–b†WFôvFRbb6†÷VÆDWFôç7vW$f÷$ÆW76öåò†ÆW76öä–B’’°¢6öç7B×2ÒG—Vöbv—D×2ÓÓÒ&çVÖ&W""òÖF‚æÖ‚ƒÂv—D×2’¢6Æ4WFõv—D×2‚“°¢–b†×2â’°¢6öç7BwV&BÒG—VöbVæEF–ÖRÓÓÒ&çVÖ&W""òÖF‚æÖ‚ƒÂVæEF–ÖRÒFFRææ÷r‚’Òƒ’¢×3°¢v—B6ÆVW„ÖF‚æÖ–â†×2ÂwV&B’“°¢Ğ¢Ğ¢6öç7Bæ÷rÒFFRææ÷r‚“°¢6öç7B7DFVFÆ–æRÒG—VöbVæEF–ÖRÓÓÒ&çVÖ&W""bbæ÷rãÒVæEF–ÖS°¢–b‡7DFVFÆ–æRÇÂf÷&6U&WG'’’°¢6öç6öÆRæw&÷W‚%¾™ºŠûîZ.Xªh˜µÕ´DT%TuÕ¶ç7vW%Òããâ‹ù¾XZ^Š^KªNXˆniJşXŠNijÒ"“°¢6öç6öÆRæÆör‚'&ö&ÆVÔ–C¢"Â&ö&ÆVÒç&ö&ÆVÔ–B“°¢6öç6öÆRæÆör‚'7DFVFÆ–æS¢"Â7DFVFÆ–æRÂ"†æ÷sÒ"Âæ÷rÂ"ÂVæEF–ÖSÒ"ÂVæEF–ÖRÂ"’"“°¢6öç6öÆRæÆör‚&f÷&6U&WG'“¢"Âf÷&6U&WG'’“°¢6öç6öÆRæÆör‚.KÊXZR7F'EF–ÖS¢"Â7F'EF–ÖRÂ.KÊXZRVæEF–ÖS¢"ÂVæEF–ÖR“°¢6öç7B2Ò&Wóòç&ö&ÆVÕ7FGW3òævWCòâ‡&ö&ÆVÒç&ö&ÆVÔ–B“°¢6öç6öÆRæÆör‚.K¸â&Wòç&ö&ÆVÕ7FGW2ˆë~Xùc¢"Â2“°¢6öç7B7BÒçVÖ&W"æ—4f–æ—FR‡7F'EF–ÖR’ò7F'EF–ÖR¢3òç7F'EF–ÖS°¢6öç7BWBÒçVÖ&W"æ—4f–æ—FR†VæEF–ÖR’òVæEF–ÖR¢3òæVæEF–ÖS°¢6öç6öÆRæÆör‚.iÈ{¸yJK¨â&WG'’y¨B7CÒ"Â7BÂ"WCÒ"ÂWB“°¢òòŠêzérG@¢6öç7BöfbÒÖF‚æÖ‚ƒÂ&WG'”GDöfg6WD×2“°¢ÆWBGC°¢–b„çVÖ&W"æ—4f–æ—FR‡7B’’°¢GBÒ7B²öfc°¢6öç6öÆRæÆör‚.Š^KªBGBÒ7F'EF–ÖR²öfg6WBÒ"ÂGB“°¢ÒVÇ6R–b„çVÖ&W"æ—4f–æ—FR†WB’’°¢GBÒÖF‚æÖ‚ƒÂWBÒÖF‚æÖ‚†öfbÂVS2’“°¢6öç6öÆRæÆör‚.Š^KªBGBÒæV"VæEF–ÖRv–æF÷rÒ"ÂGB“°¢ÒVÇ6R°¢GBÒFFRææ÷r‚’Òöfc°¢6öç6öÆRæÆör‚.Š^KªBGBÒfÆÆ&6²Ò"ÂGB“°¢Ğ¢6öç6öÆRæÆör‚#ããâXÛ>[n‹>yJ‚&WG'”ç7vW"‚’"“°¢6öç6öÆRæw&÷WVæB‚“°¢G'’°¢6öç7B&W7Òv—B&WG'”ç7vW"‡&ö&ÆVÒÂ&W7VÇBÂGBÂ°¢†VFW'3¢†VFW'0¢Ò“°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ¶ç7vW%ÒŠ^KªNh‰X©ò‚÷&WG'’’"Â°¢&ö&ÆVÔ–C¢&ö&ÆVÒç&ö&ÆVÔ–BÀ¢GC¢GBÀ¢7DFVFÆ–æS¢7DFVFÆ–æRÀ¢f÷&6U&WG'“¢f÷&6U&WG'¢Ò“°¢&WGW&â°¢&÷WFS¢'&WG'’"À¢&W7¢&W7 ¢Ó°¢Ò6F6‚†R’°¢6öç6öÆRæW'&÷"‚%¾™ºŠûîZ.Xªh˜µÕ´U%%Õ¶ç7vW%ÒŠ^KªNZK‹JR‚÷&WG'’ûÉ¢"ÂR“°¢6öç6öÆRæW'&÷"‚%¾™ºŠûîZ.Xªh˜µÕ´U%%Õ¶ç7vW%ÒZK‹J^Xø.i[ûÉ¢"Â°¢7C¢7BÀ¢WC¢WBÀ¢GC¢GBÀ¢7DFVFÆ–æS¢7DFVFÆ–æRÀ¢f÷&6U&WG'“¢f÷&6U&WG'¢Ò“°¢F‡&÷rS°¢Ğ¢Ğ¢6öç7B&W7Òv—Bç7vW%&ö&ÆVÒ‡&ö&ÆVÒÂ&W7VÇBÂ°¢†VFW'3¢†VFW'2À¢GC¢æ÷p¢Ò“°¢&WGW&â°¢&÷WFS¢&ç7vW""À¢&W7¢&W7 ¢Ó°¢Ğ¢6öç7BÂÒ‚ââæ’Óâ6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´D$uÕ·&ö&ÆVÒÖÆ—7EÒ"Âââæ“°¢6öç7BrÒ‚ââæ’Óâ6öç6öÆRçv&â‚%¾™ºŠûîZ.Xªh˜µÕµt$åÕ·&ö&ÆVÒÖÆ—7EÒ"Âââæ“°¢gVæ7F–öâBC"‡6VÂ’°¢&WGW&âFö7VÖVçBçVW'•6VÆV7F÷"‡6VÂ“°¢Ğ¢gVæ7F–öâ7&VFR‡FrÂ6Ç2’°¢6öç7BâÒFö7VÖVçBæ7&VFTVÆVÖVçB‡Fr“°¢–b†6Ç2’âæ6Æ74æÖRÒ6Ç3°¢&WGW&âã°¢Ğ¢gVæ7F–öâ&WGG’†ö&¢’°¢G'’°¢&WGW&â¥4ôâç7G&–æv–g’†ö&¢ÂçVÆÂÂ"“°¢Ò6F6‚°¢&WGW&â7G&–ær†ö&¢“°¢Ğ¢Ğ¢6öç7B„TDU%2Ò‚’Óâ‡°¢$6öçFVçBÕG—R#¢&Æ–6F–öâö§6öâ"À¢‡F'£¢'–·B"À¢%‚Ô6Æ–VçB#¢&ƒR"À¢WF†÷&—¦F–öã¢$&V&W""²‡G—VöbÆö6Å7F÷&vRÓÒ'VæFVf–æVB"òÆö6Å7F÷&vRævWD—FVÒ‚$WF†÷&—¦F–öâ"’ÇÂ""¢""¢Ò“°¢7–æ2gVæ7F–öâ‡GGvWB‡W&Â’°¢&WGW&âæWr&öÖ—6R‚‡&W6öÇfRÂ&V¦V7B’Óâ°¢G'’°¢6öç7B†‡"ÒæWr„ÔÄ‡GG&WVW7C°¢†‡"æ÷Vâ‚$tUB"ÂW&ÂÂG'VR“°¢6öç7B‚Ò„TDU%2‚“°¢f÷"†6öç7B²–â‚’†‡"ç6WE&WVW7D†VFW"†²Â…¶µÒ“°¢†‡"æöæÆöBÒ‚’Óâ°¢G'’°¢&W6öÇfR„¥4ôâç'6R‡†‡"ç&W7öç6UFW‡B’“°¢Ò6F6‚°¢&V¦V7B†æWrW'&÷"‚.Šz>iéY8Ş[©NZK‹JR"’“°¢Ğ¢Ó°¢†‡"æöæW'&÷"Ò‚’Óâ&V¦V7B†æWrW'&÷"‚.{Ù{¹ÎZK‹JR"’“°¢†‡"ç6VæB‚“°¢Ò6F6‚†R’°¢&V¦V7B†R“°¢Ğ¢Ò“°¢Ğ¢òòKéŞjÊ[	ŞŠù^ZI®KŠ®zºşx+ûÈÎXXh‰X©şXXyJ€¢7–æ2gVæ7F–öâfWF6…&ö&ÆVÔFWF–Â‡&ö&ÆVÔ–B’°¢6öç7B6æF–FFW2Ò²ö’÷c2öÆW76öâ÷&ö&ÆVÒöFWF–Ã÷&ö&ÆVÔ–CÒG·&ö&ÆVÔ–GÖÂö’÷c2öÆW76öâ÷&ö&ÆVÒövWC÷&ö&ÆVÔ–CÒG·&ö&ÆVÔ–GÖÂöÖöö2Ö’÷cöÆ×2÷&ö&ÆVÒöFWF–Ã÷&ö&ÆVÕö–CÒG·&ö&ÆVÔ–GÖÓ°¢f÷"†6öç7BW&Âöb6æF–FFW2’G'’°¢6öç7B&W7Òv—B‡GGvWB‡W&Â“°¢–b‡&W7bbG—Vöb&W7ÓÓÒ&ö&¦V7B"bb‡&W7æ6öFRÓÓÒÇÂ&W7ç7V66W72ÓÓÒG'VR’’&WGW&â&W7°¢Ò6F6‚…ò’²ò¢G'’æW‡B¢÷Ğ¢F‡&÷ræWrW'&÷"‚.izk9^ˆë~Xùnš)yºîKúhò"“°¢Ğ¢ò¢ ¢¢[nh˜iÈXúşŠxŠûîK»nKŠŞy¨Nš)yºîš^xÎXZR&Wòç&ö&ÆV×2ò&WòæVæ6÷VçFW&VE&ö&ÆV×0¢¢yºîy¨NûÉ®{¹^‹ør„…"öfWF6‚hºnhŠ®ZKiXûÈÎy»Nhê^K¸îxëiÈXh^ZÙ{¹>ièNièN[»®š)yºîX‰~Š€¢¢ògVæ7F–öâ‡–G&FU&ö&ÆV×4g&öÕ&W6VçFF–öç2‚’°¢G'’°¢6öç7B&Vf÷&T6çBÒ&Wòç&ö&ÆV×3òç6—¦RÇÂ°¢6öç7BVæ4&Vf÷&RÒ‡&WòæVæ6÷VçFW&VE&ö&ÆV×2ÇÂµÒ’æÆVæwFƒ°¢6öç7B6VVâÒæWr6WB‚‡&WòæVæ6÷VçFW&VE&ö&ÆV×2ÇÂµÒ’æÖ†RÓâRç&ö&ÆVÔ–B’“°¢ÆWBf÷VæE6Æ–FW2ÒÂf–ÆÆVE&ö&ÆV×2ÒÂFFVDWfVçG2Ò°¢f÷"†6öç7B²Â&W5Òöb&Wòç&W6VçFF–öç2’°¢6öç7B6Æ–FW2Ò&W3òç6Æ–FW2ÇÂµÓ°¢–b‚6Æ–FW2æÆVæwF‚’6öçF–çVS°¢f÷"†6öç7B2öb6Æ–FW2’°¢–b‚2ÇÂ2ç&ö&ÆVÒ’6öçF–çVS°¢f÷VæE6Æ–FW2²³°¢6öç7B–BÒ2ç&ö&ÆVÒç&ö&ÆVÔ–BÇÂ2ç&ö&ÆVÒæ–C°¢–b‚–B’6öçF–çVS°¢6öç7B–E7G"Ò7G&–ær‡–B“°¢òòZ¾XXR&Wòç&ö&ÆV×0¢–b‚&Wòç&ö&ÆV×2æ†2‡–E7G"’’°¢6öç7Bæ÷&ÖÆ—¦VBÒ°¢&ö&ÆVÔ–C¢–E7G"À¢&ö&ÆVÕG—S¢2ç&ö&ÆVÒç&ö&ÆVÕG—RÇÂ2ç&ö&ÆVÒçG—RÇÂ2ç&ö&ÆVÒçVW7F–öåG—RÇÂ'Væ¶æ÷vâ"À¢&öG“¢2ç&ö&ÆVÒæ&öG’ÇÂ2ç&ö&ÆVÒçF—FÆRÇÂ""À¢÷F–öç3¢2ç&ö&ÆVÒæ÷F–öç2ÇÂµÒÀ¢&W7VÇC¢2ç&ö&ÆVÒç&W7VÇBÇÂçVÆÂÀ¢7FGW3¢2ç&ö&ÆVÒç7FGW2ÇÂ·ÒÀ¢7F'EF–ÖS¢2ç&ö&ÆVÒç7F'EF–ÖRÀ¢VæEF–ÖS¢2ç&ö&ÆVÒæVæEF–ÖRÀ¢6Æ–FT–C¢7G&–ær‡2æ–B’À¢&W6VçFF–öä–C¢7G&–ær‡&W2æ–B¢Ó°¢&Wòç&ö&ÆV×2ç6WB‡–E7G"Âö&¦V7Bæ76–vâ‡·ÒÂ2ç&ö&ÆVÒÂæ÷&ÖÆ—¦VB’“°¢f–ÆÆVE&ö&ÆV×2²³°¢Ğ¢òòZ¾XXR&WòæVæ6÷VçFW&VE&ö&ÆV×0¢–b‚6VVâæ†2‡–E7G"’’°¢6VVâæFB‡–E7G"“°¢‡&WòæVæ6÷VçFW&VE&ö&ÆV×2ÇÂ‡&WòæVæ6÷VçFW&VE&ö&ÆV×2ÒµÒ’’çW6‚‡°¢&ö&ÆVÔ–C¢–E7G"À¢&ö&ÆVÕG—S¢2ç&ö&ÆVÒç&ö&ÆVÕG—RÇÂ2ç&ö&ÆVÒçG—RÇÂ2ç&ö&ÆVÒçVW7F–öåG—RÇÂ'Væ¶æ÷vâ"À¢&öG“¢2ç&ö&ÆVÒæ&öG’ÇÂ2ç&ö&ÆVÒçF—FÆRÇÂ""À¢&W6VçFF–öä–C¢7G&–ær‡&W2æ–B’À¢6Æ–FT–C¢7G&–ær‡2æ–B’À¢6Æ–FS¢2À¢VæEF–ÖS¢2ç&ö&ÆVÒæVæEF–ÖRÀ¢7F'EF–ÖS¢2ç&ö&ÆVÒç7F'EF–ÖP¢Ò“°¢FFVDWfVçG2²³°¢Ğ¢Ğ¢Ğ¢òòhÈ’&W6VçFF–öä–B·6Æ–FRæ–æFW‚hé.[¨ğ¢–b‡&WòæVæ6÷VçFW&VE&ö&ÆV×2bb&WòæVæ6÷VçFW&VE&ö&ÆV×2æÆVæwF‚’&WòæVæ6÷VçFW&VE&ö&ÆV×2ç6÷'B‚†Â"’Óâ°¢–b†ç&W6VçFF–öä–BÓÒ"ç&W6VçFF–öä–B’&WGW&â7G&–ær†ç&W6VçFF–öä–B’æÆö6ÆT6ö×&R…7G&–ær†"ç&W6VçFF–öä–B’“°¢6öç7B‚Òç6Æ–FSòæ–æFW‚óòÂ'‚Ò"ç6Æ–FSòæ–æFW‚óò°¢&WGW&â‚Ò'ƒ°¢Ò“°¢6öç7BgFW$6çBÒ&Wòç&ö&ÆV×3òç6—¦RÇÂ°¢6öç7BVæ4gFW"Ò‡&WòæVæ6÷VçFW&VE&ö&ÆV×2ÇÂµÒ’æÆVæwFƒ°¢Â‚%¶‡–G&FU&ö&ÆV×4g&öÕ&W6VçFF–öç5Ò"Â°¢f÷VæE6Æ–FW3¢f÷VæE6Æ–FW2À¢f–ÆÆVE&ö&ÆV×3¢f–ÆÆVE&ö&ÆV×2À¢FFVDWfVçG3¢FFVDWfVçG2À¢&ö&ÆV×4&Vf÷&S¢&Vf÷&T6çBÀ¢&ö&ÆV×4gFW#¢gFW$6çBÀ¢Væ6÷VçFW&VD&Vf÷&S¢Væ4&Vf÷&RÀ¢Væ6÷VçFW&VDgFW#¢Væ4gFW"À¢6×ÆU&ö&ÆV×3¢'&’æg&öÒ‡&Wòç&ö&ÆV×2æ¶W—2‚’’ç6Æ–6RƒÂ‚¢Ò“°¢Ò6F6‚†R’°¢r‚&‡–G&FU&ö&ÆV×4g&öÕ&W6VçFF–öç2W'&÷#¢"ÂR“°¢Ğ¢Ğ¢ò¢ ¢¢YÊizk9^K¸â&Wòç&ö&ÆV×2YŞKŠŞi{nûÈÎ‹z‚&W6VçFF–öç2iú^h›î[›nY¹îXi¢¢ògVæ7F–öâ7&÷74f–æE&ö&ÆVÒ‡&ö&ÆVÔ–E7G"’°¢f÷"†6öç7B²Â&W5Òöb&Wòç&W6VçFF–öç2’°¢6öç7B'"Ò&W3òç6Æ–FW2ÇÂµÓ°¢f÷"†6öç7B2öb'"’°¢6öç7B–BÒ3òç&ö&ÆVÓòç&ö&ÆVÔ–BÇÂ3òç&ö&ÆVÓòæ–C°¢–b‡–Bbb7G&–ær‡–B’ÓÓÒ&ö&ÆVÔ–E7G"’°¢òòY¹îXi¢6öç7Bæ÷&ÖÆ—¦VBÒö&¦V7Bæ76–vâ‡·ÒÂ2ç&ö&ÆVÒÂ°¢&ö&ÆVÔ–C¢&ö&ÆVÔ–E7G"À¢&ö&ÆVÕG—S¢2ç&ö&ÆVÒç&ö&ÆVÕG—RÇÂ2ç&ö&ÆVÒçG—RÇÂ2ç&ö&ÆVÒçVW7F–öåG—RÇÂ'Væ¶æ÷vâ"À¢&öG“¢2ç&ö&ÆVÒæ&öG’ÇÂ2ç&ö&ÆVÒçF—FÆRÇÂ""À¢÷F–öç3¢2ç&ö&ÆVÒæ÷F–öç2ÇÂµÒÀ¢&W7VÇC¢2ç&ö&ÆVÒç&W7VÇBÇÂçVÆÂÀ¢7FGW3¢2ç&ö&ÆVÒç7FGW2ÇÂ·ÒÀ¢7F'EF–ÖS¢2ç&ö&ÆVÒç7F'EF–ÖRÀ¢VæEF–ÖS¢2ç&ö&ÆVÒæVæEF–ÖRÀ¢6Æ–FT–C¢7G&–ær‡2æ–B’À¢&W6VçFF–öä–C¢7G&–ær‡&W2æ–B¢Ò“°¢&Wòç&ö&ÆV×2ç6WB‡&ö&ÆVÔ–E7G"Âæ÷&ÖÆ—¦VB“°¢&WGW&â°¢&ö&ÆVÓ¢æ÷&ÖÆ—¦VBÀ¢6Æ–FS¢2À¢&W6VçFF–öä–C¢7G&–ær‡&W2æ–B¢Ó°¢Ğ¢Ğ¢Ğ¢&WGW&âçVÆÃ°¢Ğ¢òòÓÓÓÓÓÓÓÓÓÒŠÎk‹.iù>KˆîKªNK©"ÓÓÓÓÓÓÓÓÓĞ¢gVæ7F–öâ&–æE&÷t7F–öç2‡&÷rÂRÂ&ö"’°¢6öç7B7F–öç4&"Ò&÷rçVW'•6VÆV7F÷"‚"ç&ö&ÆVÒÖ7F–öç2"“°¢òòiú^yÈ¾ûÉ®‹{>X‹Zû[©Ny¨NŠûîK»nšP¢6öç7B'FävòÒ7&VFR‚&'WGFöâ"“°¢'FävòçFW‡D6öçFVçBÒ.iú^yÈ²#°¢'Fävòæöæ6Æ–6²Ò‚’Óâ°¢6öç7B&W4–BÒRç&W6VçFF–öä–BÇÂ&ö#òç&W6VçFF–öä–C°¢6öç7B6Æ–FT–BÒRç6Æ–FSòæ–BÇÂRç6Æ–FT–BÇÂ&ö#òç6Æ–FT–C°¢Â‚.iú^yÈ¾š)yºâÓâæf–vFUFò"Â°¢&W4–C¢&W4–BÀ¢6Æ–FT–C¢6Æ–FT–@¢Ò“°¢–b‡&W4–Bbb6Æ–FT–B’7F–öç2ææf–vFUFò…7G&–ær‡&W4–B’Â7G&–ær‡6Æ–FT–B’“²VÇ6RV’çFö7B‚.{Ë®[	‹{>‹ÚÎKúhò"“°¢Ó°¢7F–öç4&"æVæD6†–ÆB†'Fävò“°¢òò’Šz>zÙNûÉ®h™>[È’™Ú.iÛş[›nKÉXXKÛşyJŠú^š)h˜YÊš^ûÈˆº^h»ş[é~X‹ûÈ¢6öç7B'Fä’Ò7&VFR‚&'WGFöâ"“°¢'Fä’çFW‡D6öçFVçBÒ$Šz>zÙB#°¢'Fä’æöæ6Æ–6²Ò‚’Óâ°¢Rç&W6VçFF–öä–BÇÂ&ö#òç&W6VçFF–öä–C°¢6öç7B6Æ–FT–BÒRç6Æ–FSòæ–BÇÂRç6Æ–FT–BÇÂ&ö#òç6Æ–FT–C°¢–b‡6Æ–FT–B’ ¢òòkKîXù(	Îhù™zî[Ù>X˜ÕN(	ŞKº^Këò’™Ú.iÛşKÉXXŠønXŠ¾Šú^šP¢v–æF÷ræF—7F6„WfVçB†æWr7W7FöÔWfVçB‚'–·C¦6²Ö’Öf÷"×6Æ–FR"Â°¢FWF–Ã¢°¢6Æ–FT–C¢7G&–ær‡6Æ–FT–B’À¢–ÖvUW&Ã¢&Wòç6Æ–FW2ævWB…7G&–ær‡6Æ–FT–B’“òæ–ÖvRÇÂ&Wòç6Æ–FW2ævWB…7G&–ær‡6Æ–FT–B’“òçF‡VÖ&æ–ÂÇÂ" ¢Ğ¢Ò’“°¢v–æF÷ræF—7F6„WfVçB†æWr7W7FöÔWfVçB‚'–·C¦÷VâÖ’"Â°¢FWF–Ã¢°¢&ö&ÆVÔ–C¢Rç&ö&ÆVÔ–@¢Ğ¢Ò’“°¢Ó°¢7F–öç4&"æVæD6†–ÆB†'Fä’“°¢òò’[Ë®X‹nKÙÎzÙNûÉ®y»Nhê^Xˆnié[›nhùKªNûÉ¾‹ø~iÉşš)yºî™ÈŠhK¨ÎjÊzîŠêNYî‹[Š^KªNhê^Xú0¢6öç7B'Fäf÷&6T’Ò7&VFR‚&'WGFöâ"“°¢'Fäf÷&6T’çFW‡D6öçFVçBÒ$[Ë®X‹nKÙÎzÙB#°¢'Fäf÷&6T’æöæ6Æ–6²Ò7–æ2‚’Óâ°¢6öç7B2Ò&Wòç&ö&ÆVÕ7FGW3òævWCòâ†Rç&ö&ÆVÔ–B“°¢6öç7BVæBÒçVÖ&W"‡3òæVæEF–ÖRóòRæVæEF–ÖRóò&ö#òæVæEF–ÖR“°¢6öç7BW‡—&VBÒçVÖ&W"æ—4f–æ—FR†VæB’bbFFRææ÷r‚’ãÒVæC°¢–b†W‡—&VBbbv–æF÷ræ6öæf—&Ò‚.‹ù˜>š)[{.‹ø~hŠ®jÚ.i{n™{NûÈÄ’[nKÛşyJ[Ë®X‹nŠ^KªNhê^Xú>8.{º~{ºŞY	~ûÉò"’’&WGW&ã°¢&÷ræ6Æ74Æ—7BæFB‚&ÆöF–ær"“°¢'Fäf÷&6T’æF—6&ÆVBÒG'VS°¢G'’°¢6öç7B&W7VÇBÒv—B7F–öç2æf÷&6T”ç7vW"†Rç&ö&ÆVÔ–BÂ°¢f÷&6U&WG'“¢W‡—&V@¢Ò“°¢–b‚&W7VÇCòæö²’V’çFö7B†’[Ë®X‹nKÙÎzÙNiÊ®ZèÎh‰ûÉ¢G·&W7VÇCòæW'&÷#òæÖW76vRÇÂ&W7VÇCòç&V6öâÇÂ.iÊ®yú^XéşYº'ÖÂFS2“²VÇ6RV’çFö7B†W‡—&VBò$’KÙÎzÙNZèÎh‰[›n[{.Š^KªB"¢$’KÙÎzÙNZèÎh‰"“°¢WFFU&ö&ÆVÔÆ—7B‚“°¢Ò6F6‚†W'&÷"’°¢V’çFö7B†’[Ë®X‹nKÙÎzÙNZK‹J^ûÉ¢G¶W'&÷#òæÖW76vRÇÂW'&÷'ÖÂFS2“°¢Òf–æÆÇ’°¢'Fäf÷&6T’æF—6&ÆVBÒfÇ6S°¢&÷ræ6Æ74Æ—7Bç&VÖ÷fR‚&ÆöF–ær"“°¢Ğ¢Ó°¢7F–öç4&"æVæD6†–ÆB†'Fäf÷&6T’“°¢òòKúîiKYîX‹~ikš)yºà¢6öç7B'Få&Vg&W6‚Ò7&VFR‚&'WGFöâ"“°¢'Få&Vg&W6‚çFW‡D6öçFVçBÒ.X‹~ikš)yºâ#°¢'Få&Vg&W6‚æöæ6Æ–6²Ò7–æ2‚’Óâ°¢&÷ræ6Æ74Æ—7BæFB‚&ÆöF–ær"“°¢G'’°¢6öç7B&W7Òv—BfWF6…&ö&ÆVÔFWF–Â†Rç&ö&ÆVÔ–B“°¢6öç7BFWF–ÂÒ&W7æFFòç&ö&ÆVÒÇÂ&W7æFFÇÂ&W7ç&W7VÇBÇÂ·Ó°¢6öç7BÖW&vVBÒö&¦V7Bæ76–vâ‡·ÒÂ&ö"ÇÂ·ÒÂFWF–ÂÂ°¢&ö&ÆVÔ–C¢Rç&ö&ÆVÔ–BÀ¢&ö&ÆVÕG—S¢Rç&ö&ÆVÕG—P¢Ò“°¢&Wòç&ö&ÆV×2ç6WB†Rç&ö&ÆVÔ–BÂÖW&vVB“°¢WFFU&÷r‡&÷rÂRÂÖW&vVB“°¢V’çFö7B‚.[{.X‹~ikš)yºâ"“°¢Ò6F6‚†W'"’°¢V’çFö7B‚.X‹~ikZK‹J^ûÉ¢"²†W'#òæÖW76vRÇÂW'"’“°¢Òf–æÆÇ’°¢&÷ræ6Æ74Æ—7Bç&VÖ÷fR‚&ÆöF–ær"“°¢Ğ¢Ó°¢7F–öç4&"æVæD6†–ÆB†'Få&Vg&W6‚“°¢Ğ¢gVæ7F–öâWFFU&÷r‡&÷rÂRÂ&ö"’°¢òòj~š)€¢6öç7BF—FÆRÒ&÷rçVW'•6VÆV7F÷"‚"ç&ö&ÆVÒ×F—FÆR"“°¢F—FÆRçFW‡D6öçFVçBÒ‡&ö#òæ&öG’ÇÂRæ&öG’ÇÂ&ö#òçF—FÆRÇÂš)yºâG¶Rç&ö&ÆVÔ–GÖ’ç6Æ–6RƒÂ#“°¢òòXXh»ò7FGW2bi{nz©p¢6öç7B7FGW2Ò&ö#òç7FGW2ÇÂRç7FGW2ÇÂ·Ó°¢6öç7B2Ò&Wòç&ö&ÆVÕ7FGW3òævWCòâ†Rç&ö&ÆVÔ–B“°¢6öç7B7F'EF–ÖRÒçVÖ&W"‡7FGW3òç7F'EF–ÖRóò&ö#òç7F'EF–ÖRóòRç7F'EF–ÖRóò3òç7F'EF–ÖRóò’ÇÂfö–B°¢6öç7BVæEF–ÖRÒçVÖ&W"‡7FGW3òæVæEF–ÖRóò&ö#òæVæEF–ÖRóòRæVæEF–ÖRóò3òæVæEF–ÖRóò’ÇÂfö–B°¢òòXX>KúhşûÈY
¾hŠ®jÚ.i{n™{NûÈ¢6öç7BÖWFÒ&÷rçVW'•6VÆV7F÷"‚"ç&ö&ÆVÒÖÖWF"“°¢6öç7Bç7vW&VBÒ‡&ö#òç&W7VÇBÇÂ7FGW3òæ×”ç7vW"ÇÂ7FGW3òæç7vW&VB“°¢ÖWFçFW‡D6öçFVçBÒ”C¢G¶Rç&ö&ÆVÔ–GÒò{¾Yè³¢G¶Rç&ö&ÆVÕG—WÒòx«nh¢G¶ç7vW&VBò.[{.KÙÎzÙB"¢.iÊ®KÙÎzÙB'ÒòhŠ®jÚ#¢G¶VæEF–ÖRòæWrFFR†VæEF–ÖR’çFôÆö6ÆU7G&–ær‚’¢.iÊ®yúR'Ö°¢òòZëYš€¢ÆWBFWF–ÂÒ&÷rçVW'•6VÆV7F÷"‚"ç&ö&ÆVÒÖFWF–Â"“°¢–b‚FWF–Â’°¢FWF–ÂÒ7&VFR‚&F—b"Â'&ö&ÆVÒÖFWF–Â"“°¢&÷ræVæD6†–ÆB†FWF–Â“°¢Ğ¢FWF–Âæ–ææW$…DÔÂÒ"#°¢òò[{.KÙÎzÙNzÙNj€¢6öç7Bç7vW&VD&÷‚Ò7&VFR‚&F—b"Â&ç7vW&VBÖ&÷‚"“°¢6öç7Bç4Æ&VÂÒ7&VFR‚&F—b"Â&Æ&VÂ"“°¢ç4Æ&VÂçFW‡D6öçFVçBÒ.[{.KÙÎzÙNzÙNj‚#°¢6öç7Bç5&RÒ7&VFR‚'&R"“°¢ç5&RçFW‡D6öçFVçBÒ&WGG’‡&ö#òç&W7VÇBÇÂ7FGW3òæ×”ç7vW"ÇÂ·Ò“°¢ç7vW&VD&÷‚æVæD6†–ÆB†ç4Æ&VÂ“°¢ç7vW&VD&÷‚æVæD6†–ÆB†ç5&R“°¢FWF–ÂæVæD6†–ÆB†ç7vW&VD&÷‚“°¢òòh˜¾XªzÙNš)ûÈY
¾Š^KªNûÈ¢6öç7BVF—F÷$&÷‚Ò7&VFR‚&F—b"Â&VF—F÷"Ö&÷‚"“°¢6öç7BVF—DÆ&VÂÒ7&VFR‚&F—b"Â&Æ&VÂ"“°¢VF—DÆ&VÂçFW‡D6öçFVçBÒ.h˜¾XªzÙNš)ûÈ„¥4ôîûÈ’#°¢6öç7BFW‡F&VÒ7&VFR‚'FW‡F&V"“°¢FW‡F&Vç&÷w2Òc°¢FW‡F&VçÆ6V†öÆFW"Òw²&ç7vW'2#¥²ââå×Òs°¢FW‡F&VçfÇVRÒ&WGG’‡&ö#òç&W7VÇBÇÂ7FGW3òæ×”ç7vW"ÇÂ&ö#òç7VvvW7FVBÇÂ·Ò“°¢VF—F÷$&÷‚æVæD6†–ÆB†VF—DÆ&VÂ“°¢VF—F÷$&÷‚æVæD6†–ÆB‡FW‡F&V“°¢6öç7B7V&Ö—D&"Ò7&VFR‚&F—b"Â'7V&Ö—BÖ&""“°¢òòKùŞZÙûÈK¸^iÊÎYËûÈ¢6öç7B'Få6fTÆö6ÂÒ7&VFR‚&'WGFöâ"“°¢'Få6fTÆö6ÂçFW‡D6öçFVçBÒ.KùŞZÙ‚iÊÎYË’#°¢'Få6fTÆö6Âæöæ6Æ–6²Ò‚’Óâ°¢G'’°¢6öç7B'6VBÒ¥4ôâç'6R‡FW‡F&VçfÇVRÇÂu²"%Òr“°¢6öç7BÖW&vVBÒö&¦V7Bæ76–vâ‡·ÒÂ&ö"ÇÂ·ÒÂ°¢&W7VÇC¢'6V@¢Ò“°¢&Wòç&ö&ÆV×2ç6WB†Rç&ö&ÆVÔ–BÂÖW&vVB“°¢V’çFö7B‚.[{.KùŞZÙX‹iÊÎYËX‰~Š‚"“°¢WFFU&÷r‡&÷rÂRÂÖW&vVB“°¢Ò6F6‚†W'"’°¢V’çFö7B‚$¥4ôâŠz>iéZK‹J^ûÉ¢"²†W'#òæÖW76vRÇÂW'"’“°¢Ğ¢Ó°¢7V&Ö—D&"æVæD6†–ÆB†'Få6fTÆö6Â“°¢òòjÚ>[‹hùKªNûÈ‹ø~iÉşX‰hùzK®iŠşY
nŠ^KªNûÈ¢6öç7B'Få7V&Ö—BÒ7&VFR‚&'WGFöâ"“°¢'Få7V&Ö—BçFW‡D6öçFVçBÒ.hùKªB#°¢'Få7V&Ö—Bæöæ6Æ–6²Ò7–æ2‚’Óâ°¢G'’°¢6öç7B&W7VÇBÒ¥4ôâç'6R‡FW‡F&VçfÇVRÇÂu²"%Òr“°¢&÷ræ6Æ74Æ—7BæFB‚&ÆöF–ær"“°¢6öç7B·&÷WFS¢&÷WFWÒÒv—B7V&Ö—Dç7vW"‡°¢&ö&ÆVÔ–C¢Rç&ö&ÆVÔ–BÀ¢&ö&ÆVÕG—S¢Rç&ö&ÆVÕG—P¢ÒÂ&W7VÇBÂ°¢7F'EF–ÖS¢7F'EF–ÖRÀ¢VæEF–ÖS¢VæEF–ÖP¢Ò“°¢V’çFö7B‡&÷WFRÓÓÒ&ç7vW""ò.hùKªNh‰X©ò"¢.Š^KªNh‰X©ò"“°¢6öç7BÖW&vVBÒö&¦V7Bæ76–vâ‡·ÒÂ&ö"ÇÂ·ÒÂ°¢&W7VÇC¢&W7VÇ@¢ÒÂ°¢7FGW3¢°¢ââç&ö#òç7FGW2ÇÂ·ÒÀ¢ç7vW&VC¢G'VP¢Ğ¢Ò“°¢&Wòç&ö&ÆV×2ç6WB†Rç&ö&ÆVÔ–BÂÖW&vVB“°¢WFFU&÷r‡&÷rÂRÂÖW&vVB“°¢Ò6F6‚†W'"’°¢–b†W'#òææÖRÓÓÒ$FVFÆ–æTW'&÷""’V’æ6öæf—&Ò‚.[{.‹ø~hŠ®jÚ.ûÈÎiŠşY
nhš~ŠÎŠ^KªNûÉò"’çF†Vâ†7–æ2ö²Óâ°¢–b‚ö²’&WGW&ã°¢G'’°¢6öç7B&W7VÇBÒ¥4ôâç'6R‡FW‡F&VçfÇVRÇÂ'·Ò"“°¢&÷ræ6Æ74Æ—7BæFB‚&ÆöF–ær"“°¢v—B7V&Ö—Dç7vW"‡°¢&ö&ÆVÔ–C¢Rç&ö&ÆVÔ–BÀ¢&ö&ÆVÕG—S¢Rç&ö&ÆVÕG—P¢ÒÂ&W7VÇBÂ°¢7F'EF–ÖS¢7F'EF–ÖRÀ¢VæEF–ÖS¢VæEF–ÖRÀ¢f÷&6U&WG'“¢G'VP¢Ò“°¢V’çFö7B‚.Š^KªNh‰X©ò"“°¢6öç7BÖW&vVBÒö&¦V7Bæ76–vâ‡·ÒÂ&ö"ÇÂ·ÒÂ°¢&W7VÇC¢&W7VÇ@¢ÒÂ°¢7FGW3¢°¢ââç&ö#òç7FGW2ÇÂ·ÒÀ¢ç7vW&VC¢G'VP¢Ğ¢Ò“°¢&Wòç&ö&ÆV×2ç6WB†Rç&ö&ÆVÔ–BÂÖW&vVB“°¢WFFU&÷r‡&÷rÂRÂÖW&vVB“°¢Ò6F6‚†S"’°¢V’çFö7B‚.Š^KªNZK‹J^ûÉ¢"²†S#òæÖW76vRÇÂS"’“°¢Òf–æÆÇ’°¢&÷ræ6Æ74Æ—7Bç&VÖ÷fR‚&ÆöF–ær"“°¢Ğ¢Ò“²VÇ6RV’çFö7B‚.hùKªNZK‹J^ûÉ¢"²†W'#òæÖW76vRÇÂW'"’“°¢Òf–æÆÇ’°¢&÷ræ6Æ74Æ—7Bç&VÖ÷fR‚&ÆöF–ær"“°¢Ğ¢Ó°¢7V&Ö—D&"æVæD6†–ÆB†'Få7V&Ö—B“°¢òò[Ë®X‹nŠ^Kª@¢6öç7B'Fäf÷&6U&WG'’Ò7&VFR‚&'WGFöâ"“°¢'Fäf÷&6U&WG'’çFW‡D6öçFVçBÒ.[Ë®X‹nŠ^KªB#°¢'Fäf÷&6U&WG'’æöæ6Æ–6²Ò7–æ2‚’Óâ°¢G'’°¢6öç7B&W7VÇBÒ¥4ôâç'6R‡FW‡F&VçfÇVRÇÂ'·Ò"“°¢&÷ræ6Æ74Æ—7BæFB‚&ÆöF–ær"“°¢v—B7V&Ö—Dç7vW"‡°¢&ö&ÆVÔ–C¢Rç&ö&ÆVÔ–BÀ¢&ö&ÆVÕG—S¢Rç&ö&ÆVÕG—P¢ÒÂ&W7VÇBÂ°¢7F'EF–ÖS¢7F'EF–ÖRÀ¢VæEF–ÖS¢VæEF–ÖRÀ¢f÷&6U&WG'“¢G'VP¢Ò“°¢V’çFö7B‚.Š^KªNh‰X©ò"“°¢6öç7BÖW&vVBÒö&¦V7Bæ76–vâ‡·ÒÂ&ö"ÇÂ·ÒÂ°¢&W7VÇC¢&W7VÇ@¢ÒÂ°¢7FGW3¢°¢ââç&ö#òç7FGW2ÇÂ·ÒÀ¢ç7vW&VC¢G'VP¢Ğ¢Ò“°¢&Wòç&ö&ÆV×2ç6WB†Rç&ö&ÆVÔ–BÂÖW&vVB“°¢WFFU&÷r‡&÷rÂRÂÖW&vVB“°¢Ò6F6‚†W'"’°¢V’çFö7B‚.Š^KªNZK‹J^ûÉ¢"²†W'#òæÖW76vRÇÂW'"’“°¢Òf–æÆÇ’°¢&÷ræ6Æ74Æ—7Bç&VÖ÷fR‚&ÆöF–ær"“°¢Ğ¢Ó°¢7V&Ö—D&"æVæD6†–ÆB†'Fäf÷&6U&WG'’“°¢VF—F÷$&÷‚æVæD6†–ÆB‡7V&Ö—D&"“°¢FWF–ÂæVæD6†–ÆB†VF—F÷$&÷‚“°¢Ğ¢òòÓÓÓÓÓÓÓÓÓÒ™Ú.iÛşyIşYŞYiÉòÓÓÓÓÓÓÓÓÓĞ¢ÆWBÖ÷VçFVBC"ÒfÇ6S°¢ÆWB&ö÷BC#°¢gVæ7F–öâÖ÷VçE&ö&ÆVÔÆ—7EæVÂ‚’°¢–b†Ö÷VçFVBC"’&WGW&â&ö÷BC#°¢6öç7Bw&ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢w&æ–ææW$…DÔÂÒGÂC#°¢Fö7VÖVçBæ&öG’æVæD6†–ÆB‡w&æf—'7DVÆVÖVçD6†–ÆB“°¢&ö÷BC"ÒFö7VÖVçBævWDVÆVÖVçD'”–B‚'–·B×&ö&ÆVÒÖÆ—7B×æVÂ"“°¢BC"‚"7–·B×&ö&ÆVÒÖÆ—7BÖ6Æ÷6R"“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ6†÷u&ö&ÆVÔÆ—7EæVÂ†fÇ6R’“°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚'–·C¦÷Vâ×&ö&ÆVÒÖÆ—7B"Â‚’Óâ6†÷u&ö&ÆVÔÆ—7EæVÂ‡G'VR’“°¢Ö÷VçFVBC"ÒG'VS°¢òòšinjÊhÈ.‹ÛŞi{n[X®KˆjÊxÎXZP¢‡–G&FU&ö&ÆV×4g&öÕ&W6VçFF–öç2‚“°¢WFFU&ö&ÆVÔÆ—7B‚“°¢&WGW&â&ö÷BC#°¢Ğ¢gVæ7F–öâ6†÷u&ö&ÆVÔÆ—7EæVÂ‡f—6–&ÆRÒG'VR’°¢Ö÷VçE&ö&ÆVÔÆ—7EæVÂ‚“°¢&ö÷BC"æ6Æ74Æ—7BçFövvÆR‚'f—6–&ÆR"Âf—6–&ÆR“°¢–b‡f—6–&ÆR’°¢òò™Ú.iÛşh™>[Èi{nXhŞX®KˆjÊxÎXZP¢‡–G&FU&ö&ÆV×4g&öÕ&W6VçFF–öç2‚“°¢WFFU&ö&ÆVÔÆ—7B‚“°¢Ğ¢Ğ¢gVæ7F–öâWFFU&ö&ÆVÔÆ—7B‚’°¢Ö÷VçE&ö&ÆVÔÆ—7EæVÂ‚“°¢6öç7B6öçF–æW"ÒBC"‚"7–·B×&ö&ÆVÒÖÆ—7B"“°¢6öçF–æW"æ–ææW$…DÔÂÒ"#°¢òòXYÎ[©^X‹~ik ¢–b‚&WòæVæ6÷VçFW&VE&ö&ÆV×2ÇÂ&WòæVæ6÷VçFW&VE&ö&ÆV×2æÆVæwF‚ÓÓÒ’‡–G&FU&ö&ÆV×4g&öÕ&W6VçFF–öç2‚“°¢6öç7BÆ—7BÒ&WòæVæ6÷VçFW&VE&ö&ÆV×2ÇÂµÓ°¢Â‚'WFFU&ö&ÆVÔÆ—7B"Â°¢6÷VçC¢Æ—7BæÆVæwF€¢Ò“°¢–b†Æ—7BæÆVæwF‚ÓÓÒ’°¢6öç7BV×G’ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢V×G’æ6Æ74æÖRÒ'&ö&ÆVÒÖV×G’#°¢V×G’çFW‡D6öçFVçBÒ.i¨.izš)yºîûÈXúş[	ŞŠù^Xˆ~hÚ.zºˆ¨.h‰nX‹~ikš^™Ú.ûÈ’#°¢6öçF–æW"æVæD6†–ÆB†V×G’“°¢&WGW&ã°¢Ğ¢Æ—7Bæf÷$V6‚†RÓâ°¢ÆWB&ö"Ò&Wòç&ö&ÆV×2ævWB†Rç&ö&ÆVÔ–B’ÇÂçVÆÃ°¢–b‚&ö"’°¢6öç7B7&÷72Ò7&÷74f–æE&ö&ÆVÒ…7G&–ær†Rç&ö&ÆVÔ–B’“°¢–b†7&÷72’°¢&ö"Ò7&÷72ç&ö&ÆVÓ°¢Rç&W6VçFF–öä–BÒRç&W6VçFF–öä–BÇÂ7&÷72ç&W6VçFF–öä–C°¢Rç6Æ–FRÒRç6Æ–FRÇÂ7&÷72ç6Æ–FS°¢Rç6Æ–FT–BÒRç6Æ–FT–BÇÂ7&÷72ç6Æ–FSòæ–C°¢Â‚&7&÷72Öf–ÆÂ&ö&ÆVÒ"Â°¢–C¢Rç&ö&ÆVÔ–BÀ¢&W3¢Rç&W6VçFF–öä–BÀ¢6Æ–FT–C¢Rç6Æ–FT–@¢Ò“°¢Ğ¢Ğ¢6öç7B&÷rÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢&÷ræ6Æ74æÖRÒ'&ö&ÆVÒ×&÷r#°¢6öç7BF—FÆRÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢F—FÆRæ6Æ74æÖRÒ'&ö&ÆVÒ×F—FÆR#°¢&÷ræVæD6†–ÆB‡F—FÆR“°¢6öç7BÖWFÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢ÖWFæ6Æ74æÖRÒ'&ö&ÆVÒÖÖWF#°¢&÷ræVæD6†–ÆB†ÖWF“°¢6öç7B7F–öç4&"ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢7F–öç4&"æ6Æ74æÖRÒ'&ö&ÆVÒÖ7F–öç2#°¢&÷ræVæD6†–ÆB†7F–öç4&"“°¢&–æE&÷t7F–öç2‡&÷rÂRÂ&ö"ÇÂ·Ò“°¢WFFU&÷r‡&÷rÂRÂ&ö"ÇÂ·Ò“°¢6öçF–æW"æVæD6†–ÆB‡&÷r“°¢Ò“°¢Ğ¢f"GÂCÒsÆF—b–CÒ'–·BÖ7F—fR×&ö&ÆV×2×æVÂ"6Æ73Ò'–·BÖ7F—fR×w&W"#åÆâÆF—b–CÒ'–·BÖ7F—fR×&ö&ÆV×2"6Æ73Ò&7F—fR×&ö&ÆV×2#ãÂöF—cåÆãÂöF—cåÆâs°¢ò¢ ¢¢6öçfW'BF†R&÷Fö6öÂw2&ö&ÆVÒF–Ö–ærf–VÆG2–çFòFVFÆ–æRà¢¢Ö—76–ærÂ¦W&òÂ÷"ÖÆf÷&ÖVBÆ–Ö—BÖVç2F†BF†R&ö&ÆVÒ—2VçF–ÖVBà¢¢&Ò¶çVÖ&W'Ç7G&–æwÆçVÆÇÇVæFVf–æVGÒ7F'EF–ÖRÒVæÆö6²F–ÖR–âWö6‚×0¢¢&Ò¶çVÖ&W'Ç7G&–æwÆçVÆÇÇVæFVf–æVGÒÆ–Ö—BÒF–ÖRÆ–Ö—B–â6V6öæG0¢¢&WGW&ç2¶çVÖ&W'ÆçVÆÇÒFVFÆ–æR–âWö6‚×2Â÷"çVÆÂf÷"âVçF–ÖVB&ö&ÆVĞ¢¢ògVæ7F–öâvWE&ö&ÆVÔVæEF–ÖR‡7F'EF–ÖRÂÆ–Ö—B’°¢6öç7B7F'BÒçVÖ&W"‡7F'EF–ÖR“°¢6öç7B&tÆ–Ö—BÒG—VöbÆ–Ö—BÓÓÒ'7G&–ær"òÆ–Ö—BçG&–Ò‚’¢Æ–Ö—C°¢–b‚çVÖ&W"æ—4f–æ—FR‡7F'B’ÇÂ&tÆ–Ö—BÓÓÒ""ÇÂ&tÆ–Ö—BÓÓÒçVÆÂÇÂ&tÆ–Ö—BÓÓÒfö–B’&WGW&âçVÆÃ°¢6öç7BGW&F–öâÒçVÖ&W"‡&tÆ–Ö—B“°¢–b‚çVÖ&W"æ—4f–æ—FR†GW&F–öâ’ÇÂGW&F–öâÃÒ’&WGW&âçVÆÃ°¢&WGW&â7F'B²GW&F–öâ¢S3°¢Ğ¢ò¢ ¢¢&WGW&âF†RçVÖ&W"öbv†öÆR6V6öæG2&VÖ–æ–ærf÷"F–ÖVB&ö&ÆVÒà¢¢&Ò¶çVÖ&W'Ç7G&–æwÆçVÆÇÇVæFVf–æVGÒVæEF–ÖRÒFVFÆ–æR–âWö6‚×0¢¢&Ò¶çVÖ&W'Ò¶æ÷sÔFFRææ÷r‚•ÒÒ7W'&VçBF–ÖR–âWö6‚×0¢¢&WGW&ç2¶çVÖ&W'ÆçVÆÇÒ&VÖ–æ–ær6V6öæG2Â÷"çVÆÂf÷"âVçF–ÖVB&ö&ÆVĞ¢¢ògVæ7F–öâvWE&ö&ÆVÕ&VÖ–æ–æu6V6öæG2†VæEF–ÖRÂæ÷rÒFFRææ÷r‚’’°¢–b†VæEF–ÖRÓÓÒçVÆÂÇÂVæEF–ÖRÓÓÒfö–BÇÂVæEF–ÖRÓÓÒ""’&WGW&âçVÆÃ°¢6öç7BVæBÒçVÖ&W"†VæEF–ÖR“°¢6öç7B7W'&VçBÒçVÖ&W"†æ÷r“°¢–b‚çVÖ&W"æ—4f–æ—FR†VæB’ÇÂçVÖ&W"æ—4f–æ—FR†7W'&VçB’’&WGW&âçVÆÃ°¢&WGW&âÖF‚æÖ‚ƒÂÖF‚æfÆö÷"‚†VæBÒ7W'&VçB’òS2’“°¢Ğ¢gVæ7F–öâæ÷&ÖÆ—¦U&ö&ÆVÔ–B‡fÇVR’°¢–b‡fÇVRÓÓÒfö–BÇÂfÇVRÓÓÒçVÆÂ’&WGW&âçVÆÃ°¢6öç7B–BÒ7G&–ær‡fÇVR’çG&–Ò‚“°¢&WGW&â–BÇÂçVÆÃ°¢Ğ¢ò¢¢¶VWT’ÖöæÇ’F—6Ö—76Ç26W&FRg&öÒF†R7GVÂ&ö&ÆVÒ7FFRâ¢ògVæ7F–öâ7&VFU&ö&ÆVÔF—6Ö—76Å7FFR‚’°¢6öç7BF—6Ö—76VBÒæWr6WC°¢&WGW&â°¢F—6Ö—72‡&ö&ÆVÔ–B’°¢6öç7B–BÒæ÷&ÖÆ—¦U&ö&ÆVÔ–B‡&ö&ÆVÔ–B“°¢–b‚–B’&WGW&âfÇ6S°¢F—6Ö—76VBæFB†–B“°¢&WGW&âG'VS°¢ÒÀ¢—4F—6Ö—76VB‡&ö&ÆVÔ–B’°¢6öç7B–BÒæ÷&ÖÆ—¦U&ö&ÆVÔ–B‡&ö&ÆVÔ–B“°¢&WGW&â–BbbF—6Ö—76VBæ†2†–B“°¢ÒÀ¢'VæR†7F—fU&ö&ÆVÔ–G2ÒµÒ’°¢6öç7B7F—fRÒæWr6WB…²ââæ7F—fU&ö&ÆVÔ–G2ÒæÖ†æ÷&ÖÆ—¦U&ö&ÆVÔ–B’æf–ÇFW"„&ööÆVâ’“°¢f÷"†6öç7B–BöbF—6Ö—76VB’–b‚7F—fRæ†2†–B’’F—6Ö—76VBæFVÆWFR†–B“°¢ÒÀ¢6ÆV"‚’°¢F—6Ö—76VBæ6ÆV"‚“°¢Ğ¢Ó°¢Ğ¢ÆWBÖ÷VçFVBCÒfÇ6S°¢ÆWB&ö÷BC°¢6öç7BF—6Ö—76Å7FFRÒ7&VFU&ö&ÆVÔF—6Ö—76Å7FFR‚“°¢gVæ7F–öâBC‡6VÂ’°¢&WGW&âFö7VÖVçBçVW'•6VÆV7F÷"‡6VÂ“°¢Ğ¢gVæ7F–öâÖ÷VçD7F—fU&ö&ÆV×5æVÂ‚’°¢–b†Ö÷VçFVBC’&WGW&â&ö÷BC°¢6öç7Bw&ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢w&æ–ææW$…DÔÂÒGÂC°¢Fö7VÖVçBæ&öG’æVæD6†–ÆB‡w&æf—'7DVÆVÖVçD6†–ÆB“°¢&ö÷BCÒFö7VÖVçBævWDVÆVÖVçD'”–B‚'–·BÖ7F—fR×&ö&ÆV×2×æVÂ"“°¢Ö÷VçFVBCÒG'VS°¢6WD–çFW'fÂ‚‚’ÓâWFFT7F—fU&ö&ÆV×2‚’ÂS2“°¢&WGW&â&ö÷BC°¢Ğ¢gVæ7F–öâWFFT7F—fU&ö&ÆV×2‚’°¢Ö÷VçD7F—fU&ö&ÆV×5æVÂ‚“°¢6öç7B&÷‚ÒBC‚"7–·BÖ7F—fR×&ö&ÆV×2"“°¢&÷‚æ–ææW$…DÔÂÒ"#°¢6öç7Bæ÷rÒFFRææ÷r‚“°¢6öç7B7F—fU&ö&ÆVÔ–G2ÒæWr6WC°¢&Wòç&ö&ÆVÕ7FGW2æf÷$V6‚‚‡7FGW2Â–B’Óâ°¢6öç7BÒ&Wòç&ö&ÆV×2ævWB‡–B’ÇÂ&Wòç&ö&ÆV×2ævWB…7G&–ær‡–B’’ÇÂ&Wòç&ö&ÆV×2ævWB„çVÖ&W"æ—4æâ„çVÖ&W"‡–B’’ò–B¢çVÖ&W"‡–B’“°¢–b‚ÇÂç&W7VÇB’&WGW&ã°¢6öç7B&VÖ–âÒvWE&ö&ÆVÕ&VÖ–æ–æu6V6öæG2‡7FGW2æVæEF–ÖRÂæ÷r“°¢6öç7B–E7G"Ò7G&–ær‡–B“°¢7F—fU&ö&ÆVÔ–G2æFB‡–E7G"“°¢–b†F—6Ö—76Å7FFRæ—4F—6Ö—76VB‡–E7G"’’&WGW&ã°¢6öç7B6&BÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢6&Bæ6Æ74æÖRÒ&7F—fR×&ö&ÆVÒÖ6&B#°¢6öç7B6Æ÷6RÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&'WGFöâ"“°¢6Æ÷6RçG—RÒ&'WGFöâ#°¢6Æ÷6Ræ6Æ74æÖRÒ&Ö6Æ÷6R#°¢6Æ÷6RçF—FÆRÒ.X[>™zŞš)yºîhùzK¢#°¢6Æ÷6Rç6WDGG&–'WFR‚&&–ÖÆ&VÂ"Â.X[>™zŞš)yºîhùzK¢"“°¢6Æ÷6RçFW‡D6öçFVçBÒ,9r#°¢6Æ÷6Ræöæ6Æ–6²ÒWfVçBÓâ°¢WfVçBç7F÷&÷vF–öâ‚“°¢F—6Ö—76Å7FFRæF—6Ö—72‡–E7G"“°¢6&Bç&VÖ÷fR‚“°¢–b†&÷‚æ6†–ÆG&VâæÆVæwF‚ÓÓÒ’&ö÷BCç7G–ÆRæF—7Æ’Ò&æöæR#°¢Ó°¢6&BæVæD6†–ÆB†6Æ÷6R“°¢6öç7BF—FÆRÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢F—FÆRæ6Æ74æÖRÒ&×F—FÆR#°¢F—FÆRçFW‡D6öçFVçBÒ‡æ&öG’ÇÂš)yºâG·–GÖ’ç6Æ–6RƒÂƒ“°¢6&BæVæD6†–ÆB‡F—FÆR“°¢6öç7B–æfòÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢–æfòæ6Æ74æÖRÒ&Ö–æfò#°¢6öç7BW‡—&VBÒ&VÖ–âÓÒçVÆÂbb&VÖ–âÃÒ°¢–æfòçFW‡D6öçFVçBÒ&VÖ–âÓÓÒçVÆÂò.KˆŞ™™i{b"¢W‡—&VBò.[{.‹ø~hŠ®jÚ.i{n™{NûÈÎXúş[Ë®X‹nŠ^KªB"¢XšKÙ’G·&VÖ–ç×6°¢6&BæVæD6†–ÆB†–æfò“°¢6öç7B&"ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢&"æ6Æ74æÖRÒ&Ö7F–öç2#°¢6öç7BvòÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&'WGFöâ"“°¢vòçFW‡D6öçFVçBÒ.iú^yÈ²#°¢vòæöæ6Æ–6²Ò‚’Óâ7F–öç2ææf–vFUFò‡7FGW2ç&W6VçFF–öä–BÂ7FGW2ç6Æ–FT–B“°¢&"æVæD6†–ÆB†vò“°¢6öç7B’ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&'WGFöâ"“°¢’çFW‡D6öçFVçBÒ$’[Ë®X‹nKÙÎzÙB#°¢’æöæ6Æ–6²Ò7–æ2‚’Óâ°¢’æF—6&ÆVBÒG'VS°¢G'’°¢6öç7B&W7VÇBÒv—B7F–öç2æf÷&6T”ç7vW"‡–B“°¢–b‚&W7VÇCòæö²bb&W7VÇCòç&V6öâÓÒ&ç7vW&–ær"’6öç6öÆRçv&â‚%¾™ºŠûîZ.Xªh˜µÕµt$åÕ´7F—fU&ö&ÆV×5Ò’[Ë®X‹nKÙÎzÙNZK‹JS¢"Â&W7VÇB“°¢Òf–æÆÇ’°¢’æF—6&ÆVBÒfÇ6S°¢WFFT7F—fU&ö&ÆV×2‚“°¢Ğ¢Ó°¢&"æVæD6†–ÆB†’“°¢6öç7BVF—BÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&'WGFöâ"“°¢VF—BçFW‡D6öçFVçBÒ.{Én‹éşŠ^KªB#°¢VF—Bæöæ6Æ–6²Ò‚’Óâ°¢7F–öç2ææf–vFUFò‡7FGW2ç&W6VçFF–öä–BÂ7FGW2ç6Æ–FT–B“°¢v–æF÷ræF—7F6„WfVçB†æWr7W7FöÔWfVçB‚'–·C¦÷Vâ×&ö&ÆVÒÖÆ—7B"Â°¢FWF–Ã¢°¢&ö&ÆVÔ–C¢–@¢Ğ¢Ò’“°¢Ó°¢&"æVæD6†–ÆB†VF—B“°¢6&BæVæD6†–ÆB†&"“°¢&÷‚æVæD6†–ÆB†6&B“°¢Ò“°¢F—6Ö—76Å7FFRç'VæR†7F—fU&ö&ÆVÔ–G2“°¢–b†&÷‚æ6†–ÆG&VâæÆVæwF‚ÓÓÒ’&ö÷BCç7G–ÆRæF—7Æ’Ò&æöæR#²VÇ6R&ö÷BCç7G–ÆRæF—7Æ’Ò"#°¢Ğ¢f"GÂÒsÆF—b–CÒ'–·B×GWF÷&–Â×æVÂ"6Æ73Ò'–·B×æVÂ#åÆâÆF—b6Æ73Ò'æVÂÖ†VFW"#åÆâÆƒ3î™ºŠûîZ.Xªh˜¾KÛşyJiYzˆ³Âöƒ3åÆâÇ7â6Æ73Ò&6Æ÷6RÖ'Fâ"–CÒ'–·B×GWF÷&–ÂÖ6Æ÷6R#ãÆ’6Æ73Ò&f2f×F–ÖW2#ãÂö“ãÂ÷7ãåÆâÂöF—cåÆåÆâÆF—b6Æ73Ò'æVÂÖ&öG’#åÆâÆF—b6Æ73Ò'GWF÷&–ÂÖ6öçFVçB#åÆâÆƒCî[z^X[~x˜iÊÃÂöƒCåÆâÇãã#ãSÂ÷åÆåÆâÆƒCîX©şˆ;ŞK¸¾{¸ÓÂöƒCåÆâÇä™ºŠûîZ.Xªh˜¾iŠşKˆKŠ®K‹®™ºŠûîZ.hùKé¾‹è^XªX©şˆ;Şy¨N[z^X[~ûÈÎXúşKº^[ŠîXªKÚi»NZ[ŞYËXø.KˆîŠûîZ.K©.Xª8#Â÷åÆâÇîšyºîK¹>[©>ûÉ£Æ‡&VcÒ&‡GG3¢òöv—F‡V"æ6öÒõ¦—G6We¥’÷—V¶WFærÖ†VÇW"ÖWFò"F&vWCÒ%ö&Ææ²"&VÃÒ&æö÷VæW"#äv—D‡V#ÂöãÂ÷åÆâÇîˆI®iÊÎZèŠ8^ûÉ£Æ‡&VcÒ&‡GG3¢òöw&V7–f÷&²æ÷&r÷¦‚Ô4â÷67&—G2óS3Cc’Ö’TS’S”"T‚TS‚TbT$RTSRTSƒ"TSRS„T’TSbSƒ’S„"ÒTSbT‚TTSRS”BS“rTSRS„2S“bTSbS”RSƒBTSRT$"T$TSrSƒ’Sƒ‚"F&vWCÒ%ö&Ææ²"&VÃÒ&æö÷VæW"#äw&V7”f÷&³ÂöãÂ÷åÆåÆâÆƒCî[z^X[~jşhÈ™*îŠûNiˆãÂöƒCåÆâÇVÃåÆâÆÆ“ãÆ’6Æ73Ò&f2fÖ&VÆÂ#ãÂö“âÆ#îKšš)hù˜i#Âö#îûÉ®Xˆ~hÚ.iŠşY
nYÊikKšš)X{®xëi{ni‹îzK®˜	®yú^hùzK®ûÈ‰9Şˆ›#Ş[ÈY
şûÈ8#ÂöÆ“åÆâÆÆ“ãÆ’6Æ73Ò&f2fÖf–ÆR×÷vW'ö–çB#ãÂö“âÆ#îŠûîK»nkXşŠxƒÂö#îûÉ®iú^yÈ¾ŠûîK»nKˆîš)yºîš^™Ú.ûÈÎhù™zîXúşŠxXh^Zë8#ÂöÆ“åÆâÆÆ“ãÆ’6Æ73Ò&f2f×&ö&÷B#ãÂö“âÆ#ä’Šz>zÙCÂö#îûÉ®Y	’Šú.™zî[Ù>X˜Şš)yºî[›ni‹îzK®[»®ŠêîzÙNj8#ÂöÆ“åÆâÆÆ“ãÆ’6Æ73Ò&f2fÖÖv–2×væB×7&¶ÆW2#ãÂö“âÆ#îˆz®XªKÙÎzÙCÂö#îûÉ®Xˆ~hÚ.ˆz®XªKÙÎzÙNûÈ‰9Şˆ›#Ş[ÈY
şûÈ8#ÂöÆ“åÆâÆÆ“ãÆ’6Æ73Ò&f2fÖ6ör#ãÂö“âÆ#îŠëî{ÚãÂö#îûÉ®˜XŞ{Úâ’Zøn™*^Kˆîˆz®XªKÙÎzÙNXø.i[8#ÂöÆ“åÆâÆÆ“ãÆ’6Æ73Ò&f2f×VW7F–öâÖ6—&6ÆR#ãÂö“âÆ#îKÛşyJiYzˆ³Âö#îûÉ®i‹îzK¢ş™©‰xş[Ù>X˜ŞiYzˆ¾š^™Ú.8#ÂöÆ“åÆâÂ÷VÃåÆåÆâÆƒCîˆz®XªKÙÎzÙCÂöƒCåÆâÇVÃåÆâÆÆ“îYÊŠëî{ÚîKŠŞ[ÈY
şˆz®XªKÙÎzÙN[›n˜XŞ{Úî[»n‹ùòş™¨şiË®[»n‹ùş8#ÂöÆ“åÆâÆÆ“î™ÈŠh˜XŞ{ÚâÄÄÒ’Zøn™*^8#ÂöÆ“åÆâÆÆ“îzÙNjiÚ^ˆz¢ûÈÎ{¹>iéÎK¸^Ké¾Xø.ˆ>8#ÂöÆ“åÆâÆÆ“îZh.iéÎX‹~ikKŠŞijŞK¨b’h	Şˆ>ûÈÎXúşYÊ[Ù>X˜Şš)yºîš^8kK¾Xªš)yºîXÚx˜~8š)yºîX‰~Šh‰b’™Ú.iÛşx+X{¾(	Ä’[Ë®X‹nKÙÎzÙN(	Ş8#ÂöÆ“åÆâÆÆ“ä’XˆniéYîKÉ®i‹îzK®{¹>ièNXÉnzÙNj{Én‹éjnûÉ¾zîŠêNh‰nKúîiKYîXúşhùKªN8.[{.‹ø~hŠ®jÚ.i{n™{Ny¨Nš)yºîKÉ®XXzîŠêNûÈÎXhŞ‹[[Ë®X‹nŠ^KªN8#ÂöÆ“åÆâÆÆ“îŠëî{ÚîKŠŞy¨N(	ÎX‹~ikYîh.ZHŞ(	Ş(	Î‹ø~iÉşˆz®XªŠ^KªN(	Ş(	Îhš¾høşiÊ®KÙÎzÙNš)(	Şy»K©.xºÎz¸¾ûÈÎ›¹ŠêNX[>™zŞûÉ¾h.ZHŞK¸^ZHNyniÊÎYË[{.{¸şŠë[Ù^y¨Nš)yºî8#ÂöÆ“åÆâÂ÷VÃåÆåÆâÆƒCîX‹~ikh.ZHŞŠûNiˆãÂöƒCåÆâÇVÃåÆâÆÆ“îˆI®iÊÎKÉ®hÈŠûîzˆ¾KùŞZÙš)yºîy¨Nhé.™‰ş8KÙÎzÙNKŠŞY(ÎZK‹J^x«nhûÈÎKˆŞKùŞZÙ‚’Zøn™*^h‰b’Xéşih~8#ÂöÆ“åÆâÆÆ“î[ÈY
ş(	ÎX‹~ikYîh.ZHŞ[{.hé.™‰òşŠ*¾KŠŞijŞy¨B’KÙÎzÙN(	ŞYîûÈÎX‹~ikš^™Ú.KÉ®˜xŞik[ÈZx¾iÊ®ZèÎh‰y¨B’Šû~k.ûÉ¾YÎKˆš)KˆŞKÉ®[›nXùhùKªN8#ÂöÆ“åÆâÆÆ“î[ÈY
ş(	ÎX‹~ikYîˆz®Xª[Ë®X‹nŠ^KªN[{.‹ø~iÉşš)yºî(	ŞYîûÈÎ‹ø~iÉşy¨Nh.ZHŞK»¾XªKÉ®‹>yJŠ^KªNhê^Xú>ûÉ¾[»®ŠêîXú®YÊiˆîzî™ÈŠhi{n[ÈY
ş8#ÂöÆ“åÆâÆÆ“î(	Îˆz®Xªhš¾høş[Ù>X˜ŞŠûîzˆ¾KŠŞiÊ®KÙÎzÙNš)yºî(	ŞXúşˆ;ŞXÈ^Y
¾iz~ŠûîK»nš)ûÈÎ›¹ŠêNX[>™zŞûÉ¾KˆŞ™ÈŠhi{nKùŞhÈX[>™zŞ8#ÂöÆ“åÆâÂ÷VÃåÆåÆâÆƒCä’Šz>zÙCÂöƒCåÆâÆöÃåÆâÆÆ“îx+X{¾Šëî{ÚîûÈƒÆ’6Æ73Ò&f2fÖ6ör#ãÂö“îûÈZ¾XZR’¶W8#ÂöÆ“åÆâÆÆ“îjøşKŠ¢’&öf–ÆRXúşXÙ^xºÎŠëî{ÚâFV×W&GW&^ûÈƒ(	3.ûÈûÉ¾yYz›®i{nKÛşyJjŠYè¾›¹ŠêNXÎûÈÎKˆŞKÉ®Xù˜Šú^Xø.i[8#ÂöÆ“åÆâÆÆ“îx+X{²’Šz>zÙNûÈƒÆ’6Æ73Ò&f2f×&ö&÷B#ãÂö“îûÈYîKÉ®Zû(	Î[Ù>X˜Şš)yºâşiÈ‹ù˜~X‹y¨Nš)yºî(	ŞŠú.™zî[›nŠz>ié8#ÂöÆ“åÆâÂööÃåÆåÆâÆƒCîŠûîZ.hù˜i.8jÎ™Ú.‹zşyKKˆîKªî[óÂöƒCåÆâÇVÃåÆâÆÆ“îŠëî{ÚîKŠŞXúşKº^XˆnXŠ¾hê~X‹nikš)8ikKˆ‹Úî[Ë[™^8riÚ[Ë[™^‹ëîX‹‹yşXùiÚK»n8š){¸NXù[ˆ>8ŠûîK»nXù[ˆ>8X[nK¹nXù[ˆ>8Kˆ¾ŠûîKº^Xø®ˆz®XªKÙÎzÙNy¨NjøşKŠ®™‹një^ûÉ¾{;¾{¹ş˜	®yú^8š^™Ú.[Ëz©~Y(ÎhùzK®™û>K™şXúşXÙ^xºÎX[>™zŞ8#ÂöÆ“åÆâÆÆ“îh™>[Èh‰n{û¾™ˆ^iz~ŠûîK»nKˆŞKÉ®ŠznXùŠûîK»nXù[ˆ>hù˜i.ûÉ¾Xù[ˆ>{¾hù˜i.Xú®hùzK®ûÈÎKˆŞKÉ®ˆz®XªKÙÎzÙNh‰nhùKªN8#ÂöÆ“åÆâÆÆ“îYÊ(	ÎŠûîZ.‹ùŠÎ(	ŞKŠŞh™>[È(	Î˜xŞZHŞ[Ë[™^ˆz®Xª‹yşXù(	ŞYîûÈÎ‹ùî{ºÒriÚ[Ë[™^YÊ‚3zy.Xh^KÉ®‹yşXùX{®xëjÊi[iÈZI®y¨Nih~iÊÎûÉ³riÚ˜;ŞKˆŞy»YÎi{nhÈ˜hºŠxNX‰‹yşXùiÈikKˆiÚ8.y»˜+¾[Ë[™^™{N™©N‹ëîX‹czy.zé~ikKˆ‹ÚîûÈÎjøş‹ÚîiÈZI¢"iÚûÈÎYÎKˆih~iÊÎjøş‹ÚîXú®‹yşXùKˆjÊ8.hù˜i.Šëî{Úî‹ùXúşKº^hùzK®ikKˆ‹Úî[ÈZx¾Y(Î‹ëîX‹riÚ‹yşXùiÚK»ny¨Ni{nX‹¾8.X©şˆ;Ş›¹ŠêNX[>™zŞ8#ÂöÆ“åÆâÆÆ“îXû>Kˆ¾Šy.kK¾Xªš)yºîXÚx˜~Xû>Kˆ®Šy.y¨N(	Ì9~(	ŞXú®™©‰xşXÚx˜~ûÈÎKˆŞXŠ™šNš)yºî8KˆŞXùnkhˆz®XªKÙÎzÙNûÉ¾š)yºîZèÎh‰h‰nzk¾[ÈkK¾Xªx«nhYîûÈÎX[>™zŞŠë[Ù^KÉ®ˆz®Xªkˆ^yn8#ÂöÆ“åÆâÆÆ“îˆI®iÊÎXú®‹ùŠÎjÎ™Ú.zºşX©şˆ;Ş8.ˆº^™ºŠûîZ.‹{>‹ÚÎX‹Æ6öFSâöÒ÷c#Âö6öFSîûÈÎˆI®iÊÎKÉ®ˆz®XªiKXiK‹®Zû[©NjÎ™Ú.‹zş[èNûÉ¾ˆº^iÈŞXªYšK¸Ş[Ë®X‹n‹{>Y¹îh˜¾iË®x˜ûÈÎŠû~YÊkXşŠxYšKŠŞY
şyJ(	ÎjÎ™Ú.x˜{Ùz¹(	Ş8#ÂöÆ“åÆâÆÆ“î{;¾{¹ş˜	®yú^™ÈyKkXşŠxYšh‰nzúiKxËNhèK¨iØ>™™ûÉ¾ˆI®iÊÎKˆŞKÉ®ˆz®XªŠû~k.h‰nKúîiK{;¾{¹ş˜	®yú^iØ>™™8#ÂöÆ“åÆâÆÆ“î(	ÎŠûîZ.KùŞhÈKªî[ş(	ŞK¸^YÊXúşŠxy¨NŠûîZ.š^™‹.jÚ.ˆz®XªxhN[şûÈÎizk9^™‹¾jÚ.h˜¾Xª™H[ş8YîXûXk¾{¹>h‰n{;¾{¹şyÈyK^zÙnyZ^8#ÂöÆ“åÆâÂ÷VÃåÆåÆâÆƒCîk:hHşK¨¾š“ÂöƒCåÆâÇã’K¸^Ké¾ZÚnKšXø.ˆ>ûÈÎŠû~xºÎz¸¾h	Şˆ>ûÉ³Â÷åÆâÇã"’YynKÛşyJ‚’š)Ş[ªnûÉ³Â÷åÆâÇã2’zÙNjKˆŞKùŞŠøRjÚ>zîûÉ³Â÷åÆâÇãB’ˆz®XªKÙÎzÙNiÈKˆZé®š8î™šûÈÎ‹
hXî[ÈY
ş8#Â÷åÆåÆâÆƒCîˆN{;¾ik[ÈóÂöƒCåÆâÇVÃåÆâÆÆ“îŠû~YÊƒÆ‡&VcÒ&‡GG3¢òöv—F‡V"æ6öÒõ¦—G6We¥’÷—V¶WFærÖ†VÇW"ÖWFòö—77VW2"F&vWCÒ%ö&Ææ²"&VÃÒ&æö÷VæW"#äv—D‡V"—77VW3ÂöîhùX{®™zîš)ƒÂöÆ“åÆâÂ÷VÃåÆâÂöF—cåÆâÂöF—cåÆãÂöF—cåÆâs°¢ÆWBÖ÷VçFVBÒfÇ6S°¢ÆWB&ö÷C°¢gVæ7F–öâB‡6VÂ’°¢&WGW&âFö7VÖVçBçVW'•6VÆV7F÷"‡6VÂ“°¢Ğ¢gVæ7F–öâÖ÷VçEGWF÷&–ÅæVÂ‚’°¢–b†Ö÷VçFVB’&WGW&â&ö÷C°¢6öç7B†÷7BÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢†÷7Bæ–ææW$…DÔÂÒGÃ°¢Fö7VÖVçBæ&öG’æVæD6†–ÆB††÷7Bæf—'7DVÆVÖVçD6†–ÆB“°¢&ö÷BÒFö7VÖVçBævWDVÆVÖVçD'”–B‚'–·B×GWF÷&–Â×æVÂ"“°¢B‚"7–·B×GWF÷&–ÂÖ6Æ÷6R"“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ6†÷uGWF÷&–ÅæVÂ†fÇ6R’“°¢Ö÷VçFVBÒG'VS°¢&WGW&â&ö÷C°¢Ğ¢gVæ7F–öâ6†÷uGWF÷&–ÅæVÂ‡f—6–&ÆRÒG'VR’°¢Ö÷VçEGWF÷&–ÅæVÂ‚“°¢&ö÷Bæ6Æ74Æ—7BçFövvÆR‚'f—6–&ÆR"Âf—6–&ÆR“°¢Ğ¢gVæ7F–öâFövvÆUGWF÷&–ÅæVÂ‚’°¢Ö÷VçEGWF÷&–ÅæVÂ‚“°¢6öç7Bf—2Ò&ö÷Bæ6Æ74Æ—7Bæ6öçF–ç2‚'f—6–&ÆR"“°¢6†÷uGWF÷&–ÅæVÂ‚f—2“°¢6öç7B†VÇ'FâÒFö7VÖVçBævWDVÆVÖVçD'”–B‚'–·BÖ'FâÖ†VÇ"“°¢–b††VÇ'Fâ’†VÇ'Fâæ6Æ74Æ—7BçFövvÆR‚&7F—fR"Âf—2“°¢Ğ¢òò7&2÷V’÷V’Ö’æ§0¢6öç7Bö6öæf–rÒö&¦V7Bæ76–vâ‡·ÒÂDTdTÅEô4ôäd”rÂ7F÷&vRævWB‚&6öæf–r"Â·Ò’“°¢ö6öæf–ræ’æ¶–Ö””¶W’Ò7F÷&vRævWB‚&¶–Ö””¶W’"Âö6öæf–ræ’æ¶–Ö””¶W’“°¢ö6öæf–råE•UôÔÒö6öæf–råE•UôÔÇÂ$ô$ÄTÕõE•UôÔ°¢–b‡G—Vöbö6öæf–ræWFô¦ö–äVæ&ÆVBÓÓÒ'VæFVf–æVB"’ö6öæf–ræWFô¦ö–äVæ&ÆVBÒfÇ6S°¢–b‡G—Vöbö6öæf–ræWFôç7vW$öäWFô¦ö–âÓÓÒ'VæFVf–æVB"’ö6öæf–ræWFôç7vW$öäWFô¦ö–âÒG'VS°¢–b‡G—Vöbö6öæf–ræWFõ&V6÷fW%Væç7vW&VBÓÓÒ'VæFVf–æVB"’ö6öæf–ræWFõ&V6÷fW%Væç7vW&VBÒfÇ6S°¢–b‡G—Vöbö6öæf–ræWFõ&V6÷fW$W‡—&VBÓÓÒ'VæFVf–æVB"’ö6öæf–ræWFõ&V6÷fW$W‡—&VBÒfÇ6S°¢–b‡G—Vöbö6öæf–ræWFõ66åVæç7vW&VBÓÓÒ'VæFVf–æVB"’ö6öæf–ræWFõ66åVæç7vW&VBÒfÇ6S°¢–b‡G—Vöbö6öæf–ræ–gFW‚ÓÓÒ'VæFVf–æVB"’ö6öæf–ræ–gFW‚ÒG'VS°¢–b‡G—Vöbö6öæf–ræ’ÓÓÒ'VæFVf–æVB"ÇÂö6öæf–ræ’’ö6öæf–ræ’Ò·Ó°¢–b‡G—Vöbö6öæf–ræ’æö7$’ÓÓÒ'VæFVf–æVB"’ö6öæf–ræ’æö7$’Ò"#°¢–b‡G—Vöbö6öæf–ræ’æö7$”¶W’ÓÓÒ'VæFVf–æVB"’ö6öæf–ræ’æö7$”¶W’Ò"#°¢–b‡G—Vöbö6öæf–ræ’çG&ç6ÆFT’ÓÓÒ'VæFVf–æVB"’ö6öæf–ræ’çG&ç6ÆFT’Ò"#°¢–b‡G—Vöbö6öæf–ræ’çG&ç6ÆFT”¶W’ÓÓÒ'VæFVf–æVB"’ö6öæf–ræ’çG&ç6ÆFT”¶W’Ò"#°¢–b‡G—Vöbö6öæf–ræ’çG&ç6ÆFTÖöFVÂÓÓÒ'VæFVf–æVB"’ö6öæf–ræ’çG&ç6ÆFTÖöFVÂÒ"#°¢–b‡G—Vöbö6öæf–rææ÷F–g•&ö&ÆV×2ÓÓÒ'VæFVf–æVB"’ö6öæf–rææ÷F–g•&ö&ÆV×2ÒG'VS°¢–b‡G—Vöbö6öæf–rææ÷F–g•÷WGW&F–öâÓÓÒ'VæFVf–æVB"’ö6öæf–rææ÷F–g•÷WGW&F–öâÒVS3°¢–b‡G—Vöbö6öæf–rææ÷F–g•föÇVÖRÓÓÒ'VæFVf–æVB"’ö6öæf–rææ÷F–g•föÇVÖRÒãc°¢–b‡G—Vöbö6öæf–ræ7W7FöÔæ÷F–g”VF–õ7&2ÓÓÒ'VæFVf–æVB"’ö6öæf–ræ7W7FöÔæ÷F–g”VF–õ7&2Ò"#°¢–b‡G—Vöbö6öæf–ræ7W7FöÔæ÷F–g”VF–ôæÖRÓÓÒ'VæFVf–æVB"’ö6öæf–ræ7W7FöÔæ÷F–g”VF–ôæÖRÒ"#°¢ö6öæf–ræWFô¦ö–äVæ&ÆVBÒö6öæf–ræWFô¦ö–äVæ&ÆVC°¢ö6öæf–ræWFôç7vW$öäWFô¦ö–âÒö6öæf–ræWFôç7vW$öäWFô¦ö–ã°¢ö6öæf–ræWFõ&V6÷fW%Væç7vW&VBÒö6öæf–ræWFõ&V6÷fW%Væç7vW&VC°¢ö6öæf–ræWFõ&V6÷fW$W‡—&VBÒö6öæf–ræWFõ&V6÷fW$W‡—&VC°¢ö6öæf–ræWFõ66åVæç7vW&VBÒö6öæf–ræWFõ66åVæç7vW&VC°¢gVæ7F–öâ6fT6öæf–r‚’°¢G'’°¢7F÷&vRç6WB‚&6öæf–r"Â°¢ââçF†—2æ6öæf–rÀ¢WFô¦ö–äVæ&ÆVC¢F†—2æ6öæf–ræWFô¦ö–äVæ&ÆVBÀ¢WFôç7vW$öäWFô¦ö–ã¢F†—2æ6öæf–ræWFôç7vW$öäWFô¦ö–à¢Ò“°¢–b‡G—Vöbv–æF÷rÓÒ'VæFVf–æVB"’v–æF÷ræF—7F6„WfVçCòâ†æWr7W7FöÔWfVçB‚'–·C¦WFòÖç7vW"Ö6öæf–rÖ6†ævVB"’“°¢Ò6F6‚†R’°¢6öç6öÆRçv&â‚%·V’ç6fT6öæf–uÒf–ÆVB"ÂR“°¢Ğ¢Ğ¢òò™Ú.iÛş[.{ª~zêy`¢ÆWB7W'&VçE¤–æFW‚ÒSs°¢gVæ7F–öâVæ&ÆTæ÷F–g”G&r‡w&W"Â†æFÆRÂ'&–æuFôg&öçB’°¢–b‚w&W"ÇÂ†æFÆR’&WGW&ã°¢ÆWBG&vv–ærÒfÇ6S°¢ÆWB7F'E‚Ò°¢ÆWB7F'E’Ò°¢ÆWB÷&–v–äÆVgBÒ°¢ÆWB÷&–v–åF÷Ò°¢6öç7Böåö–çFW$Ö÷fRÒWbÓâ°¢–b‚G&vv–ær’&WGW&ã°¢6öç7BæW‡DÆVgBÒÖF‚æÖ‚ƒ‚Â÷&–v–äÆVgB²Wbæ6Æ–VçE‚Ò7F'E‚“°¢6öç7BæW‡EF÷ÒÖF‚æÖ‚ƒ‚Â÷&–v–åF÷²Wbæ6Æ–VçE’Ò7F'E’“°¢w&W"ç7G–ÆRæÆVgBÒG¶æW‡DÆVgG×†°¢w&W"ç7G–ÆRçF÷ÒG¶æW‡EF÷×†°¢w&W"ç7G–ÆRç&–v‡BÒ&WFò#°¢w&W"ç7G–ÆRæ&÷GFöÒÒ&WFò#°¢Ó°¢6öç7B7F÷G&rÒ‚’Óâ°¢G&vv–ærÒfÇ6S°¢v–æF÷rç&VÖ÷fTWfVçDÆ—7FVæW"‚'ö–çFW&Ö÷fR"Âöåö–çFW$Ö÷fR“°¢v–æF÷rç&VÖ÷fTWfVçDÆ—7FVæW"‚'ö–çFW'W"Â7F÷G&r“°¢v–æF÷rç&VÖ÷fTWfVçDÆ—7FVæW"‚'ö–çFW&6æ6VÂ"Â7F÷G&r“°¢Ó°¢†æFÆRæFDWfVçDÆ—7FVæW"‚'ö–çFW&F÷vâ"ÂWbÓâ°¢–b†Wbæ'WGFöâÓÒ’&WGW&ã°¢–b†WbçF&vWCòæ6Æ÷6W7Còâ‚&'WGFöâÂÂ–çWBÂFW‡F&VÂ6VÆV7B"’’&WGW&ã°¢6öç7B&V7BÒw&W"ævWD&÷VæF–æt6Æ–VçE&V7B‚“°¢G&vv–ærÒG'VS°¢7F'E‚ÒWbæ6Æ–VçEƒ°¢7F'E’ÒWbæ6Æ–VçE“°¢÷&–v–äÆVgBÒ&V7BæÆVgC°¢÷&–v–åF÷Ò&V7BçF÷°¢w&W"ç7G–ÆRæÆVgBÒG·&V7BæÆVgG×†°¢w&W"ç7G–ÆRçF÷ÒG·&V7BçF÷×†°¢w&W"ç7G–ÆRç&–v‡BÒ&WFò#°¢w&W"ç7G–ÆRæ&÷GFöÒÒ&WFò#°¢'&–æuFôg&öçCòâ‡w&W"“°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚'ö–çFW&Ö÷fR"Âöåö–çFW$Ö÷fR“°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚'ö–çFW'W"Â7F÷G&r“°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚'ö–çFW&6æ6VÂ"Â7F÷G&r“°¢Wbç&WfVçDFVfVÇB‚“°¢Ò“°¢Ğ¢6öç7BV’Ò°¢vWB6öæf–r‚’°¢&WGW&âö6öæf–s°¢ÒÀ¢6fT6öæf–s¢6fT6öæf–rÀ¢WFFU&W6VçFF–öäÆ—7C¢WFFU&W6VçFF–öäÆ—7BÀ¢WFFU6Æ–FUf–Ws¢WFFU6Æ–FUf–WrÀ¢6´”f÷$7W'&VçC¢6´”f÷$7W'&VçBÀ¢WFFU&ö&ÆVÔÆ—7C¢WFFU&ö&ÆVÔÆ—7BÀ¢WFFT7F—fU&ö&ÆV×3¢WFFT7F—fU&ö&ÆV×2À¢òòhùXØ~™Ú.iÛş[.{ª~y¨N‹è^XªX{Şi[ ¢ö'&–æuFôg&öçB‡æVÄVÆVÖVçB’°¢–b‡æVÄVÆVÖVçBbbæVÄVÆVÖVçBæ6Æ74Æ—7Bæ6öçF–ç2‚'f—6–&ÆR"’’°¢7W'&VçE¤–æFW‚³Ò°¢æVÄVÆVÖVçBç7G–ÆRç¤–æFW‚Ò7W'&VçE¤–æFWƒ°¢Ğ¢ÒÀ¢òòKúîiKYîy¨N™Ú.iÛşi‹îzK®X{Şi[ûÈÎk{¾Xª¢Ö–æFWzêy`¢6†÷u&W6VçFF–öåæVÂ‡f—6–&ÆRÒG'VR’°¢6†÷u&W6VçFF–öåæVÂ‡f—6–&ÆR“°¢–b‡f—6–&ÆR’°¢6öç7BæVÂÒFö7VÖVçBævWDVÆVÖVçD'”–B‚'–·B×&W6VçFF–öâ×æVÂ"“°¢F†—2åö'&–æuFôg&öçB‡æVÂ“°¢Ğ¢ÒÀ¢6†÷u&ö&ÆVÔÆ—7EæVÂ‡f—6–&ÆRÒG'VR’°¢6†÷u&ö&ÆVÔÆ—7EæVÂ‡f—6–&ÆR“°¢–b‡f—6–&ÆR’°¢6öç7BæVÂÒFö7VÖVçBævWDVÆVÖVçD'”–B‚'–·B×&ö&ÆVÒÖÆ—7B×æVÂ"“°¢F†—2åö'&–æuFôg&öçB‡æVÂ“°¢Ğ¢ÒÀ¢6†÷t•æVÂ‡f—6–&ÆRÒG'VR’°¢6†÷t•æVÂ‡f—6–&ÆR“°¢–b‡f—6–&ÆR’°¢6öç7BæVÂÒFö7VÖVçBævWDVÆVÖVçD'”–B‚'–·BÖ’Öç7vW"×æVÂ"“°¢F†—2åö'&–æuFôg&öçB‡æVÂ“°¢Ğ¢ÒÀ¢FövvÆU6WGF–æw5æVÂ‚’°¢FövvÆU6WGF–æw5æVÂ‚“°¢òòj8iú^™Ú.iÛşiŠşY
nXùK‹®XúşŠxx«nh¢6öç7BæVÂÒFö7VÖVçBævWDVÆVÖVçD'”–B‚'–·B×6WGF–æw2×æVÂ"“°¢–b‡æVÂbbæVÂæ6Æ74Æ—7Bæ6öçF–ç2‚'f—6–&ÆR"’’F†—2åö'&–æuFôg&öçB‡æVÂ“°¢ÒÀ¢FövvÆUGWF÷&–ÅæVÂ‚’°¢FövvÆUGWF÷&–ÅæVÂ‚“°¢òòj8iú^™Ú.iÛşiŠşY
nXùK‹®XúşŠxx«nh¢6öç7BæVÂÒFö7VÖVçBævWDVÆVÖVçD'”–B‚'–·B×GWF÷&–Â×æVÂ"“°¢–b‡æVÂbbæVÂæ6Æ74Æ—7Bæ6öçF–ç2‚'f—6–&ÆR"’’F†—2åö'&–æuFôg&öçB‡æVÂ“°¢ÒÀ¢òòYÊ‚–æFW‚æ§2X‰ŞZx¾XÉni{nhÈ.‹ÛŞKˆjÊ¢öÖ÷VçDÆÂ‚’°¢Ö÷VçE6WGF–æw5æVÂ‚“°¢Ö÷VçD•æVÂ‚“°¢Ö÷VçE&W6VçFF–öåæVÂ‚“°¢Ö÷VçE&ö&ÆVÔÆ—7EæVÂ‚“°¢Ö÷VçD7F—fU&ö&ÆV×5æVÂ‚“°¢Ö÷VçEGWF÷&–ÅæVÂ‚“°¢v–æF÷ræFDWfVçDÆ—7FVæW"‚'–·C¦÷VâÖ’"Â‚’ÓâF†—2ç6†÷t•æVÂ‡G'VR’“°¢ÒÀ¢òòš)yºîhù˜i ¢æ÷F–g•&ö&ÆVÒ‡&ö&ÆVÒÂ6Æ–FRÂæ÷F–6RÒ·Ò’°¢G'’°¢6öç7BF—FÆUFW‡BÒæ÷F–6RçF—FÆRÇÂ.Kšš)[{.Xù[ˆ2#°¢6öç7BæF—fUF—FÆRÒæ÷F–6RææF—fUF—FÆRÇÂ.™ºŠûîZ.Kšš)hùzK¢#°¢6öç7BFWF–ÅFW‡BÒæ÷F–6RæFWF–ÂÇÂF†—2ævWE&ö&ÆVÔFWF–Â‡&ö&ÆVÒ“°¢6öç7B6†ææVÇ2ÒvWE&VÖ–æFW$6†ææVÇ2‡F†—2æ6öæf–r“°¢6öç7BföÇVÖRÒvWE&VÖ–æFW%föÇVÖR‡F†—2æ6öæf–r“°¢òò’XéşyIş˜	®yú^ûÈZh.iéÎXúşyJûÈÎZH~yJûÈÎKˆŞ™‹¾z(Şˆz®Zé®K˜[Ëz©~ûÈ¢–b†6†ææVÇ2ææF—fR’G'’°¢F†—2ææF—fTæ÷F–g“òâ‡°¢F—FÆS¢æF—fUF—FÆRÀ¢FW‡C¢FWF–ÅFW‡BÀ¢–ÖvS¢6Æ–FSòçF‡VÖ&æ–ÂÇÂçVÆÂÀ¢F–ÖV÷WC¢ÖF‚æÖ‚ƒ&S2Â·F†—2æ6öæf–rææ÷F–g•÷WGW&F–öâÇÂVS2¢Ò“°¢Ò6F6‚·Ğ¢–b‚6†ææVÇ2ç÷W’°¢–b†6†ææVÇ2ç6÷VæB’F†—2å÷Æ”æ÷F–g•6÷VæB‡föÇVÖR“°¢&WGW&ã°¢Ğ¢òò"’ˆz®Zé®K˜h*ÎkZî[Ëz©p¢6öç7Bw&W"ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢w&W"æ6Æ74æÖRÒ'–·B×&ö&ÆVÒÖæ÷F–g’#°¢òòXh^ˆNj~[ÈşûÈÎ˜şXXŞKéŞ‹YnZIn˜:„550¢ö&¦V7Bæ76–vâ‡w&W"ç7G–ÆRÂ°¢÷6—F–öã¢&f—†VB"À¢&–v‡C¢##‚"À¢&÷GFöÓ¢##G‚"À¢Ö…v–GFƒ¢#3ƒ‚"À¢&6¶w&÷VæC¢'&v&ƒ#Ã#Ã#Ãã“"’"À¢6öÆ÷#¢"6ffb"À¢&÷&FW%&F—W3¢#'‚"À¢&÷…6†F÷s¢#‡‚#G‚&v&ƒÃÃÃã#R’"À¢FF–æs¢#G‚g‚"À¢F—7Æ“¢&fÆW‚"À¢v¢#'‚"À¢Æ–vä—FV×3¢&fÆW‚×7F'B"À¢¤–æFWƒ¢7G&–ær‚²¶7W'&VçE¤–æFW‚’À¢föçE6—¦S¢#G‚"À¢Æ–æT†V–v‡C¢#ãR"À¢&6¶G&÷f–ÇFW#¢&&ÇW"ƒ'‚’"À¢&÷&FW#¢#‚6öÆ–B&v&ƒ#SRÃ#SRÃ#SRÃãb’"À¢7W'6÷#¢&FVfVÇB ¢Ò“°¢òò{ÊyZ^Y»îûÈXúş˜ûÈ¢–b‡6Æ–FSòçF‡VÖ&æ–Â’°¢6öç7B–ÖrÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&–Ör"“°¢–Örç7&2Ò6Æ–FRçF‡VÖ&æ–Ã°¢ö&¦V7Bæ76–vâ†–Örç7G–ÆRÂ°¢v–GFƒ¢#Sg‚"À¢†V–v‡C¢#Sg‚"À¢ö&¦V7Df—C¢&6÷fW""À¢&÷&FW%&F—W3¢#‡‚"À¢fÆWƒ¢#WFò ¢Ò“°¢w&W"æVæD6†–ÆB†–Ör“°¢Ğ¢6öç7B&öG’ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢&öG’ç7G–ÆRæfÆW‚Ò#WFò#°¢6öç7B†VBÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢ö&¦V7Bæ76–vâ††VBç7G–ÆRÂ°¢F—7Æ“¢&fÆW‚"À¢Æ–vä—FV×3¢&6VçFW""À¢§W7F–g”6öçFVçC¢'76RÖ&WGvVVâ"À¢v¢#‡‚"À¢Ö&v–ä&÷GFöÓ¢#g‚"À¢7W'6÷#¢&Ö÷fR"À¢W6W%6VÆV7C¢&æöæR"À¢F÷V6„7F–öã¢&æöæR ¢Ò“°¢6öç7BF—FÆRÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢F—FÆRçFW‡D6öçFVçBÒF—FÆUFW‡C°¢ö&¦V7Bæ76–vâ‡F—FÆRç7G–ÆRÂ°¢föçEvV–v‡C¢#c"À¢föçE6—¦S¢#W‚"À¢fÆWƒ¢#WFò ¢Ò“°¢6öç7B6Æ÷6T'FâÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&'WGFöâ"“°¢6Æ÷6T'FâçFW‡D6öçFVçBÒ'‚#°¢ö&¦V7Bæ76–vâ†6Æ÷6T'Fâç7G–ÆRÂ°¢&÷&FW#¢&æöæR"À¢&6¶w&÷VæC¢'G&ç7&VçB"À¢6öÆ÷#¢"6ffb"À¢÷6—G“¢#ãr"À¢föçE6—¦S¢#‡‚"À¢Æ–æT†V–v‡C¢#‡‚"À¢7W'6÷#¢'ö–çFW""À¢FF–æs¢#G‚"À¢Ö&v–äÆVgC¢#G‚"À¢fÆWƒ¢#WFò ¢Ò“°¢6Æ÷6T'FâæFDWfVçDÆ—7FVæW"‚&Ö÷W6VVçFW""Â‚’Óâ6Æ÷6T'Fâç7G–ÆRæ÷6—G’Ò#"“°¢6Æ÷6T'FâæFDWfVçDÆ—7FVæW"‚&Ö÷W6VÆVfR"Â‚’Óâ6Æ÷6T'Fâç7G–ÆRæ÷6—G’Ò#ãr"“°¢6öç7BFWF–ÂÒFö7VÖVçBæ7&VFTVÆVÖVçB‚'&R"“°¢FWF–ÂçFW‡D6öçFVçBÒFWF–ÅFW‡C°¢ö&¦V7Bæ76–vâ†FWF–Âç7G–ÆRÂ°¢v†—FU76S¢'&R×w&"À¢Ö&v–ã¢À¢föçDfÖ–Ç“¢&–æ†W&—B"À¢÷6—G“¢#ã“""À¢Ö„†V–v‡C¢###‚"À¢÷fW&fÆ÷s¢&WFò ¢Ò“°¢†VBæVæD6†–ÆB‡F—FÆR“°¢†VBæVæD6†–ÆB†6Æ÷6T'Fâ“°¢&öG’æVæD6†–ÆB††VB“°¢&öG’æVæD6†–ÆB†FWF–Â“°¢w&W"æVæD6†–ÆB†&öG’“°¢Fö7VÖVçBæ&öG’æVæD6†–ÆÚ±î¸Â¸­yêë¢°k¢G§¦*^m«ëŒ+Š×®º+º$zzb¥æB‡w&W"“°¢F†—2åö'&–æuFôg&öçB‡w&W"“°¢6öç7BF–ÖV÷WBÒÖF‚æÖ‚ƒ&S2Â·F†—2æ6öæf–rææ÷F–g•÷WGW&F–öâÇÂVS2“°¢6öç7BF–ÖW"Ò6WEF–ÖV÷WB‚‚’Óâw&W"ç&VÖ÷fR‚’ÂF–ÖV÷WB“°¢6Æ÷6T'Fâæöæ6Æ–6²Ò‚’Óâ°¢6ÆV%F–ÖV÷WB‡F–ÖW"“°¢w&W"ç&VÖ÷fR‚“°¢Ó°¢Væ&ÆTæ÷F–g”G&r‡w&W"Â†VBÂVÂÓâF†—2åö'&–æuFôg&öçB†VÂ’“°¢–b†6†ææVÇ2ç6÷VæB’F†—2å÷Æ”æ÷F–g•6÷VæB‡föÇVÖR“°¢Ò6F6‚†R’°¢6öç6öÆRçv&â‚%¾™ºŠûîZ.Xªh˜µÕµt$åÕ·V’ææ÷F–g•&ö&ÆVÕÒf–ÆVC¢"ÂR“°¢Ğ¢ÒÀ¢ò¢ ¢¢6–ævÆRVÖ&VFFVB&VÖ–æFW"–çFW&f6RW6VB'’FW6·F÷æBÖö&–ÆR'VçF–ÖW2à¢¢WfVçB6VÆV7F–öâ†Vç2†W&S²FVÆ—fW'’6VÆV7F–öâ†Vç2–âæ÷F–g•&ö&ÆVÒà¢¢ğ¢æ÷F–g”6Æ77&ööÔWfVçB†WfVçBÒ·Ò’°¢–b‚—5&VÖ–æFW$Væ&ÆVB†WfVçBæ¶–æBÂF†—2æ6öæf–r’’&WGW&âfÇ6S°¢6öç7BFWF–ÂÒWfVçBæFWF–ÂÇÂ.ŠûîZ.x«nhXùyIşK¨nXùXÉb#°¢F†—2ææ÷F–g•&ö&ÆVÒ†WfVçBç&ö&ÆVÒÇÂ°¢&ö&ÆVÔ–C¢WfVçBæFVGWT¶W’ÇÂWfVçBæ¶–æBÇÂ$4Ä55$ôôÕôUdTåB"À¢&öG“¢FWF–ÂÀ¢÷F–öç3¢µĞ¢ÒÂWfVçBç6Æ–FRÇÂçVÆÂÂ°¢F—FÆS¢WfVçBçF—FÆRÇÂ.™ºŠûîZ.hù˜i""À¢æF—fUF—FÆS¢WfVçBææF—fUF—FÆRÇÂWfVçBçF—FÆRÇÂ.™ºŠûîZ.hù˜i""À¢FWF–Ã¢FWF–À¢Ò“°¢&WGW&âG'VS°¢ÒÀ¢æ÷F–g•V&Æ—6‚†WfVçB’°¢6öç7BF—FÆRÒWfVçCòçF—FÆRÇÂ.ŠûîZ.Xh^Zë[{.Xù[ˆ2#°¢6öç7BFWF–ÂÒWfVçCòæFWF–ÂÇÂ.iY[ˆXù[ˆ>K¨niky¨NŠûîZ.Xh^Zë’#°¢6öç7B¶–æBÒ°¢76W76ÖVçC¢&76W76ÖVçB×V&Æ—6‚"À¢6÷W'6Wv&S¢&6÷W'6Wv&R×V&Æ—6‚"À¢÷F†W#¢&÷F†W"×V&Æ—6‚ ¢Õ¶WfVçCòæ6FVv÷'•Ó°¢&WGW&âF†—2ææ÷F–g”6Æ77&ööÔWfVçB‡°¢¶–æC¢¶–æBÀ¢FVGWT¶W“¢WfVçCòæFVGWT¶W’ÇÂ%T$Ä•4‚"À¢F—FÆS¢F—FÆRÀ¢æF—fUF—FÆS¢F—FÆRÀ¢FWF–Ã¢FWF–À¢Ò“°¢ÒÀ¢òòi*ŞiKîˆz®Zé®K˜hùzK®™û2 ¢÷Æ”æ÷F–g•6÷VæB‡föÇVÖRÒãb’°¢6öç7B7&2Ò‡F†—2æ6öæf–ræ7W7FöÔæ÷F–g”VF–õ7&2ÇÂ""’çG&–Ò‚“°¢–b‡7&2’G'’°¢–b‚F†—2åõöæ÷F–g”VF–ôVÂ’°¢F†—2åõöæ÷F–g”VF–ôVÂÒæWrVF–ó°¢F†—2åõöæ÷F–g”VF–ôVÂç&VÆöBÒ&WFò#°¢Ğ¢6öç7BVÂÒF†—2åõöæ÷F–g”VF–ôVÃ°¢VÂçW6R‚“°¢òòˆº^yJh‹~i»NhÚ.K¨n™û>š)ûÈÎh‰nšinjÊŠëî{ÚîûÈÎi»Nik7&0¢–b†VÂç7&2ÓÒ7&2’VÂç7&2Ò7&3°¢VÂçföÇVÖRÒÖF‚æÖ‚ƒÂÖF‚æÖ–âƒÂföÇVÖR’“°¢VÂæ7W'&VçEF–ÖRÒ°¢6öç7BÒVÂçÆ’‚“°¢òòZK‹J^i{nY¹î˜ ¢–b‡bbG—Vöbæ6F6‚ÓÓÒ&gVæ7F–öâ"’æ6F6‚‚‚’ÓâF†—2å÷Æ”æ÷F–g•FöæR‡föÇVÖR’“°¢&WGW&ã°¢Ò6F6‚†R’°¢6öç6öÆRçv&â‚%¾™ºŠûîZ.Xªh˜µÕµt$åÒ7W7FöÒVF–òf–ÆVBÂfÆÆ&6²FòFöæS¢"ÂR“°¢òòY¹î˜X‹Yh‰™û0¢Ğ¢F†—2å÷Æ”æ÷F–g•FöæR‡föÇVÖR“°¢ÒÀ¢òòzèi‰>hùzK®™û>ûÉ®KŠNKŠ®™û>š¹y¨NyúŞKø>(	ÎXúâŞY)®(	Ğ¢÷Æ”æ÷F–g•FöæR‡föÇVÖRÒãb’°¢G'’°¢6öç7B7G‚ÒæWr‡v–æF÷räVF–ô6öçFW‡BÇÂv–æF÷rçvV&¶—DVF–ô6öçFW‡B“°¢6öç7Bæ÷rÒ7G‚æ7W'&VçEF–ÖS°¢6öç7BÖ7FW"Ò7G‚æ7&VFTv–â‚“°¢Ö7FW"æv–âçfÇVRÒÖF‚æÖ‚ƒÂÖF‚æÖ–âƒÂföÇVÖR’“°¢Ö7FW"æ6öææV7B†7G‚æFW7F–æF–öâ“°¢6öç7BFöæRÒ†g&WÂCÂGW"Òã"’Óâ°¢6öç7B÷62Ò7G‚æ7&VFT÷66–ÆÆF÷"‚“°¢6öç7Bv–âÒ7G‚æ7&VFTv–â‚“°¢÷62çG—RÒ'6–æR#°¢÷62æg&WVVæ7’ç6WEfÇVTEF–ÖR†g&WÂC“°¢v–âæv–âç6WEfÇVTEF–ÖRƒÂC“°¢v–âæv–âæÆ–æV%&×FõfÇVTEF–ÖRƒÂC²ã“°¢v–âæv–âæW‡öæVçF–Å&×FõfÇVTEF–ÖR‚ãÂC²GW"“°¢÷62æ6öææV7B†v–â“°¢v–âæ6öææV7B†Ö7FW"“°¢÷62ç7F'B‡C“°¢÷62ç7F÷‡C²GW"²ã"“°¢Ó°¢FöæRƒƒƒÂæ÷r“°¢òòP¢FöæRƒ3‚ãSÂæ÷r²ãb“°¢òòS`¢òòˆz®XªX[>™zĞ¢6WEF–ÖV÷WB‚‚’Óâ7G‚æ6Æ÷6R‚’ÂS“°¢Ò6F6‚·Ğ¢ÒÀ¢òòKé¾Šëî{Úîš^‹>yJûÉ®XiXZRşkˆ^™šNˆz®Zé®K˜hùzK®™û0¢6WD7W7FöÔæ÷F–g”VF–ò‡·7&3¢7&2ÂæÖS¢æÖWÒ’°¢F†—2æ6öæf–ræ7W7FöÔæ÷F–g”VF–õ7&2Ò7&2ÇÂ"#°¢F†—2æ6öæf–ræ7W7FöÔæ÷F–g”VF–ôæÖRÒæÖRÇÂ"#°¢F†—2ç6fT6öæf–r‚“°¢ÒÀ¢vWE&ö&ÆVÔFWF–Â‡&ö&ÆVÒ’°¢–b‚&ö&ÆVÒ’&WGW&â.š)yºîiÊ®h›îX‹#°¢6öç7BÆ–æW2Ò²&ö&ÆVÒæ&öG’ÇÂ""Ó°¢–b„'&’æ—4'&’‡&ö&ÆVÒæ÷F–öç2’’Æ–æW2çW6‚‚ââç&ö&ÆVÒæ÷F–öç2æÖ‚‡¶¶W“¢¶W’ÂfÇVS¢fÇVWÒ’ÓâG¶¶W—ÒâG·fÇVWÖ’“°¢&WGW&âÆ–æW2æ¦ö–â‚%Æâ"“°¢ÒÀ¢6öæf—&Ò†ÖW76vR’°¢&WGW&â&öÖ—6Rç&W6öÇfR‡G—Vöbv–æF÷rÓÒ'VæFVf–æVB"bbG—Vöbv–æF÷ræ6öæf—&ÒÓÓÒ&gVæ7F–öâ"òv–æF÷ræ6öæf—&Ò†ÖW76vR’¢fÇ6R“°¢ÒÀ¢Fö7C¢Fö7BÀ¢æF—fTæ÷F–g“¢vÒææ÷F–g’À¢òò'WGFöç2x«nh¢WFFTWFôç7vW$'Fâ‚’°¢6öç7BVÂÒFö7VÖVçBævWDVÆVÖVçD'”–B‚'–·BÖ'FâÖWFòÖç7vW""“°¢–b‚VÂ’&WGW&ã°¢–b…ö6öæf–ræWFôç7vW"’VÂæ6Æ74Æ—7BæFB‚&7F—fR"“²VÇ6RVÂæ6Æ74Æ—7Bç&VÖ÷fR‚&7F—fR"“°¢Ğ¢Ó°¢òò7&2÷V’÷æVÇ2öWFòÖç7vW"×÷Wæ§0¢òòzèXÙR…DÔÂ‹ÚÎK˜¢gVæ7F–öâW62‡2’°¢&WGW&â7G&–ær‡2’ç&WÆ6R‚õ²cÃâ"uÒörÂ2Óâ‡°¢"b#¢"f×²"À¢#Â#¢"fÇC²"À¢#â#¢"fwC²"À¢r"s¢"gV÷C²"À¢"r#¢"b33“² ¢Õ¶5Ò’“°¢Ğ¢òòi‹îzK®ˆz®XªKÙÎzÙNh‰X©ş[Ëz©p¢gVæ7F–öâ6†÷tWFôç7vW%÷W‡&ö&ÆVÒÂ”ç7vW"Â6frÒ·Ò’°¢òò˜şXXŞ˜xŞZHĞ¢6öç7BW†—7FVBÒFö7VÖVçBævWDVÆVÖVçD'”–B‚'–·BÖWFòÖç7vW"×÷W"“°¢–b†W†—7FVB’W†—7FVBç&VÖ÷fR‚“°¢6öç7B÷WÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢÷Wæ–BÒ'–·BÖWFòÖç7vW"×÷W#°¢÷Wæ6Æ74æÖRÒ&WFòÖç7vW"×÷W#°¢÷Wæ–ææW$…DÔÂÒÆâÆF—b6Æ73Ò'÷WÖ6öçFVçB#åÆâÆF—b6Æ73Ò'÷WÖ†VFW"#åÆâÆƒCãÆ’6Æ73Ò&f2f×&ö&÷B#ãÂö“âˆz®XªKÙÎzÙNh‰X©óÂöƒCåÆâÇ7â6Æ73Ò&6Æ÷6RÖ'Fâ"F—FÆSÒ.X[>™zÒ#ãÆ’6Æ73Ò&f2f×F–ÖW2#ãÂö“ãÂ÷7ãåÆâÂöF—cåÆâÆF—b6Æ73Ò'÷WÖ&öG’#åÆâÆF—b6Æ73Ò'÷W×&÷r÷WÖç7vW"#åÆâÆF—b6Æ73Ò&Æ&VÂ#äXˆnié{¹>iéÎûÉ£ÂöF—cåÆâÆF—b6Æ73Ò&6öçFVçB#âG¶W62†”ç7vW"ÇÂ.izY¹îzÙB"’ç&WÆ6R‚õÆâörÂ#Æ'#â"—ÓÂöF—cåÆâÂöF—cåÆâÂöF—cåÆâÂöF—cåÆâ°¢Fö7VÖVçBæ&öG’æVæD6†–ÆB‡÷W“°¢òòX[>™zŞhÈ™*à¢÷WçVW'•6VÆV7F÷"‚"æ6Æ÷6RÖ'Fâ"“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ÷Wç&VÖ÷fR‚’“°¢òòx+X{¾˜î{ÚX[>™zĞ¢÷WæFDWfVçDÆ—7FVæW"‚&6Æ–6²"ÂRÓâ°¢–b†RçF&vWBÓÓÒ÷W’÷Wç&VÖ÷fR‚“°¢Ò“°¢òòˆz®XªX[>™zĞ¢6öç7B2ÒV’æ6öæf–sòæWFôç7vW%÷WÇÂ·Ó°¢6öç7BWFô6Æ÷6RÒ6fræWFô6Æ÷6Róò2æWFô6Æ÷6RóòG'VS°¢6öç7BWFôFVÆ’Ò6fræWFô6Æ÷6TFVÆ’óò2æWFô6Æ÷6TFVÆ’óòFS3°¢–b†WFô6Æ÷6R’6WEF–ÖV÷WB‚‚’Óâ°¢–b‡÷Wç&VçDæöFR’÷Wç&VÖ÷fR‚“°¢ÒÂWFôFVÆ’“°¢òòXZ^YË®XªyK°¢&WVW7Dæ–ÖF–öäg&ÖR‚‚’Óâ÷Wæ6Æ74Æ—7BæFB‚'f—6–&ÆR"’“°¢Ğ¢òò7&2öæWB÷†‡"Ö–çFW&6WF÷"æ§0¢gVæ7F–öâ–ç7FÆÅ„…$–çFW&6WF÷"‚’°¢6Æ72×•„…"W‡FVæG2„ÔÄ‡GG&WVW7B°¢7FF–2†æFÆW'3ÕµÓ°¢7FF–2FD†æFÆW"†‚’°¢F†—2æ†æFÆW'2çW6‚†‚“°¢Ğ¢÷Vâ†ÖWF†öBÂW&ÂÂ7–æ2’°¢6öç7B'6VBÒæWrU$Â‡W&ÂÂÆö6F–öâæ‡&Vb“°¢f÷"†6öç7B‚öbF†—2æ6öç7G'V7F÷"æ†æFÆW'2’‚‡F†—2ÂÖWF†öBÂ'6VB“°¢&WGW&â7WW"æ÷Vâ†ÖWF†öBÂW&ÂÂ7–æ2óòG'VR“°¢Ğ¢–çFW&6WB†6"’°¢ÆWB–ÆöC°¢6öç7B&u6VæBÒF†—2ç6VæC°¢F†—2ç6VæBÒ&öG’Óâ°¢–ÆöBÒ&öG“°¢&WGW&â&u6VæBæ6ÆÂ‡F†—2Â&öG’“°¢Ó°¢F†—2æFDWfVçDÆ—7FVæW"‚&ÆöB"Â‚’Óâ°¢G'’°¢6"„¥4ôâç'6R‡F†—2ç&W7öç6UFW‡B’Â–ÆöB“°¢Ò6F6‚·Ğ¢Ò“°¢Ğ¢Ğ¢gVæ7F–öâFWFV7DVçf—&öæÖVçDæDFD’‚’°¢6öç7B†÷7FæÖRÒÆö6F–öâæ†÷7FæÖS°¢–b††÷7FæÖRÓÓÒ'wwrç—V¶WFæræ6â"’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒj8kX¾X‹j~Xxn™ºŠûîZ.xêşZ(2"“°¢&WGW&â'7FæF&B#°¢Ğ¢–b††÷7FæÖRÓÓÒ'&òç—V¶WFæræ6â"’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒj8kX¾X‹ˆÛ~Z™ºŠûîZ.xêşZ(2"“°¢&WGW&â'&ò#°¢Ğ¢–b††÷7FæÖRÓÓÒ&6†æv¦–ærç—V¶WFæræ6â"’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒj8kX¾X‹™[şkş™ºŠûîZ.xêşZ(2"“°¢&WGW&â&6†æv¦–ær#°¢Ğ¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´U%%ÒiÊ®yú^xêşZ(3¢"Â†÷7FæÖR“°¢&WGW&â'Væ¶æ÷vâ#°¢Ğ¢×•„…"æFD†æFÆW"‚‡†‡"ÂÖWF†öBÂW&Â’Óâ°¢FWFV7DVçf—&öæÖVçDæDFD’‚“°¢6öç7BF†æÖRÒW&ÂçF†æÖRÇÂ"#°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒ„….Šû~k#¢"ÂÖWF†öBÂF†æÖRÂW&Âç6V&6‚“°¢òòŠûîK»nûÉ®{+îzî‹zş[èNh‰nXÈ^Y
¾X[>™JîZÙp¢–b‡F†æÖRÓÓÒ"ö’÷c2öÆW76öâ÷&W6VçFF–öâöfWF6‚"ÇÂF†æÖRæ–æ6ÇVFW2‚'&W6VçFF–öâ"’bbF†æÖRæ–æ6ÇVFW2‚&fWF6‚"’’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒhºnhŠ®ŠûîK»nŠû~k""“°¢†‡"æ–çFW&6WB‡&W7Óâ°¢6öç7B–BÒW&Âç6V&6…&×2ævWB‚'&W6VçFF–öåö–B"“°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒŠûîK»nY8Ş[©C¢"Â&W7“°¢–b‡&W7bb‡&W7æ6öFRÓÓÒÇÂ&W7ç7V66W72’’7F–öç2æöå&W6VçFF–öäÆöFVB†–BÂ&W7æFFÇÂ&W7ç&W7VÇB“°¢Ò“°¢&WGW&ã°¢Ğ¢òòzÙNš)€¢–b‡F†æÖRÓÓÒ"ö’÷c2öÆW76öâ÷&ö&ÆVÒöç7vW""ÇÂF†æÖRæ–æ6ÇVFW2‚'&ö&ÆVÒ"’bbF†æÖRæ–æ6ÇVFW2‚&ç7vW""’’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒhºnhŠ®zÙNš)Šû~k""“°¢†‡"æ–çFW&6WB‚‡&W7Â–ÆöB’Óâ°¢G'’°¢6öç7B·&ö&ÆVÔ–C¢&ö&ÆVÔ–BÂ&W7VÇC¢&W7VÇGÒÒ¥4ôâç'6R‡–ÆöBÇÂ'·Ò"“°¢–b‡&W7bb‡&W7æ6öFRÓÓÒÇÂ&W7ç7V66W72’’7F–öç2æöäç7vW%&ö&ÆVÒ‡&ö&ÆVÔ–BÂ&W7VÇB“°¢Ò6F6‚†R’°¢6öç6öÆRæW'&÷"‚%¾™ºŠûîZ.Xªh˜µÕ´U%%ÒŠz>iézÙNš)Y8Ş[©NZK‹JS¢"ÂR“°¢Ğ¢Ò“°¢&WGW&ã°¢Ğ¢–b‡W&ÂçF†æÖRÓÓÒ"ö’÷c2öÆW76öâ÷&ö&ÆVÒ÷&WG'’"’°¢†‡"æ–çFW&6WB‚‡&W7Â–ÆöB’Óâ°¢G'’°¢òò&WG'’Šû~k.KÙ>iŠò²&ö&ÆV×3¢·²&ö&ÆVÔ–BÂ&W7VÇBÂââçÕÒĞ¢6öç7B&öG’Ò¥4ôâç'6R‡–ÆöBÇÂ'·Ò"“°¢6öç7Bf—'7BÒ'&’æ—4'&’†&öG“òç&ö&ÆV×2’ò&öG’ç&ö&ÆV×5³Ò¢çVÆÃ°¢–b‡&W7òæ6öFRÓÓÒbbf—'7Còç&ö&ÆVÔ–B’7F–öç2æöäç7vW%&ö&ÆVÒ†f—'7Bç&ö&ÆVÔ–BÂf—'7Bç&W7VÇB“°¢Ò6F6‚·Ğ¢Ò“°¢&WGW&ã°¢Ğ¢–b‡F†æÖRæ–æ6ÇVFW2‚"ö’ò"’’6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕµt$åÒX[nK¹d“¢"ÂÖWF†öBÂF†æÖR“°¢Ò“°¢vÒçWrå„ÔÄ‡GG&WVW7BÒ×•„…#°¢Ğ¢òòÓÓÓÓÒˆz®Xª‹ù¾XZ^ŠûîZ.h˜™Èy¨NiÈ[ò’[Š8RÓÓÓÓĞ¢7–æ2gVæ7F–öâvWDöäÆW76öâ‚’°¢6öç7B÷&–v–âÒÆö6F–öâæ÷&–v–ã°¢6öç7B6ÖRÒÓâæWrU$Â‡Â÷&–v–â’çFõ7G&–ær‚“°¢6öç7B6æF–FFW2Ò²6ÖR‚"ö’÷c2ö6Æ77&ööÒööâÖÆW76öâ"’Â6ÖR‚"öÖöö2Ö’÷cöÆ×2ö6Æ77&ööÒööâÖÆW76öâ"’Â6ÖR‚"ö—c2ö6Æ77&ööÒööâÖÆW76öâ"’Ó°¢6öç7BG&–W2ÒµÓ°¢ÆWBf–æÄÆ—7BÒµÓ°¢ÆWBÆ7DW'"ÒçVÆÃ°¢f÷"†6öç7BW&Âöb6æF–FFW2’°¢6öç7B—FVÒÒ°¢W&Ã¢W&ÂÀ¢ö³¢fÇ6RÀ¢7FGW3¢À¢æ÷FS¢" ¢Ó°¢G'’°¢6öç7B"Òv—BfWF6‚‡W&ÂÂ°¢7&VFVçF–Ç3¢&–æ6ÇVFR ¢Ò“°¢—FVÒç7FGW2Ò"ç7FGW3°¢–b‚"æö²’°¢—FVÒææ÷FRÒ…EEG·"ç7FGW7Ö°¢G&–W2çW6‚†—FVÒ“°¢6öçF–çVS°¢Ğ¢6öç7BFW‡BÒv—B"çFW‡B‚“°¢òòh™>KŠ®{ÊyZ^ûÈÎ˜şXXŞh¨®i[NjëR¥4ôâh™>xˆ`¢—FVÒæ&öG•6æ—WBÒFW‡Bç6Æ–6RƒÂ3“°¢ÆWB¢Ò·Ó°¢G'’°¢¢Ò¥4ôâç'6R‡FW‡B“°¢Ò6F6‚…ò’°¢—FVÒææ÷FRÒ$¥4ôâ'6Rf–ÆVB#°¢Ğ¢6öç7BÆ—7BÒ£òæFFòæöäÆW76öä6Æ77&öö×2ÇÂ£òç&W7VÇBÇÂ£òæFFÇÂµÓ°¢—FVÒç'6VDÆVæwF‚Ò'&’æ—4'&’†Æ—7B’òÆ—7BæÆVæwF‚¢Ó°¢–b„'&’æ—4'&’†Æ—7B’bbÆ—7BæÆVæwF‚’°¢—FVÒæö²ÒG'VS°¢G&–W2çW6‚†—FVÒ“°¢f–æÄÆ—7BÒÆ—7C°¢'&V³°¢ÒVÇ6R°¢—FVÒææ÷FRÇÃÒ&V×G’Æ—7B#°¢G&–W2çW6‚†—FVÒ“°¢Ğ¢Ò6F6‚†R’°¢—FVÒææ÷FRÒRbbRæÖW76vRÇÂ&fWF6‚W'&÷"#°¢G&–W2çW6‚†—FVÒ“°¢Æ7DW'"ÒS°¢Ğ¢Ğ¢òò‹>Šù^Kúhğ¢G'’°¢6öç6öÆRæw&÷W6öÆÆ6VB†V5¶vWDöäÆW76öåÒ†÷7CÒW2&W7VÇCÒW26æF–FFW3ÒVFÂ&6öÆ÷#¢3–b"ÂÆö6F–öâæ†÷7FæÖRÂf–æÄÆ—7BæÆVæwF‚òô²‚G¶f–æÄÆ—7BæÆVæwF‡Ò–¢$TÕE’"Â6æF–FFW2æÆVæwF‚“°¢G&–W2æf÷$V6‚‚‡BÂ’’Óâ°¢6öç6öÆRæÆör†2G¶’²ÖÂ°¢W&Ã¢BçW&ÂÀ¢ö³¢Bæö²À¢7FGW3¢Bç7FGW2À¢æ÷FS¢Bææ÷FRÀ¢'6VDÆVæwFƒ¢Bç'6VDÆVæwF‚À¢&öG•6æ—WC¢Bæ&öG•6æ—W@¢Ò“°¢Ò“°¢–b‚f–æÄÆ—7BæÆVæwF‚bbÆ7DW'"’6öç6öÆRçv&â‚%¶vWDöäÆW76öåÒÆ7BW'&÷#¢"ÂÆ7DW'"“°¢6öç6öÆRæw&÷WVæB‚“°¢Ò6F6‚·Ğ¢&WGW&âf–æÄÆ—7C°¢Ğ¢òò7&2öæWB÷†‡"Ö–çFW&6WF÷"æ§0¢7–æ2gVæ7F–öâ6†V6¶–ä6Æ72†ÆW76öä–BÂ÷G2Ò·Ò’°¢6öç7B÷&–v–âÒÆö6F–öâæ÷&–v–ã°¢6öç7B6ÖRÒÓâæWrU$Â‡Â÷&–v–â’çFõ7G&–ær‚“°¢6öç7B6Æ77&ööÔ–BÒ÷G3òæ6Æ77&ööÔ–C°¢6öç7B†VFW'2Ò°¢&6öçFVçB×G—R#¢&Æ–6F–öâö§6öâ"À¢‡F'£¢'–·B ¢Ó°¢òò™(ZûKˆŞYÎ{ÙX[>ûÈÎKÛşyJYNˆz®y¨B–ÆöB[Ú.h¢6öç7B6æF–FFW2Ò²°¢W&Ã¢6ÖR‚"ö’÷c2öÆW76öâö6†V6¶–â"’À¢–ÆöC¢°¢ÆW76öä–C¢ÆW76öä–BÀ¢ââæ6Æ77&ööÔ–Bò°¢6Æ77&ööÔ–C¢6Æ77&ööÔ–@¢Ò¢·Ğ¢ÒÀ¢òòc3¢š›Î[; ¢æÖS¢'c2×6ÖR ¢ÒÂ°¢W&Ã¢&‡GG3¢ò÷&òç—V¶WFæræ6âö’÷c2öÆW76öâö6†V6¶–â"À¢–ÆöC¢°¢ÆW76öä–C¢ÆW76öä–BÀ¢ââæ6Æ77&ööÔ–Bò°¢6Æ77&ööÔ–C¢6Æ77&ööÔ–@¢Ò¢·Ğ¢ÒÀ¢æÖS¢'c2×&ò ¢ÒÂ°¢W&Ã¢&‡GG3¢ò÷wwrç—V¶WFæræ6âö’÷c2öÆW76öâö6†V6¶–â"À¢–ÆöC¢°¢ÆW76öä–C¢ÆW76öä–BÀ¢ââæ6Æ77&ööÔ–Bò°¢6Æ77&ööÔ–C¢6Æ77&ööÔ–@¢Ò¢·Ğ¢ÒÀ¢æÖS¢'c2×wwr ¢ÒÂ°¢W&Ã¢6ÖR‚"öÖöö2Ö’÷cöÆ×2öÆW76öâö6†V6¶–â"’À¢–ÆöC¢°¢ÆW76öåö–C¢ÆW76öä–BÀ¢ââæ6Æ77&ööÔ–Bò°¢6Æ77&ööÕö–C¢6Æ77&ööÔ–@¢Ò¢·Ğ¢ÒÀ¢òòiz~{ÙX[>ûÉ®‰¸~[Ú ¢æÖS¢&Ööö2×6ÖR ¢ÒÂ°¢W&Ã¢6ÖR‚"ö—c2öÆW76öâö6†V6¶–â"’À¢–ÆöC¢°¢ÆW76öä–C¢ÆW76öä–BÀ¢ââæ6Æ77&ööÔ–Bò°¢6Æ77&ööÔ–C¢6Æ77&ööÔ–@¢Ò¢·Ğ¢ÒÀ¢æÖS¢&—c2×6ÖR ¢ÒÓ°¢6öç7BG&–W2ÒµÓ°¢ÆWBÆ7DW'#°¢f÷"†6öç7B6æBöb6æF–FFW2’°¢6öç7B—FVÒÒ°¢W&Ã¢6æBçW&ÂÀ¢æÖS¢6æBææÖRÀ¢7FGW3¢À¢æ÷FS¢" ¢Ó°¢G'’°¢6öç7B&W7Òv—BfWF6‚†6æBçW&ÂÂ°¢ÖWF†öC¢%õ5B"À¢7&VFVçF–Ç3¢&–æ6ÇVFR"À¢†VFW'3¢†VFW'2À¢&öG“¢¥4ôâç7G&–æv–g’†6æBç–ÆöB¢Ò“°¢—FVÒç7FGW2Ò&W7ç7FGW3°¢6öç7BFW‡BÒv—B&W7çFW‡B‚’æ6F6‚‚‚’Óâ""“°¢—FVÒæ&öG•6æ—WBÒFW‡Bç6Æ–6RƒÂ3“°¢–b‚&W7æö²’°¢—FVÒææ÷FRÒ…EEG·&W7ç7FGW7Ö°¢òòZh.iéÂCóCóC>ûÈÎ{º~{ºŞŠù^Kˆ¾KˆiÚ¢G&–W2çW6‚†—FVÒ“°¢6öçF–çVS°¢Ğ¢ÆWBFFÒ·Ó°¢G'’°¢FFÒ¥4ôâç'6R‡FW‡B“°¢Ò6F6‚°¢—FVÒææ÷FRÒ$¥4ôâ'6Rf–ÆVB#°¢Ğ¢6öç7BFö¶VâÒFFòæFFòæÆW76öåFö¶VâÇÂFFòç&W7VÇCòæÆW76öåFö¶VâÇÂFFòæÆW76öåFö¶Vã°¢6öç7B6WDWF‚Ò&W7æ†VFW'2ævWB‚%6WBÔWF‚"’ÇÂ&W7æ†VFW'2ævWB‚'6WBÖWF‚"’ÇÂçVÆÃ°¢—FVÒææ÷FRÒFö¶Vâò$ô²"¢&æòFö¶Vâ–â&öG’#°¢G&–W2çW6‚†—FVÒ“°¢–b‡Fö¶Vâ’°¢G'’°¢6öç6öÆRæw&÷W6öÆÆ6VB‚"V5¶6†V6¶–ä6Æ75Òô²W2"Â&6öÆ÷#¢3"Â6æBææÖR“°¢6öç6öÆRæÆör‚'–ÆöC¢"Â6æBç–ÆöB“°¢6öç6öÆRæÆör‚'6WDWFƒ¢"Â6WDWF‚“°¢6öç6öÆRæw&÷WVæB‚“°¢Ò6F6‚·Ğ¢&WGW&â°¢Fö¶Vã¢Fö¶VâÀ¢6WDWFƒ¢6WDWF‚À¢&s¢FF¢Ó°¢Ğ¢Ò6F6‚†R’°¢—FVÒææ÷FRÒRæÖW76vRÇÂ&fWF6‚W'&÷"#°¢G&–W2çW6‚†—FVÒ“°¢Æ7DW'"ÒS°¢Ğ¢Ğ¢G'’°¢6öç6öÆRæw&÷W6öÆÆ6VB‚"V5¶6†V6¶–ä6Æ75Òd”ÄTB†÷7CÒW2"Â&6öÆ÷#¢6c32"ÂÆö6F–öâæ†÷7FæÖR“°¢6öç6öÆRæÆör‚&ÆW76öä–C¢"ÂÆW76öä–BÂ&6Æ77&ööÔ–C¢"Â6Æ77&ööÔ–B“°¢G&–W2æf÷$V6‚‚‡BÂ’’Óâ6öç6öÆRæÆör†2G¶’²ÖÂB’“°¢–b†Æ7DW'"’6öç6öÆRçv&â‚&Æ7DW'#¢"ÂÆ7DW'"“°¢6öç6öÆRæw&÷WVæB‚“°¢Ò6F6‚·Ğ¢òòh©¾{¹Kˆ®[.ûÈÎyKKˆ®[.‹[(	Îy»N‹{2ÆW76öâš^(	Şy¨NXYÎ[©^˜¾‹é¢F‡&÷ræWrW'&÷"‚&6†V6¶–ä6Æ72…EEC"“°¢Ğ¢6öç7B54U54ÔTåEôÔ$´U%2Ò²'&ö&ÆVÒ"Â'V—¢"Â&W†Ò"Â'FW7B"Â&W†W&6—6R"Â'W""Ó°¢6öç7B4õU%4Ut$UôÔ$´U%2Ò²'&W6VçFF–öâ"Â&6÷W'6Wv&R"Â'B"Â'6Æ–FR"Ó°¢6öç7BT$Ä•4…ô5D”ôâÒõâ‡6VæGÇV&Æ—6‡Æ÷VçÇ7F'GÇ&VÆV6R’ó°¢6öç7B4õU%4Ut$UõT$Ä•4…ô5D”ôâÒõâ‡6VæGÇV&Æ—6‡Ç&VÆV6R’ó°¢6öç7B54U54ÔTåEõT$Ä•4…ô5D”ôâÒõâ‡6VæGÇV&Æ—6‡Ç7F'GÇ&VÆV6R’ó°¢6öç7BTåD•E•ô´U•2Ò²'V—¢"Â&W†Ò"Â'FW7B"Â&W†W&6—6R"Â'W""Â'&ö&ÆVÔw&÷W"Â'&ö&ÆVÕöw&÷W"Â'&ö&ÆVÒ"Â'&W6VçFF–öâ"Â&6÷W'6Wv&R"Â&7F—f—G’"Ó°¢6öç7BäU5DTEõ”ÄôEô´U•2Ò²&FF"Â'–ÆöB"Â'&W7VÇB"Â&6öçFVçB"Ó°¢gVæ7F–öâæ÷&ÖÆ—¦T÷C†ÖW76vR’°¢&WGW&â7G&–ær†ÖW76vSòæ÷ÇÂÖW76vSòçG—RÇÂ""’çG&–Ò‚’çFôÆ÷vW$66R‚’ç&WÆ6R‚õµæ×£Ó•ÒörÂ""“°¢Ğ¢gVæ7F–öâ–æ6ÇVFW4öæTöb‡fÇVRÂÖ&¶W'2’°¢&WGW&âÖ&¶W'2ç6öÖR†Ö&¶W"ÓâfÇVRæ–æ6ÇVFW2†Ö&¶W"’“°¢Ğ¢gVæ7F–öâvWDVçF—G’†ÖW76vR’°¢6öç7BVWVRÒ²ÖW76vRÓ°¢6öç7Bf—6—FVBÒæWr6WC°¢ÆWBfÆÆ&6²ÒÖW76vRbbG—VöbÖW76vRÓÓÒ&ö&¦V7B"òÖW76vR¢·Ó°¢v†–ÆR‡VWVRæÆVæwF‚’°¢6öç7B7W'&VçBÒVWVRç6†–gB‚“°¢–b‚7W'&VçBÇÂG—Vöb7W'&VçBÓÒ&ö&¦V7B"ÇÂf—6—FVBæ†2†7W'&VçB’’6öçF–çVS°¢f—6—FVBæFB†7W'&VçB“°¢f÷"†6öç7B¶W’öbTåD•E•ô´U•2’°¢6öç7BVçF—G’Ò7W'&VçE¶¶W•Ó°¢–b†VçF—G’bbG—VöbVçF—G’ÓÓÒ&ö&¦V7B"’&WGW&âVçF—G“°¢Ğ¢f÷"†6öç7B¶W’öbäU5DTEõ”ÄôEô´U•2’°¢6öç7BæW7FVBÒ7W'&VçE¶¶W•Ó°¢–b†æW7FVBbbG—VöbæW7FVBÓÓÒ&ö&¦V7B"’°¢fÆÆ&6²ÒæW7FVC°¢–b„'&’æ—4'&’†æW7FVB’’VWVRçW6‚‚ââææW7FVB“²VÇ6RVWVRçW6‚†æW7FVB“°¢Ğ¢Ğ¢Ğ¢&WGW&âfÆÆ&6³°¢Ğ¢gVæ7F–öâf—'7EFW‡B‡6÷W&6RÂ¶W—2’°¢f÷"†6öç7B¶W’öb¶W—2’°¢6öç7BfÇVRÒ6÷W&6Sòå¶¶W•Ó°¢–b‡fÇVRÓÓÒfö–BÇÂfÇVRÓÓÒçVÆÂÇÂG—VöbfÇVRÓÓÒ&ö&¦V7B"’6öçF–çVS°¢–b…7G&–ær‡fÇVR’çG&–Ò‚’’&WGW&â7G&–ær‡fÇVR’çG&–Ò‚“°¢Ğ¢&WGW&â"#°¢Ğ¢6öç7B”DTåD”d”U%ô´U•2Ò²&–B"Â'WV–B"Â'V—¤–B"Â'V—¥ö–B"Â&W†Ô–B"Â&W†Õö–B"Â'FW7D–B"Â'FW7Eö–B"Â&W†W&6—6T–B"Â&W†W&6—6Uö–B"Â'&W6VçFF–öä–B"Â'&W6VçFF–öåö–B"Â'&ö&ÆVÔ–B"Â'&ö&ÆVÕö–B"Â'&ö&ÆVÖ–B"Â'&ö&ÆVÒ"Â'&W6VçFF–öâ"Â&7F—f—G”–B"Â&7F—f—G•ö–B"Ó°¢gVæ7F–öâf–æDæW7FVEFW‡B‡6÷W&6RÂ¶W—2’°¢6öç7BVWVRÒ²6÷W&6RÓ°¢6öç7Bf—6—FVBÒæWr6WC°¢v†–ÆR‡VWVRæÆVæwF‚’°¢6öç7B7W'&VçBÒVWVRç6†–gB‚“°¢–b‚7W'&VçBÇÂG—Vöb7W'&VçBÓÒ&ö&¦V7B"ÇÂf—6—FVBæ†2†7W'&VçB’’6öçF–çVS°¢f—6—FVBæFB†7W'&VçB“°¢6öç7BfÇVRÒf—'7EFW‡B†7W'&VçBÂ¶W—2“°¢–b‡fÇVR’&WGW&âfÇVS°¢f÷"†6öç7B¶W’öbäU5DTEõ”ÄôEô´U•2’°¢6öç7BæW7FVBÒ7W'&VçE¶¶W•Ó°¢–b„'&’æ—4'&’†æW7FVB’’VWVRçW6‚‚ââææW7FVB“²VÇ6R–b†æW7FVBbbG—VöbæW7FVBÓÓÒ&ö&¦V7B"’VWVRçW6‚†æW7FVB“°¢Ğ¢Ğ¢&WGW&â"#°¢Ğ¢gVæ7F–öâvWD–FVçF–f–W"†ÖW76vRÂVçF—G’Â÷’°¢&WGW&âf—'7EFW‡B†VçF—G’Â”DTåD”d”U%ô´U•2’ÇÂf–æDæW7FVEFW‡B†ÖW76vRÂ”DTåD”d”U%ô´U•2’ÇÂ÷°¢Ğ¢gVæ7F–öâvWDFWF–Â†ÖW76vRÂVçF—G’’°¢&WGW&âf—'7EFW‡B†VçF—G’Â²'F—FÆR"Â&æÖR"Â'7V&¦V7B"Â&Æ&VÂ"Â&&öG’"Ò’ÇÂf—'7EFW‡B†ÖW76vRÂ²'F—FÆR"Â&æÖR"Â'7V&¦V7B"Â&Æ&VÂ"Ò’ÇÂ.iY[ˆXù[ˆ>K¨niky¨NŠûîZ.Xh^Zë’#°¢Ğ¢gVæ7F–öâvWD6FVv÷'’†÷’°¢–b†÷ÓÓÒ'VæÆö6·&ö&ÆVÒ"’&WGW&âçVÆÃ°¢–b†÷ÓÓÒ'&ö&ÆVÖ–æfò"’&WGW&â&76W76ÖVçB#°¢òò{¹>iéÎ8X[>™zŞ8[^zK®8i»NikzØi8ŞKÙÎYÎj~KÉ®[Šb&ö&ÆVŞûÈÎKˆŞˆ;Ş[Ù>h‰ikš)Xù[ˆ>8 ¢–b†–æ6ÇVFW4öæTöb†÷Â54U54ÔTåEôÔ$´U%2’’&WGW&â54U54ÔTåEõT$Ä•4…ô5D”ôâçFW7B†÷’ò&76W76ÖVçB"¢çVÆÃ°¢òòh™>[Èiz~ŠûîK»n8{û¾š^zØi8ŞKÙÎK™şKÉ®[Šb&W6VçFF–öâ÷6Æ–F^ûÈÎKˆŞˆ;ŞŠúş‰ŞXZ^˜	®yJXù[ˆ>hù˜i.8 ¢–b†–æ6ÇVFW4öæTöb†÷Â4õU%4Ut$UôÔ$´U%2’’&WGW&â4õU%4Ut$UõT$Ä•4…ô5D”ôâçFW7B†÷’ò&6÷W'6Wv&R"¢çVÆÃ°¢–b…T$Ä•4…ô5D”ôâçFW7B†÷’’&WGW&â&÷F†W"#°¢&WGW&âçVÆÃ°¢Ğ¢gVæ7F–öâ6Æ76–g•V&Æ—6„WfVçB†ÖW76vR’°¢6öç7B÷Òæ÷&ÖÆ—¦T÷C†ÖW76vR“°¢6öç7B6FVv÷'’ÒvWD6FVv÷'’†÷“°¢–b‚6FVv÷'’’&WGW&âçVÆÃ°¢6öç7BVçF—G’ÒvWDVçF—G’†ÖW76vR“°¢6öç7B–BÒvWD–FVçF–f–W"†ÖW76vRÂVçF—G’Â÷“°¢6öç7BFWF–ÂÒvWDFWF–Â†ÖW76vRÂVçF—G’“°¢6öç7BF—FÆRÒ°¢76W76ÖVçC¢.ˆ>ŠùRşkX¾Šù^š){¸N[{.Xù[ˆ2"À¢6÷W'6Wv&S¢.ŠûîK»n[{.Xù[ˆ2"À¢÷F†W#¢.ŠûîZ.Xh^Zë[{.Xù[ˆ2 ¢Õ¶6FVv÷'•Ó°¢&WGW&â°¢6FVv÷'“¢6FVv÷'’À¢FVGWT¶W“¢G¶6FVv÷'—Ó¢G¶–GÖÀ¢F—FÆS¢F—FÆRÀ¢FWF–Ã¢FWF–À¢Ó°¢Ğ¢gVæ7F–öâ—5V&Æ—6…&VÖ–æFW$Væ&ÆVB†WfVçBÂ6öæf–rÒ·Ò’°¢–b‚WfVçCòæ6FVv÷'’’&WGW&âfÇ6S°¢6öç7B¶–æBÒ°¢76W76ÖVçC¢&76W76ÖVçB×V&Æ—6‚"À¢6÷W'6Wv&S¢&6÷W'6Wv&R×V&Æ—6‚"À¢÷F†W#¢&÷F†W"×V&Æ—6‚ ¢Õ¶WfVçBæ6FVv÷'•Ó°¢&WGW&â¶–æBò—5&VÖ–æFW$Væ&ÆVB†¶–æBÂ6öæf–r’¢fÇ6S°¢Ğ¢gVæ7F–öâvWE&VÇF–ÖTWfVçB†ÖW76vR’°¢6öç7B÷Òæ÷&ÖÆ—¦T÷C†ÖW76vR“°¢–b†÷ÓÓÒ&fWF6‡F–ÖVÆ–æR"’&WGW&â°¢¶–æC¢'F–ÖVÆ–æR"À¢F–ÖVÆ–æS¢ÖW76vSòçF–ÖVÆ–æP¢Ó°¢–b†÷ÓÓÒ&æWvFæ×R"’&WGW&â°¢¶–æC¢&Fæ×R"À¢ÖW76vS¢ÖW76vP¢Ó°¢–b†÷ÓÓÒ'VæÆö6·&ö&ÆVÒ"’°¢6öç7B&u&ö&ÆVÒÒÖW76vSòç&ö&ÆVÓ°¢6öç7B&ö&ÆVÒÒ&u&ö&ÆVÒbbG—Vöb&u&ö&ÆVÒÓÓÒ&ö&¦V7B"ò°¢ââæÖW76vRÀ¢ââç&u&ö&ÆVĞ¢Ò¢°¢ââæÖW76vRÀ¢&ö#¢ÖW76vSòç&ö"óò&u&ö&ÆVÒóòÖW76vSòç&ö&ÆVÖ–@¢Ó°¢&WGW&â°¢¶–æC¢'VæÆö6·&ö&ÆVÒ"À¢&ö&ÆVÓ¢&ö&ÆVĞ¢Ó°¢Ğ¢–b†÷ÓÓÒ&ÆW76öæf–æ—6†VB"’&WGW&â°¢¶–æC¢&ÆW76öæf–æ—6†VB ¢Ó°¢6öç7BWfVçBÒ6Æ76–g•V&Æ—6„WfVçB†ÖW76vR“°¢&WGW&âWfVçBò°¢¶–æC¢'V&Æ—6‚"À¢WfVçC¢WfVç@¢Ò¢çVÆÃ°¢Ğ¢ò¢ ¢¢6†&W2F†R6†÷'BFRÖGWÆ–6F–öâv–æF÷rW6VB'’WfW'’&VÇF–ÖR&VÖ–æFW"à¢¢F–ffW&VçBWfVçB¶–æG2†fRF†V—"÷vâFVGWR¶W—2Â6òæWrVW7F–öâ6ææ÷@¢¢7W&W726÷W'6Wv&Ræ÷F–f–6F–öâ†÷"F†R÷F†W"v’&÷VæB’à¢¢ògVæ7F–öâ7&VFTWfVçE&VÖ–æFW"‡¶æ÷F–g“¢æ÷F–g’Â—4Væ&ÆVC¢—4Væ&ÆVBÒ‚’ÓâG'VRÂæ÷s¢æ÷rÒ‚’ÓâFFRææ÷r‚’ÂFVGWT×3¢FVGWT×2ÒfSGÒÒ·Ò’°¢6öç7B6VVåVçF–ÂÒæWrÖ°¢gVæ7F–öâ'VæR‡F–ÖR’°¢f÷"†6öç7B¶¶W’ÂW‡—&W4EÒöb6VVåVçF–Â’–b†W‡—&W4BÃÒF–ÖR’6VVåVçF–ÂæFVÆWFR†¶W’“°¢Ğ¢&WGW&â°¢†æFÆR†WfVçBÂ6öæf–r’°¢–b‚WfVçBÇÂWfVçBæFVGWT¶W’ÇÂ—4Væ&ÆVB†WfVçBÂ6öæf–r’’&WGW&âfÇ6S°¢6öç7BF–ÖRÒæ÷r‚“°¢'VæR‡F–ÖR“°¢–b‡6VVåVçF–Âæ†2†WfVçBæFVGWT¶W’’’&WGW&âfÇ6S°¢6VVåVçF–Âç6WB†WfVçBæFVGWT¶W’ÂF–ÖR²FVGWT×2“°¢æ÷F–g“òâ†WfVçB“°¢&WGW&âG'VS°¢Ğ¢Ó°¢Ğ¢gVæ7F–öâ7&VFUV&Æ—6…&VÖ–æFW"†÷F–öç2Ò·Ò’°¢&WGW&â7&VFTWfVçE&VÖ–æFW"‡°¢ââæ÷F–öç2À¢—4Væ&ÆVC¢÷F–öç2æ—4Væ&ÆVBÇÂ—5V&Æ—6…&VÖ–æFW$Væ&ÆV@¢Ò“°¢Ğ¢ò¢ ¢¢W'6—7FVçB7FFRf÷"WFöÖF–2Öç7vW"v÷&²F†BÖ’&R–çFW''WFVB'’¢¢vR&Vg&W6‚âF†—2ÖöGVÆRFVÆ–&W&FVÇ’†2æò'&÷w6W"÷"&W÷6—F÷'¢¢FWVæFVæ7’6òF†B&V6÷fW'’öÆ–7’6â&RFW7FVB–æFWVæFVçFÇ’à¢¢ò6öç7B$T4õdU%•õ5Dõ$tUõ$Td•‚Ò&WFòÖç7vW"×&V6÷fW'“¢#°¢6öç7BDTdTÅEõ$T4õdU%•õEDÅôÕ2Ò#B¢c¢c¢S3°¢6öç7BDTdTÅEõ$T4õdU%•ôÔ…ôTåE$”U2Ò°¢6öç7BTäD”äuõ„4U2ÒæWr6WB…²'VWVVB"Â&ç7vW&–ær"Ò“°¢gVæ7F–öâ4–B‡fÇVR’°¢–b‡fÇVRÓÓÒfö–BÇÂfÇVRÓÓÒçVÆÂÇÂ7G&–ær‡fÇVR’çG&–Ò‚’ÓÓÒ""’&WGW&âçVÆÃ°¢&WGW&â7G&–ær‡fÇVR“°¢Ğ¢gVæ7F–öâ4f–æ—FT÷$çVÆÂ‡fÇVR’°¢–b‡fÇVRÓÓÒfö–BÇÂfÇVRÓÓÒçVÆÂÇÂfÇVRÓÓÒ""’&WGW&âçVÆÃ°¢6öç7BçVÖ&W"ÒçVÖ&W"‡fÇVR“°¢&WGW&âçVÖ&W"æ—4f–æ—FR†çVÖ&W"’òçVÖ&W"¢çVÆÃ°¢Ğ¢gVæ7F–öâ4æöäæVvF—fT–çFVvW"‡fÇVR’°¢6öç7BçVÖ&W"ÒçVÖ&W"‡fÇVR“°¢&WGW&âçVÖ&W"æ—4f–æ—FR†çVÖ&W"’òÖF‚æÖ‚ƒÂÖF‚æfÆö÷"†çVÖ&W"’’¢°¢Ğ¢gVæ7F–öâæ÷&ÖÆ—¦U†6R‡fÇVR’°¢&WGW&â²'VWVVB"Â&ç7vW&–ær"Â&f–ÆVB"Â&FöæR"Òæ–æ6ÇVFW2‡fÇVR’òfÇVR¢'VWVVB#°¢Ğ¢gVæ7F–öâæ÷&ÖÆ—¦U&V6÷fW'•&V6÷&B†–çWBÒ·ÒÂ¶ÆW76öä–C¢ÆW76öä–BÂæ÷s¢æ÷rÒFFRææ÷r‚—ÒÒ·Ò’°¢6öç7B&ö&ÆVÔ–BÒ4–B†–çWBç&ö&ÆVÔ–Bóò–çWBæ–B“°¢–b‚&ö&ÆVÔ–B’&WGW&âçVÆÃ°¢6öç7BÆW76öâÒ4–B†ÆW76öä–Bóò–çWBæÆW76öä–B’ÇÂ"#°¢&WGW&â°¢ÆW76öä–C¢ÆW76öâÀ¢&ö&ÆVÔ–C¢&ö&ÆVÔ–BÀ¢&W6VçFF–öä–C¢4–B†–çWBç&W6VçFF–öä–Bóò–çWBç&W2’À¢6Æ–FT–C¢4–B†–çWBç6Æ–FT–Bóò–çWBç6–B’À¢7F'EF–ÖS¢4f–æ—FT÷$çVÆÂ†–çWBç7F'EF–ÖRóò–çWBæGB’À¢VæEF–ÖS¢4f–æ—FT÷$çVÆÂ†–çWBæVæEF–ÖR’À¢†6S¢æ÷&ÖÆ—¦U†6R†–çWBç†6R’À¢WFôç7vW%F–ÖS¢4f–æ—FT÷$çVÆÂ†–çWBæWFôç7vW%F–ÖR’À¢WFôç7vW%VWVVC¢–çWBæWFôç7vW%VWVVBÓÒfÇ6RÀ¢GFV×G3¢4æöäæVvF—fT–çFVvW"†–çWBæGFV×G2’À¢Æ7DW'&÷#¢–çWBæÆ7DW'&÷"ò7G&–ær†–çWBæÆ7DW'&÷"’¢""À¢FöæS¢–çWBæFöæRÓÓÒG'VRÀ¢WFFVDC¢4f–æ—FT÷$çVÆÂ†–çWBçWFFVDB’óòæ÷p¢Ó°¢Ğ¢ò¢ ¢¢FV6–FRv†WF†W"W'6—7FVB&V6÷&BÖ’&R&W7VÖVBWFöÖF–6ÆÇ’à¢¢W‡—&VB&WG'’—2–çFVçF–öæÆÇ’6W&FR÷BÖ–â&V6W6R—B6ÆÇ2F†P¢¢6W'fW"w2&WG'’VæGö–çBæB6â7V&Ö—Bâç7vW"gFW"F†Rf—6–&ÆRv–æF÷rà¢¢ògVæ7F–öâ6†÷VÆE&V6÷fW%&ö&ÆVÒ‡&V6÷&BÂ¶Væ&ÆVC¢Væ&ÆVBÒfÇ6RÂ&V6÷fW$W‡—&VC¢&V6÷fW$W‡—&VBÒfÇ6RÂæ÷s¢æ÷rÒFFRææ÷r‚—ÒÒ·Ò’°¢–b‚Væ&ÆVB’&WGW&â°¢&V6÷fW#¢fÇ6RÀ¢f÷&6U&WG'“¢fÇ6RÀ¢&V6öã¢&F—6&ÆVB ¢Ó°¢–b‚&V6÷&BÇÂ&V6÷&BæFöæR’&WGW&â°¢&V6÷fW#¢fÇ6RÀ¢f÷&6U&WG'“¢fÇ6RÀ¢&V6öã¢&FöæR ¢Ó°¢–b‚TäD”äuõ„4U2æ†2‡&V6÷&Bç†6R’’&WGW&â°¢&V6÷fW#¢fÇ6RÀ¢f÷&6U&WG'“¢fÇ6RÀ¢&V6öã¢&æ÷B×VæF–ær ¢Ó°¢–b‡&V6÷&BæWFôç7vW%VWVVBÓÓÒfÇ6Rbb&V6÷&Bç†6RÓÒ&ç7vW&–ær"’&WGW&â°¢&V6÷fW#¢fÇ6RÀ¢f÷&6U&WG'“¢fÇ6RÀ¢&V6öã¢&æ÷B×VWVVB ¢Ó°¢6öç7BVæEF–ÖRÒ4f–æ—FT÷$çVÆÂ‡&V6÷&BæVæEF–ÖR“°¢–b†VæEF–ÖRÓÒçVÆÂbbæ÷rãÒVæEF–ÖR’°¢–b‚&V6÷fW$W‡—&VB’&WGW&â°¢&V6÷fW#¢fÇ6RÀ¢f÷&6U&WG'“¢fÇ6RÀ¢&V6öã¢&W‡—&VB ¢Ó°¢&WGW&â°¢&V6÷fW#¢G'VRÀ¢f÷&6U&WG'“¢G'VRÀ¢&V6öã¢&W‡—&VB×&WG'’ ¢Ó°¢Ğ¢&WGW&â°¢&V6÷fW#¢G'VRÀ¢f÷&6U&WG'“¢fÇ6RÀ¢&V6öã¢&V6÷&Bç†6RÓÓÒ&ç7vW&–ær"ò&–çFW''WFVB"¢'VæF–ær ¢Ó°¢Ğ¢gVæ7F–öâ7F÷&vT¶W’†ÆW76öä–B’°¢&WGW&âGµ$T4õdU%•õ5Dõ$tUõ$Td•‡ÒGµ7G&–ær†ÆW76öä–B—Ö°¢Ğ¢ò¢ ¢¢6ÖÆÂ&÷VæFVBÆö6ÂW'6—7FVæ6R7F÷&RâöæR7F÷&R—27&VFVBW"ÆW76öâ6ğ¢¢F†B6÷W'6R7v—F6‚6ææ÷B66–FVçFÆÇ’&V6÷fW"æ÷F†W"6÷W'6Rw2VWVRà¢¢ògVæ7F–öâ7&VFU&ö&ÆVÕ&V6÷fW'•7F÷&R‡·7F÷&vS¢7F÷&vRÂÆW76öä–C¢ÆW76öä–BÂæ÷s¢æ÷rÒ‚’ÓâFFRææ÷r‚’ÂGFÄ×3¢GFÄ×2ÒDTdTÅEõ$T4õdU%•õEDÅôÕ2ÂÖ„VçG&–W3¢Ö„VçG&–W2ÒDTdTÅEõ$T4õdU%•ôÔ…ôTåE$”U7ÒÒ·Ò’°¢6öç7BÆW76öâÒ4–B†ÆW76öä–B“°¢–b‚ÆW76öâ’&WGW&âçVÆÃ°¢6öç7B¶W’Ò7F÷&vT¶W’†ÆW76öâ“°¢ÆWB&V6÷&G2ÒæWrÖ°¢gVæ7F–öâW'6—7B‚’°¢G'’°¢7F÷&vSòç6WCòâ†¶W’Â²ââç&V6÷&G2çfÇVW2‚’Ò“°¢Ò6F6‚†W'&÷"’°¢6öç6öÆRçv&â‚%¾™ºŠûîZ.Xªh˜µÕµt$åÕµ&V6÷fW'•ÒKùŞZÙ[è^KÙÎzÙNx«nhZK‹JS¢"ÂW'&÷"“°¢Ğ¢Ğ¢gVæ7F–öâ'VæR‚’°¢6öç7B7W'&VçBÒçVÖ&W"†æ÷r‚’“°¢6öç7B†5GFÂÒçVÖ&W"æ—4f–æ—FR†7W'&VçB’bbçVÖ&W"æ—4f–æ—FR‡GFÄ×2’bbGFÄ×2â°¢ÆWB6†ævVBÒfÇ6S°¢f÷"†6öç7B·&ö&ÆVÔ–BÂ&V6÷&EÒöb&V6÷&G2’–b‡&V6÷&BæÆW76öä–BÓÒÆW76öâÇÂ†5GFÂbb7W'&VçBÒ&V6÷&BçWFFVDBâGFÄ×2’°¢&V6÷&G2æFVÆWFR‡&ö&ÆVÔ–B“°¢6†ævVBÒG'VS°¢Ğ¢6öç7BÆ–Ö—BÒçVÖ&W"æ—4f–æ—FR†Ö„VçG&–W2’òÖF‚æÖ‚ƒÂÖF‚æfÆö÷"†Ö„VçG&–W2’’¢DTdTÅEõ$T4õdU%•ôÔ…ôTåE$”U3°¢–b‡&V6÷&G2ç6—¦RâÆ–Ö—B’°¢6öç7BöÆFW7BÒ²ââç&V6÷&G2çfÇVW2‚’Òç6÷'B‚†Â"’ÓâçWFFVDBÒ"çWFFVDB’ç6Æ–6RƒÂ&V6÷&G2ç6—¦RÒÆ–Ö—B“°¢öÆFW7Bæf÷$V6‚‡&V6÷&BÓâ&V6÷&G2æFVÆWFR‡&V6÷&Bç&ö&ÆVÔ–B’“°¢6†ævVBÒG'VS°¢Ğ¢&WGW&â6†ævVC°¢Ğ¢gVæ7F–öâÆöB‚’°¢ÆWB&rÒµÓ°¢G'’°¢&rÒ7F÷&vSòævWCòâ†¶W’ÂµÒ’ÇÂµÓ°¢Ò6F6‚†W'&÷"’°¢6öç6öÆRçv&â‚%¾™ºŠûîZ.Xªh˜µÕµt$åÕµ&V6÷fW'•ÒŠû¾Xùn[è^KÙÎzÙNx«nhZK‹JS¢"ÂW'&÷"“°¢Ğ¢6öç7BVçG&–W2Ò'&’æ—4'&’‡&r’ò&r¢&rbbG—Vöb&rÓÓÒ&ö&¦V7B"òö&¦V7BçfÇVW2‡&r’¢µÓ°¢&V6÷&G2ÒæWrÖ°¢f÷"†6öç7B–çWBöbVçG&–W2’°¢6öç7B&V6÷&BÒæ÷&ÖÆ—¦U&V6÷fW'•&V6÷&B†–çWBÂ°¢ÆW76öä–C¢ÆW76öâÀ¢æ÷s¢çVÖ&W"†æ÷r‚’¢Ò“°¢–b‡&V6÷&B’&V6÷&G2ç6WB‡&V6÷&Bç&ö&ÆVÔ–BÂ&V6÷&B“°¢Ğ¢–b‡'VæR‚’’W'6—7B‚“°¢&WGW&âÆ—7B‚“°¢Ğ¢gVæ7F–öâÆ—7B‚’°¢&WGW&â²ââç&V6÷&G2çfÇVW2‚’ÒæÖ‡&V6÷&BÓâ‡°¢ââç&V6÷&@¢Ò’“°¢Ğ¢gVæ7F–öâvWB‡&ö&ÆVÔ–B’°¢6öç7B&V6÷&BÒ&V6÷&G2ævWB†4–B‡&ö&ÆVÔ–B’“°¢&WGW&â&V6÷&Bò°¢ââç&V6÷&@¢Ò¢çVÆÃ°¢Ğ¢gVæ7F–öâW6W'B†–çWBÒ·Ò’°¢6öç7B&ö&ÆVÔ–BÒ4–B†–çWBç&ö&ÆVÔ–Bóò–çWBæ–B“°¢–b‚&ö&ÆVÔ–B’&WGW&âçVÆÃ°¢6öç7BW†—7F–ærÒ&V6÷&G2ævWB‡&ö&ÆVÔ–B’ÇÂ·Ó°¢6öç7B&V6÷&BÒæ÷&ÖÆ—¦U&V6÷fW'•&V6÷&B‡°¢ââæW†—7F–ærÀ¢ââæ–çWBÀ¢WFFVDC¢–çWBçWFFVDBóòçVÖ&W"†æ÷r‚’¢ÒÂ°¢ÆW76öä–C¢ÆW76öâÀ¢æ÷s¢çVÖ&W"†æ÷r‚’¢Ò“°¢–b‚&V6÷&B’&WGW&âçVÆÃ°¢&V6÷&G2ç6WB‡&ö&ÆVÔ–BÂ&V6÷&B“°¢'VæR‚“°¢W'6—7B‚“°¢&WGW&â°¢ââç&V6÷&@¢Ó°¢Ğ¢gVæ7F–öâWFFR‡&ö&ÆVÔ–BÂF6‚Ò·Ò’°¢6öç7BW†—7F–ærÒ&V6÷&G2ævWB†4–B‡&ö&ÆVÔ–B’“°¢–b‚W†—7F–ær’&WGW&âW6W'B‡°¢ââçF6‚À¢&ö&ÆVÔ–C¢&ö&ÆVÔ–@¢Ò“°¢&WGW&âW6W'B‡°¢ââæW†—7F–ærÀ¢ââçF6‚À¢&ö&ÆVÔ–C¢W†—7F–ærç&ö&ÆVÔ–@¢Ò“°¢Ğ¢gVæ7F–öâ&VÖ÷fR‡&ö&ÆVÔ–B’°¢6öç7B&VÖ÷fVBÒ&V6÷&G2æFVÆWFR†4–B‡&ö&ÆVÔ–B’“°¢–b‡&VÖ÷fVB’W'6—7B‚“°¢&WGW&â&VÖ÷fVC°¢Ğ¢gVæ7F–öâ6ÆV"‚’°¢&V6÷&G2æ6ÆV"‚“°¢W'6—7B‚“°¢Ğ¢ÆöB‚“°¢&WGW&â°¢¶W“¢¶W’À¢ÆöC¢ÆöBÀ¢Æ—7C¢Æ—7BÀ¢vWC¢vWBÀ¢W6W'C¢W6W'BÀ¢WFFS¢WFFRÀ¢&VÖ÷fS¢&VÖ÷fRÀ¢6ÆV#¢6ÆV ¢Ó°¢Ğ¢ò¢ ¢¢'Vç2öæR’Öç7vW"GFV×BâFWVæFVæ6–W2&R–æ¦V7FVB6òF†R7FFR7F–öà¢¢6â¶VW'&÷w6W"×7V6–f–2T’æBæWGv÷&²6öFR÷WG6–FRF†—27FFRÖ6†–æRà¢¢ògVæ7F–öâ—4W‡—&VB‡7FGW2Âæ÷r’°¢6öç7BVæEF–ÖRÒçVÖ&W"‡7FGW3òæVæEF–ÖR“°¢&WGW&âçVÖ&W"æ—4f–æ—FR†VæEF–ÖR’bbæ÷rãÒVæEF–ÖS°¢Ğ¢gVæ7F–öâVÖ—E7FGW2‡7FGW2Âöå7FGW46†ævRÂ&ö&ÆVÒ’°¢G'’°¢öå7FGW46†ævSòâ‡°¢ââç7FGW0¢ÒÂ&ö&ÆVÒ“°¢Ò6F6‚†W'&÷"’°¢6öç6öÆRçv&â‚%¾™ºŠûîZ.Xªh˜µÕµt$åÕ´WFôç7vW%Òx«nhhÈK˜^XÉnZK‹JS¢"ÂW'&÷"“°¢Ğ¢Ğ¢gVæ7F–öâW'&÷$ÖW76vR†W'&÷"’°¢&WGW&âW'&÷#òæÖW76vRò7G&–ær†W'&÷"æÖW76vR’¢7G&–ær†W'&÷"ÇÂ.iÊ®yú^™IŠúò"“°¢Ğ¢gVæ7F–öâ7&VFTWFôç7vW%'VææW"‡·G—TÖ¢G—TÖÒ·ÒÂ†47F—fU&öf–ÆS¢†47F—fU&öf–ÆRÒ‚’ÓâfÇ6RÂvWD”6öæf–s¢vWD”6öæf–rÒ‚’Óâ·ÒÂÖ¶TFVfVÇDç7vW#¢Ö¶TFVfVÇDç7vW"Ò‚’ÓâçVÆÂÂ6GW&U6Æ–FT–ÖvS¢6GW&U6Æ–FT–ÖvRÒ7–æ2‚’ÓâçVÆÂÂ6GW&U&ö&ÆVÔf÷%f—6–öã¢6GW&U&ö&ÆVÔf÷%f—6–öâÒ7–æ2‚’ÓâçVÆÂÂf÷&ÖE&ö&ÆVÔf÷%f—6–öã¢f÷&ÖE&ö&ÆVÔf÷%f—6–öâÒ‚’Óâ""ÂVW'”•f—6–öã¢VW'”•f—6–öâÒ7–æ2‚’Óâ""Â'6T”ç7vW#¢'6T”ç7vW"Ò‚’ÓâçVÆÂÂ7V&Ö—Dç7vW#¢7V&Ö—Dç7vW"Ò7–æ2‚’Óâ‡°¢&÷WFS¢&ç7vW" ¢Ò’Âöäç7vW&VC¢öäç7vW&VBÂöå7FGW46†ævS¢öå7FGW46†ævRÂæ÷F–g“¢æ÷F–g’ÂFö7C¢Fö7BÂ6†÷u÷W¢6†÷u÷WÂæ÷s¢æ÷rÒ‚’ÓâFFRææ÷r‚—ÒÒ·Ò’°¢7–æ2gVæ7F–öâ'Vâ‡&ö&ÆVÒÂ7FGW2Â¶f÷&6S¢f÷&6RÒfÇ6RÂf÷&6U&WG'“¢f÷&6U&WG'’ÒfÇ6RÂÆÆ÷u&W7V&Ö—C¢ÆÆ÷u&W7V&Ö—BÒfÇ6RÂ6÷W&6S¢6÷W&6RÒ†f÷&6Rò&ÖçVÂ"¢&WFò"’ÂÆW76öä–C¢ÆW76öä–BÒçVÆÇÒÒ·Ò’°¢–b‚&ö&ÆVÒÇÂ7FGW2’&WGW&â°¢ö³¢fÇ6RÀ¢&V6öã¢&Ö—76–ær×7FGW2 ¢Ó°¢–b‡7FGW2æç7vW&–ær’&WGW&â°¢ö³¢fÇ6RÀ¢&V6öã¢&ç7vW&–ær ¢Ó°¢–b‡7FGW2æFöæRÇÂ&ö&ÆVÒç&W7VÇBbbÆÆ÷u&W7V&Ö—B’&WGW&â°¢ö³¢fÇ6RÀ¢&V6öã¢&ç7vW&VB ¢Ó°¢6öç7B7W'&VçEF–ÖRÒçVÖ&W"†æ÷r‚’“°¢6öç7BW‡—&VBÒ—4W‡—&VB‡7FGW2Â7W'&VçEF–ÖR“°¢–b†W‡—&VBbbf÷&6Rbbf÷&6U&WG'’’&WGW&â°¢ö³¢fÇ6RÀ¢&V6öã¢&W‡—&VB ¢Ó°¢6öç7B6†÷VÆE&WG'’Òf÷&6U&WG'’ÇÂf÷&6RbbW‡—&VC°¢7FGW2æç7vW&–ærÒG'VS°¢7FGW2ç†6RÒ&ç7vW&–ær#°¢7FGW2æWFôç7vW%F–ÖRÒçVÆÃ°¢7FGW2æÆ7DW'&÷"Ò"#°¢VÖ—E7FGW2‡7FGW2Âöå7FGW46†ævRÂ&ö&ÆVÒ“°¢æ÷F–g“òâ‚&WFòÖç7vW"×7F'FVB"Â&ö&ÆVÒÂ6÷W&6RÓÓÒ&ÖçVÂ"ò.h˜¾Xª[Ë®X‹b’KÙÎzÙN[{.[ÈZx¾8""¢fö–BÂ°¢6÷W&6S¢6÷W&6P¢Ò“°¢ÆWB”6öçFVçBÒ"#°¢G'’°¢ÆWB'6VC°¢–b‚†47F—fU&öf–ÆR†vWD”6öæf–r‚’’’'6VBÒÖ¶TFVfVÇDç7vW"‡&ö&ÆVÒ“²VÇ6R°¢ÆWB–ÖvRÒçVÆÃ°¢G'’°¢–ÖvRÒv—B6GW&U6Æ–FT–ÖvR‡7FGW2ç6Æ–FT–B“°¢Ò6F6‚†W'&÷"’°¢6öç6öÆRçv&â‚%¾™ºŠûîZ.Xªh˜µÕµt$åÕ´WFôç7vW%Ò[›¾xşx˜~hŠ®Y»îZK‹J^ûÈÎ[	ŞŠù^š^™Ú.hŠ®Y»ã¢"ÂW'&÷"“°¢Ğ¢–b‚–ÖvR’–ÖvRÒv—B6GW&U&ö&ÆVÔf÷%f—6–öâ‚“°¢–b‚–ÖvR’F‡&÷ræWrW'&÷"‚.izk9^ˆë~Xùnš)yºîY»îX8ò"“°¢6öç7B†5FW‡D–æfòÒ‡&ö&ÆVÒæ&öG’bb7G&–ær‡&ö&ÆVÒæ&öG’’çG&–Ò‚’“°¢6öç7B&ö×BÒf÷&ÖE&ö&ÆVÔf÷%f—6–öâ‡&ö&ÆVÒÂG—TÖÂ†5FW‡D–æfò“°¢”6öçFVçBÒv—BVW'”•f—6–öâ†–ÖvRÂ&ö×BÂvWD”6öæf–r‚’“°¢'6VBÒ'6T”ç7vW"‡&ö&ÆVÒÂ”6öçFVçB“°¢–b‚'6VB’F‡&÷ræWrW'&÷"‚.izk9^Šz>ié’‹ùNY¹îy¨NzÙNj‚"“°¢Ğ¢6öç7B7V&Ö—D÷F–öç2Ò°¢7F'EF–ÖS¢7FGW2ç7F'EF–ÖRÀ¢VæEF–ÖS¢7FGW2æVæEF–ÖRÀ¢f÷&6U&WG'“¢6†÷VÆE&WG'’À¢ÆW76öä–C¢ÆW76öä–@¢Ó°¢–b†f÷&6R’°¢7V&Ö—D÷F–öç2æWFôvFRÒfÇ6S°¢7V&Ö—D÷F–öç2çv—D×2Ò°¢Ğ¢6öç7B7V&Ö—76–öâÒv—B7V&Ö—Dç7vW"‡&ö&ÆVÒÂ'6VBÂ7V&Ö—D÷F–öç2“°¢7FGW2æFöæRÒG'VS°¢7FGW2æç7vW&–ærÒfÇ6S°¢7FGW2ç†6RÒ&FöæR#°¢7FGW2æWFôç7vW%F–ÖRÒçVÆÃ°¢7FGW2æÆ7DW'&÷"Ò"#°¢VÖ—E7FGW2‡7FGW2Âöå7FGW46†ævRÂ&ö&ÆVÒ“°¢v—B†öäç7vW&VCòâ‡&ö&ÆVÒÂ'6VBÂ7FGW2Â7V&Ö—76–öâ’“°¢æ÷F–g“òâ‚&WFòÖç7vW"×7V66VVFVB"Â&ö&ÆVÒÂ6†÷VÆE&WG'’ò.zÙNj[{.[Ë®X‹nŠ^KªN8""¢fö–BÂ°¢6÷W&6S¢6÷W&6RÀ¢7V&Ö—76–öã¢7V&Ö—76–öà¢Ò“°¢Fö7Còâ‡6†÷VÆE&WG'’ò$’KÙÎzÙNZèÎh‰[›n[{.Š^KªB"¢$’KÙÎzÙNZèÎh‰"Â6S2“°¢6†÷u÷Wòâ‡&ö&ÆVÒÂ”6öçFVçBÇÂ.ûÈiÊÎYË›¹ŠêNzÙNjûÈ’"“°¢&WGW&â°¢ö³¢G'VRÀ¢ç7vW#¢'6VBÀ¢”ç7vW#¢”6öçFVçBÀ¢ââç7V&Ö—76–öà¢Ó°¢Ò6F6‚†W'&÷"’°¢7FGW2æç7vW&–ærÒfÇ6S°¢7FGW2ç†6RÒ&f–ÆVB#°¢7FGW2æGFV×G2ÒÖF‚æÖ‚ƒÂçVÖ&W"‡7FGW2æGFV×G2’ÇÂ’²°¢7FGW2æÆ7DW'&÷"ÒW'&÷$ÖW76vR†W'&÷"“°¢VÖ—E7FGW2‡7FGW2Âöå7FGW46†ævRÂ&ö&ÆVÒ“°¢æ÷F–g“òâ‚&WFòÖç7vW"Öf–ÆVB"Â&ö&ÆVÒÂ’KÙÎzÙNZK‹J^ûÉ¢G·7FGW2æÆ7DW'&÷'ÖÂ°¢6÷W&6S¢6÷W&6P¢Ò“°¢Fö7Còâ†’KÙÎzÙNZK‹J^ûÉ¢G·7FGW2æÆ7DW'&÷'ÖÂFS2“°¢&WGW&â°¢ö³¢fÇ6RÀ¢&V6öã¢&W'&÷""À¢W'&÷#¢W'&÷ ¢Ó°¢Ğ¢Ğ¢&WGW&â°¢'Vã¢'Và¢Ó°¢Ğ¢gVæ7F–öâF—7F6„–çWDWfVçB†–çWBÂG—R’°¢–b‡G—Vöb–çWCòæF—7F6„WfVçBÓÒ&gVæ7F–öâ"’&WGW&ã°¢6öç7BWfVçD7F÷"Ò–çWBæ÷væW$Fö7VÖVçCòæFVfVÇEf–WsòäWfVçBÇÂvÆö&ÅF†—2äWfVçC°¢G'’°¢–çWBæF—7F6„WfVçB‡G—VöbWfVçD7F÷"ÓÓÒ&gVæ7F–öâ"òæWrWfVçD7F÷"‡G—RÂ°¢'V&&ÆW3¢G'VP¢Ò’¢°¢G—S¢G—RÀ¢'V&&ÆW3¢G'VP¢Ò“°¢Ò6F6‚°¢G'’°¢–çWBæF—7F6„WfVçB‡°¢G—S¢G—RÀ¢'V&&ÆW3¢G'VP¢Ò“°¢Ò6F6‚·Ğ¢Ğ¢Ğ¢gVæ7F–öâ6WD–çWEfÇVR†–çWBÂFW‡B’°¢6öç7BfÇVTFW67&—F÷"Ò‚‚’Óâ°¢ÆWB7W'&VçBÒ–çWC°¢v†–ÆR†7W'&VçB’°¢6öç7BFW67&—F÷"Òö&¦V7BævWD÷vå&÷W'G”FW67&—F÷"†7W'&VçBÂ'fÇVR"“°¢–b†FW67&—F÷"’&WGW&âFW67&—F÷#°¢7W'&VçBÒö&¦V7BævWE&÷F÷G—Töb†7W'&VçB“°¢Ğ¢&WGW&âçVÆÃ°¢Ò’‚“°¢–b‡G—VöbfÇVTFW67&—F÷#òç6WBÓÓÒ&gVæ7F–öâ"’fÇVTFW67&—F÷"ç6WBæ6ÆÂ†–çWBÂFW‡B“²VÇ6R–b‚'fÇVR"–â–çWB’–çWBçfÇVRÒFW‡C²VÇ6R–çWBçFW‡D6öçFVçBÒFW‡C°¢F—7F6„–çWDWfVçB†–çWBÂ&–çWB"“°¢F—7F6„–çWDWfVçB†–çWBÂ&6†ævR"“°¢Ğ¢ò¢¢6VæBöæRFW‡BF‡&÷Vv‚F†RæF—fR6Æ77&ööÒ&'&vR6öçG&öÇ2â¢ògVæ7F–öâ6VæDFæ×UFW‡B‡FW‡BÂ·&ö÷C¢&ö÷BÒvÆö&ÅF†—2æFö7VÖVçGÒÒ·Ò’°¢–b‡G—VöbFW‡BÓÒ'7G&–ær"ÇÂFW‡BçG&–Ò‚’’&WGW&â°¢6VçC¢fÇ6RÀ¢FW‡C¢FW‡BÀ¢&V6öã¢&V×G’ ¢Ó°¢G'’°¢6öç7B–çWBÒ&ö÷CòçVW'•6VÆV7F÷#òâ‚"ç6VæEõö–çWB"“°¢6öç7B'WGFöâÒ&ö÷CòçVW'•6VÆV7F÷#òâ‚"ç6VæEõö'Fâ"“°¢–b‚–çWBÇÂ'WGFöâ’&WGW&â°¢6VçC¢fÇ6RÀ¢FW‡C¢FW‡BÀ¢&V6öã¢&6öçG&öÇ2×Væf–Æ&ÆR ¢Ó°¢–b†'WGFöâæF—6&ÆVBÇÂ'WGFöâævWDGG&–'WFSòâ‚&&–ÖF—6&ÆVB"’ÓÓÒ'G'VR"’&WGW&â°¢6VçC¢fÇ6RÀ¢FW‡C¢FW‡BÀ¢&V6öã¢'6VæBÖF—6&ÆVB ¢Ó°¢6WD–çWEfÇVR†–çWBÂFW‡B“°¢–b‡G—Vöb'WGFöâæ6Æ–6²ÓÒ&gVæ7F–öâ"’&WGW&â°¢6VçC¢fÇ6RÀ¢FW‡C¢FW‡BÀ¢&V6öã¢'6VæB×Væf–Æ&ÆR ¢Ó°¢'WGFöâæ6Æ–6²‚“°¢&WGW&â°¢6VçC¢G'VRÀ¢FW‡C¢FW‡@¢Ó°¢Ò6F6‚†W'&÷"’°¢&WGW&â°¢6VçC¢fÇ6RÀ¢FW‡C¢FW‡BÀ¢&V6öã¢'6VæBÖW'&÷""À¢W'&÷#¢W'&÷ ¢Ó°¢Ğ¢Ğ¢6öç7BDTdTÅE2Ò°¢v–æF÷u6—¦S¢rÀ¢'W'7Ev–æF÷t×3¢6SBÀ¢&÷VæDv×3¢fSBÀ¢Ö…6VæG5W%&÷VæC¢ ¢Ó°¢gVæ7F–öâæ÷&ÖÆ—¦T÷†ÖW76vR’°¢&WGW&â7G&–ær†ÖW76vSòæ÷ÇÂÖW76vSòçG—RÇÂ""’çG&–Ò‚’çFôÆ÷vW$66R‚’ç&WÆ6R‚õµæ×£Ó•ÒörÂ""“°¢Ğ¢gVæ7F–öâf–æ—FU÷6—F—fR‡fÇVRÂfÆÆ&6²’°¢6öç7BçVÖ&W"ÒçVÖ&W"‡fÇVR“°¢&WGW&âçVÖ&W"æ—4f–æ—FR†çVÖ&W"’bbçVÖ&W"âòçVÖ&W"¢fÆÆ&6³°¢Ğ¢ò¢¢W‡G&7BF†RæF—fR&–â6Æ77&ööÒæWvFæ×R–ÆöBv—F†÷WB6†æv–ærFW‡Bâ¢ògVæ7F–öâW‡G&7DFæ×TÖW76vR†ÖW76vR’°¢–b†æ÷&ÖÆ—¦T÷†ÖW76vR’ÓÒ&æWvFæ×R"’&WGW&âçVÆÃ°¢6öç7B6æF–FFW2Ò²ÖW76vRÓ°¢f÷"†6öç7B¶W’öb²&×6r"Â&FF"Â&ÖW76vR"Â'–ÆöB"Ò’°¢6öç7B6æF–FFRÒÖW76vSòå¶¶W•Ó°¢–b†6æF–FFRbbG—Vöb6æF–FFRÓÓÒ&ö&¦V7B"bb'&’æ—4'&’†6æF–FFR’’6æF–FFW2çW6‚†6æF–FFR“°¢Ğ¢6öç7B–ÆöBÒ6æF–FFW2æf–æB†6æF–FFRÓâG—Vöb6æF–FFSòæFæ×RÓÓÒ'7G&–ær"“°¢–b‚–ÆöB’&WGW&âçVÆÃ°¢6öç7BFW‡BÒ–ÆöBæFæ×S°¢6öç7B&uW6W$–BÒ6æF–FFW2æÖ†6æF–FFRÓâ6æF–FFSòçW6W&–Bóò6æF–FFSòçW6W$–Bóò6æF–FFSòçW6W%ö–Bóò6æF–FFSòçV–B’æf–æB‡fÇVRÓâfÇVRÓÒfö–BbbfÇVRÓÒçVÆÂ“°¢&WGW&â°¢FW‡C¢FW‡BÀ¢W6W$–C¢&uW6W$–BÓÓÒfö–BÇÂ&uW6W$–BÓÓÒçVÆÂòçVÆÂ¢7G&–ær‡&uW6W$–B¢Ó°¢Ğ¢ò¢ ¢¢G&6·26Æ77&ööÒ&'&vR&÷VæB&÷VæF&–W2v—F†÷WBÇ––ærföÆÆ÷r'VÆW2à¢¢F†Rf—'7Bö'6W'fVBÖW76vR7F'G2&÷VæB6–ÆVçFÇ“²ÆFW"ÖW76vR7F'G0¢¢æWr&÷VæBv†VâF†RF¦6VçBv&V6†W2F†R6öæf–wW&VB&÷VæDv×2à¢¢ògVæ7F–öâ7&VFTFæ×U&÷VæEG&6¶W"†÷F–öç2Ò·Ò’°¢6öç7B&÷VæDv×2Òf–æ—FU÷6—F—fR†÷F–öç2ç&÷VæDv×2ÂDTdTÅE2ç&÷VæDv×2“°¢ÆWBÆ7DBÒçVÆÃ°¢ÆWB&÷VæDçVÖ&W"Ò°¢gVæ7F–öâ&W6WB‚’°¢Æ7DBÒçVÆÃ°¢&÷VæDçVÖ&W"Ò°¢Ğ¢gVæ7F–öâö'6W'fR†BÒFFRææ÷r‚’’°¢6öç7BF–ÖW7F×ÒçVÖ&W"†B“°¢6öç7Bæ÷rÒçVÖ&W"æ—4f–æ—FR‡F–ÖW7F×’òF–ÖW7F×¢FFRææ÷r‚“°¢6öç7B&÷VæE7F'FVBÒÆ7DBÓÒçVÆÂbbæ÷rÒÆ7DBãÒ&÷VæDv×3°¢–b†Æ7DBÓÓÒçVÆÂÇÂ&÷VæE7F'FVB’&÷VæDçVÖ&W"³Ò°¢Æ7DBÒæ÷s°¢&WGW&â°¢&÷VæE7F'FVC¢&÷VæE7F'FVBÀ¢&÷VæDçVÖ&W#¢&÷VæDçVÖ&W"À¢C¢æ÷p¢Ó°¢Ğ¢&WGW&â°¢ö'6W'fS¢ö'6W'fRÀ¢&W6WC¢&W6WBÀ¢vWE6æ6†÷B‚’°¢&WGW&â°¢Æ7DC¢Æ7DBÀ¢&÷VæDçVÖ&W#¢&÷VæDçVÖ&W ¢Ó°¢Ğ¢Ó°¢Ğ¢ò¢ ¢¢G&6·2öæR6Æ77&ööÒw2&'&vR7G&VÒà¢¢&÷VæB6öçF–çVW2v†–ÆRV6‚F¦6VçBæöâÖV×G’ÖW76vR—2ÆW72F†âF†P¢¢6öæf–wW&VBv'Bâöæ6Rv–æF÷u6—¦R6öç6V7WF—fRÖW76vW2&Rf–Æ&ÆRÀ¢¢F†W’×W7Bf—B–ç6–FR'W'7Ev–æF÷t×3²F†RÖ÷7Bg&WVVçBW†7BFW‡Bv–ç2Âv—F€¢¢F†RæWvW7BFW‡B'&V¶–ærF–W2âV6‚6ö×ÆWFVB'W'7B—26öç7VÖVB6òöæP¢¢ÖW76vR6ææ÷BG&–vvW"Gv–6Rà¢¢ògVæ7F–öâ7&VFTFæ×TföÆÆ÷uG&6¶W"†÷F–öç2Ò·Ò’°¢6öç7Bv–æF÷u6—¦RÒÖF‚æÖ‚ƒÂÖF‚æfÆö÷"†f–æ—FU÷6—F—fR†÷F–öç2çv–æF÷u6—¦RÂDTdTÅE2çv–æF÷u6—¦R’’“°¢6öç7B'W'7Ev–æF÷t×2Òf–æ—FU÷6—F—fR†÷F–öç2æ'W'7Ev–æF÷t×2ÂDTdTÅE2æ'W'7Ev–æF÷t×2“°¢6öç7B&÷VæDv×2Òf–æ—FU÷6—F—fR†÷F–öç2ç&÷VæDv×2ÂDTdTÅE2ç&÷VæDv×2“°¢6öç7BÖ…6VæG5W%&÷VæBÒÖF‚æÖ‚ƒÂÖF‚æfÆö÷"„çVÖ&W"æ—4f–æ—FR„çVÖ&W"†÷F–öç2æÖ…6VæG5W%&÷VæB’’òçVÖ&W"†÷F–öç2æÖ…6VæG5W%&÷VæB’¢DTdTÅE2æÖ…6VæG5W%&÷VæB’“°¢ÆWBÖW76vW2ÒµÓ°¢ÆWBÆ7DBÒçVÆÃ°¢ÆWB6VçD6÷VçBÒ°¢ÆWBföÆÆ÷vVEFW‡G2ÒæWr6WC°¢gVæ7F–öâ&W6WB‚’°¢ÖW76vW2ÒµÓ°¢Æ7DBÒçVÆÃ°¢6VçD6÷VçBÒ°¢föÆÆ÷vVEFW‡G2ÒæWr6WC°¢Ğ¢gVæ7F–öâ&W7VÇB‡G&–vvW&VBÂFW‡BÂ6÷VçBÂ&V6öâ’°¢6öç7B–ÆöBÒ°¢G&–vvW&VC¢G&–vvW&VBÀ¢FW‡C¢FW‡BÀ¢6÷VçC¢6÷VçBÀ¢6VçD6÷VçC¢6VçD6÷Vç@¢Ó°¢–b‡&V6öâ’–ÆöBç&V6öâÒ&V6öã°¢&WGW&â–ÆöC°¢Ğ¢gVæ7F–öâö'6W'fR‡FW‡BÂBÒFFRææ÷r‚’’°¢–b‡G—VöbFW‡BÓÒ'7G&–ær"ÇÂFW‡BçG&–Ò‚’’&WGW&â&W7VÇB†fÇ6RÂFW‡BÂÂ&V×G’"“°¢6öç7BF–ÖW7F×ÒçVÖ&W"†B“°¢6öç7Bæ÷rÒçVÖ&W"æ—4f–æ—FR‡F–ÖW7F×’òF–ÖW7F×¢FFRææ÷r‚“°¢–b†Æ7DBÓÒçVÆÂbbæ÷rÒÆ7DBãÒ&÷VæDv×2’&W6WB‚“°¢ÖW76vW2çW6‚‡°¢FW‡C¢FW‡BÀ¢C¢æ÷p¢Ò“°¢–b†ÖW76vW2æÆVæwF‚âv–æF÷u6—¦R’ÖW76vW2ÒÖW76vW2ç6Æ–6R‚×v–æF÷u6—¦R“°¢Æ7DBÒæ÷s°¢6öç7B7W'&VçD6÷VçBÒÖW76vW2ç&VGV6R‚‡F÷FÂÂ—FVÒ’ÓâF÷FÂ²†—FVÒçFW‡BÓÓÒFW‡Bò¢’Â“°¢–b†ÖW76vW2æÆVæwF‚Âv–æF÷u6—¦R’&WGW&â&W7VÇB†fÇ6RÂFW‡BÂ7W'&VçD6÷VçBÂ&'W'7B×6—¦R"“°¢6öç7B'W'7DvRÒæ÷rÒÖW76vW5³ÒæC°¢–b†'W'7DvRâ'W'7Ev–æF÷t×2’&WGW&â&W7VÇB†fÇ6RÂFW‡BÂ7W'&VçD6÷VçBÂ&'W'7B×v–æF÷r"“°¢6öç7B6÷VçG2ÒæWrÖ°¢f÷"†6öç7B—FVÒöbÖW76vW2’6÷VçG2ç6WB†—FVÒçFW‡BÂ†6÷VçG2ævWB†—FVÒçFW‡B’ÇÂ’²“°¢ÆWBv–ææW%FW‡BÒÖW76vW5¶ÖW76vW2æÆVæwF‚ÒÒçFW‡C°¢ÆWBv–ææW$6÷VçBÒ6÷VçG2ævWB‡v–ææW%FW‡B’ÇÂ°¢ÆWBv–ææW$–æFW‚ÒÖW76vW2æÆVæwF‚Ò°¢ÖW76vW2æf÷$V6‚‚†—FVÒÂ–æFW‚’Óâ°¢6öç7B6÷VçBÒ6÷VçG2ævWB†—FVÒçFW‡B’ÇÂ°¢–b†6÷VçBâv–ææW$6÷VçBÇÂ6÷VçBÓÓÒv–ææW$6÷VçBbb–æFW‚ãÒv–ææW$–æFW‚’°¢v–ææW%FW‡BÒ—FVÒçFW‡C°¢v–ææW$6÷VçBÒ6÷VçC°¢v–ææW$–æFW‚Ò–æFWƒ°¢Ğ¢Ò“°¢–b†föÆÆ÷vVEFW‡G2æ†2‡v–ææW%FW‡B’’&WGW&â&W7VÇB†fÇ6RÂv–ææW%FW‡BÂv–ææW$6÷VçBÂ&Ç&VG’ÖföÆÆ÷vVB"“°¢–b‡6VçD6÷VçBãÒÖ…6VæG5W%&÷VæB’&WGW&â&W7VÇB†fÇ6RÂv–ææW%FW‡BÂv–ææW$6÷VçBÂ'&÷VæBÖÆ–Ö—B"“°¢föÆÆ÷vVEFW‡G2æFB‡v–ææW%FW‡B“°¢6VçD6÷VçB³Ò°¢ÖW76vW2ÒµÓ°¢&WGW&â°¢ââç&W7VÇB‡G'VRÂv–ææW%FW‡BÂv–ææW$6÷VçB’À¢&F6…6—¦S¢v–æF÷u6—¦RÀ¢'W'7Ev–æF÷t×3¢'W'7Ev–æF÷t×0¢Ó°¢Ğ¢&WGW&â°¢ö'6W'fS¢ö'6W'fRÀ¢&W6WC¢&W6WBÀ¢vWE6æ6†÷B‚’°¢&WGW&â°¢ÖW76vW3¢ÖW76vW2ç6Æ–6R‚’À¢Æ7DC¢Æ7DBÀ¢6VçD6÷VçC¢6VçD6÷VçBÀ¢föÆÆ÷vVEFW‡G3¢æWr6WB†föÆÆ÷vVEFW‡G2¢Ó°¢Ğ¢Ó°¢Ğ¢ò¢ ¢¢6öææV7G2F†R&÷Fö6öÂ'6W"ÂG&6¶W"ÂæBvR6VæFW"v†–ÆR¶VW–ær÷và¢¢V6†öW2÷WBöbF†R6Æ72×v–FRÖW76vR7G&VÒà¢¢ògVæ7F–öâ7&VFTFæ×TföÆÆ÷t6öçG&öÆÆW"†÷F–öç2Ò·Ò’°¢6öç7BG&6¶W"Ò÷F–öç2çG&6¶W"ÇÂ7&VFTFæ×TföÆÆ÷uG&6¶W"†÷F–öç2“°¢6öç7B&÷VæEG&6¶W"Ò÷F–öç2ç&÷VæEG&6¶W"ÇÂ7&VFTFæ×U&÷VæEG&6¶W"†÷F–öç2“°¢6öç7BVæ&ÆVBÒ÷F–öç2æVæ&ÆVBÓÓÒfö–Bò‚’ÓâG'VR¢÷F–öç2æVæ&ÆVC°¢6öç7B6VæBÒ÷F–öç2ç6VæBÇÂ‡FW‡BÓâ6VæDFæ×UFW‡B‡FW‡B’“°¢6öç7BvWD7W'&VçEW6W$–BÒ÷F–öç2ævWD7W'&VçEW6W$–BÇÂ‚‚’ÓâçVÆÂ“°¢6öç7BvWDæ÷rÒ÷F–öç2ææ÷rÇÂ‚‚’ÓâFFRææ÷r‚’“°¢6öç7B÷väV6†õGFÄ×2Òf–æ—FU÷6—F—fR†÷F–öç2æ÷väV6†õGFÄ×2ÂSB“°¢6öç7Böå&÷VæE7F'BÒG—Vöb÷F–öç2æöå&÷VæE7F'BÓÓÒ&gVæ7F–öâ"ò÷F–öç2æöå&÷VæE7F'B¢çVÆÃ°¢6öç7BöäföÆÆ÷uG&–vvW"ÒG—Vöb÷F–öç2æöäföÆÆ÷uG&–vvW"ÓÓÒ&gVæ7F–öâ"ò÷F–öç2æöäföÆÆ÷uG&–vvW"¢çVÆÃ°¢6öç7BVæF–æt÷vâÒæWrÖ°¢gVæ7F–öâ—4Væ&ÆVB‚’°¢G'’°¢&WGW&âG—VöbVæ&ÆVBÓÓÒ&gVæ7F–öâ"òVæ&ÆVB‚’ÓÒfÇ6R¢Væ&ÆVBÓÒfÇ6S°¢Ò6F6‚°¢&WGW&âfÇ6S°¢Ğ¢Ğ¢gVæ7F–öâ7W'&VçEW6W$–B‚’°¢G'’°¢6öç7BfÇVRÒvWD7W'&VçEW6W$–B‚“°¢&WGW&âfÇVRÓÓÒfö–BÇÂfÇVRÓÓÒçVÆÂÇÂ7G&–ær‡fÇVR’çG&–Ò‚’ÓÓÒ""òçVÆÂ¢7G&–ær‡fÇVR“°¢Ò6F6‚°¢&WGW&âçVÆÃ°¢Ğ¢Ğ¢gVæ7F–öâ&VÖVÖ&W$÷vâ‡FW‡BÂB’°¢VæF–æt÷vâç6WB‡FW‡BÂ°¢C¢BÀ¢6÷VçC¢‡VæF–æt÷vâævWB‡FW‡B“òæ6÷VçBÇÂ’²¢Ò“°¢Ğ¢gVæ7F–öâ6öç7VÖT÷väV6†ò‡FW‡BÂB’°¢6öç7BVæF–ærÒVæF–æt÷vâævWB‡FW‡B“°¢–b‚VæF–ær’&WGW&âfÇ6S°¢–b†BÒVæF–æræBâ÷väV6†õGFÄ×2ÇÂBÂVæF–æræB’°¢VæF–æt÷vâæFVÆWFR‡FW‡B“°¢&WGW&âfÇ6S°¢Ğ¢–b‡VæF–æræ6÷VçBÃÒ’VæF–æt÷vâæFVÆWFR‡FW‡B“²VÇ6RVæF–æræ6÷VçBÓÒ°¢&WGW&âG'VS°¢Ğ¢gVæ7F–öâ†æFÆR†ÖW76vRÂ¶æ÷F–f–6F–öäöæÇ“¢æ÷F–f–6F–öäöæÇ’ÒfÇ6WÒÒ·Ò’°¢6öç7B'6VBÒW‡G&7DFæ×TÖW76vR†ÖW76vR“°¢–b‚'6VB’&WGW&â°¢†æFÆVC¢fÇ6RÀ¢G&–vvW&VC¢fÇ6RÀ¢&V6öã¢&æ÷BÖFæ×R ¢Ó°¢–b†æ÷F–f–6F–öäöæÇ’’&WGW&â°¢†æFÆVC¢G'VRÀ¢G&–vvW&VC¢fÇ6RÀ¢FW‡C¢'6VBçFW‡BÀ¢&V6öã¢&æ÷F–f–6F–öâÖöæÇ’ ¢Ó°¢6öç7B&tæ÷rÒçVÖ&W"†vWDæ÷r‚’“°¢6öç7Bæ÷rÒçVÖ&W"æ—4f–æ—FR‡&tæ÷r’ò&tæ÷r¢FFRææ÷r‚“°¢6öç7B÷vä–BÒ7W'&VçEW6W$–B‚“°¢–b†÷vä–BÓÒçVÆÂbb'6VBçW6W$–BÓÒçVÆÂbb÷vä–BÓÓÒ'6VBçW6W$–B’&WGW&â°¢†æFÆVC¢G'VRÀ¢G&–vvW&VC¢fÇ6RÀ¢FW‡C¢'6VBçFW‡BÀ¢&V6öã¢&÷vâ ¢Ó°¢–b‡'6VBçW6W$–BÓÓÒçVÆÂbb6öç7VÖT÷väV6†ò‡'6VBçFW‡BÂæ÷r’’&WGW&â°¢†æFÆVC¢G'VRÀ¢G&–vvW&VC¢fÇ6RÀ¢FW‡C¢'6VBçFW‡BÀ¢&V6öã¢&÷vâÖV6†ò ¢Ó°¢6öç7B&÷VæBÒ&÷VæEG&6¶W"æö'6W'fR†æ÷r“°¢–b‡&÷VæBç&÷VæE7F'FVB’G'’°¢öå&÷VæE7F'Còâ‡°¢ââç&÷VæBÀ¢FW‡C¢'6VBçFW‡@¢Ò“°¢Ò6F6‚·Ğ¢–b‚—4Væ&ÆVB‚’’°¢G&6¶W"ç&W6WB‚“°¢VæF–æt÷vâæ6ÆV"‚“°¢&WGW&â°¢†æFÆVC¢G'VRÀ¢G&–vvW&VC¢fÇ6RÀ¢FW‡C¢'6VBçFW‡BÀ¢&÷VæDçVÖ&W#¢&÷VæBç&÷VæDçVÖ&W"À¢C¢&÷VæBæBÀ¢&÷VæE7F'FVC¢&÷VæBç&÷VæE7F'FVBÀ¢&V6öã¢&F—6&ÆVB ¢Ó°¢Ğ¢6öç7Bö'6W'fF–öâÒG&6¶W"æö'6W'fR‡'6VBçFW‡BÂæ÷r“°¢6öç7BVç&–6†VBÒ°¢ââæö'6W'fF–öâÀ¢&÷VæDçVÖ&W#¢&÷VæBç&÷VæDçVÖ&W"À¢C¢&÷VæBæ@¢Ó°¢–b‚ö'6W'fF–öâçG&–vvW&VB’&WGW&â°¢†æFÆVC¢G'VRÀ¢ââæVç&–6†V@¢Ó°¢G'’°¢öäföÆÆ÷uG&–vvW#òâ†Vç&–6†VB“°¢Ò6F6‚·Ğ¢ÆWB6VæE&W7VÇC°¢G'’°¢6VæE&W7VÇBÒ6VæB†ö'6W'fF–öâçFW‡B“°¢Ò6F6‚†W'&÷"’°¢6VæE&W7VÇBÒ°¢6VçC¢fÇ6RÀ¢FW‡C¢ö'6W'fF–öâçFW‡BÀ¢&V6öã¢'6VæBÖW'&÷""À¢W'&÷#¢W'&÷ ¢Ó°¢Ğ¢–b‡6VæE&W7VÇBÓÓÒG'VRÇÂ6VæE&W7VÇCòç6VçBÓÓÒG'VR’&VÖVÖ&W$÷vâ†ö'6W'fF–öâçFW‡BÂæ÷r“°¢&WGW&â°¢†æFÆVC¢G'VRÀ¢ââæVç&–6†VBÀ¢6VæE&W7VÇC¢6VæE&W7VÇ@¢Ó°¢Ğ¢&WGW&â°¢†æFÆS¢†æFÆRÀ¢&W6WB‚’°¢G&6¶W"ç&W6WB‚“°¢&÷VæEG&6¶W"ç&W6WB‚“°¢VæF–æt÷vâæ6ÆV"‚“°¢ÒÀ¢vWE6æ6†÷B‚’°¢&WGW&â°¢G&6¶W#¢G&6¶W"ævWE6æ6†÷Còâ‚’À¢VæF–æt÷vã¢æWrÖ‡VæF–æt÷vâ¢Ó°¢Ğ¢Ó°¢Ğ¢ò¢ ¢¢F–ÖVÆ–æR&WÆ’—2W6VBFò‡–G&FRF†R7W'&VçBvRæB—2æ÷BFV6†W"w0¢¢Æ—fRVæÆö6²WfVçBâ÷F†W"6÷W&6W2&WF–âF†R†—7F÷&–6ÂÆ—fR&V†f–÷"f÷ ¢¢6ö×F–&–Æ—G’v—F‚W†—7F–ærvV'6ö6¶WB†æFÆW'2à¢¢ògVæ7F–öâ—4Æ—fU&ö&ÆVÕ6÷W&6R‡6÷W&6R’°¢&WGW&â6÷W&6RÓÒ'F–ÖVÆ–æR#°¢Ğ¢òò7&2÷7FFRö7F–öç2æ§0¢ÆWBöWFôÆö÷7F'FVBÒfÇ6S°¢ÆWBöWFô¦ö–å7F'FVBÒfÇ6S°¢ÆWBöWFôöäÆW76öä6Æ–6µ7F'FVBÒfÇ6S°¢ÆWBöWFôöäÆW76öä6Æ–6´–å&öw&W72ÒfÇ6S°¢ÆWB÷&÷WFW$†öö¶VBÒfÇ6S°¢ÆWB÷&ö&ÆVÕ&V6÷fW'•7F÷&RÒçVÆÃ°¢ÆWB÷&ö&ÆVÕ&V6÷fW'”ÆW76öä–BÒçVÆÃ°¢6öç7BV&Æ—6…&VÖ–æFW"Ò7&VFUV&Æ—6…&VÖ–æFW"‡°¢æ÷F–g“¢WfVçBÓâV’ææ÷F–g•V&Æ—6‚†WfVçB¢Ò“°¢6öç7B&ö&ÆVÕ7F'E&VÖ–æFW"Ò7&VFTWfVçE&VÖ–æFW"‡°¢æ÷F–g“¢WfVçBÓâV’ææ÷F–g”6Æ77&ööÔWfVçB†WfVçB’À¢—4Væ&ÆVC¢…öWfVçBÂ6öæf–r’Óâ—5&VÖ–æFW$Væ&ÆVB‚'&ö&ÆVÒ×7F'B"Â6öæf–r¢Ò“°¢6öç7BFæ×TföÆÆ÷t6öçG&öÆÆW'2ÒæWrÖ°¢gVæ7F–öâ7&VFTFæ×TföÆÆ÷t6öçG&öÆÆW$f÷$ÆW76öâ†ÆW76öä–B’°¢&WGW&â7&VFTFæ×TföÆÆ÷t6öçG&öÆÆW"‡°¢Væ&ÆVC¢‚’ÓâV’æ6öæf–ræWFôföÆÆ÷tFæ×RÓÓÒG'VRÀ¢vWD7W'&VçEW6W$–C¢vWD7W'&VçEW6W$–E6fRÀ¢öå&÷VæE7F'C¢WfVçBÓâV’ææ÷F–g”6Æ77&ööÔWfVçB‡°¢¶–æC¢&Fæ×R×&÷VæB×7F'B"À¢FVGWT¶W“¢Fæ×R×&÷VæB×7F'C¢G¶ÆW76öä–GÓ¢G¶WfVçBç&÷VæDçVÖ&W'ÖÀ¢F—FÆS¢.ikKˆ‹Úî[Ë[™^[ÈZx²"À¢FWF–Ã¢j8kX¾X‹zÊÂG¶WfVçBç&÷VæDçVÖ&W'Ò‹Úî[Ë[™^8.šiniÚXh^ZëûÉ¢G¶WfVçBçFW‡GÖ ¢Ò’À¢öäföÆÆ÷uG&–vvW#¢WfVçBÓâV’ææ÷F–g”6Æ77&ööÔWfVçB‡°¢¶–æC¢&Fæ×RÖföÆÆ÷r×G&–vvW""À¢FVGWT¶W“¢Fæ×RÖföÆÆ÷r×G&–vvW#¢G¶ÆW76öä–GÓ¢G¶WfVçBç&÷VæDçVÖ&W'Ó¢G¶WfVçBçFW‡GÖÀ¢F—FÆS¢.[Ë[™^‹ëîX‹ˆz®Xª‹yşXùiÚK»b"À¢FWF–Ã¢iÈ‹ùG¶WfVçBæ&F6…6—¦WÒiÚ[Ë[™^KŠŞûÈÎ(	ÂG¶WfVçBçFW‡GŞ(	ŞX{®xëG¶WfVçBæ6÷VçGÒjÊûÈÎˆI®iÊÎXÛ>[nˆz®Xª‹yşXù8& ¢Ò’À¢6VæC¢FW‡BÓâ6VæDFæ×UFW‡B‡FW‡BÂ°¢&ö÷C¢†vÒçWrÇÂv–æF÷r’æFö7VÖVçBÇÂFö7VÖVç@¢Ò¢Ò“°¢Ğ¢gVæ7F–öâvWDFæ×TföÆÆ÷t6öçG&öÆÆW"†ÆW76öä–B’°¢6öç7B¶W’Ò7G&–ær†ÆW76öä–B“°¢ÆWB6öçG&öÆÆW"ÒFæ×TföÆÆ÷t6öçG&öÆÆW'2ævWB†¶W’“°¢–b‚6öçG&öÆÆW"’°¢6öçG&öÆÆW"Ò7&VFTFæ×TföÆÆ÷t6öçG&öÆÆW$f÷$ÆW76öâ†¶W’“°¢Fæ×TföÆÆ÷t6öçG&öÆÆW'2ç6WB†¶W’Â6öçG&öÆÆW"“°¢Ğ¢&WGW&â6öçG&öÆÆW#°¢Ğ¢gVæ7F–öâ7W'&VçEvTÆW76öä–B‚’°¢6öç7BÖF6‚Ò7G&–ær‡v–æF÷ræÆö6F–öâçF†æÖRÇÂ""’æÖF6‚‚õÂöÆW76öåÂögVÆÇ67&VVåÂ÷c5Âò…µâõÒ²’ò“°¢&WGW&âÖF6‚òÖF6…³Ò¢çVÆÃ°¢Ğ¢6öç7BUDõôå5tU%ôUdTåEôÔUDÒ°¢&WFòÖç7vW"×66†VGVÆVB#¢².ˆz®XªKÙÎzÙN[{.hé.™‰ò"Â.ˆI®iÊÎ[{.K‹®‹ù˜>š)Zèhé.ˆz®XªKÙÎzÙN8""ÒÀ¢&WFòÖç7vW"×7F'FVB#¢².ˆz®XªKÙÎzÙN[ÈZx²"Â.ˆI®iÊÎjÚ>YÊZHNyn‹ù˜>š)8""ÒÀ¢&WFòÖç7vW"×7V66VVFVB#¢².ˆz®XªKÙÎzÙNh‰X©ò"Â.‹ù˜>š)y¨NzÙNj[{.hùKªN8""ÒÀ¢&WFòÖç7vW"Öf–ÆVB#¢².ˆz®XªKÙÎzÙNZK‹JR"Â.‹ù˜>š)iÊ®ˆ;ŞZèÎh‰ˆz®XªKÙÎzÙN8""Ğ¢Ó°¢gVæ7F–öâf—'7EfÇVR‚ââçfÇVW2’°¢&WGW&âfÇVW2æf–æB‡fÇVRÓâfÇVRÓÒfö–BbbfÇVRÓÒçVÆÂbb7G&–ær‡fÇVR’çG&–Ò‚’ÓÒ""“°¢Ğ¢gVæ7F–öâæ÷F–g•&ö&ÆVÕ7F'B†FFÂ&ö&ÆVÒÂ6Æ–FR’°¢6öç7B–ÆöBÒFFbbG—VöbFFÓÓÒ&ö&¦V7B"òFF¢·Ó°¢6öç7B&ö&ÆVÔ–BÒf—'7EfÇVR‡&ö&ÆVÓòç&ö&ÆVÔ–BÂ&ö&ÆVÓòæ–BÂ–ÆöBç&ö"Â–ÆöBç&ö&ÆVÔ–BÂ–ÆöBç&ö&ÆVÖ–BÂ–ÆöBç&ö&ÆVÓòç&ö&ÆVÔ–BÂ–ÆöBç&ö&ÆVÓòæ–B“°¢6öç7BFWF–ÂÒ&ö&ÆVÓòæ&öG’ÇÂ–ÆöBæ&öG’ÇÂ–ÆöBçF—FÆRÇÂ–ÆöBææÖRÇÂ.ˆ[ˆ[{.[ÈY
şKˆ˜>ikš)ûÈÎŠû~h™>[ÈŠûîZ.iú^yÈ¾8"#°¢&WGW&â&ö&ÆVÕ7F'E&VÖ–æFW"æ†æFÆR‡°¢¶–æC¢'&ö&ÆVÒ×7F'B"À¢FVGWT¶W“¢&ö&ÆVÒ×7F'C¢G·&ö&ÆVÔ–BÇÂ–ÆöBç6–BÇÂ–ÆöBæGBÇÂ'Væ¶æ÷vâ'ÖÀ¢F—FÆS¢.Kšš)[{.Xù[ˆ2"À¢æF—fUF—FÆS¢.™ºŠûîZ.Kšš)hùzK¢"À¢FWF–Ã¢FWF–ÂÀ¢&ö&ÆVÓ¢&ö&ÆVÒÀ¢6Æ–FS¢6Æ–FP¢ÒÂV’æ6öæf–r“°¢Ğ¢gVæ7F–öâæ÷F–g”WFôç7vW"†¶–æBÂ&ö&ÆVÒÂFWF–Â’°¢6öç7B·F—FÆRÂFVfVÇDFWF–ÅÒÒUDõôå5tU%ôUdTåEôÔUD¶¶–æEÒÇÂ².ˆz®XªKÙÎzÙNhùzK¢"Â.ˆz®XªKÙÎzÙNx«nhXùyIşXùXÉn8""Ó°¢&WGW&âV’ææ÷F–g”6Æ77&ööÔWfVçB‡°¢¶–æC¢¶–æBÀ¢FVGWT¶W“¢G¶¶–æGÓ¢G·&ö&ÆVÓòç&ö&ÆVÔ–BÇÂFFRææ÷r‚—ÖÀ¢F—FÆS¢F—FÆRÀ¢FWF–Ã¢FWF–ÂÇÂFVfVÇDFWF–ÂÀ¢&ö&ÆVÓ¢&ö&ÆVĞ¢Ò“°¢Ğ¢gVæ7F–öâvWD7W'&VçEW6W$–E6fR‚’°¢6öç7BF&vWBÒvÒçWrÇÂv–æF÷s°¢G'’°¢–b‡F&vWCòå–·EW6W#òæ–BÓÒfö–BbbF&vWCòå–·EW6W#òæ–BÓÒçVÆÂ’&WGW&âF&vWBå–·EW6W"æ–C°¢6öç7B–æ—F–ÅW6W$–BÒF&vWCòåõô”ä•D”Åõ5DDUõóòçW6W#òçW6W$–C°¢–b†–æ—F–ÅW6W$–BÓÒfö–Bbb–æ—F–ÅW6W$–BÓÒçVÆÂ’&WGW&â–æ—F–ÅW6W$–C°¢6öç7B6öö¶–RÒF&vWCòæFö7VÖVçCòæ6öö¶–RÇÂ"#°¢6öç7BÖF6‚Ò6öö¶–RæÖF6‚‚òƒó¥çÃµÇ2¢—W6W%ö–CÒ…ÆB²’ò“°¢&WGW&âÖF6‚òÖF6…³Ò¢çVÆÃ°¢Ò6F6‚°¢&WGW&âçVÆÃ°¢Ğ¢Ğ¢òòiz›¹ŠêNzÙNjyIşh‰ ¢gVæ7F–öâÖ¶TFVfVÇDç7vW"‡&ö&ÆVÒ’°¢7v—F6‚‡&ö&ÆVÒç&ö&ÆVÕG—R’°¢66R ¢òòXÙ^˜¢66R# ¢òòZI®˜¢66R3 ¢òòh©^zZ€¢&WGW&â²$"Ó° ¢66RC ¢òòZ¾z› ¢òòhÈ™Èk.zK®Kè¾‹ùNY¹â²"%ŞûÈKùŞyYX˜ŞZûÎz›®jÎûÈ¢&WGW&â²""Ó° ¢66RS ¢òòK‹¾Šx"ş™zîzÙ@¢&WGW&â°¢6öçFVçC¢.yZR"À¢–73¢µĞ¢Ó° ¢FVfVÇC ¢òòXYÎ[©^ûÉ®hÈXÙ^˜ZHNy`¢&WGW&â²$"Ó°¢Ğ¢Ğ¢gVæ7F–öâ&ö&ÆVÔ–D¶W’‡&ö&ÆVÔ–B’°¢&WGW&â&ö&ÆVÔ–BÓÓÒfö–BÇÂ&ö&ÆVÔ–BÓÓÒçVÆÂòçVÆÂ¢7G&–ær‡&ö&ÆVÔ–B“°¢Ğ¢gVæ7F–öâvWE&ö&ÆVÔ'”–B‡&ö&ÆVÔ–B’°¢6öç7B¶W’Ò&ö&ÆVÔ–D¶W’‡&ö&ÆVÔ–B“°¢–b‚¶W’’&WGW&âçVÆÃ°¢&WGW&â&Wòç&ö&ÆV×2ævWB‡&ö&ÆVÔ–B’ÇÂ&Wòç&ö&ÆV×2ævWB†¶W’’ÇÂ&Wòç&ö&ÆV×2ævWB„çVÖ&W"æ—4æâ„çVÖ&W"†¶W’’’ò¶W’¢çVÖ&W"†¶W’’’ÇÂçVÆÃ°¢Ğ¢gVæ7F–öâvWE&ö&ÆVÕ7FGW2‡&ö&ÆVÔ–B’°¢6öç7B¶W’Ò&ö&ÆVÔ–D¶W’‡&ö&ÆVÔ–B“°¢–b‚¶W’’&WGW&âçVÆÃ°¢&WGW&â&Wòç&ö&ÆVÕ7FGW2ævWB‡&ö&ÆVÔ–B’ÇÂ&Wòç&ö&ÆVÕ7FGW2ævWB†¶W’’ÇÂ&Wòç&ö&ÆVÕ7FGW2ævWB„çVÖ&W"æ—4æâ„çVÖ&W"†¶W’’’ò¶W’¢çVÖ&W"†¶W’’’ÇÂçVÆÃ°¢Ğ¢gVæ7F–öâvWE&ö&ÆVÕ&V6÷fW'•7F÷&R‚’°¢6öç7BÆW76öä–BÒ&Wòæ7W'&VçDÆW76öä–C°¢–b‚ÆW76öä–B’&WGW&âçVÆÃ°¢6öç7B¶W’Ò7G&–ær†ÆW76öä–B“°¢–b‚÷&ö&ÆVÕ&V6÷fW'•7F÷&RÇÂ÷&ö&ÆVÕ&V6÷fW'”ÆW76öä–BÓÒ¶W’’°¢÷&ö&ÆVÕ&V6÷fW'”ÆW76öä–BÒ¶W“°¢÷&ö&ÆVÕ&V6÷fW'•7F÷&RÒ7&VFU&ö&ÆVÕ&V6÷fW'•7F÷&R‡°¢7F÷&vS¢7F÷&vRÀ¢ÆW76öä–C¢¶W¢Ò“°¢Ğ¢&WGW&â÷&ö&ÆVÕ&V6÷fW'•7F÷&S°¢Ğ¢gVæ7F–öâ7FGW5†6R‡7FGW2’°¢–b‡7FGW3òç†6RÓÓÒ'VWVVB"ÇÂ7FGW3òç†6RÓÓÒ&ç7vW&–ær"ÇÂ7FGW3òç†6RÓÓÒ&f–ÆVB"’&WGW&â7FGW2ç†6S°¢–b‡7FGW3òæç7vW&–ær’&WGW&â&ç7vW&–ær#°¢–b‡7FGW3òæFöæR’&WGW&â&FöæR#°¢&WGW&â'VWVVB#°¢Ğ¢gVæ7F–öâW'6—7E&ö&ÆVÕ7FGW2‡&ö&ÆVÔ–BÂ7FGW2Â&ö&ÆVÒÒvWE&ö&ÆVÔ'”–B‡&ö&ÆVÔ–B’’°¢6öç7B7F÷&RÒvWE&ö&ÆVÕ&V6÷fW'•7F÷&R‚“°¢–b‚7F÷&RÇÂ7FGW2’&WGW&ã°¢–b‡7FGW2æFöæRÇÂ&ö&ÆVÓòç&W7VÇB’°¢7F÷&Rç&VÖ÷fR‡&ö&ÆVÔ–B“°¢&Ú±î¸Â¸­yêë¢°k¢G§¦*^eturn;
    }
    store.upsert({
      problemId: problemIdKey(problemId),
      presentationId: status.presentationId,
      slideId: status.slideId,
      startTime: status.startTime,
      endTime: status.endTime,
      phase: statusPhase(status),
      autoAnswerTime: status.autoAnswerTime,
      autoAnswerQueued: status.autoAnswerQueued === true,
      attempts: status.attempts,
      lastError: status.lastError,
      done: false
    });
  }
  function statusFromRecoveryRecord(record) {
    const phase = record.phase === "failed" ? "failed" : "queued";
    return {
      presentationId: record.presentationId,
      slideId: record.slideId,
      startTime: record.startTime,
      endTime: record.endTime,
      done: false,
      autoAnswerTime: null,
      answering: false,
      phase: phase,
      autoAnswerQueued: record.autoAnswerQueued !== false,
      attempts: record.attempts || 0,
      lastError: record.lastError || "",
      recoveredFrom: record.phase,
      recoveryForceRetry: false
    };
  }
  function createStatusForProblem(problem, {autoAnswerQueued: autoAnswerQueued = false} = {}) {
    return {
      presentationId: problem?.presentationId || null,
      slideId: problem?.slideId || null,
      startTime: problem?.startTime ?? null,
      endTime: problem?.endTime ?? null,
      done: !!problem?.result,
      autoAnswerTime: null,
      answering: false,
      phase: "queued",
      autoAnswerQueued: autoAnswerQueued,
      attempts: 0,
      lastError: "",
      recoveryForceRetry: false
    };
  }
  function ensureProblemStatus(problem, {autoAnswerQueued: autoAnswerQueued = false} = {}) {
    if (!problem?.problemId) return null;
    const pid = problemIdKey(problem.problemId);
    let status = getProblemStatus(pid);
    if (!status) {
      const recovered = getProblemRecoveryStore()?.get(pid);
      status = recovered ? statusFromRecoveryRecord(recovered) : createStatusForProblem(problem, {
        autoAnswerQueued: autoAnswerQueued
      });
      repo.problemStatus.set(pid, status);
    }
    return status;
  }
  function scheduleRecoveredStatus(status, decision, now = Date.now()) {
    if (!status || !decision?.recover) return;
    status.autoAnswerTime = now;
    status.recoveryForceRetry = !!decision.forceRetry;
    status.autoAnswerQueued = true;
    status.phase = "queued";
  }
  function restorePendingProblemStatuses() {
    const store = getProblemRecoveryStore();
    if (!store) return 0;
    const now = Date.now();
    let restored = 0;
    for (const record of store.list()) {
      const problem = getProblemById(record.problemId);
      if (!problem) continue;
      if (record.done || record.phase === "done" || problem.result) {
        store.remove(record.problemId);
        continue;
      }
      const status = statusFromRecoveryRecord(record);
      const decision = shouldRecoverProblem(record, {
        enabled: ui.config.autoRecoverUnanswered === true,
        recoverExpired: ui.config.autoRecoverExpired === true,
        now: now
      });
      scheduleRecoveredStatus(status, decision, now);
      repo.problemStatus.set(record.problemId, status);
      if (decision.recover) persistProblemStatus(record.problemId, status, problem);
      restored++;
    }
    if (ui.config.autoScanUnanswered === true) for (const encountered of repo.encounteredProblems || []) {
      const problem = getProblemById(encountered.problemId);
      const pid = problemIdKey(encountered.problemId);
      if (!problem || !pid || problem.result || getProblemStatus(pid)) continue;
      const status = createStatusForProblem({
        ...problem,
        presentationId: encountered.presentationId,
        slideId: encountered.slideId || encountered.slide?.id
      }, {
        autoAnswerQueued: true
      });
      const decision = shouldRecoverProblem(status, {
        enabled: true,
        recoverExpired: ui.config.autoRecoverExpired === true,
        now: now
      });
      scheduleRecoveredStatus(status, decision, now);
      repo.problemStatus.set(pid, status);
      if (decision.recover) persistProblemStatus(pid, status, problem);
      restored++;
    }
    if (restored) ui.updateActiveProblems();
    return restored;
  }
  if (typeof window !== "undefined") window.addEventListener("ykt:auto-answer-config-changed", () => {
    restorePendingProblemStatuses();
  });
  function hasActiveAIProfile(aiCfg) {
    const cfg = aiCfg || {};
    const profiles = Array.isArray(cfg.profiles) ? cfg.profiles : [];
    if (profiles.length > 0) {
      const activeId = cfg.activeProfileId;
      const p = profiles.find(x => x.id === activeId) || profiles[0];
      return !!(p && p.apiKey);
    }
    // å…¼å®¹æ—§ç‰ˆ
        return !!cfg.kimiApiKey;
  }
  const autoAnswerRunner = createAutoAnswerRunner({
    typeMap: PROBLEM_TYPE_MAP,
    hasActiveProfile: hasActiveAIProfile,
    getAIConfig: () => ui.config.ai,
    makeDefaultAnswer: makeDefaultAnswer,
    captureSlideImage: captureSlideImage,
    captureProblemForVision: captureProblemForVision,
    formatProblemForVision: formatProblemForVision,
    queryAIVision: queryAIVision,
    parseAIAnswer: parseAIAnswer,
    submitAnswer: submitAnswer,
    onAnswered: (problem, result) => actions.onAnswerProblem(problem.problemId, result),
    onStatusChange: (status, problem) => persistProblemStatus(problem?.problemId, status, problem),
    notify: notifyAutoAnswer,
    toast: (message, timeout) => ui.toast(message, timeout),
    showPopup: showAutoAnswerPopup
  });
  // èåˆæ¨¡å¼è‡ªåŠ¨ç­”é¢˜ï¼›force=true ç”¨äºåˆ·æ–°æ¢å¤å’Œç”¨æˆ·æ‰‹åŠ¨é‡è¯•ã€‚
    async function handleAutoAnswerInternal(problem, options = {}) {
    if (!problem?.problemId) return {
      ok: false,
      reason: "missing-problem"
    };
    const status = options.status || getProblemStatus(problem.problemId);
    if (!status && !options.force) return {
      ok: false,
      reason: "missing-status"
    };
    const ensuredStatus = status || ensureProblemStatus(problem, {
      autoAnswerQueued: false
    });
    return autoAnswerRunner.run(problem, ensuredStatus, {
      force: options.force === true,
      forceRetry: options.forceRetry === true,
      allowResubmit: options.allowResubmit === true,
      source: options.source || (options.force ? "manual" : "auto"),
      lessonId: repo.currentLessonId
    });
  }
  function startAutoAnswerLoop() {
    if (_autoLoopStarted) return;
    _autoLoopStarted = true;
    setInterval(() => {
      const now = Date.now();
      repo.problemStatus.forEach((status, pid) => {
        if (status.autoAnswerTime !== null && now >= status.autoAnswerTime) {
          const problem = getProblemById(pid);
          if (problem && !problem.result) {
            status.autoAnswerTime = null;
            persistProblemStatus(pid, status, problem);
            handleAutoAnswerInternal(problem, {
              status: status,
              force: status.recoveryForceRetry === true,
              forceRetry: status.recoveryForceRetry === true,
              source: status.recoveryForceRetry === true ? "recovery" : "auto"
            });
          }
        }
      });
    }, 500);
  }
  const actions = {
    onFetchTimeline(timeline, options = {}) {
      for (const piece of Array.isArray(timeline) ? timeline : []) if (piece?.type === "problem") this.onUnlockProblem(piece, {
        ...options,
        source: "timeline"
      });
    },
    onPresentationLoaded(id, data) {
      repo.setPresentation(id, data);
      const pres = repo.presentations.get(id);
      for (const slide of pres?.slides || []) {
        repo.upsertSlide(slide);
        if (slide.problem) {
          repo.upsertProblem(slide.problem);
          repo.pushEncounteredProblem(slide.problem, slide, id);
        }
      }
      restorePendingProblemStatuses();
      ui.updatePresentationList();
    },
    onUnlockProblem(data, {notificationOnly: notificationOnly = false, source: source = "live"} = {}) {
      const isLiveUnlock = isLiveProblemSource(source);
      const payload = data && typeof data === "object" ? data : {};
      const problemId = firstValue(payload.prob, payload.problemId, payload.problemid, payload.problem?.problemId, payload.problem?.id, payload.id);
      const slideId = firstValue(payload.sid, payload.slideId, payload.slide?.id);
      const problem = getProblemById(problemId);
      const slide = repo.slides.get(slideId) || repo.slides.get(String(slideId));
      if (!problem || !slide) {
        if (notificationOnly && isLiveUnlock) return notifyProblemStart(payload, problem, slide);
        console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][ERR][onUnlockProblem] é¢˜ç›®æˆ–å¹»ç¯ç‰‡ä¸å­˜åœ¨");
        return false;
      }
      console.log(`[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][onUnlockProblem] ${isLiveUnlock ? "é¢˜ç›®è§£é”" : "å†å²æ—¶é—´çº¿é¢˜ç›®çŠ¶æ€æ¢å¤"}`);
      console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][onUnlockProblem] é¢˜ç›®ID:", problemId);
      console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][onUnlockProblem] å¹»ç¯ç‰‡ID:", slideId);
      console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][DBG][onUnlockProblem] è¯¾ä»¶ID:", payload.pres);
      const pid = problemIdKey(problemId);
      const recoveryStore = getProblemRecoveryStore();
      const recovered = recoveryStore?.get(pid);
      const previous = getProblemStatus(pid);
      const isFirstUnlock = !previous && !recovered;
      const status = previous || (recovered ? statusFromRecoveryRecord(recovered) : createStatusForProblem(problem, {
        autoAnswerQueued: isLiveUnlock && !!ui.config.autoAnswer
      }));
      status.presentationId = payload.pres ?? status.presentationId;
      status.slideId = slideId ?? status.slideId;
      status.startTime = payload.dt ?? status.startTime;
      status.endTime = getProblemEndTime(payload.dt, payload.limit) ?? status.endTime ?? null;
      status.done = !!problem.result;
      status.answering = !!status.answering;
      status.phase = statusPhase(status);
      status.autoAnswerTime = status.autoAnswerTime ?? null;
      status.autoAnswerQueued = isFirstUnlock ? isLiveUnlock && !!ui.config.autoAnswer : status.autoAnswerQueued !== false;
      // åˆ·æ–°æ¢å¤çš„è¿‡æœŸä»»åŠ¡å¯èƒ½å·²ç»æ’é˜Ÿç­‰å¾… /retryï¼›é‡å¤è§£é”äº‹ä»¶ä¸èƒ½æ¸…æ‰è¿™ä¸ªæ ‡è®°ã€‚
            status.recoveryForceRetry = status.recoveryForceRetry === true;
      repo.problemStatus.set(pid, status);
      if (isLiveUnlock) persistProblemStatus(pid, status, problem);
      if (Number.isFinite(status.endTime) && Date.now() >= status.endTime || problem.result) {
        console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][WARN][onUnlockProblem] é¢˜ç›®å·²è¿‡æœŸæˆ–å·²ä½œç­”ï¼Œè·³è¿‡");
        if (problem.result) recoveryStore?.remove(pid);
        return;
      }
      // fetchtimeline replays historical slides when navigating/reloading.  It
      // may hydrate status for the active-problem UI, but it must not look like a
      // newly published question or queue an automatic answer.
            if (!isLiveUnlock) {
        ui.updateActiveProblems();
        return false;
      }
      const notified = notifyProblemStart(payload, problem, slide);
      if (notificationOnly) return notified;
      if (ui.config.autoAnswer && status.autoAnswerQueued && !status.answering && status.phase !== "failed" && status.autoAnswerTime === null) {
        const delay = ui.config.autoAnswerDelay + randInt(0, ui.config.autoAnswerRandomDelay);
        status.autoAnswerTime = Date.now() + delay;
        console.log(`[é›¨è¯¾å ‚åŠ©æ‰‹][INFO][onUnlockProblem] å°†åœ¨ ${Math.floor(delay / 1e3)} ç§’åè‡ªåŠ¨ä½œç­”`);
        ui.toast(`å°†åœ¨ ${Math.floor(delay / 1e3)} ç§’åä½¿ç”¨èåˆæ¨¡å¼è‡ªåŠ¨ä½œç­”`, 3e3);
        notifyAutoAnswer("auto-answer-scheduled", problem, `å°†åœ¨çº¦ ${Math.floor(delay / 1e3)} ç§’åå¼€å§‹è‡ªåŠ¨ä½œç­”ã€‚`);
        persistProblemStatus(pid, status, problem);
      }
      ui.updateActiveProblems();
      return notified;
    },
    onPublishEvent(event) {
      const notified = publishReminder.handle(event, ui.config);
      if (notified) console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][INFO][Publish] å·²æé†’å‘å¸ƒäº‹ä»¶:", event.category, event.dedupeKey);
      return notified;
    },
    onDanmu(data, options = {}) {
      const pageLessonId = currentPageLessonId();
      const messageLessonId = options.lessonId ? String(options.lessonId) : null;
      if (messageLessonId && pageLessonId && messageLessonId !== pageLessonId) return {
        handled: true,
        triggered: false,
        reason: "non-current-lesson",
        lessonId: messageLessonId
      };
      if (messageLessonId && !pageLessonId) return {
        handled: true,
        triggered: false,
        reason: "non-current-lesson",
        lessonId: messageLessonId
      };
      const lessonId = messageLessonId || pageLessonId || repo.currentLessonId || "__current__";
      const result = getDanmuFollowController(lessonId).handle(data, options);
      if (result.triggered) if (result.sendResult?.sent) console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][INFO][DanmuFollow] å·²è‡ªåŠ¨è·Ÿå‘:", result.text, {
        count: result.count,
        sentCount: result.sentCount
      }); else console.warn("[é›¨è¯¾å ‚åŠ©æ‰‹][WARN][DanmuFollow] è¾¾åˆ°è·Ÿå‘æ¡ä»¶ï¼Œä½†å‘é€å¤±è´¥:", result.text, result.sendResult);
      return result;
    },
    onLessonFinished() {
      return ui.notifyClassroomEvent({
        kind: "lesson-finished",
        dedupeKey: `lesson-finished:${repo.currentLessonId || Date.now()}`,
        title: "ä¸‹è¯¾æç¤º",
        detail: "å½“å‰è¯¾ç¨‹å·²ç»“æŸã€‚"
      });
    },
    onAnswerProblem(problemId, result) {
      const p = getProblemById(problemId);
      if (p) {
        p.result = result;
        const i = repo.encounteredProblems.findIndex(e => String(e.problemId) === String(problemId));
        if (i !== -1) repo.encounteredProblems[i].result = result;
        const status = getProblemStatus(problemId);
        if (status) {
          status.done = true;
          status.answering = false;
          status.phase = "done";
          status.autoAnswerTime = null;
        }
        getProblemRecoveryStore()?.remove(problemId);
        ui.updateProblemList();
      }
    },
    async handleAutoAnswer(problem, options = {}) {
      const resolved = getProblemById(problem?.problemId) || problem;
      if (!resolved?.problemId) return {
        ok: false,
        reason: "missing-problem"
      };
      const status = options.status || ensureProblemStatus(resolved, {
        autoAnswerQueued: options.force !== true
      });
      return handleAutoAnswerInternal(resolved, {
        ...options,
        status: status
      });
    },
    async forceAIAnswer(problemId, options = {}) {
      const problem = getProblemById(problemId);
      if (!problem) return {
        ok: false,
        reason: "missing-problem"
      };
      const status = ensureProblemStatus(problem, {
        autoAnswerQueued: false
      });
      if (!status) return {
        ok: false,
        reason: "missing-status"
      };
      return handleAutoAnswerInternal(problem, {
        ...options,
        status: status,
        force: true,
        source: "manual"
      });
    },
    tickAutoAnswer() {
      const now = Date.now();
      for (const [pid, status] of repo.problemStatus) if (status.autoAnswerTime !== null && now >= status.autoAnswerTime) {
        const p = getProblemById(pid);
        if (p) {
          status.autoAnswerTime = null;
          persistProblemStatus(pid, status, p);
          this.handleAutoAnswer(p, {
            status: status,
            force: status.recoveryForceRetry === true,
            forceRetry: status.recoveryForceRetry === true,
            source: status.recoveryForceRetry === true ? "recovery" : "auto"
          });
        }
      }
    },
    async submit(problem, content) {
      const result = this.parseManual(problem.problemType, content);
      await submitAnswer(problem, result, {
        lessonId: repo.currentLessonId,
        autoGate: false
      });
      this.onAnswerProblem(problem.problemId, result);
    },
    async submitParsedAnswer(problem, result, {forceRetry: forceRetry = false} = {}) {
      const resolved = getProblemById(problem?.problemId) || problem;
      if (!resolved?.problemId) return {
        ok: false,
        reason: "missing-problem"
      };
      const status = ensureProblemStatus(resolved, {
        autoAnswerQueued: false
      });
      if (!status) return {
        ok: false,
        reason: "missing-status"
      };
      persistProblemStatus(resolved.problemId, status, resolved);
      const submission = await submitAnswer(resolved, result, buildAnswerSubmitOptions(status, {
        lessonId: repo.currentLessonId,
        forceRetry: forceRetry
      }));
      this.onAnswerProblem(resolved.problemId, result);
      return {
        ok: true,
        ...submission
      };
    },
    parseManual(problemType, content) {
      switch (problemType) {
       case 1:
       case 2:
       case 3:
        return content.split("").sort();

       case 4:
        return content.split("\n").filter(Boolean);

       case 5:
        return {
          content: content,
          pics: []
        };

       default:
        return null;
      }
    },
    navigateTo(presId, slideId) {
      repo.currentPresentationId = presId;
      repo.currentSlideId = slideId;
      ui.updateSlideView();
      ui.showPresentationPanel(true);
    },
    launchLessonHelper() {
      const path = window.location.pathname;
      const m = path.match(/\/lesson\/fullscreen\/v3\/([^/]+)/);
      const nextLessonId = m ? m[1] : null;
      if (repo.currentLessonId !== nextLessonId) {
        const previousKey = String(repo.currentLessonId || "__current__");
        danmuFollowControllers.get(previousKey)?.reset();
        danmuFollowControllers.delete(previousKey);
      }
      repo.currentLessonId = nextLessonId;
      if (repo.currentLessonId) console.log(`[é›¨è¯¾å ‚åŠ©æ‰‹][DBG] æ£€æµ‹åˆ°è¯¾å ‚é¡µé¢ lessonId: ${repo.currentLessonId}`);
      if (typeof window.GM_getTab === "function" && typeof window.GM_saveTab === "function" && repo.currentLessonId) window.GM_getTab(tab => {
        tab.type = "lesson";
        tab.lessonId = repo.currentLessonId;
        window.GM_saveTab(tab);
      });
      repo.loadStoredPresentations();
      restorePendingProblemStatuses();
      this.maybeStartAutoJoin();
      this.installRouterRearm();
      void screenWakeLock.setEnabled(ui.config.keepScreenAwake);
    },
    startAutoAnswerLoop() {
      return startAutoAnswerLoop();
    },
    restorePendingProblemStatuses() {
      return restorePendingProblemStatuses();
    },
    // è‡ªåŠ¨è¿›å…¥è¯¾å ‚
    startAutoJoinLoop() {
      if (_autoJoinStarted) return;
      _autoJoinStarted = true;
      repo.autoJoinRunning = true;
      const loop = async () => {
        if (!repo.autoJoinRunning) return;
        try {
          const list = await getOnLesson();
          // æœŸæœ›ç»“æ„ï¼šæ¯é¡¹è‡³å°‘å« { lessonId, status }ï¼Œå…¶ä¸­ status==1 è¡¨ç¤ºæ­£åœ¨ä¸Šè¯¾
                    for (const it of list) {
            const lessonId = it.lessonId || it.lesson_id || it.id;
            const status = it.status;
            if (!lessonId || status !== 1) continue;
            if (repo.isLessonConnected(lessonId)) continue;
 // å·²æœ‰è¿æ¥
                        console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][INFO][AutoJoin] æ£€æµ‹åˆ°æ­£åœ¨ä¸Šè¯¾çš„è¯¾å ‚ï¼Œå‡†å¤‡è¿›å…¥:", lessonId);
            try {
              const {token: token, setAuth: setAuth} = await checkinClass(lessonId);
              if (!token) {
                console.warn("[é›¨è¯¾å ‚åŠ©æ‰‹][WARN][AutoJoin] æœªè·å–åˆ° lessonTokenï¼Œè·³è¿‡:", lessonId);
                continue;
              }
              connectOrAttachLessonWS({
                lessonId: lessonId,
                auth: token
              });
              // æ ‡è®°è¯¥è¯¾å ‚ä¸ºâ€œè‡ªåŠ¨è¿›å…¥â€
                            repo.markLessonAutoJoined(lessonId, true);
              if (ui.config.autoAnswerOnAutoJoin) repo.forceAutoAnswerLessons.add(lessonId);
            } catch (e) {
              console.error("[é›¨è¯¾å ‚åŠ©æ‰‹][ERR][AutoJoin] è¿›å…¥è¯¾å ‚å¤±è´¥:", lessonId, e);
            }
          }
        } catch (e) {
          console.error("[é›¨è¯¾å ‚åŠ©æ‰‹][ERR][AutoJoin] æ‹‰å–æ­£åœ¨ä¸Šè¯¾å¤±è´¥:", e);
        } finally {
          setTimeout(loop, 5e3);
        }
      };
      loop();
    },
    stopAutoJoinLoop() {
      repo.autoJoinRunning = false;
    },
    /** ç»Ÿä¸€åˆ¤æ–­å¹¶å¯åŠ¨è‡ªåŠ¨åŠ å…¥é“¾è·¯ï¼ˆå¯å¤šæ¬¡è°ƒç”¨ï¼Œå†…éƒ¨é˜²é‡ï¼‰ */
    maybeStartAutoJoin() {
      if (!ui.config.autoJoinEnabled) return;
      this.startAutoJoinLoop();
      this.startAutoClickOnOnLessonBar();
    },
    /** å‰ç«¯è·¯ç”±å˜åŒ–æ—¶ï¼Œé‡æ–°æ£€æŸ¥å¹¶æŒ‚è½½è‡ªåŠ¨åŠ å…¥ */
    installRouterRearm() {
      if (_routerHooked) return;
      _routerHooked = true;
      const uw = gm && gm.uw ? gm.uw : window.unsafeWindow || window;
      const rearm = () => {
        // é‡ç½®ä¸€æ¬¡â€œonlesson ç‚¹å‡»å®ˆå«â€çš„è¿›è¡Œä¸­æ ‡è®°ï¼Œé¿å…è¢«å¡ä½
        _autoOnLessonClickInProgress = false;
        // æ¯æ¬¡è·¯ç”±å˜æ›´éƒ½å°è¯•å¯åŠ¨ï¼ˆå†…éƒ¨æœ‰é˜²é‡ï¼Œæ‰€ä»¥å®‰å…¨ï¼‰
                this.maybeStartAutoJoin();
        void screenWakeLock.sync();
      };
      const wrap = (obj, key) => {
        const orig = obj[key];
        obj[key] = function(...args) {
          const ret = orig.apply(this, args);
          try {
            rearm();
          } catch {}
          return ret;
        };
      };
      wrap(uw.history, "pushState");
      wrap(uw.history, "replaceState");
      uw.addEventListener("popstate", rearm);
      uw.addEventListener("visibilitychange", () => {
        if (!document.hidden) rearm();
      });
    },
    // ===== è‡ªåŠ¨ç‚¹å‡»â€œæ­£åœ¨ä¸Šè¯¾â€æ¡ï¼šæ— éœ€é¢„å…ˆæ‹¿ lesson_idï¼Œå¤ç”¨å®˜æ–¹è·¯ç”±é€»è¾‘ =====
    startAutoClickOnOnLessonBar() {
      if (_autoOnLessonClickStarted) return;
      _autoOnLessonClickStarted = true;
      // ä»…åœ¨éè¯¾å ‚é¡µï¼ˆé¦–é¡µ/è¯¾è¡¨é¡µç­‰ï¼‰ç”Ÿæ•ˆ
            if (/\/lesson\//.test(location.pathname)) return;
      const uw = gm && gm.uw ? gm.uw : window.unsafeWindow || window;
      async function tryApiJumpFirst() {
        if (_autoOnLessonClickInProgress) return false;
        _autoOnLessonClickInProgress = true;
        try {
          const list = await getOnLesson();
 // â† å¼ºåŒ–åçš„ç‰ˆæœ¬
                    const arr = Array.isArray(list) ? list : [];
          // A) ä¸¥æ ¼ï¼šstatus===1
                    let on = arr.find(x => x?.status === 1 && (x.lessonId || x.lesson_id || x.id));
          // B) å›é€€ï¼šæ²¡æœ‰ä¸¥æ ¼åŒ¹é…ï¼Œä½†æœ‰ lessonId å°±ç”¨ç¬¬ä¸€æ¡
                    if (!on) {
            const withId = arr.find(x => x && (x.lessonId || x.lesson_id || x.id));
            if (withId) {
              console.warn("[é›¨è¯¾å ‚åŠ©æ‰‹][WARN][AutoJoin][API] æ²¡æœ‰ status===1ï¼Œä½†å­˜åœ¨ lessonIdï¼Œä½¿ç”¨å›é€€é¡¹ï¼š", {
                status: withId.status,
                keys: Object.keys(withId || {}),
                sample: withId
              });
              on = withId;
            }
          }
          if (!on) {
            // è¯¦ç»†æ—¥å¿—ï¼šç¯å¢ƒã€ä¸»æœºã€åˆ—è¡¨é•¿åº¦ä¸å‰ 3 é¡¹
            try {
              console.warn("[é›¨è¯¾å ‚åŠ©æ‰‹][ERR][AutoJoin][API] EMPTY on-lesson list", {
                host: location.hostname,
                path: location.pathname,
                length: Array.isArray(list) ? list.length : -1,
                sample: Array.isArray(list) ? list.slice(0, 3) : list
              });
            } catch {}
            _autoOnLessonClickInProgress = false;
            return false;
          }
          const lessonId = on.lessonId || on.lesson_id || on.id;
          let target = null;
          if (lessonId) target = `/lesson/fullscreen/v3/${lessonId}`; else target = `/v2/web/lesson/${lessonId}`;
          if (location.pathname === target) {
            _autoOnLessonClickInProgress = false;
            return true;
          }
          // ä¸ºäº†å°‘æ—¥å¿—ï¼Œå…ˆ replace å† assignï¼ˆç«™å†…æœ‰æ—¶ä¹Ÿä¼š push /indexï¼‰
                    history.replaceState(null, "", location.href);
          location.assign(target);
          return true;
        } catch (e) {
          console.warn("[é›¨è¯¾å ‚åŠ©æ‰‹][ERR][AutoJoin][API] è·³è½¬å¤±è´¥ï¼š", e, {
            host: location.hostname,
            path: location.pathname
          });
          _autoOnLessonClickInProgress = false;
          return false;
        }
      }
      function attachGuardAndTrigger(root = uw.document) {
        const bar = root.querySelector(".onlesson .jump_lesson__bar");
        if (!bar || bar.__ykt_guard_bound__) return false;
        if (_autoOnLessonClickInProgress) return false;
        bar.__ykt_guard_bound__ = true;
        console.log("[é›¨è¯¾å ‚åŠ©æ‰‹][INFO][AutoJoin][DOM] å‘ç° onlesson æ¡ï¼Œæ¥ç®¡ç‚¹å‡»ï¼ˆæ•è·é˜¶æ®µï¼‰");
        const handler = async ev => {
          ev.preventDefault();
          ev.stopImmediatePropagation?.();
          ev.stopPropagation();
          if (_autoOnLessonClickInProgress) return;
          // å»¶æ—¶é˜¶æ¢¯ï¼šè€ƒè™‘ WS åˆšæ¨å®Œ banner ä½†æ¥å£è¿˜æ²¡æ›´æ–°
                    const delays = [ 0, 250, 600, 1200, 2e3, 3e3 ];
          for (const d of delays) {
            if (d) await new Promise(r => setTimeout(r, d));
            if (await tryApiJumpFirst()) return;
          }
          console.warn("[é›¨è¯¾å ‚åŠ©æ‰‹][WARN][AutoJoin][DOM] on-lesson æ¥å£ä»ä¸ºç©ºï¼Œæ”¾å¼ƒæœ¬æ¬¡ç‚¹å‡»");
          try {
            console.group("%c[AutoJoin][DOM] on-lesson ä»ä¸ºç©ºï¼Œæ”¾å¼ƒæœ¬æ¬¡ç‚¹å‡»", "color:#f60");
            console.log("env:", {
              host: location.hostname,
              path: location.pathname,
              href: location.href
            });
            console.log("retryDelays(ms):", delays);
            console.log("hint:", "å¯èƒ½æ˜¯åŸŸ/è·¯å¾„ä¸åŒ¹é…ã€ä¼šè¯æœªå¸¦ä¸Šã€æˆ– WS/æ¥å£ä¸åŒæ­¥å¯¼è‡´ã€‚è¯·å±•å¼€ä¸Šæ–¹ [getOnLesson] æŠ˜å æ—¥å¿—æŸ¥çœ‹æ¯ä¸ªå€™é€‰ URL çš„çŠ¶æ€ä¸å“åº”ç‰‡æ®µã€‚");
            console.groupEnd();
          } catch {}
        };
        bar.addEventListener("click", handler, {
          capture: true
        });
        // è§¦å‘ä¸€æ¬¡æˆ‘ä»¬è‡ªå·±çš„ clickï¼ˆä¼˜å…ˆè¿›å…¥æ•è·å¤„ç†å™¨ï¼‰
                try {
          const W = bar.ownerDocument?.defaultView || uw;
          const ClickEvt = W.MouseEvent || uw.MouseEvent;
          bar.dispatchEvent(new ClickEvt("click", {
            bubbles: true,
            cancelable: true,
            view: W
          }));
        } catch (e) {
          // å…œåº•ï¼šéƒ¨åˆ†ç¯å¢ƒå¯¹ MouseEvent æ„é€ å™¨æœ‰é™åˆ¶
          try {
            bar.click();
          } catch (_) {}
        }
        return true;
      }
      // A) é¦–é€‰ï¼šç›´æ¥ API è·³è½¬ï¼ˆè‹¥æ­¤æ—¶å°±èƒ½æ‹¿åˆ° on-lessonï¼Œå°±ä¸å¿…ç­‰ DOMï¼‰
            tryApiJumpFirst().then(ok => {
        if (ok) return;
        // B) DOM æ¸²æŸ“m«ëŒ+Š×®º+º$zzb¥îYîhê^zêx+X{°¢–b†GF6„wV&DæEG&–vvW"‚’’&WGW&ã°¢6öç7BÖòÒæWrWrä×WFF–öäö'6W'fW"‚‚’Óâ°¢–b†GF6„wV&DæEG&–vvW"‚’’°¢ÖòæF—66öææV7B‚“°¢&WGW&ã°¢Ğ¢Ò“°¢Öòæö'6W'fR‡WræFö7VÖVçBæFö7VÖVçDVÆVÖVçBÂ°¢6†–ÆDÆ—7C¢G'VRÀ¢7V'G&VS¢G'VP¢Ò“°¢òò6WEF–ÖV÷WB‚‚’ÓâÖòæF—66öææV7B‚’Â“°¢Ò“°¢Ğ¢Ó°¢òò7&2ö6÷&R÷&VÇF–ÖRÖF—7F6‚æ§0¢ò¢ ¢¢6öçfW'G2&r&VÇF–ÖRg&ÖR–çFòâ7F–öâ6ÆÂv—F†÷WB6÷WÆ–ærF†P¢¢&÷Fö6öÂ'6W"FòF†R7F–öâÆ–W"âF†R7W'&VçBW6W'67&—B'Vç2öæÇ’F†P¢¢FW6·F÷'VçF–ÖRÂv†–ÆRF†—2÷F–öâ&VÖ–ç2f–Æ&ÆRf÷"&÷Fö6öÂFW7G2à¢¢ògVæ7F–öâF—7F6…&VÇF–ÖTÖW76vR†ÖW76vRÂ¶vWE'VçF–ÖTÖöFS¢vWE'VçF–ÖTÖöFRÒ‚’Óâ&FW6·F÷"ÂÆW76öä–C¢ÆW76öä–BÒçVÆÂÂ†æFÆW'3¢†æFÆW'2Ò·×ÒÒ·Ò’°¢6öç7B&VÇF–ÖRÒvWE&VÇF–ÖTWfVçB†ÖW76vR“°¢6öç7Bæ÷F–f–6F–öäöæÇ’ÒvWE'VçF–ÖTÖöFR‚’ÓÓÒ&Öö&–ÆR×&VÖ–æFW"#°¢6öç7B÷F–öç2Ò°¢æ÷F–f–6F–öäöæÇ“¢æ÷F–f–6F–öäöæÇ’À¢6÷W&6S¢&VÇF–ÖSòæ¶–æBÓÓÒ'F–ÖVÆ–æR"ò'F–ÖVÆ–æR"¢&Æ—fR ¢Ó°¢–b†ÆW76öä–BÓÒfö–BbbÆW76öä–BÓÒçVÆÂbb7G&–ær†ÆW76öä–B’ÓÒ""’÷F–öç2æÆW76öä–BÒ7G&–ær†ÆW76öä–B“°¢ÆWB†æFÆVBÒG'VS°¢7v—F6‚‡&VÇF–ÖSòæ¶–æB’°¢66R'F–ÖVÆ–æR# ¢†æFÆW'2æöäfWF6…F–ÖVÆ–æSòâ‡&VÇF–ÖRçF–ÖVÆ–æRÂ÷F–öç2“°¢'&V³° ¢66R'VæÆö6·&ö&ÆVÒ# ¢†æFÆW'2æöåVæÆö6µ&ö&ÆVÓòâ‡&VÇF–ÖRç&ö&ÆVÒÂ÷F–öç2“°¢'&V³° ¢66R&Fæ×R# ¢†æFÆW'2æöäFæ×Sòâ‡&VÇF–ÖRæÖW76vRÂ÷F–öç2“°¢'&V³° ¢66R'V&Æ—6‚# ¢†æFÆW'2æöåV&Æ—6„WfVçCòâ‡&VÇF–ÖRæWfVçBÂ÷F–öç2“°¢'&V³° ¢66R&ÆW76öæf–æ—6†VB# ¢†æFÆW'2æöäÆW76öäf–æ—6†VCòâ†÷F–öç2“°¢'&V³° ¢FVfVÇC ¢†æFÆVBÒfÇ6S°¢Ğ¢&WGW&â°¢&VÇF–ÖS¢&VÇF–ÖRÀ¢æ÷F–f–6F–öäöæÇ“¢æ÷F–f–6F–öäöæÇ’À¢†æFÆVC¢†æFÆV@¢Ó°¢Ğ¢òò7&2öæWB÷w2Ö–çFW&6WF÷"æ§0¢gVæ7F–öâÆW76öä–Dg&öÕF‚‡F†æÖRÒ""’°¢6öç7BÖF6‚Ò7G&–ær‡F†æÖR’æÖF6‚‚õÂöÆW76öåÂögVÆÇ67&VVåÂ÷c5Âò…µâõÒ²’ò“°¢&WGW&âÖF6‚òÖF6…³Ò¢çVÆÃ°¢Ğ¢gVæ7F–öâvWE6ö6¶WDÆW76öä–B‡w2’°¢–b‡w3òåõ÷–·DÆW76öä–B’&WGW&â7G&–ær‡w2åõ÷–·DÆW76öä–B“°¢&WGW&âÆW76öä–Dg&öÕF‚‚†vÒçWrÇÂv–æF÷r“òæÆö6F–öãòçF†æÖRÇÂÆö6F–öâçF†æÖR“°¢Ğ¢gVæ7F–öâ–ç7FÆÅu4–çFW&6WF÷"‡¶vWE'VçF–ÖTÖöFS¢vWE'VçF–ÖTÖöFRÒ‚’Óâ&FW6·F÷'ÒÒ·Ò’°¢òòxêşZ(>ŠønXŠ¾ûÈj~XxbşˆÛ~Z‚ş™[şkòşiÊ®yú^ûÈûÈÎK‹¾ŠhyJK¨îiz^[ù~Y(ÎYî{ºŞhÈ™È˜.˜XĞ¢gVæ7F–öâFWFV7DVçf—&öæÖVçDæDFD’‚’°¢6öç7B†÷7FæÖRÒÆö6F–öâæ†÷7FæÖS°¢ÆWBVçeG—RÒ'Væ¶æ÷vâ#°¢–b††÷7FæÖRÓÓÒ'wwrç—V¶WFæræ6â"’°¢VçeG—RÒ'7FæF&B#°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒj8kX¾X‹j~Xxn™ºŠûîZ.xêşZ(2"“°¢ÒVÇ6R–b††÷7FæÖRÓÓÒ'&òç—V¶WFæræ6â"’°¢VçeG—RÒ'&ò#°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒj8kX¾X‹ˆÛ~Z™ºŠûîZ.xêşZ(2"“°¢ÒVÇ6R–b††÷7FæÖRÓÓÒ&6†æv¦–ærç—V¶WFæræ6â"’°¢VçeG—RÒ&6†æv¦–ær#°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒj8kX¾X‹™[şkş™ºŠûîZ.xêşZ(2"“°¢ÒVÇ6R6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒiÊ®yú^xêşZ(3¢"Â†÷7FæÖR“°¢&WGW&âVçeG—S°¢Ğ¢6Æ72×•vV%6ö6¶WBW‡FVæG2vV%6ö6¶WB°¢7FF–2†æFÆW'3ÕµÓ°¢7FF–2FD†æFÆW"†‚’°¢F†—2æ†æFÆW'2çW6‚†‚“°¢Ğ¢6öç7G'V7F÷"‡W&ÂÂ&÷Fö6öÇ2’°¢7WW"‡W&ÂÂ&÷Fö6öÇ2“°¢6öç7B'6VBÒæWrU$Â‡W&ÂÂÆö6F–öâæ‡&Vb“°¢f÷"†6öç7B‚öbF†—2æ6öç7G'V7F÷"æ†æFÆW'2’‚‡F†—2Â'6VB“°¢Ğ¢–çFW&6WB†6"’°¢6öç7B&rÒF†—2ç6VæC°¢F†—2ç6VæBÒFFÓâ°¢G'’°¢6"„¥4ôâç'6R†FF’“°¢Ò6F6‚·Ğ¢&WGW&â&ræ6ÆÂ‡F†—2ÂFF“°¢Ó°¢Ğ¢Æ—7FVâ†6"’°¢F†—2æFDWfVçDÆ—7FVæW"‚&ÖW76vR"ÂRÓâ°¢G'’°¢6"„¥4ôâç'6R†RæFF’“°¢Ò6F6‚·Ğ¢Ò“°¢Ğ¢Ğ¢×•vV%6ö6¶WBæFD†æFÆW"‚‡w2ÂW&Â’Óâ°¢6öç7BVçeG—RÒFWFV7DVçf—&öæÖVçDæDFD’‚“°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒhºnhŠ¥vV%6ö6¶WN˜	®KúÒxêşZ(3¢"ÂVçeG—R“°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒvV%6ö6¶WN‹ùîhê^[	ŞŠùS¢"ÂW&Âæ‡&Vb“°¢òòi»NZëŞiÛîy¨N‹zş[èNXË˜XĞ¢6öç7Bw5F‚ÒW&ÂçF†æÖRÇÂ"#°¢6öç7B—5&–ä6Æ77&ööÕu2Òw5F‚ÓÓÒ"÷w6ò"ÇÂw5F‚æ–æ6ÇVFW2‚"÷w2"’ÇÂw5F‚æ–æ6ÇVFW2‚"÷vV'6ö6¶WB"’ÇÂW&Âæ‡&Vbæ–æ6ÇVFW2‚'vV'6ö6¶WB"“°¢–b‚—5&–ä6Æ77&ööÕu2’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´U%%Ò™Ùî™ºŠûîZ%vV%6ö6¶WC¢"Âw5F‚“°¢&WGW&ã°¢Ğ¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒj8kX¾X‹™ºŠûîZ%vV%6ö6¶WN‹ùîhêS¢"Âw5F‚“°¢òòXù˜Kê~hºnhŠ®ûÈXúşyJK¨î‹>Šù^ûÈ¢w2æ–çFW&6WB†ÖW76vRÓâ°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒvV%6ö6¶WNXù˜¢"ÂÖW76vR“°¢Ò“°¢òòhê^iKnKê~{¹şKˆXˆnXù¢w2æÆ—7FVâ†ÖW76vRÓâ°¢G'’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒvV%6ö6¶WNhê^iKc¢"ÂÖW76vR“°¢6öç7BF—7F6†VBÒF—7F6…&VÇF–ÖTÖW76vR†ÖW76vRÂ°¢vWE'VçF–ÖTÖöFS¢vWE'VçF–ÖTÖöFRÀ¢ÆW76öä–C¢vWE6ö6¶WDÆW76öä–B‡w2’À¢†æFÆW'3¢°¢öäfWF6…F–ÖVÆ–æR‡F–ÖVÆ–æRÂ÷F–öç2’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒiKnX‹i{n™{N{«ó¢"ÂÖW76vRçF–ÖVÆ–æR“°¢7F–öç2æöäfWF6…F–ÖVÆ–æR‡F–ÖVÆ–æRÂ÷F–öç2“°¢ÒÀ¢öåVæÆö6µ&ö&ÆVÒ‡&ö&ÆVÒÂ÷F–öç2’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒiKnX‹Šz>™H™zîš)ƒ¢"ÂÖW76vRç&ö&ÆVÒ“°¢7F–öç2æöåVæÆö6µ&ö&ÆVÒ‡&ö&ÆVÒÂ÷F–öç2“°¢ÒÀ¢öäFæ×R†Fæ×RÂ÷F–öç2’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒiKnX‹[Ë[™S¢"ÂFæ×SòæFæ×R“°¢7F–öç2æöäFæ×R†Fæ×RÂ÷F–öç2“°¢ÒÀ¢öåV&Æ—6„WfVçB†WfVçBÂ÷F–öç2’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒiKnX‹ŠûîZ.Xù[ˆ3¢"ÂWfVçB“°¢7F–öç2æöåV&Æ—6„WfVçB†WfVçBÂ÷F–öç2“°¢ÒÀ¢öäÆW76öäf–æ—6†VB†÷F–öç2’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒŠûîzˆ¾{¹>iÙò"“°¢7F–öç2æöäÆW76öäf–æ—6†VB†÷F–öç2“°¢Ğ¢Ğ¢Ò“°¢–b‚F—7F6†VBæ†æFÆVB’6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕµt$åÒiÊ®yúUvV%6ö6¶WNi8ŞKÙÃ¢"ÂÖW76vRæ÷ÂÖW76vR“°¢òòy¹Y
ÎYîzºşKÊ˜	.y¨GW&À¢6öç7BW&ÂÒgVæ7F–öâf–æEW&Â†ö&¢’°¢–b‚ö&¢ÇÂG—Vöbö&¢ÓÒ&ö&¦V7B"’&WGW&âçVÆÃ°¢–b‡G—Vöbö&¢çW&ÂÓÓÒ'7G&–ær"’&WGW&âö&¢çW&Ã°¢–b„'&’æ—4'&’†ö&¢’’f÷"†6öç7B—Böbö&¢’°¢6öç7BRÒf–æEW&Â†—B“°¢–b‡R’&WGW&âS°¢ÒVÇ6Rf÷"†6öç7B²–âö&¢’°¢6öç7BbÒö&¥¶µÓ°¢–b‡bbbG—VöbbÓÓÒ&ö&¦V7B"’°¢6öç7BRÒf–æEW&Â‡b“°¢–b‡R’&WGW&âS°¢Ğ¢Ğ¢&WGW&âçVÆÃ°¢Ò†ÖW76vR“°¢–b‡W&Â’°¢v–æF÷ræF—7F6„WfVçB†æWr7W7FöÔWfVçB‚'–·C§W&ÂÖ6†ævR"Â°¢FWF–Ã¢°¢W&Ã¢W&ÂÀ¢&s¢ÖW76vP¢Ğ¢Ò’“°¢òòZh.™ÈhÈK˜^XÉnX‹&WşûÈÎŠû~XùnkhKˆ¾KˆŠÎk:˜x®ûÈzîKùŞ[{.YÊ‚&WòZé®K˜Šú^ZÙ~jë^ûÈ¢&Wòæ7W'&VçE6VÆV7FVEW&ÂÒW&Ã°¢6öç6öÆRæFV'Vr‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒ[Ù>X˜Ş˜hº’U$Ã¢"ÂW&Â“°¢Ğ¢Ò6F6‚†R’°¢6öç6öÆRæFV'Vr‚%¾™ºŠûîZ.Xªh˜µÕ´U%%ÒŠz>iévV%6ö6¶WNkhhşZK‹JR"ÂRÂÖW76vR“°¢Ğ¢Ò“°¢Ò“°¢vÒçWråvV%6ö6¶WBÒ×•vV%6ö6¶WC°¢Ğ¢òòÓÓÓÓÒK‹¾XªK‹®iùKŠ®ŠûîZ.[»®z¸²şZHŞyJ‚vV%6ö6¶WB‹ùîhêRÓÓÓÓĞ¢gVæ7F–öâ6öææV7D÷$GF6„ÆW76öåu2‡¶ÆW76öä–C¢ÆW76öä–BÂWFƒ¢WF‡Ò’°¢–b‚ÆW76öä–BÇÂWF‚’°¢6öç6öÆRçv&â‚%¾™ºŠûîZ.Xªh˜µÕµt$åÒ{Ë®[	ÆW76öä–Bh‰bWFûÈÎiKî[È>[»®™;â"“°¢&WGW&âçVÆÃ°¢Ğ¢–b‡&Wòæ—4ÆW76öä6öææV7FVB†ÆW76öä–B’’&WGW&â&WòæÆW76öå6ö6¶WG2ævWB†ÆW76öä–B“°¢òòjhÚî[Ù>X˜ŞYùşYŞ˜hº’w2YËYØ ¢6öç7B†÷7BÒ'w73¢òò"²Æö6F–öâæ†÷7FæÖR²"÷w6ò#°¢6öç7Bw2ÒæWrvV%6ö6¶WB††÷7B“°¢w2åõ÷–·DÆW76öä–BÒ7G&–ær†ÆW76öä–B“°¢w2æFDWfVçDÆ—7FVæW"‚&÷Vâ"Â‚’Óâ°¢G'’°¢6öç7B†VÆÆòÒ°¢÷¢&†VÆÆò"À¢òòW6W&–BXúş˜ûÉ®[ŞX©¾ˆë~XùnûÈÎˆë~XùnKˆŞX‹K™şKˆŞ™‹¾ijŞkXzˆ°¢W6W&–C¢vWEW6W$–E6fR‚’À¢&öÆS¢'7GVFVçB"À¢WFƒ¢WF‚À¢òòX[>™JîûÉ¦ÆW76öåFö¶Và¢ÆW76öæ–C¢ÆW76öä–@¢Ó°¢w2ç6VæB„¥4ôâç7G&–æv–g’††VÆÆò’“°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ´WFô¦ö–åÒ[{.Xù˜†VÆÆòhúh˜³¢"Â†VÆÆò“°¢Ò6F6‚†R’°¢6öç6öÆRæW'&÷"‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ´WFô¦ö–åÒXù˜†VÆÆòZK‹JS¢"ÂR“°¢Ğ¢Ò“°¢w2æFDWfVçDÆ—7FVæW"‚&6Æ÷6R"Â‚’Óâ°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕµt$åÕ´WFô¦ö–åÒŠûîZ"u2X[>™zÓ¢"ÂÆW76öä–B“°¢Ò“°¢w2æFDWfVçDÆ—7FVæW"‚&W'&÷""ÂRÓâ°¢6öç6öÆRæW'&÷"‚%¾™ºŠûîZ.Xªh˜µÕ´U%%Õ´WFô¦ö–åÒŠûîZ"u2™IŠúó¢"ÂÆW76öä–BÂR“°¢Ò“°¢&WòæÖ&´ÆW76öä6öææV7FVB†ÆW76öä–BÂw2ÂWF‚“°¢&WGW&âw3°¢Ğ¢gVæ7F–öâvWEW6W$–E6fR‚’°¢G'’°¢òò[‹ŠxhÈ.‹ÛŞx+ûÈKˆŞYÎxêşZ(>Xúşˆ;ŞKˆŞYÎûÈ¢–b‡v–æF÷sòå–·EW6W#òæ–B’&WGW&âv–æF÷rå–·EW6W"æ–C°¢–b‡v–æF÷sòåõô”ä•D”Åõ5DDUõóòçW6W#òçW6W$–B’&WGW&âv–æF÷råõô”ä•D”Åõ5DDUõòçW6W"çW6W$–C°¢6öç7BÒÒFö7VÖVçBæ6öö¶–RæÖF6‚‚òƒó¥çÃµÇ2¢—W6W%ö–CÒ…ÆB²’ò“°¢–b†Ò’&WGW&âçVÖ&W"†Õ³Ò“°¢Ò6F6‚·Ğ¢&WGW&ã°¢Ğ¢†gVæ7F–öâ–çFW&6WDfWF6‚‚’°¢–b‡v–æF÷råõõ”µEôdUD4…õD4„TEõò’&WGW&ã°¢v–æF÷råõõ”µEôdUD4…õD4„TEõòÒG'VS°¢6öç7B&tfWF6‚Òv–æF÷ræfWF6ƒ°¢v–æF÷ræfWF6‚Ò7–æ2gVæ7F–öâ‚ââæ&w2’°¢6öç7B¶–çWBÂ–æ—EÒÒ&w3°¢6öç7BW&ÂÒG—Vöb–çWBÓÓÒ'7G&–ær"ò–çWB¢–çWCòçW&ÂÇÂ"#°¢òòÓÓÒƒ’h™>XÛ‹>Šù^iz^[ù~ûÈÎXúşŠx.ZùşY:®K©¾hê^Xú>‹[fWF6‚ÓÓĞ¢–b‡W&Âæ–æ6ÇVFW2‚&ÆW76öâ"’ÇÂW&Âæ–æ6ÇVFW2‚'6Æ–FR"’ÇÂW&Âæ–æ6ÇVFW2‚'&ö&ÆVÒ"’’6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ¶fWF6‚Ö–çFW&6WF÷%ÒhÙ^ˆë~Šû~k#¢"ÂW&Â“°¢6öç7B&W7Òv—B&tfWF6‚æÇ’‡F†—2Â&w2“°¢G'’°¢òòÓÓÒƒ"’Xú®hºnhŠ¢&–â6Æ77&ööÒy¨B¥4ôâhê^Xú2ÓÓĞ¢–b‡W&Âæ–æ6ÇVFW2‚"öÆW76öâ"’ÇÂW&Âæ–æ6ÇVFW2‚"÷&W6VçFF–öâ"’ÇÂW&Âæ–æ6ÇVFW2‚"÷6Æ–FW2"’ÇÂW&Âæ–æ6ÇVFW2‚"÷&ö&ÆVÒ"’’°¢6öç7B6ÆöæVBÒ&W7æ6ÆöæR‚“°¢6öç7BFW‡BÒv—B6ÆöæVBçFW‡B‚“°¢òò‹ù˜xÎKˆŞˆ;Şy»NhêR&W7æ§6öâ‚ûÈÎY
nX‰kXKÉ®Š*¾kh‹KûÉ¾[ø^š²6ÆöæR‚¢6öç7B§6öâÒ¥4ôâç'6R‡FW‡B“°¢òòÓÓÒƒ2’X[>™JîûÉ®hùXùb6Æ–FW2[›nxÎXZR&Wòç6Æ–FW2ÓÓĞ¢–b†§6öâbb§6öâæFFbb§6öâæFFç6Æ–FW2’°¢6öç7B6Æ–FW2Ò§6öâæFFç6Æ–FW3°¢ÆWBf–ÆÆVBÒ°¢f÷"†6öç7B2öb6Æ–FW2’°¢6öç7B6–BÒ7G&–ær‡2æ–B“°¢–b‚&Wòç6Æ–FW2æ†2‡6–B’’°¢&Wòç6Æ–FW2ç6WB‡6–BÂ2“°¢f–ÆÆVB²³°¢Ğ¢Ğ¢6öç6öÆRæÆör†™ºŠûîZ.Xªh˜µÕ´”ädõÕ¶fWF6‚Ö–çFW&6WF÷%Ò[{.Z¾XXR6Æ–FW2G¶f–ÆÆVGÒòG·6Æ–FW2æÆVæwF‡Ö“°¢Ğ¢Ğ¢Ò6F6‚†R’°¢6öç6öÆRçv&â‚%¾™ºŠûîZ.Xªh˜µÕ´U%%Õ¶fWF6‚Ö–çFW&6WF÷%ÒŠz>iéY8Ş[©NZK‹JS¢"ÂR“°¢Ğ¢&WGW&â&W7°¢òòKˆZé®Šh‹ùNY¹îXéşZx²&W7öç6P¢Ó°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÕ¶fWF6‚Ö–çFW&6WF÷%ÒfWF6‚‚’[{.Š*¾hºnhŠ¢"“°¢Ò’‚“°¢f"772Òrò¢ÓÓÓÓÒ˜	®yJ‚bKúîZHÒÓÓÓÓÒ¢õÆâ7vFW&Ö&µöÆ–W"²F—7Æ“¢æöæR–×÷'FçC²f—6–&–Æ—G“¢†–FFVâ–×÷'FçC²ÕÆâæ†–FFVâ²F—7Æ“¢æöæR–×÷'FçC²ÕÆåÆã§&ö÷GµÆâÒ×–·B×£¢µÆâÒ×–·BÖ&÷&FW#¢6FFCµÆâÒ×–·BÖ&÷&FW"×7G&öæs¢6663µÆâÒ×–·BÖ&s¢6ffcµÆâÒ×–·BÖfs¢3###µÆâÒ×–·BÖ×WFVC¢3cs“µÆâÒ×–·BÖ66VçC¢3Cc6FcµÆâÒ×–·BÖ†÷fW#¢3S3SµÆâÒ×–·B×6†F÷s¢‚3‚&v&ƒÃÃÂã‚“µÆçÕÆåÆâò¢ÓÓÓÓÒ[z^X[~jòÓÓÓÓÒ¢õÆâ7–·BÖ†VÇW"×FööÆ&'µÆâ÷6—F–öã¢f—†VC²¢Ö–æFWƒ¢6Æ2‡f"‚Ò×–·B×¢’²“µÆâÆVgC¢Wƒ²&÷GFöÓ¢WƒµÆâò¢z{¾™šNY»®Zé®ZëŞ[ªnûÈÎŠêXh^Zëˆz®˜.[©B¢õÆâ†V–v‡C¢3gƒ²FF–æs¢WƒµÆâF—7Æ“¢fÆWƒ²v¢gƒ²Æ–vâÖ—FV×3¢6VçFW#µÆâ&6¶w&÷VæC¢f"‚Ò×–·BÖ&r“µÆâ&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"×7G&öær“µÆâ&÷&FW"×&F—W3¢GƒµÆâ&÷‚×6†F÷s¢‚G‚7‚&v&ƒÃÃÂã“µÆçÕÆåÆâ7–·BÖ†VÇW"×FööÆ&"æ'FçµÆâF—7Æ“¢–æÆ–æRÖ&Æö6³²FF–æs¢Gƒ²7W'6÷#¢ö–çFW#µÆâ6öÆ÷#¢f"‚Ò×–·BÖ×WFVB“²Æ–æRÖ†V–v‡C¢µÆçÕÆâ7–·BÖ†VÇW"×FööÆ&"æ'Fã¦†÷fW'²6öÆ÷#¢f"‚Ò×–·BÖ†÷fW"“²ÕÆâ7–·BÖ†VÇW"×FööÆ&"æ'Fâæ7F—fW²6öÆ÷#¢f"‚Ò×–·BÖ66VçB“²ÕÆåÆâò¢ÓÓÓÓÒ™Ú.iÛş˜	®yJj~[ÈòÓÓÓÓÒ¢õÆâç–·B×æVÇµÆâ÷6—F–öã¢f—†VC²&–v‡C¢#ƒ²&÷GFöÓ¢cƒµÆâv–GFƒ¢Scƒ²Ö‚Ö†V–v‡C¢s'fƒ²÷fW&fÆ÷s¢WFóµÆâ&6¶w&÷VæC¢f"‚Ò×–·BÖ&r“²6öÆ÷#¢f"‚Ò×–·BÖfr“µÆâ&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"×7G&öær“²&÷&FW"×&F—W3¢‡ƒµÆâ&÷‚×6†F÷s¢f"‚Ò×–·B×6†F÷r“µÆâF—7Æ“¢æöæS²Æâò¢hùš¹‡¢Ö–æFWûÈÎzîKùŞYîh™>[Èy¨N™Ú.iÛşYÊiÈKˆ®["¢õÆâ¢Ö–æFWƒ¢f"‚Ò×–·B×¢“µÆçÕÆâç–·B×æVÂçf—6–&ÆW²ÆâF—7Æ“¢&Æö6³²Æâò¢XªhhùXØw¢Ö–æFW‚¢õÆâ¢Ö–æFWƒ¢6Æ2‡f"‚Ò×–·B×¢’²“µÆçÕÆåÆâçæVÂÖ†VFW'µÆâF—7Æ“¢fÆWƒ²Æ–vâÖ—FV×3¢6VçFW#²§W7F–g’Ö6öçFVçC¢76RÖ&WGvVVãµÆâv¢'ƒ²FF–æs¢‚'ƒ²&÷&FW"Ö&÷GFöÓ¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"“µÆçÕÆâçæVÂÖ†VFW"ƒ7²Ö&v–ã¢²föçB×6—¦S¢gƒ²föçB×vV–v‡C¢c²ÕÆâçæVÂÖ&öG—²FF–æs¢‚'ƒ²ÕÆâæ6Æ÷6RÖ'Fç²7W'6÷#¢ö–çFW#²6öÆ÷#¢f"‚Ò×–·BÖ×WFVB“²ÕÆâæ6Æ÷6RÖ'Fã¦†÷fW'²6öÆ÷#¢f"‚Ò×–·BÖ†÷fW"“²ÕÆåÆâò¢ÓÓÓÓÒŠëî{Úî™Ú.iÛò‚7–·B×6WGF–æw2×æVÂ’ÓÓÓÓÒ¢õÆâ7–·B×6WGF–æw2×æVÂç6WGF–æw2Ö6öçFVçG²F—7Æ“¢fÆWƒ²fÆW‚ÖF—&V7F–öã¢6öÇVÖã²v¢Gƒ²ÕÆâ7–·B×6WGF–æw2×æVÂç6WGF–ærÖw&÷W²&÷&FW#¢‚F6†VBf"‚Ò×–·BÖ&÷&FW"“²&÷&FW"×&F—W3¢gƒ²FF–æs¢ƒ²ÕÆâ7–·B×6WGF–æw2×æVÂç6WGF–ærÖw&÷WƒG²Ö&v–ã¢‡‚²föçB×6—¦S¢Gƒ²ÕÆâ7–·B×6WGF–æw2×æVÂç6WGF–ærÖ—FV×²F—7Æ“¢fÆWƒ²Æ–vâÖ—FV×3¢6VçFW#²v¢‡ƒ²Ö&v–ã¢‡‚²fÆW‚×w&¢w&²ÕÆâ7–·B×6WGF–æw2×æVÂÆ&VÇ²föçB×6—¦S¢7ƒ²ÕÆâ7–·B×6WGF–æw2×æVÂ–çWE·G—SÒ'FW‡B%ÒÅÆâ7–·B×6WGF–æw2×æVÂ–çWE·G—SÒ&çVÖ&W"%×µÆâ†V–v‡C¢3ƒ²&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"×7G&öær“µÆâ&÷&FW"×&F—W3¢Gƒ²FF–æs¢‡ƒ²Ö–â×v–GFƒ¢##ƒµÆçÕÆâ7–·B×6WGF–æw2×æVÂ6ÖÆÇ²6öÆ÷#¢3ccc²ÕÆâ7–·B×6WGF–æw2×æVÂç6WGF–ærÖ7F–öç7²F—7Æ“¢fÆWƒ²v¢‡ƒ²Ö&v–â×F÷¢gƒ²ÕÆâ7–·B×6WGF–æw2×æVÂ'WGFöçµÆâ†V–v‡C¢3ƒ²FF–æs¢'ƒ²&÷&FW"×&F—W3¢gƒµÆâ&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"×7G&öær“²&6¶w&÷VæC¢6cvc†f²7W'6÷#¢ö–çFW#µÆçÕÆâ7–·B×6WGF–æw2×æVÂ'WGFöã¦†÷fW'²&6¶w&÷VæC¢6VVc6fc²&÷&FW"Ö6öÆ÷#¢f"‚Ò×–·BÖ66VçB“²ÕÆåÆâò¢ˆz®Zé®K˜ZHŞ˜jnûÈKˆîh˜¾XiˆI®iÊÎKˆˆ{Ny¨NŠxnŠxŠúŞK˜ûÈ’¢õÆâ7–·B×6WGF–æw2×æVÂæ6†V6¶&÷‚ÖÆ&VÇ²÷6—F–öã¢&VÆF—fS²FF–ærÖÆVgC¢#gƒ²7W'6÷#¢ö–çFW#²W6W"×6VÆV7C¢æöæS²ÕÆâ7–·B×6WGF–æw2×æVÂæ6†V6¶&÷‚ÖÆ&VÂ–çWG²÷6—F–öã¢'6öÇWFS²÷6—G“¢²7W'6÷#¢ö–çFW#²†V–v‡C¢²v–GFƒ¢²ÕÆâ7–·B×6WGF–æw2×æVÂæ6†V6¶&÷‚ÖÆ&VÂæ6†V6¶Ö&·µÆâ÷6—F–öã¢'6öÇWFS²ÆVgC¢²F÷¢SS²G&ç6f÷&Ó¢G&ç6ÆFU’‚ÓSR“µÆâ†V–v‡C¢gƒ²v–GFƒ¢gƒ²&÷&FW#£‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"×7G&öær“²&÷&FW"×&F—W3¢7ƒ²&6¶w&÷VæC¢6ffcµÆçÕÆâ7–·B×6WGF–æw2×æVÂæ6†V6¶&÷‚ÖÆ&VÂ–çWC¦6†V6¶VBâæ6†V6¶Ö&·µÆâ&6¶w&÷VæC¢f"‚Ò×–·BÖ66VçB“²&÷&FW"Ö6öÆ÷#¢f"‚Ò×–·BÖ66VçB“µÆçÕÆâ7–·B×6WGF–æw2×æVÂæ6†V6¶&÷‚ÖÆ&VÂæ6†V6¶Ö&³¦gFW'µÆâ6öçFVçC¢"#²÷6—F–öã¢'6öÇWFS²F—7Æ“¢æöæSµÆâÆVgC¢Wƒ²F÷¢ƒ²v–GFƒ¢Gƒ²†V–v‡C¢‡ƒ²&÷&FW#¢6öÆ–B6ffc²&÷&FW"×v–GFƒ¢'‚'‚²G&ç6f÷&Ó¢&÷FFRƒCVFVr“µÆçÕÆâ7–·B×6WGF–æw2×æVÂæ6†V6¶&÷‚ÖÆ&VÂ–çWC¦6†V6¶VBâæ6†V6¶Ö&³¦gFW'²F—7Æ“¢&Æö6³²ÕÆåÆâò¢ÓÓÓÓÒ’Šz>zÙN™Ú.iÛò‚7–·BÖ’Öç7vW"×æVÂ’ÓÓÓÓÒ¢õÆâ7–·BÖ’Öç7vW"×æVÂæ’×VW7F–öçµÆâv†—FR×76S¢&R×w&²&6¶w&÷VæC¢6fff²&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"“µÆâFF–æs¢‡ƒ²&÷&FW"×&F—W3¢gƒ²Ö&v–âÖ&÷GFöÓ¢‡ƒ²Ö‚Ö†V–v‡C¢cƒ²÷fW&fÆ÷s¢WFóµÆçÕÆâ7–·BÖ’Öç7vW"×æVÂæ’ÖÆöF–æw²6öÆ÷#¢f"‚Ò×–·BÖ66VçB“²Ö&v–âÖ&÷GFöÓ¢gƒ²ÕÆâ7–·BÖ’Öç7vW"×æVÂæ’ÖW'&÷'²6öÆ÷#¢6##²Ö&v–âÖ&÷GFöÓ¢gƒ²ÕÆâ7–·BÖ’Öç7vW"×æVÂæ’Öç7vW'²v†—FR×76S¢&R×w&²Ö&v–â×F÷¢Gƒ²ÕÆâ7–·BÖ’Öç7vW"×æVÂæ’Ö7F–öç7²Ö&v–â×F÷¢ƒ²ÕÆâ7–·BÖ’Öç7vW"×æVÂæ’Ö7F–öç2'WGFöçµÆâ†V–v‡C¢3ƒ²FF–æs¢'ƒ²&÷&FW"×&F—W3¢gƒµÆâ&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"×7G&öær“²&6¶w&÷VæC¢6cvc†f²7W'6÷#¢ö–çFW#µÆçÕÆâ7–·BÖ’Öç7vW"×æVÂæ’Ö7F–öç2'WGFöã¦†÷fW'²&6¶w&÷VæC¢6VVc6fc²&÷&FW"Ö6öÆ÷#¢f"‚Ò×–·BÖ66VçB“²ÕÆåÆâò¢ÓÓÓÓÒŠûîK»nkXşŠx™Ú.iÛò‚7–·B×&W6VçFF–öâ×æVÂ’ÓÓÓÓÒ¢õÆâ7–·B×&W6VçFF–öâ×æVÇ²v–GFƒ¢“ƒ²ÕÆâ7–·B×&W6VçFF–öâ×æVÂçæVÂÖ6öçG&öÇ7²F—7Æ“¢fÆWƒ²Æ–vâÖ—FV×3¢6VçFW#²v¢‡ƒ²fÆW‚×w&¢w&²ÕÆâ7–·B×&W6VçFF–öâ×æVÂçæVÂÖ&öG—µÆâF—7Æ“¢w&–C²w&–B×FV×ÆFRÖ6öÇVÖç3¢3‚g#²v¢ƒµÆçÕÆâ7–·B×&W6VçFF–öâ×æVÂçæVÂÖÆVgBÅÆâ7–·B×&W6VçFF–öâ×æVÂçæVÂ×&–v‡GµÆâF—7Æ“¢fÆWƒµÆâfÆW‚ÖF—&V7F–öã¢6öÇVÖãµÆçÕÆâ7–·B×&W6VçFF–öâ×æVÂç&W6VçFF–öâÖÆ—7GµÆâ&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"“µÆâ&÷&FW"×&F—W3¢‡ƒµÆâ&6¶w&÷VæC¢6ffcµÆâFF–æs¢ƒµÆâ&÷‚×6—¦–æs¢&÷&FW"Ö&÷ƒµÆçÕÆâ7–·B×&W6VçFF–öâ×æVÂç&W6VçFF–öâ×F—FÆWµÆâföçB×vV–v‡C¢c²FF–æs¢g‚²&÷&FW"Ö&÷GFöÓ¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"“µÆçÕÆâ7–·B×&W6VçFF–öâ×æVÂç6Æ–FR×F‡VÖ"ÖÆ—7G²F—7Æ“¢w&–C²w&–B×FV×ÆFRÖ6öÇVÖç3¢&WVBƒ2Âg"“²v¢‡ƒ²Ö&v–â×F÷¢‡ƒ²ÕÆâ7–·B×&W6VçFF–öâ×æVÂç6Æ–FR×F‡VÖ'µÆâ÷6—F–öã¢&VÆF—fS²&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"“²&÷&FW"×&F—W3¢gƒ²&6¶w&÷VæC¢6fffµÆâÖ–âÖ†V–v‡C¢cƒ²F—7Æ“¢fÆWƒ²Æ–vâÖ—FV×3¢6VçFW#²§W7F–g’Ö6öçFVçC¢6VçFW#²7W'6÷#¢ö–çFW#²FF–æs¢Gƒ²FW‡BÖÆ–vã¢6VçFW#µÆçÕÆâ7–·B×&W6VçFF–öâ×æVÂç6Æ–FR×F‡VÖ#¦†÷fW'²&÷&FW"Ö6öÆ÷#¢f"‚Ò×–·BÖ66VçB“²&6¶w&÷VæC¢6VVc6fc²ÕÆâ7–·B×&W6VçFF–öâ×æVÂç6Æ–FR×F‡VÖ"–Öw²Ö‚×v–GFƒ¢S²Ö‚Ö†V–v‡C¢#ƒ²ö&¦V7BÖf—C¢6öçF–ã²F—7Æ“¢&Æö6³²ÕÆâç–·B×&W6VçFF–öâ×æVÂç6Æ–FRÖ–æFW‚µÆâ÷6—F–öã¢'6öÇWFS²F÷¢Gƒ²ÆVgC¢Gƒ²¢Ö–æFWƒ¢#²ÆâFF–æs¢'‚gƒ²&÷&FW"×&F—W3¢Gƒ²föçB×6—¦S¢'ƒ²Æ–æRÖ†V–v‡C¢µÆâ&6¶w&÷VæC¢&v&ƒÂÂÂãb“²6öÆ÷#¢6ffc²ö–çFW"ÖWfVçG3¢æöæSµÆçÕÆâ7–·B×&W6VçFF–öâ×æVÂç6Æ–FR×f–WwµÆâ÷6—F–öã¢&VÆF—fS²&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"“²&÷&FW"×&F—W3¢‡ƒ²Ö–âÖ†V–v‡C¢3cƒ²&6¶w&÷VæC¢6ffc²÷fW&fÆ÷s¢†–FFVãµÆçÕÆâ7–·B×&W6VçFF–öâ×æVÂç6Æ–FRÖ6÷fW'²F—7Æ“¢fÆWƒ²Æ–vâÖ—FV×3¢6VçFW#²§W7F–g’Ö6öçFVçC¢6VçFW#²Ö–âÖ†V–v‡C¢3cƒ²ÕÆâ7–·B×&W6VçFF–öâ×æVÂç6Æ–FRÖ6÷fW"–Öw²Ö‚×v–GFƒ¢S²Ö‚Ö†V–v‡C¢S²ö&¦V7BÖf—C¢6öçF–ã²F—7Æ“¢&Æö6³²ÕÆâ7–·B×&W6VçFF–öâ×æVÂæö7"×æVÇµÆâÖ&v–â×F÷¢'ƒµÆâ&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"“µÆâ&÷&FW"×&F—W3¢‡ƒµÆâ&6¶w&÷VæC¢6ffcµÆâFF–æs¢'ƒµÆçÕÆâ7–·B×&W6VçFF–öâ×æVÂæö7"Ö†VGµÆâF—7Æ“¢fÆWƒµÆâÆ–vâÖ—FV×3¢6VçFW#µÆâ§W7F–g’Ö6öçFVçC¢76RÖ&WGvVVãµÆâv¢‡ƒµÆâÖ&v–âÖ&÷GFöÓ¢‡ƒµÆâföçB×vV–v‡C¢cµÆçÕÆâ7–·B×&W6VçFF–öâ×æVÂæö7"×7FGW7µÆâföçB×6—¦S¢'ƒµÆâ6öÆ÷#¢f"‚Ò×–·BÖ×WFVB“µÆçÕÆâ7–·B×&W6VçFF–öâ×æVÂæö7"×7FGW2æ—2ÖÆöF–æw²6öÆ÷#¢6c#s²ÕÆâ7–·B×&W6VçFF–öâ×æVÂæö7"×7FGW2æ—2ÖW'&÷'²6öÆ÷#¢6#C#3ƒ²ÕÆâ7–·B×&W6VçFF–öâ×æVÂæö7"×7FGW2æ—2×7V66W77²6öÆ÷#¢3#vCƒ²ÕÆâ7–·B×&W6VçFF–öâ×æVÂæö7"×F—µÆâÖ&v–âÖ&÷GFöÓ¢‡ƒµÆâföçB×6—¦S¢'ƒµÆâ6öÆ÷#¢f"‚Ò×–·BÖ×WFVB“µÆçÕÆâ7–·B×&W6VçFF–öâ×æVÂæö7"×G&ç6ÆFRÖ&'µÆâF—7Æ“¢fÆWƒµÆâÆ–vâÖ—FV×3¢6VçFW#µÆâv¢‡ƒµÆâfÆW‚×w&¢w&µÆâÖ&v–ã¢'‚‡ƒµÆçÕÆâ7–·B×&W6VçFF–öâ×æVÂæö7"×G&ç6ÆFRÖ&"æö7"×7FGW7µÆâÖ&v–âÖÆVgC¢WFóµÆçÕÆâ7–·B×&W6VçFF–öâ×æVÂæö7"×F&vWBÖ–çWGµÆâÖ–â×v–GFƒ¢##ƒµÆâ†V–v‡C¢3'ƒµÆâ&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"×7G&öær“µÆâ&÷&FW"×&F—W3¢gƒµÆâFF–æs¢ƒµÆâ&÷‚×6—¦–æs¢&÷&FW"Ö&÷ƒµÆçÕÆâ7–·B×&W6VçFF–öâ×æVÂæö7"×7V&†VGµÆâÖ&v–â×F÷¢GƒµÆçÕÆâ7–·B×&W6VçFF–öâ×æVÂæö7"×&W7VÇGµÆâv–GFƒ¢SµÆâÖ–âÖ†V–v‡C¢ƒƒµÆâ&W6—¦S¢fW'F–6ÃµÆâ&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"×7G&öær“µÆâ&÷&FW"×&F—W3¢gƒµÆâFF–æs¢ƒµÆâÆ–æRÖ†V–v‡C¢ãSµÆâföçB×6—¦S¢7ƒµÆâ&÷‚×6—¦–æs¢&÷&FW"Ö&÷ƒµÆâ&6¶w&÷VæC¢6fffµÆçÕÆåÆâ7–·B×&W6VçFF–öâ×æVÂç&ö&ÆVÒÖ&÷‡µÆâ÷6—F–öã¢'6öÇWFS²ÆVgC¢'ƒ²&–v‡C¢'ƒ²&÷GFöÓ¢'ƒµÆâ&6¶w&÷VæC¢&v&ƒ#SRÃ#SRÃ#SRÂã“b“²&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"“µÆâ&÷&FW"×&F—W3¢‡ƒ²FF–æs¢ƒ²&÷‚×6†F÷s¢g‚‡‚&v&ƒÃÃÂã"“µÆçÕÆâ7–·B×&W6VçFF–öâ×æVÂç&ö&ÆVÒÖ†VG²föçB×vV–v‡C¢c²Ö&v–âÖ&÷GFöÓ¢gƒ²FF–ær×&–v‡C¢#‡ƒ²ÕÆâ7–·B×&W6VçFF–öâ×æVÂç&ö&ÆVÒÖ&÷‚Ö6Æ÷6WµÆâ÷6—F–öã¢'6öÇWFS²F÷¢gƒ²&–v‡C¢gƒµÆâv–GFƒ¢#'ƒ²†V–v‡C¢#'ƒ²&÷&FW"×&F—W3¢““—ƒµÆâ&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"×7G&öær“µÆâ&6¶w&÷VæC¢6ffc²6öÆ÷#¢3SSSµÆâ7W'6÷#¢ö–çFW#²föçB×6—¦S¢gƒ²Æ–æRÖ†V–v‡C¢‡ƒµÆâFF–æs¢µÆçÕÆâ7–·B×&W6VçFF–öâ×æVÂç&ö&ÆVÒÖ&÷‚Ö6Æ÷6S¦†÷fW'²6öÆ÷#¢3²&÷&FW"Ö6öÆ÷#¢f"‚Ò×–·BÖ66VçB“²ÕÆâ7–·B×&W6VçFF–öâ×æVÂç&ö&ÆVÒÖ÷F–öç7²F—7Æ“¢w&–C²w&–B×FV×ÆFRÖ6öÇVÖç3¢g#²v¢Gƒ²ÕÆâ7–·B×&W6VçFF–öâ×æVÂç&ö&ÆVÒÖ÷F–öç²FF–æs¢g‚‡ƒ²&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"“²&÷&FW"×&F—W3¢gƒ²&6¶w&÷VæC¢6fff²ÕÆâ7–·B×&W6VçFF–öâ×æVÂç&ö&ÆVÒÖ7F–öç7²F—7Æ“¢fÆWƒ²fÆW‚×w&¢w&²v¢‡ƒ²Ö&v–â×F÷¢‡ƒ²ÕÆâ7–·B×&W6VçFF–öâ×æVÂç&ö&ÆVÒÖ7F–öç2'WGFöçµÆâ†V–v‡C¢#‡ƒ²FF–æs¢ƒ²&÷&FW"×&F—W3¢gƒ²&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"×7G&öær“²&6¶w&÷VæC¢6cvc†f²7W'6÷#¢ö–çFW#µÆçÕÆâ7–·B×&W6VçFF–öâ×æVÂç&ö&ÆVÒÖ7F–öç2'WGFöã¦†÷fW'²&6¶w&÷VæC¢6VVc6fc²&÷&FW"Ö6öÆ÷#¢f"‚Ò×–·BÖ66VçB“²ÕÆåÆâò¢ÓÓÓÓÒš)yºîX‰~Š™Ú.iÛò‚7–·B×&ö&ÆVÒÖÆ—7B×æVÂ’ÓÓÓÓÒ¢õÆâ7–·B×&ö&ÆVÒÖÆ—7G²F—7Æ“¢fÆWƒ²fÆW‚ÖF—&V7F–öã¢6öÇVÖã²v¢ƒ²ÕÆâ7–·B×&ö&ÆVÒÖÆ—7Bç&ö&ÆVÒ×&÷wµÆâ&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"“²&÷&FW"×&F—W3¢‡ƒ²FF–æs¢‡ƒ²&6¶w&÷VæC¢6fffµÆçÕÆâ7–·B×&ö&ÆVÒÖÆ—7Bç&ö&ÆVÒ×F—FÆW²föçB×vV–v‡C¢c²Ö&v–âÖ&÷GFöÓ¢Gƒ²ÕÆâ7–·B×&ö&ÆVÒÖÆ—7Bç&ö&ÆVÒÖÖWF²6öÆ÷#¢3ccc²föçB×6—¦S¢'ƒ²Ö&v–âÖ&÷GFöÓ¢gƒ²ÕÆâ7–·B×&ö&ÆVÒÖÆ—7Bç&ö&ÆVÒÖ7F–öç7²F—7Æ“¢fÆWƒ²v¢‡ƒ²Æ–vâÖ—FV×3¢6VçFW#²ÕÆâ7–·B×&ö&ÆVÒÖÆ—7Bç&ö&ÆVÒÖ7F–öç2'WGFöçµÆâ†V–v‡C¢#‡ƒ²FF–æs¢ƒ²&÷&FW"×&F—W3¢gƒ²&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"×7G&öær“²&6¶w&÷VæC¢6cvc†f²7W'6÷#¢ö–çFW#µÆçÕÆâ7–·B×&ö&ÆVÒÖÆ—7Bç&ö&ÆVÒÖ7F–öç2'WGFöã¦†÷fW'²&6¶w&÷VæC¢6VVc6fc²&÷&FW"Ö6öÆ÷#¢f"‚Ò×–·BÖ66VçB“²ÕÆâ7–·B×&ö&ÆVÒÖÆ—7Bç&ö&ÆVÒÖFöæW²6öÆ÷#¢3v&c²föçB×vV–v‡C¢c²ÕÆåÆâò¢ÓÓÓÓÒkK¾Xªš)yºîX‰~ŠûÈXû>Kˆ¾Šy.[şXÚx˜~ûÈ’ÓÓÓÓÒ¢õÆâ7–·BÖ7F—fR×&ö&ÆV×2×æVÂç–·BÖ7F—fR×w&W'µÆâ÷6—F–öã¢f—†VC²&–v‡C¢#ƒ²&÷GFöÓ¢cƒ²¢Ö–æFWƒ¢f"‚Ò×–·B×¢“µÆçÕÆâ7–·BÖ7F—fR×&ö&ÆV×7²F—7Æ“¢fÆWƒ²fÆW‚ÖF—&V7F–öã¢6öÇVÖã²v¢‡ƒ²Ö‚Ö†V–v‡C¢cfƒ²÷fW&fÆ÷s¢WFó²ÕÆâ7–·BÖ7F—fR×&ö&ÆV×2æ7F—fR×&ö&ÆVÒÖ6&GµÆâ÷6—F–öã¢&VÆF—fSµÆâv–GFƒ¢3#ƒ²&6¶w&÷VæC¢6ffc²&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"“µÆâ&÷&FW"×&F—W3¢‡ƒ²&÷‚×6†F÷s¢f"‚Ò×–·B×6†F÷r“²FF–æs¢ƒµÆçÕÆâ7–·BÖ7F—fR×&ö&ÆV×2æÖ6Æ÷6WµÆâ÷6—F–öã¢'6öÇWFS²F÷¢gƒ²&–v‡C¢gƒµÆâv–GFƒ¢#ƒ²†V–v‡C¢#ƒ²&÷&FW"×&F—W3¢““—ƒµÆâ&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"×7G&öær“µÆâ&6¶w&÷VæC¢6ffc²6öÆ÷#¢3SSSµÆâ7W'6÷#¢ö–çFW#²FF–æs¢²föçB×6—¦S¢Gƒ²Æ–æRÖ†V–v‡C¢gƒµÆçÕÆâ7–·BÖ7F—fR×&ö&ÆV×2æÖ6Æ÷6S¦†÷fW'²6öÆ÷#¢3²&÷&FW"Ö6öÆ÷#¢f"‚Ò×–·BÖ66VçB“²ÕÆâ7–·BÖ7F—fR×&ö&ÆV×2æ×F—FÆW²föçB×vV–v‡C¢c²Ö&v–âÖ&÷GFöÓ¢Gƒ²FF–ær×&–v‡C¢#‡ƒ²ÕÆâ7–·BÖ7F—fR×&ö&ÆV×2æÖ–æf÷²6öÆ÷#¢3ccc²föçB×6—¦S¢'ƒ²Ö&v–âÖ&÷GFöÓ¢‡ƒ²ÕÆâ7–·BÖ7F—fR×&ö&ÆV×2æÖ7F–öç7²F—7Æ“¢fÆWƒ²v¢‡ƒ²ÕÆâ7–·BÖ7F—fR×&ö&ÆV×2æÖ7F–öç2'WGFöçµÆâ†V–v‡C¢#‡ƒ²FF–æs¢ƒ²&÷&FW"×&F—W3¢gƒ²&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"×7G&öær“²&6¶w&÷VæC¢6cvc†f²7W'6÷#¢ö–çFW#µÆçÕÆâ7–·BÖ7F—fR×&ö&ÆV×2æÖ7F–öç2'WGFöã¦†÷fW'²&6¶w&÷VæC¢6VVc6fc²&÷&FW"Ö6öÆ÷#¢f"‚Ò×–·BÖ66VçB“²ÕÆåÆâò¢ÓÓÓÓÒiYzˆ¾™Ú.iÛò‚7–·B×GWF÷&–Â×æVÂ’ÓÓÓÓÒ¢õÆâ7–·B×GWF÷&–Â×æVÂçGWF÷&–ÂÖ6öçFVçBƒG²Ö&v–ã¢‡‚gƒ²ÕÆâ7–·B×GWF÷&–Â×æVÂçGWF÷&–ÂÖ6öçFVçBÅÆâ7–·B×GWF÷&–Â×æVÂçGWF÷&–ÂÖ6öçFVçBÆ—²Æ–æRÖ†V–v‡C¢ãS²ÕÆâ7–·B×GWF÷&–Â×æVÂçGWF÷&–ÂÖ6öçFVçB²6öÆ÷#¢f"‚Ò×–·BÖ66VçB“²FW‡BÖFV6÷&F–öã¢æöæS²ÕÆâ7–·B×GWF÷&–Â×æVÂçGWF÷&–ÂÖ6öçFVçB¦†÷fW'²FW‡BÖFV6÷&F–öã¢VæFW&Æ–æS²ÕÆåÆâò¢ÓÓÓÓÒ[ş[ş˜.˜XÒÓÓÓÓÒ¢õÆäÖVF–†Ö‚×v–GFƒ¢#‚—µÆâ7–·B×&W6VçFF–öâ×æVÇ²v–GFƒ¢scƒ²ÕÆâ7–·B×&W6VçFF–öâ×æVÂçæVÂÖ&öG—²w&–B×FV×ÆFRÖ6öÇVÖç3¢#c‚g#²ÕÆçÕÆäÖVF–†Ö‚×v–GFƒ¢“‚—µÆâç–·B×æVÇ²&–v‡C¢'ƒ²ÆVgC¢'ƒ²v–GFƒ¢WFó²ÕÆâ7–·B×&W6VçFF–öâ×æVÇ²v–GFƒ¢WFó²ÕÆâ7–·B×&W6VçFF–öâ×æVÂçæVÂÖ&öG—²w&–B×FV×ÆFRÖ6öÇVÖç3¢g#²ÕÆçÕÆåÆâò¢ÓÓÓÓÒˆz®XªKÙÎzÙNh‰X©ş[Ëz©rÓÓÓÓÒ¢õÆâæWFòÖç7vW"×÷WµÆâ÷6—F–öã¢f—†VC²–ç6WC¢²¢Ö–æFWƒ¢6Æ2‡f"‚Ò×–·B×¢’²"“µÆâ&6¶w&÷VæC¢&v&ƒÃÃÂã"“µÆâF—7Æ“¢fÆWƒ²Æ–vâÖ—FV×3¢fÆW‚ÖVæC²§W7F–g’Ö6öçFVçC¢fÆW‚ÖVæCµÆâ÷6—G“¢²G&ç6—F–öã¢÷6—G’ã‡2V6SµÆçÕÆâæWFòÖç7vW"×÷Wçf—6–&ÆW²÷6—G“¢²ÕÆåÆâæWFòÖç7vW"×÷Wç÷WÖ6öçFVçGµÆâv–GFƒ¢Ö–âƒSc‚Â“ggr“µÆâ&6¶w&÷VæC¢6ffc²&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"×7G&öær“µÆâ&÷&FW"×&F—W3¢ƒ²&÷‚×6†F÷s¢f"‚Ò×–·B×6†F÷r“µÆâÖ&v–ã¢gƒ²÷fW&fÆ÷s¢†–FFVãµÆçÕÆåÆâæWFòÖç7vW"×÷Wç÷WÖ†VFW'µÆâF—7Æ“¢fÆWƒ²Æ–vâÖ—FV×3¢6VçFW#²§W7F–g’Ö6öçFVçC¢76RÖ&WGvVVãµÆâv¢'ƒ²FF–æs¢‚'ƒ²&÷&FW"Ö&÷GFöÓ¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"“µÆçÕÆâæWFòÖç7vW"×÷Wç÷WÖ†VFW"ƒG²Ö&v–ã¢²föçB×6—¦S¢gƒ²ÕÆâæWFòÖç7vW"×÷Wæ6Æ÷6RÖ'Fç²7W'6÷#¢ö–çFW#²6öÆ÷#¢f"‚Ò×–·BÖ×WFVB“²ÕÆâæWFòÖç7vW"×÷Wæ6Æ÷6RÖ'Fã¦†÷fW'²6öÆ÷#¢f"‚Ò×–·BÖ†÷fW"“²ÕÆåÆâæWFòÖç7vW"×÷Wç÷WÖ&öG—²FF–æs¢‚'ƒ²F—7Æ“¢fÆWƒ²fÆW‚ÖF—&V7F–öã¢6öÇVÖã²v¢ƒ²ÕÆâæWFòÖç7vW"×÷Wç÷W×&÷w²F—7Æ“¢w&–C²w&–B×FV×ÆFRÖ6öÇVÖç3¢Sg‚g#²v¢‡ƒ²Æ–vâÖ—FV×3¢7F'C²ÕÆâæWFòÖç7vW"×÷WæÆ&VÇ²6öÆ÷#¢3ccc²föçB×6—¦S¢'ƒ²Æ–æRÖ†V–v‡C¢ãƒ²ÕÆâæWFòÖç7vW"×÷Wæ6öçFVçG²v†—FR×76S¢æ÷&ÖÃ²v÷&BÖ'&V³¢'&V²×v÷&C²ÕÆåÆâò¢ÓÓÓÓÒãbãc¢ŠûîK»nkXşŠx™Ú.iÛşûÉ®Y»®Zé®Xû>Kê~Šún{¸nŠxnY»îûÈÎ[znKê~xºÎz¸¾k¹®Xª‚ÓÓÓÓÒ¢õÆâ7–·B×&W6VçFF–öâ×æVÂµÆâÒ×–·B×æVÂÖÖ‚Öƒ¢s'fƒ²ò¢Kˆâç–·B×æVÂy¨NiÈZJ~š¹[ªnKùŞhÈKˆˆ{B¢õÆçÕÆåÆâò¢KŠNX‰~[ˆ>[ûÉ®[znX‰~Š‚²Xû>Šún{¸nŠxnY»â¢õÆâ7–·B×&W6VçFF–öâ×æVÂçæVÂÖ&öG—µÆâF—7Æ“¢w&–CµÆâw&–B×FV×ÆFRÖ6öÇVÖç3¢3‚g#²Æâv¢'ƒµÆâ÷fW&fÆ÷s¢†–FFVã²ÆâÆ–vâÖ—FV×3¢7F'CµÆçÕÆåÆâò¢[znKê~ûÉ®Xú®Šê[znX‰~k¹®XªûÈÎ™™X‹nYÊ™Ú.iÛşXúşŠxnš¹[ªnXhR¢õÆâ7–·B×&W6VçFF–öâ×æVÂçæVÂÖÆVgGµÆâÖ‚Ö†V–v‡C¢f"‚Ò×–·B×æVÂÖÖ‚Ö‚“µÆâ÷fW&fÆ÷s¢WFóµÆâÖ–â×v–GFƒ¢µÆâÆ–vâ×6VÆc¢7G&WF6ƒµÆçÕÆåÆâò¢Xû>Kê~ûÉ®{)h
~Zé®KØŞK‹®(	ÎY»®Zé®(	ŞûÈÎZx¾{¸YÊ™Ú.iÛşXúşŠxnXË®XhR¢õÆâ7–·B×&W6VçFF–öâ×æVÂçæVÂ×&–v‡GµÆâ÷6—F–öã¢7F–6·“µÆâF÷¢²ÆâÆ–vâ×6VÆc¢7F'CµÆâv¢'ƒµÆçÕÆåÆâò¢Xû>Kê~Šún{¸nŠxnY»îˆz®‹ª¾K™ş™™X‹nš¹[ªn[›nXXŠëXh^˜:k¹®Xª‚¢õÆâ7–·B×&W6VçFF–öâ×æVÂç6Æ–FR×f–WwµÆâÖ‚Ö†V–v‡C¢f"‚Ò×–·B×æVÂÖÖ‚Ö‚“µÆâ÷fW&fÆ÷s¢WFóµÆâ&÷&FW#¢‚6öÆ–Bf"‚Ò×–·BÖ&÷&FW"“µÆâ&÷&FW"×&F—W3¢‡ƒµÆâ&6¶w&÷VæC¢6ffcµÆçÕÆåÆâò¢[ş[şˆz®˜.˜XŞûÉ®ZnXú[ˆ>[i{nXùnkh‚7F–6·ûÈÎ˜şXXŞ˜îhÊ¢õÆäÖVF–†Ö‚×v–GFƒ¢“‚—µÆâ7–·B×&W6VçFF–öâ×æVÂçæVÂÖ&öG—µÆâw&–B×FV×ÆFRÖ6öÇVÖç3¢g#µÆâÕÆâ7–·B×&W6VçFF–öâ×æVÂçæVÂ×&–v‡GµÆâ÷6—F–öã¢7FF–3µÆâÕÆçÕÆåÆâò¢YÊxëiÈj~[ÈşYû®zKˆ®k{¾Xª¢õÆåÆâçFW‡B×7FGW2µÆâföçB×6—¦S¢'ƒµÆâFF–æs¢G‚‡ƒµÆâ&÷&FW"×&F—W3¢GƒµÆâÖ&v–ã¢G‚µÆâF—7Æ“¢–æÆ–æRÖ&Æö6³µÆçÕÆåÆâçFW‡B×7FGW2ç7V66W72µÆâ&6¶w&÷VæBÖ6öÆ÷#¢6CFVFFµÆâ6öÆ÷#¢3SSs#CµÆâ&÷&FW#¢‚6öÆ–B636Sf6#µÆçÕÆåÆâçFW‡B×7FGW2çv&æ–ærµÆâ&6¶w&÷VæBÖ6öÆ÷#¢6ffc66CµÆâ6öÆ÷#¢3ƒScCCµÆâ&÷&FW#¢‚6öÆ–B6ffVsµÆçÕÆåÆâç–·B×VW7F–öâÖF—7Æ’µÆâ&6¶w&÷VæC¢6c†c–fµÆâ&÷&FW#¢‚6öÆ–B6FVS&ScµÆâ&÷&FW"×&F—W3¢GƒµÆâFF–æs¢‡ƒµÆâÖ&v–ã¢G‚µÆâÖ‚Ö†V–v‡C¢SƒµÆâ÷fW&fÆ÷r×“¢WFóµÆâföçBÖfÖ–Ç“¢Ööæ÷76SµÆâföçB×6—¦S¢7ƒµÆâÆ–æRÖ†V–v‡C¢ãCµÆçÕÆåÆâò¢YÊxëiÈj~[ÈşYû®zKˆ®k{¾Xª¢õÆåÆâç–·BÖ7W7FöÒ×&ö×BµÆâv–GFƒ¢SµÆâÖ–âÖ†V–v‡C¢cƒµÆâFF–æs¢‡ƒµÆâ&÷&FW#¢‚6öÆ–B6FFCµÆâ&÷&FW"×&F—W3¢GƒµÆâföçBÖfÖ–Ç“¢–æ†W&—CµÆâföçB×6—¦S¢7ƒµÆâÆ–æRÖ†V–v‡C¢ãCµÆâ&W6—¦S¢fW'F–6ÃµÆâ&6¶w&÷VæBÖ6öÆ÷#¢6ffcµÆâG&ç6—F–öã¢&÷&FW"Ö6öÆ÷"ã72V6SµÆçÕÆåÆâç–·BÖ7W7FöÒ×&ö×C¦fö7W2µÆâ÷WFÆ–æS¢æöæSµÆâ&÷&FW"Ö6öÆ÷#¢3v&fcµÆâ&÷‚×6†F÷s¢'‚&v&ƒÂ#2Â#SRÂã#R“µÆçÕÆåÆâç–·BÖ7W7FöÒ×&ö×C£§Æ6V†öÆFW"µÆâ6öÆ÷#¢3“““µÆâföçB×7G–ÆS¢—FÆ–3µÆçÕÆåÆâç–·BÖ7W7FöÒ×&ö×C¦V×G“£¦&Vf÷&RµÆâ6öçFVçC¢GG"‡Æ6V†öÆFW"“µÆâ6öÆ÷#¢3“““µÆâföçB×7G–ÆS¢—FÆ–3µÆâö–çFW"ÖWfVçG3¢æöæSµÆçÕÆåÆâò¢zîKùŞ‹é>XZ^jnYÊi©~ˆ›.K‹¾š)Kˆ¾K™şˆ;ŞjÚ>[‹i‹îzK¢¢õÆâç–·B×æVÂæF&²ç–·BÖ7W7FöÒ×&ö×BµÆâ&6¶w&÷VæBÖ6öÆ÷#¢3&C3sCƒµÆâ&÷&FW"Ö6öÆ÷#¢3FSScƒµÆâ6öÆ÷#¢6S&S†cµÆçÕÆåÆâç–·B×æVÂæF&²ç–·BÖ7W7FöÒ×&ö×C£§Æ6V†öÆFW"µÆâ6öÆ÷#¢6V3µÆçÕÆåÆâç–·B×æVÂæF&²ç–·BÖ7W7FöÒ×&ö×C¦fö7W2µÆâ&÷&FW"Ö6öÆ÷#¢3c6#6VCµÆâ&÷‚×6†F÷s¢'‚&v&ƒ“’Âs’Â#3rÂã#R“µÆçÕÆåÆâò¢ÓÓÓÓÒÖ&¶F÷vâÖÆ–¶Rj~[ÈòÓÓÓÓÒ¢õÆâæ’Öç7vW"µÆâv†—FR×76S¢æ÷&ÖÃµÆâÆ–æRÖ†V–v‡C¢ãcµÆâföçB×6—¦S¢GƒµÆâ6öÆ÷#¢–æ†W&—CµÆçÕÆåÆâò¢jë^‰ŞY(Îj~š)™{N‹yÒ¢õÆâæ’Öç7vW"²Ö&v–ã¢‡‚²ÕÆâæ’Öç7vW"ƒÂæ’Öç7vW"ƒ"Âæ’Öç7vW"ƒ2ÅÆâæ’Öç7vW"ƒBÂæ’Öç7vW"ƒRÂæ’Öç7vW"ƒbµÆâÖ&v–ã¢'‚gƒµÆâÆ–æRÖ†V–v‡C¢ã3SµÆâföçB×vV–v‡C¢cµÆçÕÆâæ’Öç7vW"ƒ²föçB×6—¦S¢#ƒ²ÕÆâæ’Öç7vW"ƒ"²föçB×6—¦S¢‡ƒ²ÕÆâæ’Öç7vW"ƒ2²föçB×6—¦S¢gƒ²ÕÆâæ’Öç7vW"ƒB²föçB×6—¦S¢Wƒ²ÕÆâæ’Öç7vW"ƒRÂæ’Öç7vW"ƒb²föçB×6—¦S¢Gƒ²ÕÆåÆâò¢™;îhêR¢õÆâæ’Öç7vW"µÆâFW‡BÖFV6÷&F–öã¢VæFW&Æ–æSµÆâ7W'6÷#¢ö–çFW#µÆçÕÆåÆâò¢[É^yJYÙr¢õÆâæ’Öç7vW"&Æö6·V÷FRµÆâÖ&v–ã¢‡‚µÆâFF–æs¢g‚ƒµÆâ&÷&FW"ÖÆVgC¢7‚6öÆ–B&v&ƒÃÃÃã"“µÆâ&6¶w&÷VæC¢&v&ƒÃÃÃã2“µÆçÕÆåÆâò¢kN[›>{«ò¢õÆâæ’Öç7vW"‡"µÆâ&÷&FW#¢µÆâ&÷&FW"×F÷¢‚6öÆ–B&v&ƒÃÃÃãR“µÆâÖ&v–ã¢‚µÆçÕÆåÆâò¢Kº>zYÙ~KˆîŠÎXh^Kº>z¢õÆâæ’Öç7vW"&Rç–·BÖÖBÖ6öFRµÆâÖ&v–ã¢‡‚µÆâFF–æs¢ƒµÆâ÷fW&fÆ÷s¢WFóµÆâ&÷&FW#¢‚6öÆ–B&v&ƒÃÃÃãR“µÆâ&÷&FW"×&F—W3¢gƒµÆâ&6¶w&÷VæC¢6cvc†fµÆçÕÆâæ’Öç7vW"&Rç–·BÖÖBÖ6öFR6öFRµÆâföçBÖfÖ–Ç“¢V’ÖÖöæ÷76RÂ4dÖöæòÕ&VwVÆ"ÂÖVæÆòÂ6öç6öÆ2Â$Æ–&W&F–öâÖöæò"ÂÖöæ÷76SµÆâföçB×6—¦S¢'ƒµÆçÕÆâæ’Öç7vW"6öFRç–·BÖÖBÖ–æÆ–æRµÆâFF–æs¢‚GƒµÆâ&÷&FW#¢‚6öÆ–B&v&ƒÃÃÃãR“µÆâ&÷&FW"×&F—W3¢GƒµÆâ&6¶w&÷VæC¢6cvc†fµÆâföçBÖfÖ–Ç“¢V’ÖÖöæ÷76RÂ4dÖöæòÕ&VwVÆ"ÂÖVæÆòÂ6öç6öÆ2Â$Æ–&W&F–öâÖöæò"ÂÖöæ÷76SµÆâföçB×6—¦S¢'ƒµÆçÕÆåÆâò¢X‰~Š‚¢õÆâæ’Öç7vW"VÂÂæ’Öç7vW"öÂµÆâÖ&v–ã¢g‚g‚#'ƒ²ÆçÕÆâæ’Öç7vW"VÂ²Æ—7B×7G–ÆS¢F—63²ÕÆâæ’Öç7vW"öÂ²Æ—7B×7G–ÆS¢FV6–ÖÃ²ÕÆåÆâò¢ŠjÂ¢õÆâæ’Öç7vW"F&ÆRµÆâ&÷&FW"Ö6öÆÆ6S¢6öÆÆ6SµÆâÖ&v–ã¢‡‚µÆâv–GFƒ¢SµÆâÖ‚×v–GFƒ¢SµÆçÕÆâæ’Öç7vW"F‚Âæ’Öç7vW"FBµÆâ&÷&FW#¢‚6öÆ–B&v&ƒÃÃÃãR“µÆâFF–æs¢g‚‡ƒµÆâFW‡BÖÆ–vã¢ÆVgCµÆçÕÆâæ’Öç7vW"F†VBF‚µÆâ&6¶w&÷VæC¢&v&ƒÃÃÃãR“µÆâföçB×vV–v‡C¢cµÆçÕÆåÆâò¢˜.˜XŞk{ˆ›"¢õÆäÖVF–‡&VfW'2Ö6öÆ÷"×66†VÖS¢F&²’µÆâæ’Öç7vW"&Æö6·V÷FRµÆâ&÷&FW"ÖÆVgBÖ6öÆ÷#¢&v&ƒ#SRÃ#SRÃ#SRÃã3R“µÆâ&6¶w&÷VæC¢&v&ƒ#SRÃ#SRÃ#SRÃãb“µÆâÕÆâæ’Öç7vW"&Rç–·BÖÖBÖ6öFRÅÆâæ’Öç7vW"6öFRç–·BÖÖBÖ–æÆ–æRµÆâ&6¶w&÷VæC¢3CƒµÆâ&÷&FW"Ö6öÆ÷#¢&v&ƒ#SRÃ#SRÃ#SRÃã"“µÆâÕÆâæ’Öç7vW"‡"²&÷&FW"×F÷Ö6öÆ÷#¢&v&ƒ#SRÃ#SRÃ#SRÃã"“²ÕÆâæ’Öç7vW"F‚Âæ’Öç7vW"FB²&÷&FW"Ö6öÆ÷#¢&v&ƒ#SRÃ#SRÃ#SRÃã"“²ÕÆâæ’Öç7vW"F†VBF‚²&6¶w&÷VæC¢&v&ƒ#SRÃ#SRÃ#SRÃã‚“²ÕÆçÕÆåÆâ7–·BÖ’Öç7vW"çFW‚ÖVæ&ÆVB7fr²fW'F–6ÂÖÆ–vã¢Ö–FFÆS²ÕÆâ7–·BÖ’Öç7vW"çFW‚ÖVæ&ÆVBäÖF„¦‚²Æ–æRÖ†V–v‡C¢²ÕÆâ7–·BÖ’Öç7vW"æÖ§‚×7fr²6öÆ÷#¢7W'&VçD6öÆ÷#²ÕÆâs°¢òò7&2÷V’÷7G–ÆW2æ§0¢gVæ7F–öâ–æ¦V7E7G–ÆW2‚’°¢vÒæFE7G–ÆR†772“°¢Ğ¢òò7&2÷V’÷FööÆ&"æ§0¢gVæ7F–öâ–ç7FÆÅFööÆ&"‚’°¢òòK¸^X‰¾[»®ZëYšKˆîhÈ™*îûÉ¾X[~KÙ>™Ú.iÛşK˜¾YîyJ‚…DÔÂõgVRhê^XZP¢6öç7B&"ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&F—b"“°¢&"æ–BÒ'–·BÖ†VÇW"×FööÆ&"#°¢&"æ–ææW$…DÔÂÒÆâÇ7â–CÒ'–·BÖ'FâÖ&VÆÂ"6Æ73Ò&'Fâ"F—FÆSÒ.Kšš)hù˜i"#ãÆ’6Æ73Ò&f2fÖ&VÆÂ#ãÂö“ãÂ÷7ãåÆâÇ7â–CÒ'–·BÖ'Fâ×&W2"6Æ73Ò&'Fâ"F—FÆSÒ.ŠûîK»nkXşŠx‚#ãÆ’6Æ73Ò&f2fÖf–ÆR×÷vW'ö–çB#ãÂö“ãÂ÷7ãåÆâÇ7â–CÒ'–·BÖ'FâÖ’"6Æ73Ò&'Fâ"F—FÆSÒ$Šz>zÙB#ãÆ’6Æ73Ò&f2f×&ö&÷B#ãÂö“ãÂ÷7ãåÆâÇ7â–CÒ'–·BÖ'FâÖWFòÖç7vW""6Æ73Ò&'Fâ"F—FÆSÒ.ˆz®XªKÙÎzÙB#ãÆ’6Æ73Ò&f2fÖÖv–2×væB×7&¶ÆW2#ãÂö“ãÂ÷7ãåÆâÇ7â–CÒ'–·BÖ'Fâ×6WGF–æw2"6Æ73Ò&'Fâ"F—FÆSÒ.Šëî{Úâ#ãÆ’6Æ73Ò&f2fÖ6ör#ãÂö“ãÂ÷7ãåÆâÇ7â–CÒ'–·BÖ'FâÖ†VÇ"6Æ73Ò&'Fâ"F—FÆSÒ.KÛşyJiYzˆ²#ãÆ’6Æ73Ò&f2f×VW7F–öâÖ6—&6ÆR#ãÂö“ãÂ÷7ãåÆâ°¢Fö7VÖVçBæ&öG’æVæD6†–ÆB†&"“°¢òòX‰ŞZx¾køkK¾h¢–b‡V’æ6öæf–rææ÷F–g•&ö&ÆV×2’&"çVW'•6VÆV7F÷"‚"7–·BÖ'FâÖ&VÆÂ"“òæ6Æ74Æ—7BæFB‚&7F—fR"“°¢V’çWFFTWFôç7vW$'Fâ‚“°¢òòK¨¾K»n{¹Zé ¢&"çVW'•6VÆV7F÷"‚"7–·BÖ'FâÖ&VÆÂ"“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ°¢V’æ6öæf–rææ÷F–g•&ö&ÆV×2ÒV’æ6öæf–rææ÷F–g•&ö&ÆV×3°¢V’ç6fT6öæf–r‚“°¢V’çFö7B†Kšš)hù˜i.ûÉ¢G·V’æ6öæf–rææ÷F–g•&ö&ÆV×2ò.[È"¢.X[2'Ö“°¢&"çVW'•6VÆV7F÷"‚"7–·BÖ'FâÖ&VÆÂ"“òæ6Æ74Æ—7BçFövvÆR‚&7F—fR"ÂV’æ6öæf–rææ÷F–g•&ö&ÆV×2“°¢Ò“°¢òòŠûîK»nkXşŠxhÈ™*à¢&"çVW'•6VÆV7F÷"‚"7–·BÖ'Fâ×&W2"“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ°¢6öç7B'FâÒ&"çVW'•6VÆV7F÷"‚"7–·BÖ'Fâ×&W2"“°¢6öç7B—47F—fRÒ'Fâæ6Æ74Æ—7Bæ6öçF–ç2‚&7F—fR"“°¢V’ç6†÷u&W6VçFF–öåæVÃòâ‚—47F—fR“°¢'Fâæ6Æ74Æ—7BçFövvÆR‚&7F—fR"Â—47F—fR“°¢Ò“°¢òòhÈ™*à¢&"çVW'•6VÆV7F÷"‚"7–·BÖ'FâÖ’"“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ°¢6öç7B'FâÒ&"çVW'•6VÆV7F÷"‚"7–·BÖ'FâÖ’"“°¢6öç7B—47F—fRÒ'Fâæ6Æ74Æ—7Bæ6öçF–ç2‚&7F—fR"“°¢V’ç6†÷t•æVÃòâ‚—47F—fR“°¢'Fâæ6Æ74Æ—7BçFövvÆR‚&7F—fR"Â—47F—fR“°¢Ò“°¢&"çVW'•6VÆV7F÷"‚"7–·BÖ'FâÖWFòÖç7vW""“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ°¢V’æ6öæf–ræWFôç7vW"ÒV’æ6öæf–ræWFôç7vW#°¢V’ç6fT6öæf–r‚“°¢V’çFö7B†ˆz®XªKÙÎzÙNûÉ¢G·V’æ6öæf–ræWFôç7vW"ò.[È"¢.X[2'Ö“°¢V’çWFFTWFôç7vW$'Fâ‚“°¢Ò“°¢&"çVW'•6VÆV7F÷"‚"7–·BÖ'Fâ×6WGF–æw2"“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ°¢V’çFövvÆU6WGF–æw5æVÃòâ‚“°¢Ò“°¢&"çVW'•6VÆV7F÷"‚"7–·BÖ'FâÖ†VÇ"“òæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ°¢V’çFövvÆUGWF÷&–ÅæVÃòâ‚“°¢Ò“°¢Ğ¢òò7&2ö6÷&R÷'VçF–ÖRÖÖöFRæ§0¢6öç7BÔô$”ÄUõ$õUDUõEDU$âÒõåÂöÕÂ÷c"ƒó¥Â÷ÂB’ó°¢6öç7B$TD•$T5EôÄôõõ5Dõ$tUô´U’Ò%õ÷–·EöFW6·F÷÷&÷WFUöwV&E÷F&vWEõò#°¢gVæ7F–öâ—4Öö&–ÆU&VÖ–æFW%F‚‡F†æÖRÒ""’°¢&WGW&âÔô$”ÄUõ$õUDUõEDU$âçFW7B…7G&–ær‡F†æÖR’“°¢Ğ¢gVæ7F–öâæ÷&ÖÆ—¦U'B‡fÇVRÂ&Vf—‚’°¢6öç7BFW‡BÒ7G&–ær‡fÇVRÇÂ""“°¢–b‚FW‡BÇÂFW‡Bç7F'G5v—F‚‡&Vf—‚’’&WGW&âFW‡C°¢&WGW&âG·&Vf—‡ÒG·FW‡GÖ°¢Ğ¢ò¢ ¢¢Ö2Öö&–ÆRvRFò—G2FW6·F÷WV—fÆVçBv†–ÆR&W6W'f–ærF†RvRw0¢¢VW'’7G&–æræB†6‚âçVÆÂ&W7VÇBÖVç2F†BF†R&÷WFR—2Ç&VG¢¢FW6·F÷Ö6ö×F–&ÆRæB×W7B&RÆVgBVçF÷V6†VBà¢¢ògVæ7F–öâvWDFW6·F÷&÷WFTf÷$Öö&–ÆTÆö6F–öâ‡·F†æÖS¢F†æÖRÒ""Â6V&6ƒ¢6V&6‚Ò""Â†6ƒ¢†6‚Ò"'ÒÒ·Ò’°¢6öç7B7W'&VçEF‚Ò7G&–ær‡F†æÖR“°¢–b‚—4Öö&–ÆU&VÖ–æFW%F‚†7W'&VçEF‚’’&WGW&âçVÆÃ°¢6öç7BÖö&–ÆU7Vff—‚Ò7W'&VçEF‚ç6Æ–6R‚"öÒ÷c""æÆVæwF‚“°¢6öç7BFW6·F÷F‚ÒÖö&–ÆU7Vff—‚ÓÓÒ""ÇÂÖö&–ÆU7Vff—‚ÓÓÒ"ò"ò"÷c"÷vV"ö–æFW‚"¢÷c"÷vV"G¶Öö&–ÆU7Vff—‡Ö°¢&WGW&âG¶FW6·F÷F‡ÒG¶æ÷&ÖÆ—¦U'B‡6V&6‚Â#ò"—ÒG¶æ÷&ÖÆ—¦U'B††6‚Â"2"—Ö°¢Ğ¢gVæ7F–öâvWDFW6·F÷&÷WFTf÷$æf–vF–öâ‡fÇVRÂÆö6F–öâ’°¢–b‡fÇVRÓÓÒfö–BÇÂfÇVRÓÓÒçVÆÂÇÂfÇVRÓÓÒ""’&WGW&âçVÆÃ°¢G'’°¢6öç7BW&ÂÒæWrU$Â…7G&–ær‡fÇVR’ÂÆö6F–öãòæ‡&VbÇÂÆö6F–öãòæ÷&–v–âÇÂfö–B“°¢–b†Æö6F–öãòæ÷&–v–âbbW&Âæ÷&–v–âÓÒÆö6F–öâæ÷&–v–â’&WGW&âçVÆÃ°¢&WGW&âvWDFW6·F÷&÷WFTf÷$Öö&–ÆTÆö6F–öâ‡W&Â“°¢Ò6F6‚°¢&WGW&âçVÆÃ°¢Ğ¢Ğ¢gVæ7F–öâ6ÆV%&VF—&V7DÆö÷Ö&¶W"‡F&vWEv–æF÷r’°¢G'’°¢F&vWEv–æF÷sòç6W76–öå7F÷&vSòç&VÖ÷fT—FVÒ…$TD•$T5EôÄôõõ5Dõ$tUô´U’“°¢Ò6F6‚·Ğ¢Ğ¢gVæ7F–öâ&VF—&V7D7W'&VçDÖö&–ÆU&÷WFR‡F&vWEv–æF÷r’°¢6öç7BÆö6F–öâÒF&vWEv–æF÷sòæÆö6F–öã°¢6öç7BF&vWBÒvWDFW6·F÷&÷WFTf÷$Öö&–ÆTÆö6F–öâ†Æö6F–öâ“°¢–b‚F&vWB’°¢6ÆV%&VF—&V7DÆö÷Ö&¶W"‡F&vWEv–æF÷r“°¢&WGW&â°¢&VF—&V7FVC¢fÇ6RÀ¢&V6öã¢&FW6·F÷×&÷WFR ¢Ó°¢Ğ¢G'’°¢6öç7B7F÷&vRÒF&vWEv–æF÷sòç6W76–öå7F÷&vS°¢–b‡7F÷&vSòævWD—FVÒ…$TD•$T5EôÄôõõ5Dõ$tUô´U’’ÓÓÒF&vWB’°¢6öç7BÖW76vRÒ.™ºŠûîZ.K¸Ş[njÎ™Ú.š^˜xŞZé®Y	X‹h˜¾iË®x˜8.Šû~YÊkXşŠxYšKŠŞY
şyJ(	ÎjÎ™Ú.x˜{Ùz¹(	ŞYî˜xŞikh™>[ÈŠûîzˆ¾8"#°¢6öç6öÆRçv&â†¾™ºŠûîZ.Xªh˜µÕµt$åÒG¶ÖW76vWÖ“°¢G'’°¢F&vWEv–æF÷sòæÆW'Còâ†ÖW76vR“°¢Ò6F6‚·Ğ¢&WGW&â°¢&VF—&V7FVC¢fÇ6RÀ¢&V6öã¢&Æö÷×&WfVçFVB ¢Ó°¢Ğ¢7F÷&vSòç6WD—FVÒ…$TD•$T5EôÄôõõ5Dõ$tUô´U’ÂF&vWB“°¢Ò6F6‚·Ğ¢Æö6F–öãòç&WÆ6Sòâ‡F&vWB“°¢&WGW&â°¢&VF—&V7FVC¢G'VRÀ¢&V6öã¢&Öö&–ÆR×&÷WFR ¢Ó°¢Ğ¢ò¢ ¢¢¶VW2F†RW6W'67&—BFW6·F÷ÖöæÇ’â—B6F6†W2F†RÖö&–ÆRÆæF–ær&÷WFR0¢¢V&Ç’2÷76–&ÆRæBÇ6ò&Ww&—FW25ö†—7F÷'’öÆ–æ²æf–vF–öâ&Vf÷&RF†P¢¢†÷7BÆ–6F–öâ6âVçFW"öÒ÷c"à¢¢ògVæ7F–öâ–ç7FÆÄFW6·F÷&÷WFTwV&B‡·F&vWEv–æF÷s¢F&vWEv–æF÷rÒ‡G—Vöbv–æF÷rÓÒ'VæFVf–æVB"òv–æF÷r¢çVÆÂ’ÂF&vWDFö7VÖVçC¢F&vWDFö7VÖVçBÒ‡G—VöbFö7VÖVçBÓÒ'VæFVf–æVB"òFö7VÖVçB¢çVÆÂ—ÒÒ·Ò’°¢6öç7B–æ—F–Å&W7VÇBÒ&VF—&V7D7W'&VçDÖö&–ÆU&÷WFR‡F&vWEv–æF÷r“°¢–b†–æ—F–Å&W7VÇBç&VF—&V7FVBÇÂ–æ—F–Å&W7VÇBç&V6öâÓÓÒ&Æö÷×&WfVçFVB"’&WGW&â–æ—F–Å&W7VÇC°¢6öç7B†—7F÷'’ÒF&vWEv–æF÷sòæ†—7F÷'“°¢6öç7BÆö6F–öâÒF&vWEv–æF÷sòæÆö6F–öã°¢f÷"†6öç7B¶W’öb²'W6…7FFR"Â'&WÆ6U7FFR"Ò’°¢6öç7B÷&–v–æÂÒ†—7F÷'“òå¶¶W•Ó°¢–b‡G—Vöb÷&–v–æÂÓÒ&gVæ7F–öâ"’6öçF–çVS°¢†—7F÷'•¶¶W•ÒÒgVæ7F–öâ‚ââæ&w2’°¢6öç7B&WÆ6VÖVçBÒvWDFW6·F÷&÷WFTf÷$æf–vF–öâ†&w5³%ÒÂÆö6F–öâ“°¢–b‡&WÆ6VÖVçB’&w5³%ÒÒ&WÆ6VÖVçC°¢&WGW&â÷&–v–æÂæÇ’‡F†—2Â&w2“°¢Ó°¢Ğ¢6öç7B&VF—&V7D–dÖö&–ÆRÒ‚’Óâ&VF—&V7D7W'&VçDÖö&–ÆU&÷WFR‡F&vWEv–æF÷r“°¢F&vWEv–æF÷sòæFDWfVçDÆ—7FVæW#òâ‚'÷7FFR"Â&VF—&V7D–dÖö&–ÆR“°¢F&vWEv–æF÷sòæFDWfVçDÆ—7FVæW#òâ‚&†6†6†ævR"Â&VF—&V7D–dÖö&–ÆR“°¢F&vWDFö7VÖVçCòæFDWfVçDÆ—7FVæW#òâ‚&6Æ–6²"ÂWfVçBÓâ°¢–b†WfVçCòæFVfVÇE&WfVçFVBÇÂWfVçCòæ'WGFöâÓÒfö–BbbWfVçBæ'WGFöâÓÒÇÂWfVçBæÖWF¶W’ÇÂWfVçBæ7G&Ä¶W’ÇÂWfVçBç6†–gD¶W’ÇÂWfVçBæÇD¶W’’&WGW&ã°¢6öç7Bæ6†÷"ÒWfVçBçF&vWCòæ6Æ÷6W7Còâ‚&¶‡&VeÒ"“°¢–b‚æ6†÷"ÇÂæ6†÷"çF&vWBbbæ6†÷"çF&vWBÓÒ%÷6VÆb"ÇÂæ6†÷"æ†4GG&–'WFSòâ‚&F÷væÆöB"’’&WGW&ã°¢6öç7B&WÆ6VÖVçBÒvWDFW6·F÷&÷WFTf÷$æf–vF–öâ†æ6†÷"æ‡&VbÂÆö6F–öâ“°¢–b‚&WÆ6VÖVçB’&WGW&ã°¢WfVçBç&WfVçDFVfVÇB‚“°¢Æö6F–öãòæ76–vãòâ‡&WÆ6VÖVçB“°¢ÒÂG'VR“°¢&WGW&â–æ—F–Å&W7VÇC°¢Ğ¢ò¢¢Öö&–ÆR&÷WFW2&R&VF—&V7BÖöæÇ“²F†R76—7FçBæòÆöævW"'Vç2Öö&–ÆR'VçF–ÖRâ¢ògVæ7F–öâvWE'VçF–ÖTÖöFR‡F†æÖRÒ""’°¢&WGW&â—4Öö&–ÆU&VÖ–æFW%F‚‡F†æÖR’ò&FW6·F÷×&VF—&V7B"¢&FW6·F÷#°¢Ğ¢ò¢¢&ö÷BU$Ç2&R&VF—&V7BVçG'’ö–çG2Âæ÷BgVÆÂFW6·F÷'VçF–ÖR–WBâ¢ògVæ7F–öâ6†÷VÆE7F'DFW6·F÷'VçF–ÖR‡F†æÖRÒ""’°¢6öç7Bæ÷&ÖÆ—¦VEF‚Ò7G&–ær‡F†æÖR“°¢&WGW&âæ÷&ÖÆ—¦VEF‚ÓÒ"ò"bbæ÷&ÖÆ—¦VEF‚ÓÒ""bbvWE'VçF–ÖTÖöFR†æ÷&ÖÆ—¦VEF‚’ÓÓÒ&FW6·F÷#°¢Ğ¢òò7&2ö–æFW‚æ§0¢gVæ7F–öâÆöDd‚’°¢6öç7BÆ–æ²ÒFö7VÖVçBæ7&VFTVÆVÖVçB‚&Æ–æ²"“°¢Æ–æ²ç&VÂÒ'7G–ÆW6†VWB#°¢Æ–æ²æ‡&VbÒ&‡GG3¢òö6Fæ§2æ6Æ÷VFfÆ&Ræ6öÒö¦‚öÆ–'2öföçBÖvW6öÖRóbãBãö772öÆÂæÖ–âæ772#°¢Fö7VÖVçBæ†VBæVæD6†–ÆB†Æ–æ²“°¢Ğ¢gVæ7F–öâÖ–&TWFõ&VÆöDöäÖ÷VçB‚’°¢G'’°¢òò–bF†R67&—B—2Ö÷VçFVBgFW"DôÒ—2Ç&VG’&VG’Â&VÆöBöæ6R6ò„…"õu2–çFW&6WF÷'26â&ÒV&Ç’à¢òòwV&FVB'’6W76–öå7F÷&vRFòfö–B–æf–æ—FR&VÆöBÆö÷2à¢6öç7B¶W’Ò%õ÷–·Eö†VÇW%öWFõ÷&VÆöEööæ6Uõò#°¢–b†Fö7VÖVçBç&VG•7FFRÓÓÒ&ÆöF–ær"’&WGW&âfÇ6S°¢–b‚v–æF÷rç6W76–öå7F÷&vR’&WGW&âfÇ6S°¢–b‡v–æF÷rç6W76–öå7F÷&vRævWD—FVÒ†¶W’’ÓÓÒ#"’&WGW&âfÇ6S°¢v–æF÷rç6W76–öå7F÷&vRç6WD—FVÒ†¶W’Â#"“°¢6öç6öÆRæÆör‚%µ”µBÔ†VÇW%Õ´”ädõÒÆFRÖ÷VçBFWFV7FVC²&VÆöF–æröæ6RFò&Ò–çFW&6WF÷'2â"“°¢v–æF÷rç6WEF–ÖV÷WB‚‚’Óâv–æF÷ræÆö6F–öâç&VÆöB‚’ÂS“°¢&WGW&âG'VS°¢Ò6F6‚°¢&WGW&âfÇ6S°¢Ğ¢Ğ¢gVæ7F–öâ7F'EW&–öF–5&VÆöB†÷G2Ò·Ò’°¢G'’°¢6öç7B–çFW'fÄ×2ÒçVÖ&W"æ—4f–æ—FR†÷G2æ–çFW'fÄ×2’ò÷G2æ–çFW'fÄ×2¢R¢c¢S3°¢6öç7BöæÇ•v†Vä†–FFVâÒ÷G2æöæÇ•v†Vä†–FFVâÓÒfÇ6S°¢6öç7B6¶—ÆW76öåvW2Ò÷G2ç6¶—ÆW76öåvW2ÓÒfÇ6S°¢–b‚çVÖ&W"æ—4f–æ—FR†–çFW'fÄ×2’ÇÂ–çFW'fÄ×2ÃÒ’&WGW&ã°¢v–æF÷rç6WD–çFW'fÂ‚‚’Óâ°¢G'’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕÕ´DT%TuÒW&–öF–2F–6²"Â°¢F†æÖS¢v–æF÷ræÆö6F–öâçF†æÖRÀ¢†–FFVã¢Fö7VÖVçBæ†–FFVà¢Ò“°¢–b‡6¶—ÆW76öåvW2bbõÂöÆW76öåÂòòçFW7B‡v–æF÷ræÆö6F–öâçF†æÖR’’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´DT%TuÒ6¶—&VÆöC¢ÆW76öâvR"“°¢&WGW&ã°¢Ğ¢–b†öæÇ•v†Vä†–FFVâbbFö7VÖVçBæ†–FFVâ’°¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´DT%TuÒ6¶—&VÆöC¢vRf—6–&ÆR"“°¢&WGW&ã°¢Ğ¢6öç6öÆRæÆör‚%¾™ºŠûîZ.Xªh˜µÕ´”ädõÒW&–öF–2&VÆöBG&–vvW&VBFòfö–B¦öÖ&–R6W76–öââ"“°¢v–æF÷ræÆö6F–öâç&VÆöB‚“°¢Ò6F6‚†R’°¢6öç6öÆRæW'&÷"†R“°¢Ğ¢ÒÂ–çFW'fÄ×2“°¢Ò6F6‚·Ğ¢Ğ¢ÆWBFW6·F÷7F'FVBÒfÇ6S°¢ÆWB'VçF–ÖT&ö÷EVWVVBÒfÇ6S°¢gVæ7F–öâ7F'DFW6·F÷'VçF–ÖR‚’°¢–b†FW6·F÷7F'FVB’&WGW&ã°¢FW6·F÷7F'FVBÒG'VS°¢–b†Ö–&TWFõ&VÆöDöäÖ÷VçB‚’’&WGW&ã°¢7F'EW&–öF–5&VÆöB‡°¢–çFW'fÄ×3¢¢c¢S2À¢öæÇ•v†Vä†–FFVã¢fÇ6RÀ¢6¶—ÆW76öåvW3¢G'VP¢Ò“°¢ÆöDd‚“°¢–æ¦V7E7G–ÆW2‚“°¢V’åöÖ÷VçDÆÃòâ‚“°¢–ç7FÆÅ„…$–çFW&6WF÷"‚“°¢–ç7FÆÅFööÆ&"‚“°¢7F–öç2ç7F'DWFôç7vW$Æö÷‚“°¢7F–öç2æÆVæ6„ÆW76öä†VÇW"‚“°¢Ğ¢gVæ7F–öâ&ö÷D7W'&VçE'VçF–ÖR‚’°¢6öç7BF†æÖRÒv–æF÷ræÆö6F–öâçF†æÖS°¢òòjYËYØXú®iŠşz¹x+y¨N‹{>‹ÚÎXZ^Xú>ûÉ²öÒ÷c"KÉ®yKFö7VÖVçB×7F'BZèXÚ¾iKXiûÈÀ¢òòYÊiKXiZèÎh‰X˜ŞKˆŞY
şXªK»¾KÙ^ŠûîZ.‹ùŠÎi{n8 ¢–b‡6†÷VÆE7F'DFW6·F÷'VçF–ÖR‡F†æÖR’’7F'DFW6·F÷'VçF–ÖR‚“°¢Ğ¢gVæ7F–öâVWVU'VçF–ÖT&ö÷B‚’°¢–b‡'VçF–ÖT&ö÷EVWVVB’&WGW&ã°¢'VçF–ÖT&ö÷EVWVVBÒG'VS°¢6öç7B'VâÒ‚’Óâ°¢'VçF–ÖT&ö÷EVWVVBÒfÇ6S°¢&ö÷D7W'&VçE'VçF–ÖR‚“°¢Ó°¢–b†Fö7VÖVçBæ&öG’’&öÖ—6Rç&W6öÇfR‚’çF†Vâ‡'Vâ“²VÇ6RFö7VÖVçBæFDWfVçDÆ—7FVæW"‚$DôÔ6öçFVçDÆöFVB"Â'VâÂ°¢öæ6S¢G'VP¢Ò“°¢Ğ¢gVæ7F–öâ–ç7FÆÅ'VçF–ÖU&÷WFUvF6†W"‚’°¢6öç7BF&vWBÒvÒçWrÇÂv–æF÷s°¢6öç7B†—7F÷'’ÒF&vWBæ†—7F÷'“°¢f÷"†6öç7B¶W’öb²'W6…7FFR"Â'&WÆ6U7FFR"Ò’°¢6öç7B÷&–v–æÂÒ†—7F÷'“òå¶¶W•Ó°¢–b‡G—Vöb÷&–v–æÂÓÒ&gVæ7F–öâ"’6öçF–çVS°¢†—7F÷'•¶¶W•ÒÒgVæ7F–öâ‚ââæ&w2’°¢6öç7B&W7VÇBÒ÷&–v–æÂæÇ’‡F†—2Â&w2“°¢VWVU'VçF–ÖT&ö÷B‚“°¢&WGW&â&W7VÇC°¢Ó°¢Ğ¢F&vWBæFDWfVçDÆ—7FVæW#òâ‚'÷7FFR"ÂVWVU'VçF–ÖT&ö÷B“°¢F&vWBæFDWfVçDÆ—7FVæW#òâ‚&†6†6†ævR"ÂVWVU'VçF–ÖT&ö÷B“°¢Ğ¢†gVæ7F–öâÖ–â‚’°¢6öç7BF&vWEv–æF÷rÒvÒçWrÇÂv–æF÷s°¢6öç7BwV&BÒ–ç7FÆÄFW6·F÷&÷WFTwV&B‡°¢F&vWEv–æF÷s¢F&vWEv–æF÷rÀ¢F&vWDFö7VÖVçC¢F&vWEv–æF÷ræFö7VÖVçBÇÂFö7VÖVç@¢Ò“°¢–b†wV&Bç&VF—&V7FVBÇÂwV&Bç&V6öâÓÓÒ&Æö÷×&WfVçFVB"’&WGW&ã°¢òòvV%6ö6¶WBæVVG2Fò&RF6†VBBFö7VÖVçB×7F'Bà¢–ç7FÆÅu4–çFW&6WF÷"‡°¢vWE'VçF–ÖTÖöFS¢‚’ÓâvWE'VçF–ÖTÖöFR‡v–æF÷ræÆö6F–öâçF†æÖR¢Ò“°¢–ç7FÆÅ'VçF–ÖU&÷WFUvF6†W"‚“°¢VWVU'VçF–ÖT&ö÷B‚“°¢Ò’‚“°§Ò’‚“°