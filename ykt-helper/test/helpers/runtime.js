import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outFile = fs.readFileSync(path.join(project, 'rollup.config.mjs'), 'utf8').match(/OUT_FILE = '([^']+)'/)[1];
const bundle = fs.readFileSync(path.join(project, outFile), 'utf8');
const cut = bundle.lastIndexOf('  (function main() {');
if (cut < 0) throw new Error('Bundled entry marker missing');
const exposed = bundle.slice(0, cut) + `
globalThis.audit = { repo, ui, actions, storage, gm, parseAIAnswer, validateAnswer, mdToHtml,
submitAnswer, retryAnswer, answerProblem, hasSubmittedAnswer, queryAIVision, captureSlideImageOriginal: captureSlideImage,
mountSettingsPanel, mountAIPanel, showAIPanel, askAIFusionMode, mountProblemListPanel, updateProblemList, updateActiveProblems,
recognizeCurrentSlideText, translateCurrentOCRText, ensureStaticReportPresentation, updatePresentationList,
installXHRInterceptor, installFetchInterceptor, installWSInterceptor, connectOrAttachLessonWS,
installRuntimeRouteWatcher, bootCurrentRuntime, createDanmuFollowTracker, createDanmuFollowController, sendDanmuText,
hooks(o) { if(o.capture) captureSlideImage=o.capture; if(o.fallback) captureProblemForVision=o.fallback; if(o.vision) queryAIVision=o.vision; if(o.ocr) queryOCRVision=o.ocr; if(o.translate) queryTranslationText=o.translate; if(o.lessons)getOnLesson=o.lessons; }
};})();`;
export const plain = value => JSON.parse(JSON.stringify(value));
export const tick = async (ms = 0) => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, ms)); };
export function deferred() { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
export function environment(t, config = {}, options = {}) {
  const errors = [], requests = [], aiRequests = [], notices = [], consoleErrors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message)); vc.on('error', (...args) => consoleErrors.push(args.map(String).join(' ')));
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', { url: options.url || 'https://changjiang.yuketang.cn/lesson/fullscreen/v3/L1', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window; t?.after(() => dom.window.close());
  let now = 1800000000000;
  w.Date.now = () => now;
  w.confirm = () => true; w.alert = () => {};
  w.document.cookie = 'user_id=fixture-user';
  const locks = options.locks || new Map();
  Object.defineProperty(w.navigator, 'locks', { configurable: true, value: { async request(name, opts, fn) { if (locks.has(name)) return fn(null); locks.set(name, true); try { return await fn({ name }); } finally { locks.delete(name); } } } });
  if (options.sharedStorage) Object.defineProperty(w, 'localStorage', { value: { getItem(k) { return options.sharedStorage.get(k) ?? null; }, setItem(k, v) { options.sharedStorage.set(k, String(v)); }, removeItem(k) { options.sharedStorage.delete(k); }, key(i) { return [...options.sharedStorage.keys()][i] ?? null; }, get length() { return options.sharedStorage.size; } } });
  const defaults = { notifyProblems: false, notifySound: false, iftex: false, autoAnswer: false, autoAnswerDelay: 0, autoAnswerRandomDelay: 0, ai: { profiles: [{ id: 'default', name: 'Fixture', baseUrl: 'https://ai.example.test/v1/chat/completions', apiKey: 'fixture-key', model: 'fixture-model', visionModel: 'fixture-model' }], activeProfileId: 'default' }, ...config };
  w.localStorage.setItem('ykt-helper:config', JSON.stringify(defaults));
  class XHR extends w.EventTarget {
    constructor() { super(); this.timeout = 0; this.status = 200; }
    open(...args) { this.openArguments = args; this.url = String(args[1]); this.method = args[0]; }
    setRequestHeader() {}
    send(body) {
      this.body = body; requests.push(this);
      let response = options.respond?.(this.url, typeof body === 'string' ? JSON.parse(body) : body, this) ?? { code: 0, data: { success: ['P', 'Q'] } };
      Promise.resolve(response).then(value => {
        if (value?.hold) return;
        this.status = value?.httpStatus ?? 200;
        this.responseText = typeof value === 'string' ? value : JSON.stringify(value);
        this.dispatchEvent(new w.Event('load')); this.onload?.(); this.dispatchEvent(new w.Event('loadend'));
      });
    }
    abort() { this.onabort?.(); this.dispatchEvent(new w.Event('loadend')); }
  }
  w.XMLHttpRequest = XHR;
  w.GM_xmlhttpRequest = opt => { aiRequests.push(opt); if (options.onAI) options.onAI(opt); else queueMicrotask(() => opt.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content: '答案: ["A"]\n解释: fixture' } }] }) })); return { abort() { opt.onabort?.(); } }; };
  w.GM_notification = () => {}; w.GM_addStyle = () => {};
  w.fetch = async (...args) => options.fetch?.(...args) || { ok: true, status: 200, clone() { return this; }, json: async () => ({ code: 0, data: [] }), text: async () => '{"code":0,"data":[]}', headers: { get() { return null; } } };
  w.Request = globalThis.Request;
  w.WebSocket = class extends w.EventTarget {
    constructor(url) { super(); this.url = url; this.readyState = 1; queueMicrotask(() => this.dispatchEvent(new w.Event('open'))); }
    send() {}
    close() { this.readyState = 3; this.dispatchEvent(new w.Event('close')); }
  };
  w.eval(options.fullBoot ? bundle : exposed);
  const a = w.audit;
  if (a) {
    a.repo.currentLessonId = 'L1';
    const realToast = a.ui.toast; a.ui.toast = (...args) => { notices.push(args); return realToast(...args); };
    a.hooks({ capture: async () => 'data:image/jpeg;base64,/9j/AAAA', fallback: async () => null, lessons: async () => [] });
  }
  return { w, a, requests, aiRequests, notices, errors, consoleErrors, setNow(value) { now = value; }, addProblem(id = 'P', extra = {}, lessonId = 'L1') {
    const ctx = a.repo.forLesson(lessonId), sid = 'S' + id, pres = 'PR' + id;
    a.repo.setPresentation(pres, { slides: [{ id: sid, cover: 'https://image.example.test/slide.jpg', problem: { problemId: id, problemType: 1, body: 'Choose', options: [{ key: 'A', value: 'a' }, { key: 'B', value: 'b' }], ...extra } }] }, lessonId, { persist: false });
    ctx.problemStatus.set(id, { lessonId, slideId: sid, presentationId: pres, startTime: now - 1000, endTime: now + 60000, autoAnswerTime: null, answering: false, done: false, phase: 'idle' });
    return ctx.problems.get(id);
  } };
}
