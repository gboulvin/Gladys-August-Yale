import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { AugustAccount, SCENE_TRIGGERS } from '../src/account.js';
import { normalizeConfig } from '../src/config.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import {
  activity,
  createFakeCloud,
  DOORBELL_ID,
  HOUSE_ID,
  LOCK_ID,
  tempDataDir,
  TEST_CONFIG,
} from './helpers/fakeCloud.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const declaration = (list, key) => manifest[list].find((entry) => entry.key === key);

async function connectedAccount(config = {}) {
  const cloud = createFakeCloud();
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

test('scene event data only carries declared, primitive keys', async () => {
  const { account, gladys, cloud } = await connectedAccount();
  const at = Date.now() + 1000;
  cloud.activities[HOUSE_ID] = [
    activity('unlock', { at, info: { remote: true } }),
    activity('jammed', { at: at + 1 }),
    activity('doorbell_call_initiated', { deviceId: DOORBELL_ID, at: at + 2 }),
    activity('doorbell_motion_detected', { deviceId: DOORBELL_ID, at: at + 3 }),
  ];
  await account.pollActivities();
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => e.key).sort(),
    Object.values(SCENE_TRIGGERS).sort(),
  );
  for (const { key, data } of gladys.fake.sceneEvents) {
    const trigger = declaration('scene_triggers', key);
    const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
    for (const [name, value] of Object.entries(data)) {
      assert.ok(declared.includes(name), `${key}: data.${name} is not declared`);
      assert.ok(
        value === null || typeof value !== 'object',
        `${key}: data.${name} must be a primitive`,
      );
    }
  }
  const operated = gladys.fake.sceneEvents.find((e) => e.key === SCENE_TRIGGERS.LOCK_OPERATED);
  const filter = (name) =>
    declaration('scene_triggers', SCENE_TRIGGERS.LOCK_OPERATED)
      .fields.find((f) => f.key === name)
      .options.map((o) => o.value);
  assert.ok(filter('action').includes(operated.data.action));
  assert.ok(filter('method').includes(operated.data.method));
});

test('lock_door / unlock_door return the declared outputs', async () => {
  const { account, gladys } = await connectedAccount();
  const fields = { device: `ext:${gladys.selector}:lock:${LOCK_ID}` };
  const declared = keysOf(declaration('scene_actions', 'unlock_door').outputs);

  const unlocked = await SCENE_ACTIONS.unlock_door(account, { fields });
  assert.deepEqual(unlocked, { success: true, state: 'unlocked' });
  assert.deepEqual(Object.keys(unlocked).sort(), declared.sort());
  assert.deepEqual(await SCENE_ACTIONS.lock_door(account, { fields }), {
    success: true,
    state: 'locked',
  });
});

test('a refused operation is an output, not a failure', async () => {
  const { account, gladys, cloud } = await connectedAccount();
  const fields = { device: `ext:${gladys.selector}:lock:${LOCK_ID}` };
  cloud.operationStatus = 504;
  assert.deepEqual(await SCENE_ACTIONS.lock_door(account, { fields }), {
    success: false,
    state: 'locked',
  });
  // An unlatch on a lock that cannot unlatch is refused the same way.
  cloud.operationStatus = 200;
  assert.equal((await SCENE_ACTIONS.unlatch_door(account, { fields })).success, false);
});

test('unlock_door respects the "allow unlocking" option', async () => {
  const { account, gladys, cloud } = await connectedAccount({ allow_unlock: false });
  const fields = { device: `ext:${gladys.selector}:lock:${LOCK_ID}` };
  assert.equal((await SCENE_ACTIONS.unlock_door(account, { fields })).success, false);
  assert.ok(!cloud.requests.some((r) => r.path.endsWith('/unlock')));
});

test('a lock action on a doorbell is a misuse, and fails', async () => {
  const { account, gladys } = await connectedAccount();
  await assert.rejects(
    SCENE_ACTIONS.lock_door(account, {
      fields: { device: `ext:${gladys.selector}:doorbell:${DOORBELL_ID}` },
    }),
    /not an August \/ Yale lock/,
  );
});

test('refresh_doorbell_image wakes the doorbell up', async () => {
  const { account, gladys, cloud } = await connectedAccount();
  const outputs = await SCENE_ACTIONS.refresh_doorbell_image(account, {
    fields: { device: `ext:${gladys.selector}:doorbell:${DOORBELL_ID}` },
  });
  assert.deepEqual(outputs, { success: true });
  assert.ok(
    cloud.requests.some((r) => r.method === 'PUT' && r.path === `/doorbells/${DOORBELL_ID}/wakeup`),
  );
});
