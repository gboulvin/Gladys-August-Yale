import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { AugustAccount } from '../src/account.js';
import { normalizeConfig } from '../src/config.js';
import { LOCK_STATE_LABELS, MESSAGES } from '../src/i18n.js';
import { relativeTime, refreshWidgets, WIDGET_KEYS, WIDGETS } from '../src/widgets.js';
import {
  activity,
  createFakeCloud,
  DOORBELL_ID,
  HOUSE_ID,
  LOCK_ID,
  lockDetail,
  tempDataDir,
  TEST_CONFIG,
} from './helpers/fakeCloud.js';

async function connectedAccount(config = {}, cloud = createFakeCloud()) {
  const gladys = createFakeGladys();
  const account = new AugustAccount({
    gladys,
    dataDir: await tempDataDir(),
    fetchImpl: cloud.fetch,
    timers: false,
  });
  await account.start(normalizeConfig({ ...TEST_CONFIG, ...config }));
  await account.validateCode(cloud.validCode);
  return { account, gladys, cloud };
}

const request = (settings = {}, language = 'fr') => ({ settings, language, units: 'metric' });

for (const language of ['en', 'fr', 'de', 'es']) {
  test(`every widget renders exactly as sent (${language})`, async () => {
    const { account, gladys, cloud } = await connectedAccount();
    cloud.activities[HOUSE_ID] = [
      activity('unlock', { at: Date.now() + 1000, info: { keypad: true } }),
      activity('doorbell_call_initiated', { deviceId: DOORBELL_ID, at: Date.now() + 2000 }),
    ];
    await account.pollActivities();
    const contents = [
      await WIDGETS.lock.get(account, request({}, language)),
      await WIDGETS.lock.get(
        account,
        request({ device: `ext:${gladys.selector}:lock:${LOCK_ID}` }, language),
      ),
      await WIDGETS.doorbell.get(account, request({}, language)),
      await WIDGETS.activity.get(account, request({}, language)),
    ];
    for (const content of contents) {
      assert.deepEqual(validateWidgetContent(content), []);
    }
  });
}

test('the widgets say so when the account is not connected', async () => {
  const account = new AugustAccount({
    gladys: createFakeGladys(),
    dataDir: await tempDataDir(),
    timers: false,
  });
  for (const widget of Object.values(WIDGETS)) {
    const content = await widget.get(account, request());
    assert.deepEqual(validateWidgetContent(content), []);
    assert.equal(content.components[0].type, 'text');
  }
});

test('the lock widget binds its tiles to the published features', async () => {
  const { account, gladys } = await connectedAccount();
  const device = `ext:${gladys.selector}:lock:${LOCK_ID}`;
  const content = await WIDGETS.lock.get(account, request({ device }));
  const features = new Set(
    gladys.fake.discoveredDevices.flatMap((d) => d.features.map((f) => f.external_id)),
  );
  const tiles = content.components.filter((c) => c.device_feature);
  assert.equal(tiles.length, 4);
  for (const tile of tiles) assert.ok(features.has(tile.device_feature));
});

test('unlock buttons ask for a confirmation, and disappear when unlocking is forbidden', async () => {
  const cloud = createFakeCloud();
  cloud.locks[LOCK_ID] = lockDetail({ supportsUnlatch: true });
  const { account, gladys } = await connectedAccount({}, cloud);
  const device = `ext:${gladys.selector}:lock:${LOCK_ID}`;
  const buttons = (await WIDGETS.lock.get(account, request({ device }))).components.filter(
    (c) => c.type === 'button',
  );
  assert.deepEqual(
    buttons.map((b) => b.action.key),
    ['lock', 'unlock', 'unlatch'],
  );
  assert.equal(buttons[1].action.confirm, true);
  assert.equal(buttons[2].action.confirm, true);

  account.config.allow_unlock = false;
  const restricted = (await WIDGETS.lock.get(account, request({ device }))).components.filter(
    (c) => c.type === 'button',
  );
  assert.deepEqual(
    restricted.map((b) => b.action.key),
    ['lock'],
  );
});

test('the widget buttons operate the lock and answer a short toast', async () => {
  const { account, gladys } = await connectedAccount();
  const params = { device: `ext:${gladys.selector}:lock:${LOCK_ID}` };
  assert.deepEqual(
    await WIDGETS.lock.action(account, { actionKey: 'unlock', params }),
    LOCK_STATE_LABELS.unlocked,
  );
  assert.deepEqual(
    await WIDGETS.lock.action(account, { actionKey: 'lock_all', params: {} }),
    MESSAGES.allLocksLocked,
  );
  assert.deepEqual(
    await WIDGETS.doorbell.action(account, {
      actionKey: 'wakeup',
      params: { device: `ext:${gladys.selector}:doorbell:${DOORBELL_ID}` },
    }),
    MESSAGES.imageRequested,
  );
  await assert.rejects(
    WIDGETS.lock.action(account, { actionKey: 'nope', params }),
    /Unknown widget action/,
  );
});

test('a lock that does not answer makes "lock everything" say so', async () => {
  const { account, cloud } = await connectedAccount();
  cloud.operationStatus = 504;
  assert.deepEqual(
    await WIDGETS.lock.action(account, { actionKey: 'lock_all', params: {} }),
    MESSAGES.someLocksFailed,
  );
});

test('relativeTime speaks the user language', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  assert.equal(relativeTime(now - 5 * 60_000, 'en', now), '5 min. ago');
  assert.match(relativeTime(now - 2 * 3_600_000, 'fr', now), /il y a 2/);
  assert.equal(relativeTime(null, 'de', now).de, 'Noch keine');
});

test('refreshWidgets nudges every widget', () => {
  const gladys = createFakeGladys();
  refreshWidgets(gladys);
  assert.deepEqual(gladys.fake.widgetRefreshes, Object.values(WIDGET_KEYS));
});
