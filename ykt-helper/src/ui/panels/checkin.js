import { ui } from '../ui-api.js';
import { repo } from '../../state/repo.js';
import { actions } from '../../state/actions.js';
import { getOnLesson } from '../../net/xhr-interceptor.js';
import { getLessonCheckinState } from '../../net/checkin-client.js';

let root, list, channel, autoJoin, summary, refreshButton, lessons = [], listedAccount = null, activeLoad = null;
let listPhase = 'idle', listError = '';
const create = (tag, text, cls) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (cls) el.className = cls; return el; };

export function mountCheckinPanel() {
  if (root) return root;
  root = create('section', null, 'ykt-panel'); root.id = 'ykt-checkin-panel';
  const header = create('div', null, 'panel-header'), title = create('h3', '课堂签到'), close = create('button', '×'); close.type = 'button'; close.setAttribute('aria-label', '关闭签到面板'); close.onclick = () => showCheckinPanel(false); header.append(title, close);
  const body = create('div', null, 'panel-body'), label = create('label');
  channel = create('input'); channel.type = 'checkbox'; channel.id = 'ykt-checkin-dynamic';
  channel.onchange = () => { ui.config.dynamicQrCheckin = channel.checked; ui.saveConfig(); channel.checked = !!ui.config.dynamicQrCheckin; };
  label.append(channel, document.createTextNode(' 动态码课堂免扫码签到'));
  const autoLabel = create('label');
  autoJoin = create('input'); autoJoin.type = 'checkbox'; autoJoin.id = 'ykt-checkin-auto';
  autoJoin.onchange = () => { ui.config.autoJoinEnabled = autoJoin.checked; ui.saveConfig(); autoJoin.checked = !!ui.config.autoJoinEnabled; };
  autoLabel.append(autoJoin, document.createTextNode(' 开课后自动签到并进入课堂'));
  refreshButton = create('button', '刷新正在上课的课堂'); refreshButton.type = 'button'; refreshButton.id = 'ykt-checkin-refresh'; refreshButton.onclick = loadLiveLessons;
  summary = create('p', ''); summary.setAttribute('role', 'status');
  list = create('div'); list.id = 'ykt-checkin-list';
  body.append(label, autoLabel, refreshButton, summary, list); root.append(header, body); document.body.appendChild(root);
  window.addEventListener('ykt:checkin-changed', () => { if (root.classList.contains('visible')) renderCheckinList(); });
  window.addEventListener('ykt:lesson-change', () => { if (root.classList.contains('visible')) renderCheckinList(); });
  window.addEventListener('ykt:config-changed', () => { channel.checked = !!ui.config.dynamicQrCheckin; autoJoin.checked = !!ui.config.autoJoinEnabled; });
  setInterval(() => { if (root.classList.contains('visible')) renderCheckinList(); }, 1000);
  return root;
}

export function renderCheckinList() {
  if (!root) return;
  if (listedAccount !== repo.accountId) {
    const previous = activeLoad; activeLoad = null; previous?.controller.abort();
    lessons = []; listedAccount = repo.accountId; listPhase = 'idle'; listError = '';
  }
  refreshButton.disabled = listPhase === 'loading';
  refreshButton.textContent = listPhase === 'loading' ? '正在刷新课堂…' : '刷新正在上课的课堂';
  summary.textContent = listPhase === 'loading' ? '正在读取课堂列表…' : listPhase === 'error' ? `课堂列表读取失败：${listError}` : listPhase === 'loaded' ? lessons.length ? `已读取 ${lessons.length} 个正在上课的课堂，选择课堂即可签到。` : '课堂列表读取成功：当前没有正在上课的课堂。' : '尚未读取正在上课的课堂。';
  channel.checked = !!ui.config.dynamicQrCheckin;
  autoJoin.checked = !!ui.config.autoJoinEnabled;
  const all = new Map();
  if (repo.currentLessonId) all.set(String(repo.currentLessonId), { title: '当前课堂', lessonId: repo.currentLessonId });
  for (const lesson of lessons) {
    const id = String(lesson.lessonId ?? lesson.lesson_id ?? lesson.id ?? '');
    if (id) all.set(id, lesson);
  }
  list.replaceChildren();
  for (const [id, lesson] of all) {
    const state = getLessonCheckinState(id), row = create('div', null, 'checkin-row'); row.dataset.lessonId = id;
    const title = create('div', lesson.courseName || lesson.classroomName || lesson.name || lesson.title || `课堂 ${id}`, 'checkin-title');
    const status = create('p', ({ idle: '尚未签到', identifying: '正在识别当前登录账号…', preparing: '正在读取签到登录态…', signing: '正在签到…', confirmed: '服务器已确认签到', refused: '动态码通道被服务器拒绝', unknown: '签到结果待核实', failed: '签到失败', cancelled: '签到已停止' })[state.phase] || state.phase, 'checkin-status');
    const connection = repo.isLessonConnected(id);
    const detail = create('p', state.lastError || (state.phase === 'confirmed' ? `${state.channel === 'app' ? '客户端' : '普通'}通道 · ${connection?.readyState === 1 ? '课堂连接已建立' : connection?.readyState === 0 ? '正在连接课堂' : '等待课堂连接'}` : ''), 'checkin-detail');
    const button = create('button', state.phase === 'confirmed' ? '重新签到并连接' : '立即签到'); button.type = 'button'; button.disabled = ['identifying', 'preparing', 'signing'].includes(state.phase);
    button.onclick = async () => {
      button.disabled = true;
      try { await actions.joinClassroom(id, { force: true }); }
      catch (error) { ui.toast(error.message, 5000); }
      finally { renderCheckinList(); }
    };
    row.append(title, status, detail, button); list.appendChild(row);
  }
  if (!all.size) list.appendChild(create('p', listPhase === 'loaded' ? '暂无正在上课的课堂。可在老师开课后刷新。' : listPhase === 'error' ? '课堂列表未能读取，请重试。' : '等待课堂列表读取结果。'));
}

async function loadLiveLessons() {
  const account = repo.accountId;
  if (activeLoad?.account === account) return;
  activeLoad?.controller.abort();
  if (listedAccount !== account) { lessons = []; listedAccount = account; }
  const task = { account, controller: new AbortController() }; activeLoad = task;
  listPhase = 'loading'; listError = ''; renderCheckinList();
  try {
    const found = await getOnLesson({ signal: task.controller.signal });
    if (repo.accountId !== account || activeLoad !== task) return;
    lessons = found; listPhase = 'loaded';
    renderCheckinList();
  } catch (error) {
    if (repo.accountId === account && activeLoad === task) { lessons = []; listPhase = 'error'; listError = error.message; renderCheckinList(); }
  } finally { if (activeLoad === task) { activeLoad = null; renderCheckinList(); } }
}

export function showCheckinPanel(visible = true) {
  mountCheckinPanel(); root.classList.toggle('visible', !!visible);
  document.getElementById('ykt-btn-checkin')?.classList.toggle('active', !!visible);
  if (visible) { renderCheckinList(); ui._bringToFront(root); void loadLiveLessons(); }
}
