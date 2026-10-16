// The HTTP client, the session file, the images and the real-time channel.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AugustApi, AugustApiError } from '../src/august/api.js';
import { BRANDS, resolveBrand } from '../src/august/brands.js';
import { fetchImage, imageCandidates } from '../src/august/images.js';
import { PubNubSubscriber } from '../src/august/pubnub.js';
import { tokenExpiry } from '../src/august/session.js';
import { normalizeConfig } from '../src/config.js';
import { createFakeCloud, IMAGE_URL, makeToken } from './helpers/fakeCloud.js';

test('the client sends the API key, the branding and the token', async () => {
  const cloud = createFakeCloud();
  const api = new AugustApi({ brand: resolveBrand('yale_home', {}), fetchImpl: cloud.fetch });
  await api.createSession({
    installId: 'i',
    identifier: 'email:me@example.com',
    password: 'secret',
  });
  assert.equal(api.accessToken, cloud.token, 'the token is read from the response header');
  await api.getLocks();
  const { headers } = cloud.requests.at(-1);
  assert.equal(headers['x-august-api-key'], BRANDS.yale_home.apiKey);
  assert.equal(headers['x-august-branding'], 'yale');
  assert.equal(headers['x-august-access-token'], cloud.token);
});

test('API errors carry the status, never the secrets', async () => {
  const cloud = createFakeCloud();
  const api = new AugustApi({ brand: resolveBrand('august', {}), fetchImpl: cloud.fetch });
  const err = await api
    .createSession({ installId: 'i', identifier: 'email:x', password: 'wrong' })
    .catch((e) => e);
  assert.ok(err instanceof AugustApiError);
  assert.equal(err.status, 401);
  assert.ok(err.isAuthError);
  assert.ok(!err.message.includes('wrong'));

  const offline = new AugustApi({
    brand: resolveBrand('august', {}),
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
  });
  assert.equal((await offline.getLocks().catch((e) => e)).status, 0);
});

test('the developer overrides of the brand', () => {
  const brand = resolveBrand('august', {
    AUGUST_API_BASE_URL: 'https://example.test',
    AUGUST_API_KEY: 'k',
  });
  assert.equal(brand.baseUrl, 'https://example.test');
  assert.equal(brand.apiKey, 'k');
  assert.equal(resolveBrand('nope', {}).key, 'august');
});

test('the token expiry is read from the JWT', () => {
  const expiry = tokenExpiry(makeToken(10));
  assert.ok(Math.abs(expiry - (Date.now() + 10 * 86_400_000)) < 5_000);
  assert.equal(tokenExpiry('not-a-jwt'), null);
});

test('the configuration is normalized', () => {
  const config = normalizeConfig({
    poll_frequency: '10',
    realtime: 'false',
    brand: 'other',
    username: ' me ',
  });
  assert.equal(config.poll_frequency, 60, 'one minute minimum');
  assert.equal(config.realtime, false);
  assert.equal(config.allow_unlock, true);
  assert.equal(config.brand, 'august');
  assert.equal(config.username, 'me');
});

test('Cloudinary images are downscaled until they fit', async () => {
  assert.equal(imageCandidates(IMAGE_URL).length, 4);
  assert.match(imageCandidates(IMAGE_URL)[2], /\/image\/upload\/c_limit,w_640,q_60\/v1\//);
  assert.deepEqual(imageCandidates('http://insecure.example/image.jpg'), []);
  assert.deepEqual(imageCandidates('https://other.example/image.jpg'), [
    'https://other.example/image.jpg',
  ]);

  const cloud = createFakeCloud();
  cloud.images.set(IMAGE_URL, Buffer.alloc(400 * 1024)); // too big
  cloud.images.set(imageCandidates(IMAGE_URL)[2], Buffer.alloc(90 * 1024));
  const image = await fetchImage(IMAGE_URL, { fetchImpl: cloud.fetch });
  assert.equal(image.length, 90 * 1024);
  cloud.images.clear();
  assert.equal(await fetchImage(IMAGE_URL, { fetchImpl: cloud.fetch }), null);
});

test('the PubNub subscriber resumes from the timetoken and relays the messages', async () => {
  const urls = [];
  const received = [];
  let subscriber;
  const responses = [
    { t: { t: '100', r: 12 }, m: [] },
    { t: { t: '200', r: 12 }, m: [{ c: 'channel-lock-1', d: { status: 'locked' } }] },
  ];
  subscriber = new PubNubSubscriber({
    subscribeKey: 'sub-key',
    channels: ['channel-lock-1', 'channel-lock-1', null],
    onMessage: (channel, message) => {
      received.push([channel, message]);
      subscriber.stop();
    },
    fetchImpl: async (url) => {
      urls.push(new URL(url));
      return { ok: true, json: async () => responses.shift() };
    },
    sleep: async () => {},
  });
  assert.deepEqual(subscriber.channels, ['channel-lock-1']);
  subscriber.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(received, [['channel-lock-1', { status: 'locked' }]]);
  assert.equal(urls[0].searchParams.get('tt'), '0');
  assert.equal(urls[1].searchParams.get('tt'), '100');
  assert.equal(urls[1].searchParams.get('tr'), '12');
  assert.match(urls[0].pathname, /^\/v2\/subscribe\/sub-key\/channel-lock-1\/0$/);
});
