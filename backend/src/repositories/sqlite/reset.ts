import type Database from 'better-sqlite3';
import type {password_reset_repository} from '../types.js';
import {sha256} from '../../lib/hash.js';

export function create_reset_repository(db: Database.Database): password_reset_repository {
    return {
        async create_token(user_id, code, expires_at) {
            const hashed = sha256(code);
            const run = db.transaction(() => {
                db.prepare('DELETE FROM password_resets WHERE user_id=?').run(user_id);
                db.prepare(
                    'INSERT INTO password_resets(user_id,code,expires_at) VALUES(?,?,?)'
                ).run(user_id, hashed, expires_at.toISOString());
            });
            run();
        },

        async find_valid(code) {
            // expires_at is stored as ISO-8601 (Date.toISOString() → YYYY-MM-DDTHH:MM:SS.sssZ).
            // Use strftime with matching format so lexicographic TEXT comparison is correct.
            // Plain datetime('now') returns "YYYY-MM-DD HH:MM:SS" which compares wrong against
            // the ISO string (T > space in ASCII), silently extending token validity by hours.
            const hashed = sha256(code);
            const row = db.prepare(
                "SELECT user_id FROM password_resets WHERE code=? AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')"
            ).get(hashed) as {user_id: number} | undefined;
            return row ? {user_id: row.user_id} : null;
        },

        async delete_for_user(user_id) {
            db.prepare('DELETE FROM password_resets WHERE user_id=?').run(user_id);
        }
    };
}
