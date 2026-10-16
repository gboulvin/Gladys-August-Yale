// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// Operations a scene author places in a scene: lock, unlock or open a door,
// wake a doorbell up for a fresh image. index.js registers each entry with
// `gladys.onSceneAction(key, ...)`.
//
// The rules that matter:
//   - `fields` arrive RESOLVED; `device` is the external_id of the device the
//     author picked (`"source": "devices"` select);
//   - a scene action is never a condition: a lock that did not answer is an
//     output (`success: false`), not a thrown error — the author gates the
//     following actions on it. Only a misuse (a doorbell picked for a lock
//     action) throws;
//   - the scene TRIGGERS are fired by the account (src/account.js) when the
//     activity feed reports what happened.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'scenes' });

async function operateFromScene(account, fields, operation) {
  const lock = account.findLock(fields.device);
  if (!lock) {
    throw new Error(`The device ${fields.device} is not an August / Yale lock`);
  }
  try {
    const state = await account.operate(lock, operation);
    return { success: true, state };
  } catch (err) {
    logger.warn(`Scene action ${operation} on ${lock.name} failed: ${err.message}`);
    return { success: false, state: lock.state };
  }
}

export const SCENE_ACTIONS = {
  lock_door: (account, { fields }) => operateFromScene(account, fields, 'lock'),
  unlock_door: (account, { fields }) => operateFromScene(account, fields, 'unlock'),
  unlatch_door: (account, { fields }) => operateFromScene(account, fields, 'unlatch'),

  async refresh_doorbell_image(account, { fields }) {
    const doorbell = account.findDoorbell(fields.device);
    if (!doorbell) {
      throw new Error(`The device ${fields.device} is not an August / Yale doorbell`);
    }
    try {
      await account.wakeupDoorbell(doorbell);
      return { success: true };
    } catch (err) {
      logger.warn(`Doorbell wake-up failed: ${err.message}`);
      return { success: false };
    }
  },
};
