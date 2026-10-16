// Every user-facing text exists in the four languages of the Gladys UI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import * as i18n from '../src/i18n.js';

const { LANGUAGES, join } = i18n;

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const isMultiLanguage = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  typeof value.en === 'string';

// Every multi-language object of a JSON tree, with its path.
function* multiLanguageTexts(node, path = '$') {
  if (isMultiLanguage(node)) {
    yield [path, node];
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      yield* multiLanguageTexts(value, `${path}.${key}`);
    }
  }
}

test('every manifest text is translated in en, fr, de and es', () => {
  let count = 0;
  for (const [path, text] of multiLanguageTexts(manifest)) {
    count += 1;
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), `${path} misses a language`);
    for (const lang of LANGUAGES) {
      assert.ok(text[lang].trim().length > 0, `${path}.${lang} is empty`);
    }
  }
  assert.ok(count > 50, 'the manifest texts were walked');
});

test('every runtime message is translated in en, fr, de and es', () => {
  const tables = [
    'MESSAGES',
    'LOCK_STATE_LABELS',
    'DOOR_STATE_LABELS',
    'ACTIVITY_LABELS',
    'METHOD_LABELS',
  ];
  for (const table of tables) {
    for (const [key, text] of Object.entries(i18n[table])) {
      assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), `${table}.${key}`);
    }
  }
});

test('join() builds one text per language', () => {
  assert.deepEqual(join([i18n.LOCK_STATE_LABELS.locked, '80 %'], ' · '), {
    en: 'Locked · 80 %',
    fr: 'Verrouillée · 80 %',
    de: 'Verriegelt · 80 %',
    es: 'Bloqueada · 80 %',
  });
});

test('the user documentation exists in the four languages', async () => {
  for (const lang of LANGUAGES) {
    const { size } = await stat(new URL(`../docs/${lang}.md`, import.meta.url));
    assert.ok(size >= 300, `docs/${lang}.md is too short for the store`);
  }
});
