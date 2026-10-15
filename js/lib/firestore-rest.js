// Minimal Firestore REST client for public documents. Used by the build (Node) and by public pages,
// so visitors never download the Firebase SDK. Writes are limited to creating form responses.

export function decodeValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if (v.arrayValue) return (v.arrayValue.values || []).map(decodeValue);
  if (v.mapValue) return decodeFields(v.mapValue.fields);
  return null;
}

export const decodeFields = (fields = {}) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));

export function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v) } };
  return { stringValue: String(v) };
}
export const encodeFields = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encodeValue(v)]));

export class FirestoreError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * origin: 'https://firestore.googleapis.com' or an emulator such as 'http://127.0.0.1:8080'.
 */
export function firestoreREST(
  projectId,
  { origin = 'https://firestore.googleapis.com', timeout = 15000, fetchImpl = globalThis.fetch } = {},
) {
  const base = `${origin}/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
  async function request(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetchImpl(`${base}/${path}`, { signal: controller.signal, cache: 'no-store' });
      if (response.status === 404) return null;
      if (!response.ok)
        throw new FirestoreError(`Firestore request failed (${response.status}) for ${path.split('?')[0]}`, response.status);
      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') throw new FirestoreError('The chapter database did not respond in time.', 0);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    /**
     * Creates a document that must not exist yet, with `timeField` set to the server time.
     * Resolves 'created', or 'exists' when a document with this ID is already there.
     */
    async create(path, data, { timeField } = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const name = `projects/${projectId}/databases/(default)/documents/${path}`;
      try {
        const response = await fetchImpl(`${base}:commit`, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            writes: [
              {
                update: { name, fields: encodeFields(data) },
                ...(timeField ? { updateTransforms: [{ fieldPath: timeField, setToServerValue: 'REQUEST_TIME' }] } : {}),
                currentDocument: { exists: false },
              },
            ],
          }),
        });
        if (response.ok) return 'created';
        const body = await response.json().catch(() => ({}));
        const status = body.error?.status || '';
        if (response.status === 409 || status === 'ALREADY_EXISTS' || status === 'FAILED_PRECONDITION') return 'exists';
        throw new FirestoreError(`Firestore write failed (${response.status} ${status})`, response.status);
      } catch (error) {
        if (error.name === 'AbortError') throw new FirestoreError('The chapter database did not respond in time.', 0);
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
    /** A document's fields, or null when it does not exist. */
    async get(path) {
      const doc = await request(path.split('/').map(encodeURIComponent).join('/'));
      return doc ? decodeFields(doc.fields) : null;
    },
    /** Every document in a collection as { id, data }. */
    async list(collection, { pageSize = 300, max = 3000 } = {}) {
      const results = [];
      let token = '';
      do {
        const page = await request(
          `${encodeURIComponent(collection)}?pageSize=${pageSize}${token ? '&pageToken=' + encodeURIComponent(token) : ''}`,
        );
        for (const doc of page?.documents || []) results.push({ id: doc.name.split('/').pop(), data: decodeFields(doc.fields) });
        token = page?.nextPageToken || '';
      } while (token && results.length < max);
      return results;
    },
  };
}
