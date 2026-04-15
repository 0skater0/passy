// Shared authentication state as a Vue composable (singleton pattern).
// State is module-scoped so all components share the same user/flags refs.
import {computed, ref} from 'vue';
import {api} from '@/lib/api';
import type {auth_user} from '@/lib/types';
import {generate_e2e_salt, init_e2e_key, lock_e2e, restore_e2e_key, e2e_encrypt, has_e2e_key, snapshot_e2e_key, restore_e2e_snapshot} from '@/lib/e2e_crypto';
import {get_encryption_key, decrypt_value as local_decrypt, is_encrypted_value as is_local_encrypted} from '@/lib/crypto';

const user = ref<auth_user | null>(null);
const flags = ref<{accounts_enabled: boolean; signup_enabled: boolean; storage_enabled: boolean; oidc_enabled: boolean}>({accounts_enabled: false, signup_enabled: false, storage_enabled: false, oidc_enabled: false});
const loading = ref(false);
const synced = ref(false);

/**
 * In-memory holding slot for credentials while the user moves from `/account` (password step)
 * to `/login/verify` (TOTP step). Kept in module scope so it survives the router.push but
 * never persists to storage. Cleared after successful verification or on leaving the flow.
 * Separate route for TOTP is required by password-manager-compat.md for 1Password auto-fill.
 */
const pending_login = ref<{identifier: string; password: string} | null>(null);

export function set_pending_login(payload: {identifier: string; password: string} | null): void {
    pending_login.value = payload;
}

export function get_pending_login(): {identifier: string; password: string} | null {
    return pending_login.value;
}

async function refresh(): Promise<{version?: string} | undefined> {
    loading.value = true;
    try {
        const h = await api.health();
        flags.value = {accounts_enabled: h.accounts_enabled, signup_enabled: h.signup_enabled, storage_enabled: h.storage, oidc_enabled: Boolean(h.oidc_enabled)};
        if (flags.value.accounts_enabled) {
            try {
                const me = await api.auth_me();
                user.value = me.user || null;
                // Restore E2E key from sessionStorage on page reload
                if (user.value?.e2e_salt) {
                    await restore_e2e_key();
                }
            } catch {
                user.value = null;
            }
        }
        return {version: h.version};
    } finally {
        loading.value = false;
    }
}

/**
 * Login + E2E key derivation.
 * Returns the login API response (for TOTP-required detection).
 */
async function login(payload: {identifier: string; password: string; totp?: string; backup_code?: string}): Promise<{ok: boolean; e2e_salt?: string | null}> {
    const result = await api.auth_login(payload);
    await refresh();

    // Derive E2E key from password
    let salt = result.e2e_salt || user.value?.e2e_salt;
    if (!salt) {
        // First login with E2E — generate and store salt
        salt = generate_e2e_salt();
        await api.set_e2e_salt(salt);
        if (user.value) user.value.e2e_salt = salt;
    }
    await init_e2e_key(payload.password, salt);

    return result;
}

async function logout() {
    try {
        await api.auth_logout();
    } catch {
        // Logout API failure is non-critical — clear local state regardless
    } finally {
        user.value = null;
        synced.value = false;
        await lock_e2e();
    }
}

/**
 * Run a background settings + history migration after login.
 * Pulls remote settings, merges with local state, and pushes local history.
 * Runs only once per session (guarded by `synced` flag).
 */
async function sync_after_login(): Promise<void> {
    if (synced.value || !user.value) return;
    synced.value = true;
    try {
        const {collect_all_settings, apply_remote_settings, collect_local_history, clear_local_history} =
            await import('@/lib/storage');

        // 1. Pull remote settings
        const {settings: remote} = await api.settings_get();
        const has_remote = remote && Object.keys(remote).length > 0;

        if (has_remote) {
            // Remote settings exist → apply them locally (server wins)
            apply_remote_settings(remote);
        } else {
            // No remote settings → push local settings to server (first-time sync)
            const local = collect_all_settings();
            if (Object.keys(local).length > 0) {
                await api.settings_put(local);
            }
        }

        // 2. Migrate local history to server (decrypt local encryption, then E2E-encrypt)
        const local_items = collect_local_history();
        if (local_items.length > 0) {
            const local_key = await get_encryption_key();
            for (const item of local_items) {
                if (item.value && typeof item.value === 'string') {
                    // Decrypt local encryption (PIN/build-key) first
                    if (local_key && is_local_encrypted(item.value)) {
                        try { item.value = await local_decrypt(item.value, local_key); } catch { /* leave as-is */ }
                    }
                    // Then E2E-encrypt for server storage
                    if (has_e2e_key()) {
                        item.value = await e2e_encrypt(item.value);
                    }
                }
            }
            await api.history_import(local_items);
            clear_local_history();
        }
    } catch {
        // Sync failure is non-critical — user can still use the app
    }
}

/**
 * Re-encrypt all server-side history with a new password and commit the password change atomically.
 *
 * Flow:
 *   1. Fetch + snapshot current history (still decryptable with old key).
 *   2. Derive new key, re-encrypt all items, push via batch_update.
 *   3. Call `commit()` (the actual password-change API call).
 *   4. If `commit()` fails, roll back: restore old key in memory AND re-encrypt server
 *      history back with old key, so the server-side state is consistent with the
 *      unchanged server password. Without this rollback, a failed `commit()` (e.g. wrong
 *      current_password) would leave the server with new-key-encrypted history but
 *      unchanged password — the next login with the old password derives the old key
 *      and all history becomes undecryptable (silent data loss).
 */
async function re_encrypt_for_password_change(new_password: string, commit: () => Promise<void>): Promise<void> {
    if (!has_e2e_key() || !user.value?.e2e_salt) {
        // No E2E data — nothing to re-encrypt, just run the commit
        return commit();
    }

    // Fetch ALL history items via pagination (backend caps at 200 per request).
    // Values arrive already decrypted: api.history() flows through e2e_store which auto-decrypts.
    const page_size = 200;
    const all_items: {id?: number; value?: string}[] = [];
    let offset = 0;
    while (true) {
        const {items} = await api.history({limit: page_size, offset, type: 'all'});
        if (!items || items.length === 0) break;
        all_items.push(...items);
        if (items.length < page_size) break;
        offset += page_size;
    }
    if (all_items.length === 0) {
        // Nothing to re-encrypt — just commit
        return commit();
    }

    // Snapshot old key for rollback on any failure
    const old_key = snapshot_e2e_key();
    const salt = user.value.e2e_salt;

    // Derive new key from new password + same salt (replaces current key in memory)
    await init_e2e_key(new_password, salt);

    // Re-encrypt with new key and push to server
    const new_updates: {id: number; value: string}[] = [];
    for (const item of all_items) {
        if (item.id != null && item.value) {
            new_updates.push({id: item.id, value: await e2e_encrypt(item.value)});
        }
    }
    if (new_updates.length > 0) {
        try {
            await api.history_batch_update(new_updates);
        } catch (e) {
            // Batch update failed — server state unchanged, restore old key and abort
            await restore_e2e_snapshot(old_key);
            throw e;
        }
    }

    // Commit the password change. If it fails, roll back both the in-memory key and the
    // server history so the system is consistent with the unchanged server password.
    try {
        await commit();
    } catch (commit_err) {
        await restore_e2e_snapshot(old_key);
        try {
            const rollback_updates: {id: number; value: string}[] = [];
            for (const item of all_items) {
                if (item.id != null && item.value) {
                    rollback_updates.push({id: item.id, value: await e2e_encrypt(item.value)});
                }
            }
            if (rollback_updates.length > 0) {
                await api.history_batch_update(rollback_updates);
            }
        } catch (rollback_err) {
            // Server rollback failed — local state is restored (old key in memory) but
            // server still has new-key ciphertext. Surface via console for diagnosis; the
            // outer commit_err is rethrown so the UI still shows the original error.
            console.error('[error] Rollback of history re-encryption failed:', rollback_err);
        }
        throw commit_err;
    }
}

function oidc_login() {
    const base = (import.meta.env.VITE_BASE_PATH as string) || '/';
    window.location.href = base.replace(/\/$/, '') + '/api/auth/oidc/login';
}

const is_logged_in = computed(() => user.value !== null);
const is_admin = computed(() => user.value?.is_admin === true);
const is_oidc = computed(() => user.value?.auth_method === 'oidc');

/** Provide shared auth state: user, flags, login status, and refresh/logout/sync actions. */
export function useAuth() {
    return {user, flags, loading, refresh, login, logout, oidc_login, sync_after_login, re_encrypt_for_password_change, is_logged_in, is_admin, is_oidc};
}
