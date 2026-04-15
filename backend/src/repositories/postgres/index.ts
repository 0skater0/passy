import type pg from 'pg';
import type {repositories} from '../types.js';
import {create_history_repository} from './history.js';
import {create_user_repository} from './user.js';
import {create_reset_repository} from './reset.js';

export function create_postgres_repositories(pool: pg.Pool): repositories {
    return {
        history: create_history_repository(pool),
        users: create_user_repository(pool),
        resets: create_reset_repository(pool)
    };
}
