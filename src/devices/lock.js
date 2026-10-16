// -----------------------------------------------------------------------------
// Device type: SMART LOCK (August, Yale Linus, Yale Assure, Yale Conexis…).
//
// Features:
//   - lock          lock/binary, controllable: 1 = locked, 0 = unlocked
//   - door          opening-sensor/binary: 1 = closed, 0 = open (Gladys
//                   convention: the contact is made) — only when DoorSense is
//                   calibrated on the lock
//   - battery       battery/integer, %
//   - keypad-battery battery/integer, % — only with a paired keypad
//
// The external ids are built from the lock id the August cloud gives the
// lock: stable for the life of the lock, whatever it is renamed to.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_TRANSPORTS,
} from '@gladysassistant/integration-sdk';
import { DOOR_STATES, LOCK_STATES } from '../august/parsers.js';

export const LOCK_DEVICE_TYPE = 'lock';

export const LOCK_FEATURES = {
  LOCK: 'lock',
  DOOR: 'door',
  BATTERY: 'battery',
  KEYPAD_BATTERY: 'keypad-battery',
};

export function lockIds(gladys, lockId) {
  return gladys.externalIds(LOCK_DEVICE_TYPE, lockId);
}

/**
 * Discovery payload of one lock.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {ReturnType<import('../august/parsers.js').parseLock>} lock
 */
export function buildLockDevice(gladys, lock) {
  const ids = lockIds(gladys, lock.id);
  const features = [
    {
      name: 'Lock',
      external_id: ids.feature(LOCK_FEATURES.LOCK),
      category: DEVICE_FEATURE_CATEGORIES.LOCK,
      type: DEVICE_FEATURE_TYPES.LOCK.BINARY,
      min: 0,
      max: 1,
      read_only: false,
      has_feedback: true,
      keep_history: true,
    },
    {
      name: 'Battery',
      external_id: ids.feature(LOCK_FEATURES.BATTERY),
      category: DEVICE_FEATURE_CATEGORIES.BATTERY,
      type: DEVICE_FEATURE_TYPES.BATTERY.INTEGER,
      unit: DEVICE_FEATURE_UNITS.PERCENT,
      min: 0,
      max: 100,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    },
  ];
  if (lock.hasDoorSense) {
    features.push({
      name: 'Door',
      external_id: ids.feature(LOCK_FEATURES.DOOR),
      category: DEVICE_FEATURE_CATEGORIES.OPENING_SENSOR,
      type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
      min: 0,
      max: 1,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    });
  }
  if (lock.hasKeypad) {
    features.push({
      name: 'Keypad battery',
      external_id: ids.feature(LOCK_FEATURES.KEYPAD_BATTERY),
      category: DEVICE_FEATURE_CATEGORIES.BATTERY,
      type: DEVICE_FEATURE_TYPES.BATTERY.INTEGER,
      unit: DEVICE_FEATURE_UNITS.PERCENT,
      min: 0,
      max: 100,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    });
  }
  return {
    name: lock.name,
    external_id: ids.device,
    // Shown in the device page; refreshed silently on every re-publication.
    params: [
      { name: 'august_lock_id', value: lock.id },
      ...(lock.serialNumber ? [{ name: 'serial_number', value: lock.serialNumber }] : []),
      ...(lock.model ? [{ name: 'model', value: String(lock.model) }] : []),
      ...(lock.firmware ? [{ name: 'firmware', value: String(lock.firmware) }] : []),
      ...(lock.houseName ? [{ name: 'house', value: lock.houseName }] : []),
    ],
    features,
  };
}

// The binary value of the lock feature. Transitional states keep the last
// settled one: the activity that follows says how the motion ended.
const LOCK_VALUES = {
  [LOCK_STATES.LOCKED]: 1,
  [LOCK_STATES.UNLOCKED]: 0,
  [LOCK_STATES.UNLATCHED]: 0,
};

export function lockValue(state) {
  return LOCK_VALUES[state];
}

export function doorValue(doorState) {
  if (doorState === DOOR_STATES.CLOSED) return 1;
  if (doorState === DOOR_STATES.OPEN) return 0;
  return undefined;
}

/** The `publishStates` entries describing a lock, known values only. */
export function lockStates(gladys, lock) {
  const ids = lockIds(gladys, lock.id);
  const states = [];
  const push = (feature, state) => {
    if (state !== undefined && state !== null) {
      states.push({ device_feature_external_id: ids.feature(feature), state });
    }
  };
  push(LOCK_FEATURES.LOCK, lockValue(lock.state));
  push(LOCK_FEATURES.BATTERY, lock.battery);
  if (lock.hasDoorSense) push(LOCK_FEATURES.DOOR, doorValue(lock.doorState));
  if (lock.hasKeypad) push(LOCK_FEATURES.KEYPAD_BATTERY, lock.keypadBattery);
  return states;
}

/** Transport badge: the lock is only reachable through its Wi-Fi bridge. */
export function lockTransport(gladys, lock) {
  const external_id = lockIds(gladys, lock.id).device;
  if (!lock.hasBridge) {
    return {
      external_id,
      transport: DEVICE_TRANSPORTS.CLOUD,
      degraded: true,
      message: {
        en: 'No Wi-Fi bridge: the state is only updated when a phone meets the lock.',
        fr: 'Pas de pont Wi-Fi : l’état n’est mis à jour que lorsqu’un téléphone croise la serrure.',
        de: 'Keine WLAN-Bridge: Der Zustand wird nur aktualisiert, wenn ein Telefon das Schloss erreicht.',
        es: 'Sin puente Wi-Fi: el estado solo se actualiza cuando un teléfono encuentra la cerradura.',
      },
    };
  }
  if (!lock.bridgeOnline) {
    return { external_id, transport: DEVICE_TRANSPORTS.UNREACHABLE };
  }
  return { external_id, transport: DEVICE_TRANSPORTS.CLOUD };
}
