import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { notificationFormError, notificationValue } from '../notifications/notificationForm.js';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const Module = require('node:module');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const result = await build({ stdin: { contents: `export {default as Personal} from './src/components/notifications/PersonalNotificationSettings.jsx'; export {default as Follower} from './src/components/notifications/FollowedPersonNotifications.jsx'; export {default as Fields} from './src/components/notifications/NotificationRuleFields.jsx';`, resolveDir: root, loader: 'jsx' }, bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react', 'react/jsx-runtime', '@radix-ui/*', 'clsx', 'tailwind-merge'], jsx: 'automatic', alias: { '@': `${root}/src` }, plugins: [{ name: 'static-form-no-network', setup(builder) { builder.onLoad({ filter: /notificationApi\.js$/ }, () => ({ contents: `export const describeNotificationError = () => 'Save failed';`, loader: 'js' })); } }] });
const compiled = new Module(`${root}/notification-ui-test.cjs`);
compiled.paths = Module._nodeModulePaths(root);
// Existing shared UI utilities inspect frame identity at import time; supply
// only that browser property, not a DOM or a simulated interactive browser.
const originalWindow = globalThis.window;
globalThis.window = { self: null, top: null };
try { compiled._compile(result.outputFiles[0].text, `${root}/notification-ui-test.cjs`); }
finally { if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; }
const { Personal, Follower, Fields } = compiled.exports;
const preferences = { master_enabled: true, categories: {}, repeat_minutes: {} };
const thresholds = { target_low: 70, target_high: 180, units: 'mg/dL' };

test('personal UI renders eight switch rows in three groups, plus privacy and quiet controls', () => {
  const html = renderToStaticMarkup(React.createElement(Personal, { personal: preferences, thresholds, saving: false, onSave() {} }));
  for (const label of ['Custom low', 'Below comfort zone', 'Custom high', 'Above comfort zone', 'Falling fast', 'Rising fast', 'Urgent low', 'Missing readings']) assert.match(html, new RegExp(label));
  assert.equal((html.match(/<details/g) || []).length, 0);
  assert.match(html, /These settings change your alerts, not your comfort zone/);
  for (const label of ['Glucose levels', 'Changing quickly', 'Connection', 'Below 70 mg\/dL', 'Above 180 mg\/dL', 'Below 55 mg\/dL']) assert.ok(html.includes(label));
  assert.equal((html.match(/role="switch"/g) || []).length, 11);
  assert.equal((html.match(/>Edit<\/button>/g) || []).length, 8);
  assert.doesNotMatch(html, /≥|≤|not set mg\/dL|read-only|First-alert delay|Repeat within this episode/);
  assert.match(html, /Show health details in previews/);
  assert.match(html, /Quiet hours/);
  assert.doesNotMatch(html, /Recent notifications|Change your range settings/);
});

test('follower UI shows only authorized choices, hides denied custom/velocity controls and has no Recent list', () => {
  const html = renderToStaticMarkup(React.createElement(Follower, { person: { name: 'A friend', access_id: 'access', status: 'active', glucose_shared: true, thresholds, preferences, grants: { custom_low: true, urgent_low: true } }, saving: false, onSave() {} }));
  assert.equal((html.match(/>Edit<\/button>/g) || []).length, 2);
  assert.match(html, /Custom low/); assert.match(html, /Urgent low/);
  assert.doesNotMatch(html, /Custom high|Falling fast|Rising fast|Recent notifications/);
});

test('numeric level inputs show units and pace options remain explicit', () => {
  assert.equal(notificationValue(100, 'mmol/L'), '5.6');
  const html = renderToStaticMarkup(React.createElement(Fields, { rule: { key: 'custom_low', label: 'Custom low' }, draft: { ...preferences, custom_low_mgdl: 100 }, units: 'mmol/L', onChange() {} }));
  assert.match(html, /type="number"/); assert.match(html, /inputMode="decimal"/); assert.match(html, /value="5.6"/);
  assert.match(html, /Let me know at or below/); assert.match(html, /mmol\/L/);
  const pace = renderToStaticMarkup(React.createElement(Fields, { rule: { key: 'falling_fast', label: 'Falling fast' }, draft: preferences, units: 'mmol/L', onChange() {} }));
  assert.match(pace, /0.11 mmol\/L or faster \(2 mg\/dL\)/);
  assert.match(pace, /0.17 mmol\/L or faster \(3 mg\/dL\)/);
});

test('client prevents invalid separation, category-without-level, velocity-without-rate; values never enable categories', () => {
  assert.ok(notificationFormError({ ...preferences, custom_low_mgdl: 100, custom_high_mgdl: 119 }));
  assert.ok(notificationFormError({ ...preferences, categories: { custom_low: true } }));
  assert.ok(notificationFormError({ ...preferences, categories: { falling_fast: true } }));
  assert.equal(notificationFormError({ ...preferences, custom_low_mgdl: 100 }), null);
});

test('notification form edits have no dependencies on health calculations or consent/startup gates', async () => {
  for (const path of ['../../components/notifications/PersonalNotificationSettings.jsx', '../../components/notifications/FollowedPersonNotifications.jsx', '../../hooks/useNotificationDraft.js']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /saveUserSettings|target_range_low:|target_range_high:|required_reconsent|onboarding_completed|UserSettings\.update/);
  }
});