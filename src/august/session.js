// -----------------------------------------------------------------------------
// Authentication against the August / Yale cloud.
//
// The flow is the one of the mobile apps:
//   1. POST /session with an "install id" (a random UUID that identifies this
//      Gladys installation, like a phone), the identifier (`email:...` or
//      `phone:...`) and the password: the cloud answers with an access token
//      and tells whether this install id is already trusted;
//   2. a new install id must be validated once (2-factor authentication): the
//      cloud sends a code by e-mail or SMS, the user types it in the
//      "Validate the code" action, and the next session is trusted;
//   3. the access token is valid for several months; the cloud may hand back
//      a refreshed one with any response.
//
// The install id and the token are kept in /data (the one writable volume of
// the container), never in the logs: restarting the integration does not ask
// for a new code. The password itself stays in the Gladys configuration.
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';
import { AugustApiError } from './api.js';

const logger = createLogger({ name: 'august-session' });

export const AUTH_STATES = {
  MISSING_CREDENTIALS: 'missing_credentials',
  AUTHENTICATED: 'authenticated',
  REQUIRES_VALIDATION: 'requires_validation',
  BAD_PASSWORD: 'bad_password',
};

const SESSION_FILE = 'august-session.json';

// Re-open a session when the token expires within this delay, rather than
// letting a command fail on an expired token.
const TOKEN_RENEW_MARGIN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Expiry date of an access token (a JWT), or `null` when it carries none.
 * The August tokens carry an `expiresAt` ISO date; a standard `exp` works too.
 * @param {string} token
 * @returns {number | null} epoch ms
 */
export function tokenExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (payload.expiresAt) {
      const expiresAt = Date.parse(payload.expiresAt);
      return Number.isFinite(expiresAt) ? expiresAt : null;
    }
    if (typeof payload.exp === 'number') {
      return payload.exp * 1000;
    }
  } catch {
    // Not a JWT: no known expiry, the first 401 renews it.
  }
  return null;
}

export class SessionManager {
  /**
   * @param {object} options
   * @param {import('./api.js').AugustApi} options.api
   * @param {string} options.dataDir - writable directory (/data in the container)
   * @param {() => number} [options.now]
   */
  constructor({ api, dataDir, now = Date.now }) {
    this.api = api;
    this.file = path.join(dataDir, SESSION_FILE);
    this.now = now;
    this.state = AUTH_STATES.MISSING_CREDENTIALS;
    this.store = null;
    this.credentials = null;
  }

  async loadStore() {
    try {
      return JSON.parse(await readFile(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  async saveStore() {
    await mkdir(path.dirname(this.file), { recursive: true });
    // Write then rename: a crash mid-write never leaves a truncated file.
    const tmp = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(this.store, null, 2), { mode: 0o600 });
    await rename(tmp, this.file);
  }

  /**
   * Authenticate with the credentials of the configuration.
   * @param {{ brand: string, login_method: string, username: string, password: string }} config
   * @returns {Promise<string>} one of AUTH_STATES
   */
  async authenticate(config) {
    const username = String(config.username ?? '').trim();
    const password = String(config.password ?? '');
    if (!username || !password) {
      this.state = AUTH_STATES.MISSING_CREDENTIALS;
      return this.state;
    }
    this.credentials = { loginMethod: config.login_method, username, password };
    const identifier = `${config.login_method}:${username}`;

    const stored = await this.loadStore();
    // Another account or another cloud: start over with a new install id, the
    // previous one was trusted for the previous identity only.
    const sameIdentity = stored.identifier === identifier && stored.brand === config.brand;
    this.store = sameIdentity
      ? stored
      : { brand: config.brand, identifier, installId: randomUUID() };

    const expiry = this.store.accessToken ? tokenExpiry(this.store.accessToken) : null;
    const tokenUsable =
      this.store.validated === true &&
      this.store.accessToken &&
      (expiry === null || expiry - this.now() > TOKEN_RENEW_MARGIN_MS);
    if (tokenUsable) {
      this.api.accessToken = this.store.accessToken;
      this.state = AUTH_STATES.AUTHENTICATED;
      return this.state;
    }
    return this.openSession();
  }

  /**
   * POST /session with the stored install id and the configured credentials.
   * Concurrent callers (parallel requests that all met a 401) share one call.
   */
  openSession() {
    this.opening ??= this.doOpenSession().finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  async doOpenSession() {
    const { loginMethod, username, password } = this.credentials;
    this.api.accessToken = null;
    let session;
    try {
      session = await this.api.createSession({
        installId: this.store.installId,
        identifier: `${loginMethod}:${username}`,
        password,
      });
    } catch (err) {
      if (err instanceof AugustApiError && err.isAuthError) {
        this.state = AUTH_STATES.BAD_PASSWORD;
        return this.state;
      }
      throw err;
    }

    this.store.accessToken = this.api.accessToken;
    if (session?.vPassword === false) {
      this.state = AUTH_STATES.BAD_PASSWORD;
    } else if (session?.vInstallId === false) {
      this.state = AUTH_STATES.REQUIRES_VALIDATION;
    } else {
      this.state = AUTH_STATES.AUTHENTICATED;
    }
    this.store.validated = this.state === AUTH_STATES.AUTHENTICATED;
    await this.saveStore();

    if (this.state === AUTH_STATES.REQUIRES_VALIDATION && !this.store.codeSentAt) {
      // First time this install id is seen: send the code right away, so the
      // user only has to read it. The action re-sends it on demand.
      await this.sendVerificationCode();
    }
    logger.info(`Session state: ${this.state}`);
    return this.state;
  }

  /** (Re-)send the verification code by e-mail or SMS. */
  async sendVerificationCode() {
    if (!this.store?.accessToken || !this.credentials) {
      throw new Error('No pending session: save the configuration first.');
    }
    this.api.accessToken = this.store.accessToken;
    await this.api.sendVerificationCode(this.credentials.loginMethod, this.credentials.username);
    this.store.codeSentAt = new Date(this.now()).toISOString();
    await this.saveStore();
  }

  /**
   * Validate the code received by e-mail or SMS, then open a trusted session.
   * @returns {Promise<boolean>} false when the cloud refused the code
   */
  async validateCode(code) {
    if (!this.store?.accessToken || !this.credentials) {
      throw new Error('No pending session: save the configuration first.');
    }
    this.api.accessToken = this.store.accessToken;
    try {
      await this.api.validateVerificationCode(
        this.credentials.loginMethod,
        this.credentials.username,
        String(code).trim(),
      );
    } catch (err) {
      if (err instanceof AugustApiError && err.status >= 400 && err.status < 500) {
        return false;
      }
      throw err;
    }
    delete this.store.codeSentAt;
    await this.openSession();
    return this.state === AUTH_STATES.AUTHENTICATED;
  }

  /** Persist a token the cloud refreshed in a response header. */
  async persistRefreshedToken() {
    if (
      this.state === AUTH_STATES.AUTHENTICATED &&
      this.api.accessToken &&
      this.api.accessToken !== this.store.accessToken
    ) {
      this.store.accessToken = this.api.accessToken;
      await this.saveStore();
    }
  }

  /**
   * Run an authenticated API call; on a 401 (token revoked or expired), open
   * a new session once and retry.
   * @template T
   * @param {() => Promise<T>} call
   * @returns {Promise<T>}
   */
  async withAuth(call) {
    try {
      const result = await call();
      await this.persistRefreshedToken();
      return result;
    } catch (err) {
      if (!(err instanceof AugustApiError) || err.status !== 401 || !this.credentials) {
        throw err;
      }
      logger.warn('Access token refused, opening a new session');
      const state = await this.openSession();
      if (state !== AUTH_STATES.AUTHENTICATED) {
        throw err;
      }
      return call();
    }
  }
}
