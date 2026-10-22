# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Security

- The image is rebuilt on the latest `node:24-alpine` (Node.js and Alpine
  security patches); development tools and CI actions up to date.

## [1.0.0] - 2026-10-16

### Added

- First release of the August / Yale integration (Gladys 5.1.0 or later),
  through the August / Yale cloud: August, Yale Access and Yale Home accounts,
  e-mail or phone login, verification code (2-factor authentication) entered
  from the Configuration screen.
- Smart locks: lock / unlock control, battery, door state (DoorSense), keypad
  battery, Wi-Fi bridge status as the transport badge.
- Video doorbells: latest snapshot as a camera image, ring, motion, battery.
- Real-time events through the channel the official apps use, with the
  activity feed as the source of truth.
- Scene triggers: lock operated (action, method, user), lock jammed, doorbell
  pressed, motion at the doorbell.
- Scene actions: lock, unlock, open (unlatch) a door, capture a doorbell image.
- Dashboard widgets: smart lock (one lock or every lock), video doorbell, door
  activity.
- An option to forbid unlocking from Gladys.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/gboulvin/Gladys-August-Yale/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/gboulvin/Gladys-August-Yale/releases/tag/v1.0.0
