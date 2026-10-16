// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The store validator checks the manifest shape, but nothing there can know
// which handlers the code registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SCENE_TRIGGERS } from '../src/account.js';
import { MANIFEST_ACTIONS } from '../src/actions.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { WIDGETS } from '../src/widgets.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { BRANDS } from '../src/august/brands.js';
import { OPERATION_METHODS } from '../src/august/parsers.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) return version[i] > required[i];
  }
  return true;
}

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), Object.keys(MANIFEST_ACTIONS).sort());
});

test('every scene_actions key has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('every widget has a content handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
  for (const key of keysOf(manifest.widgets)) {
    assert.equal(typeof WIDGETS[key].get, 'function');
  }
});

test('every scene trigger the account fires is declared, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(SCENE_TRIGGERS).sort());
});

test('the lock_operated method filter lists the methods the parser reports', () => {
  const trigger = manifest.scene_triggers.find((t) => t.key === SCENE_TRIGGERS.LOCK_OPERATED);
  const methods = trigger.fields.find((f) => f.key === 'method').options.map((o) => o.value);
  // `unknown` is reported when the cloud says nothing, but is no filter.
  assert.deepEqual(methods.sort(), OPERATION_METHODS.filter((m) => m !== 'unknown').sort());
});

test('capability fields and categories require Gladys >= 5.1.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(isAtLeast(minGladysVersion(), [5, 1, 0]));
});

test('the brand options are the brands the client knows', () => {
  const brand = manifest.config_schema.find((f) => f.key === 'brand');
  assert.deepEqual(brand.options.map((o) => o.value).sort(), Object.keys(BRANDS).sort());
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
});

test('the password is a secret field', () => {
  assert.equal(manifest.config_schema.find((f) => f.key === 'password').type, 'secret');
});

test('the integration declares the cloud transport only', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  for (const field of allFields.filter((f) => f.source !== undefined)) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});

test('widget labels hold 3 to 30 characters and descriptions 100 at most', () => {
  for (const widget of manifest.widgets) {
    for (const text of Object.values(widget.label)) {
      assert.ok(text.length >= 3 && text.length <= 30, `widget ${widget.key}: "${text}"`);
    }
    for (const text of Object.values(widget.description ?? {})) {
      assert.ok(text.length <= 100, `widget ${widget.key}: "${text}"`);
    }
  }
});

test('field placeholders are multi-language objects', () => {
  for (const field of allFields.filter((f) => f.placeholder !== undefined)) {
    assert.equal(typeof field.placeholder, 'object');
  }
});
