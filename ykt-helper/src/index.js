// src/index.js
import { installWSInterceptor } from './net/ws-interceptor.js';
import { installXHRInterceptor } from './net/xhr-interceptor.js';
import  './net/fetch-interceptor.js';
import { injectStyles } from './ui/styles.js';
import { installToolbar } from './ui/toolbar.js';
import { actions } from './state/actions.js';
import { ui } from './ui/ui-api.js'; 
import { gm, ensureFontAwesome } from './core/env.js';
import { getRuntimeMode, installDesktopRouteGuard, shouldStartDesktopRuntime } from './core/runtime-mode.js';

let periodicReloadTimer = null;

function startPeriodicReload(opts = {}) {
  try {
    if (periodicReloadTimer !== null) return periodicReloadTimer;
    const intervalMs = Number.isFinite(opts.intervalMs) ? opts.intervalMs : 5 * 60 * 1000;
    const onlyWhenHidden = (opts.onlyWhenHidden !== false);
    const skipLessonPages = (opts.skipLessonPages !== false);

    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;

    periodicReloadTimer = window.setInterval(() => {
      try {
        console.log('[雨课堂助手][DEBUG] periodic tick', {
          pathname: window.location.pathname,
          hidden: document.hidden,
        });

        if (skipLessonPages && /\/lesson\//.test(window.location.pathname)) {
          console.log('[雨课堂助手][DEBUG] skip reload: lesson page');
          return;
        }
        if (onlyWhenHidden && !document.hidden) {
          console.log('[雨课堂助手][DEBUG] skip reload: page visible');
          return;
        }

        console.log('[雨课堂助手][INFO] Periodic reload triggered to avoid zombie session.');
        window.location.reload();
      } catch (e) {
        console.error(e);
      }
    }, intervalMs);
    return periodicReloadTimer;
  } catch {
    return null;
  }
}

let desktopStarted = false;
let runtimeBootQueued = false;

function startDesktopRuntime() {
  if (desktopStarted) return;
  desktopStarted = true;

  ensureFontAwesome();
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
  if (shouldStartDesktopRuntime(pathname)) startDesktopRuntime();
}

function queueRuntimeBoot() {
  if (runtimeBootQueued) return;
  runtimeBootQueued = true;
  const run = () => {
    runtimeBootQueued = false;
    bootCurrentRuntime();
  };
  if (document.body) {
    Promise.resolve().then(run);
  } else {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  }
}

function installRuntimeRouteWatcher() {
  const target = gm.uw || window;
  const history = target.history;
  for (const key of ['pushState', 'replaceState']) {
    const original = history?.[key];
    if (typeof original !== 'function') continue;
    history[key] = function (...args) {
      const result = original.apply(this, args);
      queueRuntimeBoot();
      return result;
    };
  }
  target.addEventListener?.('popstate', queueRuntimeBoot);
  target.addEventListener?.('hashchange', queueRuntimeBoot);
}

(function main() {
  const targetWindow = gm.uw || window;
  const guard = installDesktopRouteGuard({
    targetWindow,
    targetDocument: targetWindow.document || document,
  });
  if (guard.redirected || guard.reason === 'loop-prevented') return;

  // Base services must be armed on the first userscript execution. Network
  // interception must not depend on a second page load or on UI/runtime mount.
  installWSInterceptor({
    getRuntimeMode: () => getRuntimeMode(window.location.pathname),
  });
  installXHRInterceptor();

  // Periodic refresh is a base service, not a desktop-runtime side effect.
  // It keeps running across SPA route changes, but each tick still skips /lesson/ pages.
  startPeriodicReload({ intervalMs: 1 * 60 * 1000, onlyWhenHidden: false, skipLessonPages: true });

  installRuntimeRouteWatcher();
  queueRuntimeBoot();
})();
