// Cancellable reads of the existing platform endpoints, with SDK credentials.
// No session logic, token changes, or navigation lives in this transport.
export async function startupJson(responsePromise) {
  const response = await responsePromise;
  if (!response.ok) {
    throw Object.assign(new Error('Startup request failed'), {
      status: response.status, httpResponse: true,
      response: { status: response.status, headers: response.headers },
    });
  }
  return response.json();
}

export function startupEntityRead(client, entity, query, sort, limit, signal) {
  const params = new URLSearchParams({ q: JSON.stringify(query), sort, limit: String(limit) });
  const appId = encodeURIComponent(client.getConfig().appId);
  return startupJson(client.fetchWithAuth(`/api/apps/${appId}/entities/${entity}?${params}`, {
    signal, cache: 'no-store', redirect: 'error', credentials: 'same-origin',
  }));
}

export function startupSessionRead(client, signal) {
  const appId = encodeURIComponent(client.getConfig().appId);
  return startupJson(client.fetchWithAuth(`/api/apps/${appId}/entities/User/me`, {
    signal, cache: 'no-store', redirect: 'error', credentials: 'same-origin',
  }));
}