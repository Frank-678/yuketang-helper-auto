import { hasSubmittedAnswer } from './answer-state.js';

export function isProblemAnswered(problem = {}, status = {}) {
  if (hasSubmittedAnswer(problem?.result)) return true;
  if (hasSubmittedAnswer(status?.myAnswer)) return true;
  return status?.answered === true;
}

export function getFiniteDeadline(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return undefined;
}

export function isProblemExpired(now = Date.now(), ...deadlineValues) {
  const endTime = getFiniteDeadline(...deadlineValues);
  return endTime !== undefined && Number(now) >= endTime;
}
