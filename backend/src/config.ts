// Reads environment variables and exposes a frozen config object.

function parse_bool(value: string | undefined, default_value: boolean): boolean {
    if (value == null || value === '') return default_value;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parse_db_type(value: string, database_url: string): 'sqlite' | 'postgres' {
    if (!value) return database_url.startsWith('sqlite:') ? 'sqlite' : 'postgres';
    if (value === 'sqlite' || value === 'postgres') return value;
    throw new Error(`Invalid DB_TYPE: "${value}" (must be "sqlite" or "postgres")`);
}

function parse_int(value: string | undefined, default_value: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : default_value;
}

const raw = {
    PORT: process.env.PORT || '8080',
    BASE_PATH: process.env.BASE_PATH || '/',
    ENABLE_BACKEND: process.env.ENABLE_BACKEND || 'true',
    DB_TYPE: process.env.DB_TYPE || '',
    SQLITE_PATH: process.env.SQLITE_PATH || '/data/passy.sqlite',
    DATABASE_URL: process.env.DATABASE_URL || '',
    POSTGRES_HOST: process.env.POSTGRES_HOST || process.env.PGHOST || 'passy-postgres',
    POSTGRES_PORT: process.env.POSTGRES_PORT || process.env.PGPORT || '5432',
    POSTGRES_DB: process.env.POSTGRES_DB || process.env.PGDATABASE || 'passy',
    POSTGRES_USER: process.env.POSTGRES_USER || process.env.PGUSER || 'passy',
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || '',
    ENABLE_ACCOUNTS: process.env.ENABLE_ACCOUNTS || 'false',
    ENABLE_SIGNUP: process.env.ENABLE_SIGNUP || 'false',
    JWT_SECRET: process.env.JWT_SECRET || '',
    SMTP_HOST: process.env.SMTP_HOST || '',
    SMTP_PORT: process.env.SMTP_PORT || '587',
    SMTP_USER: process.env.SMTP_USER || '',
    SMTP_PASS: process.env.SMTP_PASS || '',
    SMTP_FROM: process.env.SMTP_FROM || '',
    OIDC_ISSUER_URL: process.env.OIDC_ISSUER_URL || '',
    OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID || '',
    OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET || '',
    OIDC_SCOPES: process.env.OIDC_SCOPES || 'openid profile email',
    OIDC_REDIRECT_URI: process.env.OIDC_REDIRECT_URI || '',
    OIDC_AUTO_LINK_BY_EMAIL: process.env.OIDC_AUTO_LINK_BY_EMAIL || 'false',
    ALLOWED_SAVE_TYPES: process.env.ALLOWED_SAVE_TYPES || 'password,passphrase,pin,uuid,pronounceable,totp,special',
    APP_URL: process.env.APP_URL || '',
    CORS_ORIGIN: process.env.CORS_ORIGIN || '',
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS || '60000',
    RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX || '30',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    ENABLE_PWNED: process.env.ENABLE_PWNED || 'false',
    PWNED_DATA_DIR: process.env.PWNED_DATA_DIR || '/data/pwned',
    PWNED_LAZY_FETCH: process.env.PWNED_LAZY_FETCH || 'true',
    PWNED_TTL_HOURS: process.env.PWNED_TTL_HOURS || '168'
};

const cfg = {
    port: parse_int(raw.PORT, 8080),
    base_path: raw.BASE_PATH.endsWith('/') ? raw.BASE_PATH : raw.BASE_PATH + '/',
    enable_backend: parse_bool(raw.ENABLE_BACKEND, true),
    db_type: parse_db_type(raw.DB_TYPE, raw.DATABASE_URL),
    sqlite_path: raw.SQLITE_PATH,
    database_url: raw.DATABASE_URL,
    pg: {
        host: raw.POSTGRES_HOST,
        port: parse_int(raw.POSTGRES_PORT, 5432),
        database: raw.POSTGRES_DB,
        user: raw.POSTGRES_USER,
        password: raw.POSTGRES_PASSWORD,
    },
    accounts: {
        enable: parse_bool(raw.ENABLE_ACCOUNTS, false),
        enable_signup: parse_bool(raw.ENABLE_SIGNUP, false),
        jwt_secret: raw.JWT_SECRET,
        smtp: {
            host: raw.SMTP_HOST,
            port: parse_int(raw.SMTP_PORT, 587),
            user: raw.SMTP_USER,
            pass: raw.SMTP_PASS,
            from: raw.SMTP_FROM,
        }
    },
    allowed_save_types: raw.ALLOWED_SAVE_TYPES.split(',').map(s => s.trim()).filter(Boolean),
    app_url: raw.APP_URL.replace(/\/+$/, ''),
    cors_origin: raw.CORS_ORIGIN,
    rate_limit_window_ms: parse_int(raw.RATE_LIMIT_WINDOW_MS, 60000),
    rate_limit_max: parse_int(raw.RATE_LIMIT_MAX, 30),
    log_level: raw.LOG_LEVEL,
    oidc: {
        issuer_url: raw.OIDC_ISSUER_URL,
        client_id: raw.OIDC_CLIENT_ID,
        client_secret: raw.OIDC_CLIENT_SECRET,
        scopes: raw.OIDC_SCOPES.split(/[\s,]+/).filter(Boolean),
        redirect_uri: raw.OIDC_REDIRECT_URI,
        auto_link_by_email: parse_bool(raw.OIDC_AUTO_LINK_BY_EMAIL, false),
        enabled: Boolean(raw.OIDC_ISSUER_URL && raw.OIDC_CLIENT_ID && raw.OIDC_CLIENT_SECRET),
    },
    enable_pwned: parse_bool(raw.ENABLE_PWNED, false),
    pwned_data_dir: raw.PWNED_DATA_DIR,
    pwned_lazy_fetch: parse_bool(raw.PWNED_LAZY_FETCH, true),
    pwned_ttl_hours: parse_int(raw.PWNED_TTL_HOURS, 168),
    app_version: process.env.APP_VERSION || ''
} as const;

export const config = Object.freeze(cfg);

// Startup validation for security-critical config
if (config.accounts.enable && !config.accounts.jwt_secret) {
    console.error('FATAL: ENABLE_ACCOUNTS is true but JWT_SECRET is not set. Aborting.');
    process.exit(1);
}
if (config.accounts.enable && !config.app_url) {
    console.error('FATAL: ENABLE_ACCOUNTS is true but APP_URL is not set. Password reset links require an explicit APP_URL. Aborting.');
    process.exit(1);
}
if (config.enable_backend && config.db_type === 'postgres' && !config.pg.password) {
    console.error('FATAL: POSTGRES_PASSWORD is not set. Set a strong password via environment variable. Aborting.');
    process.exit(1);
}
if (config.oidc.enabled && !config.oidc.redirect_uri && !config.app_url) {
    console.error('FATAL: OIDC is configured but neither OIDC_REDIRECT_URI nor APP_URL is set — callback URL cannot be derived. Aborting.');
    process.exit(1);
}
if (config.cors_origin === '*') {
    // Setting Allow-Origin: * together with Allow-Credentials: true is forbidden by the
    // CORS spec and silently rejected by browsers. Fail fast so operators notice immediately.
    console.error('FATAL: CORS_ORIGIN="*" combined with credentialed requests is invalid. Set a concrete origin or leave CORS_ORIGIN empty. Aborting.');
    process.exit(1);
}
if (config.accounts.enable && config.accounts.smtp.host) {
    const from = config.accounts.smtp.from;
    // Reject obvious placeholder tokens. RFC-5322 display-name format (e.g. `Name <addr@host>`)
    // is legitimate and must NOT be rejected — only match literal placeholder words and the
    // unfilled `<change_me>`-style angle-bracket token that carries no `@`.
    if (from) {
        const has_placeholder_word = /\bchange[_-]?me\b/i.test(from);
        const is_bracket_placeholder = /^<[^@>]*>$/.test(from);
        if (has_placeholder_word || is_bracket_placeholder) {
            console.error(`FATAL: SMTP_FROM contains a placeholder value ("${from}"). Set a real sender address. Aborting.`);
            process.exit(1);
        }
        // Any real sender must contain an @ somewhere.
        if (!from.includes('@')) {
            console.error(`FATAL: SMTP_FROM ("${from}") is not a valid email address (missing "@"). Aborting.`);
            process.exit(1);
        }
    }
    if (!from && !config.accounts.smtp.user) {
        console.error('FATAL: SMTP is configured (SMTP_HOST set) but neither SMTP_FROM nor SMTP_USER is set — no sender address available. Aborting.');
        process.exit(1);
    }
}
