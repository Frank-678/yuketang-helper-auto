// src/state/repo.js
import { storage } from '../core/storage.js';

export const repo = {
  presentations: new Map(), // id -> presentation
  slides: new Map(),        // slideId -> slide
  problems: new Map(),      // problemId -> problem
  problemStatus: new Map(), // problemId -> {presentationId, slideId, startTime, endTime, phase, done, autoAnswerTime, answering, attempts, lastError}
  encounteredProblems: [],  // [{problemId, ...ref}]

  currentPresentationId: null,
  currentSlideId: null,
  currentLessonId: null,
  currentSelectedUrl: null,

  // 按课程分组存储课件
  setPresentation(id, data) {
    this.presentations.set(id, { id, ...data });
    const key = this.currentLessonId ? `presentations-${this.currentLessonId}` : 'presentations';
    storage.alterMap(key, (m) => {
      m.set(id, data);
      // 仍然做容量裁剪
      const max = (storage.get('config', {})?.maxPresentations ?? 5);
      const excess = m.size - max;
      if (excess > 0) [...m.keys()].slice(0, excess).forEach(k => m.delete(k));
    });
  },

  upsertSlide(slide) { this.slides.set(slide.id, slide); },
  upsertProblem(prob) { this.problems.set(prob.problemId, prob); },

  pushEncounteredProblem(prob, slide, presentationId) {
    if (!this.encounteredProblems.some(p => p.problemId === prob.problemId)) {
      this.encounteredProblems.push({
        problemId: prob.problemId,
        problemType: prob.problemType,
        body: prob.body || `题目ID: ${prob.problemId}`,
        options: prob.options || [],
        blanks: prob.blanks || [],
        answers: prob.answers || [],
        slide, presentationId,
      });
    }
  },

  // === 自动进入课堂所需的多“线程”（多课堂）状态 ===
  listeningLessons: new Set(),      // lessonId 的集合，表示已经建立WS监听
  lessonTokens: new Map(),          // lessonId -> lessonToken（/lesson/checkin 返回）
  lessonSockets: new Map(),         // lessonId -> WebSocket 实例
  activeLessons: new Map(),         // lessonId -> 最近一次 on-lesson API 记录
  autoJoinRunning: false,           // 轮询开关
  autoJoinedLessons: new Set(),     // 被“自动进入”的课堂集合（仅标记自动进入建立的连接）
  forceAutoAnswerLessons: new Set(),// 若需要，可以对某些课强制视为“自动答题开启”

  // 载入本课（按课程分组）在本地存储过的课件
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
    const key = String(lessonId || '').trim();
    if (!key) return;
    if (token) this.lessonTokens.set(key, token);
    if (ws) this.lessonSockets.set(key, ws);
    this.listeningLessons.add(key);
  },

  isLessonConnected(lessonId) {
    const socket = this.lessonSockets.get(String(lessonId));
    if (!this.listeningLessons.has(String(lessonId)) || !socket) return false;
    if (socket.readyState !== undefined && typeof WebSocket !== 'undefined') {
      if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
        return false;
      }
    }
    return socket;
  },

  markLessonDisconnected(lessonId, reason = 'closed', expectedSocket = null) {
    const key = String(lessonId || '').trim();
    if (!key) return null;
    const currentSocket = this.lessonSockets.get(key) || null;

    // A close/error callback can arrive after another socket has already taken
    // ownership of the same lesson. Only the current owner may clear shared
    // lesson state when a caller provides the socket it is cleaning up.
    if (expectedSocket && currentSocket !== expectedSocket) {
      return {
        lessonId: key,
        reason: 'stale-owner',
        requestedReason: reason,
        socket: expectedSocket,
        currentSocket,
        disconnected: false,
      };
    }

    this.lessonSockets.delete(key);
    this.lessonTokens.delete(key);
    this.listeningLessons.delete(key);
    this.autoJoinedLessons.delete(key);
    this.forceAutoAnswerLessons.delete(key);
    return {
      lessonId: key,
      reason,
      socket: currentSocket,
      disconnected: true,
    };
  },

  markLessonAutoJoined(lessonId, enabled = true) {
    const key = String(lessonId || '').trim();
    if (!key) return false;
    if (enabled) {
      const socket = this.lessonSockets.get(key) || null;
      // Foreground/native sockets explicitly opt out of AutoJoin ownership.
      // Undefined keeps compatibility with legacy/plain test doubles while the
      // managed WS path marks its socket with __yktManaged === true.
      if (socket?.__yktManaged === false) return false;
      this.autoJoinedLessons.add(key);
      return true;
    }
    this.autoJoinedLessons.delete(key);
    return true;
  },
};
