import express from 'express';
import path from 'node:path';
import helmet from 'helmet';
import {config} from './config.js';
import {init_db} from './db.js';
import {health_router} from './routes/health.js';
import {history_router} from './routes/history.js';
import {pwned_router} from './routes/pwned.js';
import {auth_router} from './routes/auth.js';
import {admin_router} from './routes/admin.js';
import {settings_router} from './routes/settings.js';
import {oidc_router} from './routes/oidc.js';
import type {Request, Response, NextFunction} from 'express';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'", "https://api.pwnedpasswords.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
        }
    }
}));

// CORS — inline replacement for the `cors` package (single-origin only)
if (config.cors_origin) {
    app.use((req: Request, res: Response, next: NextFunction) => {
        res.header('Access-Control-Allow-Origin', config.cors_origin);
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
        next();
    });
}

app.use(express.json({limit: '256kb'}));

// Cookie parsing — inline replacement for the `cookie-parser` package
app.use((req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.cookie;
    const cookies: Record<string, string> = {};
    if (header) {
        for (const pair of header.split(';')) {
            const idx = pair.indexOf('=');
            if (idx < 1) continue;
            const key = pair.slice(0, idx).trim();
            const val = pair.slice(idx + 1).trim();
            try { cookies[key] = decodeURIComponent(val); } catch { cookies[key] = val; }
        }
    }
    (req as unknown as Record<string, unknown>).cookies = cookies;
    next();
});

// HTTP request logging — inline replacement for the `morgan` package
if (config.log_level !== 'error') {
    app.use((req: Request, res: Response, next: NextFunction) => {
        const start = Date.now();
        res.on('finish', () => {
            console.log(`${req.ip} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
        });
        next();
    });
}

const base = config.base_path;
const public_dir = path.join(process.cwd(), 'backend', 'public');

async function start() {
    // Mount API routers (must come BEFORE static/SPA fallback)
    app.use(path.posix.join(base, 'api', 'health'), health_router());
    if (config.enable_pwned) {
        app.use(path.posix.join(base, 'api', 'pwned'), pwned_router());
    }

    if (config.enable_backend) {
        await init_db();
        app.use(path.posix.join(base, 'api', 'history'), history_router());
        if (config.accounts.enable) {
            app.use(path.posix.join(base, 'api', 'auth'), auth_router());
            app.use(path.posix.join(base, 'api', 'admin'), admin_router());
            app.use(path.posix.join(base, 'api', 'settings'), settings_router());
            if (config.oidc.enabled) {
                app.use(path.posix.join(base, 'api', 'auth', 'oidc'), oidc_router());
            }
        }
    }

    // Static SPA (must come AFTER API routes)
    app.use(base, express.static(public_dir, {index: 'index.html', extensions: ['html']}));
    app.get(/.*/, (_req, res, next) => {
        if (!_req.path.startsWith(base)) return next();
        res.sendFile(path.join(public_dir, 'index.html'));
    });

    // Global error handler — catches unhandled errors from async route handlers
    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[error] Unhandled: ${message}`);
        if (!res.headersSent) {
            res.status(500).json({error: 'Internal server error'});
        }
    });

    app.listen(config.port, () => {
        console.log(`Passy listening on :${config.port} at base ${base} (db: ${config.db_type})`);
    });
}

start().catch(e => {
    console.error('Fatal startup error:', e);
    process.exit(1);
});
