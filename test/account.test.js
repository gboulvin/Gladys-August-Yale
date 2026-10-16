import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { AugustAccount, SCENE_TRIGGERS } from '../src/account.js';
import { AUTH_STATES } from '../src/august/session.js';
import { normalizeConfig } from '../src/config.js';
import { MESSAGES } from '../src/i18n.js';
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

async function setup({ trusted = true, config = {} } = {}) {
  const cloud = createFakeCloud();
  const gladys = createFakeGladys();
  const dataDir = await tempDataDir();
  const account = new AugustAccount({ gladys, dataDir, fetchImpl: cloud.fetch, timers: false });
  if (trusted) {
    // A first account validates the install id, as the user did once.
    const first = new AugustAccount({
      gladys: createFakeGladys(),
      dataDir,
      fetchImpl: cloud.fetch,
      timers: false,
    });
    await first.start(normalizeConfig(TEST_CONFIG));
    await first.validateCode(cloud.validCode);
    first.stop();
  }
  await account.start(normalizeConfig({ ...TEST_CONFIG, ...config }));
  return { cloud, gladys, account, dataDir };
}

const lockId = (gladys, feature) => `ext:${gladys.selector}:lock:${LOCK_ID}:${feature}`;
const doorbellId = (gladys, feature) => `ext:${gladys.selector}:doorbell:${DOORBELL_ID}:${feature}`;

test('a new installation asks for the verification code, then publishes the devices', async () => {
  const cloud = createFakeCloud();
  const gladys = createFakeGladys();
  const account = new AugustAccount({
    gladys,
    dataDir: await tempDataDir(),
    fetchImpl: cloud.fetch,
    timers: false,
  });
  await account.start(normalizeConfig(TEST_CONFIG));

  assert.equal(account.authState, AUTH_STATES.REQUIRES_VALIDATION);
  assert.ok(
    cloud.requests.some((r) => r.path === '/validation/email'),
    'the code is sent',
  );
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.requiresValidation,
  });
  assert.equal(gladys.fake.discoveredDevices.length, 0);

  await assert.rejects(account.validateCode('000000'), /Code refused/);
  assert.deepEqual(await account.validateCode('123456'), MESSAGES.codeAccepted);

  assert.equal(account.authState, AUTH_STATES.AUTHENTICATED);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.name),
    ['Front door', 'Front doorbell'],
  );
});

test('the session is kept in /data, never the password', async () => {
  const { cloud, dataDir } = await setup();
  const stored = await readFile(path.join(dataDir, 'august-session.json'), 'utf8');
  assert.match(stored, /"validated": true/);
  assert.ok(stored.includes(cloud.token));
  assert.ok(!stored.includes(TEST_CONFIG.password), 'the password is never written');

  // A restart reuses the trusted session: no new code, no new session.
  const sessionsBefore = cloud.requests.filter((r) => r.path === '/session').length;
  const again = new AugustAccount({
    gladys: createFakeGladys(),
    dataDir,
    fetchImpl: cloud.fetch,
    timers: false,
  });
  await again.start(normalizeConfig(TEST_CONFIG));
  assert.equal(again.authState, AUTH_STATES.AUTHENTICATED);
  assert.equal(cloud.requests.filter((r) => r.path === '/session').length, sessionsBefore);
});

test('a wrong password is reported in the configuration screen', async () => {
  const { gladys, account } = await setup({ trusted: false, config: { password: 'nope' } });
  assert.equal(account.authState, AUTH_STATES.BAD_PASSWORD);
  assert.deepEqual(gladys.fake.connectionStatus.message, MESSAGES.badPassword);
});

test('missing credentials are reported, without calling the cloud', async () => {
  const cloud = createFakeCloud();
  const gladys = createFakeGladys();
  const account = new AugustAccount({
    gladys,
    dataDir: await tempDataDir(),
    fetchImpl: cloud.fetch,
    timers: false,
  });
  await account.start(normalizeConfig({}));
  assert.equal(cloud.requests.length, 0);
  assert.deepEqual(gladys.fake.connectionStatus.message, MESSAGES.missingCredentials);
});

test('devices and states are published, in the Gladys conventions', async () => {
  const { gladys } = await setup();
  const [lock, doorbell] = gladys.fake.discoveredDevices;
  assert.deepEqual(
    lock.features.map((f) => f.external_id.split(':').at(-1)),
    ['lock', 'battery', 'door', 'keypad-battery'],
  );
  assert.deepEqual(
    doorbell.features.map((f) => f.external_id.split(':').at(-1)),
    ['camera', 'ring', 'motion', 'battery'],
  );
  assert.equal(gladys.fake.lastState(lockId(gladys, 'lock')), 1, '1 = locked');
  assert.equal(gladys.fake.lastState(lockId(gladys, 'door')), 1, '1 = closed');
  assert.equal(gladys.fake.lastState(lockId(gladys, 'battery')), 88);
  assert.equal(gladys.fake.lastState(lockId(gladys, 'keypad-battery')), 60);
  assert.equal(gladys.fake.lastState(doorbellId(gladys, 'battery')), 76);
  assert.equal(gladys.fake.cameraImages.length, 1, 'the latest doorbell snapshot');
  assert.deepEqual(
    gladys.fake.transports.slice(-2).map((t) => t.transport),
    ['cloud', 'cloud'],
  );
});

test('a lock without DoorSense nor keypad has no door nor keypad feature', async () => {
  const cloud = createFakeCloud();
  cloud.locks[LOCK_ID] = lockDetail({
    LockStatus: { status: 'unlocked', doorState: 'init' },
    keypad: undefined,
  });
  const gladys = createFakeGladys();
  const dataDir = await tempDataDir();
  cloud.trustedInstallIds.add('x');
  const account = new AugustAccount({ gladys, dataDir, fetchImpl: cloud.fetch, timers: false });
  await account.start(normalizeConfig(TEST_CONFIG));
  await account.validateCode(cloud.validCode);
  const [lock] = gladys.fake.discoveredDevices;
  assert.deepEqual(
    lock.features.map((f) => f.external_id.split(':').at(-1)),
    ['lock', 'battery'],
  );
  assert.equal(gladys.fake.lastState(lockId(gladys, 'lock')), 0);
});

test('a lock without a Wi-Fi bridge shows a degraded badge', async () => {
  const cloud = createFakeCloud();
  cloud.locks[LOCK_ID] = lockDetail({ Bridge: undefined });
  const gladys = createFakeGladys();
  const account = new AugustAccount({
    gladys,
    dataDir: await tempDataDir(),
    fetchImpl: cloud.fetch,
    timers: false,
  });
  await account.start(normalizeConfig(TEST_CONFIG));
  await account.validateCode(cloud.validCode);
  const badge = gladys.fake.transports.find((t) => t.device_external_id.includes(':lock:'));
  assert.equal(badge.degraded, true);
  assert.ok(badge.message.de && badge.message.es);
});

test('operating a lock publishes the confirmed state', async () => {
  const { gladys, account, cloud } = await setup();
  const lock = account.locks.get(LOCK_ID);
  assert.equal(await account.operate(lock, 'unlock'), 'unlocked');
  assert.ok(
    cloud.requests.some((r) => r.method === 'PUT' && r.path === `/remoteoperate/${LOCK_ID}/unlock`),
  );
  assert.equal(gladys.fake.lastState(lockId(gladys, 'lock')), 0);
  assert.equal(await account.operate(lock, 'lock'), 'locked');
  assert.equal(gladys.fake.lastState(lockId(gladys, 'lock')), 1);
});

test('unlocking can be forbidden, and unlatching needs a lock that supports it', async () => {
  const { account, cloud } = await setup({ config: { allow_unlock: false } });
  const lock = account.locks.get(LOCK_ID);
  await assert.rejects(
    account.operate(lock, 'unlock'),
    (err) => err.localized === MESSAGES.unlockDisabled,
  );
  await account.start(normalizeConfig(TEST_CONFIG));
  await assert.rejects(
    account.operate(account.locks.get(LOCK_ID), 'unlatch'),
    (err) => err.localized === MESSAGES.unlatchUnsupported,
  );
  assert.ok(!cloud.requests.some((r) => r.path.includes('/unlock') || r.path.includes('/unlatch')));
});

test('a revoked token opens a new session and retries once', async () => {
  const { account, cloud } = await setup();
  cloud.token = 'rotated-token';
  await account.refreshInventory();
  assert.equal(account.api.accessToken, 'rotated-token');
});

test('the activity feed fires lock_operated with who and how, once', async () => {
  const { gladys, account, cloud } = await setup();
  const at = Date.now() + 1000;
  cloud.activities[HOUSE_ID] = [
    activity('unlock', { at, info: { keypad: true } }),
    activity('lock', { at: at + 1, user: { UserID: 'automaticrelock' } }),
  ];
  await account.pollActivities();
  await account.pollActivities(); // the same feed again: nothing new

  const events = gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.LOCK_OPERATED);
  assert.equal(events.length, 2);
  assert.deepEqual(events[0].data, {
    device: `ext:${gladys.selector}:lock:${LOCK_ID}`,
    action: 'unlock',
    method: 'keypad',
    user: 'Marie Curie',
  });
  assert.equal(events[1].data.method, 'auto');
  assert.equal(events[1].data.user, '');
  assert.equal(gladys.fake.lastState(lockId(gladys, 'lock')), 1);
  assert.equal(account.recentActivities.length, 2);
});

test('what happened before the start is never fired', async () => {
  const cloud = createFakeCloud();
  cloud.activities[HOUSE_ID] = [activity('unlock', { at: Date.now() - 60_000 })];
  const gladys = createFakeGladys();
  const account = new AugustAccount({
    gladys,
    dataDir: await tempDataDir(),
    fetchImpl: cloud.fetch,
    timers: false,
  });
  await account.start(normalizeConfig(TEST_CONFIG));
  await account.validateCode(cloud.validCode);
  await account.pollActivities();
  assert.equal(gladys.fake.sceneEvents.length, 0);
  assert.equal(account.recentActivities.length, 1, 'still listed in the activity widget');
});

test('jams, door changes and doorbell events', async () => {
  const { gladys, account, cloud } = await setup();
  const at = Date.now() + 1000;
  cloud.activities[HOUSE_ID] = [
    activity('dooropen', { at }),
    activity('jammed', { at: at + 1 }),
    activity('doorbell_call_initiated', { deviceId: DOORBELL_ID, at: at + 2 }),
    activity('doorbell_motion_detected', { deviceId: DOORBELL_ID, at: at + 3 }),
  ];
  await account.pollActivities();
  assert.equal(gladys.fake.lastState(lockId(gladys, 'door')), 0, '0 = open');
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => e.key),
    [SCENE_TRIGGERS.LOCK_JAMMED, SCENE_TRIGGERS.DOORBELL_PRESSED, SCENE_TRIGGERS.DOORBELL_MOTION],
  );
  // Ring and motion are pulses: 1 then 0.
  const ring = gladys.fake.states.filter(
    (s) => s.device_feature_external_id === doorbellId(gladys, 'ring'),
  );
  assert.deepEqual(
    ring.map((s) => s.state),
    [1, 0],
  );
});

test('a real-time doorbell press is not fired again when the feed reports it', async () => {
  const { gladys, account, cloud } = await setup();
  account.onRealtimeMessage('channel-doorbell-1', { status: 'buttonpush' });
  await new Promise((resolve) => setImmediate(resolve));
  cloud.activities[HOUSE_ID] = [
    activity('doorbell_call_initiated', { deviceId: DOORBELL_ID, at: Date.now() + 500 }),
  ];
  await account.pollActivities();
  const presses = gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.DOORBELL_PRESSED);
  assert.equal(presses.length, 1);
});

test('a real-time lock message updates the state right away', async () => {
  const { gladys, account } = await setup();
  account.onRealtimeMessage('channel-lock-1', {
    status: 'kAugLockState_Unlocked',
    doorState: 'kAugDoorState_Open',
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gladys.fake.lastState(lockId(gladys, 'lock')), 0);
  assert.equal(gladys.fake.lastState(lockId(gladys, 'door')), 0);
});

test('a new device is published again on the next refresh', async () => {
  const { account, cloud } = await setup();
  assert.equal(await account.refreshInventory(), false, 'nothing changed');
  cloud.locks['0F9E8D7C6B5A49382716F5E4D3C2B1A0'] = lockDetail({ LockName: 'Back door' });
  assert.equal(await account.refreshInventory(), true);
  assert.equal(account.buildDiscoveredDevices().length, 3);
});

test('the doorbell image is served to onGetImage and to the widget', async () => {
  const { account } = await setup();
  const doorbell = account.doorbells.get(DOORBELL_ID);
  assert.match(await account.getDoorbellImage(doorbell), /^image\/jpg;base64,/);
  const key = account.imageKey(doorbell.imageUrl);
  assert.match(key, /^[a-z0-9][a-z0-9-]{0,63}$/);
  assert.ok((await account.getWidgetImage(key)).length > 0);
  await assert.rejects(account.getWidgetImage('doorbell-unknown'), /Unknown image/);
});
