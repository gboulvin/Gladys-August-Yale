// -----------------------------------------------------------------------------
// Real-time channel: the PubNub subscription the mobile apps use.
//
// The cloud publishes an event on the `pubsubChannel` of a lock or a doorbell
// every time something happens (lock operated, door opened, doorbell pressed,
// motion…). We subscribe with the plain PubNub REST long-poll — no SDK, no
// dependency: GET /v2/subscribe/{key}/{channels}/0 answers when a message
// arrives (or after ~5 minutes of silence) with the next "timetoken" to
// resume from.
//
// Doctrine "trigger, not data": the payloads are undocumented and vary per
// device generation, so a message is only used to tell WHICH device changed;
// the account then re-reads it (and the house activity feed) from the API,
// which stays the source of truth. A lost message costs a little latency, the
// periodic poll catches up.
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'pubnub' });

const ORIGIN = 'https://ps.pndsn.com';
// PubNub answers an idle long-poll after 280 s: abort a bit later.
const LONG_POLL_TIMEOUT_MS = 310_000;
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 5 * 60_000;

export class PubNubSubscriber {
  /**
   * @param {object} options
   * @param {string} options.subscribeKey
   * @param {string[]} options.channels
   * @param {(channel: string, message: unknown) => void} options.onMessage
   * @param {typeof fetch} [options.fetchImpl]
   * @param {(ms: number) => Promise<void>} [options.sleep]
   */
  constructor({ subscribeKey, channels, onMessage, fetchImpl = globalThis.fetch, sleep }) {
    this.subscribeKey = subscribeKey;
    this.channels = [...new Set(channels.filter(Boolean))];
    this.onMessage = onMessage;
    this.fetchImpl = fetchImpl;
    this.sleep = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms).unref?.()));
    this.uuid = `gladys-${randomUUID()}`;
    this.running = false;
    this.controller = null;
    this.timetoken = '0';
    this.region = null;
  }

  start() {
    if (this.running || this.channels.length === 0) {
      return;
    }
    this.running = true;
    this.loop().catch((err) => logger.error('PubNub loop stopped', err));
  }

  stop() {
    this.running = false;
    this.controller?.abort();
  }

  /** One long-poll request. Resolves the messages received. */
  async subscribeOnce() {
    const channels = this.channels.map(encodeURIComponent).join(',');
    const url = new URL(`/v2/subscribe/${this.subscribeKey}/${channels}/0`, ORIGIN);
    url.searchParams.set('tt', this.timetoken);
    if (this.region) {
      url.searchParams.set('tr', String(this.region));
    }
    url.searchParams.set('uuid', this.uuid);
    this.controller = new AbortController();
    const timeout = setTimeout(() => this.controller.abort(), LONG_POLL_TIMEOUT_MS);
    timeout.unref?.();
    try {
      const response = await this.fetchImpl(url, { signal: this.controller.signal });
      if (!response.ok) {
        throw new Error(`PubNub subscribe -> ${response.status}`);
      }
      const body = await response.json();
      if (body?.t?.t) {
        this.timetoken = String(body.t.t);
        this.region = body.t.r ?? this.region;
      }
      return Array.isArray(body?.m) ? body.m : [];
    } finally {
      clearTimeout(timeout);
    }
  }

  async loop() {
    let failures = 0;
    while (this.running) {
      try {
        const messages = await this.subscribeOnce();
        failures = 0;
        for (const message of messages) {
          try {
            this.onMessage(message.c, message.d);
          } catch (err) {
            logger.error('PubNub message handler failed', err);
          }
        }
      } catch (err) {
        if (!this.running) {
          return;
        }
        failures += 1;
        const delay = Math.min(RETRY_BASE_MS * 2 ** (failures - 1), RETRY_MAX_MS);
        logger.warn(`PubNub subscription failed (${err.message}), retrying in ${delay / 1000} s`);
        await this.sleep(delay);
      }
    }
  }
}
