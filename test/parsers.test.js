import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseActivities,
  parseActivity,
  parseDoorState,
  parseDoorbell,
  parseLock,
  parseLockState,
} from '../src/august/parsers.js';
import { doorbellDetail, LOCK_ID, lockDetail } from './helpers/fakeCloud.js';

test('lock states, in every dialect of the cloud', () => {
  assert.equal(parseLockState('locked'), 'locked');
  assert.equal(parseLockState('kAugLockState_Locked'), 'locked');
  assert.equal(parseLockState('kAugLockState_SecureMode'), 'locked');
  assert.equal(parseLockState('kAugLockState_Unlocked'), 'unlocked');
  assert.equal(parseLockState('kAugLockState_Unlatched'), 'unlatched');
  assert.equal(parseLockState('kAugLockState_Jammed'), 'jammed');
  assert.equal(parseLockState('kAugLockState_Locking'), 'locking');
  assert.equal(parseLockState('something new'), 'unknown');
  assert.equal(parseLockState(undefined), 'unknown');
});

test('door states', () => {
  assert.equal(parseDoorState('closed'), 'closed');
  assert.equal(parseDoorState('kAugDoorState_Open'), 'open');
  assert.equal(parseDoorState('kAugLockDoorState_Closed'), 'closed');
  assert.equal(parseDoorState('init'), 'unknown');
});

test('a lock detail', () => {
  const lock = parseLock(LOCK_ID, lockDetail());
  assert.equal(lock.name, 'Front door');
  assert.equal(lock.state, 'locked');
  assert.equal(lock.battery, 88);
  assert.equal(lock.keypadBattery, 60);
  assert.equal(lock.hasDoorSense, true);
  assert.equal(lock.hasBridge, true);
  assert.equal(lock.bridgeOnline, true);
  assert.equal(
    parseLock(LOCK_ID, lockDetail({ Bridge: { operative: false } })).bridgeOnline,
    false,
  );
  assert.equal(parseLock(LOCK_ID, lockDetail({ battery: 73 })).battery, 73, 'already a percentage');
  assert.equal(parseLock(LOCK_ID, lockDetail({ battery: undefined })).battery, null);
});

test('a doorbell detail', () => {
  const doorbell = parseDoorbell('db', doorbellDetail());
  assert.equal(doorbell.online, true);
  assert.equal(doorbell.battery, 76);
  assert.match(doorbell.imageUrl, /^https:\/\/res\.cloudinary\.com\//);
  assert.equal(parseDoorbell('db', doorbellDetail({ status: 'doorbell_offline' })).online, false);
  assert.equal(parseDoorbell('db', doorbellDetail({ telemetry: {} })).battery, null);
});

test('activities: who and how', () => {
  const base = { deviceID: LOCK_ID, dateTime: 1_700_000_000_000 };
  const user = { UserID: 'u1', FirstName: 'Ada', LastName: 'Lovelace' };
  assert.deepEqual(
    (({ type, method, user: who }) => ({ type, method, who }))(
      parseActivity({ ...base, action: 'unlock', callingUser: user, info: { remote: true } }),
    ),
    { type: 'unlock', method: 'remote', who: 'Ada Lovelace' },
  );
  assert.equal(parseActivity({ ...base, action: 'onetouchlock', callingUser: user }).type, 'lock');
  assert.equal(parseActivity({ ...base, action: 'lock', callingUser: user }).method, 'app');
  assert.equal(
    parseActivity({ ...base, action: 'lock', callingUser: { UserID: 'manuallock' } }).method,
    'manual',
  );
  assert.equal(
    parseActivity({ ...base, action: 'lock', callingUser: { UserID: 'automaticrelock' } }).method,
    'auto',
  );
  assert.equal(
    parseActivity({ ...base, action: 'unlock', callingUser: user, info: { keypad: true } }).method,
    'keypad',
  );
  assert.equal(
    parseActivity({ ...base, action: 'unlock', info: { fingerprint: true } }).method,
    'fingerprint',
  );
  assert.equal(parseActivity({ ...base, action: 'dooropen' }).method, null);
  assert.equal(parseActivity({ ...base, action: 'some_new_action' }), null);
  assert.equal(parseActivity({ action: 'lock' }), null, 'no device, no date: ignored');
});

test('activities are sorted oldest first', () => {
  const list = parseActivities([
    { action: 'lock', deviceID: 'x', dateTime: 3 },
    { action: 'unlock', deviceID: 'x', dateTime: 1 },
    { action: 'ignored', deviceID: 'x', dateTime: 2 },
  ]);
  assert.deepEqual(
    list.map((a) => a.type),
    ['unlock', 'lock'],
  );
  assert.deepEqual(parseActivities(null), []);
});
