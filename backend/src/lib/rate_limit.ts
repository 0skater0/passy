import type {Request, Response, NextFunction} from 'express';

interface rate_limit_options {
    window_ms: number;
    max: number;
}

/**
 * Creates an in-memory rate limiter middleware keyed by client IP.
 * Entries are cleaned up every 5 minutes.
 */
export function create_rate_limiter(opts: rate_limit_options) {
    const hits = new Map<string, {count: number; reset_at: number}>();

    const cleanup = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of hits) {
            if (now > entry.reset_at) hits.delete(key);
        }
    }, 5 * 60 * 1000);
    cleanup.unref();

    return function rate_limit(req: Request, res: Response, next: NextFunction) {
        const key = req.ip || '0.0.0.0';
        const now = Date.now();
        let entry = hits.get(key);
        if (!entry || now > entry.reset_at) {
            entry = {count: 0, reset_at: now + opts.window_ms};
            hits.set(key, entry);
        }
        entry.count += 1;
        if (entry.count > opts.max) {
            return res.status(429).json({error: 'Too many requests. Please try again later.'});
        }
        next();
    };
}
