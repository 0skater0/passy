import type {Request, Response, NextFunction} from 'express';

type async_request_handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Wraps an async Express route handler so that rejected promises
 * are forwarded to the global error handler via next(err).
 */
export function async_handler(fn: async_request_handler) {
    return (req: Request, res: Response, next: NextFunction) => {
        fn(req, res, next).catch(next);
    };
}
