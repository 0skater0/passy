// E2E encryption for account-mode history.
// Key derived from login password via PBKDF2, stored in IndexedDB as non-extractable CryptoKey.
// Separate from crypto.ts (which handles localStorage encryption via PIN/build-key).

import {encrypt_value, decrypt_value, is_encrypted_value} from './crypto';
export {is_encrypted_value};

const PBKDF2_ITERATIONS = 600_000;
const IDB_NAME = 'passy_e2e';
const IDB_STORE = 'keys';
const IDB_KEY = 'master';

import {from_base64, to_base64} from './base64';

let _e2e_key: CryptoKey | null = null;

// --- IndexedDB helpers ---

function idb_open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(IDB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idb_put(key: CryptoKey): Promise<void> {
    const db = await idb_open();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(key, IDB_KEY);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

async function idb_get(): Promise<CryptoKey | null> {
    const db = await idb_open();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = () => { db.close(); resolve(req.result as CryptoKey ?? null); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

async function idb_delete(): Promise<void> {
    const db = await idb_open();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(IDB_KEY);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

// --- Key derivation + lifecycle ---

/** Generate a random 16-byte salt, returned as base64. */
export function generate_e2e_salt(): string {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return to_base64(salt.buffer);
}

/** Derive an AES-256-GCM key from password + salt (base64). */
async function derive_key(password: string, salt_b64: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const salt = from_base64(salt_b64);
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        {name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256'},
        base,
        {name: 'AES-GCM', length: 256},
        false, // non-extractable — XSS cannot export raw key material
        ['encrypt', 'decrypt']
    );
}

/** Derive and activate the E2E key from the user's login password. */
export async function init_e2e_key(password: string, salt_b64: string): Promise<void> {
    _e2e_key = await derive_key(password, salt_b64);
    try {
        await idb_put(_e2e_key);
    } catch {
        // IndexedDB write failure is non-critical — key still works in memory
    }
}

/** Try to restore the E2E key from IndexedDB (survives page reload). */
export async function restore_e2e_key(): Promise<boolean> {
    try {
        const key = await idb_get();
        if (!key) return false;
        _e2e_key = key;
        return true;
    } catch {
        return false;
    }
}

/** Check if an E2E key is available. */
export function has_e2e_key(): boolean {
    return _e2e_key !== null;
}

/** Snapshot the current in-memory key so it can be restored on failure. */
export function snapshot_e2e_key(): CryptoKey | null {
    return _e2e_key;
}

/** Restore a previously snapshotted key into memory and IndexedDB. */
export async function restore_e2e_snapshot(key: CryptoKey | null): Promise<void> {
    _e2e_key = key;
    if (key) {
        try { await idb_put(key); } catch { /* non-critical */ }
    }
}

/** Clear the E2E key from memory and IndexedDB. */
export async function lock_e2e(): Promise<void> {
    _e2e_key = null;
    try {
        await idb_delete();
    } catch {
        // IndexedDB delete failure is non-critical
    }
}

/** Encrypt a history value for server storage. Returns "iv.ciphertext" or original if no key. */
export async function e2e_encrypt(value: string): Promise<string> {
    if (!_e2e_key) return value;
    return encrypt_value(value, _e2e_key);
}

/** Decrypt a history value from server. Returns plaintext or original if not encrypted / no key. */
export async function e2e_decrypt(value: string): Promise<string> {
    if (!_e2e_key || !is_encrypted_value(value)) return value;
    try {
        return await decrypt_value(value, _e2e_key);
    } catch {
        return value;
    }
}
