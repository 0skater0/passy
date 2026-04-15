// Built-in and custom preset definitions for each generator mode.
// Custom presets can be injected via VITE_PRESETS env variable as JSON.
// User-created presets are stored in localStorage under `passy_custom_presets`.
import {default_options} from './generate';
import type {generator_type} from './types';

const CUSTOM_PRESETS_KEY = 'passy_custom_presets';

/** Return the built-in preset map for a given generator mode. */
export function builtin_presets(mode: string): Record<string, unknown> {
    if (mode === 'password') {
        return {
            'Strong-Default': {
                length: 16,
                include_upper: true,
                include_lower: true,
                include_digits: true,
                include_symbols: true,
                include_extra_symbols: false,
                custom_include: '',
                exclude: ''
            },
            'Max-Security': {
                length: 64,
                include_upper: true,
                include_lower: true,
                include_digits: true,
                include_symbols: true,
                include_extra_symbols: true,
                custom_include: '',
                exclude: ''
            },
            'Recovery-Code': {
                length: 10,
                length_min: 10,
                length_max: 12,
                include_upper: true,
                include_lower: false,
                include_digits: true,
                include_symbols: false,
                include_extra_symbols: false,
                custom_include: '',
                exclude: 'O0I1'
            },
            'API-Key / Random-Tokens': {
                length: 32,
                include_upper: true,
                include_lower: true,
                include_digits: true,
                include_symbols: false,
                include_extra_symbols: false,
                custom_include: '',
                exclude: ''
            },
            'Short-Codes / Invite-Codes': {
                length: 8,
                length_min: 8,
                length_max: 10,
                include_upper: true,
                include_lower: false,
                include_digits: true,
                include_symbols: false,
                include_extra_symbols: false,
                custom_include: '',
                exclude: 'O0I1'
            }
        };
    }
    if (mode === 'pin') {
        return {'PIN 6': {length: 6}, 'PIN 8': {length: 8}};
    }
    if (mode === 'passphrase') {
        return {
            'Passphrase 4 words': {word_count: 4, separator: '-', case_style: 'lower'},
            'Passphrase 6 words': {word_count: 6, separator: '-', case_style: 'lower'},
            'Diceware': {word_count: 6, separator: ' ', case_style: 'lower', custom_word_list: ''},
            'XKCD Style': {word_count: 4, separator: ' ', case_style: 'title'}
        };
    }
    if (mode === 'pronounceable') {
        return {'Pronounceable 12': {length: 12}};
    }
    if (mode === 'uuid') {
        return {
            'UUID v4': {version: 4},
            'ULID': {format: 'ulid'},
            'NanoID': {format: 'nanoid', nanoid_length: 21}
        };
    }
    if (mode === 'totp') {
        return {
            'TOTP 16': {length: 16},
            'TOTP 20': {length: 20},
            'TOTP 32 (default)': {length: 32},
            'TOTP 40': {length: 40}
        };
    }
    if (mode === 'special') {
        return {
            'JWT Secret (256-bit)': {special_type: 'jwt', bits: 256},
            'JWT Secret (512-bit)': {special_type: 'jwt', bits: 512},
            'HMAC Key (256-bit)': {special_type: 'hmac', bits: 256},
            'AES-128': {special_type: 'aes', bits: 128},
            'AES-256': {special_type: 'aes', bits: 256},
            'Fernet Key': {special_type: 'fernet'},
            'API Token (Hex 32B)': {special_type: 'api_token', format: 'hex', byte_length: 32},
            'API Token (Base64 32B)': {special_type: 'api_token', format: 'base64', byte_length: 32},
            'RSA 2048': {special_type: 'rsa', bits: 2048},
            'RSA 4096': {special_type: 'rsa', bits: 4096},
            'ECDSA P-256': {special_type: 'ecdsa', curve: 'P-256'},
            'ECDSA P-384': {special_type: 'ecdsa', curve: 'P-384'},
            'Ed25519': {special_type: 'ed25519'},
            'SHA-256 Hash': {special_type: 'sha_hash', sha_algorithm: 'SHA-256'},
            'SHA-512 Hash': {special_type: 'sha_hash', sha_algorithm: 'SHA-512'}
        };
    }
    return {};
}

/** Load all custom presets for a given mode from localStorage. */
export function load_custom_presets(mode: string): Record<string, unknown> {
    try {
        const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
        if (!raw) return {};
        const all = JSON.parse(raw);
        return (all && typeof all === 'object' && all[mode]) ? all[mode] : {};
    } catch {
        return {};
    }
}

/** Save a custom preset for the given mode to localStorage. */
export function save_custom_preset(mode: string, name: string, options: Record<string, unknown>): void {
    try {
        const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
        const all = raw ? JSON.parse(raw) : {};
        if (!all[mode]) all[mode] = {};
        // Strip transient keys that shouldn't be persisted
        const clean = Object.fromEntries(
            Object.entries(options).filter(([k]) => k !== 'charset_summary' && k !== 'entropyBitsFallback')
        );
        all[mode][name] = clean;
        localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(all));
    } catch {
    }
}

/** Delete a custom preset for the given mode from localStorage. */
export function delete_custom_preset(mode: string, name: string): void {
    try {
        const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
        if (!raw) return;
        const all = JSON.parse(raw);
        if (all?.[mode]) {
            delete all[mode][name];
            localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(all));
        }
    } catch {
    }
}

/** Check whether a preset name is a custom (user-created) preset for the given mode. */
export function is_custom_preset(mode: string, name: string): boolean {
    const custom = load_custom_presets(mode);
    return name in custom;
}

/** Return all preset names for a mode: built-in first, then custom. */
export function all_preset_names(mode: string): { builtin: string[]; custom: string[] } {
    return {
        builtin: Object.keys(builtin_presets(mode)),
        custom: Object.keys(load_custom_presets(mode))
    };
}

/** Apply a preset by merging it onto clean defaults (not the current options). */
export function apply_preset(mode: generator_type, name: string): Record<string, unknown> | null {
    const ext = (import.meta.env.VITE_PRESETS as string) || '';
    let overrides: Record<string, Record<string, Record<string, unknown>>> = {};
    try {
        if (ext) overrides = JSON.parse(ext);
    } catch {
    }
    const builtins = builtin_presets(mode);
    const custom = load_custom_presets(mode);
    const preset = overrides?.[mode]?.[name] || custom[name] || builtins[name];
    if (!preset) return null;
    return {...default_options(mode), ...preset};
}
