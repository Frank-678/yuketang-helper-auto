/**
 * Convert the editable answer box into the structure expected by the answer
 * API.  JSON is preferred, while short plain-text forms remain convenient on
 * a phone keyboard.
 */

function cleanText(value) {
  return String(value ?? '').trim();
}

function uniqueSortedLetters(value) {
  const letters = String(value).toUpperCase().match(/[A-Z]/g) || [];
  return [...new Set(letters)].sort();
}

export function parseEditableAnswer(problemType, rawValue) {
  const raw = String(rawValue ?? '');
  const text = cleanText(raw);
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object') {
      if ([1, 2, 3].includes(problemType) && Array.isArray(parsed)) {
        return parsed.length ? parsed : null;
      }
      if (problemType === 4 && Array.isArray(parsed)) {
        return parsed.length ? parsed : null;
      }
      if (problemType === 5 && typeof parsed.content === 'string' && parsed.content.trim()) {
        return { content: parsed.content, pics: Array.isArray(parsed.pics) ? parsed.pics : [] };
      }
    }
  } catch {
    // Continue with the plain-text formats below.
  }

  switch (problemType) {
    case 1:
    case 2:
    case 3: {
      const letters = uniqueSortedLetters(text);
      return letters.length ? letters : null;
    }
    case 4: {
      const blanks = raw
        .split(/[,，;；\n]+/)
        .map(item => item.trim())
        .filter(Boolean);
      return blanks.length ? blanks : null;
    }
    case 5:
      return { content: text, pics: [] };
    default:
      return text;
  }
}

export function formatEditableAnswer(value) {
  try { return JSON.stringify(value, null, 2); } catch { return String(value ?? ''); }
}

export function buildAnswerSubmitOptions(status = {}, {
  lessonId = null,
  forceRetry = false,
} = {}) {
  return {
    startTime: status.startTime ?? null,
    endTime: status.endTime ?? null,
    forceRetry: forceRetry === true,
    lessonId,
    autoGate: false,
    waitMs: 0,
  };
}
