export async function api(path, { method = 'GET', body } = {}) {
  const sendsBody = method === 'POST' || method === 'PUT' || method === 'PATCH';
  const response = await fetch(`/api${path}`, {
    method,
    headers: sendsBody ? { 'Content-Type': 'application/json' } : undefined,
    body: sendsBody ? JSON.stringify(body ?? {}) : undefined,
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error?.message ?? 'Something went wrong.');
    error.status = response.status;
    error.code = data?.error?.code;
    throw error;
  }
  return data;
}
