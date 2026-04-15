import {type Request, type Response, type NextFunction, Router} from 'express';
import {get_repos} from '../db.js';
import {parse_session} from './auth.js';
import {send_template_email} from '../lib/mailer.js';
import {config} from '../config.js';
import crypto from 'crypto';
import {async_handler} from '../lib/async_handler.js';
import {create_rate_limiter} from '../lib/rate_limit.js';

// Modest rate-limit for admin mail-amplifier endpoints (avoid mass reset-mail dispatch).
const admin_mail_rate_limit = create_rate_limiter({window_ms: 60_000, max: 10});

const require_admin = async_handler(async (req: Request, res: Response, next: NextFunction) => {
    const {uid} = await parse_session(req, res);
    if (!uid) return;
    const user = await get_repos().users.find_by_id(uid);
    if (!user?.is_admin) return res.status(403).json({error: 'Admin required'});
    res.locals.admin_uid = uid;
    next();
});

export function admin_router() {
    const r = Router();
    r.use(require_admin);

    r.get('/users', async_handler(async (_req, res) => {
        const users = await get_repos().users.list_all();
        res.json({users: users.map(({oidc_sub, ...safe}) => ({...safe, has_oidc: Boolean(oidc_sub)}))});
    }));

    r.post('/users/:id/reset-password', admin_mail_rate_limit, async_handler(async (req, res) => {
        const user_id = Number(req.params.id);
        if (!Number.isFinite(user_id)) return res.status(400).json({error: 'Invalid user ID'});
        const repos = get_repos();
        const user = await repos.users.find_by_id(user_id);
        if (!user) return res.status(404).json({error: 'User not found'});
        if (!user.email) return res.status(400).json({error: 'User has no email'});
        const token = crypto.randomBytes(32).toString('hex');
        const exp = new Date(Date.now() + 60 * 60 * 1000);
        await repos.resets.create_token(user.id, token, exp);
        // Admin-initiated reset = account recovery. Invalidate any active sessions immediately;
        // the user must go through the reset link (which sets a new password) to regain access.
        await repos.users.invalidate_sessions(user.id);
        const reset_link = `${config.app_url}/#/account/reset/${token}`;
        await send_template_email(user.email, 'password_reset', {token, reset_link, expiry_minutes: 60});
        res.json({ok: true});
    }));

    r.post('/users/:id/disable-totp', async_handler(async (req, res) => {
        const user_id = Number(req.params.id);
        if (!Number.isFinite(user_id)) return res.status(400).json({error: 'Invalid user ID'});
        const user = await get_repos().users.find_by_id(user_id);
        if (!user) return res.status(404).json({error: 'User not found'});
        if (!user.twofa_enabled) return res.status(400).json({error: 'TOTP not enabled'});
        await get_repos().users.disable_totp(user_id);
        console.warn(`[audit] Admin ${res.locals.admin_uid} disabled TOTP for user ${user_id}`);
        res.json({ok: true});
    }));

    r.delete('/users/:id', async_handler(async (req, res) => {
        const user_id = Number(req.params.id);
        if (!Number.isFinite(user_id)) return res.status(400).json({error: 'Invalid user ID'});
        const admin_uid = res.locals.admin_uid as number;
        if (user_id === admin_uid) return res.status(400).json({error: 'Cannot delete yourself'});
        const repos = get_repos();
        const user = await repos.users.find_by_id(user_id);
        if (!user) return res.status(404).json({error: 'User not found'});
        // Prevent deleting the last admin. Self-delete is already blocked above, but an admin
        // could otherwise delete another admin, then the remaining admin self-deletes, leaving
        // the stack without any admin account (only recovery would be a DB-level edit).
        if (user.is_admin) {
            const admin_count = await repos.users.count_admins();
            if (admin_count <= 1) return res.status(400).json({error: 'Cannot delete the last admin'});
        }
        await repos.users.delete_with_data(user_id);
        res.json({ok: true});
    }));

    return r;
}
