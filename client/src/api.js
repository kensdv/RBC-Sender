export async function api(token, path, options = {}) {
  const headers = { Authorization: `Bearer ${token}`, ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const contentType = response.headers.get('content-type') || '';
  const result = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const error = new Error(result.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return result;
}
