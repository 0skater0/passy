import {type Request, type Response, Router} from 'express';
import {config} from '../config.js';

export function health_router() {
    const r = Router();
    r.get('/', (_req: Request, res: Response) => {
        res.json({
            status: 'ok',
            storage: config.enable_backend,
            version: config.app_version,
            accounts_enabled: config.accounts.enable,
            signup_enabled: config.accounts.enable_signup,
            oidc_enabled: config.oidc.enabled,
        });
    });
    return r;
}
