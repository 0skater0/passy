# Contributing

Thanks for considering a contribution. This file covers local setup, the house style,
and the workflow for patches and translations.

## Development setup

You need:

- **Node.js 22+** (any LTS-ish distribution — fnm, nvm, Volta, the official installer)
- **Git**
- One of **Postgres 15+** or nothing, in which case the app falls back to SQLite

Clone and install:

```bash
git clone https://github.com/0skater0/passy.git
cd passy
npm install
cp .env.example .env        # fill in JWT_SECRET and DB credentials
```

Then pick a workflow:

```bash
# Full build, then start (what the Docker image does)
npm run build
npm start -w backend

# Split dev: hot-reload frontend, watch-compile backend
npm run dev -w backend      # Express + tsx watch, :8080
npm run dev -w frontend     # Vite dev server, :5173 with proxy to :8080

# Quick sanity check
npm run type-check
```

First run with accounts enabled: register a user, then promote them to admin via the
database (`UPDATE users SET is_admin = true WHERE email = '...';`). There is no bootstrap
CLI — making the first admin a deliberate manual step is a feature, not an oversight.

## Project layout

```
backend/
  src/
    index.ts                  # Express entry, route mounting, graceful shutdown
    config.ts                 # env parsing and validation (fails fast on startup)
    db.ts                     # Postgres/SQLite pick + migration runner
    lib/                      # rate limiting, mailer, bcrypt, async error wrapper
    repositories/             # Postgres and SQLite impls behind shared interfaces
      postgres/
      sqlite/
    routes/                   # health, auth, oidc, admin, history, pwned, settings

frontend/
  src/
    main.ts                   # Vue app entry
    router.ts                 # Vue Router
    pages/                    # Home, Account, LoginVerify, PasswordReset, Admin, ...
    components/
      account/                # TOTP, password, backup-code, delete-account dialogs
      ui/                     # Button, Card, Dialog, Tabs, Toast — the design system
    composables/              # useAuth, useForm, useToast
    lib/                      # api client, generators, zxcvbn wrapper, storage
    i18n/locales/             # en.json, de.json

docs/                         # screenshots used by the README
```

The backend and frontend are independent npm workspaces. The backend builds into
`backend/dist/`; the frontend into `frontend/dist/`. The backend serves
`frontend/dist/` in production so there's exactly one port to expose.

## Coding conventions

- **TypeScript, strict.** No implicit `any`. Public function signatures are
  explicitly typed; internals rely on inference.
- **`snake_case` for variables and functions, `PascalCase` for Vue components and
  types.** This deviates from idiomatic Kotlin-to-the-metal style but stays consistent
  with the rest of my projects.
- **Repositories own SQL.** Routes call repositories; routes never speak to the
  database directly. Postgres and SQLite have separate implementations behind the same
  interface, so a mistake in one does not leak into the other.
- **Comments explain *why*, not *what*.** If the code reads clearly, skip the comment.
  If a choice is non-obvious (timing-attack mitigation, TTL picked to match RFC, etc.),
  say so in one sentence above it.
- **No secrets in logs.** That includes decrypted vault content, JWT values, session
  tokens, backup codes and TOTP seeds. If you're not sure whether a log line could leak,
  err on the side of logging less.
- **Fail fast on startup.** Bad config should crash the process at boot, not produce
  broken behavior at request time. See `backend/src/config.ts` for the pattern.

## Commit messages

Imperative, short, one topic per commit. Reference the GitHub issue number when there
is one:

```
Reject SMTP_FROM placeholder on startup (#14)

Deployments with a copy-pasted example.com sender addressed produced
silent email drops. The startup check now rejects placeholder domains
with a clear message instead of booting.
```

The body, when present, explains *why* — the diff already tells you *what*.

## Pull requests

Before opening a PR:

- [ ] `npm run type-check` is clean
- [ ] `npm run build` succeeds from a clean install
- [ ] New user-facing strings go through `vue-i18n` with matching keys in both `en.json`
      and `de.json`
- [ ] No secrets, decrypted values, or full command lines added to log calls
- [ ] If you changed the database schema, there is a matching migration and it is
      idempotent

The PR template asks for a short summary and a note on breaking changes. Keep the
summary concrete — "adds X, removes Y" beats "improves Z".

## Localization

Every user-facing string goes through `vue-i18n`. Locale bundles live at
`frontend/src/i18n/locales/`:

- `en.json` — the English source of truth. Every key exists here.
- `de.json` — German. Every key exists here too.

To add a new key:

1. Add it to `en.json` with the English wording.
2. Add it to `de.json` with a translation.
3. Reference it as `t('your.key')` in `<template>` or `$t('your.key')` from composables.

To add a new language:

1. Copy `en.json` to `<lang>.json`. Keep the keys, translate the values.
2. Register the locale in `frontend/src/i18n/index.ts`.
3. Add a dropdown entry wherever the language picker is surfaced.

The backend sends only a handful of strings over the wire (mainly email templates).
Those live in `backend/src/lib/mailer.ts` and are rendered server-side with a simple
placeholder scheme — no template engine.

## Security reports

Please do not file security-relevant bugs as public GitHub issues. Email the
maintainer directly; see the profile at [github.com/0skater0](https://github.com/0skater0).
