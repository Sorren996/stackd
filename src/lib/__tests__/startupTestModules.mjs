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
    .replaceAll('@/lib/startupRequest', requestUrl);
  return import(url(source));
}