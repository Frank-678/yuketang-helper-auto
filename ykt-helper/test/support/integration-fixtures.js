export function installFakeImageCanvas(document, { base64 = 'QUJD', width = 16, height = 9 } = {}) {
  const originalCreateElement = document.createElement;
  const previousImage = globalThis.Image;

  document.createElement = tagName => {
    if (String(tagName).toLowerCase() === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext() { return { drawImage() {} }; },
        toDataURL() { return `data:image/jpeg;base64,${base64}`; },
      };
    }
    return originalCreateElement(tagName);
  };

  globalThis.Image = class FakeImage {
    constructor() {
      this.width = width;
      this.height = height;
      this.crossOrigin = '';
      this.onload = null;
      this.onerror = null;
      this._src = '';
    }
    set src(value) {
      this._src = value;
      queueMicrotask(() => this.onload?.());
    }
    get src() { return this._src; }
  };

  return () => {
    document.createElement = originalCreateElement;
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
  };
}

export function resetRepoState(repo, lessonId = 'lesson-test') {
  repo.presentations?.clear?.();
  repo.slides?.clear?.();
  repo.problems?.clear?.();
  repo.problemStatus?.clear?.();
  if (Array.isArray(repo.encounteredProblems)) repo.encounteredProblems.length = 0;
  repo.listeningLessons?.clear?.();
  repo.lessonTokens?.clear?.();
  repo.lessonSockets?.clear?.();
  repo.activeLessons?.clear?.();
  repo.autoJoinedLessons?.clear?.();
  repo.forceAutoAnswerLessons?.clear?.();
  repo.currentPresentationId = null;
  repo.currentSlideId = null;
  repo.currentLessonId = lessonId;
  repo.currentSelectedUrl = null;
  repo.autoJoinRunning = false;
  return lessonId;
}

export function addChoiceProblem(repo, {
  problemId = 'q1',
  slideId = 's1',
  presentationId = 'p1',
  lessonId = repo.currentLessonId || 'lesson-test',
  result = null,
  cover = `https://img.example/${slideId}.jpg`,
} = {}) {
  const problem = {
    problemId,
    problemType: 1,
    body: '2 + 2 = ?',
    options: [
      { key: 'A', value: '4' },
      { key: 'B', value: '5' },
    ],
    result,
    slideId,
    presentationId,
    lessonId,
  };
  const slide = { id: slideId, cover, problem };
  repo.upsertProblem(problem);
  repo.upsertSlide(slide);
  return { problem, slide };
}

export async function waitFor(predicate, timeoutMs = 500, pollMs = 5) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  return false;
}
