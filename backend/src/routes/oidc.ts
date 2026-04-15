import {type Request, type Response, Router} from 'express';
import * as oidc_client from 'openid-client';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {config} from '../config.js';
import {get_repos} from '../db.js';
import {get_cookies, JWT_EXPIRES_IN, SESSION_COOKIE_OPTIONS} from './auth.js';
import {create_rate_limiter} from '../lib/rate_limit.js';
import {async_handler} from '../lib/async_handler.js';

export const OIDC_NO_PASSWORD = '!oidc-no-password';

let oidc_config: oidc_client.Configuration | null = null;

async function get_oidc_config(): Promise<oidc_client.Configuration> {
    if (oidc_config) return oidc_config;
    oidc_config = await oidc_client.discovery(
        new URL(config.oidc.issuer_url),
        config.oidc.client_id,
        config.oidc.client_secret,
    );
    return oidc_config;
}

interface oidc_state_payload {
    state: string;
    nonce: string;
    code_verifier: string;
}

function build_redirect_uri(): string {
    if (config.oidc.redirect_uri) return config.oidc.redirect_uri;
    return `${config.app_url}${config.base_path.replace(/\/$/, '')}/api/auth/oidc/callback`;
}

const OIDC_RATE_LIMIT_WINDOW_MS = 60_000;
const OIDC_RATE_LIMIT_MAX = 10;

export function oidc_router() {
    const r = Router();
    const oidc_rate_limit = create_rate_limiter({window_ms: OIDC_RATE_LIMIT_WINDOW_MS, max: OIDC_RATE_LIMIT_MAX});

    r.get('/login', oidc_rate_limit, async_handler(async (_req: Request, res: Response) => {
        const cfg = await get_oidc_config();
        const code_verifier = oidc_client.randomPKCECodeVerifier();
        const code_challenge = await oidc_client.calculatePKCECodeChallenge(code_verifier);
        const state = oidc_client.randomState();
        const nonce = oidc_client.randomNonce();

        const state_payload: oidc_state_payload = {state, nonce, code_verifier};
        const state_token = jwt.sign(state_payload, config.accounts.jwt_secret, {algorithm: 'HS256', expiresIn: '10m'});
        res.cookie('oidc_state', state_token, {
            httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600_000,
        });

        const redirect_uri = build_redirect_uri();
        const redirect_to = oidc_client.buildAuthorizationUrl(cfg, {
            redirect_uri,
            scope: config.oidc.scopes.join(' '),
            code_challenge,
            code_challenge_method: 'S256',
            state,
            nonce,
        });

        res.redirect(redirect_to.href);
    }));

    r.get('/callback', oidc_rate_limit, async_handler(async (req: Request, res: Response) => {
        // OIDC callback is a browser-redirect flow — surface errors as redirects to the
        // login page with an `error` query param, not raw JSON. The UI reads the param
        // and renders a friendly message.
        const base = config.base_path.replace(/\/$/, '');
        const login_url = `${config.app_url}${base}/#/login`;
        const redirect_with_error = (code: string) => res.redirect(`${login_url}?error=${encodeURIComponent(code)}`);

        const cookies = get_cookies(req);
        const state_cookie = cookies?.oidc_state;
        if (!state_cookie) return redirect_with_error('oidc_state_missing');

        let state_payload: oidc_state_payload;
        try {
            state_payload = jwt.verify(state_cookie, config.accounts.jwt_secret, {algorithms: ['HS256']}) as oidc_state_payload;
        } catch {
            return redirect_with_error('oidc_state_invalid');
        }

        res.clearCookie('oidc_state', {path: '/'});

        const cfg = await get_oidc_config();
        const redirect_uri = build_redirect_uri();

        const callback_url = new URL(redirect_uri);
        for (const [key, value] of Object.entries(req.query)) {
            if (typeof value === 'string') callback_url.searchParams.set(key, value);
        }

        // Token exchange + claims fetch may throw on expired auth codes, IdP network issues,
        // or token-endpoint errors. Surface as a redirect (not raw JSON) so the user lands
        // on the login page with a friendly message instead of a browser-rendered error body.
        let tokens;
        try {
            tokens = await oidc_client.authorizationCodeGrant(cfg, callback_url, {
                pkceCodeVerifier: state_payload.code_verifier,
                expectedState: state_payload.state,
                expectedNonce: state_payload.nonce,
            });
        } catch (e) {
            console.error('[error] OIDC token exchange failed:', e instanceof Error ? e.message : e);
            return redirect_with_error('oidc_token_exchange_failed');
        }

        const claims = tokens.claims();
        if (!claims) return redirect_with_error('oidc_claims_missing');

        const sub = claims.sub;
        const email = typeof claims.email === 'string' ? claims.email : null;
        const email_verified = claims.email_verified === true;
        const preferred_username = typeof claims.preferred_username === 'string' ? claims.preferred_username : null;
        const name = typeof claims.name === 'string' ? claims.name : null;
        const issuer = config.oidc.issuer_url;

        if (!sub) return redirect_with_error('oidc_sub_missing');

        const repos = get_repos();
        let user = await repos.users.find_by_oidc(issuer, sub);

        // Auto-link to existing local account by email — but only if the IDP has verified the email.
        // An IDP returning unverified emails would otherwise allow trivial account takeover.
        if (!user && email && email_verified && config.oidc.auto_link_by_email) {
            const existing = await repos.users.find_by_identifier(email);
            if (existing) {
                if (existing.oidc_sub && existing.oidc_sub !== sub) {
                    return redirect_with_error('oidc_email_conflict');
                }
                console.warn(`[warn] Auto-linking OIDC sub=${sub} to existing user id=${existing.id} via email match`);
                await repos.users.link_oidc(existing.id, issuer, sub);
                user = await repos.users.find_by_id(existing.id);
            }
        }

        if (!user) {
            let username = await resolve_username(repos, preferred_username, name, email, sub);
            try {
                user = await repos.users.create({
                    username,
                    email,
                    password_hash: OIDC_NO_PASSWORD,
                    oidc_sub: sub,
                    oidc_issuer: issuer,
                });
            } catch (e) {
                const msg = e instanceof Error ? e.message : '';
                const code = e instanceof Error && 'code' in e ? (e as {code: string}).code : '';
                const is_unique = msg.includes('UNIQUE') || msg.includes('unique') || code === '23505';
                if (!is_unique) {
                    console.error('[error] OIDC account creation failed:', e instanceof Error ? e.message : e);
                    return redirect_with_error('oidc_account_creation_failed');
                }
                try {
                    username = `oidc_${crypto.randomBytes(8).toString('hex')}`;
                    user = await repos.users.create({
                        username,
                        email,
                        password_hash: OIDC_NO_PASSWORD,
                        oidc_sub: sub,
                        oidc_issuer: issuer,
                    });
                } catch (retry_err) {
                    console.error('[error] OIDC account creation failed twice:', retry_err instanceof Error ? retry_err.message : retry_err);
                    return redirect_with_error('oidc_account_creation_failed');
                }
            }
            const count = await repos.users.count();
            if (count === 1) {
                await repos.users.set_admin(user.id, true);
            }
        }

        await repos.users.update_last_login(user.id);

        const token = jwt.sign({uid: user.id}, config.accounts.jwt_secret, {algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN});
        res.cookie('session', token, SESSION_COOKIE_OPTIONS);

        res.redirect(`${config.app_url}${base}/#/account`);
    }));

    return r;
}

async function resolve_username(
    repos: ReturnType<typeof get_repos>,
    preferred_username: string | null,
    name: string | null,
    email: string | null,
    sub: string,
): Promise<string> {
    const base_name = preferred_username || name || email?.split('@')[0] || `oidc_${sub.slice(0, 8)}`;
    let candidate = base_name;
    for (let i = 2; i <= 10; i++) {
        const existing = await repos.users.find_by_identifier(candidate);
        if (!existing) return candidate;
        candidate = `${base_name}_${i}`;
    }
    // Fallback to random suffix with enough entropy to avoid collisions
    return `oidc_${crypto.randomBytes(8).toString('hex')}`;
}
