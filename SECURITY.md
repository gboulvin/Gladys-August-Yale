# Security policy

This integration holds the keys of your home: it signs in to your August /
Yale account and can lock and unlock your doors. Security reports are handled
first.

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- the app the account belongs to (August, Yale Access, Yale Home);
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords, e-mail addresses, phone
  numbers and lock identifiers first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes —
among others, the handling of the account password and of the session token
(stored in the integration's private `/data` volume, never logged), the
"Allow unlocking from Gladys" option, and the commands the dashboard widgets
and the scenes can send.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the August / Yale cloud, apps and devices (report those to ASSA ABLOY), and
the third-party services the integration talks to (PubNub, Cloudinary).
