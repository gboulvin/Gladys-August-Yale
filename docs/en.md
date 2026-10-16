# August / Yale — user guide

This integration brings your **August** and **Yale** smart locks and video
doorbells into Gladys Assistant, through the August / Yale cloud — the same
one the official apps use.

## What you get

| Device         | In Gladys                                                                      |
| -------------- | ------------------------------------------------------------------------------ |
| Smart lock     | Lock / unlock control, battery, door open / closed (DoorSense), keypad battery |
| Video doorbell | Latest snapshot (camera), ring, motion, battery                                |

On top of the devices:

- **Scene triggers**: _Lock operated_ (filter on the lock, the action — locked,
  unlocked, opened — and how: app, remote, keypad, by hand, auto-lock,
  fingerprint, key tag; the user name is available as a variable),
  _Lock jammed_, _Doorbell pressed_, _Motion at the doorbell_.
- **Scene actions**: _Lock a door_, _Unlock a door_, _Open a door (unlatch)_,
  _Capture a doorbell image_. Each returns whether it succeeded, so the
  following actions can depend on it.
- **Dashboard widgets**: _Smart lock_ (one lock with its buttons, or an overview
  of every lock with a "Lock everything" button), _Video doorbell_ (latest
  image, last ring and motion), _Door activity_ (who did what, how and when).

Supported models: every lock and doorbell the August, Yale Access and Yale Home
apps manage — August Smart Lock (all generations), August Wi-Fi Smart Lock,
Yale Linus, Yale Linus L2, Yale Assure Lock / Assure Lock 2, Yale Conexis L2,
Yale Unity, August View and Yale Smart Video Doorbell…

## Requirements

- Gladys Assistant **5.1 or later**.
- An account in the **August**, **Yale Access** or **Yale Home** app, with your
  devices already set up in it.
- To see the state live and to operate a lock from Gladys, the lock must be
  reachable by the cloud: a **Wi-Fi bridge** (August Connect, Yale Connect
  Wi-Fi Bridge) or a lock with built-in Wi-Fi. Without one, the lock is shown
  with an orange dot: its state is only updated when a phone running the app
  meets it over Bluetooth.

The integration is **cloud only**: the Gladys container has no Bluetooth
access, so local (Bluetooth) control is not available.

## Setup

1. Open **Integrations → August / Yale → Configuration**.
2. Pick the **app** your locks are registered in:
   - _August_ — the August app;
   - _Yale Access_ — the Yale Access app (North America);
   - _Yale Home_ — the Yale Home app (Europe and the rest of the world).
3. Pick the **login method** (e-mail or phone number), enter the **login** and
   the **password** of your account, and save.
4. The first time, the cloud sends a **verification code** by e-mail or SMS.
   Enter it in the **Validate the code** action of the Configuration screen.
   Did not get it? Use **Send a new code**.
5. Open the **Discovery** tab: your locks and doorbells are listed. Create them.

The code is only asked once: the session is kept in the integration storage.
Changing the account or the app asks for a new code.

## Options

- **Real-time events** (on by default): the events (lock operated, doorbell
  pressed…) arrive in a few seconds through the channel the apps use. When off,
  the activity is read every minute.
- **Allow unlocking from Gladys** (on by default): turn it off to make sure
  Gladys can lock but never unlock nor open a door — the widgets then only show
  the "Lock" button, and the unlock scene actions are refused.
- **Refresh interval**: how often every device is re-read (5 minutes by
  default, 1 minute minimum).

## Values

- Lock: `1` = locked, `0` = unlocked (an unlatched door reads `0`).
- Door: `1` = closed, `0` = open.
- Ring and motion: `1` for a few seconds, then back to `0`.

## Troubleshooting

- **"Login refused"**: check the app (August / Yale Access / Yale Home), the
  login method and the password. Log in to the app with the same credentials
  to make sure.
- **No code received**: check the spam folder, then use **Send a new code**.
  A phone number must be in international format (e.g. `+33612345678`).
- **A lock shows as unreachable**: its Wi-Fi bridge is offline. Check its power
  supply and its Wi-Fi.
- **Yale Home accounts**: Yale has been moving its Yale Home accounts to a new
  sign-in system. If the login keeps being refused although the credentials
  work in the app, please open an issue on the repository.
- Use **Test the connection** to re-read the account and see how many locks and
  doorbells were found. The integration logs (Gladys → Settings → System →
  Integrations) tell more; they never contain your password nor your token.

## Privacy and security

The password stays in the Gladys configuration; the session token is stored in
the integration's private volume. Only the August / Yale cloud, its real-time
service (PubNub) and the doorbell image host (Cloudinary) are contacted.
Report a security problem privately, see `SECURITY.md` in the repository.
