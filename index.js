// -----------------------------------------------------------------------------
// Entry point of the August / Yale integration for Gladys Assistant.
//
// Role of this file: wire the SDK to the account (src/account.js). It holds no
// API logic. It only:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. (re)starts the account on every connection and configuration change.
//
// Environment variables provided by the Gladys supervisor to the container:
// GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR —
// read by the SDK. DATA_DIR overrides the writable directory (default /data).
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { AugustAccount } from './src/account.js';
import { LOCK_FEATURES } from './src/devices/lock.js';
import { LocalizedError, MESSAGES } from './src/i18n.js';
import { SCENE_ACTIONS } from './src/scenes.js';
import { WIDGETS, refreshWidgets } from './src/widgets.js';
import { MANIFEST_ACTIONS } from './src/actions.js';

const gladys = new GladysIntegration();
const account = new AugustAccount({ gladys, dataDir: process.env.DATA_DIR || '/data' });
account.onWidgetsChanged(() => refreshWidgets(gladys));

// Gladys acks a device command within a few seconds, while a remote operation
// through the Wi-Fi bridge can take much longer: past this delay the command
// is acked as "sent", and the state follows when the lock answers.
const SET_VALUE_ACK_MS = 4_000;

// A thrown LocalizedError reaches the user in English only (the ack carries a
// plain message): resolve the translated text where a message is shown.
const localized =
  (handler) =>
  async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof LocalizedError) return err.localized;
      throw err;
    }
  };

// --- Discovery -----------------------------------------------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> refreshing the account');
  if (!account.connected) {
    throw new Error(MESSAGES.missingCredentials.en);
  }
  await account.refreshInventory();
  await account.publishDevices();
  await account.publishAll();
});

// --- Commands --------------------------------------------------------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
  const lock = account.findLock(device.external_id);
  if (!lock || !feature.external_id.endsWith(`:${LOCK_FEATURES.LOCK}`)) {
    throw new Error(`No command handler for ${feature.external_id}`);
  }
  const operation = Number(value) === 1 ? 'lock' : 'unlock';
  const pending = account.operate(lock, operation);
  let timer;
  const sent = new Promise((resolve) => {
    timer = setTimeout(() => resolve('sent'), SET_VALUE_ACK_MS);
  });
  try {
    await Promise.race([pending, sent]);
  } finally {
    clearTimeout(timer);
  }
  // Acked as sent: if the lock eventually refuses, re-read it so Gladys shows
  // the real state instead of the requested one.
  pending.catch(async (err) => {
    logger.warn(`${operation} on ${lock.name} failed: ${err.message}`);
    await account.refreshLock(lock).catch(() => {});
  });
});

// --- Camera: Gladys needs a fresh image of a doorbell ------------------------------
gladys.onGetImage(async (device) => {
  const doorbell = account.findDoorbell(device.external_id);
  if (!doorbell) {
    throw new Error(`No camera behind ${device.external_id}`);
  }
  return account.getDoorbellImage(doorbell);
});

// --- Manifest actions: buttons of the Configuration screen ------------------------
for (const [key, handler] of Object.entries(MANIFEST_ACTIONS)) {
  gladys.onAction(
    key,
    localized((fields) => handler(account, { fields })),
  );
}

// --- Scene actions -------------------------------------------------------------------
for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(key, (fields) => handler(account, { fields }));
}

// --- Dashboard widgets ---------------------------------------------------------------
for (const [key, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(key, (request) => widget.get(account, request));
  if (typeof widget.action === 'function') {
    gladys.onWidgetAction(
      key,
      localized((actionKey, params, { settings }) =>
        widget.action(account, { actionKey, params, settings }),
      ),
    );
  }
}
gladys.onWidgetGetImage((imageKey) => account.getWidgetImage(imageKey));

// --- Configuration updated by the user -------------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> restarting the account');
  await account.start(normalizeConfig(newConfig));
  refreshWidgets(gladys);
});

// --- Connection lifecycle ------------------------------------------------------------
// Every (re)connection re-reads the config and restarts the account: the
// stored session makes it cheap, and the nudges sent while the socket was down
// were dropped.
gladys.on('connected', async () => {
  try {
    await account.start(normalizeConfig(await gladys.getConfig()));
    refreshWidgets(gladys);
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
  }
});

gladys.on('disconnected', () => {
  account.stop();
});

gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  account.stop();
});

logger.info('Starting the August / Yale integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
