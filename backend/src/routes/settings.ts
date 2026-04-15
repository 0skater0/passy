import {Router} from 'express';
import {get_repos} from '../db.js';
import {require_active_user} from './auth.js';
import {async_handler} from '../lib/async_handler.js';

export function settings_router() {
    const r = Router();

    r.get('/', async_handler(async (req, res) => {
        const user = await require_active_user(req, res);
        if (!user) return;
        const settings = await get_repos().users.get_settings(user.id);
        res.json({settings});
    }));

    r.put('/', async_handler(async (req, res) => {
        const user = await require_active_user(req, res);
        if (!user) return;
        const settings = req.body?.settings;
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
            return res.status(400).json({error: 'Invalid settings object'});
        }
        const json = JSON.stringify(settings);
        if (json.length > 65536) {
            return res.status(400).json({error: 'Settings too large (max 64KB)'});
        }
        const keys = Object.keys(settings);
        if (keys.length > 100) {
            return res.status(400).json({error: 'Too many settings keys (max 100)'});
        }
        await get_repos().users.update_settings(user.id, settings);
        res.json({ok: true});
    }));

    return r;
}
