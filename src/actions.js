// -----------------------------------------------------------------------------
// Manifest actions: the buttons of the Configuration screen (manifest
// `actions`). Each handler resolves the multi-language message displayed under
// the button; index.js registers them with `gladys.onAction(key, ...)`.
// -----------------------------------------------------------------------------

import { join } from './i18n.js';

export const MANIFEST_ACTIONS = {
  // Re-send the verification code of the 2-factor authentication.
  send_code: (account) => account.sendVerificationCode(),

  // Validate the code received by e-mail or SMS.
  validate_code: (account, { fields }) => account.validateCode(fields.code),

  // Re-read the account and say what was found.
  async test_connection(account) {
    if (!account.connected) {
      return account.statusMessage();
    }
    await account.refreshInventory();
    await account.publishDevices();
    await account.publishAll();
    const locks = account.locks.size;
    const doorbells = account.doorbells.size;
    return join([
      {
        en: `Connected to ${account.api.brand.name}: `,
        fr: `Connecté à ${account.api.brand.name} : `,
        de: `Verbunden mit ${account.api.brand.name}: `,
        es: `Conectado a ${account.api.brand.name}: `,
      },
      {
        en: `${locks} lock(s), ${doorbells} doorbell(s).`,
        fr: `${locks} serrure(s), ${doorbells} sonnette(s).`,
        de: `${locks} Schloss/Schlösser, ${doorbells} Türklingel(n).`,
        es: `${locks} cerradura(s), ${doorbells} timbre(s).`,
      },
    ]);
  },
};
