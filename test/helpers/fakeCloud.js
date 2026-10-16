// -----------------------------------------------------------------------------
// An in-memory August / Yale cloud for the tests: a `fetch` implementation
// answering the API routes the integration uses, from editable fixtures.
// Every request is recorded in `cloud.requests`. Nothing touches the network.
// -----------------------------------------------------------------------------

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const LOCK_ID = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';
export const LOCK2_ID = '0F9E8D7C6B5A49382716F5E4D3C2B1A0';
export const DOORBELL_ID = 'db0123456789';
export const HOUSE_ID = 'house-1';
export const IMAGE_URL =
  'https://res.cloudinary.com/august-com/image/upload/v1/doorbell/snapshot-1.jpg';

/** A JWT-shaped token expiring in `days` days. */
export function makeToken(days = 120, seed = 'a') {
  const payload = { expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(), seed };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.signature`;
}

export function lockDetail(overrides = {}) {
  return {
    LockID: LOCK_ID,
    LockName: 'Front door',
    HouseID: HOUSE_ID,
    HouseName: 'Home',
    SerialNumber: 'L3AB12345',
    skuNumber: 'AUG-SL04-M01-S04',
    currentFirmwareVersion: '2.0.11',
    battery: 0.88,
    supportsUnlatch: false,
    pubsubChannel: 'channel-lock-1',
    LockStatus: { status: 'locked', doorState: 'closed', dateTime: '2026-10-16T10:00:00.000Z' },
    Bridge: { _id: 'bridge-1', operative: true },
    keypad: { _id: 'keypad-1', batteryLevel: 'Medium' },
    ...overrides,
  };
}

export function doorbellDetail(overrides = {}) {
  return {
    doorbellID: DOORBELL_ID,
    name: 'Front doorbell',
    HouseID: HOUSE_ID,
    serialNumber: 'DB123',
    status: 'doorbell_call_status_online',
    pubsubChannel: 'channel-doorbell-1',
    telemetry: { battery_soc: 76 },
    recentImage: { secure_url: IMAGE_URL, created_at: '2026-10-16T09:00:00.000Z' },
    ...overrides,
  };
}

export function createFakeCloud() {
  const cloud = {
    requests: [],
    password: 'secret',
    validCode: '123456',
    // Install ids the cloud trusts (validated by a code).
    trustedInstallIds: new Set(),
    token: makeToken(),
    locks: { [LOCK_ID]: lockDetail() },
    doorbells: { [DOORBELL_ID]: doorbellDetail() },
    activities: { [HOUSE_ID]: [] },
    operationResult: null, // override the body of a remote operation
    operationStatus: 200,
    images: new Map(), // url -> Buffer
    failNextWith: null, // { status, path }
  };
  cloud.images.set(IMAGE_URL, Buffer.alloc(2048, 0xff));

  const json = (status, body, headers = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  });

  cloud.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const headers = init.headers ?? {};
    const body = init.body ? JSON.parse(init.body) : undefined;
    cloud.requests.push({ method, path: url.pathname, query: url.search, body, headers });

    if (url.hostname === 'res.cloudinary.com') {
      const image = cloud.images.get(url.toString());
      if (!image) return json(404, { message: 'not found' });
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: async () =>
          image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength),
      };
    }

    if (cloud.failNextWith && url.pathname === cloud.failNextWith.path) {
      const { status } = cloud.failNextWith;
      cloud.failNextWith = null;
      return json(status, { message: 'forced failure' });
    }

    const route = `${method} ${url.pathname}`;
    if (route === 'POST /session') {
      if (body.password !== cloud.password) {
        return json(401, { message: 'bad credentials' });
      }
      const trusted = cloud.trustedInstallIds.has(body.installId);
      return json(
        200,
        { installId: body.installId, vPassword: true, vInstallId: trusted },
        { 'x-august-access-token': cloud.token },
      );
    }

    // Every other route needs the token.
    if (headers['x-august-access-token'] !== cloud.token) {
      return json(401, { message: 'unauthorized' });
    }

    if (route === 'POST /validation/email' || route === 'POST /validation/phone') {
      return json(200, {});
    }
    if (route === 'POST /validate/email' || route === 'POST /validate/phone') {
      if (String(body.code) !== cloud.validCode) {
        return json(400, { message: 'invalid code' });
      }
      const installId = cloud.requests.findLast((r) => r.path === '/session')?.body.installId;
      cloud.trustedInstallIds.add(installId);
      return json(200, {});
    }
    if (route === 'GET /users/me') return json(200, { UserID: 'user-1' });
    if (route === 'GET /users/locks/mine') {
      return json(
        200,
        Object.fromEntries(
          Object.entries(cloud.locks).map(([id, l]) => [
            id,
            { LockName: l.LockName, HouseID: l.HouseID },
          ]),
        ),
      );
    }
    if (route === 'GET /users/doorbells/mine') {
      return json(
        200,
        Object.fromEntries(
          Object.entries(cloud.doorbells).map(([id, d]) => [
            id,
            { name: d.name, HouseID: d.HouseID },
          ]),
        ),
      );
    }
    let match = url.pathname.match(/^\/locks\/([^/]+)$/);
    if (method === 'GET' && match) {
      const lock = cloud.locks[decodeURIComponent(match[1])];
      return lock ? json(200, lock) : json(404, { message: 'no lock' });
    }
    match = url.pathname.match(/^\/doorbells\/([^/]+)$/);
    if (method === 'GET' && match) {
      const doorbell = cloud.doorbells[decodeURIComponent(match[1])];
      return doorbell ? json(200, doorbell) : json(404, { message: 'no doorbell' });
    }
    match = url.pathname.match(/^\/doorbells\/([^/]+)\/wakeup$/);
    if (method === 'PUT' && match) return json(200, {});
    match = url.pathname.match(/^\/houses\/([^/]+)\/activities$/);
    if (method === 'GET' && match) {
      return json(200, cloud.activities[decodeURIComponent(match[1])] ?? []);
    }
    match = url.pathname.match(/^\/remoteoperate\/([^/]+)\/(lock|unlock|unlatch)$/);
    if (method === 'PUT' && match) {
      if (cloud.operationStatus !== 200) {
        return json(cloud.operationStatus, { message: 'bridge offline' });
      }
      const status = {
        lock: 'kAugLockState_Locked',
        unlock: 'kAugLockState_Unlocked',
        unlatch: 'kAugLockState_Unlatched',
      }[match[2]];
      return json(200, cloud.operationResult ?? { status, doorState: 'kAugDoorState_Closed' });
    }
    return json(404, { message: `no route ${route}` });
  };

  return cloud;
}

export async function tempDataDir() {
  return mkdtemp(path.join(tmpdir(), 'august-yale-test-'));
}

export const TEST_CONFIG = {
  brand: 'august',
  login_method: 'email',
  username: 'me@example.com',
  password: 'secret',
  poll_frequency: 300,
  realtime: true,
  allow_unlock: true,
};

/** An activity entry, the way the cloud sends it. */
export function activity(action, { deviceId = LOCK_ID, at, user, info = {} } = {}) {
  return {
    action,
    deviceID: deviceId,
    deviceType: deviceId === DOORBELL_ID ? 'doorbell' : 'lock',
    dateTime: at ?? Date.now(),
    callingUser: user ?? { UserID: 'user-1', FirstName: 'Marie', LastName: 'Curie' },
    info,
    entities: { activity: `act-${action}-${at ?? Date.now()}`, house: HOUSE_ID },
  };
}
