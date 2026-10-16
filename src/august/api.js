// -----------------------------------------------------------------------------
// HTTP client of the August / Yale cloud API.
//
// A thin wrapper over the global `fetch` (Node 22+, no HTTP dependency): it
// adds the headers the API expects, enforces a timeout, and captures the
// access token the API returns in the `x-august-access-token` response header
// (the session call issues it, and later calls may hand back a refreshed one).
//
// `fetchImpl` is injectable so the tests never touch the network.
// -----------------------------------------------------------------------------

const HEADER_ACCESS_TOKEN = 'x-august-access-token';
const USER_AGENT = 'August/2019.12.16.4708 CFNetwork/1121.2.2 Darwin/19.3.0';

// A remote lock operation goes through the Wi-Fi bridge and the lock's
// Bluetooth link: the API answers once the lock moved, which can take tens of
// seconds. Everything else answers in a few.
export const DEFAULT_TIMEOUT_MS = 20_000;
export const OPERATION_TIMEOUT_MS = 60_000;

export class AugustApiError extends Error {
  /**
   * @param {number} status - HTTP status (0 for a network error or a timeout)
   * @param {string} message
   * @param {unknown} [body]
   */
  constructor(status, message, body) {
    super(message);
    this.name = 'AugustApiError';
    this.status = status;
    this.body = body;
  }

  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }
}

export class AugustApi {
  /**
   * @param {object} options
   * @param {{ baseUrl: string, apiKey: string, branding: string }} options.brand
   * @param {typeof fetch} [options.fetchImpl]
   */
  constructor({ brand, fetchImpl = globalThis.fetch }) {
    this.brand = brand;
    this.fetchImpl = fetchImpl;
    // Updated by every response that carries a token (see request()).
    this.accessToken = null;
  }

  headers() {
    const headers = {
      'Accept-Version': '0.0.1',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      'x-august-api-key': this.brand.apiKey,
      'x-kease-api-key': this.brand.apiKey,
      'x-august-branding': this.brand.branding,
    };
    if (this.accessToken) {
      headers[HEADER_ACCESS_TOKEN] = this.accessToken;
    }
    return headers;
  }

  /**
   * Run one API request and resolve its JSON body (or `null` when empty).
   * @param {string} method
   * @param {string} path - e.g. `/users/locks/mine`
   * @param {object} [options]
   * @param {unknown} [options.body] - serialized as JSON
   * @param {Record<string, string | number>} [options.query]
   * @param {number} [options.timeoutMs]
   */
  async request(method, path, { body, query, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const url = new URL(path, this.brand.baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, String(value));
    }
    let response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: this.headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // Never put the URL query nor the headers in the message: no secret
      // ends up in the logs.
      throw new AugustApiError(0, `${method} ${path} failed: ${err.name ?? 'network error'}`);
    }

    const token = response.headers?.get?.(HEADER_ACCESS_TOKEN);
    if (token) {
      this.accessToken = token;
    }

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) {
      const reason = typeof data === 'object' && data?.message ? `: ${data.message}` : '';
      throw new AugustApiError(
        response.status,
        `${method} ${path} -> ${response.status}${reason}`,
        data,
      );
    }
    return data;
  }

  // --- Session ---------------------------------------------------------------

  /** Open a session: resolves the session flags, the token lands in accessToken. */
  createSession({ installId, identifier, password }) {
    return this.request('POST', '/session', { body: { installId, identifier, password } });
  }

  /** Ask the cloud to send a verification code by e-mail or SMS. */
  sendVerificationCode(loginMethod, username) {
    return this.request('POST', `/validation/${loginMethod}`, { body: { value: username } });
  }

  /** Validate the code received by e-mail or SMS. */
  validateVerificationCode(loginMethod, username, code) {
    return this.request('POST', `/validate/${loginMethod}`, {
      body: { [loginMethod]: username, code: String(code) },
    });
  }

  // --- Inventory ---------------------------------------------------------------

  getUser() {
    return this.request('GET', '/users/me');
  }

  /** `{ [lockId]: { LockName, HouseID, HouseName, ... } }` */
  getLocks() {
    return this.request('GET', '/users/locks/mine');
  }

  getLock(lockId) {
    return this.request('GET', `/locks/${encodeURIComponent(lockId)}`);
  }

  /** `{ [doorbellId]: { name, HouseID, status, recentImage, ... } }` */
  getDoorbells() {
    return this.request('GET', '/users/doorbells/mine');
  }

  getDoorbell(doorbellId) {
    return this.request('GET', `/doorbells/${encodeURIComponent(doorbellId)}`);
  }

  getHouseActivities(houseId, limit = 10) {
    return this.request('GET', `/houses/${encodeURIComponent(houseId)}/activities`, {
      query: { limit },
    });
  }

  // --- Commands ----------------------------------------------------------------

  /**
   * Remote operation through the Wi-Fi bridge (or the lock's own Wi-Fi).
   * @param {string} lockId
   * @param {'lock' | 'unlock' | 'unlatch'} operation
   */
  operateLock(lockId, operation) {
    return this.request('PUT', `/remoteoperate/${encodeURIComponent(lockId)}/${operation}`, {
      timeoutMs: OPERATION_TIMEOUT_MS,
    });
  }

  /** Wake a battery doorbell up, so it captures and uploads a fresh image. */
  wakeupDoorbell(doorbellId) {
    return this.request('PUT', `/doorbells/${encodeURIComponent(doorbellId)}/wakeup`);
  }
}
