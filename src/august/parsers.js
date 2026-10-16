// -----------------------------------------------------------------------------
// Normalization of the August / Yale API payloads.
//
// The cloud speaks several dialects for the same thing: a lock state can read
// `locked` or `kAugLockState_Locked`, a door `closed` or
// `kAugDoorState_Closed`, an activity can carry its device at the top level
// or under `entities`. Everything is mapped here to a small, stable model, so
// the rest of the code never handles raw payloads.
// -----------------------------------------------------------------------------

export const LOCK_STATES = {
  LOCKED: 'locked',
  UNLOCKED: 'unlocked',
  UNLATCHED: 'unlatched',
  LOCKING: 'locking',
  UNLOCKING: 'unlocking',
  JAMMED: 'jammed',
  UNKNOWN: 'unknown',
};

export const DOOR_STATES = { OPEN: 'open', CLOSED: 'closed', UNKNOWN: 'unknown' };

const LOCK_STATE_ALIASES = {
  [LOCK_STATES.LOCKED]: ['locked', 'kAugLockState_Locked', 'kAugLockState_SecureMode'],
  [LOCK_STATES.UNLOCKED]: [
    'unlocked',
    'kAugLockState_Unlocked',
    'kAugLockState_Unlocked_Allowed_Unlatch',
  ],
  [LOCK_STATES.UNLATCHED]: ['unlatched', 'kAugLockState_Unlatched'],
  [LOCK_STATES.LOCKING]: ['locking', 'kAugLockState_Locking'],
  [LOCK_STATES.UNLOCKING]: ['unlocking', 'unlatching', 'kAugLockState_Unlocking'],
  [LOCK_STATES.JAMMED]: [
    'jammed',
    'kAugLockState_Jammed',
    'kAugLockState_LockingJammed',
    'kAugLockState_UnlockingJammed',
  ],
};

const DOOR_STATE_ALIASES = {
  [DOOR_STATES.OPEN]: ['open', 'kAugLockDoorState_Open', 'kAugDoorState_Open'],
  [DOOR_STATES.CLOSED]: ['closed', 'kAugLockDoorState_Closed', 'kAugDoorState_Closed'],
};

function lookup(aliases, raw, fallback) {
  if (typeof raw !== 'string') {
    return fallback;
  }
  const value = raw.toLowerCase();
  for (const [state, names] of Object.entries(aliases)) {
    if (names.some((name) => name.toLowerCase() === value)) {
      return state;
    }
  }
  return fallback;
}

export const parseLockState = (raw) => lookup(LOCK_STATE_ALIASES, raw, LOCK_STATES.UNKNOWN);
export const parseDoorState = (raw) => lookup(DOOR_STATE_ALIASES, raw, DOOR_STATES.UNKNOWN);

// The keypad reports a level, not a percentage (same mapping as the apps).
const KEYPAD_BATTERY_LEVELS = { full: 100, medium: 60, low: 10, replace: 0 };

/** Battery of the lock: a 0..1 ratio in the API, sometimes already a percentage. */
function batteryPercent(raw) {
  const value = Number(raw);
  if (raw === undefined || raw === null || !Number.isFinite(value)) {
    return null;
  }
  const percent = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

/**
 * @param {string} lockId
 * @param {object} detail - GET /locks/{id}
 * @param {object} [summary] - entry of GET /users/locks/mine
 */
export function parseLock(lockId, detail = {}, summary = {}) {
  const status = detail.LockStatus ?? {};
  const doorRaw = status.doorState;
  const doorState = parseDoorState(doorRaw);
  const bridge = detail.Bridge ?? null;
  const keypad = detail.keypad ?? detail.Keypad ?? null;
  const keypadLevel = keypad?.batteryLevel ? String(keypad.batteryLevel).toLowerCase() : null;
  return {
    id: lockId,
    kind: 'lock',
    name: detail.LockName ?? summary.LockName ?? 'Lock',
    houseId: detail.HouseID ?? summary.HouseID ?? null,
    houseName: detail.HouseName ?? summary.HouseName ?? null,
    serialNumber: detail.SerialNumber ?? null,
    model: detail.skuNumber ?? detail.Type ?? null,
    firmware: detail.currentFirmwareVersion ?? null,
    state: parseLockState(status.status),
    // Door sense is a calibrated accessory: no door state (or `init`) means
    // the lock does not know whether the door is open.
    hasDoorSense: doorState !== DOOR_STATES.UNKNOWN,
    doorState,
    battery: batteryPercent(detail.battery),
    hasKeypad: Boolean(keypad),
    keypadBattery: keypadLevel in KEYPAD_BATTERY_LEVELS ? KEYPAD_BATTERY_LEVELS[keypadLevel] : null,
    // Without a Wi-Fi bridge (or a built-in Wi-Fi), the cloud only knows the
    // lock through the phones that met it over Bluetooth.
    hasBridge: Boolean(bridge),
    bridgeOnline: bridge ? bridge.operative !== false : false,
    supportsUnlatch: detail.supportsUnlatch === true || detail.unlatch === true,
    pubsubChannel: detail.pubsubChannel ?? null,
    updatedAt: status.dateTime ? Date.parse(status.dateTime) || null : null,
  };
}

/**
 * @param {string} doorbellId
 * @param {object} detail - GET /doorbells/{id}
 * @param {object} [summary] - entry of GET /users/doorbells/mine
 */
export function parseDoorbell(doorbellId, detail = {}, summary = {}) {
  const telemetry = detail.telemetry ?? {};
  const image = detail.recentImage ?? summary.recentImage ?? null;
  const soc = Number(telemetry.battery_soc);
  const status = String(detail.status ?? summary.status ?? '');
  return {
    id: doorbellId,
    kind: 'doorbell',
    name: detail.name ?? summary.name ?? 'Doorbell',
    houseId: detail.HouseID ?? summary.HouseID ?? null,
    serialNumber: detail.serialNumber ?? summary.serialNumber ?? null,
    firmware: detail.firmwareVersion ?? null,
    online: status === '' ? true : !/offline/i.test(status),
    standby: /standby/i.test(status),
    battery: Number.isFinite(soc) && telemetry.battery_soc !== undefined ? Math.round(soc) : null,
    imageUrl: image?.secure_url ?? image?.url ?? null,
    imageAt: image?.created_at ? Date.parse(image.created_at) || null : null,
    pubsubChannel: detail.pubsubChannel ?? null,
  };
}

// --- Activities ---------------------------------------------------------------

export const ACTIVITY_TYPES = {
  LOCK: 'lock',
  UNLOCK: 'unlock',
  UNLATCH: 'unlatch',
  JAMMED: 'jammed',
  DOOR_OPEN: 'door_open',
  DOOR_CLOSED: 'door_closed',
  DOORBELL_RING: 'doorbell_ring',
  DOORBELL_MOTION: 'doorbell_motion',
  DOORBELL_IMAGE: 'doorbell_image',
};

const ACTION_TYPES = {
  lock: ACTIVITY_TYPES.LOCK,
  onetouchlock: ACTIVITY_TYPES.LOCK,
  remote_lock: ACTIVITY_TYPES.LOCK,
  unlock: ACTIVITY_TYPES.UNLOCK,
  remote_unlock: ACTIVITY_TYPES.UNLOCK,
  unlatch: ACTIVITY_TYPES.UNLATCH,
  remote_unlatch: ACTIVITY_TYPES.UNLATCH,
  jammed: ACTIVITY_TYPES.JAMMED,
  lock_jammed: ACTIVITY_TYPES.JAMMED,
  dooropen: ACTIVITY_TYPES.DOOR_OPEN,
  doorclosed: ACTIVITY_TYPES.DOOR_CLOSED,
  doorbell_call_initiated: ACTIVITY_TYPES.DOORBELL_RING,
  doorbell_motion_detected: ACTIVITY_TYPES.DOORBELL_MOTION,
  imagecapture: ACTIVITY_TYPES.DOORBELL_IMAGE,
};

export const OPERATION_METHODS = [
  'remote',
  'keypad',
  'manual',
  'auto',
  'app',
  'tag',
  'fingerprint',
  'unknown',
];

// Pseudo users the cloud puts in `callingUser` for the operations no person
// made through the app.
const AUTO_USERS = ['automaticrelock', 'autorelock', 'autolock'];
const MANUAL_USERS = ['manuallock', 'manualunlock'];

function operationMethod(callingUserId, info) {
  const user = String(callingUserId ?? '').toLowerCase();
  if (AUTO_USERS.includes(user) || info.autoLock || info.autoRelock) {
    return 'auto';
  }
  if (MANUAL_USERS.includes(user) || info.manual) {
    return 'manual';
  }
  if (info.keypad) {
    return 'keypad';
  }
  if (info.fingerprint || info.fingerprintName) {
    return 'fingerprint';
  }
  if (info.tagUID || info.tagType || info.tag) {
    return 'tag';
  }
  if (info.remote) {
    return 'remote';
  }
  return callingUserId ? 'app' : 'unknown';
}

function personName(user = {}) {
  const id = String(user.UserID ?? '').toLowerCase();
  if (AUTO_USERS.includes(id) || MANUAL_USERS.includes(id)) {
    return '';
  }
  return [user.FirstName, user.LastName].filter(Boolean).join(' ').trim();
}

/**
 * Normalize one entry of GET /houses/{id}/activities. Resolves `null` for the
 * actions this integration does not use.
 */
export function parseActivity(raw = {}) {
  const type = ACTION_TYPES[String(raw.action ?? '').toLowerCase()];
  if (!type) {
    return null;
  }
  const entities = raw.entities ?? {};
  const info = raw.info ?? {};
  const callingUser = raw.callingUser ?? {};
  const deviceId = raw.deviceID ?? entities.device ?? null;
  const dateTime = Number(raw.dateTime) || Date.parse(raw.dateTime) || null;
  if (!deviceId || !dateTime) {
    return null;
  }
  const isLockOperation = [
    ACTIVITY_TYPES.LOCK,
    ACTIVITY_TYPES.UNLOCK,
    ACTIVITY_TYPES.UNLATCH,
  ].includes(type);
  return {
    id: String(entities.activity ?? info.activityID ?? `${deviceId}:${raw.action}:${dateTime}`),
    type,
    deviceId,
    deviceName: raw.deviceName ?? null,
    deviceType: raw.deviceType ?? null,
    houseId: raw.house?.houseID ?? entities.house ?? null,
    dateTime,
    method: isLockOperation
      ? operationMethod(callingUser.UserID ?? entities.callingUser, info)
      : null,
    user: isLockOperation ? personName(callingUser) || info.keypadUserName || '' : '',
    imageUrl: info.image?.secure_url ?? info.image?.url ?? null,
  };
}

/** Normalize, drop the unknown actions, sort oldest first. */
export function parseActivities(list) {
  return (Array.isArray(list) ? list : [])
    .map(parseActivity)
    .filter(Boolean)
    .sort((a, b) => a.dateTime - b.dateTime);
}
