// src/ui/toolbar.js
import { ui } from './ui-context.js';
import { trustedUiHandler } from '../core/trusted-ui-event.js';

export function installToolbar() {
  // 仅创建容器与按钮；具体面板之后用 HTML/Vue 接入
  const bar = document.createElement('div');
  bar.id = 'ykt-helper-toolbar';
  bar.innerHTML = `
    <span id="ykt-btn-bell" class="btn" title="习题提醒"><i class="fas fa-bell"></i></span>
    <span id="ykt-btn-pres" class="btn" title="课件浏览"><i class="fas fa-file-powerpoint"></i></span>
    <span id="ykt-btn-ai" class="btn" title="AI解答"><i class="fas fa-robot"></i></span>
    <span id="ykt-btn-auto-answer" class="btn" title="自动作答"><i class="fas fa-magic-wand-sparkles"></i></span>
    <span id="ykt-btn-settings" class="btn" title="设置"><i class="fas fa-cog"></i></span>
    <span id="ykt-btn-help" class="btn" title="使用教程"><i class="fas fa-question-circle"></i></span>
  `;
  document.body.appendChild(bar);

  // 初始激活态
  if (ui.config.notifyProblems) bar.querySelector('#ykt-btn-bell')?.classList.add('active');
  ui.updateAutoAnswerBtn();

  // 事件绑定
  bar.querySelector('#ykt-btn-bell')?.addEventListener('click', trustedUiHandler(() => {
    const previous = ui.config.notifyProblems;
    ui.config.notifyProblems = !previous;
    if (ui.saveConfig() === false) {
      ui.config.notifyProblems = previous;
      ui.toast('设置保存失败，修改未应用', 4000);
      return;
    }
    ui.toast(`习题提醒：${ui.config.notifyProblems ? '开' : '关'}`);
    bar.querySelector('#ykt-btn-bell')?.classList.toggle('active', ui.config.notifyProblems);
  }));

  // 课件浏览按钮
  bar.querySelector('#ykt-btn-pres')?.addEventListener('click', trustedUiHandler(() => {
    const btn = bar.querySelector('#ykt-btn-pres');
    const isActive = btn.classList.contains('active');
    ui.showPresentationPanel?.(!isActive);
    btn.classList.toggle('active', !isActive);
  }));

  // AI按钮
  bar.querySelector('#ykt-btn-ai')?.addEventListener('click', trustedUiHandler(() => {
    const btn = bar.querySelector('#ykt-btn-ai');
    const isActive = btn.classList.contains('active');
    ui.showAIPanel?.(!isActive);
    btn.classList.toggle('active', !isActive);
  }));

  bar.querySelector('#ykt-btn-auto-answer')?.addEventListener('click', trustedUiHandler(() => {
    const previous = ui.config.autoAnswer;
    ui.config.autoAnswer = !previous;
    if (ui.saveConfig() === false) {
      ui.config.autoAnswer = previous;
      ui.updateAutoAnswerBtn();
      ui.toast('设置保存失败，修改未应用', 4000);
      return;
    }
    ui.toast(`自动作答：${ui.config.autoAnswer ? '开' : '关'}`);
    ui.updateAutoAnswerBtn();
  }));

  bar.querySelector('#ykt-btn-settings')?.addEventListener('click', trustedUiHandler(() => {
    ui.toggleSettingsPanel?.();
  }));

  bar.querySelector('#ykt-btn-help')?.addEventListener('click', trustedUiHandler(() => {
    ui.toggleTutorialPanel?.();
  }));
}
