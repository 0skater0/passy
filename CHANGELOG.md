# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-04-14

### Added

- Initial public release.
- Seven-mode credential generator: password, passphrase, pronounceable,
  PIN, UUID, TOTP secret with QR code, and a configurable special slot.
- zxcvbn strength display with entropy-bits fallback for non-password modes.
- Optional Have I Been Pwned lookup with local prefix caching, so
  clear-text passwords never leave the server.
- Local accounts with email and password, plus OpenID Connect sign-in
  with optional auto-linking by email.
- TOTP 2FA on its own route, with eight hashed backup codes per user.
- Password reset via time-limited email link; generic success response
  to prevent account enumeration.
- Minimal admin panel: list users, force password reset, disable TOTP,
  delete users, with a last-admin safeguard.
- Postgres and SQLite support, transactional startup migrations.
- English and German UI through vue-i18n.
- Multi-stage Docker image, non-root runtime user, multi-platform build
  published to GitHub Container Registry on every push to `master`.
- Frontend-only demo build published to GitHub Pages on every push to
  `master` at [0skater0.github.io/passy](https://0skater0.github.io/passy/).

[Unreleased]: https://github.com/0skater0/passy/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/0skater0/passy/releases/tag/v1.0.0
