import type pg from 'pg';
import type {password_reset_repository} from '../types.js';
import {sha256} from '../../lib/hash.js';

export function create_reset_repository(pool: pg.Pool): password_reset_repository {
    return {
        async create_token(user_id, code, expires_at) {
            const hashed = sha256(code);
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query('DELETE FROM password_resets WHERE user_id=$1', [user_id]);
                await client.query(
                    'INSERT INTO password_resets(user_id,code,expires_at) VALUES($1,$2,$3)',
                    [user_id, hashed, expires_at]
                );
                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        },

        async find_valid(code) {
            const hashed = sha256(code);
            const client = await pool.connect();
            try {
                const {rows} = await client.query(
                    'SELECT user_id FROM password_resets WHERE code=$1 AND expires_at>NOW()',
                    [hashed]
                );
                return rows[0] ? {user_id: rows[0].user_id} : null;
            } finally {
                client.release();
            }
        },

        async delete_for_user(user_id) {
            const client = await pool.connect();
            try {
                await client.query('DELETE FROM password_resets WHERE user_id=$1', [user_id]);
            } finally {
                client.release();
            }
        }
    };
}
