import { gm } from '../core/env.js';
import { PROBLEM_TYPE_MAP } from '../core/types.js';
import { hasSubmittedAnswer, validateAnswer } from '../core/answer-state.js';
import { repo } from '../state/repo.js';
import { actions } from '../state/actions.js';
import { ui } from './ui-api.js';

let anchor, panel, editorContext = null, fields = [], submitting = false;
let watchedStore = null, unwatch = null;
const id = value => value == null ? '' : String(value);
const element = (tag, text, className) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; };

function getMainStore() {
  try {
    const app = (gm.uw || window).document.querySelector('#app');
    return app?.__vue__?.$store || app?.__vueParentComponent?.proxy?.$store || null;
  } catch { return null; }
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
  return { accountId: repo.accountId, lessonId, slideId, problemId, source: 'native' };
}

function isCurrentContext(ctx) {
  if (!ctx || ctx.accountId !== repo.accountId || ctx.lessonId !== id(repo.currentLessonId)) return false;
  const slide = repo.forLesson(ctx.lessonId).slides.get(ctx.slideId);
  if (id(slide?.problem?.problemId ?? slide?.problem?.id) !== ctx.problemId) return false;
  if (ctx.source === 'native') {
    const current = mainQuestionContext();
    return current?.slideId === ctx.slideId && current.problemId === ctx.problemId;
  }
  return id(repo.currentSlideId) === ctx.slideId && document.getElementById('ykt-presentation-panel')?.classList.contains('visible');
}

function closeEditor() { panel?.classList.remove('visible'); editorContext = null; }
function setMessage(message) { const el = panel?.querySelector('.ykt-quick-status'); if (el) el.textContent = message; }

function mountEditor() {
  if (panel) return;
  panel = element('section', null, 'ykt-panel'); panel.id = 'ykt-quick-answer-panel';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'ykt-quick-answer-title');
  const header = element('div', null, 'panel-header');
  const title = element('h3', '输入答案并强制提交'); title.id = 'ykt-quick-answer-title';
  const close = element('button', '×'); close.type = 'button'; close.setAttribute('aria-label', '关闭答案输入'); close.onclick = closeEditor;
  header.append(title, close);
  const body = element('div', null, 'panel-body');
  const question = element('p', '', 'ykt-quick-question');
  const inputs = element('div', null, 'ykt-quick-fields');
  const hint = element('p', '', 'ykt-quick-hint');
  const status = element('p', '', 'ykt-quick-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const bar = element('div', null, 'ykt-quick-actions');
  const local = element('button', '保存本地'); local.type = 'button'; local.className = 'ykt-quick-save';
  local.onclick = () => { try { saveDraft(); } catch (error) { setMessage(error.message); } };
  const submit = element('button', '强制提交'); submit.type = 'button'; submit.className = 'ykt-quick-submit'; submit.onclick = submitCurrentAnswer;
  bar.append(local, submit); body.append(question, inputs, hint, status, bar); panel.append(header, body); document.body.appendChild(panel);
}

function editorProblem(ctx = editorContext) {
  if (!isCurrentContext(ctx)) throw new Error('页面、题目或账号已变化，请在当前题目页重新打开输入框');
  const problem = repo.forLesson(ctx.lessonId).problems.get(ctx.problemId);
  if (!problem) throw new Error('题目数据尚未加载');
  return problem;
}

function draftText(problem) {
  return Number(problem.problemType) === 4 ? JSON.stringify(fields.map(field => field.value)) : fields[0].value;
}

function saveDraft() {
  const problem = editorProblem();
  const saved = repo.saveDraft(editorContext.problemId, draftText(problem), editorContext.lessonId);
  setMessage(saved ? '本地草稿已保存 · 未提交' : '草稿保留在内存，持久化失败');
  return problem;
}

function existingValues(problem) {
  const text = problem.draftText;
  if (text != null) {
    try { const parsed = JSON.parse(text); if (Array.isArray(parsed)) return parsed.map(String); if (Number(problem.problemType) === 5 && parsed?.content != null) return [String(parsed.content)]; } catch {}
    return Number(problem.problemType) === 4 ? String(text).split(/\r?\n/) : [String(text)];
  }
  const value = hasSubmittedAnswer(problem.result) ? problem.result : problem.aiProposal;
  if (Array.isArray(value)) return value.map(String);
  return [value?.content || ''];
}

export function openQuickAnswer(context) {
  mountEditor();
  const ctx = { ...context, accountId: context.accountId ?? repo.accountId, lessonId: id(context.lessonId), slideId: id(context.slideId), problemId: id(context.problemId) };
  if (submitting) return ui.toast('正在提交当前答案，请等待服务器结果');
  if (!isCurrentContext(ctx)) return ui.toast('请先切换到对应的题目页');
  editorContext = ctx;
  const problem = editorProblem(), type = Number(problem.problemType), values = existingValues(problem);
  panel.querySelector('#ykt-quick-answer-title').textContent = `手动强制提交 · ${PROBLEM_TYPE_MAP[type]}`;
  panel.querySelector('.ykt-quick-question').textContent = problem.body || `题目 ${ctx.problemId}`;
  const container = panel.querySelector('.ykt-quick-fields'); container.replaceChildren(); fields = [];
  const count = type === 4 ? Math.max(1, problem.blanks?.length || values.length) : 1;
  for (let i = 0; i < count; i++) {
    const label = element('label', type === 4 ? `第 ${i + 1} 空` : '答案');
    const field = element('textarea'); field.rows = type === 5 ? 5 : 2;
    field.value = type === 4 ? values[i] ?? '' : [1, 2, 3].includes(type) ? values.join('') : values[0] ?? '';
    field.placeholder = type === 4 ? '直接输入本空答案，如 -1、[0,1] 或 x + y' : type === 5 ? '输入答案正文' : type === 2 ? '例如 AC（多选）' : '例如 B（单选）';
    field.addEventListener('input', () => { try { saveDraft(); } catch (error) { setMessage(error.message); } });
    label.appendChild(field); container.appendChild(label); fields.push(field);
  }
  panel.querySelector('.ykt-quick-hint').textContent = type === 4 ? '每个输入框对应一个空，负号、逗号与公式原样保留。' : '填写后点击“强制提交”，服务器确认后显示成功。';
  setMessage(hasSubmittedAnswer(problem.result) ? '服务器已有答案，可在这里修改并强制重提。' : '尚未提交');
  panel.classList.add('visible'); ui._bringToFront(panel); fields[0]?.focus();
}

async function submitCurrentAnswer() {
  if (submitting) return;
  const ctx = editorContext;
  try {
    const problem = saveDraft();
    const type = Number(problem.problemType);
    const value = validateAnswer(problem, type === 4 ? fields.map(field => field.value) : type === 5 ? { content: fields[0].value, pics: [] } : actions.parseManual(type, fields[0].value));
    const revision = problem.draftRevision;
    submitting = true;
    panel.querySelector('.ykt-quick-submit').disabled = true;
    for (const field of fields) field.disabled = true;
    setMessage('正在强制提交…');
    await actions.submit(problem, JSON.stringify(value), {
      lessonId: ctx.lessonId, forceRetry: true, allowResubmit: true,
      guard: () => { editorProblem(ctx); if (problem.draftRevision !== revision) throw new Error('草稿已变化，提交已停止'); },
    });
    if (editorContext === ctx) setMessage('服务器已确认强制提交成功');
    else ui.toast(`题目 ${ctx.problemId}：服务器已确认强制提交成功`);
  } catch (error) { if (editorContext === ctx) setMessage(error.message); else ui.toast(error.message, 4500); }
  finally {
    submitting = false;
    if (panel) { panel.querySelector('.ykt-quick-submit').disabled = false; for (const field of fields) field.disabled = false; }
  }
}

export function createQuickAnswerButton(context) {
  const button = element('button', '输入答案并强制提交', 'ykt-force-answer-button'); button.type = 'button';
  const target = { ...context, accountId: repo.accountId };
  button.addEventListener('click', () => openQuickAnswer(target));
  return button;
}

export function refreshQuickAnswerControl() {
  if (!anchor) return;
  const store = getMainStore();
  if (store !== watchedStore) {
    unwatch?.(); unwatch = null; watchedStore = store;
    if (typeof store?.watch === 'function') unwatch = store.watch(state => state.currSlide, refreshQuickAnswerControl, { deep: true });
  }
  const current = mainQuestionContext();
  anchor.classList.toggle('hidden', !current);
  anchor.__context = current;
  if (editorContext && !isCurrentContext(editorContext)) closeEditor();
}

export function mountQuickAnswerControl() {
  if (anchor) return anchor;
  anchor = element('div'); anchor.id = 'ykt-page-answer-control'; anchor.className = 'hidden';
  const button = element('button', '输入答案并强制提交', 'ykt-force-answer-button'); button.type = 'button';
  button.onclick = () => { const ctx = mainQuestionContext(); if (ctx) openQuickAnswer(ctx); else refreshQuickAnswerControl(); };
  anchor.appendChild(button); document.body.appendChild(anchor);
  window.addEventListener('ykt:lesson-change', refreshQuickAnswerControl);
  // Also covers late-mounted/replaced Vue roots and account changes.
  setInterval(refreshQuickAnswerControl, 500);
  refreshQuickAnswerControl();
  return anchor;
}
