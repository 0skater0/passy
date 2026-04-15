import {type Request, type Response, type NextFunction, Router} from 'express';
import {config} from '../config.js';
import {get_repos} from '../db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as OTPAuth from 'otpauth';
import {send_template_email} from '../lib/mailer.js';
import crypto from 'crypto';
import {OIDC_NO_PASSWORD} from './oidc.js';
import {create_rate_limiter} from '../lib/rate_limit.js';
import {async_handler} from '../lib/async_handler.js';

// TOTP replay protection: track recently used codes per user (90s TTL covers window: 1)
const used_totp_codes = new Map<string, number>();
const totp_cleanup_interval = setInterval(() => {
    const cutoff = Date.now() - 90_000;
    for (const [key, ts] of used_totp_codes) {
        if (ts < cutoff) used_totp_codes.delete(key);
    }
}, 30_000);
// Allow clean shutdown (SIGTERM in container) — interval should not keep event loop alive
totp_cleanup_interval.unref();

/** Extract cookies from Express request (works with or without cookie-parser). */
export function get_cookies(req: Request): Record<string, string> | undefined {
    return (req as unknown as Record<string, unknown>).cookies as Record<string, string> | undefined;
}

// --- Types ---
interface session_payload {
    uid: number;
    iat?: number;
    exp?: number;
}

// --- Security constants ---
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 1024;
const MAX_USERNAME_LENGTH = 64;
const MAX_EMAIL_LENGTH = 255;
const AUTH_RATE_LIMIT_WINDOW_MS = 60_000;
const AUTH_RATE_LIMIT_MAX = 10;
export const JWT_EXPIRES_IN = '24h';
export const SESSION_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Shared cookie options for session JWT. maxAge matches JWT_EXPIRES_IN so browser and
 *  server agree on cookie lifetime (avoids stale session cookies outliving the JWT). */
export const SESSION_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: true,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
};

function generate_backup_codes(count = 8): string[] {
    return Array.from({length: count}, () =>
        crypto.randomBytes(4).toString('hex').toUpperCase().replace(/(.{4})(.{4})/, '$1-$2')
    );
}

async function hash_backup_codes(codes: string[]): Promise<string[]> {
    const hashed: string[] = [];
    for (const code of codes) {
        hashed.push(await bcrypt.hash(code.replace(/-/g, '').toLowerCase(), 10));
    }
    return hashed;
}

function validate_password(password: unknown): string | null {
    if (typeof password !== 'string') return 'Password must be a string';
    if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    if (password.length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
    return null;
}

function validate_username(username: unknown): string | null {
    if (!username) return null;
    if (typeof username !== 'string') return 'Username must be a string';
    if (username.length > MAX_USERNAME_LENGTH) return `Username must be at most ${MAX_USERNAME_LENGTH} characters`;
    if (username.length < 2) return 'Username must be at least 2 characters';
    return null;
}

function validate_email(email: unknown): string | null {
    if (!email) return null;
    if (typeof email !== 'string') return 'Email must be a string';
    if (email.length > MAX_EMAIL_LENGTH) return `Email must be at most ${MAX_EMAIL_LENGTH} characters`;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email format';
    return null;
}

function require_accounts(_req: Request, res: Response, next: NextFunction) {
    if (!config.accounts.enable) return res.status(403).json({error: 'Accounts disabled'});
    next();
}

const auth_rate_limit = create_rate_limiter({window_ms: AUTH_RATE_LIMIT_WINDOW_MS, max: AUTH_RATE_LIMIT_MAX});

// Pre-computed dummy hash for constant-time comparison when the user doesn't exist
// or is OIDC-only. Prevents timing-based user enumeration.
const DUMMY_BCRYPT_HASH = bcrypt.hashSync('not-a-real-password', 12);

export function auth_router() {
    const r = Router();
    r.use(require_accounts);

    r.post('/register', auth_rate_limit, async_handler(async (req, res) => {
        if (!config.accounts.enable_signup) return res.status(403).json({error: 'Signup disabled'});
        const {username, email, password} = req.body || {};
        if (username && email) return res.status(400).json({error: 'Provide username or email, not both'});
        if ((!username && !email) || !password) return res.status(400).json({error: 'Missing fields'});
        const pw_err = validate_password(password);
        if (pw_err) return res.status(400).json({error: pw_err});
        const un_err = validate_username(username);
        if (un_err) return res.status(400).json({error: un_err});
        const em_err = validate_email(email);
        if (em_err) return res.status(400).json({error: em_err});
        const repos = get_repos();
        try {
            const hash = await bcrypt.hash(password, 12);
            const user = await repos.users.create({
                username: username || null,
                email: email || null,
                password_hash: hash
            });
            const count = await repos.users.count();
            if (count === 1) {
                await repos.users.set_admin(user.id, true);
            }
            if (user.email) {
                // send_template_email handles its own errors and returns false on failure.
                void send_template_email(user.email, 'welcome', {name: username || email || ''});
            }
            res.json({ok: true});
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            const code = e instanceof Error && 'code' in e ? (e as {code: string}).code : '';
            if (code === '23505' || msg.includes('UNIQUE constraint')) {
                return res.status(409).json({error: 'Registration failed — account may already exist'});
            }
            console.error(`[error] Registration failed: ${msg}`);
            res.status(500).json({error: 'Registration failed'});
        }
    }));

    r.post('/login', auth_rate_limit, async_handler(async (req, res) => {
        const {identifier, password, totp, backup_code} = req.body || {};
        if (!identifier || !password) return res.status(400).json({error: 'Missing credentials'});
        if (typeof identifier !== 'string' || identifier.length > MAX_EMAIL_LENGTH) return res.status(400).json({error: 'Invalid identifier'});
        if (typeof password !== 'string' || password.length > MAX_PASSWORD_LENGTH) return res.status(400).json({error: 'Invalid credentials'});
        if (totp && (typeof totp !== 'string' || !/^\d{6}$/.test(totp))) return res.status(400).json({error: 'Invalid TOTP format'});
        if (backup_code !== undefined && typeof backup_code !== 'string') return res.status(400).json({error: 'Invalid backup code'});
        const repos = get_repos();
        const user = await repos.users.find_by_identifier(identifier);
        // Always run bcrypt.compare to equalize timing between non-existent users,
        // OIDC-only users (no local password), and real users with wrong password.
        const is_password_login = user != null && user.password_hash !== OIDC_NO_PASSWORD;
        const hash_to_test = is_password_login ? user.password_hash : DUMMY_BCRYPT_HASH;
        const bcrypt_ok = await bcrypt.compare(password, hash_to_test);
        if (!user || !is_password_login || !bcrypt_ok) return res.status(401).json({error: 'Invalid login'});
        if (user.twofa_enabled && user.totp_secret) {
            if (!totp && !backup_code) return res.status(401).json({error: 'Invalid login', requires_totp: true});
            if (backup_code) {
                const stored: string[] = user.backup_codes || [];
                const normalized = backup_code.replace(/-/g, '').toLowerCase();
                let matched_idx = -1;
                for (let i = 0; i < stored.length; i++) {
                    if (await bcrypt.compare(normalized, stored[i])) {
                        matched_idx = i;
                        break;
                    }
                }
                if (matched_idx === -1) return res.status(401).json({error: 'Invalid backup code'});
                stored.splice(matched_idx, 1);
                await repos.users.update_backup_codes(user.id, JSON.stringify(stored));
            } else {
                const valid = OTPAuth.TOTP.validate({
                    secret: OTPAuth.Secret.fromBase32(user.totp_secret),
                    token: totp,
                    window: 1
                }) !== null;
                if (!valid) return res.status(401).json({error: 'Invalid TOTP'});
                const replay_key = `${user.id}:${totp}`;
                if (used_totp_codes.has(replay_key)) return res.status(401).json({error: 'Invalid TOTP'});
                used_totp_codes.set(replay_key, Date.now());
            }
        }
        await repos.users.update_last_login(user.id);
        const token = jwt.sign({uid: user.id}, config.accounts.jwt_secret, {algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN});
        res.cookie('session', token, SESSION_COOKIE_OPTIONS);
        res.json({ok: true, e2e_salt: user.e2e_salt ?? null});
    }));

    r.post('/logout', (_req, res) => {
        res.clearCookie('session', {path: '/'});
        res.json({ok: true});
    });

    r.get('/me', async_handler(async (req, res) => {
        const user = await require_active_user(req, res);
        if (!user) return;
        res.json({user: {
            id: user.id,
            username: user.username,
            email: user.email,
            created_at: user.created_at,
            twofa_enabled: user.twofa_enabled,
            is_admin: user.is_admin,
            e2e_salt: user.e2e_salt ?? null,
            auth_method: user.oidc_sub ? 'oidc' : 'local',
        }});
    }));

    r.post('/totp/setup', auth_rate_limit, async_handler(async (req, res) => {
        const user = await require_active_user(req, res);
        if (!user) return;
        if (user.password_hash === OIDC_NO_PASSWORD) return res.status(403).json({error: 'SSO accounts cannot enable TOTP'});
        if (user.twofa_enabled) return res.status(400).json({error: 'TOTP already enabled'});
        const totp_obj = new OTPAuth.TOTP({issuer: 'Passy', label: user.username || user.email || 'user', secret: new OTPAuth.Secret({size: 20})});
        const base32 = totp_obj.secret.base32;
        await get_repos().users.update_totp_pending(user.id, base32);
        res.json({otpauth_url: totp_obj.toString(), secret: base32});
    }));

    r.post('/totp/confirm', auth_rate_limit, async_handler(async (req, res) => {
        const {totp} = req.body || {};
        if (!totp || typeof totp !== 'string' || !/^\d{6}$/.test(totp)) return res.status(400).json({error: 'Invalid TOTP code'});
        const user = await require_active_user(req, res);
        if (!user) return;
        if (!user.totp_pending_secret) return res.status(400).json({error: 'No TOTP setup in progress'});
        const valid = OTPAuth.TOTP.validate({secret: OTPAuth.Secret.fromBase32(user.totp_pending_secret), token: totp, window: 1}) !== null;
        if (!valid) return res.status(400).json({error: 'Invalid TOTP code'});
        const codes = generate_backup_codes();
        const hashed = await hash_backup_codes(codes);
        await get_repos().users.enable_totp(user.id, user.totp_pending_secret, JSON.stringify(hashed));
        res.json({ok: true, backup_codes: codes});
    }));

    r.post('/password/reset/request', auth_rate_limit, async_handler(async (req, res) => {
        const {identifier} = req.body || {};
        if (!identifier) return res.status(400).json({error: 'Missing identifier'});
        if (typeof identifier !== 'string' || identifier.length > MAX_EMAIL_LENGTH) return res.status(400).json({error: 'Invalid identifier'});
        const start = Date.now();
        const repos = get_repos();
        const user = await repos.users.find_by_identifier(identifier);
        if (user?.email && user.email.toLowerCase() === identifier.toLowerCase()) {
            const token = crypto.randomBytes(32).toString('hex');
            const exp = new Date(Date.now() + 60 * 60 * 1000);
            await repos.resets.create_token(user.id, token, exp);
            const reset_link = `${config.app_url}/#/account/reset/${token}`;
            await send_template_email(user.email, 'password_reset', {token, reset_link, expiry_minutes: 60});
        }
        // Constant-time response: ensure minimum 200ms regardless of code path
        const elapsed = Date.now() - start;
        if (elapsed < 200) await new Promise(r => setTimeout(r, 200 - elapsed));
        res.json({ok: true});
    }));

    r.post('/password/reset/confirm', auth_rate_limit, async_handler(async (req, res) => {
        const {token, new_password} = req.body || {};
        if (!token || !new_password) return res.status(400).json({error: 'Missing fields'});
        if (typeof token !== 'string') return res.status(400).json({error: 'Invalid token'});
        const pw_err = validate_password(new_password);
        if (pw_err) return res.status(400).json({error: pw_err});
        const repos = get_repos();
        const result = await repos.resets.find_valid(token);
        if (!result) return res.status(400).json({error: 'Invalid or expired reset link'});
        const user = await repos.users.find_by_id(result.user_id);
        if (user?.password_hash === OIDC_NO_PASSWORD) {
            await repos.resets.delete_for_user(result.user_id);
            return res.status(403).json({error: 'SSO accounts cannot reset password'});
        }
        const hash = await bcrypt.hash(new_password, 12);
        await repos.users.update_password(result.user_id, hash);
        await repos.resets.delete_for_user(result.user_id);
        res.json({ok: true});
    }));

    r.put('/profile', async_handler(async (req, res) => {
        const current = await require_active_user(req, res);
        if (!current) return;
        const {username, email} = req.body || {};
        if (!username && !email) return res.status(400).json({error: 'At least one of username or email is required'});
        const un_err = validate_username(username);
        if (un_err) return res.status(400).json({error: un_err});
        const em_err = validate_email(email);
        if (em_err) return res.status(400).json({error: em_err});
        try {
            const updated = await get_repos().users.update_profile(current.id, username || null, email || null);
            if (!updated) {
                // update_profile + SELECT is atomic — this should never happen unless the row
                // was deleted mid-request. Treat as session-dead.
                res.clearCookie('session', {path: '/'});
                return res.status(401).json({error: 'Unauthorized'});
            }
            res.json({ok: true, user: {
                id: updated.id,
                username: updated.username,
                email: updated.email,
                created_at: updated.created_at,
                twofa_enabled: updated.twofa_enabled,
                is_admin: updated.is_admin,
                e2e_salt: updated.e2e_salt ?? null,
                auth_method: updated.oidc_sub ? 'oidc' : 'local',
            }});
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            const code = e instanceof Error && 'code' in e ? (e as {code: string}).code : '';
            if (code === '23505' || msg.includes('UNIQUE constraint')) {
                return res.status(409).json({error: 'Update failed — username or email already in use'});
            }
            console.error(`[error] Profile update: ${msg}`);
            res.status(500).json({error: 'Update failed'});
        }
    }));

    r.put('/password', auth_rate_limit, async_handler(async (req, res) => {
        const user = await require_active_user(req, res);
        if (!user) return;
        if (user.password_hash === OIDC_NO_PASSWORD) {
            return res.status(403).json({error: 'SSO accounts cannot change password'});
        }
        const {current_password, new_password} = req.body || {};
        if (!current_password || !new_password) return res.status(400).json({error: 'Missing fields'});
        if (typeof current_password !== 'string') return res.status(400).json({error: 'Invalid current password'});
        const pw_err = validate_password(new_password);
        if (pw_err) return res.status(400).json({error: pw_err});
        const ok = await bcrypt.compare(current_password, user.password_hash);
        if (!ok) return res.status(401).json({error: 'Invalid password'});
        const hash = await bcrypt.hash(new_password, 12);
        await get_repos().users.update_password(user.id, hash);
        res.clearCookie('session', {path: '/'});
        res.json({ok: true});
    }));

    r.post('/totp/disable', auth_rate_limit, async_handler(async (req, res) => {
        const {totp} = req.body || {};
        if (!totp || typeof totp !== 'string' || !/^\d{6}$/.test(totp)) return res.status(400).json({error: 'Invalid TOTP code'});
        const user = await require_active_user(req, res);
        if (!user) return;
        if (!user.twofa_enabled || !user.totp_secret) return res.status(400).json({error: 'TOTP not enabled'});
        const valid = OTPAuth.TOTP.validate({secret: OTPAuth.Secret.fromBase32(user.totp_secret), token: totp, window: 1}) !== null;
        if (!valid) return res.status(400).json({error: 'Invalid TOTP code'});
        await get_repos().users.disable_totp(user.id);
        res.json({ok: true});
    }));

    r.post('/totp/backup-codes', auth_rate_limit, async_handler(async (req, res) => {
        const user = await require_active_user(req, res);
        if (!user) return;
        if (!user.twofa_enabled) return res.status(400).json({error: 'TOTP not enabled'});
        // Re-authenticate: require password (local) or TOTP code before regenerating
        const {password, totp} = req.body || {};
        if (user.password_hash === OIDC_NO_PASSWORD) {
            if (!totp || typeof totp !== 'string') return res.status(400).json({error: 'TOTP code required'});
            const valid = OTPAuth.TOTP.validate({
                secret: OTPAuth.Secret.fromBase32(user.totp_secret!),
                token: totp, window: 1
            }) !== null;
            if (!valid) return res.status(401).json({error: 'Invalid TOTP code'});
        } else {
            if (!password) return res.status(400).json({error: 'Password required'});
            if (typeof password !== 'string') return res.status(400).json({error: 'Invalid password'});
            const ok = await bcrypt.compare(password, user.password_hash);
            if (!ok) return res.status(401).json({error: 'Invalid password'});
        }
        const codes = generate_backup_codes();
        const hashed = await hash_backup_codes(codes);
        await get_repos().users.update_backup_codes(user.id, JSON.stringify(hashed));
        res.json({ok: true, backup_codes: codes});
    }));

    r.put('/e2e-salt', async_handler(async (req, res) => {
        const user = await require_active_user(req, res);
        if (!user) return;
        const {salt} = req.body || {};
        if (!salt || typeof salt !== 'string' || salt.length < 16 || salt.length > 64
            || !/^[A-Za-z0-9+/]+=*$/.test(salt)) {
            return res.status(400).json({error: 'Invalid salt'});
        }
        // Salt is write-once. Overwriting would make all existing encrypted history undecryptable.
        // If the user needs to reset, they must delete their account first.
        if (user.e2e_salt) return res.status(409).json({error: 'E2E salt already set'});
        await get_repos().users.set_e2e_salt(user.id, salt);
        res.json({ok: true});
    }));

    r.delete('/account', async_handler(async (req, res) => {
        const user = await require_active_user(req, res);
        if (!user) return;
        if (user.password_hash === OIDC_NO_PASSWORD) {
            // OIDC-only users confirm with {confirm: true} instead of password
            const {confirm} = req.body || {};
            if (confirm !== true) return res.status(400).json({error: 'Missing confirmation'});
        } else {
            const {password} = req.body || {};
            if (!password) return res.status(400).json({error: 'Missing password'});
            if (typeof password !== 'string') return res.status(400).json({error: 'Invalid password'});
            const ok = await bcrypt.compare(password, user.password_hash);
            if (!ok) return res.status(401).json({error: 'Invalid password'});
        }
        await get_repos().users.delete_with_data(user.id);
        res.clearCookie('session', {path: '/'});
        res.json({ok: true});
    }));

    return r;
}

/** Verify session token and return uid, or null if invalid/expired. */
async function verify_session_token(req: Request): Promise<number | null> {
    try {
        const cookies = get_cookies(req);
        const raw = cookies?.session || req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
        const decoded = jwt.verify(raw, config.accounts.jwt_secret, {algorithms: ['HS256']});
        if (typeof decoded === 'string' || !decoded || typeof (decoded as session_payload).uid !== 'number') {
            return null;
        }
        const payload = decoded as session_payload;
        if (payload.iat) {
            const changed = await get_repos().users.get_password_changed_at(payload.uid);
            if (changed) {
                const changed_ts = Math.floor(changed.getTime() / 1000);
                if (changed_ts > payload.iat) return null;
            }
        }
        return payload.uid;
    } catch {
        return null;
    }
}

export async function parse_session(req: Request, res: Response): Promise<{uid?: number}> {
    const uid = await verify_session_token(req);
    if (uid == null) {
        if (!res.headersSent) {
            res.clearCookie('session', {path: '/'});
            res.status(401).json({error: 'Unauthorized'});
        }
        return {};
    }
    return {uid};
}

/**
 * Extracts the authenticated user ID from the session cookie/header,
 * including password-change invalidation. Returns null if invalid.
 * Does NOT send a response — caller handles unauthorized state.
 */
export async function extract_session_uid(req: Request): Promise<number | null> {
    return verify_session_token(req);
}

/**
 * Resolve the authenticated user for this request.
 * Returns the user row on success. On any failure (no session, invalid JWT, deleted user)
 * clears the session cookie and sends 401 — caller just needs to `return` on null.
 *
 * Consolidates the parse_session + find_by_id + stale-session-handling pattern that
 * was duplicated across auth / settings routes.
 */
export async function require_active_user(req: Request, res: Response) {
    const {uid} = await parse_session(req, res);
    if (!uid) return null;
    const user = await get_repos().users.find_by_id(uid);
    if (!user) {
        res.clearCookie('session', {path: '/'});
        res.status(401).json({error: 'Unauthorized'});
        return null;
    }
    return user;
}
