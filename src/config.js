// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults and
// normalizes the received object, so the rest of the code never deals with
// `undefined` nor with numbers typed as strings.
// -----------------------------------------------------------------------------

import { BRANDS, DEFAULT_BRAND } from './august/brands.js';

export const LOGIN_METHODS = ['email', 'phone'];

// Defaults: they MUST stay consistent with the `default` values declared in
// the manifest `config_schema` (checked by test/manifest.test.js).
export const DEFAULT_CONFIG = {
  brand: DEFAULT_BRAND,
  login_method: 'email',
  username: '',
  password: '',
  // Seconds between two full refreshes of the locks and doorbells. The
  // real-time channel brings the changes in between.
  poll_frequency: 300,
  realtime: true,
  allow_unlock: true,
};

export const POLL_FREQUENCY_BOUNDS = { min: 60, max: 3600 };

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const pollFrequency = Number(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    brand: raw.brand in BRANDS ? raw.brand : DEFAULT_BRAND,
    login_method: LOGIN_METHODS.includes(raw.login_method) ? raw.login_method : 'email',
    username: String(raw.username ?? '').trim(),
    password: String(raw.password ?? ''),
    poll_frequency: Number.isFinite(pollFrequency)
      ? Math.min(Math.max(pollFrequency, POLL_FREQUENCY_BOUNDS.min), POLL_FREQUENCY_BOUNDS.max)
      : DEFAULT_CONFIG.poll_frequency,
    // Booleans: anything but an explicit false keeps the default (true).
    realtime: raw.realtime !== false && raw.realtime !== 'false',
    allow_unlock: raw.allow_unlock !== false && raw.allow_unlock !== 'false',
  };
}

/** The values that require a new session when they change. */
export function credentialsOf(config) {
  return [config.brand, config.login_method, config.username, config.password].join('\u0000');
}
