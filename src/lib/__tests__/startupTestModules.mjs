import { readFile } from 'node:fs/promises';
const file = name => new URL(`../${name}.js`, import.meta.url).href;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const requestSource = (await readFile(new URL('../startupRequest.js', import.meta.url), 'utf8'))
  .replace('@/lib/startupAwait', file('startupAwait'))
  .replace('@/lib/startupTransport', file('startupTransport'))
  .replace('@/lib/startupDiagnostics', file('startupDiagnostics'));
export const requestUrl = url(requestSource);
export const requestModule = await import(requestUrl);
export async function startupModule(name) {
  const source = (await readFile(new URL(`../${name}.js`, import.meta.url), 'utf8'))
    .replaceAll('@/lib/startupRequest', requestUrl)
    .replaceAll('@/lib/startupAwait', file('startupAwait'))
    .replaceAll('@/lib/startupHttp', file('startupHttp'));
  return import(url(source));
}

// Exercise the real cancellable HTTP adapter using the existing fixture data.
export function mockStartupClient(client) {
  client.getConfig = () => ({ appId: 'test-app' });
  client.fetchWithAuth = async path => {
    const url = new URL(path, 'https://example.test');
    const entity = url.pathname.split('/entities/')[1];
    const result = entity === 'User/me' ? await client.auth.me()
      : await client.entities[entity].filter(JSON.parse(url.searchParams.get('q')), url.searchParams.get('sort'), Number(url.searchParams.get('limit')));
    return Response.json(result);
  };
  return client;
}