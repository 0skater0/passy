// AES-256-GCM encryption for local history values.
// Key sources: User-PIN (PBKDF2) > Build-Time Key (SHA-256 hash) > none (plaintext).

import {HISTORY_KEY} from './storage';

const SALT_KEY = 'passy_encryption_salt';
const PIN_MARKER_KEY = 'passy_pin_set';
const PIN_VERIFY_KEY = 'passy_pin_verify';
const PBKDF2_ITERATIONS = 600_000;
const BUILD_TIME_KEY = (import.meta.env.VITE_ENCRYPTION_KEY as string) || '';

import {from_base64, to_base64} from './base64';

let _cached_key: CryptoKey | null = null;
let _cached_pin: string | null = null;

function get_or_create_salt(): Uint8Array {
    const existing = localStorage.getItem(SALT_KEY);
    if (existing) return from_base64(existing);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    localStorage.setItem(SALT_KEY, to_base64(salt.buffer));
    return salt;
}

async function derive_key_from_pin(pin: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        {name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256'},
        base,
        {name: 'AES-GCM', length: 256},
        false,
        ['encrypt', 'decrypt']
    );
}

async function derive_key_from_string(secret: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', enc.encode(secret));
    return crypto.subtle.importKey('raw', hash, {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
}

/** Encrypt plaintext → "iv_base64.ciphertext_base64" */
export async function encrypt_value(plaintext: string, key: CryptoKey): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv: iv as BufferSource}, key, enc.encode(plaintext));
    return `${to_base64(iv.buffer)}.${to_base64(ct)}`;
}

/** Decrypt "iv_base64.ciphertext_base64" → plaintext */
export async function decrypt_value(encrypted: string, key: CryptoKey): Promise<string> {
    const dot = encrypted.indexOf('.');
    if (dot === -1) throw new Error('Invalid encrypted format');
    const iv = from_base64(encrypted.slice(0, dot));
    const ct = from_base64(encrypted.slice(dot + 1));
    const pt = await crypto.subtle.decrypt({name: 'AES-GCM', iv: iv as BufferSource}, key, ct as BufferSource);
    return new TextDecoder().decode(pt);
}

/** Check if a value looks like an encrypted string (iv.ciphertext, both base64). */
export function is_encrypted_value(value: string): boolean {
    const dot = value.indexOf('.');
    if (dot < 10 || dot > 30) return false;
    try {
        atob(value.slice(0, dot));
        atob(value.slice(dot + 1));
        return true;
    } catch {
        return false;
    }
}

/** Resolve the current encryption key. PIN > Build-Time > null. */
export async function get_encryption_key(): Promise<CryptoKey | null> {
    if (_cached_key) return _cached_key;

    if (_cached_pin && has_user_pin()) {
        const salt = get_or_create_salt();
        _cached_key = await derive_key_from_pin(_cached_pin, salt);
        return _cached_key;
    }

    if (BUILD_TIME_KEY) {
        _cached_key = await derive_key_from_string(BUILD_TIME_KEY);
        return _cached_key;
    }

    return null;
}

/** Check if a user PIN is configured. */
export function has_user_pin(): boolean {
    return localStorage.getItem(PIN_MARKER_KEY) === '1';
}

/** Get the current encryption mode. */
export function get_encryption_mode(): 'none' | 'build_key' | 'user_pin' {
    if (has_user_pin() && _cached_pin) return 'user_pin';
    if (BUILD_TIME_KEY) return 'build_key';
    return 'none';
}

/**
 * Set a user PIN for history encryption.
 * Re-encrypts all existing history values with the new key.
 */
export async function set_user_pin(pin: string): Promise<void> {
    const salt = get_or_create_salt();
    const new_key = await derive_key_from_pin(pin, salt);

    // Re-encrypt existing history
    await re_encrypt_history(new_key);

    // Store encrypted verification marker so unlock_with_pin can verify correctness
    const marker = await encrypt_value('passy_pin_ok', new_key);
    localStorage.setItem(PIN_VERIFY_KEY, marker);

    _cached_pin = pin;
    _cached_key = new_key;
    localStorage.setItem(PIN_MARKER_KEY, '1');
}

/**
 * Unlock with existing PIN (called at app start / after page reload).
 * Does NOT re-encrypt — just makes the key available for decrypt.
 */
export async function unlock_with_pin(pin: string): Promise<boolean> {
    const salt = get_or_create_salt();
    const key = await derive_key_from_pin(pin, salt);

    // Verify against stored marker (reliable even with empty history)
    const marker = localStorage.getItem(PIN_VERIFY_KEY);
    if (marker) {
        try {
            const decrypted = await decrypt_value(marker, key);
            if (decrypted !== 'passy_pin_ok') return false;
        } catch {
            return false;
        }
    } else {
        // No marker (legacy) — try to decrypt first encrypted history value
        const raw = localStorage.getItem(HISTORY_KEY);
        if (raw) {
            try {
                const items = JSON.parse(raw);
                const enc = items.find((it: {value?: string}) => it.value && is_encrypted_value(it.value));
                if (enc) await decrypt_value(enc.value, key);
            } catch {
                return false;
            }
        }
    }

    _cached_pin = pin;
    _cached_key = key;
    return true;
}

/** Remove the user PIN. Re-encrypts history with build-time key or decrypts to plaintext. */
export async function clear_user_pin(): Promise<void> {
    const fallback_key = BUILD_TIME_KEY ? await derive_key_from_string(BUILD_TIME_KEY) : null;

    if (fallback_key) {
        await re_encrypt_history(fallback_key);
    } else {
        await decrypt_all_history();
    }

    _cached_pin = null;
    _cached_key = fallback_key;
    localStorage.removeItem(PIN_MARKER_KEY);
    localStorage.removeItem(PIN_VERIFY_KEY);
}

// --- Internal helpers for re-encryption ---

async function re_encrypt_history(new_key: CryptoKey): Promise<void> {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return;
    try {
        const items = JSON.parse(raw);
        const old_key = _cached_key;
        for (const item of items) {
            if (!item.value) continue;
            let plaintext: string;
            if (is_encrypted_value(item.value) && old_key) {
                plaintext = await decrypt_value(item.value, old_key);
            } else {
                plaintext = item.value;
            }
            item.value = await encrypt_value(plaintext, new_key);
        }
        localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    } catch {
        // re-encryption failure is non-critical — old values remain
    }
}

async function decrypt_all_history(): Promise<void> {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return;
    try {
        const items = JSON.parse(raw);
        const old_key = _cached_key;
        if (!old_key) return;
        for (const item of items) {
            if (!item.value || !is_encrypted_value(item.value)) continue;
            try {
                item.value = await decrypt_value(item.value, old_key);
            } catch {
                // individual decrypt failure — leave as-is
            }
        }
        localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    } catch {
        // parse failure — leave storage untouched
    }
}
