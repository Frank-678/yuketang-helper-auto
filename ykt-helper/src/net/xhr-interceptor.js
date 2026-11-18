import { gm } from '../core/env.js';
import { repo } from '../state/repo.js';
import { observeResponse, requestLessonId } from './submission-observer.js';

export function installXHRInterceptor() {
  for (const surface of new Set([window, gm.uw])) {
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
      const url = this.__yktUrl || '', lessonId = this.__yktLessonId, accountId = this.__yktAccountId;
      if (/lesson|presentation|slides|problem/.test(url)) this.addEventListener('load', () => {
        try {
          if (this.status < 200 || this.status >= 300) return;
          const json = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
          observeResponse(url, json, body, { lessonId, accountId, own: this.__yktOwnSubmission === true });
        } catch {}
      }, { once: true });
      return nativeSend.apply(this, arguments);
    };
    proto.__yktInstalled = true;
  }
}

export async function getOnLesson() {
  const origin = location.origin;
  const same = (p) => new URL(p, origin).toString();
  const candidates = [
    same('/api/v3/classroom/on-lesson'),
    same('/mooc-api/v1/lms/classroom/on-lesson'),
    same('/apiv3/classroom/on-lesson'),
  ];

  const tries = [];
  let finalList = [];
  let lastErr = null;

  for (const url of candidates) {
    const item = { url, ok: false, status: 0, note: '' };
    try {
      const r = await fetch(url, { credentials: 'include' });
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
      try { j = JSON.parse(text); } catch (_) { item.note = 'JSON parse failed'; }
      const list = j?.data?.onLessonClassrooms || j?.result || j?.data || [];
      item.parsedLength = Array.isArray(list) ? list.length : -1;
      if (Array.isArray(list) && list.length) {
        item.ok = true;
        tries.push(item);
        finalList = list;
        break;
      } else {
        item.note ||= 'empty list';
        tries.push(item);
      }
    } catch (e) {
      item.note = (e && e.message) || 'fetch error';
      tries.push(item);
      lastErr = e;
    }
  }

  // 调试信息
  try {
    console.groupCollapsed(
      `%c[getOnLesson] host=%s  result=%s  candidates=%d`,
      'color:#09f',
      location.hostname,
      finalList.length ? `OK(${finalList.length})` : 'EMPTY',
      candidates.length
    );
      tries.forEach((t, i) => {
      console.log(
        `#${i+1}`,
        { url: t.url, ok: t.ok, status: t.status, note: t.note, parsedLength: t.parsedLength, bodySnippet: t.bodySnippet }
      );
    });
    if (!finalList.length && lastErr) console.warn('[getOnLesson] last error:', lastErr);
    console.groupEnd();
  } catch {}

  return finalList;
}

// One explicit protocol per channel, on the authenticated current host.
export { requestLessonCheckin as checkinClass } from './checkin-client.js';

/** 获取当前/最近激活的 presentationId（多候选，自适配不同网关） */
export async function getActivePresentationId(lessonId) {
  const origin = location.origin;
  const same = (p) => new URL(p, origin).toString();
  const qs = (id) => `?lessonId=${encodeURIComponent(id)}`;
  const candidates = [
    same(`/api/v3/lesson/presentation/active${qs(lessonId)}`),
    same(`/api/v3/lesson/presentation/current${qs(lessonId)}`),
    same(`/api/v3/lesson/presentation${qs(lessonId)}`),
    same(`/apiv3/lesson/presentation${qs(lessonId)}`),
    same(`/mooc-api/v1/lms/lesson/presentation${qs(lessonId)}`),
  ];

  for (const url of candidates) {
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) continue;
      const j = await r.json().catch(() => ({}));
      // 兼容多种返回结构
      const fromData = j?.data || j?.result || j;
      if (!fromData) continue;
      // 可能直接是对象 {presentationId: xxx}，也可能在列表里
      const pid =
        fromData.presentationId ||
        fromData.presentation_id ||
        (Array.isArray(fromData) && (fromData[0]?.presentationId || fromData[0]?.presentation_id));
      if (pid) {
        console.log('[雨课堂助手][DBG][getActivePresentationId] OK', { url, presentationId: pid });
        return String(pid);
      }
    } catch (e) {
      // 忽略，试下一个
    }
  }
  console.warn('[雨课堂助手][WARN][getActivePresentationId] no pid found for lesson', lessonId);
  return null;
}
