// ==UserScript==
// @name         AI雨课堂助手（JS版）
// @namespace    https://github.com/ZaytsevZY/yuketang-helper-auto
// @version      1.22.1
// @homepageURL  https://github.com/Frank-678/yuketang-helper-auto
// @downloadURL  https://raw.githubusercontent.com/Frank-678/yuketang-helper-auto/main/release/ykt-helper.user.js
// @updateURL    https://raw.githubusercontent.com/Frank-678/yuketang-helper-auto/main/release/ykt-helper.user.js
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
// @grant        GM_openInTab
// @grant        GM_getTab
// @grant        GM_getTabs
// @grant        GM_saveTab
// @grant        unsafeWindow
// @run-at       document-start
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
        const notice = new window.Notification(opt?.title || "雨课堂提醒", {
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
  const scriptLoads = new Map;
  function loadScriptOnce(src) {
    if (scriptLoads.has(src)) return scriptLoads.get(src);
    const promise = new Promise((resolve, reject) => {
      const existing = [ ...document.scripts ].find(s => s.src === src);
      const script = existing || document.createElement("script");
      const finish = error => {
        clearTimeout(timer);
        script.removeEventListener("load", loaded);
        script.removeEventListener("error", failed);
        if (error) {
          scriptLoads.delete(src);
          if (!existing) script.remove();
          reject(error);
        } else resolve();
      };
      const loaded = () => finish();
      const failed = () => finish(new Error("外部工具加载失败，请稍后重试"));
      const timer = setTimeout(() => finish(new Error("外部工具加载超时，请检查网络后重试")), 12e3);
      script.addEventListener("load", loaded, {
        once: true
      });
      script.addEventListener("error", failed, {
        once: true
      });
      if (!existing) {
        script.src = src;
        (document.head || document.documentElement).appendChild(script);
      }
    });
    scriptLoads.set(src, promise);
    return promise;
  }
  async function ensureHtml2Canvas() {
    const w = gm.uw || window;
    if (typeof w.html2canvas === "function") return w.html2canvas;
    await loadScriptOnce("https://html2canvas.hertzen.com/dist/html2canvas.min.js");
    const h2c = w.html2canvas?.default || w.html2canvas;
    if (typeof h2c === "function") return h2c;
    throw new Error("html2canvas 未正确加载");
  }
  async function ensureJsPDF() {
    const current = () => (gm.uw || window).jspdf || window.jspdf;
    if (!current()?.jsPDF) await loadScriptOnce("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
    if (!current()?.jsPDF) throw new Error("jsPDF 未加载成功");
    window.jspdf = current();
    return current();
  }
  // src/core/reminder-preferences.js
    const EVENT_PREFERENCE_KEYS = {
    "problem-start": "notifyProblemStarts",
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
    // 兼容旧版工具栏铃铛：关闭后静音所有课堂提醒。
    notifyProblems: true,
    // 事件开关
    notifyProblemStarts: true,
    notifyAssessmentPublishes: true,
    notifyCoursewarePublishes: true,
    notifyOtherPublishes: true,
    notifyLessonFinished: true,
    notifyAutoAnswerScheduled: true,
    notifyAutoAnswerStarted: true,
    notifyAutoAnswerSucceeded: true,
    notifyAutoAnswerFailed: true,
    // 提醒方式开关
    notifyNative: true,
    notifyPopup: true,
    notifySound: true
  };
  const REMINDER_EVENT_OPTIONS = [ {
    kind: "problem-start",
    key: "notifyProblemStarts",
    label: "新题 / 答题开始",
    detail: "老师开启一道可作答的习题时提醒。"
  }, {
    kind: "assessment-publish",
    key: "notifyAssessmentPublishes",
    label: "考试 / 测试题组发布",
    detail: "老师发布测试、考试或题组时提醒。"
  }, {
    kind: "courseware-publish",
    key: "notifyCoursewarePublishes",
    label: "新课件发布",
    detail: "只在老师发布新课件时提醒；翻阅旧课件和翻页不会提醒。"
  }, {
    kind: "other-publish",
    key: "notifyOtherPublishes",
    label: "其他课堂发布",
    detail: "服务器发送无法细分的发布事件时提醒。"
  }, {
    kind: "lesson-finished",
    key: "notifyLessonFinished",
    label: "课程结束",
    detail: "老师结束当前课程时提醒。"
  }, {
    kind: "auto-answer-scheduled",
    key: "notifyAutoAnswerScheduled",
    label: "自动作答已排队",
    detail: "脚本已经为新题安排延迟作答时提醒。"
  }, {
    kind: "auto-answer-started",
    key: "notifyAutoAnswerStarted",
    label: "自动作答开始",
    detail: "脚本开始调用本地或 AI 作答流程时提醒。"
  }, {
    kind: "auto-answer-succeeded",
    key: "notifyAutoAnswerSucceeded",
    label: "自动作答成功",
    detail: "答案提交成功时提醒。"
  }, {
    kind: "auto-answer-failed",
    key: "notifyAutoAnswerFailed",
    label: "自动作答失败",
    detail: "截图、AI 分析或提交失败时提醒。"
  } ];
  const REMINDER_CHANNEL_OPTIONS = [ {
    key: "notifyNative",
    label: "系统通知",
    detail: "调用浏览器 / 篡改猴的原生通知。"
  }, {
    key: "notifyPopup",
    label: "页面弹窗",
    detail: "在当前页面右下角显示提醒卡片。"
  }, {
    key: "notifySound",
    label: "提示声音",
    detail: "播放内置或自定义的提示音。"
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
    1: "单选题",
    2: "多选题",
    3: "投票题",
    4: "填空题",
    5: "主观题"
  };
  const DEFAULT_CONFIG = {
    ...REMINDER_DEFAULTS,
    autoAnswer: false,
    autoAnswerPaused: false,
    submissionPolicy: "auto",
    quickAnswerMode: "auto",
    answerPriorityTimes: "",
    fastAnswerProfileId: "",
    verifyAnswerProfileId: "",
    answerVerification: false,
    autoJoinEnabled: false,
    autoAnswerOnAutoJoin: true,
    aiAutoAnalyze: false,
    customNotifyAudioSrc: "",
    customNotifyAudioName: "",
    notifyVolume: .6,
    notifyPopupDuration: 5e3,
    autoAnswerDelay: 3e3,
    autoAnswerRandomDelay: 2e3,
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
  function makeDefaultConfig() {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
  function normalizeConfig(raw) {
    const defaults = makeDefaultConfig();
    const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const ai = value.ai && typeof value.ai === "object" && !Array.isArray(value.ai) ? value.ai : {};
    const result = {
      ...defaults,
      ...value,
      ai: {
        ...defaults.ai,
        ...ai
      }
    };
    const profiles = ai.profiles || value.profiles || defaults.profiles;
    result.ai.profiles = JSON.parse(JSON.stringify(Array.isArray(profiles) && profiles.length ? profiles : defaults.profiles));
    result.ai.activeProfileId = ai.activeProfileId || value.activeProfileId || result.ai.profiles[0].id;
    if (![ "auto", "on", "off" ].includes(result.quickAnswerMode)) result.quickAnswerMode = "auto";
    if (![ "auto", "normal", "local" ].includes(result.submissionPolicy)) result.submissionPolicy = "auto";
    return result;
  }
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
      const encoded = JSON.stringify(value);
      try {
        localStorage.setItem(this.prefix + key, encoded);
      } catch (error) {
        if (error?.name !== "QuotaExceededError") throw error;
        // Only reproducible presentation caches are evicted; never drafts/settings.
                const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith(this.prefix + "presentations-") && k !== this.prefix + key) keys.push(k);
        }
        for (const k of keys) {
          localStorage.removeItem(k);
          try {
            localStorage.setItem(this.prefix + key, encoded);
            return;
          } catch {}
        }
        throw error;
      }
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
  /** Server answers, local drafts and proposals deliberately have different fields. */  function hasSubmittedAnswer(answer) {
    if (Array.isArray(answer)) return answer.length > 0 && answer.every(x => x !== null && x !== void 0 && String(x).trim() !== "");
    if (answer && typeof answer === "object") return !!String(answer.content ?? "").trim() || Array.isArray(answer.pics) && answer.pics.length > 0;
    return answer !== null && answer !== void 0 && String(answer).trim() !== "";
  }
  function sameAnswer(problem, a, b) {
    const normalize = x => Array.isArray(x) ? Number(problem?.problemType) === 2 ? x.map(String).sort() : x.map(String) : x && typeof x === "object" ? {
      content: String(x.content ?? "").trim(),
      pics: x.pics || []
    } : x;
    return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
  }
  function validateAnswer(problem, value) {
    const type = Number(problem?.problemType);
    if ([ 1, 2, 3 ].includes(type)) {
      if (!Array.isArray(value) || !value.length || ![ 2 ].includes(type) && value.length !== 1) throw new Error("选项数量不正确");
      const allowed = (problem.options || []).map((x, i) => String(x.key ?? String.fromCharCode(65 + i)).toUpperCase());
      const out = [ ...new Set(value.map(x => String(x).trim().toUpperCase())) ];
      if (out.some(x => !/^[A-Z]$/.test(x) || allowed.length && !allowed.includes(x))) throw new Error("答案含不存在的选项");
      return type === 2 ? out.sort() : out;
    }
    if (type === 4) {
      if (!Array.isArray(value) || !hasSubmittedAnswer(value)) throw new Error("填空答案应为非空字符串数组");
      if (problem.blanks?.length && problem.blanks.length !== value.length) throw new Error(`需要 ${problem.blanks.length} 个填空答案`);
      return value.map(String);
    }
    if (type === 5 && value && !Array.isArray(value) && hasSubmittedAnswer(value)) return {
      content: String(value.content ?? ""),
      pics: Array.isArray(value.pics) ? value.pics : []
    };
    throw new Error("答案格式与题型不符");
  }
  class IdMap extends Map {
    get(k) {
      return super.get(String(k));
    }
    has(k) {
      return super.has(String(k));
    }
    set(k, v) {
      return super.set(String(k), v);
    }
    delete(k) {
      return super.delete(String(k));
    }
  }
  function accountScope() {
    try {
      const uid = document.cookie.match(/(?:^|;\s*)user_id=([^;]+)/)?.[1];
      if (uid) return `user-${uid}`;
      // The token is never persisted in a task key or diagnostic record.
            const token = localStorage.getItem("Authorization") || "";
      let hash = 2166136261;
      for (const c of token) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
      return token ? `session-${hash >>> 0}` : "anonymous";
    } catch {
      return "anonymous";
    }
  }
  const classrooms = new Map;
  let currentLessonId = null;
  function fresh(lessonId, scope) {
    return {
      lessonId: String(lessonId || ""),
      scope: scope,
      presentations: new IdMap,
      slides: new IdMap,
      problems: new IdMap,
      problemStatus: new IdMap,
      encounteredProblems: [],
      pendingEvents: new Map,
      currentPresentationId: null,
      currentSlideId: null,
      currentSelectedUrl: null,
      loadedWork: false
    };
  }
  const repo = {
    get accountId() {
      return accountScope();
    },
    get currentLessonId() {
      return currentLessonId;
    },
    set currentLessonId(value) {
      currentLessonId = value == null ? null : String(value);
    },
    forLesson(lessonId = this.currentLessonId) {
      const scope = accountScope();
      const key = `${scope}:${lessonId || ""}`;
      if (!classrooms.has(key)) classrooms.set(key, fresh(lessonId, scope));
      return classrooms.get(key);
    },
    storageKey(kind, lessonId = this.currentLessonId) {
      return `${kind}-${accountScope()}-${lessonId || "unknown"}`;
    },
    setPresentation(id, data, lessonId = this.currentLessonId, {persist: persist = true} = {}) {
      const ctx = this.forLesson(lessonId);
      const pres = {
        ...data,
        id: String(id),
        lessonId: String(lessonId || "")
      };
      ctx.presentations.set(id, pres);
      for (const raw of pres.slides || []) {
        const slide = {
          ...raw,
          id: String(raw.id),
          presentationId: String(id),
          lessonId: ctx.lessonId
        };
        ctx.slides.set(slide.id, slide);
        if (slide.problem) {
          const prob = this.upsertProblem({
            ...slide.problem,
            problemId: String(slide.problem.problemId ?? slide.problem.id),
            lessonId: ctx.lessonId,
            slideId: slide.id,
            presentationId: String(id)
          }, lessonId);
          slide.problem = prob;
          this.pushEncounteredProblem(prob, slide, id, lessonId);
        }
      }
      if (persist) try {
        const key = this.storageKey("presentations", lessonId);
        storage.alterMap(key, m => {
          m.delete(String(id));
          m.set(String(id), pres);
          const max = Math.max(1, Math.min(20, Number(storage.get("config", {})?.maxPresentations) || 5));
          while (m.size > max) m.delete(m.keys().next().value);
        });
      } catch (error) {
        this.storageError = error.message;
      }
      return pres;
    },
    upsertSlide(slide, lessonId = this.currentLessonId) {
      this.forLesson(lessonId).slides.set(slide.id, slide);
    },
    upsertProblem(prob, lessonId = this.currentLessonId) {
      const ctx = this.forLesson(lessonId);
      const old = ctx.problems.get(prob.problemId) || {};
      const next = {
        ...old,
        ...prob,
        problemId: String(prob.problemId),
        problemType: Number(prob.problemType),
        lessonId: ctx.lessonId
      };
      if (Object.hasOwn(prob, "result")) {
        next.remoteAnswer = hasSubmittedAnswer(prob.result) ? prob.result : null;
        const status = ctx.problemStatus.get(prob.problemId);
        if (status) {
          status.done = hasSubmittedAnswer(prob.result);
          status.needsReconciliation = false;
        }
      }
      Object.assign(old, next);
      ctx.problems.set(next.problemId, old);
      return old;
    },
    pushEncounteredProblem(prob, slide, presentationId, lessonId = this.currentLessonId) {
      const ctx = this.forLesson(lessonId);
      const old = ctx.encounteredProblems.find(p => String(p.problemId) === String(prob.problemId));
      const ref = {
        ...prob,
        slide: slide,
        presentationId: String(presentationId),
        slideId: String(slide.id),
        lessonId: ctx.lessonId
      };
      if (old) Object.assign(old, ref); else ctx.encounteredProblems.push(ref);
    },
    saveDraft(problemId, text, lessonId = this.currentLessonId) {
      const p = this.forLesson(lessonId).problems.get(problemId);
      if (!p) return false;
      p.draftText = String(text);
      p.draftRevision = (p.draftRevision || 0) + 1;
      p.updatedAt = Date.now();
      return this.persistWork(lessonId);
    },
    persistWork(lessonId = this.currentLessonId) {
      const ctx = this.forLesson(lessonId), now = Date.now();
      const records = [ ...ctx.problems ].map(([problemId, p]) => ({
        problemId: problemId,
        problemType: p.problemType,
        draftText: p.draftText,
        draftRevision: p.draftRevision || 0,
        aiProposal: p.aiProposal,
        pendingAnswer: p.pendingAnswer,
        proposalRaw: String(p.proposalRaw || "").slice(0, 12e3),
        result: p.result,
        updatedAt: p.updatedAt || now,
        status: ctx.problemStatus.get(problemId)
      })).filter(x => now - x.updatedAt < 864e5).slice(-100);
      try {
        storage.set(this.storageKey("work", lessonId), records);
        return true;
      } catch (error) {
        this.storageError = error.message;
        return false;
      }
    },
    loadWork(lessonId = this.currentLessonId) {
      const ctx = this.forLesson(lessonId);
      if (ctx.loadedWork) return;
      ctx.loadedWork = true;
      const records = storage.get(this.storageKey("work", lessonId), []);
      for (const record of Array.isArray(records) ? records : []) {
        if (!record?.problemId || Date.now() - record.updatedAt > 864e5) continue;
        const existing = ctx.problems.get(record.problemId);
        const p = {
          ...existing || {},
          ...record,
          lessonId: ctx.lessonId
        };
        delete p.status;
        // Fresh server data wins over a previously cached server answer.
                if (existing && Object.hasOwn(existing, "result")) p.result = existing.result;
        if (existing) Object.assign(existing, p);
        ctx.problems.set(record.problemId, existing || p);
        if (record.status) ctx.problemStatus.set(record.problemId, {
          ...record.status,
          answering: false,
          autoAnswerTime: null,
          phase: record.status.phase === "submitting" ? "unknown" : record.status.phase,
          needsReconciliation: [ "submitting", "unknown" ].includes(record.status.phase)
        });
      }
    },
    loadStoredPresentations(lessonId = this.currentLessonId) {
      if (!lessonId) return;
      // Legacy per-lesson cache is accepted once; new writes are account scoped.
            const cached = storage.getMap(this.storageKey("presentations", lessonId));
      for (const [id, data] of cached) this.setPresentation(id, data, lessonId, {
        persist: false
      });
      this.loadWork(lessonId);
    },
    listeningLessons: new Set,
    lessonTokens: new IdMap,
    lessonSockets: new IdMap,
    autoJoinRunning: false,
    autoJoinedLessons: new Set,
    forceAutoAnswerLessons: new Set,
    markLessonConnected(lessonId, ws, token) {
      const id = String(lessonId);
      if (token) this.lessonTokens.set(id, token);
      if (ws) this.lessonSockets.set(id, ws);
      this.listeningLessons.add(id);
    },
    isLessonConnected(lessonId) {
      const ws = this.lessonSockets.get(lessonId);
      return ws && (!ws.__yktAccountId || ws.__yktAccountId === this.accountId) && (ws.readyState === 0 || ws.readyState === 1) ? ws : false;
    },
    markLessonAutoJoined(lessonId, enabled = true) {
      if (lessonId == null) return;
      if (enabled) this.autoJoinedLessons.add(String(lessonId)); else this.autoJoinedLessons.delete(String(lessonId));
    }
  };
  for (const key of [ "presentations", "slides", "problems", "problemStatus", "encounteredProblems", "currentPresentationId", "currentSlideId", "currentSelectedUrl" ]) Object.defineProperty(repo, key, {
    get() {
      return this.forLesson()[key];
    },
    set(value) {
      this.forLesson()[key] = value;
    }
  });
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
  var tpl$5 = '<div id="ykt-settings-panel" class="ykt-panel">\n  <div class="panel-header">\n    <h3>AI雨课堂助手设置</h3>\n    <div class="setting-actions">\n        <button id="ykt-btn-settings-save">保存设置</button>\n        <button id="ykt-btn-settings-reset" color="red">重置为默认</button>\n        <button id="ykt-btn-export-diag" title="导出自动作答运行记录，课堂中出问题时发给开发者">导出诊断日志</button>\n    </div>\n    <span class="close-btn" id="ykt-settings-close"><i class="fas fa-times"></i></span>\n  </div>\n\n  <div class="panel-body">\n    <div class="settings-content">\n      <div class="setting-group">\n      <h4>AI配置</h4>\n\n        \x3c!-- 当前 profile 选择 --\x3e\n        <div class="setting-item">\n          <label for="ykt-ai-profile-select">当前配置：</label>\n          <select id="ykt-ai-profile-select"></select>\n          <button id="ykt-ai-profile-add">新增配置</button>\n          <button id="ykt-ai-profile-del" color="red">删除当前</button>\n        </div>\n\n        \x3c!-- 具体配置字段：针对当前 profile --\x3e\n        <div class="setting-item">\n          <label for="ykt-ai-profile-name">名称:</label>\n          <input type="text" id="ykt-ai-profile-name" placeholder="例如：Kimi 8k / OpenAI GPT-4o">\n        </div>\n\n        <div class="setting-item">\n          <label for="ykt-ai-base-url">URL:</label>\n          <input type="text" id="ykt-ai-base-url" placeholder="https://api.moonshot.cn/...">\n          <small>兼容 OpenAI 协议的服务端，例如 api.openai.com / api.moonshot.cn / 自建代理。</small>\n        </div>\n\n        <div class="setting-item">\n          <label for="kimi-api-key">API Key:</label>\n          <input type="password" id="kimi-api-key" placeholder="输入当前配置的 API Key">\n        </div>\n\n        <div class="setting-item">\n          <label for="ykt-ai-model">文本模型 ID:</label>\n          <input type="text" id="ykt-ai-model" placeholder="例如：moonshot-v1-8k / gpt-4o-mini">\n        </div>\n\n        <div class="setting-item">\n          <label for="ykt-ai-vision-model">图像模型 ID:</label>\n          <input type="text" id="ykt-ai-vision-model" placeholder="默认不填则与文本模型相同">\n        </div>\n        <div class="setting-item">\n          <label for="ykt-ai-temperature">Temperature:</label>\n          <input type="number" id="ykt-ai-temperature" min="0" max="2" step="0.01" placeholder="留空则不传">\n          <small>当前 Profile 专用。留空时不发送该参数，由模型决定默认值；部分 Kimi 模型要求留空。</small>\n        </div>\n        <div class="setting-item">\n          <label for="ykt-ai-ocr-api">OCR模型API:</label>\n          <input type="text" id="ykt-ai-ocr-api" placeholder="留空则复用当前 AI Profile 的 URL">\n          <small>仅用于课件“文字识别”功能；留空时走当前 AI Profile。</small>\n        </div>\n        <div class="setting-item">\n          <label for="ykt-ai-ocr-api-key">OCR API Key:</label>\n          <input type="password" id="ykt-ai-ocr-api-key" placeholder="留空则复用当前 AI Profile 的 API Key">\n          <small>仅用于课件 OCR；不填时自动回退到当前 AI Profile 的 API Key。</small>\n        </div>\n        <div class="setting-item">\n          <label for="ykt-ai-translate-api">翻译模型API:</label>\n          <input type="text" id="ykt-ai-translate-api" placeholder="留空则复用当前 AI Profile 的 URL">\n          <small>仅用于 OCR 结果翻译；留空时复用当前 AI Profile 的 URL。</small>\n        </div>\n        <div class="setting-item">\n          <label for="ykt-ai-translate-api-key">翻译 API Key:</label>\n          <input type="password" id="ykt-ai-translate-api-key" placeholder="留空则复用当前 AI Profile 的 API Key">\n          <small>仅用于 OCR 结果翻译；留空时复用当前 AI Profile 的 API Key。</small>\n        </div>\n        <div class="setting-item">\n          <label for="ykt-ai-translate-model">翻译模型 ID:</label>\n          <input type="text" id="ykt-ai-translate-model" placeholder="留空则复用当前 AI Profile 的文本模型">\n          <small>建议填写纯文本模型；留空时复用当前 AI Profile 的文本模型。</small>\n        </div>\n      </div>\n\n      <div class="setting-group">\n        <h4>UI设置</h4>\n          <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-ui-tex">\n            <span class="checkmark"></span>\n            渲染LaTeX格式的公式\n          </label>\n        </div>\n      </div>\n\n      <div class="setting-group">\n        <h4>自动作答设置</h4>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-auto-join">\n            <span class="checkmark"></span>\n            自动进入课堂\n          </label>\n          <small>默认自动进入“正在上课”的课堂。</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-auto-join-auto-answer">\n            <span class="checkmark"></span>\n            对于自动进入的课堂，默认使用自动答题\n          </label>\n          <small>仅对“自动进入”的课堂生效，不会影响手动进入课堂的行为。</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-auto-answer">\n            <span class="checkmark"></span>\n            启用自动作答\n          </label>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-ai-auto-analyze">\n            <span class="checkmark"></span>\n            打开 AI 页面时自动分析\n          </label>\n          <small>开启后，进入“AI 解答”面板即自动向 AI 询问当前题目</small>\n        </div>\n        <div class="setting-item">\n          <label for="ykt-submission-policy">自动答案处理：</label>\n          <select id="ykt-submission-policy"><option value="auto">正常提交，必要时强制补交</option><option value="normal">只正常提交，结束后保留本地</option><option value="local">只生成并保存本地</option></select>\n          <small>人工编辑优先。提交结果不明时先核实服务器，不盲目重复提交。</small>\n        </div>\n        <div class="setting-item">\n          <label for="ykt-quick-mode">快答模式：</label>\n          <select id="ykt-quick-mode"><option value="auto">按时间自动</option><option value="on">强制开启</option><option value="off">强制关闭</option></select>\n          <small>快答控制模型与顺序，提交方式独立。强制关闭时不会因剩余时间少而开启。</small>\n        </div>\n        <div class="setting-item">\n          <label for="ykt-quick-times">快答时间点：</label><input id="ykt-quick-times" placeholder="例如 10:00, 14:30">\n          <small>按浏览器本地时间，每个时间点前 1 分钟至后 10 分钟；仅自动模式使用。</small>\n        </div>\n        <div class="setting-item"><label for="ykt-fast-profile">快答配置：</label><select id="ykt-fast-profile"></select><small>未配置时显示降级原因并使用常规模型。</small></div>\n        <div class="setting-item"><label class="checkbox-label"><input type="checkbox" id="ykt-answer-verify"><span class="checkmark"></span>使用独立模型复核</label></div>\n        <div class="setting-item"><label for="ykt-verify-profile">复核配置：</label><select id="ykt-verify-profile"></select><small>常规作答优先在提交前复核；快答可先提交，差异修正仍需服务器接受。复核建议不等于已经更新。</small></div>\n        <div class="setting-item">\n          <label for="ykt-input-answer-delay">作答延迟时间 (秒):</label>\n          <input type="number" id="ykt-input-answer-delay" min="1" max="60">\n          <small>题目出现后等待多长时间开始作答</small>\n        </div>\n        <div class="setting-item">\n          <label for="ykt-input-random-delay">随机延迟范围 (秒):</label>\n          <input type="number" id="ykt-input-random-delay" min="0" max="30">\n          <small>在基础延迟基础上随机增加的时间范围</small>\n        </div><div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-ai-pick-main-first">\n            <span class="checkmark"></span>\n            主界面优先（未勾选则课件浏览优先）\n          </label>\n          <small>仅在普通打开 AI 面板（ykt:open-ai）时生效；从“提问当前PPT”跳转保持最高优先。</small>\n        </div>\n      </div>\n\n      <div class="setting-group">\n        <h4>课堂提醒</h4>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-all" />\n            <span class="checkmark"></span>\n            总提醒开关\n          </label>\n          <small>关闭后，下面每一种课堂事件都会静音；工具栏铃铛与此开关同步。</small>\n        </div>\n        <h5>提醒事件</h5>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-problem-start" />\n            <span class="checkmark"></span>\n            新题 / 答题开始\n          </label>\n          <small>老师开启一道可作答习题时提醒。</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-assessment-publish" />\n            <span class="checkmark"></span>\n            考试/测试题组发布提醒\n          </label>\n          <small>老师发布测试、考试或题组时提醒。</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-courseware-publish" />\n            <span class="checkmark"></span>\n            课件发布提醒\n          </label>\n          <small>只在发布新课件时提醒；翻阅旧课件和翻页不会提醒。</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-other-publish" />\n            <span class="checkmark"></span>\n            其他无法分类的发布提醒\n          </label>\n          <small>用于不同学校服务器的未知发布事件；若提醒过多可单独关闭。</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-lesson-finished" />\n            <span class="checkmark"></span>\n            课程结束提醒\n          </label>\n          <small>老师结束当前课程时提醒。</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-auto-answer-scheduled" />\n            <span class="checkmark"></span>\n            自动作答已排队\n          </label>\n          <small>脚本为新题安排延迟作答时提醒。</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-auto-answer-started" />\n            <span class="checkmark"></span>\n            自动作答开始\n          </label>\n          <small>脚本开始执行本地或 AI 作答流程时提醒。</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-auto-answer-succeeded" />\n            <span class="checkmark"></span>\n            自动作答成功\n          </label>\n          <small>答案提交成功时提醒。</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-auto-answer-failed" />\n            <span class="checkmark"></span>\n            自动作答失败\n          </label>\n          <small>截图、AI 分析或答案提交失败时提醒。</small>\n        </div>\n        <h5>提醒方式</h5>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-native" />\n            <span class="checkmark"></span>\n            系统通知\n          </label>\n          <small>调用浏览器或篡改猴的原生通知。</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-popup" />\n            <span class="checkmark"></span>\n            页面弹窗\n          </label>\n          <small>在当前页面右下角显示提醒卡片。</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-notify-sound" />\n            <span class="checkmark"></span>\n            提示声音\n          </label>\n          <small>播放内置或自定义提示音。</small>\n        </div>\n        <div class="setting-item">\n          <label for="ykt-input-notify-duration">弹窗持续时间 (秒):</label>\n          <input type="number" id="ykt-input-notify-duration" min="2" max="60" />\n          <small>习题出现时，弹窗在屏幕上的停留时长</small>\n        </div>\n        <div class="setting-item">\n          <label for="ykt-input-notify-volume">提醒音量 (0-100):</label>\n          <input type="number" id="ykt-input-notify-volume" min="0" max="100" />\n          <small>用于提示音的音量大小；建议 30~80</small>\n        </div>\n        <div class="setting-item">\n          <button id="ykt-btn-test-notify">测试习题提醒</button>\n        </div>\n        <div class="setting-item">\n          <label>自定义提示音（其一即可）</label>\n          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">\n            <input type="file" id="ykt-input-notify-audio-file" accept="audio/*" />\n            <input type="text" id="ykt-input-notify-audio-url" placeholder="或粘贴在线音频 URL（http/https/data:）" style="min-width:260px"/>\n            <button id="ykt-btn-apply-audio-url">应用URL</button>\n            <button id="ykt-btn-preview-audio">预览</button>\n            <button id="ykt-btn-clear-audio">清除自定义音频</button>\n          </div>\n          <small id="ykt-tip-audio-name" style="display:block;opacity:.8;margin-top:6px"></small>\n          <small>说明：文件将本地存储为 data URL（默认上限 2MB）。URL 需支持跨域访问；若被浏览器拦截自动播放，请先点击“预览”以授权音频播放。</small>\n        </div>\n      </div>\n\n      <div class="setting-group">\n        <h4>课堂运行</h4>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-auto-follow-danmu" />\n            <span class="checkmark"></span>\n            重复弹幕自动跟发\n          </label>\n          <small>开启后，30 秒内凑齐 7 条有效他人弹幕后跟发频率最高文本（并列选最新）；每轮最长 60 秒、最多 2 条，同一文本每轮一次。输入框有草稿时不发送，以出站消息确认已发出。</small>\n        </div>\n        <div class="setting-item">\n          <label class="checkbox-label">\n            <input type="checkbox" id="ykt-input-keep-screen-awake" />\n            <span class="checkmark"></span>\n            课堂保持亮屏（仅防自动熄屏）\n          </label>\n          <small>仅在课堂页且页面可见时生效。无法阻止手动锁屏、切换到后台后的浏览器冻结；省电模式也可能拒绝该功能。</small>\n        </div>\n      </div>\n    </div>\n  </div>\n</div>\n\n';
  function defaultNavigator() {
    if (typeof window !== "undefined") return window.navigator;
    return typeof globalThis !== "undefined" ? globalThis.navigator : null;
  }
  function defaultDocument() {
    return typeof document !== "undefined" ? document : null;
  }
  function defaultLocation() {
    return typeof window !== "undefined" ? window.location : null;
  }
  function isClassroomPath(pathname = "") {
    return /\/lesson\/fullscreen\/v3(?:\/|$)|\/v2\/web\/lesson(?:\/|$)|\/m\/v2(?:\/|$)/.test(pathname);
  }
  function createScreenWakeLock({getNavigator: getNavigator = defaultNavigator, getDocument: getDocument = defaultDocument, getLocation: getLocation = defaultLocation, onStatus: onStatus = () => {}} = {}) {
    let enabled = false;
    let sentinel = null;
    let pendingRequest = null;
    let observedDocument = null;
    const report = (active, reason, error) => {
      const status = {
        active: active,
        reason: reason
      };
      if (error) status.error = error;
      try {
        onStatus(status);
      } catch {}
      return status;
    };
    const getPathname = () => getLocation()?.pathname || "";
    const isVisible = () => {
      const doc = getDocument();
      return !!doc && doc.hidden !== true && doc.visibilityState !== "hidden";
    };
    const inactiveReason = () => {
      if (!enabled) return "disabled";
      if (!isClassroomPath(getPathname())) return "not-classroom";
      if (!isVisible()) return "hidden";
      const wakeLock = getNavigator()?.wakeLock;
      if (!wakeLock || typeof wakeLock.request !== "function") return "unsupported";
      return "released";
    };
    const releaseSentinel = async () => {
      const current = sentinel;
      sentinel = null;
      if (!current || typeof current.release !== "function") return;
      try {
        await current.release();
      } catch {}
    };
    const onVisibilityChange = () => {
      void sync();
    };
    const observeVisibility = () => {
      const doc = getDocument();
      if (!doc || doc === observedDocument || typeof doc.addEventListener !== "function") return;
      if (observedDocument && typeof observedDocument.removeEventListener === "function") observedDocument.removeEventListener("visibilitychange", onVisibilityChange);
      observedDocument = doc;
      doc.addEventListener("visibilitychange", onVisibilityChange);
    };
    const attachSentinel = current => {
      if (!current || typeof current.addEventListener !== "function") return;
      current.addEventListener("release", () => {
        if (sentinel === current) {
          sentinel = null;
          report(false, "released");
        }
      });
    };
    async function sync() {
      observeVisibility();
      const reason = inactiveReason();
      if (reason !== "released") {
        await releaseSentinel();
        return report(false, reason);
      }
      if (sentinel && sentinel.released !== true) return report(true, "active");
      sentinel = null;
      if (pendingRequest) return pendingRequest;
      const requestPromise = Promise.resolve().then(async () => {
        try {
          let requested;
          try {
            requested = await getNavigator().wakeLock.request("screen");
          } catch (error) {
            return report(false, "request-failed", error);
          }
          // Settings, route, or visibility may change while the browser shows its
          // permission prompt. Never retain a sentinel that is no longer eligible.
                    const afterRequestReason = inactiveReason();
          if (afterRequestReason !== "released") {
            try {
              await (requested?.release?.());
            } catch {}
            return report(false, afterRequestReason);
          }
          sentinel = requested;
          attachSentinel(requested);
          return report(true, "active");
        } finally {
          // Clear before callers observe completion, so an immediately released
          // sentinel can always be reacquired by the next sync().
          if (pendingRequest === requestPromise) pendingRequest = null;
        }
      });
      pendingRequest = requestPromise;
      return requestPromise;
    }
    async function setEnabled(nextEnabled) {
      enabled = !!nextEnabled;
      return sync();
    }
    async function dispose() {
      enabled = false;
      if (observedDocument && typeof observedDocument.removeEventListener === "function") observedDocument.removeEventListener("visibilitychange", onVisibilityChange);
      observedDocument = null;
      await releaseSentinel();
    }
    return {
      setEnabled: setEnabled,
      sync: sync,
      dispose: dispose,
      getState() {
        return {
          enabled: enabled,
          active: !!sentinel && sentinel.released !== true
        };
      }
    };
  }
  const screenWakeLock = createScreenWakeLock();
  // src/core/settings-form.js
    function text(value) {
    return String(value ?? "").trim();
  }
  /**
   * Validate every value before changing the profile.  This keeps an invalid
   * temperature from partially saving a new API URL, key, or model name.
   */  function applyProfileForm(profile, fields = {}) {
    if (!profile || typeof profile !== "object") return {
      ok: false,
      field: "profile"
    };
    const rawTemperature = text(fields.temperature);
    let temperature = "";
    if (rawTemperature !== "") {
      temperature = Number(rawTemperature);
      if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) return {
        ok: false,
        field: "temperature"
      };
    }
    const next = {
      name: text(fields.name) || profile.name,
      baseUrl: text(fields.baseUrl) || profile.baseUrl,
      apiKey: text(fields.apiKey),
      model: text(fields.model) || profile.model,
      visionModel: text(fields.visionModel),
      temperature: temperature
    };
    Object.assign(profile, next);
    return {
      ok: true,
      profile: profile
    };
  }
  /** Refresh every reminder input whenever a settings surface becomes visible. */  function syncReminderForm(fields = {}, config = {}) {
    for (const key of REMINDER_SETTING_KEYS) {
      const field = fields[key];
      if (field) field.checked = config[key] !== false;
    }
  }
  function readReminderForm(fields = {}) {
    return Object.fromEntries(REMINDER_SETTING_KEYS.map(key => [ key, !!fields[key]?.checked ]));
  }
  // src/core/diagnostics.js
  // 课堂运行日志：只记录自动作答链路上的关键节点，便于真实课堂失败后导出复盘。
    const STORAGE_KEY = "ykt-helper:diag";
  const MAX_ENTRIES = 600;
  let entries = null;
  let saveTimer = null;
  function load() {
    if (entries) return entries;
    try {
      entries = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      entries = [];
    }
    if (!Array.isArray(entries)) entries = [];
    return entries;
  }
  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
      } catch {}
    }, 500);
  }
  function compact(value, depth = 0) {
    if (value === null || value === void 0) return value;
    if (typeof value === "string") return value.length > 300 ? `${value.slice(0, 300)}…(${value.length})` : value;
    if (typeof value !== "object") return value;
    if (depth > 3) return "[…]";
    if (Array.isArray(value)) return value.slice(0, 20).map(v => compact(v, depth + 1));
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 30)) out[k] = compact(v, depth + 1);
    return out;
  }
  /** 记录一条诊断事件。 */  function diag(event, detail = {}) {
    const list = load();
    list.push({
      at: Date.now(),
      path: globalThis.location?.pathname || "",
      event: event,
      ...compact(detail)
    });
    if (list.length > MAX_ENTRIES * 1.5) entries = list.slice(-MAX_ENTRIES);
    scheduleSave();
  }
  function clearDiagnostics() {
    entries = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
  /** 生成可发给开发者的文本：版本、环境和事件列表。 */  function exportDiagnostics(meta = {}) {
    const header = {
      exportedAt: (new Date).toISOString(),
      userAgent: navigator.userAgent,
      href: location.href,
      ...meta
    };
    const lines = load().map(e => {
      const {at: at, event: event, path: path, ...rest} = e;
      const t = new Date(at).toISOString();
      return `${t} ${event} ${path} ${JSON.stringify(rest)}`;
    });
    return `${JSON.stringify(header)}\n${lines.join("\n")}\n`;
  }
  function downloadDiagnostics(meta = {}) {
    const text = exportDiagnostics(meta);
    const blob = new Blob([ text ], {
      type: "text/plain;charset=utf-8"
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ykt-helper-diag-${(new Date).toISOString().replace(/[:.]/g, "-")}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1e3);
    return text.length;
  }
  // settings.js (new version)
    let mounted$5 = false;
  let root$4;
  let syncMountedForm = () => {};
  // ---- AI Profile helpers ----
    function ensureAIProfiles(configAI) {
    if (!configAI) return;
    // 只有 kimiApiKey 时创建第一个 profile
        if (!Array.isArray(configAI.profiles) || configAI.profiles.length === 0) {
      const legacyKey = configAI.kimiApiKey || configAI.apiKey || storage.get("kimiApiKey") || "";
      configAI.profiles = [ {
        id: "default",
        name: "Kimi",
        baseUrl: "https://api.moonshot.cn/v1/chat/completions",
        apiKey: legacyKey,
        model: "moonshot-v1-8k",
        visionModel: "moonshot-v1-8k-vision-preview",
        temperature: ""
      } ];
      configAI.activeProfileId = "default";
    }
    if (!configAI.activeProfileId) configAI.activeProfileId = configAI.profiles[0].id;
  }
  // ------------------------------
    function mountSettingsPanel() {
    if (mounted$5) return root$4;
    // 注入 HTML
        root$4 = document.createElement("div");
    root$4.innerHTML = tpl$5;
    document.body.appendChild(root$4.firstElementChild);
    root$4 = document.getElementById("ykt-settings-panel");
    let draftAi = JSON.parse(JSON.stringify(ui.config.ai));
    let formDirty = false;
    root$4.addEventListener("input", () => {
      formDirty = true;
    });
    const aiCfg = draftAi;
    ensureAIProfiles(aiCfg);
    // === 获取所有 AI Profile 相关的 DOM ===
        const $profileSelect = root$4.querySelector("#ykt-ai-profile-select");
    const $profileAdd = root$4.querySelector("#ykt-ai-profile-add");
    const $profileDel = root$4.querySelector("#ykt-ai-profile-del");
    const $profileName = root$4.querySelector("#ykt-ai-profile-name");
    const $baseUrl = root$4.querySelector("#ykt-ai-base-url");
    const $api = root$4.querySelector("#kimi-api-key");
    const $model = root$4.querySelector("#ykt-ai-model");
    const $visionModel = root$4.querySelector("#ykt-ai-vision-model");
    const $temperature = root$4.querySelector("#ykt-ai-temperature");
    const $ocrApi = root$4.querySelector("#ykt-ai-ocr-api");
    const $ocrApiKey = root$4.querySelector("#ykt-ai-ocr-api-key");
    const $translateApi = root$4.querySelector("#ykt-ai-translate-api");
    const $translateApiKey = root$4.querySelector("#ykt-ai-translate-api-key");
    const $translateModel = root$4.querySelector("#ykt-ai-translate-model");
    // === 其他 UI 原有字段 ===
        const $submissionPolicy = root$4.querySelector("#ykt-submission-policy");
    const $quickMode = root$4.querySelector("#ykt-quick-mode");
    const $quickTimes = root$4.querySelector("#ykt-quick-times");
    const $fastProfile = root$4.querySelector("#ykt-fast-profile");
    const $verifyProfile = root$4.querySelector("#ykt-verify-profile");
    const $verification = root$4.querySelector("#ykt-answer-verify");
    const $auto = root$4.querySelector("#ykt-input-auto-answer");
    const $autoJoin = root$4.querySelector("#ykt-input-auto-join");
    const $autoJoinAutoAnswer = root$4.querySelector("#ykt-input-auto-join-auto-answer");
    const $autoAnalyze = root$4.querySelector("#ykt-input-ai-auto-analyze");
    const $delay = root$4.querySelector("#ykt-input-answer-delay");
    const $rand = root$4.querySelector("#ykt-input-random-delay");
    const $priority = root$4.querySelector("#ykt-ai-pick-main-first");
    const $notifyDur = root$4.querySelector("#ykt-input-notify-duration");
    const $notifyVol = root$4.querySelector("#ykt-input-notify-volume");
    const $notifyAll = root$4.querySelector("#ykt-input-notify-all");
    const $notifyProblemStart = root$4.querySelector("#ykt-input-notify-problem-start");
    const $notifyAssessment = root$4.querySelector("#ykt-input-notify-assessment-publish");
    const $notifyCourseware = root$4.querySelector("#ykt-input-notify-courseware-publish");
    const $notifyOther = root$4.querySelector("#ykt-input-notify-other-publish");
    const $notifyLessonFinished = root$4.querySelector("#ykt-input-notify-lesson-finished");
    const $notifyAutoAnswerScheduled = root$4.querySelector("#ykt-input-notify-auto-answer-scheduled");
    const $notifyAutoAnswerStarted = root$4.querySelector("#ykt-input-notify-auto-answer-started");
    const $notifyAutoAnswerSucceeded = root$4.querySelector("#ykt-input-notify-auto-answer-succeeded");
    const $notifyAutoAnswerFailed = root$4.querySelector("#ykt-input-notify-auto-answer-failed");
    const $notifyNative = root$4.querySelector("#ykt-input-notify-native");
    const $notifyPopup = root$4.querySelector("#ykt-input-notify-popup");
    const $notifySound = root$4.querySelector("#ykt-input-notify-sound");
    const $autoFollowDanmu = root$4.querySelector("#ykt-input-auto-follow-danmu");
    const $keepScreenAwake = root$4.querySelector("#ykt-input-keep-screen-awake");
    const $iftex = root$4.querySelector("#ykt-ui-tex");
    const $audioFile = root$4.querySelector("#ykt-input-notify-audio-file");
    const $audioUrl = root$4.querySelector("#ykt-input-notify-audio-url");
    const $applyUrl = root$4.querySelector("#ykt-btn-apply-audio-url");
    const $preview = root$4.querySelector("#ykt-btn-preview-audio");
    const $clear = root$4.querySelector("#ykt-btn-clear-audio");
    const $audioName = root$4.querySelector("#ykt-tip-audio-name");
    const reminderFields = {
      notifyProblems: $notifyAll,
      notifyProblemStarts: $notifyProblemStart,
      notifyAssessmentPublishes: $notifyAssessment,
      notifyCoursewarePublishes: $notifyCourseware,
      notifyOtherPublishes: $notifyOther,
      notifyLessonFinished: $notifyLessonFinished,
      notifyAutoAnswerScheduled: $notifyAutoAnswerScheduled,
      notifyAutoAnswerStarted: $notifyAutoAnswerStarted,
      notifyAutoAnswerSucceeded: $notifyAutoAnswerSucceeded,
      notifyAutoAnswerFailed: $notifyAutoAnswerFailed,
      notifyNative: $notifyNative,
      notifyPopup: $notifyPopup,
      notifySound: $notifySound
    };
    // Profile UI
        function refreshProfileSelect() {
      const ai = draftAi;
      $profileSelect.innerHTML = "";
      refreshRoleProfiles();
      ai.profiles.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name || p.id;
        if (p.id === ai.activeProfileId) opt.selected = true;
        $profileSelect.appendChild(opt);
      });
    }
    function refreshRoleProfiles() {
      for (const [select, value] of [ [ $fastProfile, ui.config.fastAnswerProfileId ], [ $verifyProfile, ui.config.verifyAnswerProfileId ] ]) {
        const selected = select.value || value || "";
        select.replaceChildren();
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "不单独指定";
        select.appendChild(empty);
        for (const p of draftAi.profiles) {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.name || p.id;
          select.appendChild(opt);
        }
        select.value = draftAi.profiles.some(p => p.id === selected) ? selected : "";
      }
    }
    function loadProfileToForm(profileId) {
      const p = draftAi.profiles.find(x => x.id === profileId);
      if (!p) return;
      draftAi.activeProfileId = p.id;
      $profileName.value = p.name || "";
      $baseUrl.value = p.baseUrl || "";
      $api.value = p.apiKey || "";
      $model.value = p.model || "";
      $visionModel.value = p.visionModel || "";
      $temperature.value = p.temperature ?? "";
      $ocrApi.value = draftAi.ocrApi || "";
      $ocrApiKey.value = draftAi.ocrApiKey || "";
      $translateApi.value = draftAi.translateApi || "";
      $translateApiKey.value = draftAi.translateApiKey || "";
      $translateModel.value = draftAi.translateModel || "";
    }
    // 初始化 Profile 下拉框
        refreshProfileSelect();
    loadProfileToForm(draftAi.activeProfileId);
    // 切换 profile
        function retainProfileForm() {
      const current = draftAi.profiles.find(p => p.id === draftAi.activeProfileId);
      if (!current) return true;
      return applyProfileForm(current, {
        name: $profileName.value,
        baseUrl: $baseUrl.value,
        apiKey: $api.value,
        model: $model.value,
        visionModel: $visionModel.value,
        temperature: $temperature.value
      }).ok;
    }
    $profileSelect.addEventListener("change", () => {
      if (!retainProfileForm()) {
        $profileSelect.value = draftAi.activeProfileId;
        ui.toast("请先修正 Temperature");
        return;
      }
      formDirty = true;
      loadProfileToForm($profileSelect.value);
    });
    // 添加 profile
        $profileAdd.addEventListener("click", () => {
      if (!retainProfileForm()) return ui.toast("请先修正 Temperature");
      formDirty = true;
      const id = `p_${Date.now().toString(36)}`;
      const newP = {
        id: id,
        name: "new api key",
        baseUrl: "https://api.openai.com/...",
        apiKey: "",
        model: "gpt-4o-mini",
        visionModel: "",
        temperature: ""
      };
      draftAi.profiles.push(newP);
      draftAi.activeProfileId = id;
      refreshProfileSelect();
      loadProfileToForm(id);
    });
    // 删除 profile
        $profileDel.addEventListener("click", () => {
      const ai = draftAi;
      if (ai.profiles.length <= 1) {
        ui.toast("至少保留一个配置", 2500);
        return;
      }
      const id = ai.activeProfileId;
      ai.profiles = ai.profiles.filter(p => p.id !== id);
      ai.activeProfileId = ai.profiles[0].id;
      refreshProfileSelect();
      loadProfileToForm(ai.activeProfileId);
    });
    function syncFormFromConfig() {
      if (formDirty) return;
      draftAi = JSON.parse(JSON.stringify(ui.config.ai));
      ensureAIProfiles(draftAi || (draftAi = {}));
      refreshProfileSelect();
      loadProfileToForm(draftAi.activeProfileId);
      $submissionPolicy.value = ui.config.submissionPolicy || "auto";
      $quickMode.value = ui.config.quickAnswerMode || "auto";
      $quickTimes.value = Array.isArray(ui.config.answerPriorityTimes) ? ui.config.answerPriorityTimes.join(", ") : ui.config.answerPriorityTimes || "";
      $fastProfile.value = ui.config.fastAnswerProfileId || "";
      $verifyProfile.value = ui.config.verifyAnswerProfileId || "";
      $verification.checked = !!ui.config.answerVerification;
      $autoJoin.checked = !!ui.config.autoJoinEnabled;
      $autoJoinAutoAnswer.checked = !!ui.config.autoAnswerOnAutoJoin;
      $auto.checked = !!ui.config.autoAnswer;
      $autoAnalyze.checked = !!ui.config.aiAutoAnalyze;
      $iftex.checked = !!ui.config.iftex;
      $delay.value = Math.floor((ui.config.autoAnswerDelay ?? 3e3) / 1e3);
      $rand.value = Math.floor((ui.config.autoAnswerRandomDelay ?? 1500) / 1e3);
      $priority.checked = ui.config.aiSlidePickPriority !== false;
      $notifyDur.value = Math.floor((ui.config.notifyPopupDuration || 5e3) / 1e3);
      $notifyVol.value = Math.round(100 * (ui.config.notifyVolume ?? .6));
      syncReminderForm(reminderFields, ui.config);
      $autoFollowDanmu.checked = !!ui.config.autoFollowDanmu;
      $keepScreenAwake.checked = !!ui.config.keepScreenAwake;
      $audioName.textContent = ui.config.customNotifyAudioName ? `当前：${ui.config.customNotifyAudioName}` : "当前：使用内置“叮-咚”提示音";
    }
    syncMountedForm = syncFormFromConfig;
    syncFormFromConfig();
    // 保存设置
        root$4.querySelector("#ykt-btn-settings-save").addEventListener("click", async () => {
      const times = $quickTimes.value.split(/[,，\s]+/).filter(Boolean);
      if (times.some(t => !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(t))) return ui.toast("快答时间请使用 HH:MM，例如 10:00, 14:30");
      // --- 保存当前 Profile ---
            const ai = draftAi;
      const pid = ai.activeProfileId;
      const p = ai.profiles.find(x => x.id === pid);
      if (!p) {
        ui.toast("当前 AI 配置不存在，请重新选择后保存", 3e3);
        return;
      }
      const profileResult = applyProfileForm(p, {
        name: $profileName.value,
        baseUrl: $baseUrl.value,
        apiKey: $api.value,
        model: $model.value,
        visionModel: $visionModel.value,
        temperature: $temperature.value
      });
      if (!profileResult.ok) {
        ui.toast("Temperature 必须是 0 到 2 之间的数字，或留空", 3e3);
        return;
      }
      ai.ocrApi = $ocrApi.value.trim();
      ai.ocrApiKey = $ocrApiKey.value.trim();
      ai.translateApi = $translateApi.value.trim();
      ai.translateApiKey = $translateApiKey.value.trim();
      ai.translateModel = $translateModel.value.trim();
      const curOpt = $profileSelect.querySelector(`option[value="${p.id}"]`);
      if (curOpt) curOpt.textContent = p.name || p.id;
      ai.kimiApiKey = p.apiKey;
      ui.config.submissionPolicy = $submissionPolicy.value;
      ui.config.quickAnswerMode = $quickMode.value;
      ui.config.answerPriorityTimes = times;
      ui.config.fastAnswerProfileId = $fastProfile.value;
      ui.config.verifyAnswerProfileId = $verifyProfile.value;
      ui.config.answerVerification = $verification.checked;
      ui.config.autoJoinEnabled = !!$autoJoin.checked;
      ui.config.autoAnswerOnAutoJoin = !!$autoJoinAutoAnswer.checked;
      ui.config.autoAnswer = !!$auto.checked;
      ui.config.aiAutoAnalyze = !!$autoAnalyze.checked;
      ui.config.autoAnswerDelay = Math.max(1e3, (+$delay.value || 0) * 1e3);
      ui.config.autoAnswerRandomDelay = Math.max(0, (+$rand.value || 0) * 1e3);
      ui.config.iftex = !!$iftex.checked;
      ui.config.aiSlidePickPriority = !!$priority.checked;
      ui.config.notifyPopupDuration = Math.max(2e3, (+$notifyDur.value || 0) * 1e3);
      ui.config.notifyVolume = Math.max(0, Math.min(1, ($notifyVol.value === "" ? 60 : +$notifyVol.value) / 100));
      Object.assign(ui.config, readReminderForm(reminderFields));
      ui.config.autoFollowDanmu = !!$autoFollowDanmu.checked;
      ui.config.keepScreenAwake = !!$keepScreenAwake.checked;
      ui.config.ai = JSON.parse(JSON.stringify(draftAi));
      if (!ui.saveConfig()) return;
      formDirty = false;
      document.getElementById("ykt-btn-bell")?.classList.toggle("active", ui.config.notifyProblems);
      ui.updateAutoAnswerBtn();
      const wakeLockStatus = await screenWakeLock.setEnabled(ui.config.keepScreenAwake);
      if (ui.config.keepScreenAwake && wakeLockStatus.reason === "not-classroom") ui.toast("设置已保存；进入课堂页后将尝试保持亮屏", 3e3); else if (ui.config.keepScreenAwake && wakeLockStatus.reason === "unsupported") ui.toast("设置已保存；当前浏览器不支持课堂保持亮屏", 3500); else if (ui.config.keepScreenAwake && wakeLockStatus.reason === "request-failed") ui.toast("设置已保存；系统未允许保持亮屏，请检查省电模式或浏览器权限", 4e3); else ui.toast("设置已保存");
    });
    //--------------------------------------
    //            重置为默认
    //--------------------------------------
        root$4.querySelector("#ykt-btn-settings-reset").addEventListener("click", async () => {
      if (!confirm("确定要重置为默认设置吗？")) return;
      if (!ui.resetConfig()) return;
      formDirty = false;
      draftAi = JSON.parse(JSON.stringify(ui.config.ai));
      syncFormFromConfig();
      document.getElementById("ykt-btn-bell")?.classList.toggle("active", ui.config.notifyProblems);
      ui.updateAutoAnswerBtn();
      await screenWakeLock.setEnabled(false);
      ui.toast("设置已重置");
    });
    root$4.querySelector("#ykt-btn-export-diag")?.addEventListener("click", () => {
      downloadDiagnostics({
        version: "1.22.1",
        autoAnswer: !!ui.config.autoAnswer,
        autoJoin: !!ui.config.autoJoinEnabled
      });
      ui.toast("诊断日志已导出");
    });
    // 音频设置
        const MAX_SIZE = 2 * 1024 * 1024;
    if ($audioFile) $audioFile.addEventListener("change", e => {
      const f = e.target.files?.[0];
      if (!f) return;
      if (f.size > MAX_SIZE) {
        ui.toast("音频文件过大（>2MB）", 3e3);
        return;
      }
      const reader = new FileReader;
      reader.onload = () => {
        const src = reader.result;
        if (!ui.setCustomNotifyAudio({
          src: src,
          name: f.name
        })) return;
        $audioName.textContent = `当前：${f.name}`;
        ui._playNotifySound(ui.config.notifyVolume);
        ui.toast("已应用自定义提示音");
      };
      reader.readAsDataURL(f);
    });
    if ($applyUrl) $applyUrl.addEventListener("click", () => {
      const url = ($audioUrl.value || "").trim();
      if (!url) return ui.toast("请输入音频URL");
      if (!/^https?:\/\/|^data:audio\//i.test(url)) {
        ui.toast("URL 必须以 http/https 或 data:audio/ 开头");
        return;
      }
      if (!ui.setCustomNotifyAudio({
        src: url,
        name: ""
      })) return;
      $audioName.textContent = "当前：（自定义URL）";
      ui._playNotifySound(ui.config.notifyVolume);
      ui.toast("已应用自定义音频URL");
    });
    if ($preview) $preview.addEventListener("click", () => {
      ui._playNotifySound(ui.config.notifyVolume);
    });
    if ($clear) $clear.addEventListener("click", () => {
      if (!ui.setCustomNotifyAudio({
        src: "",
        name: ""
      })) return;
      $audioName.textContent = "当前：使用内置“叮-咚”提示音";
      ui.toast("已清除自定义音频");
    });
    // 测试提醒
        const $btnTest = root$4.querySelector("#ykt-btn-test-notify");
    if ($btnTest) $btnTest.addEventListener("click", () => {
      const mockProblem = {
        problemId: "TEST-001",
        body: "【测试题】这是一个测试提醒",
        options: []
      };
      ui.notifyProblem(mockProblem, {
        thumbnail: null
      });
    });
    // 关闭按钮
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
  var tpl$4 = '<div id="ykt-ai-answer-panel" class="ykt-panel">\n  <div class="panel-header">\n    <h3><i class="fas fa-robot"></i> AI 融合分析</h3>\n    <span id="ykt-ai-close" class="close-btn" title="关闭">\n      <i class="fas fa-times"></i>\n    </span>\n  </div>\n  <div class="panel-body">\n    <div style="margin-bottom: 10px;">\n      <strong>当前题目：</strong>\n      <div style="font-size: 12px; color: #666; margin: 4px 0;">\n        系统将自动识别当前页面的题目\n      </div>\n      <div id="ykt-ai-text-status" class="text-status warning">\n        正在检测题目信息...\n      </div>\n      <div id="ykt-ai-question-display" class="ykt-question-display">\n        提示：系统使用融合模式，同时分析题目文本信息和页面图像，提供最准确的答案。\n      </div>\n    </div>\n    \x3c!-- 当前要提问的PPT预览 --\x3e\n    <div id="ykt-ai-selected" style="display:none; margin: 10px 0;">\n      <strong>已选PPT预览：</strong>\n      <div style="font-size: 12px; color: #666; margin: 4px 0;">\n        下方小图为即将用于分析的PPT页面截图\n      </div>\n      <div style="border: 1px solid var(--ykt-border-strong); padding: 6px; border-radius: 6px; display: inline-block;">\n        \x3c!-- 兼容旧单页：仍保留该 img --\x3e\n        <img id="ykt-ai-selected-thumb"\n             alt="已选PPT预览"\n             style="max-width: 180px; max-height: 120px; display:none;" />\n\n        \x3c!-- 多页预览容器：由 ai.js 动态填充 --\x3e\n        <div id="ykt-ai-selected-thumbs"\n             style="display:flex; flex-wrap:wrap; gap:6px; max-width: 420px;">\n        </div>\n      </div>\n    </div>\n    <div style="margin-bottom: 10px;">\n      <strong>自定义提示（可选）：</strong>\n      <div style="font-size: 12px; color: #666; margin: 4px 0;">\n        提示：此内容将追加到系统生成的prompt后面，可用于补充特殊要求或背景信息。\n      </div>\n      <textarea \n        id="ykt-ai-custom-prompt" \n        class="ykt-custom-prompt"\n        placeholder="例如：请用中文回答、注重解题思路、考虑XXX知识点等"\n      ></textarea>\n    </div>\n\n    <button id="ykt-ai-ask" style="width: 100%; height: 32px; border-radius: 6px; border: 1px solid var(--ykt-border-strong); background: #f7f8fa; cursor: pointer; margin-bottom: 10px;">\n      <i class="fas fa-brain"></i> 融合模式分析（文本+图像）\n    </button>\n\n    <div id="ykt-ai-loading" class="ai-loading" style="display: none;">\n      <i class="fas fa-spinner fa-spin"></i> AI正在使用融合模式分析...\n    </div>\n    <div id="ykt-ai-error" class="ai-error" style="display: none;"></div>\n    <div>\n      <strong>AI 分析结果：</strong>\n      <div id="ykt-ai-answer" class="ai-answer"></div>\n    </div>\n    \x3c!-- 可编辑答案区 --\x3e\n    <div id="ykt-ai-edit-section" style="display:none; margin-top:12px;">\n      <strong>提交前可编辑答案：</strong>\n      <div style="font-size: 12px; color: #666; margin: 4px 0;">\n        提示：这里是将要提交的“结构化答案”。可直接编辑。支持：\n        <br>• 选择题/投票：填写 <code>["A"]</code> 或 <code>A,B</code>\n        <br>• 填空题：填写 <code>[" 1"]</code> 或 直接写 <code> 1</code>（自动包成数组）\n        <br>• 主观题：可填 JSON（如 <code>{"content":"略","pics":[]}</code>）或直接输入文本\n      </div>\n      <textarea id="ykt-ai-answer-edit"\n        style="width:100%; min-height:88px; border:1px solid var(--ykt-border-strong); border-radius:6px; padding:6px; font-family:monospace;"></textarea>\n      <div id="ykt-ai-validate" style="font-size:12px; color:#666; margin-top:6px;"></div>\n      <div style="margin-top:8px; display:flex; gap:8px;">\n        <select id="ykt-ai-submit-mode"><option value="auto">按题目状态提交</option><option value="normal">只正常提交</option><option value="retry">强制补交</option><option value="local">只保存本地</option></select>\n        <button id="ykt-ai-submit" class="ykt-btn ykt-btn-primary" style="flex:0 0 auto;">\n          提交编辑后的答案\n        </button>\n        <button id="ykt-ai-reset-edit" class="ykt-btn" style="flex:0 0 auto;">重置为 AI 建议</button>\n      </div>\n    </div>\n  </div>\n</div>\n';
  // src/ai/kimi.js
  // 将后端 problemType 数字映射为 Step1/Step2 使用的 question_type 字符串
  // 约定：
  // 1 -> single_choice   （单选）
  // 2 -> multiple_choice （多选）
  // 3 -> single_choice   （投票题按单选处理）
  // 4 -> fill_in         （填空题）
  // 5 -> subjective      （主观题 / 简答题）
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
  function getActiveProfile$1(aiCfg) {
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
  function imageDataUrl(value) {
    const text = String(value);
    if (/^data:image\/[^;]+;base64,/.test(text)) return text;
    return `data:image/${text.startsWith("/9j/") ? "jpeg" : "png"};base64,${text}`;
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
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new Error("Temperature 必须是 0 到 2 之间的数字，或留空使用模型默认值");
    return {
      ...requestPayload,
      temperature: temperature
    };
  }
  // -----------------------------------------------
  // Unified Prompt blocks for Text & Vision
  // -----------------------------------------------
    const BASE_SYSTEM_PROMPT = [ "1) 任何时候优先遵循【用户输入（优先级最高）】中的明确要求；", "2) 当输入是课件页面（PPT）图像或题干文本时，先判断是否存在“明确题目”；", "3) 若存在明确题目，则输出以下格式的内容：", "   单选：格式要求：\n答案: [单个字母]\n解释: [选择理由]\n\n注意：只选一个，如A", "   多选：格式要求：\n答案: [多个字母用顿号分开]\n解释: [选择理由]\n\n注意：格式如A、B、C", "   投票：格式要求：\n答案: [单个字母]\n解释: [选择理由]\n\n注意：只选一个选项，如A", "   填空：答案: JSON 字符串数组，按空位顺序保留公式、负号和区间；主观题：答案: 正文。随后另起一行解释。", "4) 若识别不到明确题目，直接使用回答用户输入的问题", "3) 如果PROMPT格式不正确，或者你只接收了图片，输出：", "   STATE: NO_PROMPT", "   SUMMARY: <介绍页面/上下文的主要内容>" ].join("\n");
  // Vision 补充：识别题型与版面元素的步骤说明
    const VISION_GUIDE = [ "【视觉识别要求】", "A. 先判断是否为题目页面（是否有题干/选项/空格/问句等）", "B. 若是题目，尝试提取题干、选项与关键信息；", "C. 否则参考用户输入回答" ].join("\n");
  /**
   * 通用 OpenAI 协议文本模型调用
   */  async function queryAI(question, aiCfg, options = {}) {
    const profile = getActiveProfile$1(aiCfg);
    if (!profile?.apiKey) throw new Error("请先配置 AI API Key");
    const data = await chatCompletion(profile, {
      model: profile.model,
      messages: [ {
        role: "system",
        content: BASE_SYSTEM_PROMPT
      }, {
        role: "user",
        content: question
      } ]
    }, "[AI Text]", options.timeout || 45e3, options);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI 返回内容为空");
    return content;
  }
  // 同一时间只发一个 AI 请求：免费档常见 RPM=3，并发请求只会互相挤出 429。
    let queueRunning = false;
  const pendingAI = [];
  function enqueueAI(task, context = {}) {
    return new Promise((resolve, reject) => {
      pendingAI.push({
        task: task,
        context: context,
        resolve: resolve,
        reject: reject,
        queuedAt: Date.now()
      });
      const drain = async () => {
        if (queueRunning) return;
        queueRunning = true;
        try {
          while (pendingAI.length) {
            pendingAI.sort((a, b) => (a.context.priorityDeadline ?? a.context.deadline ?? 1 / 0) - (b.context.priorityDeadline ?? b.context.deadline ?? 1 / 0) || a.queuedAt - b.queuedAt);
            const next = pendingAI.shift();
            try {
              next.context.guard?.();
              next.resolve(await next.task());
            } catch (error) {
              next.reject(error);
            }
          }
        } finally {
          queueRunning = false;
        }
      };
      queueMicrotask(drain);
    });
  }
  const RATE_LIMIT_MAX_RETRIES = 3;
  function rateLimitDelayMs(message, attempt) {
    const m = String(message || "").match(/after\s+(\d+(?:\.\d+)?)\s*second/i);
    const hinted = m ? Math.ceil(Number(m[1]) * 1e3) + 500 : 0;
    return Math.max(hinted, [ 5e3, 12e3, 21e3 ][attempt] || 21e3);
  }
  // 通用 OpenAI 协议聊天请求封装（用于 Vision 两步调用）；遇到 429 时按提示退避重试。
    async function chatCompletion(profile, payload, debugLabel = "[AI OpenAI]", timeoutMs = 6e4, context = {}) {
    for (let attempt = 0; ;attempt++) try {
      return await enqueueAI(() => {
        context.guard?.();
        const remaining = Number.isFinite(context.deadline) ? context.deadline - Date.now() - 1500 : 1 / 0;
        if (remaining < 1e3) {
          const error = new Error("剩余时间不足，AI 请求未发出");
          error.name = "DeadlineError";
          throw error;
        }
        const actualProfile = context.resolveProfile?.() || profile;
        if (!actualProfile?.apiKey) throw new Error("当前 AI 配置不可用");
        const hasImage = payload.messages?.some(m => Array.isArray(m.content) && m.content.some(x => x.type === "image_url"));
        const actualPayload = context.resolveProfile ? {
          ...payload,
          model: hasImage ? actualProfile.visionModel || actualProfile.model : actualProfile.model
        } : payload;
        diag("ai-dispatch", {
          profileId: actualProfile.id,
          model: actualPayload.model,
          deadline: context.deadline,
          timeoutMs: Math.min(timeoutMs, remaining)
        });
        return chatCompletionOnce(actualProfile, actualPayload, debugLabel, Math.min(timeoutMs, remaining));
      }, context);
    } catch (e) {
      if (e?.status !== 429 || attempt >= RATE_LIMIT_MAX_RETRIES) throw e;
      const wait = rateLimitDelayMs(e.message, attempt);
      if (Number.isFinite(context.deadline) && Date.now() + wait + 1500 >= context.deadline) throw e;
      context.guard?.();
      console.warn(`[雨课堂助手]${debugLabel} 触发限流(429)，${Math.round(wait / 1e3)} 秒后重试 (${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  function chatCompletionOnce(profile, payload, debugLabel, timeoutMs) {
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
            console.log(`[雨课堂助手]${debugLabel} Status:`, res.status);
            console.debug(`[雨课堂助手]${debugLabel} 收到模型响应`);
            if (res.status !== 200) {
              let errorMessage = `AI 请求失败: ${res.status}`;
              try {
                const errorData = JSON.parse(res.responseText);
                if (errorData.error?.message) errorMessage += ` - ${errorData.error.message}`;
                if (errorData.error?.code) errorMessage += ` (${errorData.error.code})`;
              } catch {
                errorMessage += ` - ${res.responseText}`;
              }
              const error = new Error(errorMessage);
              error.status = res.status;
              reject(error);
              return;
            }
            const data = JSON.parse(res.responseText);
            resolve(data);
          } catch (e) {
            console.error(`[雨课堂助手]${debugLabel} 解析响应失败:`, e);
            reject(new Error(`解析API响应失败: ${e.message}`));
          }
        },
        onerror: err => {
          console.error(`[雨课堂助手]${debugLabel} 网络请求失败:`, err);
          reject(new Error("网络请求失败"));
        },
        onabort: () => reject(new Error("AI 请求已取消")),
        ontimeout: () => {
          console.error(`[雨课堂助手]${debugLabel} 请求超时 (${Math.round(timeoutMs / 1e3)}s)`);
          const error = new Error(`AI 请求超时（${Math.round(timeoutMs / 1e3)} 秒）`);
          error.timeout = true;
          reject(error);
        }
      });
    });
  }
  async function singleStepVisionCall(profile, cleanBase64List, textPrompt, options = {}) {
    const visionModel = profile.visionModel || profile.model;
    const timeoutMs = options.timeout || 6e4;
    const visionTextHeader = [ "【融合模式说明】你将看到一张课件/PPT截图与可选的附加文本。", VISION_GUIDE ].join("\n");
    const imageBlocks = [];
    for (const b64 of cleanBase64List) imageBlocks.push({
      type: "image_url",
      image_url: {
        url: imageDataUrl(b64)
      }
    });
    const messages = [ {
      role: "system",
      content: BASE_SYSTEM_PROMPT
    }, {
      role: "user",
      content: [ ...imageBlocks, {
        type: "text",
        text: [ visionTextHeader, "【用户输入（优先级最高）】", textPrompt || "（无）" ].join("\n")
      } ]
    } ];
    const data = await chatCompletion(profile, {
      model: visionModel,
      messages: messages
    }, "[AI OpenAI Vision 单步]", timeoutMs, options);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI返回内容为空");
    console.log("[AI OpenAI Vision] 成功获取回答(单步)");
    return content;
  }
  /**
   * 通用 OpenAI 协议 Vision 模型（图像+文本）
   */  async function queryAIVision(imageBase64, textPrompt, aiCfg, options = {}) {
    const profile = getActiveProfile$1(aiCfg);
    if (!profile || !profile.apiKey) throw new Error("请先在设置中配置 AI API Key");
    // ===== 兼容单图 / 多图 =====
        const inputList = Array.isArray(imageBase64) ? imageBase64 : [ imageBase64 ];
    const cleanBase64List = inputList.filter(Boolean).map(x => String(x)).filter(x => !!x);
    if (cleanBase64List.length === 0) throw new Error("图像数据格式错误");
    const visionModel = profile.visionModel || profile.model;
    const textModel = profile.model;
    const hasSeparateTextModel = !!textModel && textModel !== visionModel;
    const {disableTwoStep: disableTwoStep = false, twoStepDebug: twoStepDebug = false, timeout: timeoutMs = 6e4, problemType: problemType = null} = options || {};
    // -------- 0. 如果只有 VLM（或者显式关闭两步），回退到单步逻辑 --------
        if (!hasSeparateTextModel || disableTwoStep) {
      if (twoStepDebug) console.log("[雨课堂助手][INFO][vision] use single-step vision", {
        hasSeparateTextModel: hasSeparateTextModel,
        disableTwoStep: disableTwoStep
      });
      return singleStepVisionCall(profile, cleanBase64List, textPrompt, {
        ...options,
        timeout: timeoutMs
      });
    }
    if (twoStepDebug) console.log("[雨课堂助手][INFO][vision] use TWO-STEP pipeline", {
      visionModel: visionModel,
      textModel: textModel
    });
    // ===================== Step 1: Vision 抽结构化题目 =====================
        const STEP1_SYSTEM_PROMPT = `\n你是一个“题目结构化助手”。你将看到课件截图和可选的附加文本，请从中提取出清晰的题目结构，并以 JSON 格式输出。\n\n你不仅要识别文字（类似 OCR），还要理解图片里的内容（例如物体、颜色、形状、数量、相对位置等），并把这些与题目有关的信息转化为题干或补充说明的一部分。\n\n【题型识别优先级】\n1. 如果页面上出现了明确的题型标签文字，如：\n   - "单选题"、"多选题"、"投票题"、"填空题"、"主观题" 等，\n   请优先根据这些标签设置 question_type：\n   - 单选题 / 投票题 -> "single_choice"\n   - 多选题         -> "multiple_choice"\n   - 填空题         -> "fill_in"\n   - 主观题 / 简答题 / 论述题 -> "subjective"\n2. 当没有明显题型标签时，再根据题干语义和版面结构推断题型。\n\n【选项字母规则】\n- 只有在页面上出现了清晰的选项字母（通常为 "A."、"B."、"C."、"D." 等）并跟随选项内容时，才能将 question_type 设为 "single_choice" 或 "multiple_choice"（或投票题对应的 "single_choice"）。\n- 如果没有任何 A/B/C/D 这种选项字母，而问题又需要开放性自由回答，请优先将 question_type 设为 "subjective"。\n\n请尽量识别：\n- question_type: "single_choice" | "multiple_choice" | "fill_in" | "subjective" | "visual_only" | "unknown"\n- stem: 题干文本（如果题干主要依赖图片，请用自然语言描述图片中与题目相关的内容，可保留数学公式信息）\n- options: 一个对象，键为 "A"、"B"、"C"、"D" 等，值为选项内容文字（若不是选择题可为空对象）\n- image_facts: （可选）一个字符串数组，列出与解题有关的关键图像事实，例如 ["图中是一根黄色的香蕉", "背景是白色"]。\n- requires_image_for_solution: 布尔值。如果即使你尽力用文字描述图片，仍然很难仅凭文字保证答对（例如复杂几何图形或高度依赖精确位置关系的题目），请设为 true；如果你的文字描述已经足够让人类或文字模型解题，请设为 false。\n\n输出示例（仅示例，不是固定模板）：\n{\n  "question_type": "single_choice",\n  "stem": "根据图片中的水果，选择它的颜色。",\n  "options": {\n    "A": "红色",\n    "B": "黄色",\n    "C": "蓝色",\n    "D": "绿色"\n  },\n  "image_facts": [\n    "图片中是一根黄色的香蕉，背景为白色"\n  ],\n  "requires_image_for_solution": false\n}\n\n如果无法识别题目或截图并非题目，请尽量给出你能看到的内容，但仍然保持上述 JSON 结构（字段缺省时可以用 null、空对象或空数组）。\n仅输出 JSON，不要任何额外文字。\n`.trim();
    const step1Messages = [ {
      role: "system",
      content: STEP1_SYSTEM_PROMPT
    }, {
      role: "user",
      content: [ ...cleanBase64List.map(b64 => ({
        type: "image_url",
        image_url: {
          url: imageDataUrl(b64)
        }
      })), textPrompt ? {
        type: "text",
        text: `【辅助文本】\n${textPrompt}`
      } : {
        type: "text",
        text: "【辅助文本】（无额外文本，仅根据截图识别题目）"
      } ]
    } ];
    let structuredQuestion;
    try {
      const data1 = await chatCompletion(profile, {
        model: visionModel,
        messages: step1Messages
      }, "[AI OpenAI Vision Step1]", timeoutMs, options);
      const content1 = data1.choices?.[0]?.message?.content || "";
      if (twoStepDebug) console.log("[雨课堂助手][DEBUG][vision-step1] raw content:", content1);
      const jsonMatch = content1.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("no JSON found in step1 result");
      structuredQuestion = JSON.parse(jsonMatch[0]);
    } catch (err) {
      options.guard?.();
      if (err.name === "DeadlineError" || err.timeout || err.status) throw err;
      console.warn("[雨课堂助手][WARN][vision-step1] failed, fallback to single-step", err);
      return singleStepVisionCall(profile, cleanBase64List, textPrompt, {
        ...options,
        timeout: timeoutMs
      });
    }
    if (!structuredQuestion || !structuredQuestion.stem) {
      console.warn("[雨课堂助手][WARN][vision-step1] invalid structuredQuestion, fallback");
      return singleStepVisionCall(profile, cleanBase64List, textPrompt, {
        ...options,
        timeout: timeoutMs
      });
    }
    if (twoStepDebug) console.log("[雨课堂助手][INFO][vision-step1] structuredQuestion:", structuredQuestion);
    // ========= 题型合并逻辑：后端 problemType 优先，其次 VLM 推断，全部缺失则回退 subjective =========
        const backendQuestionType = mapProblemTypeToQuestionType(problemType);
    const vlmQuestionType = structuredQuestion.question_type || null;
    let finalQuestionType = backendQuestionType || vlmQuestionType || null;
    // 如果 VLM 返回的是 unknown / visual_only 这类不太可用的类型，也当成“缺失”
        if (finalQuestionType === "unknown" || finalQuestionType === "visual_only") finalQuestionType = null;
    // 当后端和 VLM 都没有给出可用题型时，统一回退为主观题
        if (!finalQuestionType) finalQuestionType = "subjective";
    if (twoStepDebug) console.log("[雨课堂助手][INFO][vision-step1] questionType merged:", {
      problemType: problemType,
      backendQuestionType: backendQuestionType,
      vlmQuestionType: vlmQuestionType,
      finalQuestionType: finalQuestionType
    });
    // 如果模型明确表示“必须依赖原始图像才能解题”，则回退到单步 Vision，避免纯文本推理丢失关键信息
        if (structuredQuestion.requires_image_for_solution === true) {
      console.warn("[雨课堂助手][INFO][vision] step1 says image is essential, fallback to single-step");
      return singleStepVisionCall(profile, cleanBase64List, textPrompt, {
        ...options,
        timeout: timeoutMs
      });
    }
    // ===================== Step 2: Text 模型纯文本推理解题 =====================
        const {question_type: question_type, stem: stem, options: sqOptions = {}, image_facts: image_facts = []} = structuredQuestion;
    let solvePrompt = "你是一个严谨的解题助手，请根据下面的题目进行推理解答：\n\n";
    solvePrompt += `【题干】\n${stem}\n\n`;
    const optionKeys = Object.keys(sqOptions);
    if (optionKeys.length > 0) {
      solvePrompt += "【选项】\n";
      for (const key of optionKeys) solvePrompt += `${key}. ${sqOptions[key]}\n`;
      solvePrompt += "\n";
    }
    solvePrompt += "请逐步推理，推理结果按以下格式输出：\n";
    if (finalQuestionType === "single_choice") solvePrompt += "答案: [单个大写字母]\n解释: [简要说明你的推理过程]\n"; else if (finalQuestionType === "multiple_choice") solvePrompt += "答案: [多个大写字母，用顿号分隔，如 A、C、D]\n解释: [简要说明你的推理过程]\n"; else if (finalQuestionType === "fill_in") solvePrompt += "答案: [直接给出需要填入的内容，多个空用逗号分隔]\n解释: [简要说明你的推理过程]\n"; else if (finalQuestionType === "subjective") solvePrompt += "答案: [完整回答]\n解释: [可选的补充说明]\n";
    // 将图像关键信息一并提供给文本模型，用于弥补完全无图像输入的劣势
        if (Array.isArray(image_facts) && image_facts.length > 0) {
      solvePrompt += "【图像关键信息】\n";
      for (const fact of image_facts) if (typeof fact === "string" && fact.trim()) solvePrompt += `- ${fact.trim()}\n`;
      solvePrompt += "\n";
    }
    const step2Messages = [ {
      role: "system",
      content: "你是一个解题助手，请严格按照用户指定的输出格式作答，尽量保证答案正确。"
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
      }, "[AI OpenAI Vision Step2]", timeoutMs, options);
      const content2 = data2.choices?.[0]?.message?.content || "";
      if (!content2) throw new Error("AI返回内容为空");
      if (twoStepDebug) console.log("[雨课堂助手][INFO][vision-step2] final content:", content2);
      return content2;
    } catch (err) {
      options.guard?.();
      if (err.name === "DeadlineError" || err.timeout || err.status) throw err;
      console.warn("[雨课堂助手][WARN][vision-step2] failed, fallback to single-step", err);
      return singleStepVisionCall(profile, cleanBase64List, textPrompt, {
        ...options,
        timeout: timeoutMs
      });
    }
  }
  async function queryOCRVision(imageBase64, aiCfg) {
    const cfg = aiCfg || {};
    const baseProfile = getActiveProfile$1(cfg);
    const resolvedApiKey = (cfg.ocrApiKey || "").trim() || baseProfile?.apiKey || "";
    if (!baseProfile || !resolvedApiKey) throw new Error("请先在设置中填写可用的 OCR API Key 或 AI API Key");
    const profile = {
      ...baseProfile,
      baseUrl: (cfg.ocrApi || "").trim() || baseProfile.baseUrl,
      apiKey: resolvedApiKey
    };
    const cleanBase64 = String(imageBase64 || "").trim();
    if (!cleanBase64) throw new Error("OCR 图片内容为空");
    const data = await chatCompletion(profile, {
      model: profile.visionModel || profile.model,
      messages: [ {
        role: "system",
        content: [ "你是一个 OCR 助手。", "只提取图片中可见的文字内容，不要解题，不要总结，不要补充说明。", "尽量保留原有段落、标题、列表和换行。", "如果图片里没有可识别文字，只返回“未识别到文字”。" ].join("\n")
      }, {
        role: "user",
        content: [ {
          type: "image_url",
          image_url: {
            url: imageDataUrl(cleanBase64)
          }
        }, {
          type: "text",
          text: "请直接输出图片中的全部文字，保持结果可复制。"
        } ]
      } ]
    }, "[AI OCR Vision]", 6e4);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OCR 接口未返回文本内容");
    return String(content).trim();
  }
  async function queryTranslationText(text, targetLanguage, aiCfg) {
    const cfg = aiCfg || {};
    const baseProfile = getActiveProfile$1(cfg);
    const resolvedApiKey = (cfg.translateApiKey || "").trim() || baseProfile?.apiKey || "";
    if (!baseProfile || !resolvedApiKey) throw new Error("请先在设置中填写可用的翻译 API Key 或 AI API Key");
    const resolvedTargetLanguage = String(targetLanguage).trim();
    if (!resolvedTargetLanguage) throw new Error("翻译目标语言不能为空");
    const sourceText = String(text || "").trim();
    if (!sourceText) throw new Error("没有可翻译的文字内容");
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
        content: [ "你是一个专业翻译助手。", "只执行翻译，不要解释，不要总结，不要补充。", "尽量保留原文段落、列表、编号、公式和专有名词格式。", `将用户提供的文本翻译为：${resolvedTargetLanguage}。` ].join("\n")
      }, {
        role: "user",
        content: [ {
          type: "text",
          text: sourceText
        } ]
      } ]
    }, "[AI Translate]", 6e4);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("翻译接口未返回文本内容");
    return String(content).trim();
  }
  // src/capture/screenshot.js
    async function captureProblemScreenshot() {
    try {
      const html2canvas = await ensureHtml2Canvas();
      const el = document.querySelector(".ques-title") || document.querySelector(".problem-body") || document.querySelector(".ppt-inner") || document.querySelector(".ppt-courseware-inner") || document.body;
      return await Promise.race([ html2canvas(el, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        scale: 1,
        width: Math.min(el.scrollWidth, 1200),
        height: Math.min(el.scrollHeight, 800)
      }), new Promise(resolve => setTimeout(() => resolve(null), 12e3)) ]);
    } catch (e) {
      console.error("[captureProblemScreenshot] failed", e);
      return null;
    }
  }
  /**
   * 获取指定幻灯片的截图
   * @param {string} slideId - 幻灯片ID
   * @returns {Promise<string|null>} base64图片数据
   */  async function captureSlideImage(slideId, {lessonId: lessonId = repo.currentLessonId} = {}) {
    try {
      console.log("[captureSlideImage] 获取幻灯片图片:", slideId);
      const slide = repo.forLesson(lessonId).slides.get(slideId);
      if (!slide) {
        console.error("[captureSlideImage] 找不到幻灯片:", slideId);
        return null;
      }
      // 使用 cover 或 coverAlt 图片URL
            const imageUrl = slide.coverAlt || slide.cover || slide.image || slide.thumbnail;
      if (!imageUrl) {
        console.error("[captureSlideImage] 幻灯片没有图片URL");
        return null;
      }
      console.log("[captureSlideImage] 图片URL:", imageUrl);
      // 下载图片并转换为base64
            const base64 = await downloadImageAsBase64(imageUrl);
      if (!base64) {
        console.error("[captureSlideImage] 下载图片失败");
        return null;
      }
      console.log("[captureSlideImage] ✅ 成功获取图片, 大小:", Math.round(base64.length / 1024), "KB");
      return base64;
    } catch (e) {
      console.error("[captureSlideImage] 失败:", e);
      return null;
    }
  }
  /**
   * 下载图片并转换为base64
   * @param {string} url - 图片URL
   * @returns {Promise<string|null>}
   */  async function downloadImageAsBase64(url) {
    return new Promise(resolve => {
      try {
        const img = new Image;
        img.crossOrigin = "anonymous";
        const timer = setTimeout(() => {
          img.onload = img.onerror = null;
          img.src = "";
          resolve(null);
        }, 12e3);
        img.onload = () => {
          clearTimeout(timer);
          try {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            const base64 = canvas.toDataURL("image/jpeg", .8);
            if (base64.length > 1e6) {
              console.log("[雨课堂助手][INFO][downloadImageAsBase64] 图片过大，进行压缩...");
              const compressed = canvas.toDataURL("image/jpeg", .5);
              console.log("[雨课堂助手][INFO][downloadImageAsBase64] 压缩后大小:", Math.round(compressed.length / 1024), "KB");
              resolve(compressed);
            } else resolve(base64);
          } catch (e) {
            console.error("[雨课堂助手][ERR][downloadImageAsBase64] Canvas处理失败:", e);
            resolve(null);
          }
        };
        img.onerror = e => {
          clearTimeout(timer);
          console.error("[雨课堂助手][ERR][downloadImageAsBase64] 图片加载失败:", e);
          resolve(null);
        };
        img.src = url;
      } catch (e) {
        console.error("[雨课堂助手][ERR][downloadImageAsBase64] 失败:", e);
        resolve(null);
      }
    });
  }
  // 原有的 captureProblemForVision
    async function captureProblemForVision() {
    try {
      console.log("[captureProblemForVision] 开始截图...");
      const canvas = await captureProblemScreenshot();
      if (!canvas) {
        console.error("[captureProblemForVision] 截图失败");
        return null;
      }
      console.log("[captureProblemForVision] 截图成功，转换为base64...");
      const base64 = canvas.toDataURL("image/jpeg", .8);
      console.log("[captureProblemForVision] base64 长度:", base64.length);
      if (base64.length > 1e6) {
        console.log("[captureProblemForVision] 图片过大，进行压缩...");
        const smallerBase64 = canvas.toDataURL("image/jpeg", .5);
        console.log("[captureProblemForVision] 压缩后长度:", smallerBase64.length);
        return smallerBase64;
      }
      return base64;
    } catch (e) {
      console.error("[captureProblemForVision] failed", e);
      return null;
    }
  }
  function cleanProblemBody(body, problemType, TYPE_MAP) {
    if (!body) return "";
    const typeLabel = TYPE_MAP[problemType];
    if (!typeLabel) return body;
    // 去除题目开头的类型标识，如 "填空题：" "单选题：" 等
        const pattern = new RegExp(`^${typeLabel}[：:\\s]+`, "i");
    return body.replace(pattern, "").trim();
  }
  // 改进的融合模式 prompt 格式化函数
    function formatProblemForVision(problem, TYPE_MAP, hasTextInfo = false) {
    const problemType = TYPE_MAP[problem.problemType] || "题目";
    let basePrompt = hasTextInfo ? `结合文本信息和图片内容分析${problemType}，按格式回答：` : `观察图片内容，识别${problemType}并按格式回答：`;
    if (hasTextInfo && problem.body) {
      // ✅ 清理题目内容
      const cleanBody = cleanProblemBody(problem.body, problem.problemType, TYPE_MAP);
      basePrompt += `\n\n【文本信息】\n题目：${cleanBody}`;
      if (problem.options?.length) {
        basePrompt += "\n选项：";
        for (const o of problem.options) basePrompt += `\n${o.key}. ${o.value}`;
      }
      basePrompt += "\n\n若图片内容与文本冲突，以图片为准。";
    }
    // 根据题目类型添加具体格式要求
        switch (problem.problemType) {
     case 1:
      // 单选题
      basePrompt += `\n\n格式要求：\n答案: [单个字母]\n解释: [选择理由]\n\n注意：只选一个，如A`;
      break;

     case 2:
      // 多选题
      basePrompt += `\n\n格式要求：\n答案: [多个字母用顿号分开]\n解释: [选择理由]\n\n注意：格式如A、B、C`;
      break;

     case 3:
      // 投票题
      basePrompt += `\n\n格式要求：\n答案: [单个字母]\n解释: [选择理由]\n\n注意：只选一个选项`;
      break;

     case 4:
      // 填空题
      basePrompt += `\n\n这是一道填空题。\n\n重要说明：\n- 题目内容已经处理，不含"填空题"等字样\n- 观察图片和文本，找出需要填入的内容\n- 答案中不要出现任何题目类型标识\n\n格式要求：\n答案: [直接给出填空内容]\n解释: [简要说明]\n\n示例：\n答案: 氧气,葡萄糖\n解释: 光合作用的产物\n\n多个填空用逗号分开`;
      break;

     case 5:
      // 主观题
      basePrompt += `\n\n格式要求：\n答案: [完整回答]\n解释: [补充说明]\n\n注意：直接回答，不要重复题目`;
      break;

     default:
      basePrompt += `\n\n格式要求：\n答案: [你的答案]\n解释: [详细解释]`;
    }
    return basePrompt;
  }
  // 改进的答案解析函数
    function parseAIAnswer(problem, response) {
    try {
      const type = Number(problem.problemType);
      let text = String(response || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const label = text.match(/(?:^|\n)\s*(?:\*\*)?(?:答案|answer)\s*[:：]\s*(?:\*\*)?/i);
      if (label) text = text.slice(label.index + label[0].length).split(/\n\s*(?:解释|解析|说明|explanation)\s*[:：]/i)[0].trim();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {}
      if (parsed && !Array.isArray(parsed) && typeof parsed === "object" && Object.hasOwn(parsed, "answer")) parsed = parsed.answer;
      if ([ 1, 2, 3 ].includes(type)) {
        if (!Array.isArray(parsed)) {
          const clean = text.replace(/^(?:选择|选项|选)\s*/, "").trim().toUpperCase();
          if (!/^[A-Z](?:[\s,，、;；]*[A-Z])*$/.test(clean)) return null;
          parsed = clean.match(/[A-Z]/g);
        }
      } else if (type === 4 && !Array.isArray(parsed)) {
        const count = problem.blanks?.length || 1;
        if (count === 1) parsed = [ typeof parsed === "string" || typeof parsed === "number" ? String(parsed) : text ]; else {
          const lines = text.split(/\n+/).map(x => x.replace(/^\s*\d+[.、)]\s*/, "").trim()).filter(Boolean);
          if (lines.length === count) parsed = lines; else {
            const parts = text.split(/[,，;；]/).map(x => x.trim());
            if (parts.length !== count || parts.some(x => /[()[\]{}]/.test(x))) return null;
            parsed = parts;
          }
        }
      } else if (type === 5 && (!parsed || typeof parsed !== "object")) parsed = {
        content: typeof parsed === "string" ? parsed : text,
        pics: []
      };
      return validateAnswer(problem, parsed);
    } catch {
      return null;
    }
  }
  const L$2 = (...a) => console.log("[雨课堂助手][DBG][vuex-helper]", ...a);
  const W$2 = (...a) => console.warn("[雨课堂助手][WARN][vuex-helper]", ...a);
  const E = (...a) => console.error("[雨课堂助手][ERR][vuex-helper]", ...a);
  function getVueApp() {
    try {
      const app = document.querySelector("#app")?.__vue__;
      if (!app) W$2("getVueApp: 找不到 #app.__vue__");
      return app || null;
    } catch (e) {
      E("getVueApp 错误:", e);
      return null;
    }
  }
  // 统一返回「字符串」，并打印原始类型
    function getCurrentMainPageSlideId() {
    try {
      const app = getVueApp();
      if (!app || !app.$store) {
        W$2("getCurrentMainPageSlideId: 无 app 或 store");
        return null;
      }
      const currSlide = app.$store.state?.currSlide;
      if (!currSlide) {
        L$2("getCurrentMainPageSlideId: currSlide 为 null/undefined");
        return null;
      }
      const rawSid = currSlide.sid;
      const sidStr = rawSid == null ? null : String(rawSid);
      console.log("[getCurrentMainPageSlideId] 获取到 slideId:", sidStr, "{type:", currSlide.type, ", problemID:", currSlide.problemID, ", index:", currSlide.index, "}", "(raw type:", typeof rawSid, ", raw value:", rawSid, ")");
      return sidStr;
    } catch (e) {
      E("getCurrentMainPageSlideId 错误:", e);
      return null;
    }
  }
  function watchMainPageChange(callback) {
    const app = getVueApp();
    if (!app || !app.$store) {
      E("watchMainPageChange: 无法获取 Vue 实例或 store");
      return () => {};
    }
    const unwatch = app.$store.watch(state => state.currSlide, (ns, os) => {
      const newSid = ns?.sid == null ? null : String(ns.sid);
      const oldSid = os?.sid == null ? null : String(os.sid);
      L$2("主界面页面切换", {
        oldSid: oldSid,
        newSid: newSid,
        newType: ns?.type,
        newProblemID: ns?.problemID,
        newIndex: ns?.index,
        rawNewSidType: typeof ns?.sid
      });
      if (newSid) callback(newSid, ns);
    }, {
      deep: false
    });
    L$2("已启动主界面页面切换监听");
    return unwatch;
  }
  function waitForVueReady() {
    return new Promise(resolve => {
      const t0 = Date.now();
      const check = () => {
        const app = getVueApp();
        if (app && app.$store) {
          L$2("waitForVueReady: ok, elapsed(ms)=", Date.now() - t0);
          resolve(app);
        } else setTimeout(check, 100);
      };
      check();
    });
  }
  const L$1 = (...a) => console.log("[雨课堂助手][DBG][ai]", ...a);
  const W$1 = (...a) => console.warn("[雨课堂助手][WARN][ai]", ...a);
  let analysisSequence = 0;
  let currentProblemContext = null;
  const pendingAnalyses = new Map;
  let mounted$4 = false;
  let root$3;
  let preferredSlideFromPresentation = null;
 // 启用来自presentation的页面
    let preferredSlidesFromPresentation = [];
 // 手动多页（仅用于“提问当前PPT”的多选）
    let manualMultiSlidesArmed = false;
 // 只有手动触发时才允许多图
    function renderSelectedPPTPreview() {
    const box = document.getElementById("ykt-ai-selected");
    const singleImg = document.getElementById("ykt-ai-selected-thumb");
    const thumbs = document.getElementById("ykt-ai-selected-thumbs");
    if (!box || !singleImg || !thumbs) return;
    // 清空多图容器
        thumbs.innerHTML = "";
    // 多页优先显示（来自手动多选）
        if (Array.isArray(preferredSlidesFromPresentation) && preferredSlidesFromPresentation.length > 0) {
      const items = preferredSlidesFromPresentation.map(s => ({
        slideId: asIdStr(s.slideId),
        imageUrl: s.imageUrl || ""
      })).filter(x => !!x.imageUrl);
      if (items.length > 0) {
        singleImg.style.display = "none";
        for (const it of items) {
          const img = document.createElement("img");
          img.src = it.imageUrl;
          img.alt = `PPT ${it.slideId || ""}`;
          img.style.cssText = "max-width:120px; max-height:80px; display:block; border-radius:4px;";
          thumbs.appendChild(img);
        }
        box.style.display = "";
        return;
      }
    }
    // 单页回退
        const url = preferredSlideFromPresentation?.imageUrl || "";
    if (url) {
      singleImg.src = url;
      singleImg.style.display = "";
      box.style.display = "";
    } else {
      singleImg.style.display = "none";
      box.style.display = "none";
    }
  }
  async function ensureMathJax() {
    const target = gm.uw || window;
    if (!target.MathJax?.typesetPromise) {
      target.MathJax = target.MathJax || {
        tex: {
          inlineMath: [ [ "$", "$" ], [ "\\(", "\\)" ] ]
        },
        svg: {
          fontCache: "global"
        }
      };
      try {
        await loadScriptOnce("https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.min.js");
      } catch {
        return false;
      }
    }
    window.MathJax = target.MathJax;
    if (window.MathJax?.startup?.promise) await window.MathJax.startup.promise;
    return !!window.MathJax?.typesetPromise;
  }
  function typesetTexIn(el) {
    const mj = window.MathJax;
    if (!el || !mj || typeof mj.typesetPromise !== "function") return Promise.resolve(false);
    // 等待 MathJax 自己的启动就绪
        const ready = mj.startup && mj.startup.promise ? mj.startup.promise : Promise.resolve();
    return ready.then(() => mj.typesetPromise([ el ]).then(() => true).catch(() => false));
  }
  function escapeHtml(s = "") {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function safeLink(url = "") {
    try {
      const u = new URL(url, location.origin);
      if (u.protocol === "http:" || u.protocol === "https:") return u.href;
    } catch (_) {}
    return null;
 // 非 http/https 直接丢弃，避免 javascript: 等协议
    }
  function mdToHtml(mdRaw = "") {
    const protectedParts = [];
    const keep = html => {
      const i = protectedParts.push(html) - 1;
      return `${i}`;
    };
    mdRaw = String(mdRaw).replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => keep(`<pre class="ykt-md-code"><code data-lang="${lang}">${escapeHtml(code)}</code></pre>`));
    mdRaw = mdRaw.replace(/`([^`]+)`/g, (_, code) => keep(`<code>${escapeHtml(code)}</code>`));
    mdRaw = mdRaw.replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+\$/g, math => keep(escapeHtml(math)));
    // 先整体转义，确保默认无 HTML 注入
        let md = escapeHtml(mdRaw).replace(/\r\n?/g, "\n");
    // 代码块（fenced）
    // ```lang\ncode\n```
        md = md.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      const l = lang ? ` data-lang="${lang}"` : "";
      return `<pre class="ykt-md-code"><code${l}>${code}</code></pre>`;
    });
    // 行内代码 `
        md = md.replace(/`([^`]+?)`/g, (_, code) => `<code class="ykt-md-inline">${code}</code>`);
    // 标题 #, ##, ###, ####, #####, ######
        md = md.replace(/^######\s+(.*)$/gm, "<h6>$1</h6>").replace(/^#####\s+(.*)$/gm, "<h5>$1</h5>").replace(/^####\s+(.*)$/gm, "<h4>$1</h4>").replace(/^###\s+(.*)$/gm, "<h3>$1</h3>").replace(/^##\s+(.*)$/gm, "<h2>$1</h2>").replace(/^#\s+(.*)$/gm, "<h1>$1</h1>");
    // 引用块 >
        md = md.replace(/^(?:&gt;\s?.+(\n(?!\n).+)*)/gm, block => {
      const inner = block.replace(/^&gt;\s?/gm, "");
      return `<blockquote>${inner}</blockquote>`;
    });
    // 无序列表
        md = md.replace(/(^(-|\*|\+)\s+.+(\n(?!\n).+)*)/gm, block => {
      const items = block.split("\n").map(l => l.trim()).filter(l => /^(-|\*|\+)\s+/.test(l)).map(l => `<li>${l.replace(/^(-|\*|\+)\s+/, "")}</li>`).join("");
      return `<ul>${items}</ul>`;
    });
    // 有序列表
        md = md.replace(/(^\d+\.\s+.+(\n(?!\n).+)*)/gm, block => {
      const items = block.split("\n").map(l => l.trim()).filter(l => /^\d+\.\s+/.test(l)).map(l => `<li>${l.replace(/^\d+\.\s+/, "")}</li>`).join("");
      return `<ol>${items}</ol>`;
    });
    // 粗体/斜体
        md = md.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
    md = md.replace(/\*([^*]+?)\*/g, "<em>$1</em>");
    md = md.replace(/__([^_]+?)__/g, "<strong>$1</strong>");
    md = md.replace(/_([^_]+?)_/g, "<em>$1</em>");
    // 水平线
        md = md.replace(/^\s*([-*_]){3,}\s*$/gm, "<hr/>");
    // 链接 [text](url)
        md = md.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, (_, text, url) => {
      const safe = safeLink(url);
      if (!safe) return text;
 // 不安全则降级为纯文本
            return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });
    // 段落：把非块级标签之外的连续文字块包成 <p>
        const lines = md.split("\n");
    const out = [];
    let buf = [];
    const flush = () => {
      if (!buf.length) return;
      out.push(`<p>${buf.join("<br/>")}</p>`);
      buf = [];
    };
    const isBlock = s => /^(<h[1-6]|<ul>|<ol>|<pre |<blockquote>|<hr\/>|<p>|<table|<div)/.test(s);
    for (const ln of lines) {
      if (!ln.trim()) {
        flush();
        continue;
      }
      if (isBlock(ln)) {
        flush();
        out.push(ln);
      } else buf.push(ln);
    }
    flush();
    return out.join("\n").replace(/\uE000(\d+)\uE001/g, (_, i) => protectedParts[Number(i)] || "");
  }
  function findSlideAcrossPresentations$1(idStr) {
    for (const [, pres] of repo.presentations) {
      const arr = pres?.slides || [];
      const hit = arr.find(s => String(s.id) === idStr);
      if (hit) return hit;
    }
    return null;
  }
  // —— 运行时自愈：把 repo.slides 的数字键迁移为字符串键
    function normalizeRepoSlidesKeys$1(tag = "ai.mount") {
    try {
      if (!repo || !repo.slides || !(repo.slides instanceof Map)) {
        W$1("normalizeRepoSlidesKeys: repo.slides 不是 Map");
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
      }
      const afterSample = Array.from(repo.slides.keys()).slice(0, 8);
      L$1(`[normalizeRepoSlidesKeys@${tag}] 总键=${beforeKeys.length}，数字键=${nums.length}，迁移为字符串=${moved}，sample=`, afterSample);
    } catch (e) {
      W$1("normalizeRepoSlidesKeys error:", e);
    }
  }
  function asIdStr(v) {
    return v == null ? null : String(v);
  }
  function isMainPriority() {
    const v = ui?.config?.aiSlidePickPriority;
    const ret = !(v === "presentation");
    L$1("isMainPriority?", {
      cfg: v,
      result: ret
    });
    return ret;
  }
  function fallbackSlideIdFromRecent() {
    try {
      if (repo.encounteredProblems?.length > 0) {
        const latest = repo.encounteredProblems.at(-1);
        const st = repo.problemStatus.get(latest.problemId);
        const sid = st?.slideId ? String(st.slideId) : null;
        L$1("fallbackSlideIdFromRecent", {
          latestProblemId: latest.problemId,
          sid: sid
        });
        return sid;
      }
    } catch (e) {
      W$1("fallbackSlideIdFromRecent error:", e);
    }
    return null;
  }
  function $$3(sel) {
    return document.querySelector(sel);
  }
  function getSlideByAny$1(id) {
    const sid = id == null ? null : String(id);
    if (!sid) return {
      slide: null,
      hit: "none"
    };
    if (repo.slides.has(sid)) return {
      slide: repo.slides.get(sid),
      hit: "string"
    };
    const cross = findSlideAcrossPresentations$1(sid);
    if (cross) {
      repo.slides.set(sid, cross);
      return {
        slide: cross,
        hit: "cross-fill"
      };
    }
    const asNum = Number.isNaN(Number(sid)) ? null : Number(sid);
    if (asNum != null && repo.slides.has(asNum)) {
      const v = repo.slides.get(asNum);
      repo.slides.set(sid, v);
      return {
        slide: v,
        hit: "number→string-migrate"
      };
    }
    return {
      slide: null,
      hit: "miss"
    };
  }
  function mountAIPanel() {
    if (mounted$4) return root$3;
    normalizeRepoSlidesKeys$1("ai.mount");
    const host = document.createElement("div");
    host.innerHTML = tpl$4;
    document.body.appendChild(host.firstElementChild);
    root$3 = document.getElementById("ykt-ai-answer-panel");
    $$3("#ykt-ai-close")?.addEventListener("click", () => showAIPanel(false));
    $$3("#ykt-ai-ask")?.addEventListener("click", askAIFusionMode);
    const answerEdit = $$3("#ykt-ai-answer-edit");
    const mode = $$3("#ykt-ai-submit-mode");
    answerEdit?.addEventListener("input", () => {
      if (currentProblemContext) repo.saveDraft(currentProblemContext.problem.problemId, answerEdit.value, currentProblemContext.lessonId);
    });
    $$3("#ykt-ai-reset-edit")?.addEventListener("click", () => {
      if (!currentProblemContext?.problem.aiProposal) return;
      answerEdit.value = JSON.stringify(currentProblemContext.problem.aiProposal);
      repo.saveDraft(currentProblemContext.problem.problemId, answerEdit.value, currentProblemContext.lessonId);
    });
    $$3("#ykt-ai-submit")?.addEventListener("click", async () => {
      const ctx = currentProblemContext;
      if (!ctx) return;
      if (mode.value === "local") return ui.toast(repo.saveDraft(ctx.problem.problemId, answerEdit.value, ctx.lessonId) ? "草稿已保存本地，未提交" : "本地保存失败，草稿仍在编辑器");
      try {
        repo.saveDraft(ctx.problem.problemId, answerEdit.value, ctx.lessonId);
        const revision = ctx.problem.draftRevision;
        const outcome = await actions.submit(ctx.problem, answerEdit.value, {
          lessonId: ctx.lessonId,
          policy: mode.value,
          forceRetry: mode.value === "retry",
          guard: () => {
            if (ctx.problem.draftRevision !== revision) throw new Error("草稿已变化，停止提交");
          }
        });
        ui.toast(outcome.route === "retry" ? "补交已确认成功" : "提交已确认成功");
      } catch (error) {
        setAIError(error.message);
      }
    });
    window.addEventListener("ykt:lesson-change", () => {
      analysisSequence++;
      currentProblemContext = null;
      preferredSlideFromPresentation = null;
      preferredSlidesFromPresentation = [];
      manualMultiSlidesArmed = false;
      setAILoading(false);
      $$3("#ykt-ai-edit-section").style.display = "none";
    });
    waitForVueReady().then(() => {
      watchMainPageChange((slideId, slideInfo) => {
        L$1("主界面页面切换事件", {
          slideId: slideId,
          slideInfoType: slideInfo?.type,
          problemID: slideInfo?.problemID,
          index: slideInfo?.index
        });
        preferredSlideFromPresentation = null;
        renderQuestion();
      });
    }).catch(e => {
      W$1("Vue 实例初始化失败，将使用备用方案:", e);
    });
    window.addEventListener("ykt:presentation:slide-selected", ev => {
      L$1("收到小窗选页事件", ev?.detail);
      const sid = asIdStr(ev?.detail?.slideId);
      const imageUrl = ev?.detail?.imageUrl || null;
      if (sid) preferredSlideFromPresentation = {
        slideId: sid,
        imageUrl: imageUrl
      };
      // 普通选页不应该保留手动多选
            preferredSlidesFromPresentation = [];
      manualMultiSlidesArmed = false;
      renderQuestion();
    });
    window.addEventListener("ykt:open-ai", ev => {
      if (ev.detail?.slideId) {
        preferredSlideFromPresentation = {
          slideId: String(ev.detail.slideId),
          imageUrl: ""
        };
        preferredSlidesFromPresentation = [];
        manualMultiSlidesArmed = false;
      }
      L$1("收到打开 AI 面板事件");
      showAIPanel(true);
    });
    window.addEventListener("ykt:ask-ai-for-slide", ev => {
      const detail = ev?.detail || {};
      const slideId = asIdStr(detail.slideId);
      const imageUrl = detail.imageUrl || "";
      L$1("收到“提问当前PPT”事件", {
        slideId: slideId,
        imageLen: imageUrl?.length || 0
      });
      if (slideId) {
        preferredSlideFromPresentation = {
          slideId: slideId,
          imageUrl: imageUrl
        };
        // 单页提问不应该触发多选逻辑
                preferredSlidesFromPresentation = [];
        manualMultiSlidesArmed = false;
        const look = getSlideByAny$1(slideId);
        if (look.slide && imageUrl) look.slide.image = imageUrl;
        L$1("提问当前PPT: lookupHit=", look.hit, "hasSlide=", !!look.slide);
      }
      showAIPanel(true);
      renderQuestion();
      renderSelectedPPTPreview();
    });
    // ===== 手动多页提问（来自课件面板多选）=====
        window.addEventListener("ykt:ask-ai-for-slides", ev => {
      const detail = ev?.detail || {};
      const slides = Array.isArray(detail.slides) ? detail.slides : [];
      if (!slides.length) return;
      if (detail.source !== "manual") return;
 // 只允许手动路径进入
            preferredSlidesFromPresentation = slides.map(s => ({
        slideId: asIdStr(s.slideId),
        imageUrl: s.imageUrl || ""
      })).filter(s => !!s.slideId);
      manualMultiSlidesArmed = preferredSlidesFromPresentation.length > 0;
      // 预览仍保持单页逻辑：用第一张作为“已选择页面”的展示（不强制要求改 UI）
            const first = preferredSlidesFromPresentation[0];
      if (first?.slideId) {
        preferredSlideFromPresentation = {
          slideId: first.slideId,
          imageUrl: first.imageUrl || ""
        };
        const look = getSlideByAny$1(first.slideId);
        if (look.slide && first.imageUrl) look.slide.image = first.imageUrl;
      }
      L$1("收到手动多页提问事件", {
        count: preferredSlidesFromPresentation.length,
        armed: manualMultiSlidesArmed
      });
      showAIPanel(true);
      renderQuestion();
      renderSelectedPPTPreview();
    });
    mounted$4 = true;
    L$1("mountAIPanel 完成, cfg.aiSlidePickPriority=", ui?.config?.aiSlidePickPriority);
    return root$3;
  }
  function showAIPanel(v = true) {
    mountAIPanel();
    root$3.classList.contains("visible");
    root$3.classList.toggle("visible", !!v);
    if (v) {
      renderQuestion();
      if (ui.config.aiAutoAnalyze) queueMicrotask(() => {
        askAIFusionMode();
      });
    }
    const aiBtn = document.getElementById("ykt-btn-ai");
    if (aiBtn) aiBtn.classList.toggle("active", !!v);
    L$1("showAIPanel", {
      visible: v
    });
  }
  function setAILoading(v) {
    $$3("#ykt-ai-loading").style.display = v ? "" : "none";
  }
  function setAIError(msg = "") {
    const el = $$3("#ykt-ai-error");
    el.style.display = msg ? "" : "none";
    el.textContent = msg || "";
  }
  function setAIAnswer(content = "") {
    const el = $$3("#ykt-ai-answer");
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
          console.warn("[雨课堂助手][WARN][ai] MathJax 未就绪，跳过 typeset");
          return;
        }
        el.classList.add("tex-enabled");
        typesetTexIn(el).then(() => console.log("[雨课堂助手][DBG][ai] MathJax typeset 完成"));
      }); else el.classList.remove("tex-enabled");
    } catch (e) {/* 静默降级 */}
  }
  function getCustomPrompt() {
    const el = $$3("#ykt-ai-custom-prompt");
    return el ? el.value.trim() || "" : "";
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
    L$1(`${where} -> lookup`, {
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
        displayText = `来自课件面板：${slide.title || `第 ${slide.page || slide.index || ""} 页`}`;
        selectionSource = `课件浏览（传入/${look.hit}键命中）`;
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
          displayText = `主界面当前页: ${slide.title || `第 ${slide.page || slide.index || ""} 页`}`;
          selectionSource = `主界面检测（${look.hit}键命中）`;
          displayText += slide.problem ? "\n📝 此页面包含题目" : "\n📄 此页面为普通内容页";
          hasPageSelected = true;
        }
      } else {
        const presentationPanel = document.getElementById("ykt-presentation-panel");
        const isOpen = presentationPanel && presentationPanel.classList.contains("visible");
        const curSid = asIdStr(repo.currentSlideId);
        L$1("renderQuestion(presentation priority)", {
          isOpen: isOpen,
          curSid: curSid
        });
        if (isOpen && curSid) {
          _logMapLookup("renderQuestion(pres open, curSid)", curSid);
          const look = getSlideByAny$1(curSid);
          slide = look.slide;
          if (slide) {
            displayText = `课件面板选中: ${slide.title || `第 ${slide.page || slide.index || ""} 页`}`;
            selectionSource = `课件浏览面板（${look.hit}键命中）`;
            displayText += slide.problem ? "\n📝 此页面包含题目" : "\n📄 此页面为普通内容页";
            hasPageSelected = true;
          }
        } else {
          if (!slide && curSid) {
            _logMapLookup("renderQuestion(pres fallback curSid)", curSid);
            const look = getSlideByAny$1(curSid);
            slide = look.slide;
            if (slide) {
              displayText = `课件面板最近选中: ${slide.title || `第 ${slide.page || slide.index || ""} 页`}`;
              selectionSource = `课件浏览（兜底/${look.hit}键命中）`;
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
                displayText = `最近题目关联页: ${slide.title || `第 ${slide.page || slide.index || ""} 页`}`;
                selectionSource = `最近题目（兜底/${look.hit}键命中）`;
                hasPageSelected = true;
              }
            }
          }
          if (!slide) {
            displayText = "未检测到当前页面\n💡 请在主界面或课件面板中选择页面。";
            selectionSource = "无";
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
      statusEl.textContent = hasPageSelected ? `✓ 已选择页面（来源：${selectionSource}），可进行图像分析` : "⚠ 请选择要分析的页面";
      statusEl.className = hasPageSelected ? "text-status success" : "text-status warning";
    }
  }
  async function runAIFusionMode() {
    const sequence = ++analysisSequence, lessonId = repo.currentLessonId;
    const isCurrent = () => sequence === analysisSequence && String(lessonId) === String(repo.currentLessonId);
    currentProblemContext = null;
    const editSection = document.getElementById("ykt-ai-edit-section");
    if (editSection) editSection.style.display = "none";
    setAIError("");
    setAILoading(true);
    setAIAnswer("");
    try {
      if (!hasActiveAIProfile(ui.config.ai)) throw new Error("请先在设置中配置 API Key");
      let currentSlideId = null;
      let slide = null;
      let selectionSource = "";
      let forcedImageUrl = null;
      if (preferredSlideFromPresentation?.slideId) {
        currentSlideId = asIdStr(preferredSlideFromPresentation.slideId);
        const look = getSlideByAny$1(currentSlideId);
        slide = look.slide;
        forcedImageUrl = preferredSlideFromPresentation.imageUrl || null;
        selectionSource = `课件浏览（传入/${look.hit}键命中）`;
        L$1("[ask] 使用presentation传入的页面:", {
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
            selectionSource = `主界面当前页面（${look.hit}键命中）`;
            L$1("[ask] 使用主界面当前页面:", {
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
            selectionSource = `课件浏览面板（${look.hit}键命中）`;
            L$1("[ask] 使用课件面板选中的页面:", {
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
        selectionSource = selectionSource || `课件浏览（兜底/${look.hit}键命中）`;
        L$1("[ask] Fallback 使用 repo.currentSlideId:", {
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
          selectionSource = selectionSource || `最近题目（兜底/${look.hit}键命中）`;
          L$1("[ask] Fallback 使用 最近题目 slideId:", {
            currentSlideId: currentSlideId,
            lookupHit: look.hit,
            hasSlide: !!slide
          });
        }
      }
      if (!currentSlideId || !slide) throw new Error("无法确定要分析的页面。请在主界面打开一个页面，或在课件浏览中选择页面。");
      L$1("[ask] 页面选择来源:", selectionSource, "页面ID:", currentSlideId, "页面信息:", slide);
      if (forcedImageUrl) {
        slide.image = forcedImageUrl;
 // 强制指定
                L$1("[ask] 使用传入 imageUrl");
      }
      // ===== 获取图片：仅手动多选时走多图；否则保持单图 =====
            let imageBase64OrList = null;
      if (manualMultiSlidesArmed && Array.isArray(preferredSlidesFromPresentation) && preferredSlidesFromPresentation.length > 0) {
        const ids = preferredSlidesFromPresentation.map(s => asIdStr(s.slideId)).filter(Boolean);
        ui.toast(`正在获取课件多页图片（共 ${ids.length} 页）...`, 2500);
        L$1("[ask] 手动多页截图开始", {
          ids: ids
        });
        const images = [];
        for (const sid of ids) {
          const b64 = await captureSlideImage(sid);
          if (b64) images.push(b64);
        }
        if (images.length !== ids.length) throw new Error(`所选 ${ids.length} 页中有 ${ids.length - images.length} 页图片失败，请重试；未发送不完整内容`);
        imageBase64OrList = images;
        // 消费一次：避免 aiAutoAnalyze 或后续调用误用多图
                manualMultiSlidesArmed = false;
        preferredSlidesFromPresentation = [];
        L$1("[ask] ✅ 手动多页截图完成", {
          got: images.length
        });
      } else {
        L$1("[ask] 获取页面图片...");
        ui.toast(`正在获取${selectionSource}图片...`, 2e3);
        const imageBase64 = await captureSlideImage(currentSlideId);
        if (!imageBase64) throw new Error("无法获取页面图片，请确保页面已加载完成");
        imageBase64OrList = imageBase64;
        L$1("[ask] ✅ 页面图片获取成功，大小(KB)=", Math.round(imageBase64.length / 1024));
      }
      let textPrompt = `【页面说明】当前页面可能不是题目页；请结合用户提示作答。`;
      const customPrompt = getCustomPrompt();
      if (customPrompt) {
        textPrompt += `\n\n【用户自定义要求】\n${customPrompt}`;
        L$1("[ask] 用户自定义prompt:", customPrompt);
      }
      // ===== 题型 hint：仅当当前页面是题目时提供 =====
            let problemType = null;
      const problem = slide?.problem;
      if (problem && typeof problem.problemType !== "undefined") problemType = problem.problemType;
      L$1("[ask] problemType hint:", problemType);
      ui.toast(`正在分析${selectionSource}内容...`, 3e3);
      L$1("[ask] 调用 Vision API...");
      const aiContent = await queryAIVision(imageBase64OrList, textPrompt, ui.config.ai, {
        problemType: problemType
      });
      if (!isCurrent()) return;
      setAILoading(false);
      L$1("[ask] Vision API调用成功, 内容长度=", aiContent?.length);
      // 若当前页有题目，尝试解析
            let parsed = null;
      if (problem) {
        parsed = parseAIAnswer(problem, aiContent);
        L$1("[ask] 解析结果:", parsed);
      }
      let displayContent = `${selectionSource}图像分析结果：\n${aiContent}`;
      if (customPrompt) displayContent = `${selectionSource}图像分析结果（包含自定义要求）：\n${aiContent}`;
      if (parsed && problem) {
        const current = repo.problems.get(problem.problemId) || problem;
        current.aiProposal = parsed;
        current.proposalRaw = aiContent;
        current.updatedAt = Date.now();
        repo.persistWork(lessonId);
        currentProblemContext = {
          problem: current,
          lessonId: lessonId
        };
        const editor = document.getElementById("ykt-ai-answer-edit");
        if (editor) editor.value = current.draftText ?? JSON.stringify(parsed);
        if (editSection) editSection.style.display = "";
        setAIAnswer(`${displayContent}\n\nAI 建议答案：${JSON.stringify(parsed)}`);
      } else {
        if (!problem) displayContent += "\n\n💡 当前页面不是题目页面（或未识别到题目）。";
        setAIAnswer(displayContent);
      }
    } catch (e) {
      if (!isCurrent()) return;
      setAILoading(false);
      W$1("[ask] 页面分析失败:", e);
      setAIError(`页面分析失败: ${e.message}`);
    }
  }
  function askAIFusionMode() {
    const fingerprint = JSON.stringify([ repo.accountId, repo.currentLessonId, preferredSlideFromPresentation?.slideId, preferredSlidesFromPresentation.map(s => s.slideId), repo.currentSlideId, getCurrentMainPageSlideId(), getCustomPrompt(), ui.config.ai.activeProfileId ]);
    if (pendingAnalyses.has(fingerprint)) return pendingAnalyses.get(fingerprint);
    const task = runAIFusionMode().finally(() => {
      if (pendingAnalyses.get(fingerprint) === task) pendingAnalyses.delete(fingerprint);
    });
    pendingAnalyses.set(fingerprint, task);
    return task;
  }
  async function askAIForCurrent() {
    return askAIFusionMode();
  }
  var tpl$3 = '<div id="ykt-presentation-panel" class="ykt-panel">\n  <style>\n    #ykt-presentation-panel .slide-thumb.selected {\n      outline: 2px solid #3b82f6;\n      outline-offset: 2px;\n    }\n    #ykt-presentation-panel .slide-image-error {\n      display: block;\n      padding: 24px 8px;\n      color: #64748b;\n    }\n    #ykt-presentation-panel .no-problem-slides {\n      grid-column: 1 / -1;\n      color: #64748b;\n    }\n  </style>\n  <div class="panel-header">\n    <h3>课件查看</h3>\n    <div class="panel-controls">\n      <label>\n        <input type="checkbox" id="ykt-show-all-slides"> 切换全部页面/问题页面\n      </label>\n      <button id="ykt-ask-current">提问当前PPT</button>\n      <button id="ykt-ocr-current">文字识别</button>\n      <button id="ykt-open-problem-list">题目列表</button>\n      <button id="ykt-download-current">截图下载</button>\n      <button id="ykt-download-pdf">整册下载(PDF)</button>\n      <span class="close-btn" id="ykt-presentation-close"><i class="fas fa-times"></i></span>\n    </div>\n  </div>\n\n  <div class="panel-body">\n    <div class="panel-left">\n      <div id="ykt-presentation-list" class="presentation-list"></div>\n    </div>\n    <div class="panel-right">\n      <div id="ykt-slide-view" class="slide-view">\n        <div class="slide-cover">\n          <div class="empty-message">选择左侧的幻灯片查看详情</div>\n        </div>\n        <div id="ykt-problem-view" class="problem-view"></div>\n      </div>\n      <div id="ykt-ocr-panel" class="ocr-panel">\n        <div class="ocr-head">\n          <span>文字结果</span>\n          <span id="ykt-ocr-status" class="ocr-status">未开始</span>\n        </div>\n        <div id="ykt-ocr-tip" class="ocr-tip">选择课件页后点击“文字识别”。</div>\n        <textarea id="ykt-ocr-result" class="ocr-result" readonly placeholder="识别结果会显示在这里，支持直接复制。"></textarea>\n        <div class="ocr-translate-bar">\n          <label for="ykt-translate-target">目标语言</label>\n          <input type="text" id="ykt-translate-target" class="ocr-target-input" placeholder="默认使用浏览器语言">\n          <button id="ykt-translate-toggle">翻译</button>\n          <span id="ykt-translate-status" class="ocr-status">未翻译</span>\n        </div>\n        <div id="ykt-translate-tip" class="ocr-tip">默认翻译到浏览器语言，也可手动修改目标语言。</div>\n      </div>\n    </div>\n  </div>\n</div>\n\n';
  let anchor, panel, editorContext = null, fields = [], submitting = false;
  let watchedStore = null, unwatch = null;
  const id = value => value == null ? "" : String(value);
  const element = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  function getMainStore() {
    try {
      const app = (gm.uw || window).document.querySelector("#app");
      return app?.__vue__?.$store || app?.__vueParentComponent?.proxy?.$store || null;
    } catch {
      return null;
    }
  }
  function mainQuestionContext() {
    const lessonId = location.pathname.match(/\/(?:lesson\/fullscreen\/v3|v2\/web\/lesson)\/([^/]+)/)?.[1];
    if (!lessonId || lessonId !== id(repo.currentLessonId)) return null;
    const info = getMainStore()?.state?.currSlide;
    const slideId = id(info?.sid ?? info?.slideId);
    const slide = repo.forLesson(lessonId).slides.get(slideId);
    const problemId = id(slide?.problem?.problemId ?? slide?.problem?.id);
    const problem = repo.forLesson(lessonId).problems.get(problemId);
    if (!problem || !PROBLEM_TYPE_MAP[Number(problem.problemType)]) return null;
    return {
      accountId: repo.accountId,
      lessonId: lessonId,
      slideId: slideId,
      problemId: problemId,
      source: "native"
    };
  }
  function isCurrentContext(ctx) {
    if (!ctx || ctx.accountId !== repo.accountId || ctx.lessonId !== id(repo.currentLessonId)) return false;
    const slide = repo.forLesson(ctx.lessonId).slides.get(ctx.slideId);
    if (id(slide?.problem?.problemId ?? slide?.problem?.id) !== ctx.problemId) return false;
    if (ctx.source === "native") {
      const current = mainQuestionContext();
      return current?.slideId === ctx.slideId && current.problemId === ctx.problemId;
    }
    return id(repo.currentSlideId) === ctx.slideId && document.getElementById("ykt-presentation-panel")?.classList.contains("visible");
  }
  function closeEditor() {
    panel?.classList.remove("visible");
    editorContext = null;
  }
  function setMessage(message) {
    const el = panel?.querySelector(".ykt-quick-status");
    if (el) el.textContent = message;
  }
  function mountEditor() {
    if (panel) return;
    panel = element("section", null, "ykt-panel");
    panel.id = "ykt-quick-answer-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-labelledby", "ykt-quick-answer-title");
    const header = element("div", null, "panel-header");
    const title = element("h3", "输入答案并强制提交");
    title.id = "ykt-quick-answer-title";
    const close = element("button", "×");
    close.type = "button";
    close.setAttribute("aria-label", "关闭答案输入");
    close.onclick = closeEditor;
    header.append(title, close);
    const body = element("div", null, "panel-body");
    const question = element("p", "", "ykt-quick-question");
    const inputs = element("div", null, "ykt-quick-fields");
    const hint = element("p", "", "ykt-quick-hint");
    const status = element("p", "", "ykt-quick-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const bar = element("div", null, "ykt-quick-actions");
    const local = element("button", "保存本地");
    local.type = "button";
    local.className = "ykt-quick-save";
    local.onclick = () => {
      try {
        saveDraft();
      } catch (error) {
        setMessage(error.message);
      }
    };
    const submit = element("button", "强制提交");
    submit.type = "button";
    submit.className = "ykt-quick-submit";
    submit.onclick = submitCurrentAnswer;
    bar.append(local, submit);
    body.append(question, inputs, hint, status, bar);
    panel.append(header, body);
    document.body.appendChild(panel);
  }
  function editorProblem(ctx = editorContext) {
    if (!isCurrentContext(ctx)) throw new Error("页面、题目或账号已变化，请在当前题目页重新打开输入框");
    const problem = repo.forLesson(ctx.lessonId).problems.get(ctx.problemId);
    if (!problem) throw new Error("题目数据尚未加载");
    return problem;
  }
  function draftText(problem) {
    return Number(problem.problemType) === 4 ? JSON.stringify(fields.map(field => field.value)) : fields[0].value;
  }
  function saveDraft() {
    const problem = editorProblem();
    const saved = repo.saveDraft(editorContext.problemId, draftText(problem), editorContext.lessonId);
    setMessage(saved ? "本地草稿已保存 · 未提交" : "草稿保留在内存，持久化失败");
    return problem;
  }
  function existingValues(problem) {
    const text = problem.draftText;
    if (text != null) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.map(String);
        if (Number(problem.problemType) === 5 && parsed?.content != null) return [ String(parsed.content) ];
      } catch {}
      return Number(problem.problemType) === 4 ? String(text).split(/\r?\n/) : [ String(text) ];
    }
    const value = hasSubmittedAnswer(problem.result) ? problem.result : problem.aiProposal;
    if (Array.isArray(value)) return value.map(String);
    return [ value?.content || "" ];
  }
  function openQuickAnswer(context) {
    mountEditor();
    const ctx = {
      ...context,
      accountId: context.accountId ?? repo.accountId,
      lessonId: id(context.lessonId),
      slideId: id(context.slideId),
      problemId: id(context.problemId)
    };
    if (submitting) return ui.toast("正在提交当前答案，请等待服务器结果");
    if (!isCurrentContext(ctx)) return ui.toast("请先切换到对应的题目页");
    editorContext = ctx;
    const problem = editorProblem(), type = Number(problem.problemType), values = existingValues(problem);
    panel.querySelector("#ykt-quick-answer-title").textContent = `手动强制提交 · ${PROBLEM_TYPE_MAP[type]}`;
    panel.querySelector(".ykt-quick-question").textContent = problem.body || `题目 ${ctx.problemId}`;
    const container = panel.querySelector(".ykt-quick-fields");
    container.replaceChildren();
    fields = [];
    const count = type === 4 ? Math.max(1, problem.blanks?.length || values.length) : 1;
    for (let i = 0; i < count; i++) {
      const label = element("label", type === 4 ? `第 ${i + 1} 空` : "答案");
      const field = element("textarea");
      field.rows = type === 5 ? 5 : 2;
      field.value = type === 4 ? values[i] ?? "" : [ 1, 2, 3 ].includes(type) ? values.join("") : values[0] ?? "";
      field.placeholder = type === 4 ? "直接输入本空答案，如 -1、[0,1] 或 x + y" : type === 5 ? "输入答案正文" : type === 2 ? "例如 AC（多选）" : "例如 B（单选）";
      field.addEventListener("input", () => {
        try {
          saveDraft();
        } catch (error) {
          setMessage(error.message);
        }
      });
      label.appendChild(field);
      container.appendChild(label);
      fields.push(field);
    }
    panel.querySelector(".ykt-quick-hint").textContent = type === 4 ? "每个输入框对应一个空，负号、逗号与公式原样保留。" : "填写后点击“强制提交”，服务器确认后显示成功。";
    setMessage(hasSubmittedAnswer(problem.result) ? "服务器已有答案，可在这里修改并强制重提。" : "尚未提交");
    panel.classList.add("visible");
    ui._bringToFront(panel);
    fields[0]?.focus();
  }
  async function submitCurrentAnswer() {
    if (submitting) return;
    const ctx = editorContext;
    try {
      const problem = saveDraft();
      const type = Number(problem.problemType);
      const value = validateAnswer(problem, type === 4 ? fields.map(field => field.value) : type === 5 ? {
        content: fields[0].value,
        pics: []
      } : actions.parseManual(type, fields[0].value));
      const revision = problem.draftRevision;
      submitting = true;
      panel.querySelector(".ykt-quick-submit").disabled = true;
      for (const field of fields) field.disabled = true;
      setMessage("正在强制提交…");
      await actions.submit(problem, JSON.stringify(value), {
        lessonId: ctx.lessonId,
        forceRetry: true,
        allowResubmit: true,
        guard: () => {
          editorProblem(ctx);
          if (problem.draftRevision !== revision) throw new Error("草稿已变化，提交已停止");
        }
      });
      if (editorContext === ctx) setMessage("服务器已确认强制提交成功"); else ui.toast(`题目 ${ctx.problemId}：服务器已确认强制提交成功`);
    } catch (error) {
      if (editorContext === ctx) setMessage(error.message); else ui.toast(error.message, 4500);
    } finally {
      submitting = false;
      if (panel) {
        panel.querySelector(".ykt-quick-submit").disabled = false;
        for (const field of fields) field.disabled = false;
      }
    }
  }
  function createQuickAnswerButton(context) {
    const button = element("button", "输入答案并强制提交", "ykt-force-answer-button");
    button.type = "button";
    const target = {
      ...context,
      accountId: repo.accountId
    };
    button.addEventListener("click", () => openQuickAnswer(target));
    return button;
  }
  function refreshQuickAnswerControl() {
    if (!anchor) return;
    const store = getMainStore();
    if (store !== watchedStore) {
      unwatch?.();
      unwatch = null;
      watchedStore = store;
      if (typeof store?.watch === "function") unwatch = store.watch(state => state.currSlide, refreshQuickAnswerControl, {
        deep: true
      });
    }
    const current = mainQuestionContext();
    anchor.classList.toggle("hidden", !current);
    anchor.__context = current;
    if (editorContext && !isCurrentContext(editorContext)) closeEditor();
  }
  function mountQuickAnswerControl() {
    if (anchor) return anchor;
    anchor = element("div");
    anchor.id = "ykt-page-answer-control";
    anchor.className = "hidden";
    const button = element("button", "输入答案并强制提交", "ykt-force-answer-button");
    button.type = "button";
    button.onclick = () => {
      const ctx = mainQuestionContext();
      if (ctx) openQuickAnswer(ctx); else refreshQuickAnswerControl();
    };
    anchor.appendChild(button);
    document.body.appendChild(anchor);
    window.addEventListener("ykt:lesson-change", refreshQuickAnswerControl);
    // Also covers late-mounted/replaced Vue roots and account changes.
        setInterval(refreshQuickAnswerControl, 500);
    refreshQuickAnswerControl();
    return anchor;
  }
  let mounted$3 = false;
  let host;
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
  const L = (...a) => console.log("[雨课堂助手][DBG][presentation]", ...a);
  const W = (...a) => console.warn("[雨课堂助手][WARN][presentation]", ...a);
  function $$2(sel) {
    return document.querySelector(sel);
  }
  /** —— 运行时自愈：把 repo.slides 的数字键迁移为字符串键 —— */  function normalizeRepoSlidesKeys(tag = "presentation.mount") {
    try {
      if (!repo || !repo.slides || !(repo.slides instanceof Map)) {
        W("normalizeRepoSlidesKeys: repo.slides 不是 Map");
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
        // 保留旧键以防其他模块还在用数字键；仅打印提示
            }
      const afterSample = Array.from(repo.slides.keys()).slice(0, 8);
      L(`[normalizeRepoSlidesKeys@${tag}] 总键=${beforeKeys.length}，数字键=${nums.length}，迁移为字符串=${moved}，sample=`, afterSample);
    } catch (e) {
      W("normalizeRepoSlidesKeys error:", e);
    }
  }
  // Map 查找
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
    return $$2("#ykt-translate-target");
  }
  function getCurrentTargetLanguage() {
    const input = getTranslateTargetInput();
    const value = String(input?.value || "").trim();
    return value || detectBrowserLanguage();
  }
  // fetch静态PPT
    function getActiveOCRState() {
    const currentSlideId = getCurrentSlideId();
    return currentSlideId ? ocrResults.get(currentSlideId) || null : null;
  }
  function getActiveTranslationState() {
    const currentSlideId = getCurrentSlideId();
    return currentSlideId ? translationResults.get(currentSlideId) || null : null;
  }
  function renderSharedResult() {
    const resultEl = $$2("#ykt-ocr-result");
    if (!resultEl) return;
    const ocrState = getActiveOCRState();
    const translationState = getActiveTranslationState();
    const currentTargetLanguage = getCurrentTargetLanguage();
    const canShowTranslation = !!(translationState && !translationState.loading && !translationState.error && translationState.targetLanguage === currentTargetLanguage && translationState.text);
    resultEl.value = currentResultMode === "translated" && canShowTranslation ? translationState.text || "" : ocrState?.text || "";
  }
  function renderOCRState() {
    const currentSlideId = getCurrentSlideId();
    const statusEl = $$2("#ykt-ocr-status");
    const tipEl = $$2("#ykt-ocr-tip");
    if (!statusEl || !tipEl) return;
    if (!currentSlideId) {
      currentResultMode = "original";
      statusEl.textContent = "未选择";
      statusEl.className = "ocr-status";
      tipEl.textContent = "选择课件页后点击“文字识别”。";
      renderSharedResult();
      return;
    }
    const state = ocrResults.get(currentSlideId);
    if (!state) {
      statusEl.textContent = "未开始";
      statusEl.className = "ocr-status";
      tipEl.textContent = "当前页还没有识别结果。";
      renderSharedResult();
      return;
    }
    if (state.loading) {
      statusEl.textContent = "识别中";
      statusEl.className = "ocr-status is-loading";
      tipEl.textContent = "正在调用 OCR 模型识别当前课件页。";
      renderSharedResult();
      return;
    }
    if (state.error) {
      currentResultMode = "original";
      statusEl.textContent = "失败";
      statusEl.className = "ocr-status is-error";
      tipEl.textContent = state.error;
      renderSharedResult();
      return;
    }
    statusEl.textContent = "已完成";
    statusEl.className = "ocr-status is-success";
    tipEl.textContent = currentResultMode === "translated" ? "当前正在显示翻译结果。" : "当前正在显示原文识别结果。";
    renderSharedResult();
  }
  function renderTranslationState() {
    const currentSlideId = getCurrentSlideId();
    const statusEl = $$2("#ykt-translate-status");
    const tipEl = $$2("#ykt-translate-tip");
    const btnEl = $$2("#ykt-translate-toggle");
    if (!statusEl || !tipEl || !btnEl) return;
    if (!currentSlideId) {
      statusEl.textContent = "未翻译";
      statusEl.className = "ocr-status";
      tipEl.textContent = "选择课件页后可翻译 OCR 结果。";
      btnEl.textContent = "翻译";
      renderSharedResult();
      return;
    }
    const currentTargetLanguage = getCurrentTargetLanguage();
    const state = translationResults.get(currentSlideId);
    const hasCurrentTranslation = !!(state && state.targetLanguage === currentTargetLanguage);
    if (!hasCurrentTranslation) {
      if (currentResultMode === "translated") currentResultMode = "original";
      statusEl.textContent = "未翻译";
      statusEl.className = "ocr-status";
      tipEl.textContent = `当前目标语言：${currentTargetLanguage}`;
      btnEl.textContent = "翻译";
      renderSharedResult();
      return;
    }
    if (state.loading) {
      statusEl.textContent = "翻译中";
      statusEl.className = "ocr-status is-loading";
      tipEl.textContent = `正在翻译为 ${state.targetLanguage}`;
      btnEl.textContent = "翻译中...";
      renderSharedResult();
      return;
    }
    if (state.error) {
      if (currentResultMode === "translated") currentResultMode = "original";
      statusEl.textContent = "失败";
      statusEl.className = "ocr-status is-error";
      tipEl.textContent = state.error;
      btnEl.textContent = "翻译";
      renderSharedResult();
      return;
    }
    statusEl.textContent = "已翻译";
    statusEl.className = "ocr-status is-success";
    tipEl.textContent = currentResultMode === "translated" ? `当前显示 ${state.targetLanguage} 翻译结果。` : `已生成 ${state.targetLanguage} 翻译结果。`;
    btnEl.textContent = currentResultMode === "translated" ? "显示原文" : "翻译";
    renderSharedResult();
  }
  async function runRecognizeCurrentSlideText(options = {}) {
    const {silent: silent = false} = options;
    const context = `${repo.accountId}:${repo.currentLessonId}`;
    const current = () => context === `${repo.accountId}:${repo.currentLessonId}`;
    const slideId = getCurrentSlideId();
    if (!slideId) {
      if (!silent) ui.toast("请先选择要识别的课件页", 2500);
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
      if (!imageBase64) throw new Error("当前课件页图片读取失败");
      if (!current()) return "";
      const text = await queryOCRVision(imageBase64, ui.config.ai);
      if (!current()) return "";
      ocrResults.set(slideId, {
        loading: false,
        text: text || "未识别到文字",
        error: ""
      });
      renderOCRState();
      renderTranslationState();
      if (!silent) ui.toast("文字识别完成", 2e3);
      return text || "未识别到文字";
    } catch (e) {
      if (!current()) return "";
      ocrResults.set(slideId, {
        loading: false,
        text: "",
        error: `文字识别失败: ${e.message || e}`
      });
      renderOCRState();
      renderTranslationState();
      if (!silent) ui.toast(`文字识别失败: ${e.message || e}`, 3500);
      return "";
    }
  }
  const ocrPending = new Map;
  function recognizeCurrentSlideText(options = {}) {
    const id = `${repo.accountId}:${repo.currentLessonId}:${getCurrentSlideId()}`;
    if (ocrPending.has(id)) return ocrPending.get(id);
    const task = runRecognizeCurrentSlideText(options).finally(() => ocrPending.delete(id));
    ocrPending.set(id, task);
    return task;
  }
  async function translateCurrentOCRText() {
    const context = `${repo.accountId}:${repo.currentLessonId}`;
    const current = () => context === `${repo.accountId}:${repo.currentLessonId}`;
    const slideId = getCurrentSlideId();
    if (!slideId) {
      ui.toast("请先选择课件页", 2500);
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
      ui.toast("文字识别进行中，请稍后再试", 2500);
      return;
    }
    let sourceText = ocrState?.text || "";
    if (!sourceText) sourceText = await recognizeCurrentSlideText({
      silent: true
    });
    if (!sourceText) {
      ui.toast("没有可翻译的 OCR 文本", 2500);
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
      if (!current()) return;
      translationResults.set(slideId, {
        loading: false,
        text: translated || "",
        error: "",
        targetLanguage: targetLanguage
      });
      currentResultMode = "translated";
      renderOCRState();
      renderTranslationState();
      ui.toast(`翻译完成：${targetLanguage}`, 2e3);
    } catch (e) {
      if (!current()) return;
      translationResults.set(slideId, {
        loading: false,
        text: "",
        error: `翻译失败: ${e.message || e}`,
        targetLanguage: targetLanguage
      });
      currentResultMode = "original";
      renderOCRState();
      renderTranslationState();
      ui.toast(`翻译失败: ${e.message || e}`, 3500);
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
        console.log("[雨课堂助手][DBG][presentation][static-report] 在子 frame 中找到了 content-page-wrap");
        return d;
      }
    } catch (e) {}
    console.log("[雨课堂助手][DBG][presentation][static-report] 所有 frame 中都没有 content-page-wrap，退回顶层 document");
    return document;
  }
  function debugCheckSingleSlideImg() {
    const selector = "#content-page-wrap > div > aside > div.left-panel-scroll > div.left-panel-tab-content > div > section.slides-list > div.slide-item.f13.active-slide-item > div > img";
    const doc = getSlidesDocument();
    const img = doc.querySelector(selector);
    console.log("[雨课堂助手][DBG][presentation][static-report][debugCheck]", {
      href: window.location.href,
      hasContentPageWrap: !!document.querySelector("#content-page-wrap"),
      imgFound: !!img,
      selector: selector
    });
    if (img) {
      console.log("[雨课堂助手][DBG][presentation][static-report][debugCheck] img.outerHTML =", img.outerHTML);
      console.log("[雨课堂助手][DBG][presentation][static-report][debugCheck] img.src =", img.currentSrc || img.src || img.getAttribute("src"));
    }
    return img;
  }
  function collectStaticSlideURLsFromDom() {
    const urls = new Set;
    // 先跑一遍最精确的 path 来看看当前 frame 到底有没有这张图
        const debugImg = debugCheckSingleSlideImg();
    if (debugImg) {
      const src = debugImg.currentSrc || debugImg.src || debugImg.getAttribute("src") || "";
      if (src && /thu-private-qn\.yuketang\.cn\/slide\/\d+\//.test(src) && /\.(png|jpg|jpeg|webp)(\?|#|$)/i.test(src)) urls.add(src);
    }
    const doc = getSlidesDocument();
    const candidates = doc.querySelectorAll("section.slides-list img, .slides-list img," + "div.slide-item img," + 'img[alt="cover"]');
    console.log("[雨课堂助手][DBG][presentation][static-report] DOM 候选 img 数量 =", candidates.length);
    candidates.forEach((img, idx) => {
      const src = img.currentSrc || img.src || img.getAttribute("src") || "";
      console.log("[雨课堂助手][DBG][presentation][static-report] 检查 img#" + idx, {
        className: img.className,
        outerHTML: img.outerHTML.slice(0, 200) + (img.outerHTML.length > 200 ? "…" : ""),
        src: src
      });
      if (!src) return;
      if (/thu-private-qn\.yuketang\.cn\/slide\/\d+\//.test(src) && /\.(png|jpg|jpeg|webp)(\?|#|$)/i.test(src)) urls.add(src);
    });
    const arr = [ ...urls ];
    console.log("[雨课堂助手][DBG][presentation][static-report] DOM 收集到 slide URL：", arr);
    return arr;
  }
  function ensureStaticReportPresentation() {
    if (!isStudentLessonReportPage()) return false;
    const pid = `static:${window.location.pathname}`;
    // 如果已经注入过，就不再重复扫描 & 打印日志，直接返回 false
        const urlsFromDom = collectStaticSlideURLsFromDom();
    const existingSlides = repo.presentations.get(pid)?.slides || [];
    const urls = Array.from(new Set([ ...existingSlides.map(s => s.image), ...urlsFromDom ]));
    if (urls.length === existingSlides.length && urls.every(u => existingSlides.some(s => s.image === u))) return false;
    if (!urls.length) {
      console.log("[雨课堂助手][DBG][presentation][static-report] 依然没有发现任何 slide URL");
      return false;
    }
    const withIndex = urls.map((u, i) => ({
      u: u,
      idx: extractCoverIndex(u) ?? i + 1
    }));
    withIndex.sort((a, b) => a.idx - b.idx);
    const slides = withIndex.map(({u: u, idx: idx}) => {
      const id = `${pid}:static-${idx}`;
      return {
        id: id,
        index: idx,
        title: `第 ${idx} 页`,
        thumbnail: u,
        image: u,
        problem: null
      };
    });
    const titleFromPage = document.querySelector(".lesson-title, .title, h1, .header-title")?.textContent?.trim() || "静态课件（报告页）";
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
    console.log("[雨课堂助手][DBG][presentation][static-report] 已注入/更新 presentation", {
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
    $$2("#ykt-presentation-close")?.addEventListener("click", () => showPresentationPanel(false));
    $$2("#ykt-open-problem-list")?.addEventListener("click", () => {
      showPresentationPanel(false);
      window.dispatchEvent(new CustomEvent("ykt:open-problem-list"));
    });
    $$2("#ykt-ask-current")?.addEventListener("click", () => {
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
        L("点击“提问当前PPT”(多选)", {
          selectedCount: selectedSlideIds.size,
          slidesCount: slides.length
        });
        if (slides.length === 0) return ui.toast("所选页面无可用图片", 2500);
        window.dispatchEvent(new CustomEvent("ykt:ask-ai-for-slides", {
          detail: {
            slides: slides,
            source: "manual"
          }
        }));
        return;
      }
      // ===== 否则走旧逻辑：单页 =====
            const sid = repo.currentSlideId != null ? String(repo.currentSlideId) : null;
      const lookup = getSlideByAny(sid);
      L("点击“提问当前PPT”", {
        currentSlideId: sid,
        lookupHit: lookup.hit,
        hasSlide: !!lookup.slide
      });
      if (!sid) return ui.toast("请先在左侧选择一页PPT", 2500);
      const imageUrl = getSlideImageUrl(lookup.slide);
      window.dispatchEvent(new CustomEvent("ykt:ask-ai-for-slide", {
        detail: {
          slideId: sid,
          imageUrl: imageUrl
        }
      }));
    });
    $$2("#ykt-download-current")?.addEventListener("click", downloadCurrentSlide);
    $$2("#ykt-ocr-current")?.addEventListener("click", recognizeCurrentSlideText);
    $$2("#ykt-translate-toggle")?.addEventListener("click", translateCurrentOCRText);
    $$2("#ykt-download-pdf")?.addEventListener("click", downloadPresentationPDF);
    const translateTargetInput = getTranslateTargetInput();
    if (translateTargetInput && !translateTargetInput.value.trim()) translateTargetInput.value = detectBrowserLanguage();
    translateTargetInput?.addEventListener("change", () => {
      if (currentResultMode === "translated") currentResultMode = "original";
      renderOCRState();
      renderTranslationState();
    });
    const cb = $$2("#ykt-show-all-slides");
    cb.checked = !!ui.config.showAllSlides;
    cb.addEventListener("change", () => {
      ui.config.showAllSlides = !!cb.checked;
      ui.saveConfig();
      L("切换 showAllSlides =", ui.config.showAllSlides);
      updatePresentationList();
    });
    window.addEventListener("ykt:lesson-change", () => {
      selectedSlideIds.clear();
      ocrResults.clear();
      translationResults.clear();
      currentResultMode = "original";
    });
    mounted$3 = true;
    renderOCRState();
    renderTranslationState();
    L("mountPresentationPanel 完成");
    return host;
  }
  function showPresentationPanel(visible = true) {
    mountPresentationPanel();
    host.classList.toggle("visible", !!visible);
    if (visible) updatePresentationList();
    const presBtn = document.getElementById("ykt-btn-pres");
    if (presBtn) presBtn.classList.toggle("active", !!visible);
    L("showPresentationPanel", {
      visible: visible
    });
  }
  function updatePresentationList() {
    mountPresentationPanel();
    try {
      if (isStudentLessonReportPage()) ensureStaticReportPresentation();
    } catch (e) {
      W("[static-report] 检测/注入失败：", e);
    }
    if (!window.__ykt_static_dom_mo && isStudentLessonReportPage()) {
      let timer;
      const mo = new MutationObserver(records => {
        if (!isStudentLessonReportPage()) {
          mo.disconnect();
          window.__ykt_static_dom_mo = null;
          return;
        }
        if (records.every(r => r.target?.closest?.('[id^="ykt-"]'))) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (ensureStaticReportPresentation()) updatePresentationList();
        }, 250);
      });
      window.__ykt_static_dom_mo = mo;
      const doc = getSlidesDocument();
      mo.observe(doc.body || document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [ "src", "data-src" ]
      });
    }
    const listEl = document.getElementById("ykt-presentation-list");
    if (!listEl) {
      W("updatePresentationList: 缺少容器");
      return;
    }
    listEl.innerHTML = "";
    if (repo.presentations.size === 0) {
      listEl.innerHTML = '<p class="no-presentations">暂无课件记录</p>';
      W("无 presentations");
      return;
    }
    const currentPath = window.location.pathname;
    const m = currentPath.match(/\/lesson\/fullscreen\/v3\/([^/]+)/);
    const currentLessonFromURL = m ? m[1] : null;
    L("过滤课件", {
      currentLessonFromURL: currentLessonFromURL,
      repoCurrentLessonId: repo.currentLessonId
    });
    const filtered = new Map;
    for (const [id, p] of repo.presentations) if (currentLessonFromURL && repo.currentLessonId && currentLessonFromURL === repo.currentLessonId) filtered.set(id, p); else if (!currentLessonFromURL) filtered.set(id, p); else if (currentLessonFromURL === repo.currentLessonId) filtered.set(id, p);
    const presentationsToShow = filtered.size > 0 ? filtered : repo.presentations;
    L("展示课件数量=", presentationsToShow.size);
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
      L("[hydrate slides → repo.slides]", {
        filled: filled,
        totalVisibleSlides: total,
        sampleKeys: sample
      });
    } catch (e) {
      W("hydrate repo.slides 失败：", e);
    }
    for (const [id, presentation] of presentationsToShow) {
      const cont = document.createElement("div");
      cont.className = "presentation-container";
      const titleEl = document.createElement("div");
      titleEl.className = "presentation-title";
      const titleText = document.createElement("span");
      titleText.textContent = presentation.title || `课件 ${id}`;
      const downloadIcon = document.createElement("i");
      downloadIcon.className = "fas fa-download download-btn";
      downloadIcon.title = "下载课件";
      titleEl.append(titleText, downloadIcon);
      cont.appendChild(titleEl);
      titleEl.querySelector(".download-btn")?.addEventListener("click", e => {
        e.stopPropagation();
        L("点击下载课件", {
          presId: String(presentation.id)
        });
        downloadPresentation(presentation);
      });
      const slidesWrap = document.createElement("div");
      slidesWrap.className = "slide-thumb-list";
      const showAll = !!ui.config.showAllSlides;
      const slides = presentation.slides || [];
      const slidesToShow = showAll ? slides : slides.filter(s => s.problem);
      if (!showAll && slides.length && !slidesToShow.length) {
        const hint = document.createElement("p");
        hint.className = "no-problem-slides";
        hint.textContent = "当前仅显示题目页，这份课件没有题目页。";
        const showAllButton = document.createElement("button");
        showAllButton.type = "button";
        showAllButton.textContent = "显示全部页面";
        showAllButton.addEventListener("click", () => $$2("#ykt-show-all-slides")?.click());
        hint.appendChild(showAllButton);
        slidesWrap.appendChild(hint);
      }
      const currentIdStr = repo.currentSlideId != null ? String(repo.currentSlideId) : null;
      L("渲染课件缩略图", {
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
          // ===== Ctrl/Cmd 多选：不改变 currentSlideId，不触发导航，仅切换 selected =====
          if (ev && (ev.ctrlKey || ev.metaKey)) {
            ev.preventDefault();
            if (selectedSlideIds.has(slideIdStr)) {
              selectedSlideIds.delete(slideIdStr);
              thumb.classList.remove("selected");
            } else {
              selectedSlideIds.add(slideIdStr);
              thumb.classList.add("selected");
            }
            L("缩略图多选切换", {
              slideIdStr: slideIdStr,
              selectedCount: selectedSlideIds.size
            });
            return;
          }
          // ===== 普通点击：沿用原逻辑，并清空多选 =====
                    selectedSlideIds.clear();
          slidesWrap.querySelectorAll(".slide-thumb.selected").forEach(el => el.classList.remove("selected"));
          repo.currentPresentationId = presIdStr;
          repo.currentSlideId = slideIdStr;
          slidesWrap.querySelectorAll(".slide-thumb.active").forEach(el => el.classList.remove("active"));
          thumb.classList.add("active");
          const actives = slidesWrap.querySelectorAll(".slide-thumb.active");
          const allIds = Array.from(slidesWrap.querySelectorAll(".slide-thumb")).map(x => x.dataset.slideId);
          L("高亮状态", {
            activeCount: actives.length,
            activeId: thumb.dataset.slideId,
            allIdsSample: allIds.slice(0, 10)
          });
          updateSlideView();
          if (!repo.slides.has(slideIdStr)) {
            const cross = findSlideAcrossPresentations(slideIdStr);
            if (cross) {
              repo.slides.set(slideIdStr, cross);
              L("click-fill repo.slides <- cross", {
                slideIdStr: slideIdStr
              });
            }
          }
          try {
            const keysSample = Array.from(repo.slides.keys()).slice(0, 8);
            const typeDist = keysSample.reduce((m, k) => (m[typeof k] = (m[typeof k] || 0) + 1,
            m), {});
            L("repo.slides keys sample:", keysSample, "typeDist:", typeDist);
          } catch {}
          const detail = {
            slideId: slideIdStr,
            presentationId: presIdStr
          };
          L("派发事件 ykt:presentation:slide-selected", detail);
          window.dispatchEvent(new CustomEvent("ykt:presentation:slide-selected", {
            detail: detail
          }));
          L("调用 actions.navigateTo ->", {
            presIdStr: presIdStr,
            slideIdStr: slideIdStr
          });
          actions.navigateTo(presIdStr, slideIdStr);
        });
        const img = document.createElement("img");
        if (presentation.width && presentation.height) img.style.aspectRatio = `${presentation.width}/${presentation.height}`;
        const imageCandidates = [ ...new Set([ s.thumbnail, s.coverAlt, s.cover, s.image ].filter(value => typeof value === "string" && value)) ];
        let imageCandidate = 0;
        img.alt = s.title || `第 ${s.page ?? ""} 页`;
        img.onerror = function() {
          if (++imageCandidate < imageCandidates.length) {
            img.src = imageCandidates[imageCandidate];
            return;
          }
          W("课件图片暂不可用，保留页面入口", {
            slideIdStr: slideIdStr
          });
          img.onerror = null;
          img.hidden = true;
          img.style.display = "none";
          const message = document.createElement("span");
          message.className = "slide-image-error";
          message.textContent = "图片暂不可用";
          thumb.appendChild(message);
        };
        if (imageCandidates.length) img.src = imageCandidates[0]; else img.onerror();
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
    L("downloadPresentation -> 设置 currentPresentationId", repo.currentPresentationId);
    downloadPresentationPDF();
  }
  function updateSlideView() {
    mountPresentationPanel();
    const slideView = $$2("#ykt-slide-view");
    const problemView = $$2("#ykt-problem-view");
    problemView.innerHTML = "";
    renderOCRState();
    renderTranslationState();
    const curId = getCurrentSlideId();
    const lookup = getSlideByAny(curId);
    L("updateSlideView", {
      curId: curId,
      lookupHit: lookup.hit,
      hasInMap: !!lookup.slide
    });
    if (!curId || !lookup.slide) {
      const emptyCover = document.createElement("div");
      emptyCover.className = "slide-cover";
      const emptyMessage = document.createElement("div");
      emptyMessage.className = "empty-message";
      emptyMessage.textContent = curId ? "当前页面尚未加载，请在左侧重新选择。" : "选择左侧的幻灯片查看详情";
      emptyCover.appendChild(emptyMessage);
      slideView.replaceChildren(emptyCover, problemView);
      if (curId) W("updateSlideView: 根据 curId 未取到 slide", {
        curId: curId
      });
      renderOCRState();
      renderTranslationState();
      return;
    }
    const slide = lookup.slide;
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
      closeBtn.title = "关闭题干浮框";
      closeBtn.setAttribute("aria-label", "关闭题干浮框");
      closeBtn.textContent = "×";
      closeBtn.addEventListener("click", ev => {
        ev.stopPropagation();
        box.remove();
      });
      box.appendChild(closeBtn);
      const head = document.createElement("div");
      head.className = "problem-head";
      head.textContent = prob.body || `题目 ${prob.problemId}`;
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
      problemView.appendChild(box);
      box.appendChild(createQuickAnswerButton({
        lessonId: repo.currentLessonId,
        slideId: curId,
        problemId: String(prob.problemId),
        source: "presentation"
      }));
    }
    slideView.innerHTML = "";
    slideView.appendChild(cover);
    slideView.appendChild(problemView);
    renderOCRState();
    renderTranslationState();
  }
  async function downloadCurrentSlide() {
    const sid = repo.currentSlideId != null ? String(repo.currentSlideId) : null;
    const lookup = getSlideByAny(sid);
    L("downloadCurrentSlide", {
      sid: sid,
      lookupHit: lookup.hit,
      has: !!lookup.slide
    });
    if (!sid) return ui.toast("请先选择一页课件/题目");
    const slide = lookup.slide;
    if (!slide) return;
    try {
      const html2canvas = await ensureHtml2Canvas();
      const el = document.getElementById("ykt-slide-view");
      const canvas = await html2canvas(el, {
        useCORS: true,
        allowTaint: false
      });
      const a = document.createElement("a");
      a.download = `slide-${sid}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    } catch (e) {
      ui.toast(`截图失败: ${e.message}`);
    }
  }
  async function downloadPresentationPDF() {
    const pid = repo.currentPresentationId != null ? String(repo.currentPresentationId) : null;
    L("downloadPresentationPDF", {
      pid: pid,
      hasPres: pid ? repo.presentations.has(pid) : false
    });
    if (!pid) return ui.toast("请先在左侧选择一份课件");
    const pres = repo.presentations.get(pid);
    if (!pres || !Array.isArray(pres.slides) || pres.slides.length === 0) return ui.toast("未找到该课件的页面");
    !!ui.config.showAllSlides;
    const selected = selectedSlideIds.size ? pres.slides.filter(s => selectedSlideIds.has(String(s.id))) : pres.slides;
    const slides = selected;
    if (slides.length === 0) return ui.toast("当前筛选下没有可导出的页面");
    try {
      await ensureJsPDF();
      const {jsPDF: jsPDF} = window.jspdf || {};
      if (!jsPDF) throw new Error("jsPDF 未加载成功");
      const doc = new jsPDF({
        unit: "pt",
        format: "a4",
        orientation: "portrait"
      });
      const pageW = 595, pageH = 842;
      const margin = 24;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const loadImage = src => new Promise((resolve, reject) => {
        const img = new Image;
        img.crossOrigin = "anonymous";
        const timer = setTimeout(() => reject(new Error("页面图片加载超时")), 12e3);
        img.onload = () => {
          clearTimeout(timer);
          resolve(img);
        };
        img.onerror = () => {
          clearTimeout(timer);
          reject(new Error("页面图片读取失败"));
        };
        img.src = src;
      });
      let exported = 0;
      const failed = [];
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        try {
          const url = getSlideImageUrl(slide);
          if (!url) throw new Error("无图片");
          const img = await loadImage(url);
          const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
          if (!iw || !ih) throw new Error("图片尺寸无效");
          const ratio = Math.min(maxW / iw, maxH / ih), width = iw * ratio, height = ih * ratio;
          const canvas = document.createElement("canvas");
          canvas.width = iw;
          canvas.height = ih;
          canvas.getContext("2d").drawImage(img, 0, 0);
          const data = canvas.toDataURL("image/png");
          if (exported > 0) doc.addPage();
          doc.addImage(data, "PNG", (pageW - width) / 2, (pageH - height) / 2, width, height);
          exported++;
        } catch (error) {
          failed.push(slide.index ?? i + 1);
        }
      }
      if (!exported) throw new Error("所有页面图片读取失败，请检查跨域访问后重试");
      if (failed.length) ui.toast(`已导出 ${exported} 页；第 ${failed.join("、")} 页失败，可选中这些页后重试`, 6e3);
      const name = (pres.title || `课件-${pid}`).replace(/[\\/:*?"<>|]/g, "_");
      doc.save(`${name}.pdf`);
    } catch (e) {
      ui.toast(`导出 PDF 失败：${e.message || e}`);
    }
  }
  var tpl$2 = '<div id="ykt-problem-list-panel" class="ykt-panel">\n  <div class="panel-header">\n    <h3>课堂习题列表</h3>\n    <span class="close-btn" id="ykt-problem-list-close"><i class="fas fa-times"></i></span>\n  </div>\n\n  <div class="panel-body">\n    <div id="ykt-problem-list" class="problem-list">\n      \x3c!-- 由 problem-list.js 动态填充：\n           .problem-row\n             .problem-title\n             .problem-meta\n             .problem-actions (查看 / AI解答 / 已作答) --\x3e\n    </div>\n  </div>\n</div>\n\n';
  class SubmissionError extends Error {
    constructor(message, {code: code = null, unknown: unknown = false, status: status = null} = {}) {
      super(message);
      this.name = "SubmissionError";
      this.code = code;
      this.unknown = unknown;
      this.status = status;
    }
  }
  function headers() {
    return {
      "Content-Type": "application/json",
      xtbz: "ykt",
      "X-Client": "h5",
      Authorization: "Bearer " + (globalThis.localStorage?.getItem("Authorization") || "")
    };
  }
  function post(url, payload, options = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest;
      xhr.__yktOwnSubmission = true;
      xhr.open("POST", url, true);
      xhr.timeout = options.timeout ?? 2e4;
      for (const [k, v] of Object.entries({
        ...headers(),
        ...options.headers
      })) xhr.setRequestHeader(k, v);
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) return reject(new SubmissionError(`提交 HTTP ${xhr.status}`, {
          status: xhr.status,
          unknown: xhr.status >= 500
        }));
        let data;
        try {
          data = typeof xhr.response === "object" && xhr.response !== null ? xhr.response : JSON.parse(xhr.responseText);
        } catch {
          return reject(new SubmissionError("提交响应无法解析，需核实服务器答案", {
            unknown: true
          }));
        }
        if (!data || typeof data !== "object" || data.code === void 0) return reject(new SubmissionError("服务器未返回明确结果", {
          unknown: true
        }));
        if (Number(data.code) !== 0) return reject(new SubmissionError(`${data.msg || data.message || "提交失败"} (${data.code})`, {
          code: Number(data.code)
        }));
        resolve(data);
      };
      xhr.onerror = () => reject(new SubmissionError("提交网络中断，结果待核实", {
        unknown: true
      }));
      xhr.ontimeout = () => reject(new SubmissionError("提交超时，结果待核实", {
        unknown: true
      }));
      xhr.onabort = () => reject(new SubmissionError("提交已中断，结果待核实", {
        unknown: true
      }));
      if (options.signal?.aborted) return reject(new Error("操作已取消"));
      const abort = () => xhr.abort();
      options.signal?.addEventListener("abort", abort, {
        once: true
      });
      xhr.addEventListener?.("loadend", () => options.signal?.removeEventListener("abort", abort), {
        once: true
      });
      try {
        options.guard?.();
        xhr.send(JSON.stringify(payload));
      } catch (error) {
        reject(error);
      }
    });
  }
  async function answerProblem(problem, result, options = {}) {
    return post("/api/v3/lesson/problem/answer", {
      problemId: String(problem.problemId),
      problemType: Number(problem.problemType),
      dt: options.dt ?? Date.now(),
      result: result
    }, options);
  }
  async function retryAnswer(problem, result, dt, options = {}) {
    const resp = await post("/api/v3/lesson/problem/retry", {
      problems: [ {
        problemId: String(problem.problemId),
        problemType: Number(problem.problemType),
        dt: dt,
        result: result
      } ]
    }, options);
    if (!Array.isArray(resp?.data?.success) || !resp.data.success.some(id => String(id?.problemId ?? id?.id ?? id) === String(problem.problemId))) throw new SubmissionError("服务器未确认此题补交成功");
    return resp;
  }
  async function withAnswerLease(problem, lessonId, task) {
    return withLease(`${location.origin}:${repo.accountId}:${lessonId}:${problem.problemId}`, task);
  }
  const localLocks = new Set;
  async function withLease(key, task) {
    if (localLocks.has(key)) throw new Error("此题已有提交任务");
    localLocks.add(key);
    try {
      if (globalThis.navigator?.locks?.request) return await navigator.locks.request(key, {
        ifAvailable: true
      }, lock => {
        if (!lock) throw new Error("另一标签页正在处理此题");
        return task();
      });
      const token = `${Date.now()}-${Math.random()}`, leaseKey = `ykt-helper:lease:${key}`;
      const read = () => {
        try {
          return JSON.parse(localStorage.getItem(leaseKey));
        } catch {
          return null;
        }
      };
      const prior = read();
      if (prior && prior.until > Date.now()) throw new Error("另一标签页正在处理此题");
      try {
        localStorage.setItem(leaseKey, JSON.stringify({
          token: token,
          until: Date.now() + 6e4
        }));
      } catch {
        throw new Error("无法建立跨标签页提交锁，请释放存储空间");
      }
      await new Promise(resolve => setTimeout(resolve, 0));
      if (read()?.token !== token) throw new Error("另一标签页已接管此题");
      const timer = setInterval(() => {
        if (read()?.token === token) try {
          localStorage.setItem(leaseKey, JSON.stringify({
            token: token,
            until: Date.now() + 6e4
          }));
        } catch {}
      }, 2e4);
      try {
        return await task();
      } finally {
        clearInterval(timer);
        if (read()?.token === token) localStorage.removeItem(leaseKey);
      }
    } finally {
      localLocks.delete(key);
    }
  }
  async function submitAnswer(problem, answer, options = {}) {
    const lessonId = String(options.lessonId ?? problem.lessonId ?? repo.currentLessonId ?? "");
    const accountId = repo.accountId;
    const ctx = repo.forLesson(lessonId);
    const p = ctx.problems.get(problem.problemId) || problem;
    const result = validateAnswer(p, answer);
    const state = ctx.problemStatus.get(problem.problemId) || {};
    const mode = options.forceRetry ? "retry" : options.policy || ui.config.submissionPolicy || "auto";
    p.pendingAnswer = result;
    p.updatedAt = Date.now();
    if (mode === "local") {
      repo.persistWork(lessonId);
      return {
        route: "local",
        result: result
      };
    }
    const operation = async () => {
      const guard = () => {
        if (repo.accountId !== accountId) throw new Error("账号已变化，提交已停止");
        options.guard?.();
      };
      guard();
      if (state.needsReconciliation && !options.forceRetry) throw new SubmissionError("上次提交结果未知，请先核实并同步服务器答案", {
        unknown: true
      });
      if (!options.allowResubmit && hasSubmittedAnswer(p.result)) {
        if (sameAnswer(p, p.result, result)) return {
          route: "already-confirmed",
          result: result
        };
        if (mode !== "retry") throw new SubmissionError("服务器已有另一份答案，请明确选择强制补交修改", {
          code: 50028
        });
      }
      const start = Number(options.startTime ?? state.startTime);
      const rawEnd = Object.hasOwn(state, "endTime") ? state.endTime : options.endTime;
      const end = rawEnd == null || rawEnd === "" ? null : Number(rawEnd);
      const closed = state.finished === true || Number.isFinite(end) && Date.now() >= end;
      if (closed && mode === "normal") {
        const e = new SubmissionError("题目已结束，答案已保留在本地");
        e.name = "DeadlineError";
        throw e;
      }
      let route = mode === "retry" || closed ? "retry" : "answer";
      state.phase = "submitting";
      ctx.problemStatus.set(problem.problemId, state);
      repo.persistWork(lessonId);
      const perform = async () => {
        guard();
        const dt = Number.isFinite(start) && start > 0 ? Math.min(start + 2e3, Number.isFinite(end) ? end - 1 : start + 2e3) : Number.isFinite(end) ? end - 1e3 : Date.now() - 2e3;
        return route === "retry" ? retryAnswer(p, result, dt, {
          ...options,
          guard: guard
        }) : answerProblem(p, result, {
          ...options,
          guard: guard
        });
      };
      try {
        let resp;
        try {
          resp = await perform();
        } catch (error) {
          if (error.code !== 50026 || mode !== "auto" || route === "retry") throw error;
          state.finished = true;
          route = "retry";
          resp = await perform();
        }
        p.result = result;
        p.remoteAnswer = result;
        p.updatedAt = Date.now();
        Object.assign(state, {
          done: true,
          phase: "confirmed",
          needsReconciliation: false,
          lastError: "",
          submissionRoute: route
        });
        repo.persistWork(lessonId);
        diag("submit-confirmed", {
          lessonId: lessonId,
          problemId: p.problemId,
          route: route
        });
        return {
          route: route,
          resp: resp,
          result: result
        };
      } catch (error) {
        state.phase = error.unknown || error.code === 50028 ? "unknown" : "failed";
        state.needsReconciliation = state.phase === "unknown";
        state.lastError = error.message;
        repo.persistWork(lessonId);
        throw error;
      }
    };
    return options.leaseHeld ? operation() : withLease(`${location.origin}:${accountId}:${lessonId}:${problem.problemId}`, operation);
  }
  let root$2, mounted$2 = false, viewKey = "";
  const rows = new Map;
  const create = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  function mountProblemListPanel() {
    if (mounted$2) return root$2;
    const wrapper = create("div");
    wrapper.innerHTML = tpl$2;
    document.body.appendChild(wrapper.firstElementChild);
    root$2 = document.getElementById("ykt-problem-list-panel");
    mounted$2 = true;
    document.getElementById("ykt-problem-list-close")?.addEventListener("click", () => showProblemListPanel(false));
    window.addEventListener("ykt:open-problem-list", () => showProblemListPanel(true));
    return root$2;
  }
  function makeRow(p, lessonId) {
    const row = create("div", null, "problem-row");
    row.dataset.problemId = p.problemId;
    const title = create("div", null, "problem-title"), meta = create("div", null, "problem-meta"), bar = create("div", null, "problem-actions"), detail = create("div", null, "problem-detail");
    const input = create("textarea");
    input.rows = 4;
    input.placeholder = '选项如 ["A","C"]；填空如 ["-1","(-∞,0]"]；主观题可直接输入正文。';
    input.value = p.draftText ?? (p.aiProposal ? JSON.stringify(p.aiProposal) : hasSubmittedAnswer(p.result) ? JSON.stringify(p.result) : "");
    const draftInfo = create("small", "", "draft-status"), proposal = create("pre", "", "ai-proposal");
    const select = create("select");
    for (const [value, label] of [ [ "auto", "按题目状态提交" ], [ "normal", "只正常提交" ], [ "retry", "强制补交" ], [ "local", "只保存本地" ] ]) {
      const opt = create("option", label);
      opt.value = value;
      select.appendChild(opt);
    }
    select.value = ui.config.submissionPolicy || "auto";
    const button = (text, fn) => {
      const b = create("button", text);
      b.onclick = fn;
      bar.appendChild(b);
      return b;
    };
    input.addEventListener("input", () => {
      const ok = repo.saveDraft(p.problemId, input.value, lessonId);
      draftInfo.textContent = ok ? "本地草稿已保存 · 未提交" : "草稿仍在内存，持久化失败，请清理存储空间";
    });
    button("查看课件", () => actions.navigateTo(p.presentationId, p.slideId));
    button("AI 建议", () => window.dispatchEvent(new CustomEvent("ykt:open-ai", {
      detail: {
        problemId: p.problemId,
        lessonId: lessonId,
        slideId: p.slideId
      }
    })));
    button("AI 作答并处理", async () => {
      await actions.handleAutoAnswer(p, {
        lessonId: lessonId,
        source: "manual",
        force: true
      });
      updateProblemList();
    });
    button("采用 AI 建议", () => {
      if (!p.aiProposal) return ui.toast("此题尚无 AI 建议");
      input.value = JSON.stringify(p.aiProposal);
      repo.saveDraft(p.problemId, input.value, lessonId);
      draftInfo.textContent = "AI 建议已成为本地草稿 · 未提交";
    });
    const submit = button("提交答案", async () => {
      if (select.value === "local") {
        draftInfo.textContent = repo.saveDraft(p.problemId, input.value, lessonId) ? "本地草稿已保存 · 未提交" : "本地保存失败，草稿仍在编辑器";
        return;
      }
      try {
        const value = validateAnswer(p, actions.parseManual(p.problemType, input.value));
        repo.saveDraft(p.problemId, input.value, lessonId);
        const revision = p.draftRevision, account = repo.accountId;
        submit.disabled = true;
        const out = await submitAnswer(p, value, {
          lessonId: lessonId,
          policy: select.value,
          forceRetry: select.value === "retry",
          guard: () => {
            if (p.draftRevision !== revision || repo.accountId !== account) throw new Error("草稿或账号已变化，提交已停止");
          }
        });
        ui.toast(out.route === "retry" ? "服务器已确认补交成功" : out.route === "local" ? "已保存本地，尚未提交" : "服务器已确认提交成功");
      } catch (error) {
        ui.toast(error.message, 4500);
      } finally {
        submit.disabled = false;
        updateProblemList();
      }
    });
    bar.insertBefore(select, submit);
    select.addEventListener("change", () => updateRow(row, p, lessonId));
    button("核实服务器答案", async () => {
      const pres = repo.forLesson(lessonId).presentations.get(p.presentationId);
      if (!pres?.sourceUrl) return ui.toast("尚无可复用的课件请求，请在官方页面重新打开此课件以同步答案", 5e3);
      try {
        const response = await fetch(pres.sourceUrl, {
          credentials: "include"
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        const data = json.data || json;
        if (!Array.isArray(data.slides)) throw new Error("服务器未返回课件数据");
        actions.onPresentationLoaded(pres.id, data, {
          lessonId: lessonId
        });
        ui.toast("已读取课件；以服务器实际返回的答案为准");
      } catch (error) {
        ui.toast(`核实失败：${error.message}`);
      }
    });
    detail.append(input, draftInfo, proposal);
    row.append(title, meta, bar, detail);
    row.__editor = {
      input: input,
      title: title,
      meta: meta,
      proposal: proposal,
      submit: submit,
      select: select,
      draftInfo: draftInfo
    };
    return row;
  }
  function updateRow(row, p, lessonId) {
    const {title: title, meta: meta, proposal: proposal, submit: submit, select: select} = row.__editor;
    const s = repo.forLesson(lessonId).problemStatus.get(p.problemId) || {};
    title.textContent = p.body || `题目 ${p.problemId}`;
    const ended = s.finished || Number.isFinite(s.endTime) && Date.now() >= s.endTime;
    meta.textContent = `PID: ${p.problemId} / ${hasSubmittedAnswer(p.result) ? "服务器已确认作答" : s.needsReconciliation ? "提交结果待核实" : "未提交"} / ${ended ? "已结束" : s.endTime == null ? "不限时" : "开放"}${s.lastError ? " / " + s.lastError : ""}`;
    proposal.textContent = p.aiProposal ? `AI 建议：${JSON.stringify(p.aiProposal)}${p.verificationProposal ? "\n复核建议：" + JSON.stringify(p.verificationProposal) : ""}` : p.proposalRaw ? `AI 原文（待编辑）：${p.proposalRaw}` : "";
    submit.textContent = select.value === "local" ? "保存本地" : select.value === "retry" || select.value === "auto" && ended ? "强制补交" : "提交答案";
    submit.disabled = s.phase === "submitting";
  }
  function updateProblemList() {
    mountProblemListPanel();
    const container = document.getElementById("ykt-problem-list");
    const context = `${repo.accountId}:${repo.currentLessonId}`;
    if (context !== viewKey) {
      container.replaceChildren();
      rows.clear();
      viewKey = context;
    }
    const ctx = repo.forLesson(), ids = new Set;
    for (const [id, p] of ctx.problems) {
      ids.add(id);
      let row = rows.get(id);
      if (!row) {
        row = makeRow(p, ctx.lessonId);
        rows.set(id, row);
        container.appendChild(row);
      }
      updateRow(row, p, ctx.lessonId);
    }
    for (const [id, row] of rows) if (!ids.has(id)) {
      row.remove();
      rows.delete(id);
    }
    let empty = container.querySelector(".problem-empty");
    if (!ids.size && !empty) {
      empty = create("div", "暂无题目", "problem-empty");
      container.appendChild(empty);
    }
    if (ids.size) empty?.remove();
  }
  function showProblemListPanel(visible = true) {
    mountProblemListPanel();
    root$2.classList.toggle("visible", visible);
    if (visible) updateProblemList();
  }
  var tpl$1 = '<div id="ykt-active-problems-panel" class="ykt-active-wrapper">\n  <div id="ykt-active-problems" class="active-problems"></div>\n</div>\n\n';
  /**
   * Convert the protocol's problem timing fields into a deadline.
   * A missing, zero, or malformed limit means that the problem is untimed.
   * @param {number|string|null|undefined} startTime - unlock time in epoch ms
   * @param {number|string|null|undefined} limit - time limit in seconds
   * @returns {number|null} deadline in epoch ms, or null for an untimed problem
   */  function getProblemEndTime(startTime, limit) {
    const start = Number(startTime);
    const rawLimit = typeof limit === "string" ? limit.trim() : limit;
    if (!Number.isFinite(start) || rawLimit === "" || rawLimit === null || rawLimit === void 0) return null;
    const duration = Number(rawLimit);
    if (!Number.isFinite(duration) || duration <= 0) return null;
    return start + duration * 1e3;
  }
  /**
   * Return the number of whole seconds remaining for a timed problem.
   * @param {number|string|null|undefined} endTime - deadline in epoch ms
   * @param {number} [now=Date.now()] - current time in epoch ms
   * @returns {number|null} remaining seconds, or null for an untimed problem
   */  function getProblemRemainingSeconds(endTime, now = Date.now()) {
    if (endTime === null || endTime === void 0 || endTime === "") return null;
    const end = Number(endTime);
    const current = Number(now);
    if (!Number.isFinite(end) || !Number.isFinite(current)) return null;
    return Math.max(0, Math.floor((end - current) / 1e3));
  }
  let mounted$1 = false;
  let root$1;
  function $$1(sel) {
    return document.querySelector(sel);
  }
  function mountActiveProblemsPanel() {
    if (mounted$1) return root$1;
    const wrap = document.createElement("div");
    wrap.innerHTML = tpl$1;
    document.body.appendChild(wrap.firstElementChild);
    root$1 = document.getElementById("ykt-active-problems-panel");
    mounted$1 = true;
    setInterval(() => updateActiveProblems(), 1e3);
    return root$1;
  }
  function updateActiveProblems() {
    mountActiveProblemsPanel();
    const box = $$1("#ykt-active-problems");
    box.innerHTML = "";
    const now = Date.now();
    let hasActiveProblems = false;
    repo.problemStatus.forEach((status, pid) => {
      const p = repo.problems.get(pid);
      if (!p || hasSubmittedAnswer(p.result) || status.finished) return;
      const remain = getProblemRemainingSeconds(status.endTime, now);
      if (remain !== null && remain <= 0) {
        console.log(`[雨课堂助手][INFO][ActiveProblems] 题目 ${pid} 倒计时已结束，移除卡片`);
        return;
      }
      hasActiveProblems = true;
      const card = document.createElement("div");
      card.className = "active-problem-card";
      const title = document.createElement("div");
      title.className = "ap-title";
      title.textContent = (p.body || `题目 ${pid}`).slice(0, 80);
      card.appendChild(title);
      const info = document.createElement("div");
      info.className = "ap-info";
      info.textContent = remain === null ? "不限时" : `剩余 ${remain}s`;
      card.appendChild(info);
      const bar = document.createElement("div");
      bar.className = "ap-actions";
      const go = document.createElement("button");
      go.textContent = "查看";
      go.onclick = () => actions.navigateTo(status.presentationId, status.slideId);
      bar.appendChild(go);
      const ai = document.createElement("button");
      ai.textContent = "AI 解答";
      ai.onclick = () => window.dispatchEvent(new CustomEvent("ykt:open-ai", {
        detail: {
          problemId: pid,
          lessonId: repo.currentLessonId,
          slideId: status.slideId
        }
      }));
      bar.appendChild(ai);
      card.appendChild(bar);
      box.appendChild(card);
    });
    if (!repo.currentLessonId || !/\/lesson\//.test(location.pathname) || !hasActiveProblems) root$1.style.display = "none"; else root$1.style.display = "";
  }
  var tpl = '<div id="ykt-tutorial-panel" class="ykt-panel">\n  <div class="panel-header">\n    <h3>雨课堂助手使用教程</h3>\n    <span class="close-btn" id="ykt-tutorial-close"><i class="fas fa-times"></i></span>\n  </div>\n\n  <div class="panel-body">\n    <div class="tutorial-content">\n      <h4>工具版本</h4>\n      <p>1.21.7</p>\n\n      <h4>功能介绍</h4>\n      <p>AI雨课堂助手是一个为雨课堂提供辅助功能的工具，可以帮助你更好地参与课堂互动。</p>\n      <p>项目仓库：<a href="https://github.com/ZaytsevZY/yuketang-helper-auto" target="_blank" rel="noopener">GitHub</a></p>\n      <p>脚本安装：<a href="https://greasyfork.org/zh-CN/scripts/531469-ai%E9%9B%A8%E8%AF%BE%E5%A0%82%E5%8A%A9%E6%89%8B-%E6%A8%A1%E5%9D%97%E5%8C%96%E6%9E%84%E5%BB%BA%E7%89%88" target="_blank" rel="noopener">GreasyFork</a></p>\n\n      <h4>工具栏按钮说明</h4>\n      <ul>\n        <li><i class="fas fa-bell"></i> <b>习题提醒</b>：切换是否在新习题出现时显示通知提示（蓝色=开启）。</li>\n        <li><i class="fas fa-file-powerpoint"></i> <b>课件浏览</b>：查看课件与题目页面，提问可见内容。</li>\n        <li><i class="fas fa-robot"></i> <b>AI 解答</b>：向 AI 询问当前题目并显示建议答案。</li>\n        <li><i class="fas fa-magic-wand-sparkles"></i> <b>自动作答</b>：切换自动作答（蓝色=开启）。</li>\n        <li><i class="fas fa-cog"></i> <b>设置</b>：配置 API 密钥与自动作答参数。</li>\n        <li><i class="fas fa-question-circle"></i> <b>使用教程</b>：显示/隐藏当前教程页面。</li>\n      </ul>\n\n      <h4>自动作答</h4>\n      <ul>\n        <li>在设置中开启自动作答并配置延迟/随机延迟。</li>\n        <li>需要配置 LLM API 密钥。</li>\n        <li>答案来自 AI，结果仅供参考。</li>\n      </ul>\n\n      <h4>AI 解答</h4>\n      <ol>\n        <li>点击设置（<i class="fas fa-cog"></i>）填入 API Key。</li>\n        <li>每个 AI Profile 可单独设置 Temperature（0–2）；留空时使用模型默认值，不会发送该参数。</li>\n        <li>点击 AI 解答（<i class="fas fa-robot"></i>）后会对“当前题目/最近遇到的题目”询问并解析。</li>\n      </ol>\n\n      <h4>课堂提醒、桌面路由与亮屏</h4>\n      <ul>\n        <li>设置中可以分别控制新题、题组发布、课件发布、其他发布、下课以及自动作答的每个阶段；系统通知、页面弹窗和提示音也可单独关闭。</li>\n        <li>打开或翻阅旧课件不会触发课件发布提醒；发布类提醒只提示，不会自动作答或提交。</li>\n        <li>在“课堂运行”中打开“重复弹幕自动跟发”后，最近 7 条弹幕内同一文本出现 3 次会跟发 1 条；相邻弹幕间隔达到 60 秒算新一轮，每轮最多 2 条，同一文本每轮只跟发一次。功能默认关闭。</li>\n        <li>脚本只运行桌面端功能。若雨课堂跳转到 <code>/m/v2</code>，脚本会自动改写为对应桌面路径；若服务器仍强制跳回手机版，请在浏览器中启用“桌面版网站”。</li>\n        <li>系统通知需由浏览器或篡改猴授予权限；脚本不会自动请求或修改系统通知权限。</li>\n        <li>“课堂保持亮屏”仅在可见的课堂页防止自动熄屏，无法阻止手动锁屏、后台冻结或系统省电策略。</li>\n      </ul>\n\n      <h4>注意事项</h4>\n      <p>1) 仅供学习参考，请独立思考；</p>\n      <p>2) 合理使用 API 额度；</p>\n      <p>3) 答案不保证 100% 正确；</p>\n      <p>4) 自动作答有一定风险，谨慎开启。</p>\n\n      <h4>联系方式</h4>\n      <ul>\n        <li>请在<a href="https://github.com/ZaytsevZY/yuketang-helper-auto/issues" target="_blank" rel="noopener">GitHub Issues</a>提出问题</li>\n      </ul>\n    </div>\n  </div>\n</div>\n\n';
  let mounted = false;
  let root;
  function $(sel) {
    return document.querySelector(sel);
  }
  function mountTutorialPanel() {
    if (mounted) return root;
    const host = document.createElement("div");
    host.innerHTML = tpl;
    document.body.appendChild(host.firstElementChild);
    root = document.getElementById("ykt-tutorial-panel");
    $("#ykt-tutorial-close")?.addEventListener("click", () => showTutorialPanel(false));
    mounted = true;
    return root;
  }
  function showTutorialPanel(visible = true) {
    mountTutorialPanel();
    root.classList.toggle("visible", !!visible);
  }
  function toggleTutorialPanel() {
    mountTutorialPanel();
    const vis = root.classList.contains("visible");
    showTutorialPanel(!vis);
    const helpBtn = document.getElementById("ykt-btn-help");
    if (helpBtn) helpBtn.classList.toggle("active", !vis);
  }
  // src/ui/ui-api.js
    const saved = storage.get("config", {});
  const _config = normalizeConfig(saved);
  if (!saved?.ai?.profiles && !saved?.profiles) {
    const legacyKey = storage.get("kimiApiKey", _config.ai.kimiApiKey || "");
    if (legacyKey) {
      _config.ai.profiles[0].apiKey = legacyKey;
      _config.ai.kimiApiKey = legacyKey;
    }
  }
  _config.TYPE_MAP = PROBLEM_TYPE_MAP;
  let persistedConfig = JSON.parse(JSON.stringify(_config));
  function replaceConfig(value) {
    for (const k of Object.keys(_config)) delete _config[k];
    Object.assign(_config, normalizeConfig(value));
    _config.TYPE_MAP = PROBLEM_TYPE_MAP;
  }
  function saveConfig() {
    try {
      if (persistedConfig.autoAnswer && !this.config.autoAnswer) this.config.autoAnswerPaused = true;
      if (this.config.autoAnswer) this.config.autoAnswerPaused = false;
      storage.set("config", this.config);
      persistedConfig = JSON.parse(JSON.stringify(this.config));
      try {
        storage.remove("kimiApiKey");
      } catch {}
      window.dispatchEvent(new CustomEvent("ykt:config-changed"));
      return true;
    } catch (error) {
      replaceConfig(persistedConfig);
      this.toast("设置未保存：存储空间不足或不可用。请保留表单，清理缓存后重试", 5e3);
      return false;
    }
  }
  // 面板层级管理
    let currentZIndex = 1e7;
  function enableNotifyDrag(wrapper, handle, bringToFront) {
    if (!wrapper || !handle) return;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    const onPointerMove = ev => {
      if (!dragging) return;
      const nextLeft = Math.max(8, originLeft + ev.clientX - startX);
      const nextTop = Math.max(8, originTop + ev.clientY - startY);
      wrapper.style.left = `${nextLeft}px`;
      wrapper.style.top = `${nextTop}px`;
      wrapper.style.right = "auto";
      wrapper.style.bottom = "auto";
    };
    const stopDrag = () => {
      dragging = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
    handle.addEventListener("pointerdown", ev => {
      if (ev.button !== 0) return;
      if (ev.target?.closest?.("button, a, input, textarea, select")) return;
      const rect = wrapper.getBoundingClientRect();
      dragging = true;
      startX = ev.clientX;
      startY = ev.clientY;
      originLeft = rect.left;
      originTop = rect.top;
      wrapper.style.left = `${rect.left}px`;
      wrapper.style.top = `${rect.top}px`;
      wrapper.style.right = "auto";
      wrapper.style.bottom = "auto";
      bringToFront?.(wrapper);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", stopDrag);
      window.addEventListener("pointercancel", stopDrag);
      ev.preventDefault();
    });
  }
  const ui = {
    get config() {
      return _config;
    },
    saveConfig: saveConfig,
    resetConfig() {
      replaceConfig(makeDefaultConfig());
      return this.saveConfig();
    },
    updatePresentationList: updatePresentationList,
    updateSlideView: updateSlideView,
    askAIForCurrent: askAIForCurrent,
    updateProblemList: updateProblemList,
    updateActiveProblems: updateActiveProblems,
    refreshQuickAnswerControl: refreshQuickAnswerControl,
    // 提升面板层级的辅助函数
    _bringToFront(panelElement) {
      if (panelElement && panelElement.classList.contains("visible")) {
        currentZIndex += 1;
        panelElement.style.zIndex = currentZIndex;
      }
    },
    // 修改后的面板显示函数，添加z-index管理
    showPresentationPanel(visible = true) {
      showPresentationPanel(visible);
      if (visible) {
        const panel = document.getElementById("ykt-presentation-panel");
        this._bringToFront(panel);
      }
    },
    showProblemListPanel(visible = true) {
      showProblemListPanel(visible);
      if (visible) {
        const panel = document.getElementById("ykt-problem-list-panel");
        this._bringToFront(panel);
      }
    },
    showAIPanel(visible = true) {
      showAIPanel(visible);
      if (visible) {
        const panel = document.getElementById("ykt-ai-answer-panel");
        this._bringToFront(panel);
      }
    },
    toggleSettingsPanel() {
      toggleSettingsPanel();
      // 检查面板是否变为可见状态
            const panel = document.getElementById("ykt-settings-panel");
      if (panel && panel.classList.contains("visible")) this._bringToFront(panel);
    },
    toggleTutorialPanel() {
      toggleTutorialPanel();
      // 检查面板是否变为可见状态
            const panel = document.getElementById("ykt-tutorial-panel");
      if (panel && panel.classList.contains("visible")) this._bringToFront(panel);
    },
    // 在 index.js 初始化时挂载一次
    _mountAll() {
      mountSettingsPanel();
      mountAIPanel();
      mountPresentationPanel();
      mountProblemListPanel();
      mountActiveProblemsPanel();
      mountTutorialPanel();
      mountQuickAnswerControl();
    },
    // 题目提醒
    notifyProblem(problem, slide, notice = {}) {
      try {
        const titleText = notice.title || "习题已发布";
        const nativeTitle = notice.nativeTitle || "雨课堂习题提示";
        const detailText = notice.detail || this.getProblemDetail(problem);
        const channels = getReminderChannels(this.config);
        const volume = getReminderVolume(this.config);
        // 1) 原生通知（如果可用，备用，不阻碍自定义弹窗）
                if (channels.native) try {
          this.nativeNotify?.({
            title: nativeTitle,
            text: detailText,
            image: slide?.thumbnail || null,
            timeout: Math.max(2e3, +this.config.notifyPopupDuration || 5e3)
          });
        } catch {}
        if (!channels.popup) {
          if (channels.sound) this._playNotifySound(volume);
          return;
        }
        // 2) 自定义悬浮弹窗
                const wrapper = document.createElement("div");
        wrapper.className = "ykt-problem-notify";
        // 内联样式，避免依赖外部CSS
                Object.assign(wrapper.style, {
          position: "fixed",
          right: "20px",
          bottom: "24px",
          maxWidth: "380px",
          background: "rgba(20,20,20,0.92)",
          color: "#fff",
          borderRadius: "12px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          padding: "14px 16px",
          display: "flex",
          gap: "12px",
          alignItems: "flex-start",
          zIndex: String(++currentZIndex),
          fontSize: "14px",
          lineHeight: "1.5",
          backdropFilter: "blur(2px)",
          border: "1px solid rgba(255,255,255,0.06)",
          cursor: "default"
        });
        // 缩略图（可选）
                if (slide?.thumbnail) {
          const img = document.createElement("img");
          img.src = slide.thumbnail;
          Object.assign(img.style, {
            width: "56px",
            height: "56px",
            objectFit: "cover",
            borderRadius: "8px",
            flex: "0 0 auto"
          });
          wrapper.appendChild(img);
        }
        const body = document.createElement("div");
        body.style.flex = "1 1 auto";
        const head = document.createElement("div");
        Object.assign(head.style, {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          marginBottom: "6px",
          cursor: "move",
          userSelect: "none",
          touchAction: "none"
        });
        const title = document.createElement("div");
        title.textContent = titleText;
        Object.assign(title.style, {
          fontWeight: "600",
          fontSize: "15px",
          flex: "1 1 auto"
        });
        const closeBtn = document.createElement("button");
        closeBtn.textContent = "x";
        Object.assign(closeBtn.style, {
          border: "none",
          background: "transparent",
          color: "#fff",
          opacity: "0.7",
          fontSize: "18px",
          lineHeight: "18px",
          cursor: "pointer",
          padding: "0 4px",
          marginLeft: "4px",
          flex: "0 0 auto"
        });
        closeBtn.addEventListener("mouseenter", () => closeBtn.style.opacity = "1");
        closeBtn.addEventListener("mouseleave", () => closeBtn.style.opacity = "0.7");
        const detail = document.createElement("pre");
        detail.textContent = detailText;
        Object.assign(detail.style, {
          whiteSpace: "pre-wrap",
          margin: 0,
          fontFamily: "inherit",
          opacity: "0.92",
          maxHeight: "220px",
          overflow: "auto"
        });
        head.appendChild(title);
        head.appendChild(closeBtn);
        body.appendChild(head);
        body.appendChild(detail);
        wrapper.appendChild(body);
        document.body.appendChild(wrapper);
        this._bringToFront(wrapper);
        const timeout = Math.max(2e3, +this.config.notifyPopupDuration || 5e3);
        const timer = setTimeout(() => wrapper.remove(), timeout);
        closeBtn.onclick = () => {
          clearTimeout(timer);
          wrapper.remove();
        };
        enableNotifyDrag(wrapper, head, el => this._bringToFront(el));
        if (channels.sound) this._playNotifySound(volume);
      } catch (e) {
        console.warn("[雨课堂助手][WARN][ui.notifyProblem] failed:", e);
      }
    },
    /**
     * Single embedded reminder interface used by desktop and mobile runtimes.
     * Event selection happens here; delivery selection happens in notifyProblem.
     */
    notifyClassroomEvent(event = {}) {
      if (!isReminderEnabled(event.kind, this.config)) return false;
      const detail = event.detail || "课堂状态发生了变化";
      this.notifyProblem(event.problem || {
        problemId: event.dedupeKey || event.kind || "CLASSROOM_EVENT",
        body: detail,
        options: []
      }, event.slide || null, {
        title: event.title || "雨课堂提醒",
        nativeTitle: event.nativeTitle || event.title || "雨课堂提醒",
        detail: detail
      });
      return true;
    },
    notifyPublish(event) {
      const title = event?.title || "课堂内容已发布";
      const detail = event?.detail || "教师发布了新的课堂内容";
      const kind = {
        assessment: "assessment-publish",
        courseware: "courseware-publish",
        other: "other-publish"
      }[event?.category];
      return this.notifyClassroomEvent({
        kind: kind,
        dedupeKey: event?.dedupeKey || "PUBLISH",
        title: title,
        nativeTitle: title,
        detail: detail
      });
    },
    // 播放自定义提示音
    _playNotifySound(volume = .6) {
      const src = (this.config.customNotifyAudioSrc || "").trim();
      if (src) try {
        if (!this.__notifyAudioEl) {
          this.__notifyAudioEl = new Audio;
          this.__notifyAudioEl.preload = "auto";
        }
        const el = this.__notifyAudioEl;
        el.pause();
        // 若用户更换了音频，或首次设置，更新 src
                if (el.src !== src) el.src = src;
        el.volume = Math.max(0, Math.min(1, volume));
        el.currentTime = 0;
        const p = el.play();
        // 失败时回退
                if (p && typeof p.catch === "function") p.catch(() => this._playNotifyTone(volume));
        return;
      } catch (e) {
        console.warn("[雨课堂助手][WARN] custom audio failed, fallback to tone:", e);
        // 回退到合成音
            }
      this._playNotifyTone(volume);
    },
    // 简易提示音：两个音高的短促“叮-咚”
    _playNotifyTone(volume = .6) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext);
        const now = ctx.currentTime;
        const master = ctx.createGain();
        master.gain.value = Math.max(0, Math.min(1, volume));
        master.connect(ctx.destination);
        const tone = (freq, t0, dur = .12) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, t0);
          gain.gain.setValueAtTime(0, t0);
          gain.gain.linearRampToValueAtTime(1, t0 + .01);
          gain.gain.exponentialRampToValueAtTime(.001, t0 + dur);
          osc.connect(gain);
          gain.connect(master);
          osc.start(t0);
          osc.stop(t0 + dur + .02);
        };
        tone(880, now);
 // A5
                tone(1318.51, now + .16);
 // E6
        // 自动关闭
                setTimeout(() => ctx.close(), 500);
      } catch {}
    },
    // 供设置页调用：写入/清除自定义提示音
    setCustomNotifyAudio({src: src, name: name}) {
      this.config.customNotifyAudioSrc = src || "";
      this.config.customNotifyAudioName = name || "";
      return this.saveConfig();
    },
    getProblemDetail(problem) {
      if (!problem) return "题目未找到";
      const lines = [ problem.body || "" ];
      if (Array.isArray(problem.options)) lines.push(...problem.options.map(({key: key, value: value}) => `${key}. ${value}`));
      return lines.join("\n");
    },
    toast: toast,
    nativeNotify: gm.notify,
    // Buttons 状态
    updateAutoAnswerBtn() {
      const el = document.getElementById("ykt-btn-auto-answer");
      if (!el) return;
      el.classList.toggle("active", !_config.autoAnswerPaused && (_config.autoAnswer || _config.autoJoinEnabled && _config.autoAnswerOnAutoJoin));
      el.title = _config.autoAnswerPaused ? "自动作答已暂停，点击恢复" : "自动作答";
    }
  };
  // Both network transports must accept the classroom's presentation contract.
  // /presentation/fetch identifies the deck in the URL; data.id is optional.
    function isSuccessfulClassroomResponse(json) {
    return !!json && typeof json === "object" && json.success !== false && (json.code === void 0 || Number(json.code) === 0);
  }
  function parsePresentationResponse(url, json) {
    if (!isSuccessfulClassroomResponse(json)) return null;
    const data = json.data ?? json.result ?? json;
    if (!data || !Array.isArray(data.slides)) return null;
    let queryId;
    try {
      const query = new URL(url, "https://placeholder.invalid/").searchParams;
      queryId = query.get("presentation_id") || query.get("presentationId");
    } catch {}
    const id = [ queryId, data.id, data.presentationId, data.presentation_id ].find(value => value != null && String(value).trim() !== "");
    if (id == null) return null;
    return {
      id: String(id),
      data: data
    };
  }
  function requestLessonId(url, fallback = repo.currentLessonId) {
    try {
      const u = new URL(url, location.href);
      return u.searchParams.get("lesson_id") || u.searchParams.get("lessonId") || u.pathname.match(/\/lesson\/fullscreen\/v3\/([^/]+)/)?.[1] || fallback;
    } catch {
      return fallback;
    }
  }
  function observeResponse(url, json, body, {lessonId: lessonId, accountId: accountId, own: own = false} = {}) {
    if (accountId != null && accountId !== repo.accountId) return;
    if (!isSuccessfulClassroomResponse(json)) return;
    const presentation = parsePresentationResponse(url, json);
    if (presentation) {
      actions.onPresentationLoaded(presentation.id, {
        ...presentation.data,
        sourceUrl: url
      }, {
        lessonId: lessonId
      });
      diag("presentation-captured", {
        lessonId: lessonId,
        presentationId: presentation.id,
        slides: presentation.data.slides.length
      });
    } else if (Array.isArray((json.data ?? json.result ?? json)?.slides)) diag("presentation-rejected", {
      lessonId: lessonId,
      reason: "missing-presentation-id"
    });
    if (own) return;
    if (typeof body === "string") try {
      body = JSON.parse(body);
    } catch {
      return;
    }
    if (!body || typeof body !== "object") return;
    if (/\/lesson\/problem\/retry(?:\?|$)/.test(url)) {
      const successes = new Set((Array.isArray(json?.data?.success) ? json.data.success : []).map(x => String(x?.problemId ?? x?.id ?? x)));
      for (const p of Array.isArray(body.problems) ? body.problems : []) if (successes.has(String(p.problemId))) actions.onAnswerProblem(p.problemId, p.result, {
        lessonId: lessonId
      });
    } else if (/\/lesson\/problem\/answer(?:\?|$)/.test(url) && body.problemId != null) actions.onAnswerProblem(body.problemId, body.result, {
      lessonId: lessonId
    });
  }
  function installXHRInterceptor() {
    for (const surface of new Set([ window, gm.uw ])) {
      const proto = surface?.XMLHttpRequest?.prototype;
      if (!proto || proto.__yktInstalled) continue;
      const nativeOpen = proto.open, nativeSend = proto.send;
      proto.open = function(...args) {
        this.__yktUrl = String(args[1]);
        this.__yktLessonId = requestLessonId(this.__yktUrl, repo.currentLessonId);
        this.__yktAccountId = repo.accountId;
        return nativeOpen.apply(this, args);
      };
      proto.send = function(body) {
        const url = this.__yktUrl || "", lessonId = this.__yktLessonId, accountId = this.__yktAccountId;
        if (/lesson|presentation|slides|problem/.test(url)) this.addEventListener("load", () => {
          try {
            if (this.status < 200 || this.status >= 300) return;
            const json = this.responseType === "json" ? this.response : JSON.parse(this.responseText);
            observeResponse(url, json, body, {
              lessonId: lessonId,
              accountId: accountId,
              own: this.__yktOwnSubmission === true
            });
          } catch {}
        }, {
          once: true
        });
        return nativeSend.apply(this, arguments);
      };
      proto.__yktInstalled = true;
    }
  }
  async function getOnLesson() {
    const origin = location.origin;
    const same = p => new URL(p, origin).toString();
    const candidates = [ same("/api/v3/classroom/on-lesson"), same("/mooc-api/v1/lms/classroom/on-lesson"), same("/apiv3/classroom/on-lesson") ];
    const tries = [];
    let finalList = [];
    let lastErr = null;
    for (const url of candidates) {
      const item = {
        url: url,
        ok: false,
        status: 0,
        note: ""
      };
      try {
        const r = await fetch(url, {
          credentials: "include"
        });
        item.status = r.status;
        if (!r.ok) {
          item.note = `HTTP ${r.status}`;
          tries.push(item);
          continue;
        }
        const text = await r.text();
        // 打个缩略，避免把整段 JSON 打爆
                item.bodySnippet = text.slice(0, 300);
        let j = {};
        try {
          j = JSON.parse(text);
        } catch (_) {
          item.note = "JSON parse failed";
        }
        const list = j?.data?.onLessonClassrooms || j?.result || j?.data || [];
        item.parsedLength = Array.isArray(list) ? list.length : -1;
        if (Array.isArray(list) && list.length) {
          item.ok = true;
          tries.push(item);
          finalList = list;
          break;
        } else {
          item.note ||= "empty list";
          tries.push(item);
        }
      } catch (e) {
        item.note = e && e.message || "fetch error";
        tries.push(item);
        lastErr = e;
      }
    }
    // 调试信息
        try {
      console.groupCollapsed(`%c[getOnLesson] host=%s  result=%s  candidates=%d`, "color:#09f", location.hostname, finalList.length ? `OK(${finalList.length})` : "EMPTY", candidates.length);
      tries.forEach((t, i) => {
        console.log(`#${i + 1}`, {
          url: t.url,
          ok: t.ok,
          status: t.status,
          note: t.note,
          parsedLength: t.parsedLength,
          bodySnippet: t.bodySnippet
        });
      });
      if (!finalList.length && lastErr) console.warn("[getOnLesson] last error:", lastErr);
      console.groupEnd();
    } catch {}
    return finalList;
  }
  // src/net/xhr-interceptor.js
    async function checkinClass(lessonId, opts = {}) {
    const origin = location.origin;
    const same = p => new URL(p, origin).toString();
    const classroomId = opts?.classroomId;
    const headers = {
      "content-type": "application/json",
      xtbz: "ykt"
    };
    // 针对不同网关，使用各自的 payload 形态
        const candidates = [ {
      url: same("/api/v3/lesson/checkin"),
      payload: {
        lessonId: lessonId,
        ...classroomId ? {
          classroomId: classroomId
        } : {}
      },
      // v3: 驼峰
      name: "v3-same"
    }, {
      url: "https://pro.yuketang.cn/api/v3/lesson/checkin",
      payload: {
        lessonId: lessonId,
        ...classroomId ? {
          classroomId: classroomId
        } : {}
      },
      name: "v3-pro"
    }, {
      url: "https://www.yuketang.cn/api/v3/lesson/checkin",
      payload: {
        lessonId: lessonId,
        ...classroomId ? {
          classroomId: classroomId
        } : {}
      },
      name: "v3-www"
    }, {
      url: same("/mooc-api/v1/lms/lesson/checkin"),
      payload: {
        lesson_id: lessonId,
        ...classroomId ? {
          classroom_id: classroomId
        } : {}
      },
      // 旧网关：蛇形
      name: "mooc-same"
    }, {
      url: same("/apiv3/lesson/checkin"),
      payload: {
        lessonId: lessonId,
        ...classroomId ? {
          classroomId: classroomId
        } : {}
      },
      name: "apiv3-same"
    } ];
    const tries = [];
    let lastErr;
    for (const cand of candidates) {
      const item = {
        url: cand.url,
        name: cand.name,
        status: 0,
        note: ""
      };
      try {
        const resp = await fetch(cand.url, {
          method: "POST",
          credentials: "include",
          headers: headers,
          body: JSON.stringify(cand.payload)
        });
        item.status = resp.status;
        const text = await resp.text().catch(() => "");
        item.bodySnippet = text.slice(0, 300);
        if (!resp.ok) {
          item.note = `HTTP ${resp.status}`;
          // 如果 400/401/403，继续试下一条
                    tries.push(item);
          continue;
        }
        let data = {};
        try {
          data = JSON.parse(text);
        } catch {
          item.note = "JSON parse failed";
        }
        const token = data?.data?.lessonToken || data?.result?.lessonToken || data?.lessonToken;
        const setAuth = resp.headers.get("Set-Auth") || resp.headers.get("set-auth") || null;
        item.note = token ? "OK" : "no token in body";
        tries.push(item);
        if (token) {
          try {
            console.groupCollapsed("%c[checkinClass] OK %s", "color:#0a0", cand.name);
            console.log("payload:", cand.payload);
            console.log("setAuth:", !!setAuth);
            console.groupEnd();
          } catch {}
          return {
            token: token,
            setAuth: setAuth,
            raw: data
          };
        }
      } catch (e) {
        item.note = e.message || "fetch error";
        tries.push(item);
        lastErr = e;
      }
    }
    try {
      console.groupCollapsed("%c[checkinClass] FAILED host=%s", "color:#f33", location.hostname);
      console.log("lessonId:", lessonId, "classroomId:", classroomId);
      tries.forEach((t, i) => console.log(`#${i + 1}`, t));
      if (lastErr) console.warn("lastErr:", lastErr);
      console.groupEnd();
    } catch {}
    // 抛给上层，由上层走“直跳 lesson 页”的兜底逻辑
        throw new Error("checkinClass HTTP 400");
  }
  const ASSESSMENT_MARKERS = [ "problem", "quiz", "exam", "test", "exercise", "paper" ];
  const COURSEWARE_MARKERS = [ "presentation", "courseware", "ppt", "slide" ];
  const PUBLISH_ACTION = /^(send|publish|open|start|release)/;
  const COURSEWARE_PUBLISH_ACTION = /^(send|publish|release)/;
  const ASSESSMENT_PUBLISH_ACTION = /^(send|publish|start|release)/;
  const ENTITY_KEYS = [ "quiz", "exam", "test", "exercise", "paper", "problemGroup", "problem_group", "problem", "presentation", "courseware", "activity" ];
  const NESTED_PAYLOAD_KEYS = [ "data", "payload", "result", "content" ];
  function normalizeOp(message) {
    return String(message?.op || message?.type || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  function includesOneOf(value, markers) {
    return markers.some(marker => value.includes(marker));
  }
  function getEntity(message) {
    const queue = [ message ];
    const visited = new Set;
    let fallback = message && typeof message === "object" ? message : {};
    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== "object" || visited.has(current)) continue;
      visited.add(current);
      for (const key of ENTITY_KEYS) {
        const entity = current[key];
        if (entity && typeof entity === "object") return entity;
      }
      for (const key of NESTED_PAYLOAD_KEYS) {
        const nested = current[key];
        if (nested && typeof nested === "object") {
          fallback = nested;
          if (Array.isArray(nested)) queue.push(...nested); else queue.push(nested);
        }
      }
    }
    return fallback;
  }
  function firstText(source, keys) {
    for (const key of keys) {
      const value = source?.[key];
      if (value === void 0 || value === null || typeof value === "object") continue;
      if (String(value).trim()) return String(value).trim();
    }
    return "";
  }
  const IDENTIFIER_KEYS = [ "id", "uuid", "quizId", "quiz_id", "examId", "exam_id", "testId", "test_id", "exerciseId", "exercise_id", "presentationId", "presentation_id", "problemId", "problem_id", "problemid", "problem", "presentation", "activityId", "activity_id" ];
  function findNestedText(source, keys) {
    const queue = [ source ];
    const visited = new Set;
    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== "object" || visited.has(current)) continue;
      visited.add(current);
      const value = firstText(current, keys);
      if (value) return value;
      for (const key of NESTED_PAYLOAD_KEYS) {
        const nested = current[key];
        if (Array.isArray(nested)) queue.push(...nested); else if (nested && typeof nested === "object") queue.push(nested);
      }
    }
    return "";
  }
  function getIdentifier(message, entity, op) {
    return firstText(entity, IDENTIFIER_KEYS) || findNestedText(message, IDENTIFIER_KEYS) || op;
  }
  function getDetail(message, entity) {
    return firstText(entity, [ "title", "name", "subject", "label", "body" ]) || firstText(message, [ "title", "name", "subject", "label" ]) || "教师发布了新的课堂内容";
  }
  function getCategory(op) {
    if (op === "unlockproblem") return null;
    // probleminfo 是页面打开题目时自己请求的计时回包，不是老师的发布动作。
        if (op === "probleminfo") return null;
    // 雨课堂课堂页用 newquiz / newpaper 推送试卷与考试。
        if (op === "newquiz" || op === "newpaper") return "assessment";
    // 结果、关闭、展示、更新等操作同样会带 problem，不能当成新题发布。
        if (includesOneOf(op, ASSESSMENT_MARKERS)) return ASSESSMENT_PUBLISH_ACTION.test(op) ? "assessment" : null;
    // 打开旧课件、翻页等操作也会带 presentation/slide，不能误落入通用发布提醒。
        if (includesOneOf(op, COURSEWARE_MARKERS)) return COURSEWARE_PUBLISH_ACTION.test(op) ? "courseware" : null;
    if (PUBLISH_ACTION.test(op)) return "other";
    return null;
  }
  function classifyPublishEvent(message) {
    const op = normalizeOp(message);
    const category = getCategory(op);
    if (!category) return null;
    const entity = getEntity(message);
    const id = getIdentifier(message, entity, op);
    const detail = getDetail(message, entity);
    const title = {
      assessment: "考试/测试题组已发布",
      courseware: "课件已发布",
      other: "课堂内容已发布"
    }[category];
    return {
      category: category,
      dedupeKey: `${category}:${id}`,
      title: title,
      detail: detail
    };
  }
  function isPublishReminderEnabled(event, config = {}) {
    if (!event?.category) return false;
    const kind = {
      assessment: "assessment-publish",
      courseware: "courseware-publish",
      other: "other-publish"
    }[event.category];
    return kind ? isReminderEnabled(kind, config) : false;
  }
  function getRealtimeEvent(message) {
    const op = normalizeOp(message);
    if (op === "fetchtimeline") return {
      kind: "timeline",
      timeline: message?.timeline
    };
    if (op === "newdanmu") return {
      kind: "danmu",
      message: message
    };
    if (op === "unlockproblem") {
      const rawProblem = message?.problem;
      const problem = rawProblem && typeof rawProblem === "object" ? {
        ...message,
        ...rawProblem
      } : {
        ...message,
        prob: message?.prob ?? rawProblem ?? message?.problemid
      };
      return {
        kind: "unlockproblem",
        problem: problem
      };
    }
    if (op === "lessonfinished") return {
      kind: "lessonfinished"
    };
    // 老师提前结束题目：{ op: 'problemfinished', prob }
        if (op === "problemfinished") return {
      kind: "problemfinished",
      problemId: message?.prob ?? message?.problemid ?? message?.problemId
    };
    // 老师延长作答时间：{ op: 'extendtime', problem: { prob, extend, limit, dt, now } }，extend=-1 表示改为不限时
        if (op === "extendtime") {
      const p = message?.problem && typeof message.problem === "object" ? message.problem : message;
      return {
        kind: "extendtime",
        problem: p
      };
    }
    const event = classifyPublishEvent(message);
    return event ? {
      kind: "publish",
      event: event
    } : null;
  }
  /**
   * Shares the short de-duplication window used by every realtime reminder.
   * Different event kinds have their own dedupe keys, so a new question cannot
   * suppress a courseware notification (or the other way around).
   */  function createEventReminder({notify: notify, isEnabled: isEnabled = () => true, now: now = () => Date.now(), dedupeMs: dedupeMs = 6e4} = {}) {
    const seenUntil = new Map;
    function prune(time) {
      for (const [key, expiresAt] of seenUntil) if (expiresAt <= time) seenUntil.delete(key);
    }
    return {
      handle(event, config) {
        if (!event || !event.dedupeKey || !isEnabled(event, config)) return false;
        const time = now();
        prune(time);
        if (seenUntil.has(event.dedupeKey)) return false;
        seenUntil.set(event.dedupeKey, time + dedupeMs);
        notify?.(event);
        return true;
      }
    };
  }
  function createPublishReminder(options = {}) {
    return createEventReminder({
      ...options,
      isEnabled: options.isEnabled || isPublishReminderEnabled
    });
  }
  function dispatchInputEvent(input, type) {
    if (typeof input?.dispatchEvent !== "function") return;
    const EventCtor = input.ownerDocument?.defaultView?.Event || globalThis.Event;
    try {
      input.dispatchEvent(typeof EventCtor === "function" ? new EventCtor(type, {
        bubbles: true
      }) : {
        type: type,
        bubbles: true
      });
    } catch {
      try {
        input.dispatchEvent({
          type: type,
          bubbles: true
        });
      } catch {}
    }
  }
  function setInputValue(input, text) {
    const valueDescriptor = (() => {
      let current = input;
      while (current) {
        const descriptor = Object.getOwnPropertyDescriptor(current, "value");
        if (descriptor) return descriptor;
        current = Object.getPrototypeOf(current);
      }
      return null;
    })();
    if (typeof valueDescriptor?.set === "function") valueDescriptor.set.call(input, text); else if ("value" in input) input.value = text; else input.textContent = text;
    dispatchInputEvent(input, "input");
    dispatchInputEvent(input, "change");
  }
  function outboundText(message) {
    if (!message || typeof message !== "object") return null;
    for (const k of [ "danmu", "text", "barrage" ]) if (typeof message[k] === "string") return message[k];
    for (const k of [ "data", "payload", "message", "msg" ]) {
      const value = outboundText(message[k]);
      if (value) return value;
    }
    return null;
  }
  /** A matching outbound frame proves dispatch, not server acceptance. */  async function sendDanmuText(text, {root: root = globalThis.document, lessonId: lessonId = null, awaitConfirmationMs: awaitConfirmationMs = 2e3} = {}) {
    if (!String(text || "").trim()) return {
      sent: false,
      reason: "empty"
    };
    const input = root?.querySelector?.(".send__input"), button = root?.querySelector?.(".send__btn");
    if (!input || !button) return {
      sent: false,
      reason: "controls-unavailable"
    };
    if (String(input.value ?? input.textContent ?? "").trim() || root.activeElement === input) return {
      sent: false,
      reason: "user-editing"
    };
    if (button.disabled || typeof button.click !== "function") return {
      sent: false,
      reason: "send-disabled"
    };
    return new Promise(resolve => {
      let done = false;
      const finish = result => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener("ykt:danmu-outbound", onOutbound);
        resolve({
          text: text,
          ...result
        });
      };
      const onOutbound = event => {
        const detail = event.detail || {}, op = String(detail.message?.op || detail.message?.type || "").toLowerCase();
        if (lessonId != null && String(detail.lessonId) !== String(lessonId)) return;
        if (!/danmu|barrage|sendmessage|sendchat/.test(op)) return;
        if (outboundText(detail.message) === text) finish({
          sent: true,
          dispatched: true,
          confirmed: false
        });
      };
      const timer = setTimeout(() => {
        if (input.value === text) setInputValue(input, "");
        finish({
          sent: false,
          unknown: true,
          reason: "no-outbound-observed"
        });
      }, awaitConfirmationMs);
      window.addEventListener("ykt:danmu-outbound", onOutbound);
      try {
        setInputValue(input, text);
        button.click();
      } catch (error) {
        if (input.value === text) setInputValue(input, "");
        finish({
          sent: false,
          reason: "send-error",
          error: error
        });
      }
    });
  }
  function extractDanmuMessage(message) {
    if (String(message?.op || message?.type || "").replace(/[^a-z]/gi, "").toLowerCase() !== "newdanmu") return null;
    const parts = [ message, message.data, message.msg, message.message, message.payload ].filter(Boolean);
    const p = parts.find(x => typeof x.danmu === "string");
    if (!p) return null;
    const userId = parts.map(x => x.userid ?? x.userId ?? x.user_id ?? x.uid).find(x => x != null);
    return {
      text: p.danmu,
      userId: userId == null ? null : String(userId)
    };
  }
  function createDanmuFollowTracker(options = {}) {
    const size = options.windowSize || 7, windowMs = options.windowMs || 3e4, roundMs = options.roundGapMs || 6e4, max = options.maxSendsPerRound ?? 2;
    let messages = [], roundStart = null, lastAt = null, sentCount = 0, generation = 0;
    const followedTexts = new Set, reservations = new Map;
    function reset() {
      messages = [];
      roundStart = lastAt = null;
      sentCount = 0;
      followedTexts.clear();
      reservations.clear();
      generation++;
    }
    return {
      reset: reset,
      observe(text, at = Date.now()) {
        if (typeof text !== "string" || !text.trim()) return {
          triggered: false,
          reason: "empty"
        };
        if (lastAt != null && (at < lastAt || at - lastAt >= roundMs || at - roundStart >= roundMs)) reset();
        if (roundStart == null) roundStart = at;
        lastAt = at;
        messages = messages.filter(x => at - x.at <= windowMs);
        messages.push({
          text: text,
          at: at
        });
        if (messages.length < size) return {
          triggered: false,
          reason: "window",
          sentCount: sentCount
        };
        const batch = messages.slice(-size);
        messages = [];
        const counts = new Map;
        for (const x of batch) counts.set(x.text, (counts.get(x.text) || 0) + 1);
        let chosen = batch.at(-1).text;
        for (const x of batch) if ((counts.get(x.text) || 0) >= counts.get(chosen)) chosen = x.text;
        if (followedTexts.has(chosen) || [ ...reservations.values() ].some(r => r.text === chosen)) return {
          triggered: false,
          text: chosen,
          reason: "already-followed",
          sentCount: sentCount
        };
        if (sentCount + reservations.size >= max) return {
          triggered: false,
          text: chosen,
          reason: "round-limit",
          sentCount: sentCount
        };
        const token = `${generation}:${at}:${Math.random()}`;
        reservations.set(token, {
          text: chosen,
          generation: generation
        });
        return {
          triggered: true,
          text: chosen,
          count: counts.get(chosen),
          token: token,
          sentCount: sentCount
        };
      },
      settle(token, result) {
        const entry = reservations.get(token);
        if (!entry) return;
        reservations.delete(token);
        if (entry.generation !== generation) return;
        // Definite pre-send failures roll back. Unknown outbound outcomes reserve quota.
                if (result === true || result?.sent || result?.unknown) {
          sentCount++;
          followedTexts.add(entry.text);
        }
      },
      getSnapshot() {
        return {
          messages: [ ...messages ],
          lastAt: lastAt,
          roundStart: roundStart,
          sentCount: sentCount,
          followedTexts: new Set(followedTexts),
          pending: reservations.size
        };
      }
    };
  }
  function createDanmuFollowController(options = {}) {
    const tracker = options.tracker || createDanmuFollowTracker(options), pendingOwn = new Map;
    const enabled = () => typeof options.enabled === "function" ? options.enabled() : options.enabled !== false;
    let generation = 0;
    return {
      async handle(message, {notificationOnly: notificationOnly = false} = {}) {
        const p = extractDanmuMessage(message);
        if (!p) return {
          handled: false,
          triggered: false
        };
        if (!enabled() || notificationOnly) {
          tracker.reset();
          return {
            handled: true,
            triggered: false,
            reason: "disabled"
          };
        }
        const now = options.now?.() ?? Date.now(), ownId = options.getCurrentUserId?.();
        if (ownId != null && p.userId === String(ownId)) return {
          triggered: false,
          reason: "own"
        };
        for (const [text, until] of pendingOwn) if (until < now) pendingOwn.delete(text);
        if (p.userId == null && pendingOwn.has(p.text)) {
          pendingOwn.delete(p.text);
          return {
            triggered: false,
            reason: "own-echo"
          };
        }
        const observation = tracker.observe(p.text, now);
        if (!observation.triggered) return {
          handled: true,
          ...observation
        };
        const initialGeneration = generation;
        let sendResult;
        try {
          if (!enabled()) sendResult = {
            sent: false,
            reason: "disabled"
          }; else {
            pendingOwn.set(observation.text, now + 1e4);
            sendResult = await (options.send || sendDanmuText)(observation.text);
          }
        } catch (error) {
          sendResult = {
            sent: false,
            reason: "send-error",
            error: error
          };
        }
        if (generation === initialGeneration) tracker.settle(observation.token, sendResult);
        if (!sendResult?.sent && !sendResult?.unknown) pendingOwn.delete(observation.text);
        return {
          handled: true,
          ...observation,
          sendResult: sendResult,
          sentCount: tracker.getSnapshot().sentCount
        };
      },
      reset() {
        generation++;
        tracker.reset();
        pendingOwn.clear();
      },
      getSnapshot() {
        return {
          tracker: tracker.getSnapshot(),
          pendingOwn: new Map(pendingOwn)
        };
      }
    };
  }
  const MINUTE_MS = 60 * 1e3;
  function toDate(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function parseClock(value) {
    const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }
  function getWindowPoint(item) {
    if (typeof item === "string") return parseClock(item);
    if (!item || typeof item !== "object") return null;
    return parseClock(item.at ?? item.time);
  }
  function getWindowBounds(item) {
    const beforeMs = Number(item?.beforeMs);
    const afterMs = Number(item?.afterMs);
    return {
      beforeMs: Number.isFinite(beforeMs) ? Math.max(0, beforeMs) : MINUTE_MS,
      afterMs: Number.isFinite(afterMs) ? Math.max(0, afterMs) : 10 * MINUTE_MS
    };
  }
  function localDayAt(date, dayOffset) {
    const day = new Date(date.getTime());
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + dayOffset);
    return day;
  }
  /**
   * Whether a timestamp is inside any configured fast-answer window.
   * Windows use local browser time and are inclusive at both ends.
   */  function isWithinAnswerPriorityWindow(now = Date.now(), windows = []) {
    const date = toDate(now);
    if (!date || !Array.isArray(windows)) return false;
    const current = date.getTime();
    for (const item of windows) {
      const minutes = getWindowPoint(item);
      if (minutes === null) continue;
      const {beforeMs: beforeMs, afterMs: afterMs} = getWindowBounds(item);
      for (let dayOffset = -2; dayOffset <= 2; dayOffset += 1) {
        const point = localDayAt(date, dayOffset).getTime() + minutes * MINUTE_MS;
        if (current >= point - beforeMs && current <= point + afterMs) return true;
      }
    }
    return false;
  }
  function getProfiles(aiConfig) {
    const profiles = Array.isArray(aiConfig?.profiles) ? aiConfig.profiles : [];
    return profiles.filter(profile => profile && typeof profile === "object");
  }
  function getActiveProfile(profiles, activeProfileId) {
    return profiles.find(profile => profile.id === activeProfileId) || profiles[0] || null;
  }
  /**
   * Pick the profile for one stage of an answer attempt.
   * A missing or invalid special profile falls back to the active profile.
   */  function selectAnswerProfile(aiConfig, {role: role = "active", now: now = Date.now(), windows: windows = [], fastProfileId: fastProfileId = aiConfig?.fastAnswerProfileId, verifyProfileId: verifyProfileId = aiConfig?.verifyAnswerProfileId, quickMode: quickMode = "auto"} = {}) {
    const profiles = getProfiles(aiConfig);
    const active = getActiveProfile(profiles, aiConfig?.activeProfileId);
    if (!active) return null;
    if (role === "fast" && (quickMode === "on" || quickMode !== "off" && isWithinAnswerPriorityWindow(now, windows))) return profiles.find(profile => profile.id === fastProfileId) || active;
    if (role === "verify") return profiles.find(profile => profile.id === verifyProfileId) || active;
    return active;
  }
  let autoLoop = null, joinTimer = null, joinGeneration = 0, navigationTimer = null;
  let lastAutoAnswer = null;
  const danmuControllers = new Map;
  const publishReminder = createPublishReminder({
    notify: event => ui.notifyPublish(event)
  });
  const problemReminder = createEventReminder({
    notify: event => ui.notifyClassroomEvent(event),
    isEnabled: (_, cfg) => isReminderEnabled("problem-start", cfg)
  });
  const key = value => value == null ? "" : String(value);
  const firstValue = (...values) => values.find(x => x != null && String(x).trim() !== "");
  const refresh = lessonId => {
    if (key(lessonId) !== key(repo.currentLessonId) || !document.body) return;
    ui.updateActiveProblems?.();
    ui.updateProblemList?.();
    ui.refreshQuickAnswerControl?.();
  };
  function hasActiveAIProfile(cfg) {
    const list = cfg?.profiles || [];
    return !!(list.find(p => p.id === cfg.activeProfileId) || list[0])?.apiKey || !list.length && !!cfg?.kimiApiKey;
  }
  function effectiveAutoAnswer(lessonId) {
    return !ui.config.autoAnswerPaused && (ui.config.autoAnswer && key(lessonId) === key(repo.currentLessonId) || ui.config.autoJoinEnabled && ui.config.autoAnswerOnAutoJoin && repo.autoJoinedLessons.has(key(lessonId)));
  }
  function currentPageLessonId() {
    return location.pathname.match(/\/(?:lesson\/fullscreen\/v3|v2\/web\/lesson)\/([^/]+)/)?.[1] || null;
  }
  function closed(status) {
    return status?.finished || Number.isFinite(status?.endTime) && Date.now() >= status.endTime;
  }
  function windows() {
    const x = ui.config.answerPriorityTimes;
    return Array.isArray(x) ? x : String(x || "").split(/[,，\s]+/).filter(Boolean);
  }
  function profileFor(role = "active") {
    const cfg = {
      ...ui.config.ai,
      fastAnswerProfileId: ui.config.fastAnswerProfileId,
      verifyAnswerProfileId: ui.config.verifyAnswerProfileId
    };
    const quick = ui.config.quickAnswerMode === "on" || ui.config.quickAnswerMode === "auto" && isWithinAnswerPriorityWindow(Date.now(), windows());
    const p = selectAnswerProfile(cfg, {
      role: role === "verify" ? "verify" : quick ? "fast" : "active",
      now: Date.now(),
      windows: windows(),
      quickMode: ui.config.quickAnswerMode
    });
    if (role !== "verify" && quick && (!ui.config.fastAnswerProfileId || p?.id !== ui.config.fastAnswerProfileId)) return {
      profile: p,
      quick: false,
      reason: "快答未配置，使用常规模型"
    };
    return {
      profile: p,
      quick: quick,
      reason: quick ? ui.config.quickAnswerMode === "on" ? "强制开启" : "命中时间窗口" : "常规作答"
    };
  }
  function notifyAutoAnswer(kind, problem, detail) {
    return ui.notifyClassroomEvent({
      kind: kind,
      title: {
        "auto-answer-scheduled": "自动作答已排队",
        "auto-answer-started": "自动作答开始",
        "auto-answer-succeeded": "自动作答成功",
        "auto-answer-failed": "自动作答失败"
      }[kind],
      detail: detail || problem.body || "课堂习题",
      problem: problem
    });
  }
  function schedule(problem, status, lessonId) {
    if (!effectiveAutoAnswer(lessonId) || status.answering || hasSubmittedAnswer(problem.result) || status.needsReconciliation) return false;
    if (closed(status) && ui.config.submissionPolicy === "normal") return false;
    if (status.phase === "proposal" && ui.config.submissionPolicy === "local") return false;
    if (status.phase === "failed" && (status.attempts || 0) >= 3) return false;
    if (status.autoAnswerTime == null) {
      const delay = Math.max(0, Number(ui.config.autoAnswerDelay) || 0) + Math.floor(Math.random() * Math.max(0, Number(ui.config.autoAnswerRandomDelay) || 0));
      status.autoAnswerTime = Date.now() + delay;
      status.phase = "queued";
      repo.persistWork(lessonId);
      notifyAutoAnswer("auto-answer-scheduled", problem, `约 ${Math.ceil(delay / 1e3)} 秒后处理`);
    }
    return true;
  }
  function getCurrentUserIdSafe() {
    return document.cookie.match(/(?:^|;\s*)user_id=([^;]+)/)?.[1] || null;
  }
  function finishedKey(lessonId) {
    return repo.storageKey("finished-problems", lessonId);
  }
  function isKnownFinished(id, lessonId) {
    const list = storage.get(finishedKey(lessonId), []);
    return Array.isArray(list) && list.includes(key(id));
  }
  function rememberFinished(id, lessonId) {
    try {
      const list = storage.get(finishedKey(lessonId), []);
      storage.set(finishedKey(lessonId), [ ...(Array.isArray(list) ? list : []).filter(x => x !== key(id)), key(id) ].slice(-200));
    } catch (error) {
      diag("storage-failed", {
        operation: "finished",
        message: error.message
      });
    }
  }
  async function handleAutoAnswerInternal(problem, options = {}) {
    const lessonId = key(options.lessonId ?? problem.lessonId ?? repo.currentLessonId), ctx = repo.forLesson(lessonId);
    const status = ctx.problemStatus.get(problem.problemId);
    if (!status || status.answering || hasSubmittedAnswer(problem.result) && !options.allowResubmit) return;
    const manual = options.source === "manual" || options.force === true;
    if (!manual && !effectiveAutoAnswer(lessonId)) return;
    if (!manual && (problem.draftRevision || 0) > 0 && String(problem.draftText || "").trim()) {
      status.phase = "manual-draft";
      status.autoAnswerTime = null;
      status.lastError = "已有人工草稿，等待手动处理";
      return;
    }
    status.answering = true;
    status.autoAnswerTime = null;
    status.attempts = (status.attempts || 0) + 1;
    const revision = problem.draftRevision || 0, answerRevision = status.answerRevision || 0, account = repo.accountId, quickMode = ui.config.quickAnswerMode;
    const stillEligible = () => {
      if (repo.accountId !== account) throw new Error("账号已变化");
      if (!manual && !effectiveAutoAnswer(lessonId)) throw new Error("自动作答已暂停");
      if (quickMode !== ui.config.quickAnswerMode) throw new Error("快答策略已变化，旧结果仅保留为建议");
      if ((problem.draftRevision || 0) !== revision || (status.answerRevision || 0) !== answerRevision) throw new Error("人工答案已变化，旧 AI 结果仅保留为建议");
    };
    try {
      return await withAnswerLease(problem, lessonId, async () => {
        stillEligible();
        const disk = storage.get(repo.storageKey("work", lessonId), []);
        const confirmed = Array.isArray(disk) && disk.find(x => key(x.problemId) === key(problem.problemId) && x.status?.phase === "confirmed" && hasSubmittedAnswer(x.result));
        if (confirmed && !options.allowResubmit) {
          problem.result = confirmed.result;
          status.done = true;
          status.phase = "confirmed";
          return;
        }
        if (status.needsReconciliation) throw new Error("上次提交结果未知，请先同步服务器答案");
        notifyAutoAnswer("auto-answer-started", problem);
        const selection = profileFor();
        let raw = problem.proposalRaw || "", candidate = problem.aiProposal, image = null;
        if (!candidate) {
          status.phase = "generating";
          repo.persistWork(lessonId);
          if (!selection.profile?.apiKey) throw new Error("AI 配置不可用，请填写 API Key；可手动编辑并提交");
          try {
            image = await captureSlideImage(status.slideId, {
              lessonId: lessonId
            });
          } catch {}
          stillEligible();
          if (!image && lessonId === key(repo.currentLessonId) && key(repo.currentSlideId) === key(status.slideId)) image = await captureProblemForVision();
          const prompt = formatProblemForVision(problem, PROBLEM_TYPE_MAP, !!problem.body) + "\n填空答案必须为按空位排列的 JSON 字符串数组；单选和多选答案也用 JSON 字符串数组。";
          const aiConfig = {
            ...ui.config.ai,
            activeProfileId: selection.profile.id
          };
          const deadline = ui.config.submissionPolicy === "normal" && Number.isFinite(status.endTime) ? status.endTime : null;
          diag("ai-request", {
            lessonId: lessonId,
            problemId: problem.problemId,
            profileId: selection.profile.id,
            quick: selection.quick,
            reason: selection.reason,
            deadline: deadline
          });
          if (image) raw = await queryAIVision(image, prompt, aiConfig, {
            problemType: problem.problemType,
            priorityDeadline: status.endTime,
            deadline: deadline,
            guard: stillEligible,
            resolveProfile: () => profileFor().profile,
            timeout: 45e3
          }); else if (String(problem.body || "").trim()) raw = await queryAI(`${prompt}\n${ui.getProblemDetail(problem)}`, aiConfig, {
            priorityDeadline: status.endTime,
            deadline: deadline,
            guard: stillEligible,
            resolveProfile: () => profileFor().profile
          }); else throw new Error("题目截图不可用，且没有完整题干；已停止此题");
          candidate = parseAIAnswer(problem, raw);
          problem.proposalRaw = raw;
          problem.updatedAt = Date.now();
          if (!candidate) throw new Error("AI 答案格式不明确，已保留原文供人工编辑");
          problem.aiProposal = candidate;
          repo.persistWork(lessonId);
          diag("auto-proposal", {
            lessonId: lessonId,
            problemId: problem.problemId,
            answer: candidate,
            profileId: selection.profile.id
          });
        }
        // Persist paid AI output before checking cancellation or a newer manual edit.
                stillEligible();
        const verify = async () => {
          if (!ui.config.answerVerification || !ui.config.verifyAnswerProfileId || !image) return candidate;
          const p = profileFor("verify").profile;
          if (!p?.apiKey || p.id !== ui.config.verifyAnswerProfileId) return candidate;
          if (Number.isFinite(status.endTime) && status.endTime - Date.now() < 15e3) return candidate;
          const check = await queryAIVision(image, `复核题目并独立给出答案。原候选：${JSON.stringify(candidate)}。答案用 JSON 数组；主观题用 content/pics 对象。`, {
            ...ui.config.ai,
            activeProfileId: p.id
          }, {
            problemType: problem.problemType,
            guard: stillEligible,
            timeout: 45e3,
            deadline: ui.config.submissionPolicy === "normal" ? status.endTime : null
          });
          const parsed = parseAIAnswer(problem, check);
          if (parsed) problem.verificationProposal = parsed;
          return parsed || candidate;
        };
        if (!selection.quick) try {
          candidate = await verify();
          problem.aiProposal = candidate;
        } catch (error) {
          status.verificationError = error.message;
        }
        stillEligible();
        if (options.generateOnly || ui.config.submissionPolicy === "local") {
          status.phase = "proposal";
          repo.persistWork(lessonId);
          return {
            route: "local",
            result: candidate
          };
        }
        const outcome = await submitAnswer(problem, candidate, {
          lessonId: lessonId,
          policy: ui.config.submissionPolicy,
          forceRetry: options.forceRetry,
          allowResubmit: options.allowResubmit,
          leaseHeld: true,
          guard: stillEligible
        });
        if (outcome.route !== "local") notifyAutoAnswer("auto-answer-succeeded", problem, outcome.route === "retry" ? "答案已确认补交成功" : "答案已确认提交成功");
        if (selection.quick && ui.config.answerVerification) try {
          const corrected = await verify();
          stillEligible();
          if (!sameAnswer(problem, corrected, candidate) && ui.config.submissionPolicy === "auto") {
            await submitAnswer(problem, corrected, {
              lessonId: lessonId,
              forceRetry: true,
              allowResubmit: true,
              leaseHeld: true,
              guard: stillEligible
            });
            status.verificationState = "corrected";
          } else status.verificationState = sameAnswer(problem, corrected, candidate) ? "same" : "suggestion";
        } catch (error) {
          status.verificationState = "suggestion";
          status.verificationError = error.message;
        }
        return outcome;
      });
    } catch (error) {
      if (![ "unknown", "confirmed" ].includes(status.phase)) status.phase = problem.aiProposal ? "proposal" : "failed";
      status.lastError = error.message;
      diag("auto-error", {
        lessonId: lessonId,
        problemId: problem.problemId,
        message: error.message,
        phase: status.phase
      });
      if (!manual && !problem.aiProposal && status.attempts < 3 && (error.timeout || /网络|限流/.test(error.message)) && effectiveAutoAnswer(lessonId)) status.autoAnswerTime = Date.now() + 2e3;
      if (manual) ui.toast(error.message, 4e3); else notifyAutoAnswer("auto-answer-failed", problem, error.message);
    } finally {
      status.answering = false;
      repo.persistWork(lessonId);
      refresh(lessonId);
    }
  }
  function startAutoAnswerLoop() {
    if (!autoLoop) autoLoop = setInterval(() => actions.tickAutoAnswer(), 500);
  }
  const actions = {
    onFetchTimeline(timeline, options = {}) {
      for (const p of Array.isArray(timeline) ? timeline : []) if (p?.type === "problem") this.onUnlockProblem(p, {
        ...options,
        source: "timeline"
      });
    },
    onPresentationLoaded(id, data, options = {}) {
      const lessonId = key(options.lessonId ?? data.lessonId ?? repo.currentLessonId), ctx = repo.forLesson(lessonId);
      repo.setPresentation(id, data, lessonId);
      for (const [k, event] of [ ...ctx.pendingEvents ]) {
        if (Date.now() - event.at > 18e5) {
          ctx.pendingEvents.delete(k);
          continue;
        }
        if (ctx.problems.has(event.payload.prob ?? event.payload.problemId) && ctx.slides.has(event.payload.sid ?? event.payload.slideId)) {
          ctx.pendingEvents.delete(k);
          this.onUnlockProblem(event.payload, event.options);
        }
      }
      for (const [pid, status] of ctx.problemStatus) {
        const p = ctx.problems.get(pid);
        if (p) schedule(p, status, lessonId);
      }
      repo.persistWork(lessonId);
      if (lessonId === key(repo.currentLessonId) && document.body) {
        ui.updatePresentationList();
        refresh(lessonId);
      }
    },
    onUnlockProblem(data, options = {}) {
      const {notificationOnly: notificationOnly = false, source: source = "live"} = options, payload = data || {};
      const lessonId = key(options.lessonId ?? payload.lessonId ?? repo.currentLessonId), ctx = repo.forLesson(lessonId);
      const problemId = key(firstValue(payload.prob, payload.problemId, payload.problemid, payload.problem?.problemId, payload.id));
      const slideId = key(firstValue(payload.sid, payload.slideId, payload.slide?.id));
      if (!problemId) return false;
      const problem = ctx.problems.get(problemId), slide = ctx.slides.get(slideId);
      if (!problem || !slide) {
        ctx.pendingEvents.set(problemId, {
          payload: payload,
          options: {
            ...options,
            lessonId: lessonId
          },
          at: Date.now()
        });
        while (ctx.pendingEvents.size > 100) ctx.pendingEvents.delete(ctx.pendingEvents.keys().next().value);
        return false;
      }
      const previous = ctx.problemStatus.get(problemId);
      const status = previous || {
        lessonId: lessonId,
        presentationId: key(payload.pres ?? slide.presentationId),
        slideId: slideId,
        startTime: Number(payload.dt) || Date.now(),
        endTime: getProblemEndTime(payload.dt, payload.limit),
        done: hasSubmittedAnswer(problem.result),
        answering: false,
        autoAnswerTime: null,
        phase: "idle",
        finished: isKnownFinished(problemId, lessonId)
      };
      if (previous && source === "live") {
        if (Number(payload.dt) > status.startTime) {
          status.finished = false;
          status.startTime = Number(payload.dt);
        }
        status.endTime = getProblemEndTime(payload.dt, payload.limit);
      }
      ctx.problemStatus.set(problemId, status);
      const fresh = source === "live" && !previous && !status.done && !closed(status);
      let notified = false;
      if (fresh) notified = problemReminder.handle({
        kind: "problem-start",
        dedupeKey: `problem-start:${repo.accountId}:${lessonId}:${problemId}:${status.startTime}`,
        title: "习题已发布",
        detail: problem.body || "老师已开启一道新题",
        problem: problem,
        slide: slide
      }, ui.config);
      if (!notificationOnly && source === "live") schedule(problem, status, lessonId);
      // Timeline recovery is quiet and bounded; it does not replay new-question alerts.
            if (!notificationOnly && source !== "live" && Date.now() - status.startTime < 18e5) schedule(problem, status, lessonId);
      repo.persistWork(lessonId);
      refresh(lessonId);
      return notified;
    },
    onProblemFinished(problemId, options = {}) {
      const lessonId = key(options.lessonId ?? repo.currentLessonId), state = repo.forLesson(lessonId).problemStatus.get(problemId);
      if (state) state.finished = true;
      rememberFinished(problemId, lessonId);
      repo.persistWork(lessonId);
      refresh(lessonId);
    },
    onExtendTime(payload, options = {}) {
      const lessonId = key(options.lessonId ?? repo.currentLessonId), s = repo.forLesson(lessonId).problemStatus.get(payload.prob ?? payload.problemId);
      if (!s) return;
      if (Number(payload.extend) === -1 || Number(payload.limit) === -1) s.endTime = null; else s.endTime = getProblemEndTime(s.startTime ?? payload.dt, payload.limit);
      repo.persistWork(lessonId);
      refresh(lessonId);
    },
    onPublishEvent(event, options = {}) {
      const lessonId = key(options.lessonId ?? event?.lessonId ?? repo.currentLessonId);
      const id = key(event?.contentId ?? event?.presentationId ?? event?.id ?? (event?.category === "courseware" ? event.dedupeKey?.slice("courseware:".length) : ""));
      if (event?.category === "courseware" && lessonId === key(repo.currentLessonId) && id && id === key(repo.currentPresentationId)) return false;
      return publishReminder.handle({
        ...event,
        dedupeKey: `${repo.accountId}:${lessonId}:${event.dedupeKey}`
      }, ui.config);
    },
    onDanmu(data, options = {}) {
      const lessonId = key(options.lessonId ?? repo.currentLessonId);
      if (!lessonId || lessonId !== currentPageLessonId()) return {
        triggered: false,
        reason: "non-current-lesson"
      };
      if (!danmuControllers.has(lessonId)) danmuControllers.set(lessonId, createDanmuFollowController({
        enabled: () => ui.config.autoFollowDanmu && lessonId === currentPageLessonId(),
        getCurrentUserId: getCurrentUserIdSafe,
        send: text => sendDanmuText(text, {
          root: (gm.uw || window).document,
          lessonId: lessonId
        })
      }));
      return danmuControllers.get(lessonId).handle(data, options);
    },
    onLessonFinished(options = {}) {
      const lessonId = key(options.lessonId ?? repo.currentLessonId), ctx = repo.forLesson(lessonId);
      for (const s of ctx.problemStatus.values()) {
        s.finished = true;
        s.autoAnswerTime = null;
      }
      repo.persistWork(lessonId);
      danmuControllers.get(lessonId)?.reset();
      refresh(lessonId);
      return ui.notifyClassroomEvent({
        kind: "lesson-finished",
        dedupeKey: `lesson-finished:${lessonId}`,
        title: "下课提示",
        detail: "课程已结束"
      });
    },
    onAnswerProblem(problemId, result, options = {}) {
      const lessonId = key(options.lessonId ?? repo.currentLessonId), ctx = repo.forLesson(lessonId), p = ctx.problems.get(problemId);
      if (!p || !hasSubmittedAnswer(result)) return;
      p.result = result;
      p.remoteAnswer = result;
      p.updatedAt = Date.now();
      const s = ctx.problemStatus.get(problemId);
      if (s) Object.assign(s, {
        done: true,
        phase: "confirmed",
        autoAnswerTime: null,
        needsReconciliation: false,
        answerRevision: (s.answerRevision || 0) + 1
      });
      repo.persistWork(lessonId);
      refresh(lessonId);
    },
    handleAutoAnswer: handleAutoAnswerInternal,
    tickAutoAnswer() {
      const contexts = new Set([ key(repo.currentLessonId), ...repo.autoJoinedLessons ]);
      for (const lessonId of contexts) {
        const ctx = repo.forLesson(lessonId);
        const tasks = [ ...ctx.problemStatus ].sort((a, b) => (a[1].endTime ?? 1 / 0) - (b[1].endTime ?? 1 / 0));
        for (const [pid, s] of tasks) {
          if (!effectiveAutoAnswer(lessonId)) {
            s.autoAnswerTime = null;
            continue;
          }
          if (s.autoAnswerTime != null && Date.now() >= s.autoAnswerTime) {
            const p = ctx.problems.get(pid);
            s.autoAnswerTime = null;
            if (p) void this.handleAutoAnswer(p, {
              lessonId: lessonId
            });
          }
        }
      }
    },
    parseManual(problemType, content) {
      const p = {
        problemType: Number(problemType)
      };
      let value;
      try {
        value = JSON.parse(content);
      } catch {
        value = Number(problemType) === 5 ? {
          content: content,
          pics: []
        } : Number(problemType) === 4 ? content.split("\n") : content.toUpperCase().split(/[\s,，、]*/).filter(Boolean);
      }
      return validateAnswer(p, value);
    },
    async submit(problem, content, options = {}) {
      const lessonId = options.lessonId ?? problem.lessonId ?? repo.currentLessonId;
      const answer = validateAnswer(problem, this.parseManual(problem.problemType, content));
      const out = await submitAnswer(problem, answer, {
        ...options,
        lessonId: lessonId
      });
      refresh(lessonId);
      return out;
    },
    navigateTo(presId, slideId) {
      repo.currentPresentationId = key(presId);
      repo.currentSlideId = key(slideId);
      ui.updateSlideView();
      ui.showPresentationPanel(true);
      ui.refreshQuickAnswerControl?.();
    },
    launchLessonHelper() {
      if (lastAutoAnswer === null) lastAutoAnswer = ui.config.autoAnswer;
      const next = currentPageLessonId();
      if (key(next) !== key(repo.currentLessonId)) {
        for (const controller of danmuControllers.values()) controller.reset();
        danmuControllers.clear();
      }
      const changed = key(next) !== key(repo.currentLessonId);
      repo.currentLessonId = next;
      if (changed) window.dispatchEvent(new CustomEvent("ykt:lesson-change", {
        detail: {
          lessonId: next
        }
      }));
      repo.loadStoredPresentations();
      const restored = repo.forLesson(next);
      for (const [id, status] of restored.problemStatus) {
        const p = restored.problems.get(id);
        if (p && (p.aiProposal || Date.now() - status.startTime < 18e5)) schedule(p, status, next);
      }
      if (changed && document.body) {
        ui.updatePresentationList();
        ui.updateSlideView();
      }
      this.maybeStartAutoJoin();
      void screenWakeLock.setEnabled(ui.config.keepScreenAwake);
      if (document.body) refresh(next);
    },
    startAutoAnswerLoop: startAutoAnswerLoop,
    startAutoJoinLoop() {
      if (repo.autoJoinRunning) return;
      repo.autoJoinRunning = true;
      const generation = ++joinGeneration;
      const loop = async () => {
        if (!repo.autoJoinRunning || generation !== joinGeneration) return;
        try {
          for (const item of await getOnLesson()) {
            const lessonId = key(item.lessonId ?? item.lesson_id ?? item.id);
            if (!lessonId || Number(item.status) !== 1 || repo.isLessonConnected(lessonId)) continue;
            const {token: token} = await checkinClass(lessonId);
            if (!repo.autoJoinRunning || generation !== joinGeneration) return;
            if (token) {
              repo.markLessonAutoJoined(lessonId);
              connectOrAttachLessonWS({
                lessonId: lessonId,
                auth: token
              });
            }
          }
        } catch (error) {
          diag("auto-join-error", {
            message: error.message
          });
        } finally {
          if (repo.autoJoinRunning && generation === joinGeneration) joinTimer = setTimeout(loop, 5e3);
        }
      };
      void loop();
    },
    stopAutoJoinLoop() {
      repo.autoJoinRunning = false;
      ++joinGeneration;
      clearTimeout(joinTimer);
      clearTimeout(navigationTimer);
      joinTimer = null;
    },
    maybeStartAutoJoin() {
      if (ui.config.autoJoinEnabled) {
        this.startAutoJoinLoop();
        this.startAutoClickOnOnLessonBar();
      } else this.stopAutoJoinLoop();
    },
    installRouterRearm() {},
    startAutoClickOnOnLessonBar() {
      if (currentPageLessonId() || navigationTimer || !ui.config.autoJoinEnabled) return;
      let cancelled = false;
      const cancel = () => {
        cancelled = true;
        clearTimeout(navigationTimer);
        navigationTimer = null;
        for (const name of [ "pointerdown", "keydown", "wheel" ]) window.removeEventListener(name, cancel, true);
      };
      for (const name of [ "pointerdown", "keydown", "wheel" ]) window.addEventListener(name, cancel, {
        capture: true,
        once: true
      });
      navigationTimer = setTimeout(async () => {
        navigationTimer = null;
        try {
          if (cancelled || !ui.config.autoJoinEnabled || currentPageLessonId()) return;
          const items = await getOnLesson();
          const item = items.find(x => Number(x.status) === 1 && (x.lessonId ?? x.lesson_id ?? x.id));
          if (item && !cancelled && ui.config.autoJoinEnabled && !currentPageLessonId()) location.assign(`/lesson/fullscreen/v3/${item.lessonId ?? item.lesson_id ?? item.id}`);
        } finally {
          cancel();
        }
      }, 1e4);
    },
    syncConfig() {
      if (lastAutoAnswer && !ui.config.autoAnswer) ui.config.autoAnswerPaused = true;
      if (ui.config.autoAnswer) ui.config.autoAnswerPaused = false;
      lastAutoAnswer = ui.config.autoAnswer;
      for (const lessonId of new Set([ key(repo.currentLessonId), ...repo.autoJoinedLessons ])) for (const [pid, status] of repo.forLesson(lessonId).problemStatus) if (!effectiveAutoAnswer(lessonId)) {
        status.autoAnswerTime = null;
        if (!status.answering && !status.done) status.phase = "paused";
      } else {
        const p = repo.forLesson(lessonId).problems.get(pid);
        if (p) schedule(p, status, lessonId);
      }
      for (const controller of danmuControllers.values()) controller.reset();
      this.maybeStartAutoJoin();
      void screenWakeLock.setEnabled(ui.config.keepScreenAwake);
    }
  };
  if (typeof window !== "undefined") window.addEventListener("ykt:config-changed", () => actions.syncConfig());
  // src/core/realtime-dispatch.js
  /**
   * Converts a raw realtime frame into an action call without coupling the
   * protocol parser to the action layer.  The current userscript runs only the
   * desktop runtime, while this option remains available for protocol tests.
   */  function dispatchRealtimeMessage(message, {getRuntimeMode: getRuntimeMode = () => "desktop", lessonId: lessonId = null, handlers: handlers = {}} = {}) {
    const realtime = getRealtimeEvent(message);
    const notificationOnly = getRuntimeMode() === "mobile-reminder";
    const options = {
      notificationOnly: notificationOnly
    };
    if (lessonId !== void 0 && lessonId !== null && String(lessonId) !== "") options.lessonId = String(lessonId);
    let handled = true;
    switch (realtime?.kind) {
     case "timeline":
      handlers.onFetchTimeline?.(realtime.timeline, options);
      break;

     case "unlockproblem":
      handlers.onUnlockProblem?.(realtime.problem, options);
      break;

     case "danmu":
      handlers.onDanmu?.(realtime.message, options);
      break;

     case "publish":
      handlers.onPublishEvent?.(realtime.event, options);
      break;

     case "lessonfinished":
      handlers.onLessonFinished?.(options);
      break;

     case "problemfinished":
      handlers.onProblemFinished?.(realtime.problemId, options);
      break;

     case "extendtime":
      handlers.onExtendTime?.(realtime.problem, options);
      break;

     default:
      handled = false;
    }
    return {
      realtime: realtime,
      notificationOnly: notificationOnly,
      handled: handled
    };
  }
  // src/net/ws-interceptor.js
    function lessonIdFromPath(pathname = "") {
    const match = String(pathname).match(/\/lesson\/fullscreen\/v3\/([^/]+)/);
    return match ? match[1] : null;
  }
  function getSocketLessonId(ws) {
    if (ws?.__yktLessonId) return String(ws.__yktLessonId);
    return lessonIdFromPath((gm.uw || window)?.location?.pathname || location.pathname);
  }
  function installWSInterceptor({getRuntimeMode: getRuntimeMode = () => "desktop"} = {}) {
    // 环境识别（标准/荷塘/长江/未知），主要用于日志和后续按需适配
    function detectEnvironmentAndAdaptAPI() {
      const hostname = location.hostname;
      let envType = "unknown";
      if (hostname === "www.yuketang.cn") {
        envType = "standard";
        console.log("[雨课堂助手][INFO] 检测到标准雨课堂环境");
      } else if (hostname === "pro.yuketang.cn") {
        envType = "pro";
        console.log("[雨课堂助手][INFO] 检测到荷塘雨课堂环境");
      } else if (hostname === "changjiang.yuketang.cn") {
        envType = "changjiang";
        console.log("[雨课堂助手][INFO] 检测到长江雨课堂环境");
      } else console.log("[雨课堂助手][INFO] 未知环境:", hostname);
      return envType;
    }
    if ((gm.uw || window).WebSocket?.__yktInstalled) return;
    const NativeSocket = (gm.uw || window).WebSocket;
    class MyWebSocket extends NativeSocket {
      static handlers=[];
      static addHandler(h) {
        this.handlers.push(h);
      }
      constructor(url, protocols) {
        if (protocols === void 0) super(url); else super(url, protocols);
        this.__yktLessonId = lessonIdFromPath(location.pathname);
        this.__yktAccountId = repo.accountId;
        const parsed = new URL(url, location.href);
        for (const h of this.constructor.handlers) h(this, parsed);
      }
      intercept(cb) {
        const raw = this.send;
        this.send = data => {
          const result = raw.call(this, data);
          try {
            cb(JSON.parse(data));
          } catch {}
          return result;
        };
      }
      listen(cb) {
        this.addEventListener("message", e => {
          try {
            cb(JSON.parse(e.data));
          } catch {}
        });
      }
    }
    MyWebSocket.addHandler((ws, url) => {
      const envType = detectEnvironmentAndAdaptAPI();
      console.log("[雨课堂助手][INFO] 拦截WebSocket通信 - 环境:", envType);
      console.log("[雨课堂助手][INFO] WebSocket连接尝试:", url.href);
      // 更宽松的路径匹配
            const wsPath = url.pathname || "";
      const isRainClassroomWS = wsPath === "/wsapp/" || wsPath.includes("/ws") || wsPath.includes("/websocket") || url.href.includes("websocket");
      if (!isRainClassroomWS) {
        console.log("[雨课堂助手][ERR] 非雨课堂WebSocket:", wsPath);
        return;
      }
      console.log("[雨课堂助手][INFO] 检测到雨课堂WebSocket连接:", wsPath);
      // 发送侧拦截（可用于调试）
            ws.intercept(message => {
        if (message.op === "hello" && message.lessonid) {
          ws.__yktLessonId = String(message.lessonid);
          repo.markLessonConnected(ws.__yktLessonId, ws);
        }
        window.dispatchEvent(new CustomEvent("ykt:danmu-outbound", {
          detail: {
            lessonId: getSocketLessonId(ws),
            message: message
          }
        }));
      });
      // 接收侧统一分发
            ws.listen(message => {
        if (ws.__yktAccountId !== repo.accountId) return;
        try {
          console.log("[雨课堂助手][INFO] WebSocket接收:", message);
          if (message?.op && message.op !== "xintiao" && message.op !== "newdanmu") diag("ws", {
            op: message.op,
            problem: message.problem,
            prob: message.prob,
            presentation: message.presentation,
            timeline: Array.isArray(message.timeline) ? message.timeline.length : void 0
          });
          const dispatched = dispatchRealtimeMessage(message, {
            getRuntimeMode: getRuntimeMode,
            lessonId: getSocketLessonId(ws),
            handlers: {
              onFetchTimeline(timeline, options) {
                console.log("[雨课堂助手][INFO] 收到时间线:", message.timeline);
                actions.onFetchTimeline(timeline, options);
              },
              onUnlockProblem(problem, options) {
                console.log("[雨课堂助手][INFO] 收到解锁问题:", message.problem);
                actions.onUnlockProblem(problem, options);
              },
              onDanmu(danmu, options) {
                console.log("[雨课堂助手][INFO] 收到弹幕:", danmu?.danmu);
                actions.onDanmu(danmu, options);
              },
              onPublishEvent(event, options) {
                console.log("[雨课堂助手][INFO] 收到课堂发布:", event);
                actions.onPublishEvent(event, options);
              },
              onLessonFinished(options) {
                console.log("[雨课堂助手][INFO] 课程结束");
                actions.onLessonFinished(options);
              },
              onProblemFinished(problemId, options) {
                console.log("[雨课堂助手][INFO] 老师结束题目:", problemId);
                actions.onProblemFinished(problemId, options);
              },
              onExtendTime(problem, options) {
                console.log("[雨课堂助手][INFO] 题目延时:", problem);
                actions.onExtendTime(problem, options);
              }
            }
          });
          if (!dispatched.handled) console.log("[雨课堂助手][WARN] 未知WebSocket操作:", message.op, message);
          // 监听后端传递的url
                    const url = function findUrl(obj) {
            if (!obj || typeof obj !== "object") return null;
            if (typeof obj.url === "string") return obj.url;
            if (Array.isArray(obj)) for (const it of obj) {
              const u = findUrl(it);
              if (u) return u;
            } else for (const k in obj) {
              const v = obj[k];
              if (v && typeof v === "object") {
                const u = findUrl(v);
                if (u) return u;
              }
            }
            return null;
          }(message);
          if (url) {
            window.dispatchEvent(new CustomEvent("ykt:url-change", {
              detail: {
                url: url,
                raw: message
              }
            }));
            // 如需持久化到 repo，请取消下一行注释（确保已在 repo 定义该字段）
                        if (String(getSocketLessonId(ws)) === String(repo.currentLessonId)) repo.currentSelectedUrl = url;
            console.debug("[雨课堂助手][INFO] 当前选择 URL:", url);
          }
        } catch (e) {
          console.debug("[雨课堂助手][ERR] 解析WebSocket消息失败", e, message);
        }
      });
    });
    MyWebSocket.__yktInstalled = true;
    (gm.uw || window).WebSocket = MyWebSocket;
    window.WebSocket = MyWebSocket;
  }
  // ===== 主动为某个课堂建立/复用 WebSocket 连接 =====
    function connectOrAttachLessonWS({lessonId: lessonId, auth: auth}) {
    if (!lessonId || !auth) {
      console.warn("[雨课堂助手][WARN] 缺少 lessonId 或 auth，放弃建链");
      return null;
    }
    if (repo.isLessonConnected(lessonId)) return repo.lessonSockets.get(lessonId);
    // 根据当前域名选择 ws 地址
        const host = "wss://" + location.hostname + "/wsapp/";
    const ws = new (gm.uw || window).WebSocket(host);
    ws.__yktLessonId = String(lessonId);
    ws.addEventListener("open", () => {
      try {
        const hello = {
          op: "hello",
          // userid 可选：尽力获取，获取不到也不阻断流程
          userid: getUserIdSafe(),
          role: "student",
          auth: auth,
          // 关键：lessonToken
          lessonid: lessonId
        };
        ws.send(JSON.stringify(hello));
        console.log("[雨课堂助手][INFO][AutoJoin] 已发送课堂握手:", lessonId);
      } catch (e) {
        console.error("[雨课堂助手][INFO][AutoJoin] 发送 hello 失败:", e);
      }
    });
    ws.addEventListener("close", () => {
      if (repo.lessonSockets.get(lessonId) === ws) {
        repo.lessonSockets.delete(lessonId);
        repo.listeningLessons.delete(String(lessonId));
      }
      console.log("[雨课堂助手][WARN][AutoJoin] 课堂 WS 关闭:", lessonId);
    });
    ws.addEventListener("error", e => {
      console.error("[雨课堂助手][ERR][AutoJoin] 课堂 WS 错误:", lessonId, e);
    });
    repo.markLessonConnected(lessonId, ws, auth);
    return ws;
  }
  function getUserIdSafe() {
    try {
      // 常见挂载点（不同环境可能不同）
      if (window?.YktUser?.id) return window.YktUser.id;
      if (window?.__INITIAL_STATE__?.user?.userId) return window.__INITIAL_STATE__.user.userId;
      const m = document.cookie.match(/(?:^|;\s*)user_id=(\d+)/);
      if (m) return Number(m[1]);
    } catch {}
    return;
  }
  function installFetchInterceptor() {
    for (const surface of new Set([ window, gm.uw ])) {
      if (!surface?.fetch || surface.fetch.__yktInstalled) continue;
      const native = surface.fetch;
      const patched = async function(input, init) {
        const url = String(input?.url || input?.href || input);
        const lessonId = requestLessonId(url, repo.currentLessonId);
        const accountId = repo.accountId;
        let bodyPromise;
        try {
          bodyPromise = Promise.resolve(init?.body ?? (typeof input?.clone === "function" ? input.clone().text() : null));
        } catch {
          bodyPromise = Promise.resolve(null);
        }
        const response = await native.call(this, input, init);
        if (response.ok !== false && /lesson|presentation|slides|problem/.test(url)) void Promise.all([ response.clone().json(), bodyPromise ]).then(([json, body]) => observeResponse(url, json, body, {
          lessonId: lessonId,
          accountId: accountId
        })).catch(() => {});
        return response;
      };
      patched.__yktInstalled = true;
      surface.fetch = patched;
    }
  }
  var css = '/* ===== 通用 & 修复 ===== */\n#watermark_layer { display: none !important; visibility: hidden !important; }\n.hidden { display: none !important; }\n\n:root{\n  --ykt-z: 10000000;\n  --ykt-border: #ddd;\n  --ykt-border-strong: #ccc;\n  --ykt-bg: #fff;\n  --ykt-fg: #222;\n  --ykt-muted: #607190;\n  --ykt-accent: #1d63df;\n  --ykt-hover: #1e3050;\n  --ykt-shadow: 0 10px 30px rgba(0,0,0,.18);\n}\n\n/* ===== 工具栏 ===== */\n.ykt-force-answer-button{\n  padding: 7px 12px; border: 1px solid var(--ykt-accent); border-radius: 6px;\n  background: #fff; color: var(--ykt-accent); cursor: pointer;\n}\n#ykt-page-answer-control{ position: fixed; right: 16px; top: 42%; z-index: calc(var(--ykt-z) + 1); }\n#ykt-quick-answer-panel{ width: 380px; max-width: calc(100vw - 24px); right: 12px; }\n#ykt-quick-answer-panel .ykt-quick-question{ max-height: 100px; overflow: auto; white-space: pre-wrap; }\n#ykt-quick-answer-panel .ykt-quick-fields{ display: grid; gap: 10px; }\n#ykt-quick-answer-panel label{ display: grid; gap: 4px; }\n#ykt-quick-answer-panel textarea{ box-sizing: border-box; width: 100%; min-height: 44px; padding: 8px; border: 1px solid var(--ykt-border-strong); border-radius: 5px; resize: vertical; font: inherit; }\n#ykt-quick-answer-panel .ykt-quick-hint{ color: var(--ykt-muted); font-size: 12px; }\n#ykt-quick-answer-panel .ykt-quick-status{ white-space: pre-wrap; }\n#ykt-quick-answer-panel .ykt-quick-actions{ display: flex; justify-content: flex-end; gap: 8px; }\n#ykt-quick-answer-panel button{ padding: 7px 12px; cursor: pointer; }\n#ykt-quick-answer-panel .ykt-quick-submit{ background: var(--ykt-accent); color: #fff; border: 1px solid var(--ykt-accent); border-radius: 5px; }\n#ykt-quick-answer-panel button:disabled{ opacity: .6; cursor: wait; }\n#ykt-helper-toolbar{\n  position: fixed; z-index: calc(var(--ykt-z) + 1);\n  left: 15px; bottom: 15px;\n  /* 移除固定宽度，让内容自适应 */\n  height: 36px; padding: 5px;\n  display: flex; gap: 6px; align-items: center;\n  background: var(--ykt-bg);\n  border: 1px solid var(--ykt-border-strong);\n  border-radius: 4px;\n  box-shadow: 0 1px 4px 3px rgba(0,0,0,.1);\n}\n\n#ykt-helper-toolbar .btn{\n  display: inline-block; padding: 4px; cursor: pointer;\n  color: var(--ykt-muted); line-height: 1;\n}\n#ykt-helper-toolbar .btn:hover{ color: var(--ykt-hover); }\n#ykt-helper-toolbar .btn.active{ color: var(--ykt-accent); }\n\n/* ===== 面板通用样式 ===== */\n.ykt-panel{\n  position: fixed; right: 20px; bottom: 60px;\n  width: 560px; max-height: 72vh; overflow: auto;\n  background: var(--ykt-bg); color: var(--ykt-fg);\n  border: 1px solid var(--ykt-border-strong); border-radius: 8px;\n  box-shadow: var(--ykt-shadow);\n  display: none; \n  /* 提高z-index，确保后打开的面板在最上层 */\n  z-index: var(--ykt-z);\n}\n.ykt-panel.visible{ \n  display: block; \n  /* 动态提升z-index */\n  z-index: calc(var(--ykt-z) + 10);\n}\n\n.panel-header{\n  display: flex; align-items: center; justify-content: space-between;\n  gap: 12px; padding: 10px 12px; border-bottom: 1px solid var(--ykt-border);\n}\n.panel-header h3{ margin: 0; font-size: 16px; font-weight: 600; }\n.panel-body{ padding: 10px 12px; }\n.close-btn{ cursor: pointer; color: var(--ykt-muted); }\n.close-btn:hover{ color: var(--ykt-hover); }\n\n/* ===== 设置面板 (#ykt-settings-panel) ===== */\n#ykt-settings-panel .settings-content{ display: flex; flex-direction: column; gap: 14px; }\n#ykt-settings-panel .setting-group{ border: 1px dashed var(--ykt-border); border-radius: 6px; padding: 10px; }\n#ykt-settings-panel .setting-group h4{ margin: 0 0 8px 0; font-size: 14px; }\n#ykt-settings-panel .setting-item{ display: flex; align-items: center; gap: 8px; margin: 8px 0; flex-wrap: wrap; }\n#ykt-settings-panel label{ font-size: 13px; }\n#ykt-settings-panel input[type="text"],\n#ykt-settings-panel input[type="number"]{\n  height: 30px; border: 1px solid var(--ykt-border-strong);\n  border-radius: 4px; padding: 0 8px; min-width: 220px;\n}\n#ykt-settings-panel small{ color: #666; }\n#ykt-settings-panel .setting-actions{ display: flex; gap: 8px; margin-top: 6px; }\n#ykt-settings-panel button{\n  height: 30px; padding: 0 12px; border-radius: 6px;\n  border: 1px solid var(--ykt-border-strong); background: #f7f8fa; cursor: pointer;\n}\n#ykt-settings-panel button:hover{ background: #eef3ff; border-color: var(--ykt-accent); }\n\n/* 自定义复选框（与手写脚本一致的视觉语义） */\n#ykt-settings-panel .checkbox-label{ position: relative; padding-left: 26px; cursor: pointer; user-select: none; }\n#ykt-settings-panel .checkbox-label input{ position: absolute; opacity: 0; cursor: pointer; height: 0; width: 0; }\n#ykt-settings-panel .checkbox-label .checkmark{\n  position: absolute; left: 0; top: 50%; transform: translateY(-50%);\n  height: 16px; width: 16px; border:1px solid var(--ykt-border-strong); border-radius: 3px; background: #fff;\n}\n#ykt-settings-panel .checkbox-label input:checked ~ .checkmark{\n  background: var(--ykt-accent); border-color: var(--ykt-accent);\n}\n#ykt-settings-panel .checkbox-label .checkmark:after{\n  content: ""; position: absolute; display: none;\n  left: 5px; top: 1px; width: 4px; height: 8px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg);\n}\n#ykt-settings-panel .checkbox-label input:checked ~ .checkmark:after{ display: block; }\n\n/* ===== AI 解答面板 (#ykt-ai-answer-panel) ===== */\n#ykt-ai-answer-panel .ai-question{\n  white-space: pre-wrap; background: #fafafa; border: 1px solid var(--ykt-border);\n  padding: 8px; border-radius: 6px; margin-bottom: 8px; max-height: 160px; overflow: auto;\n}\n#ykt-ai-answer-panel .ai-loading{ color: var(--ykt-accent); margin-bottom: 6px; }\n#ykt-ai-answer-panel .ai-error{ color: #b00020; margin-bottom: 6px; }\n#ykt-ai-answer-panel .ai-answer{ white-space: pre-wrap; margin-top: 4px; }\n#ykt-ai-answer-panel .ai-actions{ margin-top: 10px; }\n#ykt-ai-answer-panel .ai-actions button{\n  height: 30px; padding: 0 12px; border-radius: 6px;\n  border: 1px solid var(--ykt-border-strong); background: #f7f8fa; cursor: pointer;\n}\n#ykt-ai-answer-panel .ai-actions button:hover{ background: #eef3ff; border-color: var(--ykt-accent); }\n\n/* ===== 课件浏览面板 (#ykt-presentation-panel) ===== */\n#ykt-presentation-panel{ width: 900px; }\n#ykt-presentation-panel .panel-controls{ display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }\n#ykt-presentation-panel .panel-body{\n  display: grid; grid-template-columns: 300px 1fr; gap: 10px;\n}\n#ykt-presentation-panel .panel-left,\n#ykt-presentation-panel .panel-right{\n  display: flex;\n  flex-direction: column;\n}\n#ykt-presentation-panel .presentation-list{\n  border: 1px solid var(--ykt-border);\n  border-radius: 8px;\n  background: #fff;\n  padding: 10px;\n  box-sizing: border-box;\n}\n#ykt-presentation-panel .presentation-title{\n  font-weight: 600; padding: 6px 0; border-bottom: 1px solid var(--ykt-border);\n}\n#ykt-presentation-panel .slide-thumb-list{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }\n#ykt-presentation-panel .slide-thumb{\n  position: relative; border: 1px solid var(--ykt-border); border-radius: 6px; background: #fafafa;\n  min-height: 60px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 4px; text-align: center;\n}\n#ykt-presentation-panel .slide-thumb:hover{ border-color: var(--ykt-accent); background: #eef3ff; }\n#ykt-presentation-panel .slide-thumb img{ max-width: 100%; max-height: 120px; object-fit: contain; display: block; }\n.ykt-presentation-panel .slide-index {\n  position: absolute; top: 4px; left: 4px; z-index: 2;               \n  padding: 2px 6px; border-radius: 4px; font-size: 12px; line-height: 1;\n  background: rgba(0, 0, 0, 0.6); color: #fff; pointer-events: none;\n}\n#ykt-presentation-panel .slide-view{\n  position: relative; border: 1px solid var(--ykt-border); border-radius: 8px; min-height: 360px; background: #fff; overflow: hidden;\n}\n#ykt-presentation-panel .slide-cover{ display: flex; align-items: center; justify-content: center; min-height: 360px; }\n#ykt-presentation-panel .slide-cover img{ max-width: 100%; max-height: 100%; object-fit: contain; display: block; }\n#ykt-presentation-panel .ocr-panel{\n  margin-top: 12px;\n  border: 1px solid var(--ykt-border);\n  border-radius: 8px;\n  background: #fff;\n  padding: 12px;\n}\n#ykt-presentation-panel .ocr-head{\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  margin-bottom: 8px;\n  font-weight: 600;\n}\n#ykt-presentation-panel .ocr-status{\n  font-size: 12px;\n  color: var(--ykt-muted);\n}\n#ykt-presentation-panel .ocr-status.is-loading{ color: #a16207; }\n#ykt-presentation-panel .ocr-status.is-error{ color: #b42318; }\n#ykt-presentation-panel .ocr-status.is-success{ color: #027a48; }\n#ykt-presentation-panel .ocr-tip{\n  margin-bottom: 8px;\n  font-size: 12px;\n  color: var(--ykt-muted);\n}\n#ykt-presentation-panel .ocr-translate-bar{\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex-wrap: wrap;\n  margin: 12px 0 8px;\n}\n#ykt-presentation-panel .ocr-translate-bar .ocr-status{\n  margin-left: auto;\n}\n#ykt-presentation-panel .ocr-target-input{\n  min-width: 220px;\n  height: 32px;\n  border: 1px solid var(--ykt-border-strong);\n  border-radius: 6px;\n  padding: 0 10px;\n  box-sizing: border-box;\n}\n#ykt-presentation-panel .ocr-subhead{\n  margin-top: 4px;\n}\n#ykt-presentation-panel .ocr-result{\n  width: 100%;\n  min-height: 180px;\n  resize: vertical;\n  border: 1px solid var(--ykt-border-strong);\n  border-radius: 6px;\n  padding: 10px;\n  line-height: 1.5;\n  font-size: 13px;\n  box-sizing: border-box;\n  background: #fafafa;\n}\n\n#ykt-presentation-panel .problem-box{\n  position: absolute; left: 12px; right: 12px; bottom: 12px;\n  background: rgba(255,255,255,.96); border: 1px solid var(--ykt-border);\n  border-radius: 8px; padding: 10px; box-shadow: 0 6px 18px rgba(0,0,0,.12);\n}\n#ykt-presentation-panel .problem-head{ font-weight: 600; margin-bottom: 6px; padding-right: 28px; }\n#ykt-presentation-panel .problem-box-close{\n  position: absolute; top: 6px; right: 6px;\n  width: 22px; height: 22px; border-radius: 999px;\n  border: 1px solid var(--ykt-border-strong);\n  background: #fff; color: #555;\n  cursor: pointer; font-size: 16px; line-height: 18px;\n  padding: 0;\n}\n#ykt-presentation-panel .problem-box-close:hover{ color: #111; border-color: var(--ykt-accent); }\n#ykt-presentation-panel .problem-options{ display: grid; grid-template-columns: 1fr; gap: 4px; }\n#ykt-presentation-panel .problem-option{ padding: 6px 8px; border: 1px solid var(--ykt-border); border-radius: 6px; background: #fafafa; }\n\n/* ===== 题目列表面板 (#ykt-problem-list-panel) ===== */\n#ykt-problem-list{ display: flex; flex-direction: column; gap: 10px; }\n#ykt-problem-list .problem-row{\n  border: 1px solid var(--ykt-border); border-radius: 8px; padding: 8px; background: #fafafa;\n}\n#ykt-problem-list .problem-title{ font-weight: 600; margin-bottom: 4px; }\n#ykt-problem-list .problem-meta{ color: #666; font-size: 12px; margin-bottom: 6px; }\n#ykt-problem-list .problem-actions{ display: flex; gap: 8px; align-items: center; }\n#ykt-problem-list .problem-actions button{\n  height: 28px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--ykt-border-strong); background: #f7f8fa; cursor: pointer;\n}\n#ykt-problem-list .problem-actions button:hover{ background: #eef3ff; border-color: var(--ykt-accent); }\n#ykt-problem-list .problem-done{ color: #0a7a2f; font-weight: 600; }\n\n/* ===== 活动题目列表（右下角小卡片） ===== */\n#ykt-active-problems-panel.ykt-active-wrapper{\n  position: fixed; right: 20px; bottom: 60px; z-index: var(--ykt-z);\n}\n#ykt-active-problems{ display: flex; flex-direction: column; gap: 8px; max-height: 60vh; overflow: auto; }\n#ykt-active-problems .active-problem-card{\n  position: relative;\n  width: 320px; background: #fff; border: 1px solid var(--ykt-border);\n  border-radius: 8px; box-shadow: var(--ykt-shadow); padding: 10px;\n}\n#ykt-active-problems .ap-close{\n  position: absolute; top: 6px; right: 6px;\n  width: 20px; height: 20px; border-radius: 999px;\n  border: 1px solid var(--ykt-border-strong);\n  background: #fff; color: #555;\n  cursor: pointer; padding: 0; font-size: 14px; line-height: 16px;\n}\n#ykt-active-problems .ap-close:hover{ color: #111; border-color: var(--ykt-accent); }\n#ykt-active-problems .ap-title{ font-weight: 600; margin-bottom: 4px; }\n#ykt-active-problems .ap-info{ color: #666; font-size: 12px; margin-bottom: 8px; }\n#ykt-active-problems .ap-actions{ display: flex; gap: 8px; }\n#ykt-active-problems .ap-actions button{\n  height: 28px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--ykt-border-strong); background: #f7f8fa; cursor: pointer;\n}\n#ykt-active-problems .ap-actions button:hover{ background: #eef3ff; border-color: var(--ykt-accent); }\n\n/* ===== 教程面板 (#ykt-tutorial-panel) ===== */\n#ykt-tutorial-panel .tutorial-content h4{ margin: 8px 0 6px; }\n#ykt-tutorial-panel .tutorial-content p,\n#ykt-tutorial-panel .tutorial-content li{ line-height: 1.5; }\n#ykt-tutorial-panel .tutorial-content a{ color: var(--ykt-accent); text-decoration: none; }\n#ykt-tutorial-panel .tutorial-content a:hover{ text-decoration: underline; }\n\n/* ===== 小屏适配 ===== */\n@media (max-width: 1200px){\n  #ykt-presentation-panel{ width: 760px; }\n  #ykt-presentation-panel .panel-body{ grid-template-columns: 260px 1fr; }\n}\n@media (max-width: 900px){\n  .ykt-panel{ right: 12px; left: 12px; width: auto; }\n  #ykt-presentation-panel{ width: auto; }\n  #ykt-presentation-panel .panel-body{ grid-template-columns: 1fr; }\n}\n\n/* ===== 自动作答成功弹窗 ===== */\n.auto-answer-popup{\n  position: fixed; inset: 0; z-index: calc(var(--ykt-z) + 2);\n  background: rgba(0,0,0,.2);\n  display: flex; align-items: flex-end; justify-content: flex-end;\n  opacity: 0; transition: opacity .18s ease;\n}\n.auto-answer-popup.visible{ opacity: 1; }\n\n.auto-answer-popup .popup-content{\n  width: min(560px, 96vw);\n  background: #fff; border: 1px solid var(--ykt-border-strong);\n  border-radius: 10px; box-shadow: var(--ykt-shadow);\n  margin: 16px; overflow: hidden;\n}\n\n.auto-answer-popup .popup-header{\n  display: flex; align-items: center; justify-content: space-between;\n  gap: 12px; padding: 10px 12px; border-bottom: 1px solid var(--ykt-border);\n}\n.auto-answer-popup .popup-header h4{ margin: 0; font-size: 16px; }\n.auto-answer-popup .close-btn{ cursor: pointer; color: var(--ykt-muted); }\n.auto-answer-popup .close-btn:hover{ color: var(--ykt-hover); }\n\n.auto-answer-popup .popup-body{ padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }\n.auto-answer-popup .popup-row{ display: grid; grid-template-columns: 56px 1fr; gap: 8px; align-items: start; }\n.auto-answer-popup .label{ color: #666; font-size: 12px; line-height: 1.8; }\n.auto-answer-popup .content{ white-space: normal; word-break: break-word; }\n\n/* ===== 1.16.6: 课件浏览面板：固定右侧详细视图，左侧独立滚动 ===== */\n#ykt-presentation-panel {\n  --ykt-panel-max-h: 72vh;           /* 与 .ykt-panel 的最大高度保持一致 */\n}\n\n/* 两列布局：左列表 + 右详细视图 */\n#ykt-presentation-panel .panel-body{\n  display: grid;\n  grid-template-columns: 300px 1fr;  \n  gap: 12px;\n  overflow: hidden;                  \n  align-items: start;\n}\n\n/* 左侧：只让左列滚动，限制在面板可视高度内 */\n#ykt-presentation-panel .panel-left{\n  max-height: var(--ykt-panel-max-h);\n  overflow: auto;\n  min-width: 0;\n  align-self: stretch;\n}\n\n/* 右侧：粘性定位为“固定”，始终在面板可视区内 */\n#ykt-presentation-panel .panel-right{\n  position: sticky;\n  top: 0;                            \n  align-self: start;\n  gap: 12px;\n}\n\n/* 右侧详细视图自身也限制高度并允许内部滚动 */\n#ykt-presentation-panel .slide-view{\n  max-height: var(--ykt-panel-max-h);\n  overflow: auto;\n  border: 1px solid var(--ykt-border);\n  border-radius: 8px;\n  background: #fff;\n}\n\n/* 小屏自适配：堆叠布局时取消 sticky，避免遮挡 */\n@media (max-width: 900px){\n  #ykt-presentation-panel .panel-body{\n    grid-template-columns: 1fr;\n  }\n  #ykt-presentation-panel .panel-right{\n    position: static;\n  }\n}\n\n/* 在现有样式基础上添加 */\n\n.text-status {\n  font-size: 12px;\n  padding: 4px 8px;\n  border-radius: 4px;\n  margin: 4px 0;\n  display: inline-block;\n}\n\n.text-status.success {\n  background-color: #d4edda;\n  color: #155724;\n  border: 1px solid #c3e6cb;\n}\n\n.text-status.warning {\n  background-color: #fff3cd;\n  color: #856404;\n  border: 1px solid #ffeaa7;\n}\n\n.ykt-question-display {\n  background: #f8f9fa;\n  border: 1px solid #dee2e6;\n  border-radius: 4px;\n  padding: 8px;\n  margin: 4px 0;\n  max-height: 150px;\n  overflow-y: auto;\n  font-family: monospace;\n  font-size: 13px;\n  line-height: 1.4;\n}\n\n/* 在现有样式基础上添加 */\n\n.ykt-custom-prompt {\n  width: 100%;\n  min-height: 60px;\n  padding: 8px;\n  border: 1px solid #ddd;\n  border-radius: 4px;\n  font-family: inherit;\n  font-size: 13px;\n  line-height: 1.4;\n  resize: vertical;\n  background-color: #fff;\n  transition: border-color 0.3s ease;\n}\n\n.ykt-custom-prompt:focus {\n  outline: none;\n  border-color: #007bff;\n  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);\n}\n\n.ykt-custom-prompt::placeholder {\n  color: #999;\n  font-style: italic;\n}\n\n.ykt-custom-prompt:empty::before {\n  content: attr(placeholder);\n  color: #999;\n  font-style: italic;\n  pointer-events: none;\n}\n\n/* 确保输入框在暗色主题下也能正常显示 */\n.ykt-panel.dark .ykt-custom-prompt {\n  background-color: #2d3748;\n  border-color: #4a5568;\n  color: #e2e8f0;\n}\n\n.ykt-panel.dark .ykt-custom-prompt::placeholder {\n  color: #a0aec0;\n}\n\n.ykt-panel.dark .ykt-custom-prompt:focus {\n  border-color: #63b3ed;\n  box-shadow: 0 0 0 2px rgba(99, 179, 237, 0.25);\n}\n\n/* ===== Markdown-like 样式 ===== */\n.ai-answer {\n  white-space: normal;\n  line-height: 1.6;\n  font-size: 14px;\n  color: inherit;\n}\n\n/* 段落和标题间距 */\n.ai-answer p { margin: 8px 0; }\n.ai-answer h1, .ai-answer h2, .ai-answer h3,\n.ai-answer h4, .ai-answer h5, .ai-answer h6 {\n  margin: 12px 0 6px;\n  line-height: 1.35;\n  font-weight: 600;\n}\n.ai-answer h1 { font-size: 20px; }\n.ai-answer h2 { font-size: 18px; }\n.ai-answer h3 { font-size: 16px; }\n.ai-answer h4 { font-size: 15px; }\n.ai-answer h5, .ai-answer h6 { font-size: 14px; }\n\n/* 链接 */\n.ai-answer a {\n  text-decoration: underline;\n  cursor: pointer;\n}\n\n/* 引用块 */\n.ai-answer blockquote {\n  margin: 8px 0;\n  padding: 6px 10px;\n  border-left: 3px solid rgba(0,0,0,0.2);\n  background: rgba(0,0,0,0.03);\n}\n\n/* 水平线 */\n.ai-answer hr {\n  border: 0;\n  border-top: 1px solid rgba(0,0,0,0.15);\n  margin: 10px 0;\n}\n\n/* 代码块与行内代码 */\n.ai-answer pre.ykt-md-code {\n  margin: 8px 0;\n  padding: 10px;\n  overflow: auto;\n  border: 1px solid rgba(0,0,0,0.15);\n  border-radius: 6px;\n  background: #f7f8fa;\n}\n.ai-answer pre.ykt-md-code code {\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;\n  font-size: 12px;\n}\n.ai-answer code.ykt-md-inline {\n  padding: 1px 4px;\n  border: 1px solid rgba(0,0,0,0.15);\n  border-radius: 4px;\n  background: #f7f8fa;\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;\n  font-size: 12px;\n}\n\n/* 列表 */\n.ai-answer ul, .ai-answer ol {\n  margin: 6px 0 6px 22px;   \n}\n.ai-answer ul { list-style: disc; }\n.ai-answer ol { list-style: decimal; }\n\n/* 表格 */\n.ai-answer table {\n  border-collapse: collapse;\n  margin: 8px 0;\n  width: 100%;\n  max-width: 100%;\n}\n.ai-answer th, .ai-answer td {\n  border: 1px solid rgba(0,0,0,0.15);\n  padding: 6px 8px;\n  text-align: left;\n}\n.ai-answer thead th {\n  background: rgba(0,0,0,0.05);\n  font-weight: 600;\n}\n\n/* 适配深色 */\n@media (prefers-color-scheme: dark) {\n  .ai-answer blockquote {\n    border-left-color: rgba(255,255,255,0.35);\n    background: rgba(255,255,255,0.06);\n  }\n  .ai-answer pre.ykt-md-code,\n  .ai-answer code.ykt-md-inline {\n    background: #111418;\n    border-color: rgba(255,255,255,0.2);\n  }\n  .ai-answer hr { border-top-color: rgba(255,255,255,0.2); }\n  .ai-answer th, .ai-answer td { border-color: rgba(255,255,255,0.2); }\n  .ai-answer thead th { background: rgba(255,255,255,0.08); }\n}\n\n#ykt-ai-answer.tex-enabled svg { vertical-align: middle; }\n#ykt-ai-answer.tex-enabled .MathJax { line-height: 1; }\n#ykt-ai-answer .mjx-svg { color: currentColor; }\n\n';
  // src/ui/styles.js
    function injectStyles() {
    gm.addStyle(css);
  }
  // src/ui/toolbar.js
    function installToolbar() {
    // 仅创建容器与按钮；具体面板之后用 HTML/Vue 接入
    const bar = document.createElement("div");
    bar.id = "ykt-helper-toolbar";
    bar.innerHTML = `\n    <span id="ykt-btn-bell" class="btn" title="习题提醒"><i class="fas fa-bell"></i></span>\n    <span id="ykt-btn-pres" class="btn" title="课件浏览"><i class="fas fa-file-powerpoint"></i></span>\n    <span id="ykt-btn-ai" class="btn" title="AI解答"><i class="fas fa-robot"></i></span>\n    <span id="ykt-btn-auto-answer" class="btn" title="自动作答"><i class="fas fa-magic-wand-sparkles"></i></span>\n    <span id="ykt-btn-settings" class="btn" title="设置"><i class="fas fa-cog"></i></span>\n    <span id="ykt-btn-help" class="btn" title="使用教程"><i class="fas fa-question-circle"></i></span>\n  `;
    document.body.appendChild(bar);
    // 初始激活态
        if (ui.config.notifyProblems) bar.querySelector("#ykt-btn-bell")?.classList.add("active");
    ui.updateAutoAnswerBtn();
    // 事件绑定
        bar.querySelector("#ykt-btn-bell")?.addEventListener("click", () => {
      ui.config.notifyProblems = !ui.config.notifyProblems;
      if (!ui.saveConfig()) return;
      ui.toast(`习题提醒：${ui.config.notifyProblems ? "开" : "关"}`);
      bar.querySelector("#ykt-btn-bell")?.classList.toggle("active", ui.config.notifyProblems);
    });
    // 课件浏览按钮
        bar.querySelector("#ykt-btn-pres")?.addEventListener("click", () => {
      const btn = bar.querySelector("#ykt-btn-pres");
      const isActive = btn.classList.contains("active");
      ui.showPresentationPanel?.(!isActive);
      btn.classList.toggle("active", !isActive);
    });
    // AI按钮
        bar.querySelector("#ykt-btn-ai")?.addEventListener("click", () => {
      const btn = bar.querySelector("#ykt-btn-ai");
      const isActive = btn.classList.contains("active");
      ui.showAIPanel?.(!isActive);
      btn.classList.toggle("active", !isActive);
    });
    bar.querySelector("#ykt-btn-auto-answer")?.addEventListener("click", () => {
      const active = !ui.config.autoAnswerPaused && (ui.config.autoAnswer || ui.config.autoJoinEnabled && ui.config.autoAnswerOnAutoJoin);
      ui.config.autoAnswer = !active;
      ui.config.autoAnswerPaused = active;
      if (!ui.saveConfig()) return;
      ui.toast(`自动作答：${ui.config.autoAnswer ? "开" : "关"}`);
      ui.updateAutoAnswerBtn();
    });
    bar.querySelector("#ykt-btn-settings")?.addEventListener("click", () => {
      ui.toggleSettingsPanel?.();
    });
    bar.querySelector("#ykt-btn-help")?.addEventListener("click", () => {
      ui.toggleTutorialPanel?.();
    });
  }
  // src/core/runtime-mode.js
    const MOBILE_ROUTE_PATTERN = /^\/m\/v2(?:\/|$)/;
  const REDIRECT_LOOP_STORAGE_KEY = "__ykt_desktop_route_guard_target__";
  function isMobileReminderPath(pathname = "") {
    return MOBILE_ROUTE_PATTERN.test(String(pathname));
  }
  function normalizePart(value, prefix) {
    const text = String(value || "");
    if (!text || text.startsWith(prefix)) return text;
    return `${prefix}${text}`;
  }
  /**
   * Maps a mobile page to its desktop equivalent while preserving the page's
   * query string and hash.  A null result means that the route is already
   * desktop-compatible and must be left untouched.
   */  function getDesktopRouteForMobileLocation({pathname: pathname = "", search: search = "", hash: hash = ""} = {}) {
    const currentPath = String(pathname);
    if (!isMobileReminderPath(currentPath)) return null;
    const mobileSuffix = currentPath.slice("/m/v2".length);
    const desktopPath = mobileSuffix === "" || mobileSuffix === "/" ? "/v2/web/index" : `/v2/web${mobileSuffix}`;
    return `${desktopPath}${normalizePart(search, "?")}${normalizePart(hash, "#")}`;
  }
  function getDesktopRouteForNavigation(value, location) {
    if (value === void 0 || value === null || value === "") return null;
    try {
      const url = new URL(String(value), location?.href || location?.origin || void 0);
      if (location?.origin && url.origin !== location.origin) return null;
      return getDesktopRouteForMobileLocation(url);
    } catch {
      return null;
    }
  }
  function clearRedirectLoopMarker(targetWindow) {
    try {
      targetWindow?.sessionStorage?.removeItem(REDIRECT_LOOP_STORAGE_KEY);
    } catch {}
  }
  function redirectCurrentMobileRoute(targetWindow) {
    const location = targetWindow?.location;
    const target = getDesktopRouteForMobileLocation(location);
    if (!target) {
      clearRedirectLoopMarker(targetWindow);
      return {
        redirected: false,
        reason: "desktop-route"
      };
    }
    try {
      const storage = targetWindow?.sessionStorage;
      if (storage?.getItem(REDIRECT_LOOP_STORAGE_KEY) === target) {
        const message = "雨课堂仍将桌面页重定向到手机版。请在浏览器中启用“桌面版网站”后重新打开课程。";
        console.warn(`[雨课堂助手][WARN] ${message}`);
        try {
          targetWindow?.alert?.(message);
        } catch {}
        return {
          redirected: false,
          reason: "loop-prevented"
        };
      }
      storage?.setItem(REDIRECT_LOOP_STORAGE_KEY, target);
    } catch {}
    location?.replace?.(target);
    return {
      redirected: true,
      reason: "mobile-route"
    };
  }
  /**
   * Keeps the userscript desktop-only.  It catches the mobile landing route as
   * early as possible and also rewrites SPA/history/link navigation before the
   * host application can enter /m/v2.
   */  function installDesktopRouteGuard({targetWindow: targetWindow = (typeof window !== "undefined" ? window : null), targetDocument: targetDocument = (typeof document !== "undefined" ? document : null)} = {}) {
    const initialResult = redirectCurrentMobileRoute(targetWindow);
    if (initialResult.redirected || initialResult.reason === "loop-prevented") return initialResult;
    const history = targetWindow?.history;
    const location = targetWindow?.location;
    for (const key of [ "pushState", "replaceState" ]) {
      const original = history?.[key];
      if (typeof original !== "function") continue;
      history[key] = function(...args) {
        const replacement = getDesktopRouteForNavigation(args[2], location);
        if (replacement) args[2] = replacement;
        return original.apply(this, args);
      };
    }
    const redirectIfMobile = () => redirectCurrentMobileRoute(targetWindow);
    targetWindow?.addEventListener?.("popstate", redirectIfMobile);
    targetWindow?.addEventListener?.("hashchange", redirectIfMobile);
    targetDocument?.addEventListener?.("click", event => {
      if (event?.defaultPrevented || event?.button !== void 0 && event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target?.closest?.("a[href]");
      if (!anchor || anchor.target && anchor.target !== "_self" || anchor.hasAttribute?.("download")) return;
      const replacement = getDesktopRouteForNavigation(anchor.href, location);
      if (!replacement) return;
      event.preventDefault();
      location?.assign?.(replacement);
    }, true);
    return initialResult;
  }
  /** Mobile routes are redirect-only; the assistant no longer runs a mobile runtime. */  function getRuntimeMode(pathname = "") {
    return isMobileReminderPath(pathname) ? "desktop-redirect" : "desktop";
  }
  /** Root URLs are redirect entry points, not a full desktop runtime yet. */  function shouldStartDesktopRuntime(pathname = "") {
    const normalizedPath = String(pathname);
    return normalizedPath !== "/" && normalizedPath !== "" && getRuntimeMode(normalizedPath) === "desktop";
  }
  // src/index.js
    function loadFA() {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css";
    document.head.appendChild(link);
  }
  // 脚本注入时文档的状态；document-start 正常注入时为 'loading'。
    const INJECTED_READY_STATE = document.readyState;
  let desktopStarted = false;
  let runtimeBootQueued = false;
  function startDesktopRuntime() {
    if (desktopStarted) return;
    desktopStarted = true;
    diag("boot", {
      version: "1.22.1",
      readyState: INJECTED_READY_STATE,
      autoAnswer: !!ui.config.autoAnswer
    });
    try {
      // 控制台：__yktHelperDiag.download() 导出诊断日志
      (gm.uw || window).__yktHelperDiag = {
        dump: () => exportDiagnostics({
          version: "1.22.1"
        }),
        download: () => downloadDiagnostics({
          version: "1.22.1"
        }),
        clear: clearDiagnostics
      };
    } catch {}
    loadFA();
    injectStyles();
    ui._mountAll?.();
    installToolbar();
    actions.startAutoAnswerLoop();
    actions.launchLessonHelper();
  }
  function bootCurrentRuntime() {
    const pathname = window.location.pathname;
    // 根地址只是站点的跳转入口；/m/v2 会由 document-start 守卫改写，
    // 在改写完成前不启动任何课堂运行时。
        if (shouldStartDesktopRuntime(pathname)) {
      startDesktopRuntime();
      actions.launchLessonHelper();
    }
  }
  function queueRuntimeBoot() {
    if (runtimeBootQueued) return;
    runtimeBootQueued = true;
    const run = () => {
      runtimeBootQueued = false;
      bootCurrentRuntime();
    };
    if (document.body) Promise.resolve().then(run); else document.addEventListener("DOMContentLoaded", run, {
      once: true
    });
  }
  function installRuntimeRouteWatcher() {
    const target = gm.uw || window;
    const history = target.history;
    for (const key of [ "pushState", "replaceState" ]) {
      const original = history?.[key];
      if (typeof original !== "function") continue;
      history[key] = function(...args) {
        const result = original.apply(this, args);
        actions.launchLessonHelper();
        queueRuntimeBoot();
        return result;
      };
    }
    const routeChanged = () => {
      actions.launchLessonHelper();
      queueRuntimeBoot();
    };
    target.addEventListener?.("popstate", routeChanged);
    target.addEventListener?.("hashchange", routeChanged);
  }
  (function main() {
    const targetWindow = gm.uw || window;
    const guard = installDesktopRouteGuard({
      targetWindow: targetWindow,
      targetDocument: targetWindow.document || document
    });
    if (guard.redirected || guard.reason === "loop-prevented") return;
    installXHRInterceptor();
    installFetchInterceptor();
    actions.launchLessonHelper();
    // Capture the native sockets before any UI or DOM-dependent work.
        installWSInterceptor({
      getRuntimeMode: () => getRuntimeMode(window.location.pathname)
    });
    installRuntimeRouteWatcher();
    queueRuntimeBoot();
  })();
})();
