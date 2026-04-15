import {type Request, Router} from 'express';
import {get_repos} from '../db.js';
import {config} from '../config.js';
import type {history_type, history_row} from '../repositories/types.js';
import {extract_session_uid} from './auth.js';
import {create_rate_limiter} from '../lib/rate_limit.js';
import {async_handler} from '../lib/async_handler.js';

const MAX_VALUE_LENGTH = 100000;
const MAX_PASSWORD_LENGTH = 100000;

function validate_type(t: string): t is history_type {
    return config.allowed_save_types.includes(t);
}

function sanitize_masked(s: string): string {
    return s.replace(/[\0\n\r]/g, '').slice(0, 256);
}

/** Parse integer query parameter. Returns default when absent, null when malformed (→ 400). */
function parse_int_query_strict(raw: unknown, default_value: number, min: number, max: number): number | null {
    if (raw === undefined || raw === '') return default_value;
    const n = Number(raw);
    if (!Number.isFinite(n) || Math.floor(n) !== n) return null;
    if (n < min || n > max) return null;
    return n;
}

/** Strip internal fields (user_id) from history rows before API response. */
function sanitize_history_row(row: history_row): Omit<history_row, 'user_id'> {
    const {user_id, ...rest} = row;
    return rest;
}

/** Extracts authenticated user ID, respecting password-change invalidation. */
async function accounts_uid(req: Request): Promise<number | null> {
    if (!config.accounts.enable) return null;
    return extract_session_uid(req);
}

export function history_router() {
    const r = Router();

    const rate_limit = create_rate_limiter({window_ms: config.rate_limit_window_ms, max: config.rate_limit_max});

    r.get('/', async_handler(async (req, res) => {
        const limit = parse_int_query_strict(req.query.limit, 50, 1, 200);
        if (limit === null) return res.status(400).json({error: 'Invalid limit'});
        const offset = parse_int_query_strict(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
        if (offset === null) return res.status(400).json({error: 'Invalid offset'});
        const raw_type = req.query.type === undefined ? 'all' : String(req.query.type);
        if (raw_type !== 'all' && !validate_type(raw_type)) return res.status(400).json({error: 'Invalid type'});
        const type = raw_type as history_type | 'all';
        const uid = await accounts_uid(req);
        if (config.accounts.enable && !uid) return res.status(401).json({error: 'Unauthorized'});
        const items = await get_repos().history.list({
            uid: config.accounts.enable ? uid : undefined,
            type, limit, offset
        });
        res.json({items: items.map(row => sanitize_history_row(row))});
    }));

    r.post('/', rate_limit, async_handler(async (req, res) => {
        const body = req.body;
        if (!body || !validate_type(body.type)) return res.status(400).json({error: 'Invalid type'});
        if (!body.masked || typeof body.masked !== 'string') return res.status(400).json({error: 'Invalid masked'});
        if (!Number.isFinite(body.length) || body.length < 1 || body.length > MAX_PASSWORD_LENGTH) return res.status(400).json({error: 'Invalid length'});
        if (body.value != null && typeof body.value !== 'string') return res.status(400).json({error: 'Invalid value'});
        if (typeof body.value === 'string' && body.value.length > MAX_VALUE_LENGTH) {
            return res.status(400).json({error: `Value exceeds ${MAX_VALUE_LENGTH} characters`});
        }
        const uid = await accounts_uid(req);
        if (config.accounts.enable && !uid) return res.status(401).json({error: 'Unauthorized'});
        const charset = typeof body.charset === 'string' ? body.charset.slice(0, 256) : '';
        const entropy_bits = body.entropy_bits != null ? Number(body.entropy_bits) : null;
        const zxcvbn_score = body.zxcvbn_score != null ? Number(body.zxcvbn_score) : null;
        const row = await get_repos().history.create({
            user_id: config.accounts.enable ? uid : null,
            type: body.type,
            masked: sanitize_masked(body.masked),
            value: typeof body.value === 'string' ? body.value : null,
            length: body.length,
            charset,
            entropy_bits: Number.isFinite(entropy_bits) ? entropy_bits : null,
            zxcvbn_score: Number.isFinite(zxcvbn_score) ? zxcvbn_score : null
        });
        res.json({ok: true, item: sanitize_history_row(row)});
    }));

    r.post('/import', rate_limit, async_handler(async (req, res) => {
        const uid = await accounts_uid(req);
        if (!uid) return res.status(401).json({error: 'Unauthorized'});
        const items = req.body?.items;
        if (!Array.isArray(items) || items.length === 0) return res.status(400).json({error: 'No items'});
        if (items.length > 500) return res.status(400).json({error: 'Too many items (max 500)'});
        const iso_date_re = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
        const valid_items = items
            .filter((item: Record<string, unknown>) =>
                item && typeof item.type === 'string' && validate_type(item.type) &&
                typeof item.masked === 'string' && item.masked.length > 0 &&
                (item.value == null || (typeof item.value === 'string' && item.value.length <= MAX_VALUE_LENGTH))
            )
            .map((item: Record<string, unknown>) => ({
                type: item.type as history_type,
                masked: sanitize_masked(item.masked as string),
                created_at: typeof item.created_at === 'string' && iso_date_re.test(item.created_at)
                    ? item.created_at : undefined,
                value: typeof item.value === 'string' ? (item.value as string) : undefined,
                length: typeof item.length === 'number' && Number.isFinite(item.length) ? item.length : undefined,
                charset: typeof item.charset === 'string' ? (item.charset as string).slice(0, 256) : undefined,
                entropy_bits: typeof item.entropy_bits === 'number' && Number.isFinite(item.entropy_bits) ? item.entropy_bits : undefined,
                zxcvbn_score: typeof item.zxcvbn_score === 'number' && Number.isFinite(item.zxcvbn_score) ? item.zxcvbn_score : undefined,
            }));
        if (valid_items.length === 0) return res.status(400).json({error: 'No valid items'});
        const imported = await get_repos().history.import_batch(uid, valid_items);
        res.json({ok: true, imported});
    }));

    r.put('/batch-update', rate_limit, async_handler(async (req, res) => {
        const uid = await accounts_uid(req);
        if (!uid) return res.status(401).json({error: 'Unauthorized'});
        const raw_updates = req.body?.updates;
        if (!Array.isArray(raw_updates) || raw_updates.length === 0) return res.status(400).json({error: 'No updates'});
        if (raw_updates.length > 500) return res.status(400).json({error: 'Too many updates (max 500)'});
        const updates: {id: number; value: string}[] = [];
        for (const u of raw_updates) {
            if (!u || typeof u !== 'object' || !Number.isFinite(u.id) || typeof u.value !== 'string') {
                return res.status(400).json({error: 'Invalid update entry'});
            }
            if (u.value.length > MAX_VALUE_LENGTH) {
                return res.status(400).json({error: `Value exceeds ${MAX_VALUE_LENGTH} characters`});
            }
            updates.push({id: u.id, value: u.value});
        }
        const updated = await get_repos().history.batch_update_values(uid, updates);
        res.json({ok: true, updated});
    }));

    r.delete('/all', rate_limit, async_handler(async (req, res) => {
        const uid = await accounts_uid(req);
        if (config.accounts.enable && !uid) return res.status(401).json({error: 'Unauthorized'});
        await get_repos().history.delete_all(config.accounts.enable ? uid : undefined);
        res.json({ok: true});
    }));

    r.delete('/:id', rate_limit, async_handler(async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({error: 'Invalid id'});
        const uid = await accounts_uid(req);
        if (config.accounts.enable && !uid) return res.status(401).json({error: 'Unauthorized'});
        await get_repos().history.delete_one(id, config.accounts.enable ? uid : undefined);
        res.json({ok: true});
    }));

    return r;
}
