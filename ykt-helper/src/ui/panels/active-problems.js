import tpl from './active-problems.html';
import { repo } from '../../state/repo.js';
import { actions } from '../../state/actions.js';
import { getProblemRemainingSeconds } from '../../state/problem-timing.js';
import { createProblemDismissalState } from '../../core/active-problem-dismissal.js';

let mounted = false;
let root;
const dismissalState = createProblemDismissalState();

function $(sel) {
  return document.querySelector(sel);
}

export function mountActiveProblemsPanel() {
  if (mounted) return root;
  const wrap = document.createElement('div');
  wrap.innerHTML = tpl;
  document.body.appendChild(wrap.firstElementChild);
  root = document.getElementById('ykt-active-problems-panel');
  mounted = true;

  setInterval(() => updateActiveProblems(), 1000);
  return root;
}

export function updateActiveProblems() {
  mountActiveProblemsPanel();
  const box = $('#ykt-active-problems');
  box.innerHTML = '';

  const now = Date.now();
  const activeProblemIds = new Set();

  repo.problemStatus.forEach((status, pid) => {
    const p = repo.problems.get(pid)
      || repo.problems.get(String(pid))
      || repo.problems.get(Number.isNaN(Number(pid)) ? pid : Number(pid));
    if (!p || p.result) return;

    const remain = getProblemRemainingSeconds(status.endTime, now);

    const pidStr = String(pid);
    activeProblemIds.add(pidStr);
    if (dismissalState.isDismissed(pidStr)) return;

    const card = document.createElement('div');
    card.className = 'active-problem-card';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ap-close';
    close.title = '关闭题目提示';
    close.setAttribute('aria-label', '关闭题目提示');
    close.textContent = '×';
    close.onclick = event => {
      event.stopPropagation();
      dismissalState.dismiss(pidStr);
      card.remove();
      if (box.children.length === 0) root.style.display = 'none';
    };
    card.appendChild(close);

    const title = document.createElement('div');
    title.className = 'ap-title';
    title.textContent = (p.body || `题目 ${pid}`).slice(0, 80);
    card.appendChild(title);

    const info = document.createElement('div');
    info.className = 'ap-info';
    const expired = remain !== null && remain <= 0;
    info.textContent = remain === null ? '不限时' : (expired ? '已过截止时间，可强制补交' : `剩余 ${remain}s`);
    card.appendChild(info);

    const bar = document.createElement('div');
    bar.className = 'ap-actions';

    const go = document.createElement('button');
    go.textContent = '查看';
    go.onclick = () => actions.navigateTo(status.presentationId, status.slideId);
    bar.appendChild(go);

    const ai = document.createElement('button');
    ai.textContent = 'AI 强制作答';
    ai.onclick = async () => {
      ai.disabled = true;
      try {
        const result = await actions.forceAIAnswer(pid);
        if (!result?.ok && result?.reason !== 'answering') {
          console.warn('[雨课堂助手][WARN][ActiveProblems] AI 强制作答失败:', result);
        }
      } finally {
        ai.disabled = false;
        updateActiveProblems();
      }
    };
    bar.appendChild(ai);

    const edit = document.createElement('button');
    edit.textContent = '编辑/补交';
    edit.onclick = () => {
      actions.navigateTo(status.presentationId, status.slideId);
      window.dispatchEvent(new CustomEvent('ykt:open-problem-list', { detail: { problemId: pid } }));
    };
    bar.appendChild(edit);

    card.appendChild(bar);
    box.appendChild(card);
  });

  dismissalState.prune(activeProblemIds);
  if (box.children.length === 0) {
    root.style.display = 'none';
  } else {
    root.style.display = '';
  }
}
