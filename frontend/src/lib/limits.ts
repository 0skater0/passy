// Centralized configurable limits for generators. Values are read from Vite env at build time
// and can be overridden per user via localStorage.

import {reactive} from 'vue';

export type Bounds = { min: number; max: number };

function normalize_bounds(min: number, max: number): Bounds {
    const nmin = Math.max(1, Math.floor(min));
    const nmax = Math.max(1, Math.floor(max));
    return nmax < nmin ? {min: nmin, max: nmin} : {min: nmin, max: nmax};
}

// Hard defaults (same as before):
export const limits = {
    password: normalize_bounds(8, 128),
    passphrase_words: normalize_bounds(3, 12),
    pin: normalize_bounds(4, 12),
    pronounceable: normalize_bounds(6, 32)
} as const;

type BoundsKey = 'password' | 'passphrase_words' | 'pin' | 'pronounceable';

function storage_key(key: BoundsKey): string {
    return `passy_limits_${key}`;
}

/**
 * Load persisted user overrides for bounds.
 * @param key Bounds group key
 * @returns Bounds or null when no override exists
 */
export function get_user_bounds(key: BoundsKey): Bounds | null {
    try {
        const raw = localStorage.getItem(storage_key(key));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Bounds;
        if (!Number.isFinite(parsed.min) || !Number.isFinite(parsed.max)) return null;
        if (parsed.min <= 0 || parsed.max < parsed.min) return null;
        return parsed;
    } catch {
        return null;
    }
}

/**
 * Persist user overrides for bounds.
 * @param key Bounds group key
 * @param value Bounds to store
 */
export function set_user_bounds(key: BoundsKey, value: Bounds): void {
    const normalized = normalize_bounds(value.min, value.max);
    try {
        localStorage.setItem(storage_key(key), JSON.stringify(normalized));
    } catch {
        // ignore storage errors
    }
    effective_bounds[key].min = normalized.min;
    effective_bounds[key].max = normalized.max;
}

/**
 * Get effective bounds for a group, merging defaults with optional user overrides.
 * @param key Bounds group key
 * @returns Effective bounds
 */
export function get_effective_bounds(key: BoundsKey): Bounds {
    return effective_bounds[key];
}

/**
 * Clamp a numeric value to the provided bounds.
 * @param value Input number
 * @param bounds Min/max bounds
 * @returns Clamped number
 */
export function clamp(value: number, bounds: Bounds): number {
    return Math.max(bounds.min, Math.min(bounds.max, value));
}

// Reactive effective bounds shared across components
export const effective_bounds = reactive({
    password: get_user_bounds('password') ?? {...limits.password},
    passphrase_words: get_user_bounds('passphrase_words') ?? {...limits.passphrase_words},
    pin: get_user_bounds('pin') ?? {...limits.pin},
    pronounceable: get_user_bounds('pronounceable') ?? {...limits.pronounceable}
});
