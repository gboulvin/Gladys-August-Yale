# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

The **August / Yale** external integration of Gladys Assistant: a Node.js
service (Node 22+, ESM, no build step) that runs in its own sandboxed Docker
container, talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
(its only runtime dependency) and to the August / Yale cloud with the global
`fetch`. It started from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js).

Cloud only (manifest `transports: ["cloud"]`): the container has no Bluetooth,
so the local BLE protocol of the locks is out of reach.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/account.test.js          # one file
node --test --test-name-pattern "widget"  # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing. `LOG_LEVEL=silent npm test` keeps the output short.

## Architecture

```
index.js                 SDK wiring only: handlers registered before connect()
src/account.js           the account: session, inventory, activity feed, real-time,
                         commands, scene events — takes `gladys` as a parameter
src/august/api.js        HTTP client of the cloud API (injectable fetch)
src/august/brands.js     August / Yale Access / Yale Home: base URL, API key, branding
src/august/session.js    authentication + 2FA code, session stored in /data
src/august/parsers.js    raw payloads -> stable model (lock, doorbell, activity)
src/august/pubnub.js     real-time long-poll (trigger only, never data)
src/august/images.js     doorbell snapshots, downscaled by Cloudinary to fit Gladys
src/devices/lock.js      lock discovery payload, states, transport badge
src/devices/doorbell.js  doorbell discovery payload, states, transport badge
src/actions.js           manifest `actions` (validate code, send code, test)
src/scenes.js            manifest `scene_actions`
src/widgets.js           manifest `widgets`
src/i18n.js              runtime texts in en / fr / de / es
src/config.js            DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
docs/{en,fr,de,es}.md    user documentation, re-hosted by Gladys (en + fr mandatory)
test/                    node --test, fake Gladys (SDK) + fake cloud (test/helpers)
```

## Rules

- **External ids are forever.** `ext:<selector>:lock:<LockID>` and
  `ext:<selector>:doorbell:<doorbellID>`, the ids the August cloud gives the
  devices; feature keys `lock`, `door`, `battery`, `keypad-battery`, `camera`,
  `ring`, `motion`. Never rename one, nor a key of the manifest (config,
  actions, scene triggers / actions and their fields, widgets): users' devices,
  history, scenes and dashboards point at them.
- **Gladys conventions**: lock `1` = locked; opening sensor `1` = closed;
  ring / motion are pulses (1 then 0).
- **Secrets.** The password stays in the Gladys config (`secret` field); the
  install id and the token live in `/data/august-session.json` (mode 600).
  Never log a token, a password, an e-mail or a phone number; API errors carry
  the method, the path and the status only.
- **Safety.** Unlocking and unlatching honor `allow_unlock`; widget unlock /
  open buttons ask for a confirmation. Keep both.
- **The container rootfs is read-only.** Write only under `/data` (`DATA_DIR`
  overrides it in development).
- **Trigger, not data.** A PubNub message only says which device changed: the
  account re-reads the device and the activity feed. Scene events come from
  the feed (deduplicated), one per activity, never as the consequence of a
  received action.
- **Timers.** Gladys acks a device command within a few seconds: `onSetValue`
  acks "sent" after 4 s and publishes the confirmed state later. Scene and
  widget actions have their own `timeout_seconds` (75 s) and wait for the lock.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md`. Never write a version heading.
- **Languages.** Every user-facing text — manifest, runtime messages, widget
  contents, docs — exists in **English, French, German and Spanish**.
  `test/i18n.test.js` fails on a missing language.
- **Manifest.** The catalog `description` holds 10 to 100 characters per
  language; widget labels 3 to 30. `test/manifest.test.js` ties the manifest to
  the code (defaults, action, scene, trigger and widget handlers): change both
  sides together.
- **Developer overrides.** `AUGUST_API_BASE_URL` / `AUGUST_API_KEY` replace the
  brand's base URL and API key (should a vendor rotate them).
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network: use `test/helpers/fakeCloud.js`.
