// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys 5.1+).
//
//   - `lock`      one lock (picked in the widget settings): live tiles bound to
//                 its features, its state, door and connection, and the
//                 lock / unlock / open buttons — or, with no lock picked, an
//                 overview of every lock with a "Lock everything" button;
//   - `doorbell`  the latest snapshot of a doorbell, its last ring and motion,
//                 and a button to capture a fresh image;
//   - `activity`  the recent activity of the account: who locked or unlocked
//                 which door, how, and when.
//
// Contents are declarative (the core renders them, no HTML). Live tiles follow
// the published states on their own; the computed parts are nudged with
// `requestWidgetRefresh` whenever the account learns something
// (refreshWidgets, wired in index.js).
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { DOOR_STATES, LOCK_STATES } from './august/parsers.js';
import { LOCK_FEATURES, lockIds } from './devices/lock.js';
import { DOORBELL_FEATURES, doorbellIds } from './devices/doorbell.js';
import {
  ACTIVITY_LABELS,
  DOOR_STATE_LABELS,
  join,
  LANGUAGES,
  LocalizedError,
  LOCK_STATE_LABELS,
  MESSAGES,
  METHOD_LABELS,
} from './i18n.js';

const logger = createLogger({ name: 'widgets' });

export const WIDGET_KEYS = { LOCK: 'lock', DOORBELL: 'doorbell', ACTIVITY: 'activity' };

const ACTIONS = {
  LOCK: 'lock',
  UNLOCK: 'unlock',
  UNLATCH: 'unlatch',
  LOCK_ALL: 'lock_all',
  WAKEUP: 'wakeup',
};

const LOCK_COLORS = {
  [LOCK_STATES.LOCKED]: WIDGET_COLORS.SUCCESS,
  [LOCK_STATES.UNLOCKED]: WIDGET_COLORS.WARNING,
  [LOCK_STATES.UNLATCHED]: WIDGET_COLORS.WARNING,
  [LOCK_STATES.LOCKING]: WIDGET_COLORS.INFO,
  [LOCK_STATES.UNLOCKING]: WIDGET_COLORS.INFO,
  [LOCK_STATES.JAMMED]: WIDGET_COLORS.DANGER,
  [LOCK_STATES.UNKNOWN]: WIDGET_COLORS.NEUTRAL,
};

const ACTIVITY_COLORS = {
  lock: WIDGET_COLORS.SUCCESS,
  unlock: WIDGET_COLORS.WARNING,
  unlatch: WIDGET_COLORS.WARNING,
  jammed: WIDGET_COLORS.DANGER,
  door_open: WIDGET_COLORS.INFO,
  door_closed: WIDGET_COLORS.NEUTRAL,
  doorbell_ring: WIDGET_COLORS.PRIMARY,
  doorbell_motion: WIDGET_COLORS.INFO,
};

const T = {
  lock: { en: 'Lock', fr: 'Serrure', de: 'Schloss', es: 'Cerradura' },
  door: { en: 'Door', fr: 'Porte', de: 'Tür', es: 'Puerta' },
  battery: { en: 'Battery', fr: 'Batterie', de: 'Batterie', es: 'Batería' },
  keypad: { en: 'Keypad', fr: 'Clavier', de: 'Tastatur', es: 'Teclado' },
  state: { en: 'State', fr: 'État', de: 'Zustand', es: 'Estado' },
  connection: { en: 'Connection', fr: 'Connexion', de: 'Verbindung', es: 'Conexión' },
  online: { en: 'Online', fr: 'En ligne', de: 'Online', es: 'En línea' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  noBridge: {
    en: 'No Wi-Fi bridge',
    fr: 'Sans pont Wi-Fi',
    de: 'Ohne WLAN-Bridge',
    es: 'Sin puente Wi-Fi',
  },
  lastEvent: {
    en: 'Last event',
    fr: 'Dernier événement',
    de: 'Letztes Ereignis',
    es: 'Último evento',
  },
  lastRing: {
    en: 'Last ring',
    fr: 'Dernier coup de sonnette',
    de: 'Zuletzt geklingelt',
    es: 'Último timbre',
  },
  lastMotion: {
    en: 'Last motion',
    fr: 'Dernier mouvement',
    de: 'Letzte Bewegung',
    es: 'Último movimiento',
  },
  never: { en: 'None yet', fr: 'Aucun', de: 'Noch keine', es: 'Ninguno' },
  lockBtn: { en: 'Lock', fr: 'Verrouiller', de: 'Verriegeln', es: 'Bloquear' },
  unlockBtn: { en: 'Unlock', fr: 'Déverrouiller', de: 'Entriegeln', es: 'Desbloquear' },
  unlatchBtn: { en: 'Open', fr: 'Ouvrir', de: 'Öffnen', es: 'Abrir' },
  lockAllBtn: {
    en: 'Lock everything',
    fr: 'Tout verrouiller',
    de: 'Alles verriegeln',
    es: 'Bloquear todo',
  },
  wakeupBtn: { en: 'New image', fr: 'Nouvelle image', de: 'Neues Bild', es: 'Nueva imagen' },
  snapshot: {
    en: 'Latest doorbell image',
    fr: 'Dernière image de la sonnette',
    de: 'Letztes Bild der Türklingel',
    es: 'Última imagen del timbre',
  },
  notConnected: {
    en: 'Not connected to the August / Yale cloud: open the integration configuration.',
    fr: 'Non connecté au cloud August / Yale : ouvrez la configuration de l’intégration.',
    de: 'Nicht mit der August-/Yale-Cloud verbunden: Öffnen Sie die Konfiguration der Integration.',
    es: 'Sin conexión con la nube August / Yale: abra la configuración de la integración.',
  },
  noDoorbell: {
    en: 'No doorbell found on this account.',
    fr: 'Aucune sonnette trouvée sur ce compte.',
    de: 'Keine Türklingel in diesem Konto gefunden.',
    es: 'No se ha encontrado ningún timbre en esta cuenta.',
  },
  noActivity: {
    en: 'No recent activity.',
    fr: 'Aucune activité récente.',
    de: 'Keine aktuellen Aktivitäten.',
    es: 'Sin actividad reciente.',
  },
};

/** "5 min ago", in the language of the user viewing the dashboard. */
export function relativeTime(at, language, now = Date.now()) {
  if (!at) return T.never;
  const seconds = Math.round((at - now) / 1000);
  const units = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  const lang = LANGUAGES.includes(language) ? language : 'en';
  const format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return format.format(0, 'minute');
}

function lockSummary(lock) {
  return join(
    [
      LOCK_STATE_LABELS[lock.state] ?? LOCK_STATE_LABELS.unknown,
      lock.battery !== null ? `${lock.battery} %` : null,
    ],
    ' · ',
  );
}

function connectionStatus(lock) {
  if (!lock.hasBridge) {
    return { value: T.noBridge, color: WIDGET_COLORS.WARNING };
  }
  return lock.bridgeOnline
    ? { value: T.online, color: WIDGET_COLORS.SUCCESS }
    : { value: T.offline, color: WIDGET_COLORS.DANGER };
}

// Status values hold 40 characters: what happened and when. Who and how are
// in the activity widget.
function describeActivity(activity, language, now) {
  return join(
    [ACTIVITY_LABELS[activity.type], relativeTime(activity.dateTime, language, now)],
    ' · ',
  );
}

function subtitleOf(activity) {
  const parts = [activity.user || null, activity.method ? METHOD_LABELS[activity.method] : null];
  return parts.some(Boolean) ? { subtitle: join(parts, ' · ') } : {};
}

function notConnected() {
  return { ttl_seconds: 60, components: [{ type: 'text', text: T.notConnected }] };
}

function lockButtons(account, lock) {
  const params = { device: lockIds(account.gladys, lock.id).device };
  const buttons = [
    {
      type: 'button',
      label: T.lockBtn,
      icon: 'lock',
      style: 'primary',
      action: { key: ACTIONS.LOCK, params },
    },
  ];
  if (account.config.allow_unlock) {
    buttons.push({
      type: 'button',
      label: T.unlockBtn,
      icon: 'unlock',
      style: 'secondary',
      action: { key: ACTIONS.UNLOCK, params, confirm: true },
    });
    if (lock.supportsUnlatch) {
      buttons.push({
        type: 'button',
        label: T.unlatchBtn,
        icon: 'log-in',
        style: 'danger',
        action: { key: ACTIONS.UNLATCH, params, confirm: true },
      });
    }
  }
  return buttons;
}

function singleLockContent(account, lock, language) {
  const ids = lockIds(account.gladys, lock.id);
  const last = account.recentActivities.find((a) => a.deviceId === lock.id);
  const tiles = [
    { type: 'value', label: T.lock, icon: 'lock', device_feature: ids.feature(LOCK_FEATURES.LOCK) },
    {
      type: 'value',
      label: T.battery,
      icon: 'battery',
      device_feature: ids.feature(LOCK_FEATURES.BATTERY),
    },
  ];
  if (lock.hasDoorSense) {
    tiles.push({
      type: 'value',
      label: T.door,
      icon: 'log-in',
      device_feature: ids.feature(LOCK_FEATURES.DOOR),
    });
  }
  if (lock.hasKeypad) {
    tiles.push({
      type: 'value',
      label: T.keypad,
      icon: 'grid',
      device_feature: ids.feature(LOCK_FEATURES.KEYPAD_BATTERY),
    });
  }
  const items = [
    {
      label: T.state,
      icon: lock.state === LOCK_STATES.LOCKED ? 'lock' : 'unlock',
      value: LOCK_STATE_LABELS[lock.state] ?? LOCK_STATE_LABELS.unknown,
      color: LOCK_COLORS[lock.state] ?? WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (lock.hasDoorSense) {
    items.push({
      label: T.door,
      icon: 'log-in',
      value: DOOR_STATE_LABELS[lock.doorState] ?? DOOR_STATE_LABELS.unknown,
      color: lock.doorState === DOOR_STATES.OPEN ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    });
  }
  items.push({ label: T.connection, icon: 'wifi', ...connectionStatus(lock) });
  if (last) {
    items.push({
      label: T.lastEvent,
      icon: 'clock',
      value: describeActivity(last, language, account.now()),
      color: ACTIVITY_COLORS[last.type] ?? WIDGET_COLORS.NEUTRAL,
    });
  }
  return {
    ttl_seconds: 300,
    components: [
      { type: 'text', variant: 'heading', text: lock.name },
      ...tiles,
      { type: 'status', items },
      ...lockButtons(account, lock),
    ],
  };
}

function overviewContent(account) {
  const locks = [...account.locks.values()];
  if (locks.length === 0) {
    return { ttl_seconds: 300, components: [{ type: 'text', text: MESSAGES.noLocks }] };
  }
  return {
    ttl_seconds: 300,
    components: [
      {
        type: 'status',
        items: locks.slice(0, 10).map((lock) => ({
          label: lock.name,
          icon: lock.state === LOCK_STATES.LOCKED ? 'lock' : 'unlock',
          value: lockSummary(lock),
          color: LOCK_COLORS[lock.state] ?? WIDGET_COLORS.NEUTRAL,
        })),
      },
      {
        type: 'button',
        label: T.lockAllBtn,
        icon: 'lock',
        style: 'primary',
        action: { key: ACTIONS.LOCK_ALL, confirm: true },
      },
    ],
  };
}

function pickDoorbell(account, externalId) {
  return (externalId && account.findDoorbell(externalId)) || [...account.doorbells.values()][0];
}

async function operateFromWidget(account, params, operation) {
  const lock = account.findLock(params.device);
  if (!lock) {
    throw new Error('Unknown lock');
  }
  try {
    const state = await account.operate(lock, operation);
    return LOCK_STATE_LABELS[state] ?? MESSAGES.lockCommandSent;
  } catch (err) {
    // Throwing acks the action as failed: the user sees the message.
    throw err instanceof LocalizedError ? err : new Error(err.message);
  }
}

export const WIDGETS = {
  [WIDGET_KEYS.LOCK]: {
    async get(account, { settings = {}, language }) {
      if (!account.connected) return notConnected();
      const lock = settings.device ? account.findLock(settings.device) : null;
      return lock ? singleLockContent(account, lock, language) : overviewContent(account);
    },

    async action(account, { actionKey, params }) {
      logger.info(`Widget action lock.${actionKey}`);
      switch (actionKey) {
        case ACTIONS.LOCK:
          return operateFromWidget(account, params, 'lock');
        case ACTIONS.UNLOCK:
          return operateFromWidget(account, params, 'unlock');
        case ACTIONS.UNLATCH:
          return operateFromWidget(account, params, 'unlatch');
        case ACTIONS.LOCK_ALL: {
          const locks = [...account.locks.values()];
          if (locks.length === 0) return MESSAGES.noLocks;
          const results = await Promise.allSettled(
            locks.map((lock) => account.operate(lock, 'lock')),
          );
          return results.every((r) => r.status === 'fulfilled')
            ? MESSAGES.allLocksLocked
            : MESSAGES.someLocksFailed;
        }
        default:
          throw new Error(`Unknown widget action: ${actionKey}`);
      }
    },
  },

  [WIDGET_KEYS.DOORBELL]: {
    async get(account, { settings = {}, language }) {
      if (!account.connected) return notConnected();
      const doorbell = pickDoorbell(account, settings.device);
      if (!doorbell) {
        return { ttl_seconds: 300, components: [{ type: 'text', text: T.noDoorbell }] };
      }
      const ids = doorbellIds(account.gladys, doorbell.id);
      const now = account.now();
      const components = [{ type: 'text', variant: 'heading', text: doorbell.name }];
      if (doorbell.battery !== null) {
        components.push({
          type: 'value',
          label: T.battery,
          icon: 'battery',
          device_feature: ids.feature(DOORBELL_FEATURES.BATTERY),
        });
      }
      if (doorbell.imageUrl) {
        components.push({
          type: 'image',
          key: account.imageKey(doorbell.imageUrl),
          alt: T.snapshot,
          fit: 'cover',
        });
      }
      components.push({
        type: 'status',
        items: [
          {
            label: T.connection,
            icon: 'wifi',
            ...(doorbell.online
              ? { value: T.online, color: WIDGET_COLORS.SUCCESS }
              : { value: T.offline, color: WIDGET_COLORS.DANGER }),
          },
          {
            label: T.lastRing,
            icon: 'bell',
            value: relativeTime(doorbell.lastRingAt, language, now),
            color: WIDGET_COLORS.PRIMARY,
          },
          {
            label: T.lastMotion,
            icon: 'activity',
            value: relativeTime(doorbell.lastMotionAt, language, now),
            color: WIDGET_COLORS.INFO,
          },
        ],
      });
      components.push({
        type: 'button',
        label: T.wakeupBtn,
        icon: 'camera',
        style: 'secondary',
        action: { key: ACTIONS.WAKEUP, params: { device: ids.device } },
      });
      return { ttl_seconds: 120, components };
    },

    async action(account, { actionKey, params }) {
      logger.info(`Widget action doorbell.${actionKey}`);
      if (actionKey !== ACTIONS.WAKEUP) {
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      const doorbell = account.findDoorbell(params.device);
      if (!doorbell) {
        throw new Error('Unknown doorbell');
      }
      await account.wakeupDoorbell(doorbell);
      return MESSAGES.imageRequested;
    },
  },

  [WIDGET_KEYS.ACTIVITY]: {
    async get(account) {
      if (!account.connected) return notConnected();
      const activities = account.recentActivities.slice(0, 8);
      if (activities.length === 0) {
        return { ttl_seconds: 300, components: [{ type: 'text', text: T.noActivity }] };
      }
      const names = new Map(
        [...account.locks.values(), ...account.doorbells.values()].map((d) => [d.id, d.name]),
      );
      return {
        ttl_seconds: 300,
        components: [
          {
            type: 'card-list',
            display: 'list',
            items: activities.map((activity) => ({
              title: join(
                [
                  ACTIVITY_LABELS[activity.type],
                  names.get(activity.deviceId) ?? activity.deviceName,
                ],
                ' · ',
              ),
              ...subtitleOf(activity),
              date: new Date(activity.dateTime).toISOString(),
              badge: {
                text: ACTIVITY_LABELS[activity.type],
                color: ACTIVITY_COLORS[activity.type] ?? WIDGET_COLORS.NEUTRAL,
              },
            })),
          },
        ],
      };
    },
  },
};

/**
 * Ask the core to re-pull every widget now (rate-limited core-side to 1 per
 * 10 s per widget, dropped silently while disconnected).
 */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
