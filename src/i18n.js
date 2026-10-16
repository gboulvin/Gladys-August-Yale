// -----------------------------------------------------------------------------
// User-facing texts produced at runtime (action messages, connection status,
// widget labels, toasts).
//
// Every text is a multi-language object in the four languages of the Gladys
// UI: English (the mandatory fallback), French, German and Spanish. The core
// picks the user's language; test/i18n.test.js checks that no language is
// missing, here and in the manifest.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const MESSAGES = {
  // --- Connection status / authentication ------------------------------------
  missingCredentials: {
    en: 'Enter your August / Yale account login and password, then save.',
    fr: 'Renseignez l’identifiant et le mot de passe de votre compte August / Yale, puis enregistrez.',
    de: 'Geben Sie Benutzername und Passwort Ihres August-/Yale-Kontos ein und speichern Sie.',
    es: 'Introduzca el usuario y la contraseña de su cuenta August / Yale y guarde.',
  },
  badPassword: {
    en: 'Login refused: check the login method, the login and the password.',
    fr: 'Connexion refusée : vérifiez la méthode de connexion, l’identifiant et le mot de passe.',
    de: 'Anmeldung abgelehnt: Anmeldemethode, Benutzername und Passwort prüfen.',
    es: 'Inicio de sesión rechazado: compruebe el método, el usuario y la contraseña.',
  },
  requiresValidation: {
    en: 'A verification code was sent to you: enter it with the "Validate the code" action.',
    fr: 'Un code de vérification vous a été envoyé : saisissez-le avec l’action « Valider le code ».',
    de: 'Ein Bestätigungscode wurde gesendet: Geben Sie ihn mit der Aktion „Code bestätigen“ ein.',
    es: 'Se le ha enviado un código de verificación: introdúzcalo con la acción «Validar el código».',
  },
  connectionFailed: {
    en: 'The August / Yale cloud cannot be reached, retrying. See the integration logs.',
    fr: 'Le cloud August / Yale est injoignable, nouvel essai en cours. Consultez les logs.',
    de: 'Die August-/Yale-Cloud ist nicht erreichbar, neuer Versuch läuft. Siehe Protokolle.',
    es: 'No se puede acceder a la nube August / Yale, reintentando. Consulte los registros.',
  },

  // --- Manifest actions ------------------------------------------------------
  codeSent: {
    en: 'Verification code sent. Check your inbox (or your SMS) and enter it below.',
    fr: 'Code de vérification envoyé. Consultez vos e-mails (ou SMS) et saisissez-le ci-dessous.',
    de: 'Bestätigungscode gesendet. Prüfen Sie Ihre E-Mails (oder SMS) und geben Sie ihn unten ein.',
    es: 'Código de verificación enviado. Revise su correo (o SMS) e introdúzcalo abajo.',
  },
  alreadyValidated: {
    en: 'This installation is already validated: nothing to do.',
    fr: 'Cette installation est déjà validée : rien à faire.',
    de: 'Diese Installation ist bereits bestätigt: nichts zu tun.',
    es: 'Esta instalación ya está validada: nada que hacer.',
  },
  codeAccepted: {
    en: 'Code accepted: your locks and doorbells are now in the Discovery tab.',
    fr: 'Code accepté : vos serrures et sonnettes sont maintenant dans l’onglet Découverte.',
    de: 'Code akzeptiert: Ihre Schlösser und Türklingeln stehen jetzt im Tab „Erkennung“.',
    es: 'Código aceptado: sus cerraduras y timbres ya están en la pestaña Descubrimiento.',
  },
  codeRefused: {
    en: 'Code refused: check it, or request a new one.',
    fr: 'Code refusé : vérifiez-le, ou demandez-en un nouveau.',
    de: 'Code abgelehnt: Prüfen Sie ihn oder fordern Sie einen neuen an.',
    es: 'Código rechazado: compruébelo o solicite uno nuevo.',
  },

  // --- Commands ----------------------------------------------------------------
  unlockDisabled: {
    en: 'Unlocking from Gladys is disabled in the integration configuration.',
    fr: 'Le déverrouillage depuis Gladys est désactivé dans la configuration de l’intégration.',
    de: 'Das Entriegeln über Gladys ist in der Konfiguration der Integration deaktiviert.',
    es: 'El desbloqueo desde Gladys está desactivado en la configuración de la integración.',
  },
  unlatchUnsupported: {
    en: 'This lock cannot unlatch (open the door).',
    fr: 'Cette serrure ne sait pas ouvrir la porte (déclencher le pêne).',
    de: 'Dieses Schloss kann die Tür nicht öffnen (Falle zurückziehen).',
    es: 'Esta cerradura no puede abrir la puerta (retraer el pestillo).',
  },
  lockCommandSent: {
    en: 'Command sent to the lock.',
    fr: 'Commande envoyée à la serrure.',
    de: 'Befehl an das Schloss gesendet.',
    es: 'Orden enviada a la cerradura.',
  },
  noLocks: {
    en: 'No lock found on this account.',
    fr: 'Aucune serrure trouvée sur ce compte.',
    de: 'Kein Schloss in diesem Konto gefunden.',
    es: 'No se ha encontrado ninguna cerradura en esta cuenta.',
  },
  allLocksLocked: {
    en: 'Every lock received the lock command.',
    fr: 'Toutes les serrures ont reçu l’ordre de verrouillage.',
    de: 'Alle Schlösser haben den Verriegelungsbefehl erhalten.',
    es: 'Todas las cerraduras han recibido la orden de bloqueo.',
  },
  someLocksFailed: {
    en: 'Some locks did not answer: check them in the August / Yale app.',
    fr: 'Certaines serrures n’ont pas répondu : vérifiez-les dans l’application August / Yale.',
    de: 'Einige Schlösser haben nicht geantwortet: Prüfen Sie sie in der August-/Yale-App.',
    es: 'Algunas cerraduras no han respondido: compruébelas en la app August / Yale.',
  },
  imageRequested: {
    en: 'Image requested: it shows up as soon as the doorbell sends it.',
    fr: 'Image demandée : elle s’affiche dès que la sonnette l’envoie.',
    de: 'Bild angefordert: Es erscheint, sobald die Türklingel es sendet.',
    es: 'Imagen solicitada: aparecerá en cuanto el timbre la envíe.',
  },
};

// Lock states, as shown in widgets and returned by the scene actions.
export const LOCK_STATE_LABELS = {
  locked: { en: 'Locked', fr: 'Verrouillée', de: 'Verriegelt', es: 'Bloqueada' },
  unlocked: { en: 'Unlocked', fr: 'Déverrouillée', de: 'Entriegelt', es: 'Desbloqueada' },
  unlatched: { en: 'Open', fr: 'Ouverte', de: 'Geöffnet', es: 'Abierta' },
  locking: { en: 'Locking…', fr: 'Verrouillage…', de: 'Verriegelt…', es: 'Bloqueando…' },
  unlocking: { en: 'Unlocking…', fr: 'Déverrouillage…', de: 'Entriegelt…', es: 'Desbloqueando…' },
  jammed: { en: 'Jammed', fr: 'Bloquée', de: 'Blockiert', es: 'Atascada' },
  unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
};

export const DOOR_STATE_LABELS = {
  open: { en: 'Open', fr: 'Ouverte', de: 'Offen', es: 'Abierta' },
  closed: { en: 'Closed', fr: 'Fermée', de: 'Geschlossen', es: 'Cerrada' },
  unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
};

// Activity actions, as shown in the recent activity widget.
export const ACTIVITY_LABELS = {
  lock: { en: 'Locked', fr: 'Verrouillage', de: 'Verriegelt', es: 'Bloqueo' },
  unlock: { en: 'Unlocked', fr: 'Déverrouillage', de: 'Entriegelt', es: 'Desbloqueo' },
  unlatch: { en: 'Door opened', fr: 'Ouverture', de: 'Geöffnet', es: 'Apertura' },
  jammed: { en: 'Jammed', fr: 'Bloquée', de: 'Blockiert', es: 'Atasco' },
  door_open: { en: 'Door open', fr: 'Porte ouverte', de: 'Tür offen', es: 'Puerta abierta' },
  door_closed: {
    en: 'Door closed',
    fr: 'Porte fermée',
    de: 'Tür geschlossen',
    es: 'Puerta cerrada',
  },
  doorbell_ring: { en: 'Doorbell', fr: 'Sonnerie', de: 'Klingeln', es: 'Timbre' },
  doorbell_motion: { en: 'Motion', fr: 'Mouvement', de: 'Bewegung', es: 'Movimiento' },
};

// How a lock was operated (the `method` of the lock_operated trigger).
export const METHOD_LABELS = {
  remote: { en: 'remotely', fr: 'à distance', de: 'aus der Ferne', es: 'a distancia' },
  keypad: { en: 'keypad', fr: 'clavier', de: 'Tastatur', es: 'teclado' },
  manual: { en: 'by hand', fr: 'à la main', de: 'von Hand', es: 'a mano' },
  auto: { en: 'auto-lock', fr: 'verrouillage auto', de: 'Auto-Lock', es: 'bloqueo auto' },
  app: { en: 'app', fr: 'application', de: 'App', es: 'app' },
  tag: { en: 'key tag', fr: 'badge', de: 'Schlüsselanhänger', es: 'llavero' },
  fingerprint: { en: 'fingerprint', fr: 'empreinte', de: 'Fingerabdruck', es: 'huella' },
  unknown: { en: 'unknown', fr: 'inconnu', de: 'unbekannt', es: 'desconocido' },
};

/**
 * Join multi-language objects (or plain strings) into one multi-language
 * object, language by language: `join([LOCK_STATE_LABELS.locked, ' · 80 %'])`.
 * @param {Array<string | Record<string, string>>} parts
 * @param {string} [separator]
 */
export function join(parts, separator = '') {
  const result = {};
  for (const lang of LANGUAGES) {
    result[lang] = parts
      .filter((part) => part !== undefined && part !== null && part !== '')
      .map((part) => (typeof part === 'string' ? part : (part[lang] ?? part.en)))
      .join(separator);
  }
  return result;
}

/**
 * Error carrying a multi-language message: the SDK acks a thrown error with
 * its `message`, so the English text goes there, and the handlers that can
 * return a translated text read `localized`.
 */
export class LocalizedError extends Error {
  constructor(localized) {
    super(localized.en);
    this.localized = localized;
  }
}
