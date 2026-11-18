export class LiveLessonsError extends Error {
  constructor(message, { code = null, status = 0, reason = 'invalid-list' } = {}) {
    super(message); this.name = 'LiveLessonsError'; this.code = code; this.status = status; this.reason = reason;
  }
}

function checkEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LiveLessonsError('课堂列表响应格式无效');
  if (value.success === false || (value.code != null && !(['number', 'string'].includes(typeof value.code) && String(value.code).trim() === '0'))) {
    const code = ['number', 'string'].includes(typeof value.code) && String(value.code).trim() !== '' ? Number(value.code) : null;
    const numeric = Number.isFinite(code) ? code : null;
    const reason = [50000, 401, 403].includes(numeric) ? '课堂列表接口未通过登录态校验' : '课堂列表接口返回失败';
    throw new LiveLessonsError(`${reason}${numeric == null ? '' : `（${numeric}）`}`, { code: numeric, reason: 'business-error' });
  }
}

export function parseLiveLessonResponse(body) {
  let json;
  try { json = typeof body === 'string' ? JSON.parse(body.replace(/("(?:lessonId|lesson_id|id)"\s*:\s*)(\d{16,})(?=\s*[,}])/g, '$1"$2"')) : body; }
  catch { throw new LiveLessonsError('课堂列表响应不是有效 JSON', { reason: 'invalid-json' }); }
  checkEnvelope(json);
  if (json.code == null && json.success !== true) throw new LiveLessonsError('服务器未确认课堂列表读取成功');
  const data = json.data ?? json.result ?? json;
  if (!Array.isArray(data)) checkEnvelope(data);
  const list = Array.isArray(data) ? data : data.onLessonClassrooms;
  if (!Array.isArray(list)) throw new LiveLessonsError('课堂列表响应缺少 onLessonClassrooms 数组');
  const lessons = new Map();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const value = raw.lessonId ?? raw.lesson_id ?? raw.id;
    if (!['string', 'number'].includes(typeof value) || typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) continue;
    const id = String(value).trim();
    if (id === '0' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) continue;
    // This endpoint already means "currently on lesson". Its items need not
    // have a status field; do not reinterpret another classroom status here.
    lessons.set(id, { ...raw, lessonId: id, status: 1 });
  }
  if (list.length && !lessons.size) throw new LiveLessonsError('服务器返回了课堂记录，但未识别到有效课堂编号');
  return [...lessons.values()];
}
