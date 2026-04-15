// API client with automatic localStorage fallback.
// When the backend reports storage=false (no DB) or the user is unauthenticated (401/403),
// history operations transparently fall back to local storage via the history_store abstraction.

import type {health_response, history_item, history_save_item, history_store, auth_user, admin_user_summary} from './types';
import {e2e_encrypt, e2e_decrypt, has_e2e_key, is_encrypted_value} from './e2e_crypto';

export interface api_error_data {
    error?: string;
    requires_totp?: boolean;
}

interface api_error_info {
    status: number;
    data: api_error_data | null;
    message: string;
}

/** Extract structured error info from a caught API error. */
export function extract_api_error(e: unknown): api_error_info {
    if (e instanceof Error) {
        const err = e as Error & {status?: number; data?: api_error_data | null};
        return {status: err.status ?? 0, data: err.data ?? null, message: err.message};
    }
    return {status: 0, data: null, message: String(e)};
}

const base_path = (import.meta.env.VITE_BASE_PATH as string) || '/';

/** Send an authenticated request to the backend API. Throws on non-2xx responses. */
async function request(path: string, init?: RequestInit) {
    const url = base_path.replace(/\/$/, '/') + path.replace(/^\//, '');
    const res = await fetch(url, {credentials: 'include', ...init});
    if (!res.ok) {
        let data: unknown = null;
        try {
            data = await res.json();
        } catch {
        }
        const err = new Error(`Request failed: ${res.status}`) as Error & {status: number; data: unknown};
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return res.json();
}

// --- History store implementations ---

async function get_local_store(): Promise<typeof import('./storage')> {
    return import('./storage');
}

const local_store: history_store = {
    async list(params) {
        const {load_local_history} = await get_local_store();
        return load_local_history(params);
    },
    async save(item) {
        const {append_local_history} = await get_local_store();
        await append_local_history({type: item.type, masked: item.masked, value: item.value});
        return {ok: true};
    },
    async remove(id) {
        const {delete_local_history} = await get_local_store();
        return delete_local_history(id);
    },
    async clear() {
        const {clear_local_history} = await get_local_store();
        return clear_local_history();
    }
};

function remote_store(): history_store {
    return {
        async list(params) {
            const q = new URLSearchParams({
                limit: String(params.limit),
                offset: String(params.offset),
                type: params.type
            });
            return request(`api/history?${q.toString()}`);
        },
        async save(item) {
            return request('api/history', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(item)
            });
        },
        async remove(id) {
            return request(`api/history/${id}`, {method: 'DELETE'});
        },
        async clear() {
            return request('api/history/all', {method: 'DELETE'});
        }
    };
}

/** Wraps a remote store with automatic fallback to local on 401/403. */
function with_local_fallback(store: history_store): history_store {
    function is_auth_error(e: unknown): boolean {
        return typeof e === 'object' && e !== null && 'status' in e &&
            ((e as {status: number}).status === 401 || (e as {status: number}).status === 403);
    }

    return {
        async list(params) {
            try {
                return await store.list(params);
            } catch (e) {
                if (is_auth_error(e)) return local_store.list(params);
                throw e;
            }
        },
        async save(item) {
            try {
                return await store.save(item);
            } catch (e) {
                if (is_auth_error(e)) return local_store.save(item);
                throw e;
            }
        },
        async remove(id) {
            try {
                return await store.remove(id);
            } catch (e) {
                if (is_auth_error(e)) return local_store.remove(id);
                throw e;
            }
        },
        async clear() {
            try {
                return await store.clear();
            } catch (e) {
                if (is_auth_error(e)) return local_store.clear();
                throw e;
            }
        }
    };
}

/** Wraps a store with E2E encryption/decryption when an E2E key is available. */
function e2e_store(inner: history_store): history_store {
    return {
        async list(params) {
            const result = await inner.list(params);
            if (has_e2e_key()) {
                for (const item of result.items) {
                    if (item.value && is_encrypted_value(item.value)) {
                        item.value = await e2e_decrypt(item.value);
                    }
                }
            }
            return result;
        },
        async save(item) {
            if (has_e2e_key() && item.value) {
                item = {...item, value: await e2e_encrypt(item.value)};
            }
            return inner.save(item);
        },
        async remove(id) {
            return inner.remove(id);
        },
        async clear() {
            return inner.clear();
        }
    };
}

// --- Store resolution ---

let storage_enabled = false;

function resolve_store(): history_store {
    if (!storage_enabled) return local_store;
    return e2e_store(with_local_fallback(remote_store()));
}

// --- Public API ---

async function health(): Promise<health_response> {
    try {
        const data = await request('api/health');
        return {
            status: data.status,
            storage: Boolean(data.storage),
            version: data.version ?? '',
            accounts_enabled: Boolean(data.accounts_enabled),
            signup_enabled: Boolean(data.signup_enabled),
            oidc_enabled: Boolean(data.oidc_enabled),
        };
    } catch {
        return {status: 'ok', storage: false, version: '', accounts_enabled: false, signup_enabled: false, oidc_enabled: false};
    }
}

export const api = {
    async health(): Promise<health_response> {
        const h = await health();
        storage_enabled = h.storage;
        return h;
    },

    // History — delegated to resolved store
    async history(params: {limit?: number; offset?: number; type?: string}): Promise<{items: history_item[]}> {
        return resolve_store().list({
            limit: params.limit ?? 50,
            offset: params.offset ?? 0,
            type: params.type ?? 'all'
        });
    },
    async save_history(item: history_save_item): Promise<{ok: boolean; item?: history_item}> {
        return resolve_store().save(item);
    },
    async delete_history(id: number): Promise<{ok: boolean}> {
        return resolve_store().remove(id);
    },
    async delete_all_history(): Promise<{ok: boolean}> {
        return resolve_store().clear();
    },

    // Pwned check — hash client-side, send only SHA-1 prefix+suffix (k-anonymity)
    async pwned_check(value: string): Promise<{pwned: boolean; count: number; error?: boolean}> {
        try {
            const hash_buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value));
            const hex = Array.from(new Uint8Array(hash_buf)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
            const prefix = hex.slice(0, 5);
            const suffix = hex.slice(5);
            return await request('api/pwned', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({prefix, suffix})
            });
        } catch (e) {
            console.warn('Pwned check failed:', e instanceof Error ? e.message : e);
            return {pwned: false, count: 0, error: true};
        }
    },

    // Auth
    async auth_me(): Promise<{user: auth_user}> {
        return request('api/auth/me');
    },
    async auth_register(payload: {username?: string; email?: string; password: string}): Promise<{ok: boolean}> {
        return request('api/auth/register', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
        });
    },
    async auth_login(payload: {identifier: string; password: string; totp?: string; backup_code?: string}): Promise<{ok: boolean; e2e_salt?: string | null}> {
        return request('api/auth/login', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
        });
    },
    async auth_logout(): Promise<{ok: boolean}> {
        return request('api/auth/logout', {method: 'POST'});
    },
    async auth_totp_setup(): Promise<{otpauth_url: string; secret: string}> {
        return request('api/auth/totp/setup', {method: 'POST'});
    },
    async auth_totp_confirm(totp: string): Promise<{ok: boolean; backup_codes: string[]}> {
        return request('api/auth/totp/confirm', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({totp})
        });
    },
    async auth_reset_request(identifier: string): Promise<{ok: boolean}> {
        return request('api/auth/password/reset/request', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({identifier})
        });
    },
    async auth_reset_confirm(token: string, new_password: string): Promise<{ok: boolean}> {
        return request('api/auth/password/reset/confirm', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({token, new_password})
        });
    },
    async auth_update_profile(payload: {username?: string; email?: string}): Promise<{ok: boolean; user?: auth_user}> {
        return request('api/auth/profile', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
    },
    async auth_change_password(payload: {current_password: string; new_password: string}): Promise<{ok: boolean}> {
        return request('api/auth/password', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
    },
    async auth_totp_disable(totp: string): Promise<{ok: boolean}> {
        return request('api/auth/totp/disable', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({totp})
        });
    },
    async auth_totp_regenerate_backup(auth: {password?: string; totp?: string}): Promise<{ok: boolean; backup_codes: string[]}> {
        return request('api/auth/totp/backup-codes', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(auth)
        });
    },
    async auth_delete_account(auth: {password: string} | {confirm: true}): Promise<{ok: boolean}> {
        return request('api/auth/account', {
            method: 'DELETE',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(auth)
        });
    },

    // Admin
    async admin_list_users(): Promise<{users: admin_user_summary[]}> {
        return request('api/admin/users');
    },
    async admin_reset_password(user_id: number): Promise<{ok: boolean}> {
        return request(`api/admin/users/${user_id}/reset-password`, {method: 'POST'});
    },
    async admin_delete_user(user_id: number): Promise<{ok: boolean}> {
        return request(`api/admin/users/${user_id}`, {method: 'DELETE'});
    },
    async admin_disable_totp(user_id: number): Promise<{ok: boolean}> {
        return request(`api/admin/users/${user_id}/disable-totp`, {method: 'POST'});
    },

    // Settings
    async settings_get(): Promise<{settings: Record<string, unknown>}> {
        return request('api/settings');
    },
    async settings_put(settings: Record<string, unknown>): Promise<{ok: boolean}> {
        return request('api/settings', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({settings})
        });
    },

    // History import (for login sync)
    async history_import(items: {
        type: string;
        masked: string;
        value?: string;
        length?: number;
        charset?: string;
        entropy_bits?: number;
        zxcvbn_score?: number;
        created_at?: string;
    }[]): Promise<{ok: boolean; imported: number}> {
        return request('api/history/import', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({items})
        });
    },

    // E2E encryption
    async set_e2e_salt(salt: string): Promise<{ok: boolean}> {
        return request('api/auth/e2e-salt', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({salt})
        });
    },

    // History batch-update (for re-encryption)
    async history_batch_update(updates: {id: number; value: string}[]): Promise<{ok: boolean; updated: number}> {
        return request('api/history/batch-update', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({updates})
        });
    }
};
