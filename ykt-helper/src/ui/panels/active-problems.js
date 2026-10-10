import tpl from './active-problems.html';

// 活动题目不再在右下角重复展示。题目操作统一放在当前课件页和题目列表中。
let mounted = false;
let root;

export function mountActiveProblemsPanel() {
  if (mounted) return root;

  const wrap = document.createElement('div');
  wrap.innerHTML = tpl;
  document.body.appendChild(wrap.firstElementChild);
  root = document.getElementById('ykt-active-problems-panel');
  if (root) root.style.display = 'none';
  mounted = true;
  return root;
}

export function updateActiveProblems() {
  const panel = mountActiveProblemsPanel();
  if (!panel) return;

  // 保留旧接口，避免状态更新路径需要分支；右下角始终保持隐藏且不渲染题目内容。
  panel.style.display = 'none';
}
