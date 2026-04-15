import {config} from './config.js';
import type {repositories} from './repositories/types.js';

let repos: repositories | null = null;

export async function init_db(): Promise<void> {
    if (!config.enable_backend) return;

    if (config.db_type === 'sqlite') {
        const {create_sqlite_repositories} = await import('./repositories/sqlite/index.js');
        repos = create_sqlite_repositories(config.sqlite_path);
    } else {
        const pg = await import('pg');
        const {create_postgres_repositories} = await import('./repositories/postgres/index.js');

        const conn_str = config.database_url ||
            `postgresql://${encodeURIComponent(config.pg.user)}:${encodeURIComponent(config.pg.password)}@${config.pg.host}:${config.pg.port}/${encodeURIComponent(config.pg.database)}`;
        const pool = new pg.default.Pool({connectionString: conn_str});

        repos = create_postgres_repositories(pool);

        // Initialize schema (idempotent / migration-safe, wrapped in transaction)
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            await client.query(`CREATE TABLE IF NOT EXISTS history
                                (
                                    id     SERIAL PRIMARY KEY,
                                    type   TEXT,
                                    masked TEXT,
                                    length INTEGER
                                )`);
            await client.query(`ALTER TABLE history ADD COLUMN IF NOT EXISTS user_id INTEGER`);
            await client.query(`ALTER TABLE history ADD COLUMN IF NOT EXISTS charset TEXT`);
            await client.query(`ALTER TABLE history ADD COLUMN IF NOT EXISTS value TEXT`);
            await client.query(`ALTER TABLE history ADD COLUMN IF NOT EXISTS entropy_bits REAL`);
            await client.query(`ALTER TABLE history ADD COLUMN IF NOT EXISTS zxcvbn_score INTEGER`);
            await client.query(`ALTER TABLE history ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);

            // Migrate legacy camelCase columns to snake_case (idempotent)
            await client.query(`DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='history' AND column_name='entropyBits') THEN
                    UPDATE history SET entropy_bits="entropyBits", zxcvbn_score="zxcvbnScore", created_at="createdAt" WHERE entropy_bits IS NULL AND "entropyBits" IS NOT NULL;
                    ALTER TABLE history DROP COLUMN "entropyBits";
                    ALTER TABLE history DROP COLUMN "zxcvbnScore";
                    ALTER TABLE history DROP COLUMN "createdAt";
                END IF;
            END $$`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_history_user_id ON history (user_id)`);

            await client.query(`CREATE TABLE IF NOT EXISTS users
                                (
                                    id                  SERIAL PRIMARY KEY,
                                    username            TEXT,
                                    email               TEXT,
                                    password_hash       TEXT NOT NULL,
                                    totp_secret         TEXT,
                                    twofa_enabled       BOOLEAN DEFAULT false,
                                    created_at          TIMESTAMPTZ DEFAULT NOW(),
                                    password_changed_at TIMESTAMPTZ DEFAULT NOW()
                                )`);
            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending_secret TEXT`);
            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS backup_codes JSONB DEFAULT '[]'`);
            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false`);
            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`);
            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'`);
            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS e2e_salt TEXT`);
            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS oidc_sub TEXT`);
            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS oidc_issuer TEXT`);
            await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users ((lower(username)))`);
            await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users ((lower(email)))`);
            await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oidc ON users (oidc_issuer, oidc_sub) WHERE oidc_issuer IS NOT NULL AND oidc_sub IS NOT NULL`);

            await client.query(`CREATE TABLE IF NOT EXISTS password_resets
                                (
                                    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                    code       TEXT    NOT NULL,
                                    expires_at TIMESTAMPTZ NOT NULL
                                )`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets (user_id)`);
            await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_password_resets_code ON password_resets (code)`);

            // FK for history.user_id (idempotent — skips if constraint already exists)
            await client.query(`DO $$ BEGIN
                ALTER TABLE history ADD CONSTRAINT fk_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
            EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }
}

export function get_repos(): repositories {
    if (repos) return repos;
    throw new Error('Repositories not initialized');
}
