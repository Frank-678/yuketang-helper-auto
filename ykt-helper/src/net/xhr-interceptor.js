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

export { getOnLesson } from './live-lessons.js';

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
