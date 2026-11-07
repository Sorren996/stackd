import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
let client;
globalThis.__startupProfileMocks = {
  createClientFromRequest: () => client,
  normalizeEmail: value => value.toLowerCase(),
  ok: body => Response.json({ ok: true, ...body }),
  fail: (reason, status) => Response.json({ ok: false, reason }, { status }),
  publicRelationship: row => row,
  audit: () => { throw new Error('Unexpected write'); },
  readBody: req => req.json(),
};
const source = (await readFile(new URL('../../../base44/functions/getMyAccessProfile/entry.ts', import.meta.url), 'utf8')).replace(/^import[\s\S]*?;\s*/gm, '');
const js = ts.transpileModule(`const {createClientFromRequest,normalizeEmail,ok,fail,publicRelationship,audit,readBody}=globalThis.__startupProfileMocks;\n${source}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { default: handler } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const httpError = status => Object.assign(new Error('private content'), { status });
function mock(overrides = {}, authError) {
  const entities = Object.fromEntries(['SharedAccess','SharedInvitation','FollowerNotice','UserSettings','GlucoseReading','CarbEntry','InsulinDose','JournalEntry','DexcomConnection'].map(name => [name, {
    filter: async () => { const value = overrides[name] ?? []; if (value instanceof Error) throw value; return value; },
    update: () => { throw new Error('Unexpected write'); }, create: () => { throw new Error('Unexpected write'); },
  }]));
  return { auth: { me: async () => { if (authError) throw authError; return { id: 'test-account', email: 'test@example.test' }; } }, entities, asServiceRole: { entities } };
}
const invoke = () => handler(new Request('https://example.test/check', { method: 'POST', body: '{}' }));
test('auth unavailability stays 503, real 401/403 remain denials', async () => {
  for (const status of [503,401,403]) { client = mock({}, httpError(status)); assert.equal((await invoke()).status, status); }
});
test('failed or malformed follower signals never default to follower', async () => {
  for (const value of [httpError(503), {}]) {
    client = mock({ SharedAccess: [{ id: 'rel' }], UserSettings: value });
    const response = await invoke(); assert.equal(response.status, 503); assert.equal((await response.json()).ok, false);
  }
});
test('only successful authoritative reads select patient or follower', async () => {
  client = mock(); assert.equal((await (await invoke()).json()).mode, 'patient');
  client = mock({ SharedAccess: [{ id: 'rel' }] }); assert.equal((await (await invoke()).json()).mode, 'follower');
  client = mock({ SharedAccess: [{ id: 'rel' }], GlucoseReading: [{ created_by_id: 'test-account' }] });
  assert.equal((await (await invoke()).json()).mode, 'patient');
});
test('rate-limit status and Retry-After are preserved', async () => {
  client = mock({}, Object.assign(httpError(429), { originalError: { response: { headers: { 'retry-after': '80' } } } }));
  const response = await invoke(); assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '80');
});