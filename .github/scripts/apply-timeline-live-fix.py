from pathlib import Path

path = Path('ykt-helper/src/state/actions.js')
text = path.read_text(encoding='utf-8')

import_anchor = "import { isLiveProblemSource } from '../core/problem-event-source.js';\n"
import_line = "import { createTimelineProblemTracker } from '../core/timeline-problem-tracker.js';\n"
if import_line not in text:
    if text.count(import_anchor) != 1:
        raise SystemExit(f'Expected one problem-event-source import, found {text.count(import_anchor)}')
    text = text.replace(import_anchor, import_anchor + import_line, 1)

instance_anchor = "const danmuFollowControllers = new Map();\n"
instance_line = "const timelineProblemTracker = createTimelineProblemTracker();\n"
if instance_line not in text:
    if text.count(instance_anchor) != 1:
        raise SystemExit(f'Expected one danmu controller map anchor, found {text.count(instance_anchor)}')
    text = text.replace(instance_anchor, instance_anchor + instance_line, 1)

old_block = """  onFetchTimeline(timeline, options = {}) {
    for (const piece of Array.isArray(timeline) ? timeline : []) {
      if (piece?.type === 'problem') {
        this.onUnlockProblem(piece, { ...options, source: 'timeline' });
      }
    }
  },
"""
new_block = """  onFetchTimeline(timeline, options = {}) {
    const lessonId = options.lessonId || repo.currentLessonId || null;
    const entries = timelineProblemTracker.classify(timeline, { lessonId });
    const liveNew = entries.filter(entry => entry.isNew);
    console.log('[雨课堂助手][INFO][Timeline] 题目分类:', {
      lessonId: lessonId ? String(lessonId) : null,
      totalProblems: entries.length,
      liveNew: liveNew.length,
      phases: entries.map(entry => ({ key: entry.key, phase: entry.phase })),
    });

    for (const entry of entries) {
      if (entry.isNew) {
        console.log('[雨课堂助手][INFO][Timeline] 检测到实时新增题目:', entry.key);
      }
      this.onUnlockProblem(entry.piece, { ...options, source: entry.source });
    }
  },
"""

if new_block not in text:
    if text.count(old_block) != 1:
        raise SystemExit(f'Expected one original onFetchTimeline block, found {text.count(old_block)}')
    text = text.replace(old_block, new_block, 1)

path.write_text(text, encoding='utf-8')
print('Applied timeline live-delta fix successfully.')
