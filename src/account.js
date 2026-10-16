// -----------------------------------------------------------------------------
// The August / Yale account, seen from Gladys.
//
// Owns the session, the inventory (locks, doorbells) and the three ways the
// cloud tells us something changed:
//   - the periodic refresh (`poll_frequency`): full re-read of every device;
//   - the house activity feed: what happened, who did it and how — the source
//     of the scene triggers;
//   - the PubNub real-time channel, which only says "this device changed":
//     the account then re-reads the device and the feed (see pubnub.js).
//
// index.js wires it to the SDK; everything here takes the `gladys` client as
// a parameter, so the tests drive it with the fake Gladys of the SDK.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import { AugustApi } from './august/api.js';
import { resolveBrand } from './august/brands.js';
import { SessionManager, AUTH_STATES } from './august/session.js';
import { PubNubSubscriber } from './august/pubnub.js';
import { fetchImage, toCameraImage, WIDGET_IMAGE_MAX_BYTES } from './august/images.js';
import {
  ACTIVITY_TYPES,
  LOCK_STATES,
  parseActivities,
  parseDoorState,
  parseDoorbell,
  parseLock,
  parseLockState,
  DOOR_STATES,
} from './august/parsers.js';
import { credentialsOf } from './config.js';
import { LocalizedError, MESSAGES } from './i18n.js';
import { buildLockDevice, lockIds, lockStates, lockTransport } from './devices/lock.js';
import {
  buildDoorbellDevice,
  DOORBELL_FEATURES,
  doorbellIds,
  doorbellStates,
  doorbellTransport,
} from './devices/doorbell.js';

const logger = createLogger({ name: 'account' });

// Scene trigger keys, as declared in the manifest `scene_triggers`. Keys are
// forever: scenes store them.
export const SCENE_TRIGGERS = {
  LOCK_OPERATED: 'lock_operated',
  LOCK_JAMMED: 'lock_jammed',
  DOORBELL_PRESSED: 'doorbell_pressed',
  DOORBELL_MOTION: 'doorbell_motion',
};

export const LOCK_OPERATIONS = ['lock', 'unlock', 'unlatch'];

// The state a successful operation leaves the lock in.
const OPERATION_RESULT = {
  lock: LOCK_STATES.LOCKED,
  unlock: LOCK_STATES.UNLOCKED,
  unlatch: LOCK_STATES.UNLATCHED,
};

const ACTIVITY_LOCK_STATES = {
  [ACTIVITY_TYPES.LOCK]: LOCK_STATES.LOCKED,
  [ACTIVITY_TYPES.UNLOCK]: LOCK_STATES.UNLOCKED,
  [ACTIVITY_TYPES.UNLATCH]: LOCK_STATES.UNLATCHED,
  [ACTIVITY_TYPES.JAMMED]: LOCK_STATES.JAMMED,
};

// The activity feed polling pace when the real-time channel is off.
const ACTIVITY_POLL_MS = 60_000;
// Ring and motion are pulses: 1, then back to 0.
const PULSE_MS = 10_000;
// After a real-time message, the activity feed may lag a few seconds behind.
const REALTIME_DEBOUNCE_MS = 1_500;
const FEED_RETRY_MS = 6_000;
// The same event can reach us twice (real-time channel, then the feed).
const DEDUPE_WINDOW_MS = 90_000;
const RECENT_ACTIVITIES = 20;
const ACTIVITIES_PER_FETCH = 20;
const STATE_HEARTBEAT_MS = 30 * 60_000;
const RETRY_DELAYS_MS = [30_000, 60_000, 5 * 60_000, 15 * 60_000];

export class AugustAccount {
  /**
   * @param {object} options
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} options.gladys
   * @param {string} options.dataDir
   * @param {typeof fetch} [options.fetchImpl]
   * @param {() => number} [options.now]
   * @param {boolean} [options.timers] - false in the tests: no background loop
   */
  constructor({ gladys, dataDir, fetchImpl = globalThis.fetch, now = Date.now, timers = true }) {
    this.gladys = gladys;
    this.dataDir = dataDir;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.useTimers = timers;
    this.config = null;
    this.credentialsKey = null;
    this.api = null;
    this.session = null;
    this.locks = new Map();
    this.doorbells = new Map();
    this.recentActivities = [];
    this.activityCursors = new Map(); // houseId -> { at, ids }
    this.fired = []; // [{ key, at }] for the dedupe window
    this.images = new Map(); // widget image key -> url
    this.pubnub = null;
    this.timers = new Set();
    this.refreshTimer = null;
    this.activityTimer = null;
    this.retryAttempt = 0;
    this.started = false;
    this.listeners = { widgetsChanged: () => {} };
  }

  get authState() {
    return this.session?.state ?? AUTH_STATES.MISSING_CREDENTIALS;
  }

  get connected() {
    return this.authState === AUTH_STATES.AUTHENTICATED;
  }

  onWidgetsChanged(listener) {
    this.listeners.widgetsChanged = listener;
  }

  // --- Lifecycle -----------------------------------------------------------------

  /**
   * Apply a (new) configuration and (re)start everything. A change of
   * credentials drops the session; any other change only re-schedules.
   */
  async start(config) {
    this.stop();
    this.config = config;
    const key = credentialsOf(config);
    if (key !== this.credentialsKey) {
      this.credentialsKey = key;
      this.api = new AugustApi({ brand: resolveBrand(config.brand), fetchImpl: this.fetchImpl });
      this.session = new SessionManager({ api: this.api, dataDir: this.dataDir, now: this.now });
      this.locks.clear();
      this.doorbells.clear();
      this.activityCursors.clear();
    }
    this.started = true;
    try {
      await this.session.authenticate(config);
      await this.afterAuthentication();
      this.retryAttempt = 0;
    } catch (err) {
      logger.error('Connection to the August / Yale cloud failed', err);
      await this.reportStatus(false, MESSAGES.connectionFailed);
      this.scheduleRetry();
    }
  }

  stop() {
    this.started = false;
    for (const timer of this.timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    this.timers.clear();
    this.pubnub?.stop();
    this.pubnub = null;
  }

  /** Called once the session state is known (start, code validated). */
  async afterAuthentication() {
    switch (this.authState) {
      case AUTH_STATES.AUTHENTICATED:
        break;
      case AUTH_STATES.REQUIRES_VALIDATION:
        await this.reportStatus(false, MESSAGES.requiresValidation);
        return;
      case AUTH_STATES.BAD_PASSWORD:
        await this.reportStatus(false, MESSAGES.badPassword);
        return;
      default:
        await this.reportStatus(false, MESSAGES.missingCredentials);
        return;
    }
    await this.refreshInventory();
    await this.publishDevices();
    await this.publishAll();
    // Baseline of the activity feed: what happened before we started is not
    // an event any more.
    await this.pollActivities({ fire: false });
    await this.reportStatus(true);
    this.startLoops();
    this.listeners.widgetsChanged();
  }

  async reportStatus(connected, message) {
    try {
      await this.gladys.setConnectionStatus(connected, message);
    } catch (err) {
      logger.warn(`setConnectionStatus failed: ${err.message}`);
    }
  }

  scheduleRetry() {
    if (!this.useTimers || !this.started) return;
    const delay = RETRY_DELAYS_MS[Math.min(this.retryAttempt, RETRY_DELAYS_MS.length - 1)];
    this.retryAttempt += 1;
    logger.info(`Retrying in ${delay / 1000} s`);
    this.later(delay, () => this.start(this.config));
  }

  later(ms, callback) {
    if (!this.useTimers) return null;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      Promise.resolve()
        .then(callback)
        .catch((err) => logger.error('Scheduled task failed', err));
    }, ms);
    this.timers.add(timer);
    return timer;
  }

  every(ms, callback) {
    if (!this.useTimers) return null;
    const timer = setInterval(() => {
      Promise.resolve()
        .then(callback)
        .catch((err) => logger.error('Periodic task failed', err));
    }, ms);
    this.timers.add(timer);
    return timer;
  }

  startLoops() {
    if (!this.useTimers) return;
    this.every(this.config.poll_frequency * 1000, async () => {
      const structureChanged = await this.refreshInventory();
      if (structureChanged) await this.publishDevices();
      await this.publishAll();
      await this.pollActivities();
      this.listeners.widgetsChanged();
    });
    const realtime = this.config.realtime && this.startRealtime();
    if (!realtime) {
      this.every(ACTIVITY_POLL_MS, () => this.pollActivities());
    }
  }

  startRealtime() {
    const channels = [...this.locks.values(), ...this.doorbells.values()]
      .map((device) => device.pubsubChannel)
      .filter(Boolean);
    const { pubnubSubscribeKey } = this.api.brand;
    if (!pubnubSubscribeKey || channels.length === 0) {
      return false;
    }
    this.pubnub = new PubNubSubscriber({
      subscribeKey: pubnubSubscribeKey,
      channels,
      fetchImpl: this.fetchImpl,
      onMessage: (channel, message) => this.onRealtimeMessage(channel, message),
    });
    this.pubnub.start();
    logger.info(`Real-time channel subscribed (${channels.length} device(s))`);
    return true;
  }

  // --- Inventory -----------------------------------------------------------------

  /**
   * Re-read every lock and doorbell. Resolves true when the feature set of a
   * device changed (new device, DoorSense calibrated, keypad paired…): the
   * discovered devices must be published again.
   */
  async refreshInventory() {
    const before = this.structureSignature();
    const [locks, doorbells] = await Promise.all([
      this.session.withAuth(() => this.api.getLocks()),
      this.session.withAuth(() => this.api.getDoorbells()),
    ]);
    const nextLocks = new Map();
    for (const [id, summary] of Object.entries(locks ?? {})) {
      try {
        const detail = await this.session.withAuth(() => this.api.getLock(id));
        nextLocks.set(id, parseLock(id, detail, summary));
      } catch (err) {
        logger.warn(`Lock ${id} could not be read: ${err.message}`);
        if (this.locks.has(id)) nextLocks.set(id, this.locks.get(id));
      }
    }
    const nextDoorbells = new Map();
    for (const [id, summary] of Object.entries(doorbells ?? {})) {
      try {
        const detail = await this.session.withAuth(() => this.api.getDoorbell(id));
        nextDoorbells.set(id, parseDoorbell(id, detail, summary));
      } catch (err) {
        logger.warn(`Doorbell ${id} could not be read: ${err.message}`);
        nextDoorbells.set(id, this.doorbells.get(id) ?? parseDoorbell(id, {}, summary));
      }
    }
    this.locks = nextLocks;
    this.doorbells = nextDoorbells;
    return before !== this.structureSignature();
  }

  structureSignature() {
    return JSON.stringify([
      [...this.locks.values()].map((l) => [l.id, l.name, l.hasDoorSense, l.hasKeypad]),
      [...this.doorbells.values()].map((d) => [d.id, d.name, d.battery !== null]),
    ]);
  }

  buildDiscoveredDevices() {
    return [
      ...[...this.locks.values()].map((lock) => buildLockDevice(this.gladys, lock)),
      ...[...this.doorbells.values()].map((doorbell) => buildDoorbellDevice(this.gladys, doorbell)),
    ];
  }

  async publishDevices() {
    await this.gladys.publishDiscoveredDevices(this.buildDiscoveredDevices());
  }

  /** Publish every known state (changed values only) and the transport badges. */
  async publishAll() {
    const states = [
      ...[...this.locks.values()].flatMap((lock) => lockStates(this.gladys, lock)),
      ...[...this.doorbells.values()].flatMap((doorbell) => doorbellStates(this.gladys, doorbell)),
    ];
    if (states.length > 0) {
      await this.gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
    }
    const transports = [
      ...[...this.locks.values()].map((lock) => lockTransport(this.gladys, lock)),
      ...[...this.doorbells.values()].map((doorbell) => doorbellTransport(this.gladys, doorbell)),
    ];
    if (transports.length > 0) {
      await this.gladys.publishTransports(transports);
    }
    for (const doorbell of this.doorbells.values()) {
      await this.publishDoorbellImage(doorbell);
    }
  }

  async publishLock(lock) {
    await this.gladys.publishChangedStates(lockStates(this.gladys, lock), {
      heartbeat: STATE_HEARTBEAT_MS,
    });
  }

  async publishDoorbellImage(doorbell, url = doorbell.imageUrl) {
    if (!url || doorbell.publishedImageUrl === url) return;
    const image = await fetchImage(url, { fetchImpl: this.fetchImpl });
    if (!image) {
      logger.warn(`Doorbell ${doorbell.name}: no image rendition fits in 150 KB`);
      return;
    }
    await this.gladys.publishCameraImage(
      doorbellIds(this.gladys, doorbell.id).device,
      toCameraImage(image),
    );
    doorbell.publishedImageUrl = url;
  }

  // --- Lookup --------------------------------------------------------------------

  /** Find the lock or doorbell behind a Gladys device external id. */
  findByExternalId(externalId) {
    for (const lock of this.locks.values()) {
      if (lockIds(this.gladys, lock.id).device === externalId) return lock;
    }
    for (const doorbell of this.doorbells.values()) {
      if (doorbellIds(this.gladys, doorbell.id).device === externalId) return doorbell;
    }
    return null;
  }

  findLock(externalId) {
    const device = this.findByExternalId(externalId);
    return device?.kind === 'lock' ? device : null;
  }

  findDoorbell(externalId) {
    const device = this.findByExternalId(externalId);
    return device?.kind === 'doorbell' ? device : null;
  }

  // --- Commands ------------------------------------------------------------------

  /**
   * Operate a lock remotely and resolve the state it ends in.
   * @param {object} lock - a parsed lock
   * @param {'lock' | 'unlock' | 'unlatch'} operation
   */
  async operate(lock, operation) {
    if (!LOCK_OPERATIONS.includes(operation)) {
      throw new Error(`Unknown operation ${operation}`);
    }
    if (!this.connected) {
      throw new LocalizedError(MESSAGES.connectionFailed);
    }
    if (operation !== 'lock' && !this.config.allow_unlock) {
      throw new LocalizedError(MESSAGES.unlockDisabled);
    }
    if (operation === 'unlatch' && !lock.supportsUnlatch) {
      throw new LocalizedError(MESSAGES.unlatchUnsupported);
    }
    logger.info(`${operation} -> ${lock.name}`);
    const result = await this.session.withAuth(() => this.api.operateLock(lock.id, operation));
    const reported = parseLockState(result?.status);
    lock.state = reported === LOCK_STATES.UNKNOWN ? OPERATION_RESULT[operation] : reported;
    const door = parseDoorState(result?.doorState);
    if (lock.hasDoorSense && door !== DOOR_STATES.UNKNOWN) lock.doorState = door;
    await this.publishLock(lock);
    this.listeners.widgetsChanged();
    return lock.state;
  }

  /**
   * Re-read one lock from the cloud (after a failed or abandoned command).
   */
  async refreshLock(lock) {
    const detail = await this.session.withAuth(() => this.api.getLock(lock.id));
    const fresh = parseLock(lock.id, detail, lock);
    Object.assign(lock, { ...fresh, hasDoorSense: lock.hasDoorSense, hasKeypad: lock.hasKeypad });
    await this.publishLock(lock);
    return lock;
  }

  /** A fresh image of a doorbell, as Gladys' onGetImage expects it. */
  async getDoorbellImage(doorbell) {
    try {
      const detail = await this.session.withAuth(() => this.api.getDoorbell(doorbell.id));
      Object.assign(doorbell, parseDoorbell(doorbell.id, detail, doorbell));
    } catch (err) {
      logger.warn(`Doorbell ${doorbell.name} could not be refreshed: ${err.message}`);
    }
    if (!doorbell.imageUrl) {
      throw new Error(`No image available yet for ${doorbell.name}`);
    }
    const image = await fetchImage(doorbell.imageUrl, { fetchImpl: this.fetchImpl });
    if (!image) {
      throw new Error(`The latest image of ${doorbell.name} does not fit in 150 KB`);
    }
    return toCameraImage(image);
  }

  /** Ask a doorbell to capture a new image (it arrives as an activity). */
  async wakeupDoorbell(doorbell) {
    await this.session.withAuth(() => this.api.wakeupDoorbell(doorbell.id));
    if (this.useTimers) {
      this.later(FEED_RETRY_MS, () => this.pollActivities({ houseId: doorbell.houseId }));
    }
  }

  // --- Widget images -------------------------------------------------------------

  /** Stable widget image key of a URL: the bytes behind a URL never change. */
  imageKey(url) {
    const key = `doorbell-${createHash('sha1').update(url).digest('hex').slice(0, 20)}`;
    this.images.set(key, url);
    return key;
  }

  async getWidgetImage(key) {
    const url = this.images.get(key);
    if (!url) {
      throw new Error(`Unknown image ${key}`);
    }
    const image = await fetchImage(url, {
      maxBytes: WIDGET_IMAGE_MAX_BYTES,
      fetchImpl: this.fetchImpl,
    });
    if (!image) {
      throw new Error('Image too large');
    }
    return image.toString('base64');
  }

  // --- Activity feed -------------------------------------------------------------

  houses() {
    return [
      ...new Set(
        [...this.locks.values(), ...this.doorbells.values()].map((d) => d.houseId).filter(Boolean),
      ),
    ];
  }

  /**
   * Read the activity feed of every house (or one) and handle what is new.
   * @param {object} [options]
   * @param {boolean} [options.fire] - false to only record the baseline
   * @param {string} [options.houseId]
   */
  async pollActivities({ fire = true, houseId } = {}) {
    if (!this.connected) return;
    const houses = houseId ? [houseId] : this.houses();
    for (const house of houses) {
      let list;
      try {
        list = await this.session.withAuth(() =>
          this.api.getHouseActivities(house, ACTIVITIES_PER_FETCH),
        );
      } catch (err) {
        logger.warn(`Activity feed of house ${house} could not be read: ${err.message}`);
        continue;
      }
      const activities = parseActivities(list);
      const cursor = this.activityCursors.get(house);
      const fresh = cursor
        ? activities.filter((a) => a.dateTime >= cursor.at && !cursor.ids.has(a.id))
        : activities;
      const latest = activities.at(-1)?.dateTime ?? cursor?.at ?? 0;
      this.activityCursors.set(house, {
        at: latest,
        ids: new Set(activities.filter((a) => a.dateTime === latest).map((a) => a.id)),
      });
      for (const activity of fresh) {
        this.remember(activity);
        if (fire && cursor) {
          await this.handleActivity(activity);
        }
      }
    }
    if (fire) this.listeners.widgetsChanged();
  }

  remember(activity) {
    if (this.recentActivities.some((a) => a.id === activity.id)) return;
    this.recentActivities.push(activity);
    this.recentActivities.sort((a, b) => b.dateTime - a.dateTime);
    this.recentActivities.length = Math.min(this.recentActivities.length, RECENT_ACTIVITIES);
  }

  /** True when the same event of the same device was already handled. */
  alreadyFired(deviceId, type, at) {
    const now = this.now();
    this.fired = this.fired.filter((entry) => now - entry.handledAt < DEDUPE_WINDOW_MS * 2);
    const duplicate = this.fired.some(
      (entry) =>
        entry.deviceId === deviceId &&
        entry.type === type &&
        Math.abs(entry.at - at) < DEDUPE_WINDOW_MS,
    );
    if (!duplicate) this.fired.push({ deviceId, type, at, handledAt: now });
    return duplicate;
  }

  async handleActivity(activity) {
    const lock = this.locks.get(activity.deviceId);
    const doorbell = this.doorbells.get(activity.deviceId);
    if (lock) return this.handleLockActivity(lock, activity);
    if (doorbell) return this.handleDoorbellActivity(doorbell, activity);
    return undefined;
  }

  async handleLockActivity(lock, activity) {
    const device = lockIds(this.gladys, lock.id).device;
    const newState = ACTIVITY_LOCK_STATES[activity.type];
    // An older activity than the state already known must not roll it back.
    const isLatest = !lock.updatedAt || activity.dateTime >= lock.updatedAt;
    if (newState && isLatest) {
      lock.state = newState;
      lock.updatedAt = activity.dateTime;
    }
    if (
      activity.type === ACTIVITY_TYPES.DOOR_OPEN ||
      activity.type === ACTIVITY_TYPES.DOOR_CLOSED
    ) {
      if (lock.hasDoorSense && isLatest) {
        lock.doorState =
          activity.type === ACTIVITY_TYPES.DOOR_OPEN ? DOOR_STATES.OPEN : DOOR_STATES.CLOSED;
        lock.updatedAt = activity.dateTime;
      }
    }
    await this.publishLock(lock);

    if (this.alreadyFired(lock.id, activity.type, activity.dateTime)) return;
    if (newState && activity.type !== ACTIVITY_TYPES.JAMMED) {
      await this.fireSceneEvent(SCENE_TRIGGERS.LOCK_OPERATED, {
        device,
        action: activity.type,
        method: activity.method ?? 'unknown',
        user: activity.user ?? '',
      });
    } else if (activity.type === ACTIVITY_TYPES.JAMMED) {
      await this.fireSceneEvent(SCENE_TRIGGERS.LOCK_JAMMED, { device });
    }
  }

  async handleDoorbellActivity(doorbell, activity) {
    const ids = doorbellIds(this.gladys, doorbell.id);
    if (activity.imageUrl) {
      doorbell.imageUrl = activity.imageUrl;
      doorbell.imageAt = activity.dateTime;
      await this.publishDoorbellImage(doorbell).catch((err) =>
        logger.warn(`Doorbell image could not be published: ${err.message}`),
      );
    }
    if (this.alreadyFired(doorbell.id, activity.type, activity.dateTime)) return;
    if (activity.type === ACTIVITY_TYPES.DOORBELL_RING) {
      doorbell.lastRingAt = activity.dateTime;
      await this.pulse(ids.feature(DOORBELL_FEATURES.RING));
      await this.fireSceneEvent(SCENE_TRIGGERS.DOORBELL_PRESSED, { device: ids.device });
    } else if (activity.type === ACTIVITY_TYPES.DOORBELL_MOTION) {
      doorbell.lastMotionAt = activity.dateTime;
      await this.pulse(ids.feature(DOORBELL_FEATURES.MOTION));
      await this.fireSceneEvent(SCENE_TRIGGERS.DOORBELL_MOTION, { device: ids.device });
    }
  }

  /** 1 now, 0 a few seconds later: a ring or a motion is an instant. */
  async pulse(featureExternalId) {
    await this.gladys.publishState(featureExternalId, 1);
    const reset = () =>
      this.gladys
        .publishState(featureExternalId, 0)
        .catch((err) => logger.warn(`Pulse reset failed: ${err.message}`));
    if (this.useTimers) {
      this.later(PULSE_MS, reset);
    } else {
      await reset();
    }
  }

  async fireSceneEvent(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Real-time -----------------------------------------------------------------

  /**
   * A PubNub message arrived on the channel of a device. Doorbell presses and
   * motions are handled right away (the feed can lag); anything else
   * re-reads the device and its house feed.
   */
  onRealtimeMessage(channel, message) {
    const device = [...this.locks.values(), ...this.doorbells.values()].find(
      (d) => d.pubsubChannel === channel,
    );
    if (!device) return;
    logger.debug(`Real-time message for ${device.name}`);
    const status = String(message?.status ?? '').toLowerCase();

    if (device.kind === 'doorbell') {
      const type = {
        buttonpush: ACTIVITY_TYPES.DOORBELL_RING,
        doorbell_call_initiated: ACTIVITY_TYPES.DOORBELL_RING,
        doorbell_motion_detected: ACTIVITY_TYPES.DOORBELL_MOTION,
        imagecapture: ACTIVITY_TYPES.DOORBELL_IMAGE,
      }[status];
      if (type) {
        const activity = {
          id: `realtime:${device.id}:${type}:${this.now()}`,
          type,
          deviceId: device.id,
          dateTime: this.now(),
          imageUrl: message?.data?.result?.secure_url ?? null,
        };
        this.remember(activity);
        this.handleDoorbellActivity(device, activity).catch((err) =>
          logger.error('Real-time doorbell event failed', err),
        );
      }
    } else {
      const state = parseLockState(message?.status);
      const door = parseDoorState(message?.doorState);
      if (state !== LOCK_STATES.UNKNOWN) device.state = state;
      if (device.hasDoorSense && door !== DOOR_STATES.UNKNOWN) device.doorState = door;
      this.publishLock(device).catch((err) => logger.warn(`publish failed: ${err.message}`));
    }

    // Who did it and how lives in the feed, which may lag behind.
    clearTimeout(this.realtimeTimer);
    this.timers.delete(this.realtimeTimer);
    this.realtimeTimer = this.later(REALTIME_DEBOUNCE_MS, async () => {
      await this.pollActivities({ houseId: device.houseId });
      this.later(FEED_RETRY_MS, () => this.pollActivities({ houseId: device.houseId }));
    });
  }

  // --- Authentication actions ----------------------------------------------------

  /** Why the account is not connected, for the user. */
  statusMessage() {
    switch (this.authState) {
      case AUTH_STATES.REQUIRES_VALIDATION:
        return MESSAGES.requiresValidation;
      case AUTH_STATES.BAD_PASSWORD:
        return MESSAGES.badPassword;
      case AUTH_STATES.MISSING_CREDENTIALS:
        return MESSAGES.missingCredentials;
      default:
        return this.started ? MESSAGES.connectionFailed : MESSAGES.missingCredentials;
    }
  }

  async sendVerificationCode() {
    if (this.authState === AUTH_STATES.AUTHENTICATED) {
      return MESSAGES.alreadyValidated;
    }
    if (this.authState !== AUTH_STATES.REQUIRES_VALIDATION) {
      throw new LocalizedError(
        this.authState === AUTH_STATES.BAD_PASSWORD
          ? MESSAGES.badPassword
          : MESSAGES.missingCredentials,
      );
    }
    await this.session.sendVerificationCode();
    return MESSAGES.codeSent;
  }

  async validateCode(code) {
    if (this.authState === AUTH_STATES.AUTHENTICATED) {
      return MESSAGES.alreadyValidated;
    }
    if (this.authState !== AUTH_STATES.REQUIRES_VALIDATION) {
      throw new LocalizedError(MESSAGES.missingCredentials);
    }
    const ok = await this.session.validateCode(code);
    if (!ok) {
      throw new LocalizedError(MESSAGES.codeRefused);
    }
    await this.afterAuthentication();
    return MESSAGES.codeAccepted;
  }
}
