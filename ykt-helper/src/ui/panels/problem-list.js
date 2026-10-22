import tpl from './problem-list.html';
import { ui } from '../ui-api.js';
import { repo } from '../../state/repo.js';
import { actions } from '../../state/actions.js';
import { submitAnswer } from '../../tsm/answer.js';
import { hasSubmittedAnswer, validateAnswer } from '../../core/answer-state.js';
let root, mounted = false, viewKey = '';
const rows = new Map();
const create = (tag, text, className) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; };
export function mountProblemListPanel() {
  if (mounted) return root;
  const wrapper = create('div'); wrapper.innerHTML = tpl; document.body.appendChild(wrapper.firstElementChild);
  root = document.getElementById('ykt-problem-list-panel'); mounted = true;
  document.getElementById('ykt-problem-list-close')?.addEventListener('click', () => showProblemListPanel(false));
  window.addEventListener('ykt:open-problem-list', () => showProblemListPanel(true));
  return root;
}
function makeRow(p, lessonId) {
  const row = create('div', null, 'problem-row'); row.dataset.problemId = p.problemId;
  const title = create('div', null, 'problem-title'), meta = create('div', null, 'problem-meta'), bar = create('div', null, 'problem-actions'), detail = create('div', null, 'problem-detail');
  const input = create('textarea'); input.rows = 4; input.placeholder = '选项如 ["A","C"]；填空如 ["-1","(-∞,0]"]；主观题可直接输入正文。';
  input.value = p.draftText ?? (p.aiProposal ? JSON.stringify(p.aiProposal) : hasSubmittedAnswer(p.result) ? JSON.stringify(p.result) : '');
  const draftInfo = create('small', '', 'draft-status'), proposal = create('pre', '', 'ai-proposal');
  const select = create('select');
  for (const [value, label] of [['auto', '按题目状态提交'], ['normal', '只正常提交'], ['retry', '强制补交'], ['local', '只保存本地']]) { const opt = create('option', label); opt.value = value; select.appendChild(opt); }
  select.value = ui.config.submissionPolicy || 'auto';
  const button = (text, fn) => { const b = create('button', text); b.onclick = fn; bar.appendChild(b); return b; };
  input.addEventListener('input', () => { const ok = repo.saveDraft(p.problemId, input.value, lessonId); draftInfo.textContent = ok ? '本地草稿已保存 · 未提交' : '草稿仍在内存，持久化失败，请清理存储空间'; });
  button('查看课件', () => actions.navigateTo(p.presentationId, p.slideId));
  button('AI 建议', () => window.dispatchEvent(new CustomEvent('ykt:open-ai', { detail: { problemId: p.problemId, lessonId, slideId: p.slideId } })));
  button('AI 作答并处理', async () => { await actions.handleAutoAnswer(p, { lessonId, source: 'manual', force: true }); updateProblemList(); });
  button('采用 AI 建议', () => { if (!p.aiProposal) return ui.toast('此题尚无 AI 建议'); input.value = JSON.stringify(p.aiProposal); repo.saveDraft(p.problemId, input.value, lessonId); draftInfo.textContent = 'AI 建议已成为本地草稿 · 未提交'; });
  const submit = button('提交答案', async () => {
    if (select.value === 'local') { draftInfo.textContent = repo.saveDraft(p.problemId, input.value, lessonId) ? '本地草稿已保存 · 未提交' : '本地保存失败，草稿仍在编辑器'; return; }
    try {
      const value = validateAnswer(p, actions.parseManual(p.problemType, input.value));
      repo.saveDraft(p.problemId, input.value, lessonId);
      const revision = p.draftRevision, account = repo.accountId;
      submit.disabled = true;
      const out = await submitAnswer(p, value, { lessonId, policy: select.value, forceRetry: select.value === 'retry', guard: () => { if (p.draftRevision !== revision || repo.accountId !== account) throw new Error('草稿或账号已变化，提交已停止'); } });
      ui.toast(out.route === 'retry' ? '服务器已确认补交成功' : out.route === 'local' ? '已保存本地，尚未提交' : '服务器已确认提交成功');
    } catch (error) { ui.toast(error.message, 4500); }
    finally { submit.disabled = false; updateProblemList(); }
  });
  bar.insertBefore(select, submit);
  select.addEventListener('change', () => updateRow(row, p, lessonId));
  button('核实服务器答案', async () => {
    const pres = repo.forLesson(lessonId).presentations.get(p.presentationId);
    if (!pres?.sourceUrl) return ui.toast('尚无可复用的课件请求，请在官方页面重新打开此课件以同步答案', 5000);
    try { const response = await fetch(pres.sourceUrl, { credentials: 'include' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const json = await response.json(); const data = json.data || json; if (!Array.isArray(data.slides)) throw new Error('服务器未返回课件数据'); actions.onPresentationLoaded(pres.id, data, { lessonId }); ui.toast('已读取课件；以服务器实际返回的答案为准'); } catch (error) { ui.toast(`核实失败：${error.message}`); }
  });
  detail.append(input, draftInfo, proposal); row.append(title, meta, bar, detail);
  row.__editor = { input, title, meta, proposal, submit, select, draftInfo }; return row;
}
function updateRow(row, p, lessonId) {
  const { title, meta, proposal, submit, select } = row.__editor;
  const s = repo.forLesson(lessonId).problemStatus.get(p.problemId) || {};
  title.textContent = p.body || `题目 ${p.problemId}`;
  const ended = s.finished || (Number.isFinite(s.endTime) && Date.now() >= s.endTime);
  meta.textContent = `PID: ${p.problemId} / ${hasSubmittedAnswer(p.result) ? '服务器已确认作答' : s.needsReconciliation ? '提交结果待核实' : '未提交'} / ${ended ? '已结束' : s.endTime == null ? '不限时' : '开放'}${s.lastError ? ' / ' + s.lastError : ''}`;
  proposal.textContent = p.aiProposal ? `AI 建议：${JSON.stringify(p.aiProposal)}${p.verificationProposal ? '\n复核建议：' + JSON.stringify(p.verificationProposal) : ''}` : p.proposalRaw ? `AI 原文（待编辑）：${p.proposalRaw}` : '';
  submit.textContent = select.value === 'local' ? '保存本地' : select.value === 'retry' || (select.value === 'auto' && ended) ? '强制补交' : '提交答案';
  submit.disabled = s.phase === 'submitting';
}
export function updateProblemList() {
  mountProblemListPanel(); const container = document.getElementById('ykt-problem-list');
  const context = `${repo.accountId}:${repo.currentLessonId}`;
  if (context !== viewKey) { container.replaceChildren(); rows.clear(); viewKey = context; }
  const ctx = repo.forLesson(), ids = new Set();
  for (const [id, p] of ctx.problems) {
    ids.add(id); let row = rows.get(id);
    if (!row) { row = makeRow(p, ctx.lessonId); rows.set(id, row); container.appendChild(row); }
    updateRow(row, p, ctx.lessonId);
  }
  for (const [id, row] of rows) if (!ids.has(id)) { row.remove(); rows.delete(id); }
  let empty = container.querySelector('.problem-empty');
  if (!ids.size && !empty) { empty = create('div', '暂无题目', 'problem-empty'); container.appendChild(empty); }
  if (ids.size) empty?.remove();
}
export function showProblemListPanel(visible = true) { mountProblemListPanel(); root.classList.toggle('visible', visible); if (visible) updateProblemList(); }
