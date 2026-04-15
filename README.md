# Passy

[![CI](https://github.com/0skater0/passy/actions/workflows/build.yml/badge.svg)](https://github.com/0skater0/passy/actions/workflows/build.yml)
[![Pages](https://github.com/0skater0/passy/actions/workflows/pages.yml/badge.svg)](https://github.com/0skater0/passy/actions/workflows/pages.yml)
[![CodeQL](https://github.com/0skater0/passy/actions/workflows/codeql.yml/badge.svg)](https://github.com/0skater0/passy/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/0skater0/passy?sort=semver)](https://github.com/0skater0/passy/releases)
[![Container image](https://img.shields.io/badge/ghcr.io-0skater0%2Fpassy-blue?logo=docker&logoColor=white)](https://github.com/0skater0/passy/pkgs/container/passy)

A self-hosted password generator and credential manager. Runs as a single Node.js
container, speaks Postgres or SQLite, and plays nice with OIDC and TOTP.

**Try it in the browser:** [0skater0.github.io/passy](https://0skater0.github.io/passy/) —
a frontend-only build of the generator, no accounts, no server, history stays in
`localStorage`.

![Passy generator](docs/screenshot-home.png)

## What it does

Passy started as a client-side password generator and grew a backend. You can run it in
two shapes:

- **Generator only** — no accounts, no server state, the frontend handles everything and
  keeps a short history in the browser.
- **With accounts** — users sign in, TOTP is available, generation history persists, and
  a small admin console lets you reset passwords or turn off 2FA for someone who locked
  themselves out.

The generator itself covers seven modes: classic passwords with a custom character set,
passphrases, pronounceable strings, PINs, UUIDs, TOTP secrets (with QR code) and a
configurable "special" slot for formats you invent per deployment.

## Features

- Seven credential modes, each with their own options and strength display (zxcvbn score
  and entropy bits side by side).
- Have I Been Pwned lookup, offline. Prefix files are fetched on demand from the public
  range API and cached locally, so passwords never leave your server.
- Local signup and login, plus OpenID Connect. OIDC users can auto-link to existing
  local accounts by email, or be kept separate — it's a single flag.
- TOTP 2FA on its own route, so password managers such as 1Password can auto-fill both
  steps. Eight one-time backup codes per user, hashed with bcrypt.
- Password reset via email, with a short-lived token and a generic success message on
  request (no account enumeration).
- Admin panel with the bare minimum: list users, force-reset a password, disable TOTP,
  delete a user. Safeguarded so you cannot nuke the last admin.
- English and German UI out of the box. Strings go through `vue-i18n`; adding another
  locale is a copy-paste of one JSON file.
- Rate limiting per IP, helmet headers, strict CSP, and timing-safe login (bcrypt runs
  on a dummy hash when the email doesn't exist).

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vue 3, Vite, Tailwind CSS v4, `vue-i18n` |
| Backend | Node 22, Express 5, TypeScript |
| Database | Postgres 17 (default) or SQLite via `better-sqlite3` |
| Auth | JWT in HttpOnly cookies, bcrypt, `otpauth` (RFC 6238), `openid-client` |
| Email | Nodemailer over SMTP |
| Container | Multi-stage Dockerfile, non-root runtime user |

## Requirements

- **Docker 24+** with Compose v2, or Node 22+ if you want to run it directly.
- **A database.** Postgres is the default. SQLite is fine for a single user or
  offline use.
- **An SMTP relay** if you want password reset and TOTP setup emails. Without one, the
  app still runs — emails are just skipped.
- **An OIDC provider** if you want SSO. Authentik, Keycloak, Auth0, anything
  spec-compliant.

## Quick start with Docker Compose

Minimal `docker-compose.yml`:

```yaml
services:
  passy:
    image: ghcr.io/0skater0/passy:latest
    ports:
      - "8080:8080"
    environment:
      ENABLE_BACKEND: "true"
      ENABLE_ACCOUNTS: "true"
      ENABLE_SIGNUP: "true"
      JWT_SECRET: "change-me-to-a-long-random-string"
      APP_URL: "http://localhost:8080"
      POSTGRES_HOST: passy-postgres
      POSTGRES_DB: passy
      POSTGRES_USER: passy
      POSTGRES_PASSWORD: passy
    depends_on:
      - passy-postgres

  passy-postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: passy
      POSTGRES_USER: passy
      POSTGRES_PASSWORD: passy
    volumes:
      - passy-db:/var/lib/postgresql/data

volumes:
  passy-db:
```

`docker compose up -d`, then open http://localhost:8080, register the first user, and
flip `ENABLE_SIGNUP` back to `false` once you're done.

## Running without Docker

You'll need Node 22, npm and a reachable Postgres or SQLite file.

```bash
git clone https://github.com/0skater0/passy.git
cd passy
npm install
cp .env.example .env        # edit to taste
npm run build
npm start -w backend
```

The backend serves both the API and the pre-built frontend on the same port, so a
reverse proxy is optional.

## Configuration

Passy reads environment variables. Everything is optional unless noted.

### Core

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `8080` | HTTP listen port |
| `BASE_PATH` | `/` | URL path prefix — set this if you reverse-proxy under a subpath |
| `ENABLE_BACKEND` | `true` | Set to `false` for the pure client-side generator |
| `LOG_LEVEL` | `info` | `error`, `warn`, `info`, `debug` |

### Accounts and auth

| Variable | Default | Notes |
|---|---|---|
| `ENABLE_ACCOUNTS` | `false` | Turn on signup/login |
| `ENABLE_SIGNUP` | `false` | Public registration. Requires `ENABLE_ACCOUNTS=true` |
| `JWT_SECRET` | — | **Required** when accounts are on. Long random string. Rotating this signs everyone out |
| `APP_URL` | — | **Required** when accounts are on. Used to build password-reset links, e.g. `https://passy.example.com` |

### Database

| Variable | Default | Notes |
|---|---|---|
| `DB_TYPE` | auto | `postgres` or `sqlite`. Auto-detected from `DATABASE_URL` if set |
| `DATABASE_URL` | — | Full Postgres URL. Overrides the discrete vars below |
| `POSTGRES_HOST` | — | Host of the Postgres server |
| `POSTGRES_PORT` | `5432` | |
| `POSTGRES_DB` | — | Database name |
| `POSTGRES_USER` | — | |
| `POSTGRES_PASSWORD` | — | |
| `SQLITE_PATH` | `/data/passy.sqlite` | File path when using SQLite |

### OIDC (optional)

| Variable | Default | Notes |
|---|---|---|
| `OIDC_ISSUER_URL` | — | Discovery URL, e.g. `https://auth.example.com` |
| `OIDC_CLIENT_ID` | — | |
| `OIDC_CLIENT_SECRET` | — | |
| `OIDC_SCOPES` | `openid profile email` | |
| `OIDC_REDIRECT_URI` | derived | Defaults to `{APP_URL}/api/auth/oidc/callback` |
| `OIDC_AUTO_LINK_BY_EMAIL` | `false` | Match the OIDC email against an existing local account on first sign-in |

### SMTP (optional)

| Variable | Default | Notes |
|---|---|---|
| `SMTP_HOST` | — | Without this, emails are silently skipped |
| `SMTP_PORT` | `587` | `25` for internal relays, `465` for implicit TLS |
| `SMTP_USER` / `SMTP_PASS` | — | Leave empty for unauthenticated relays |
| `SMTP_FROM` | — | Sender. Validated on startup — `example@example.com` and similar placeholders are rejected |

### Have I Been Pwned

| Variable | Default | Notes |
|---|---|---|
| `ENABLE_PWNED` | `false` | Turn on the breach lookup |
| `PWNED_DATA_DIR` | `/data/pwned` | Where prefix files live |
| `PWNED_LAZY_FETCH` | `true` | Fetch missing prefixes from the public range API |
| `PWNED_TTL_HOURS` | `168` | Cache TTL for downloaded prefixes |

### Rate limiting and CORS

| Variable | Default | Notes |
|---|---|---|
| `RATE_LIMIT_WINDOW_MS` | `60000` | Window size in ms |
| `RATE_LIMIT_MAX` | `30` | Requests per window per IP |
| `CORS_ORIGIN` | — | Single allowed origin. Leave empty to disable CORS |

### Frontend build flags

These are baked in at build time because the frontend is a static bundle.

| Variable | Default | Notes |
|---|---|---|
| `VITE_DEFAULT_MODE` | `password` | Which generator tab opens first |
| `VITE_BASE_PATH` | `/` | Mirror of `BASE_PATH` for the frontend router |
| `VITE_PRESETS` | — | JSON blob with custom generator presets |
| `VITE_MAX_HISTORY` | `50` | Max entries in the local history |
| `ALLOWED_SAVE_TYPES` | all seven | Comma-separated list: `password,passphrase,pin,uuid,pronounceable,totp,special` |

A full annotated example lives in [`.env.example`](.env.example).

## Development

```bash
npm install                 # installs all workspaces
npm run dev -w frontend     # Vite dev server on http://localhost:5173
npm run dev -w backend      # Express + tsx watch on http://localhost:8080
npm run type-check          # check both workspaces
npm run build               # production build of both
```

The frontend expects the backend on the same origin. For split-origin dev, set
`CORS_ORIGIN=http://localhost:5173` on the backend side.

## First run

1. Start the stack and hit `/`. You'll see the generator.
2. If accounts are on, click **Login → Register**. The first user signs up normally;
   promote them to admin by flipping the `is_admin` column in the database (there is no
   bootstrap CLI by design — the first admin should be a deliberate act).
3. Set `ENABLE_SIGNUP=false` and restart. From here on new users are created via OIDC or
   by an admin triggering a password reset.

## Upgrading

Passy follows semantic versioning on the public GitHub releases. Minor and patch
upgrades are drop-in. Major versions are called out in the release notes with a short
migration paragraph.

Database migrations run automatically at startup and are transactional — a failed
migration rolls back and the process exits with a non-zero code instead of leaving you
in a half-migrated state.

## Troubleshooting

### `SMTP_FROM invalid` on startup

The startup check rejects placeholder addresses (`example.com`, `test@test`,
`change-me`) to prevent silently broken email on day one. Set a real sender address that
your relay will accept.

### TOTP auto-fill in 1Password does not trigger

TOTP lives on `/login/verify`, on its own route, for exactly this reason. If auto-fill
still fails, check that your 1Password browser extension is up to date — older versions
only re-scan the DOM on full navigation, which this flow provides.

### OIDC redirect mismatch

If your `APP_URL` is behind a reverse proxy that adds or strips a path, set
`OIDC_REDIRECT_URI` explicitly to match what you registered with your provider. The
auto-derived URI assumes `APP_URL` is the public-facing origin.

### Pwned Passwords lookup is slow the first time

The first lookup for any prefix downloads around 20 KB from the HIBP range API and
caches it. Subsequent lookups for the same prefix are served from disk.

## Contributing

Issues and PRs are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers the local setup,
the naming conventions, and how localization works.

## License

[MIT](LICENSE).

## Acknowledgments

- [zxcvbn](https://github.com/dropbox/zxcvbn) for the strength estimator.
- [Have I Been Pwned](https://haveibeenpwned.com/) for the breach data and the
  k-anonymity range API.
- The [Vue](https://vuejs.org/) and [Vite](https://vitejs.dev/) teams for the frontend
  foundation.
