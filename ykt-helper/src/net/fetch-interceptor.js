import { gm } from '../core/env.js';
import { observeResponse, requestLessonId } from './submission-observer.js';
import { repo } from '../state/repo.js';
import { parsePresentationResponse } from '../core/presentation-response.js';

export function parsePresentationFetchResponse(url, json) {
  return parsePresentationResponse(url, json);
}
export function installFetchInterceptor() {
  for (const surface of new Set([window, gm.uw])) {
    if (!surface?.fetch || surface.fetch.__yktInstalled) continue;
    const native = surface.fetch;
    const patched = async function(input, init) {
      const url = String(input?.url || input?.href || input);
      const lessonId = requestLessonId(url, repo.currentLessonId);
      const accountId = repo.accountId;
      let bodyPromise;
      try { bodyPromise = Promise.resolve(init?.body ?? (typeof input?.clone === 'function' ? input.clone().text() : null)); } catch { bodyPromise = Promise.resolve(null); }
      const response = await native.call(this, input, init);
      if (response.ok !== false && /lesson|presentation|slides|problem/.test(url)) {
        void Promise.all([response.clone().json(), bodyPromise]).then(([json, body]) => observeResponse(url, json, body, { lessonId, accountId })).catch(() => {});
      }
      return response;
    };
    patched.__yktInstalled = true;
    surface.fetch = patched;
  }
}

