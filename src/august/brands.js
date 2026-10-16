// -----------------------------------------------------------------------------
// August / Yale cloud brands.
//
// August and Yale (both ASSA ABLOY) share one cloud API, served by two
// deployments: the historical August one (August locks, and Yale Access in
// North America) and the "aaecosystem" one behind the Yale Home app (Europe,
// rest of the world). Same endpoints, same payloads; only the base URL, the
// API key and the branding header differ. The values are the public ones
// shipped in the vendors' mobile apps (also used by the open-source `yalexs`
// library).
//
// AUGUST_API_BASE_URL / AUGUST_API_KEY override them, should a vendor rotate
// them before this integration catches up (developer escape hatch, see
// CLAUDE.md).
// -----------------------------------------------------------------------------

const AUGUST_API_KEY = '79fd0eb6-381d-4adf-95a0-47721289d1d9';
const YALE_HOME_API_KEY = 'd16a1029-d823-4b55-a4ce-a769a9b56f0e';

// PubNub keys of the real-time channel the apps subscribe to (the cloud
// publishes there every lock / doorbell event).
const AUGUST_PUBNUB_SUBSCRIBE_KEY = 'sub-c-1030e062-0ebe-11e5-a5c2-0619f8945a4f';
const YALE_PUBNUB_SUBSCRIBE_KEY = 'sub-c-c9c38d4d-5796-46c9-9262-af20cf6a1d42';

export const BRANDS = {
  august: {
    name: 'August',
    baseUrl: 'https://api-production.august.com',
    apiKey: AUGUST_API_KEY,
    branding: 'august',
    pubnubSubscribeKey: AUGUST_PUBNUB_SUBSCRIBE_KEY,
  },
  yale_access: {
    name: 'Yale Access',
    baseUrl: 'https://api-production.august.com',
    apiKey: AUGUST_API_KEY,
    branding: 'yale',
    pubnubSubscribeKey: AUGUST_PUBNUB_SUBSCRIBE_KEY,
  },
  yale_home: {
    name: 'Yale Home',
    baseUrl: 'https://api.aaecosystem.com',
    apiKey: YALE_HOME_API_KEY,
    branding: 'yale',
    pubnubSubscribeKey: YALE_PUBNUB_SUBSCRIBE_KEY,
  },
};

export const DEFAULT_BRAND = 'august';

/**
 * Resolve the brand configuration, applying the developer overrides.
 * @param {string} key - `august` | `yale_access` | `yale_home`
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveBrand(key, env = process.env) {
  const brand = BRANDS[key] ?? BRANDS[DEFAULT_BRAND];
  return {
    ...brand,
    key: BRANDS[key] ? key : DEFAULT_BRAND,
    baseUrl: env.AUGUST_API_BASE_URL || brand.baseUrl,
    apiKey: env.AUGUST_API_KEY || brand.apiKey,
  };
}
