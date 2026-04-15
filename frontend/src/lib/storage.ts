// Persistence layer for generator settings and local history (localStorage).
// Settings are stored per mode. History uses an auto-incrementing sequence key.
import {default_options} from './generate';
import type {generator_type} from './types';
import {decrypt_value, encrypt_value, get_encryption_key, is_encrypted_value} from './crypto';

const MAX_HISTORY = parseInt((import.meta.env.VITE_MAX_HISTORY as string) || '50', 10) || 50;

/** Load persisted generator settings for the given mode, or return defaults. */
export function load_settings(mode: generator_type): Record<string, unknown> {
    try {
        const raw = localStorage.getItem(`passy_settings_${mode}`);
        if (raw) return JSON.parse(raw);
    } catch {
    }
    return default_options(mode);
}

// Transient runtime metadata that must not be persisted alongside settings.
const TRANSIENT_OPTION_KEYS = new Set(['charset_summary', 'entropyBitsFallback']);

/** Persist generator settings for the given mode to localStorage. Optionally syncs to server. */
export function save_settings(mode: generator_type, options: Record<string, unknown>) {
    try {
        const persistable = Object.fromEntries(
            Object.entries(options).filter(([k]) => !TRANSIENT_OPTION_KEYS.has(k))
        );
        localStorage.setItem(`passy_settings_${mode}`, JSON.stringify(persistable));
    } catch {
    }
}

/**
 * Push current local settings to the server (debounced, fire-and-forget).
 * Waits 2 seconds after the last call before sending to avoid excessive requests.
 */
let _push_timer: ReturnType<typeof setTimeout> | null = null;
export function push_settings_to_server(): void {
    if (_push_timer) clearTimeout(_push_timer);
    _push_timer = setTimeout(() => {
        _push_timer = null;
        import('@/lib/api').then(({api}) => {
            const settings = collect_all_settings();
            if (Object.keys(settings).length > 0) {
                api.settings_put(settings).catch(() => { /* ignore sync errors */ });
            }
        }).catch(() => { /* ignore import errors */ });
    }, 2000);
}


// Local history storage (for unauthenticated users)
interface LocalHistoryItem {
    id: number;
    type: generator_type;
    masked: string;
    value?: string;
    created_at: string;
}

export const HISTORY_KEY = 'passy_history_v1';
const HISTORY_SEQ_KEY = 'passy_history_seq_v1';

function read_all_history(): LocalHistoryItem[] {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        // Normalize legacy camelCase field from older versions
        return arr.map((item: Record<string, unknown>) => {
            if ('createdAt' in item && !('created_at' in item)) {
                item.created_at = item.createdAt;
                delete item.createdAt;
            }
            return item as unknown as LocalHistoryItem;
        });
    } catch {
    }
    return [];
}

function write_all_history(items: LocalHistoryItem[]) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    } catch {
    }
}

function next_history_id(): number {
    try {
        const raw = localStorage.getItem(HISTORY_SEQ_KEY);
        const n = raw ? Number(raw) : 0;
        const next = (Number.isFinite(n) ? n : 0) + 1;
        localStorage.setItem(HISTORY_SEQ_KEY, String(next));
        return next;
    } catch {
        // fallback to timestamp-based id (not perfect but stable enough locally)
        return Date.now();
    }
}

/** Prepend a new entry to the local history (newest first). Encrypts value if key available. */
export async function append_local_history(item: {type: generator_type; masked: string; value?: string}): Promise<LocalHistoryItem> {
    const all = read_all_history();
    let stored_value = item.value;
    if (stored_value) {
        const key = await get_encryption_key();
        if (key) {
            try {
                stored_value = await encrypt_value(stored_value, key);
            } catch {
                // encryption failure — store plaintext as fallback
            }
        }
    }
    const entry: LocalHistoryItem = {
        id: next_history_id(),
        type: item.type,
        masked: item.masked,
        value: stored_value,
        created_at: new Date().toISOString()
    };
    all.unshift(entry);
    // Rotate: keep only the newest MAX_HISTORY entries
    if (all.length > MAX_HISTORY) all.length = MAX_HISTORY;
    write_all_history(all);
    return entry;
}

/** Load a paginated slice of local history, optionally filtered by type. Decrypts values transparently. */
export async function load_local_history(params: {limit: number; offset: number; type: string}): Promise<{
    items: LocalHistoryItem[]
}> {
    const {limit, offset, type} = params;
    const all = read_all_history();
    const filtered = type === 'all' ? all : all.filter(it => it.type === type);
    const items = filtered.slice(offset, offset + limit);
    const key = await get_encryption_key();
    if (key) {
        for (const item of items) {
            if (item.value && is_encrypted_value(item.value)) {
                try {
                    item.value = await decrypt_value(item.value, key);
                } catch {
                    // decryption failure — leave encrypted (wrong key or corrupted)
                }
            }
        }
    }
    return {items};
}

/** Delete a single local history entry by id. */
export function delete_local_history(id: number): { ok: boolean } {
    const all = read_all_history();
    const next = all.filter(it => it.id !== id);
    write_all_history(next);
    return {ok: true};
}

/** Remove all local history entries and reset the sequence counter. */
export function clear_local_history(): { ok: boolean } {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(HISTORY_SEQ_KEY);
    return {ok: true};
}


// --- Settings-Sync helpers (PAS-38) ---

const SETTINGS_MODES = ['password', 'passphrase', 'pin', 'uuid', 'pronounceable', 'totp', 'special'];
const CUSTOM_PRESETS_KEY = 'passy_custom_presets';
const CUSTOM_HASHRATE_KEY = 'passy_custom_hashrate';
const THEME_KEY = 'passy_theme';
const BOUNDS_PREFIX = 'passy_limits_';

/** Collect all locally stored settings into a single object for server sync. */
export function collect_all_settings(): Record<string, unknown> {
    const settings: Record<string, unknown> = {};
    // Per-mode generator settings
    for (const mode of SETTINGS_MODES) {
        try {
            const raw = localStorage.getItem(`passy_settings_${mode}`);
            if (raw) settings[`mode_${mode}`] = JSON.parse(raw);
        } catch { /* skip corrupted entries */ }
    }
    // Custom presets
    try {
        const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
        if (raw) settings.custom_presets = JSON.parse(raw);
    } catch { /* skip */ }
    // Custom hashrate
    try {
        const raw = localStorage.getItem(CUSTOM_HASHRATE_KEY);
        if (raw) settings.custom_hashrate = JSON.parse(raw);
    } catch { /* skip */ }
    // Theme
    const theme = localStorage.getItem(THEME_KEY);
    if (theme) settings.theme = theme;
    // Custom bounds
    for (const mode of SETTINGS_MODES) {
        try {
            const raw = localStorage.getItem(`${BOUNDS_PREFIX}${mode}`);
            if (raw) settings[`bounds_${mode}`] = JSON.parse(raw);
        } catch { /* skip */ }
    }
    return settings;
}

/** Apply settings received from the server to localStorage. */
export function apply_remote_settings(settings: Record<string, unknown>): void {
    if (!settings || typeof settings !== 'object') return;
    const valid_modes = new Set(SETTINGS_MODES);
    for (const [key, value] of Object.entries(settings)) {
        try {
            if (key.startsWith('mode_')) {
                const mode = key.slice(5);
                if (!valid_modes.has(mode)) continue;
                localStorage.setItem(`passy_settings_${mode}`, JSON.stringify(value));
            } else if (key === 'custom_presets') {
                localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(value));
            } else if (key === 'custom_hashrate') {
                localStorage.setItem(CUSTOM_HASHRATE_KEY, JSON.stringify(value));
            } else if (key === 'theme') {
                localStorage.setItem(THEME_KEY, String(value));
            } else if (key.startsWith('bounds_')) {
                const mode = key.slice(7);
                localStorage.setItem(`${BOUNDS_PREFIX}${mode}`, JSON.stringify(value));
            }
        } catch { /* skip write failures */ }
    }
}

/** Return all local history items for migration to the server. */
export function collect_local_history(): LocalHistoryItem[] {
    return read_all_history();
}
