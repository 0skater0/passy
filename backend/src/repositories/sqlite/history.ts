import type Database from 'better-sqlite3';
import type {create_history_input, history_repository, import_history_item} from '../types.js';
import {parse_history_row} from '../parse.js';

export function create_history_repository(db: Database.Database): history_repository {
    return {
        async list({uid, type, limit, offset}) {
            const conditions: string[] = [];
            const params: unknown[] = [];

            if (uid != null) {
                conditions.push('user_id=?');
                params.push(uid);
            }
            if (type && type !== 'all') {
                conditions.push('type=?');
                params.push(type);
            }

            const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
            params.push(limit, offset);
            const sql = `SELECT id, type, masked, length, charset, entropy_bits, zxcvbn_score, created_at, user_id FROM history ${where} ORDER BY id DESC LIMIT ? OFFSET ?`;
            const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
            return rows.map(r => parse_history_row(r));
        },

        async create(entry: create_history_input) {
            const stmt = db.prepare(
                `INSERT INTO history(user_id, type, masked, value, length, charset, entropy_bits, zxcvbn_score)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            );
            const info = stmt.run(
                entry.user_id ?? null, entry.type, entry.masked, entry.value ?? null,
                entry.length, entry.charset, entry.entropy_bits ?? null, entry.zxcvbn_score ?? null
            );
            const row = db.prepare('SELECT id, type, masked, value, length, charset, entropy_bits, zxcvbn_score, created_at, user_id FROM history WHERE id=?').get(info.lastInsertRowid) as Record<string, unknown> | undefined;
            if (!row) throw new Error('Failed to read newly created history row');
            return parse_history_row(row);
        },

        async import_batch(uid, items) {
            const stmt = db.prepare(
                `INSERT INTO history(user_id, type, masked, value, length, charset, entropy_bits, zxcvbn_score, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            const run = db.transaction((batch: import_history_item[]) => {
                let count = 0;
                for (const item of batch) {
                    if (!item.type || !item.masked) continue;
                    const masked = String(item.masked).replace(/[\0\n\r]/g, '').slice(0, 256);
                    const value = typeof item.value === 'string' ? item.value.slice(0, 100000) : null;
                    stmt.run(
                        uid, item.type, masked, value, item.length ?? masked.length,
                        item.charset ?? '', item.entropy_bits ?? null, item.zxcvbn_score ?? null,
                        item.created_at ?? new Date().toISOString()
                    );
                    count++;
                }
                return count;
            });
            return run(items);
        },

        async delete_one(id, uid) {
            if (uid != null) {
                db.prepare('DELETE FROM history WHERE id=? AND user_id=?').run(id, uid);
            } else {
                db.prepare('DELETE FROM history WHERE id=?').run(id);
            }
        },

        async delete_all(uid) {
            if (uid != null) {
                db.prepare('DELETE FROM history WHERE user_id=?').run(uid);
            } else {
                db.prepare('DELETE FROM history').run();
            }
        },

        async batch_update_values(uid, updates) {
            const stmt = db.prepare('UPDATE history SET value=? WHERE id=? AND user_id=?');
            let updated = 0;
            const run = db.transaction(() => {
                for (const {id, value} of updates) {
                    const info = stmt.run(value, id, uid);
                    if (info.changes > 0) updated++;
                }
            });
            run();
            return updated;
        }
    };
}
