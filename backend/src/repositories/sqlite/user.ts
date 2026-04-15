import type Database from 'better-sqlite3';
import type {create_user_input, user_repository} from '../types.js';
import {USER_COLS, parse_user_row, parse_user_summary_row} from '../parse.js';

export function create_user_repository(db: Database.Database): user_repository {
    return {
        async find_by_id(id) {
            const row = db.prepare(`SELECT ${USER_COLS} FROM users WHERE id=?`).get(id) as Record<string, unknown> | undefined;
            return row ? parse_user_row(row) : null;
        },

        async find_by_identifier(identifier) {
            const row = db.prepare(
                `SELECT ${USER_COLS}
                 FROM users WHERE lower(username)=lower(?) OR lower(email)=lower(?)
                 ORDER BY id LIMIT 1`
            ).get(identifier, identifier) as Record<string, unknown> | undefined;
            return row ? parse_user_row(row) : null;
        },

        async find_by_oidc(issuer, sub) {
            const row = db.prepare(
                `SELECT ${USER_COLS}
                 FROM users WHERE oidc_issuer=? AND oidc_sub=?
                 ORDER BY id LIMIT 1`
            ).get(issuer, sub) as Record<string, unknown> | undefined;
            return row ? parse_user_row(row) : null;
        },

        async create(data: create_user_input) {
            const info = db.prepare(
                'INSERT INTO users(username,email,password_hash,oidc_sub,oidc_issuer) VALUES(?,?,?,?,?)'
            ).run(data.username ?? null, data.email ?? null, data.password_hash, data.oidc_sub ?? null, data.oidc_issuer ?? null);
            const row = db.prepare(`SELECT ${USER_COLS} FROM users WHERE id=?`).get(info.lastInsertRowid) as Record<string, unknown> | undefined;
            if (!row) throw new Error('Failed to read newly created user');
            return parse_user_row(row);
        },

        async link_oidc(id, issuer, sub) {
            db.prepare('UPDATE users SET oidc_issuer=?, oidc_sub=? WHERE id=?').run(issuer, sub, id);
        },

        async count() {
            const row = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as {cnt: number};
            return row.cnt;
        },

        async count_admins() {
            const row = db.prepare('SELECT COUNT(*) as cnt FROM users WHERE is_admin=1').get() as {cnt: number};
            return row.cnt;
        },

        async update_profile(id, username, email) {
            // Atomic UPDATE + SELECT so concurrent writers can't interleave between the two statements.
            const update_and_read = db.transaction((uid: number, u: string | null, e: string | null) => {
                db.prepare('UPDATE users SET username=?, email=? WHERE id=?').run(u, e, uid);
                return db.prepare(`SELECT ${USER_COLS} FROM users WHERE id=?`).get(uid) as Record<string, unknown> | undefined;
            });
            const row = update_and_read(id, username, email);
            return row ? parse_user_row(row) : null;
        },

        async update_password(id, password_hash) {
            // strftime emits ISO8601 with explicit T-separator and Z suffix so `new Date(string)`
            // parses deterministically as UTC regardless of container TZ. `datetime('now')` would
            // return 'YYYY-MM-DD HH:MM:SS' (space, no Z) which JS parses as local time.
            db.prepare(
                "UPDATE users SET password_hash=?, password_changed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?"
            ).run(password_hash, id);
        },

        async invalidate_sessions(id) {
            db.prepare(
                "UPDATE users SET password_changed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?"
            ).run(id);
        },

        async update_settings(id, settings) {
            db.prepare('UPDATE users SET settings=? WHERE id=?').run(JSON.stringify(settings), id);
        },

        async get_settings(id) {
            const row = db.prepare('SELECT settings FROM users WHERE id=?').get(id) as {settings: string} | undefined;
            if (!row?.settings) return {};
            return typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
        },

        async update_totp_pending(id, secret) {
            db.prepare('UPDATE users SET totp_pending_secret=? WHERE id=?').run(secret, id);
        },

        async enable_totp(id, secret, backup_codes_json) {
            db.prepare(
                'UPDATE users SET totp_secret=?, twofa_enabled=1, totp_pending_secret=NULL, backup_codes=? WHERE id=?'
            ).run(secret, backup_codes_json, id);
        },

        async disable_totp(id) {
            db.prepare(
                "UPDATE users SET totp_secret=NULL, twofa_enabled=0, totp_pending_secret=NULL, backup_codes='[]' WHERE id=?"
            ).run(id);
        },

        async update_backup_codes(id, backup_codes_json) {
            db.prepare('UPDATE users SET backup_codes=? WHERE id=?').run(backup_codes_json, id);
        },

        async update_last_login(id) {
            // ISO8601 for consistent parsing (see update_password comment).
            db.prepare(
                "UPDATE users SET last_login_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?"
            ).run(id);
        },

        async set_admin(id, value) {
            db.prepare('UPDATE users SET is_admin=? WHERE id=?').run(value ? 1 : 0, id);
        },

        async delete_with_data(id) {
            // FK ON DELETE CASCADE on history + password_resets handles child rows
            db.prepare('DELETE FROM users WHERE id=?').run(id);
        },

        async list_all() {
            const rows = db.prepare(
                'SELECT id, username, email, created_at, last_login_at, twofa_enabled, is_admin, oidc_sub FROM users ORDER BY id'
            ).all() as Record<string, unknown>[];
            return rows.map(r => parse_user_summary_row(r));
        },

        async get_password_changed_at(id) {
            const row = db.prepare('SELECT password_changed_at FROM users WHERE id=?').get(id) as {password_changed_at: string} | undefined;
            if (!row?.password_changed_at) return null;
            return new Date(row.password_changed_at);
        },

        async get_e2e_salt(id) {
            const row = db.prepare('SELECT e2e_salt FROM users WHERE id=?').get(id) as {e2e_salt: string | null} | undefined;
            return row?.e2e_salt ?? null;
        },

        async set_e2e_salt(id, salt) {
            db.prepare('UPDATE users SET e2e_salt=? WHERE id=?').run(salt, id);
        }
    };
}
