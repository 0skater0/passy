import type pg from 'pg';
import type {create_history_input, history_repository, history_row, import_history_item} from '../types.js';
import {parse_history_row} from '../parse.js';

export function create_history_repository(pool: pg.Pool): history_repository {
    return {
        async list({uid, type, limit, offset}) {
            const client = await pool.connect();
            try {
                const has_type = type && type !== 'all';
                const conditions: string[] = [];
                const params: unknown[] = [];
                let idx = 1;

                if (uid != null) {
                    conditions.push(`user_id=$${idx++}`);
                    params.push(uid);
                }
                if (has_type) {
                    conditions.push(`type=$${idx++}`);
                    params.push(type);
                }

                const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
                params.push(limit, offset);
                const sql = `SELECT id, type, masked, length, charset, entropy_bits, zxcvbn_score, created_at, user_id FROM history ${where} ORDER BY id DESC LIMIT $${idx++} OFFSET $${idx}`;
                const {rows} = await client.query(sql, params);
                return rows.map((r: Record<string, unknown>) => parse_history_row(r));
            } finally {
                client.release();
            }
        },

        async create(entry: create_history_input) {
            const client = await pool.connect();
            try {
                const {rows} = await client.query(
                    `INSERT INTO history(user_id, type, masked, value, length, charset, entropy_bits, zxcvbn_score)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     RETURNING id, type, masked, value, length, charset, entropy_bits, zxcvbn_score, created_at, user_id`,
                    [entry.user_id ?? null, entry.type, entry.masked, entry.value ?? null,
                        entry.length, entry.charset, entry.entropy_bits ?? null, entry.zxcvbn_score ?? null]
                );
                return parse_history_row(rows[0]);
            } finally {
                client.release();
            }
        },

        async import_batch(uid, items) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                let imported = 0;
                for (const item of items) {
                    if (!item.type || !item.masked) continue;
                    const masked = String(item.masked).replace(/[\0\n\r]/g, '').slice(0, 256);
                    const value = typeof item.value === 'string' ? item.value.slice(0, 100000) : null;
                    await client.query(
                        `INSERT INTO history(user_id, type, masked, value, length, charset, entropy_bits, zxcvbn_score, created_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                        [uid, item.type, masked, value, item.length ?? masked.length,
                            item.charset ?? '', item.entropy_bits ?? null, item.zxcvbn_score ?? null,
                            item.created_at ?? new Date().toISOString()]
                    );
                    imported++;
                }
                await client.query('COMMIT');
                return imported;
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        },

        async delete_one(id, uid) {
            const client = await pool.connect();
            try {
                if (uid != null) {
                    await client.query('DELETE FROM history WHERE id=$1 AND user_id=$2', [id, uid]);
                } else {
                    await client.query('DELETE FROM history WHERE id=$1', [id]);
                }
            } finally {
                client.release();
            }
        },

        async delete_all(uid) {
            const client = await pool.connect();
            try {
                if (uid != null) {
                    await client.query('DELETE FROM history WHERE user_id=$1', [uid]);
                } else {
                    await client.query('DELETE FROM history');
                }
            } finally {
                client.release();
            }
        },

        async batch_update_values(uid, updates) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                let updated = 0;
                for (const {id, value} of updates) {
                    const {rowCount} = await client.query(
                        'UPDATE history SET value=$1 WHERE id=$2 AND user_id=$3',
                        [value, id, uid]
                    );
                    if (rowCount && rowCount > 0) updated++;
                }
                await client.query('COMMIT');
                return updated;
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        }
    };
}
