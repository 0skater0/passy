import Database from 'better-sqlite3';
import type {repositories} from '../types.js';
import {create_history_repository} from './history.js';
import {create_user_repository} from './user.js';
import {create_reset_repository} from './reset.js';

export function create_sqlite_repositories(db_path: string): repositories {
    const db = new Database(db_path);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    init_schema(db);

    return {
        history: create_history_repository(db),
        users: create_user_repository(db),
        resets: create_reset_repository(db)
    };
}

function init_schema(db: Database.Database): void {
    // Schema creation must happen BEFORE ALTER TABLE migrations — a fresh database has no
    // `users` table yet, and pragma_table_info returns 0 rows for a nonexistent table, which
    // would wrongly trigger an ALTER TABLE on a missing table.
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            username            TEXT,
            email               TEXT,
            password_hash       TEXT NOT NULL,
            totp_secret         TEXT,
            totp_pending_secret TEXT,
            twofa_enabled       INTEGER DEFAULT 0,
            backup_codes        TEXT DEFAULT '[]',
            is_admin            INTEGER DEFAULT 0,
            last_login_at       TEXT,
            settings            TEXT DEFAULT '{}',
            e2e_salt            TEXT,
            oidc_sub            TEXT,
            oidc_issuer         TEXT,
            created_at          TEXT DEFAULT (datetime('now')),
            password_changed_at TEXT DEFAULT (datetime('now'))
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username COLLATE NOCASE);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email COLLATE NOCASE);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oidc ON users (oidc_issuer, oidc_sub)
            WHERE oidc_issuer IS NOT NULL AND oidc_sub IS NOT NULL;

        CREATE TABLE IF NOT EXISTS history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
            type        TEXT,
            masked      TEXT,
            value       TEXT,
            length      INTEGER,
            charset     TEXT,
            entropy_bits REAL,
            zxcvbn_score INTEGER,
            created_at   TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_history_user_id ON history (user_id);

        CREATE TABLE IF NOT EXISTS password_resets (
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            code       TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets (user_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_password_resets_code ON password_resets (code);
    `);

    // Migration for existing pre-OIDC databases: add missing columns if absent.
    // Runs after CREATE TABLE so pragma_table_info reflects the actual schema.
    const has_oidc_col = db.prepare(
        `SELECT COUNT(*) as cnt FROM pragma_table_info('users') WHERE name='oidc_sub'`
    ).get() as {cnt: number} | undefined;
    if (has_oidc_col && has_oidc_col.cnt === 0) {
        try {
            db.exec(`ALTER TABLE users ADD COLUMN oidc_sub TEXT`);
            db.exec(`ALTER TABLE users ADD COLUMN oidc_issuer TEXT`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : '';
            if (!msg.includes('duplicate column')) throw e;
        }
    }
}
