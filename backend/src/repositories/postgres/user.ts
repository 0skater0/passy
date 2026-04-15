import type pg from 'pg';
import type {create_user_input, user_repository} from '../types.js';
import {USER_COLS, parse_user_row, parse_user_summary_row} from '../parse.js';

export function create_user_repository(pool: pg.Pool): user_repository {
    return {
        async find_by_id(id) {
            const client = await pool.connect();
            try {
                const {rows} = await client.query(
                    `SELECT ${USER_COLS}
                     FROM users WHERE id=$1`, [id]);
                return rows[0] ? parse_user_row(rows[0]) : null;
            } finally {
                client.release();
            }
        },

        async find_by_identifier(identifier) {
            const client = await pool.connect();
            try {
                const {rows} = await client.query(
                    `SELECT ${USER_COLS}
                     FROM users WHERE lower(username)=lower($1) OR lower(email)=lower($1)
                     ORDER BY id LIMIT 1`,
                    [identifier]
                );
                return rows[0] ? parse_user_row(rows[0]) : null;
            } finally {
                client.release();
            }
        },

        async find_by_oidc(issuer, sub) {
            const client = await pool.connect();
            try {
                const {rows} = await client.query(
                    `SELECT ${USER_COLS}
                     FROM users WHERE oidc_issuer=$1 AND oidc_sub=$2
                     ORDER BY id LIMIT 1`,
                    [issuer, sub]
                );
                return rows[0] ? parse_user_row(rows[0]) : null;
            } finally {
                client.release();
            }
        },

        async create(data: create_user_input) {
            const client = await pool.connect();
            try {
                const {rows} = await client.query(
                    `INSERT INTO users(username,email,password_hash,oidc_sub,oidc_issuer) VALUES($1,$2,$3,$4,$5)
                     RETURNING ${USER_COLS}`,
                    [data.username ?? null, data.email ?? null, data.password_hash, data.oidc_sub ?? null, data.oidc_issuer ?? null]
                );
                return parse_user_row(rows[0]);
            } finally {
                client.release();
            }
        },

        async link_oidc(id, issuer, sub) {
            const client = await pool.connect();
            try {
                await client.query(
                    'UPDATE users SET oidc_issuer=$1, oidc_sub=$2 WHERE id=$3',
                    [issuer, sub, id]
                );
            } finally {
                client.release();
            }
        },

        async count() {
            const client = await pool.connect();
            try {
                const {rows} = await client.query('SELECT COUNT(*) FROM users');
                return parseInt(rows[0].count, 10);
            } finally {
                client.release();
            }
        },

        async count_admins() {
            const client = await pool.connect();
            try {
                const {rows} = await client.query('SELECT COUNT(*) FROM users WHERE is_admin=true');
                return parseInt(rows[0].count, 10);
            } finally {
                client.release();
            }
        },

        async update_profile(id, username, email) {
            const client = await pool.connect();
            try {
                const {rows} = await client.query(
                    `UPDATE users SET username=$1, email=$2 WHERE id=$3
                     RETURNING ${USER_COLS}`,
                    [username, email, id]
                );
                return rows[0] ? parse_user_row(rows[0]) : null;
            } finally {
                client.release();
            }
        },

        async update_password(id, password_hash) {
            const client = await pool.connect();
            try {
                await client.query(
                    'UPDATE users SET password_hash=$1, password_changed_at=NOW() WHERE id=$2',
                    [password_hash, id]
                );
            } finally {
                client.release();
            }
        },

        async invalidate_sessions(id) {
            const client = await pool.connect();
            try {
                await client.query('UPDATE users SET password_changed_at=NOW() WHERE id=$1', [id]);
            } finally {
                client.release();
            }
        },

        async update_settings(id, settings) {
            const client = await pool.connect();
            try {
                await client.query(
                    'UPDATE users SET settings=$1 WHERE id=$2',
                    [JSON.stringify(settings), id]
                );
            } finally {
                client.release();
            }
        },

        async get_settings(id) {
            const client = await pool.connect();
            try {
                const {rows} = await client.query('SELECT settings FROM users WHERE id=$1', [id]);
                if (!rows[0]) return {};
                return rows[0].settings ?? {};
            } finally {
                client.release();
            }
        },

        async update_totp_pending(id, secret) {
            const client = await pool.connect();
            try {
                await client.query('UPDATE users SET totp_pending_secret=$1 WHERE id=$2', [secret, id]);
            } finally {
                client.release();
            }
        },

        async enable_totp(id, secret, backup_codes_json) {
            const client = await pool.connect();
            try {
                await client.query(
                    'UPDATE users SET totp_secret=$1, twofa_enabled=true, totp_pending_secret=NULL, backup_codes=$2 WHERE id=$3',
                    [secret, backup_codes_json, id]
                );
            } finally {
                client.release();
            }
        },

        async disable_totp(id) {
            const client = await pool.connect();
            try {
                await client.query(
                    `UPDATE users SET totp_secret=NULL, twofa_enabled=false, totp_pending_secret=NULL, backup_codes='[]' WHERE id=$1`,
                    [id]
                );
            } finally {
                client.release();
            }
        },

        async update_backup_codes(id, backup_codes_json) {
            const client = await pool.connect();
            try {
                await client.query('UPDATE users SET backup_codes=$1 WHERE id=$2', [backup_codes_json, id]);
            } finally {
                client.release();
            }
        },

        async update_last_login(id) {
            const client = await pool.connect();
            try {
                await client.query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [id]);
            } finally {
                client.release();
            }
        },

        async set_admin(id, value) {
            const client = await pool.connect();
            try {
                await client.query('UPDATE users SET is_admin=$1 WHERE id=$2', [value, id]);
            } finally {
                client.release();
            }
        },

        async delete_with_data(id) {
            // FK ON DELETE CASCADE on history + password_resets handles child rows
            await pool.query('DELETE FROM users WHERE id=$1', [id]);
        },

        async list_all() {
            const client = await pool.connect();
            try {
                const {rows} = await client.query(
                    'SELECT id, username, email, created_at, last_login_at, twofa_enabled, is_admin, oidc_sub FROM users ORDER BY id'
                );
                return rows.map((r: Record<string, unknown>) => parse_user_summary_row(r));
            } finally {
                client.release();
            }
        },

        async get_password_changed_at(id) {
            const client = await pool.connect();
            try {
                const {rows} = await client.query('SELECT password_changed_at FROM users WHERE id=$1', [id]);
                if (!rows[0]?.password_changed_at) return null;
                return new Date(rows[0].password_changed_at);
            } finally {
                client.release();
            }
        },

        async get_e2e_salt(id) {
            const client = await pool.connect();
            try {
                const {rows} = await client.query('SELECT e2e_salt FROM users WHERE id=$1', [id]);
                return rows[0]?.e2e_salt ?? null;
            } finally {
                client.release();
            }
        },

        async set_e2e_salt(id, salt) {
            const client = await pool.connect();
            try {
                await client.query('UPDATE users SET e2e_salt=$1 WHERE id=$2', [salt, id]);
            } finally {
                client.release();
            }
        }
    };
}
