// Both network transports must accept the classroom's presentation contract.
// /presentation/fetch identifies the deck in the URL; data.id is optional.
export function isSuccessfulClassroomResponse(json) {
  return !!json && typeof json === 'object' && json.success !== false
    && (json.code === undefined || Number(json.code) === 0);
}

export function parsePresentationResponse(url, json) {
  if (!isSuccessfulClassroomResponse(json)) return null;
  const data = json.data ?? json.result ?? json;
  if (!data || !Array.isArray(data.slides)) return null;
  let queryId;
  try {
    const query = new URL(url, 'https://placeholder.invalid/').searchParams;
    queryId = query.get('presentation_id') || query.get('presentationId');
  } catch {}
  const id = [queryId, data.id, data.presentationId, data.presentation_id]
    .find(value => value != null && String(value).trim() !== '');
  if (id == null) return null;
  return { id: String(id), data };
}
